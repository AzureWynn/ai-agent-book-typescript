# Chapter 6-3：同步 vs 异步 vs 中途引导 · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**同一个"查询场地"任务，同步调用、原生异步、中途引导三种语义下，工具执行期间模型的表现完全不同——它们决定了对"用户中途改条件"能有多快反应。**

```
sync  （同步）  ：模型发工具调用 → 干等 8 秒（零输出）→ 结果回来才继续
async （异步）  ：模型发工具调用 → 工具后台跑 → 模型继续输出准备清单 → 结果回来再汇总
steer （中途引导）：工具还在跑，用户改条件 → 中止当前生成 → 携带新条件重启 → 结论跟着新条件走
```

## 二、为什么需要这个？

| 场景 | sync 的表现 | async / steer 的表现 |
|---|---|---|
| 场地查询要 8 秒 | 模型静默 8 秒，用户以为死机 | 模型边等边输出准备清单（async） |
| 用户突然改预算/人数 | 模型仍按旧条件回答 | 立即中止旧生成，按新条件重启（steer） |
| 并发准备多件事 | 一件做完才做下一件 | 工具与生成并行推进 |

官方实验的核心问题：**工具执行期间模型能不能继续说话？用户中途改条件，正在生成的回合能不能被"打断"并按新条件继续？**

## 三、官方核心概念（五组实验 → 本仓库精简为三连）

官方用了 OpenAI Responses API 的 `async tool calling` 和 `response.steer`，分五组：
`sync` / `async` / `steer_reasoning` / `async_steer` / `unsupported_steer`（验证旧模型不支持 steering）。
本仓库用 Ollama + TS 实现其中**三个核心语义**：

### 1. sync：工具执行期间模型零输出

`async: false` 时，模型发出工具调用后回合结束，8 秒内没有任何文本，结果回灌后才继续。**同步 = 等待被完全暴露。**

### 2. async：工具执行期间模型继续输出

`async: true` 时，工具执行期间模型**不阻塞**，继续输出与工具结果无关的独立内容（官方是"独立准备清单"）。**异步 = 等待被利用。**

> ⚠️ Ollama 的 chat 接口没有原生 async 工具语义（发完 tool_call 回合就结束），本仓库用"后台 Promise + 并行流式生成"**模拟**观察到的 async 行为。

### 3. steer：回合中途引导

工具任务已启动、结果尚未完成时收到用户更新 → 中止当前回合生成 → 注入新条件 → 重启。**两条更新同时生效，工具只执行一次，最终答案选 B。**

> ⚠️ Ollama 没有原生 `response.steer`，本仓库实现**框架级替换式 steering**：`stream.abort()` 中止生成 + 新 user 消息注入 + 携带新条件重启。

### 4. 中途引导 ≠ 追加一条消息

官方文档强调：steering 不仅追加消息，还涉及**服务端是否接收更新、正在运行的任务是否感知、后续动作采用哪一版条件**。教学点：条件变更必须"打断正在执行的回合"才能影响后续决策——sync 语义下模型在工具结果返回前根本看不到更新。

## 四、TS 实现四件套

### 1. 受控工具（tools.ts）

```ts
lookupVenues(): Promise<{ venues, receipt }>
  await sleep(8000)   // 模拟 8 秒延迟
  返回固定场地表 + 随机 receipt（提示词不含它，模型必须调工具才能拿到）
```

### 2. LLM 封装（llm.ts）

```ts
chat({ messages, tools, stream, onToken, signal })
  → { message, stream? }     // stream.abort() 可中止生成
- stream: false → 一次性完整回复（同步语义）
- stream: true  → 流式回调 onToken（异步/steer 用）
```

### 3. 三种语义对照（sync / async / steer）

```
sync：
  模型发 tool_call → await 工具 8s（零输出）→ 结果回灌 → 最终答案 A
async：
  模型发 tool_call → 工具后台执行 → 并行流式生成准备清单 → 结果回灌 → 最终答案 A
steer：
  模型发 tool_call → 工具后台执行 → 2s 后收到更新（预算 1000/人数 10）
    → stream.abort() 中止生成 → 注入更新消息
    → 等工具真实结果回灌 → 携带新条件重启 → 最终答案 B
```

### 4. 验收（shared.ts）

```ts
verify(answer, { receipt, choice, source })
  - 引用 receipt ✔ / 选择场地 A/B ✔ / 标注 source: demo ✔
```

## 五、实测结论（gemma4，Ollama 本地）

```
sync  ：发工具调用 → 阻塞 8.0s 无输出 → 回灌 → 选 A，引用 receipt，source: demo ✔
async ：工具后台跑，期间模型并行生成 5 条独立准备清单 → 工具返回 → 选 A ✔
steer ：工具执行 2s 时收到更新 → 中止生成 → 结果回灌 → 重启 → 选 B
        （A 超预算、C 容量不足，正确引用 receipt，source: demo）✔
```

三组验收全部通过。

## 六、工程实践启示

1. **同步/异步/中途引导是三种不同的运行时语义**，不是"换个参数"——它决定模型能否在等待期间工作、能否对中途变更做出反应
2. **async 是接口原生能力**：Ollama 发完 tool_call 就结束回合，只能靠框架级模拟；真需要原生 async 要选支持 `async: true` 的 API（如 OpenAI Responses）
3. **steering 必须建立在"可中断"的生成之上**：`AbortController` / `AbortableAsyncIterator` 是前提；普通同步调用无法自动获得中途引导
4. **替换式 steering 的通用设计**：中止 → 注入新条件 → 重启，可套用在任何不支持原生 steering 的本地模型上
5. **验收要点可自动化**：引用 receipt / 正确选择 / source 标记，三行断言即可守住实验结论

## 七、自测清单

- [ ] 能画出 sync / async / steer 三种语义下"工具执行期间模型在干嘛"
- [ ] 能解释为什么 sync 语义下"用户中途改条件"无效
- [ ] 能说出 Ollama 与 OpenAI 在 async tool / steering 上的能力差异
- [ ] 能解释"框架级替换式 steering"的三步（中止 / 注入 / 重启）
- [ ] 能说出为什么 receipt 必须放在工具返回里而不是提示词里（强制工具调用）
- [ ] 能解释`stream.abort()`在 steer 组里扮演的角色
- [ ] 能说明更新条件（预算 1000/人数 10）为什么必须选 B

## 八、延伸阅读

- 官方 6-3：[astra-async-steering](https://github.com/bojieli/ai-agent-book/tree/main/chapter6/astra-async-steering)（Python 版，OpenAI Responses WebSocket 真实五组实验）
- 官方依据：Async tool calling / Mid-turn steering / WebSocket mode（见官方实验 README 的"官方依据"清单）
- 正文：[第 6 章](https://bojieli.github.io/ai-agent-book/book/chapter6/)（异步与事件驱动一节）
