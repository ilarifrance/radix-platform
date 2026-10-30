'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const Z=require('../lib/zip-lite.js');
const hasUnzip=(()=>{try{execFileSync('unzip',['-v'],{stdio:'ignore'});return true}catch(e){return false}})();

test('crc32 matches the reference values',()=>{
 assert.equal(Z.crc32(new TextEncoder().encode('123456789')),0xCBF43926);
 assert.equal(Z.crc32(new Uint8Array(0)),0);
});

test('a store-only zip has local headers, central directory and end record, and reads back with the right bytes',()=>{
 const png=Uint8Array.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,1,2,3,255]);
 const bytes=Z.zip([{name:'testo.txt',data:'Ciao è già «post» #radix\n'},{name:'slide-01.png',data:png},{name:'città/perché.txt',data:new Uint8Array([65,66]).buffer}],{date:new Date(2026,9,20,18,30,10)});
 const v=new DataView(bytes.buffer);
 assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint16(6,true)&0x0800,0x0800);assert.equal(v.getUint16(8,true),0);
 assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);assert.equal(v.getUint16(bytes.length-12,true),3);
 const back=Z.unzip(bytes);
 assert.deepEqual(back.map(f=>f.name),['testo.txt','slide-01.png','città/perché.txt']);assert.ok(back.every(f=>f.utf8));
 assert.equal(new TextDecoder().decode(back[0].data),'Ciao è già «post» #radix\n');assert.deepEqual([...back[1].data],[...png]);
});

test('names must be present and unique',()=>{
 assert.throws(()=>Z.zip([{name:'',data:'x'}]),/Nome file mancante/);
 assert.throws(()=>Z.zip([{name:'a.txt',data:'x'},{name:'a.txt',data:'y'}]),/ripetuto/);
 assert.equal(Z.unzip(Z.zip([])).length,0);
});

test('a corrupted byte is caught by the CRC check',()=>{
 const bytes=Z.zip([{name:'a.txt',data:'abcdef'}]);bytes[30+5+2]^=1;assert.throws(()=>Z.unzip(bytes),/CRC/);
});

test('the system unzip tool accepts the archive',{skip:!hasUnzip&&'unzip non disponibile'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zip-lite-')),file=path.join(dir,'post.zip');
 try{fs.writeFileSync(file,Z.zip([{name:'testo.txt',data:'Testo del post'},{name:'slide-01.png',data:new Uint8Array(4096).map((_,i)=>i%251)},{name:'città/LEGGIMI.txt',data:'Note: già'}]));
  const out=execFileSync('unzip',['-t',file],{encoding:'utf8'});assert.match(out,/No errors detected/);
  assert.equal(execFileSync('unzip',['-p',file,'testo.txt'],{encoding:'utf8'}),'Testo del post')}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
});
