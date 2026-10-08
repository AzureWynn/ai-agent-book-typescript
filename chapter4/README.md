# Chapter 4 —— 工具

本目录对应《AI Agent 开发实战》第 4 章，包含多个独立实验。每个实验是一个独立子目录，自带 `package.json` 与依赖。

对应章节正文：[第 4 章 · 工具](https://bojieli.github.io/ai-agent-book/chapter4/)

## 实验列表

| 实验 | 主题 | 状态 | 技术栈 |
| --- | --- | --- | --- |
| [1.active-tool-discovery](1.active-tool-discovery/README.md) | 实验 4-1：主动工具发现 | ✅ 完成 | TypeScript + 三服务器直连 + 双臂对照 |
| [2.perception-tools](2.perception-tools/README.md) | 实验 4-2：感知工具 MCP 服务器 | ✅ 完成 | TypeScript + MCP SDK + Ollama Agent |
| [3.multimodal-agent](3.multimodal-agent/README.md) | 实验 4-3：多模态三种范式对比 | ✅ 完成 | TypeScript + SVG 几何测量 + Ollama |
| [4.execution-tools](4.execution-tools/README.md) | 实验 4-4：执行工具 MCP 服务器 | ✅ 完成 | TypeScript + 分层安检 + 审批校验 |
| [5.collaboration-tools](5.collaboration-tools/README.md) | 实验 4-5：协作工具 MCP 服务器 | ✅ 完成 | TypeScript + 子Agent/HITL/通知/定时 |

## 本章导读（官方正文要点）

工具是 Agent 的双手。官方把工具分五类，看调用方向与作用对象（[正文 book/chapter4.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md) 表4-1）：

| 工具类型 | 调用方向 | 作用对象 | 本章是否展开 |
|---------|---------|---------|-------------|
| 感知工具 | Agent 主动调用 | 获取信息 | 4-2 ✅ |
| 执行工具 | Agent 主动调用 | 改变世界 | 4-4 ✅ |
| 协作工具 | Agent 主动调用 | 驱动其他 Agent 或人类 | 4-5 ✅ |
| 用户沟通工具 | Agent 主动调用 | 向用户传递信息 | 第 6 章 |
| 事件触发工具 | Agent 注册、外部触发 | 驱动 Agent 开始执行 | 第 6 章 |

通用原则（细则见正文，实现时对照）：

- **ACI**：工具对应 Agent 的目标而非底层 API；默认通用工具优先，安全/权限/参数复杂/高频/平台差异四种情况退回专用工具
- **工具描述决定调用准确率**：写"什么时候用"而非"能做什么"，列边界与反例，参数给具体例子；选错工具先查描述再怀疑模型
- **参数保真**：静默转换/注入输入是系统性故障源，模型无法自行诊断
- **形态 ≠ 披露**：做成专用工具还是 Skill（常驻成本），与一次暴露多少（披露策略）是两个独立决策
- **第三方风险**：工具描述投毒、同名遮蔽、供应链更新——描述当不可信输入审计，锁版本、最小权限凭证

官方阅读顺序：先本地文件读取理解协议与返回值（4-2）→ 再看动作执行检查返回（4-4 Starter 从 execution-tools 离线 demo 开始）→ 最后看工具多时的查找与上下文成本（4-1）。比较实验时把输入、模型、运行条件和结果放一起记录。

验收口径（官方）：代码可运行 ≠ 实验通过；授权、私有数据、外部通知等凭据不满足项诚实标 blocked，不用 mock 代替。本仓库用各实验的 `catalog_receipt.json`（含 `mcp_sdk_version`）记录同等证据。

## 快速开始

```bash
# 主动工具发现（4-1）
cd 1.active-tool-discovery
npm install                       # 另需 2./4./5. 目录各 npm install
npm run demo                      # T1 双臂对照（含轨迹与状态栏）
npm run eval                      # 3 任务 × 双臂 + 汇总表（约 15～25 分钟）

# 感知工具 MCP（4-2）
cd 2.perception-tools
npm install
npm run smoke                     # 协议冒烟：stdio 拉起 → list → 调 file_reader
npm run demo                      # 感知流程演示（--offline 只跑本地步骤）
npm run agent                     # Ollama gemma4 驱动 MCP 工具（需 Ollama 运行）

# 多模态三种范式（4-3）
cd 3.multimodal-agent
npm install
npm run demo                      # Q1 走三条路（含 follow-up）
npm run eval                      # 三问 × 三范式对照表

# 执行工具 MCP（4-4）
cd 4.execution-tools
npm install
npm run smoke                     # 协议冒烟：list → 写 → 跑
npm run demo                      # 全流程演示（审批关，离线）
npm run eval                      # 6 项验收门（审批开，需 Ollama）

# 协作工具 MCP（4-5）
cd 5.collaboration-tools
npm install
npm run smoke                     # 协议冒烟：list → spawn → 审批 → 定时
npm run demo                      # 退款协调全流程
npm run eval                      # 8 项验收门
```

## 架构概览

```
4-1 主动发现（三服务器 33 工具对照）：
┌─────────────────────────────────────────┐
│  对照组：33 schema 全注入（约2900 tokens）│
│  实验组：薄目录 + discover_tools 按需注入 │
│  度量：schema 暴露 / 发现命中 / 完成度    │
└─────────────────────────────────────────┘

4-2 感知工具（TypeScript + MCP SDK）：
┌─────────────────────────────────────────┐
│  Agent（Ollama 工具调用）                 │
│  └── 决策调什么工具 → 读结果 → 综合回答   │
│                                         │
│  MCP Client（stdio 子进程）               │
│  └── list_tools → call_tool             │
│                                         │
│  MCP Server（12 工具）                    │
│  ├── 文件系统：读/浏览/grep/本地知识库    │
│  ├── 搜索：DuckDuckGo/网页/本地          │
│  ├── 公开数据：天气/维基/arxiv/汇率/地点  │
│  └── 摘要：摘录式（离线）                 │
└─────────────────────────────────────────┘
```

```
4-4 执行工具（分层安检 + MCP）：
┌─────────────────────────────────────────┐
│  Agent（Ollama）→ MCP 工具              │
│  ├── 输入验证：沙盒/注入/格式            │
│  ├── 黑名单：rm -rf / 等直接拒           │
│  ├── LLM 审批：高风险二次确认            │
│  └── 校验反馈：写前验语法，长输出落盘    │
└─────────────────────────────────────────┘

4-5 协作工具（子Agent/HITL/通知/定时）：
┌─────────────────────────────────────────┐
│  主 Agent                               │
│  ├── spawn 子 Agent（sync/async）        │
│  │   └── minimal 便宜饿死 / llm 生成能干 │
│  ├── HITL：有人批，无人超时保守默认      │
│  ├── 通知：只预检不真发                  │
│  └── 定时器：到点响铃，可取消            │
└─────────────────────────────────────────┘
```

**核心思想：MCP 统一插头，不统一能力。**

- 发现、校验、调用走一套协议（`list_tools` / `call_tool`）
- 每个工具的数据源、依赖、失败模式各管各的
- 空结果与失败严格区分，失败诚实上报、绝不编数据

> 各实验使用不同的 LLM 后端，`.env` 各自独立，互不影响。
