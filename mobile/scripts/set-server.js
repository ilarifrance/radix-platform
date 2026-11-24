#!/usr/bin/env node
// Plancia: point the native app to the site it loads. Usage: npm run dominio -- plancia.example
// Writes capacitor.config.json (server.url = https://<domain>/trasporti/autista/). Then: npm run sync and rebuild.
const fs=require('fs'),path=require('path');
const arg=String(process.argv[2]||'').trim().replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
if(!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(arg)){console.error('Scrivi il dominio, per esempio: npm run dominio -- app.plancia.example');process.exit(1);}
const file=path.join(__dirname,'..','capacitor.config.json');const c=JSON.parse(fs.readFileSync(file,'utf8'));
c.server={...c.server,url:'https://'+arg+'/trasporti/autista/',allowNavigation:[arg]};
fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');console.log('L\'app ora apre '+c.server.url);
