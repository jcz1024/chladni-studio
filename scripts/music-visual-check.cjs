const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {featureTrace}=require('./audio-feature-trace.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
const fixture=require('./make-music-fixture.cjs').makeMusicFixture(path.join(out,'多模态节奏示例.wav'));
const report={version:require('../package.json').version,checks:[],frames:[],errors:[]};let app,page;
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log('PASS '+name);};
(async()=>{try{
 const executable=process.env.CHLADNI_TEST_EXE;
 app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache/music-visual-profile')},timeout:30000});
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);
 for(const tuning of ['physical','music']){
  await page.locator(`[data-tuning="${tuning}"]`).click();
  check(`${tuning} button reaches matching audio and GPU paths`,await page.evaluate(t=>window.studio.engine.tuning===t&&window.studio.audio.modalConfig.tuning===t,tuning));
 }
 const baseline=fs.readFileSync(path.join(root,'tests/fixtures/alpha3-engine.js'),'utf8').replace('window.ChladniEngine=ChladniEngine','window.BaselineChladniEngine=ChladniEngine');
 await page.evaluate(baseline);
 await page.evaluate(()=>{
  const wrapper=document.createElement('div');wrapper.id='visual-comparison';wrapper.style.cssText='position:fixed;z-index:9999;top:40px;left:0;width:1340px;background:#101113;padding:16px;display:flex;gap:16px;font:16px sans-serif;color:#dfb974';
  for(const label of ['alpha.3 音乐响应','新版音乐响应']){const panel=document.createElement('div');panel.style.width='646px';const title=document.createElement('div');title.textContent=label;title.style.cssText='height:30px;text-align:center';const canvas=document.createElement('canvas');canvas.style.cssText='width:646px;height:600px;display:block';panel.append(title,canvas);wrapper.append(panel);}
  document.body.append(wrapper);const canvases=wrapper.querySelectorAll('canvas');window.__visualEngines=[new BaselineChladniEngine(canvases[0]),new ChladniEngine(canvases[1])];
  let seed;const original=Math.random;for(const e of window.__visualEngines){seed=74651;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};e.scatter(64000);e.tuning='music';}Math.random=original;
 });
 const trace=featureTrace(fixture);report.input={seconds:trace.length/60,source:path.basename(fixture),samePcm:true,sameInitialParticles:true};
 for(let offset=0;offset<trace.length;offset+=240){
  const chunk=trace.slice(offset,offset+240);
  const sample=await page.evaluate(({chunk,offset})=>{
   for(const audio of chunk)for(const e of window.__visualEngines)e.frame(1/60,audio);
   function details(e){
    const gpu=e.diagnostics(),gl=e.gl,a=new Float32Array(4096*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,a);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    let alive=0,near=0;for(let i=0;i<a.length;i+=8)if(a[i+6]<.5){alive++;let phi=0;for(let k=0;k<64;k++)if(e.weights[k]>.00015)phi+=Math.sqrt(e.weights[k])*e.model.groups[k].value(a[i],a[i+1]);if(phi*phi<.045)near++;}
    return {...gpu,nearNodeFraction:near/Math.max(1,alive),pulse:e.pulse||0};
   }
   return {seconds:(offset+chunk.length)/60,old:details(window.__visualEngines[0]),current:details(window.__visualEngines[1])};
  },{chunk,offset});report.frames.push(sample);
  await page.locator('#visual-comparison').screenshot({path:path.join(out,`music-comparison-${sample.seconds}s.png`)});
  console.log(JSON.stringify({seconds:sample.seconds,old:{near:sample.old.nearNodeFraction,alive:sample.old.aliveFraction},current:{near:sample.current.nearNodeFraction,alive:sample.current.aliveFraction}}));
 }
 const oldMean=report.frames.reduce((s,f)=>s+f.old.nearNodeFraction,0)/report.frames.length,newMean=report.frames.reduce((s,f)=>s+f.current.nearNodeFraction,0)/report.frames.length;
 report.nodalOccupancy={old:oldMean,current:newMean};
 check('Music improves average grain occupancy near visible nodal lines',newMean>oldMean*1.15);
 check('Music keeps at least 90% of grains through the fixture',report.frames.at(-1).current.aliveFraction>.9);
 check('Visual comparison has finite GPU buffers and no errors',report.frames.every(f=>f.current.finite&&f.current.glError===0));
 report.musicSilence=await page.evaluate(()=>{
  const e=window.__visualEngines[1],silent={modalPowers:new Float32Array(64),energy:0,onsetId:9000,onsetStrength:0};
  for(let k=0;k<300;k++)e.frame(1/60,silent);
  function read(){const gl=e.gl,data=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);return data;}
  const first=read();for(let k=0;k<120;k++)e.frame(1/60,silent);const second=read();
  const weak={...silent,modalPowers:new Float32Array(64).fill(1e-8)};for(let k=0;k<120;k++)e.frame(1/60,weak);const third=read();
  let silence=0,weakDrift=0;for(let i=0;i<first.length;i+=8){silence=Math.max(silence,Math.hypot(first[i]-second[i],first[i+1]-second[i+1]));weakDrift=Math.max(weakDrift,Math.hypot(second[i]-third[i],second[i+1]-third[i+1]));}
  const beat={...silent,modalPowers:new Float32Array(64),onsetId:9001,onsetStrength:1,energy:.4};beat.modalPowers[2]=.5;e.frame(1/60,beat);const immediatePulse=e.pulse;for(let k=0;k<8;k++)e.frame(1/60,beat);
  return{silence,weakDrift,immediatePulse,releasedPulse:e.pulse};
 });
 check('Music sand stays still in silence and below the visual input threshold',report.musicSilence.silence<1e-5&&report.musicSilence.weakDrift<1e-5);
 check('Music beat light reacts in one frame and releases smoothly',report.musicSilence.immediatePulse>.5&&report.musicSilence.releasedPulse<report.musicSilence.immediatePulse*.6&&report.musicSilence.releasedPulse>0);
 // Contact changes may change grain trajectories; plate weights must remain identical.
 await page.evaluate(()=>{let seed;const original=Math.random;for(const e of window.__visualEngines){e.setShape('square');e.energy=0;e.elapsed=0;e.lastOnset=-1;e.tuning='physical';seed=74651;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};e.scatter(64000);}Math.random=original;});
 report.physical=await page.evaluate(trace=>{
  for(const audio of trace)for(const e of window.__visualEngines)e.frame(1/60,audio);
  const buffers=window.__visualEngines.map(e=>{const gl=e.gl,a=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,a);gl.bindBuffer(gl.ARRAY_BUFFER,null);return a;});
  let max=0;for(let i=0;i<buffers[0].length;i++)max=Math.max(max,Math.abs(buffers[0][i]-buffers[1][i]));const [old,current]=window.__visualEngines;return {trajectoryDelta:max,weightDelta:Math.max(...old.weights.map((w,i)=>Math.abs(w-current.weights[i]))),excitationDelta:Math.abs(old.excitation-current.excitation),gpu:current.diagnostics()};
 },featureTrace(fixture,'physical'));
 check('Physical plate response is unchanged while updated contacts stay finite',report.physical.weightDelta<1e-7&&report.physical.excitationDelta===0&&report.physical.gpu.finite&&report.physical.gpu.glError===0);
 check('No renderer exceptions in visual comparison',report.errors.length===0);report.success=true;
 }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-music-visual-report.json':'music-visual-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
