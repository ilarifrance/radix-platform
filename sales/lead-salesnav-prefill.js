'use strict';
(()=>{
 const key='radix.salesnav.pending.v1',S=window.RadixSalesnavSource,$=id=>document.getElementById(id);
 if(!S||!$('contact-source'))return;
 try{
  const raw=sessionStorage.getItem(key);
  if(!raw)return;
  sessionStorage.removeItem(key);
  const info=JSON.parse(raw);
  if(!Number.isFinite(info?.at)||Date.now()-info.at>600000||info.at>Date.now()+60000)throw Error('Ricerca scaduta: ricopia l’URL');
  const url=S.validate(info.url),count=S.quantity(info.requested);
  if($('contact-source').value.trim()&&!window.confirm('Utilizzare la ricerca Sales Navigator preparata nella pagina LinkedIn al posto della fonte attuale?'))return;
  $('contact-source').value=url;
  $('contact-batch-id').value='lotto-1';
  $('contact-status').textContent='Ricerca Sales Navigator preparata ('+count+' contatti indicativi). L’URL è stato passato localmente al motore RADIX. Per acquisire contatti serve ancora un export JSON autorizzato o una connessione provider attiva; nessuna estrazione è stata avviata.';
 }catch(e){$('contact-status').textContent='Trasferimento della ricerca non riuscito: '+e.message}
})();
