# Chapter 2 汇总笔记：上下文工程（章级）

> 对应《AI Agent 开发实战》第 2 章。本章核心：**上下文决定 Agent 能力上限——模型看到什么、何时看到，直接影响工具选择、缓存与长任务表现。**

## 一、本章一句话

**上下文不是"往提示词里多塞信息"，而是一套有顺序、有来源、需要管理的信息供给系统——一个中等能力的模型配上精心组织的上下文，往往胜过一个顶级模型在信息匮乏下的盲目摸索。**

## 二、实验地图

| 实验 | 主题 | 一句话核心 | 笔记 |
|---|---|---|---|
| 2-1 | 本地 LLM 服务与工具调用 | Ollama 原生 `/api/chat` 跑通流式 ReAct 闭环，thinking 字段自动回退 | [LEARNING_NOTE](1.local-llm-serving/LEARNING_NOTE.md) |
| 2-2 | 注意力机制可视化 | 用真实热力图看到 Attention Sink + 因果三角 | [LEARNING_NOTE](2.attention-visualization/ATTENTION_LEARNING_NOTE.md) |
| 2-3 | KV Cache 与错误上下文管理 | "怎么问"和"问什么"一样重要：前缀一变缓存全废 | [LEARNING_NOTE](3.kv-cache/KV_CACHE_LEARNING_NOTE.md) |
| 2-4 | 提示工程消融 | 语气/规则组织/工具描述怎么影响任务完成率 | [LEARNING_NOTE](4.prompt-engineering/PROMPT_ENGINEERING_LEARNING_NOTE.md) |
| 2-5 | 提示注入攻防 | 指令伪装成数据，4 层防御逐层加固 | [LEARNING_NOTE](5.prompt-injection/PROMPT_INJECTION_LEARNING_NOTE.md) |
| 2-6 | Agent Skills 生成 PPT | 三层渐进式披露：目录 → 核心流程 → 子文档 | [LEARNING_NOTE](6.agent-skills-ppt/AGENT_SKILLS_LEARNING_NOTE.md) |
| 2-7 | 从范文创建写作 Skill | 把个人写作经验蒸馏成可加载、可迭代的 SKILL.md | [设计文档](7.writing-skill/README.md) |
| 2-8 | 状态栏 × 注意力可视化 | 热力图证明：状态栏把"现算"变成"瞥一眼" | [LEARNING_NOTE](2.attention-visualization/ATTENTION_LEARNING_NOTE.md) |
| 2-9 | Agent 状态栏（System Hint） | 给 Agent 挂便利贴：每轮注入结构化状态摘要 | [LEARNING_NOTE](9.system-hint/SYSTEM_HINT_LEARNING_NOTE.md) |
| 2-10 | 上下文压缩策略对比 | 窗口有限时，怎么压缩才"省空间又不丢关键信息" | [LEARNING_NOTE](10.context-compression/CONTEXT_COMPRESSION_LEARNING_NOTE.md) |

## 三、贯穿全章的主线：上下文工程

十个实验围绕同一个问题的三个维度展开——**给模型送什么信息、以什么结构送、花多大成本送**：

```
上下文工程
├── 结构层（2-1）    四种消息角色 + tools 字段；模型负责决策，框架负责执行
├── 成本层（2-3）    KV Cache：前缀稳定 → 缓存命中 → 首 token 快 17 倍
└── 策略层（2-4~2-10）
    ├── 怎么写提示词（2-4）
    ├── 怎么防攻击（2-5）
    ├── 怎么按需加载知识（2-6, 2-7 Skills）
    ├── 怎么让模型看得见状态（2-8, 2-9 状态栏）
    └── 怎么在溢出前压缩（2-10）
```

**共同问题只有一个：怎样以更低成本向模型提供一个信息充分的上下文 $c_t$？**

## 四、核心知识点提炼

### 1. API 上下文结构：四种消息角色 + tools 字段

每次模型调用都是一个**无状态**请求，框架必须重发完整历史：

```
system（开发者规则）→ user → assistant(含 tool_calls) → tool(结果, 用 tool_call_id 关联) → ...
tools 字段 = 工具定义（静态元数据，与用户问什么无关）
```

- 第一章的"五个上下文组成部分" = 四种消息角色 + `tools` 字段
- 模型只发出调用请求，**真正执行工具的是框架**（决策/执行分离）
- 第二次调用必须原样带回第一次的 assistant 消息，模型才能"看到"自己的决策

### 2. 上下文决定能力上限

模型智商只是基础，上下文质量才是关键。三类最低信息需求：**代码信息、流程规范、环境信息**。对远程工作友好的团队也对 AI Agent 友好——信息公开、可检索、结构化。构建 AI 原生团队首先是**文档化运动**。

### 3. KV Cache：前缀稳定是命门

KV Cache 缓存已算过的中间结果；前缀一旦变化，缓存全废，从头重算。

