# Chapter 2 —— 上下文工程

本目录对应《AI Agent 开发实战》第 2 章，包含多个独立实验。每个实验是一个独立子目录，自带 `package.json` 与依赖。

对应章节正文：[第 2 章 · 上下文工程](https://bojieli.github.io/ai-agent-book/book/chapter2/)

## 实验列表

| 实验 | 主题 | 状态 | 技术栈 |
| --- | --- | --- | --- |
| [1.local-llm-serving](1.local-llm-serving/README.md) | 实验 2-1：本地 LLM 服务部署与工具调用 | ✅ 完成 | Ollama 原生工具调用 + 流式 ReAct |
| [2.attention-visualization](2.attention-visualization/README.md) | 实验 2-2 注意力机制可视化 + 实验 2-8 状态栏对照 | ✅ 完成 | TS 编排 + Python(transformers) 提取 + SVG 热力图 |

## 快速开始

```bash
# 本地 LLM 服务 + 工具调用
cd 1.local-llm-serving
npm install
npm run demo                          # 跑第一个样例任务（快速验证）
npm run single -- "你的任务"           # 单任务模式（流式）
npm run interactive                   # 交互模式（内建 /tools /samples /sample <n> 等）

# 注意力机制可视化（需 Python 3.14 + torch，首次会下载 qwen3-0.6b）
cd 2.attention-visualization
npm run setup                         # uv venv + pip install torch transformers
npm run heatmap                       # 默认提示词热力图 + sink/因果三角统计
npm run heatmap -- --compare-layers 0 -1   # 层对比：第 0 层 vs 最后一层
npm run statusbar                     # 实验 2-8：状态栏对照（约 15 分钟）
npm run trajectories && npm run frontend   # 轨迹 + 前端可视化（localhost:5173）
```

> 各实验使用不同的 LLM 后端，`.env` 各自独立，互不影响。