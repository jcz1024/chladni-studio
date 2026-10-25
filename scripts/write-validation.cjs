const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'output',name),'utf8'));
const desktop=read('packaged-smoke-report.json'),realtime=read('packaged-realtime-report.json'),portable=read('portable-smoke-report.json');
const grains=read('packaged-grain-report.json');
const visual=read('packaged-music-visual-report.json');
const experience=read('packaged-experience-report.json'),fullscreen=read('packaged-fullscreen-report.json');
const physical=read('packaged-physical-quality-report.json');
const lab=read('packaged-lab-report.json');
for(const report of [desktop,realtime,portable,grains,visual,experience,fullscreen,physical,lab])if(!report.success||report.version!==version)throw new Error('Missing successful checks for the current release version');
const name=`Chladni-Studio-${version}-Windows-x64.exe`,file=path.join(root,'release',name),size=fs.statSync(file).size,sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text=`# ${version} 交付验证

验证环境：Windows 11 x64，2026-10-25（Asia/Shanghai）。未在其他电脑或 Windows 10 上实测。

## 成品

- 文件：release/${name}
- 大小：${size.toLocaleString('en-US')} 字节，约 ${(size/1048576).toFixed(1)} MiB。
- SHA-256：\`${sha}\`
- Windows 便携 exe，未进行代码签名。需支持浮点颜色纹理的 WebGL 2 显卡驱动。

## 检查结果

- 21 项基础测试通过：模态参考频率、求解收敛、共振积分、媒体读取、自动灵敏度、原始力度、收藏、扫频时序、中心激振的对称性、圆板激振旋转关系及实验设置边界。
- 封装应用的 ${desktop.checks.length} 项桌面功能检查通过，包括文件播放、拖入、跳转、音量、循环、列表、系统回环、全屏、布局、图片保存和错误恢复。
- 封装应用的 ${realtime.checks.length} 项实时性检查通过，包括真实 PCM 激发、频率跳变、和弦、调校切换、停音衰减、系统脉冲、节奏文件和 GPU 稳定性。
- 最终便携 exe 的 ${portable.checks.length} 项启动、界面版本、退出与收藏跨重启检查通过。
- 封装应用的 ${grains.checks.length} 项砂粒专项检查通过：零输入和弱输入静止、单频内部节线、停音静止、真实 PCM 换频、持续音乐与边缘分布。
- 封装应用的 ${visual.checks.length} 项音乐视觉检查通过：两种按钮的音频/GPU 路径映射、同 PCM 与同初始砂粒的视觉对照、音乐停音/弱输入、单帧鼓点微光与薄板共振回归。
- 封装应用的 ${experience.checks.length} 项体验检查通过：四套预设、同输入下的不同结构/节奏、真实 PCM 自动灵敏度、播放增益不变、可选音乐补砂、静音和关闭辅助时不补砂、收藏保存/恢复/删除及跨应用重启。
- 封装应用的 ${physical.checks.length} 项薄板体验检查通过：过密节线接触、96 秒音乐对照、亮度压缩上限、方/圆板辅助撒砂的速率与数量限制、静音、弱输入、开关独立性与收藏恢复。
- 封装应用的 ${lab.checks.length} 项实验室检查通过：真实纯音、音量与激振强度分离、音频时钟扫频与往返、中心激振抑制、后台振型计算、底图仅改变像素、砂量反馈、补砂速度、收藏和实际重启。
- 封装应用的 ${fullscreen.checks.length} 项全屏检查通过，完整应用界面与沙盘沉浸模式均可用，任务栏覆盖经 Windows 原生命中检查确认。

## 实测数据与含义

| 指标 | 本机测量 |
| --- | --- |
| ${realtime.frequencies[0].toFixed(1)} Hz → ${realtime.frequencies[1].toFixed(1)} Hz 后共振场开始明显改变 | ${realtime.jump.changedAt.toFixed(1)} ms |
| 新共振成为主要结构 | ${realtime.jump.settledAt?.toFixed(1)||'未达到测试阈值'} ms |
| 独立播放源经过 Windows 默认输出与系统回环的三次脉冲响应 | ${realtime.loopback.latencies.map(n=>n.toFixed(1)).join(' / ')} ms |
| 默认 64,000 砂粒的采样帧率 | ${realtime.performance.fps.toFixed(1)} FPS |
| 薄板圆盘接触与辅助撒砂开启、播放文件时帧率 | ${realtime.physicalPerformance.fps.toFixed(1)} FPS |
| 合成音乐文件 4.2 秒内的结构更新帧数 | ${realtime.music.revisions} |
| 同一段文件中的瞬态响应次数 | ${realtime.music.onsets} |

频率跳变指标衡量的是模态权重及共振场变化，不是完整砂纹成形。系统指标从独立播放源调度时刻测到应用提交砂粒响应帧，包含测试播放端输出与回环缓冲；不是显示器光子延迟，也不代表所有软件和声卡的延迟。本次系统回环仍未达到争取 100 ms 内响应的目标。

共振与砂粒状态的 GPU 数值均为有限值，WebGL 错误为 0。帧率数据是一段本机采样，复杂内容及其他设备可能不同。

报告：output/packaged-smoke-report.json、output/packaged-realtime-report.json、output/portable-smoke-report.json。下载包包含实时性与便携启动报告。

## 砂粒回归

方板/圆板各两个低阶模态，64,000 粒，以 1/60 秒步长模拟。保留空间权重但输入为零 20 秒，最大平面位移 ${Math.max(...grains.cases.map(c=>c.silentDrift))}；微弱输入同样没有持续迁移。随后保持单频激励 20 秒，靠边区域比例为 ${grains.cases.map(c=>`${c.shape}/${c.mode}: ${(c.settled.edge*100).toFixed(1)}%`).join('，')}，保留砂粒最少 ${(Math.min(...grains.cases.map(c=>c.settled.alive))*100).toFixed(2)}%。零输入和单频阶段的秒数是模拟时间。

真实 PCM 停音静止测试的最大位移 ${grains.pcmStoppedDrift}。音乐响应和薄板共振各播放合成音乐 14.5 秒，砂粒仍有限且以板内分布为主；这是指定文件的测量，不承诺任意音乐都有清晰节线。原始数据见 output/packaged-grain-report.json。

## 音乐视觉对照

实际共振处理器对同一 16 秒原创 PCM 文件生成特征，两版以完全相同的特征、初始 64,000 粒和固定 1/60 秒步长回放。在 4/8/12/16 秒处，节线附近（空间场平方值小于 0.045）的平均砂粒比例由 ${(visual.nodalOccupancy.old*100).toFixed(1)}% 变为 ${(visual.nodalOccupancy.current*100).toFixed(1)}%。阈值统计与对照截图用于评估指定音乐的形状连贯性；场本身也有变化，不是通用美感分数。

薄板接触更新会改变砂粒轨迹；同一测试中，薄板空间权重的最大差异为 ${visual.physical.weightDelta}，绝对激励差异为 ${visual.physical.excitationDelta}。音乐模式停音后最大平面位移 ${visual.musicSilence.silence}，微弱输入最大位移 ${visual.musicSilence.weakDrift}。鼓点微光在下一次更新即触发并平滑释放。对照图和原始报告包含在下载包 docs 中。

## 新体验实测

相同 220 Hz 输入从安静到强音，输入 RMS 分别 ${experience.quiet.rms.toFixed(4)} / ${experience.loud.rms.toFixed(4)}，归一化后画面分析 RMS 为 ${experience.quiet.visual.toFixed(4)} / ${experience.loud.visual.toFixed(4)}，两次实际播放增益均保持 ${experience.quiet.output.toFixed(2)}。自动适配只用于音乐响应，薄板共振保留原始力度。

音乐补砂检查先将 80% 砂粒标记为掉落，推进 10 秒模拟时间。有声音乐且开启补砂时，方/圆板存活比例 ${experience.refill.filter(c=>['enabled','circle'].includes(c.name)).map(c=>`${c.name}: ${(c.alive*100).toFixed(1)}%`).join('，')}；关闭补砂、静音或关闭薄板辅助撒砂均不补回。新砂以渐入方式显示，静音场景的最大平面位移为 ${experience.refill.find(c=>c.name==='silent').drift}。收藏通过真实关闭和重新启动 exe 的恢复检查，名称以纯文本显示。

原始报告见 docs/experience-report.json，四套预设截图见 docs/preset-*.png。

## 薄板接触、亮度与辅助撒砂

在完全相同初始砂粒和同一原创 PCM 特征下，关闭补砂，方板和圆板各推进 96 秒模拟时间。128×128 统计网格中的最大单格粒数由 ${physical.contact.map(c=>`${c.shape}: ${c.old.peak} → ${c.current.peak}`).join('，')}。每个粒子所在网格的平均粒数由 ${physical.contact.map(c=>`${c.shape}: ${c.old.concentration.toFixed(1)} → ${c.current.concentration.toFixed(1)}`).join('，')}。这是指定音频和网格分辨率下的聚集诊断，不能解释为真实砂粒接触误差或普适美感分数。方板/圆板共振权重及绝对力度均与旧版一致。

直接捕获绘制着色器的亮度输出，极密区域的系数范围 ${physical.brightness.min.toFixed(6)}–${physical.brightness.max.toFixed(6)}，即最多降低约 15%；稀疏区域输出差异 ${physical.brightness.sparseDelta}。不改全局微光与播放音量。

辅助撒砂是独立、默认开启的外部供砂选项，低于约 90% 砂量才补，约每秒最多补目标数量的 0.8%，接近阈值减速，新砂约 1.2 秒渐入。控制测试从 50% 砂量开始并隔离自然掉砂，60 秒后方/圆板分别为 ${physical.refill.filter(c=>['supply','circle'].includes(c.name)).map(c=>`${c.name}: ${(c.alive*100).toFixed(1)}%`).join('，')}；静音、弱输入、手动演示、关闭辅助和砂量足够时均没有新砂。该功能不修改薄板振动求解；可关闭以观察自然掉砂。原始报告与对照图见 docs/physical-quality-report.json、docs/physical-long-*.png。

## 共振实验室实测

纯音 63.1 Hz 进入分析总线后的 RMS 为 ${lab.tone.rms.toFixed(5)}，FFT 为 ${lab.tone.frequency.toFixed(2)} Hz，预期第 3 组模态占比 ${(lab.tone.weights[2]*100).toFixed(1)}%。降低播放器音量后，实际监听增益为 ${lab.volume.monitor.toFixed(3)}，分析 RMS 为 ${lab.volume.rms.toFixed(5)}；增加实验音强度后 RMS 为 ${lab.strongRms.toFixed(5)}。它与静态手动演示的模拟激励分开。

选择板心后，不能被中心点力激发的方板第 1 组耦合为 ${lab.centre.coupling}，实际 PCM 模态功率由 ${lab.beforeCentre.toExponential(3)} 降至 ${lab.centre.power.toExponential(3)}。后台重建点选振型期间约 ${lab.worker.ms.toFixed(0)} ms 内仍提交 ${lab.worker.frames} 帧，重新撒砂调用次数 ${lab.worker.scatters}。这是一段本机操作采样，不代表所有点位的计算时间。

对数扫频的实时 FFT 与音频时钟目标吻合，单程结束会停止，往返模式连续反向。底图开关使像素变化，砂粒状态最大差异为 ${lab.overlay.stateDelta}；底图不透明度为 0 或无绝对激励时，与关闭底图的图像一致。补砂速度 0.5× / 2× 的控制测试在 20 秒模拟时间后砂量为 ${lab.supply.map(s=>(s.fraction*100).toFixed(1)+'%').join(' / ')}。原始数据和预览见 docs/lab-report.json、docs/lab-*-preview.png。

## 模型与适用范围

方板、圆板均为自由边缘，各有 64 组共振，分别包含 86 / 122 个弯曲模态，默认由近中心点力激发，可点选调整位置，排除三个刚体模态。方板采用收敛验证的 Rayleigh–Ritz 求解，圆板采用自由边界 Bessel 特征方程。薄板共振采用平均振动加速度；音乐响应的均衡和相干节线含视觉处理。砂粒迁移、阈值和接触仍是经验近似，没有材料参数标定或逐粒碰撞求解。落砂不反射，R 可重新撒砂；手动演示明确使用模拟激励。完整说明见 PHYSICS.md。

播放列表仅在当前会话有效；切换音频输出设备后需要重新监听。未对所有编码、声卡、独占音频及受保护内容做验证。旧版下载包单独保留。
`;
fs.writeFileSync(path.join(root,'VALIDATION.md'),text);fs.writeFileSync(path.join(root,'release/SHA256SUMS.txt'),`${sha}  ${name}\r\n`);console.log(`Validation recorded for ${version}; ${size} bytes.`);
