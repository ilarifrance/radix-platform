'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
function response(){return {code:200,status(n){this.code=n;return this},json(data){this.data=data;return this}}}
function handler(){const original=Module._load;Module._load=function(request,parent){if(parent&&parent.filename.includes('/api/')&&request.endsWith('/_db'))return {sql(){throw Error('Unauthenticated request reached database')}};if(parent&&parent.filename.includes('/api/')&&request.endsWith('/_auth'))return {isAdminRequest:()=>false};return original.apply(this,arguments)};try{return require('../api/admin/[action]')}finally{Module._load=original}}
test('admin dispatcher preserves routing and rejects unknown actions without loading a handler',async()=>{const route=handler();for(const action of ['unknown','__proto__',['users']]){const res=response();await route({query:{action}},res);assert.equal(res.code,404)}});
test('all admin paths retain authentication, including optional Memory migration',async()=>{
 const original=Module._load;Module._load=function(request,parent){if(parent&&parent.filename.includes('/api/')&&request.endsWith('/_db'))return {sql(){throw Error('Unauthenticated request reached database')}};if(parent&&parent.filename.includes('/api/')&&request.endsWith('/_auth'))return {isAdminRequest:()=>false};return original.apply(this,arguments)};
 try{const route=require('../api/admin/[action]');for(const query of [{action:'users'},{action:'migrate'},{action:'migrate',agencyMemory:'1'},{action:'migrate',registry:'1'}]){const res=response();await route({method:'POST',query},res);assert.equal(res.code,401)}}finally{Module._load=original}
});
test('Vercel entrypoint budget stays below the 12-function ceiling',()=>{
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('_')?[]:e.isDirectory()?walk(path.join(dir,e.name)):/\.(js|ts|mjs|cjs)$/.test(e.name)?[path.join(dir,e.name)]:[]);
 const files=walk('api');assert.equal(files.length,9);assert.ok(files.includes('api/workspace.js'));assert.ok(files.includes('api/admin/[action].js'));assert.ok(!fs.existsSync('api/admin/users.js'));assert.ok(!fs.existsSync('api/admin/migrate.js'));assert.ok(files.includes('api/integrations/[service].js'));
});
