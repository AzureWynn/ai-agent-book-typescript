# Chapter 4-1：主动工具发现 · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**工具太多，一次全塞给模型会撑坏；让模型缺什么、现找什么。**

```
对照组（full-inject）：33 个工具完整 schema 全进 system prompt（约 2900 tokens）
  → 小模型直接宕机：0 次调用，拒绝干活

实验组（discover）：只给 33 行名字的薄目录 + 一个 discover_tools 元工具
  → 模型声明缺口（"check today's temperature in Beijing"）
  → 系统按语义相似度返回 3-5 个候选及完整 schema
  → 新 schema 追加进历史，状态栏记名字
```

官方原版（Qwen3-4B，120+ 工具）结论很诚实：两组 3/3 完成、准确率都是 100%，**没证明准确率提升**；但实验组 schema 暴露量和用时显著更低，代价是轨迹仍有无关调用与过早结束。

## 二、三服务器直连是咋回事？

本实验不重新实现工具，直接连 4-2/4-4/4-5 三个真实 MCP 服务器：

```
4-1 Hub ──stdio──▶ perception（12 工具：文件/搜索/天气/arxiv…）
        ──stdio──▶ execution（6 工具：写文件/跑命令/…）
        ──stdio──▶ collaboration（15 工具：子Agent/HITL/通知/定时器）
统一注册表：33 个工具，来源可查
```

连通本身就是演示：MCP 的"一次开发，处处可用"——三个独立开发的服务器，一个客户端全接上，不用改它们一行代码。前提是三兄弟各自 `npm install` 过（stdio 拉起要调它们的 tsx）。

## 三、discover_tools 的检索

两档，默认语义：

```
keyword（离线）：需求词 vs "server + 工具名 + 描述" 的词面交集
  → 快、确定、但有词汇鸿沟："temperature" 撞不上描述里的任何词，
    反而 "re-check" 里的 check 误中 file_edit

semantic（默认，nomic-embed-text）：需求与工具描述的余弦相似度
  → "check today's temperature in Beijing" 直接命中 weather（0.574，
    第二名才 0.46），跨过词汇鸿沟
  → Ollama 挂了自动回退 keyword
```

topK 默认 4。词汇鸿沟那个例子说明：关键词检索的质量下限，取决于描述里有没有需求词——写工具描述时多想想调用者会怎么说。

## 四、状态栏与 allow-list

```
statusBar：已发现的工具名列表（如 [weather, arxiv_search, …]）
allow-list：没上榜的工具不许调，调了就驳回（"先 discover 再调"）
```

没有 allow-list，模型会绕过发现直接猜工具名（如 `perception.weather`）——实测发生过。allow-list 让"发现"成为必经之路，代价是模型卡住时更难自救（见下一节）。

## 五、跨服务器参数名打架

实测抓到的真问题：4-2 的读文件工具叫 `file_path`，4-4 的写文件工具叫 `path`。模型从读推理到写，原样传 `file_path`，连跪两次。

修法：在 4-4 侧接受 `path`/`file_path` 双名（schema 里写明别名），不动 4-4 已有调用。这正是官方说的框架差异问题的小型复现：**多服务器组合时，参数命名不一致是第一类故障**，修在适配层，不碰各服务器。

## 六、模型真实行为实录

gemma4 在本实验的完整行为档案（全部实测，非推演）：

```
1. 全量注入直接拒活：0 次调用，"我没有天气工具"（工具明明在列表里）
   → 小模型 + 大 schema = 指令遵循退化，官方同款现象
2. 薄目录 + 元工具：会声明缺口、会调 discover、会调到 weather 拿到 21.x°C
3. 但走不完多步链：拿到温度后不去写文件，原地打转调重复工具，最后编造"已保存"
4. 去重拦截把重复显示成 ok——展示层曾经把"跳过"画成"成功"，修显示时才发现文件从没落盘
```

教训都写进代码了：去重、提醒、干净 prompt 兜底、展示层区分 skip/ok/fail。

## 七、实测怎么读？

