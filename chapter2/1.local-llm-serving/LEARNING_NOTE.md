# Chapter 2-1：本地 LLM 服务部署与工具调用 · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**用 Ollama 原生 `/api/chat` 协议，把"本地 LLM 服务 + 标准工具调用"的完整闭环跑通。**

官方有两条服务端路径：**vLLM**（Linux + NVIDIA GPU）和 **Ollama**（macOS / 原生 Windows / 无 GPU 的 Linux）。本仓库是 TypeScript 移植版，只实现 Ollama 路径。

## 二、为什么需要这个？

本地 LLM 相比云端 API 的价值：

```
云端 API：数据出网、按量计费、延迟不可控
本地 Ollama：数据不出本机、免费、离线可用、延迟低
```

而工具调用（function calling）是让本地小模型"干活"的关键——模型不靠记忆硬答，靠调工具拿真数据。

## 三、四个值得动手验证的机制

### 1. thinking 字段 vs `<thinking>` 标签

**这是最容易踩的坑**：模型原始 token 流里是 `<thinking>` 标签，但 Ollama 在交给客户端前**解析成独立的 `thinking` 字段**，`content` 里看不到。

```
模型内部输出: <thinking>...</thinking>然后正文
Ollama 处理后: message.thinking = "..."   message.content = "正文"
```

支持思考的模型（qwen3、gemma4）传 `think=true`；不支持的模型（llama3.2、qwen2.5）对 `think=true` 返回 **HTTP 400**。回退逻辑每个模型只探测一次并缓存：

```ts
try { return await this.chatOnce({ ...body, think: true }); }
catch (e) {
  if (e.status === 400) { this.thinkDisabled.add(model); return this.chatOnce(body); }
}
```

### 2. 流式 ReAct 循环

一次对话里模型可能多次调用工具：每次结果回灌后继续决策，直到不再调用工具（最多 10 轮）。

```
循环直到 maxIterations:
  流式读取（thinking / tool_call / content 逐块）
  有工具调用？→ 保留 assistant 消息（含 tool_calls）
             → Promise.all 并行执行工具
             → 结果回灌 role:tool → 继续循环
  没有？→ 结束，给出最终答案
```

### 3. 并行工具调用

同一轮生成的多个工具调用互相独立，一次性**并发执行**（`Promise.all`）、按序回灌（对齐官方 `ThreadPoolExecutor`）。

```
用户："东京和纽约现在几点了？"
模型一轮发两个 get_current_time 调用
→ 并行执行 → 结果一起回灌 → 模型综合回答
```

### 4. 工具结果必须是真实数据

Agent 的回复必须**基于工具返回值**，而不是模型编造。比如复利计算：模型生成 Python → `python3` 执行 → 未来值 $30,112.88 与公式一致，数值可验证。

## 四、工具注册表（tools.ts）

每个工具 = `name + description + parameters(JSON Schema) + fn`，schema 是 **OpenAI 兼容格式**，Ollama 原生 `/api/chat` 直接接收同一格式：

```ts
registry.register(
  'get_current_temperature',
  "Get the current temperature for a specific location",
  { type: 'object',
    properties: { location: { type: 'string' }, unit: { type: 'string', enum: ['celsius','fahrenheit'] } },
    required: ['location'] },   // unit 有默认值 celsius，不必填
  getCurrentTemperature
);
```

5 个内置工具：

| 工具 | 说明 | 数据来源 |
|---|---|---|
| `get_current_temperature` | 城市实时天气 | Open-Meteo（无需 Key） |
| `get_current_time` | 时区当前时间 | Intl（IANA 时区 + 缩写映射） |
| `convert_currency` | 汇率换算 | 模拟汇率表 |
| `parse_pdf` | 提取 PDF 文本 | URL 或本地文件（pdf-parse） |
| `code_interpreter` | 执行 Python 代码 | spawn `python3` 子进程 |

> 细节：`code_interpreter` 保持官方语义——模型生成的是 **Python**（`^` 是按位异或，幂用 `**`，写进了工具描述）。

## 五、实测结果（gemma4 真实调用）

| 场景 | 行为 |
|---|---|
| 时间查询 | thinking → `get_current_time` → 正确时区时间 |
| 两个城市 | 一轮两个并行工具调用，一起回灌，综合回答 |
| 复利计算 | 生成 Python → python3 执行 → $30,112.88（数值正确且有据） |
| 天气查询 | `get_current_temperature` → Open-Meteo 真实 29.4°C |

## 六、踩过的坑

| 坑 | 解法 |
|---|---|
| Ollama 新版本 `/api/chat` 默认 `stream=true` | 非流式必须显式 `stream: false`，否则拿到 NDJSON 解析错误 |
| 小模型工具调用质量差（llama3.2:1b） | 用支持工具调用的 8B 级模型（qwen3:8b / gemma4） |
| `unit` 设成必填 → 模型反问而不调工具 | 有默认值的参数不必填 |
| `code_interpreter` 真实执行模型生成的 Python | 教学任务可用；**不要暴露给不可信输入/远程用户** |

## 七、核心结论

1. **本地 LLM + 标准工具调用 = 完整的 Agent 闭环**，数据不出本机
2. **`thinking` 字段是 Ollama 对 `<thinking>` 标签的解析产物**，不是模型原始输出——debug 时别找错地方
3. **多轮工具调用靠消息结构**：assistant 消息带 `tool_calls`，结果用 `role: 'tool'` + `tool_name` 回灌
4. **并行工具调用用 `Promise.all`**，顺序保持、并发执行
5. **工具结果必须真实**：Agent 的答案要有据可查
6. **schema 用 OpenAI 兼容格式**，vLLM / Ollama / 云端 API 通用

## 运行命令

```bash
npm install
npm run demo                  # 快速验证
npm run single -- "任务"       # 单任务模式（流式）
npm run interactive           # 交互模式
```

## 自测题

1. `thinking` 字段和 `<thinking>` 标签是什么关系？为什么不支持的模型会返回 400？
2. 为什么并行工具调用要用 `Promise.all` 且保持顺序？
3. `code_interpreter` 的安全边界是什么？什么场景不能这么用？
