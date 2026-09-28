# contextual-user-memory / 双层用户记忆

> Chapter 3-11: Advanced JSON Cards 常驻 + 上下文 RAG 按需，两层互补的主动服务
> 对应《AI Agent 开发实战》第 3 章实验 3-11

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-11：**面向用户记忆的上下文感知检索**。本仓库为 **TypeScript 实现**，纯标准库、完全离线，是 3-1 的卡片与 3-10 的前缀在这里汇合：4 张手写 Advanced JSON Cards（带 backstory/person/relationship）常驻上下文，12 个对话记忆块经前缀增强后索引。工作流：事实回顾（卡片）→ 关联推理（日期对比）→ 细节验证（RAG）→ 主动服务（风险建议）。作答层可选 Ollama gemma4。

## 快速开始

```bash
# demo/compare 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # 东京工作流追踪 + 酒店前缀追踪
npm run compare   # plain/ctx 召回对比表

# 生成层（可选，需 Ollama + gemma4）
npm run answer    # 双层合成作答
```

换查询：

```bash
npx tsx src/main.ts --mode demo --query "工资卡尾号是多少"
npx tsx src/main.ts --mode answer --query "一月东京之行还要准备什么"
```

## 教学笔记

更详细的讲解（为什么分两层、前缀写长了为什么反噬、卡片与片段冲突听谁的、三环节排错法）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
11.contextual-user-memory/
├── src/
│   ├── tokenizer.ts   # 中文按字 + ASCII 按词（与 3-8/3-9/3-10 同规则）
│   ├── index.ts       # BM25（与 3-5~3-10 同规则）
│   ├── corpus.ts      # 12 记忆块 + 5 前缀 + 4 卡片 + 8 标注查询
│   ├── dual.ts        # 卡片查找 + 双索引 + 出行风险检查
│   ├── compare.ts     # plain/ctx 对比（recall@1/3 + MRR）
│   ├── answer.ts      # 生成层：卡片+片段双输入（可选）
│   ├── config.ts      # OLLAMA_BASE_URL / OLLAMA_MODEL
│   └── main.ts        # CLI（demo / compare / answer）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 双层结构（corpus.ts + dual.ts）

卡片是结论（`backstory` 记录来源才算记忆），检索是证据。`lookupCards` 按查询词与卡片字段的重叠排序；`dualSearch` 同时返回卡片和片段，冲突时 prompt 规定以卡片为准并说明。

### 2. 前缀规范（corpus.ts）

只写定位，不写废话。本实验实测：第一版前缀啰嗦导致 t1 从第 1 掉到第 3（共享词稀释判别度）；改短后恢复。教训已写入教学笔记。

### 3. 主动服务（dual.ts）

`checkTravelRisk` 对比卡片里的出发日期与护照过期日（1月25日 vs 2月18日，仅约 23 天）→ 风险成立 → RAG 拉原文验证 → 给出加急续签建议。风险是算出来的，不是搜出来的。

## 实测结果

`npm run compare`（12 记忆块，8 查询，BM25）：

```
Method                    Recall@1  Recall@3    MRR
Plain                     87.5%      87.5%  87.5%
Contextual                100.0%      100.0%  100.0%
Gain (Δpp)                +12.5pp     +12.5pp  +12.5pp
fixed by prefix: '西雅图酒店确认了吗…' plain=-1 → ctx=1
```

`npm run demo`（查询 "一月东京之行还要准备什么"）：卡片审出 `tokyo_trip` + `passport` → 日期对比成立风险 → RAG 取回护照/行程原文 → 建议加急续签。

**解读**："可以，帮我订下来"无前缀时根本搜不到（-1），前缀把它重新锚定回西雅图凯悦酒店第 1。官方同款形状（0.625→0.750，'帮我订下来'从第 3 升第 1）。

## 关键洞察

1. **卡片是结论，检索是证据**——冲突时以卡片为准并说明
2. **前缀越短越准**——共享词稀释判别度，本实验实测一轮
3. **主动服务 = 卡片对比 + 检索验证**——风险算出来，再拿原文验证
4. **三环节排错**——写入、召回、理解，逐个查
5. **3-11 = 3-1 × 3-10**——全章知识在这里汇合

## 注意事项

- `demo`/`compare` 完全离线；只有 `answer` 模式需要 Ollama 运行 + `gemma4:latest` 已下载
- 生成的引用要人工核对；卡片与片段冲突时先怀疑卡片（写入环节）
- 生产卡片由 LLM 自动抽取，`backstory` 必填，没来源不入库
- 当前分词面向中文单字 + ASCII；前缀只写定位，不写答案

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[contextual-retrieval-for-user-memory](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/contextual-retrieval-for-user-memory)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- [Anthropic 上下文检索博客](https://www.anthropic.com/engineering/contextual-retrieval)
- 上游：实验 3-1 用户记忆、实验 3-10 上下文感知检索
