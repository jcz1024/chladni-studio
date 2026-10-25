// Window-only release: rerun window/player checks, retain explicitly versioned
// alpha.4 simulation evidence only when its core source files match byte-for-byte.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,baselineVersion='1.0.0-alpha.4';
const baseline=path.join(root,`release/downloads/Chladni-Studio-${baselineVersion}-Windows-x64`);
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'output',name),'utf8'));
const desktop=read('packaged-smoke-report.json'),fullscreen=read('packaged-fullscreen-report.json'),portable=read('portable-smoke-report.json');
for(const r of [desktop,fullscreen,portable])if(!r.success||r.version!==version)throw new Error('Missing current window release checks');
const core=['src/audio.js','src/engine.js','src/physics.js','src/plate-data.js','src/resonator-worklet.js','electron/media.cjs'];
for(const file of core)if(!fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(baseline,'source',file))))throw new Error('Simulation changed; run the complete physics/audio validation: '+file);
for(const file of ['realtime-report.json','grain-regression-report.json','music-visual-report.json']){
 const r=JSON.parse(fs.readFileSync(path.join(baseline,'docs',file),'utf8'));if(!r.success||r.version!==baselineVersion)throw new Error('Invalid baseline evidence: '+file);
}
const name=`Chladni-Studio-${version}-Windows-x64.exe`,file=path.join(root,'release',name),bytes=fs.statSync(file).size,sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text=`# ${version} 交付验证

环境：Windows 11 x64，2026-10-25（Asia/Shanghai）。本次为全屏窗口功能更新。

## 本版执行的检查

- ${fullscreen.checks.length} 项封装版全屏专项检查通过：文字按钮、原生全屏、完整屏幕边界、完整应用布局与控件可用、独立沙盘沉浸视图、Windows 任务栏区域命中、Esc、退出按钮、Ctrl+F11、F11、焦点切换、原窗口/最大化状态恢复、连续切换及 GPU 稳定性。
- ${desktop.checks.length} 项封装版桌面检查通过，包括文件播放、拖入、跳转、音量、循环、列表、系统回环、全屏、布局、图片保存和错误恢复。
- ${portable.checks.length} 项单文件便携 exe 启动、GPU、界面版本、交互与退出检查通过。

任务栏覆盖使用原生全屏与临时窗口层级；覆盖仅在本窗口聚焦时保持。退出时恢复原置顶状态。Windows 原生命中测试在任务栏区域得到的顶层窗口是本应用：${fullscreen.taskbarProbe.AppCoversTaskbar}。主窗口屏幕边界：${JSON.stringify(fullscreen.entered.bounds)}，屏幕完整边界：${JSON.stringify(fullscreen.entered.screen)}。

应用全屏保留标题栏、侧栏、频谱、播放器和导入按钮：${JSON.stringify(fullscreen.appLayout)}。另已点击测试音量、播放列表、配色和关于弹窗；弹窗内按 Esc 只关闭弹窗。Ctrl+F11 为整个应用全屏，F11 为沙盘沉浸全屏，后者隐藏侧栏与播放器。

参考 [Electron 窗口层级说明](https://www.electronjs.org/docs/latest/api/base-window#winsetalwaysontopflag-level-relativelevel)。本版没有改动全局任务栏设置。

## 沿用的音频与砂粒验证

以下 ${core.length} 个核心文件与冻结的 ${baselineVersion} 源码逐字节一致：${core.join('、')}。本次未重复执行完整的数值、砂粒与音乐视觉测试；下载包内 realtime-report.json、grain-regression-report.json、music-visual-report.json 及音乐对比图是 ${baselineVersion} 的验证证据，保留原版本号，不能当成本版的新测量。模型和性能的适用范围见 PHYSICS.md 及原始报告。

当前窗口相关报告：fullscreen-report.json、desktop-smoke-report.json、portable-smoke-report.json。音频与砂粒源文件一致性在生成此报告时已核验。

## 成品

- 文件：release/${name}
- 大小：${bytes.toLocaleString('en-US')} 字节。
- SHA-256：${sha}
- Windows x64 便携 exe；未进行代码签名。
`;
fs.writeFileSync(path.join(root,'VALIDATION.md'),text);fs.writeFileSync(path.join(root,'release/SHA256SUMS.txt'),`${sha}  ${name}\r\n`);console.log(`Window release validated: ${version}; unchanged simulation baseline ${baselineVersion}.`);
