const {test}=require('node:test'),assert=require('node:assert/strict'),tools=require('../src/experiment.js'),physics=require('../src/physics.js'),presets=require('../src/presets.js');
test('sweep frequencies have logarithmic timing, reverse smoothly and stop at the endpoint',()=>{
 const s={mode:'sweep',start:40,end:640,duration:20,loop:true};
 for(const [t,f]of [[0,40],[10,160],[20,640],[30,160],[40,40],[50,160]])assert.ok(Math.abs(tools.frequencyAt(s,t)-f)<1e-9);
 assert.equal(tools.frequencyAt({...s,loop:false},80),640);assert.equal(tools.frequencyAt({...s,start:640,end:40,loop:false},10),160);
 const bad=tools.sanitize({frequency:Infinity,start:-20,end:1e20,duration:0,level:Infinity,loop:'false'});assert.deepEqual(bad,{...tools.defaults,mode:'tone',start:20,end:4000,duration:5});
});
test('centre point drive suppresses uncoupled square and disk symmetries without shifting frequencies',()=>{
 for(const shape of ['square','circle']){const original=physics.createPlate(shape),center=physics.createPlate(shape,[0,0],false);
  assert.deepEqual(center.groups.map(g=>g.ratio),original.groups.map(g=>g.ratio));
  assert.ok(center.groups[0].coupling<1e-12);assert.ok(original.groups[0].coupling>.001);
  if(shape==='circle')for(const g of center.groups)if(g.m>0)assert.ok(g.coupling<1e-12);
 }
});
test('moving a disk drive rotates the degenerate mode pattern while preserving its radial coupling',()=>{
 const a=physics.createPlate('circle',[.4,0],false),b=physics.createPlate('circle',[0,.4],false);
 for(let i=0;i<64;i++){assert.ok(Math.abs(a.groups[i].coupling-b.groups[i].coupling)<1e-12);assert.ok(Math.abs(a.groups[i].value(.23,-.31)-b.groups[i].value(.31,.23))<1e-8);}
});
test('experiment visual settings remain bounded and preserve independently in favorites',()=>{
 const s=presets.sanitize({shape:'circle',driveX:99,driveY:99,fieldMap:true,fieldOpacity:1e9,refillSpeed:9});
 assert.ok(Math.hypot(s.driveX,s.driveY)<=.96);assert.equal(s.fieldOpacity,60);assert.equal(s.refillSpeed,2);
 assert.deepEqual(presets.parseFavorites(JSON.stringify([{id:'lab',name:'实验',settings:s}]))[0].settings,s);
 assert.deepEqual(physics.normalizeDrive('square',[NaN,Infinity]),[.18,.11]);
});
