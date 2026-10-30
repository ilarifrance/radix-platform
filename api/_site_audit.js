'use strict';
/* /api/integrations/site-audit — «Analisi del sito»: the light crawl behind lib/site-audit.js. No AI and no paid API.
   POST {action:'crawl',url} → the crawl data (robots.txt, the first sitemap, llms.txt, the home page and up to 24 more
   pages of the same site, the internal links checked, Core Web Vitals when PAGESPEED_API_KEY is set). GET → {pagespeed,limits}.
   Needs a RADIX session. Scores and issues are computed in the browser (lib/site-audit.js) from this data.
   Safety (the server fetches addresses chosen by a user, so every request is guarded against SSRF):
   - https only, port 443, no user:password@, a domain name (no IP literal, no localhost/.local/.internal…);
   - every host is resolved here and EVERY address it resolves to must be public: private (RFC 1918), loopback, link-local,
     CGNAT, multicast, documentation, metadata (169.254.169.254, fd00:ec2::254) and IPv6 forms that embed one of them
     (mapped, NAT64, 6to4) are refused; the connection then goes to the address that was checked (pinned: no DNS
     rebinding between the check and the request);
   - redirects are followed by hand (max 5), each hop checked again; a hop to http:// or to another site stops there;
   - only the site's own registrable domain (example.it, www.example.it, shop.example.it; on shared hosts such as
     vercel.app or altervista.org the whole subdomain);
   - robots.txt is read first and its Disallow rules for the RADIX user agent (or *) are respected;
   - at most 2 MB per response (also after decompression), 8 s per request, 4 requests at a time, 25 pages, 40 link
     checks, and a total budget below the function limit.
   Mode «concorrenza» (POST {action:'crawl',url,mode:'concorrenza'}, lib/competitor-studio.js): the same crawl, guards, limits
   and robots.txt on a competitor's public site, plus the facts of lib/competitor-extract.js on every HTML page (offer,
   prices, contacts, booking, shop, social, dates, claims). No link checks there: fewer requests to a site that is not
   the client's. */
const dns=require('dns'),net=require('net'),https=require('https'),zlib=require('zlib');
const market=(()=>{try{return require('../lib/competitor-extract.js').extractMarket}catch(e){return null}})();
const MODES=new Set(['concorrenza']);

const LIMITS=Object.freeze({maxPages:25,maxBytes:2*1024*1024,smallBytes:256*1024,timeoutMs:8000,concurrency:4,budgetMs:40000,maxRedirects:5,linkChecks:40,sitemapUrls:2000,pagespeedMs:30000});
const UA='Mozilla/5.0 (compatible; RADIX-SiteAudit/1.0; +https://radixinnovationstudio.com)';
const AGENT_TOKENS=['radix-siteaudit','radix'];
const AI_BOTS=Object.freeze([['gptbot','GPTBot (addestramento OpenAI)'],['oai-searchbot','OAI-SearchBot (ricerca di ChatGPT)'],['chatgpt-user','ChatGPT-User (link aperti dagli utenti)'],
 ['perplexitybot','PerplexityBot'],['claudebot','ClaudeBot'],['google-extended','Google-Extended (addestramento Gemini)'],['ccbot','CCBot (Common Crawl)'],['applebot-extended','Applebot-Extended']]);
class AuditError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code||''}}

// ---- addresses: which IPs may be contacted ----
function v4Parts(ip){const p=String(ip).split('.');if(p.length!==4)return null;const n=p.map(x=>/^\d{1,3}$/.test(x)?Number(x):NaN);return n.every(x=>x>=0&&x<=255)?n:null}
function ipv4Blocked(ip){const p=Array.isArray(ip)?ip:v4Parts(ip);if(!p)return true;const [a,b,c]=p;
 return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||
  (a===192&&b===0&&(c===0||c===2))||(a===192&&b===88&&c===99)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113)}
// '::ffff:1.2.3.4' / '2001:db8::1' → 8 numbers, or null.
function v6Words(ip){let s=String(ip).toLowerCase().replace(/^\[|\]$/g,'').replace(/%.*$/,'');
 const dot=s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);if(dot){const p=v4Parts(dot[1]);if(!p)return null;s=s.slice(0,-dot[1].length)+((p[0]<<8)|p[1]).toString(16)+':'+((p[2]<<8)|p[3]).toString(16)}
 const halves=s.split('::');if(halves.length>2)return null;
 const part=x=>x?x.split(':'):[];const head=part(halves[0]),tail=halves.length===2?part(halves[1]):[];
 const fill=halves.length===2?8-head.length-tail.length:0;if(fill<0||(halves.length===1&&head.length!==8))return null;
 const all=head.concat(Array(fill).fill('0'),tail);if(all.length!==8||!all.every(w=>/^[0-9a-f]{1,4}$/.test(w)))return null;
 return all.map(w=>parseInt(w,16))}
const v4Of=(hi,lo)=>[hi>>8,hi&255,lo>>8,lo&255];
function ipv6Blocked(ip){const w=v6Words(ip);if(!w)return true;
 if(w.slice(0,5).every(x=>x===0)&&w[5]===0xffff)return ipv4Blocked(v4Of(w[6],w[7]));      // ::ffff:a.b.c.d
 if(w.slice(0,6).every(x=>x===0))return true;                                             // ::, ::1, ::a.b.c.d
 if(w[0]===0x64&&w[1]===0xff9b)return w.slice(2,6).every(x=>x===0)?ipv4Blocked(v4Of(w[6],w[7])):true; // NAT64
 if(w[0]===0x2002)return ipv4Blocked(v4Of(w[1],w[2]));                                    // 6to4
 if((w[0]&0xe000)!==0x2000)return true;          // only global unicast 2000::/3 (no fc00::/7, fe80::/10, ff00::/8, 100::/64…)
 if(w[0]===0x2001&&(w[1]===0x0db8||w[1]===0))return true;                                 // documentation, Teredo
 if(w[0]===0x3fff&&w[1]<=0x0fff)return true;                                              // documentation (3fff::/20)
 return false}
function isBlockedIp(ip){const v=net.isIP(String(ip||'').replace(/^\[|\]$/g,''));return v===4?ipv4Blocked(ip):v===6?ipv6Blocked(ip):true}

