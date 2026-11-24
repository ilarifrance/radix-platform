'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const p7m=require('../lib/accounting/p7m.js'),fp=require('../lib/accounting/fatturapa.js');
const FX=path.join(__dirname,'fixtures','accounting');
const invoiceName=fs.readdirSync(FX).filter(f=>f.endsWith('.xml')).sort().find(f=>/FatturaElettronica/.test(fs.readFileSync(path.join(FX,f),'utf8')));
const invoicePath=path.join(FX,invoiceName),invoiceText=fs.readFileSync(invoicePath,'utf8');
const number=xml=>fp.parse(xml).documents[0].number;

// Hand-built DER/BER helpers
const len=n=>n<128?[n]:n<256?[0x81,n]:n<65536?[0x82,n>>8,n&255]:[0x83,n>>16,(n>>8)&255,n&255];
const tlv=(tag,...parts)=>{const c=Buffer.concat(parts.map(p=>Buffer.from(p)));return Buffer.concat([Buffer.from([tag,...len(c.length)]),c])};
const indef=(tag,...parts)=>Buffer.concat([Buffer.from([tag,0x80]),...parts.map(p=>Buffer.from(p)),Buffer.from([0,0])]);
const OID_SIGNED=[0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x07,0x02],OID_DATA=[0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x07,0x01];
const envelope=eContent=>tlv(0x30,OID_SIGNED,tlv(0xa0,tlv(0x30,[0x02,0x01,0x01],tlv(0x31),tlv(0x30,OID_DATA,tlv(0xa0,eContent)),tlv(0x31))));
const tiny='<?xml version="1.0"?><p:FatturaElettronica versione="FPR12" xmlns:p="x"></p:FatturaElettronica>';

test('hand-built DER with latin1 XML decodes accented characters',()=>{
 const xml='<?xml version="1.0" encoding="ISO-8859-1"?><Nota>Società è già</Nota>';
 const r=p7m.extract(new Uint8Array(envelope(tlv(0x04,Buffer.from(xml,'latin1')))));
 assert.equal(r.xml,xml);assert.equal(r.encoding,'windows-1252');assert.equal(r.bytes,Buffer.byteLength(xml,'latin1'));
});

test('hand-built BER: indefinite lengths, chunked OCTET STRING, BOM, base64 and ArrayBuffer input',()=>{
 const raw=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(tiny)]);
 const chunks=[raw.subarray(0,10),raw.subarray(10,40),raw.subarray(40)];
 const ber=indef(0x30,OID_SIGNED,indef(0xa0,indef(0x30,[0x02,0x01,0x01],tlv(0x31),indef(0x30,OID_DATA,indef(0xa0,
  indef(0x24,tlv(0x04,chunks[0]),indef(0x24,tlv(0x04,chunks[1])),tlv(0x04,chunks[2])))),tlv(0x31))));
 const r=p7m.extract(new Uint8Array(ber));
 assert.equal(r.xml,tiny);assert.equal(r.encoding,'utf-8');assert.equal(r.bytes,tiny.length);
 assert.equal(p7m.extract(ber.buffer.slice(ber.byteOffset,ber.byteOffset+ber.length)).xml,tiny);
 assert.equal(p7m.extract(ber.toString('base64').replace(/.{64}/g,'$&\n')).xml,tiny);
 assert.equal(p7m.extract(new Uint8Array(Buffer.from(ber.toString('base64')))).xml,tiny); // file holding base64 text
});

test('nested envelope is unwrapped',()=>{
 const inner=envelope(tlv(0x04,Buffer.from(tiny)));
 assert.equal(p7m.extract(envelope(tlv(0x04,inner))).xml,tiny);
});

