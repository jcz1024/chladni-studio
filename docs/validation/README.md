# 发布验证快照

这里保存 alpha.10 既有发布验证的 JSON 报告，以及 `baseline-alpha.9/` 中明确标注的历史基线。检查范围与版本区别见 [VALIDATION.md](../../VALIDATION.md)。

- `palette-report.json`：四配色、主题恢复与粒子状态一致性。
- `desktop-smoke-report.json`：播放器、系统回环和桌面交互。
- `fullscreen-report.json`：完整应用全屏、任务栏覆盖与窗口恢复。
- `portable-smoke-report.json`：最终便携 EXE 的两次启动及功能恢复。

报告保留测试时的原始路径与运行指标，它们是本地环境的结果，不代表所有设备表现。重跑脚本生成的新报告写入项目的 `output/`，不会自动覆盖这些发布快照。仓库 CI 只运行基础检查和解包构建。
