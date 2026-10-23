'use strict';
// lib/qr-lite.js: the QR encoder of the «Menu e listino» studio. Known vectors of the standard (Reed-Solomon, format and
// version information), a whole symbol checked module by module against an independent encoder, and an independent
// decoder written here (format bits, unmasking, zigzag, de-interleaving, Reed-Solomon syndromes, byte mode) that must read
// back every text. Then the PNG (chunks, CRCs, pixels) and the SVG.
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('zlib');
const Q=require('../lib/qr-lite.js');

test('Reed-Solomon: the known vector of «HELLO WORLD» 1-M (16 data codewords → 10 EC codewords)',()=>{
 assert.deepEqual(Q.rsEncode([32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17],10),[196,35,39,119,235,215,231,226,93,23]);
});

test('format and version information: the BCH codes of the standard tables',()=>{
 const f=(l,m)=>Q.formatBits(l,m).toString(2).padStart(15,'0');
 assert.deepEqual([0,4,7].map(m=>f('L',m)),['111011111000100','110011000101111','110100101110110']);
 assert.deepEqual([0,4,7].map(m=>f('M',m)),['101010000010010','100010111111001','100101010100000']);
 assert.deepEqual([0,4,7].map(m=>f('Q',m)),['011010101011111','010010010110100','010101111101101']);
 assert.deepEqual([0,4,7].map(m=>f('H',m)),['001011010001001','000011101100010','000100000111011']);
 assert.equal(Q.versionBits(7).toString(2).padStart(18,'0'),'000111110010010100');
 // capacity tables: total codewords per version (data + EC) match the standard
 const total=[26,44,70,100,134,172,196,242,292,346];
 for(const l of ['L','M','Q','H'])for(let v=1;v<=10;v++){const [ec,b1,d1,b2,d2]=Q.EC[l][v-1];assert.equal(b1*(d1+ec)+b2*(d2+ec),total[v-1],l+v)}
});

test('a whole symbol: «HELLO WORLD» in byte mode, level M, mask 4, module by module as an independent encoder makes it',()=>{
 const want=['111111101100101111111','100000100001001000001','101110100101001011101','101110101001001011101','101110101110101011101','100000101001001000001','111111101010101111111','000000001001100000000','100010111111011111001','000100001011100001111','001111110011011010010','111110001100010000000','111110101010101100110','000000001010111101011','111111101110101011010','100000100101110110011','101110101101011000110','101110100100100011011','101110100111000111000','100000100001010000000','111111101111111110101'];
 const q=Q.encode('HELLO WORLD',{level:'M'});assert.equal(q.version,1);assert.equal(q.mask,4,'the lowest penalty');
 assert.deepEqual(q.modules.map(r=>r.map(b=>b?'1':'0').join('')),want);
});

// ---- an independent decoder ----
const EXP=[],LOG=[];{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11D}}
const gmul=(a,b)=>a&&b?EXP[(LOG[a]+LOG[b])%255]:0;
const syndromesZero=(cw,ec)=>{for(let i=0;i<ec;i++){let s=0;for(const c of cw)s=gmul(s,EXP[i])^c;if(s)return false}return true};
const ALIGN={1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
const MASK=[(r,c)=>(r+c)%2===0,r=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>r*c%2+r*c%3===0,(r,c)=>(r*c%2+r*c%3)%2===0,(r,c)=>((r+c)%2+r*c%3)%2===0];
function decode(M){const n=M.length,v=(n-17)/4;assert.ok(Number.isInteger(v)&&v>=1,'size');const bit=(r,c)=>M[r][c]?1:0;
 // format information, first copy, read around the top-left finder (bit 14 first)
 // bit i of the 15: rows 0..5 of column 8, then (7,8), (8,8), (8,7), then row 8 from column 5 down to 0
 const pos=[];for(let i=0;i<15;i++)pos.push(i<=5?[i,8]:i===6?[7,8]:i===7?[8,8]:i===8?[8,7]:[8,14-i]);
 let raw=0;pos.forEach(([r,c],i)=>{raw|=bit(r,c)<<i});
 // the second copy must agree: row 8 from the right edge, then column 8 near the bottom
 const pos2=[];for(let i=0;i<15;i++)pos2.push(i<8?[8,n-1-i]:[n-15+i,8]);
 let raw2=0;pos2.forEach(([r,c],i)=>{raw2|=bit(r,c)<<i});assert.equal(raw,raw2,'both format copies');
 const fmt=raw^0x5412,level={1:'L',0:'M',3:'Q',2:'H'}[fmt>>13],mask=fmt>>10&7;
 // check the BCH remainder of the format bits
 let rem=fmt>>10;for(let i=0;i<10;i++)rem=rem<<1^(rem>>9)*0x537;assert.equal((fmt>>10)<<10|rem,fmt,'format BCH');
 if(v>=7){let vb=0;for(let i=17;i>=0;i--)vb=vb<<1|bit(Math.floor(i/3),n-11+i%3);assert.equal(vb>>12,v,'version information')}
 // function modules
 const F=Array.from({length:n},()=>new Array(n).fill(false)),mark=(r,c)=>{if(r>=0&&c>=0&&r<n&&c<n)F[r][c]=true};
 for(const [r0,c0] of [[0,0],[0,n-7],[n-7,0]])for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++)mark(r0+r,c0+c);
 const a=ALIGN[v];for(const r of a)for(const c of a){if(F[r][c])continue;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)mark(r+dr,c+dc)}
 for(let i=0;i<n;i++){mark(6,i);mark(i,6)}
 for(let i=0;i<9;i++){mark(8,i);mark(i,8)}for(let i=0;i<8;i++){mark(8,n-1-i);mark(n-1-i,8)}
 if(v>=7)for(let i=0;i<6;i++)for(let j=0;j<3;j++){mark(i,n-11+j);mark(n-11+j,i)}
 // zigzag read of the data bits, unmasked
 const bits=[];for(let right=n-1;right>=1;right-=2){if(right===6)right=5;const up=((right+1)&2)===0;
  for(let k=0;k<n;k++){const r=up?n-1-k:k;for(const c of [right,right-1])if(!F[r][c])bits.push(bit(r,c)^(MASK[mask](r,c)?1:0))}}
 const cw=[];for(let i=0;i+8<=bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];cw.push(b)}
 const [ec,b1,d1,b2,d2]=Q.EC[level][v-1],blocks=[...Array(b1).fill(d1),...Array(b2).fill(d2)].map(len=>({len,data:[],ec:[]}));let k=0;
 for(let i=0;i<Math.max(d1,d2);i++)for(const b of blocks)if(i<b.len)b.data.push(cw[k++]);for(let i=0;i<ec;i++)for(const b of blocks)b.ec.push(cw[k++]);
 for(const b of blocks)assert.ok(syndromesZero(b.data.concat(b.ec),ec),'Reed-Solomon syndromes are zero');
 const data=blocks.flatMap(b=>b.data),db=[];for(const x of data)for(let j=7;j>=0;j--)db.push(x>>j&1);
 const read=(i,len)=>{let x=0;for(let j=0;j<len;j++)x=x<<1|db[i+j];return x};assert.equal(read(0,4),4,'byte mode');
 const cc=v<10?8:16,count=read(4,cc),bytes=[];for(let i=0;i<count;i++)bytes.push(read(4+cc+8*i,8));
 return {text:new TextDecoder().decode(new Uint8Array(bytes)),version:v,level,mask}}

