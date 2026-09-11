# AI Agent 开发实战 —— TypeScript 练习

本仓库是基于 **《AI Agent 开发实战》** 教学课程的个人 TypeScript 练习实现。

- 课程主页（在线文档）：https://bojieli.github.io/ai-agent-book/
- 官方源码（Python 版）：https://github.com/bojieli/ai-agent-book

## 项目定位

官方教程以 Python 实现为主。本仓库把这些教学实验**用 TypeScript 重新实现一遍**，在保持实验逻辑与结论一致的前提下，探索并验证 TypeScript 生态下的 Agent 开发方式。

每个章节一个独立目录；每章内部按实验再分子目录，各实验自带 `package.json` 与依赖，可单独运行。

> 目前进度：完成第 1 章实验 1-1 至 1-4（上下文 Agent、联网搜索、托管工具、文生图工作流），及手写 Function Calling 练习；第 2 章实验 2-1、2-2+2-8、2-3、2-4、2-5、2-6、2-9、2-10（本地 LLM 服务、注意力可视化+状态栏对照、KV Cache、提示工程消融、提示注入攻防、Agent Skills、Agent 状态栏、上下文压缩）。第 2 章全部完成。

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