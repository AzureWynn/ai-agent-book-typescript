# agentic-rag / Agentic RAG 与非 Agentic RAG 对比

> Chapter 3-8: ReAct 式多轮取证 vs 单次检索，在司法问答上对比证据召回率
> 对应《AI Agent 开发实战》第 3 章实验 3-8

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-8：**Agentic RAG**。本仓库为 **TypeScript 实现**，纯标准库、完全离线，用手写 12 篇中文法条对比两种范式：Non-Agentic（单次检索直接答）vs Agentic（ReAct 循环：检索 → 算证据缺口 → 补查 → 缺口补完即停）。指标是**证据召回率**（该找的法条找齐了没有），它是答案质量的上界。

## 快速开始

```bash
# 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # 一道难题 + 一道简单题的逐轮追踪
npm run eval      # 8 问题 × 单次/分解的证据召回表

# 生成层（可选，需 Ollama + gemma4）
npm run answer    # Agentic 取证 → gemma4 生成带引用回答
```

换查询（无标注时只展示单次检索）：

```bash
npx tsx src/main.ts --mode demo --query "抢劫如何处罚"
npx tsx src/main.ts --mode eval --top-k 5
npx tsx src/main.ts --mode answer --query "醉酒驾车致人重伤，且有盗窃前科，怎么量刑"
```

## 教学笔记

更详细的讲解（证据召回为什么是答案质量的上界、缺口驱动循环怎么写、中文按字分词够不够用、小语料与大语料的幅度差异）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
8.agentic-rag/
├── src/
│   ├── tokenizer.ts   # 中文按字 unigram + ASCII 按词
│   ├── index.ts       # BM25（与 3-5/3-6/3-7 同规则）
│   ├── corpus.ts      # 12 篇法条（带要素标签）+ 8 个标注问题
│   ├── agent.ts       # singleSearch + runAgentic（缺口驱动循环）
│   ├── answer.ts      # 生成层：Ollama gemma4 基于证据作答（可选）
│   ├── config.ts      # OLLAMA_BASE_URL / OLLAMA_MODEL
│   ├── metrics.ts     # avg / missRate
│   └── main.ts        # CLI（demo / eval / answer）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 缺口驱动循环（agent.ts）

ReAct 的最小形态：每轮检索后算已覆盖要素，缺口为空即停。

```ts
planned = [原问题, ...标注子查询]  // 生产里子查询由模型现场生成
for (每轮) {
  hits = singleSearch(query, topK)
  covered = facetsOf(evidence)
  missing = spec.facets - covered
  if (missing.length === 0) break   // 停止条件
}
```

生产与教学的唯一区别：子查询是模型现场写的，还是预先标好的。预标注把"检索策略"本身隔离出来评测。

### 2. 中文分词（tokenizer.ts）

CJK 按单字切，ASCII 走英文规则，两套停用字：

```ts
"醉酒驾驶机动车如何处罚" → [醉, 酒, 驾, 驶, 机, 动, 车, 如, 何, 处, 罚]
```

字级别 BM25 对短法条够用；生产用分词器或向量。

### 3. 证据召回（agent.ts）

```ts
recall = 找回的相关法条 / 应该找回的法条
```

只看检索层，不看生成层——找不齐，答不对；找齐了，才可能答对。

### 4. 生成层（answer.ts，可选）

Agentic 取证完成后，把证据编号喂给 Ollama gemma4，要求只依据证据作答、结论带 `[编号]` 引用。检索与生成解耦：`demo`/`eval` 纯离线练检索，`answer` 模式才调模型看端到端效果。

## 实测结果

`npm run demo`（难题 "醉酒驾车致人重伤，且有盗窃前科，怎么量刑"）：

```
[Non-Agentic] hits=[c_drunk, c_negligent, c_hurt]  recall=0.67
[Agentic]
  round 1  missing=[累犯]
  round 2  query="醉酒驾驶处罚"  missing=[(none)] → 停止
  evidence recall: 0.67 → 1.00
```

`npm run eval`（12 篇法条，8 问题，top-3）：

```
easy ×3   single=100%  decomposed=100%  检索 1→1
hard ×5   single=87%   decomposed=100%
  两道 3 要素题：67% → 100%，检索 1→2
```

`npm run answer`（需 Ollama + gemma4，难题多轮证据 → 生成）：

```
Evidence (5): [c_drunk, c_negligent, c_hurt, c_recidivist, c_fraud]

Answer:
量刑需结合多项罪名……醉酒驾驶机动车依法处拘役并处罚金 [1]……
符合累犯规定的从重处罚 [4]。
```

**解读**：简单题打平（证据只在一处，分解纯属多余）；差距集中在要素最多的题——单次检索的固定预算不够分，分解检索把预算花在每个缺口上。官方大语料上是 8%→100%，小语料上是 87%→100%：趋势一致，幅度随规模变化。

## 关键洞察

1. **证据召回是答案质量的上界**——先找齐，再答对
2. **复杂 = 多要素**——要素越多，单次检索越不够
3. **停止条件和检索同样重要**——缺口补完就停，不多查一轮
4. **简单题不需要 Agent**——1 轮结束才是好 Agent
5. **分解的本质是预算分配**——一个缺口一次检索

## 注意事项

- `demo`/`eval` 完全离线；只有 `answer` 模式需要 Ollama 运行 + `gemma4:latest` 已下载
- 生成的引用编号要人工核对——模型可能张冠李戴，证据召回满分不等于引用全对
- 评测只看检索层（证据召回）；`answer` 模式看端到端效果，但引用正确性要人工核对（官方 evaluation/evaluate.py，需 Key）
- 自定义查询无 facets 标注时只展示单次检索；玩分解需先标 facets 和 subqueries
- 中文字 unigram 是教学简化；生产用分词器或向量
- retrievals 列（1→2）比分数量本身更值得看：它量化了 Agent 的"该查才查"

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[agentic-rag](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/agentic-rag)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- 上游：实验 3-5 稀疏 BM25（本实验的检索引擎同源）
