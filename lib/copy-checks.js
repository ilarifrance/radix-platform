/* Studio Testi quality checks (lib/copy-studio.js): the automatic checks of the agency-grade text services, pure and
   shared by the page and the node tests. Numbers that are not in the person's data, word counts (press release lead),
   superlatives without data, quotes attributed only to the people the person named, «dal cliente» / «ipotesi da
   verificare» labels (buyer persona, competitors), CRM merge tags ({{nome}}, as sales/lead-newsletter-core.js fills
   them), email sequences read back block by block and written as CSV, SMS length in GSM-7 or UCS-2 with segments,
   SMS sender names, opt-out text and the advertising disclosure of influencer briefs. No network, no AI. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCopyChecks=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const str=v=>String(v==null?'':v);
const norm=s=>str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9@#]+/g,' ').trim();

// ---- numbers as written: «1.200», «1,5», «45» (each counts as 1.200/1200 and 1,5/1.5/15) ----
const NUM=/\d+(?:[.,]\d+)*/g;
const forms=n=>{const a=n.replace(/,/g,'.'),b=n.replace(/[.,]/g,'');return [n,a,b,a.replace(/\.0+$/,'')]};
function numbersIn(text){const set=new Set();(str(text).match(NUM)||[]).forEach(n=>forms(n).forEach(f=>set.add(f)));return set}
// Numbers of `text` that are not in `input`. List numbering («1.», «Email 2») is not data.
function unverifiedNumbers(text,input){const known=numbersIn(input),bad=[];
 for(const line of str(text).split('\n')){const t=line.replace(/^\s*\d{1,2}[.)]\s+/,'').replace(/\b(?:email|persona|slide|sms|fase)\s+\d{1,2}\b/gi,'');
  for(const n of t.match(NUM)||[])if(!forms(n).some(f=>known.has(f))&&!bad.includes(n))bad.push(n)}
 return bad}

