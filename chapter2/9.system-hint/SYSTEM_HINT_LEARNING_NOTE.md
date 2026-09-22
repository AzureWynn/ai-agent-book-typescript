# Agent 状态栏（System Hint） —— 教学笔记

> 本笔记对应实验 2-9（几种好用的 Agent 状态栏技术）。
> 核心目标：**让 Agent 每轮都"看得见"最新状态，但又不会"背在历史里"。**

### 消息的四种角色（背景知识）

在理解状态栏之前，先了解 API 层面的消息结构：

| 角色 | 谁写的 | 什么时候出现 | 例子 |
|------|--------|-------------|------|
| **system** | 开发者 | 对话开始时（1条） | "你是助手。使用工具前先思考。" |
| **user** | 用户 | 用户输入时 | "帮我查天气" |
| **assistant** | 模型 | 模型回复时 | "让我查一下..." + tool_calls |
| **tool** | 框架 | 工具执行后 | 工具返回的结果 |

```
完整消息列表：
[messages] = [system] + [user, assistant, tool, assistant, tool, ...]
```

**关键理解：**
- system 消息固定在最前面 → Chat Template 将其转换为固定 token 序列 → KV Cache 命中
- user / assistant / tool 消息按顺序增长 → 消息列表越来越长 → 上下文膨胀

状态栏的本质就是在 user 消息列表末尾**临时追加**一条消息，而不修改 system 或 history。

---

## 一、这个实验在干什么？

一句话：**给 Agent 挂一个"便利贴"，每轮开始前告诉它你现在在哪、做了什么、还剩什么。**

问题场景：

```
Agent 正在做一个 5 步任务：
第 1 步：读取配置 ✅
第 2 步：分析数据... 
第 3 步：输出报告（还没开始）

现在的问题是：模型在每轮对话中，只能看到对话历史。
它不知道"现在是第几轮"、"上次调了什么工具"、"有没有出错"。
```

传统做法：把状态写进对话历史。
- 问题：历史越来越长，模型"背着"所有过去的信息，注意力被稀释

本实验的做法：**状态栏 = 每次调用 LLM 前临时注入一条消息，用完即弃。**

```
第 1 轮调用 LLM：
  [历史] + [临时状态栏："当前时间、工具计数=0、TODO 列表空"] → LLM
  ↓ LLM 返回工具调用

第 2 轮调用 LLM：
  [历史] + [临时状态栏："时间、工具计数=1、TODO 1个 pending"] → LLM
  ↓ LLM 返回工具调用

第 3 轮调用 LLM：
  [历史] + [临时状态栏："时间、工具计数=2、TODO 1个 in_progress"] → LLM
```

**状态栏不进历史！** 每次重新构造，用完即弃。

---

## 二、状态栏长什么样？

```
=== SYSTEM STATUS（状态栏，仅本轮有效，不是对话内容）===
Time: 2026-09-21 16:27:41
CWD: /Users/laters/work/web3/ai-agent-book/chapter2/9.system-hint
Platform: darwin arm64

=== TOOL CALLS ===
read_file: 3 次
run_command: 5 次
注意: run_command 已被多次调用。若未取得进展，请停止重试，改用其他方法或直接总结。

=== TODO LIST ===
  [1] ✅ 读取配置 (completed)
  [2] 🔄 分析数据 (in_progress)
  [3] ⏳ 输出报告 (pending)

=== LAST ERROR ===
tool=run_command args={"command":"run-tests"}
error=sh: run-tests: command not found
suggestion=命令不存在，检查拼写或用 read_file 查看说明
```

**大白话：** 就像员工桌上的一张便利贴，写着"现在是几点、做了几件事、下一件做什么、上次哪里出错了"。

---

## 三、五种技术

### 1. 时间戳

```
Time: 2026-09-21 16:27:41
```

**作用：** 让模型知道"现在是几号"，避免跨天场景混淆。

**类比：** 没有时钟的员工不知道今天周几，可能用昨天的策略处理今天的问题。

**关掉：** `--no-timestamps`

---

### 2. 工具调用计数器

```
=== TOOL CALLS ===
run_command: 5 次
注意: run_command 已被多次调用。若未取得进展，请停止重试，改用其他方法或直接总结。
```

