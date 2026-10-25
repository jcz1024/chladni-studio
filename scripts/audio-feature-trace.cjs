// Replay original fixture PCM through the real AudioWorklet processor in a VM.
// Gives both visualizers identical audio input and timing for visual comparisons.
const fs=require('node:fs'),vm=require('node:vm'),physics=require('../src/physics.js');
function featureTrace(file,tuning='music',shape='square'){
 const wav=fs.readFileSync(file),rate=wav.readUInt32LE(24),count=(wav.length-44)/2;
 let Processor,latest={powers:new Float32Array(64),rms:0,onsetId:0,onsetStrength:0};
 const scope={PlatePhysics:physics,sampleRate:rate,currentTime:0,Math,Float32Array,Float64Array,
  AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>latest=data};}},registerProcessor:(_name,type)=>Processor=type};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/resonator-worklet.js'),'utf8'),scope);
 const processor=new Processor();processor.port.onmessage({data:{type:'configure',epoch:1,tuning,decay:1,fundamental:35,modes:physics.createPlate(shape).groups.map(g=>({frequency:g.ratio*35,coupling:g.coupling}))}});
 const trace=[];let sample=0;
 for(let frame=0;frame<Math.floor(count/rate*60);frame++){
  const limit=Math.floor((frame+1)*rate/60);
  while(sample<limit){const block=new Float32Array(128);for(let i=0;i<128;i++,sample++)block[i]=sample<count?wav.readInt16LE(44+sample*2)/32768:0;scope.currentTime=sample/rate;processor.process([[block]],[[new Float32Array(128)]],{drive:new Float32Array([1.1])});}
  trace.push({modalPowers:Array.from(latest.powers),energy:Math.min(1,Math.pow(latest.rms*5.5*1.1,.7)),onsetId:latest.onsetId,onsetStrength:latest.onsetStrength*1.1});
 }
 return trace;
}
module.exports={featureTrace};
