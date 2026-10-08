# code-for-logic / 逻辑谜题约束求解

> Chapter 5-4: 骑士与无赖谜题转 CSP，对比纯思考 / 代码辅助 / 离线约束求解
> 对应《AI Agent 开发实战》第 5 章实验 5-4（官方 README 标题作 5-2，章节索引表作 5-4，此处跟索引表）

← [返回第 5 章目录](../README.md)

## 这个实验在学什么

对应官方实验 5-4：**用代码生成工具提升逻辑思考能力**。本仓库为 **TypeScript 实现**：8 道 K&K 谜题（2~5 人，均验过唯一解），三模式对照——pure（模型直答）、code（模型写穷举程序并跑）、solver（离线基线，纯 TS 穷举 2^n）。核心规则只有一条双条件约束：`X == (X 那句话的真值)`。

## 快速开始

```bash
npm install
npm run solver    # 离线基线：8 题全解（无需 Ollama，先跑这个）
npm run demo      # kk01 单题三模式追踪（需 Ollama 运行）
npm run eval      # pure vs code 对照表（需 Ollama 运行，约 15～20 分钟）
```

省钱/降难度：

```bash
npx tsx src/main.ts --mode eval --limit 4      # 前 4 题冒烟
npx tsx src/main.ts --mode eval --max-people 3 # 只跑 ≤3 人
```

## 教学笔记

更详细的讲解（双条件约束、出题质检、解析器冤案、试金石、官方负结论）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
4.code-for-logic/
├── src/
│   ├── types.ts     # Statement（7 种陈述类型）/ Puzzle / Assignment
│   ├── puzzles.ts   # 8 道谜题：题面（模型可见）+ 结构化陈述 + 标答
│   ├── solver.ts    # 穷举求解 + 标答校验（离线基线与出题质检共用）
│   ├── sandbox.ts   # python3 子进程执行（超时 30s）
│   ├── modes.ts     # pure（直答解析，取结论区末次出现）/ code（写约束程序并跑）
│   └── main.ts      # CLI（demo / eval / solver）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 双条件约束（solver.ts）

每句话独立翻译成 `说话人身份 == 这句话的真值`，2^n 穷举。计数类（"恰好两个"）用求和比较，自指类（"我和 B 同类"）用等值比较——同一条规则，不用特判。

### 2. 出题质检（solver.ts verifyPuzzle）

每题两断言：解数 == 1、当选解 == 标答。草稿 9 题里 1 题多解（删）、3 题标答错（改）——手算 8 题错 3 个，这就是为什么质检不能省。

### 3. 答案解析取末次（modes.ts）

模型习惯先列假设再下结论，取首次出现会抓到中间假设。改取每人最后一次"A是X"式陈述（结论区）。这个改动本身就是一次"冤案平反"，见教学笔记。

## 实测结果（gemma4，8 题）

`npm run solver`（离线）：**8/8 = 100.0%**，每题解数均为 1。

`npm run eval`：

```
题号    人数  纯思考  代码辅助
kk01  2人  ✓      ✓
kk02  2人  ✓      ✓
kk03  3人  ✓      ✓
kk04  3人  ✓      ✓
kk05  4人  ✓      ✓
kk06  4人  ✓      ✓
kk07  5人  ✓      ✓
kk08  3人  ✓      ✓
solver 100.0% (8/8) / pure 100.0% (8/8) / code 100.0% (8/8)
```

**解读**：gemma4 纯思考全对（抽查 kk05 原文：假设法逐项验证，结论与标答逐字一致）——代码增益为 0。这恰是官方预言的另一半："换成强推理模型，纯思考也能全解，代码增益会收敛为 0"。注意第一版评测曾跑出 pure 12.5%——那是解析器取首次出现抓到中间假设的冤案，改取末次后重跑归真。评测数值的第一责任人永远是测量链本身。

## 关键洞察

1. **双条件是全部**——一条规则覆盖所有题型（含计数）
2. **出题要靠求解器验**——唯一解 + 标答一致，缺一不可
3. **先审 parser 再骂模型**——取首次还是末次，能差出几十个百分点
4. **试金石先行**——FizzBuzz + 23688 两道过，约束代码才值得跑
5. **弱模型增益最大**——强模型纯思考也能解，代码增益归零（官方原话精神）

## 注意事项

- `solver` 完全离线；`demo`/`eval` 需要 Ollama 运行 + `gemma4:latest`
- eval 约 15～20 分钟（8 题 × 2 模式）；赶时间用 `--limit 4`
- 模型代码只跑 `python3 -c`，超时 30s；生产换容器沙箱
- 不用 `python-constraint` 库：题小（≤32 组合），itertools 风格穷举等价且零依赖

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[code-for-logic](https://github.com/bojieli/ai-agent-book/tree/main/chapter5/code-for-logic)
- 官方 Book 相关章节：[第 5 章 · Coding Agent 与通用 Agent](https://bojieli.github.io/ai-agent-book/chapter5/)
