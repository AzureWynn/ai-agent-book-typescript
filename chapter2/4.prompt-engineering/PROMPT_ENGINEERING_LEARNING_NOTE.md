# 提示工程消融实验 —— 教学笔记

> 本笔记对应实验 2-4（提示工程消融实验）。
> 核心目标：**验证"怎么写提示词"到底有多重要。**

---

## 一、这个实验在干什么？

一句话：**把 Agent 当成"新员工"，测试不同"培训方式"对工作表现的影响。**

实验设定了一个航空订票场景，让 Agent 帮人订机票、订酒店、取消订单。然后通过 6 种不同的提示词方案（称为"臂"）来测试：

- 哪种语气最好？
- 规则手册怎么写才有效？
- 工具说明重不重要？

**方法：控制变量法。** 每次只改一个维度，其余保持不变，看看成功率怎么变化。

---

## 二、实验场景

### 设定

Agent 是一个航空订票助手，有 6 个工具：

- `search_flights`（搜航班）
- `book_flight`（订机票）
- `search_hotels`（搜酒店）
- `book_hotel`（订酒店）
- `get_carrier_info`（查航空公司）
- `cancel_booking`（取消订单）

### 5 个测试任务（都藏了"陷阱"）

| 任务 | 表面需求 | 陷阱（需要遵守规则） |
|------|---------|---------------------|
| t1 订 UA 7 月航班 | 找便宜的 UA 航班 | UA 7 月航班**必须**是 refundable（可退款的） |
| t2 查行李 | 查行李政策 | 必须先调 `get_carrier_info` 查，再订 |
| t3 带小孩订酒店 | 找便宜酒店 | 必须 4 星以上 |
| t4 取消并重新预订 | 取消后重订 | 需要正确处理取消流程 |
| t5 最便宜选项 | 找最便宜的 | 必须满足其他所有规则的前提下才选最便宜的 |

**这些陷阱的设计目的：** 测试 Agent 是否真的读懂了指令。如果只看表面需求，Agent 会选便宜的 UA1234（非 refundable），但正确做法是选更贵的 UA5678（refundable）。

### 评分标准

- 客观判定：只看 Agent 的**工具调用序列**，不看模型说了什么
- 每个任务 0 或 1（对/错）
- 5 个任务都对了 = 100% 成功率

---

## 三、6 个臂（实验组）

### 对照组

```
baseline（基准组）
├── 语气：专业正常
├── 策略手册：清晰编号的规则列表
├── 工具描述：完整
└── 预期：表现最好
```

### 消融组（每次只改一个维度）

| 臂 | 改了啥 | 具体内容 |
|----|--------|---------|
| `tone_trump` | 语气变夸张 | "You are the GREATEST travel assistant in HISTORY!" |
| `tone_casual` | 语气变随意 | "hey!! ur travel bud, so like, lets get u booked!!" |
| `wiki_random` | 策略手册变混乱 | 去编号、改写模糊化、混入 5 条废话、打乱顺序 |
| `no_tool_desc` | 工具说明删掉 | 所有工具的 `description` 字段置空 |
| `all_ablations` | 三者同时改 | 随意语气 + 混乱手册 + 无工具说明 |

### 三个维度都长在提示词里

这三个消融维度，**全部是喂给模型的文本**，只是位置和作用不同：

```
system prompt = [语气] + [策略手册（规则）] + [工具说明]
```

| 维度 | 在提示词里的位置 | 作用 | 例子 |
|------|------------------|------|------|
| **语气** | 开头 | 告诉模型"用什么样的口吻说话" | "You are a professional assistant" |
| **规则** | 中间 | 告诉模型"什么能做什么不能做" | 5 条航空公司策略编号列表 |
| **工具说明** | 工具 schema | 告诉模型"每个工具是干嘛的、参数是什么" | `search_flights: Search available flights...` |

**所以这个实验的本质是：同一颗大脑（模型），喂给它不同的说明书，效果差多少？**

---

### 规则（策略手册）具体是什么？

**正常版（NORMAL_WIKI）**——5 条清晰规则：

```
TRAVEL POLICY - follow strictly:
1. United (UA) flights departing in July MUST be booked with the refundable fare.
2. When the user requests a DIRECT flight, never book a flight with a layover.
3. When the user is traveling with children, hotel bookings must be 4-star or above.
4. When the user asks about checked baggage, call get_carrier_info before booking.
5. When the user asks for the cheapest option, book the cheapest flight that still satisfies the other requirements.
```

**随机化版（RANDOMIZED_WIKI）**——同样的意思，但变成了：

```
Travel considerations vary, though carriers generally appreciate schedule flexibility.
Some experienced bookers prefer morning departures regardless of other factors.
It has been observed in various contexts that certain fare options carry fewer restrictions...
Most passengers enjoy window seats, and polite agents often mention this.
...（共 8 条，含 5 条废话）
```

**变化了什么：**

| 变化 | 正常版 → 随机版 | 为什么致命 |
|------|----------------|-----------|
| 编号 | 1-5 编号 → 无编号 | 失去优先级和逻辑关系 |
| 语气词 | "MUST"、"never" → "generally appreciate" | 必须遵守变成"一般建议" |
| 废话 | 无 → 混入 5 条无关内容 | 真假规则混在一起 |
| 顺序 | 逻辑排列 → 打乱 | 无法从上下文推断核心规则 |

**大白话：** 就像公司把员工手册的编号全删了，把"必须戴安全帽"改成"一般建议大家注意安全"，再混入 5 条茶水间闲聊。员工根本分不清什么是真规定。

