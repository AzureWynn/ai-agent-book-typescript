# Chapter 6-2：异步 Agent · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**一个工具调用要很久时，Agent 不必傻等——把任务丢到后台跑，自己继续干活；任务完了再被"新事件"叫醒。还要学会中途打断、取消和恢复。**

前几章的 ReAct 是"调一个工具 → 等它返回 → 再想下一步"。如果这个工具要 3 分钟呢？Agent 就一直卡着？本实验解决这个问题：

```
同步（会卡）：Agent ──调用工具──> 等 3 分钟 ──拿到结果──> 继续
异步（不卡）：Agent ──调用工具──> 立即拿到 task_id ──干别的──> 任务完成时被新事件叫醒
```

## 二、为什么需要这个？

| 场景 | 同步的痛 | 异步的解法 |
|---|---|---|
| 日志分析要跑几分钟 | Agent 卡死，用户问题没人理 | 后台跑，Agent 立即回复"任务已启动" |
| 同时查 4 个只读数据源 | 串行要 4.5s | 并行只要 1.5s |
| 任务跑到一半用户说"取消" | 无法停止 | 打断机制统一取消 |
| 服务器崩了想恢复会话 | 内存全丢 | 检查点落盘，跨会话恢复 |

## 三、官方核心概念（本实验最重要的五句话）

### 1. 异步工具调用后立即返回占位符

`run_terminal_command` 一调用就返回 `task_id=T1`，**不阻塞**。真正的工作在后台推进（本仓库用 `setInterval` 模拟"终端命令"的进度输出，绝不真跑危险命令）。完成时以**新事件**（`async.result`）注入对话——"异步完成以新事件回灌"是本实验的闭环关键。

### 2. 事件分紧急度：打断 / 立即 / 排队

```
取消/停止/别做了 → INTERRUPT：取消当前 turn + 全部后台任务
提问（？/怎么/几点了）→ IMMEDIATE：立即回应，但不打断后台
其它补充指令 → DEFERRED：进 pending 缓冲，批量处理
```

紧急度让"紧急的事立即办，不紧急的事别打扰"。

### 3. 打断 = 取消当前 turn + 取消所有后台任务 + 留痕

打断不是只停掉一件事：正在跑的 LLM turn 要中止、所有后台任务要取消，并且把"打断事件 + 取消回执 + 被丢弃的积压事件"写进轨迹（留痕），让模型知道发生了什么。

### 4. 排队缓冲：慢后台不阻塞快指令

DEFERRED 事件先进 `pending`；等某个异步任务完成、产生 `async.result` 时，**一次性把 pending 全部批量追加**到轨迹，再触发一次 LLM——多条消息一次消化。

### 5. 状态检查点：轨迹 + 任务进度落盘

Agent 的可持久化状态 = 对话轨迹（可重建 LLM 上下文）+ 后台任务进度。保存成 JSON，新会话恢复后任务标记为 `suspended`（保留最后进度），由上层决定「重跑」还是「按进度续跑」。

## 四、TS 实现五件套

### 1. 事件模型（events.ts）

```ts
Event { id, type, urgency?, label, message, metadata, at }
  - message：可回放进 LLM 上下文的聊天消息（轨迹回放用）
  - classifyUrgency(text) → INTERRUPT / IMMEDIATE / DEFERRED
```

### 2. 异步任务管理（tasks.ts）

```ts
AsyncTask：setInterval 推进 progress（0-100），自然完成触发 onComplete 回调
TaskManager：
  start(command)   → 立即返回 TaskState（status: running）
  query(taskId)    → 查进度；cancel(taskId) / cancelAll() → 取消
  snapshot()       → 检查点；restore() → 还原为 suspended
```

### 3. 事件循环（runtime.ts）

```
inbox（原始事件）
  → dispatcher：判定紧急度 → 分流（打断/立即/排队）
  → worker：取批次 → 追加轨迹 → 跑一轮可取消的 LLM
```

