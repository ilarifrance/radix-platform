// PED «Hai già le immagini pronte? Caricale»: finished images (a carousel made elsewhere) go to the post as they are.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','editorial-workspace.js'),'utf8');
const pick=name=>{const i=src.indexOf('function '+name+'(');assert.ok(i>=0,name+' found');let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break}return src.slice(i,j+1)};
const uploadProblem=new Function(src.match(/const MAX_UPLOADS=[^\n]*\n/)[0]+pick('uploadProblem')+';return uploadProblem')();
const f=(name,type='image/png',size=1000)=>({name,type,size});

test('upload: at most 10 images, only JPG/PNG/WebP, each up to 15 MB',()=>{
 assert.equal(uploadProblem([f('1.png'),f('2.jpg','image/jpeg'),f('3.webp','image/webp')]),'');
 assert.match(uploadProblem(Array.from({length:11},(_,i)=>f(i+'.png'))),/Al massimo 10/);
 assert.match(uploadProblem([f('a.gif','image/gif')]),/«a\.gif» non è un JPG/);
 assert.match(uploadProblem([f('big.png','image/png',16*1024*1024)]),/«big\.png» supera i 15 MB/);
});

test('upload: multiple file input inside a .pf-drop zone, saved as an uploaded photo so drawn graphics do not replace it',()=>{
 assert.match(src,/ud\.className='pf-drop pp-upload';ui\.type='file';ui\.accept='image\/jpeg,image\/png,image\/webp';ui\.multiple=true/);
 assert.match(src,/attachCanvases\(item,cs\);setPhoto\(item\.id,\{source:'upload'/);
 assert.match(src,/localeCompare\(String\(b\.name\),'it',\{numeric:true\}\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','shell','ped.css'),'utf8'),/#mediaTools \.pp-upload input\{position:absolute/);
});

test('upload: picking files or typing a video link in the media box does not mark the post text as unsaved',()=>{
 assert.match(src,/\$\('contentForm'\)\.oninput=e=>\{if\(e&&e\.target&&\([^)]*\)\|\|\(e\.target\.closest&&e\.target\.closest\('#mediaTools'\)\)\)\)return;/);
});
