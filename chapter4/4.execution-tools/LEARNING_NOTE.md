# Chapter 4-4：执行工具 MCP · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**感知工具只看，执行工具动手——动手就得有安检。**

```
感知：读文件、查天气 —— 错了顶多答错
执行：写文件、跑命令 —— 错了文件没了、服务挂了、钱没了
```

本实验给执行工具套四层安检，全部走真实 MCP 协议：写文件（自动语法校验）、改文件（diff 预览）、跑 Python/跑 shell（黑名单+审批）、超长输出（截断+落盘）。日历和 GitHub 要真凭据，没有就标 blocked。

## 二、四层安检各拦什么？

```
第 1 层 输入验证：路径逃逸？命令注入？参数格式对吗
  → 错了立刻拒，不"智能修正"（4-2 参数保真原则）

第 2 层 权限控制：沙盒目录 + 命令黑名单
  → rm -rf /、dd、mkfs、sudo、curl|sh：一律拒绝，没得谈

第 3 层 审批：高风险操作问第二个模型
  → 改写已有文件、删文件：LLM 看一眼再放行
  → 审批者 unreachable 默认拒绝（fail closed）

第 4 层 校验反馈：写完验一遍
  → .py 过 py_compile，.js 过 node --check
  → 不过：文件不落地，原样报错
```

黑名单是快但笨（字符串匹配能被绕过），审批是慢但聪明——两层互补，不是二选一。

## 三、审批者为什么老拒绝？

实测：第一版审批 prompt 只说"可逆或沙盒内才放行"，gemma4 把沙盒里的正常写文件也拒了——**它不知道沙盒的存在**。

修法：把事实写进 prompt（"所有路径锁死在一次性沙盒，黑名单已提前拦过破坏性命令"）+ temperature 设 0。之后正常写文件放行，`rm -rf /` 连审批都到不了（黑名单层直接毙）。

教训：**审批者的误判往往是信息不足，不是模型太笨**——先补上下文，再怪模型。这和"选错工具先查描述"是同一个道理。

## 四、长输出怎么处理？

超 200 行或 10000 字符：上下文只留头尾各 50 行，全量落盘，返回文件路径。

```
[long-output] truncated=true file=workspace/.outputs/1790587922753-code.log
```

这条路不依赖模型，纯离线。对应官方检查题：看输出要知道完整结果在哪——答案永远是"在文件里，不在截断里"。

## 五、Agent 实测：会写，不会验

`npm run agent` 让 gemma4 自己写文件跑流程，真实轨迹：

```
step 1: file_write 写了 hello_exec.py ✓（审批放行）
step 2: 重复写（去重拦截）
Answer: "……成功执行并验证，输出了 1, 4, 9, 16, 25"
```

真相：它一次 `code_interpreter` 都没调过。"1,4,9,16,25"是对的，但来自记忆，不是来自运行——**答案在说谎，轨迹在说真话**。

这正是官方检查题的本地版："生成文件内容错误，应该由哪一层发现问题？"——答案：看轨迹，不看总结。工具链通了不等于 Agent 靠谱。

## 六、实测成绩单

`npm run eval`（6 项验收门）：

```
✓ 写文件+语法校验通过
✓ 坏 Python 被拒且文件未落地
✓ 黑名单拦 rm -rf /
✓ 改不存在的字符串干净失败、原文件不动
✓ 长输出截断+落盘
✓ 审批链路被触发（reviewer=gemma4:latest）
6/6 通过
```

`npm run demo`：写→坏文件被拒→跑→改（diff 预览）→ 长输出截断 → 黑名单 → 外部 blocked——全流程离线可跑（审批关）。

## 七、本实验怎么跑

```bash
npm run smoke     # 协议冒烟：list → 写 → 跑（断言 6*7=42）
npm run demo      # 全流程演示（审批关，离线）
npm run eval      # 6 项验收门（审批开，需 Ollama）
npm run agent     # Agent 开车（审批开，需 Ollama）
npx tsx src/main.ts run virtual_terminal command="echo hi"
npx tsx src/main.ts run file_write path=a.txt content=hi
```

`--no-approval` 只许在一次性目录的演示里用，别碰真实工作区。

## 八、核心代码结构

```
4.execution-tools/
├── src/
│   ├── safety.ts        # 沙盒/黑名单/风险分级/LLM 审批/语法校验/截断落盘
│   ├── tools-files.ts   # file_write / file_edit（校验+审批+reviewer 回执）
│   ├── tools-exec.ts    # code_interpreter / virtual_terminal（黑名单+审批+截断）
│   ├── tools-external.ts# calendar_add / github_create_pr（blocked，不造假）
│   ├── catalog.ts       # 6 工具注册表
│   ├── server.ts        # MCP Server（底层 Server + 手写 Schema）
│   ├── client.ts        # MCP Client（stdio 拉起 + list/call + 收据）
│   ├── smoke.ts         # 四段式协议验证（含执行断言）
│   ├── agent.ts         # Ollama 开车（去重；审批强制开）
│   └── main.ts          # CLI（list/demo/code/shell/write/edit/eval/agent）
├── workspace/           # 一次性沙盒
└── catalog_receipt.json # 协议收据（含 mcp_sdk_version）
```

## 九、关键洞察

1. **安检分层**：黑名单快而笨，审批慢而聪明，校验管售后——各拦各的
2. **默认拒绝**：审批者失联、输出解析失败，一律按拒绝处理
3. **写前校验**：坏文件不落地，报错里带上校验原文，反馈闭环才转得起来
4. **截断要留地址**：头尾 50 行 + 落盘路径，缺一不可
5. **看轨迹不看总结**：Agent 的"成功了"可能是编的，tool 调用记录才是证据

## 十、官方正文补充要点（执行部分）

以下来自官方 book/chapter4.md，核对实现：

- **提议者-审核者**：审批模型最好换家族同水平（认知多样性）；本实验同模型是降级实现，文档里写明
- **事前审批 vs 事后验证**：审批拦执行前，验证管执行后（如渲染看排版、沙盒跑配置）——本实验两者都有
- **沙盒分级**：venv 不算沙盒；进程 < Docker < microVM；本实验是工作区沙盒（可信本地档），生产上容器
- **幂等与两段式**：邮件/转账不可幂等，要预检-确认；本实验外部工具直接 blocked，连第一段都不走
- **静默修正禁令**：本实验 edit 找不到字符串直接失败，绝不模糊匹配——呼应 4-2 参数保真

## 十一、常见问题

- **审批总拒绝**：先看 prompt 里有没有告诉它沙盒事实；再看 temperature 是否为 0
- **审批总通过**：抽查 reviewer 回执（metadata.receipt），确认链路真走了而不是被 `--no-approval` 绕过
- **长输出文件在哪**：`workspace/.outputs/`，返回值的 `stdoutFile` 字段
- **换沙盒目录**：`EXECUTION_ROOT` 或 `--workspace`，只许一次性目录
- **桌面/Android 真机探针**：要 Xvfb/Docker/KVM，本实验没做——官方列为重型验收，诚实略过
