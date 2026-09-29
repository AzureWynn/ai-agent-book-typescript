# AI Agent 开发实战 —— TypeScript 练习

本仓库是基于 **《AI Agent 开发实战》** 教学课程的个人 TypeScript 练习实现。

- 课程主页（在线文档）：https://bojieli.github.io/ai-agent-book/
- 官方源码（Python 版）：https://github.com/bojieli/ai-agent-book

## 项目定位

官方教程以 Python 实现为主。本仓库把这些教学实验**用 TypeScript 重新实现一遍**，在保持实验逻辑与结论一致的前提下，探索并验证 TypeScript 生态下的 Agent 开发方式。

每个章节一个独立目录；每章内部按实验再分子目录，各实验自带 `package.json` 与依赖，可单独运行。

> 目前进度：完成第 1 章实验 1-1 至 1-4（上下文 Agent、联网搜索、托管工具、文生图工作流），及手写 Function Calling 练习；第 2 章实验 2-1、2-2+2-8、2-3、2-4、2-5、2-6、2-9、2-10（本地 LLM 服务、注意力可视化+状态栏对照、KV Cache、提示工程消融、提示注入攻防、Agent Skills、Agent 状态栏、上下文压缩）。第 2 章全部完成。第 3 章实验 3-1 至 3-12（用户记忆系统、Mem0 对比、日志脱敏、稠密嵌入检索、稀疏 BM25 检索、混合检索流水线、结构化索引、Agentic RAG 对比、记忆 Agentic RAG、上下文感知检索、双层用户记忆、隐性知识提取）已完成。第 3 章全部完成。第 4 章实验 4-1、4-2、4-3、4-4、4-5（主动工具发现、感知工具 MCP 服务器、多模态三种范式对比、执行工具 MCP 服务器、协作工具 MCP 服务器）已完成。第 4 章全部完成。

## 目录结构

```
ai-agent-book/
├── chapter1/                  # 第 1 章：深入理解 AI Agent
│   ├── 0.function-calling/    # 手写 Function Calling 协议（已完成）
│   ├── 1.context/             # 实验 1-1：上下文感知 Agent 与消融实验（已完成）
│   │   ├── src/               # TypeScript 源码
│   │   ├── fixtures/          # 样例 PDF
│   │   ├── README.md          # 章节实验说明（含流程图与学习路径）
│   │   └── package.json       # 独立依赖
│   ├── 2.web-search-agent/    # 实验 1-2：联网搜索 Agent（已完成）
│   │   ├── src/               # ReAct 搜索循环
│   │   ├── scripts/           # SearXNG 一键启动
│   │   └── README.md
│   ├── 3.search-codegen/      # 实验 1-3：托管工具 Agent（已完成）
│   │   ├── src/               # Responses 协议 + 托管工具仿真
│   │   └── README.md
│   ├── 4.image-gen-workflow/  # 实验 1-4：文生图工作流（已完成）
│   │   ├── src/               # 改写节点(Ollama) + 可插拔生图
│   │   └── README.md
│   └── README.md              # 章节索引
├── chapter2/                  # 第 2 章：上下文工程
│   ├── 1.local-llm-serving/   # 实验 2-1：本地 LLM 服务部署与工具调用（已完成）
│   │   ├── src/               # Ollama 原生工具调用 + 流式 ReAct
│   │   └── README.md
│   ├── 2.attention-visualization/  # 实验 2-2：注意力机制可视化（已完成）
│   │   ├── src/               # TS 编排 + SVG 热力图 + 前端
│   │   ├── py/                # transformers 注意力提取助手
│   │   └── README.md
│   ├── 3.kv-cache/            # 实验 2-3：KV Cache 与错误上下文管理模式（已完成）
│   │   ├── src/               # Ollama 前缀缓存 + 6 种模式
│   │   └── README.md
│   ├── 4.prompt-engineering/  # 实验 2-4：提示工程消融实验（已完成）
│   │   ├── src/               # τ-bench-like 航空域 + 3 轴消融
│   │   └── README.md
│   ├── 5.prompt-injection/    # 实验 2-5：提示注入攻防实验（已完成）
│   │   ├── src/               # 3 攻击 × 4 防御成功率矩阵
│   │   └── README.md
│   ├── 6.agent-skills-ppt/    # 实验 2-6：Agent Skills 生成演示文稿（已完成）
│   │   ├── src/               # 三层渐进式披露 + python-pptx
│   │   └── README.md
│   ├── 9.system-hint/         # 实验 2-9：Agent 状态栏技术（已完成）
│   │   ├── src/               # 5 种状态栏 + 轨迹保存
│   │   └── README.md
│   ├── 10.context-compression/ # 实验 2-10：上下文压缩策略对比（已完成）
│   │   ├── src/               # 6 种策略 + 溢出/压缩比
│   │   └── README.md
│   └── README.md              # 章节索引
├── chapter3/                  # 第 3 章：用户记忆和知识库
│   ├── 1.user-memory/       # 实验 3-1：长期用户记忆系统（已完成）
│   │   ├── src/               # TypeScript 源码
│   │   ├── data/              # 记忆和对话存储
│   │   └── README.md
│   ├── 2.mem0/              # 实验 3-2：Mem0 + Memobase 对比（已完成）
│   ├── 3.log-sanitization/  # 实验 3-3：日志脱敏（已完成）
│   ├── 4.dense-embedding/   # 实验 3-4：稠密嵌入向量检索（已完成）
│   ├── 5.sparse-embedding/  # 实验 3-5：稀疏向量检索 BM25（已完成）
│   ├── 6.retrieval-pipeline/ # 实验 3-6：混合检索流水线（已完成）
│   ├── 7.structured-index/  # 实验 3-7：结构化索引（已完成）
│   ├── 8.agentic-rag/       # 实验 3-8：Agentic RAG 对比（已完成）
│   ├── 9.agentic-rag-memory/ # 实验 3-9：记忆 Agentic RAG（已完成）
│   ├── 10.contextual-retrieval/ # 实验 3-10：上下文感知检索（已完成）
│   ├── 11.contextual-user-memory/ # 实验 3-11：双层用户记忆（已完成）
│   ├── 12.knowledge-extraction/ # 实验 3-12：隐性知识提取（已完成）
│   └── README.md              # 章节索引
├── chapter4/                  # 第 4 章：工具
│   ├── 1.active-tool-discovery/  # 实验 4-1：主动工具发现（已完成）
│   ├── 2.perception-tools/  # 实验 4-2：感知工具 MCP 服务器（已完成）
│   ├── 3.multimodal-agent/  # 实验 4-3：多模态三种范式对比（已完成）
│   ├── 4.execution-tools/  # 实验 4-4：执行工具 MCP 服务器（已完成）
│   ├── 5.collaboration-tools/  # 实验 4-5：协作工具 MCP 服务器（已完成）
│   │   ├── src/               # TypeScript 源码（MCP Server/Client/Agent）
│   │   ├── workspace/         # 沙盒根目录（演示文档）
│   │   └── README.md
│   └── README.md              # 章节索引
└── ...
```

