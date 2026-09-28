# agentic-rag-memory / 面向用户记忆的 Agentic RAG

> Chapter 3-9: 对话记忆分块索引 + ReAct 多轮取证，跨会话补齐背景
> 对应《AI Agent 开发实战》第 3 章实验 3-9

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-9：**面向用户记忆的 Agentic RAG**。本仓库为 **TypeScript 实现**，纯标准库、完全离线，是 3-1（用户记忆）与 3-8（多轮取证）的结合：16 轮对话按会话切成 8 个记忆分块，Agent 用三个记忆工具（search_memory / get_conversation_context / get_full_conversation）多轮补齐跨会话背景。作答层可选 Ollama gemma4，prompt 含"以后来记录为准"处理过期记忆。

## 快速开始

```bash
# demo/eval 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # L2 车辆追踪 + L2 海边追踪
npm run eval      # 5 问题 × 单次/多轮的证据召回表

# 生成层（可选，需 Ollama + gemma4）
npm run answer    # 多轮取证 → 读全会话 → gemma4 作答
```

换查询（无标注时只展示单次检索）：

```bash
npx tsx src/main.ts --mode demo --query "特斯拉胎压怎么办"
npx tsx src/main.ts --mode answer --query "哪辆车先去保养"
```

## 教学笔记

更详细的讲解（会话分块与重叠、三个工具的分工、follow-up 按缺口选择、过期记忆保留但取新）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
9.agentic-rag-memory/
├── src/
│   ├── tokenizer.ts   # 中文按字 + ASCII 按词（与 3-8 同规则）
│   ├── index.ts       # BM25（与 3-5/3-6/3-7/3-8 同规则）
│   ├── corpus.ts      # 16 轮对话（带要素标签）+ 5 个标注问题
│   ├── chunker.ts     # 按会话分块 + 末轮重叠 + enrichment 头
│   ├── agent.ts       # 三个记忆工具 + 缺口驱动 ReAct
│   ├── metrics.ts     # avg
│   ├── answer.ts      # 生成层：gemma4，"以后来记录为准"（可选）
│   ├── config.ts      # OLLAMA_BASE_URL / OLLAMA_MODEL
│   └── main.ts        # CLI（demo / eval / answer）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 会话分块（chunker.ts）

会话是天然边界：一个会话一切，上一会话末轮带上做重叠，块头写 enrichment（`[session s2 | rounds 3,4 (overlap)]`）。重叠防止边界丢失，要素取块内全部轮次的并集。

### 2. 三个记忆工具（agent.ts）

```ts
search_memory(query, topK)          // BM25 搜分块，每轮必调
get_conversation_context(chunkId)   // 看命中块的前后邻居，首轮展开一次
get_full_conversation(sessionId)    // 读某会话全部原文，收尾前读一次
```

由粗到细：先定位线索块，再看邻居，最后读全会话再作答。

### 3. 缺口驱动选 follow-up（agent.ts）

和 3-8 的区别：follow-up 不按固定顺序取，看当前缺什么选什么——候选里覆盖缺口要素最多的优先。生产里这一步由模型现场写查询，机制一样。本实验因此比固定顺序少一轮（车辆题 3 轮→2 轮）。

## 实测结果

`npm run demo`（查询 "哪辆车先去保养"）：

```
[Naive] hits=[k_s1, k_s6, k_s7]  recall=0.67   # 特斯拉那块零交集，漏了
[Agentic]
  round 1: missing=[特斯拉胎压] → follow-up "特斯拉检查"
  round 2: 缺口补完 → 停
  evidence recall: 0.67 → 1.00（2 轮，4 工具调用）
```

`npm run eval`（8 会话分块，5 问题，top-3）：

```
L1 ×2   naive=100%  agentic=100%  检索 1→1
L2 车辆 naive=67%   agentic=100%  检索 1→2
L2 海边 naive=100%  agentic=100%  检索 1→1
L3 出门 naive=50%   agentic=100%  检索 1→2
总表：0.83 → 1.00
```

**解读**：差距集中在跨会话问题（要素散在不同会话）；海边题打平但有价值——新旧记忆都被召回，考的是作答层取新（`answer` 模式可见），不是检索层。

## 关键洞察

1. **3-9 = 3-1 的记忆 × 3-8 的取证**——记忆库换成对话历史，检索换成多轮
2. **分块是检索的前置**——怎么切决定什么能被召回，会话是天然边界
3. **follow-up 选择也是决策**——看缺口选查询，比固定顺序少一轮
4. **过期不删除**——保留历史、作答取新；删除是另一课
5. **工具由粗到细**：search 找线索，context 看邻居，full 读原文

## 注意事项

- `demo`/`eval` 完全离线；只有 `answer` 模式需要 Ollama 运行 + `gemma4:latest` 已下载
- 生成的引用编号要人工核对；过期裁决（取新）是否正确也要看原文
- 自定义查询无 facets 标注时只展示单次检索；玩多轮需先标 facets 和 subqueries
- 中文字 unigram 是教学简化；生产用分词器或向量
- 记忆写入正确性是另一环节（见 3-1）；本实验假设写入已正确，只练召回

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[agentic-rag-for-user-memory](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/agentic-rag-for-user-memory)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- 上游：实验 3-1 用户记忆、实验 3-8 Agentic RAG