---

## 四、结果解读

```
Experiment                        成功率
─────────────────────────────────────────
baseline          100%  ✅  清晰指令 + 结构化手册 + 完整文档
tone_trump        100%  ✅  语气夸张，但不影响决策
no_tool_desc      100%  ✅  工具名自解释，模型能猜对
tone_casual       80%   ⚠️  语气太随意，偶尔犯错
wiki_random       60%   ❌  规则手册混乱，Agent 理解不了
all_ablations     60%   ❌  三者同时改，最差
```

### 每个结果意味着什么

#### `baseline` 100% ✅

专业提示词 + 结构化规则 + 完整工具说明 = Agent 完美完成任务。

这是"好员工培训"的标准：清晰的操作手册、明确的工具使用说明。

#### `tone_trump` 100% ✅

系统提示改成："You are the GREATEST travel assistant in HISTORY! Book! Book! Book!"

**结论：语气夸张但任务还是完成了。语气不影响正确性。**

大白话：就算老板用"你是最牛的！冲！"来鼓励员工，员工该干嘛还是干嘛。

#### `no_tool_desc` 100% ✅

所有工具描述字段被删空，Agent 只看到工具名（如 `search_flights`）。

**结论：工具名和搜索结果自解释，模型能猜对工具用途。**

大白话：即使没有说明书，员工看到工具名字叫"搜航班"，也知道怎么用。但这是本实验的特殊情况——在更复杂的工具场景下，没有描述会出问题。

#### `tone_casual` 80% ⚠️

系统提示改成："hey!! ur travel bud, so like, lets get u booked!!"

**结论：语气太随意，偶尔导致任务失败（t5 最便宜选项没遵守规则）。**

大白话：朋友间聊天式语气，模型偶尔会放松警惕，漏掉规则。

#### `wiki_random` 60% ❌

策略手册被打乱成：
```
Travel considerations vary, though carriers generally appreciate schedule flexibility.
Some experienced bookers prefer morning departures regardless of other factors.
It has been observed in various contexts that certain fare options carry fewer restrictions when...
Most passengers enjoy window seats, and polite agents often mention this.
```

**结论：去编号 + 模糊化 + 混入废话 = Agent 根本不知道哪条是真规则。**

大白话：把员工手册的所有编号删掉、规则改写得含糊不清、混入 5 条无关废话。员工根本分不清什么是必须遵守的规则，什么是无关信息。

#### `all_ablations` 60% ❌

随意语气 + 混乱手册 + 无工具说明，三者叠加。

**结论：最差，和 wiki_random 一样差——说明"混乱手册"是最大的问题。**

大白话：一个新员工拿到一本模糊的手册，没有工具说明，老板还用随意语气跟他说话。这基本上没法工作了。

---

## 五、核心结论（5 条）

| # | 结论 | 一句话 |
|---|------|--------|
| 1 | **清晰指令至关重要** | 规则要编号、要明确、要可操作 |
| 2 | **上下文组织影响理解** | 结构 > 语气（手册乱 40% vs 语气变 0-20%） |
| 3 | **工具文档不可或缺** | 在复杂场景下，描述决定能否正确使用工具 |
| 4 | **语气只是锦上添花** | 夸张或随意不影响主要任务，但太随意有小风险 |
| 5 | **组合消融不会恢复** | 多个坏习惯叠加不会互相抵消，只会更差 |

---

## 六、最关键的洞察

**结构 > 语气。**

这可能是全书最重要的提示工程原则：

- 把规则手册从"清晰编号"改成"模糊散文"，成功率从 100% 掉到 60%（**掉 40%**）
- 把语气从"专业"改成"夸张"，成功率从 100% 保持 100%（**掉 0%**）
- 把语气从"专业"改成"随意"，成功率从 100% 掉到 80%（**掉 20%**）

所以：**花时间组织好上下文结构，比花时间选语气重要得多。**

---

## 七、延伸思考

1. **为什么 `no_tool_desc` 没有退化？**
   - 因为本实验的工具名自解释性强（`search_flights` 就是搜航班）
   - 如果工具名是 `fn_0047`，没有描述就会出大问题
   - 这是实验的局限，不代表"工具描述不重要"

2. **`wiki_random` 为什么影响这么大？**
   - 去编号 → 规则之间失去逻辑关系
   - 模糊化 → Agent 无法判断哪些规则必须遵守
   - 混入废话 → Agent 浪费 token 在无关信息上，还可能混淆真假规则
   - 这是真实场景的缩影：很多公司的文档就是这样乱的

3. **n=5 够吗？**
   - 不够。每个臂只有 5 个任务，随机性大
   - 官方建议多跑几次取平均
   - 但方向性信号是明确的：结构 > 语气

---

## 八、产出文件说明

运行 `npm run all` 后生成：

| 文件 | 内容 |
|------|------|
| `runs/ablation_*.json` | 全部 30 条轨迹（6 臂 × 5 任务 × 工具调用序列 + reward） |
| `runs/report.html` | 可视化页面（成功率条形图 + 每任务明细） |

---

## 九、快速验证清单

```bash
# 1. 跑全部 6 个臂
npm run all

# 2. 只跑基准组
npm run run -- --arm baseline

# 3. 离线看报告（不需要重新跑模型）
npm run report

# 4. 打开可视化页面
open runs/report.html
```

**看完报告问自己：哪个臂最差？为什么？哪个臂改动影响最大？**

答案在成功率对比表里。
