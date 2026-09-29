# collaboration-tools / 协作工具 MCP 服务器

> Chapter 4-5: 子 Agent 管理、HITL 审批、通知预检、定时器，全走 MCP stdio
> 对应《AI Agent 开发实战》第 4 章实验 4-5

← [返回第 4 章目录](../README.md)

## 这个实验在学什么

对应官方实验 4-5：**协作工具 MCP 服务器**。本仓库为 **TypeScript 实现**，用官方 `@modelcontextprotocol/sdk` 搭建真实 MCP Server + Client。15 个工具分四类：子 Agent（spawn/send/cancel/status/list，sync/async 双模式，minimal/llm_generated 双上下文策略）、HITL（审批/输入/应答/待办，超时保守默认）、通知（四渠道只预检不真发）、定时器（一次性/循环/取消/查询）。浏览器自动化需 Playwright 重型依赖，未实现。

## 快速开始

```bash
npm install
npm run smoke                     # 协议冒烟：list → spawn → 审批 → 定时
npm run demo                      # 退款协调全流程（llm_generated 需 Ollama）
npm run eval                      # 8 项验收门（缺 Ollama 自动 skip 相关项）
```

单工具调试（全部走真实 MCP 调用）：

```bash
npx tsx src/main.ts run spawn_subagent task="查询订单 A12345 状态" role="订单查询助手" strategy=minimal mode=sync
npx tsx src/main.ts run request_admin_approval message="删除 1000 条记录？" timeout_seconds=5 auto_approve=true
npx tsx src/main.ts list --category hitl
```

## 教学笔记

更详细的讲解（双策略对比、金丝雀隐私验证、超时≠同意、通知只预检）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
5.collaboration-tools/
├── src/
│   ├── types.ts       # ActionResponse + ToolDef + token 估算
│   ├── subagents.ts   # 注册表 + sync/async 运行器 + 双策略交接 + 金丝雀
│   ├── hitl.ts        # 审批/输入 + 超时保守默认 + 管理员应答
│   ├── notify.ts      # 四渠道预检（永不真发）+ 凭据脱敏
│   ├── timers.ts      # 一次性/循环/取消/查询（进程内）
│   ├── catalog.ts     # 15 工具注册表
│   ├── server.ts      # MCP Server（底层 Server + 手写 Schema）
│   ├── client.ts      # MCP Client（stdio 拉起 + list/call + 收据）
│   ├── smoke.ts       # 四段式协议验证
│   └── main.ts        # CLI（list/info/run/demo/eval）
├── .env.example
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 双上下文策略（subagents.ts）

`minimal` 只传任务原文（10 tokens，隐私天然干净）；`llm_generated` 多花一次 Ollama 调用，从父轨迹提炼必需事实并做隐私过滤（16 tokens）。同一退款任务：前者缺金额报 `need_info`，后者带金额+VIP 等级直接办结——饿死是设计取舍的演示，不是 bug。

### 2. 金丝雀双锁（subagents.ts）

父轨迹埋"工资卡尾号4832"（教学金丝雀）：prompt 约束不让带 + 落盘前正则再扫。两种交接都要过检，`canaryLeaked=false` 才算数。

### 3. HITL 超时铁律（hitl.ts）

有人在走批准/应答；没人（超时）走保守默认——审批类默认 false。`auto_approve` 只为演示闭环存在，生产等真人。

### 4. 通知预检（notify.ts）

无凭据报缺什么；有凭据也只记录脱敏配置不断言发送。收不回来的动作，演示环境不配做。

## 实测结果

`npm run eval`：**8/8 通过，0 跳过**——minimal 便宜干净但饿死、llm_generated 办结且干净、HITL 批准/超时双路径、通知预检 blocked、定时一次即响、循环可取消、async 可取消。

`npm run demo`：退款全链（委派对比 → 审批双路径 → 通知预检 → 定时响铃）。HITL 与通知离线可跑；只有 `llm_generated` 要 Ollama（缺席自动 skip，不谎报）。

## 关键洞察

1. **交接内容决定子 Agent 生死**——need_info 是拒答不是故障
2. **隐私两道锁**——prompt 约束 + 正则兜底，金丝雀验两者
3. **超时≠同意**——保守默认是铁律
4. **通知预检≠发送**——收不回来的不做
5. **sync/async 是调用形态**——等结果还是拿 id 稍后查

## 注意事项

- `smoke`/`demo`（除 llm_generated）/`eval`（除 llm_generated 项）可离线；Ollama 缺席时相关项 skip，不谎报
- 浏览器自动化要 Playwright + Chromium，未实现（官方独立模块）
- 定时器进程内实现，重启即丢；生产要持久化调度器
- 真发通知现在不开：配了凭据也要改代码显式放行
- `llm_generated` 的 Ollama 调用无超时保护，hang 住直接 Ctrl-C（4-1 同类问题已加 240s 熔断，可参照）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[collaboration-tools](https://github.com/bojieli/ai-agent-book/tree/main/chapter4/collaboration-tools)
- 官方正文：[book/chapter4.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)（协作工具一节：三组原语、四种形态、HITL）
