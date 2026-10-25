(function(root){
  'use strict';
  const defaults={mode:'tone',frequency:63.1,start:40,end:220,duration:30,loop:true,level:25};
  function sanitize(input={}){
    const r={...defaults};if(!input||typeof input!=='object')return r;
    for(const [key,min,max]of [['frequency',20,4000],['start',20,4000],['end',20,4000],['duration',5,120],['level',0,100]]){
      const v=input[key];if((typeof v==='number'||typeof v==='string'&&v.trim())&&Number.isFinite(Number(v)))r[key]=Math.round(Math.max(min,Math.min(max,Number(v)))*10)/10;
    }
    if(input.mode==='sweep')r.mode='sweep';if(typeof input.loop==='boolean')r.loop=input.loop;return r;
  }
  function frequencyAt(input,seconds){const s=sanitize(input);if(s.mode==='tone')return s.frequency;
    const t=Math.max(0,seconds),leg=Math.floor(t/s.duration);let phase=s.loop?t/s.duration-leg:Math.min(1,t/s.duration);
    if(s.loop&&leg%2)phase=1-phase;return s.start*Math.pow(s.end/s.start,phase);
  }
  const api={defaults,sanitize,frequencyAt};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ExperimentTools=api;
})(globalThis);
