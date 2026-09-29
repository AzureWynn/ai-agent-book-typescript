# active-tool-discovery / 主动工具发现

> Chapter 4-1: 全量注入 vs discover_tools，在三服务器 33 工具上对照 schema 暴露与完成度
> 对应《AI Agent 开发实战》第 4 章实验 4-1

← [返回第 4 章目录](../README.md)

## 这个实验在学什么

对应官方实验 4-1：**主动工具发现**。本仓库为 **TypeScript 实现**：直连 4-2/4-4/4-5 三个真实 MCP 服务器组成 33 工具统一注册表，对照两臂——对照组全量 schema 注入，实验组只给薄目录 + `discover_tools` 元工具（关键词/语义双档检索）。度量 schema token 暴露、发现命中、完成度、轨迹质量。

## 快速开始

```bash
npm install   # 另需三兄弟目录各 npm install（stdio 拉起用得到）
npm run demo      # T1 双臂对照（含轨迹与状态栏）
npm run eval      # 3 任务 × 双臂 + 汇总表（约 15～25 分钟）

npx tsx src/main.ts list                    # 33 工具统一目录
npx tsx src/main.ts --mode demo --keyword   # 切词法检索对照语义
```

## 教学笔记

更详细的讲解（三服务器直连、语义跨词汇鸿沟、allow-list、参数命名打架、模型行为实录）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
1.active-tool-discovery/
├── src/
│   ├── servers.ts    # 三服务器 stdio 直连 + 统一注册表 + 路由 + 收据
│   ├── discover.ts   # keyword / semantic 双档检索 + 薄目录 + token 估算
│   ├── agent.ts      # 双臂循环（去重/提醒/干净兜底/allow-list/状态栏）
│   ├── tasks.ts      # T1 天气报告 / T2 arxiv 笔记 / T3 订单审批（含文件检查器）
│   └── main.ts       # CLI（list / demo / eval）
├── workspace/        # 执行服务器落盘区（报告文件）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 注册表来自 live `list_tools`（servers.ts）

不手抄目录：启动时连三服务器，各自 `list_tools` 拼成 33 项统一注册表。目录漂移自动消除——这本身就是"发现"机制的第一课。

### 2. 语义检索跨词汇鸿沟（discover.ts）

需求说 temperature，描述里没这个词，关键词得 0 分；nomic-embed-text 余弦 0.574 直接命中 weather。默认语义，挂了回退词法。topK 默认 4。

### 3. allow-list 让发现成为必经之路（agent.ts）

没上状态栏的工具不许调（调了就驳回"先 discover"）。否则模型靠猜名字（`perception.weather`）绕过发现——实测发生过。

### 4. 跨服务器命名打架修在适配层（4-4 侧补丁）

4-2 读文件叫 `file_path`，4-4 写文件叫 `path`，模型原样搬运连跪。4-4 侧接受双名（schema 注明别名），不动已有调用。这是多服务器组合的第一类故障，实测抓到的。

## 实测结果

`npm run eval`（3 任务 × 双臂，gemma4）：

```
Arm          Pass    SchemaTokens    Time
full-inject  0/3     9012            367s
discover     0/3     3374            233s
needed-tools discovered: 2/7（weather、arxiv_search 命中；订单审批链没找全）
```

**解读**：完成度打平（和小样本一样，看不出胜负——官方 3/3 打平也写了"未证明准确率提升"）；schema 暴露 9012→3374，降约 63%（确定性指标）；发现质量部分对（7 个必需工具找全 2 个），链式执行力是另一半瓶颈（拒活、过早结束、宣称写了文件但没写——轨迹里全有记录）。

## 关键洞察

1. **先算 token，再谈准确率**——暴露量确定，完成度看模型脸色
2. **语义检索跨词汇鸿沟**——temperature 对不上任何描述词时 0.574 命中
3. **allow-list 让发现成为必经之路**——否则靠猜名绕过
4. **多服务器第一故障是命名不一致**——修在适配层
5. **展示层也会骗人**——跳过曾被画成成功；轨迹展示区分 ok/fail/skip

## 注意事项

- `list` 与 token 测算完全离线；双臂 live 运行需要 Ollama（gemma4 + nomic-embed-text）
- 三兄弟目录需各 `npm install`（stdio 拉起调它们的 tsx）
- eval 约 15～25 分钟（6 轮完整 Agent），demo 只跑 T1；单次 Ollama 调用超 240s 会按失败计（`OLLAMA_CHAT_TIMEOUT_MS` 可调）
- `--keyword` 切纯词法，用于和语义对照
- 报告文件落在 `workspace/`；`catalog_receipt.json` 记 schema 暴露与版本

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[active-tool-discovery](https://github.com/bojieli/ai-agent-book/tree/main/chapter4/active-tool-discovery)
- 官方正文：[book/chapter4.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)（工具太多怎么办、MCP-Zero）
- 上游：实验 4-2/4-4/4-5（本实验的工具底座）
