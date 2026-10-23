/* Pagine legali del sito (Studio Sito, lib/site-studio.js): informativa privacy (GDPR, art. 13), cookie policy, pagina
   «grazie» del modulo contatti e dati del piè di pagina. Tutto senza AI, da un modello fisso e dai soli fatti del progetto:
   ragione sociale, partita IVA, sede legale ed e-mail per la privacy. Un dato che manca non si inventa mai: diventa il
   segnaposto giallo «[da completare: …]», che lo studio chiede nel riquadro «Da completare» e che blocca la pubblicazione
   (lib/site-studio.js e api/_site_publish.js rifiutano le pagine che lo contengono).
   Il sito generato non ha script né cookie propri: la cookie policy lo dice; se il cliente sceglie le statistiche di visita
   la pagina le descrive, con lo strumento da completare. Funzioni pure: girano nel browser e in Node per i test. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSiteLegal=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// The placeholders: one fixed label per missing fact, so the same text fills the footer and every legal page at once.
const TODO=Object.freeze({legalName:'ragione sociale',vat:'partita IVA',address:'sede legale (indirizzo completo)',email:'e-mail per le richieste privacy',analytics:'strumento di statistica usato (nome e fornitore)'});
const PAGES=Object.freeze({privacy:'privacy.html',cookie:'cookie.html',thanks:'grazie.html'});
const marker=k=>'[da completare: '+TODO[k]+']';
const todo=k=>'<mark class="todo">'+esc(marker(k))+'</mark>';
const val=(f,k)=>clean(f&&f[k])?esc(clean(f[k])):todo(k);

// Italian VAT number: 11 digits with the official check digit. «IT» in front is accepted and dropped.
function vatNumber(v){const s=clean(v).replace(/^IT\s*/i,'').replace(/[\s.]/g,'');if(!/^\d{11}$/.test(s)||/^0{11}$/.test(s))return '';
 let sum=0;for(let i=0;i<10;i++){let d=+s[i];if(i%2){d*=2;if(d>9)d-=9}sum+=d}
 return (10-sum%10)%10===+s[10]?s:''}
// The value typed for a placeholder → {value} or {error}: only the VAT number has a format to respect.
function checkValue(label,value){const v=clean(value);if(!v)return {value:''};
 if(String(label).includes(TODO.vat)){const n=vatNumber(v);return n?{value:n}:{error:'Partita IVA non valida: servono 11 cifre (controlla di averla copiata bene).'}}
 if(String(label).includes(TODO.email)&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return {error:'E-mail per la privacy non valida.'};
 return {value:v}}

/* The facts already written in the project, never guessed: explicit profile fields (legalName/ragioneSociale, vat/piva,
   legalAddress/sedeLegale, privacyEmail) or labelled lines in the notes («Ragione sociale: …», «P. IVA: …», «Sede legale: …»).
   The e-mail falls back to the first confirmed e-mail of the contacts typed in the studio. */
function legalFacts(profile,{contacts}={}){const p=profile&&typeof profile==='object'?profile:{},c=p.contacts&&typeof p.contacts==='object'?p.contacts:{};
 const text=[p.notes,p.links,p.decisions,typeof p.contacts==='string'?p.contacts:''].map(x=>Array.isArray(x)?x.join('\n'):String(x||'')).join('\n');
 const line=re=>{const m=text.match(re);return m?clean(m[1]).replace(/[.;,]+$/,''):''};
 const legalName=clean(p.legalName||p.ragioneSociale||c.legalName||line(/^\s*ragione\s+sociale\s*:\s*(.+)$/im)).slice(0,160);
 const vat=vatNumber(p.vat||p.piva||c.vat||c.piva||line(/^\s*(?:p\.?\s*iva|partita\s+iva)\s*:?\s*((?:IT\s*)?[\d\s.]{11,16})/im));
 const address=clean(p.legalAddress||p.sedeLegale||c.legalAddress||line(/^\s*sede\s+legale\s*:\s*(.+)$/im)).slice(0,200);
 const mail=String(p.privacyEmail||c.privacyEmail||c.email||'')+' '+String(contacts||'');
 const email=(mail.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)||[''])[0];
 return {legalName,vat,address,email}}
const missing=f=>['legalName','vat','address','email'].filter(k=>!clean(f&&f[k]));

