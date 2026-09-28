# Mem0 / Memobase Agent 对比

> Chapter 3-2: 开源记忆框架对比 — mem0 (ADD-only) vs memobase (四类记忆)
> 对应《AI Agent 开发实战》第 3 章实验 3-2

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-2：**开源记忆框架对比**。本仓库为 **TypeScript 实现**，对比 mem0（ADD-only 策略，只加不减）与 memobase（四类记忆：情景/语义/程序/工作 + Profile/Event 分离）的设计差异。

## 概述

3-1 我们自己实现了一个记忆系统。3-2 看看两个主流开源框架是怎么做的：

- **mem0**：ADD-only 策略，只加不减
- **memobase**：四类记忆（情景/语义/程序/工作）+ Profile/Event 分离

## Code map

- **对比演示：** `npm run compare` — 同时展示 mem0 和 memobase 的核心概念
- **mem0 概念：** `src/mem0.ts` — Mem0Store 类，ADD-only 记忆管理
- **memobase 概念：** `src/memobase.ts` — MemobaseStore 类，四类记忆 + 衰减/聚类
- **教学笔记：** [LEARNING_NOTE-3-2.md](LEARNING_NOTE-3-2.md) — 概念对比

## Installation

```bash
cd chapter3/2.mem0
npm install
npm run compare                     # 对比两种框架的核心概念
npm run mem0                        # 只看 mem0 演示
npm run memobase                    # 只看 memobase 演示
```

## 架构图

```
mem0（ADD-only）：
┌─────────────────────────────────┐
│  add_memory(content)            │
│  → ADD 进去，永远不修改          │
│  → ChromaDB / 向量数据库        │
│  → 搜索：语义 + BM25 混合      │
└─────────────────────────────────┘

memobase（四类记忆）：
┌─────────────────────────────────┐
│  add(episodic/semantic/         │
│       procedural/working,       │
│       content)                  │
│  → 按类型存储                    │
│  → 重要性衰减 + 聚类压缩         │
│  → Profile + Event 双模型       │
└─────────────────────────────────┘
```

## 与 3-1 的关系

| 维度 | 3-1 自实现 | mem0 | memobase |
|------|-----------|------|----------|
| 写入 | 手动 add/update/delete | ADD-only 自动 | 按类型添加 |
| 存储 | JSON 文件 | ChromaDB | pickle |
| 检索 | getContextString() | 语义+BM25 | 按类型+重要性 |
| 管理 | 手动 | 自动衰减 | 自动衰减+聚类 |

## 教学笔记

更详细的讲解（为什么 mem0 选择 ADD-only 而不删除、memobase 的四类记忆各自代表什么、LOCOMO 评测基准的含义）见 [`LEARNING_NOTE-3-2.md`](LEARNING_NOTE-3-2.md)。建议先看这份再看代码。

## 目录结构

```
2.mem0/
├── src/
│   ├── mem0.ts          # Mem0Store：ADD-only 记忆管理 + 语义+BM25 混合检索
│   ├── memobase.ts      # MemobaseStore：四类记忆 + 衰减/聚类 + Profile/Event
│   ├── main.ts          # 对比演示入口
│   └── config.ts        # 环境变量配置
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. mem0 的 ADD-only 策略

mem0 的核心设计哲学：**记忆只增不减**。每次 `add_memory` 调用都将新内容追加到 ChromaDB，从不删除或修改已有记忆。

- **检索方式**：语义搜索 + BM25 关键词混合（hybrid search）
- **为什么这样设计**：避免删除错误导致信息丢失，检索时通过相关性排序自然过滤低质量记忆
- **trade-off**：记忆文件无限增长，但检索时按相关性取 top-K 即可

### 2. memobase 的四类记忆

memobase 将记忆分为四类，每类有独立的存储和检索策略：

| 类型 | 含义 | 检索方式 |
|------|------|----------|
| Episodic | 发生了什么（事件） | 时间线检索 |
| Semantic | 事实和概念 | 语义相似度 |
| Procedural | 怎么做（技能/流程） | 关键词匹配 |
| Working | 当前任务上下文 | 优先级队列 |

memobase 还区分 Profile（稳定属性，如用户偏好）和 Event（时间线事件），实现更精细的管理。

### 3. 衰减与聚类

memobase 自动对记忆进行重要性衰减（旧记忆权重降低）和聚类（合并相似记忆），防止记忆库无限膨胀。

## 实测结果

```
npm run compare 输出：
  mem0：ADD-only + 混合检索
  memobase：四类记忆 + 衰减/聚类
  
npm run mem0：
  mem0 演示：ADD-only 策略运行正常
  
npm run memobase：
  memobase 演示：四类记忆存储和检索正常
```

## 关键洞察

1. **ADD-only 不是缺陷而是设计**：mem0 认为"不删"比"删错"更安全
2. **四类记忆反映认知科学**：情景记忆（做了什么）、语义记忆（知道了什么）、程序记忆（怎么做的）、工作记忆（正在想什么）
3. **框架选择取决于需求**：mem0 适合快速接入，memobase 适合深度定制
4. **自实现 vs 框架**：3-1 理解了底层机制，3-2 理解了框架抽象层做了什么

## 注意事项

- `npm run compare` 需要同时运行 mem0 和 memobase 逻辑，确保 TypeScript 编译通过
- mem0 使用 ChromaDB，memobase 使用 pickle 文件，两者后端不同
- `MEMORY_MODE` 环境变量只在 3-1 中使用，3-2 是对比框架
- memobase 的衰减/聚类是自动的，但具体策略参数可通过配置调整
- 本实验是概念验证（TypeScript），生产环境使用各自框架的官方 SDK

## 参考

- [教学笔记](LEARNING_NOTE-3-2.md) — 概念对比
- 官方实验代码：[mem0](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/mem0)
- 官方实验代码：[memobase](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/memobase)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- 官方讲义：[chapter3/README.md](https://github.com/bojieli/ai-agent-book/blob/main/chapter3/README.md)