## 各章节

| 章节 | 实验 | 主题 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| [chapter1](chapter1/README.md) | [0.function-calling](chapter1/0.function-calling/README.md) | 手写 Function Calling 协议 | ✅ 完成 | 纯 fetch + Ollama（无框架） |
| [chapter1](chapter1/README.md) | [1.context](chapter1/1.context/README.md) | 上下文感知 Agent 与消融实验 | ✅ 完成 | ReAct 循环 + 5 种消融模式 + 结果判定 |
| [chapter1](chapter1/README.md) | [2.web-search-agent](chapter1/2.web-search-agent/README.md) | 联网搜索 Agent | ✅ 完成 | Ollama + SearXNG，ReAct + Function Calling |
| [chapter1](chapter1/README.md) | [3.search-codegen](chapter1/3.search-codegen/README.md) | 托管工具 Agent | ✅ 完成 | 本地仿真 Responses 协议（web_search + code_interpreter） |
| [chapter1](chapter1/README.md) | [4.image-gen-workflow](chapter1/4.image-gen-workflow/README.md) | 文生图工作流 vs 原生 | ✅ 完成 | 改写节点(Ollama) + 可插拔生图 |
| [chapter2](chapter2/README.md) | [1.local-llm-serving](chapter2/1.local-llm-serving/README.md) | 本地 LLM 服务部署与工具调用 | ✅ 完成 | Ollama 原生工具调用 + 流式 ReAct |
| [chapter2](chapter2/README.md) | [2.attention-visualization](chapter2/2.attention-visualization/README.md) | 注意力机制可视化（2-2）与状态栏对照（2-8） | ✅ 完成 | TS 编排 + transformers 提取 + SVG 热力图 |
| [chapter2](chapter2/README.md) | [3.kv-cache](chapter2/3.kv-cache/README.md) | KV Cache 与错误上下文管理模式 | ✅ 完成 | Ollama 前缀缓存 + 6 种模式 |
| [chapter2](chapter2/README.md) | [4.prompt-engineering](chapter2/4.prompt-engineering/README.md) | 提示工程消融实验 | ✅ 完成 | τ-bench-like 航空域 + 3 轴消融 |
| [chapter2](chapter2/README.md) | [5.prompt-injection](chapter2/5.prompt-injection/README.md) | 提示注入攻防实验 | ✅ 完成 | 3 攻击 × 4 防御成功率矩阵 |
| [chapter2](chapter2/README.md) | [6.agent-skills-ppt](chapter2/6.agent-skills-ppt/README.md) | Agent Skills 生成演示文稿 | ✅ 完成 | 三层渐进式披露 + python-pptx |
| [chapter2](chapter2/README.md) | [9.system-hint](chapter2/9.system-hint/README.md) | Agent 状态栏技术 | ✅ 完成 | 5 种状态栏 + 轨迹保存 |
| [chapter2](chapter2/README.md) | [10.context-compression](chapter2/10.context-compression/README.md) | 上下文压缩策略对比 | ✅ 完成 | 6 种策略 + 溢出/压缩比 |
| [chapter3](chapter3/README.md) | [1.user-memory](chapter3/1.user-memory/README.md) | 长期用户记忆系统 | ✅ 完成 | Ollama + 分离架构 + 4 种记忆模式 |
| [chapter3](chapter3/README.md) | [2.mem0](chapter3/2.mem0/README.md) | Mem0 + Memobase 对比 | ✅ 完成 | ADD-only + 四类记忆概念 |
| [chapter3](chapter3/README.md) | [3.log-sanitization](chapter3/3.log-sanitization/README.md) | 日志脱敏 | ✅ 完成 | 规则引擎 + LLM 引擎，18 类 PII |
| [chapter3](chapter3/README.md) | [4.dense-embedding](chapter3/4.dense-embedding/README.md) | 稠密嵌入向量检索 | ✅ 完成 | Ollama 嵌入 + ANNOY/HNSW 对比 |
| [chapter3](chapter3/README.md) | [5.sparse-embedding](chapter3/5.sparse-embedding/README.md) | 稀疏向量检索 BM25 | ✅ 完成 | 纯离线 + 倒排索引 + explain |
| [chapter3](chapter3/README.md) | [6.retrieval-pipeline](chapter3/6.retrieval-pipeline/README.md) | 混合检索流水线 | ✅ 完成 | RRF/加权融合 + 重排 |
| [chapter3](chapter3/README.md) | [7.structured-index](chapter3/7.structured-index/README.md) | 结构化索引 | ✅ 完成 | RAPTOR/GraphRAG，纯离线 |
| [chapter3](chapter3/README.md) | [8.agentic-rag](chapter3/8.agentic-rag/README.md) | Agentic RAG 对比 | ✅ 完成 | 缺口驱动多轮检索，纯离线 |
| [chapter3](chapter3/README.md) | [9.agentic-rag-memory](chapter3/9.agentic-rag-memory/README.md) | 记忆 Agentic RAG | ✅ 完成 | 会话分块 + 三记忆工具 |
| [chapter3](chapter3/README.md) | [10.contextual-retrieval](chapter3/10.contextual-retrieval/README.md) | 上下文感知检索 | ✅ 完成 | 前缀双索引对比，纯离线 |
| [chapter3](chapter3/README.md) | [11.contextual-user-memory](chapter3/11.contextual-user-memory/README.md) | 双层用户记忆 | ✅ 完成 | JSON Cards + 上下文 RAG |
| [chapter3](chapter3/README.md) | [12.knowledge-extraction](chapter3/12.knowledge-extraction/README.md) | 隐性知识提取 | ✅ 完成 | 因子发现 + 原型聚类 |
| [chapter4](chapter4/README.md) | [1.active-tool-discovery](chapter4/1.active-tool-discovery/README.md) | 主动工具发现 | ✅ 完成 | 三服务器直连 + 双臂对照 |
| [chapter4](chapter4/README.md) | [2.perception-tools](chapter4/2.perception-tools/README.md) | 感知工具 MCP 服务器 | ✅ 完成 | MCP SDK + Ollama Agent |
| [chapter4](chapter4/README.md) | [3.multimodal-agent](chapter4/3.multimodal-agent/README.md) | 多模态三种范式对比 | ✅ 完成 | SVG 测量 + Ollama |
| [chapter4](chapter4/README.md) | [4.execution-tools](chapter4/4.execution-tools/README.md) | 执行工具 MCP 服务器 | ✅ 完成 | 分层安检 + 审批校验 |
| [chapter4](chapter4/README.md) | [5.collaboration-tools](chapter4/5.collaboration-tools/README.md) | 协作工具 MCP 服务器 | ✅ 完成 | 子Agent/HITL/通知/定时 |

