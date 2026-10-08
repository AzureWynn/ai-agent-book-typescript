# dynamic-form / 动态表单意图澄清

> Chapter 5-12 · 官方 `chapter5/dynamic-form` 的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

信息不全时不逐条追问：Agent 动态生成含级联逻辑的 HTML 表单，用户一次提交补全，汇总 JSON 交回 Agent 继续任务。完整链条：**生成 → 静态校验 → 真执行 → 摘要**，双臂对照（模型生成 vs 确定性渲染）。

## 快速开始

```bash
cd chapter5/12.dynamic-form
npm install
cp .env.example .env
npm run demo                    # 在线臂全流程（需 Ollama 运行）
npm run eval                    # 双臂门禁对照表（需 Ollama 运行）
```

真执行用 jsdom（无 Chromium 也能跑模型的 JS）；与官方 Playwright 版的差异见"注意事项"。

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- jsdom 是诚实降级：无渲染但模型的 JS 真被执行，填值/级联/提交一步不省。
- 测动态行为先等对时序：`DOMContentLoaded` 异步，不等就是假阴性。
- 契约靠重试执行：门禁漏完整性模型就交片段，加进重试条件后一次交齐。

## 目录结构

```
src/
  prompts.ts   表单/摘要提示词 + 提交值 + 去围栏
  offline.ts   确定性 schema 渲染器（show_when + options_when）
  validate.ts  六项静态校验（鲁棒匹配）
  execute.ts   jsdom 真执行（显隐→填值→提交→读#result）
  online.ts    在线臂（生成→校验→重试→执行→摘要）
  main.ts      demo/eval 入口 + 七道门禁
```

## 核心实现讲解

- `validateForm`：官方 BeautifulSoup 版的正则对应——字段 name、radio 值、脚本里"往返+返程引用+显示控制"三者同现才算级联。
- `executeForm`：等 readyState → 断言默认隐藏 → 填城填日 → 切往返 → 断言可见 → 填返程 → 派发 submit（jsdom 无 requestSubmit，语义等价）→ 读 `#result` JSON → 计数恰一次。
- `runOnlineArm`：静态/完整性不过就回灌点名重发，最多 3 轮；payload 原样喂第二调出摘要。

## 实测结果（gemma4，Ollama 本地）

```
online(模型生成)  7/7 全过（含 1 次完整性重试，5531 字符完整文档）
offline(确定性渲染)  7/7 全过（零模型调用）
```

两臂 payload 4 字段与预期一致，提交恰一次，摘要含北京/上海/去返程日期。

## 关键洞察

- 静态校验看"有没有"，真执行看"动不动"——级联逻辑必须跑起来验。
- 自然语言验收先归一化再匹配（"8月11日"无前导零）。

## 注意事项

- 需 Ollama 运行；无外部 API 依赖。
- jsdom 替代 Chromium：visibility 只认内联 style，无真实渲染，结论限于逻辑正确性。
- 离线臂摘要走确定性模板，只验闭环，不计模型能力。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/dynamic-form`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码作为系统适配器一节）
