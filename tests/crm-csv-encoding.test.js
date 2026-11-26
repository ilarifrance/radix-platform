'use strict';
// A CSV saved by Excel on Windows is Windows-1252, not UTF-8: accented letters and «£» must still be read.
const test=require('node:test'),assert=require('node:assert');
const C=require('../sales/crm-csv-core.js');

test('decode: UTF-8, with or without BOM',()=>{
 assert.strictEqual(C.decode(Buffer.from('Nome;Città\nSocietà Però;Forlì','utf8')),'Nome;Città\nSocietà Però;Forlì');
 const bom=Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]),Buffer.from('Nome\nÈ','utf8')]);
 assert.strictEqual(C.decode(bom).replace(/^﻿/,''),'Nome\nÈ');
});
test('decode: Windows-1252 from Excel (accents, £ and €)',()=>{
 const bytes=Buffer.from([0x53,0x6F,0x63,0x69,0x65,0x74,0xE0,0x3B,0xA3,0x31,0x30,0x3B,0x80,0x35]); // «Società;£10;€5»
 assert.strictEqual(C.decode(bytes),'Società;£10;€5');
});
test('decode: UTF-16 with BOM («Testo Unicode» of Excel)',()=>{
 const le=Buffer.concat([Buffer.from([0xFF,0xFE]),Buffer.from('Città\tForlì','utf16le')]);
 assert.strictEqual(C.decode(le),'Città\tForlì');
});
test('decode accepts an ArrayBuffer, as file.arrayBuffer() gives',()=>{
 const u=new Uint8Array([0x63,0x61,0x66,0xE9]);
 assert.strictEqual(C.decode(u.buffer),'café');
});
