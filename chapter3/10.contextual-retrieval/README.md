# contextual-retrieval / 上下文感知检索

> Chapter 3-10: 索引前给分块补背景前缀，对比无前缀/有前缀的 BM25 召回率
> 对应《AI Agent 开发实战》第 3 章实验 3-10

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-10：**上下文感知检索**（Anthropic 方法）。本仓库为 **TypeScript 实现**，纯标准库、完全离线：同一批 12 个分块建两个 BM25 索引（plain 只用原文，ctx 用前缀+原文），在 8 个标注查询上对比 recall@k。前缀默认手写（确定、可审查），`--llm-prefix` 开关调 Ollama gemma4 现场生成。

## 快速开始

```bash
# demo/compare 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # 前 3 个查询的 plain/ctx 逐路对比
npm run compare   # recall@1/3/5 对比表 + 失败率下降
```

逐查询与换查询：

```bash
npx tsx src/main.ts --per-query     # 逐查询排名，标出被前缀修复的
npx tsx src/main.ts --mode demo --query "国家主席有哪些职权"
npx tsx src/main.ts --mode demo --llm-prefix --query "天翼科技云业务增长多少"  # 需 Ollama
```

## 教学笔记

更详细的讲解（孤儿分块是什么、前缀写什么不写什么、增益为什么集中在 top-1、手写前缀与模型前缀的对比练法）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
10.contextual-retrieval/
├── src/
│   ├── tokenizer.ts   # 中文按字 + ASCII 按词（与 3-8/3-9 同规则）
│   ├── index.ts       # BM25（与 3-5~3-9 同规则）
│   ├── corpus.ts      # 12 块（4 孤儿标出）+ 手写前缀 + 8 标注查询
│   ├── prefix.ts      # handPrefix + contextualText + gemma4 生成
│   ├── compare.ts     # 双索引构建 + recall@k + 失败率下降
│   └── main.ts        # CLI（demo / compare / per-query / llm-prefix）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 对照设计（compare.ts）

同一批块、同一批查询、两个索引——唯一变量是前缀：

```ts
plain = new TextIndex(chunks.map(raw text))
ctx   = new TextIndex(chunks.map(prefix + text))
```

增益归因干净：数字差异只能来自前缀。

### 2. 前缀规范（corpus.ts + prefix.ts）

只写定位信息（文档名 + 主题），不写答案。`contextualText` 无前缀的块原样返回，保证非孤儿块双索引一致。

### 3. 失败率下降（compare.ts）

除 Δpp 外，报告 `1-recall@1` 的相对下降——top-1 失败才是前缀要解决的问题。

## 实测结果

`npm run compare`（12 块语料，8 查询，BM25）：

```
Method              recall@1    recall@3    recall@5
Plain (no prefix)   75.0%      100.0%      100.0%
Contextual (prefix) 100.0%      100.0%      100.0%
Gain (Δpp)          +25.0pp     +0.0pp      +0.0pp
Failure-rate drop (@1): 100%
```

`--per-query`：8 查询中 6 个本来就 top-1 命中；2 个孤儿块（a2 政策生效时间、d2 云业务增长）被前缀从第 2 推到第 1。

**解读**：增益全部集中在 top-1——前缀解决的是"排第一还是排第二"，recall@3/5 打平说明它不扩大召回集合。官方大语料上是 60%→86.7%（+26.7pp，失败率降 67%）：形状一致，幅度随规模变化。

## 关键洞察

1. **前缀解决的是排序，不是召回**——看 top-1 和失败率，别只看平均召回
2. **只写定位，不写答案**——混入答案的召回是虚的，要回原文核对
3. **对照要干净**——同语料同查询双索引，唯一变量是前缀
4. **孤儿块是分块的原罪**——指代和省略专切长文档
5. **手写前缀是上限参考**——模型生成的前缀接近手写质量才算合格

## 注意事项

- `demo`/`compare` 完全离线；只有 `--llm-prefix` 需要 Ollama 运行 + `gemma4:latest` 已下载
- 模型生成的前缀要审查：定位信息留下，推断和答案删掉
- 评估完整流程还要算生成成本、索引膨胀和失真风险，本实验只量化召回增益
- 当前分词面向中文单字 + ASCII；和 3-9 的 enrichment 头区别：一个管"讲什么"，一个管"哪来的"

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[contextual-retrieval](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/contextual-retrieval)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- [Anthropic 上下文检索博客](https://www.anthropic.com/engineering/contextual-retrieval)
- 上游：实验 3-5 稀疏 BM25（本实验的检索引擎同源）