// ---- the pages: same colours as the site, no scripts, every text escaped ----
// Text colour readable on a button of colour hex (WCAG relative luminance).
function onColour(hex){const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)),L=.2126*v[0]+.7152*v[1]+.0722*v[2];return L>.36?'#111827':'#FFFFFF'}
function shell(title,body,o={}){const c=o.colours||{},p=/^#[0-9a-f]{6}$/i.test(c.p)?c.p:'#1F2937',a=/^#[0-9a-f]{6}$/i.test(c.a)?c.a:'#2563EB';
 return ['<!doctype html>','<html lang="it">','<head>','<meta charset="utf-8">','<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
  '<meta name="robots" content="noindex">','<title>'+esc(title)+(o.name?' · '+esc(clean(o.name)):'')+'</title>',
  '<style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#1f2328;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere}',
  '.wrap{max-width:780px;margin:0 auto;padding:0 22px}header{border-bottom:1px solid #e5e7eb}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;flex-wrap:wrap}',
  'header a{color:'+p+';font-weight:700;text-decoration:none}main{padding:36px 0 56px}h1{font-size:clamp(28px,5vw,40px);line-height:1.15;color:'+p+';margin:0 0 .4em}',
  'h2{font-size:20px;margin:1.8em 0 .4em;color:'+p+'}a{color:'+a+'}ul{padding-left:1.2em}.muted{color:#6b7280;font-size:14px}',
  'mark.todo{background:#FEF3C7;color:#78350F;padding:1px 4px;border-radius:4px;font-size:.92em}',
  '.btn{display:inline-block;background:'+a+';color:'+onColour(a)+';padding:14px 24px;border-radius:10px;font-weight:700;text-decoration:none}.code{display:inline-flex;flex-direction:column;gap:4px;margin:8px 0 18px;padding:16px 22px;border:2px dashed '+p+';border-radius:12px}.code span{font-size:14px;color:#4b5563}.code strong{font-size:28px;letter-spacing:.08em;color:'+p+'}.code small{font-size:14px;color:#4b5563}',
  'footer{border-top:1px solid #e5e7eb;padding:22px 0;font-size:14px;color:#4b5563}',
  'footer nav{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px}@media (max-width:640px){body{font-size:15px}.wrap{padding:0 16px}main{padding:26px 0 40px}}</style>',
  '</head>','<body>','<header><div class="wrap"><a href="index.html">← '+(o.name?esc(clean(o.name)):'Torna al sito')+'</a></div></header>',
  '<main><div class="wrap">',body,'</div></main>','<footer><div class="wrap">'+footerText(o.facts,o)+'</div></footer>','</body>','</html>'].join('\n')}

// «© 2026 Ragione sociale · P. IVA … · Sede legale: …» and the links to the legal pages: the same line on every page.
function footerText(f,o={}){return '<p>© '+esc(o.year||new Date().getFullYear())+' '+val(f,'legalName')+' · P. IVA '+val(f,'vat')+' · Sede legale: '+val(f,'address')+'</p>'+
 '<nav aria-label="Note legali"><a href="'+PAGES.privacy+'">Privacy</a><a href="'+PAGES.cookie+'">Cookie</a></nav>'}

