const fs=require('node:fs'),path=require('node:path');
function makeMusicFixture(output){
  const rate=48000,duration=16,count=rate*duration,buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  const chords=[[130.8128,164.8138,195.9977],[110,146.8324,174.6141],[146.8324,184.9972,220],[123.4708,155.5635,184.9972]];
  let seed=32615,previousNoise=0;
  for(let i=0;i<count;i++){
    const t=i/rate,beat=Math.floor(t/.4),phase=t% .4,hat=t% .2;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
    const kick=.42*Math.exp(-phase/.065)*Math.sin(2*Math.PI*(42*phase+65*.025*(1-Math.exp(-phase/.025))));
    const snare=beat%2?.13*noise*Math.exp(-phase/.045):0;
    const hihat=.035*(noise-previousNoise)*Math.exp(-hat/.018);previousNoise=noise;
    const chord=chords[Math.floor(t/2.4)%4],pad=chord.reduce((s,f)=>s+Math.sin(2*Math.PI*f*t)+.2*Math.sin(4*Math.PI*f*t),0)*.06;
    const arp=.17*Math.sin(2*Math.PI*chord[beat%3]*2*t)*Math.exp(-phase/.12);
    const envelope=Math.min(1,t/.06,(duration-t)/.15),value=Math.tanh((kick+snare+hihat+pad+arp)*1.2)*envelope;
    buffer.writeInt16LE(Math.round(value*29000),44+i*2);
  }
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,buffer);return output;
}
if(require.main===module)console.log(makeMusicFixture(path.resolve(__dirname,'../output/多模态节奏示例.wav')));
module.exports={makeMusicFixture};
