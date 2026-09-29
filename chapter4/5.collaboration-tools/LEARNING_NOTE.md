# Chapter 4-5：协作工具 MCP · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**主 Agent 忙不过来时，把活交给子 Agent，把决定权交给人，把通知和定时交给工具。**

```
用户：处理订单 A12345 的退款申请

主 Agent：
  1. 起子 Agent（minimal 上下文）→ 回 need_info：缺金额
  2. 起子 Agent（llm_generated 上下文）→ 320 元 VIP，符合自动批准
  3. 金额超阈值？没有。但流程要求：HITL 批一下
  4. 批了 → 发通知（预检：没配 webhook，只记录不真发）
  5. 设个定时器：三天后回访
```

三类协作原语全在里面：启动/取消/消息（子 Agent）、审批/输入（HITL）、通知/定时。

## 二、两种上下文策略

同一个任务，两种交接方式，实测对比：

```
minimal（10 tokens）：
  交接内容 = 任务原文一句话
  结果：need_info（缺金额）—— 饿死了，但隐私零泄漏、几乎零成本

llm_generated（16 tokens）：
  交接内容 = LLM 从父轨迹提炼（含金额 320、VIP 等级）
  结果：符合自动批准（VIP 优先通道）
```

官方结论一致：minimal 省且干净但可能干不了活；llm_generated 多花一次 LLM 调用，换来能干活。选哪个看任务：查订单状态 minimal 就够，定退款要 llm_generated。

## 三、金丝雀测隐私

父轨迹里埋了一句"工资卡尾号4832"（教学金丝雀，非真实隐私，和官方做法一样）。两种交接都要过检：

```
minimal → canaryLeaked=false（原文就没带）
llm_generated → canaryLeaked=false（prompt 禁止 + 正则兜底）
```

`工资卡尾号\d+` 这类模式在落盘前再扫一遍——prompt 约束是君子协定，正则才是门。两种都通过才算数。

## 四、HITL 两条路

```
有人在：auto-approve（演示）/ 真人点批准 → approved
没人在：超时 → expired，按保守默认走（批准类默认 false）
```

超时不等价于同意，这是铁律。批钱的场景里，"没回话"只能是"不批"。`respond_to_request` 是管理员侧接口，演示里用 auto-approve 闭环，评估里测了超时路径。

## 五、通知只预检不真发

`send_notification` 永远返回 `sent=false`：没配凭据报缺什么，配了也只记录脱敏后的配置不断言发送。原因和 4-2 私有数据源一样：**真发出去就收不回来**，教学演示不配拥有这个权力。

## 六、定时器是进程内的

`setTimeout`/`setInterval` 实现，一次性 + 循环（带最大次数）+ 取消 + 查询。演示 1 秒即响，评估验证取消后 fires=0。生产要持久化（进程重启丢任务），本实验只演示语义。

## 七、实测成绩单

`npm run eval`（8 项）：minimal 便宜干净但饿死、llm_generated 完成且干净、HITL 批准/超时双路径、通知预检 blocked、无定时器误响、async 可取消——**8/8 通过，0 跳过**。

`npm run demo`：退款全链路（委派对比 → 审批双路径 → 通知预检 → 定时响铃），HITL 与通知离线可跑；只有 `llm_generated` 要 Ollama。

## 八、本实验怎么跑

```bash
npm run smoke     # 协议冒烟：list → spawn → 审批 → 定时
npm run demo      # 退款协调全流程
npm run eval      # 8 项验收门
npx tsx src/main.ts run spawn_subagent task="查询订单 A12345 状态" role="订单查询助手" strategy=minimal mode=sync
npx tsx src/main.ts run request_admin_approval message="删除 1000 条记录？" timeout_seconds=5 auto_approve=true
```

## 九、核心代码结构

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

## 十、关键洞察

1. **交接内容决定子 Agent 生死**——minimal 饿死不是 bug，是设计取舍的演示
2. **隐私要两道锁**——prompt 约束 + 正则兜底，金丝雀验证两者
3. **超时≠同意**——HITL 保守默认是铁律，尤其批钱场景
4. **通知预检≠发送**——收不回来的动作，演示环境不配做
5. **sync/async 是调用形态**——等结果还是拿 task_id 稍后查，和 4-2 的分页游标同构

## 十一、官方正文补充要点（协作部分）

以下来自官方 book/chapter4.md，核对实现：

- **三组原语**：启动与取消（spawn/cancel）、消息传递（中途追问+反向汇报，本实验 inbox 机制）、发现（`list_subagents` 对应官方 `list_agents`，和 MCP `tools/list` 同构）
- **四种协作形态**：同步调用、异步调用、流式协作、多轮交互——本实验实现前两种形态的接口；流式与多轮属多 Agent 架构（第 10 章）
- **HITL 学习闭环**：批准/拒绝理由应归纳进知识库，隐式偏好可做后训练（第九章）——本实验只记录 response，未做归纳，文档写明边界
- **上下文传递对比**正是官方 4-5 的实验要求：最小化（只传参数）vs LLM 提炼（多一次调用）——本实验 eval 第一、二项就是它

## 十二、常见问题

- **minimal 总是 need_info**：正常，这是设计的报名片——它证明"信息不足时拒答"而不是编答案
- **llm_generated 被 skip**：Ollama 没起；起服务后重跑，eval 会自动覆盖
- **定时器进程退出就没**：正常，进程内实现；生产要持久化 + 独立调度器
- **浏览器自动化呢**：要 Playwright + Chromium，重型依赖，本实验没做（官方列为独立模块）
- **真发通知怎么开**：现在不开。配了凭据也要改代码显式放行——默认必须安全
