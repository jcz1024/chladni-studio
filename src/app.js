(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const audioElement = $('audio');
  const audio = new AudioEngine(audioElement);
  let engine;
  const palettes = {
    sand: { color:[.91,.73,.43], accent:'#dfb974', rgb:'223,185,116' },
    ice: { color:[.39,.76,.95], accent:'#7bbfdc', rgb:'123,191,220' },
    iris: { color:[.72,.53,.98], accent:'#b89ce8', rgb:'184,156,232' },
    silver: { color:[.83,.87,.9], accent:'#c3cdd4', rgb:'195,205,212' }
  };
  let source = 'demo', modeIndex = 4, automatic = true, fullscreen = false, coversTaskbar = false;
  let queue = [], currentIndex = -1, looping = false, sourceBusy = false;
  let toastTimer, dragCounter = 0, color = palettes.sand;
  let stats = audio.stats;
  let activePresetId='geometry',applyingPreset=false,favorites=[];
  let driveSelecting=false,driveBusy=false;
  try{favorites=VisualPresets.parseFavorites(localStorage.getItem('chladni-favorites-v1'));}catch{}
  const showError = message => { $('canvas-error').textContent = message; $('canvas-error').hidden = false; };
  try { engine = new ChladniEngine($('visualizer')); engine.onError = showError; }
  catch (error) { showError(`图形引擎启动失败：${error.message}`); console.error(error); }
  try{audio.setLabOptions(ExperimentTools.sanitize(JSON.parse(localStorage.getItem('chladni-lab-v1')||'{}')));}catch{}

  function toast(message, timeout=4500) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => $('toast').hidden = true, timeout);
  }
  audio.onError=message=>toast(message,8000);
  function icon(element, name) { element.querySelector('use').setAttribute('href', `#i-${name}`); }
  function rangeFill(element) {
    const min = Number(element.min || 0), max = Number(element.max || 100);
    element.style.setProperty('--fill', `${(Number(element.value)-min)/(max-min)*100}%`);
  }
  document.querySelectorAll('input[type="range"]').forEach(input => { rangeFill(input); input.addEventListener('input', () => rangeFill(input)); });

  function updateSourceUI() {
    document.querySelectorAll('[data-source]').forEach(button => {
      button.classList.toggle('selected', button.dataset.source === source);
      button.setAttribute('aria-selected', button.dataset.source === source ? 'true' : 'false');
    });
    const listening = !!audio.capture;
    const playing = source === 'file' ? !audioElement.paused : source === 'demo' ? audio.demoPlaying : source==='lab'?audio.labPlaying:listening;
    $('source-action').disabled = sourceBusy;
    if (source === 'system') {
      $('source-description').innerHTML = listening ? '正在监听电脑默认播放设备。<br>播放任意音乐，观察砂粒响应。' : '让电脑正在播放的声音驱动砂纹。<br>支持浏览器、音乐软件与游戏音频。';
      $('source-action').querySelector('span').textContent = listening ? '停止监听' : '开始监听系统声音';
      icon($('source-action'), listening ? 'pause' : 'screen');
      $('track-title').textContent = '系统声音'; $('track-subtitle').textContent = listening ? '实时输入 · Windows 默认播放设备' : '点击播放按钮或「开始监听」';
    } else if (source === 'file') {
      $('source-description').innerHTML = '导入你喜爱的音乐，边听边看。<br>支持 MP3 / WAV / FLAC / OGG 等。';
      $('source-action').querySelector('span').textContent = '选择音频文件'; icon($('source-action'), 'plus');
      const track = queue[currentIndex];
      $('track-title').textContent = track?.name || '还没有音乐';
      $('track-subtitle').textContent = track ? `${track.extension} · 本地音频 · ${queue.length} 首音乐` : '点击导入音乐，或把音频拖进窗口';
    } else if(source==='lab'){
      $('source-description').innerHTML='持续纯音或缓慢扫频，探索共振。<br>真实音频进入薄板振动计算。';
      $('source-action').querySelector('span').textContent=audio.labPlaying?'停止实验音':'开始实验音';icon($('source-action'),audio.labPlaying?'pause':'play');
      $('track-title').textContent=audio.labOptions.mode==='tone'?'共振实验 · 持续纯音':'共振实验 · 自动扫频';$('track-subtitle').textContent='实验音强度驱动振动 · 播放音量仅调节听感';
    } else {
      $('source-description').innerHTML = '从一粒沙开始，探索声音的几何。<br>试听内置共振音，或接入你的音乐。';
      $('source-action').querySelector('span').textContent = audio.demoPlaying ? '停止共振音' : '试听共振音'; icon($('source-action'), audio.demoPlaying ? 'pause' : 'play');
      $('track-title').textContent = '共振实验室'; $('track-subtitle').textContent = audio.demoPlaying ? '内置合成音 · 缓慢变化的和声' : '导入一首音乐，开始看见声音';
    }
    icon($('play-button'), playing ? 'pause' : 'play');
    $('play-button').classList.toggle('playing', playing);
    $('play-button').setAttribute('aria-label', playing ? '暂停' : '播放');
    $('prev-button').disabled = source !== 'file' || queue.length < 2;
    $('next-button').disabled = source !== 'file' || queue.length < 2;
    $('loop-button').disabled = source !== 'file';
    $('volume').disabled = source === 'system';
    $('seek').disabled = source !== 'file' || !Number.isFinite(audioElement.duration);
    if (source !== 'file') {
      $('seek').value = 0; rangeFill($('seek')); $('current-time').textContent = '0:00'; $('duration').textContent = source === 'system' ? 'LIVE' : source==='lab'?(audio.labOptions.mode==='tone'?'TONE':audio.labOptions.loop?'SWEEP ↔':audio.labOptions.duration+'s'):'∞';
    }
    $('live-dot').classList.toggle('active', playing);
    $('status-badge').classList.toggle('active', playing);
    $('status-text').textContent = source==='lab'?(playing?'实验音正在激振':'实验音待机'):source === 'system' ? listening ? '正在监听系统声音' : '等待系统音频' : source === 'file' ? playing ? '音乐正在共振' : '播放器已暂停' : playing ? '共振音试听中' : '共振预览';
    $('field-caption').textContent = source==='lab'?'RESONANCE LAB · 纯音与扫频':source === 'system' ? listening ? 'SYSTEM AUDIO · 实时回环' : 'SYSTEM AUDIO · 等待连接' : source === 'file' ? 'LOCAL AUDIO · 音乐共振' : audio.demoPlaying ? 'RESONANCE TONE · 合成共振音' : '驻波实验 · 静音预览';
    $('lab-play').textContent=audio.labPlaying?'停止实验音':audio.labOptions.mode==='tone'?'开始纯音':'开始扫频';
  }
  async function setSource(next) {
    if (sourceBusy) return false;
    if (source === next) return true;
    sourceBusy = true; updateSourceUI();
    try { await audio.switchSource(next); source = next;if(next==='lab'){$('lab-panel').open=true;prepareLab();}return true; }
    catch(error) { toast(`音频初始化失败：${error.message}`); return false; }
    finally { sourceBusy = false; updateSourceUI(); }
  }
  document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', async () => {
    const success = await setSource(button.dataset.source);
    if (success && source === 'file' && !queue.length) await importAudio();
  }));
  async function toggleCapture() {
    if (sourceBusy) return;
    if (audio.capture) { audio.stopCapture(); updateSourceUI(); return; }
    sourceBusy = true; updateSourceUI(); $('source-action').querySelector('span').textContent = '正在连接…';
    try { await audio.startCapture(); toast('已连接系统声音。请在其他软件中播放音乐。'); }
    catch(error) { toast(`系统声音连接失败：${error.message}。请确认有可用的扬声器或耳机。`, 7500); }
    finally { sourceBusy = false; updateSourceUI(); }
  }
  audio.onCaptureEnded = () => { updateSourceUI(); toast('系统声音连接已结束，请重新开始监听。'); };
  async function togglePlay() {
    if (sourceBusy) return;
    try {
      if (source === 'system') return await toggleCapture();
      if(source==='lab'){if(audio.labPlaying)audio.stopLab();else{prepareLab();await audio.startLab();}updateSourceUI();return;}
      if (source === 'file') {
        if (!queue.length) return await importAudio();
        if (currentIndex < 0) return await loadTrack(0);
        if (audioElement.paused) { await audio.init(); await audioElement.play(); }
        else audioElement.pause();
      } else {
        if (audio.demoPlaying) audio.stopDemo();
        else await audio.startDemo();
      }
    } catch(error) { toast(`无法播放：${error.message}`); }
    updateSourceUI();
  }
  $('source-action').addEventListener('click', () => source === 'file' ? importAudio() : togglePlay());
  $('play-button').addEventListener('click', togglePlay);
  $('import-button').addEventListener('click', importAudio);
  audio.onLabEnded=updateSourceUI;
  function prepareLab(){automatic=true;$('auto-mode').checked=true;if(engine)engine.automatic=true;selectTuning('physical');markModified();saveSettings();}
  $('lab-play').addEventListener('click',async()=>{if(source!=='lab'&&!await setSource('lab'))return;await togglePlay();});
  function renderLabControls(){
    const s=audio.labOptions;document.querySelectorAll('[data-lab-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.labMode===s.mode);b.setAttribute('aria-pressed',String(b.dataset.labMode===s.mode));});
    $('lab-tone-controls').hidden=s.mode!=='tone';$('lab-sweep-controls').hidden=s.mode!=='sweep';
    $('lab-frequency').value=s.frequency;$('lab-frequency-number').value=s.frequency;$('lab-start').value=s.start;$('lab-end').value=s.end;$('lab-duration').value=s.duration;$('lab-loop').checked=s.loop;$('lab-level').value=s.level;
    $('lab-duration-value').textContent=s.duration+' 秒';$('lab-level-value').textContent=s.level+'%';for(const id of ['lab-frequency','lab-duration','lab-level'])rangeFill($(id));updateSourceUI();
  }
  function changeLab(options){audio.setLabOptions(options);try{localStorage.setItem('chladni-lab-v1',JSON.stringify(audio.labOptions));}catch{}renderLabControls();}
  document.querySelectorAll('[data-lab-mode]').forEach(b=>b.addEventListener('click',()=>changeLab({mode:b.dataset.labMode})));
  $('lab-frequency').addEventListener('input',()=>$('lab-frequency-number').value=$('lab-frequency').value);
  for(const id of ['lab-frequency','lab-frequency-number'])$(id).addEventListener('change',()=>changeLab({frequency:Number($(id).value)}));
  for(const [id,key]of [['lab-start','start'],['lab-end','end'],['lab-duration','duration'],['lab-level','level']])$(id).addEventListener('change',()=>changeLab({[key]:Number($(id).value)}));
  $('lab-duration').addEventListener('input',()=>$('lab-duration-value').textContent=$('lab-duration').value+' 秒');$('lab-level').addEventListener('input',()=>$('lab-level-value').textContent=$('lab-level').value+'%');
  $('lab-loop').addEventListener('change',()=>changeLab({loop:$('lab-loop').checked}));
  $('lab-match').addEventListener('click',()=>{if(!engine)return;const powers=audio.stats.modalPowers,max=Math.max(...powers),index=max>1e-10?powers.indexOf(max):modeIndex;changeLab({mode:'tone',frequency:engine.model.groups[index].ratio*engine.fundamental});});
  function refreshDriveUI(){
    if(!engine)return;const physical=engine.tuning==='physical';engine.showDrive=physical&&($('lab-panel').open||driveSelecting);
    $('drive-position').textContent=`激振点 (${engine.model.drive.map(v=>v.toFixed(3)).join(', ')})`;
    $('drive-select').setAttribute('aria-pressed',String(driveSelecting));$('drive-select').textContent=driveSelecting?'结束点选':'点选激振点';$('drive-select').disabled=!physical||driveBusy;$('drive-reset').disabled=driveBusy;
    $('visualizer').classList.toggle('picking-drive',driveSelecting);$('drive-hint').textContent=driveBusy?'正在计算振型，音乐继续播放…':driveSelecting?'在板面点击设置激振点，Esc 结束点选。':'点选后在板面点击，改变激振位置；适用于全部音频来源。';
    $('field-map').disabled=!physical;$('field-map').checked=physical&&engine.fieldMap;$('field-opacity').disabled=!physical||!engine.fieldMap;$('field-legend').hidden=!physical||!engine.fieldMap||engine.fieldOpacity===0;
  }
  $('lab-panel').addEventListener('toggle',refreshDriveUI);
  $('drive-select').addEventListener('click',()=>{driveSelecting=!driveSelecting;refreshDriveUI();});
  async function changeDrive(point){
    if(!engine||driveBusy)return;driveBusy=true;refreshDriveUI();
    try{if(await engine.setDrive(point)){modeIndex=engine.previewIndex;configureModel();markModified();saveSettings();}}
    catch(error){toast('激振点未能更新：'+error.message);}finally{driveBusy=false;refreshDriveUI();}
  }
  $('drive-reset').addEventListener('click',()=>changeDrive([.18,.11]));
  $('visualizer').addEventListener('click',event=>{if(!driveSelecting||driveBusy||!engine)return;const rect=$('visualizer').getBoundingClientRect(),x=((event.clientX-rect.left)/rect.width*2-1)/engine.scale[0],y=(1-(event.clientY-rect.top)/rect.height*2)/engine.scale[1];if((engine.shape?Math.hypot(x,y):Math.max(Math.abs(x),Math.abs(y)))>1){toast('请在振动板内部选择激振位置');return;}changeDrive(Math.hypot(x,y)<.012?[0,0]:[x,y]);});
  $('field-map').addEventListener('change',()=>{if(engine)engine.fieldMap=$('field-map').checked;refreshDriveUI();markModified();saveSettings();});
  $('field-opacity').addEventListener('input',()=>{if(engine)engine.fieldOpacity=Number($('field-opacity').value)/100;$('field-opacity-value').textContent=$('field-opacity').value+'%';refreshDriveUI();markModified();saveSettings();});
  $('refill-speed').addEventListener('input',()=>{if(engine)engine.refillSpeed=Number($('refill-speed').value);$('refill-speed-value').textContent=Number($('refill-speed').value).toFixed(2)+'×';markModified();saveSettings();});
  renderLabControls();
  async function importAudio() {
    try { const tracks = await window.desktop.openAudio(); if (tracks.length) await addTracks(tracks); }
    catch(error) { toast(`导入失败：${error.message}`); }
  }
  async function addTracks(tracks) {
    if (!tracks.length) { toast('未找到可读取的音频文件，请选择 MP3、WAV、FLAC、OGG 等文件。'); return; }
    const initialLength = queue.length;
    for (const track of tracks) if (!queue.some(existing => existing.id === track.id)) queue.push(track);
    const firstIndex = queue.findIndex(track => track.id === tracks[0].id);
    renderQueue(); await loadTrack(firstIndex);
    toast(`已导入 ${queue.length-initialLength} 首音乐 · 正在播放 ${tracks[0].name}`);
  }
  let loadVersion = 0;
  async function loadTrack(index, autoplay = true) {
    if (index < 0 || index >= queue.length) return;
    if (!await setSource('file')) return;
    const version = ++loadVersion;
    currentIndex = index; audioElement.pause();
    audioElement.src = queue[index].url; audioElement.loop = looping; audioElement.load();
    $('seek').value = 0; rangeFill($('seek')); renderQueue(); updateSourceUI();
    if (autoplay) {
      try { await audio.init(); if (version === loadVersion) await audioElement.play(); }
      catch(error) { if (version === loadVersion && error.name !== 'AbortError') toast('这个文件无法解码，请尝试 MP3、WAV 或 FLAC 格式。'); }
      updateSourceUI();
    }
  }
  $('prev-button').addEventListener('click', () => loadTrack((currentIndex - 1 + queue.length) % queue.length));
  $('next-button').addEventListener('click', () => loadTrack((currentIndex + 1) % queue.length));
  $('loop-button').addEventListener('click', () => {
    looping = !looping; audioElement.loop = looping;
    $('loop-button').classList.toggle('active', looping); $('loop-button').setAttribute('aria-pressed', String(looping));
    toast(looping ? '已开启单曲循环' : '已关闭单曲循环');
  });
  const formatTime = seconds => { if (!Number.isFinite(seconds) || seconds < 0) return '0:00'; const minutes=Math.floor(seconds/60); return `${minutes}:${String(Math.floor(seconds%60)).padStart(2,'0')}`; };
  audioElement.addEventListener('loadedmetadata', () => { $('duration').textContent = formatTime(audioElement.duration); updateSourceUI(); });
  audioElement.addEventListener('timeupdate', () => {
    if (source !== 'file') return;
    $('current-time').textContent = formatTime(audioElement.currentTime);
    if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) { $('seek').value = audioElement.currentTime / audioElement.duration * 1000; rangeFill($('seek')); }
  });
  for (const event of ['play','pause']) audioElement.addEventListener(event, updateSourceUI);
  audioElement.addEventListener('ended', () => { if (!looping && currentIndex + 1 < queue.length) loadTrack(currentIndex + 1); else updateSourceUI(); });
  audioElement.addEventListener('error', () => { if (audioElement.src) toast('无法读取这个音频文件，请尝试其他格式，或检查文件是否仍然存在。',6500); updateSourceUI(); });
  $('seek').addEventListener('input', () => { if (Number.isFinite(audioElement.duration)) audioElement.currentTime = Number($('seek').value) / 1000 * audioElement.duration; });
  $('volume').addEventListener('input', () => { const v = Number($('volume').value); audio.setVolume(v/100); $('volume-value').textContent = `${v}%`; saveSettings(); });

  function renderQueue() {
    $('queue-count').textContent = queue.length; $('queue-total').textContent = `${queue.length} 首`;
    const list = $('queue-list'); list.replaceChildren();
    if (!queue.length) { const p=document.createElement('p');p.className='queue-empty';p.textContent='还没有音乐。点击「导入音乐」或拖入音频文件。';list.append(p);return; }
    queue.forEach((track,index) => {
      const row = document.createElement('div'); row.className = `queue-track${index === currentIndex ? ' current' : ''}`;
      const button=document.createElement('button');button.className='track-select';button.title=track.name;
      const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');
      const name=document.createElement('strong');name.textContent=track.name;
      const ext=document.createElement('small');ext.textContent=track.extension;
      button.append(number,name,ext);button.addEventListener('click',()=>loadTrack(index));
      const remove=document.createElement('button');remove.className='queue-remove';remove.textContent='×';remove.title='移除这首音乐';remove.setAttribute('aria-label',`移除 ${track.name}`);
      remove.addEventListener('click', async () => {
        const wasCurrent=index===currentIndex, wasPlaying=source==='file'&&!audioElement.paused;
        queue.splice(index,1);
        if(wasCurrent) {
          if(queue.length) await loadTrack(Math.min(index,queue.length-1),wasPlaying);
          else { audioElement.pause();audioElement.removeAttribute('src');audioElement.load();currentIndex=-1;$('seek').value=0;$('current-time').textContent='0:00';$('duration').textContent='0:00'; }
        } else if(index<currentIndex) currentIndex--;
        renderQueue();updateSourceUI();
      });
      row.append(button,remove);list.append(row);
    });
  }
  $('queue-button').addEventListener('click', () => $('queue-panel').hidden = !$('queue-panel').hidden);
  $('queue-close').addEventListener('click', () => $('queue-panel').hidden = true);
  document.addEventListener('dragenter', event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) {dragCounter++;$('drop-overlay').classList.add('visible');} });
  document.addEventListener('dragover', event => { event.preventDefault(); if(event.dataTransfer)event.dataTransfer.dropEffect='copy'; });
  document.addEventListener('dragleave', event => { event.preventDefault();dragCounter=Math.max(0,dragCounter-1);if(!dragCounter)$('drop-overlay').classList.remove('visible'); });
  document.addEventListener('drop', async event => {
    event.preventDefault();dragCounter=0;$('drop-overlay').classList.remove('visible');
    try { await addTracks(await window.desktop.addDroppedFiles(Array.from(event.dataTransfer.files))); }
    catch(error) { toast(`文件导入失败：${error.message}`); }
  });

  function selectPalette(name) {
    if (!palettes[name]) return;
    color=palettes[name];if(engine)engine.color=color.color;
    document.documentElement.style.setProperty('--accent',color.accent);document.documentElement.style.setProperty('--accent-rgb',color.rgb);
    document.querySelectorAll('[data-palette]').forEach(button=>button.classList.toggle('selected',button.dataset.palette===name));
  }
  document.querySelectorAll('[data-palette]').forEach(button => button.addEventListener('click',()=>{selectPalette(button.dataset.palette);markModified();saveSettings();}));
  function configureModel(){
    if(!engine)return;
    audio.configurePlate(engine.model,engine.tuning,Number($('fundamental').value),Number($('decay').value));
    $('model-info').textContent=`${engine.model.boundary} · ${engine.model.modalCount} 个振动模态`;
    $('mode-value').textContent=`${Math.round(engine.model.groups[modeIndex].ratio*engine.fundamental)} Hz`;
  }
  function selectTuning(name){
    if(name!=='physical')driveSelecting=false;
    if(engine)engine.tuning=name==='physical'?'physical':'music';
    document.querySelectorAll('[data-tuning]').forEach(button=>{const selected=button.dataset.tuning===name;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
    $('tuning-description').textContent=name==='physical'?'自由边缘、近中心点激振。建议用持续纯音观察节线；停音后砂粒静止。':'突出主导节线，让砂纹随节奏流动、明暗呼吸。';
    refreshFeatureControls();
    configureModel();
  }
  document.querySelectorAll('[data-tuning]').forEach(button=>button.addEventListener('click',()=>{selectTuning(button.dataset.tuning);markModified();saveSettings();}));
  function setShape(name,drive) {
    document.querySelectorAll('[data-shape]').forEach(button=>button.classList.toggle('selected',button.dataset.shape===name));
    if(engine){engine.setShape(name,drive);modeIndex=engine.previewIndex;configureModel();refreshDriveUI();}
  }
  document.querySelectorAll('[data-shape]').forEach(button => button.addEventListener('click',()=>{setShape(button.dataset.shape);markModified();saveSettings();}));
  function tune() {
    audio.setSensitivity(Number($('sensitivity').value));if(engine){engine.speed=Number($('response').value);engine.glow=Number($('glow').value)/100;engine.fundamental=Number($('fundamental').value);engine.decay=Number($('decay').value);}
    $('sensitivity-value').textContent=`${audio.sensitivity.toFixed(1)}×`;
    $('response-value').textContent=`${Number($('response').value).toFixed(1)}×`;
    $('density-value').textContent=Number($('density').value).toLocaleString('en-US');
    $('glow-value').textContent=`${$('glow').value}%`;
    $('fundamental-value').textContent=`${$('fundamental').value} Hz`;$('decay-value').textContent=`${Number($('decay').value).toFixed(1)}×`;
    $('field-opacity-value').textContent=$('field-opacity').value+'%';$('refill-speed-value').textContent=Number($('refill-speed').value).toFixed(2)+'×';
    for(const id of ['sensitivity','response','glow','density','fundamental','decay','field-opacity','refill-speed'])rangeFill($(id));
  }
  for (const id of ['sensitivity','response','glow']) $(id).addEventListener('input',()=>{tune();markModified();saveSettings();});
  for(const id of ['fundamental','decay']){$(id).addEventListener('input',()=>{tune();markModified();});$(id).addEventListener('change',()=>{configureModel();saveSettings();});}
  $('density').addEventListener('input',()=>{$('density-value').textContent=Number($('density').value).toLocaleString('en-US');});
  $('density').addEventListener('change',()=>{engine?.scatter(Number($('density').value));markModified();saveSettings();});
  function setMode(index,manual=false) {
    modeIndex=(index+64)%64;engine?.setMode(modeIndex);
    if(manual){automatic=false;$('auto-mode').checked=false;if(engine)engine.automatic=false;markModified();saveSettings();}
    if(engine)$('mode-value').textContent=`${Math.round(engine.model.groups[modeIndex].ratio*engine.fundamental)} Hz`;
  }
  $('mode-prev').addEventListener('click',()=>setMode(modeIndex-1,true));
  $('mode-next').addEventListener('click',()=>setMode(modeIndex+1,true));
  $('auto-mode').addEventListener('change',()=>{automatic=$('auto-mode').checked;if(engine){engine.automatic=automatic;if(!automatic)setMode(engine.weights.indexOf(Math.max(...engine.weights)));}markModified();saveSettings();});
  $('scatter-button').addEventListener('click',()=>{engine?.scatter();toast('细砂已重新撒下');});
  function refreshFeatureControls() {
    const physical=engine?.tuning==='physical';
    $('auto-level').disabled=physical;$('auto-level').checked=!physical&&audio.autoSensitivity;
    $('auto-refill').disabled=false;$('auto-refill').checked=physical?engine?.physicalRefill!==false:engine?.autoRefill!==false;
    $('refill-label').textContent=physical?'维持砂量 · 辅助撒砂':'自动补砂';
    $('auto-level-status').textContent=physical?'薄板共振保留原始力度':audio.autoSensitivity?'自动适配 · 仅影响画面，不改变播放音量':'手动灵敏度 · 仅影响画面';
    $('refill-description').textContent=physical?'低于约 90% 时少量补回，模拟外部撒砂；静音与手动演示时停止。关闭保留自然掉砂。':'音乐播放时柔和补砂，静音与手动演示时停止';
    refreshDriveUI();
  }
  function captureVisualSettings() {
    const values={};
    for(const id of ['sensitivity','density','response','glow','fundamental','decay'])values[id]=Number($(id).value);
    return VisualPresets.sanitize({...values,tuning:engine?.tuning,palette:document.querySelector('[data-palette].selected')?.dataset.palette,shape:engine?.model.shape,automatic,modeIndex,autoLevel:audio.autoSensitivity,autoRefill:engine?.autoRefill!==false,physicalRefill:engine?.physicalRefill!==false,musicStyle:engine?.musicStyle,driveX:engine?.model.drive[0],driveY:engine?.model.drive[1],fieldMap:engine?.fieldMap,fieldOpacity:Number($('field-opacity').value),refillSpeed:Number($('refill-speed').value)});
  }
  function refreshPresetUI() {
    document.querySelectorAll('[data-preset]').forEach(button=>{const selected=button.dataset.preset===activePresetId;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
    const favorite=favorites.find(p=>p.id===activePresetId),builtin=VisualPresets.builtins.find(p=>p.id===activePresetId);
    $('preset-description').textContent=favorite?'收藏 · '+favorite.name:builtin?builtin.name+' · '+builtin.description:(VisualPresets.profiles[engine?.musicStyle]?.name||'当前效果')+' · 已调整，可收藏';
    $('favorite-select').value=favorite?favorite.id:'';$('favorite-delete').disabled=!favorite;
  }
  function markModified(){if(!applyingPreset){activePresetId='';refreshPresetUI();}}
  function renderFavorites() {
    const select=$('favorite-select');select.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent=favorites.length?'我的收藏 · '+favorites.length:'尚无收藏';select.append(empty);
    for(const preset of favorites){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;select.append(option);}
    refreshPresetUI();
  }
  function applyVisualSettings(input,id='',persist=true) {
    const settings=VisualPresets.sanitize(input);applyingPreset=true;
    try{
      for(const key of ['sensitivity','density','response','glow','fundamental','decay'])$(key).value=settings[key];
      $('field-opacity').value=settings.fieldOpacity;$('refill-speed').value=settings.refillSpeed;
      automatic=settings.automatic;$('auto-mode').checked=automatic;
      audio.setAutoSensitivity(settings.autoLevel);
      if(engine){engine.automatic=automatic;engine.musicStyle=settings.musicStyle;engine.focusScores.fill(0);engine.autoRefill=settings.autoRefill;engine.physicalRefill=settings.physicalRefill;engine.fieldMap=settings.fieldMap;engine.fieldOpacity=settings.fieldOpacity/100;engine.refillSpeed=settings.refillSpeed;}
      selectPalette(settings.palette);tune();
      if(engine&&(engine.model.shape!==settings.shape||engine.model.drive[0]!==settings.driveX||engine.model.drive[1]!==settings.driveY)){engine.count=settings.density;setShape(settings.shape,[settings.driveX,settings.driveY]);}
      else if(engine&&engine.count!==settings.density)engine.scatter(settings.density);
      selectTuning(settings.tuning);setMode(settings.modeIndex);activePresetId=id;
      refreshFeatureControls();refreshPresetUI();
    }finally{applyingPreset=false;}
    if(persist)saveSettings();
  }
  function saveSettings() {
    try{localStorage.setItem('chladni-settings-v4',JSON.stringify({...captureVisualSettings(),presetId:activePresetId,volume:$('volume').value}));}catch{}
  }
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{const preset=VisualPresets.builtins.find(p=>p.id===button.dataset.preset);if(preset)applyVisualSettings(preset.settings,preset.id);}));
  $('auto-level').addEventListener('change',()=>{audio.setAutoSensitivity($('auto-level').checked);refreshFeatureControls();markModified();saveSettings();});
  $('auto-refill').addEventListener('change',()=>{if(engine)engine[engine.tuning==='physical'?'physicalRefill':'autoRefill']=$('auto-refill').checked;refreshFeatureControls();markModified();saveSettings();});
  $('favorite-select').addEventListener('change',()=>{const preset=favorites.find(p=>p.id===$('favorite-select').value);if(preset)applyVisualSettings(preset.settings,preset.id);});
  $('favorite-save').addEventListener('click',()=>{
    if(favorites.length>=32){toast('最多保存 32 个收藏，请先删除不需要的项目');return;}
    $('favorite-name').value='我的'+(VisualPresets.profiles[engine?.musicStyle]?.name||'效果');$('favorite-dialog').showModal();$('favorite-name').select();
  });
  $('favorite-cancel').addEventListener('click',()=>$('favorite-dialog').close());
  $('favorite-form').addEventListener('submit',event=>{
    event.preventDefault();let name=$('favorite-name').value.trim();if(!name)return;
    const original=name;let suffix=2;while(favorites.some(p=>p.name===name))name=original.slice(0,26)+' ('+(suffix++)+')';
    const preset={id:'fav-'+crypto.randomUUID(),name,settings:captureVisualSettings()},next=[...favorites,preset];
    try{localStorage.setItem('chladni-favorites-v1',JSON.stringify(next));}catch{toast('收藏未能保存，请稍后重试');return;}
    favorites=next;activePresetId=preset.id;renderFavorites();saveSettings();$('favorite-dialog').close();toast('已收藏：'+name);
  });
  $('favorite-delete').addEventListener('click',()=>{
    const id=$('favorite-select').value;if(!id)return;const next=favorites.filter(p=>p.id!==id);
    try{localStorage.setItem('chladni-favorites-v1',JSON.stringify(next));}catch{toast('删除未能保存，请稍后重试');return;}
    favorites=next;activePresetId='';renderFavorites();saveSettings();toast('已删除所选收藏');
  });
  $('reset-settings').addEventListener('click',()=>{applyVisualSettings(VisualPresets.builtins[0].settings,'geometry');engine?.scatter();toast('已恢复清晰几何默认设置');});
  renderFavorites();
  let initialSettings=null;
  try{initialSettings=JSON.parse(localStorage.getItem('chladni-settings-v4')||localStorage.getItem('chladni-settings-v3')||localStorage.getItem('chladni-settings-v2')||'null');}catch{}
  applyVisualSettings(initialSettings||VisualPresets.builtins[0].settings,initialSettings?.presetId||(!initialSettings?'geometry':''),false);
  if(initialSettings&&Number.isFinite(Number(initialSettings.volume))){$('volume').value=Math.max(0,Math.min(100,Number(initialSettings.volume)));audio.setVolume(Number($('volume').value)/100);$('volume-value').textContent=$('volume').value+'%';}
  rangeFill($('volume'));

  async function toggleFullscreen() { try {await window.desktop.fullscreen(!(fullscreen&&!coversTaskbar));}catch(error){toast(error.message);} }
  async function toggleCoverFullscreen() { try {await window.desktop.fullscreen(!(fullscreen&&coversTaskbar),true);}catch(error){toast(error.message);} }
  async function exitFullscreen() { try {await window.desktop.fullscreen(false);}catch(error){toast(error.message);} }
  window.desktop.onFullscreen((value,cover) => {
    fullscreen=value;coversTaskbar=value&&!!cover;
    document.body.classList.toggle('immersive',value&&!coversTaskbar);
    document.body.classList.toggle('app-fullscreen',coversTaskbar);$('fullscreen-exit').hidden=!value;
    $('cover-fullscreen-button').setAttribute('aria-pressed',String(coversTaskbar));
    $('cover-fullscreen-button').querySelector('span').textContent=coversTaskbar?'退出应用全屏':'应用全屏';
    $('fullscreen-button').setAttribute('aria-pressed',String(value&&!coversTaskbar));
    $('queue-panel').hidden=true;setTimeout(()=>engine?.resize(),60);
  });
  $('fullscreen-button').addEventListener('click',toggleFullscreen);
  $('cover-fullscreen-button').addEventListener('click',toggleCoverFullscreen);
  $('fullscreen-exit').addEventListener('click',exitFullscreen);
  $('visualizer').addEventListener('dblclick',()=>{if(!driveSelecting)toggleFullscreen();});
  $('snapshot-button').addEventListener('click',async()=>{
    if(!engine)return;
    try{if(await window.desktop.saveImage(engine.snapshot()))toast('已保存当前砂纹图片');}catch(error){toast(`保存失败：${error.message}`);}
  });
  $('about-button').addEventListener('click',()=>$('about-dialog').showModal());
  $('about-close').addEventListener('click',()=>$('about-dialog').close());
  document.addEventListener('keydown',event=>{
    if($('about-dialog').open||$('favorite-dialog').open)return;
    if(event.code==='Escape'&&driveSelecting){driveSelecting=false;refreshDriveUI();return;}
    if(event.code==='Escape'){if(fullscreen)window.desktop.fullscreen(false);$('queue-panel').hidden=true;return;}
    if(event.ctrlKey&&event.code==='KeyO'){event.preventDefault();importAudio();return;}
    if(event.code==='F11'){event.preventDefault();if(event.ctrlKey)toggleCoverFullscreen();else toggleFullscreen();return;}
    if(['INPUT','TEXTAREA','SELECT','BUTTON','SUMMARY'].includes(document.activeElement?.tagName))return;
    if(event.code==='Space'){event.preventDefault();togglePlay();}
    if(event.code==='KeyR'){engine?.scatter();}
  });

  const spectrumCanvas=$('spectrum'), spectrumContext=spectrumCanvas.getContext('2d');
  function drawSpectrum() {
    const rect=spectrumCanvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
    const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
    if(spectrumCanvas.width!==w||spectrumCanvas.height!==h){spectrumCanvas.width=w;spectrumCanvas.height=h;}
    spectrumContext.clearRect(0,0,w,h);
    const gap=Math.max(1,ratio*1.5),bw=w/64;
    for(let i=0;i<64;i++){
      const value=Math.min(1,stats.spectrum[i]||0),height=Math.max(ratio,value*(h-2));
      spectrumContext.fillStyle=`rgba(${color.rgb},${.15+value*.7})`;spectrumContext.fillRect(i*bw,h-height,Math.max(1,bw-gap),height);
    }
  }
  let previous=performance.now(),lastRead=0,lastUI=0,lastSandUI=0,fpsStart=previous,frames=0,lastRender=0;
  function frame(now) {
    requestAnimationFrame(frame);
    if(now-lastRender<1000/60-.7)return;
    lastRender=now;
    const dt=Math.max(0.0001,Math.min((now-previous)/1000,.05));previous=now;
    if(now-lastRead>12){stats=audio.read();lastRead=now;}
    engine?.frame(dt,stats);
    if(now-lastUI>100){
      const lab=audio.labStatus();$('lab-readout').textContent=lab.playing?`${lab.mode==='tone'?'纯音':'扫频'} · ${lab.frequency.toFixed(1)} Hz`:'实验音未启动';
      const total=stats.modalPowers.reduce((a,b)=>a+b,0),ranked=Array.from(stats.modalPowers,(p,i)=>({p,i})).sort((a,b)=>b.p-a.p).slice(0,3).filter(v=>total>1e-10&&v.p/total>.02);
      $('lab-resonances').textContent=ranked.length&&engine?'最强共振 '+ranked.map(({p,i})=>`${(engine.model.groups[i].ratio*engine.fundamental).toFixed(1)} Hz (${Math.round(p/total*100)}%)`).join(' · '):'有输入后显示最强共振';
      if(engine?.tuning==='music'&&audio.autoSensitivity)$('auto-level-status').textContent=`自动适配 ${(stats.autoGain||1).toFixed(2)}× · 播放音量不变`;
      $('frequency').innerHTML=stats.active&&stats.frequency?`${Math.round(stats.frequency).toLocaleString('en-US')}<small> Hz</small>`:'—<small> Hz</small>';
      $('energy').innerHTML=stats.active?`${stats.db.toFixed(1)}<small> dBFS</small>`:'—<small> dBFS</small>';
      for(const [id,key]of[['bass-bar','bass'],['mid-bar','mid'],['high-bar','high']])$(id).style.width=`${Math.min(100,stats[key]*100)}%`;
      drawSpectrum();lastUI=now;
      $('field-mode').textContent=engine?`${automatic?engine.activeModes+(engine.tuning==='music'?' 组主导结构':' 组同时共振'):'单频演示（模拟激励）'} · ${engine.tuning==='music'?'音乐响应':'薄板共振'}`:'';
    }
    if(engine&&now-lastSandUI>750){const fraction=engine.population(),enabled=engine.tuning==='physical'?engine.physicalRefill:engine.autoRefill,need=fraction<(engine.tuning==='physical'?.895:.995);$('sand-status').textContent=`砂量约 ${Math.round(fraction*100)}% · ${!enabled?'自然掉砂':engine.refillEnabled&&need?'正在补砂':fraction>.895?'砂量充足':'补砂待机'}`;lastSandUI=now;}
    frames++;if(now-fpsStart>1000){$('fps').textContent=`${Math.round(frames*1000/(now-fpsStart))} FPS`;frames=0;fpsStart=now;}
  }
  updateSourceUI();requestAnimationFrame(frame);
  window.studio={audio,engine,get state(){return{source,queue:queue.length,currentIndex,automatic,mode:engine?.model.groups[modeIndex].label,tuning:engine?.tuning,listening:!!audio.capture,fullscreen,coversTaskbar,musicStyle:engine?.musicStyle,presetId:activePresetId,favorites:favorites.length};}};
})();
