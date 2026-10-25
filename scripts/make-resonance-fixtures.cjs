// Original sustained PCM tones at the default 35 Hz plate frequency scale.
const fs=require('node:fs'),path=require('node:path'),physics=require('../src/physics.js');
function makeResonanceFixtures(directory=path.join(__dirname,'../output')){
 fs.mkdirSync(directory,{recursive:true});const results=[];
 for(const [shape,index,label]of[['square',2,'方板'],['circle',1,'圆板']]){
  const frequency=physics.createPlate(shape).groups[index].ratio*35,rate=48000,seconds=16,samples=rate*seconds,buffer=Buffer.alloc(44+samples*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++){const t=i/rate,envelope=Math.max(0,Math.min(1,t/.2,(seconds-t)/.2));buffer.writeInt16LE(Math.round(.12*32767*envelope*Math.sin(2*Math.PI*frequency*t)),44+i*2);}
  const name=`${label}单频-${frequency.toFixed(2)}Hz-基频35.wav`,file=path.join(directory,name);fs.writeFileSync(file,buffer);results.push({file,name,shape,frequency,fundamental:35,seconds});
 }
 return results;
}
if(require.main===module)console.log(JSON.stringify(makeResonanceFixtures(),null,2));
module.exports={makeResonanceFixtures};