// ---- words ----
const words=text=>str(text).split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w)).length;
const sentences=text=>str(text).split(/\n+/).flatMap(l=>l.split(/(?<=[.!?…])\s+(?=[«"“A-ZÀ-Ú0-9])/)).map(s=>s.trim()).filter(Boolean);

// ---- superlatives: allowed only next to a number the person gave (a fact that proves them) ----
const SUPER=[/\b[\p{L}]{3,}issim[oaie]\b/iu,/\b(?:il|la|lo|i|gli|le|l')\s*(?:più|piu)\s+[\p{L}]+/iu,/(?:più|piu)\s+\p{L}+\s+(?:di|del|della|dello|dei|degli|delle|dell')(?![\p{L}])/iu,/\bmiglior[ei]?\b/iu,/\bleader\b/iu,/\bnumero\s+(?:uno|1)\b/iu,
 /\bunic[oaie]\b/iu,/\bprim[oaie]\s+(?:in|a|al|nel|nella|sul)\s+(?:italia|europa|mondo)\b/iu,/\beccellenz[ae]\b/iu,/\brivoluzionari[oae]\b/iu,/\bstraordinari[oae]\b/iu,
 /\bincredibil[ei]\b/iu,/\bineguagliabil[ei]\b/iu,/\bimbattibil[ei]\b/iu,/\bottim[oaie]\b/iu,/\bsenza\s+eguali\b/iu,/\bsenza\s+precedenti\b/iu];
// [{word, sentence}] for each sentence with a superlative and no number from the person's data.
function superlatives(text,input){const known=numbersIn(input),out=[];
 for(const s of sentences(text)){const hit=SUPER.map(r=>r.exec(s)).find(Boolean);if(!hit)continue;
  const proved=(s.match(NUM)||[]).some(n=>forms(n).some(f=>known.has(f)));if(!proved)out.push({word:hit[0].trim(),sentence:s.slice(0,160)})}
 return out}

// ---- quotes: only from the people the person named ----
// «Mario Rossi, titolare — cosa vuole dire» per line (or «;») → ['Mario Rossi'].
function quotable(field){return str(field).split(/[\n;]+/).map(x=>x.split(/[,(—–:]| - /)[0].replace(/^[-*•\s]+/,'').trim()).filter(x=>/\p{L}{2,}/u.test(x)&&x.length<=60)}
// The words of a raw text, aligned with the words of norm(text) (case kept, for the first-name check).
const rawWords=t=>str(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9@#]+/g,' ').trim().split(' ');
const QUOTE=/[«“"]([^«»“”"\n]{12,600})[»”"]/g;
// Quoted sentences (6+ words) whose attribution (just before or after) is not one of `names`.
// A person counts as named when the full name is there, or the surname alone (as journalists write the second time)
// without a different first name in front of it: «— Giulia Rossi» is not «Mario Rossi».
function quoteIssues(text,names){const t=str(text),out=[],people=(names||[]).map(n=>{const x=norm(n),parts=x.split(' ').filter(p=>p.length>=2);return {full:x,first:parts.length>1?parts[0]:'',last:parts[parts.length-1]||x}});
 const surname=(win,p)=>{const w=norm(win).split(' '),r=rawWords(win);return w.some((x,i)=>x===p.last&&(!p.first||i===0||w[i-1]===p.first||!/^[A-Z]/.test(r[i-1]||'')))};
 for(const m of t.matchAll(QUOTE)){if(words(m[1])<6)continue;
  const raw=t.slice(Math.max(0,m.index-90),m.index)+' '+t.slice(m.index+m[0].length,m.index+m[0].length+140),near=norm(raw);
  const ok=people.some(p=>p.full&&(near.includes(p.full)||surname(raw,p)));
  if(!ok)out.push({quote:m[1].slice(0,90),reason:people.length?'attribuita a chi non hai indicato':'nessuna persona da citare indicata'})}
 return out}

// ---- «dal cliente» / «ipotesi da verificare» ----
const FROM_CLIENT=/\bdal cliente\b/i,HYPOTHESIS=/\bipotesi\b/i;
// The trait lines of a block: bullets and «Etichetta: valore» lines (headings and `skip` labels are not traits).
function traitLines(text,skip){const skipRe=skip&&skip.length?new RegExp('^(?:'+skip.join('|')+')\\s*:','i'):null;
 return str(text).split('\n').map(l=>l.trim()).filter(l=>l&&!/^#/.test(l)).map(l=>l.replace(/^[-*•]\s+/,'')).filter(l=>/^[^:]{2,40}:\s*\S/.test(l)||/^[^|]+\|/.test(l)).filter(l=>!(skipRe&&skipRe.test(l)))}
// Lines with neither label.
const unlabelled=(text,skip)=>traitLines(text,skip).filter(l=>!FROM_CLIENT.test(l)&&!HYPOTHESIS.test(l));
// Lines labelled «dal cliente» that carry numbers the person never wrote.
function clientNumbers(text,input){const out=[];for(const l of traitLines(text))if(FROM_CLIENT.test(l)&&!HYPOTHESIS.test(l))unverifiedNumbers(l,input).forEach(n=>{if(!out.includes(n))out.push(n)});return out}

// ---- CRM merge tags (sales/lead-newsletter-core.js TAGS, without the AI-written {{gancio}}) ----
const MERGE_TAGS=Object.freeze(['nome','cognome','nome_completo','azienda','ruolo','qualifica','reparto','settore','città']);
const TAG_RE=/\{\{\s*([^{}|]{1,40}?)\s*(?:\|([^{}]{0,120}))?\}\}/g;
// {unknown:['{{first_name}}'], foreign:['[Nome]','*|FNAME|*']}: tags the CRM would send as they are.
function tagIssues(text){const t=str(text),unknown=[],foreign=[];
 for(const m of t.matchAll(TAG_RE)){const k=m[1].trim().toLowerCase(),c=k==='citta'?'città':k;if(!MERGE_TAGS.includes(c)&&!unknown.includes(m[0]))unknown.push(m[0])}
 const rest=t.replace(TAG_RE,'');
 for(const m of rest.matchAll(/\*\|[A-Z_]+\|\*|%[A-Za-z_]{2,20}%|(?<!\{)\{\s*[A-Za-zà_]{2,20}\s*\}(?!\})|\[(?:nome|cognome|azienda|name|first ?name|città|citta)\]|<(?:nome|name)>/gi))if(!foreign.includes(m[0]))foreign.push(m[0]);
 return {unknown,foreign}}

// ---- email sequences: «### Email 1 · Giorno 0» blocks with Oggetto, Anteprima, Testo, Invito, Scopo ----
const FIELD={invio:/^(?:invio|quando|tempistica|timing|ritardo)$/,subject:/^(?:oggetto|subject)$/,preheader:/^(?:anteprima|preheader|pre-?header)$/,body:/^(?:testo|corpo|messaggio)$/,cta:/^(?:invito|cta|pulsante|invito all'?azione)$/,goal:/^(?:scopo|obiettivo)$/};
function parseSequence(text){const out=[];let cur=null,field=null;
 for(const raw of str(text).replace(/\r/g,'').split('\n')){const line=raw.replace(/\*\*/g,'');
  const head=/^\s*(?:#{1,4}\s*)?(?:[-*•]\s*)?email\s+(\d{1,2})\b\s*[·:.\-–—)]*\s*(.*)$/i.exec(line);
  if(head){cur={n:+head[1],invio:head[2].trim(),subject:'',preheader:'',body:'',cta:'',goal:''};out.push(cur);field=null;continue}
  if(!cur)continue;
  const m=/^\s*(?:[-*•]\s*)?([A-Za-zà' -]{2,24}?)\s*:\s*(.*)$/.exec(line),k=m&&Object.keys(FIELD).find(f=>FIELD[f].test(m[1].trim().toLowerCase()));
  if(k){field=k;cur[k]=(m[2]||'').trim();continue}
  if(/^\s*#{1,3}\s/.test(line)||/^\s*---\s*$/.test(line)){field=null;continue}
  if(field==='body')cur.body+=(cur.body?'\n':'')+line;else if(field&&line.trim())cur[field]+=(cur[field]?' ':'')+line.trim()}
 for(const e of out){e.body=e.body.replace(/\n{3,}/g,'\n\n').trim();for(const k of ['subject','preheader','cta','invio'])e[k]=e[k].replace(/\s+\(\d+\/\d+\)$/,'').replace(/^[«"]|[»"]$/g,'').trim()}
 return out}
// One row per email, «;» separated with a BOM (Italian Excel, like sales/crm-csv-core.js); cells that start like a
// formula get a leading apostrophe.
function sequenceCsv(list){const safe=v=>{const s=str(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s},esc=v=>{const s=safe(v);return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 const cols=[['N','n'],['Invio','invio'],['Oggetto','subject'],['Anteprima','preheader'],['Testo','body'],['Invito','cta'],['Scopo','goal']];
 return '﻿'+[cols.map(c=>c[0]).join(';'),...(list||[]).map(e=>cols.map(c=>esc(e[c[1]])).join(';'))].join('\r\n')}

// ---- SMS ----
// GSM 03.38: the basic set (1 septet) and the extension set (2 septets: escape + char).
const GSM_BASIC='@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT='^{}\\[~]|€\f';
// {chars, encoding:'GSM-7'|'UCS-2', units, segments, single, multi, forcing:[chars that force UCS-2]}
function smsInfo(text){const t=str(text),cs=[...t],forcing=[];let units=0;
 for(const c of cs){if(GSM_BASIC.includes(c))units+=1;else if(GSM_EXT.includes(c))units+=2;else if(!forcing.includes(c))forcing.push(c)}
 if(forcing.length){const u=t.length;return {chars:cs.length,encoding:'UCS-2',units:u,single:70,multi:67,segments:u===0?0:u<=70?1:Math.ceil(u/67),forcing}}
 return {chars:cs.length,encoding:'GSM-7',units,single:160,multi:153,segments:units===0?0:units<=160?1:Math.ceil(units/153),forcing}}
const smsLabel=i=>i.units+'/'+i.single+' '+(i.encoding==='GSM-7'?'caratteri GSM-7':'caratteri UCS-2')+' · '+i.segments+' SMS';
// Alphanumeric sender: at most 11 characters, letters without accents, digits, spaces and . - &
function senderIssues(name){const s=str(name).trim(),out=[];
 if(!s)out.push('manca il mittente');
 if([...s].length>11)out.push('il mittente «'+s+'» ha '+[...s].length+' caratteri: massimo 11');
 if(s&&!/^[A-Za-z0-9 .&-]+$/.test(s))out.push('il mittente «'+s+'» ha caratteri non ammessi: solo lettere senza accenti, cifre, spazio, punto, trattino e &');
 if(s&&/^\d+$/.test(s))out.push('un mittente di sole cifre è un numero di telefono, non un nome');
 return out}
const OPT_OUT=/\bSTOP\b|disiscriv|cancellat|cancellarti|opt[- ]?out|non ricevere|non riceverli|annulla(?:re)? l'?iscrizione/i;
const hasOptOut=text=>OPT_OUT.test(str(text));

// ---- influencer briefs: the advertising label (Digital Chart IAP, AGCOM guidelines on influencers) ----
const DISCLOSURE=/#adv\b|#ad\b|pubblicit[aà]|advertising|sponsorizzat[oa] da|promoss[oa] da|prodotto inviato da|fornitura gratuita|in collaborazione commerciale con/i;
const hasDisclosure=text=>DISCLOSURE.test(str(text));
// @handles, #hashtags and links the person said are mandatory.
function mentionsIn(field){const t=str(field),out=[];for(const m of t.matchAll(/[@#][\p{L}\p{N}_.]{2,40}|https?:\/\/\S+|\bwww\.\S+/gu)){const x=m[0].replace(/[.,;]+$/,'');if(!out.includes(x))out.push(x)}return out}

// ---- competitors: one per line, «Nome — https://sito.it — cosa sai» ----
const URL_RE=/https?:\/\/[^\s,;)»]+|\b(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:it|com|eu|net|org|info|biz|shop|store|io|co|de|fr|es|ch)(?:\/[^\s,;)»]*)?/gi;
function competitors(text){const out=[];
 for(const line of str(text).split('\n')){const l=line.replace(/^[-*•\d.)\s]+/,'').trim();if(!l)continue;
  const url=(l.match(URL_RE)||[])[0]||'',rest=l.replace(url,' ').replace(/\s+/g,' ').trim();
  const parts=rest.split(/\s+[—–-]\s+|:\s+|\s*\|\s*/),name=(parts.shift()||'').replace(/[,:;—–-]+$/,'').trim();
  if(name||url)out.push({name:(name||url).slice(0,80),url,notes:parts.join(' — ').replace(/^[,;—–\s-]+/,'').trim().slice(0,400)})}
 return out}
const host=u=>str(u).toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[/?#].*$/,'').replace(/\.$/,'');
// Sites in `text` that are not in `input` (an invented URL is a fact nobody gave).
function unknownUrls(text,input){const known=new Set((str(input).match(URL_RE)||[]).map(host)),out=[];
 for(const u of str(text).match(URL_RE)||[]){const h=host(u);if(h&&!known.has(h)&&!out.includes(h))out.push(h)}
 return out}

return Object.freeze({numbersIn,unverifiedNumbers,words,sentences,superlatives,quotable,quoteIssues,traitLines,unlabelled,clientNumbers,
 MERGE_TAGS,tagIssues,parseSequence,sequenceCsv,smsInfo,smsLabel,senderIssues,hasOptOut,hasDisclosure,mentionsIn,competitors,unknownUrls});
});
