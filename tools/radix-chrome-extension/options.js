'use strict';
(async()=>{
 const C=window.RadixImportCore,S=window.RadixSettings;
 const $=id=>document.getElementById(id);
 const say=(id,text,kind)=>{$(id).textContent=text||'';$(id).className='status small'+(kind?' '+kind:'')};
 async function render(){
  const s=await S.load(),d=S.describe(s);
  $('link-text').textContent=d.text;$('link-dot').classList.toggle('on',d.linked);
  $('base-url').value=s.baseUrl;
  return s;
 }
 $('link-save').onclick=()=>{
  // No await before saveLink: the permission prompt needs the click gesture.
  S.saveLink($('link-code').value,$('base-url').value).then(async()=>{
   $('link-code').value='';await chrome.storage.local.remove('pendingCode');
   await render();$('link-check').click();
  },e=>say('link-message',e.message,'bad'));
 };
 $('link-check').onclick=async()=>{
  try{
   const s=await S.load();if(!s.info)throw Error('Nessun codice salvato');
   say('link-message','Verifica in corso…');
   const r=await C.checkLink({baseUrl:s.baseUrl,token:s.token});
   say('link-message','Collegamento attivo: ruolo «'+r.role+'» nel workspace '+r.workspace.slice(0,8)+'…','ok');
  }catch(e){say('link-message',e.message,'bad')}
 };
 $('link-remove').onclick=async()=>{await chrome.storage.local.remove('token');await render();say('link-message','Estensione scollegata.')};
 $('base-save').onclick=()=>{S.saveBase($('base-url').value).then(async b=>{await render();say('base-message','Indirizzo salvato: '+b,'ok')},e=>say('base-message',e.message,'bad'))};
 $('base-reset').onclick=async()=>{await chrome.storage.local.set({baseUrl:C.DEFAULT_BASE});await render();say('base-message','Indirizzo di produzione ripristinato.','ok')};
 await render();
 const {pendingCode}=await chrome.storage.local.get('pendingCode');
 if(pendingCode){$('link-code').value=pendingCode;say('link-message','Codice per una Preview: premi «Collega» e consenti l’accesso quando Chrome lo chiede.','warn')}
})();
