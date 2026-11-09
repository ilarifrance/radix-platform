'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const steps=require('../agency/new-project-steps.js');

test('three directions: prompt carries the project and the materials, reply keeps only complete ideas',()=>{
 const p=steps.ideasPrompt({name:'Lancio Aura',industry:'Cosmetica'},'[Documento brief.pdf]\nCrema solare bio');
 assert.match(p,/TRE direzioni/);assert.match(p,/Lancio Aura/);assert.match(p,/Cosmetica/);assert.match(p,/Crema solare bio/);assert.match(p,/\[da definire\]/);
 const reply='Ecco: {"ideas":[{"title":"Lancio online","goal":"Vendere online","audience":"Donne 30-45","market":"Italia","why":"Canale diretto"},{"title":"Vuota","goal":"","audience":"x"},{"goal":"B2B","audience":"Farmacie"},{"goal":"3","audience":"3"},{"goal":"4","audience":"4"}]}';
 const ideas=steps.parseIdeas(reply);
 assert.equal(ideas.length,3);assert.deepEqual(ideas[0],{title:'Lancio online',goal:'Vendere online',audience:'Donne 30-45',market:'Italia',why:'Canale diretto'});assert.equal(ideas[1].title,'');
 assert.deepEqual(steps.parseIdeas('niente json'),[]);assert.deepEqual(steps.parseIdeas('{rotto'),[]);
});

test('summary flags what is missing and names services in Italian',()=>{
 const rows=steps.summary({name:'Aura',industry:'',goal:'Vendere',audience:'',channels:['social','seo-geo'],platforms:['Instagram'],facts:''},'2 materiali');
 assert.deepEqual(rows.map(r=>r.missing),[false,true,false,false]);
 assert.equal(rows[0].extra,'2 materiali di riferimento');assert.equal(rows[2].value,'PED e Social, SEO & GEO');assert.match(rows[3].value,/vuota/);
 assert.equal(steps.summary({channels:[],platforms:[]},'')[2].missing,true);
 assert.deepEqual(Object.keys(steps.REQUIRED),['1','2']);
});
