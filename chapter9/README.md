# Chapter 9 —— Agent 的持续进化

本目录对应《AI Agent 开发实战》第 9 章。本章学习把评估接到更新过程：经验可以写成知识、提示词/Skill、工作流或模型参数，但每次更新都应有来源、独立验证和适用范围。核心区分是"保存经历 ≠ 从经历中学习"，以及更新产物（最小 diff + 可回滚）与更新方法（元策略）两层。

对应章节正文：[第 9 章 · Agent 的持续进化](https://bojieli.github.io/ai-agent-book/book/chapter9/) · [配套实验索引](https://bojieli.github.io/ai-agent-book/chapter9/)

> **本章状态：尚未开始。** 以下为可做性评估。本章是第 5～8 章的汇合点——第 3 章的记忆、第 5 章的 Coding Agent、第 7 章的评估、第 8 章的训练标签都在这里交汇。

## 官方实验与本仓库可行性对照

官方 9 个编号实验（9-1 ~ 9-9）。评估结论：**9-1 / 9-3 / 9-6 / 9-7 / 9-9 是本章最适合本地的五个**（CPU + API Key，无需外部仓库与 GPU），且直接复用本仓库已有资产。

| 编号 | 主题 | 官方状态 | 依赖 | 本仓库结论 |
| --- | --- | --- | --- | --- |
| 9-1 | trajectory-verifier | ✅ | CPU + API Key | 📋 **强烈建议做**：三层 verifier + LLM-as-Judge，直接复用 5-11 的轨迹与重放机制 |
| 9-2 | tau2-escalation-experience | ✅ | CPU + API Key + **clone tau2-bench** | 🔶 部分：提炼与迁移机制可做，任务集用自建 |
| 9-3 | prompt-auto-optimization | ✅ | CPU + API Key（调用量大） | 📋 建议做：三组对照（初始/自动/人工）+ 发布门槛 |
| 9-4 | 用户反馈进化 Skill | 🚧 | 官方明确无配套代码 | ❌ 不移植（官方标进行中） |
| 9-5 | browser-use-rpa | ✅ | Chromium + ARK Key | 🔶 可做：本地可重置页面 + Playwright，ARK 臂不移植 |
| 9-6 | self-modifying-agent | ✅ | CPU + API Key + Coding Agent 运行时 | 📋 **强烈建议做**：复用 0.coding-agent 的七工具主循环做真实改码 |
| 9-7 | harness-safety-gate | ✅ | CPU + OpenAI Key + AST 检查 | 📋 建议做：与 5-5（代码化规则）、5-4 执行工具安全呼应 |
| 9-8 | hermes-self-evolution | 📖 | clone 外部 Hermes + 长时间多轮 | ❌ 不移植（迭代次数与 token 不可控） |
| 9-9 | self-evolution-eval | ✅ | CPU + API Key（126 次真实调用） | 📋 建议做：static / append-only / evolving 三臂 × seeds × 任务 |

## 无编号补充案例

| 项目 | 内容 | 可行性 |
| --- | --- | --- |
| prompt-distillation | 跨章项目，训练侧在第 8 章 | 见 8-8（不移植） |
| self-evolving-tools | Alita 式工具发现、封装与复用 | 🔶 可做：与第 4 章工具发现呼应 |
| ai-style-skill | 把"去 AI 味"反馈提炼为可检查规则 | 🔶 可做：接续 chapter2/7.writing-skill（当前仅有设计文档） |

## 官方"第一次阅读的顺序"

1. 先把**轨迹变成带具体证据的诊断** → `trajectory-verifier`
2. 再看一条诊断怎样引出**可检查的最小补丁** → `prompt-auto-optimization`
3. 最后用**任务流检查学习、迁移、修订与保持** → `self-evolution-eval`

这条路径恰好构成一个完整闭环：**诊断 → 补丁 → 验证是否真的学会**。

## 建议动手顺序

按"复用已有资产最多"排序：

1. **9-1 trajectory-verifier** — 复用 5-11（诊断+回归）、3-1（记忆轨迹），把"经历"变成"证据"
2. **9-6 self-modifying-agent** — 复用 0.coding-agent，让 Agent 真的改自己的代码并走回归/灰度/回滚门
3. **9-7 harness-safety-gate** — 复用 5-5 的服务端校验思路，把"高风险调用确认"编码化
4. **9-3 / 9-9 提示词自优化与自进化评估** — 前者产出最小 diff，后者验证三臂差异

**注意官方保留的负结果**：9-1 记录了"关键违规稳定性主张未复现"，9-7 记录了真实 `gpt-4o-mini` 提案因静态检查失败被安全拒绝。做本地版时若结论与官方不同，如实记录——负结果同样是本章的教材。

## 跨章衔接

本章是第 5 章（Coding Agent 改码）、第 7 章（评估门禁）、第 8 章（训练标签来源）的汇合点。若要做 9-6，建议先具备 0.coding-agent 与 5-4 执行工具的基础。

## 待补充

- 各实验目录（`1.` ~ `9.`）
- 快速开始
- 实测结果

> 本章尚未动手。README 只记录官方清单、资产复用关系与建议顺序，不预填结论。