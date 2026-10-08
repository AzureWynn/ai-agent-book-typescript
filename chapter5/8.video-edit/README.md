# video-edit / 自然语言视频剪辑

> Chapter 5-8 · 官方 `chapter5/video-edit` 的本地教学版（合成素材 + ffmpeg 后端）

← [返回第5章目录](../README.md)

## 这个实验在学什么

一句话剪视频：Proposer 解析需求 → 两步 Vision 定位边界 → ffmpeg 剪辑 → Reviewer 抽帧审核，不合格迭代重剪。学的是提议者—审核者闭环，不是调 Blender。

## 快速开始

```bash
cd chapter5/8.video-edit
npm install
python3 -m venv .venv && .venv/bin/pip install pillow  # 烧字用，一次
cp .env.example .env
npm run demo                    # 冲浪全链（需 Ollama 运行）
npm run eval                    # 双需求对照表（需 Ollama 运行）
```

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 无 drawtext/libass：PIL 烧字 + srt 旁路，降级点留收据。
- 粗 4 帧定区间、细 10 帧定边界，两次误差 0/0（开卷考，结论限循环跑通）。
- Reviewer 1 轮过：迭代路径未覆盖，诚实记缺。

## 目录结构

```
src/
  video.ts    合成测试片/抽帧/时长/剪辑（ffmpeg）
  agents.ts   解析 + 两步 Vision 定位 + 抽帧审核 + 边界修正
  main.ts     demo/eval 入口 + 真值误差验收（≤3s）
output/       生成物（git 忽略）
```

## 核心实现讲解

- `makeTestVideo`：4×10s 色块，PIL 中央烧字，concat 拼接，真值 `GROUND_TRUTH` 留档。
- `locate`：粗（0/10/20/30 四帧一问）→ 细（窗内每 1s 十帧一问 from/to），帧标时间顺序。
- `review`：成片 3 关键帧一问 pass/score/feedback；`reviseBounds` 备而未用（见笔记三）。

## 实测结果（gemma4 vision，Ollama 本地）

```
冲浪              [10,20]  0/0  1轮  ✓  10.0s
滑雪+Winter 字幕  [20,30]  0/0  1轮  ✓  10.0s  srt✓
```

## 关键洞察

- 定位截图必须隔离在子调用里，主上下文只收结论（省 token + 防污染）。
- 合成素材测循环、真实素材测眼力——两个结论别混。

## 注意事项

- 需 Ollama 运行（vision 能力）；ffmpeg 现成；PIL 自建 venv。
- 素材合成非实拍；字幕未烧录（srt 旁路）；迭代重剪路径未覆盖。
- 仅教学机执行。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/video-edit`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码驱动的多媒体生成一节）
