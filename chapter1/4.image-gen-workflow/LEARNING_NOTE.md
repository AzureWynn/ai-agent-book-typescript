# Chapter 1-4：文生图工作流 vs 原生图像生成 · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**同一句口语化需求走两条路线，对照"工作流（改写→生图）"与"原生（直接出图）"的差异。**

本仓库是本地仿真：改写节点用 Ollama，生图节点是可插拔接口（默认占位实现）。

```
工作流路线 workflow：
  口语化需求 → 节点1: 提示词改写 LLM（输出 SD 风格 JSON）
            → 节点2: 文生图模型（可插拔，默认占位）→ 图片

原生路线 native：
  口语化需求 → Gemini 3 Pro Image / GPT-Image 2 → 图片
```

## 二、改写节点做的是"翻译"不是"决策"

改写节点把自然语言适配成文生图模型能消化的输入。两个考察维度：

| 需求类型 | 考察点 | 例子 |
|---|---|---|
| 具体需求 | **忠实度**——改写会不会弄丢/篡改用户给定信息 | "风格丧一点" → 会不会丢"丧"？ |
| 宽泛需求 | **信息增益**——改写替用户想象了什么画面 | "AGI 实现后的程序员" → 具象化成什么样？ |

## 三、核心实现

### 1. 改写节点（rewriter.ts）

系统提示词要求模型只输出一个 JSON 对象：

```json
{ "prompt": "...", "negative_prompt": "...", "style_notes": "..." }
```

`parseRewriteOutput` 容忍 ```json 代码围栏和前后多余文字（对应官方同函数）。

### 2. 生图节点可插拔（image-generator.ts）

```ts
export interface ImageGenerator {
  readonly name: string;
  generate(prompt: string, negativePrompt: string): Promise<GeneratedImage>;
}
// 默认 PlaceholderGenerator：不真出图，记录 prompt + 模拟元数据
// 接入真实现：实现 ImageGenerator 接口，在 createImageGenerator 注册即可
```

**为什么可插拔？** 教学价值在"工作流编排 + 改写行为"，不依赖真图。以后有生图后端时填一个实现类即可，流程代码不用动。

### 3. 工作流编排（pipeline.ts）

```ts
const rewrite = await rewritePrompt(requirement);       // 节点 1
const image = await generator.generate(rewrite.prompt,  // 节点 2
                                       rewrite.negative_prompt);
```

每次节点调用都记录到 `nodes`，便于对照分析。

## 四、对照观察（main.ts 的自动分析）

```ts
if (req.category === 'specific') {
  // 具体需求 → 考察忠实度：关键词正则检查改写后的 prompt 有没有保留关键细节
  const ok = req.keyRegex?.test(result.rewrite.prompt) ?? false;
} else {
  // 宽泛需求 → 考察信息增益：直接展示 style_notes
}
```

> 注意：这是**启发式检测**（按关键词判断），LLM 改写输出每次略有差异，偶尔可能误报/漏报，适合教学展示，不适合当严谨评测。

## 五、实测结果（gemma4 真实改写）

| 需求 | 类别 | 改写后的关键行为 | 自动检查 |
|---|---|---|---|
| 周末加班的程序员，风格丧一点 | specific | "丧"→ `melancholic` / `lo-fi aesthetic` / `cyberpunk melancholy`，用"深夜 + 屏幕冷光"烘托压抑（**保留**情绪，但换更专业的 SD 词） | 保留"丧": **true** |
| 窗台绿植，早晨阳光 | specific | 阳光→ `golden hour` / `volumetric light rays` / `sun dappling`（保留细节 + 增强光影术语） | 保留"早晨阳光": **true** |
| 降噪耳机海报 | specific | 文案→ `dark moody atmosphere` / `minimalist aesthetic` / `product advertisement` | 保留"深夜清净+简约": **true** |
| AGI 实现后的程序员 | broad | **具象化**为"极简未来办公室 + 全息界面 + 超维数据可视化" | 信息增益: style_notes 展示 |
| 未来城市的早晨 | broad | **具象化**为"golden hour 日出 + 晨雾 + 电影级超写实科幻" | 信息增益: style_notes 展示 |

**对照结论（实验的核心发现）：**
- **具体需求**：改写**忠实**——用户明确信息被翻译保留，但会用更专业的 SD 术语表达（"丧"→ melancholic），这是"翻译"的代价，也是忠实度考察的难点
- **宽泛需求**：改写**具象化**——替用户想象了大量画面细节，这是原生路线直接出图所没有的"叙事性"

## 六、核心结论

1. **改写节点是"翻译"不是"决策"**：把口语需求转成文生图模型能消化的输入
2. **具体需求看忠实度，宽泛需求看信息增益**：两个考察维度
3. **翻译有代价**：用户口语词被换成专业 SD 术语（忠实但不逐字）
4. **可插拔接口是好设计**：核心流程代码写死，生图后端可替换
5. **启发式检测只适合教学**：关键词正则判断忠实度会误报，严谨评测要另想办法

## 运行命令

```bash
npm install
npm run workflow               # 全部 5 句需求跑工作流路线
npm run workflow -- <id>       # 跑指定需求
npm run rewrite -- "一句话"    # 只测改写节点
```

## 自测题

1. 为什么"具体需求"考察忠实度，而"宽泛需求"考察信息增益？
2. 改写节点把"丧"换成 "melancholic"，算弄丢信息还是算翻译？
3. 如果接真实生图 API，需要改哪些代码、哪些不用改？
