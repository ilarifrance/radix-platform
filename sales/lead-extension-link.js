'use strict';
// «Collega estensione Chrome»: asks RADIX for a 14-day code that lets the
// «Importa in RADIX» extension create contact jobs in the selected workspace
// (and nothing else). The code is shown once, for the user to paste.
(()=>{
 const $=id=>document.getElementById(id),button=$('radix-extension-link');
 if(!button)return;
 const b64url=text=>btoa(unescape(encodeURIComponent(text))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const code=token=>'radix-link:'+b64url(JSON.stringify({u:location.origin,t:token}));
 const out=document.createElement('div');out.className='radix-extension-link';out.hidden=true;
 const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');
 const box=document.createElement('textarea');box.readOnly=true;box.rows=3;box.setAttribute('aria-label','Codice di collegamento estensione');box.style.width='100%';
 const copy=document.createElement('button');copy.type='button';copy.className='outline';copy.textContent='Copia codice';
 out.append(status,box,copy);button.closest('.toolbar').after(out);
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(box.value);status.textContent='Codice copiato. Incollalo nell’estensione «Importa in RADIX».'}catch{box.select();status.textContent='Seleziona il codice e copialo con Ctrl+C / Cmd+C.'}};
 button.onclick=async()=>{
  out.hidden=false;box.hidden=true;copy.hidden=true;
  try{
   const workspace=$('archive-workspace')?.value||'';
   if(!/^[a-f0-9-]{36}$/i.test(workspace))throw Error('Scegli prima il workspace in alto');
   status.textContent='Creazione codice…';
   const res=await fetch('/api/sales',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace,entity:'lead_import_token',action:'create',data:{}})});
   const body=await res.json().catch(()=>({}));
   if(!res.ok||!body.token)throw Error(body.error||'Codice non disponibile');
   box.value=code(body.token);box.hidden=false;copy.hidden=false;
   status.textContent='Codice valido fino al '+new Date(body.expiresAt).toLocaleDateString('it-IT')+': permette all’estensione solo di importare nuovi contatti in questo workspace. Non condividerlo.';
  }catch(e){status.textContent='Collegamento estensione: '+e.message}
 };
})();
