const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={version:require('../package.json').version,checks:[],errors:[]};let app,page;
const musicFile=require('./make-music-fixture.cjs').makeMusicFixture(path.join(out,'多模态节奏示例.wav'));
function check(name,value){assert.ok(value,name);report.checks.push(name);console.log('PASS '+name);}
(async()=>{
 try{
  const executable=process.env.CHLADNI_TEST_EXE;
  app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache/realtime-profile')},timeout:30000});
  page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));
  await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);
  await page.locator('#reset-settings').click();
  await page.locator('#fundamental').evaluate(el=>{el.value=70;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  report.frequencies=await page.evaluate(()=>[2,5,8].map(i=>window.studio.engine.model.groups[i].ratio*70));
  await page.evaluate(async()=>{
    const a=window.studio.audio;await a.switchSource('file');
    const o=a.context.createOscillator(),g=a.context.createGain();o.frequency.value=window.studio.engine.model.groups[2].ratio*70;g.gain.value=.14;o.connect(g);g.connect(a.bus);o.start();
    window.__rtTone={o,g};
  });
  await page.waitForFunction(()=>window.studio.audio.stats.packets>=40&&window.studio.audio.stats.modalPowers[2]>.001);
  const initial=await page.evaluate(()=>({weights:Array.from(window.studio.engine.weights),packets:window.studio.audio.stats.packets,powers:Array.from(window.studio.audio.stats.modalPowers)}));
  report.initial=initial;
  check('Audio-thread resonators produce nonzero powers from real PCM',initial.packets>10&&initial.powers[2]>.001);
  report.jump=await page.evaluate(async()=>{
    const e=window.studio.engine,a=window.studio.audio,t=a.context.currentTime+.12,start=performance.now()+120;
    window.__rtTone.o.frequency.setValueAtTime(e.model.groups[5].ratio*70,t);
    return new Promise(resolve=>{
      let changedAt=null,settledAt=null;const samples=[];
      function sample(now){
        if(now>=start){const weight=e.weights[5];samples.push([now-start,weight]);if(changedAt===null&&weight>.12)changedAt=now-start;if(settledAt===null&&weight>.5)settledAt=now-start;}
        if(now-start>550)return resolve({changedAt,settledAt,samples,weights:Array.from(e.weights)});requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    });
  });
  check('Frequency jump changes the actual composed field within 200 ms',report.jump.changedAt!==null&&report.jump.changedAt<200);
  check('New resonance becomes dominant without a multi-second wait',report.jump.weights[5]>.4);
  await page.evaluate(()=>{
    const a=window.studio.audio,e=window.studio.engine;window.__rtTone.o.frequency.value=e.model.groups[2].ratio*70;
    window.__rtChord=[5,8].map(i=>{const o=a.context.createOscillator(),g=a.context.createGain();o.frequency.value=e.model.groups[i].ratio*70;g.gain.value=.14;o.connect(g);g.connect(a.bus);o.start();return{o,g};});
  });await delay(650);
  report.chord=await page.evaluate(()=>({active:window.studio.engine.activeModes,powers:Array.from(window.studio.audio.stats.modalPowers),gpu:window.studio.engine.diagnostics()}));
  check('A chord excites multiple simultaneous modes',report.chord.active>=3);
  await page.screenshot({path:path.join(out,'continuous-chord.png')});
  await page.locator('[data-tuning="physical"]').click();await delay(450);
  check('Physical tuning reaches both the audio solver and GPU',await page.evaluate(()=>window.studio.engine.tuning==='physical'&&window.studio.audio.modalConfig.tuning==='physical'));
  await page.locator('[data-tuning="music"]').click();
  await page.evaluate(()=>{window.__rtTone.o.stop();window.__rtChord.forEach(t=>t.o.stop());});await delay(900);
  report.tail=await page.evaluate(()=>({powers:Array.from(window.studio.audio.stats.modalPowers),gpu:window.studio.engine.diagnostics()}));
  check('Silence releases the driven modal energy',Math.max(...report.tail.powers)<Math.max(...report.chord.powers)*.001);
  await page.locator('[data-source="system"]').click();await page.locator('#source-action').click();
  await page.waitForFunction(()=>window.studio.state.listening);await delay(350);
  const timing=await app.evaluate(async({BrowserWindow})=>{
    const w=new BrowserWindow({show:false,width:150,height:100,webPreferences:{backgroundThrottling:false}});global.__rtExternal=w;
    await w.loadURL('data:text/html,<title>Pulse latency measurement</title>');
    return w.webContents.executeJavaScript(`(async()=>{const ctx=new AudioContext({latencyHint:'interactive'});await ctx.resume();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=190;g.gain.value=0;o.connect(g);g.connect(ctx.destination);o.start();const t=ctx.currentTime+.45;for(let i=0;i<3;i++){g.gain.setValueAtTime(.18,t+i*.45);g.gain.setValueAtTime(0,t+i*.45+.045);}window.ctx=ctx;return{firstWall:Date.now()+(t-ctx.currentTime)*1000,baseLatency:ctx.baseLatency,outputLatency:ctx.outputLatency};})()`);
  });
  report.loopback=await page.evaluate(async timing=>{
    const e=window.studio.engine,a=window.studio.audio,previous=e.onsetResponses||0,responses=[];
    return new Promise(resolve=>{let last=previous;
      function sample(){
        const count=e.onsetResponses||0;
        if(count!==last){responses.push({wall:Date.now()+e.lastVisualResponse-performance.now(),energy:e.energy,count});last=count;}
        if(Date.now()>timing.firstWall+1500)return resolve({timing,responses,packets:a.stats.packets,transportMs:a.stats.transportMs,gpu:e.diagnostics()});requestAnimationFrame(sample);
      }requestAnimationFrame(sample);
    });
  },timing);
  report.loopback.latencies=report.loopback.responses.map(r=>{
    const pulse=Math.round((r.wall-timing.firstWall)/450);return r.wall-(timing.firstWall+Math.max(0,Math.min(2,pulse))*450);
  }).filter(ms=>ms>=0&&ms<400);
  check('Three external pulses reach the visual simulation through Windows loopback',report.loopback.latencies.length===3);
  check('System pulse response is below 200 ms',Math.max(...report.loopback.latencies)<200);
  await page.locator('#source-action').click();await app.evaluate(()=>global.__rtExternal.close());
  const start=await page.evaluate(()=>({frames:window.studio.engine.renderedFrames,time:performance.now()}));await delay(3000);
  report.performance=await page.evaluate(start=>({fps:(window.studio.engine.renderedFrames-start.frames)*1000/(performance.now()-start.time),gpu:window.studio.engine.diagnostics()}),start);
  check('Default particle count keeps an interactive frame rate',report.performance.fps>=45);
  await page.locator('#reset-settings').click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},musicFile);
  await page.locator('#import-button').click();await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  report.music=await page.evaluate(()=>new Promise(resolve=>{
    const e=window.studio.engine,start=performance.now(),samples=[];let last=start;
    const onsetStart=e.onsetResponses||0,firstRevision=e.revision;
    function frame(now){if(now-last>160){samples.push({time:now-start,weights:Array.from(e.weights),active:e.activeModes});last=now;}
      if(now-start>4200)return resolve({samples,onsets:(e.onsetResponses||0)-onsetStart,revisions:e.revision-firstRevision,duration:document.querySelector('#audio').duration,gpu:e.diagnostics()});requestAnimationFrame(frame);}
    requestAnimationFrame(frame);
  }));
  check('Imported musical rhythm fixture decodes and plays through the file pipeline',report.music.duration===16);
  const changed=report.music.samples.slice(1).filter((s,i)=>s.weights.reduce((sum,w,j)=>sum+Math.abs(w-report.music.samples[i].weights[j]),0)>.08).length;
  check('Music continuously reshapes the field at sub-second intervals',changed>=5);
  check('Percussive transients repeatedly excite the sand',report.music.onsets>=4);
  await page.screenshot({path:path.join(out,'music-live.png')});
  await page.locator('[data-shape="circle"]').click();await page.locator('[data-tuning="physical"]').click();await delay(350);
  check('Disk uses free-edge plate eigenmodes with stable GPU data',await page.evaluate(()=>window.studio.engine.model.boundary==='周边自由圆板'&&window.studio.engine.model.modalCount===122&&window.studio.engine.diagnostics().finite));
  const physicalStart=await page.evaluate(()=>({frames:window.studio.engine.renderedFrames,time:performance.now()}));await delay(2500);
  report.physicalPerformance=await page.evaluate(start=>({fps:(window.studio.engine.renderedFrames-start.frames)*1000/(performance.now()-start.time),refillEnabled:window.studio.engine.refillEnabled,gpu:window.studio.engine.diagnostics()}),physicalStart);
  check('Physical contact and active supply keep an interactive frame rate',report.physicalPerformance.fps>=45&&report.physicalPerformance.refillEnabled&&report.physicalPerformance.gpu.glError===0);
  await page.screenshot({path:path.join(out,'physical-disk.png')});
  check('No renderer exceptions in continuous simulation',report.errors.length===0);report.success=true;
  console.log(JSON.stringify({jumpMs:report.jump.changedAt,dominantMs:report.jump.settledAt,loopbackMs:report.loopback.latencies,fps:report.performance.fps},null,2));
 }catch(error){report.failure=error.stack;report.success=false;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-realtime-report.json':'realtime-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
