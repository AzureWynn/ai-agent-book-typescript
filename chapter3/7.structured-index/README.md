# structured-index / 结构化索引

> Chapter 3-7: RAPTOR 递归摘要树 vs GraphRAG 知识图谱，学为不同问题组织检索路径
> 对应《AI Agent 开发实战》第 3 章实验 3-7

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-7：**结构化索引**。本仓库为 **TypeScript 实现**，纯标准库、完全离线，用手写 x86 SIMD 小知识库对比三种组织方式：扁平片段（BM25 基线）、**RAPTOR**（叶子→中层摘要→树根的三层树）、**GraphRAG**（10 实体、10 关系、2 跳 BFS 遍历）。三种查询类型：多跳关系、跨节点综合、多层总览。

## 快速开始

```bash
# 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # 三种查询类型，逐路追踪（flat / raptor / graph）
npm run eval      # 5 查询 × 3 方法的 recall/MRR 表
```

换查询：

```bash
npx tsx src/main.ts --mode demo --query "VADDPS YMM registers VEX"
npx tsx src/main.ts --mode demo --query "MOVAPS MOVUPS difference" --top-k 5
```

## 教学笔记

更详细的讲解（RAPTOR 建树流程、GraphRAG 抽实体连关系、为什么图召回反而更低、选型看问题类型）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
7.structured-index/
├── src/
│   ├── tokenizer.ts   # 分词（与 3-5/3-6 同规则）
│   ├── index.ts       # 通用 BM25 文本索引（扁平与树节点共用）
│   ├── kb.ts          # 手写知识库：10 片段 + 树 + 实体关系 + 标注
│   ├── raptor.ts      # 树检索：全节点打分 + 路径 + 覆盖映射
│   ├── graph.ts       # 图检索：实体命中 + 2 跳 BFS + 距离加权
│   ├── metrics.ts     # recall@k / MRR
│   └── main.ts        # CLI（demo / eval）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. RAPTOR 树（kb.ts + raptor.ts）

手写三层树：10 叶子（原文）→ 3 中层摘要（SSE 家族 / 系统使能 / AVX 演进）→ 1 树根（全文总览）。检索对**所有节点**打分，返回最佳节点及 `root → mid → leaf` 路径；评测时通过 `coveredChunks` 把节点映射回覆盖的原文片段，与扁平/图同标尺对比。

### 2. Graph 图（kb.ts + graph.ts）

10 实体、10 关系（如 `ADDPS --belongs-to--> SSE`、`SSE --requires--> CR4.OSFXSR`），查询词命中实体后 BFS 走 2 跳，片段得分按 `Σ 1/(dist+1)` 累加。招牌路径 `ADDPS → SSE → CR4.OSFXSR` 在追踪输出里完整可见。

### 3. 扁平基线（index.ts）

与 3-5/3-6 同规则的 BM25，RAPTOR 节点打分复用同一个 `TextIndex` 类。

## 实测结果

`npm run eval`（10 篇语料，5 查询，top-3）：

```
Method      Recall@3    MRR
Flat        0.8000  0.8000
RAPTOR      1.0000  0.9000
Graph       0.6000  0.6000
```

`npm run demo`（查询 "Which control register bit must the OS set before running ADDPS?"）：

```
[Flat]   1. c_osfxsr  score=4.9951   # 查询词恰好重叠，直接命中
[RAPTOR] c_osfxsr (level 0)  path: root → mid_sys → c_osfxsr
[Graph]  ADDPS --belongs-to--> SSE --requires--> CR4_OSFXSR  # 连接正确发现
         但答案排在兄弟节点之后（距离加权被高扇出稀释）
```

**解读**：查询词和答案重叠时扁平又快又准；RAPTOR 赢在综合与总览（一次命中一片）；图**发现**了两跳连接但朴素排序把它排后了——结构不能保证正确，构建质量和排序同样重要。这正是官方强调的结论。

## 关键洞察

1. **结构是手段，不是正确性本身**——图召回 0.6 就是证明
2. **RAPTOR 的本质是一次召回一片**——中层摘要命中等于批量召回
3. **图的本质是连接即答案**——路径本身就是解释
4. **构建质量决定上限**——摘要失真、关系抽错，后面全错；答案必须能回到原文
5. **选型看问题类型**——"哪里定义"走扁平/叶子，"有何共性"走树，"A 与 B 如何相连"走图

## 注意事项

- 完全离线，不需要 Ollama 或任何 API Key
- 生产 RAPTOR 需嵌入 + 聚类 + 摘要 LLM，生产 GraphRAG 需实体关系抽取 LLM；本实验手写结构只为教学
- 图的朴素距离排序会被高扇出稀释；生产用边加权、PPR 或 LLM 对子图推理
- 当前分词面向英文/代码场景，不含中文分词
- RAPTOR 全对部分得益于手写摘要保真；换自动摘要要抽查失真

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[structured-index](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/structured-index)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- [RAPTOR 论文](https://arxiv.org/abs/2401.18059) · [GraphRAG](https://github.com/microsoft/graphrag)
- 上游：实验 3-5 稀疏 BM25、实验 3-6 混合检索
