'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('project workspace reads specialist memory context from the agency memory endpoint',()=>{
 const html=fs.readFileSync('agency/project-workspace.html','utf8');
 assert.match(html,/fetch\('\/api\/agency-memory\?'\+q\.toString\(\)\+'&mode=context'/);
 assert.doesNotMatch(html,/\/api\/auth\/me\?agencyMemory/);
 const handler=fs.readFileSync('api/_agency-memory-handler.js','utf8');
 assert.match(handler,/req\.query\.mode==='context'/);
});
