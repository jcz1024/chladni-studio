const {test}=require('node:test'),assert=require('node:assert/strict'),presets=require('../src/presets.js');
test('unsafe stored settings are bounded and cannot allocate excessive GPU particles',()=>{
 const s=presets.sanitize({density:1e10,sensitivity:-4,response:'1.3',glow:Infinity,musicStyle:'__proto__',shape:'unknown',autoLevel:'false',volume:100,modeIndex:1e8});
 assert.equal(s.density,96000);assert.equal(s.sensitivity,.3);assert.equal(s.response,1.3);assert.equal(s.glow,45);assert.equal(s.musicStyle,'geometry');assert.equal(s.shape,'square');assert.equal(s.autoLevel,true);assert.equal(s.modeIndex,63);assert.equal('volume' in s,false);
});
test('favorites recover safely from corrupt storage and retain independent visual choices',()=>{
 assert.deepEqual(presets.parseFavorites('{broken'),[]);assert.deepEqual(presets.parseFavorites('{}'),[]);
 const favorite={id:'fav-example',name:'我的流沙',settings:{...presets.builtins[2].settings,glow:52,autoLevel:false,autoRefill:false,automatic:false,modeIndex:17}};
 const list=presets.parseFavorites(JSON.stringify([favorite,favorite,null]));assert.equal(list.length,1);assert.deepEqual(list[0],favorite);
});
test('built-in presets use values that their controls can reproduce exactly',()=>{
 for(const p of presets.builtins)assert.deepEqual(presets.sanitize(p.settings),p.settings);
});
test('physical supply has its own persistent boolean and migrates older settings',()=>{
 assert.equal(presets.sanitize({autoRefill:false}).physicalRefill,true);
 const s=presets.sanitize({autoRefill:true,physicalRefill:false,tuning:'physical'});
 assert.equal(s.autoRefill,true);assert.equal(s.physicalRefill,false);
 const list=presets.parseFavorites(JSON.stringify([{id:'physical',name:'自然落砂',settings:s}]));
 assert.deepEqual(list[0].settings,s);assert.equal(presets.sanitize({physicalRefill:'false'}).physicalRefill,true);
});
