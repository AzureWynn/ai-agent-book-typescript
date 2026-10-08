# paper-to-ppt / 论文转幻灯片

> Chapter 5-6 · 官方 `chapter5/paper-to-ppt` 的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

真实论文 → 单/双 Agent 出 6 页幻灯片 → 渲染 → Vision 逐页评分。双 Agent 的价值是省上下文（每页只看片段而非全文），代价是丢全局视野。

## 快速开始

```bash
cd chapter5/6.paper-to-ppt
npm install
python3 -m venv .venv && .venv/bin/pip install pymupdf matplotlib pillow
npm run prep                       # 下载并校验 PDF（哈希 pin），抽文本裁 Figure 1
cp .env.example .env
npm run demo                       # 双臂全链（需 Ollama 运行）
npm run eval                       # 单 vs 双对照表（需 Ollama 运行）
```

PDF/裁图 git 忽略，`npm run prep` 可重建（需联网一次）。

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 本地只成立官方结论的一半：省下 2.6% 上下文，质量掉 7 分。
- 中文字体会把分打残——字体能力是 prompt 的一部分。
- 模型漏字段靠 harness 补位置；Vision 绝对值不可信，相对排序可信。

## 目录结构

```
src/
  prep.ts     下载+哈希 pin+抽文本+裁 Figure 1（可复现）
  agents.ts   单臂/双臂 + Vision 评分
  slides.ts   matplotlib 渲染（Slidev 的本地替代）
  main.ts     demo/eval 入口
paper/        哈希 pin 的 PDF、文本、Figure 1（git 忽略）
output/       渲染页 PNG + slides.json（git 忽略）
```

## 核心实现讲解

- `runSingle`：全文一次写 6 页；`runDual`：planner 出 6 项大纲 → 每页 builder 只看 2000 字片段。
- 结构兜底两处：planner 没点名架构页则指定第 4 页；builder 漏 `figure` 字段则按大纲位置回填。
- `scoreSlide`：Vision 逐页打分（标题可读 30 / 要点相关 40 / 图 30），双臂同 prompt。

## 实测结果（gemma4 vision，Ollama 本地）

```
single  1次调用  峰值8499字  Vision 95分  原图1页
dual    7次调用  峰值8279字  Vision 88分  原图1页
官方对照：质量持平 95/95，峰值上下文 24186/92601（低 73.6%）
```

## 关键洞察

- 上下文隔离省钱不保质：官方持平是因为单 Agent 本就吃满全文。
- 单 Agent 峰值的压缩空间由任务决定，不由架构决定。

## 注意事项

- 需 Ollama 运行（vision）；首次需联网取 PDF。
- 渲染字体无 CJK，幻灯片内容强制英文（这是 harness 约束，不是模型偏好）。
- Vision 评分为本地小模型，绝对分不可与官方 95 分横比。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/paper-to-ppt`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码驱动的多媒体生成一节）