// ---- which URLs may be fetched ----
// Second-level public suffixes and shared hosts: there the registrable part is one label more (a.vercel.app ≠ b.vercel.app).
const SHARED=new Set(('co.uk org.uk ac.uk gov.uk me.uk ltd.uk plc.uk net.uk com.au net.au org.au co.nz co.jp ne.jp com.br com.ar com.mx co.za com.tr com.cn com.hk com.sg co.in co.il co.kr com.pl com.es com.pt '+
 'vercel.app netlify.app github.io gitlab.io pages.dev workers.dev web.app firebaseapp.com herokuapp.com onrender.com fly.dev azurewebsites.net cloudfront.net amazonaws.com '+
 'wixsite.com wordpress.com blogspot.com myshopify.com squarespace.com webflow.io altervista.org weebly.com jimdosite.com godaddysites.com business.site site123.me framer.website carrd.co').split(' '));
function registrable(host){const h=String(host||'').toLowerCase().replace(/\.$/,''),p=h.split('.');
 for(let i=Math.max(0,p.length-4);i<p.length-1;i++){const suffix=p.slice(i).join('.');if(SHARED.has(suffix))return p.slice(Math.max(0,i-1)).join('.')}
 return p.slice(-2).join('.')}
const HOST_RE=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const RESERVED=/(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion|home\.arpa|in-addr\.arpa|ip6\.arpa)$/;
// → a URL object for an allowed address, or throws AuditError. `site`: the registrable domain the crawl is bound to.
function checkUrl(raw,site){let u;
 try{u=new URL(String(raw||'').trim())}catch(e){throw new AuditError(400,'Indirizzo non valido.','invalid')}
 if(u.protocol!=='https:')throw new AuditError(400,'Solo indirizzi https://: l’analisi non apre pagine non protette.','not-https');
 if(u.username||u.password)throw new AuditError(400,'Indirizzo non valido: niente nome utente o password nell’indirizzo.','credentials');
 if(u.port&&u.port!=='443')throw new AuditError(400,'Solo la porta standard di https (443).','port');
 const host=u.hostname.toLowerCase().replace(/\.$/,'');
 if(net.isIP(host.replace(/^\[|\]$/g,'')))throw new AuditError(400,'Scrivi il nome del sito (es. www.esempio.it), non un indirizzo IP.','ip-literal');
 if(!HOST_RE.test(host)||RESERVED.test(host))throw new AuditError(400,'Il dominio non è un sito pubblico.','reserved');
 if(site&&registrable(host)!==site)throw new AuditError(400,'Indirizzo di un altro sito.','offsite');
 u.hash='';return u}
