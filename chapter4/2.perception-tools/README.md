# perception-tools / 感知工具 MCP 服务器

> Chapter 4-2: MCP 感知工具——文件系统、搜索、公开数据源，客户端发现调用全走 MCP stdio
> 对应《AI Agent 开发实战》第 4 章实验 4-2

← [返回第 4 章目录](../README.md)

## 这个实验在学什么

对应官方实验 4-2：**感知工具 MCP 服务器**。本仓库为 **TypeScript 实现**，用官方 `@modelcontextprotocol/sdk`（v1.30.1）搭建真实 MCP Server（stdio 传输）+ Client + Ollama gemma4 驱动的 Agent 循环。12 个工具分四类：文件系统（沙盒内只读）、搜索（DuckDuckGo/网页/本地知识库）、公开数据（天气/维基/arxiv/汇率/地点）、摘录式摘要。统一 `ActionResponse` 信封，空结果与失败严格区分。

## 快速开始

```bash
npm install
npm run smoke     # 协议冒烟：stdio 拉起 → list 12 工具 → 调 file_reader → 落收据
npm run demo      # 感知流程演示（--offline 只跑本地步骤）

# Agent 模式（需 Ollama + gemma4）
npm run agent
```

单工具调试（全部走真实 MCP 调用）：

```bash
npx tsx src/main.ts list --category filesystem
npx tsx src/main.ts info weather
npx tsx src/main.ts run grep pattern=MCP directory=. 'file_pattern=*.md'
npx tsx src/main.ts run weather location=Beijing
```

## 教学笔记

更详细的讲解（MCP 三件事、为什么感知只读、沙盒三规则、空结果≠失败的决策意义）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
2.perception-tools/
├── src/
│   ├── types.ts              # ActionResponse + ToolDef + 参数解析
│   ├── tools-filesystem.ts   # file_reader / directory_browser / grep / kb_search（含沙盒）
│   ├── tools-public.ts       # web_search / webpage_reader / weather / wiki / arxiv / 汇率 / 地点
│   ├── tools-summarize.ts    # 摘录式摘要（离线）
│   ├── catalog.ts            # 12 工具注册表
│   ├── server.ts             # MCP Server（底层 Server + 手写 Schema）
│   ├── client.ts             # MCP Client（stdio 拉起 + list/call + 收据）
│   ├── agent.ts              # Ollama 工具循环（去重 + 预算兜底）
│   ├── smoke.ts              # 三段式协议验证
│   └── main.ts               # CLI（list / info / run / demo / agent）
├── workspace/                # 沙盒根目录（演示文档）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. Server 不用 zod（server.ts）

用 SDK 底层 `Server` + `ListToolsRequestSchema` / `CallToolRequestSchema`，工具参数就是手写 JSON Schema。少一个版本摩擦点，schema 完全可控。必填参数缺失直接返回 `isError`。

### 2. 沙盒单入口（tools-filesystem.ts）

`resolveInside` 是全部路径检查的唯一地方：拒绝绝对路径、`..` 逃逸、软链接。`PERCEPTION_ROOT` 默认 `./workspace`。

### 3. 联网失败诚实上报（tools-public.ts）

每个网络工具包 try/catch，失败返回 `success=false + networkError=true`，绝不编数据。空结果（搜到但为零）返回 `success=true + emptyResult=true`——Agent 靠这个区分"重试"还是"认栽"。

### 4. Agent 去重与兜底（agent.ts）

同一工具+参数只执行一次（重复调用直接回"用上次结果"）；预算用完强制最终作答。小模型实测会打转，这两件套是标准解法。

## 实测结果

`npm run smoke`：12 工具 list 成功，`file_reader` 调通，`catalog_receipt.json` 落盘（含 mcp_sdk_version 1.30.1）。

`npm run demo`：本地三件套全通；`weather` 北京实测 23.8°C；`wikipedia_search` 在本环境连不上，诚实报 `networkError`（不是"没找到"）。

`npm run agent`：gemma4 自主调 directory_browser → file_reader → weather，最终综合作答。6 轮里出现重复调用（去重拦截），预算兜底后拿到答案；答案里留了一处"[此处插入]"占位符——工具链通了，模型 synthesis 能力另说。

## 关键洞察

1. **MCP 统一插头，不统一能力**——数据源和依赖各管各的
2. **schema 先行**——调用前校验，不到执行才炸
3. **感知只读**——可缓存可并行；改世界的工具另有安全账（4-3）
4. **空结果 ≠ 失败**——Agent 重试决策全靠这个区分
5. **工具成功 ≠ 答案好**——链路与模型能力是两回事

## 注意事项

- `smoke`/`demo --offline` 完全离线；联网工具与 `agent` 模式需要网络 / Ollama
- 私有数据源（日历/Notion）需 OAuth，明确标 blocked，不做假数据
- 图像/视频 AI 分析需视觉模型 Key，未实现（与官方一致列为可选）
- `PERCEPTION_ROOT` 只指向一次性目录；不要指到仓库根以外
- Agent/审批类 Ollama 调用无超时保护，hang 住直接 Ctrl-C（本地演示可接受，生产需加超时）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[perception-tools](https://github.com/bojieli/ai-agent-book/tree/main/chapter4/perception-tools)
- 官方正文：[book/chapter4.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)（五类工具、ACI、工具描述、MCP/Skill 生态）
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP 协议介绍](https://modelcontextprotocol.io/)