TS 与 asyncio 的差异（本实验重要教学点）：
- asyncio 用 `CancelledError` **硬取消**一个任务（任何 await 点都能打断）
- TS 单线程只能用 **标志位（turnAborted）+ 边界检查**，在 LLM/工具调用之间中止
- 结论：**取消的粒度取决于运行时能否真正抢占**

### 4. LLM turn（runtime.ts）

```
build_messages() ← 轨迹回放（system + 各事件 message）
→ ollama.chat(tools)
→ 有 tool_calls？执行工具（异步工具返回 task_id 占位符）
→ 无 tool_calls？最终回复，结束本轮（MAX_STEPS 防死循环）
```

### 5. 离线演示三连（demos.ts）

| 演示 | 验证什么 | 怎么测 |
|---|---|---|
| parallel | 并行工具墙钟收益 | 串行 4.51s vs 并行 1.50s → 加速比 3.00x |
| interrupt | 打断/取消/恢复 | 三任务并行，跑到一半取消，再跑新任务 |
| state | 检查点持久化 | 会话 A 落盘 → 销毁 → 会话 B 恢复校验 |

## 五、实测结论（gemma4，Ollama 本地）

```
离线 parallel：加速比 3.00x，墙钟从「求和」（4.51s）降到「取最大」（1.50s）
离线 interrupt：fast 已自然完成 / mid、slow 取消在 95%、63%（进度冻结）
离线 state：轨迹 3 → 恢复 3 一致；任务 35%/18% → suspended 保留原进度

在线 1（异步工具）：LLM 并行调用 run_terminal_command ×2，立即返回 task_id，不阻塞
在线 2（打断）：轮询 tasks.anyRunning() 检测到任务启动 → 提交"取消"
              → 打断回执「取消任务 T1, T2」→ 模型确认已停止
在线 3（批量）：补充指令"用日语回复"进 pending（积压 1 条）
              → 异步结果到达 →「批量处理 1 条积压」→ 日语最终回复
```

> 实测发现：打断在 LLM turn 还在推理时到达，会中止"工具执行"这一步（turnAborted 在 tool_calls 之后被检查）——这正是官方 `cancel()` 的语义，也暴露了"模型推理耗时不定"的时序问题，所以在线场景用**轮询状态**而非固定 sleep 对齐。

## 六、工程实践启示

1. **异步能力三件套要分开测**：并行（墙钟）、打断（状态冻结）、恢复（检查点）各是独立能力，离线先测、在线再验
2. **工具分同步/异步两类设计**：同步工具（get_current_time）就地回填；异步工具（run_terminal_command）回占位符，完成以新事件回灌——别混在一起
3. **取消要有边界**：单线程里"取消"只能是协作式的（标志位 + 检查点），别假装能硬抢占；真需要抢占就用子进程/线程
4. **检查点是"可恢复的最小状态"**：轨迹（上下文）+ 任务进度（工作现场），两者缺一不可
5. **LLM 时序不可控**：与 LLM 相关的测试/演示，用状态轮询（anyRunning）代替固定 sleep

## 七、自测清单

- [ ] 能画出 inbox → dispatcher → worker 三条协程的分工
- [ ] 能说出三种紧急度（INTERRUPT/IMMEDIATE/DEFERRED）各怎么处理
- [ ] 能解释"异步工具调用后为什么立即返回 task_id"
- [ ] 能解释打断时为什么"取消当前 turn + 取消后台任务 + 留痕"三件事一起做
- [ ] 能说出 TS 的取消和 asyncio 的取消差在哪（协作式 vs 抢占式）
- [ ] 能解释检查点为什么 = 轨迹 + 任务进度
- [ ] 能解释离线演示的价值（不依赖 LLM 也能验证机制）

## 八、延伸阅读

- 官方 6-2：[async-agent](https://github.com/bojieli/ai-agent-book/tree/main/chapter6/async-agent)（Python 版，含设计文档 `agent_framework_design.md`）
- 正文：[第 6 章](https://bojieli.github.io/ai-agent-book/book/chapter6/)（异步与事件驱动一节）
