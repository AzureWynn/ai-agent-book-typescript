# agent-creator / 让模型造 Agent

> Chapter 5-16: 从零生成 vs 模板改造，六道门禁裁决，comparison.json 留证
> 对应《AI Agent 开发实战》第 5 章实验 5-16（官方 README 标题作 5-13，章节索引表作 5-16，此处跟索引表）

← [返回第 5 章目录](../README.md)

## 这个实验在学什么

对应官方实验 5-16：**让 Agent 创建 Agent**。本仓库为 **TypeScript 实现**：同一目标（读 CHANGELOG.md 的 release-notes Agent）走两条路线——从零全写 vs 复制 reference 只改领域——六道门禁依次裁决（文件齐 / 无密钥 / 编得过 / 步数有界 / 自带测试能跑 / 真跑答对），`comparison.json` 记录耗时、token、门禁与赢家。缺凭据或真跑失败直接报错，不 mock。

## 快速开始

```bash
npm install
npm run demo              # 双臂全流程（需 Ollama 运行，约 10 分钟）
npm run demo -- --arm template   # 只跑模板臂（省一半时间）
npm run eval              # 同 demo + 对照表 + comparison.json（需 Ollama）
```

## 教学笔记

更详细的讲解（模板省什么、门禁排序、生成器三坑、密钥门禁哲学）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

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
├── runs/            # 产物与 comparison.json（gitignored）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 双臂 prompt 差（creator.ts）

从零臂：只有目标 + 输出契约；模板臂：目标 + 契约 + reference 全文 + "循环照抄，只加领域"。实验变量唯一：有没有模板可抄。

### 2. 缺件重试（creator.ts）

模型常写两个文件就收工。解析后点名：缺谁补谁，只补缺的块。这是生成器侧唯一的人工干预，文档写明。

### 3. 六道门禁（validator.ts）

文件齐 → 密钥扫描 → tsc 编译（自带 tsconfig.gate.json，noEmit 防副产物）→ 步数有界（源码 grep）→ 自带测试跑过 → 真跑答对关键词。便宜的先，分钟级的压轴；挂了就停，不浪费后面的钱。

### 4. 赢家规则（main.ts）

过门多者胜；同分比生成 token。写死在代码里，杜绝事后解释。

## 实测结果（gemma4）

`npm run eval`（双臂各一次完整生成 + 六道门禁）：

```
Arm       Files  GenTok  Gates
scratch   3      3342    2/7  ✓✓✗✗✗✗✗
template  3      3528    2/7  ✓✓✗✗✗✗✗
Winner: scratch（同分，比生成 token 少）
```

另一次 demo 跑出过 template 5/7 vs scratch 2/7（模板赢）。两次合在一起看才是完整结论：**单轮方差极大，赢家不稳定**——和官方"模板质量非劣但严格占优未出现"同构。稳定的事实只有三件：门禁每次都能抓到真缺陷（缺文件、缺后缀、引不存在的模块），占位符白名单修好后误报消失，comparison.json 每次都留证。

## 关键洞察

1. **模板省的是协议设计**——循环、回灌、封顶照抄，只写领域
2. **门禁按成本排序**——毫秒级先行，分钟级压轴
3. **生成器要配重试**——缺件重试是底线配置
4. **密钥门禁宁严勿松**——误报人工看，漏报进仓库
5. **赢家规则写死**——过门多者胜，同分比 token

## 注意事项

- 需要 Ollama 运行 + `gemma4:latest`；无凭据/真跑失败直接报错，不 mock
- 生成代码本地执行，先审 runs/ 再他用；凭据禁入 prompt 与产物
- `runs/` 已 gitignore；`--run-id` 固定名字可覆盖重跑
- test.mts 只许 import `./agent.js` 与 node:assert，其余本地导入判负
- 图像/视频/浏览器类需求别拿来当目标任务（本实验无相关门禁）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[agent-creator](https://github.com/bojieli/ai-agent-book/tree/main/chapter5/agent-creator)
- 官方 Book 相关章节：[第 5 章 · Coding Agent 与通用 Agent](https://bojieli.github.io/ai-agent-book/chapter5/)
