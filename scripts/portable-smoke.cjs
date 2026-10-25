const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const version=require('../package.json').version;
const executable=path.join(root,`release/Chladni-Studio-${version}-Windows-x64.exe`);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={executable,checks:[],runtimeUrls:[]};
let child,browser,page;
(async()=>{
  try{
   for(let pass=0;pass<2;pass++){
    const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const temp=path.join(root,'.cache/portable-runtime');fs.mkdirSync(temp,{recursive:true});
    child=spawn(executable,[`--remote-debugging-port=${port}`],{windowsHide:true,stdio:'ignore',env:{...process.env,TEMP:temp,TMP:temp,CHLADNI_USER_DATA:path.join(root,'.cache/portable-profile')}});
    child.on('error',error=>report.spawnError=error.message);
    let endpoint;
    for(let i=0;i<60;i++){
      try{const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)});if(response.ok){endpoint=(await response.json()).webSocketDebuggerUrl;break;}}catch{}
      if(child.exitCode!==null)throw new Error(`Portable launcher exited early: ${child.exitCode}`);
      await delay(1000);
    }
    assert.ok(endpoint,'Portable exe did not open its application');
    browser=await chromium.connectOverCDP(endpoint);
    const pages=browser.contexts().flatMap(context=>context.pages());
    page=pages.find(p=>p.url().includes('index.html'))||pages[0];
    await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>45);
    report.runtimeUrls.push(page.url());
    if(pass===0){await page.evaluate(()=>['chladni-favorites-v1','chladni-settings-v4','chladni-settings-v3','chladni-settings-v2','chladni-lab-v1'].forEach(key=>localStorage.removeItem(key)));await page.reload();await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);}
    report.title=await page.title();report.gpu=await page.evaluate(()=>window.studio.engine.diagnostics());
    report.version=await page.locator('.version').textContent();assert.equal(report.version,version);
    assert.ok(report.title.includes('Chladni Studio'));assert.ok(report.gpu.finite&&report.gpu.glError===0);
    if(pass===0)report.checks.push('Single portable exe self-extracts and opens the packaged application','Packaged GPU visualizer renders without WebGL errors');
    else{
      report.restoredFavorite=await page.evaluate(()=>({id:window.studio.state.presetId,count:window.studio.state.favorites,style:window.studio.engine.musicStyle,glow:document.querySelector('#glow').value,autoLevel:window.studio.audio.autoSensitivity,autoRefill:window.studio.engine.autoRefill,physicalRefill:window.studio.engine.physicalRefill}));
      assert.equal(report.restoredFavorite.id,report.savedFavoriteId);assert.equal(report.restoredFavorite.count,1);assert.equal(report.restoredFavorite.style,'calm');assert.equal(report.restoredFavorite.glow,'53');assert.equal(report.restoredFavorite.autoLevel,false);assert.equal(report.restoredFavorite.autoRefill,false);
      assert.equal(report.restoredFavorite.physicalRefill,false);report.checks.push('Independent physical supply setting survives portable exe relaunch');
      report.labVisual=await page.evaluate(()=>({drive:window.studio.engine.model.drive,map:window.studio.engine.fieldMap,opacity:window.studio.engine.fieldOpacity,speed:window.studio.engine.refillSpeed,playing:window.studio.audio.labPlaying}));
      assert.deepEqual(report.labVisual.drive,report.savedDrive);assert.equal(report.labVisual.map,true);assert.equal(report.labVisual.opacity,.32);assert.equal(report.labVisual.speed,1.25);assert.equal(report.labVisual.playing,false);report.checks.push('Portable experiment visual settings restore without starting audio');
      report.checks.push('Custom favorites survive an actual portable exe relaunch','Saved visual parameters restore in the relaunched portable app');
    }
    await page.screenshot({path:path.join(root,'output/portable-preview.png')});
    await page.locator('#about-button').click();assert.ok(await page.locator('#about-dialog').evaluate(el=>el.open));
    assert.ok((await page.locator('.dialog-version').textContent()).includes(version));
    if(pass===0)report.checks.push('Portable application responds to UI interaction','Header and About dialog show the release version');
    await page.locator('#about-close').click();
    if(pass===1){
      await page.locator('[data-source="lab"]').click();await page.locator('[data-lab-mode="tone"]').click();
      const frequency=await page.evaluate(()=>window.studio.engine.model.groups[1].ratio*35);await page.locator('#lab-frequency-number').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},frequency);await page.locator('#lab-play').click();await page.waitForTimeout(1600);
      report.portableTone=await page.evaluate(()=>({rms:window.studio.audio.stats.rms,weight:window.studio.engine.weights[1],playing:window.studio.audio.labPlaying}));assert.ok(report.portableTone.rms>.03&&report.portableTone.weight>.7&&report.portableTone.playing);report.checks.push('Final portable exe plays real PCM into the predicted disk resonance');
      await page.locator('.lab-section').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(root,'output/lab-controls-preview.png')});await page.locator('#lab-play').click();
    }
    if(pass===0){
      await page.locator('[data-preset="calm"]').click();await page.locator('#glow').evaluate(el=>{el.value=53;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#auto-level').uncheck();await page.locator('#auto-refill').uncheck();
      await page.locator('[data-tuning="physical"]').click();await page.locator('#auto-refill').uncheck();await page.locator('#lab-panel').evaluate(el=>el.open=true);await page.locator('#drive-select').click();
      const point=await page.locator('#visualizer').evaluate(el=>{const r=el.getBoundingClientRect(),e=window.studio.engine;return{x:r.left+r.width*(1+.3*e.scale[0])/2,y:r.top+r.height*(1-.2*e.scale[1])/2};});await page.mouse.click(point.x,point.y);
      await page.waitForFunction(()=>Math.abs(window.studio.engine.model.drive[0]-.3)<.012&&Math.abs(window.studio.engine.model.drive[1]-.2)<.012&&!window.studio.engine.pendingDrive);
      report.savedDrive=await page.evaluate(()=>window.studio.engine.model.drive);assert.ok(await page.evaluate(()=>!!window.studio.engine.driveWorker));report.checks.push('Portable exe builds a new disk drive field through its packaged worker');await page.keyboard.press('Escape');
      await page.locator('#field-map').check();await page.locator('#field-opacity').evaluate(el=>{el.value=32;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#refill-speed').evaluate(el=>{el.value=1.25;el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-tuning="music"]').click();
      await page.locator('#favorite-save').click();await page.locator('#favorite-name').fill('便携版重启收藏');await page.locator('#favorite-confirm').click();
      report.savedFavoriteId=await page.evaluate(()=>window.studio.state.presetId);assert.ok(report.savedFavoriteId.startsWith('fav-'));report.checks.push('Portable application saves a named custom favorite');
    }
    await page.evaluate(()=>window.close()).catch(()=>{});
    for(let i=0;i<30&&child.exitCode===null;i++)await delay(250);
    report.exitCode=child.exitCode;assert.equal(child.exitCode,0);
    if(pass===0)report.checks.push('Portable application exits cleanly');
    await browser?.close().catch(()=>{});browser=null;
   }
    report.success=true;console.log(JSON.stringify(report,null,2));
  }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
  finally{if(page&&!page.isClosed())await page.evaluate(()=>window.close()).catch(()=>{});for(let i=0;i<20&&child?.exitCode===null;i++)await delay(250);await browser?.close().catch(()=>{});if(child&&child.exitCode===null)child.kill();fs.writeFileSync(path.join(root,'output/portable-smoke-report.json'),JSON.stringify(report,null,2));}
})();
