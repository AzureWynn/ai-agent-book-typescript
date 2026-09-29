# multimodal-agent / 多模态三种范式对比

> Chapter 4-3: 原生多模态 vs 提取为文本 vs 工具化分析，看保真度、成本与灵活性
> 对应《AI Agent 开发实战》第 4 章实验 4-3

← [返回第 4 章目录](../README.md)

## 这个实验在学什么

对应官方实验 4-3：**多模态三种范式对比**。本仓库为 **TypeScript 实现**：手写 SVG 柱状图样例（精确季度数字只在柱子几何里，文字报告只给定性描述），同一问题走三条路——提取为文本（测几何→制表→gemma4 作答）、工具化分析（`list_quarters`/`read_bar` + Ollama 循环，支持 follow-up）、原生多模态（缺光栅图与视觉模型，诚实 blocked）。

## 快速开始

```bash
npm install
npm run demo      # Q1 走三条路（含 Q2/Q3 follow-up）
npm run eval      # 三问 × 三范式对照表
```

换查询：

```bash
npx tsx src/main.ts --mode demo --query "What was Q2 revenue, exactly?"
```

## 教学笔记

更详细的讲解（样例设计、几何测量、工具循环三件套、原生门控、官方正文补充）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
3.multimodal-agent/
├── assets/
│   ├── sample_chart.svg   # 柱状图：精确值只在几何里，无数值标签
│   └── sample_report.md   # 定性文字：无精确数字
├── src/
│   ├── chart.ts      # SVG 几何测量（刻度定标 + 柱高换算）
│   ├── paradigms.ts  # 三范式：extract / tools（去重提醒兜底）/ native（门控）
│   ├── config.ts     # OLLAMA_MODEL / VISION_MODEL
│   └── main.ts       # CLI（demo / eval）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 测几何不是读标签（chart.ts）

SVG 里没有数值可抄：读 Y 轴刻度定比例尺（80M ÷ 240px），量柱顶 y 坐标换算。刻度文字必须落在精确位置——实测偏 3px 导致全体偏高 1.0，修过一次。

### 2. 工具循环三件套（paradigms.ts）

去重（同工具同参只执行一次）、提醒（无进展时推一把去量柱子）、最终作答兜底（用收集的工具输出重起干净 prompt，不复用循环历史——复用实测会答空）。`temperature: 0` 降抖动。

### 3. 原生双门控（paradigms.ts）

`VISION_MODEL` 未设置直接 blocked；设了也还缺 PNG 光栅（仓库只有矢量 SVG，不引入光栅化依赖）。两道门都写明，不编造视觉输出。

## 实测结果

`npm run eval`（gemma4，Q1 最高+精确值 / Q2 精确值 / 是否逐季涨）：

```
Paradigm        Q1 exact   Q2 exact   Q3 no-dip
extract-to-text   ✓         ✓         ✓
tool-based        ✓         ✓         ✓
native            — (blocked)
```

`npm run demo`：提取法一次过（Q4 63.2M）；工具法量完四根柱子作答正确，follow-up（Q2 vs Q3）按需再量；原生缺席但理由写清。

**解读**：提取便宜（一次测量 + 一次问答），工具灵活（follow-up 主场）但调用多；原生保真上限最高，本环境无条件验证。精确值必须来自测量——这正是样例设计的用意。

## 关键洞察

1. **可测性来自样例设计**——精确值只放图里，三条路才分得开
2. **提取精度 = 测量精度**——3px 偏移 per 所有数字
3. **工具循环三件套**：去重、提醒、干净 prompt 兜底
4. **先查代码再疑模型**——空证据、错几何，99% 在自己这侧
5. **blocked 也是结论**——没条件直说（4-2 凭据诚实原则的延续）

## 注意事项

- `demo`/`eval` 的 extract/tools 两路需要 Ollama 运行 + `gemma4:latest`；native 恒 blocked（见上）
- 换 SVG 样例须守规范：`class="bar"` 的 rect、`data-quarter` 属性、x=55 的刻度文字
- 报告文字禁止出现精确数字，否则对照失效
- 视觉模型与光栅化以后补上只需动 `answerNative` 的门，不碰另两条路
- Ollama 调用无超时保护，hang 住直接 Ctrl-C（4-1 同类问题已加 240s 熔断，可参照）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[multimodal-agent](https://github.com/bojieli/ai-agent-book/tree/main/chapter4/multimodal-agent)
- 官方正文：[book/chapter4.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)（多模态三路径、token 账）