`npm run eval`（3 任务 × 双臂）：

```
Arm          Pass    SchemaTokens    Time
full-inject  0/3     9012            367s
discover     0/3     3374            233s
needed-tools discovered: 2/7（weather、arxiv_search 命中；订单审批链没找全）
```

读法（和官方完全同构）：
- 完成度打平（0/3 vs 0/3）——**小样本下别指望分出胜负**，官方 3/3 打平也写了"未证明"
- schema 暴露 9012→3374，降约 63%——这是确定性数字，随时可复现，不依赖模型发挥
- 检索本身部分对（weather 0.574、arxiv 命中），但 7 个必需工具只找全 2 个——发现质量本身也有缺口，不全是执行问题
- 轨迹里的无关调用与过早结束，和官方 Qwen3-4B 的毛病一模一样

## 八、本实验怎么跑

```bash
npm run demo      # T1 双臂对照（含轨迹与状态栏）
npm run eval      # 3 任务 × 双臂 + 汇总表（约 15～25 分钟）
npx tsx src/main.ts list                    # 33 工具统一目录
npx tsx src/main.ts --mode demo --keyword   # 切词法检索对照语义
```

## 九、核心代码结构

```
1.active-tool-discovery/
├── src/
│   ├── servers.ts    # 三服务器 stdio 直连 + 统一注册表 + 路由 + 收据
│   ├── discover.ts   # keyword / semantic 双档检索 + 薄目录 + token 估算
│   ├── agent.ts      # 双臂循环（去重/提醒/干净兜底/allow-list/状态栏）
│   ├── tasks.ts      # T1 天气报告 / T2 arxiv 笔记 / T3 订单审批（含文件检查器）
│   └── main.ts       # CLI（list / demo / eval）
├── workspace/        # 执行服务器落盘区（报告文件）
├── .env.example
├── package.json
└── tsconfig.json
```

## 十、关键洞察

1. **先算 token，再谈准确率**——schema 暴露量是确定性指标，完成度看模型脸色
2. **语义检索跨词汇鸿沟**——temperature 对不上任何描述词时，embedding 0.574 直接命中
3. **allow-list 让发现成为必经之路**——否则模型靠猜名字绕过
4. **多服务器第一故障是命名不一致**——`path` vs `file_path`，修在适配层
5. **展示层也会骗人**——跳过画成成功，调了三轮才发现文件从没落盘；轨迹展示要区分 ok/fail/skip

## 十一、官方正文补充要点（发现部分）

以下来自官方 book/chapter4.md，核对实现：

- **检索式预筛**：Anthropic 实测 Opus 4 从 49%→74%——本实验 keyword/semantic 双档就是它的本地版
- **MCP-Zero**：系统 prompt 零 schema，思考中声明结构化需求块，两层语义路由（服务器级→工具级），约 2800 工具省约 98% token——本实验 thin index + discover_tools 是同构小实现（arXiv:2506.01056）
- **KV Cache**：新 schema 追加到历史末尾、前缀保持稳定——本实验动态 schema 追加实现的就是这个（静态 thin index 一直在最前）
- **降级路径**：两层匹配都低于阈值就明确说"没找到"——本实验 keyword 零命中返回空列表，不硬凑

## 十二、常见问题

- **eval 跑一次 15～25 分钟**：6 轮完整 Agent × Ollama 本地推理，正常；只看机制跑 `--mode demo`（T1 一题）。单次调用超 240s 按失败计，避免无限 hung（`OLLAMA_CHAT_TIMEOUT_MS` 可调）
- **两臂都 0/3**：正常，这是小模型链式执行力问题；看 token/检索/轨迹三项确定性指标
- **semantic 回退到 keyword**：nomic-embed-text 没拉或 Ollama 没起；`ollama pull nomic-embed-text`
- **兄弟服务器连不上**：去 2./4./5. 目录各跑一次 `npm install`
- **报告文件去哪了**：本实验 `workspace/`（执行服务器的 EXECUTION_ROOT 指过来）
