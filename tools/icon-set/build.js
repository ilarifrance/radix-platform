#!/usr/bin/env node
/* Builds lib/icon-set.js (and lib/icon-set.LICENSE.txt) from the lucide-static npm package: only the icons named in the
   Italian table of lib/icon-core.js, as their inner SVG elements (24 × 24 grid, stroke drawn by lib/icon-core.js).
   Usage: npm pack lucide-static@1.61.0 && tar xzf lucide-static-1.61.0.tgz && node tools/icon-set/build.js package
   Lucide is ISC licensed (some icons MIT, from Feather): the licence text travels with the data and with every export. */
'use strict';
const fs=require('fs'),path=require('path');
const pkg=path.resolve(process.argv[2]||'package'),root=path.join(__dirname,'..','..');
const core=require(path.join(root,'lib','icon-core.js'));
const version=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).version;
const license=fs.readFileSync(path.join(pkg,'LICENSE'),'utf8').replace(/\r\n/g,'\n').trim();
const ALLOWED=/^<(path|circle|rect|line|ellipse|polyline|polygon)(\s+[a-z][a-z0-9-]*="[^"<>]*")*\s*\/>$/;
const icons={};
for(const name of core.NAMES){
 const src=fs.readFileSync(path.join(pkg,'icons',name+'.svg'),'utf8');
 const body=/<svg[^>]*>([\s\S]*?)<\/svg>/.exec(src)[1];
 const els=(body.match(/<[a-z]+[^>]*\/>/g)||[]).map(e=>e.replace(/\s+/g,' ').replace(/\s*\/>$/,'/>').trim());
 for(const e of els)if(!ALLOWED.test(e))throw Error(name+': elemento inatteso '+e);
 if(!els.length)throw Error(name+': vuota');
 icons[name]=els.join('');
}
const header='/* RADIX icon set: '+core.NAMES.length+' icons of Lucide v'+version+' (lucide.dev), vendored by tools/icon-set/build.js for the\n'
 +'   Studio «Set di icone» (lib/icon-core.js). Inner SVG elements on a 24 × 24 grid, drawn with stroke="currentColor"-style\n'
 +'   attributes added by lib/icon-core.js. Licence: ISC (some icons MIT, from Feather), full text in LICENSE below and in\n'
 +'   lib/icon-set.LICENSE.txt; it goes in every zip the studio makes.\n\n'
 +license.split('\n').map(l=>'   '+l.replace(/\*\//g,'* /')).join('\n').replace(/[ ]+$/gm,'')+'\n*/\n';
const out=header+"(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixIconSet=api})(typeof globalThis!=='undefined'?globalThis:this,function(){\n'use strict';\n"
 +'const VERSION='+JSON.stringify(version)+';\nconst LICENSE='+JSON.stringify(license+'\n')+';\nconst icons=Object.freeze({\n'
 +Object.entries(icons).map(([k,v])=>' '+JSON.stringify(k)+':'+JSON.stringify(v)).join(',\n')+'\n});\nreturn Object.freeze({VERSION,LICENSE,icons});\n});\n';
fs.writeFileSync(path.join(root,'lib','icon-set.js'),out);
fs.writeFileSync(path.join(root,'lib','icon-set.LICENSE.txt'),'Lucide icons v'+version+' (lib/icon-set.js), vendored for the Studio «Set di icone».\nSource: the lucide-static npm package. Only the icons named in lib/icon-core.js are included.\n\n'+license+'\n');
console.log('icone:',Object.keys(icons).length,'· byte:',Buffer.byteLength(out));
