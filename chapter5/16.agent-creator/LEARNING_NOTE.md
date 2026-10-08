# Chapter 5-16：Agent 造 Agent · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**让模型写一个专用 Agent，再看写出来的东西能不能真干活——两种写法打擂。**

```
目标：release-notes Agent（读 CHANGELOG.md，给 v2.4.0 写发布纪要 + 回答追问）

A 路（从零）：循环、工具协议、领域工具、CLI、测试，全自己写
B 路（模板）：复制现成 reference agent，只加领域行为
```

六道门禁依次过：文件齐 → 无密钥 → 编得过 → 有步数上限 → 自带测试能跑 → 真跑一遍答对题。前面是"能不能用"，最后才是"好不好用"。

## 二、模板路线到底省了什么？

省的不是"写字量"，是"协议设计"。循环怎么写、工具结果怎么回灌、步数怎么封顶——这些通用协议模板里都有，能抄。剩下真正要动脑的只有领域部分：读哪个文件、问什么问题、答案长什么样。

```
从零：协议 + 领域，全自己想
模板：协议照抄，只想领域
```

官方结论也是这个方向：模板质量非劣且创建更高效，但"质量与效率同时严格占优"没出现——省的是确定的，赢是不一定的。

## 三、门禁为什么是这个顺序？

按"便宜的先、贵的上"排：

```
1. 文件齐（毫秒，读目录）
2. 密钥扫描（毫秒，正则）
3. 编译（秒级，tsc）
4. 步数上限（秒级，grep 源码）
5. 自带测试（分钟级，跑模型 + 断言）
6. 真跑任务（分钟级，跑模型 + 关键词验收）
```

前面挂了后面不用跑——省时间，也符合"结构先行、行为压轴"的验收逻辑。`comparison.json` 全记下来，哪层挂的一目了然。

## 四、生成器的三个坑（本实验实测）

```
1. 写两个文件就收工：test.mts 经常被"忘"了
   → 缺件重试：点名要缺的文件，只补缺的块

2. 测试引 vitest：node_modules 里没它，必挂
   → 合同写死只许 node:assert，框架名一个不许出现

3. import 不带 .js 后缀 / 生成 .js 附带产物：
   → 合同加粗 + 门禁 tsconfig 必须 noEmit（否则 tsc 顺手落一堆 .js）
```

三条全是" Necessity is the mother of gate"：每条门禁背后都是一次真实翻车。

## 五、密钥门禁宁可误报，但占位符除外

有轮把 `--api-key <key>` 的用法注释标红了——跨行拼出来的误报。处理方式：**占位符白名单**（your-/example/xxx/***/<>/.../placeholder/sample/demo/changeme），命中白名单的跳过，其余照杀。哲学不变：第一职责是"不错过"；但`<key>`这种明示占位符再杀就是狼来了，真狼没人看。

## 六、本实验怎么跑

```bash
npm run demo              # 双臂全流程（需 Ollama，约 10 分钟）
npm run demo -- --arm template   # 只跑模板臂（省一半时间）
npm run demo -- --arm scratch    # 只跑从零臂
npm run eval              # 同 demo + 对照表 + comparison.json（需 Ollama）
```

产物在 `runs/<runId>/<arm>/`（gitignored），`comparison.json` 同目录。

## 七、核心代码结构

```
16.agent-creator/
├── reference/       # 模板来源：已知正确的 changelog 问答 Agent
│   ├── CHANGELOG.md # 共享语料（各臂构建时复制过去）
│   ├── agent.ts     # ReAct 循环 + read/grep 工具
│   ├── cli.ts       # --ask 入口
│   └── test.mts     # 关键词断言（dark mode）
├── src/
│   ├── types.ts     # GateResult / ArmResult / Comparison
│   ├── creator.ts   # 双臂 prompt + 缺件重试 + 文件落盘
│   ├── validator.ts # 六道门禁（文件/密钥/编译/步数/测试/真跑）
│   └── main.ts      # CLI（demo / eval / --arm）+ 赢家规则
├── package.json
└── tsconfig.json
```

## 八、关键洞察

1. **模板省的是协议设计**——循环、回灌、封顶照抄，只写领域
2. **门禁按成本排序**——毫秒级先行，分钟级压轴
3. **生成器要配重试**——缺件重试、测试失败信息可回灌（本实验只做了前者，后者是升级方向）
4. **密钥门禁宁严勿松**——误报人工看，漏报进仓库
5. **赢家规则写死**——过门多者胜，同分比 token，杜绝事后解释

## 九、常见问题

- **Ollama 没起**：创建器直接报错退出，不 mock（官方同款立场）
- **某臂全挂**：看 comparison.json 定位哪一层；常见是 import 后缀和测试框架
- **两臂都挂**：先查 Ollama 和网络；再看门禁明细
- **想换目标任务**：改 TARGET_TASK + 换语料 + 换关键词断言，三处联动
- **runs/ 越堆越大**：gitignored，手工删；`--run-id` 固定名字可覆盖式重跑对照
