# Chapter 1 —— 深入理解 AI Agent

本目录对应《AI Agent 开发实战》第 1 章，包含多个独立实验。每个实验是一个独立子目录，自带 `package.json` 与依赖。

对应章节正文：[第 1 章 · 深入理解 AI Agent](https://bojieli.github.io/ai-agent-book/)

## 实验列表

| 实验 | 主题 | 状态 | 技术栈 |
| --- | --- | --- | --- |
| [0.function-calling](0.function-calling/README.md) | 手写 Function Calling 协议 | ✅ 完成 | 纯 fetch + Ollama（无框架） |
| [1.context](1.context/README.md) | 实验 1-1：上下文感知 Agent 与消融实验 | ✅ 完成 | LangChain.js + Ollama |
| [2.web-search-agent](2.web-search-agent/README.md) | 实验 1-2：联网搜索 Agent | ✅ 完成 | Ollama + SearXNG（本地） |

## 快速开始

```bash
# 手写 Function Calling 协议
cd 0.function-calling
npm install
npm run interactive

# 上下文消融实验
cd 1.context
npm install
npm run interactive   # 交互模式
npm run ablation      # 消融实验

# 联网搜索 Agent
cd 2.web-search-agent
./scripts/searxng.sh start        # 一键启动 SearXNG
npm install
npm run interactive
```

> 各实验使用不同的 LLM 后端，`.env` 各自独立，互不影响。