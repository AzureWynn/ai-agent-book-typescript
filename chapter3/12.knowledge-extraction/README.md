# knowledge-extraction / 隐性知识提取

> Chapter 3-12: 判例因子发现 → 结构化抽取 → 原型聚类 → 对话式量刑建议
> 对应《AI Agent 开发实战》第 3 章实验 3-12

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-12：**从结构化数据中提取隐性知识**。本仓库为 **TypeScript 实现**，纯标准库、完全离线（gemma4 只用于可选的发现对比与话术）：21 条合成判例（盗窃/伤害/诈骗 × 7，量刑公式透明写在 `data.ts`），走通四段流水线——规则自由归纳因子 → 照 schema 抽取 → 各罪名内 KMeans（k 由轮廓系数选）→ 按全局重要性追问、匹配最近原型给建议。

## 快速开始

```bash
# demo/eval 无需 Ollama，无需 API Key，纯离线
npm install
npm run demo      # 发现→抽取→聚类→对话，全流程追踪
npm run eval      # 抽取准确率 + 原型表 + 自查覆盖率

# 可选（需 Ollama + gemma4）
npx tsx src/main.ts --mode discover --llm-discover  # gemma4 自由归纳，对比规则版
npm run answer    # gemma4 把结构化结论讲成人话
```

## 教学笔记

更详细的讲解（为什么因子不预设、100% 准确率是什么意思、one-hot 与 ln 的道理、覆盖率为什么是乐观估计）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
12.knowledge-extraction/
├── src/
│   ├── types.ts       # Charge / GoldFactors / Archetype / AdviseResult
│   ├── data.ts        # 21 条合成判例 + 透明量刑公式（含噪声）
│   ├── discovery.ts   # 规则自由归纳 + 归并成 core/extensions schema
│   ├── discover-llm.ts# gemma4 自由归纳 + 与规则版覆盖度对比（可选）
│   ├── extractor.ts   # 规则抽取 + 适用因子 + 准确率（null 语义一致）
│   ├── features.ts    # one-hot / ln / 标准化
│   ├── kmeans.ts      # 确定性 KMeans + 轮廓系数（seed 固定）
│   ├── archetypes.ts  # 各罪名聚类 + 全局重要性 + 定义性因子
│   ├── advisor.ts     # 解析→按重要性追问→已知维度匹配→模板建议
│   ├── answer.ts      # gemma4 话术（可选，只解释数字不发明数字）
│   ├── config.ts      # OLLAMA_BASE_URL / OLLAMA_MODEL
│   └── main.ts        # CLI（demo / eval / answer / discover）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 因子发现（discovery.ts）

关键词线索扫描算"自由归纳"（教学代理），归并规则固定：三罪名共有的进 `core`，其余按罪名进 `extensions`。`--llm-discover` 让 gemma4 同一批案情自由列因素，实测覆盖规则版 11/11——两边对得上，规则代理才可信。

### 2. 结构化抽取（extractor.ts）

只抽"核心 + 本罪名扩展"，未提及返回 `null`。准确率只在适用因子上比（`applicableFactors`），`null` 与缺键语义统一——这是之前修过一次的坑。

### 3. 聚类与重要性（kmeans.ts + archetypes.ts）

KMeans 确定性实现（mulberry32 固定种子），k=2~3 按轮廓系数选。全局重要性 = 簇间方差占比；原型定义性因子 = 簇心 z 分数。刑期区间用 `[min, max]`（n≤3 时分位数插值无意义，也是修过一次的坑）。

### 4. 对话建议（advisor.ts）

缺什么按全局重要性问；匹配只看已知维度（未知的不参与距离）；建议模板引用原型统计 + 强制免责声明。

## 实测结果

`npm run eval`（21 条合成判例）：

```
Extraction accuracy: 154/154 = 1.000（自洽性检查：生成与抽取同源）
[盗窃罪] k=3 silhouette=0.286：低(12m) / 中(19m) / 高(73m)
[故意伤害罪] k=3 silhouette=0.064：轻(1m) / 较轻(7.5m) / 重(39m)
[诈骗罪] k=3 silhouette=0.342：轻(15m) / 中(47.5m) / 重(75.5m)
In-sample coverage: 19/21 = 0.905（乐观估计，原型就是用这些案子建的）
```

`npm run demo`（盗窃案缺金额）：识别罪名 → 追问赔偿 → 补全后匹配 theft#0（中位 12 月，距离 0.00）→ 模板建议 + 免责声明。

**解读**：100% 是生成-抽取同源的自洽性，不是发现质量；0.064 的轮廓系数诚实记录小样本弱聚类；覆盖率是自查不是验收（真验收要留出法）。

## 关键洞察

1. **因子不预设**——LLM 版 11/11 复现规则版，代理才可信
2. **抽取 100% 别误读**——验证实现正确，不验证发现质量
3. **分类因子 one-hot**——编码不能偷渡顺序假设
4. **k 让轮廓系数选**——弱聚类诚实记录，不 cherry-pick
5. **刑期数字只出来源统计**——模型解释，不发明

## 注意事项

- `demo`/`eval` 完全离线；只有 `--llm-discover` 与 `answer` 需要 Ollama + `gemma4:latest`
- 规则抽取处理不了否定句（"无前科"含"前科"），语料已避开；生产用 LLM 抽取
- 小样本下重要性大量饱和到 1.00，看排序别看小数
- **任何输出都不构成法律意见**：合成数据、简化因子、玩具聚类——三重简化，仅演示范式

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[structured-knowledge-extraction](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/structured-knowledge-extraction)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
