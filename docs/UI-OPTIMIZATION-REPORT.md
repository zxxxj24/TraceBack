# PR #2 界面设计集成验收

日期：2026-10-28。参考 [ruijayfeng 的 PR #2](https://github.com/zxxxj24/TraceBack/pull/2)，来源提交 `667bb39b2439d62fae6677a58ee8c32f119d4a44`。集成基于当前主分支 `8105ec1`，分支 `codex/evidence-first-workbench`。环境：Windows、Python 3.11、Chromium/Chrome，本地真实服务 http://127.0.0.1:8765。

## 集成结果

采用 PR 的 navy/teal 设计基础、Lucide 图标、侧栏、组件库、事件表格、证据 Sheet、AI 报告和错误提示。保留当前六模块、Stage/Relation/Chain、正式基线识别及历史快照。

首页先展示紧凑标题、当前批次、真实统计与图表，1440×900 首屏可见主要指标和核心图表。“导入告警”打开右侧抽屉，关闭按钮或 Escape 关闭。上传契约、正式 CLI、任务轮询、日志和结果选择沿用；关闭抽屉不清除任务，分析成功且产物可用后自动切换批次。手机菜单支持六模块导航、焦点循环、Escape 与焦点恢复。

旧版事件由显式 Analysis/Incident 地址进入，接入 PR 的筛选、分页、密度、CSV、节点/边深链、时间线与证据交互。首页保留态势总览。页面按需加载，清理新导航取代的旧外壳样式，保留 JS 160 KiB、CSS 20 KiB gzip 预算。

## 关键文件

| 范围 | 主要文件 |
|---|---|
| 外壳与导航 | `frontend/src/App.tsx`、`main.tsx` |
| 设计基础 | `styles/theme.css`、`app.css`、`soc.css`、`evidenceWorkbench.css`、`components/ui/*` |
| 事件与证据 | `pages/Dashboard.tsx`、`IncidentList.tsx`、`IncidentDetail.tsx`、`Timeline.tsx`、`components/evidence/EvidencePanel.tsx` |
| 攻击链与 AI | `components/attack-chain/*`、`components/ai-analysis/AIReport.tsx` |
| API 与查询 | `frontend/src/api/client.ts`、`backend/app/api/workbench.py`、`docs/openapi-workbench.json` |
| 回归 | `frontend/e2e/*`、`frontend/src/__tests__/*`、`backend/tests/test_workbench.py` |

未修改正式 CLI、①～⑨算法、阈值、输入规则、Stage 任务状态机、封存产物或原始结果。PR 中旧版 AI job 接口与搜索参数保留，原接口及 Stage 接口仍可用；未引入项目级许可证变更，保留组件许可证与来源。

## 集成时修复

1. PR 基于旧主分支，App 等冲突按当前 Stage 工作台适配，保留六模块和真实导入闭环。
2. AI 取消后仍运行的供应商调用保持并发槽位到线程退出，避免绕过四任务上限。取消与报告保存同步，取消后的结果不写入报告。
3. 搜索在分页前查询事件、来源告警、实体与已验证技术；前端不二次过滤服务端结果，避免隐藏来源字段匹配的行。
4. 视觉测试缺少作者工作区 `design-libs` 时默认输出本仓库 `outputs/ui_visual/`，不会收集失败。合成 fixture 与真实 Stage 套件分别运行。
5. AI 面板移除人为最短等待、检查取消信号，并对成功后的再次生成使用原有确认流程。

## 实际验证

| 验证 | 结果 |
|---|---|
| `npm run verify` | 类型检查、82 项前端测试、生产构建、预算通过 |
| 首屏 gzip | JS 98.80 KiB / 160；CSS 19.97 KiB / 20 |
| 后端相关回归 | 103 项通过：搜索、取消并发、API 快照、上传任务、Stage、⑨流水线、AI 证据校验 |
| 默认 Playwright | 25 项通过；3 项可选旧版 AIT-ADS 用例未启用 |
| 真实 Stage Playwright | 10 项通过，不拦截 API、不替换结果，执行真实 CLI |
| 手机导航补充 | 焦点进入、Shift+Tab 循环、Escape 关闭、焦点恢复通过 |

真实套件覆盖导入校验、关面板继续运行、成功后切换、刷新恢复、批次统计、输入与保留数量、失败日志、产物不可用提示、六模块及攻击链证据追溯。响应式检查覆盖 1440/1366/1024/768/390 等视口，另覆盖 ARIA 结构、200% 等效缩放、强制颜色。

复跑：在 `frontend/` 运行 `npm.cmd run verify`、`npx.cmd playwright test` 和 `npx.cmd playwright test --config playwright.home.config.ts`。真实套件需先启动本机后端，默认 8765，可用 `TRACEBACK_WEB_URL` 覆盖。后端运行：

```powershell
.\.venv\Scripts\python.exe -B -m pytest backend/tests/test_workbench.py backend/tests/test_stage_runs.py backend/tests/test_stage9_reader.py backend/tests/test_stage9_pipeline.py backend/tests/test_stage_workbench.py backend/tests/test_stage_ai_explanation.py -q -p no:cacheprovider
```

## 运行证据

- 首页、导入面板：`outputs/ui_integration_checks/home-desktop.png`、`import-drawer.png`。
- 手机首页、导入：同目录 `home-mobile.png`、`import-mobile.png`。
- JUnit：同目录 `backend.xml`、`legacy-browser.xml`、`real-browser.xml`。
- 日志：同目录 `frontend-verify.log`、`frontend-unit.log`、`legacy-browser.log`、`real-browser.log`。

截图与测试产物保存在本机忽略目录，不随源码提交。

## 限制

核心验收未发现未解决问题。未执行 VoiceOver/NVDA 人工检查、WebKit/Firefox 或新的 axe 全量扫描；PR 作者历史结果不作为本次结果。本机没有可选 Impeccable detector 与其审阅基线，`detect:ui*` 需额外安装。3 项旧版 AIT-ADS 用例未启用，未计为通过；真实 Stage/正式基线验收已单独完成。构建存在依赖库 `use client` 指令警告，构建成功。
