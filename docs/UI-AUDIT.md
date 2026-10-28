# 集成后的 UI 验收记录

当前验收以 [PR #2 集成报告](UI-OPTIMIZATION-REPORT.md) 为准。PR 作者在 macOS 的截图和审计属于来源材料，不作为本机通过证明。

本次在 Windows、真实服务 http://127.0.0.1:8765 验证：

- 前端类型检查、82 项单元测试、构建与原有资源预算通过。
- 后端相关 103 项通过。
- 合成 fixture Playwright 25 项通过，3 项旧版 AIT-ADS 可选用例未启用。
- 真实 Stage Playwright 10 项通过，无 API 替身，执行真实上传与正式 CLI。
- 验证桌面首屏、手机无横向溢出、六模块导航、证据抽屉、焦点循环/恢复、Escape、滚动锁定、ARIA 结构、强制颜色与缩放。
- 真实截图、JUnit、日志位于 `outputs/ui_integration_checks/`；复跑命令和限制见集成报告。

人工屏幕阅读器检查仍按 [清单](A11Y-MANUAL-CHECKLIST.md) 执行。本次未重跑 axe、Impeccable detector、WebKit/Firefox，不声明这些项目通过。
