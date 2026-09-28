# retrieval-pipeline / 混合检索流水线

> Chapter 3-6: 稠密 + 稀疏 + 融合 + 重排的完整流水线，用测试用例展示混合检索的互补效果
> 对应《AI Agent 开发实战》第 3 章实验 3-6

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-6：**混合检索流水线**。本仓库为 **TypeScript 实现**，单进程跑通 `召回 → 融合 → 重排` 全链路：稀疏路复用 3-5 的 BM25，稠密路用 Ollama `nomic-embed-text`，融合支持 **RRF（k=60）** 与 **min-max 加权重排**两种方法，重排用可解释的特征重排（教学替代 cross-encoder）。用 7 组教学查询展示两路检索的互补。

## 快速开始

```bash
# 稠密路需要 Ollama；只跑 BM25 基线可用 --no-dense（纯离线）
ollama serve
ollama pull nomic-embed-text

npm install
npm run demo      # XR-7003 + kitty behavior 双追踪（可用 --query 换词）
npm run eval      # 7 查询 × 5 阶段的 recall/MRR/nDCG 表
```

常用开关（与官方 evaluate.py 对齐）：

```bash
npx tsx src/main.ts --mode eval --no-dense      # 纯 BM25 基线
npx tsx src/main.ts --mode eval --no-rerank     # 关重排，看融合本身
npx tsx src/main.ts --mode demo --fusion weighted --query "HTTP-403"
```

## 教学笔记

更详细的讲解（为什么分召回/融合/重排三段、RRF 为什么只用排名、重排为什么救不回漏检、`cat` 误中 `replicate` 的词边界坑）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
6.retrieval-pipeline/
├── src/
│   ├── tokenizer.ts   # 分词（与 3-5 同规则）
│   ├── bm25.ts        # 稀疏路：倒排索引 + BM25
│   ├── dense.ts       # 稠密路：Ollama 嵌入 + 余弦精确检索
│   ├── fusion.ts      # RRF（k=60）+ min-max 加权融合
│   ├── rerank.ts      # 特征重排：融合排名 + 整句命中 + 词覆盖率
│   ├── pipeline.ts    # RetrievalPipeline.search 编排四阶段
│   ├── corpus.ts      # 14 篇语料 + 7 组标注
│   ├── metrics.ts     # recall@k / MRR / nDCG@k
│   └── main.ts        # CLI（demo / eval）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 流水线编排（pipeline.ts）

`RetrievalPipeline.search` 按固定顺序组织四阶段，候选池默认每路取 20：

```ts
sparse = bm25.search(query, candidatePool)
dense  = await denseSearch(query, docs, candidatePool)  // --no-dense 可跳过
fused  = fusion === 'weighted' ? weightedFuse(...) : rrfFuse(lists, 60)
reranked = rerank(query, fused.slice(0, 10), fusedRank) // --no-rerank 可跳过
```

### 2. RRF 只用排名（fusion.ts）

```ts
score(d) = Σ 1 / (k + rank)   // k=60，rank 从 1 开始
```

BM25 分数（几分到几十分）与余弦相似度（0~1）量纲不同，直接相加会被一路主导；排名无量纲，两路天然可比。加权融合则先各自 min-max 归一到 `[0,1]` 再按权重求和，缺席某路按 0 算。

### 3. 特征重排（rerank.ts）

生产用 cross-encoder，这里用可解释的三个分量代替：

```ts
score = 1/(融合排名+1) + 0.5×整句命中 + 0.5×查询词覆盖率
```

整句匹配必须用**词边界正则**而不是子串包含，否则查询 `cat` 会误中 `replicate`/`across` 里的 `cat`（本实验真实踩坑，已修复）。

## 实测结果

`npm run demo`（查询 "XR-7003"）：

```
[BM25 (sparse)]
  1. xr_7003  score=2.2454
[Dense]
  1. xr_7003  score=0.7477
  2. xr_7001  score=0.6734   # 兄弟编码向量很近
  3. xr_7002  score=0.6374
[Hybrid-RRF]
  1. xr_7003  score=0.0328   # 两路一致，位置更稳
```

`npm run demo --query cat`：BM25 无候选（词面零交集），稠密 `kitten #1 / feline #2`，融合保持该顺序——稠密补上了稀疏的漏检。

`npm run eval`（14 篇语料，7 查询，top-3）：

```
Stage / Method          Recall@3      MRR      nDCG@3
BM25 (sparse)            0.7857    0.8571    0.8019
Dense                    1.0000    1.0000    1.0000
Hybrid-RRF               1.0000    1.0000    1.0000
Hybrid-Weighted          1.0000    1.0000    1.0000
Hybrid-RRF+Rerank        1.0000    1.0000    1.0000
```

**解读**：BM25 的 0.7857 全部来自同义词查询（`cat` 0/2、`kitty behavior` 1/2）；稠密在这组小语料上全对，不代表稠密永远赢。混合的价值是鲁棒性：两路同时认可的结果下限更高。重排在这里没改变召回——候选已满分时正常，重排价值在更大候选池上体现。

## 关键洞察

1. **先召回、后排序**——候选集漏了，重排救不回来
2. **RRF 用排名而不用原始分**——解决两路量纲不同的问题
3. **混合的价值是下限更高**——小语料上可能看不出差距，但两路互补后更稳
4. **重排只重排候选**——上限是候选集质量，不是模型大小
5. **词边界是正确性问题**——子串匹配的坑在教学代码里真实出现过一次

## 注意事项

- 稠密路需要 Ollama 运行 + `nomic-embed-text`；纯离线看 BM25 基线用 `--no-dense`
- 评测语料只有 14 篇，平均数不如逐查询追踪有信息
- `annoy`/`hnsw` 在这里没用——3-4 已讲 ANN，本实验聚焦融合与重排，稠密用精确检索当 baseline
- 生产重排建议 cross-encoder（如 bge-reranker）；本实验的特征重排是教学替代品
- 融合方法用 `--fusion weighted` 切换，注意加权对分数尺度敏感

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[retrieval-pipeline](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/retrieval-pipeline)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- 上游：实验 3-4 稠密检索、实验 3-5 稀疏 BM25
