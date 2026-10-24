const test=require('node:test');const assert=require('node:assert');
const core=require('../agency/crea-core.js');
test('search: «spot» finds the Reel studio and «dominio» finds Nome e slogan',()=>{
 assert.equal(core.matchServices('spot')[0].card.id,'reel');
 assert.equal(core.matchServices('dominio')[0].card.id,'naming');
 assert.equal(core.matchServices('domini liberi')[0].card.id,'naming');
});
