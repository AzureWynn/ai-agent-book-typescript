# Chapter 6 —— 交互：观察与动作空间的扩展

本目录对应《AI Agent 开发实战》第 6 章。本章从**模态**（语音、屏幕）与**时序**（异步、事件驱动）两个维度扩展 Agent 的观察与动作空间。

对应章节正文：[第 6 章 · 交互：观察与动作空间的扩展](https://bojieli.github.io/ai-agent-book/book/chapter6/)

## 官方实验与本仓库可行性对照

官方共 14 个实验（6-1 ~ 6-14）+ 附加 phone-agent。本仓库评估结论：**核心三连（6-1/6-2/6-3）已完成并实测通过；6-4 语音链路简化教学版已完成；6-5 ~ 6-14 依赖音频输入模型、GPU、真机硬件或厂商凭证，不移植（6-10 ~ 6-14 机器人实验另附原理说明）。**

本章四个已完成实验的实测记录（`gemma4`，Ollama 本地）：
- 6-1：定时器事件注入 → 队列 → 唤醒 Agent → 真实工具调用 `run_backup_check`，12s循环内 `processed=1 dropped=0`
- 6-2：并行/打断离线演示 + 检查点跨会话恢复（轨迹 3→3 一致，两个运行中任务标记 `suspended` 并保留进度）
- 6-3：中途引导场景下验收三项全过（引用回执、选择场地 B、标注source）
- 6-4：录音 → whisper ASR → 模型 → macOS say 双臂跑通（ASR 1.72~2.11s / LLM 12.64s / TTS 1.62s，成片 3.66s）

| 实验 | 主题 | 可行性 | 状态 | 技术栈 |
| --- | --- | --- | --- | --- |
| [1.event-trigger-agent](1.event-trigger-agent/README.md) | 实验 6-1：事件驱动 Agent | 🟢 Ollama+TS | ✅ 完成 | HTTP/定时器事件 → 事件队列 → ReAct |
| [2.async-agent](2.async-agent/README.md) | 实验 6-2：异步 Agent（Flux） | 🟢 Ollama+TS | ✅ 完成 | Promise 并行工具 + 打断/取消 + 检查点持久化 |
| [3.async-steering](3.async-steering/README.md) | 实验 6-3：同步 vs 原生异步 vs 中途引导 | 🟢 Ollama+TS | ✅ 完成 | 三种等待/恢复语义对照 |
| [4.live-audio](4.live-audio/README.md) | 实验 6-4：实时语音链路（简化版） | 🟡 简化教学版 | ✅ 完成 | ffmpeg 录音 + faster-whisper + Ollama + macOS say |
| — | 实验 6-5 流式语音（Qwen2-Audio） | 🔴 Ollama 无音频输入模型 | 不移植 | — |
| — | 实验 6-6 端到端语音（MiniCPM-o） | 🔴 需 GPU 单卡 | 不移植 | — |
| — | 实验 6-7 可控 TTS 盲评（Fish Audio） | 🟡 云端服务 | 不移植 | — |
| — | 实验 6-8 Anthropic 原生 Computer Use | 🔴 需 Anthropic 凭证 + Docker | 不移植 | — |
| — | 实验 6-9 开放模型 Computer Use | 🟡 需视觉模型 + Playwright | 不移植 | — |
| — | 实验 6-10 ~ 6-14 机器人遥操作/导航/sim2real | 🔴 需真机硬件或 GPU 训练 | 原理说明 | — |

## 主线教学路径（对应官方"第一次阅读的顺序"）

```
6-1 事件驱动：Agent 怎么被外部事件唤醒（HTTP/定时器 → 事件队列 → ReAct）
   ↓
6-2 异步控制：任务跑起来后怎么管（并行工具 / 打断 / 取消 / 状态查询）
   ↓
6-3 steering：同步 / 原生异步 / 中途引导三种等待与恢复语义对照
   ↓
6-4 语音链路（简化）：VAD → ASR → LLM → TTS 级联与逐段延迟
```

本章正文统一骨架：**持续观察 → 受限动作 → 新观察 → 验收/抢占** 的闭环。

## 快速开始

```bash
# 事件驱动 Agent（6-1）
cd 1.event-trigger-agent
npm install
npm run demo                    # 定时器/HTTP 事件注入 + ReAct 处理（需 Ollama 运行）

# 异步 Agent（6-2）
cd 2.async-agent
npm install
npm run demo                    # 并行/打断/检查点三连（离线，无需 Ollama）
npm run llm                     # 三个在线场景（需 Ollama 运行）
npm run llm -- 2                # 只跑"打断"场景

# steering 三语义对照（6-3）
cd 3.async-steering
npm install
npm run eval                    # 同步 vs 原生异步 vs 中途引导对照表（需 Ollama 运行）

# 语音链路简化版（6-4）
cd 4.live-audio
npm install
python3 -m venv .venv && .venv/bin/pip install faster-whisper "av<19"
npm run setup                   # 环境自检
npm run offline                 # 离线臂：预置音频 → ASR → 模板 → TTS（无需麦克风）
npm run demo                    # 在线臂：录 5 秒 → ASR → gemma4 → say（需麦克风）
npm run eval                    # 双臂耗时对照表
```

> 各实验使用 Ollama 本地模型（默认 gemma4:latest），`.env` 各自独立。6-4 额外依赖 macOS 系统命令 `say`/`afplay`（中文音色 9 个）与 faster-whisper，Linux/容器不可直接运行。

## 机器人实验（6-10 ~ 6-14）原理一句话

XLeRobot 整理桌面任务：6-10/6-12 是真机遥操作与自主导航，6-11/6-13 是模拟器中的理想上限与三策略对照，6-14 是 RGB 跨环境 sim2real 测试。核心思想：**机器人 Agent 的观察是"持续观察"，动作是"受限动作"，验收靠最终世界状态重观察**——与本章正文的统一闭环一致，但需要真实硬件与训练环境，超出本仓库 Ollama + TS 教学范围。
