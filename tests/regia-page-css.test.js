'use strict';
// The Regia panel (shell/radix-regia.css) must read the same on every page that loads it. Its rules start with
// .rx-regia:is(#rxRegia) and a reset rolls back every page rule that reaches it, so only two kinds of page rule can still
// change it: one with !important, and one whose selector holds an id (it beats the reset). This test reads the
// stylesheets of every page that loads the Regia and flags such rules when they style a generic element the panel uses
// (button, input, textarea, header, small, a, h1–h6…) through html or <body> only (the panel is a child of <body>), unless
// the selector leaves the panel out (it names rx-regia, as pm.css does with :not(:where(.rx-regia *)) and :not(.rx-regia-head)).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const SKIP_DIRS=new Set(['node_modules','.git','.claude','accounting','tests','labs','tools','api']);

// The elements inside the panel (lib/radix-regia.js builds it from these), and the headings.
const GENERIC=new Set(['section','header','div','strong','small','button','textarea','input','form','p','article','span','h4','ul','li','em','a','img','h1','h2','h3','h5','h6']);

function files(dir,ext,out){for(const e of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})){const rel=path.posix.join(dir,e.name);
 if(e.isDirectory()){if(!SKIP_DIRS.has(e.name))files(rel,ext,out);continue}if(ext.test(e.name))out.push(rel.replace(/^\.\//,''))}return out}
// The pages that load the Regia: through the shell (shell/radix-shell.js, for signed-in people) or directly. accounting/ apart.
function regiaPages(){return files('.',/\.html$/,[]).filter(f=>{const h=read(f);return /shell\/radix-shell\.js|lib\/radix-regia\.js/.test(h)&&!/data-shell-guide="off"/.test(h)}).sort()}
// A page's own CSS: its <link rel="stylesheet"> files (on this site) and its <style> blocks.
function sheetsOf(page){const html=read(page),dir=path.posix.dirname(page),sheets=[];
 for(const m of html.matchAll(/<link\b[^>]*>/gi)){const tag=m[0];if(!/rel=["']?stylesheet/i.test(tag))continue;const h=(tag.match(/href=["']([^"']+)["']/i)||[])[1];
  if(!h||/^(https?:)?\/\//.test(h))continue;const f=h.startsWith('/')?h.slice(1):path.posix.normalize(path.posix.join(dir,h));
  if(/^shell\/radix-(regia|guide|confirm)\.css$/.test(f))continue;if(fs.existsSync(path.join(ROOT,f)))sheets.push({name:f,css:read(f)})}
 let i=0;for(const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))sheets.push({name:page+' <style> '+(++i),css:m[1]});
 return sheets}
// Every rule as {selector, body}; @media, @supports, @layer and @container are opened, @keyframes and @font-face skipped.
function rules(css){const out=[],s=css.replace(/\/\*[\s\S]*?\*\//g,'');let i=0;
 (function block(end){while(i<s.length){const open=s.indexOf('{',i),close=s.indexOf('}',i);if(close!==-1&&(open===-1||close<open)){i=close+1;if(end)return;continue}if(open===-1)return;
  const pre=s.slice(i,open).trim();i=open+1;
  if(/^@(media|supports|layer|container|document)\b/.test(pre)){block(true);continue}
  if(/^@/.test(pre)){let d=1;while(i<s.length&&d){if(s[i]==='{')d++;else if(s[i]==='}')d--;i++}continue}
  const c=s.indexOf('}',i);out.push({selector:pre.replace(/\s+/g,' '),body:s.slice(i,c)});i=c+1}})(false);
 return out}
// The classes html and <body> can carry: from the pages' own tags and from the scripts that set them (the shell's
// classList calls, any documentElement/body.classList call). A page rule reaches the panel only through these two: the
// panel is a child of <body>, so an ancestor such as .card or #projects never holds it.
function rootClasses(){const set=new Set(),add=v=>String(v).split(/\s+/).filter(Boolean).forEach(c=>set.add(c));
 for(const f of files('.',/\.html$/,[]))for(const m of read(f).matchAll(/<(?:html|body)\b[^>]*\bclass="([^"]*)"/gi))add(m[1]);
 for(const f of files('.',/\.js$/,[])){const js=read(f);
  for(const m of js.matchAll(/(?:documentElement|body|html)\.classList\.(?:add|toggle)\(\s*'([a-z0-9_-]+)'/gi))add(m[1]);
  if(/^shell\//.test(f))for(const m of js.matchAll(/classList\.(?:add|toggle)\(\s*'([a-z0-9_-]+)'/gi))add(m[1])}
 return set}
const ROOT_CLASSES=rootClasses();
const strip=c=>c.replace(/:(not|where|is)\((?:[^()]|\([^()]*\))*\)/g,'');
// A selector's compounds, split on the combinators outside brackets.
function compounds(sel){const out=[];let cur='',depth=0;for(const ch of sel.trim()){if(ch==='('||ch==='[')depth++;else if(ch===')'||ch===']')depth--;
 if(depth===0&&/[\s>+~]/.test(ch)){if(cur)out.push(cur);cur='';continue}cur+=ch}if(cur)out.push(cur);return out}
// The panel element a compound can style: a generic tag (or *) with no class, id or attribute of its own, and no :has().
function genericTag(compound){if(/:has\(/.test(compound))return null;const bare=strip(compound).replace(/::?[a-z-]+(\([^)]*\))?/gi,'');
 if(/[.#[]/.test(bare))return null;const t=bare.trim().toLowerCase();return t==='*'||GENERIC.has(t)?t:null}
// An ancestor compound that html or <body> can match: html, body, :root, * or only their classes and attributes.
function rootLike(compound){const c=strip(compound).replace(/\[[^\]]*\]/g,'').replace(/::?[a-z-]+(\([^)]*\))?/gi,'');
 const tag=(c.match(/^[a-z][a-z0-9-]*/i)||[''])[0].toLowerCase();if(tag&&!['html','body'].includes(tag))return false;
 if(/#/.test(c))return !!tag; // body#app: an id on <body> itself
 return [...c.matchAll(/\.([a-z0-9_-]+)/gi)].every(m=>ROOT_CLASSES.has(m[1]))}
// The rules of one stylesheet that can still change the panel: they style a generic element, every ancestor in the
// selector can be html or <body>, and they carry !important or an id (the two things the panel's own rules cannot beat).
function clashes(css){const out=[];
 for(const r of rules(css)){const important=/!\s*important/i.test(r.body);
  for(const sel of r.selector.split(/,(?![^(]*\))/)){const s=sel.trim();if(!s||/rx-regia/.test(s))continue;
   const parts=compounds(s),tag=genericTag(parts[parts.length-1]);if(!tag||!parts.slice(0,-1).every(rootLike))continue;
   // body>header, html>body>p: a child of <body> (or of html) is at most the panel itself, a <section>.
   if(parts.length>1&&/(^|[^\s>+~])\s*>\s*[^\s>+~]+$/.test(s)&&/^(html|body)\b/i.test(strip(parts[parts.length-2]))&&!['section','*'].includes(tag))continue;
   if(tag==='*'&&!/(^|;)\s*(display|visibility|color|background(-color)?|opacity)\s*:/i.test(r.body))continue; // * { animation:none!important } and the like are harmless
   const id=/#/.test(strip(s));
   if(important||id)out.push(s+' { '+r.body.trim().slice(0,90)+' }'+(important?'  [!important]':'  [id]'))}}
 return out}

test('the clash finder: flags generic !important and id rules, skips the ones that leave the panel out',()=>{
 const f=css=>clashes(css).map(x=>x.split(' {')[0]);
 assert.ok(ROOT_CLASSES.has('rx-pm')&&ROOT_CLASSES.has('rx-shell')&&ROOT_CLASSES.has('rx-has-project'));
 assert.deepEqual(f('.rx-pm header{display:none!important}'),['.rx-pm header']);
 assert.deepEqual(f('.rx-pm header:not(.rx-topbar){display:none!important}'),['.rx-pm header:not(.rx-topbar)']);
 assert.deepEqual(f('.rx-pm header:not(.rx-topbar):not(.rx-regia-head){display:none!important}'),[]);
 assert.deepEqual(f('body#app button{background:transparent}'),['body#app button']);
 assert.deepEqual(f('html.rx-shell body.rx-pm button{border:0!important}'),['html.rx-shell body.rx-pm button']);
 assert.deepEqual(f('@media (max-width:600px){.rx-shell small{color:#fff!important}}'),['.rx-shell small']);
 assert.deepEqual(f('#projects .actions button{background:transparent!important}.card>small{color:#fff!important}'),[],'inside a page element: never the panel');
 assert.deepEqual(f('.rx-pm button:not(:where(.rx-regia *)){background:transparent!important}'),[]);
 assert.deepEqual(f('button{background:transparent}.rx-pm h4{color:#fff}header{display:none}'),[],'without !important or an id the panel wins');
 assert.deepEqual(f('.rx-pm .btn{color:red!important} button.primary{color:red!important} p:has(>a[data-x]){display:none!important}'),[],'a class of its own: not the panel’s');
 assert.deepEqual(f('body:has(>div.layout)>header{padding:8px!important}'),[],'a child of <body>: the panel is a <section>');
 assert.deepEqual(f('body>section{padding:0!important}'),['body>section']);
 assert.deepEqual(f('*{animation:none!important;transition:none!important}'),[]);
 assert.deepEqual(f('@keyframes k{from{opacity:0}}@font-face{font-family:x}h1{color:red}'),[]);
});

test('every page that loads the Regia: no page rule with !important or an id can restyle the panel',()=>{
 const pages=regiaPages();
 for(const p of ['control-center-v2.html','radix-sales.html','impostazioni.html','radix-pm-concept.html','project-editorial.html','agency/orbit.html','agency/crea.html','agency/projects.html','agency/index.html','agency/project-workspace.html','agency/memory.html'])
  assert.ok(pages.includes(p),p+' loads the Regia');
 assert.ok(!pages.some(p=>/^accounting\//.test(p)));
 const found=new Set();
 for(const p of pages)for(const sh of sheetsOf(p))for(const c of clashes(sh.css))found.add(sh.name+': '+c);
 assert.deepEqual([...found],[],'page rules that reach the Regia panel: leave it out with :not(:where(.rx-regia *)) (or :not(.rx-regia-head) for header)');
});

test('radix-regia.css: every panel rule starts with .rx-regia:is(#rxRegia), after a reset that rolls page rules back',()=>{
 const css=read('shell/radix-regia.css');
 assert.match(css,/:where\(\.rx-regia\):is\(#rxRegia\),:where\(\.rx-regia\):is\(#rxRegia\) \*\{all:revert;box-sizing:border-box\}/);
 for(const r of rules(css)){if(r.selector==='.rx-regia,.rx-regia-fab')continue; // the tokens
  for(const sel of r.selector.split(/,(?![^(]*\))/)){const s=sel.trim();if(/^html\.rx-regia-open/.test(s))continue;
   if(/rx-regia-fab|rx-guide-fab/.test(s)){assert.match(s,/:is\(#rxGuide\)/,'the Regia button: '+s);continue}
   assert.match(s,/^(:where\(\.rx-regia\)|\.rx-regia):is\(#rxRegia\)/,'panel rule without the id: '+s)}}
});

module.exports={regiaPages,sheetsOf,rules,clashes};
