# writing-skill / 从个人范文创建「去 AI 味」写作 Skill（设计文档）

> Chapter 2-7（🚧 设计阶段）：正文实验 —— 从个人范文创建「去 AI 味」写作 Skill
> 对应《AI Agent 开发实战》第 2 章实验 2-7
> 官方类型：🚧 **设计文档**（仅含架构与实现方案，可运行代码仍在完善中）

← [返回第 2 章目录](../README.md)

## 这个实验在学什么

一句话：**把你「写得不像 AI」的个人经验，外化成一份可加载、可检查、可迭代的写作 Skill（`SKILL.md`）。**

官方实验 2-7 ★★ 与 2-6（Agent Skills 生成 PPT）的不同点在于：**2-6 用的是别人写好的 Skill，2-7 要自己从零「蒸馏」一份 Skill**——原料不是论文 PDF，而是你自己的三到五篇原创文章。它练习的不是「用 Skill」，而是「造 Skill」：

| | 实验 2-6 | 实验 2-7（本实验） |
|---|---|---|
| Skill 来源 | Anthropic 官方 PPTX Skill | **从自己的范文蒸馏** |
| 实验对象 | Skill 的使用 | **Skill 的创建与迭代** |
| 验收重点 | 生成合格的 PPT | Skill 触发条件 / 原则 / 作用域清晰 |
| 依赖 | 独立代码项目 | 不依赖独立代码项目 |

## 官方实验说明（原文要点）

> **实验目标**：用少量人工范文生成一份可加载、可检查的写作 Skill，并观察它能否在新文章中复现作者的主要表达偏好。
>
> **实验说明**：准备三到五篇原创文章，让支持 Agent Skills 的运行时生成初版 `SKILL.md`；选择一个新题目起草文章，作者手动修改后，比较 before/after 并把稳定规律写回 Skill。验收只要求 Skill 具备清晰的触发条件、三到五条带示例的原则、作用域和例外，不把一次主观判断当作普遍规则。
>
> **实验说明了什么**：Skill 的价值在于把个人经验外化为按需加载的指令。一个短小、可读、能通过真实任务检验的初版，比一开始罗列几十条规则更适合作为后续迭代的起点。

## 设计目标

1. **可加载**：`SKILL.md` 符合渐进式披露要求——frontmatter（`name` + `description`）能被目录扫描，正文在触发后才按需进入上下文。
2. **可检查**：Skill 中的每条规则都可读、可验证，配有正例/反例和适用范围。
3. **可迭代**：通过「起草 → 人工改稿 → 差异回写」闭环，让 Skill 越用越贴合作者风格。

## 总体设计：Skill 包 + 驱动脚本

官方明确「不依赖独立代码项目」，所以本实验的产物是**一份 Skill 包**，外加一个极薄的驱动脚本（可选）。整体流程：

```mermaid
flowchart LR
    A[3-5 篇个人范文] --> B[Agent 归纳风格<br/>生成初版 SKILL.md]
    B --> C[新题目起草<br/>Agent 用 Skill 写作]
    C --> D[作者逐句改稿]
    D --> E[对比 before/after<br/>提取稳定规律]
    E -->|回写| B
```

## 目录结构设计

```
7.writing-skill/
├── samples/                  # 3-5 篇个人范文（本轮实验的原料，作者自备）
│   ├── 01_sample.md
│   └── ...
├── skills/
│   └── writing/              # Skill 包（可整体拷贝进任意支持 SKILL.md 的运行时）
│       ├── SKILL.md          # L1 frontmatter + L2 核心流程（初版约 20 行）
│       └── reference.md      # L3 细则：术语表 / 范文节选 / 详细规则
├── drafts/                   # 起草与改稿记录
│   ├── 01_draft.md           # Agent 初稿（before）
│   └── 01_revised.md         # 作者修改稿（after）
├── DESIGN.md                 # 本设计文档（可选拆分）
└── README.md                 # 实验入口
```

## Skill 设计：SKILL.md 骨架

### 1. frontmatter：description 要写成路由条件

`description` 是目录路由决策的关键。写法要求：

- **像路由条件，不像功能介绍**——明确「何时使用 / 何时不使用」边界
- 给出典型**反例**，减少宽泛匹配误触发
- 反例：`Help with writing`（太宽泛，任何写作都会触发）
- 正例：`Rewrite drafts to match the author's personal style; use when a text needs de-AI-flavoring per the author's samples; do NOT use for factual research or data-heavy reports`

```yaml
---
name: writing
description: >-
  Rewrite text to match the author's personal writing style ("de-AI-flavor").
  Use when drafting/revising articles that should read as human-written by the author.
  Do NOT use for: research summaries, data-heavy reports, formal documents.
---
```

### 2. 四部分内容（据宝玉《图解 Skill》）

| 部分 | 要求 |
|---|---|
| **角色与读者** | 这份 Skill 服务谁、面向什么任务、输出达到什么标准 |
| **核心原则** | 只保留 **3-5 条**最重要的判断，每条配正例 + 反例 |
| **禁止清单** | 高频错误、越权动作、易误解表达；同时写清**合法例外** |
| **参考资料** | 术语表、模板、范文、更详细的子文档 |

### 3. 规则模板：作用域 + 动作 + 例外 + 验证方式

规则不要堆成越来越长的「禁用词表」，每条写成可执行的四元组：

```
作用域  → 这条规则管哪类句子/段落/文体
动作    → 遇到时应该怎么做（改写 / 删 / 拆句 / 补充事实）
例外    → 什么时候可以破例
验证方式 → 怎么判断这条规则被执行对了
```

### 4. 初版规模控制

- 初版 `SKILL.md` 约 **20 行**左右（正文部分）
- 用 3-5 篇范文让 Agent 归纳：**用词、句式、段落结构、语气** 四个维度
- 宁短勿长：短小可读的初版便于真实任务检验和迭代

## 迭代闭环：before/after 差异回写

「去 AI 味」最常见的误区是抽象地说「更自然一点」。本实验用**原文 vs 改稿的差异**做信号：

| 差异类型 | 回写方式 |
|---|---|
| 哪些词被删掉 | 进禁止清单（如删除「首先/其次/总而言之」类连接词） |
| 哪些长句被拆开 | 进核心原则（如「单句不超过 25 字，多用短句」） |
| 哪些地方补充了事实 | 进核心原则（如「论点必须配数据或案例」） |
| 哪些重复出现且稳定 | 才值得写回 Skill；**一次性的主观判断不写** |

关键约束（官方验收）：
- 触发条件清晰
- 3-5 条带示例的原则
- 有作用域和例外
- **不把一次主观判断当作普遍规则**

## 运行环境建议

- 任意支持 `SKILL.md` 渐进式披露的 Agent 运行时（Claude Code / Kimi Code 等）
- 本仓库可用 Ollama + 本地模型离线完成起草与归纳（模型负责归纳，人负责验收）
- 范文与改稿必须为**作者本人原创**，这是 Skill 风格信号的唯一来源

## 验收标准

- [ ] `skills/writing/SKILL.md` 存在且能被目录扫描到（frontmatter 合法）
- [ ] `description` 是路由条件写法，含「何时不用」边界
- [ ] 正文含 3-5 条原则，每条有正例和反例
- [ ] 有明确的作用域（适用文体）与合法例外
- [ ] 有至少一轮「起草 → 改稿 → 回写」的完整记录（drafts/）
- [ ] 用改后的 Skill 再写一篇新文，作者主要表达偏好可复现
