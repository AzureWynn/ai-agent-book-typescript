# Chapter 2 —— 上下文工程

本目录对应《AI Agent 开发实战》第 2 章，包含多个独立实验。每个实验是一个独立子目录，自带 `package.json` 与依赖。

对应章节正文：[第 2 章 · 上下文工程](https://bojieli.github.io/ai-agent-book/book/chapter2/)

## 实验列表

| 实验 | 主题 | 状态 | 技术栈 |
| --- | --- | --- | --- |
| [1.local-llm-serving](1.local-llm-serving/README.md) | 实验 2-1：本地 LLM 服务部署与工具调用 | ✅ 完成 | Ollama 原生工具调用 + 流式 ReAct |
| [2.attention-visualization](2.attention-visualization/README.md) | 实验 2-2 注意力机制可视化 + 实验 2-8 状态栏对照 | ✅ 完成 | TS 编排 + Python(transformers) 提取 + SVG 热力图 |
| [3.kv-cache](3.kv-cache/README.md) | 实验 2-3：KV Cache 与错误上下文管理模式 | ✅ 完成 | Ollama 前缀缓存 + 6 种模式对比 |
| [4.prompt-engineering](4.prompt-engineering/README.md) | 实验 2-4：提示工程消融实验 | ✅ 完成 | τ-bench-like 航空域 + 3 轴消融 |
| [5.prompt-injection](5.prompt-injection/README.md) | 实验 2-5：提示注入攻防实验 | ✅ 完成 | 3 攻击 × 4 防御成功率矩阵 |
| [6.agent-skills-ppt](6.agent-skills-ppt/README.md) | 实验 2-6：Agent Skills 生成演示文稿 | ✅ 完成 | 三层渐进式披露 + python-pptx |
| [9.system-hint](9.system-hint/README.md) | 实验 2-9：Agent 状态栏技术 | ✅ 完成 | 5 种状态栏 + 轨迹保存 |
| [10.context-compression](10.context-compression/README.md) | 实验 2-10：上下文压缩策略对比 | ✅ 完成 | 6 种策略 + 溢出/压缩比对比 |

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

# KV Cache 与错误上下文管理模式
cd 3.kv-cache
npm install
npm run compare                        # 6 种模式 + 对比表（约 2-3 分钟）
npm run report                         # 离线对比（无需模型）

# 提示工程消融实验（τ-bench-like 航空域）
cd 4.prompt-engineering
npm install
npm run all                            # 6 臂 × 5 任务 + 成功率对比表（约 2-3 分钟）

# 提示注入攻防实验
cd 5.prompt-injection
npm install
npm run all                            # 3 攻击 × 4 防御 × 4 trials + 成功率矩阵（约 2-3 分钟）

# Agent Skills 生成演示文稿（需 Python 3.14 + python-pptx）
cd 6.agent-skills-ppt
npm run setup                          # uv venv + pip install python-pptx
npm run run                            # 在线：Ollama gemma4 驱动渐进式披露生成 pptx
npm run offline                        # 离线确定性演示

# Agent 状态栏（System Hint）技术
cd 9.system-hint
npm install
npm run preview                        # 离线预览状态栏
npm run demo -- basic                  # 逐轮展示注入的状态栏

# 上下文压缩策略对比
cd 10.context-compression
npm install
npm run experiment                     # 6 策略 + 溢出/压缩比对比表（约 2-3 分钟）
```

> 各实验使用不同的 LLM 后端，`.env` 各自独立，互不影响。