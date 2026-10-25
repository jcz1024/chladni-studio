const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
const report={version:require('../package.json').version,checks:[],cases:[],errors:[]};let app,page;
function check(name,condition){assert.ok(condition,name);report.checks.push(name);console.log('PASS '+name);}
(async()=>{
 try{
  const executable=process.env.CHLADNI_TEST_EXE;
  app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache/grain-regression-profile')},timeout:30000});
  page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));
  await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);
  await page.locator('#reset-settings').click();
  for(const shape of ['square','circle'])for(const mode of [0,1]){
   const result=await page.evaluate(({shape,mode})=>{
    const e=window.studio.engine;e.setShape(shape);e.tuning='physical';e.physicalRefill=false;e.automatic=true;e.hasDriven=true;e.weights.fill(0);e.weights[mode]=1;e.energy=0;e.lastOnset=0;e.scatter(64000);
    function snapshot(){const gl=e.gl,data=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);return data;}
    function difference(a,b){let max=0;for(let i=0;i<a.length;i+=8)max=Math.max(max,Math.hypot(a[i]-b[i],a[i+1]-b[i+1]));return max;}
    function metrics(data){let alive=0,edge=0,energy=0;for(let i=0;i<data.length;i+=8)if(data[i+6]<.5){alive++;if((shape==='circle'?Math.hypot(data[i],data[i+1]):Math.max(Math.abs(data[i]),Math.abs(data[i+1])))>.9)edge++;if(i%128===0)energy+=e.model.groups[mode].value(data[i],data[i+1])**2;}
     // Same deterministic subset is used before/after; full buffer for retention/edge.
     let sampled=0;for(let i=0;i<data.length;i+=128)if(data[i+6]<.5)sampled++;
     return{alive:alive/e.count,edge:edge/Math.max(1,alive),energy:energy/Math.max(1,sampled)};}
    const silent={modalPowers:new Float32Array(64),energy:0,onsetId:0,onsetStrength:0},initial=snapshot();
    for(let k=0;k<1200;k++)e.frame(1/60,silent);
    const afterSilence=snapshot(),silentDrift=difference(initial,afterSilence);
    const weak={...silent,modalPowers:new Float32Array(64)};weak.modalPowers[mode]=1e-8;
    for(let k=0;k<120;k++)e.frame(1/60,weak);
    const weakDrift=difference(afterSilence,snapshot());
    const driven={...silent,modalPowers:new Float32Array(64)};driven.modalPowers[mode]=.5;
    const start=metrics(snapshot());for(let k=0;k<1200;k++)e.frame(1/60,driven);
    const settled=metrics(snapshot());
    for(let k=0;k<300;k++)e.frame(1/60,silent);
    const stopped=snapshot();for(let k=0;k<600;k++)e.frame(1/60,silent);
    return {shape,mode,silentSeconds:20,silentDrift,weakDrift,start,settled,stoppedDrift:difference(stopped,snapshot()),gpu:e.diagnostics()};
   },{shape,mode});
   report.cases.push(result);
   check(`${shape} mode ${mode}: no drift with a retained field and zero/weak vibration`,result.silentDrift<1e-7&&result.weakDrift<1e-7);
   check(`${shape} mode ${mode}: steady excitation forms interior nodes with retained sand`,result.settled.energy<result.start.energy*.5&&result.settled.alive>.7&&result.settled.edge<.4);
   check(`${shape} mode ${mode}: sand stops after inertia decays`,result.stoppedDrift<1e-5&&result.gpu.glError===0&&result.gpu.finite);
   if(mode===1)await page.locator('#visualizer').screenshot({path:path.join(out,`free-${shape}-nodes.png`)});
   console.log(JSON.stringify({shape,mode,start:result.start,settled:result.settled,stoppedDrift:result.stoppedDrift}));
  }
  await page.locator('#reset-settings').click();await page.locator('[data-tuning="physical"]').click();
  await page.locator('#fundamental').evaluate(el=>{el.value=70;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.evaluate(async()=>{const a=window.studio.audio,e=window.studio.engine;await a.switchSource('file');const o=a.context.createOscillator(),g=a.context.createGain();o.frequency.value=e.model.groups[2].ratio*70;g.gain.value=.05;o.connect(g);g.connect(a.bus);o.start();window.__grainTone={o,g};});
  await page.waitForTimeout(1100);
  report.pcm=await page.evaluate(()=>({powers:Array.from(window.studio.audio.stats.modalPowers),gpu:window.studio.engine.diagnostics()}));
  check('Real single-frequency PCM excites its predicted free-plate mode',report.pcm.gpu.weights[2]>.7&&report.pcm.gpu.excitation>1);
  await page.screenshot({path:path.join(out,'free-plate-tone.png')});
  await page.evaluate(()=>{window.__grainTone.o.frequency.value=window.studio.engine.model.groups[5].ratio*70;});await page.waitForTimeout(900);
  report.sweep=await page.evaluate(()=>({weights:Array.from(window.studio.engine.weights),gpu:window.studio.engine.diagnostics()}));
  check('Changing PCM frequency changes the predicted resonant mode',report.sweep.weights[5]>.7);
  await page.evaluate(()=>window.__grainTone.g.gain.value=.000001);await page.waitForTimeout(2000);
  report.quiet=await page.evaluate(()=>({excitation:window.studio.engine.excitation,meanSpeed:window.studio.engine.diagnostics().meanSpeed}));
  check('Quiet PCM stays below the sand detachment threshold',report.quiet.excitation<.01&&report.quiet.meanSpeed<.0001);
  await page.evaluate(()=>window.__grainTone.o.stop());await page.waitForTimeout(1600);
  await page.evaluate(()=>{const e=window.studio.engine,gl=e.gl;window.__stopped=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,window.__stopped);gl.bindBuffer(gl.ARRAY_BUFFER,null);});
  await page.waitForTimeout(600);
  report.pcmStoppedDrift=await page.evaluate(()=>{const e=window.studio.engine,gl=e.gl,b=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,b);gl.bindBuffer(gl.ARRAY_BUFFER,null);let max=0;for(let i=0;i<b.length;i+=8)max=Math.max(max,Math.hypot(b[i]-window.__stopped[i],b[i+1]-window.__stopped[i+1]));return max;});
  check('Real PCM silence leaves every settled grain stationary',report.pcmStoppedDrift<1e-5);
  const fixture=require('./make-music-fixture.cjs').makeMusicFixture(path.join(out,'多模态节奏示例.wav'));
  await page.locator('#reset-settings').click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
  await page.locator('#import-button').click();await page.waitForFunction(()=>!document.querySelector('#audio').paused);
  await page.locator('#audio').evaluate(el=>el.loop=true);
  report.longMusic={};
  for(const tuning of ['music','physical']){
   await page.locator(`[data-tuning="${tuning}"]`).click();await page.locator('#scatter-button').click();
   await page.waitForTimeout(14500);
   report.longMusic[tuning]=await page.evaluate(()=>window.studio.engine.diagnostics());
   const gpu=report.longMusic[tuning];
   check(`${tuning}: sustained file music keeps finite interior sand without edge collapse`,gpu.finite&&gpu.glError===0&&gpu.aliveFraction>.5&&gpu.edgeFraction<.45);
   await page.screenshot({path:path.join(out,`sustained-${tuning}.png`)});
  }
  check('No renderer errors during grain regressions',report.errors.length===0);report.success=true;
 }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-grain-report.json':'grain-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
