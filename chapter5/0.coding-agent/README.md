# coding-agent-starter / coding-agent-starter

> Chapter 5-Starter · 官方 `chapter5/coding-agent`（无编号 Starter 项目）的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

官方"第一次阅读顺序"第 2 步：先读懂一个完整的 Coding Agent，再看后面各实验。核心就是一个循环——**读/搜 → 补丁 → 测试 → 修复 → 验证**，配七个工具（读、写、改、找文件、找内容、终端、代码执行）。

## 快速开始

```bash
cd chapter5/0.coding-agent
npm install
cp .env.example .env   # 按需改 OLLAMA_BASE_URL / OLLAMA_MODEL
npm run demo           # T1 全轨迹：TODO 清单（需 Ollama 运行）
npm run eval           # T1+T2 验收对照表（需 Ollama 运行）
```

两个任务：T1 只读整理 TODO（照抄书 5.1 节例子），T2 修 bug 到测试全过。跑完 workspace 自动重置回初始态，可重复跑。

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 小模型默认写教程不干活——few-shot 首轮示范 + "你有手"禁令，12 格式错误 → 0。
- 工具语义要覆盖模型的自然写法（`dir/**` 不懂就回"无匹配"，模型会信了写空清单）。
- "测试通过"而非"代码写完"才是完成标准；eval 破坏夹具，靠 reset 保幂等。

## 目录结构

```
src/
  agent.ts    主循环（ReAct 文本协议 + 状态栏 + 指纹熔断）
  tools.ts    七工具（workspace 约束 + bash 危险命令拒绝 + 超时截断）
  prompt.ts   系统提示词（含首轮示范）+ git 状态栏
  tasks.ts    T1/T2 定义 + 机器验收
  main.ts     demo/eval 入口 + 夹具重置
workspace/
  sample-project/  含 3 个 TODO + 1 个 bug 的练手项目
```

## 核心实现讲解

- `agent.run`：system 提示词 → 用户任务 → 每轮追加 `<system_hint>` 状态栏 → 解析 ` ```tool JSON ` 或 `FINAL:` → 执行回灌，最多 12 轮。
- 解析失败/未知工具/重复调用都不崩：回灌结构化提示让模型自纠（书"反馈越结构化越好"的落地）。
- `bash` 有危险命令正则拒绝 + workspace 为 cwd + 15s 超时 + 输出掐头去尾；文件工具全部 `safePath` 约束，`edit` 要求 oldText 唯一命中。

## 实测结果（gemma4，Ollama 本地）

```
T1 TODO清单  清单文件存在  ✓  TODO_LIST.md 已生成
T1 TODO清单  3 个 TODO 齐全  ✓  users_v2/operator/edge case 都在
  （轮数 3，工具调用 2）
T2 修复循环  测试全过  ✓  ALL TESTS PASS
T2 修复循环  源码被修复  ✓  运算符已改
  （轮数 5，工具调用 4）
```

## 关键洞察

- Harness 的差距就是智能的差距：同一模型，提示词加两行示范，12 错变 0 错。
- 零命中返回最危险——模型把它当事实。工具设计要防这一手。

## 注意事项

- 需 Ollama 运行（`gemma4:latest`）；无外部 API 依赖。
- 文本 ReAct 协议（小模型 tool-calling 不稳，fence JSON 更可靠）。
- `runCode`/`bash` 只限 workspace，危险命令拒绝，仅教学机执行。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/coding-agent`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（Coding Agent 基础能力/整体流程/Harness 工程三节）
