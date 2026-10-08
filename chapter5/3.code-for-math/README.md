# code-for-math / 代码辅助数学解题

> Chapter 5-3: 同模型同题集对比纯思维链与代码辅助（沙箱执行 Python）
> 对应《AI Agent 开发实战》第 5 章实验 5-3（官方 README 标题作 5-1，章节索引表作 5-3，此处跟索引表）

← [返回第 5 章目录](../README.md)

## 这个实验在学什么

对应官方实验 5-3：**用代码生成工具提升数学解题能力**。本仓库为 **TypeScript 实现**：8 道竞赛风格数学题（整数答案，全部程序验出），双模式对照——cot（只许心算）vs code（写 Python 进沙箱跑）。沙箱是 `python3` 子进程 + 20 秒超时；答案只认 `FINAL ANSWER: <整数>` 一行。

## 快速开始

```bash
npm install
npm run selfcheck   # 参考解跑沙箱对真值（无需 Ollama，先跑这个）
npm run demo        # m08 单题双模式追踪（需 Ollama 运行）
npm run eval        # 8 题对照表（需 Ollama 运行，约 15～25 分钟）
```

省时间：

```bash
npx tsx src/main.ts --mode eval --limit 4   # 前 4 题冒烟（需 Ollama）
```

## 教学笔记

更详细的讲解（外包计算、题库真值链、答案格式、自我推翻名场面）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
3.code-for-math/
├── src/
│   ├── types.ts     # Problem（题面/整数标答/参考解）
│   ├── problems.ts  # 8 道题（标答全部程序验出）
│   ├── sandbox.ts   # python3 子进程执行（超时 20s）
│   ├── modes.ts     # cot（直答）/ code（工具循环 + 停机规则 + 超时保护）
│   └── main.ts      # CLI（demo / eval / selfcheck，逐题容错）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 题库真值链（problems.ts + selfcheck）

标答不是手算的，是参考解跑出来的；`selfcheck` 让参考解在沙箱里重跑一遍对真值。加题先过这条链，否则答案本身可能是错的。

### 2. 停机规则（modes.ts）

第一次执行成功得数就停，不再写验证代码——m08 实测模型会拿数字根"复核"把自己绕晕。什么时候停和调什么工具同等重要。

### 3. 双层容错（modes.ts + main.ts）

单次 Ollama 调用 240 秒超时（`OLLAMA_CHAT_TIMEOUT_MS` 可调）；单题炸了记 ERR 继续下一题，不炸整轮。慢模型 + 长评测，没这两层跑不完。

## 实测结果（gemma4，8 题）

`npm run selfcheck`（离线）：**8/8**，参考解全部命中真值。

`npm run eval`：

```
题号   考点                    CoT预测   代码预测
m01  求和                    ✓        ✓
m02  模幂                    ✓        ✗（写成 1，真值 100）
m03  格点计数                ✓        ✓
m04  最小公倍数              ✓        ✓
m05  阶乘零                  ✓        ✓
m06  素因子分解              ✗（7901） ✓（6857）
m07  格点圆                  ✓        ✓
m08  大数数位和              ✗（7）    ✓（1366）
cot 75.0% (6/8) / code 87.5% (7/8)，净 +1 题
```

**解读**：code 赢的两题全是"算不动"型（m06 大数分解瞎编 7901，m08 302 位数位和）；code 输的一题是"想错了"型（m02 建模时误用费马，程序忠实执行了错误思路）。和官方 gpt-5.6-luna 的 10/11 vs 11/11 同构：**强模型差距收窄到只剩计算密集题，方向不变**。

## 关键洞察

1. **外包的是计算，不是理解**——建模错了，跑出来的数再精确也没用
2. **停机规则是设计**——"拿到数字就停"和"调什么工具"同等重要
3. **题库真值链**——参考解跑沙箱，标答=程序输出，不出手算
4. **小样本别吹结论**——8 题只能看方向，显著性交给大样本（官方 30 题 p=0.125 也没过）
5. **模型↔脚手架此消彼长**——强模型纯思考也能解，增益归零（5-4 同款结论）

## 注意事项

- `selfcheck` 完全离线；`demo`/`eval` 需要 Ollama 运行 + `gemma4:latest`
- eval 约 15～25 分钟（8 题 × 2 模式）；赶时间用 `--limit 4`
- 沙箱是教学级（子进程 + 超时）；生产换容器沙箱
- 只用 stdlib + math，numpy 现成；要 sympy 就 pip 装

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[code-for-math](https://github.com/bojieli/ai-agent-book/tree/main/chapter5/code-for-math)
- 官方 Book 相关章节：[第 5 章 · Coding Agent 与通用 Agent](https://bojieli.github.io/ai-agent-book/chapter5/)
