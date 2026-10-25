class PlateResonator extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'drive',defaultValue:1,minValue:.1,maxValue:4,automationRate:'k-rate'},{name:'autoLevel',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}];}
  constructor(){
    super();this.size=64;this.y1=new Float64Array(64);this.y2=new Float64Array(64);this.power=new Float64Array(64);
    this.a1=new Float64Array(64);this.a2=new Float64Array(64);this.b0=new Float64Array(64);
    this.energyScale=new Float64Array(64);
    this.inputBlock=new Float64Array(128);this.level=0;this.gateEnvelope=0;this.autoGain=1;
    this.samples=0;this.sum=0;this.previousLevel=0;this.onsetId=0;this.lastOnset=-10;this.epoch=0;
    this.port.onmessage=event=>{
      const config=event.data;
      if(config.type==='reset'){this.reset();return;}
      if(config.type!=='configure')return;
      this.epoch=config.epoch;this.music=config.tuning==='music';this.reset();
      for(let i=0;i<64;i++){
        const frequency=Math.min(sampleRate*.44,config.modes[i].frequency),q=(config.tuning==='physical'?65:7)*config.decay;
        const c=globalThis.PlatePhysics.resonatorCoefficients(frequency,sampleRate,q,config.modes[i].coupling,config.fundamental,config.tuning==='music');
        this.a1[i]=c.a1;this.a2[i]=c.a2;this.b0[i]=c.b0;
        this.energyScale[i]=this.music?1/(2*Math.sin(Math.PI*frequency/sampleRate)):(sampleRate/(2*Math.PI*config.fundamental))**2;
      }
    };
  }
  reset(){this.y1.fill(0);this.y2.fill(0);this.power.fill(0);this.sum=0;this.samples=0;this.previousLevel=0;this.visualSum=0;this.level=0;this.gateEnvelope=0;this.autoGain=1;}
  process(inputs,outputs,parameters={}){
    const channels=inputs[0],count=outputs[0]?.[0]?.length||channels[0]?.length||128;
    if(this.inputBlock.length!==count)this.inputBlock=new Float64Array(count);
    let blockSum=0;for(let n=0;n<count;n++){let x=0;for(let c=0;c<channels.length;c++)x+=channels[c][n]||0;if(channels.length)x/=channels.length;this.inputBlock[n]=x;blockSum+=x*x;}
    const rawLevel=Math.sqrt(blockSum/count),automatic=this.music&&(parameters.autoLevel?.[0]??0)>.5,seconds=count/sampleRate;
    this.level+=(rawLevel-this.level)*(1-Math.exp(-seconds/(rawLevel>this.level?.08:.5)));
    this.gateEnvelope+=(rawLevel-this.gateEnvelope)*(1-Math.exp(-seconds/(rawLevel>this.gateEnvelope?.012:.04)));
    const previousGain=this.autoGain,target=automatic&&this.gateEnvelope>.00035?Math.max(.125,Math.min(8,.08/Math.max(.003,this.level))):1;
    this.autoGain=automatic?this.autoGain+(target-this.autoGain)*(1-Math.exp(-seconds/(target<this.autoGain?.025:.35))):1;
    const safeGain=automatic?Math.min(this.autoGain,.18/Math.max(rawLevel,.0001)):1;
    const t=Math.max(0,Math.min(1,(this.gateEnvelope-.00035)/.00085)),gate=automatic?t*t*(3-2*t):1;
    const smoothing=1-Math.exp(-1/(sampleRate*.018));
    for(let n=0;n<count;n++){
      let x=this.inputBlock[n];
      this.sum+=x*x;
      const gain=automatic?Math.min(previousGain,safeGain)+(safeGain-Math.min(previousGain,safeGain))*(n+1)/count:1;
      x*=gain*gate;this.visualSum=(this.visualSum||0)+x*x;
      for(let i=0;i<64;i++){
        const y=this.a1[i]*this.y1[i]+this.a2[i]*this.y2[i]+this.b0[i]*x*(parameters.drive?.[0]??1);
        const measure=(this.music?y-this.y1[i]:y-2*this.y1[i]+this.y2[i])*this.energyScale[i];
        this.y2[i]=this.y1[i];this.y1[i]=Math.abs(y)<1e-24?0:y;
        this.power[i]+=(measure*measure-this.power[i])*smoothing;
      }
      this.samples++;
    }
    if(this.samples>=sampleRate*.008){
      const rms=Math.sqrt(this.sum/this.samples),visualRms=Math.sqrt(this.visualSum/this.samples),rise=Math.max(0,visualRms-this.previousLevel);
      const onset=rise>Math.max(.012,this.previousLevel*.28)&&visualRms>this.previousLevel*1.2&&currentTime-this.lastOnset>.12;
      if(onset){this.onsetId++;this.lastOnset=currentTime;}
      this.previousLevel+=(visualRms-this.previousLevel)*(1-Math.exp(-this.samples/(sampleRate*.04)));
      this.port.postMessage({epoch:this.epoch,powers:Float32Array.from(this.power),rms,visualRms,autoGain:safeGain,automatic,onsetId:this.onsetId,onsetStrength:onset?Math.min(1,rise*8):0,time:currentTime});
      this.samples=0;this.sum=0;this.visualSum=0;
    }
    return true;
  }
}
registerProcessor('plate-resonator',PlateResonator);