test('decode-check: an independent decoder reads back every text, version and level, masks included',()=>{
 const texts=['https://www.fornoaurora.it/menu','HELLO WORLD','https://fornoaurora.it/m','Caffè è più buono ☕ · menu','https://example.com/a/very/long/path/menu-del-giorno?tavolo=12&lingua=it','x'.repeat(150),'y'.repeat(200)];
 let big=0;for(const t of texts)for(const level of ['L','M','Q','H']){let q;try{q=Q.encode(t,{level})}catch(e){assert.match(e.message,/troppo lungo/);continue}
  const d=decode(q.modules);assert.equal(d.text,t,t.slice(0,20)+' '+level);assert.equal(d.level,level);assert.equal(d.version,q.version);assert.equal(d.mask,q.mask);if(q.version>=7)big++}
 assert.ok(big>=3,'versions with version information are covered');
 for(let m=0;m<8;m++)assert.equal(decode(Q.encode('https://www.fornoaurora.it/menu',{level:'M',mask:m}).modules).mask,m,'mask '+m);
 // the smallest version that fits is used; too long is refused with a clear message
 assert.equal(Q.encode('https://www.fornoaurora.it/menu').version,3);
 assert.throws(()=>Q.encode('z'.repeat(Q.capacity('M')+1),{level:'M'}),/troppo lungo per il QR/);
 assert.equal(decode(Q.encode('z'.repeat(Q.capacity('M')),{level:'M'}).modules).text.length,Q.capacity('M'));
});

test('PNG: 1-bit grayscale, valid chunks and CRCs, quiet zone of 4 modules, dark modules black',()=>{
 const q=Q.encode('https://www.fornoaurora.it/menu'),png=Q.toPng(q,{scale:5}),b=Buffer.from(png);
 assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const chunks=[];for(let o=8;o<b.length;){const len=b.readUInt32BE(o),type=b.toString('latin1',o+4,o+8),data=b.subarray(o+8,o+8+len),crc=b.readUInt32BE(o+8+len);assert.equal(Q.crc32(b,o+4,o+8+len),crc,type+' CRC');chunks.push({type,data});o+=12+len}
 assert.deepEqual(chunks.map(c=>c.type),['IHDR','IDAT','IEND']);
 const W=(q.size+8)*5,ih=chunks[0].data;assert.equal(ih.readUInt32BE(0),W);assert.equal(ih.readUInt32BE(4),W);assert.equal(ih[8],1,'1 bit');assert.equal(ih[9],0,'grayscale');
 const raw=zlib.inflateSync(chunks[1].data),row=Math.ceil(W/8)+1;assert.equal(raw.length,row*W);
 const px=(x,y)=>(raw[y*row+1+(x>>3)]>>(7-(x&7)))&1;// 1 = white
 assert.equal(px(0,0),1,'quiet zone');assert.equal(px(20,20),0,'top-left finder corner is dark');assert.equal(px(19,19),1,'just outside: quiet zone');
 for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)assert.equal(px((x+4)*5+2,(y+4)*5+2),q.modules[y][x]?0:1);
 assert.deepEqual([...Q.toPng(q,{scale:5})],[...png],'same input, same bytes');
});

test('SVG: the symbol with its quiet zone, crisp edges, one path, no external reference',()=>{
 const q=Q.encode('https://www.fornoaurora.it/menu'),svg=Q.toSvg(q,{title:'QR del menu'}),t=q.size+8;
 assert.match(svg,new RegExp('viewBox="0 0 '+t+' '+t+'"'));assert.match(svg,/shape-rendering="crispEdges"/);assert.equal((svg.match(/<path /g)||[]).length,1);assert.match(svg,/<title>QR del menu<\/title>/);
 assert.ok(!/href=|url\(/.test(svg));
 const dark=Q.rects(q).reduce((a,r)=>a+r[2]*r[3],0);assert.equal(dark,q.modules.flat().filter(Boolean).length,'the rectangles cover exactly the dark modules');
});
