'use strict';
// A minimal DOMParser for the tests that read .xlsx with lib/lead-xlsx-parser.js (Node has none): elements,
// attributes, text and getElementsByTagNameNS('*', local). Only for well-formed XML written by RADIX.
const ent=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&amp;/g,'&');
class El{constructor(name,attrs){this.nodeName=name;this.localName=name.includes(':')?name.split(':')[1]:name;this.attrs=attrs;this.children=[];this.text=''}
 getAttribute(n){return Object.prototype.hasOwnProperty.call(this.attrs,n)?this.attrs[n]:null}
 getAttributeNS(ns,n){const k=Object.keys(this.attrs).find(a=>a.endsWith(':'+n));return k?this.attrs[k]:null}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('')}
 getElementsByTagNameNS(_,local){const out=[];const walk=e=>{for(const c of e.children){if(c.localName===local)out.push(c);walk(c)}};walk(this);return out}}
global.DOMParser=class{parseFromString(s){const doc=new El('#document',{}),stack=[doc];const re=/<\?[^>]*\?>|<!--[\s\S]*?-->|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;let m;
 while((m=re.exec(s))){if(m[5]!=null){const top=stack[stack.length-1];if(top!==doc)top.text+=ent(m[5]);continue}if(!m[2])continue;
  if(m[1]){stack.pop();continue}const a={};for(const x of m[3].matchAll(/([\w:.-]+)="([^"]*)"/g))a[x[1]]=ent(x[2]);const el=new El(m[2],a);stack[stack.length-1].children.push(el);if(!m[4])stack.push(el)}
 doc.documentElement=doc.children[0];return doc}};
