# Chapter 1-3：托管工具 Agent · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**理解"托管工具（hosted tools）"协议——工具不再是你写的，而是平台（服务端）替你执行。**

本仓库是 **TypeScript 本地仿真版**（Ollama + SearXNG），仿真 OpenAI Responses API 的托管 `web_search` + `code_interpreter`，无需任何云端 API Key。

## 二、与之前实验的核心区别（先看这个）

| | 0.function-calling | 本实验（Responses 风格） |
|---|---|---|
| 工具来源 | 自己写（calculator 等） | **托管工具**（web_search / code_interpreter） |
| 模型返回 | `tool_calls`「请求」调用 → **你的代码执行** | **已完成**的类型化记录：`web_search_call` / `code_interpreter_call` |
| 执行位置 | 你的代码（本地可见） | **托管层/服务端**（Agent 只看到结果） |
| 结果形式 | 工具返回文本 | 类型化记录 + **URL 引用**（citations） |

**一句话：** function-calling 是"模型请求、你执行"；Responses 托管工具是"模型声明、服务端执行、返回带引用的结果记录"。

## 三、为什么叫"类型化记录"（typed items）

Responses 的响应不是一段字符串，而是一个 **items 列表**，每项有明确类型：

```json
{
  "output": [
    { "type": "web_search_call", "status": "completed", "citations": ["url1", "url2"] },
    { "type": "code_interpreter_call", "status": "completed", "output": "309.2" },
    { "type": "message", "content": [{ "type": "output_text", "text": "最近的是吉隆坡-新加坡" }] }
  ]
}
```

**为什么类型化重要？** 程序能**精确判断**"模型到底用没用工具、用了哪个、结果是什么"——而不是读模型文字去猜。官方验收逻辑正是基于此：

> "答案说它用了 Python" 不算数，必须有 `code_interpreter_call` 记录才算真用了。

## 四、协议层 vs 模型层

| | 协议层（protocol） | 模型层（model） |
|---|---|---|
| 是什么 | 工具如何描述/调用/记录结果的**约定** | **LLM 的推理与决策能力** |
| 决定什么 | 工具**能不能用** | 模型**会不会用好工具** |
| 谁保证 | 代码/平台（稳定可靠） | 模型本身（依赖能力） |
| 验证 | `protocol-demo` 每次都能成功 | `scenario-asean` 本地模型会卡住 |

**一句话：协议层决定"工具能不能用"，模型层决定"模型会不会用好工具"。本地 gemma 的失败是模型层问题，不是协议层问题。**

## 五、托管工具闭环（核心流程）

```
用户问题 → Agent 主循环 → 请求声明托管工具
  → 模型要调 web_search？      → 托管层执行搜索 → web_search_call + citations
  → 模型要调 code_interpreter？→ 托管层执行沙箱代码 → code_interpreter_call + output
  → 类型化记录回填历史 → 继续循环
  → 模型不调工具 → 产出最终 message（含所有类型化记录和引用）
```

**关键：工具记录是"已完成"的**（`status: 'completed'`）——不是"请求"，是"已经做了"。Agent 主循环**看不到**执行过程，只收到封装好的记录。

## 六、实测结果：协议可靠 vs 模型不可控

### 实例 1：protocol-demo（协议闭环，成功）

- `web_search_call` 携带 **5 条可点击 URL 引用**（官方协议要求有 citations 才算真搜索）
- `code_interpreter_call` 返回 `{"pair":["吉隆坡","新加坡"],"d":309.2}`
- 计算依据 `code_interpreter_call`，坐标来源见 web_search 引用——**闭环成立**

### 实例 2：scenario-asean（模型编排失败，真实观察）

gemma 模型**连续 8 次只搜不计算**（8 次 web_search、40 条引用、0 次 code_interpreter），即使系统提示词写明"所有数学计算必须用 code_interpreter"、代码还加了"编排引导"提示，仍不切换工具 → 最终没有答案。

**解读（最重要的学习点）：**
- 这不是 bug，而是**本地 7B 模型编排能力弱**的真实局限
- 官方验收标准"必须有 `code_interpreter_call` 记录才算完成"——正是为了防"只搜不算、装模作样"
- 另一个观察：40 条引用里绝大多数是泛泛页面（东盟简介/新闻），几乎没有一条给出首都经纬度——**模型没搜到能直接用的数据，自然无法进入计算阶段**

**结论：工具越强，模型越需要好的编排能力（Model as Agent 的难点）。**

## 七、澄清优先（clarify-first）

`scenario-bitcoin` 演示官方实验第二个场景：请求模糊时（没指定数据源/指标），模型应**先澄清再动手**。实现方式是把规则写进系统提示词。

## 八、核心结论

1. **托管工具的核心：执行对 Agent 不透明**——模型只声明类型，不关心执行细节
2. **类型化记录让验收可程序化**：`code_interpreter_call` 存在 = 真用了代码，不看文字
3. **协议层可靠，模型层不可控**：协议能保证"能不能用"，不能保证"用得好不好"
4. **模型编排是瓶颈**：弱模型会反复搜索不推进，强模型才能自主编排多工具链路
5. **协议先行是工程红利**：仿真版换真实 API 时，`protocol.ts` 几乎不用改

## 运行命令

```bash
npm run walkthrough        # 带注释的逐行演示（推荐第一个看）
npm run protocol-demo      # 协议闭环演示（稳定可复现）
npm run scenario-asean     # 模型驱动：体验模型编排的实际表现
npm run scenario-bitcoin   # 澄清优先
```

## 自测题

1. 为什么"答案说它用了 Python"不算数，必须有 `code_interpreter_call` 记录？
2. scenario-asean 里模型是"不调工具"还是"不会编排多工具"？为什么？
3. 如果换真实云端 Responses API，本地代码最需要改哪一层？
