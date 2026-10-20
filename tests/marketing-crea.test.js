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
 const seo=core.linkFor(core.card('seo'),'radix');
 assert.match(seo,/^\/agents\.html\?agent=seo-geo&project=radix&q=/);
 assert.match(fs.readFileSync(path.join(root,'agents-page.js'),'utf8'),/prefilled, never sent on its own/);
});

test('the page is first in the Marketing Agency menu',()=>{
 const shell=fs.readFileSync(path.join(root,'shell/radix-shell.js'),'utf8');
 assert.match(shell,/group: 'agency'[^\n]*\n\s*\{ id: 'agency-crea', text: 'Cosa vuoi fare', href: '\/agency\/crea\.html'/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.match(html,/data-shell-page="agency-crea"/);
 for(const s of ['/lib/image-studio.js','/lib/video-studio.js','/agency/crea-core.js','/agency/crea.js'])assert.ok(html.includes(s),s);
});

test('the Video card opens the Studio Video with the project avatar and the Video Producer memory',()=>{
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/videoStudio\(\{project,memoryScope,avatar:S\.savedAvatar\(current\.profile\),avatarUrl:'\/agency\/avatar\.html\?project='/);
 assert.match(js,/agentId:video\?'video-producer':'art-director'/);
});