**作用：** 防止 Agent 死循环——同一个工具反复调用却不解决问题。

**类比：** 就像工厂机器连续报警 5 次还没修好，主管说"停了吧，换个方法"。

**关掉：** `--no-counter`

---

### 3. TODO 列表

```
=== TODO LIST ===
  [1] ✅ 读取配置 (completed)
  [2] 🔄 分析数据 (in_progress)
  [3] ⏳ 输出报告 (pending)
```

**作用：** 复杂任务不迷路——知道"做了啥"、"正在做啥"、"待做啥"。

**类比：** 项目管理软件看板。员工一眼看到自己处于哪个阶段。

**关掉：** `--no-todo`

---

### 4. 详细错误

```
=== LAST ERROR ===
tool=run_command args={"command":"run-tests"}
error=sh: run-tests: command not found
suggestion=命令不存在，检查拼写或用 read_file 查看说明
```

**作用：** 失败后给修复建议，而不是让模型"盲猜"。

**类比：** 机器报错"代码 E001：螺丝没拧紧"而不是只显示"错误"。员工知道怎么修。

**关掉：** `--no-errors`

---

### 5. 系统状态感知

```
Time: ...  CWD: /path/to/project  Platform: darwin arm64
```

**作用：** 让模型知道"我在哪个目录"、"什么操作系统"。

**类比：** 外地员工来公司，不知道打印机在哪、路径怎么写。状态栏就是"当前位置"。

**关掉：** `--no-state`

---

## 四、核心机制：状态栏不进历史

```
传统做法（状态写进历史）：
第 1 轮：[系统提示][用户消息][状态栏] → LLM
第 2 轮：[系统提示][用户消息][状态栏][LLM回复][状态栏更新] → LLM
第 3 轮：[系统提示][用户消息][状态栏][回复][状态栏][状态栏更新] → LLM
                                                    ↑ 越来越长！

本实验做法（状态栏临时注入）：
第 1 轮：[系统提示][用户消息] + [临时状态栏] → LLM
第 2 轮：[系统提示][用户消息] + [临时状态栏] → LLM
第 3 轮：[系统提示][用户消息] + [临时状态栏] → LLM
           ↑ 每次都一样短，状态栏用完即弃
```

**关键代码：**
```ts
// 每轮重新构造消息，状态栏加在末尾
const statusHint = { role: 'user', content: buildStatusBar(config, state) };
const messages = [...history, statusHint];
const response = await chatOnce(messages);
// ↓ 下轮重新构造，状态栏总是最新的
```

**大白话：** 就像每天早上给你的便利贴写新内容，而不是把每天的便利贴都贴墙上。

### 对比：为什么 dynamic_system 会破坏 KV Cache 而 System Hint 不会？

两种做法看起来都是在"每轮加新内容"，但改的位置完全不同：

```
❌ dynamic_system（KV Cache 反模式）：
   system prompt: "你是助手。[generated_at: 2026-09-21T10:00:00Z]"
   → 时间戳写进 system prompt 本身 → 每轮不同 → KV 全部失效
   → history 也被污染

✅ System Hint（本实验）：
   system prompt: "你是助手。A SYSTEM STATUS block is appended..."  ← 固定
   history:      [...original...]          ← 不变
   临时 user 消息: "=== SYSTEM STATUS ===\nTime: ..."         ← 每轮新
   → 前缀命中缓存，只有 ~200 token 状态栏新计算
```

**代码层面：**

```ts
// ❌ dynamic_system：改的是 system prompt 本身
private systemPrompt(iteration: number): string {
    return `${SYSTEM_PROMPT}
[generated_at: ${new Date().toISOString()}]`;
}

// ✅ System Hint：system prompt 不变，状态栏是临时 user 消息
const statusHint = { role: 'user', content: buildStatusBar(config, state) };
const messages = [...this.history, statusHint];  // 不写入 this.history
```

**核心区别：**

| | 改 system prompt | 追加临时 user 消息 |
|---|---|---|
| system prompt 内容 | 每轮不同 | 固定不变 |
| history | 被污染 | 不变 |
| KV Cache | 全部失效 | 只算新 token |
| 本质 | 改旧元素 | 加新元素 |

**messages 数组的变化：**

