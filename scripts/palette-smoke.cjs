const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
const report={version:require('../package.json').version,checks:[],errors:[],palettes:[]};let app,page;
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log('PASS '+name);};
(async()=>{try{
 const executable=process.env.CHLADNI_TEST_EXE;app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache/palette-profile')},timeout:30000});page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);await page.locator('#reset-settings').click();
 await page.locator('[data-source="lab"]').click();await page.locator('[data-lab-mode="tone"]').click();await page.locator('#lab-frequency-number').evaluate(el=>{el.value=63.1;el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('#volume').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#lab-play').click();await page.locator('#field-map').check();await page.locator('#field-opacity').evaluate(el=>{el.value=45;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(1200);
 const selectors=['#play-button','.slider-label output','.segmented .selected','.version','.eyebrow','#field-mode','.metric strong','.band-meter b','.album-art','.outline-button','.model-info','.cover-fullscreen-button','.favorite-row button','.number-input','.lab-readout','.lab-link'];
 for(const name of ['sand','ice','iris','silver']){
  await page.locator(`[data-palette="${name}"]`).click();await page.waitForTimeout(220);
  const theme=await page.evaluate(selectors=>Object.fromEntries(selectors.map(s=>{const c=getComputedStyle(document.querySelector(s));return[s,[c.color,c.backgroundColor,c.borderTopColor]];})),selectors);
  // Capture actual rendered pixels, including sliders, switches, particles,
  // field map and marker. Palette swatches intentionally keep their own colors.
  const png=await page.screenshot({path:path.join(out,`palette-${name}.png`)});
  const pixels=await page.evaluate(async base64=>{
   const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;
   const sx=c.width/innerWidth,sy=c.height/innerHeight,excluded=[...document.querySelectorAll('.palette-preview')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x*sx,y:r.y*sy,w:r.width*sx,h:r.height*sy};});let warm=0;const mask=new Uint8Array(c.width*c.height);
   for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(excluded.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h))continue;const i=(y*c.width+x)*4,[r,g,b]=[p[i],p[i+1],p[i+2]];if(r>60&&g>45&&r>g*1.08&&g>b*1.12){warm++;mask[y*c.width+x]=1;}}let solidWarm=0;for(let y=1;y<c.height-1;y++)for(let x=1;x<c.width-1;x++){let solid=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)solid=solid&&mask[(y+dy)*c.width+x+dx]===1;if(solid)solidWarm++;}return{warm,solidWarm,width:c.width,height:c.height};
  },png.toString('base64'));
  const state=await page.evaluate(()=>({color:window.studio.engine.color,palette:document.querySelector('[data-palette].selected').dataset.palette,playing:window.studio.audio.labPlaying,gpu:window.studio.engine.diagnostics()}));report.palettes.push({name,theme,pixels,...state});
  check(`${name}: theme reaches controls and the running visualizer`,state.palette===name&&state.playing&&state.gpu.finite&&state.gpu.glError===0);
  if(name!=='sand'){
   const baseline=report.palettes[0].theme;check(`${name}: all sampled accent roles change from amber`,selectors.every(s=>JSON.stringify(theme[s])!==JSON.stringify(baseline[s])));
   check(`${name}: rendered UI and field contain no residual amber areas`,pixels.solidWarm<25);
  }
  await page.locator('#play-button').hover();await page.waitForTimeout(220);const hover=await page.locator('#play-button').evaluate(el=>getComputedStyle(el).backgroundColor);report.palettes.at(-1).hover=hover;
  if(name!=='sand')check(`${name}: playback hover follows its theme`,hover!==report.palettes[0].hover);
 }
 await page.locator('#about-button').click();report.dialog=await page.evaluate(()=>({header:getComputedStyle(document.querySelector('.dialog-header')).color,tip:getComputedStyle(document.querySelector('.dialog-tip strong')).color}));await page.locator('#about-close').click();
 await page.evaluate(fs.readFileSync(path.join(root,'tests/fixtures/alpha9-engine.js'),'utf8').replace('window.ChladniEngine=ChladniEngine','window.PreviousPaletteEngine=ChladniEngine'));
 report.trajectory=await page.evaluate(()=>{
  const engines=[PreviousPaletteEngine,ChladniEngine].map(Type=>{const parent=document.createElement('div');parent.style.cssText='width:320px;height:320px;position:fixed;left:0;top:0;z-index:-1';const c=document.createElement('canvas');c.style.cssText='width:320px;height:320px';parent.append(c);document.body.append(parent);return new Type(c);});let seed;const original=Math.random;
  for(const e of engines){seed=1947;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};e.scatter(16000);e.tuning='physical';e.fieldMap=true;e.fieldOpacity=.45;e.showDrive=true;e.color=[.39,.76,.95];}Math.random=original;
  const audio={modalPowers:new Float32Array(64),energy:.3,active:true,onsetId:1,onsetStrength:.5};audio.modalPowers[2]=.5;for(let i=0;i<180;i++)for(const e of engines)e.frame(1/60,audio);
  const buffers=engines.map(e=>{const g=e.gl,a=new Float32Array(e.count*8);g.bindBuffer(g.ARRAY_BUFFER,e.buffers[e.index]);g.getBufferSubData(g.ARRAY_BUFFER,0,a);g.bindBuffer(g.ARRAY_BUFFER,null);return a;});let delta=0;for(let i=0;i<buffers[0].length;i++)delta=Math.max(delta,Math.abs(buffers[0][i]-buffers[1][i]));return {delta,gpu:engines[1].diagnostics()};
 });check('Palette repair preserves the full physical particle state',report.trajectory.delta<1e-7&&report.trajectory.gpu.glError===0);
 await page.locator('#lab-play').click();await page.locator('#favorite-save').click();await page.locator('#favorite-name').fill('银白配色检查');await page.locator('#favorite-confirm').click();const favorite=await page.evaluate(()=>window.studio.state.presetId);await page.locator('[data-palette="sand"]').click();await page.locator('#favorite-select').selectOption(favorite);
 check('Favorite restoration reapplies the complete selected theme',await page.locator('#play-button').evaluate((el,expected)=>getComputedStyle(el).backgroundColor===expected,report.palettes.at(-1).theme['#play-button'][1]));
 await page.reload();await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);check('Selected palette restores on reload without starting sound',await page.evaluate(()=>document.querySelector('[data-palette].selected').dataset.palette==='silver'&&!window.studio.audio.labPlaying));
 check('No renderer exceptions during palette switching',report.errors.length===0);report.success=true;
 }catch(error){report.success=false;report.failure=error.stack;try{await page.screenshot({path:path.join(out,'palette-failure.png')});}catch{}console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-palette-report.json':'palette-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