test('garbage, truncated, detached, non-XML and oversized inputs throw Italian errors',()=>{
 assert.throws(()=>p7m.extract(new Uint8Array([1,2,3,4,5,6])),/non è un \.p7m valido/);
 assert.throws(()=>p7m.extract('questo non è base64!'),/non è un \.p7m valido/);
 assert.throws(()=>p7m.extract(42),/Formato di input non supportato/);
 const full=envelope(tlv(0x04,Buffer.from(tiny)));
 assert.throws(()=>p7m.extract(new Uint8Array(full.subarray(0,60))),/troncato/);
 const detached=tlv(0x30,OID_SIGNED,tlv(0xa0,tlv(0x30,[0x02,0x01,0x01],tlv(0x31),tlv(0x30,OID_DATA),tlv(0x31))));
 assert.throws(()=>p7m.extract(detached),/firma separata/);
 assert.throws(()=>p7m.extract(envelope(tlv(0x04,Buffer.from('ciao mondo')))),/non contiene una fattura XML leggibile/);
 assert.throws(()=>p7m.extract(new Uint8Array(10*1024*1024+1)),/troppo grande/);
});

test('fallback scan returns primitive XML from a broken envelope but rejects chunked content',()=>{
 const broken=Buffer.concat([Buffer.from([0x30,0x82,0xff,0xff]),Buffer.from('junk'),Buffer.from(tiny),Buffer.from([0x31,0x00])]);
 assert.equal(p7m.extract(broken).xml,tiny);
 const chunked=Buffer.concat([Buffer.from([0x30,0x82,0xff,0xff]),Buffer.from(tiny.slice(0,30)),Buffer.from([0x04,0x82,0x03,0xe8]),Buffer.from(tiny.slice(30))]);
 assert.throws(()=>p7m.extract(chunked),/troncato/);
});

// Real CAdES-like fixtures produced by openssl at test time
const OPENSSL=['/usr/bin/openssl','openssl'].find(bin=>{try{execFileSync(bin,['version'],{stdio:'ignore'});return true}catch(e){return false}});
let dir;
const ossl=args=>execFileSync(OPENSSL,args,{stdio:['ignore','pipe','pipe']});
const sign=(input,out,extra)=>{ossl(['cms','-sign','-nodetach','-binary','-in',input,'-signer',path.join(dir,'cert.pem'),'-inkey',path.join(dir,'key.pem'),'-out',out,...extra]);return fs.readFileSync(out)};
test('openssl-signed .p7m files',async t=>{
 if(!OPENSSL)return t.skip('openssl non disponibile');
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'radix-p7m-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 ossl(['req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=Test','-days','1','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')]);
 const expectedNumber=number(invoiceText);
 const check=(input,label)=>{const r=p7m.extract(input);assert.equal(r.xml,invoiceText,label);assert.equal(number(r.xml),expectedNumber,label);assert.equal(r.encoding,'utf-8')};
 const der=sign(invoicePath,path.join(dir,'a.xml.p7m'),['-outform','DER']);
 await t.test('DER definite length',()=>{assert.notEqual(der[1],0x80);check(new Uint8Array(der),'der')});
 await t.test('streamed BER (indefinite length, chunked OCTET STRING)',()=>{
  const ber=sign(invoicePath,path.join(dir,'s.xml.p7m'),['-outform','DER','-stream']);
  assert.equal(ber[1],0x80);check(ber,'stream');
 });
 await t.test('PEM text and base64 of the DER',()=>{
  const pem=sign(invoicePath,path.join(dir,'p.xml.p7m'),['-outform','PEM']).toString('utf8');
  assert.match(pem,/-----BEGIN (PKCS7|CMS)-----/);check(pem,'pem');
  check(der.toString('base64'),'b64 string');check(new Uint8Array(Buffer.from(der.toString('base64'))),'b64 bytes');
 });
 await t.test('double signature',()=>{
  const twice=sign(path.join(dir,'a.xml.p7m'),path.join(dir,'a.xml.p7m.p7m'),['-outform','DER']);
  check(twice,'double');
 });
 await t.test('truncated DER throws',()=>{
  assert.throws(()=>p7m.extract(der.subarray(0,Math.floor(der.length/2))),/troncato/);
 });
});
