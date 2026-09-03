# AI Agent 开发实战 —— TypeScript 练习

本仓库是基于 **《AI Agent 开发实战》** 教学课程的个人 TypeScript 练习实现。

- 课程主页（在线文档）：https://bojieli.github.io/ai-agent-book/
- 官方源码（Python 版）：https://github.com/bojieli/ai-agent-book

## 项目定位

官方教程以 Python 实现为主。本仓库把这些教学实验**用 TypeScript 重新实现一遍**，在保持实验逻辑与结论一致的前提下，探索并验证 TypeScript 生态下的 Agent 开发方式。

每个章节一个独立目录；每章内部按实验再分子目录，各实验自带 `package.json` 与依赖，可单独运行。

> 目前进度：完成第 1 章实验 1-1（上下文感知 Agent 与消融实验）、实验 1-2（联网搜索 Agent），及手写 Function Calling 练习。

## 目录结构

```
ai-agent-book/
├── chapter1/                  # 第 1 章：深入理解 AI Agent
│   ├── context/               # 实验 1-1：上下文感知 Agent 与消融实验（已完成）
│   │   ├── src/               # TypeScript 源码
│   │   ├── fixtures/          # 样例 PDF
│   │   ├── README.md          # 章节实验说明（含流程图与学习路径）
│   │   └── package.json       # 独立依赖
│   └── web-search-agent/      # 实验 1-2：联网搜索 Agent（已完成）
│       ├── src/               # ReAct 搜索循环
│       ├── scripts/           # SearXNG 一键启动
│       └── README.md
└── ...
```

## 各章节

| 章节 | 实验 | 主题 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| [chapter1](chapter1/README.md) | [context](chapter1/context/README.md) | 上下文感知 Agent 与消融实验 | ✅ 完成 | ReAct 循环 + 5 种消融模式 + 结果判定 |
| [chapter1](chapter1/README.md) | [web-search-agent](chapter1/web-search-agent/README.md) | 联网搜索 Agent | ✅ 完成 | Ollama + SearXNG，ReAct + Function Calling |
| [chapter1](chapter1/README.md) | [function-calling](chapter1/function-calling/README.md) | 手写 Function Calling 协议 | ✅ 完成 | 纯 fetch + Ollama（无框架） |

## 快速开始

```bash
# 实验 1-1：上下文消融实验（交互模式）
cd chapter1/context
npm install
npm run interactive   # 对话 + 内置示例任务（等价: npx tsx src/main.ts interactive）
npm run ablation      # 5 种消融模式

# 实验 1-2：联网搜索 Agent
cd chapter1/web-search-agent
./scripts/searxng.sh start        # 一键启动 SearXNG（需 Docker）
npm install
npm run interactive
```

## 技术栈

- Node.js ≥ 22 + TypeScript
- 实验 1-1：LangChain.js（`@langchain/ollama`）+ 本地 LLM（Ollama）
- 实验 1-2：LangChain.js + Ollama + SearXNG（本地搜索）
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