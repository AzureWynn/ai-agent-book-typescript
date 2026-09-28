# sparse-embedding / 稀疏向量检索 BM25

> Chapter 3-5: 从零实现基于 BM25 的稀疏向量搜索引擎，可视化倒排索引与打分内部机制
> 对应《AI Agent 开发实战》第 3 章实验 3-5

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-5：**稀疏向量检索（BM25）**。本仓库为 **TypeScript 实现**，纯标准库、完全离线，从分词、倒排索引到 BM25 打分全部从零实现。重点观察三件事：词频饱和（k1）、文档长度归一化（b）、稀有词的 IDF 权重，以及 BM25 在同义词查询上的固有边界（引出 3-6 混合检索）。

## 快速开始

```bash
# 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # 默认查询 + 同义词漏召回演示 + 索引结构
npm run explain   # 逐词 TF/IDF/贡献（可用 --query 换词）
npm run eval      # 5 个标注查询的 recall/precision/MRR
```

调参与换查询：

```bash
npx tsx src/main.ts --mode explain --query "HTTP 404 error"
npx tsx src/main.ts --mode eval --k1 2.0 --b 0.5 --top-k 5
npx tsx src/main.ts --mode demo --query "XK9-2B4-7Q1"
```

## 教学笔记

更详细的讲解（倒排索引是什么、TF/IDF/长度归一化各自解决什么问题、k1 与 b 怎么调、同义词短板为什么是固有边界）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
5.sparse-embedding/
├── src/
│   ├── tokenizer.ts   # 分词：邮箱/编码/版本号/技术术语/停用词
│   ├── bm25.ts        # 倒排索引 + BM25 打分 + explain
│   ├── corpus.ts      # 内置 10 篇语料 + 5 组标注
│   ├── metrics.ts     # recall@k / precision@k / MRR
│   └── main.ts        # CLI（demo / eval / explain）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 分词（tokenizer.ts）

先归一化技术术语，再用单条正则提取 token，最后去停用词：

```ts
C++ → cpp，.NET → dotnet，Node.js → nodejs
email / 0x1234 / #FF5733 / XK9-2B4-7Q1 / 2.0.1 / Python3 → 整体保留
the/is/of → 丢弃
```

全部转小写后匹配，保证查询大小写不敏感。

### 2. 倒排索引（bm25.ts）

建索引时为每个词记录 `Map<docIdx, tf>`，同时统计文档频率 `df`：

```ts
postings: Map<term, Map<docIdx, tf>>
docFreq:  Map<term, df>
```

查询时只查查询词的倒排表，不扫描全库。`postingList(term)` 可直接查看内部结构。

### 3. BM25 打分（bm25.ts）

单个词对单篇文档的贡献：

```ts
idf = ln(1 + (N - df + 0.5) / (df + 0.5))
contribution = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / avgdl))
```

文档得分是各查询词贡献之和（查询词去重后累加）。

## 实测结果

`npm run eval`（10 篇语料，top-5）：

```
query 'model distillation'   recall@5=1.00  precision@5=0.20  RR=1.00
query 'HTTP 404 error'       recall@5=1.00  precision@5=0.20  RR=1.00
query 'XK9-2B4-7Q1'          recall@5=1.00  precision@5=0.20  RR=1.00
query 'BM25 ranking function' recall@5=1.00  precision@5=0.20  RR=1.00
query 'cat'                  recall@5=0.00  precision@5=0.00  RR=0.00  <- miss
macro avg  recall@5=0.800  precision@5=0.160  MRR=0.800  miss-rate=0.200
```

`npm run explain`（查询 "model distillation"，k1=1.5, b=0.75）：

```
term "model":         df=1, idf=1.9924, tf=2 → 贡献 2.6898
term "distillation":  df=1, idf=1.9924, tf=1 → 贡献 1.8423
doc_0 total=4.5320
```

**解读**：精确关键词、错误码、专有编码全部稳命中（recall=1.00，RR=1.00）；查询 `cat` 零命中——语料里只有 `kitten`/`feline`，词面无交集。precision@5 只有 0.20 是因为每查询仅 1 篇相关（1/5），属正常现象，看 recall 与 MRR 更有意义。

## 关键洞察

1. **稀有词决定排序**——IDF 让专有编码一出现就锁定文档
2. **TF 必须饱和**——k1 防止刷词，出现 10 次不会得 10 倍分
3. **长文档要打折**——b 参数保证短文档不吃亏
4. **分词是隐形上限**——编码、版本号、技术术语切错，后面全错
5. **BM25 与稠密检索互补**——精确词用 BM25，同义表达用稠密（3-4），3-6 拼成混合检索

## 注意事项

- 完全离线，不需要 Ollama 或任何 API Key
- `precision@5=0.20` 是标注设计所致（每查询 1 篇相关），不是 bug
- 语料只有 10 篇时调 k1/b 效果不明显，重点看 `--explain` 分项贡献
- 当前分词面向英文/代码场景，不含中文分词与词形还原
- 不支持短语查询与同义词扩展（正是 3-6 要解决的问题）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[sparse-embedding](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/sparse-embedding)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- 相关后续：实验 3-6 混合检索（retrieval-pipeline）
