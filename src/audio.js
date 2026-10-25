(() => {
  'use strict';
  class AudioEngine {
    constructor(element) {
      this.element = element; this.source = 'demo'; this.capture = null;
      this.volume = 0.65; this.demoPlaying = false; this.sensitivity = 1.1;this.autoSensitivity=true;
      this.labOptions={...ExperimentTools.defaults};this.labPlaying=false;this.labRequest=0;
      this.epoch=0;this.modalConfig={model:PlatePhysics.createPlate('square'),tuning:'music',fundamental:35,decay:1};
      this.stats = { energy: 0, bass: 0, mid: 0, high: 0, frequency: 0, db: -100, spectrum: new Float32Array(64), modalPowers:new Float32Array(64), rms:0, onsetId:0,onsetStrength:0,packets:0,active: false };
    }
    async init() {
      if (!this.initPromise) this.initPromise=(async()=>{
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.28;
        this.analyser.minDecibels = -90; this.analyser.maxDecibels = -15;
        this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
        this.timeData = new Float32Array(this.analyser.fftSize);
        this.fileNode = this.context.createMediaElementSource(this.element);
        this.bus=this.context.createGain();this.bus.connect(this.analyser);
        this.fileGain = this.context.createGain();
        this.fileNode.connect(this.fileGain); this.fileGain.connect(this.context.destination);
        this.fileGain.gain.value = this.volume;
        await this.context.audioWorklet.addModule('physics.js');
        await this.context.audioWorklet.addModule('resonator-worklet.js');
        this.resonator=new AudioWorkletNode(this.context,'plate-resonator',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
        this.resonator.parameters.get('drive').value=this.sensitivity;
        this.resonator.parameters.get('autoLevel').value=this.autoSensitivity?1:0;
        this.resonator.onprocessorerror=()=>{this.stats.rms=0;this.stats.modalPowers.fill(0);this.onError?.('共振音频线程已中断，请重新打开应用。');};
        this.silentSink=this.context.createGain();this.silentSink.gain.value=0;
        this.bus.connect(this.resonator);this.resonator.connect(this.silentSink);this.silentSink.connect(this.context.destination);
        this.resonator.port.onmessage=event=>{
          const data=event.data;if(data.epoch!==this.epoch)return;
          const s=this.stats;s.modalPowers=data.powers;s.rms=data.rms;s.visualRms=data.visualRms;s.autoGain=data.autoGain;s.autoActive=data.automatic;s.packets++;
          if(data.onsetId!==s.onsetId){s.onsetId=data.onsetId;s.onsetStrength=data.onsetStrength*this.sensitivity;}
          s.audioTime=data.time;s.receivedAt=performance.now();s.transportMs=Math.max(0,(this.context.currentTime-data.time)*1000);
        };
        this.configurePlate();
      })();
      await this.initPromise;
      if (this.context.state === 'suspended') await this.context.resume();
    }
    async switchSource(source) {
      await this.init(); this.stopCapture(); this.stopDemo(); this.stopLab();this.element.pause();
      try { this.fileNode.disconnect(this.bus); } catch {}
      this.source = source;
      if (source === 'file') this.fileNode.connect(this.bus);
      this.resonator.port.postMessage({type:'reset'});this.stats.modalPowers.fill(0);this.stats.rms=0;this.stats.visualRms=0;this.stats.autoGain=1;
      this.stats.energy = this.stats.bass = this.stats.mid = this.stats.high = 0;
      this.stats.frequency = 0; this.stats.db = -100; this.stats.spectrum.fill(0); this.stats.active = false;
    }
    async startCapture() {
      await this.init(); this.stopCapture();
      await window.desktop.armCapture();
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: { width: 160, height: 90, frameRate: 1 } });
        if (!stream.getAudioTracks().length) throw new Error('没有获取到系统音轨，请检查默认播放设备。');
        // Only audio is retained. Screen frames are immediately discarded.
        stream.getVideoTracks().forEach(track => track.stop());
        this.capture = new MediaStream(stream.getAudioTracks());
        this.captureNode = this.context.createMediaStreamSource(this.capture);
        this.captureNode.connect(this.bus); // Analysis bus reaches only a muted processing sink.
        this.capture.getAudioTracks()[0].addEventListener('ended', () => { this.stopCapture(); this.onCaptureEnded?.(); }, { once: true });
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop());
        throw error;
      }
    }
    stopCapture() {
      if (this.captureNode) { this.captureNode.disconnect(); this.captureNode = null; }
      if (this.capture) { this.capture.getTracks().forEach(track => track.stop()); this.capture = null; }
    }
    async startDemo() {
      await this.init(); if (this.demoPlaying) return;
      this.demoPlaying = true; this.demoStart = this.context.currentTime;
      this.demoGain = this.context.createGain(); this.demoGain.gain.value = 0;
      this.demoGain.gain.setTargetAtTime(0.16 * this.volume, this.context.currentTime, 0.1);
      this.demoGain.connect(this.context.destination); this.demoGain.connect(this.bus);
      this.oscillators = [1, 1.5, 2].map((ratio, i) => {
        const osc = this.context.createOscillator(), gain = this.context.createGain();
        osc.type = 'sine'; osc.frequency.value = 220 * ratio; gain.gain.value = [0.65, 0.23, 0.12][i];
        osc.connect(gain); gain.connect(this.demoGain); osc.start(); return { osc, ratio };
      });
      let tick = 0;
      const notes = [175,220,350,280,455,560,315,420];
      this.demoTimer = setInterval(() => {
        const time=this.context.currentTime;tick++;
        const note=notes[Math.floor(tick/2)%notes.length];
        this.oscillators.forEach(({osc,ratio})=>osc.frequency.setTargetAtTime(note*ratio,time,.025));
        this.demoGain.gain.cancelScheduledValues(time);this.demoGain.gain.setValueAtTime(.20*this.volume,time);
        this.demoGain.gain.exponentialRampToValueAtTime(Math.max(.0001,.045*this.volume),time+.29);
      }, 360);
    }
    stopDemo() {
      clearInterval(this.demoTimer);
      if (this.demoGain && this.demoPlaying) {
        const time = this.context.currentTime, oldGain = this.demoGain, oldOsc = this.oscillators;
        oldGain.gain.cancelScheduledValues(time); oldGain.gain.setTargetAtTime(0, time, 0.025);
        oldOsc.forEach(({osc}) => osc.stop(time + 0.15));
        setTimeout(() => oldGain.disconnect(), 200);
      }
      this.demoPlaying = false;
    }
    setLabOptions(options){this.labOptions=ExperimentTools.sanitize({...this.labOptions,...options});if(this.labPlaying)this.createLabGraph();}
    async startLab(options){if(options)this.setLabOptions(options);const request=++this.labRequest;await this.init();if(request!==this.labRequest)return;this.createLabGraph();}
    createLabGraph(){
      this.stopLab();const s={...this.labOptions},time=this.context.currentTime,target=s.level*.004;
      const oscillator=this.context.createOscillator(),input=this.context.createGain(),monitor=this.context.createGain();
      oscillator.type='sine';oscillator.connect(input);input.connect(this.bus);input.connect(monitor);monitor.connect(this.context.destination);monitor.gain.value=this.volume;
      input.gain.setValueAtTime(0,time);input.gain.linearRampToValueAtTime(target,time+.025);
      oscillator.frequency.setValueAtTime(s.mode==='tone'?s.frequency:s.start,time);
      this.labGraph={oscillator,input,monitor,options:s,start:time,scheduled:0};this.labPlaying=true;
      if(s.mode==='sweep'){
        const schedule=()=>{const graph=this.labGraph;if(!graph||graph.oscillator!==oscillator)return;
          const wanted=s.loop?Math.floor((this.context.currentTime-time)/s.duration)+3:1;
          while(graph.scheduled<wanted){const leg=graph.scheduled++,frequency=leg%2?s.start:s.end;oscillator.frequency.exponentialRampToValueAtTime(frequency,time+(leg+1)*s.duration);}};
        schedule();if(s.loop)this.labTimer=setInterval(schedule,200);
        else{input.gain.setValueAtTime(target,time+s.duration);input.gain.linearRampToValueAtTime(0,time+s.duration+.025);this.labEndTimer=setTimeout(()=>{this.stopLab();this.onLabEnded?.();},(s.duration+.05)*1000);}
      }
      oscillator.start(time);
    }
    stopLab(){
      this.labRequest++;clearInterval(this.labTimer);clearTimeout(this.labEndTimer);const graph=this.labGraph;this.labGraph=null;this.labPlaying=false;
      if(graph){const time=this.context.currentTime;graph.input.gain.cancelScheduledValues(time);graph.input.gain.setTargetAtTime(0,time,.008);graph.oscillator.stop(time+.05);setTimeout(()=>{graph.oscillator.disconnect();graph.input.disconnect();graph.monitor.disconnect();},100);}
    }
    labStatus(){const graph=this.labGraph;return{playing:this.labPlaying,mode:this.labOptions.mode,frequency:graph?ExperimentTools.frequencyAt(graph.options,this.context.currentTime-graph.start):this.labOptions.mode==='tone'?this.labOptions.frequency:this.labOptions.start};}
    setVolume(value) {
      this.volume = value;
      if (this.fileGain) this.fileGain.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
      if (this.demoGain && this.demoPlaying) this.demoGain.gain.setTargetAtTime(0.16 * value, this.context.currentTime, 0.03);
      if(this.labGraph)this.labGraph.monitor.gain.setTargetAtTime(value,this.context.currentTime,.03);
    }
    setSensitivity(value){this.sensitivity=value;this.resonator?.parameters.get('drive').setTargetAtTime(value,this.context.currentTime,.015);}
    setAutoSensitivity(value){this.autoSensitivity=!!value;if(this.resonator)this.resonator.parameters.get('autoLevel').value=this.autoSensitivity?1:0;}
    configurePlate(model,tuning,fundamental,decay){
      if(model)this.modalConfig={model,tuning,fundamental,decay};
      if(!this.resonator)return;
      const c=this.modalConfig;this.epoch++;this.stats.modalPowers.fill(0);
      this.resonator.port.postMessage({type:'configure',epoch:this.epoch,tuning:c.tuning,fundamental:c.fundamental,decay:c.decay,modes:c.model.groups.map(g=>({frequency:g.ratio*c.fundamental,coupling:g.coupling}))});
    }
    read() {
      const stats = this.stats;
      const playing = this.analyser && this.stats.rms>0.00001;
      if (!playing) {
        stats.active = false; stats.frequency = 0; stats.db = -100;
        for (const key of ['energy','bass','mid','high']) stats[key] *= 0.88;
        stats.spectrum.forEach((v,i) => stats.spectrum[i] = v * 0.86); return stats;
      }
      this.analyser.getFloatFrequencyData(this.frequencyData); this.analyser.getFloatTimeDomainData(this.timeData);
      const rms=this.stats.rms;
      stats.db = Math.max(-100, 20 * Math.log10(rms + 1e-8));
      const visual=stats.visualRms??rms;
      stats.active = visual > 0.0001;
      stats.energy = Math.min(1, Math.pow(visual * 5.5 * this.sensitivity, 0.7));
      const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
      const band = (low, high) => {
        let total = 0, count = 0;
        for (let i = Math.max(1, Math.floor(low/hzPerBin)); i < Math.min(this.frequencyData.length, Math.ceil(high/hzPerBin)); i++) {
          total += Math.pow(10, this.frequencyData[i] / 20); count++;
        }
        return Math.min(1, Math.sqrt(total/Math.max(count,1)) * 4.5 * this.sensitivity);
      };
      stats.bass = band(35,250); stats.mid = band(250,2400); stats.high = band(2400,16000);
      let peak = -Infinity, peakIndex = 0;
      for (let i = Math.max(1,Math.ceil(20/hzPerBin)); i < Math.min(this.frequencyData.length-1, Math.floor(5000/hzPerBin)); i++) {
        if (this.frequencyData[i] > peak) { peak = this.frequencyData[i]; peakIndex = i; }
      }
      let offset = 0;
      if (peakIndex > 0) {
        const a = this.frequencyData[peakIndex-1], b = this.frequencyData[peakIndex], c = this.frequencyData[peakIndex+1];
        const denom = a-2*b+c; if (Number.isFinite(denom) && Math.abs(denom)>1e-6) offset = Math.max(-.5,Math.min(.5,.5*(a-c)/denom));
      }
      stats.frequency = stats.active && peak > -80 ? (peakIndex+offset)*hzPerBin : 0;
      for (let i=0;i<64;i++) {
        const low=40*Math.pow(400,i/64), high=40*Math.pow(400,(i+1)/64);
        let maximum=-100;
        const start=Math.max(1,Math.floor(low/hzPerBin)),end=Math.min(this.frequencyData.length,Math.max(start+1,Math.ceil(high/hzPerBin)));
        for(let j=start;j<end;j++) maximum=Math.max(maximum,this.frequencyData[j]);
        stats.spectrum[i]=Math.max(0,Math.min(1,(maximum+85)/70))*Math.min(this.sensitivity,1.7);
      }
      return stats;
    }
  }
  window.AudioEngine = AudioEngine;
})();
