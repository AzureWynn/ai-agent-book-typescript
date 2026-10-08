# Chapter 8 —— 模型后训练

本目录对应《AI Agent 开发实战》第 8 章。本章讲把经验写入模型参数：预训练 → Mid-training → SFT → RL 四阶段各自用什么数据、优化什么目标、代价多少，以及何时选哪一阶段。

对应章节正文：[第 8 章 · 模型后训练](https://bojieli.github.io/ai-agent-book/book/chapter8/) · [配套实验索引](https://bojieli.github.io/ai-agent-book/chapter8/)

> **本章状态：不做实机训练。** 官方 19 个编号实验绝大多数需要 GPU 训练（多为多卡集群）。本仓库定位为 CPU + Ollama 教学环境，因此本章只做"不训练也能学"的部分：训练流程的**离线推演**与**评估侧验证**。

## 官方实验与本仓库可行性对照

官方 19 个编号实验（8-1 ~ 8-19）+ 3 个无编号补充项。评估结论：**全部需要 GPU 训练或外部仓库，本机（Mac，无 CUDA）一律不移植**；唯一例外是 8-1/8-2 的 Q-learning 部分（纯 CPU，10 秒级），但 LLM 对照臂需 Kimi 凭证。

| 编号 | 主题 | 官方状态 | 关键依赖 | 本仓库结论 |
| --- | --- | --- | --- | --- |
| 8-1/8-2 | learning-from-experience（Q-learning 寻宝） | ✅ | CPU + Kimi 凭证 | 🔶 部分可做：Q-learning 部分纯 CPU 可跑，LLM 臂不移植 |
| 8-3 | MiniMind-pretrain（预训练臂对照） | ✅ | GPU + ARK 盲评 + clone minimind | ❌ 不移植 |
| 8-4 | MiniMind-pretrain（视觉臂） | ✅ | GPU + ARK 图像评审 + CLIP | ❌ 不移植 |
| 8-5 | continued-pretraining | ✅ | RTX-4090 + Mistral 权重 + 韩语数据集 | ❌ 不移植 |
| 8-6 | speech-sft-experiment（语音 SFT） | ✅ | GPU + clone sesame/orpheus | ❌ 不移植 |
| 8-7 | MultilingualReasoning | 🚧 | GPU + 20B 权重（官方标未完成） | ❌ 不移植 |
| 8-8 | prompt-distillation | ✅ | GPU（单卡 135M 可行）+ Kimi K3 + SmolLM2 | ❌ 不移植（无 GPU） |
| 8-9 | cot-distillation | ✅ | GPU + Kimi K3（官方负结果 p=1.0） | 🔶 可做"离线版"：只做教师轨迹采集与规则过滤，不训练学生 |
| 8-10 | AdaptThink | ✅ | **8×H100 集群** | ❌ 不移植 |
| 8-11/8-12 | SFTvsRL（GeneralPoints + SpatialReasoning） | 📖 | clone 外部仓库 + 多卡 GPU | ❌ 不移植 |
| 8-13 | SimpleVLA-RL | 📖 | clone + OpenVLA + LIBERO/RoboTwin（官方称依赖锁未完整） | ❌ 不移植 |
| 8-14 | retool / verl / SandboxFusion | 📖 | clone 三仓库 + Qwen2-32B 多卡 + Docker 沙箱 | ❌ 不移植 |
| 8-15 | AWorld-train | 📖 | clone AWorld + verl + GAIA 数据集 + GPU | ❌ 不移植 |
| 8-16 | RLVP | 📖 | clone rlvp + CUDA GPU（官方称训练未运行） | ❌ 不移植 |
| 8-17 | premature-completion-dpo | ✅ | 单卡 GPU（7B LoRA，RTX PRO 6000） | ❌ 不移植（本机无 CUDA） |
| 8-18 | curly-quote-sft | ✅ | 单卡 GPU（Qwen3-8B LoRA） | 🔶 可做**数据侧**：bad case 审计与合成数据脚本，不训练 |
| 8-19 | exact-copy-sft | ✅ | 单卡 GPU（Qwen3-8B LoRA） | 🔶 同上 |

## 本机硬件事实

- Mac / darwin-arm64，**无 CUDA**，Ollama 走 Metal 后端
- 因此所有 `需 CUDA GPU` / `需多卡集群` 的实验在本机无法执行
- 官方自己在 README 里也保留了 checkpoint-free 的训练报告作为验收包，本仓库沿用同样思路：**能读懂数据流水线与验收标准，就算学会了这一章**

## 若要动手，可做的三个"不训练"切口

1. **8-9 的教师侧**（cot-distillation）：采集教师轨迹 → 规则过滤 → 统计"什么样的轨迹值得学"。这与第 5 章 5-10（代码生成）、第 6 章 Harness 讨论同源，是"数据决定成败"这一章主线最直接的体现。
2. **8-18/8-19 的数据侧**：中文弯引号作用域、exact-copy 精确复制的 bad case 审计与合成数据生成（用第 7 章 7-7 的轨迹前缀协议打标签）。
3. **第 7 章评估侧**：把 7-10 成本分析、7-8 Elo 的方法学用在本章——评估一个"训练前 vs 训练后"需要什么证据。

## 官方"第一次阅读的顺序"

1. 用**离线偏好对**理解训练希望改变的行为 → `premature-completion-dpo`
2. 检查**教师轨迹**怎样成为可用的监督数据 → `cot-distillation`
3. 结合**小模型**比较预训练 / SFT / 偏好训练的分工 → `MiniMind-pretrain`

## 跨章衔接

第 7 章负责给 bad case 打标签（首个错误、作用域、哈希、轨迹前缀回归），本章的 `curly-quote-sft` 与 `exact-copy-sft` 复用这些标签生成训练数据，并在独立边界集上回归。做本章的数据侧切口前，先做 7-7。

## 待补充

- 各实验目录（`1.` ~ `19.`，仅在有可做切口时创建）
- 数据侧实验的 README 与实测
- 第 7 章评估方法在本章的应用

> 本章尚未动手。README 只记录官方清单、硬件约束与可做的"不训练"切口，不预填结论。