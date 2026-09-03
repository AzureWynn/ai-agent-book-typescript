# function-calling —— 纯手写 Function Calling（不依赖 LangChain）

一个**零依赖**（连 mathjs 都不用，只有 typescript + tsx）的 Agent，直接调 Ollama 的 `/api/chat` 接口，完整手写 Function Calling 协议。用来理解：**LangChain 的 `bindTools` / `tool()` 到底替你做了什么**。

## 快速开始

```bash
# 前提：Ollama 运行中，且有本地模型（.env 的 MODEL_NAME）
npm install
npm run interactive            # 交互模式
# 或
npx tsx src/main.ts single "15*23 等于多少？"
```

试试：
- `15*23 等于多少？` → 触发 calculator
- `现在几点了？` → 触发 get_current_time
- `你好` → 无需工具，直接回答

## 目录结构

```
function-calling/
└── src/
    ├── main.ts    # CLI（交互 / single）
    ├── agent.ts   # 纯 fetch 手写 Function Calling 协议
    └── tools.ts   # 普通 TS 对象定义工具 + 执行器
```

## 手写实现 vs LangChain 对照

| 环节 | 本仓库手写版 | LangChain 版（context 实验） |
| --- | --- | --- |
| 定义工具 | 普通 TS 对象 `{ type, function: { name, description, parameters } }` | `tool(fn, { name, description, schema })` |
| 把工具给模型 | fetch body 里 `tools: [...]` 手动拼 | `llm.bindTools(allTools)` 内部 `convertToOpenAITool` |
| 模型返回调用 | 读 `response.message.tool_calls` | `response.tool_calls` |
| 执行工具 | `findTool(name).execute(args)` 手动分发 | `tool.invoke(toolCall.args)` |
| 回填结果 | 手动 push `{ role: 'tool', tool_call_id, content }` | `new ToolMessage({ content, tool_call_id })` |
| zod schema | 手写 `properties` / `required` | `zod` + `toJsonSchema` 自动转 |

**结论：LangChain 只是把"工具描述→请求→响应→回填"这套协议封装好了。模型并不认识你的 TS 类，它只认识 `tools` 数组里的 JSON 描述。**

## 核心实现（agent.ts）

### 1. 请求：把工具描述给模型

```ts
const body = {
  model: this.model,
  messages,
  tools: tools.map((t) => t.definition), // ← 模型"知道"有这些工具
  temperature: 0,
  stream: false, // 一次性返回完整 JSON（不是 NDJSON 流）
};
const resp = await fetch(`${baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify(body) });
```

### 2. 响应：模型说"我要用工具"

模型返回的 `message.tool_calls` 形如：

```json
{
  "tool_calls": [{
    "id": "call_xxx",
    "function": { "name": "calculator", "arguments": { "expression": "15*23" } }
  }]
}
```

> 注意：Ollama 返回的 `arguments` 可能是**对象**也可能是 **JSON 字符串**（不同模型/版本行为不同），代码里做了兼容处理。

### 3. 回填：工具结果以 `role: "tool"` 返回

```ts
messages.push({
  role: 'tool',
  content: result,        // 工具执行结果
  tool_call_id: call.id,  // 必须和模型返回的 id 一致
});
```

然后把**带 `tool_calls` 的 assistant 消息**也存进历史（`messages.push(response)`），继续下一轮循环。模型看到工具结果后，要么继续调工具，要么给出最终答案。

### 主循环（思考-行动-观察）

```
循环直到 maxIterations:
  1. chat() 发请求（带 tools）
  2. 模型没返回 tool_calls → 视为最终答案，结束
  3. 模型返回 tool_calls → 执行每个工具 → 结果回填 tool role → 继续循环
```

## 踩过的坑（值得记录）

1. **Ollama 默认流式返回 NDJSON**：需要 `stream: false` 才能用 `resp.json()` 一次性解析；否则要逐行读 NDJSON。
2. **`arguments` 格式不固定**：Ollama 返回对象，OpenAI 返回字符串。解析要兼容两者。
3. **回填必须带 `tool_call_id`**：不带或 id 对不上，模型多轮会错乱。
4. **安全计算**：`safeCalc` 限制了字符白名单（仅数字 + 四则运算符）；`Function` 构造器仅用于教学演示，生产请用 mathjs 或自定义解析器。

## 动手挑战

- 加一个工具：比如"查当前天气"（返回假数据即可），看模型会不会自动选择它。
- 去掉 `tools` 字段再跑一次，观察模型行为（对照 context 实验的 `no_tool_calls` 模式）。
- 打印第 3 步的完整 `messages` 数组，理解 `tool` 角色消息在历史里的位置。

## 参考

- Ollama API 文档：https://github.com/ollama/ollama/blob/main/docs/api.md
- OpenAI Function Calling 协议：https://platform.openai.com/docs/guides/function-calling