# erp-agent / 自然语言转 SQL（artifact 模式）

> Chapter 5-13: 中文 NL→SQL 由数据库执行，LLM 只产 SQL 制品不搬数据
> 对应《AI Agent 开发实战》第 5 章实验 5-13（官方 README 标题作 5-10，章节索引表作 5-13，此处跟索引表）

← [返回第 5 章目录](../README.md)

## 这个实验在学什么

对应官方实验 5-13：**自然语言交互的 ERP Agent**。本仓库为 **TypeScript 实现**：Node 22 内置 SQLite（零依赖内存库），40 员工 × 5 部门种子库（截止 2026-06-15，确定性生成），10 个中文业务问题。模型只生成 SQL 制品，执行与核对交给数据库 + 独立参考实现。

## 快速开始

```bash
npm install
npm run gold        # 标准 SQL 跑 10 题（无需 Ollama，先跑这个）
npm run demo        # Q2 + Q6 双题展示（需 Ollama 运行）
npm run eval        # 10 题全跑（需 Ollama 运行，约 10～15 分钟）
```

单题与单问：

```bash
npx tsx src/main.ts --mode eval --only 2,3,6
npx tsx src/main.ts --mode ask --query "研发部现在有多少在职员工？"
npx tsx src/main.ts --mode initdb   # 落盘 erp.db 手工查看（gitignored）
```

## 教学笔记

更详细的讲解（artifact 模式、三线分工、日期口径、比对容差）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
13.erp-agent/
├── src/
│   ├── types.ts      # Employee / SalaryRow / Question / ResultRow
│   ├── seed.ts       # 确定性种子库（mulberry32/42，截止 2026-06-15）
│   ├── questions.ts  # 10 个问题 + 返回列/业务口径 hint
│   ├── reference.ts  # 独立 TS 参考实现（判分基准，不用 SQL）
│   ├── gold.ts       # 10 条手写标准 SQL（离线自检）
│   ├── compare.ts    # 多重集 + 容差比对（Q9 有序）
│   ├── agent.ts      # NL→SQL 生成（含 schema 与口径提示）
│   └── main.ts       # CLI（demo/gold/ask/eval/initdb）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 三线分工（main.ts + reference.ts + gold.ts）

gold 验库（标准 SQL 跑通=数据模型自洽）、reference 验分（独立 TS 实现当判分基准）、agent 练翻译。三线互相咬合：gold 挂了先查库，agent 挂了看是 SQL 错还是口径错。

### 2. 日期口径进 prompt（agent.ts）

库截止 2026-06-15 写死，prompt 明示今年=2026/去年=2025/前年=2024、在职=离职日期为空、A/B 部门映射。这不算泄题——没有口径，相对时间无从推导。

### 3. 比对容差（compare.ts）

浮点末位（SQL AVG 与 TS 求和顺序不同）、行顺序（除 Q9 排名本身是答案）、中文排序（二进制 vs 拼音）——三处全踩过坑，分别用相对误差、多重集匹配、有序题加 name 二级排序解决。

## 实测结果（gemma4）

`npm run gold`（离线）：**10/10**，标准 SQL 与独立参考实现全对。

`npm run eval`：

```
Q1 ✓ Q2 ✓ Q3 ✗ Q4 ✓ Q5 ✗ Q6 ✓ Q7 ✓ Q8 ✓ Q9 ✗ Q10 ✗
agent 通过率：6/10
```

**失败根因（Q3/Q9 实锤，Q5/Q10 为结果不一致）**：Q3 栅栏外多出 "ite" 残字致语法错误；Q9 两个 CTE 都别名 T1（与 employees T1 撞名）；Q5/Q10 执行成功但结果与参考实现对不上（待逐条归因）。没有"模型很努力但运气不好"——能定位的都已定位，Q5/Q10 的完整归因留作练习。官方把这类失败叫"建模错了程序照样错"，这里再加一条："SQL 写错了跑再快也没用"。

## 关键洞察

1. **artifact 模式**——LLM 只产 SQL 制品，执行核对交给机器
2. **三线分工**——gold 验库、reference 验分、agent 练翻译，别混
3. **日期口径进 prompt**——相对时间必须锚定，不算泄题
4. **比对容差**——浮点、排序、中文 collation，没有无痛的全等
5. **失败要归类**—— fence 残字、别名冲突、边界条件，三类三因

## 注意事项

- `gold`/`initdb` 完全离线；`demo`/`eval`/`ask` 需要 Ollama 运行 + `gemma4:latest`
- eval 约 10～15 分钟（10 题 × 生成 + 出错重试）；赶时间用 `--only`
- 单次 Ollama 调用 240 秒超时；单题炸了记 ERR 继续下一题，不炸整轮
- `erp.db` 落盘文件已 gitignore；生产换 PostgreSQL（日期函数对照官方文档换）
- 答案只看执行结果与参考实现的一致性，不看模型解释得好不好听

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[erp-agent](https://github.com/bojieli/ai-agent-book/tree/main/chapter5/erp-agent)
- 官方 Book 相关章节：[第 5 章 · Coding Agent 与通用 Agent](https://bojieli.github.io/ai-agent-book/chapter5/)