// The address the person typed: «esempio.it», «www.esempio.it/x» or a full URL; http:// is upgraded to https://.
function startUrl(raw){let s=String(raw||'').trim();if(!s)throw new AuditError(400,'Scrivi l’indirizzo del sito.','empty');
 if(/^http:\/\//i.test(s))s='https://'+s.slice(7);else if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(s))s='https://'+s;
 return checkUrl(s)}
const TRACKING=/^(?:utm_[a-z]+|fbclid|gclid|msclkid|mc_[a-z]+|_ga|ref)$/i;
function normalizeUrl(u){const x=new URL(u.href||u);x.hash='';x.hostname=x.hostname.toLowerCase();
 for(const k of [...x.searchParams.keys()])if(TRACKING.test(k))x.searchParams.delete(k);
 return x.href}
const NOT_PAGE=/\.(?:pdf|jpe?g|png|gif|webp|svg|avif|ico|bmp|tiff?|zip|rar|7z|gz|tgz|mp4|m4v|mp3|wav|ogg|mov|avi|webm|docx?|xlsx?|pptx?|odt|ods|csv|xml|json|txt|css|js|mjs|map|woff2?|ttf|otf|eot|exe|dmg|apk)$/i;

// ---- robots.txt ----
function parseRobots(text){const groups=[],sitemaps=[];let cur=null,lastUA=false;
 for(const raw of String(text||'').replace(/^﻿/,'').split(/\r?\n/)){const line=raw.replace(/#.*$/,'').trim();if(!line)continue;
  const m=/^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);if(!m)continue;const key=m[1].toLowerCase(),val=m[2].trim();
  if(key==='user-agent'){if(!cur||!lastUA){cur={agents:[],rules:[]};groups.push(cur)}cur.agents.push(val.toLowerCase());lastUA=true;continue}
  if(key==='sitemap'){if(val)sitemaps.push(val);continue}
  lastUA=false;if(!cur)continue;
  if(key==='allow'||key==='disallow')cur.rules.push({allow:key==='allow',path:val});
  else if(key==='crawl-delay'&&!isNaN(parseFloat(val)))cur.crawlDelay=parseFloat(val)}
 return {groups,sitemaps}}
// The rules that apply to an agent: the groups whose user-agent is the longest one contained in its token, else «*».
function rulesFor(robots,tokens){const list=(Array.isArray(tokens)?tokens:[tokens]).map(t=>String(t).toLowerCase());let best=0,rules=null;
 for(const g of (robots&&robots.groups)||[])for(const a of g.agents){if(a==='*'||!a)continue;
  if(list.some(t=>t===a||t.startsWith(a))){if(a.length>best){best=a.length;rules=[]}if(a.length===best)rules=rules.concat(g.rules)}}
 if(rules)return rules;
 const star=((robots&&robots.groups)||[]).filter(g=>g.agents.includes('*'));return star.length?star.flatMap(g=>g.rules):[]}
function ruleRe(p){const anchored=p.endsWith('$'),body=anchored?p.slice(0,-1):p;
 return new RegExp('^'+body.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+(anchored?'$':''))}
// Longest matching rule wins; on a tie Allow wins; an empty Disallow allows everything.
function robotsAllows(robots,pathAndQuery,tokens){const rules=rulesFor(robots,tokens||AGENT_TOKENS);let win=null;
 const path=String(pathAndQuery||'/');
 for(const r of rules){if(!r.path)continue;let re;try{re=ruleRe(r.path)}catch(e){continue}
  if(re.test(path)){const len=r.path.length;if(!win||len>win.len||(len===win.len&&r.allow&&!win.allow))win={len,allow:r.allow}}}
 return win?win.allow:true}

// ---- sitemap ----
const decode=s=>String(s==null?'':s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi,(m,e)=>{const k=e.toLowerCase();
 if(k[0]==='#'){const n=k[1]==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return n>0&&n<0x110000?String.fromCodePoint(n):''}
 return Object.prototype.hasOwnProperty.call(ENT,k)?ENT[k]:m});
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',agrave:'à',aacute:'á',egrave:'è',eacute:'é',igrave:'ì',iacute:'í',ograve:'ò',oacute:'ó',ugrave:'ù',uacute:'ú',
 Agrave:'À',Egrave:'È',Eacute:'É',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…',laquo:'«',raquo:'»',copy:'©',reg:'®',euro:'€',middot:'·',bull:'•',deg:'°',ccedil:'ç',ntilde:'ñ',ouml:'ö',uuml:'ü',auml:'ä',szlig:'ß'};
function parseSitemap(xml,max){const t=String(xml||''),locs=[];const re=/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/gi;let m;
 while((m=re.exec(t))&&locs.length<(max||LIMITS.sitemapUrls))locs.push(decode(m[1]));
 return {isIndex:/<sitemapindex[\s>]/i.test(t),urls:locs,total:(t.match(/<loc>/gi)||[]).length}}

// ---- one HTML page → its SEO facts ----
const ATTR=/([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrsOf(s){const out={};let m;ATTR.lastIndex=0;while((m=ATTR.exec(s||''))){const k=m[1].toLowerCase();if(!(k in out))out[k]=decode(m[2]!=null?m[2]:m[3]!=null?m[3]:m[4]!=null?m[4]:'')}return out}
function tags(html,name){const re=new RegExp('<'+name+'(?=[\\s/>])([^>]*)>','gi'),out=[];let m;while((m=re.exec(html)))out.push(attrsOf(m[1]));return out}
const textOf=s=>decode(String(s||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
function blocks(html,name){const re=new RegExp('<'+name+'(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/'+name+'\\s*>','gi'),out=[];let m;while((m=re.exec(html)))out.push(m[1]);return out}
const cut=(s,n)=>{const a=[...String(s||'')];return a.length>n?a.slice(0,n).join(''):String(s||'')};
const len=s=>[...String(s||'')].length;
// JSON-LD: every @type (also inside @graph and nested), plus the entity facts GEO and local SEO care about.
function readJsonLd(scripts){const types=new Set(),out={blocks:0,errors:0,types:[],org:null,faqQuestions:0,breadcrumb:false,sameAs:[],author:false};
 const walk=(x,depth)=>{if(!x||typeof x!=='object'||depth>8)return;if(Array.isArray(x)){x.forEach(y=>walk(y,depth+1));return}
  const t=[].concat(x['@type']||[]).map(String);t.forEach(v=>types.add(v));
  if(t.some(v=>/^(?:Organization|LocalBusiness|Corporation|Store|Restaurant|ProfessionalService|MedicalBusiness|LegalService|HomeAndConstructionBusiness|AutomotiveBusiness|FoodEstablishment|LodgingBusiness|HealthAndBeautyBusiness|SportsActivityLocation|Dentist|Physician|Bakery|CafeOrCoffeeShop|BarOrPub|Hotel|RealEstateAgent|TravelAgency|Plumber|Electrician|HairSalon|BeautySalon|DaySpa|AutoRepair|Attorney|AccountingService|FinancialService|InsuranceAgency|EducationalOrganization|NGO)$/.test(v))&&!out.org){
   const a=x.address&&typeof x.address==='object'?[].concat(x.address)[0]:null;
   out.org={type:t[0],name:cut(textOf(x.name),120),telephone:cut(textOf(x.telephone),40),email:cut(textOf(x.email),120),url:cut(String(x.url||''),300),
    address:a?{street:cut(textOf(a.streetAddress),160),city:cut(textOf(a.addressLocality),80),postalCode:cut(textOf(a.postalCode),12),region:cut(textOf(a.addressRegion),60),country:cut(textOf(typeof a.addressCountry==='object'?a.addressCountry&&a.addressCountry.name:a.addressCountry),40)}:typeof x.address==='string'?{street:cut(x.address,160),city:'',postalCode:'',region:'',country:''}:null,
    hasGeo:!!x.geo,hasHours:!!(x.openingHours||x.openingHoursSpecification),logo:!!x.logo}}
  if(t.includes('FAQPage')){const q=[].concat(x.mainEntity||[]);out.faqQuestions+=q.filter(e=>e&&typeof e==='object').length}
  if(t.includes('BreadcrumbList'))out.breadcrumb=true;
  if(x.author)out.author=true;
  if(x.sameAs)[].concat(x.sameAs).forEach(s=>{if(typeof s==='string'&&out.sameAs.length<12&&!out.sameAs.includes(s))out.sameAs.push(cut(s,200))});
  for(const [k,v] of Object.entries(x))if(k!=='@context'&&v&&typeof v==='object')walk(v,depth+1)};
 for(const s of scripts){out.blocks++;let d;try{d=JSON.parse(String(s).trim().replace(/^<!\[CDATA\[|\]\]>$/g,''))}catch(e){out.errors++;continue}walk(d,0)}
 out.types=[...types].slice(0,30);return out}
const PHONE_TEXT=/(?:(?:\+|00)39[\s.\-/]?)?(?:0\d{1,4}|3\d{2})[\s.\-/]?\d{2,4}[\s.\-/]?\d{2,5}(?:[\s.\-/]?\d{1,4})?/g;
// Phone digits without the Italian prefix: «+39 011 555 1234» = «011.5551234» = «0115551234».
function phoneKey(s){let d=String(s||'').replace(/[^\d+]/g,'');d=d.replace(/^(?:\+|00)39/,'').replace(/^\+/,'');return d.length>=6&&d.length<=13?d:''}
const ADDRESS=/\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada|contrada|località|loc\.|borgo|lungomare|lungarno)\s+[A-ZÀ-Üa-zà-ü'’. ]{2,40},?\s*\d{1,4}[a-z]?\b/i;
const QUESTION=/\?\s*$/;
// html: the page's markup; url: where it was fetched (after redirects). Pure: no network.
function extractPage(html,url){const base=new URL(url),site=registrable(base.hostname);let src=String(html||'').replace(/<!--[\s\S]*?-->/g,'');
 const ld=[];src=src.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(m,a,body)=>{const at=attrsOf(a);if(/ld\+json/i.test(at.type||''))ld.push(body);return '<script'+a+'></script>'});
 const head=(/<head[\s>][\s\S]*?<\/head\s*>/i.exec(src)||[src])[0];
 const metas=tags(src,'meta'),links=tags(src,'link'),meta=n=>{const m=metas.find(x=>(x.name||'').toLowerCase()===n);return m?String(m.content||'').trim():null};
 const prop=n=>{const m=metas.find(x=>(x.property||x.name||'').toLowerCase()===n);return m?String(m.content||'').trim():null};
 const baseTag=tags(head,'base').find(b=>b.href);let baseUrl=base;try{if(baseTag)baseUrl=new URL(baseTag.href,base)}catch(e){}
 const abs=h=>{try{const u=new URL(String(h).trim(),baseUrl);u.hash='';return u}catch(e){return null}};
 const title=textOf((blocks(head,'title')[0])||(blocks(src,'title')[0])||'')||null;
 const description=meta('description'),robots=[meta('robots'),meta('googlebot')].filter(x=>x!=null).join(', ').toLowerCase();
 const canonicalTag=links.find(l=>/(?:^|\s)canonical(?:\s|$)/i.test(l.rel||'')&&l.href),canonical=canonicalTag?(abs(canonicalTag.href)||{}).href||canonicalTag.href:null;
 const hreflang=links.filter(l=>/alternate/i.test(l.rel||'')&&l.hreflang).slice(0,30).map(l=>({lang:String(l.hreflang).trim(),href:(abs(l.href)||{}).href||''}));
 const htmlTag=tags(src,'html')[0]||{};
 const og={},tw={};metas.forEach(m=>{const k=(m.property||m.name||'').toLowerCase();if(k.startsWith('og:')&&!(k.slice(3) in og))og[k.slice(3)]=cut(m.content,300);if(k.startsWith('twitter:')&&!(k.slice(8) in tw))tw[k.slice(8)]=cut(m.content,300)});
 const visible=src.replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi,' ');
 const body=(/<body[\s>][\s\S]*$/i.exec(visible)||[visible])[0];
 const h1=blocks(body,'h1').map(textOf).filter(Boolean),heads=['h2','h3'].flatMap(h=>blocks(body,h).map(textOf)).filter(Boolean);
 const text=textOf(body),words=text?text.split(' ').filter(w=>/[\p{L}\p{N}]/u.test(w)).length:0;
 const imgs=tags(body,'img'),noAlt=imgs.filter(i=>!('alt' in i)),emptyAlt=imgs.filter(i=>'alt' in i&&!String(i.alt).trim());
 const anchors=tags(body,'a'),internal=new Map(),external=new Set(),tel=new Set(),mail=new Set();let nofollow=0;
 for(const a of anchors){const h=String(a.href||'').trim();if(!h||h.startsWith('#'))continue;
  if(/^tel:/i.test(h)){const k=phoneKey(decodeURIComponentSafe(h.slice(4)));if(k)tel.add(k);continue}
  if(/^mailto:/i.test(h)){const e=decodeURIComponentSafe(h.slice(7).split('?')[0]).toLowerCase().trim();if(e)mail.add(e);continue}
  if(/^(?:javascript|data|sms|whatsapp|callto|skype|fax):/i.test(h))continue;
  const u=abs(h);if(!u||!/^https?:$/.test(u.protocol))continue;if(/\bnofollow\b/i.test(a.rel||''))nofollow++;
  if(registrable(u.hostname)===site){const k=normalizeUrl(u);if(!internal.has(k))internal.set(k,cut(textOf(a.title||''),80))}else external.add(u.hostname.toLowerCase())}
 // mixed content: http:// resources on an https page (scripts, styles, frames block or break; images only warn)
 const active=[],passive=[];if(base.protocol==='https:'){const http=v=>/^http:\/\//i.test(String(v||'').trim());
  tags(src,'script').forEach(s=>{if(http(s.src))active.push(s.src)});links.forEach(l=>{if(/stylesheet|preload|icon/i.test(l.rel||'')&&http(l.href))(/stylesheet/i.test(l.rel)?active:passive).push(l.href)});
  ['iframe','embed','object'].forEach(t=>tags(src,t).forEach(x=>{if(http(x.src||x.data))active.push(x.src||x.data)}));
  tags(src,'form').forEach(f=>{if(http(f.action))active.push(f.action)});
  [...imgs,...tags(src,'source'),...tags(src,'video'),...tags(src,'audio')].forEach(x=>{if(http(x.src))passive.push(x.src);else if(/(^|,\s*)http:\/\//i.test(x.srcset||''))passive.push(String(x.srcset).split(/\s/)[0])})}
 const phones=new Set(tel);text.replace(PHONE_TEXT,(p,at)=>{const before=text.slice(Math.max(0,at-14),at);
  if(!/(?:iva|c\.?\s?f\.?|fiscale|rea|cap|n\.|nr\.?|numero)\s*[:.]?\s*$/i.test(before)){const k=phoneKey(p);if(k&&k.length>=8&&k.length<=11&&/^(?:0|3)/.test(k))phones.add(k)}return p});
 (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[]).forEach(e=>mail.add(e.toLowerCase()));
 const jsonld=readJsonLd(ld);if(jsonld.org&&jsonld.org.telephone){const k=phoneKey(jsonld.org.telephone);if(k)phones.add(k)}
 const scripts=tags(src,'script').length,styles=links.filter(l=>/stylesheet/i.test(l.rel||'')).length;
 const path=base.pathname.toLowerCase(),words_=norm(title+' '+h1.join(' '));
 const kind=/^\/?$/.test(path)?'home':/chi-?siamo|about|azienda|storia|team|studio\b|la-nostra|who-we-are/.test(path)||/\bchi siamo\b|\babout\b/.test(words_)?'about':
  /contatt|contact|dove-siamo|dove-trovarci|richiedi/.test(path)||/\bcontatti\b|\bcontact\b|\bdove siamo\b/.test(words_)?'contact':/faq|domande/.test(path)||/\bfaq\b|domande frequenti/.test(words_)?'faq':
  /privacy|cookie|note-legali|termini|condizioni/.test(path)?'legal':/blog|news|articol|notizie|\/20\d\d\//.test(path)?'post':'page';
 return {title,titleLength:title?len(title):0,description:description==null?null:cut(description,500),descriptionLength:description?len(description):0,
  h1:h1.slice(0,5).map(h=>cut(h,200)),h1Count:h1.length,headings:heads.slice(0,40).map(h=>cut(h,160)),questions:heads.filter(h=>QUESTION.test(h)).length,
  canonical:canonical?cut(canonical,500):null,robots:robots||'',noindex:/\bnoindex\b|\bnone\b/.test(robots),nosnippet:/\bnosnippet\b|max-snippet\s*:\s*0\b/.test(robots),nofollowMeta:/\bnofollow\b|\bnone\b/.test(robots),
  hreflang,lang:htmlTag.lang?cut(htmlTag.lang,20):null,viewport:meta('viewport')!=null,author:meta('author')?cut(meta('author'),120):null,
  og:{title:og.title||null,description:og.description||null,image:og.image||null,type:og.type||null,url:og.url||null},
  twitter:{card:tw.card||null,title:tw.title||null,image:tw.image||null},
  jsonld,images:{total:imgs.length,withoutAlt:noAlt.length,emptyAlt:emptyAlt.length,samples:noAlt.slice(0,5).map(i=>cut((abs(i.src||'')||{}).href||i.src||'',300))},
  words,links:{internal:[...internal.keys()],internalCount:internal.size,externalCount:external.size,externalHosts:[...external].slice(0,20),nofollow},
  mixed:{active:active.length,passive:passive.length,samples:active.concat(passive).slice(0,5).map(s=>cut(s,300))},
  scripts,stylesheets:styles,telLinks:tel.size,phones:[...phones].slice(0,8),emails:[...mail].slice(0,8),hasAddress:ADDRESS.test(text),
  faqText:/\bdomande frequenti\b|\bfaq\b/i.test(text),kind,
  jsOnly:words<40&&(scripts>=3||/<div[^>]+id=["']?(?:root|app|__next|__nuxt)["']?[^>]*>\s*<\/div>/i.test(src)),
  textSample:cut(text,3000)}}
function decodeURIComponentSafe(s){try{return decodeURIComponent(s)}catch(e){return s}}
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9?]+/g,' ').trim();

// ---- the network: DNS checked, connection pinned to the checked address, bytes and time capped ----
async function systemLookup(host){return dns.promises.lookup(host,{all:true,verbatim:true})}
// Reads a (possibly compressed) response body, stopping at maxBytes of decoded data: a «zip bomb» stops at the limit too.
function collect(res,{encoding,maxBytes}){return new Promise((resolve,reject)=>{const enc=String(encoding||'').toLowerCase().trim();let transfer=0,size=0,done=false;const chunks=[];
 res.on('data',c=>{transfer+=c.length});
 let stream=res;
 if(enc==='gzip'||enc==='x-gzip')stream=res.pipe(zlib.createGunzip());else if(enc==='br')stream=res.pipe(zlib.createBrotliDecompress());else if(enc==='deflate')stream=res.pipe(zlib.createInflate());
 const finish=(err,truncated)=>{if(done)return;done=true;if(err)return reject(err);resolve({body:Buffer.concat(chunks),truncated,transferBytes:transfer})};
 stream.on('data',c=>{if(done)return;size+=c.length;if(size>maxBytes){chunks.push(c.subarray(0,c.length-(size-maxBytes)));finish(null,true);if(stream!==res)stream.destroy();if(typeof res.destroy==='function')res.destroy()}else chunks.push(c)});
 stream.on('end',()=>finish(null,false));stream.on('error',e=>finish(e));if(stream!==res)res.on('error',e=>finish(e))})}
// One request, no redirect following, to the address that was checked. Resolves {status,headers,body:Buffer,truncated,transferBytes}.
function pinnedRequest(url,{address,family,method='GET',timeoutMs,maxBytes,headers}){return new Promise((resolve,reject)=>{const u=new URL(url);let done=false,timer=null;
 const finish=(err,v)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(v)};
 const req=https.request({protocol:'https:',hostname:u.hostname,port:443,path:u.pathname+u.search,method,servername:u.hostname,agent:false,
  headers:{'User-Agent':UA,'Accept':method==='HEAD'?'*/*':'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5','Accept-Encoding':'gzip, deflate, br','Accept-Language':'it-IT,it;q=0.9,en;q=0.6',...(headers||{})},
  lookup:(h,o,cb)=>{if(o&&o.all)cb(null,[{address,family}]);else cb(null,address,family)}},res=>{
  const status=res.statusCode,hdr=res.headers;
  if(method==='HEAD'||status===204||status===304||(status>=300&&status<400)){res.resume();return finish(null,{status,headers:hdr,body:Buffer.alloc(0),truncated:false,transferBytes:0})}
  collect(res,{encoding:hdr['content-encoding'],maxBytes}).then(b=>{finish(null,{status,headers:hdr,...b});if(b.truncated)req.destroy()},e=>finish(e))});
 timer=setTimeout(()=>{finish(new AuditError(504,'Tempo scaduto','timeout'));req.destroy()},Math.max(1,timeoutMs));
 req.on('error',e=>finish(e));req.end()})}

// A small semaphore: at most `n` requests at the same time.
function limiter(n){let active=0;const queue=[];const next=()=>{if(active>=n||!queue.length)return;active++;const {fn,res,rej}=queue.shift();fn().then(res,rej).finally(()=>{active--;next()})};
 const run=fn=>new Promise((res,rej)=>{queue.push({fn,res,rej});next()});run.active=()=>active;return run}

// The guarded fetcher of one crawl: validates every hop, pins DNS, follows redirects by hand, counts and limits.
function guardedFetcher(deps,state){const lookup=deps.lookup||systemLookup,request=deps.request||pinnedRequest,now=deps.now||Date.now,L=state.limits;
 const dnsCache=new Map();const run=limiter(L.concurrency);
 async function resolve(host){if(dnsCache.has(host))return dnsCache.get(host);
  const p=(async()=>{let list;try{list=await lookup(host)}catch(e){throw new AuditError(502,'Dominio non trovato: '+host+'.','dns')}
   list=(Array.isArray(list)?list:[list]).filter(Boolean).map(a=>typeof a==='string'?{address:a,family:net.isIP(a)}:a);
   if(!list.length)throw new AuditError(502,'Dominio non trovato: '+host+'.','dns');
   if(list.some(a=>isBlockedIp(a.address)))throw new AuditError(403,'Il dominio '+host+' punta a un indirizzo privato o riservato: analisi non consentita.','private-ip');
   const pick=list.find(a=>a.family===4||net.isIP(a.address)===4)||list[0];return {address:pick.address,family:net.isIP(pick.address)}})();
  dnsCache.set(host,p);p.catch(()=>{});return p}
 // → {url,status,chain,headers,body,truncated,transferBytes,ms,error?}
 return async function fetchSafe(raw,{method='GET',maxBytes=L.maxBytes,robots=true}={}){const chain=[];let url=raw;
  for(let hop=0;hop<=L.maxRedirects;hop++){let u;
   try{u=checkUrl(url,state.site)}catch(e){return {url,status:0,chain,error:e.code==='offsite'?'redirect-offsite':e.code==='not-https'?'redirect-http':e.code||'blocked',message:e.message}}
   if(robots&&state.robots&&!robotsAllows(state.robots,u.pathname+u.search))return {url:u.href,status:0,chain,error:'robots',message:'Bloccata da robots.txt'};
   const left=state.deadline-now();if(left<500){state.budgetHit=true;return {url:u.href,status:0,chain,error:'budget',message:'Tempo dell’analisi esaurito'}}
   let addr;try{addr=await resolve(u.hostname)}catch(e){return {url:u.href,status:0,chain,error:e.code||'dns',message:e.message}}
   const t0=now();let r;state.requests++;
   try{r=await run(()=>request(u.href,{address:addr.address,family:addr.family,method,timeoutMs:Math.min(L.timeoutMs,Math.max(500,state.deadline-now())),maxBytes}))}
   catch(e){return {url:u.href,status:0,chain,error:e&&e.code==='timeout'?'timeout':'network',message:e&&e.code==='timeout'?'Nessuna risposta in '+Math.round(L.timeoutMs/1000)+' secondi':'Connessione non riuscita'}}
   const ms=now()-t0,status=r.status,loc=r.headers&&(r.headers.location||r.headers.Location);
   if(status>=300&&status<400&&loc){chain.push({url:u.href,status});let next;try{next=new URL(String(loc),u).href}catch(e){return {url:u.href,status,chain,error:'redirect-bad',message:'Redirect non valido'}}url=next;continue}
   return {url:u.href,status,chain,headers:r.headers||{},body:r.body||Buffer.alloc(0),truncated:!!r.truncated,transferBytes:r.transferBytes||0,ms}}
  return {url,status:0,chain,error:'redirect-loop',message:'Troppi redirect'}}}

const bodyText=r=>{const b=r&&r.body;if(!b)return '';const ct=String(r.headers&&r.headers['content-type']||'');const cs=(/charset=([\w-]+)/i.exec(ct)||[])[1]||'utf-8';
 try{return new TextDecoder(/^(?:iso-8859-1|latin1|windows-1252)$/i.test(cs)?'windows-1252':'utf-8').decode(b)}catch(e){return b.toString('utf8')}};
const isHtml=r=>/text\/html|application\/xhtml/i.test(String(r.headers&&r.headers['content-type']||''))||(!r.headers['content-type']&&/^\s*<(?:!doctype|html)/i.test(bodyText(r).slice(0,200)));

// ---- Core Web Vitals: Google PageSpeed Insights, only with PAGESPEED_API_KEY ----
async function pagespeed(url,{env,fetchFn,timeoutMs}){const key=String(env.PAGESPEED_API_KEY||'').trim();
 if(!key)return {measured:false,reason:'Core Web Vitals non misurati: sul server manca la chiave di PageSpeed Insights. Misurali a mano su pagespeed.web.dev.'};
 const hide=s=>String(s==null?'':s).split(key).join('[chiave]').slice(0,200);
 const ctl=typeof AbortController==='function'?new AbortController():null,timer=setTimeout(()=>ctl&&ctl.abort(),timeoutMs);
 try{const r=await fetchFn('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url='+encodeURIComponent(url)+'&strategy=mobile&category=performance&key='+encodeURIComponent(key),{signal:ctl&&ctl.signal});
  const d=await r.json().catch(()=>null);if(!r.ok||!d)return {measured:false,reason:'PageSpeed Insights non ha risposto ('+r.status+(d&&d.error&&d.error.message?': '+hide(d.error.message):'')+').'};
  const pick=le=>{const m=le&&le.metrics;if(!m)return null;const v=k=>m[k]&&typeof m[k].percentile==='number'?m[k].percentile:null;
   const out={lcpMs:v('LARGEST_CONTENTFUL_PAINT_MS'),inpMs:v('INTERACTION_TO_NEXT_PAINT'),cls:v('CUMULATIVE_LAYOUT_SHIFT_SCORE')==null?null:v('CUMULATIVE_LAYOUT_SHIFT_SCORE')/100};
   return out.lcpMs==null&&out.inpMs==null&&out.cls==null?null:out};
  const page=pick(d.loadingExperience),origin=pick(d.originLoadingExperience);
  const lh=d.lighthouseResult||{},au=lh.audits||{},num=k=>au[k]&&typeof au[k].numericValue==='number'?au[k].numericValue:null;
  const score=lh.categories&&lh.categories.performance&&typeof lh.categories.performance.score==='number'?Math.round(lh.categories.performance.score*100):null;
  return {measured:true,strategy:'mobile',field:page||origin,fieldSource:page?'pagina':origin?'sito':null,lab:{score,lcpMs:num('largest-contentful-paint'),cls:num('cumulative-layout-shift'),tbtMs:num('total-blocking-time')}}}
 catch(e){return {measured:false,reason:ctl&&ctl.signal.aborted?'PageSpeed Insights non ha risposto in tempo: riprova più tardi o misura su pagespeed.web.dev.':'PageSpeed Insights non raggiungibile: '+hide(e&&e.message)}}
 finally{clearTimeout(timer)}}

// ---- the crawl ----
// deps: {lookup(host)→[{address,family}], request(url,opts)→response, now()→ms, env, fetch (PageSpeed only), limits}
// deps.mode 'concorrenza': the facts of lib/competitor-extract.js on every page, no link checks.
async function crawl(input,deps={}){const now=deps.now||Date.now,mode=MODES.has(deps.mode)?deps.mode:'',L={...LIMITS,...(deps.limits||{}),...(mode?{linkChecks:0}:{})},t0=now();
 const start=startUrl(input);
 const state={limits:L,site:registrable(start.hostname),robots:null,deadline:t0+L.budgetMs,budgetHit:false,requests:0};
 const get=guardedFetcher(deps,state),env=deps.env||{};
 const psi=pagespeed(start.href,{env,fetchFn:deps.fetch||globalThis.fetch,timeoutMs:Math.min(L.pagespeedMs,L.budgetMs)});
 const out={url:start.href,finalUrl:null,host:start.hostname,site:state.site,startedAt:new Date(t0).toISOString(),limits:{maxPages:L.maxPages,maxBytes:L.maxBytes,timeoutMs:L.timeoutMs,concurrency:L.concurrency,budgetMs:L.budgetMs,linkChecks:L.linkChecks},
  robots:null,sitemap:null,llms:null,pages:[],brokenLinks:[],skipped:{robots:[],budget:0,limit:0,notHtml:0},notes:[],...(mode?{mode}:{})};
 // robots.txt of an origin → state.robots (also the AI crawlers it blocks)
 async function readRobots(origin){const r=await get(origin+'/robots.txt',{maxBytes:L.smallBytes,robots:false});
  const found=r.status>=200&&r.status<300,parsed=found?parseRobots(bodyText(r)):{groups:[],sitemaps:[]};
  state.robots=found?parsed:null;
  return {url:origin+'/robots.txt',status:r.status,found,error:r.error||null,sitemaps:parsed.sitemaps.slice(0,10),groups:parsed.groups.length,
   blocksAll:found&&!robotsAllows(parsed,'/',['*'])&&parsed.groups.some(g=>g.agents.includes('*')),blocksGoogle:found&&!robotsAllows(parsed,'/',['googlebot']),blocksRadix:found&&!robotsAllows(parsed,'/',AGENT_TOKENS),
   aiBlocked:found?AI_BOTS.filter(([t])=>!robotsAllows(parsed,'/',[t])).map(([t,label])=>({agent:t,label})):[]}}
 out.robots=await readRobots(start.origin);
 // the home page (robots permitting)
 const home=await get(start.href);
 if(home.error==='robots'){out.notes.push('robots.txt chiede ai crawler come RADIX di non leggere il sito: analizzati solo robots.txt e sitemap.')}
 else if(home.error){const msg=home.error==='redirect-offsite'?'Il sito reindirizza a un altro dominio ('+home.url+'): analizza direttamente quell’indirizzo.':home.error==='redirect-http'?'La home reindirizza a una pagina non protetta (http://): l’analisi si ferma qui.':home.message;
  if(!home.status){const st=home.error==='private-ip'?403:home.error==='timeout'?504:home.error==='dns'?422:home.error==='redirect-offsite'||home.error==='redirect-http'?422:502;throw new AuditError(st,msg,home.error)}}
 let origin=start.origin;
 if(home.status){const fu=new URL(home.url);out.finalUrl=home.url;out.host=fu.hostname;
  if(fu.origin!==start.origin){origin=fu.origin;out.robots=await readRobots(origin)}}
 // sitemap: the first one listed in robots.txt (same site), else /sitemap.xml; an index opens its first child
 const smList=(out.robots.sitemaps||[]).filter(s=>{try{return registrable(new URL(s).hostname)===state.site&&/^https:/i.test(s)}catch(e){return false}});
 const smUrl=smList[0]||origin+'/sitemap.xml';let sm=await get(smUrl,{robots:false}),smData={isIndex:false,urls:[],total:0},child=null;
 if(sm.status>=200&&sm.status<300){smData=parseSitemap(bodyText(sm),L.sitemapUrls);
  if(smData.isIndex&&smData.urls[0]){child=smData.urls[0];const c=await get(child,{robots:false});if(c.status>=200&&c.status<300){const d=parseSitemap(bodyText(c),L.sitemapUrls);smData={...smData,childUrls:d.urls,childTotal:d.total}}}}
 const smPages=(smData.isIndex?smData.childUrls||[]:smData.urls).filter(x=>{try{const u=new URL(x);return registrable(u.hostname)===state.site}catch(e){return false}});
 out.sitemap={url:smUrl,status:sm.status,found:sm.status>=200&&sm.status<300&&(smData.total>0),listedInRobots:smList.length>0,isIndex:smData.isIndex,child,urls:smData.isIndex?smData.childTotal||0:smData.total,sample:smPages.slice(0,10),error:sm.error||null};
 // llms.txt: informative only (Google says AI features need no special file)
 const llm=await get(origin+'/llms.txt',{maxBytes:L.smallBytes,robots:false});
 out.llms={found:llm.status>=200&&llm.status<300&&/text\/(?:plain|markdown)/i.test(String(llm.headers&&llm.headers['content-type']||''))&&bodyText(llm).trim().length>0,status:llm.status};
 // BFS over the pages of the site
 const seen=new Set(),queue=[],pages=[],inbound=new Map(),visited=new Map();
 const enqueue=(href,depth,from)=>{let u;try{u=new URL(href)}catch(e){return}if(registrable(u.hostname)!==state.site||u.protocol!=='https:')return;const k=normalizeUrl(u);
  if(from){if(!inbound.has(k))inbound.set(k,new Set());const s=inbound.get(k);if(s.size<5)s.add(from)}
  if(seen.has(k))return;seen.add(k);queue.push({url:k,depth})};
 const record=(r,depth)=>{const base={hsts:!!(r.headers&&r.headers['strict-transport-security']),url:r.url,requested:r.requested,status:r.status,redirects:r.chain||[],ms:r.ms||0,bytes:r.body?r.body.length:0,transferBytes:r.transferBytes||0,truncated:!!r.truncated,depth,contentType:String(r.headers&&r.headers['content-type']||'').slice(0,80),error:r.error||null};
  seen.add(normalizeUrl(new URL(r.url)));
  const xrt=String(r.headers&&r.headers['x-robots-tag']||'').toLowerCase();
  if(r.status>=200&&r.status<300&&r.body&&isHtml(r)){const html=bodyText(r),x=extractPage(html,r.url);if(mode==='concorrenza'&&market){try{x.market=market(html,r.url)}catch(e){x.market=null}}if(xrt){x.robots=[x.robots,xrt].filter(Boolean).join(', ');x.noindex=x.noindex||/\bnoindex\b|\bnone\b/.test(xrt);x.nosnippet=x.nosnippet||/\bnosnippet\b|max-snippet\s*:\s*0\b/.test(xrt)}x.links.internal.forEach(h=>enqueue(h,depth+1,r.url));const {links,...rest}=x;return {...base,...rest,links:{internalCount:links.internalCount,externalCount:links.externalCount,externalHosts:links.externalHosts,nofollow:links.nofollow,internal:links.internal.slice(0,200)}}}
  if(r.status>=200&&r.status<300)out.skipped.notHtml++;
  return base};
 if(home.status){seen.add(normalizeUrl(new URL(home.url)));seen.add(normalizeUrl(start));pages.push(record({...home,requested:start.href},0))}
 smPages.slice(0,200).forEach(u=>enqueue(u,1,null));
 // the links of the home page were queued first; the sitemap's pages follow, then deeper links (by depth)
 queue.sort((a,b)=>a.depth-b.depth);
 while(queue.length&&pages.length<L.maxPages&&!state.budgetHit){const batch=[];
  while(queue.length&&batch.length<L.concurrency&&pages.length+batch.length<L.maxPages){const q=queue.shift();if(NOT_PAGE.test(new URL(q.url).pathname)){continue}batch.push(q)}
  if(!batch.length)break;
  const res=await Promise.all(batch.map(q=>get(q.url).then(r=>({q,r}))));
  for(const {q,r} of res){if(r.error==='robots'){out.skipped.robots.push(q.url);continue}if(r.error==='budget'){out.skipped.budget++;continue}
   if(r.error==='redirect-offsite'||r.error==='redirect-http'){pages.push({url:q.url,status:0,redirects:r.chain,error:r.error,depth:q.depth});continue}
   visited.set(q.url,{status:r.status,url:r.url,chain:r.chain||[]});
   const dup=r.status&&normalizeUrl(new URL(r.url))!==q.url&&pages.some(p=>p.url===r.url);
   if(dup)continue;pages.push(record({...r,requested:q.url},q.depth));queue.sort((a,b)=>a.depth-b.depth)}}
 out.skipped.limit=queue.filter(q=>!NOT_PAGE.test(q.url)).length;out.skipped.robots=out.skipped.robots.slice(0,30);
 // internal links: crawled pages with an error status, then a HEAD (GET when HEAD is refused) of the links not crawled
 const crawled=new Map();pages.forEach(p=>{crawled.set(normalizeUrl(new URL(p.requested||p.url)),p);crawled.set(normalizeUrl(new URL(p.url)),p)});
 for(const [k,v] of visited)if(!crawled.has(k))crawled.set(k,v);
 const broken=[],redirected=[];
 for(const [k,from] of inbound){const p=crawled.get(k);if(p&&p.status>=400)broken.push({url:k,status:p.status,from:[...from]});
  if(p&&p.chain&&p.chain.length&&from.size)redirected.push({url:k,to:p.url,hops:p.chain.length,from:[...from]})}
 const toCheck=[...inbound.keys()].filter(k=>!crawled.has(k)&&inbound.get(k).size>0).slice(0,L.linkChecks);let checked=0;
 await Promise.all(toCheck.map(async k=>{if(state.budgetHit)return;let r=await get(k,{method:'HEAD',robots:true});
  if(r.error==='robots'||r.error==='budget')return;
  if([403,405,501].includes(r.status)||(r.error&&r.error!=='redirect-offsite'))r=await get(k,{maxBytes:64*1024});
  checked++;if(r.chain&&r.chain.length&&r.status<400)redirected.push({url:k,to:r.url,hops:r.chain.length,from:[...inbound.get(k)]});
  if(r.status>=400||(!r.status&&r.error&&!['robots','budget','redirect-offsite'].includes(r.error)))broken.push({url:k,status:r.status||0,error:r.status?null:r.error,from:[...inbound.get(k)]})}));
 out.brokenLinks=broken.slice(0,60);out.redirectedLinks=redirected.slice(0,40);out.linkChecks={checked,total:[...inbound.keys()].filter(k=>!crawled.has(k)).length};
 out.pages=pages.map(p=>{const {requested,...rest}=p;return rest});
 out.pagespeed=await psi;
 out.durationMs=now()-t0;out.requests=state.requests;out.budgetHit=state.budgetHit;
 if(state.budgetHit)out.notes.push('Tempo dell’analisi esaurito: alcune pagine o alcuni link non sono stati controllati.');
 return out}

// ---- HTTP ----
const bodyOf=req=>typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};
const running=new Set();
async function handle(req,res,deps){
 res.setHeader('Cache-Control','no-store');
 const user=require('./_auth').getSessionUser(req);
 if(!user||!user.uid)return res.status(401).json({error:'Accesso RADIX richiesto'});
 const env=deps.env||process.env;
 if(req.method==='GET')return res.status(200).json({pagespeed:String(env.PAGESPEED_API_KEY||'').trim()!=='',limits:{maxPages:LIMITS.maxPages,maxBytes:LIMITS.maxBytes,timeoutMs:LIMITS.timeoutMs,concurrency:LIMITS.concurrency}});
 if(req.method!=='POST')return res.status(405).json({error:'Metodo non consentito'});
 const uid=String(user.uid);
 try{const input=bodyOf(req);if(String(input.action||'crawl')!=='crawl')throw new AuditError(400,'Azione non valida');
  if(running.has(uid))throw new AuditError(429,'C’è già un’analisi in corso: attendi che finisca.');
  running.add(uid);
  try{const data=await crawl(input.url,{...deps,env,mode:MODES.has(input.mode)?input.mode:''});return res.status(200).json(data)}finally{running.delete(uid)}}
 catch(e){
  if(e instanceof SyntaxError)return res.status(400).json({error:'JSON non valido'});
  if(e instanceof AuditError)return res.status(e.status).json({error:e.message,code:e.code});
  return res.status(503).json({error:'Analisi non disponibile in questo momento: riprova.'})}}

module.exports=(req,res)=>handle(req,res,{});
Object.assign(module.exports,{handle,crawl,LIMITS,UA,AGENT_TOKENS,AI_BOTS,AuditError,isBlockedIp,ipv4Blocked,ipv6Blocked,v6Words,registrable,checkUrl,startUrl,normalizeUrl,
 parseRobots,robotsAllows,parseSitemap,extractPage,readJsonLd,phoneKey,guardedFetcher,pinnedRequest,collect,pagespeed,decode});
