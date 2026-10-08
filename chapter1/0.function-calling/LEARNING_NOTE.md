# Chapter 1-0：手写 Function Calling · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**不用任何框架，用裸 `fetch` 手写一遍"模型调用工具"的完整协议。**

官方课程用 LangChain 帮你把工具调用封装好了。本实验故意**什么都不用**（只有 typescript + tsx + Ollama），手动实现 `POST /api/chat` 的请求、解析、执行、回填全过程，从而看清：**LangChain 的 `bindTools` / `tool()` 到底替你做了什么**。

## 二、为什么需要这个？

```
用框架（1-1 context 实验）：
  你写：tool(fn, { name, description, schema })
  框架干：schema 转换、tools 注入、tool_calls 解析、ToolMessage 回填

手写（本实验）：
  你写：一切
  → 才能明白上面每一行背后发生了什么
```

**大白话：先徒手造一次轮子，才知道轮子为什么长这样。**

## 三、核心协议：一次工具调用的完整流程

### 请求：把工具描述给模型

模型"知道有工具"，是因为请求 body 里带了 `tools` 数组（工具是 JSON 描述，不是你的 TS 类）：

```ts
const body = {
  model, messages,
  tools: tools.map((t) => t.definition), // ← 模型"认识"的只有这个
  temperature: 0,
  stream: false, // 关键：一次性返回完整 JSON
};
```

### 响应：模型说"我要用工具"

模型返回 `message.tool_calls`（可能多个工具并行调用）：

```json
{ "tool_calls": [{ "id": "call_xxx",
                   "function": { "name": "calculator",
                                 "arguments": { "expression": "15*23" } } }] }
```

### 回填：工具结果以 `role: "tool"` 返回

```ts
messages.push({
  role: 'tool',
  content: result,       // 工具执行结果
  tool_call_id: call.id, // 必须与模型返回的 id 一致！
});
messages.push(response); // 带 tool_calls 的 assistant 消息也要存历史
```

### 主循环（思考-行动-观察）

```
循环直到 maxIterations:
  1. chat() 发请求（带 tools）         → 模型"思考"
  2. 模型没返回 tool_calls → 最终答案   → 结束
  3. 模型返回 tool_calls → 执行工具
     → 结果回填 tool role → 继续循环    → "行动 + 观察"
```

**理解的关键：** 每轮历史里同时存了"带 tool_calls 的 assistant 消息"和"对应的 tool 结果"，模型才能多轮推理不混乱。

## 四、踩过的坑（比协议本身更值钱）

| 坑 | 原因 | 解法 |
|---|---|---|
| Ollama 默认流式返回 NDJSON | 一次响应拆成多行 | `stream: false`，用 `resp.json()` 一次性解析 |
| `arguments` 格式不固定 | Ollama 返回对象，OpenAI 返回字符串 | 解析时兼容两者 |
| 回填必须带 `tool_call_id` | 模型要靠 id 把结果对应到上次调用 | id 不一致 → 多轮错乱 |
| 计算安全 | `Function` 构造器直接执行用户表达式危险 | `safeCalc` 字符白名单（仅数字 + 四则运算符） |

## 五、Skill：方法论注入（进阶主题）

**Tool 提供"能做什么"，Skill 指导"该怎么做"。** Skill = 方法论（SKILL.md）+ 可选专属工具（tools.ts）+ 数据文件。

| | Tool | Skill |
|---|---|---|
| 是什么 | 可调用的函数 | 一段预写好的方法论指导（Markdown） |
| 模型怎么用 | 返回 `tool_calls` 去调用 | 读进上下文，按它说的流程做 |
| 类比 | 给模型一把计算器 | 给模型一本操作规程手册 |

Skill 生命周期三函数（对齐真实框架的技能管理）：

```
scanSkills()  → 扫描 skills/ 目录读 frontmatter，得到技能清单   （翻技能书目录）
pickSkill()   → 按用户问题匹配最合适的 skill                  （查目录选章节）
loadSkill()   → 读 SKILL.md + 动态 import tools.ts + 数据      （翻到那章读进脑子）
```

三个工程能力（`npm run advanced-demo` 演示）：
1. **按需动态加载**：`name` / `description` frontmatter，运行时自动匹配技能
2. **附带可执行脚本 / 数据文件**：skill 文件夹可带任意资源，加载时注入工具
3. **运行时授权（allowed-tools）**：skill 声明允许哪些工具，`canExecute()` 在执行前拦截

**核心思想：模型的能力是可插拔的。** 不加载 `weather-report`，模型根本不知道有 `get_weather` 这个工具。

## 六、实测效果

| 场景 | 无 skill | 有 skill |
|---|---|---|
| 同问题 `先算 15*23，再算 8+9，然后加起来？` | 一次塞进 `(15*23)+(8+9)`，1 次调用 | 分 3 步独立调用，3 次调用 |
| `北京天气怎么样？` | 模型不知道 `get_weather`，凭记忆作答，0 次调用 | 加载时注册，调 `get_weather` → 数据 → 作答 |

**结论：skill 不增加模型固有知识，而是"方法论 + 可选能力"的可插拔包。**

## 七、与后续实验的联系

| 实验 | 关联 |
|---|---|
| 1-1 context | 本实验的 ReAct 循环是 1-1 消融实验的地基 |
| 1-3 search-codegen | 手写 `tool_calls` = "模型请求、你执行"；托管工具 = "模型声明、服务端执行" |

## 八、核心结论

1. **模型只认识 `tools` 数组里的 JSON 描述**，不认识你的 TS 类
2. **工具调用 = 请求带 tools → 响应 tool_calls → 执行 → 回填 tool role** 的闭环
3. **`tool_call_id` 必须回传**，这是多轮工具调用的"接线"
4. **Skill 与 Tool 是两个层面**：Tool 给能力，Skill 给方法论，可插拔
5. **框架只是封装，不是魔法**——手写一遍才能理解 Agent 的本质

## 运行命令

```bash
npm install
npm run interactive          # 交互模式
npm run skill calculator-expert "先算 15*23，再算 8+9，然后加起来？"
npm run skill weather-report "北京天气怎么样？"
npm run advanced-demo        # skill 三大工程能力演示
```
