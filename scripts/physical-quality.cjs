const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {featureTrace}=require('./audio-feature-trace.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
const report={version:require('../package.json').version,checks:[],errors:[],contact:[],refill:[]};let app,page;
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log('PASS '+name);};
(async()=>{try{
 const executable=process.env.CHLADNI_TEST_EXE;
 app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache/physical-quality-profile')},timeout:30000});
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);await page.locator('#reset-settings').click();
 await page.evaluate(fs.readFileSync(path.join(root,'tests/fixtures/alpha7-engine.js'),'utf8').replace('window.ChladniEngine=ChladniEngine','window.PreviousChladniEngine=ChladniEngine'));
 await page.evaluate(()=>{
  const wrapper=document.createElement('div');wrapper.id='physical-comparison';wrapper.style.cssText='position:fixed;z-index:9999;top:40px;left:0;width:1340px;background:#101113;padding:16px;display:flex;gap:16px;font:16px sans-serif;color:#dfb974';
  for(const label of ['alpha.7 薄板共振','新版薄板共振']){const panel=document.createElement('div');panel.style.width='646px';const title=document.createElement('div');title.textContent=label;title.style.cssText='height:30px;text-align:center';const canvas=document.createElement('canvas');canvas.style.cssText='width:646px;height:600px;display:block';panel.append(title,canvas);wrapper.append(panel);}document.body.append(wrapper);
  const canvases=wrapper.querySelectorAll('canvas');window.__qualityEngines=[new PreviousChladniEngine(canvases[0]),new ChladniEngine(canvases[1])];
  window.__resetQuality=(shape,count,cluster=false)=>{
   const original=Math.random;for(const e of window.__qualityEngines){e.setShape(shape);let seed=74651;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};e.scatter(count);e.tuning='physical';e.autoRefill=false;e.physicalRefill=false;e.automatic=true;e.hasDriven=true;e.energy=0;e.elapsed=0;e.lastOnset=0;e.weights.fill(0);e.weights[0]=1;
    if(cluster){const gl=e.gl,a=window.__readQuality(e);for(let i=0;i<count;i++){a[i*8]*=.006;a[i*8+1]*=.7;}for(const b of e.buffers){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferSubData(gl.ARRAY_BUFFER,0,a);}gl.bindBuffer(gl.ARRAY_BUFFER,null);}}
   Math.random=original;
  };
  window.__readQuality=e=>{const gl=e.gl,a=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,a);gl.bindBuffer(gl.ARRAY_BUFFER,null);return a;};
  window.__qualityMetrics=e=>{const a=window.__readQuality(e),bins=new Uint32Array(128*128);let alive=0,edge=0;for(let i=0;i<a.length;i+=8)if(a[i+6]<.5){alive++;const x=a[i],y=a[i+1];bins[Math.max(0,Math.min(127,Math.floor((y+1)*64)))*128+Math.max(0,Math.min(127,Math.floor((x+1)*64)))]++;if((e.shape?Math.hypot(x,y):Math.max(Math.abs(x),Math.abs(y)))>.9)edge++;}const sum2=bins.reduce((s,n)=>s+n*n,0);return{alive:alive/e.count,edge:edge/Math.max(1,alive),peak:Math.max(...bins),concentration:sum2/Math.max(1,alive),support:alive*alive/Math.max(1,sum2),gpu:e.diagnostics()};};
 });
 // An overpacked nodal strip catches the original local-mobility/contact coupling.
 await page.evaluate(()=>window.__resetQuality('square',16000,true));
 report.clusterStart=await page.evaluate(()=>window.__qualityEngines.map(window.__qualityMetrics));
 for(let chunk=0;chunk<3;chunk++)await page.evaluate(()=>{const a={modalPowers:new Float32Array(64),energy:.3,active:true,onsetId:0,onsetStrength:0};a.modalPowers[0]=.5;for(let i=0;i<600;i++)for(const e of window.__qualityEngines)e.frame(1/60,a);});
 report.clusterEnd=await page.evaluate(()=>window.__qualityEngines.map(window.__qualityMetrics));console.log(JSON.stringify({cluster:report.clusterEnd.map(({gpu,...m})=>m)}));
 check('Overpacked grains can separate near a node without local detachment',report.clusterEnd[1].concentration<report.clusterEnd[0].concentration*.8&&report.clusterEnd[1].alive>.98&&report.clusterEnd[1].edge<.1);
 await page.locator('#physical-comparison').screenshot({path:path.join(out,'physical-contact-comparison.png')});
 report.brightness=await page.evaluate(()=>{
  const e=window.__qualityEngines[1],gl=e.gl,shaders=gl.getAttachedShaders(e.drawProgram),source=type=>gl.getShaderSource(shaders.find(s=>gl.getShaderParameter(s,gl.SHADER_TYPE)===type));
  const p=e.program(source(gl.VERTEX_SHADER),source(gl.FRAGMENT_SHADER),['brightness']),buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,e.count*4,gl.DYNAMIC_COPY);gl.bindBuffer(gl.ARRAY_BUFFER,null);
  // Artificial high packing tests the shader's actual limiting coefficient.
  const texture=new Float32Array(128*128*4);for(let i=0;i<texture.length;i+=4)texture[i]=1000;
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,e.densityTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,128,gl.RGBA,gl.FLOAT,texture);
  function capture(cap){e.common(p);e.set(p,'uPixelRatio',1);e.set(p,'uCapacity',cap);gl.bindVertexArray(e.vaos[e.index]);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,e.feedback);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,buffer);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,e.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);const a=new Float32Array(e.count);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.getBufferSubData(gl.ARRAY_BUFFER,0,a);gl.bindBuffer(gl.ARRAY_BUFFER,null);return a;}
  const off=capture(1e9),on=capture(8);let min=1,max=0;for(let i=0;i<off.length;i++)if(off[i]>0){const ratio=on[i]/off[i];min=Math.min(min,ratio);max=Math.max(max,ratio);}
  texture.fill(0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,e.densityTexture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,128,128,gl.RGBA,gl.FLOAT,texture);const sparse=capture(8);let sparseDelta=0;for(let i=0;i<off.length;i++)sparseDelta=Math.max(sparseDelta,Math.abs(off[i]-sparse[i]));gl.deleteBuffer(buffer);gl.deleteProgram(p);return {min,max,sparseDelta,glError:gl.getError()};
 });
 check('GPU brightness compression is capped at 15% and leaves sparse sand unchanged',report.brightness.min>=.849999&&report.brightness.max<.850001&&report.brightness.sparseDelta===0&&report.brightness.glError===0);
 // Same original PCM and seed for 96 simulated seconds, with refill disabled.
 const fixture=require('./make-music-fixture.cjs').makeMusicFixture(path.join(out,'多模态节奏示例.wav')),trace=featureTrace(fixture,'physical');
 for(const shape of ['square','circle']){
  await page.evaluate(shape=>window.__resetQuality(shape,64000),shape);
  const input=shape==='square'?trace:featureTrace(fixture,'physical','circle');
  for(let repeat=0;repeat<6;repeat++){
   for(let offset=0;offset<input.length;offset+=240)await page.evaluate(chunk=>{for(const a of chunk)for(const e of window.__qualityEngines)e.frame(1/60,a);},input.slice(offset,offset+240));
  }
  const metrics=await page.evaluate(()=>window.__qualityEngines.map(window.__qualityMetrics));report.contact.push({shape,seconds:96,old:metrics[0],current:metrics[1]});console.log(JSON.stringify({shape,metrics:metrics.map(({gpu,...m})=>m)}));
  check(`${shape}: updated contact reduces long-playback concentration`,metrics[1].concentration<metrics[0].concentration*.7&&metrics[1].peak<metrics[0].peak*.7);
  check(`${shape}: long PCM contact relaxation stays finite and avoids an edge sink`,metrics[1].gpu.finite&&metrics[1].gpu.glError===0&&metrics[1].alive>.5&&metrics[1].edge<.45);
  check(`${shape}: plate response is identical for identical physical PCM`,await page.evaluate(()=>{const [a,b]=window.__qualityEngines;return Math.max(...a.weights.map((w,i)=>Math.abs(w-b.weights[i])))<1e-7&&a.excitation===b.excitation;}));
  await page.locator('#physical-comparison').screenshot({path:path.join(out,`physical-long-${shape}.png`)});
 }
 await page.locator('#physical-comparison').evaluate(el=>el.remove());await page.locator('[data-tuning="physical"]').click();
 check('Physical supply is visibly labelled as assistance and enabled by default',await page.locator('#auto-refill').isChecked()&&(await page.locator('#refill-label').textContent()).includes('辅助撒砂'));
 await page.locator('#auto-refill').uncheck();await page.locator('[data-tuning="music"]').click();
 check('Music refill keeps its independent setting',await page.locator('#auto-refill').isChecked());await page.locator('[data-tuning="physical"]').click();
 check('Physical supply choice survives tuning switches',!await page.locator('#auto-refill').isChecked());
 await page.locator('#favorite-save').click();await page.locator('#favorite-name').fill('自然落砂检查');await page.locator('#favorite-confirm').click();
 report.favorite=await page.evaluate(()=>JSON.parse(localStorage.getItem('chladni-favorites-v1')).at(-1));
 await page.locator('#auto-refill').check();await page.locator('#favorite-select').selectOption(report.favorite.id);
 check('Favorites restore the physical supply flag independently',await page.evaluate(()=>!window.studio.engine.physicalRefill&&window.studio.engine.autoRefill));
 for(const s of [{name:'supply',enabled:true,active:true,alive:.5},{name:'circle',enabled:true,active:true,alive:.5,shape:'circle'},{name:'off',enabled:false,active:true,alive:.5},{name:'silent',enabled:true,active:false,alive:.5},{name:'weak',enabled:true,active:false,alive:.5,weak:true},{name:'manual',enabled:true,active:true,alive:.5,manual:true},{name:'enough',enabled:true,active:true,alive:.95}]){
  const result=await page.evaluate(s=>{
   const e=window.studio.engine;e.setShape(s.shape||'square');e.scatter(16000);e.tuning='physical';e.physicalRefill=s.enabled;e.automatic=!s.manual;e.hasDriven=true;e.weights.fill(0);e.weights[0]=1;e.elapsed=0;e.energy=0;e.lastOnset=0;
   const gl=e.gl;function read(){const a=new Float32Array(e.count*8);gl.bindBuffer(gl.ARRAY_BUFFER,e.buffers[e.index]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,a);gl.bindBuffer(gl.ARRAY_BUFFER,null);return a;}
   const data=read();for(let i=0;i<e.count;i++){if(i>=Math.floor(e.count*s.alive))data[i*8+6]=1;else{data[i*8]*=.7;data[i*8+1]*=.7;}}
   for(const b of e.buffers){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferSubData(gl.ARRAY_BUFFER,0,data);}gl.bindBuffer(gl.ARRAY_BUFFER,null);
   // Input active with very weak force isolates external supply from natural losses.
   const a={modalPowers:new Float32Array(64),active:s.active,energy:0,onsetId:0,onsetStrength:0};if(s.weak)a.modalPowers[0]=1e-8;
   let faded=0,at10=0;for(let i=0;i<3600;i++){e.frame(1/60,a);if(i===599){const b=read();for(let j=0;j<b.length;j+=8){if(b[j+6]<.5)at10++;if(b[j+6]<.5&&b[j+7]<0)faded++;}}}
   const final=read();let alive=0,drift=0,born=0,maxStep=0;for(let i=0;i<e.count;i++){const p=i*8;if(final[p+6]<.5){alive++;if(data[p+6]>.5)born++;}else continue;if(data[p+6]<.5)drift=Math.max(drift,Math.hypot(final[p]-data[p],final[p+1]-data[p+1]));}
   let population=null;if(e.refillEnabled){gl.bindFramebuffer(gl.FRAMEBUFFER,e.populationTargets[1].fbo);const v=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,v);population=v[0];gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
   return{alive:alive/e.count,at10:at10/e.count,born,faded,drift,population,gpu:e.diagnostics()};
  },s);report.refill.push({name:s.name,...result});console.log(JSON.stringify({scenario:s.name,...Object.fromEntries(Object.entries(result).filter(([key])=>key!=='gpu'))}));
  const supplies=s.enabled&&s.active&&!s.manual&&s.alive<.9;
  check(`${s.name}: external supply obeys count, activity and mode limits`,result.gpu.finite&&result.gpu.glError===0&&(supplies?result.alive>.75&&result.alive<.905&&result.at10<.59&&result.faded>0:s.manual?result.born===0:Math.abs(result.alive-s.alive)<.0001&&result.born===0));
  if(!s.active)check(`${s.name}: resting grains remain still`,result.drift===0);
  if(result.population!==null)check(`${s.name}: GPU population estimate matches full grain count`,Math.abs(result.population-result.alive)<.002);
 }
 await page.reload();await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);
 check('Stored physical supply choice survives reload',await page.evaluate(()=>!JSON.parse(localStorage.getItem('chladni-favorites-v1')).at(-1).settings.physicalRefill));
 check('No renderer errors during physical quality checks',report.errors.length===0);report.success=true;
 }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-physical-quality-report.json':'physical-quality-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