## 快速开始

```bash
# 实验 1-1：上下文消融实验（交互模式）
cd chapter1/1.context
npm install
npm run interactive   # 对话 + 内置示例任务（等价: npx tsx src/main.ts interactive）
npm run ablation      # 5 种消融模式

# 实验 1-2：联网搜索 Agent
cd chapter1/2.web-search-agent
./scripts/searxng.sh start        # 一键启动 SearXNG（需 Docker）
npm install
npm run interactive

# 实验 2-1：本地 LLM 服务部署与工具调用
cd chapter2/1.local-llm-serving
npm install
npm run demo                      # 跑第一个样例任务（快速验证）
npm run single -- "你的任务"       # 单任务模式（流式）
npm run interactive               # 交互模式

# 实验 2-2：注意力机制可视化（需 Python 3.14 + torch，首次下载 qwen3-0.6b）
cd chapter2/2.attention-visualization
npm run setup                     # uv venv + pip install torch transformers
npm run heatmap                   # 默认提示词热力图 + sink/因果三角统计
npm run heatmap -- --compare-layers 0 -1   # 第 0 层 vs 最后一层对比
npm run statusbar                 # 实验 2-8：状态栏对照（约 15 分钟）

# 实验 2-3：KV Cache 与错误上下文管理模式
cd chapter2/3.kv-cache
npm install
npm run compare                   # 6 种模式 + 对比表（约 2-3 分钟）
npm run report                    # 离线对比（无需模型）

# 实验 2-4：提示工程消融实验
cd chapter2/4.prompt-engineering
npm install
npm run all                       # 6 臂 × 5 任务 + 成功率对比表

# 实验 2-5：提示注入攻防实验
cd chapter2/5.prompt-injection
npm install
npm run all                       # 3 攻击 × 4 防御 + 成功率矩阵

# 实验 2-6：Agent Skills 生成演示文稿（需 Python 3.14 + python-pptx）
cd chapter2/6.agent-skills-ppt
npm run setup                     # uv venv + pip install python-pptx
npm run run                       # 在线：Ollama gemma4 驱动渐进式披露生成 pptx

# 实验 2-9：Agent 状态栏技术
cd chapter2/9.system-hint
npm install
npm run preview                   # 离线预览状态栏
npm run demo -- basic             # 逐轮展示注入的状态栏

# 实验 2-10：上下文压缩策略对比
cd chapter2/10.context-compression
npm install
npm run experiment                # 6 策略 + 溢出/压缩比对比表
```

