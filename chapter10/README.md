# Chapter 10 —— 多 Agent 协作

本目录对应《AI Agent 开发实战》第 10 章。本章关注分工带来的收益与协调成本：多个角色需要清楚的上下文、消息和完成条件；**增加角色数量本身并不能保证任务更好**。核心判据是"协作过程是否引入了单个 Agent 在生成时无法获得的新信息"，以及"群体的智能可以高于个体"。

对应章节正文：[第 10 章 · 多Agent协作](https://bojieli.github.io/ai-agent-book/book/chapter10/) · [配套实验索引](https://bojieli.github.io/ai-agent-book/chapter10/)

> **本章状态：尚未开始。** 以下为可做性评估。本章的多数实验价值在"负结果"，本地复现的重点应是**机制**（消息总线、状态机、私有信息边界），而非规模。

## 官方项目与本仓库可行性对照

官方 6 个编号项目（10-1 ~ 10-6）。评估结论：**10-1 / 10-2 / 10-4 是本地最值得做的三个**（CPU + API Key，机制清晰），10-5 需 clone 上游且调用量天价，10-3/10-6 绑定真机硬件。

| 编号 | 主题 | 官方状态 | 依赖 | 本仓库结论 |
| --- | --- | --- | --- | --- |
| 10-1 | multi-role-transfer | ✅ | CPU + 模型 Key + **Tavily Key** | 📋 **强烈建议做**：替换 system prompt vs 加载 Skill 的对照，与第 2 章 KV Cache 直接呼应 |
| 10-2 | book-translation | ✅ | CPU + ARK Key | 📋 **建议做**：多 Agent 管理者模式，"文件承载长产物而不占满上下文" |
| 10-3 | autonomous-phone-registration / TalkAct | ✅/📖 | Playwright + WebRTC + 本机 TTS/Whisper + **双 API Key** | ❌ 不移植（依赖最重） |
| 10-4 | parallel-web-research | ✅ | CPU + ARK Key + Chromium | 📋 建议做：10 worker 并行 + 消息总线 + 级联取消 |
| 10-5 | Generative Agents 复现 | 📖 | clone 上游 + Qwen Key，**25 Agent × 17,280 步 × 三组** | ❌ 不移植（token 成本极高） |
| 10-6 | voice-werewolf | ✅ | **macOS 真机**（`say`）+ OpenRouter 音频接口 | 🔶 部分：逻辑层与信息隔离可做，音频层不移植 |

## 官方"第一次阅读的顺序"

1. 先比较**角色切换与技能加载**的行为边界 → `multi-role-transfer`
2. 再理解**文件如何承载长产物**而不占满管理者上下文 → `book-translation`
3. 最后用**状态明确的多人任务**观察消息与私有信息边界 → `voice-werewolf`

## 建议动手顺序

按"本地能跑完 + 复用已有资产"排序：

1. **10-1 multi-role-transfer** — 核心是"换角色 = 换 system prompt vs 加载 Skill"的 KV Cache 对照。本仓库已有 2-3.kv-cache 与 2-6.agent-skills-ppt（Skills 三层披露），两个资产正好对上；Tavily 臂可换成 chapter1/2.web-search-agent 的 SearXNG。
2. **10-2 book-translation** — Manager + Glossary/Translation/Review 多角色，测"长产物写文件、上下文只留结论"。官方结论质量持平但慢 6.57%、术语一致率与 Markdown 精确保真为负，这些负结论本地值得复现。
3. **10-4 parallel-web-research** — 消息总线 + 并行 worker + 级联取消的机制实现，重点是"故障边界控制"（一个 worker 失败不拖垮全体），与第 4 章的并行工具调用呼应。
4. **10-6 voice-werewolf（逻辑层）** — 信息隔离（谁能看到谁的私有信息）是多 Agent 的核心设计问题，可以用文本事件代替语音验证。

## 必须保留的负结果

官方在本章明确保留了多处负结论，本地复现若得不同结论应如实记录：

- **10-1**：修复 Harness 策略门后，Skill 确定性通过率 15/30，而 Transfer 仅 2/30 —— "换个角色演一遍"几乎等于没学
- **10-2**：质量持平（4.654 > 4.481）但**慢 6.57%**，宽泛术语一致率与 Markdown 精确保真出现明确负结果
- **10-5**：自定义气候韧性工作坊**未扩散出发起人**；关闭反思后证据关联为零；基线在 25 人盲评中以 17:8 胜出

这些不是抓取缺陷，是本章的核心教材：**多 Agent 的收益并不显然，必须实测。**

## 跨章衔接

- 第 2 章 2-6（Skills）与 2-3（KV Cache）→ 10-1 的核心机制
- 第 5 章 5-6（单/双 Agent 分工省上下文）→ 10-2 的管理者模式
- 第 4 章并行工具调用的故障边界 → 10-4 的消息总线
- 第 7 章 7-6（多 Agent 的失败归因）→ 本章的"哪里没协作好"

## 待补充

- 各实验目录（`1.` ~ `6.`）
- 快速开始
- 实测结果与负结论

> 本章尚未动手。README 只记录官方清单、机制复用关系与建议顺序，不预填结论。