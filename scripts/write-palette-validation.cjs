const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,baseline='release/downloads/Chladni-Studio-1.0.0-alpha.9-Windows-x64';
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'output',name),'utf8'));
const palette=read('packaged-palette-report.json'),desktop=read('packaged-smoke-report.json'),fullscreen=read('packaged-fullscreen-report.json'),portable=read('portable-smoke-report.json');
for(const r of [palette,desktop,fullscreen,portable])assert.ok(r.success&&r.version===version,'Current packaged checks must pass');
if(!fullscreen.taskbarHitVerified){const prior=read('fullscreen-report.json');assert.ok(prior.version==='1.0.0-alpha.9'&&prior.taskbarProbe?.AppCoversTaskbar===false,'Unconfirmed taskbar hit-test must also reproduce on the baseline');}
const unchanged=['src/app.js','src/audio.js','src/physics.js','src/plate-data.js','src/resonator-worklet.js','src/presets.js','src/experiment.js','src/plate-worker.js','electron/main.cjs','electron/preload.cjs','electron/media.cjs'];
for(const file of unchanged)assert.ok(fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(root,baseline,'source',file))),file+' changed outside palette scope');
const strip=s=>s.replace(/const BACKGROUND=[\s\S]*?(?=  class ChladniEngine)/,'BACKGROUND');
assert.equal(strip(fs.readFileSync(path.join(root,'src/engine.js'),'utf8')),strip(fs.readFileSync(path.join(root,baseline,'source/src/engine.js'),'utf8')),'Non-background GPU code changed');
const name=`Chladni-Studio-${version}-Windows-x64.exe`,bytes=fs.readFileSync(path.join(root,'release',name)),sha=crypto.createHash('sha256').update(bytes).digest('hex');
const text=`# ${version} 配色修复验证

本次修复将控件、文字强调色、边框、振动底图、激振标记及图例统一接入当前配色。四张配色预览保留各自颜色。仅改变界面样式与背景着色，不改变音频、薄板模态和砂粒动力学。

## 当前成品

- Windows x64 便携 exe：${name}
- 大小：${bytes.length.toLocaleString('en-US')} 字节。
- SHA-256：\`${sha}\`
- 验证环境：Windows 11 x64，2026-10-25（Asia/Shanghai）。

## 本版实测

- 21 项基础检查通过，覆盖模态、音频积分、参数校验与媒体读取。
- 四配色专项 ${palette.checks.length} 项通过：真实纯音运行中切换颜色、16 类界面强调色、播放按钮悬停、实际截图色块、底图及标记、收藏及重载。
- 播放器、音频导入/拖放、系统声音回环、错误恢复等 ${desktop.checks.length} 项通过。
- 完整应用全屏布局、原生窗口状态、沉浸全屏及窗口恢复 ${fullscreen.checks.length} 项通过。
- 最终便携 exe 自解压、后台圆板点位构建、实际纯音、两次启动及收藏恢复 ${portable.checks.length} 项通过。

${palette.palettes.map(p=>`- ${p.name}：渲染稳定；排除配色预览后，残留暖色实心区域像素 ${p.pixels.solidWarm}。`).join('\n')}

像素检查仅用于识别持续保留的琥珀色块，排除四张配色预览，也排除字体抗锯齿的零散色边；不要求非琥珀主题的每个像素严格属于单一色相。预览见 docs/palette-*.png。

相同初始砂粒和激励下，与 alpha.9 的全粒子缓冲最大差异 ${palette.trajectory.delta}，WebGL 错误 ${palette.trajectory.gpu.glError}。旧版与新版除了背景绘制以外的 GPU 更新代码逐字一致；另核对 ${unchanged.length} 个音频、模型、控制及桌面源文件，均与 alpha.9 相同。

${fullscreen.taskbarHitVerified?'本次任务栏区域原生命中检查通过。':'当前桌面会话中，任务栏区域原生命中未确认，窗口仍报告原生全屏和置顶；未修改的 alpha.9 源码也复现相同结果，窗口代码逐字未变。本次没有将此项记为通过，也没有修改窗口行为。诊断对照见 docs/fullscreen-environment-baseline9.json。'}

## 基线范围

alpha.9 的 21 项基础检查及共振、扫频、长时间砂粒、节拍、补砂等报告保留于 docs/baseline-alpha.9，报告明确属于 alpha.9，本补丁没有重复执行全部基线专项。当前专项原始结果见 docs/palette-report.json、docs/desktop-smoke-report.json、docs/fullscreen-report.json、docs/portable-smoke-report.json。

模型近似范围见 PHYSICS.md。旧版 ZIP 单独保留。
`;
fs.writeFileSync(path.join(root,'VALIDATION.md'),text);fs.writeFileSync(path.join(root,'release/SHA256SUMS.txt'),`${sha}  ${name}\r\n`);console.log(`Palette patch validation recorded: ${version}`);
