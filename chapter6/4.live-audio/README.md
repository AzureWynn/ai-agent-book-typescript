# live-audio / 实时语音链路（简化版）

> Chapter 6-4 · 官方 6-5/6-6（流式/端到端语音）的本地简化教学版

← [返回第6章目录](../README.md)

## 这个实验在学什么

6-1~6-3 扩的是**时序**（何时被唤醒、怎么异步），本实验扩**模态**：录一段话 → 语音识别 → 模型应答 → 合成朗读，全链路跑通。级联架构（ASR → 文本 LLM → TTS），不是端到端语音模型。

## 快速开始

```bash
cd chapter6/4.live-audio
npm install
python3 -m venv .venv
./.venv/bin/pip install faster-whisper "av<19"   # av<19 必须，见笔记四
cp .env.example .env
npm run setup                   # 环境自检：ffmpeg / 中文音色 / whisper / Ollama
npm run offline                 # 离线臂：预置音频 → ASR → 模板 → TTS（首次下载 whisper tiny 模型 ~75MB）
npm run demo                    # 在线臂：录 5 秒 → ASR → gemma4 → say（需麦克风权限）
npm run eval                    # 双臂耗时对照表
```

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 降级点先说清：whisper tiny + macOS say，只证"级联闭环跑得通"，不证语音质量。
- 模态扩展的三笔额外成本：序列化、识别误差转语义误差、合成播报时长上限。
- 两个真坑：PyAV 19 移除参数要钉 `av<19`；snake_case 跨语言边界不映射 → 耗时变 NaN。

## 目录结构

```
src/
  setup.ts   环境自检（含 PyAV 版本检查）
  audio.ts   ffmpeg 录音 / faster-whisper ASR / say 合成 / afplay 播放
  agent.ts   语音应答 prompt（≤30 字口语化）+ 离线确定性模板
  main.ts    demo/eval 入口
output/      录音与合成音频（git 忽略）
.venv/       faster-whisper 环境（git 忽略）
```

## 核心实现讲解

- `record`：ffmpeg 从 avfoundation 默认输入录 N 秒，强制 `16000Hz mono pcm_s16le`（whisper 期望格式）。
- `transcribe`：Python 侧加载模型 → `transcribe(language, beam_size=1, vad_filter=True)`，回 JSON；TS 侧显式映射 `load_ms` → `loadMs`。
- `speak`：`say -v <中文音色> -o out.aiff`，LEF32 格式失败则退回默认格式；音色不存在时从 `say -v ?` 里挑第一个 zh_CN。
- `offlineReply`：确定性模板，把机制验证与模型能力分开。

## 实测结果（faster-whisper tiny + gemma4 + macOS say）

```
offline  你好,今天天氣怎麼樣  → 我没法查天气，要打开天气应用吗    2.11s/0ms/1.15s
online   你好,今天天氣怎麼樣  → 今天我没法查天气要不要打开天气应用看  1.72s/12.64s/1.62s
成片 3.66s，162KB
```

## 关键洞察

- 语音比文本多三笔账：采样累积、识别误差、播报时长。
- 离线臂先跑机制（LLM 列 0ms 即标记），智能后加——与 5-5 代码化规则同思路。

## 注意事项

- **macOS 专用**：`say`/`afplay` 是系统命令，Linux/容器不可直接跑。
- 需麦克风权限（系统设置 → 隐私与安全性 → 麦克风）。
- ASR tiny 识别率低且输出可能繁体；音质机械不可与云端 TTS 比。
- 首次运行下载 whisper 模型需联网。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter6`（实验 6-4/6-5/6-6）
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter6/`