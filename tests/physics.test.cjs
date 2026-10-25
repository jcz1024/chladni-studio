const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const physics=require('../src/physics.js');

test('free square frequencies agree with an independent published Ritz benchmark',()=>{
  const plate=physics.createPlate('square');
  assert.equal(plate.groups.length,64);assert.equal(plate.modalCount,86);
  // C.Y. Wang, IJAV 20(2), 2015, Table 2; half-width/radius convention.
  const reference=[3.3671,4.8990,6.0676,8.7004];
  reference.forEach((omega,i)=>assert.ok(Math.abs(plate.groups[i].omega-omega)<.00025));
  for(const g of plate.groups)assert.ok([-.77,-.24,.33,.82].some(t=>Math.abs(g.value(1,t))>.1),'rim is not constrained to zero');
});
test('free disk eigenvalues agree with published exact frequencies and free moment/shear',()=>{
  for(const [m,expected]of[[2,5.3583],[0,9.0031],[3,12.439],[1,20.475]]){
    const root=physics.diskRoots(m,1)[0];assert.ok(Math.abs(root*root-expected)<.0005);assert.ok(Math.abs(physics.characteristic(m,root))<1e-10);
    const t=physics.freeTerms(m,root),c=-t.mj/t.mi;
    assert.ok(Math.abs(t.mj+c*t.mi)<1e-8);assert.ok(Math.abs(t.vj+c*t.vi)<1e-7);
  }
  const plate=physics.createPlate('circle');assert.equal(plate.groups.length,64);assert.equal(plate.modalCount,122);
  for(const g of plate.groups){assert.ok(Number.isFinite(g.value(.32,.27)));assert.ok(Math.max(...[0,.3,.7,1.1].map(t=>Math.abs(g.value(Math.cos(t),Math.sin(t)))))>.1);}
});
test('free square spectrum converges with polynomial degree without rigid body modes',()=>{
  const coarse=require('../scripts/free-square-solver.cjs').solve(20),fine=require('../src/plate-data.js');
  assert.ok(Math.max(...coarse.groups.map((g,i)=>Math.abs(g.omega/fine.groups[i].omega-1)))<.0001);
  assert.ok(fine.groups[0].omega>3); // the three zero-frequency rigid modes were removed
});
function harness(tuning='music',decay=1,autoLevel=false){
  let Processor;const messages=[];
  const context={PlatePhysics:physics,sampleRate:48000,currentTime:0,Float64Array,Float32Array,Math,AudioWorkletProcessor:class{constructor(){this.port={postMessage:message=>messages.push(message)};}},registerProcessor:(_name,type)=>Processor=type};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/resonator-worklet.js'),'utf8'),context);
  const processor=new Processor();processor.port.onmessage({data:{type:'configure',epoch:1,tuning,decay,fundamental:70,modes:physics.createPlate().groups.map(g=>({frequency:g.ratio*70,coupling:g.coupling}))}});
  let sample=0;
  return {processor,messages,run(seconds,signal){for(let block=0;block<Math.ceil(seconds*48000/128);block++){const data=Float32Array.from({length:128},()=>signal(sample++/48000));context.currentTime=sample/48000;processor.process([[data]],[[new Float32Array(128)]],{autoLevel:new Float32Array([autoLevel?1:0])});}return messages.at(-1);}};
}
test('actual audio processor distinguishes simultaneous resonances without a dominant-frequency selector',()=>{
  const modes=physics.createPlate().groups,f1=modes[2].ratio*70,f2=modes[5].ratio*70;
  const h=harness(),s=h.run(.35,t=>.14*Math.sin(2*Math.PI*f1*t)+.14*Math.sin(2*Math.PI*f2*t));
  assert.ok(s.powers[2]>.0001&&s.powers[5]>.0001);assert.ok(s.rms>.1);assert.ok(s.onsetId>0);
  for(const p of s.powers)assert.ok(Number.isFinite(p)&&p>=0);
});
test('physical tuning has sharper resonance selection than music tuning',()=>{
  function energy(tuning,f){return harness(tuning).run(.8,t=>.1*Math.sin(2*Math.PI*f*t)).powers[1];}
  const frequency=physics.createPlate().groups[1].ratio*70;
  const physicalContrast=energy('physical',frequency)/energy('physical',frequency*1.12),musicContrast=energy('music',frequency)/energy('music',frequency*1.12);
  assert.ok(physicalContrast>musicContrast*5,`${physicalContrast} vs ${musicContrast}`);
});
test('audio-rate integration remains stable and rings down after excitation ends',()=>{
  const frequency=physics.createPlate().groups[1].ratio*70;
  const h=harness('physical',2),signal=h.run(.5,t=>.22*Math.sin(2*Math.PI*frequency*t));
  const tail=h.run(2,()=>0);assert.ok(tail.powers[1]<signal.powers[1]*.001);
  for(const p of tail.powers)assert.ok(Number.isFinite(p)&&p>=0);
});
test('absolute modal power preserves amplitude, not just normalized mode ratios',()=>{
  const f=physics.createPlate().groups[2].ratio*70;
  const run=gain=>harness('physical').run(.6,t=>gain*Math.sin(2*Math.PI*f*t)).powers[2];
  const ratio=run(.1)/run(.001);assert.ok(Math.abs(ratio/10000-1)<.001);
});
test('off-resonant acceleration follows the forcing frequency rather than the natural frequency',()=>{
  const mode=physics.createPlate().groups[2],natural=mode.ratio*70,forcing=natural*1.4,A=.07;
  const actual=harness('physical').run(1,t=>A*Math.sin(2*Math.PI*forcing*t)).powers[2];
  const w=2*Math.PI*forcing,w0=2*Math.PI*natural,delta=w0/(2*65);
  const expected=(A*mode.coupling*w*w)**2/(2*((w0*w0-w*w)**2+(2*delta*w)**2));
  assert.ok(Math.abs(actual/expected-1)<.08,`${actual} vs ${expected}`);
});
test('automatic music sensitivity balances quiet and loud PCM without changing raw level telemetry',()=>{
  const run=amplitude=>harness('music',1,true).run(2,t=>amplitude*Math.sin(2*Math.PI*220*t));
  const quiet=run(.02),loud=run(.4);
  assert.ok(quiet.autoGain>4&&loud.autoGain<.5);assert.ok(quiet.rms<loud.rms/15);
  assert.ok(quiet.visualRms>.06&&quiet.visualRms<.1);assert.ok(loud.visualRms>.06&&loud.visualRms<.1);
});
test('automatic sensitivity limits abrupt loud transitions and gates near-silent noise',()=>{
  const h=harness('music',1,true);h.run(1.5,t=>.02*Math.sin(2*Math.PI*220*t));const start=h.messages.length;
  h.run(.4,t=>.8*Math.sin(2*Math.PI*220*t));assert.ok(Math.max(...h.messages.slice(start).map(m=>m.visualRms))<.181);
  const noise=h.run(1,t=>.0002*Math.sin(2*Math.PI*220*t));assert.equal(noise.visualRms,0);
  const silence=h.run(1,()=>0);assert.equal(silence.rms,0);assert.equal(silence.visualRms,0);assert.ok(Math.max(...silence.powers)<1e-8);
});
test('physical tuning ignores automatic music normalization and preserves original force response',()=>{
  const signal=t=>.05*Math.sin(2*Math.PI*175*t),manual=harness('physical').run(.5,signal),automatic=harness('physical',1,true).run(.5,signal);
  assert.deepEqual(Array.from(automatic.powers),Array.from(manual.powers));assert.equal(automatic.autoGain,1);assert.equal(automatic.automatic,false);
});
