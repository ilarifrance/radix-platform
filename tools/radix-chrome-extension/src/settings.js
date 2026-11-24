'use strict';
// Shared by popup and options page: RADIX address, link code and the
// permission for a non-production address (asked only when the user saves it).
(function(root){
 const C=root.RadixImportCore;
 async function load(){
  const s=await chrome.storage.local.get(['baseUrl','token']);
  const baseUrl=s.baseUrl||C.DEFAULT_BASE,token=s.token||'';
  return {baseUrl,token,info:C.tokenInfo(token)};
 }
 // Must run straight from a click: Chrome only shows the permission prompt during a user gesture.
 function permit(baseUrl){
  if(baseUrl===C.DEFAULT_BASE)return Promise.resolve(true);
  return chrome.permissions.request({origins:[baseUrl+'/*']});
 }
 async function saveLink(code,fallbackBase){
  const parsed=C.parseLinkCode(code);
  const baseUrl=parsed.baseUrl||C.normalizeBaseUrl(fallbackBase||C.DEFAULT_BASE);
  const info=C.tokenInfo(parsed.token);
  if(!info)throw Error('Codice non leggibile');
  if(info.expired)throw Error('Codice scaduto: generane uno nuovo in RADIX');
  if(!(await permit(baseUrl)))throw Error('Serve il permesso per contattare '+baseUrl);
  await chrome.storage.local.set({baseUrl,token:parsed.token});
  return {baseUrl,info};
 }
 async function saveBase(value){
  const baseUrl=C.normalizeBaseUrl(value);
  if(!(await permit(baseUrl)))throw Error('Serve il permesso per contattare '+baseUrl);
  await chrome.storage.local.set({baseUrl});
  return baseUrl;
 }
 const date=iso=>new Date(iso).toLocaleDateString('it-IT',{day:'numeric',month:'long'});
 function describe(s){
  const host=new URL(s.baseUrl).host;
  if(!s.info)return {linked:false,text:'Non collegata a RADIX ('+host+')'};
  if(s.info.expired)return {linked:false,text:'Collegamento scaduto: genera un nuovo codice in RADIX'};
  return {linked:true,text:'Collegata a '+host+' · valida fino al '+date(s.info.expiresAt)};
 }
 root.RadixSettings={load,saveLink,saveBase,describe};
})(globalThis);
