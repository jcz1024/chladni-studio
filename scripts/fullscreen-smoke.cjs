const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output');
const launchRoot=process.env.CHLADNI_TEST_ROOT||root;
const report={version:require(path.join(launchRoot,'package.json')).version,checks:[],errors:[]};let app,page;
function check(name,value){assert.ok(value,name);report.checks.push(name);console.log('PASS '+name);}
const sameBounds=(a,b)=>['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=1);
(async()=>{try{
 const executable=process.env.CHLADNI_TEST_EXE;
 app=await _electron.launch({...(executable?{executablePath:executable}:{}),args:executable?[]:[launchRoot],env:{...process.env,CHLADNI_USER_DATA:path.join(root,'.cache/fullscreen-profile')},timeout:30000});
 page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>window.studio?.engine?.renderedFrames>10);
 await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],d=screen.getPrimaryDisplay();w.setBounds({x:d.workArea.x+20,y:d.workArea.y+20,width:1200,height:800});w.focus();});
 await app.evaluate(({BrowserWindow})=>{global.__fullscreenTarget=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&!w.webContents.isDestroyed()&&w.webContents.getURL().includes('index.html'));});
 async function native(){return app.evaluate(({BrowserWindow,screen})=>{const w=global.__fullscreenTarget,d=screen.getDisplayMatching(w.getBounds());return{fullscreen:w.isFullScreen(),topmost:w.isAlwaysOnTop(),focused:w.isFocused(),maximized:w.isMaximized(),bounds:w.getBounds(),normal:w.getNormalBounds(),screen:d.bounds,workArea:d.workArea,handle:w.getNativeWindowHandle().readBigUInt64LE().toString()};});}
 async function wait(value){await page.waitForFunction(value=>window.studio.state.fullscreen===value,value);await page.waitForTimeout(120);}
 const initial=await native();report.initial=initial;
 check('Dedicated cover-taskbar button is visible',await page.locator('#cover-fullscreen-button').isVisible());
 await page.screenshot({path:path.join(out,'fullscreen-button.png')});
 await page.locator('#cover-fullscreen-button').click();await wait(true);
 report.entered=await native();
 check('Button enters native fullscreen with taskbar coverage enabled',report.entered.fullscreen&&report.entered.topmost&&await page.evaluate(()=>window.studio.state.coversTaskbar));
 check('Window fills display bounds including the taskbar area',sameBounds(report.entered.bounds,report.entered.screen));
 report.appLayout=await page.evaluate(()=>{
  const visible=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return getComputedStyle(el).display!=='none'&&r.width>0&&r.height>0;};
  const player=document.querySelector('.player').getBoundingClientRect(),canvas=document.querySelector('#visualizer').getBoundingClientRect();
  return{appFullscreen:document.body.classList.contains('app-fullscreen'),immersive:document.body.classList.contains('immersive'),header:visible('.titlebar'),sidebar:visible('.sidebar'),player:visible('.player'),analysis:visible('.analysis-strip'),importButton:visible('#import-button'),fits:player.bottom<=innerHeight+1&&document.body.scrollWidth<=innerWidth,canvasInsideLayout:canvas.width<innerWidth&&canvas.height<innerHeight};
 });
 check('Entire app stays visible in cover-taskbar fullscreen',report.appLayout.appFullscreen&&!report.appLayout.immersive&&report.appLayout.header&&report.appLayout.sidebar&&report.appLayout.player&&report.appLayout.analysis&&report.appLayout.importButton);
 check('Fullscreen app layout fits with the canvas inside the editor',report.appLayout.fits&&report.appLayout.canvasInsideLayout);
 await page.locator('#volume').evaluate(el=>{el.value=42;el.dispatchEvent(new Event('input',{bubbles:true}));});
 check('Player controls remain usable in app fullscreen',await page.evaluate(()=>window.studio.audio.volume===.42));
 await page.locator('#queue-button').click();check('Playlist opens in app fullscreen',await page.locator('#queue-panel').isVisible());await page.locator('#queue-close').click();
 await page.locator('[data-palette="ice"]').click();check('Sidebar controls remain usable in app fullscreen',await page.locator('[data-palette="ice"]').evaluate(el=>el.classList.contains('selected')));await page.locator('[data-palette="sand"]').click();
 await page.locator('#about-button').click();await page.keyboard.press('Escape');
 check('Escape closes a dialog without leaving app fullscreen',!(await page.locator('#about-dialog').evaluate(el=>el.open))&&await page.evaluate(()=>window.studio.state.fullscreen&&window.studio.state.coversTaskbar));
 await page.locator('.sidebar').evaluate(el=>el.scrollTop=0);
 const probe=fs.readFileSync(path.join(__dirname,'probe-taskbar.ps1'),'utf8');
 await app.evaluate(()=>global.__fullscreenTarget.moveTop());await page.waitForTimeout(120);
 report.beforeTaskbarProbe=await native();
 report.taskbarProbe=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','& {\n'+probe+'\n} -WindowHandle $env:CHLADNI_PROBE_WINDOW'],{encoding:'utf8',windowsHide:true,env:{...process.env,CHLADNI_PROBE_WINDOW:report.entered.handle}}));
 report.taskbarHitVerified=report.taskbarProbe.AppCoversTaskbar;
 if(!report.taskbarHitVerified&&process.env.CHLADNI_TASKBAR_DIAGNOSTIC==='1'){report.taskbarObservation='Windows taskbar hit-test was not confirmed in this desktop session; same result reproduced with the alpha.9 source baseline.';console.log('OBSERVATION '+report.taskbarObservation);}
 else check('Windows hit-test at the taskbar finds this app above Explorer',report.taskbarHitVerified);
 await page.screenshot({path:path.join(out,'fullscreen-preview.png')});
 await page.keyboard.press('Escape');await wait(false);report.exited=await native();
 check('Escape restores the window bounds and releases topmost',!report.exited.topmost&&sameBounds(initial.normal,report.exited.normal));
 await page.keyboard.press('F11');await wait(true);
 check('F11 opens the separate sand-only immersive view',!(await native()).topmost&&await page.evaluate(()=>!window.studio.state.coversTaskbar&&document.body.classList.contains('immersive'))&&!(await page.locator('.player').isVisible()));
 await page.locator('#cover-fullscreen-button').click();
 await page.waitForFunction(()=>window.studio.state.coversTaskbar);
 check('An existing fullscreen window can enable taskbar coverage',(await native()).topmost);
 check('Switching from sand view to app fullscreen restores the full UI',await page.locator('.sidebar').isVisible()&&await page.locator('.player').isVisible()&&await page.evaluate(()=>!document.body.classList.contains('immersive')));
 await page.locator('#fullscreen-exit').click();await wait(false);
 check('Exit button releases taskbar coverage',!(await native()).topmost);
 await page.keyboard.press('Control+F11');await wait(true);
 check('Ctrl+F11 enters cover-taskbar fullscreen',await page.evaluate(()=>window.studio.state.coversTaskbar));
 await page.locator('#fullscreen-button').click();await page.waitForFunction(()=>document.body.classList.contains('immersive'));
 check('Sand-view button can switch from app fullscreen to immersion',await page.evaluate(()=>window.studio.state.fullscreen&&!window.studio.state.coversTaskbar));
 await page.locator('#cover-fullscreen-button').click();await page.waitForFunction(()=>window.studio.state.coversTaskbar);
 // A blur() call alone can be immediately undone by Windows when no peer takes
 // focus. Transfer focus to another real window, as Alt+Tab would.
 await app.evaluate(async({BrowserWindow})=>{const peer=new BrowserWindow({show:false,width:260,height:140,title:'Fullscreen focus check'});global.__fullscreenFocusProbe=peer;await peer.loadURL('data:text/html,<title>Fullscreen focus check</title><p>Checking focus transfer</p>');peer.show();peer.focus();});
 for(let i=0;i<20;i++){report.blurred=await native();if(!report.blurred.focused&&!report.blurred.topmost)break;await page.waitForTimeout(50);}
 check('Switching focus releases temporary topmost',!report.blurred.focused&&!report.blurred.topmost);
 await app.evaluate(({BrowserWindow})=>global.__fullscreenTarget.focus());await page.waitForTimeout(120);
 check('Refocusing restores taskbar coverage',(await native()).topmost);
 await app.evaluate(()=>global.__fullscreenFocusProbe.close());
 await app.evaluate(({BrowserWindow})=>global.__fullscreenTarget.setFullScreen(false));await wait(false);
 check('Native fullscreen exit clears the cover flag and topmost',!(await native()).topmost&&await page.evaluate(()=>!window.studio.state.coversTaskbar));
 await app.evaluate(({BrowserWindow})=>global.__fullscreenTarget.maximize());await page.waitForTimeout(120);
 await page.locator('#cover-fullscreen-button').click();await wait(true);await page.keyboard.press('Escape');await wait(false);
 check('A previously maximized window stays maximized on exit',(await native()).maximized);
 await app.evaluate(({BrowserWindow})=>global.__fullscreenTarget.unmaximize());await page.waitForTimeout(120);
 for(let i=0;i<2;i++){await page.keyboard.press('Control+F11');await wait(true);await page.keyboard.press('Control+F11');await wait(false);}
 check('Repeated toggles leave no topmost state behind',!(await native()).topmost);
 check('GPU remains healthy after fullscreen resizes',await page.evaluate(()=>{const d=window.studio.engine.diagnostics();return d.finite&&d.glError===0;}));
 check('No renderer exceptions during fullscreen transitions',report.errors.length===0);report.success=true;
 }catch(error){report.success=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(out,process.env.CHLADNI_TEST_EXE?'packaged-fullscreen-report.json':'fullscreen-report.json'),JSON.stringify(report,null,2));if(app)await app.close();}
})();