```
dynamic_system：改原有 system prompt 对象的 content
  [{ role: 'system', content: '旧内容' }]
  → [{ role: 'system', content: '新内容（含时间戳）' }]   ← 改旧

System Hint：  在 messages 末尾追加一条新 user 消息
  [...history, { role: 'system', content: '固定' }]
  → [...history, { role: 'system', content: '固定' }, { role: 'user', content: '状态栏' }]  ← 加新
```

---

## 五、什么时候需要状态栏？

```
┌──────────────────────────────────────────────┐
│              需要状态栏的情况                    │
├──────────────────────────────────────────────┤
│                                                │
│  ✅ 多步任务（5 步以上）                        │
│     → 不知道到哪一步了                         │
│                                                │
│  ✅ 可能死循环（反复调同一个工具）               │
│     → 不知道已经试了多少次                     │
│                                                │
│  ✅ 工具可能失败（命令不存在、文件不存在）       │
│     → 不知道上次为什么失败                     │
│                                                │
│  ✅ 跨长时间运行（跨小时/跨天）                  │
│     → 不知道现在几点                           │
│                                                │
│  ✅ 复杂任务需要聚焦（多个子任务并行）            │
│     → 不知道哪个在做、哪个做完                 │
│                                                │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              不需要状态栏的情况                  │
├──────────────────────────────────────────────┤
│                                                │
│  ❌ 单轮任务（一句话就搞定）                     │
│                                                │
│  ❌ 简单对话（不需要跟踪状态）                   │
│                                                │
│  ❌ 强模型 + 简单任务（模型自己知道）            │
│                                                │
└──────────────────────────────────────────────┘
```

### 底层原理：为什么用"临时 user 消息"而不是改 system prompt？

从 Chat Template 和消息结构的角度解释：

```
API 的消息结构（4 种角色）：

  { role: "system",    content: "固定规则" }   ← 开发者写，放在最前面
  { role: "user",      content: "用户输入" }   ← 用户发
  { role: "assistant", content: "模型回复" }   ← 模型回
  { role: "tool",      content: "工具结果" }   ← 框架回

Chat Template 转换后：
  <|im_start|>system
固定规则
<|im_end|>
  <|im_start|>user
用户输入
<|im_end|>
  <|im_start|>assistant
模型回复
<|im_end|>
  <|im_start|>tool
工具结果
<|im_end|>
```

```
如果改 system prompt：
  <|im_start|>system
[旧内容]    → KV Cache 命中
  <|im_start|>system
[新内容]    → token 序列变了 → 从这个位置开始全部重算

如果在末尾追加 user 消息：
  [...system, ...history, { role: 'user', content: '状态栏' }]
  → system 和 history 的 token 序列完全不变 → KV Cache 命中
  → 只有状态栏的 token 是新的 → 只算新的
```

**状态栏的本质：不动 system prompt 和 history，只在末尾加一条新的 user 消息。**

---

## 六、实验效果对比

### 防死循环演示（loop 模式）

任务："运行 run-tests，如果失败就一直试"

```
无状态栏：
  run_command✗（命令不存在）
  → 模型发现命令不存在，直接停下
  迭代 2 次

有状态栏：
  run_command✗（命令不存在）
  状态栏显示"run_command 已调用 5 次，请停止重试"
  → 模型看到提醒，改用其他方法
  迭代 4 次（反而更多，因为有状态栏后模型尝试了更多策略）
```

**观察：** gemma4 本身够聪明，没状态栏也能发现命令不存在。但**弱模型**在没有计数器的情况下会疯狂重试。

---

## 七、核心结论

| # | 结论 | 一句话 |
|---|------|--------|
| 1 | **临时注入、用完即弃** | 提供状态但不污染历史 |
| 2 | **计数器抑制死循环** | "你已经重试 5 次了"比模型自己记更有效 |
| 3 | **TODO 保持聚焦** | 复杂任务先建计划，一个 in_progress |
| 4 | **详细错误帮助自纠** | 失败后给建议，不让模型盲猜 |
| 5 | **弱模型收益更大** | 强模型天然稳健，弱模型靠状态栏救命 |

---

## 八、延伸思考

1. **状态栏 vs 对话历史？**
   - 对话历史：永久保留，越长越占上下文
   - 状态栏：临时注入，用完即弃
   - 状态栏是"轻量级"的历史摘要

