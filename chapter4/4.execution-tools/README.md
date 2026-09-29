# execution-tools / 执行工具 MCP 服务器

> Chapter 4-4: 带分层安检的执行工具——校验、审批、截断落盘全走 MCP stdio
> 对应《AI Agent 开发实战》第 4 章实验 4-4

← [返回第 4 章目录](../README.md)

## 这个实验在学什么

对应官方实验 4-4：**执行工具 MCP 服务器**。本仓库为 **TypeScript 实现**，用官方 `@modelcontextprotocol/sdk` 搭建真实 MCP Server + Client + Ollama gemma4 驱动的 Agent。6 个工具：`file_write` / `file_edit`（语法校验+diff 预览）、`code_interpreter` / `virtual_terminal`（黑名单+审批+截断落盘）、`calendar_add` / `github_create_pr`（缺凭据，诚实 blocked）。安检四层：输入验证 → 权限黑名单 → LLM 事前审批 → 售后校验，默认拒绝。

## 快速开始

```bash
npm install
npm run smoke                     # 协议冒烟：list → 写 → 跑（断言 6*7=42）
npm run demo                      # 全流程演示（审批关，离线）
npm run eval                      # 6 项验收门（审批开，需 Ollama）

# Agent 模式（审批强制开，需 Ollama + gemma4）
npm run agent
```

单工具调试（全部走真实 MCP 调用）：

```bash
npx tsx src/main.ts run virtual_terminal command="echo hi"
npx tsx src/main.ts run file_write path=a.txt content=hi
npx tsx src/main.ts list --category execute
```

## 教学笔记

更详细的讲解（四层安检、审批者误判修法、截断留地址、Agent"会写不会验"实录）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
4.execution-tools/
├── src/
│   ├── safety.ts        # 沙盒/黑名单/风险分级/LLM 审批/语法校验/截断落盘
│   ├── tools-files.ts   # file_write / file_edit
│   ├── tools-exec.ts    # code_interpreter / virtual_terminal
│   ├── tools-external.ts# calendar_add / github_create_pr（blocked）
│   ├── catalog.ts       # 6 工具注册表
│   ├── server.ts        # MCP Server（底层 Server + 手写 Schema）
│   ├── client.ts        # MCP Client（stdio 拉起 + list/call + 收据）
│   ├── smoke.ts         # 四段式协议验证
│   ├── agent.ts         # Ollama 开车（去重；审批强制开）
│   └── main.ts          # CLI（list/demo/code/shell/write/edit/eval/agent）
├── workspace/           # 一次性沙盒
└── catalog_receipt.json # 协议收据（含 mcp_sdk_version）
```

## 核心实现讲解

### 1. 风险分级与双轨（safety.ts）

写新文件 medium，改写/删除 high；`rm -rf /`、`dd`、`mkfs`、fork 炸弹、`sudo`、curl 管道 sh 直接 denied。黑名单是字符串匹配（快而笨），审批是模型判断（慢而聪明）——官方要求两层都要有。

### 2. 审批 fail-closed（safety.ts）

审批者 unreachable、输出解析不出布尔值，一律按拒绝处理。reviewer 身份写入每次高风险调用的 metadata（可审计）。同模型审批是降级实现（官方建议换家族同水平互审），文档写明。

### 3. 写前校验与截断留地址（safety.ts + tools）

`.py` 走 `py_compile`，`.js` 走 `node --check`，不过不落地；edit 找不到字符串直接失败不模糊匹配。超 200 行/10000 字符只留头尾 50 行，全量落盘到 `workspace/.outputs/`，路径回传。

`file_write`/`file_edit` 接受 `path`/`file_path` 双名（后者为跨服务器组合保留，与 4-2 读文件工具同名——多服务器参数命名不一致的实测教训，见 4-1）。

## 实测结果

`npm run eval`（审批开，需 Ollama）：**6/6 通过**——写+校验、坏文件拒收且不落地、黑名单拦 `rm -rf /`、edit miss 干净失败且原文件不动、长输出截断+落盘、审批链路有 reviewer 回执。

`npm run demo`（审批关，离线）：写→坏文件被拒→跑（55）→改（diff 预览）→300 行截断→黑名单→外部 blocked，全流程无模型。

`npm run agent`：写文件走审批放行；但模型一次 `code_interpreter` 没调，总结却写"已执行并验证，输出 1,4,9,16,25"——数字对了，执行没发生。**看轨迹不看总结**，这正是官方检查题的本地版。

## 关键洞察

1. **安检分层**：黑名单、审批、校验各拦各的，没有银弹层
2. **默认拒绝**：失联、解析失败 → 拒绝；方便比安全便宜，但这里选安全
3. **写前校验**：坏文件不落地，报错带校验原文
4. **截断留地址**：头尾 50 行 + 落盘路径
5. **轨迹是证据**：Agent 的总结可能是编的，tool 记录才是真的

## 注意事项

- `smoke`/`demo` 可离线；`eval`/`agent` 的审批链路需要 Ollama 运行 + `gemma4:latest`
- `--no-approval` 只许一次性目录演示用，别碰真实工作区
- 日历/GitHub 要真凭据，明确 blocked；桌面/Android 真机探针要 Xvfb/Docker/KVM，未实现
- `EXECUTION_ROOT` 只指向一次性目录；审批同模型是降级实现，生产换家族互审
- 审批/总结类 Ollama 调用无超时保护，hang 住直接 Ctrl-C（4-1 同类问题已加 240s 熔断，可参照）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[execution-tools](https://github.com/bojieli/ai-agent-book/tree/main/chapter4/execution-tools)
- 官方正文：[book/chapter4.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter4.md)（执行工具一节：分层防护、提议者-审核者）
