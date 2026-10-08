# Chapter 6-1：事件驱动 Agent · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**让 Agent 被外部世界"唤醒"，而不是被用户"命令"。**

前几章所有 Agent 都是"用户问一句 → Agent 答一句"（请求/响应）。本实验换一种启动方式：**定时器到期、文件变更、HTTP 消息**都能把一个事件推进队列，Agent 被事件唤醒后自己处理。

```
请求/响应：  用户 ──问──> Agent ──答──> 用户
事件驱动：  定时器到期 ──推事件──> 队列 ──取──> Agent ──处理──> 结果
             HTTP POST ──推事件──> 队列 ──取──> Agent ──处理──> 结果
```

## 二、为什么需要这个？

因为真实 Agent 不只在聊天框里工作：

| 场景 | 谁唤醒 Agent |
|---|---|
| 每天 10:00 检查备份 | 一次性定时器 |
| 每小时检查服务器健康 | 循环定时器（Heartbeat） |
| 微信/邮件来了新消息 | IM/邮件事件 |
| 有人提了 GitHub PR | PR 更新事件 |
| 监控目录里出现新文件 | 文件监听 |
| 系统告警 | 告警事件 |

如果只支持"用户提问"，这些场景一个都做不了。

## 三、官方核心概念（本实验最重要的三句话）

### 1. 触发发生 ≠ 任务完成

定时器到点（触发）只是"事件发生了"，不代表"任务做完了"。两者之间隔着：**入队 → 取出 → Agent 处理**。解耦后，事件来源不用关心 Agent 什么时候处理完。

### 2. 周期事件可能重入

循环定时器每 3 秒触发一次，但如果 Agent 处理一次要 11 秒，第二次触发时第一次还没处理完。**事件队列天然解决这个问题**：事件先排队，Agent 慢慢处理，不会丢，也不会乱。

> 实测：本实验在线模式里，Ollama 处理备份检查耗时 11168ms，期间 health_check 触发了 2 次都安全入队。这是真实重入的现场演示。

### 3. 事件类型和处理状态分开

- **事件类型**（EventType）：这个事件是什么（web_message / timer_trigger / system_alert…）
- **处理状态**：这个事件处理到哪了（排队中 / 处理中 / 完成）

分开记录才解释得清"等待"和"重复执行"。队列统计（processed / dropped）就是处理状态的最小集合。

## 四、TS 实现四件套

### 1. 事件格式（events.ts）

```ts
{ id, type: EventType, content: string, metadata, receivedAt, source }
```

所有来源都收敛成这一个结构，Agent 只需学会处理一种格式。

### 2. 事件队列（queue.ts）

```ts
enqueue()  → accepted（入队）/ merged（窗口内去重合并）/ dropped（超上限丢最旧）
dequeue()  → 取出一条（FIFO）
```

两个额外机制：**窗口去重**（同类型触发器在 500ms 内合并，记录 occurrences）和**上限丢弃**（防积压撑爆内存）。

### 3. 触发器（triggers.ts）

```
OneShotTimer：  setTimeout → delayMs 后入队一条
RecurringTimer：setInterval → 每 intervalMs 入队一条
HttpTrigger：   POST /event → 外部注入（模拟 Web/IM/GitHub）
FileWatch：     fs.watch → 目录文件变化入队
```

**触发器只负责"事件发生"，不负责"任务完成"**——这是设计上的关键解耦。

### 4. 事件循环 + Agent（main.ts / agent.ts）

```
注册触发器 → 事件循环（durationMs 内）→
  队列空？等 100ms
  有事件？dequeue → 唤醒 Agent 处理
```

Agent 有两种模式：
- **mock（离线）**：按事件类型打印模拟动作，验证机制本身，无需模型
- **在线**：事件内容作为 user 消息 → Ollama ReAct → 需要时调工具拿真实数据 → 回复

## 五、实测结论（gemma4，Ollama 本地）

```
离线 mock（timer）：3 事件按序处理，闭环正常，0 丢失
在线（备份检查）：Agent 自动调用 run_backup_check → 基于"最近备份时间"真实结果回复
在线（health_check 重入）：处理 11s 期间 2 次触发都安全入队
```

## 六、工程实践启示

1. **机制与模型分离**：先 mock 验证事件机制，再接 Ollama——机制 bug 不该归咎于模型
2. **统一事件格式**：多来源收敛成一种结构，Agent 复杂度不随来源数量增长
3. **慢处理不阻塞快事件**：队列是缓冲，不是瓶颈
4. **生产安全**：HTTP 入口要 HTTPS + API Key + 限流 + 输入校验（官方安全清单）

## 七、自测清单

- [ ] 能画出"注册 → 触发 → 入队 → 唤醒 → 处理"闭环
- [ ] 能解释"触发发生 ≠ 任务完成"
- [ ] 能解释周期事件重入时队列为什么不会丢事件
- [ ] 能说出 mock 模式的价值（机制验证与模型无关）
- [ ] 能说出事件类型与处理状态为什么要分开

## 八、延伸阅读

- 官方 6-1：[agent-with-event-trigger](https://github.com/bojieli/ai-agent-book/tree/main/chapter6/agent-with-event-trigger)
- 正文：[第 6 章](https://bojieli.github.io/ai-agent-book/book/chapter6/)（异步与事件驱动一节）
