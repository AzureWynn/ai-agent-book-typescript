# dense-embedding / 稠密嵌入向量检索

> Chapter 3-4: 向量相似性搜索服务，对比 ANNOY（树）与 HNSW（图）两种 ANN 算法的权衡
> 对应《AI Agent 开发实战》第 3 章实验 3-4

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-4：**稠密嵌入向量检索**。本仓库为 **TypeScript 实现**，用 Ollama `nomic-embed-text` 生成稠密嵌入，对比 **ANNOY（树结构）** 与 **HNSW（图结构）** 两种近似最近邻算法在召回率、建索引耗时、查询延迟上的权衡。同时区分**表示误差**（嵌入模型）与**近似搜索误差**（索引）。

## 快速开始

```bash
# 前提：Ollama 运行 + 嵌入模型
ollama serve
ollama pull nomic-embed-text

npm install
npm run demo      # 单条查询，对比精确 / ANNOY / HNSW
npm run compare   # 多查询统计：建索引、查询延迟、召回率
npm run sweep     # 参数扫描：n_trees / ef_search 对召回的影响
```

## 教学笔记

更详细的讲解（稠密检索为什么能解决"词不同、意思同"、ANNOY 的随机投影树与 HNSW 的分层图原理、召回率与答案质量的区别）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
4.dense-embedding/
├── src/
│   ├── embedding-service.ts   # Ollama 嵌入 + 余弦距离 + 暴力搜索
│   ├── annoy-index.ts         # ANNOY 索引封装
│   ├── hnsw-index.ts          # HNSW 索引封装
│   ├── config.ts              # 环境变量配置
│   └── main.ts                # CLI（demo / compare / sweep）
├── .env.example               # OLLAMA_* / VEC_* 配置
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 稠密嵌入与语义检索（embedding-service.ts）

用 Ollama 的 `/api/embed` 把文本编码成向量。两段文字语义越接近，向量余弦距离越小。

```ts
const response = await ollama.embed({ model: config.model, input: text });
const embedding = response.embeddings[0];  // 注意是复数 embeddings
```

`exactSearch` 是暴力搜索（brute force），遍历全部向量算余弦距离后排序，作为召回率的 baseline。

### 2. ANNOY 索引（annoy-index.ts）

ANNOY 是 CJS 原生模块，在 ESM 里要用 `createRequire` 引入：

```ts
const require = createRequire(import.meta.url);
const Annoy = require('annoy') as any;   // 直接是构造函数，不要解构

const t = new Annoy(dimension, 'angular');
for (let i = 0; i < docs.length; i++) t.addItem(i, docs[i].embedding);
t.build(nTrees);                          // n_trees 控制精度
const ids = t.getNNsByVector(query, k);   // 返回向量 id
```

### 3. HNSW 索引（hnsw-index.ts）

`hnsw` 是纯 TypeScript 实现，构造参数顺序为 `(M, efConstruction, dimension, metric, efSearch)`：

```ts
const idx = new HNSW(M, efConstruction, dimension, 'cosine', efSearch);
await idx.addPoint(i, embedding);         // 注意是 async
const results = idx.searchKNN(query, k);  // 返回 { id, score }
```

### 4. 召回率计算（main.ts）

以暴力搜索的 top-k 为基准，统计 ANN 结果命中比例：

```ts
const exactIds = new Set(exactSearch(q, docs, k).map((r) => r.id));
const hits = searchAnnoy(q, k).filter((r) => exactIds.has(r.id)).length;
const recall = hits / k;
```

## 实测结果

`npm run compare`（200 文档，5 查询，top-10）：

```
--- Build Time ---
ANNOY: 5ms
HNSW:  196ms

--- Avg Query Latency (top-10) ---
ANNOY: 0.20ms
HNSW:  0.40ms

--- Recall@10 vs Exact ---
ANNOY: 100.0%
HNSW:  100.0%
Exact: 100% (baseline)
```

`npm run sweep`（500 文档，top-10）：

```
--- HNSW: recall vs ef_search ---
ef_search | recall@10
        1 | 80.0%
        2 | 98.0%
        5 | 98.0%
       10 | 98.0%
       50 | 100.0%
```

**解读**：HNSW 建索引明显更慢（图结构要维护连接），但查询快、召回高。`ef_search` 增大时召回总体上升——这是速度换精度的典型权衡。ANNOY 在本语料上召回已饱和（语料较同质），增大语料或降低 `n_trees` 才能观察到差异。HNSW 是随机算法，每次运行数字会有小幅波动。

## 关键洞察

1. **稠密检索解决"词不同、意思同"**——嵌入模型把语义映射到向量空间，这是相对 BM25 稀疏检索的核心优势
2. **ANN 是速度与召回的权衡**——没有免费午餐，参数决定落点
3. **ANNOY 与 HNSW 各有场景**——ANNOY 建索引快、内存低、适合静态数据；HNSW 召回高、支持增量更新、适合动态数据
4. **召回率 ≠ 答案质量**——召回 100% 也可能答案不相关，那是表示（嵌入模型）的问题，不是索引的问题
5. **区分两类误差**——表示误差（模型）和近似搜索误差（索引）要分开评估

## 注意事项

- `npm run demo/compare/sweep` 都需要 Ollama 运行 + `nomic-embed-text` 已下载
- `annoy` 是 CJS 原生模块，ESM 下必须用 `createRequire`，且模块**直接导出构造函数**（不要 `{ Annoy }` 解构）
- `hnsw` 的 `addPoint` 是 **async**，必须 `await`
- 向量维度必须一致（nomic-embed-text 为 768 维），换模型后要同步更新 `VEC_DIMENSION`
- 部分 macOS/arm64 上 `annoy` 预编译轮子有缺陷；HNSW 不受影响
- 本实验是教学实现，生产环境建议用成熟向量库（Milvus / Qdrant / Weaviate 等）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[dense-embedding](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/dense-embedding)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- [BGE-M3 论文](https://arxiv.org/abs/2402.03216) · [ANNOY](https://github.com/spotify/annoy) · [HNSW](https://arxiv.org/abs/1603.09320)
