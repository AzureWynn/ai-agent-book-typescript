# Chapter 7 —— Agent 的评估

本目录对应《AI Agent 开发实战》第 7 章。本章学习如何把"表现好不好"转成可解释的比较：先理解环境与评分，再定位失败，最后检查模型、记忆和系统成本的不同维度。

对应章节正文：[第 7 章 · Agent 的评估](https://bojieli.github.io/ai-agent-book/book/chapter7/) · [配套实验索引](https://bojieli.github.io/ai-agent-book/chapter7/)

> **本章状态：尚未开始。** 以下为可做性评估，动手前请先读这份表，避免重复评估。

## 官方实验与本仓库可行性对照

官方共 14 个编号实验（7-1 ~ 7-14）。评估结论：**7-8 / 7-10 纯本地可做且结论硬；7-3 / 7-4 / 7-7 / 7-9 可做简化教学版（复用第 3 章资产）；7-1 / 7-2 需克隆外部基准仓库；7-13 / 7-14 需真机或集群，不移植。**

| 编号 | 主题 | 官方状态 | 可行性 | 本仓库结论 |
| --- | --- | --- | --- | --- |
| 7-1 | tau2-bench-eval | ✅ | 📖 需 clone `sierra-research/tau2-bench` | 不移植（外部基准 + 双控任务依赖上游环境版本） |
| 7-2 | human-benchmark（18 个人工案例） | ✅ | 📖 需 clone 6 个外部基准 | 不移植（正文定位为人工操作员记录，非 harness 全跑） |
| 7-3 | user-memory-evaluation | ✅ | 🟢 CPU + API Key | 📋 **建议做**：Rubric 四档 × 3 系统，直接复用 chapter3/1.user-memory |
| 7-4 | user-memory-system-evaluation | ✅ | 🟢 CPU + API Key | 📋 **建议做**：60 用例 × 3 系统轨迹，与 7-3 配对 |
| 7-7 | user-memory-policy-eval | ✅ | 🟢 CPU + API Key | 📋 可做：轨迹前缀 bad case × 三种表示，对应 chapter7/9 跨章协议 |
| 7-8 | elo-leaderboard | ✅ | 🟢 **纯计算，无模型调用** | 📋 **强烈建议做**：公开 Arena 记录 + Elo/BT 排名，全离线 |
| 7-9 | model-action-threshold | ✅ | 🟡 CPU + API Key | 📋 可做：中性 harness 下多模型 × 任务 × 重复的选型阈值 |
| 7-10 | agent-cost-analysis | ✅ | 🟢 CPU（成本为本地推理实测） | 📋 **强烈建议做**：直接复用 chapter2/3.kv-cache 与 2.10 上下文压缩 |
| 7-11 | model-benchmark | 🚧 | 🔴 168 小时长跑 campaign | 不移植（官方自己标进行中，无验收证据） |
| 7-12 | user-memory-system-evaluation（全矩阵） | ✅ | 🟡 1440 条轨迹，调用量大 | 📋 与 7-4 同源，按本地预算缩减矩阵 |
| 7-13 | android-world | ✅ | 🔴 需 Pixel 6 模拟器 + GPU | 不移植 |
| 7-14 | openvla-robotwin2-eval | ✅ | 🔴 需单卡集群跑 25 chunk | 不移植 |
| — | public-health-reporting-eval | ✅ | 🟢 CPU（合成数据） | 📋 可做：工具调用/计算/证据引用四维评估，纯本地 |

## 官方"第一次阅读的顺序"

1. 先读一条交互任务，区分**回答质量**与**环境目标**
2. 再用已有日志练习寻找**最早失去依据的决策**
3. 最后把成功条件、调用成本与延迟放在一起分析

## 跨章 Bad Case 回归协议（第 7 章与第 8 章的衔接）

正文新增的两类作用域/保真度 Bad Case 评估不把训练代码重复到本章：第 7 章负责记录**首个错误、片段作用域、逐层字符串哈希、轨迹前缀回归**；第 8 章的 `curly-quote-sft` 与 `exact-copy-sft` 复用这些标签生成训练数据。前者按中文/英文/代码/JSON 作用域评分，后者按 byte/code-point/token exactness 评分。

若做 7-7（user-memory-policy-eval），它正是这套协议的存储与回归实现，是进入第 8 章的桥。

## 建议动手顺序

若以"复用已有资产 + 结论最硬"排序：

1. **7-10 agent-cost-analysis** — 复用 2-3（KV Cache）与 2-10（上下文压缩）的现成实验，做成本 A/B
2. **7-8 elo-leaderboard** — 纯计算，无模型调用，统计结论可与官方对齐（Spearman 0.787）
3. **7-3 / 7-4 记忆评估** — 把第 3 章的记忆系统"评"一遍，建立 Rubric 概念
4. **7-9 选型阈值** — 回答"什么时候换模型"，与第 5 章 Harness 讨论呼应

## 待补充

- 各实验目录（`1.` ~ `14.`）
- 快速开始
- 实测结果

> 本章尚未动手，README 只记录官方清单与可行性判断，不预填结论。