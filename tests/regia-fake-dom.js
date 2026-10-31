'use strict';
// A tiny DOM for the Regia tests (Node has none and the repo has no jsdom): elements with classes, attributes, text,
// events by on<name>/addEventListener, and querySelector(All) for simple selectors (tag, .class, #id, compounds, lists).
class Text{constructor(t){this.nodeType=3;this.parentNode=null;this.data=String(t)}get textContent(){return this.data}set textContent(v){this.data=String(v)}remove(){if(this.parentNode)this.parentNode._drop(this)}}
class El{
 constructor(doc,tag){this.ownerDocument=doc;this.tagName=String(tag).toUpperCase();this.nodeType=1;this.childNodes=[];this.parentNode=null;this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.value='';this.scrollTop=0;this.scrollHeight=0;
  const self=this;this.classList={add:(...c)=>{const s=new Set(self._cls());c.forEach(x=>s.add(x));self.className=[...s].join(' ')},remove:(...c)=>{self.className=self._cls().filter(x=>!c.includes(x)).join(' ')},contains:c=>self._cls().includes(c),toggle:(c,on)=>{(on??!self.classList.contains(c))?self.classList.add(c):self.classList.remove(c)}};this.className=''}
 _cls(){return String(this.className||'').split(/\s+/).filter(Boolean)}
 get children(){return this.childNodes.filter(n=>n.nodeType===1)}
 get id(){return this.attributes.id||''}set id(v){this.attributes.id=String(v)}
 get textContent(){return this.childNodes.map(n=>n.textContent).join('')}
 set textContent(v){this.childNodes.forEach(n=>n.parentNode=null);this.childNodes=v===''||v==null?[]:[this._adopt(new Text(v))]}
 _adopt(n){if(n.parentNode)n.parentNode._drop(n);n.parentNode=this;return n}
 _drop(n){this.childNodes=this.childNodes.filter(x=>x!==n);n.parentNode=null}
 append(...ns){for(const n of ns)this.childNodes.push(this._adopt(typeof n==='string'?new Text(n):n))}
 prepend(...ns){this.childNodes.unshift(...ns.map(n=>this._adopt(n)))}
 replaceChildren(...ns){this.childNodes.forEach(n=>n.parentNode=null);this.childNodes=[];this.append(...ns)}
 insertBefore(n,ref){this._adopt(n);const i=this.childNodes.indexOf(ref);this.childNodes.splice(i<0?this.childNodes.length:i,0,n)}
 after(n){const p=this.parentNode;p._adopt(n);p.childNodes.splice(p.childNodes.indexOf(this)+1,0,n)}
 remove(){if(this.parentNode)this.parentNode._drop(this)}
 setAttribute(k,v){if(k==='id')this.id=v;else if(k==='class')this.className=String(v);else this.attributes[k]=String(v)}
 getAttribute(k){return k==='class'?this.className:Object.prototype.hasOwnProperty.call(this.attributes,k)?this.attributes[k]:null}
 hasAttribute(k){return this.getAttribute(k)!=null}
 removeAttribute(k){delete this.attributes[k]}
 addEventListener(n,f){(this.listeners[n]??=[]).push(f)}
 dispatch(n,e){const ev=Object.assign({type:n,preventDefault(){}},e);for(const f of this.listeners[n]||[])f(ev);const h=this['on'+n];return h?h.call(this,ev):undefined}
 click(){if(!this.disabled)return this.dispatch('click')}
 focus(){this.ownerDocument.activeElement=this}
 _matches(sel){return sel.split(',').some(one=>{const s=one.trim(),m=/^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(s);if(!m)throw Error('fake dom: unsupported selector '+s);
  if(m[1]&&m[1].toUpperCase()!==this.tagName)return false;return [...m[2].matchAll(/([.#])([\w-]+)/g)].every(([,k,v])=>k==='.'?this.classList.contains(v):this.id===v)})}
 querySelectorAll(sel){const out=[];const walk=e=>{for(const c of e.children){if(c._matches(sel))out.push(c);walk(c)}};walk(this);return out}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
}
function makeDoc({shellPage='',topbar=false}={}){
 const doc={listeners:{},activeElement:null,
  createElement:t=>new El(doc,t),createTextNode:t=>new Text(t),
  addEventListener(n,f){(this.listeners[n]??=[]).push(f)},dispatch(n,e){for(const f of this.listeners[n]||[])f(Object.assign({type:n,preventDefault(){}},e))},
  getElementById:id=>doc.documentElement.querySelector('#'+id),querySelector:s=>doc.documentElement.querySelector(s),querySelectorAll:s=>doc.documentElement.querySelectorAll(s)};
 doc.documentElement=new El(doc,'html');doc.body=new El(doc,'body');doc.documentElement.append(doc.body);doc.body.dataset.shellPage=shellPage;
 if(topbar){const h=new El(doc,'header');h.className='rx-topbar';const u=new El(doc,'div');u.className='rx-user';h.append(u);doc.body.append(h)}
 return doc}
const html=(doc,tag,cls,text,id)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;if(id)e.id=id;return e};
module.exports={makeDoc,El,Text,html};