## 技术栈

- Node.js ≥ 22 + TypeScript
- 实验 1-1：LangChain.js（`@langchain/ollama`）+ 本地 LLM（Ollama）
- 实验 1-2：LangChain.js + Ollama + SearXNG（本地搜索）
- 实验 2-1：Ollama 原生 `/api/chat` 工具调用 + 流式 ReAct（无框架）
- 实验 2-2：TS 编排 + Python(transformers) 提取注意力 + 零依赖 SVG/前端
- 实验 2-3：Ollama 前缀缓存 + `prompt_eval_duration` 作缓存信号（无框架）
- 实验 2-4：τ-bench-like 航空域 + 3 轴消融（Ollama 工具调用）
- 实验 2-5：提示注入攻防矩阵（Ollama 工具调用 + 确定性判定）
- 实验 2-6：渐进式披露 Agent Skills + python-pptx（Ollama 驱动）
- 实验 2-9：Agent 状态栏临时注入（Ollama 工具调用）
- 实验 2-10：上下文压缩策略（mock 搜索 + Ollama 摘要）
- 详细依赖见各实验 `package.json`

## 与官方版的差异说明

与官方 Python 版相比，本仓库在保持实验设计一致的前提下做了以下调整：

- 使用 LangChain.js 的 Agent 工具协议（`DynamicStructuredTool` + zod）
- 结果判定模型同步官方思路：区分"有终止回复 / 数值正确 / 数字有据"三个维度
- 工具隔离使用 `node:vm` 而非 Python 沙箱

## 参考

- 课程在线文档：https://bojieli.github.io/ai-agent-book/
- 官方源码：https://github.com/bojieli/ai-agent-book
- LangChain.js：https://js.langchain.com/