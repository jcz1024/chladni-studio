const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output'),profile=path.join(root,'.cache/experience-profile');
const report={version:require('../package.json').version,checks:[],errors:[],presets:[],refill:[]};let app,page;
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log('PASS '+name);};
async function launch(){const executable=process.env.CHLADNI_TEST_EXE;app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:profile},timeout:30000});page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);}
(async()=>{try{
 await launch();await page.evaluate(()=>{localStorage.removeItem('chladni-favorites-v1');});await page.reload();await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);await page.locator('#reset-settings').click();
 check('Four visual presets and music conveniences are available',await page.locator('[data-preset]').count()===4&&await page.locator('#auto-level').isChecked()&&await page.locator('#auto-refill').isChecked());
 const fixture=require('./make-music-fixture.cjs').makeMusicFixture(path.join(out,'多模态节奏示例.wav'));
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);await page.locator('#import-button').click();await page.waitForFunction(()=>!document.querySelector('#audio').paused);
 await page.locator('#volume').evaluate(el=>{el.value=37;el.dispatchEvent(new Event('input',{bubbles:true}));});
 for(const preset of require('../src/presets.js').builtins){
  await page.locator(`[data-preset="${preset.id}"]`).click();await page.waitForTimeout(900);
  const state=await page.evaluate(()=>({state:window.studio.state,count:window.studio.engine.count,shape:window.studio.engine.model.shape,volume:window.studio.audio.volume,playing:!document.querySelector('#audio').paused,gpu:window.studio.engine.diagnostics()}));report.presets.push({id:preset.id,...state});
  check(`${preset.id} changes its response profile, geometry and density without changing playback`,state.state.musicStyle===preset.id&&state.shape===preset.settings.shape&&state.count===preset.settings.density&&state.volume===.37&&state.playing&&state.gpu.finite&&state.gpu.glError===0);
  await page.locator('.sidebar').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,`preset-${preset.id}.png`)});
 }
 report.profileResponse=await page.evaluate(()=>{
  const e=window.studio.engine;e.setShape('square');e.scatter(16000);e.autoRefill=false;e.tuning='music';e.automatic=true;
  const powers=new Float32Array(64);[2,5,9,12,20,25].forEach((k,i)=>powers[k]=[.5,.3,.2,.25,.15,.1][i]);
  return ['geometry','beat','calm','detail'].map(style=>{e.musicStyle=style;e.focusScores.fill(0);e.weights.fill(0);e.weights[2]=1;e.lastOnset=-1;
   const input={modalPowers:powers,energy:.4,active:true,onsetId:1,onsetStrength:.8};e.frame(1/60,input);const pulse=e.pulse;for(let i=0;i<240;i++)e.frame(1/60,input);
   return {style,pulse,weights:Array.from(e.weights)};});
 });
 check('Presets alter structure and beat dynamics on identical audio features',report.profileResponse.slice(1).every(p=>p.weights.reduce((sum,w,i)=>sum+Math.abs(w-report.profileResponse[0].weights[i]),0)>.05)&&report.profileResponse[1].pulse>report.profileResponse[2].pulse*3);
 await page.locator('#reset-settings').click();
 await page.evaluate(async()=>{const a=window.studio.audio;await a.switchSource('file');const o=a.context.createOscillator(),g=a.context.createGain();o.frequency.value=220;g.gain.value=.02;o.connect(g);g.connect(a.bus);o.start();window.__experienceTone={o,g};});await page.waitForTimeout(1800);
 report.quiet=await page.evaluate(()=>({rms:window.studio.audio.stats.rms,visual:window.studio.audio.stats.visualRms,gain:window.studio.audio.stats.autoGain,output:window.studio.audio.fileGain.gain.value}));
 await page.evaluate(()=>window.__experienceTone.g.gain.value=.4);await page.waitForTimeout(1100);
 report.loud=await page.evaluate(()=>({rms:window.studio.audio.stats.rms,visual:window.studio.audio.stats.visualRms,gain:window.studio.audio.stats.autoGain,output:window.studio.audio.fileGain.gain.value}));
 check('Real audio-thread normalization balances tracks with very different levels',report.quiet.gain>4&&report.loud.gain<.5&&report.quiet.visual>.06&&report.quiet.visual<.11&&report.loud.visual>.06&&report.loud.visual<.11);
 check('Automatic sensitivity leaves the actual playback gain untouched',Math.abs(report.quiet.output-.37)<.001&&Math.abs(report.loud.output-.37)<.001);
 await page.locator('#auto-level').uncheck();await page.waitForTimeout(300);
 check('Automatic sensitivity can be disabled for manual response',await page.evaluate(()=>!window.studio.audio.stats.autoActive&&Math.abs(window.studio.audio.stats.visualRms/window.studio.audio.stats.rms-1)<.001));
 await page.locator('#auto-level').check();await page.locator('[data-tuning="physical"]').click();await page.waitForTimeout(250);
 check('Physical tuning keeps original force levels and labels its separate sand supply',await page.locator('#auto-level').isDisabled()&&await page.locator('#auto-refill').isEnabled()&&(await page.locator('#refill-label').textContent()).includes('辅助撒砂')&&await page.evaluate(()=>!window.studio.audio.stats.autoActive&&window.studio.audio.stats.autoGain===1));
 await page.evaluate(()=>window.__experienceTone.o.stop());await page.locator('#reset-settings').click();
 for(const scenario of [{name:'enabled',tuning:'music',enabled:true,active:true},{name:'disabled',tuning:'music',enabled:false,active:true},{name:'silent',tuning:'music',enabled:true,active:false},{name:'manual',tuning:'music',enabled:true,active:true,automatic:false},{name:'physical',tuning:'physical',enabled:true,active:true},{name:'circle',tuning:'music',enabled:true,active:true,shape:'circle'}]){
  const result=await page.evaluate(s=>{
   const e=window.studio.engine;e.setShape(s.shape||'square');e.tuning=s.tuning;e.musicStyle='geometry';e.autoRefill=s.enabled;e.physicalRefill=false;e.automatic=s.automatic!==false;e.hasDriven=true;e.weights.fill(0);e.weights[2]=1;e.lastOnset=0;e.energy=0;e.scatter(16000);
   const gl=e.gl;function read(){const data=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);gl.bindBuffer(gl.ARRAY_BUFFER,null);return data;}
   const data=read();for(let i=0;i<Math.floor(e.count*.8);i++)data[i*8+6]=1;
   for(const buffer of e.buffers){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);}gl.bindBuffer(gl.ARRAY_BUFFER,null);
   const audio={modalPowers:new Float32Array(64),energy:s.active?.3:0,active:s.active,onsetId:0,onsetStrength:0};if(s.active)audio.modalPowers[2]=.5;
   let faded=0;for(let k=0;k<600;k++){e.frame(1/60,audio);if(k===179){const frame=read();for(let i=0;i<frame.length;i+=8)if(frame[i+6]<.5&&frame[i+7]<0)faded++;}}
   const final=read();let alive=0,finite=true,drift=0;for(let i=0;i<final.length;i+=8){if(final[i+6]<.5)alive++;finite=finite&&Number.isFinite(final[i])&&Number.isFinite(final[i+1])&&Math.abs(final[i])<=1&&Math.abs(final[i+1])<=1;drift=Math.max(drift,Math.hypot(final[i]-data[i],final[i+1]-data[i+1]));}
   return{alive:alive/e.count,faded,finite,drift,glError:gl.getError()};
  },scenario);report.refill.push({name:scenario.name,...result});
  check(`${scenario.name}: refill follows music/activity settings with stable GPU data`,result.finite&&result.glError===0&&((scenario.enabled&&scenario.active&&scenario.tuning==='music'&&scenario.automatic!==false)?result.alive>.9&&result.faded>0:result.alive<=.201));
  if(!scenario.active)check('Silence neither refills nor moves resting sand',result.drift===0);
  console.log(JSON.stringify({scenario:scenario.name,...result}));
 }
 await page.locator('[data-preset="calm"]').click();await page.locator('#glow').evaluate(el=>{el.value=52;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#auto-level').uncheck();await page.locator('#auto-refill').uncheck();
 await page.locator('#favorite-save').click();await page.locator('#favorite-name').fill('测试 <流沙> & 曲线');await page.locator('#favorite-confirm').click();
 report.favorite=await page.evaluate(()=>JSON.parse(localStorage.getItem('chladni-favorites-v1'))[0]);
 check('A custom favorite stores independent visual settings safely',report.favorite.name==='测试 <流沙> & 曲线'&&report.favorite.settings.glow===52&&report.favorite.settings.musicStyle==='calm'&&!report.favorite.settings.autoLevel&&!report.favorite.settings.autoRefill);
 await page.locator('[data-preset="beat"]').click();await page.locator('#favorite-select').selectOption(report.favorite.id);
 check('Favorite selection restores settings without touching playback volume',await page.evaluate(()=>window.studio.engine.musicStyle==='calm'&&window.studio.engine.count===48000&&document.querySelector('#glow').value==='52'&&!window.studio.audio.autoSensitivity&&!window.studio.engine.autoRefill&&window.studio.audio.volume===.37));
 await app.close();app=null;await launch();
 check('Favorites and the selected look survive an application restart',await page.evaluate(()=>window.studio.state.favorites===1&&window.studio.state.presetId.startsWith('fav-')&&window.studio.engine.musicStyle==='calm'&&document.querySelector('#glow').value==='52'&&!window.studio.audio.autoSensitivity&&!window.studio.engine.autoRefill));
 check('Favorite names render as text',await page.locator('#favorite-select option:checked').textContent()==='测试 <流沙> & 曲线');
 await page.locator('#favorite-delete').click();await page.reload();await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);
 check('Deleting a favorite persists without erasing the current visual settings',await page.evaluate(()=>window.studio.state.favorites===0&&document.querySelector('#glow').value==='52'));
 check('No renderer exceptions in experience upgrades',report.errors.length===0);report.success=true;
 }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-experience-report.json':'experience-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
