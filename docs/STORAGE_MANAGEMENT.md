# 分析快照与诊断空间管理

数据库保持 DuckDB，已有分析快照不自动改写或删除。

## 新分析的默认行为

`SnapshotStore.diagnostics_writer` 默认采用 compact 模式，覆盖旧版分析服务、
直接关联运行和增量发布。原生阶段流水线的封存证据文件不作采样。
已有 v3/v4 专用受限诊断继续保留其精确统计；其他版本使用通用精简诊断。

- 每个已评分候选的最终判定、未舍入分数和规则完整写入 `candidate_decisions/*.parquet`。
- 拒绝候选的成员计算过程保存准确计数、分数分布和有限分类样本。
- 通用精简模式保留接受候选的上下文、获胜成员分解和最终判定。
- 原始告警、正式关系、攻击链、增量依赖历史和必要证据不受辅助明细预算截断。
- `bounded_diagnostics.json` 记录实际计数、样本数量、预算及发生的明细省略。
- `diagnostics.jsonl` 路径和现有 manifest 哈希校验保留。

辅助明细预算默认 **100 MiB/分析**，涵盖普通 JSON 记录和拒绝样本的未压缩字节，
不包含精确候选表、全部判定、必要证据、摘要和正式结果。因此它不是整个分析目录的硬上限。
精确表仍会随候选量增长；不能为了满足日志预算省略正式证据或判定。

PowerShell 配置（重启服务生效）：

```powershell
$env:TRACEBACK_DIAGNOSTICS_DETAIL_MIB = '100'
```

旧版全成员消融、按日志字节偏移读取的评估需要完整诊断；必须明确开启 full 模式，
不能把 compact 样本当成完整评分总体。已有历史 full 快照仍可原样读取。

```powershell
$env:TRACEBACK_DIAGNOSTICS_MODE = 'full'
$env:TRACEBACK_DIAGNOSTICS_FULL_MIB = '200'
```

全量调试超过预算会显式失败，不发布伪完整结果。调试后将模式改回 `compact`。
预算只影响存储观察，不修改评分、阈值、候选排序或正式领域对象。

## 历史快照盘点与清理

先生成只读清单，不删除数据：

```powershell
.\.venv\Scripts\python.exe scripts/snapshot_storage.py --output .tmp/storage-plan.json
```

清单按大小排序，包含状态、版本、诊断大小、总大小、文件元数据指纹、已发现的外部引用，
并报告辅助诊断项目预算参考值 2 GiB。当前只报告预算，不自动淘汰快照。

引用扫描覆盖源码、文档和小于等于 8 MiB 的 JSON 等文本；不扫描原始 data、数据库内容、
大文件、外部项目或其他磁盘。必须人工确认增量工作区中的父分析依赖、论文/实验基线和外部消费者。
有已发现引用、活动状态、sealed 或无法分类的快照拒绝删除。

确认历史结果不再需要后，先停止后端与分析脚本，备份需要留存的实验。
删除时必须提供原清单、完整分析 ID 和历史丢失确认标志；支持重复 `--analysis-id`。

```powershell
.\.venv\Scripts\python.exe scripts/snapshot_storage.py --delete --plan .tmp/storage-plan.json --analysis-id ana_完整64位哈希 --acknowledge-history-loss
```

工具会重新盘点：快照或引用在审阅后发生变化则拒绝操作；所有目标通过检查后才开始删除。
路径限制在指定项目的 `data/processed/<id>` 和 `outputs/analyses/<id>`，拒绝符号链接与 Windows junction。
这会永久删除选定快照的两个目录，历史 URL 和依赖它们的实验将失效。
停止服务是必需条件，工具不能代替所有外部写入进程的锁；磁盘故障导致的部分删除需人工处理。

不要单独清空 diagnostics、删除 JSONL/Parquet/DuckDB 三种格式中的任意一种，或重算旧 manifest 冒充原快照。
当前正式入口 `outputs/stage9_formal_acceptance_20261022/` 和独立历史阶段入口均不属于此工具删除范围。

历史 v3 快照的序列化复现测试依赖本机数据，未安装或已明确清理该快照时会报告跳过。
若快照目录仍存在，缺失文件、损坏数据或序列化不一致仍会导致测试失败。
