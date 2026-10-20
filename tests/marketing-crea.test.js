'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const core=require('../agency/crea-core.js');
const root=path.join(__dirname,'..');

test('the panel has the eight services of the approved proposal',()=>{
 assert.deepEqual(core.CARDS.map(c=>c.title),['Strategia','Social e post','Post grafici','Immagini','Avatar','Video','Sito web','SEO e GEO']);
 for(const c of core.CARDS)assert.ok(c.cost&&c.action&&c.line,c.id);
});

test('links point to pages that exist and carry the project',()=>{
 for(const c of core.CARDS){const l=core.linkFor(c,'radix');if(!l)continue;const file=l.split(/[?#]/)[0];assert.ok(fs.existsSync(path.join(root,file)),file);}
 assert.equal(core.linkFor(core.card('social'),'doc-capital'),'/project-editorial.html?project=doc-capital#ped');
 assert.equal(core.linkFor(core.card('avatar'),'radix'),'/agency/avatar.html?project=radix');
 assert.equal(core.linkFor(core.card('images'),'radix'),null,'images open inline');
 assert.equal(core.linkFor(core.card('video'),'radix'),null,'video opens inline');
 assert.equal(core.card('video').inline,'video');assert.equal(core.card('video').hint,undefined,'no «avatar first» hint: the studio says it');
});

test('without a project only strategy leads somewhere (new project); agents never auto-send',()=>{
 assert.equal(core.linkFor(core.card('strategy'),''),'/agency/new-project.html');
 assert.equal(core.linkFor(core.card('social'),''),null);
 assert.equal(core.linkFor(core.card('social'),'bad id!'),null);
 assert.deepEqual(core.CARDS.filter(c=>c.state==='agent').map(c=>c.id),['site'],'only Sito web still goes to an agent');
 const site=core.linkFor(core.card('site'),'radix');
 assert.match(site,/^\/agents\.html\?agent=web-developer&project=radix&q=/);
 assert.match(fs.readFileSync(path.join(root,'agents-page.js'),'utf8'),/prefilled, never sent on its own/);
});

test('the page is first in the Marketing Agency menu',()=>{
 const shell=fs.readFileSync(path.join(root,'shell/radix-shell.js'),'utf8');
 assert.match(shell,/group: 'agency'[^\n]*\n\s*\{ id: 'agency-crea', text: 'Cosa vuoi fare', href: '\/agency\/crea\.html'/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.match(html,/data-shell-page="agency-crea"/);
 for(const s of ['/lib/image-studio.js','/lib/video-studio.js','/lib/seo-studio.js','/agency/crea-core.js','/agency/crea.js'])assert.ok(html.includes(s),s);
});

test('the Video card opens the Studio Video with the project avatar and the Video Producer memory',()=>{
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/videoStudio\(\{project,memoryScope,avatar:S\.savedAvatar\(current\.profile\),avatarUrl:'\/agency\/avatar\.html\?project='/);
 assert.match(js,/video:\{global:'RadixVideoStudio'[^}]*agent:'video-producer'\}/);
 assert.match(js,/photo:\{global:'RadixImageStudio'[^}]*agent:'art-director'\}/);
 assert.match(js,/agentId:st\.agent\}/);
});

test('the SEO e GEO card opens the Studio SEO inline with the specialist memory and the project to save in',()=>{
 const seo=core.card('seo');
 assert.equal(seo.inline,'seo');assert.equal(seo.state,'ready');assert.equal(seo.agent,undefined,'no agent link any more');
 assert.equal(core.linkFor(seo,'radix'),null);
 assert.match(seo.line,/3 strategie/);assert.match(seo.cost,/Una chiamata AI[^.]*con conferma/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/seo:\{global:'RadixSeoStudio'[^}]*agent:'seo-geo'\}/);
 assert.match(js,/S\.seoStudio\(\{project,memoryScope,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent=seo-geo&project='\+pid\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.match(html,/<p class="cr-note">Sito web ha ancora il flusso guidato in costruzione/);assert.ok(!/SEO\/GEO hanno/.test(html));
 assert.ok(html.indexOf('/lib/seo-studio.js')<html.indexOf('/agency/crea.js'),'the studio loads before the page script');
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.cr-panel \.seo-studio \.ss-grid/);
});