2. **为什么状态栏不进历史？**
   - 进历史 = 永远背着 → 上下文膨胀
   - 不进历史 = 每次重新构造 → 保持精简
   - 本质：**状态是"当前视角"，不是"过去经历"**

3. **五种技术可以随意组合？**
   - 是的！`--no-timestamps` / `--no-counter` 等开关可以关掉任意技术
   - 根据任务需要选配：简单任务可能只需要 TODO，复杂任务需要全部

4. **和 KV Cache 的关系？**
   - KV Cache：缓存中间计算结果，加速推理
   - 状态栏：临时注入上下文信息，引导行为
   - 一个解决"算得快"，一个解决"做得对"

5. **状态栏会导致 KV Cache 失效吗？**

这是很多人会问的问题。答案是：**有影响，但远小于收益。**

```
缓存原理（支持前缀缓存的引擎，如 vLLM、Ollama）：

第 1 轮：[system prompt][历史] + [状态栏A]
         ↓ 全部首次计算，缓存 [system prompt][历史] 的 KV

第 2 轮：[system prompt][历史] + [状态栏B]
         ↑ [system prompt][历史] → KV 缓存命中（已算过）
         ↑ [状态栏B]       → 新增 ~200 token，只算这一部分

第 3 轮：[system prompt][历史] + [状态栏C]
         ↑ 同理，prefix 命中，只算新状态栏
```

**关键：不是"历史和状态栏一起重新算"，而是"历史命中缓存，状态栏单独算"。**

```
✅ 大多数引擎：前缀缓存
   → [system prompt][历史] 的 KV 完全命中
   → 只有 ~200 token 的状态栏需要新计算
   → 影响微乎其微

⚠️ 少数简单引擎：无前缀缓存
   → 整条消息都重新算
   → 但状态栏只占 200 token，对比历史几万 token
   → 仍然很小
```

**关键对比：**

```
有状态栏：
  ✅ 行为更好（不死循环、不迷路、有错误建议）
  ⚠️ ~200 token/轮的额外计算（仅状态栏部分）
  💰 成本增加：可忽略

无状态栏：
  ✅ KV 缓存理论上最优
  ❌ 弱模型可能死循环、多步任务迷路
  💰 实际多跑 3-5 轮 = 多几万 token
  💸 反而更贵
```

```
类比：状态栏像开车看导航
  每看一次导航：2 秒（只算导航内容）
  不看导航迷路绕路：20 分钟（多算了很多冤枉路）
  2 秒 vs 20 分钟 → 状态栏值得
```

**最终结论：状态栏值得。** 历史部分 KV 缓存始终命中，状态栏只新增 ~200 token。收益远大于成本。而且状态栏是临时消息，用完即弃——比"写进历史永久占缓存"更优的关键。

---

## 九、产出文件说明

运行 `npm run demo` 后生成：

| 文件 | 内容 |
|------|------|
| `runs/trajectory_*.json` | 完整轨迹（历史/工具调用/TODO/配置） |

三种模式：
- `preview`：离线预览状态栏长什么样（不发 LLM）
- `single`：单任务全开状态栏
- `demo`：逐轮展示状态栏变化
- `comparison`：无状态栏 vs 有状态栏对比
- `loop`：防死循环演示

---

## 十、快速验证清单

```bash
# 1. 离线预览状态栏长什么样
npm run preview
# 输出：展示 5 种技术各自的效果

# 2. 逐轮查看状态栏变化
npm run demo -- basic
# 输出：5 轮注入的状态栏，动态演化

# 3. 对比无状态栏 vs 有状态栏
npm run demo -- comparison
# 输出：同一任务，两种模式的行为差异

# 4. 防死循环演示
npm run demo -- loop
# 输出：run-tests 反复失败场景下的行为对比

# 5. 关闭某个技术看效果
npm run preview -- --no-counter --no-todo
# 输出：只有时间戳和系统状态的状态栏
```

**看完输出问自己：关掉某个技术后，模型行为有什么变化？**

答案在状态栏的五个开关里。

## 延伸阅读

- 官方 Book 上下文工程章节：[chapter2.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter2.md) — 深入消息结构、Chat Template、状态栏设计原理