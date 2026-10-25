# alpha.3 修复补充

已将自由边缘薄板模态用于本版。方板采用原始 Legendre Rayleigh–Ritz 求解，圆板采用自由弯矩/有效剪力特征方程；验证依据与参考文献见 PHYSICS.md。下文关于 alpha.2 或更早版本的边界条件是历史记录。

# GitHub 调研与实现选择

## 1.0.0-alpha.2 更新

下一版已采用独立实现的线性薄板模态与音频采样率下的二阶共振积分，参考 [NASA SP-160](https://ntrs.nasa.gov/citations/19700009156)、[实时模态研究](https://arxiv.org/abs/2505.05940) 和 [AudioWorklet 文档](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process)。具体方程、边界条件和视觉化近似见 PHYSICS.md。没有复用下表项目源代码。

以下记录为首版方案与当时的取舍，8192 点 FFT、固定 6 秒切换等描述已由 alpha.2 的连续音频共振实现取代。

调研日期：2026-10-24。以下结论依据各仓库当时的公开 README；没有对这些第三方项目做完整运行验证。

| 项目 | 可用内容 | 对本次需求的适用性 |
| --- | --- | --- |
| [addiebarron/chladni](https://github.com/addiebarron/chladni) | p5.js 砂粒模拟、驻波表达式；MIT 许可 | 简单、适合理解节线与砂粒运动；需另做音频分析、系统采集、播放器和 Windows 打包。 |
| [Sidmaz666/cymatics-labs](https://github.com/Sidmaz666/cymatics-labs) | Three.js / Web Audio；音频文件、麦克风、模态映射、GPU 粒子、多种预设 | 功能接近可视化部分；网页端实现，系统回环与 Windows exe 仍需补充。公开页面未展示明确许可证，复用前应单独核实。 |
| [nolangz/3D-Chladni](https://github.com/nolangz/3D-Chladni) | 3D 模态、Web 演示、Electron 桌面框架、macOS 系统声音版；Apache-2.0 | 桌面方向最接近；README 明确说明 Windows 适配和设备验证仍待完成，无法直接当成已验证的 Windows 成品。 |
| [baditaflorin/chladni-plate-visualizer](https://github.com/baditaflorin/chladni-plate-visualizer) | WebGPU 板振动 PDE、Three.js、音频文件／麦克风输入；MIT | 适合后续研究更接近物理的求解器；初稿引入 WebGPU 和 PDE 会增加兼容性与调参成本。 |

## 这次的选择

以独立的 Electron + Web Audio + WebGL 2 实现满足 Windows 初稿交付。没有复制上表项目的代码或素材，因此无需绑定某个尚不确定的第三方应用许可证或适配层。

- 桌面采集依据 [Electron desktopCapturer 文档](https://www.electronjs.org/docs/latest/api/desktop-capturer) 与 [session.setDisplayMediaRequestHandler 文档](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)，使用 Windows `loopback` 系统输出回环。
- 文件导入使用原生对话框和拖入；只向播放器提供本次用户选中文件的随机访问令牌。流式读取和 HTTP 字节范围支持播放进度跳转。
- FFT 使用 8192 点分析器，提取主导频率、RMS 能量、低／中／高频能量和对数频谱。模态切换有至少 6 秒的间隔，减轻频谱抖动。
- WebGL 2 Transform Feedback 在 GPU 上更新砂粒位置；沿振幅平方下降方向聚拢，并加入随音频变化的细微扰动。方形用可分离余弦驻波叠加，圆形用极坐标近似。这是视觉模态模型，不是自由边界金属薄板的完整物理解。

## Skills 评估

检查了 [OpenAI 官方 skills 目录](https://github.com/openai/skills/tree/main/skills/.curated) 中的浏览器测试技能。现有 `playwright` skill 偏向浏览器 CLI，`playwright-interactive` 依赖本会话未启用的 `js_repl` 和特定运行方式，均不直接改善本次 Windows 构建流程。此次没有安装额外 skill，也没有修改 Codex 配置；使用项目本地 Playwright 的 Electron 接口完成桌面验证。

后续可优先推进：实际歌曲的视觉调参、更多设备上的回环测试、视频导出、播放列表持久化，以及圆板贝塞尔模态／真实板振动求解。