```
有缓存：首 token 延迟 0.3s；没缓存：5s —— 差 17 倍
```

实验 2-3 用 6 种模式（1 正 5 反）证明：把固定内容放在**最前面**（system 提示、工具描述）能让前缀保持稳定，从而吃到缓存红利。

### 4. 提示工程是"培训新员工"

把 Agent 当新员工，控制变量法测 6 种"培训方式"（臂）。规则手册、语气、工具描述都会改变任务完成率。测试任务藏陷阱（如 UA 航班必须可退款），看 Agent 是否**真读懂了规则**而非只满足表面需求。

### 5. 提示注入：指令伪装成数据

```
正常：用户消息是"指令"，网页内容是"数据"
攻击：攻击者把"指令"混进"数据"里 → Agent 读网页 → 不知不觉执行恶意指令
```

防御逐层加固：无防御 → 提示词警告 → 工具结果加来源标记（XML）→ 组合防御（警告 + 标记 + 高风险操作确认）。

### 6. Agent Skills：渐进式披露

静态提示词会膨胀（浪费 token + 稀释注意力），Skills 用三层结构解决：

```
第一层 元数据目录（SKILL.md frontmatter：name + description）→ 常驻，~200 token
第二层 核心流程（完整 SKILL.md 正文）→ 按需加载
第三层 细则（reference.md 等子文档）→ 选择性深入
```

- **description 是路由条件**："何时该用我"比"我能做什么"重要；给反例防误触发
- 两种触发：斜杠命令（本地拦截）/ 模型自主调 Skill 工具（多一次 ReAct 往返）
- 通用原则：**少量目录常驻、完整正文按需加载**；"对 KV Cache 友好"≠"零成本"

### 7. Skill 蒸馏（2-7，本仓库设计文档）

造 Skill 而不是用 Skill：3-5 篇范文 → 归纳风格生成 20 行初版 → 起草 → 人工改稿 → **before/after 差异回写**。

- 差异比抽象指令有信息量：哪些词被删、哪些长句被拆、哪里补了事实
- 规则模板：**作用域 + 动作 + 例外 + 验证方式**
- 验收：触发条件清晰、3-5 条带示例的原则、作用域和例外；不把一次主观判断当普遍规则

### 8. Agent 状态栏：显式操纵注意力

**上下文窗口是一台只有一半的检索引擎**：检索强（问什么捞什么），但没有"提炼层"——任何"关于这些内容的结论"模型都得现算。

状态栏 = 在上下文**末尾**注入结构化状态摘要（"已打 3 次电话 / 剩余 2 项 TODO"）。位置原理：末尾 token 在空间上更接近即将生成的新 token，注意力权重更高——**强制性的注意力引导**，让"隐式分散状态"变成"显式可用知识"。

### 9. 上下文压缩：空间 vs 信息

窗口快满时的 6 种压缩策略（不压缩 / combined / context_aware / individual / windowed 等）：信息保留越全体积越大。**本质：在有限空间装最多的有用信息**，取舍由任务需求决定。

## 五、工程实践启示

1. **无状态 API 是架构事实**：一切"记忆"（历史、状态、Skill 正文）都得框架显式喂回去
2. **评估先于优化**：2-4/2-5 都是控制变量 + 成功率矩阵，先定义怎么度量再谈提升
3. **KV Cache 命中的第一性原理是"前缀稳定"**：把稳定的放最前，动态的放后面
4. **能用"瞥一眼"就别让模型"现算"**：状态栏用极低 token 成本替代数千 token 的重新统计
5. **知识外化优于堆词**：Skills（2-6/2-7）是领域知识的可组合单元，可独立测试、版本控制、分享——像 npm/pip
6. **防御要分层**：单一防线挡不住所有攻击，来源标记 + 警告 + 高风险确认组合才有效

## 六、自测清单

- [ ] 能画出带工具调用的两轮 API 交互序列（含 tool_call_id 回灌）
- [ ] 能解释"模型发出请求，框架执行工具"的分工
- [ ] 能解释 KV Cache 命中为什么依赖前缀稳定
- [ ] 能说出 Skills 三层结构 + description 的路由写法
- [ ] 能解释状态栏为什么放在上下文末尾、它治的是注意力的什么问题
- [ ] 能说出提示注入的本质（指令伪装成数据）和至少两种防御
- [ ] 能说出 before/after 差异回写为什么比抽象指令更有信息量

## 七、延伸阅读

- 官方章节正文：[chapter2.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter2.md)
- 本章实验索引：[chapter2/README.md](https://github.com/bojieli/ai-agent-book/blob/main/chapter2/README.md)
- 宝玉《别再用提示词去 AI 味了，方向就是错的》：https://baoyu.io/blog/2026-02-14/remove-ai-writing-flavor
- 学习建议：[LEARNING.md](https://github.com/bojieli/ai-agent-book/blob/main/docs/zh-CN/LEARNING.md)
