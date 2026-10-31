#!/usr/bin/env node
/* Genera le pagine legali comuni dei siti pubblici (siti/legali/privacy.html, cookie.html, grazie.html) da lib/site-legal.js
   e dai dati societari in siti/comune/societa.json. Nessuna AI: un dato che manca resta «[da completare: …]».
   Uso: node tools/siti-legali.js  (riscrive i tre file; i test controllano che siano aggiornati). */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const legal=require('../lib/site-legal.js');
const root=path.join(__dirname,'..');
function build(){
 const facts=JSON.parse(fs.readFileSync(path.join(root,'siti/comune/societa.json'),'utf8'));
 const pages=legal.legalPages({facts,name:facts.siteName||'RADIX',form:true,analytics:!!facts.analytics,date:'2026-10-31',year:2026,colours:{p:'#02090B',a:'#00EAB5'}});
 // The generated shell links back to index.html: inside siti/legali/ that is the hub of the sites.
 return Object.fromEntries(Object.entries(pages).map(([f,html])=>[f,html.replace('<a href="index.html">','<a href="/siti/">')]));
}
if(require.main===module){const out=build();for(const [f,html] of Object.entries(out)){fs.writeFileSync(path.join(root,'siti/legali',f),html);console.log('scritto siti/legali/'+f)}}
module.exports={build};