const dateIt=d=>{const x=d?new Date(d):new Date();return Number.isFinite(x.getTime())?x.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Rome'}):''};
/* Informativa privacy (art. 13 GDPR). o: {facts, name, form (the site has the contact form), analytics (statistics chosen), date, year, colours}. */
function privacyPage(o={}){const f=o.facts||{},form=o.form!==false,stats=!!o.analytics,B=[],mg=o.magnet&&typeof o.magnet==='object'?o.magnet:null,what=mg?esc(clean(mg.what)||'il materiale gratuito'):'';
 B.push('<h1>Informativa privacy</h1>','<p class="muted">Ai sensi dell’art. 13 del Regolamento (UE) 2016/679 (GDPR). Ultimo aggiornamento: '+esc(dateIt(o.date))+'.</p>');
 B.push('<h2>Chi tratta i dati</h2>','<p>Il titolare del trattamento è '+val(f,'legalName')+', con sede legale in '+val(f,'address')+', P. IVA '+val(f,'vat')+'. Per ogni richiesta sui tuoi dati scrivi a '+(clean(f.email)?'<a href="mailto:'+esc(clean(f.email))+'">'+esc(clean(f.email))+'</a>':todo('email'))+'.</p>');
 B.push('<h2>Quali dati</h2><ul>','<li><strong>Dati di navigazione.</strong> Il servizio che ospita il sito registra in automatico dati tecnici delle visite (indirizzo IP, data e ora, pagina richiesta, tipo di browser) per farlo funzionare e proteggerlo.</li>');
 if(form)B.push(mg?'<li><strong>Dati che ci scrivi nel modulo.</strong> Nome ed e-mail.</li>':'<li><strong>Dati che ci scrivi nel modulo contatti.</strong> Nome, e-mail, telefono (facoltativo) e il messaggio.</li>');
 if(stats)B.push('<li><strong>Statistiche di visita.</strong> Dati sull’uso del sito raccolti con '+todo('analytics')+', come descritto nella <a href="'+PAGES.cookie+'">cookie policy</a>.</li>');
 B.push('</ul>');
 B.push('<h2>Perché e su quale base</h2><ul>');
 if(form)B.push(mg?'<li>Darti '+what+' che hai chiesto e risponderti se ci scrivi: è necessario per il servizio che chiedi (art. 6, par. 1, lett. b GDPR).</li>':'<li>Rispondere alla tua richiesta e, se lo chiedi, prepararti un’offerta: è necessario per misure precontrattuali richieste da te (art. 6, par. 1, lett. b GDPR).</li>',
  '<li>Mandarti novità e offerte via e-mail, solo se lo scegli con la casella apposita: base giuridica è il tuo consenso (art. 6, par. 1, lett. a GDPR), che puoi revocare quando vuoi.</li>');
 B.push('<li>Far funzionare il sito e proteggerlo da abusi: legittimo interesse del titolare (art. 6, par. 1, lett. f GDPR).</li>');
 if(stats)B.push('<li>Capire come viene usato il sito per migliorarlo: secondo quanto indicato nella cookie policy.</li>');
 B.push('</ul>');
 if(form)B.push('<h2>Se non ci dai i dati</h2>',mg?'<p>Il modulo è facoltativo. Senza nome ed e-mail però non possiamo darti '+what+'. Il consenso alle e-mail con consigli e offerte è a parte e non serve per riceverlo.</p>':'<p>Il modulo è facoltativo. Senza nome, e-mail e messaggio però non possiamo risponderti.</p>');
 B.push('<h2>Chi altro li vede</h2>','<p>I dati sono trattati dal titolare e dalle persone da lui autorizzate. Li trattano per suo conto, come responsabili del trattamento (art. 28 GDPR), il fornitore che ospita il sito'+(form?' e la piattaforma gestionale (CRM) in cui arrivano le richieste del modulo':'')+'. Non vendiamo i dati e non li diffondiamo.</p>');
 B.push('<h2>Trasferimenti fuori dall’Unione europea</h2>','<p>Il servizio che ospita il sito può trattare dati anche fuori dall’Unione europea, ad esempio negli Stati Uniti. In questo caso il trasferimento avviene solo con le garanzie previste dagli artt. 45 e 46 GDPR (decisione di adeguatezza o clausole contrattuali standard della Commissione europea).</p>');
 B.push('<h2>Per quanto tempo</h2><ul>');
 if(form)B.push(mg?'<li>Dati del modulo: per il tempo necessario a darti '+what+' e a gestire le tue richieste; poi vengono cancellati.</li>':'<li>Messaggi del modulo: per il tempo necessario a rispondere e a gestire l’eventuale rapporto che ne segue; poi vengono cancellati.</li>','<li>Consenso alle novità: finché non lo revochi.</li>');
 B.push('<li>Dati di navigazione: per il tempo previsto dal servizio di hosting per sicurezza e funzionamento.</li>','</ul>');
 B.push('<h2>I tuoi diritti</h2>','<p>Puoi chiedere in ogni momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, riceverli in un formato portabile e opporti al trattamento (artt. 15-22 GDPR). Puoi revocare il consenso senza effetti sul trattamento fatto prima. Hai anche il diritto di presentare reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it">www.garanteprivacy.it</a>).</p>');
 B.push('<h2>Cookie</h2>','<p>Per i cookie leggi la <a href="'+PAGES.cookie+'">cookie policy</a>.</p>');
 return shell('Informativa privacy',B.join('\n'),o)}

/* Cookie policy. Without statistics the site sets no cookies of its own (static page, no scripts): it says so. */
function cookiePage(o={}){const stats=!!o.analytics,B=[];
 B.push('<h1>Cookie policy</h1>','<p class="muted">Ultimo aggiornamento: '+esc(dateIt(o.date))+'.</p>');
 B.push('<h2>Cosa sono i cookie</h2>','<p>I cookie sono piccoli file che un sito salva nel browser. Alcuni servono a far funzionare il sito (cookie tecnici), altri a misurare le visite o a mostrare pubblicità.</p>');
 B.push('<h2>Cookie usati da questo sito</h2>');
 B.push('<p>Questo sito non usa cookie di profilazione né pubblicità. Non contiene script e non installa cookie propri. Il servizio che lo ospita può usare solo cookie tecnici strettamente necessari a consegnare le pagine e a proteggerle: per questi non serve il consenso (art. 122 del Codice privacy e Linee guida del Garante sui cookie del 10 giugno 2021).</p>');
 if(stats)B.push('<h2>Statistiche di visita</h2>','<p>Per misurare le visite usiamo '+todo('analytics')+'. Questi cookie si attivano solo con il tuo consenso, che puoi dare o negare nel banner e cambiare in ogni momento, salvo che lo strumento sia configurato in forma anonima come previsto dal Garante.</p>');
 B.push('<h2>Link verso altri siti</h2>','<p>I link a servizi esterni (per esempio la mappa) aprono siti di terzi, con le loro regole sui cookie.</p>');
 B.push('<h2>Come gestire i cookie</h2>','<p>Puoi cancellare o bloccare i cookie dalle impostazioni del tuo browser. Bloccare i cookie tecnici può impedire al sito di funzionare bene.</p>');
 B.push('<h2>Titolare</h2>','<p>'+val(o.facts,'legalName')+' · per domande leggi l’<a href="'+PAGES.privacy+'">informativa privacy</a>.</p>');
 return shell('Cookie policy',B.join('\n'),o)}

// Where the contact form lands after a send (api/_site_form.js redirects here).
/* With o.magnet ({title, what, file, button, code, expiry, note}: the lead magnet of the Studio Funnel, lib/funnel-studio.js)
   the page hands over the PDF (a link to the file published next to it) and, for a coupon, the code: no e-mail is promised. */
function thanksPage(o={}){const mg=o.magnet&&typeof o.magnet==='object'?o.magnet:null;
 if(mg){const file=/^[a-z0-9][a-z0-9-]{0,60}\.pdf$/.test(String(mg.file||''))?String(mg.file):'',B=['<h1>'+esc(clean(mg.title)||'Grazie!')+'</h1>'];
  if(clean(mg.text))B.push('<p>'+esc(clean(mg.text))+'</p>');
  if(clean(mg.code))B.push('<div class="code"><span>Il tuo codice</span><strong>'+esc(clean(mg.code))+'</strong>'+(clean(mg.expiry)?'<small>'+esc(clean(mg.expiry))+'</small>':'')+'</div>');
  if(file)B.push('<p><a class="btn" href="'+esc(file)+'" download>'+esc(clean(mg.button)||'Scarica il PDF')+'</a></p>');
  if(clean(mg.note))B.push('<p class="muted">'+esc(clean(mg.note))+'</p>');
  B.push('<p><a href="index.html">Torna alla pagina</a></p>');
  return shell('Grazie',B.join('\n'),o)}
 return shell('Grazie',['<h1>Grazie, abbiamo ricevuto il tuo messaggio</h1>','<p>Ti rispondiamo il prima possibile all’indirizzo e-mail che ci hai lasciato.</p>','<p><a href="index.html">Torna al sito</a></p>'].join('\n'),o)}

// All the pages the site ships with besides index.html: {'privacy.html':…, 'cookie.html':…, 'grazie.html' (only with the form)}.
function legalPages(o={}){const out={[PAGES.privacy]:privacyPage(o),[PAGES.cookie]:cookiePage(o)};if(o.form!==false)out[PAGES.thanks]=thanksPage(o);return out}

return Object.freeze({TODO,PAGES,marker,vatNumber,checkValue,legalFacts,missing,footerText,privacyPage,cookiePage,thanksPage,legalPages,escapeHtml:esc});
});
