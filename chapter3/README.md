# Chapter 3 —— 用户记忆和知识库

本目录对应《AI Agent 开发实战》第 3 章，包含多个独立实验。每个实验是一个独立子目录，自带 `package.json` 与依赖。

对应章节正文：[第 3 章 · 用户记忆和知识库](https://bojieli.github.io/ai-agent-book/book/chapter3/)

## 实验列表

| 实验 | 主题 | 状态 | 技术栈 |
| --- | --- | --- | --- |
| [1.user-memory](1.user-memory/README.md) | 实验 3-1：长期用户记忆系统 | ✅ 完成 | TypeScript + Ollama + 分离架构 + 4 种记忆模式 |
| [2.mem0](2.mem0/README.md) | 实验 3-2：Mem0 + Memobase 对比 | ✅ 完成 | TypeScript 对比 + 4 类记忆概念 |
| [3.log-sanitization](3.log-sanitization/README.md) | 实验 3-3：日志脱敏（正则+LLM） | ✅ 完成 | TypeScript + 18 类 PII 规则 |
| [4.dense-embedding](4.dense-embedding/README.md) | 实验 3-4：稠密嵌入向量检索 | ✅ 完成 | TypeScript + Ollama 嵌入 + ANNOY/HNSW |
| [5.sparse-embedding](5.sparse-embedding/README.md) | 实验 3-5：稀疏向量检索 BM25 | ✅ 完成 | TypeScript 纯离线 + 倒排索引 + explain |
| [6.retrieval-pipeline](6.retrieval-pipeline/README.md) | 实验 3-6：混合检索流水线 | ✅ 完成 | TypeScript + RRF/加权融合 + 重排 |
| [7.structured-index](7.structured-index/README.md) | 实验 3-7：结构化索引 | ✅ 完成 | TypeScript 纯离线 + RAPTOR/GraphRAG |
| [8.agentic-rag](8.agentic-rag/README.md) | 实验 3-8：Agentic RAG 对比 | ✅ 完成 | TypeScript 纯离线 + 缺口驱动多轮检索 |
| [9.agentic-rag-memory](9.agentic-rag-memory/README.md) | 实验 3-9：记忆 Agentic RAG | ✅ 完成 | TypeScript + 会话分块 + 三记忆工具 |
| [10.contextual-retrieval](10.contextual-retrieval/README.md) | 实验 3-10：上下文感知检索 | ✅ 完成 | TypeScript 纯离线 + 前缀双索引对比 |
| [11.contextual-user-memory](11.contextual-user-memory/README.md) | 实验 3-11：双层用户记忆 | ✅ 完成 | TypeScript + JSON Cards + 上下文 RAG |
| [12.knowledge-extraction](12.knowledge-extraction/README.md) | 实验 3-12：隐性知识提取 | ✅ 完成 | TypeScript + 因子发现 + 原型聚类 |

## 快速开始

```bash
# 用户记忆系统（3-1）
cd 1.user-memory
npm install
npm run quickstart                  # 验证 Ollama 连接 + 记忆读写
npm run demo                        # 演示模式（自动跑 3 轮对话）

# Mem0 vs Memobase 对比（3-2）
cd 2.mem0
npm install
npm run compare                     # 对比两种框架的核心概念

# 日志脱敏（3-3）
cd 3.log-sanitization
npm install
npm run demo                        # 演示模式（离线，无需 API Key）
npm run interactive                 # 手动输入测试
npm run llm                       # LLM 引擎模式（需 Ollama 运行）

# 稠密嵌入向量检索（3-4）
cd 4.dense-embedding
npm install
npm run demo                        # 单条查询，对比精确 / ANNOY / HNSW
npm run compare                     # 多查询统计召回率与延迟
npm run sweep                       # 参数扫描 n_trees / ef_search

# 稀疏向量检索 BM25（3-5，纯离线）
cd 5.sparse-embedding
npm install
npm run demo                        # 默认查询 + 同义词漏召回演示
npm run explain                     # 逐词 TF/IDF/贡献
npm run eval                        # recall/precision/MRR

# 混合检索流水线（3-6）
cd 6.retrieval-pipeline
npm install
npm run demo                        # XR-7003 + kitty behavior 双追踪
npm run eval                        # 7 查询 × 5 阶段评测表

# 结构化索引（3-7，纯离线）
cd 7.structured-index
npm install
npm run demo                        # 多跳 / 综合 / 总览三类追踪
npm run eval                        # flat/raptor/graph 对比表

# Agentic RAG 对比（3-8，纯离线）
cd 8.agentic-rag
npm install
npm run demo                        # 难题 + 简单题逐轮追踪
npm run eval                        # 单次/分解证据召回表

# 记忆 Agentic RAG（3-9，纯离线）
cd 9.agentic-rag-memory
npm install
npm run demo                        # L2 车辆 + L2 海边追踪
npm run eval                        # 单次/多轮记忆召回表

# 上下文感知检索（3-10，纯离线）
cd 10.contextual-retrieval
npm install
npm run demo                        # plain/ctx 逐路对比
npm run compare                     # recall@k 对比表

# 双层用户记忆（3-11，纯离线）
cd 11.contextual-user-memory
npm install
npm run demo                        # 东京工作流 + 酒店前缀追踪
npm run compare                     # plain/ctx 记忆召回对比

# 隐性知识提取（3-12，纯离线）
cd 12.knowledge-extraction
npm install
npm run demo                        # 发现→抽取→聚类→对话全流程
npm run eval                        # 抽取准确率 + 原型表
```

## 架构概览

```
3-1 自实现（TypeScript + Ollama）：
┌─────────────────────────────────────────┐
│  对话 Agent（只读）                       │
│  └── 读取记忆 → 拼入提示词 → 回复        │
│                                         │
│  后台处理器（只写）                       │
│  └── 分析对话 → 工具调用 → 写记忆        │
└─────────────────────────────────────────┘

3-2 开源框架对比：
┌─────────────────────────────────────────┐
│  mem0：ADD-only + 混合检索               │
│  └── 只加不减 + 语义 + 关键词            │
│                                         │
│  memobase：四类记忆 + 衰减/聚类           │
│  └── episodic/semantic/procedural/working │
│  └── Profile + Event                    │
└─────────────────────────────────────────┘

**核心思想：对话和记忆更新分离。**
- 对话 Agent 像"前台"：只读记忆，快速响应
- 后台处理器像"档案室"：专门分析并写入记忆
- 这避免了每次对话都修改记忆导致的 KV Cache 失效

> 各实验使用不同的 LLM 后端，`.env` 各自独立，互不影响。
