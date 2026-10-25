const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
fs.mkdirSync(out,{recursive:true});
function wav(name,frequency,duration=12){
  const rate=48000,count=rate*duration,buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)buffer.writeInt16LE(Math.round(Math.sin(i/rate*frequency*2*Math.PI)*10000*Math.min(1,i/1000,(count-i)/1000)),44+i*2);
  const file=path.join(out,name);fs.writeFileSync(file,buffer);return file;
}
const tone220=wav('共振测试 220Hz.wav',220),tone440=wav('Test 440Hz.wav',440);
const report={version:require('../package.json').version,checks:[],errors:[],startedAt:new Date().toISOString()};
let app,page;
const check=(name,value)=>{assert.ok(value,name);report.checks.push(name);console.log(`PASS ${name}`);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  try{
    const executable=process.env.CHLADNI_TEST_EXE;
    app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[root],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache',executable?'packaged-test-profile':'test-profile')},timeout:30000});
    page=await app.firstWindow();page.on('pageerror',error=>report.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
    await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>5);
    await page.locator('#reset-settings').click();
    const initial=await page.evaluate(()=>window.studio.engine.diagnostics());
    await delay(3500);
    const settled=await page.evaluate(()=>window.studio.engine.diagnostics());
    report.gpu={initial,settled};
    report.engine=await page.evaluate(()=>{const e=window.studio.engine;return {elapsed:e.elapsed,speed:e.speed,shape:e.shape,groups:e.model.groups.length,modalCount:e.model.modalCount,tuning:e.tuning};});
    await page.screenshot({path:path.join(out,'preview.png')});
    check('GPU particles are finite and WebGL has no errors',settled.finite&&settled.glError===0);
    check('Idle sand rests without artificial excitation',settled.meanSpeed<1e-8&&settled.excitation===0&&Math.abs(settled.meanAmplitude-initial.meanAmplitude)<1e-6);
    await page.screenshot({path:path.join(out,'preview.png')});
    const fit=await page.evaluate(()=>({body:document.body.scrollWidth<=innerWidth,player:document.querySelector('.player').getBoundingClientRect().bottom<=innerHeight,canvas:document.querySelector('#visualizer').getBoundingClientRect().height>200}));
    check('Window layout fits and visualizer is visible',fit.body&&fit.player&&fit.canvas);

    // Exercise the native dialog integration while choosing deterministic fixtures.
    await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});},[tone220,tone440]);
    await page.locator('#import-button').click();
    await page.waitForFunction(()=>window.studio.state.queue===2&&!document.querySelector('#audio').paused);
    await delay(800);
    const fileStats=await page.evaluate(()=>({state:window.studio.state,frequency:window.studio.audio.stats.frequency,energy:window.studio.audio.stats.energy,duration:document.querySelector('#audio').duration}));
    report.fileStats=fileStats;
    check('Imported Unicode filenames play through the local media protocol',fileStats.state.source==='file'&&fileStats.duration===12);
    check('220 Hz file drives real FFT analysis',Math.abs(fileStats.frequency-220)<5&&fileStats.energy>.05);
    await page.screenshot({path:path.join(out,'player.png')});
    await page.locator('#play-button').click();
    check('Pause stops file playback',await page.locator('#audio').evaluate(el=>el.paused));
    await page.locator('#seek').evaluate(el=>{el.value=500;el.dispatchEvent(new Event('input',{bubbles:true}));});
    check('Seeking reaches the middle of the file',Math.abs(await page.locator('#audio').evaluate(el=>el.currentTime)-6)<.3);
    await page.locator('#volume').evaluate(el=>{el.value=35;el.dispatchEvent(new Event('input',{bubbles:true}));});
    check('Volume controls output gain',Math.abs(await page.evaluate(()=>window.studio.audio.volume)-.35)<.001);
    await page.locator('#loop-button').click();
    check('Loop toggle reaches the actual player',await page.locator('#audio').evaluate(el=>el.loop));
    await page.locator('#next-button').click();await delay(650);
    check('Next track changes both audio and analysis',await page.evaluate(()=>window.studio.state.currentIndex===1&&Math.abs(window.studio.audio.stats.frequency-440)<6));
    await page.locator('#queue-button').click();check('Queue displays both imported tracks',await page.locator('.queue-track').count()===2);
    await page.locator('#queue-close').click();
    // Use a filesystem-backed File and dispatch an actual drop through the preload bridge.
    await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='qa-file-input';input.hidden=true;document.body.append(input);});
    await page.locator('#qa-file-input').setInputFiles(tone220);
    await page.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(document.querySelector('#qa-file-input').files[0]);document.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));});
    await page.waitForFunction(()=>window.studio.state.currentIndex===0&&!document.querySelector('#audio').paused);
    check('Dropping an audio file imports through the real File bridge',await page.evaluate(()=>window.studio.state.queue===2&&window.studio.state.currentIndex===0));

    await page.locator('[data-palette="ice"]').click();
    await page.locator('[data-shape="circle"]').click();await delay(1200);
    check('Palette and circular plate controls update the renderer',await page.evaluate(()=>window.studio.engine.shape===1&&window.studio.engine.color[2]===.95));
    await page.screenshot({path:path.join(out,'circle.png')});
    await page.locator('#mode-next').click();
    check('Manual modal change disables automatic changes',await page.evaluate(()=>!window.studio.state.automatic));
    await page.locator('#density').evaluate(el=>{el.value=32000;el.dispatchEvent(new Event('change',{bubbles:true}));});
    check('Particle density updates GPU buffers',await page.evaluate(()=>window.studio.engine.count===32000));
    await page.locator('#reset-settings').click();
    await page.locator('[data-source="demo"]').click();await page.locator('#source-action').click();await delay(900);
    check('Built-in resonance tone has an actual audio signal',await page.evaluate(()=>window.studio.audio.demoPlaying&&window.studio.audio.stats.energy>.02));
    await page.locator('#source-action').click();

    // A separate window emits a known tone through Windows, not into the app analyser.
    await app.evaluate(async({BrowserWindow})=>{
      const toneWindow=new BrowserWindow({width:150,height:100,show:false,webPreferences:{backgroundThrottling:false}});
      global.__chladniToneWindow=toneWindow;
      await toneWindow.loadURL('data:text/html,<title>System loopback test</title>');
      await toneWindow.webContents.executeJavaScript(`window.ctx=new AudioContext();window.osc=ctx.createOscillator();window.gain=ctx.createGain();osc.frequency.value=330;gain.gain.value=0.15;osc.connect(gain);gain.connect(ctx.destination);osc.start();ctx.resume();`);
    });
    await page.locator('[data-source="system"]').click();await page.locator('#source-action').click();
    await page.waitForFunction(()=>window.studio.state.listening,{timeout:15000});await delay(2000);
    const systemStats=await page.evaluate(()=>({state:window.studio.state,frequency:window.studio.audio.stats.frequency,energy:window.studio.audio.stats.energy,tracks:window.studio.audio.capture?.getTracks().map(t=>({kind:t.kind,state:t.readyState}))}));
    report.systemStats=systemStats;
    check('Windows system loopback connects and retains audio only',systemStats.state.listening&&systemStats.tracks.length===1&&systemStats.tracks[0].kind==='audio');
    check('External system playback drives 330 Hz analysis',Math.abs(systemStats.frequency-330)<8&&systemStats.energy>.02);
    await page.screenshot({path:path.join(out,'system-audio.png')});
    await page.locator('#source-action').click();check('Stop releases system capture',await page.evaluate(()=>!window.studio.state.listening));
    await app.evaluate(()=>{global.__chladniToneWindow?.close();});

    // Fullscreen and exit use native window state and the immersive layout.
    await page.locator('#fullscreen-button').click();await page.waitForFunction(()=>window.studio.state.fullscreen);
    check('Fullscreen enters immersive mode',await page.locator('body').evaluate(el=>el.classList.contains('immersive')));
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.studio.state.fullscreen);
    await page.locator('#about-button').click();check('About dialog opens',await page.locator('#about-dialog').evaluate(el=>el.open));await page.locator('#about-close').click();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1060,720));
    await delay(250);
    check('Minimum window size keeps the player and canvas usable',await page.evaluate(()=>document.querySelector('.player').getBoundingClientRect().bottom<=innerHeight&&document.querySelector('#visualizer').getBoundingClientRect().height>200));
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
    // Corrupt audio must produce feedback rather than break the app.
    const bad=path.join(out,'corrupt.mp3');fs.writeFileSync(bad,'not an audio file');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},bad);
    await page.locator('#import-button').click();await delay(500);
    check('Invalid audio produces a visible error',await page.locator('#toast').isVisible());
    await page.locator('#reset-settings').click();await page.locator('[data-source="demo"]').click();
    check('Application recovers after a decoding error',await page.evaluate(()=>window.studio.engine.diagnostics().finite));
    // Screenshot saving is tested through the same native save flow.
    const snapshot=path.join(out,'exported-sand.png');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},snapshot);
    await page.locator('#snapshot-button').click();await delay(300);
    check('PNG export writes a real image',fs.existsSync(snapshot)&&fs.statSync(snapshot).size>1000);
    check('No renderer exceptions occurred',report.errors.length===0);
    report.success=true;
  }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
  finally{
    fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-smoke-report.json':'smoke-report.json'),JSON.stringify(report,null,2));
    if(app)await app.close();
  }
})();
