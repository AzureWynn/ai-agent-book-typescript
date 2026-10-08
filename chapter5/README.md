# Chapter 5 —— Coding Agent 与代码生成

本目录对应《AI Agent 开发实战》第 5 章，包含多个独立实验。每个实验是一个独立子目录，自带 `package.json` 与依赖。

对应章节正文：[第 5 章 · Coding Agent 与通用 Agent](https://bojieli.github.io/ai-agent-book/chapter5/)

## 实验列表

| 实验 | 主题 | 状态 | 技术栈 |
| --- | --- | --- | --- |
| [0.coding-agent](0.coding-agent/README.md) | Starter：最小 Coding Agent（无编号） | ✅ 完成 | TypeScript + Ollama + 七工具主循环 |
| [1.trajectory-handoff](1.trajectory-handoff/README.md) | 实验 5-1：跨厂商轨迹接管 | ✅ 完成 | TypeScript + Ollama 双接口形状 + 三臂 |
| [2.output-resume](2.output-resume/README.md) | 实验 5-2：流式中断接续 | ✅ 完成 | TypeScript + Ollama 真流掐断 + 三策略 |
| [5.codified-rules](5.codified-rules/README.md) | 实验 5-5：小模型代码化规则 | ✅ 完成 | TypeScript + Ollama + 服务端真值校验 |
| [11.log-diagnosis](11.log-diagnosis/README.md) | 实验 5-11：日志诊断与回归 | ✅ 完成 | TypeScript + Ollama + 重放翻转 |
| [15.permission-objects](15.permission-objects/README.md) | 实验 5-15：权限内嵌数据对象 | ✅ 完成 | TypeScript + Ollama + SQLite 六层强制 |
| [9.cad-precision](9.cad-precision/README.md) | 实验 5-9：CAD 参数化精度（CAD 臂） | ✅ 完成 | TypeScript + Ollama + CadQuery 测量 |
| [8.video-edit](8.video-edit/README.md) | 实验 5-8：自然语言视频剪辑 | ✅ 完成 | TypeScript + Ollama Vision + ffmpeg |
| [6.paper-to-ppt](6.paper-to-ppt/README.md) | 实验 5-6：论文转幻灯片 | ✅ 完成 | TypeScript + Ollama Vision + matplotlib |
| [4.code-for-logic](4.code-for-logic/README.md) | 实验 5-4：逻辑谜题约束求解 | ✅ 完成 | TypeScript + Ollama + Python 沙箱 |
| [3.code-for-math](3.code-for-math/README.md) | 实验 5-3：代码辅助数学解题 | ✅ 完成 | TypeScript + Ollama + Python 沙箱 |
| [10.adaptive-log-parser](10.adaptive-log-parser/README.md) | 实验 5-10：自适应日志解析 | ✅ 完成 | TypeScript + Ollama 代码生成 + 热更新 |
| [13.erp-agent](13.erp-agent/README.md) | 实验 5-13：ERP 自然语言转 SQL | ✅ 完成 | TypeScript + SQLite + artifact 模式 |
| [16.agent-creator](16.agent-creator/README.md) | 实验 5-16：Agent 造 Agent | ✅ 完成 | TypeScript + 双臂生成 + 六道门禁 |
| [14.conversational-ui](14.conversational-ui/README.md) | 实验 5-14：对话式 UI 定制 | ✅ 完成 | TypeScript + Ollama + React 整文件改写 |
| [12.dynamic-form](12.dynamic-form/README.md) | 实验 5-12：动态表单意图澄清 | ✅ 完成 | TypeScript + Ollama + jsdom 真执行 |

## 快速开始

```bash
# 最小 Coding Agent（Starter，无编号，官方阅读顺序第 2 步）
cd 0.coding-agent
npm install
npm run demo                        # T1 全轨迹（需 Ollama 运行）
npm run eval                        # T1+T2 验收表（需 Ollama 运行）

# 跨厂商轨迹接管（5-1）
cd 1.trajectory-handoff
npm install
npm run demo                        # neutral 臂全轨迹（需 Ollama 运行）
npm run eval                        # 三臂对照表（需 Ollama 运行）

# 流式中断接续（5-2）
cd 2.output-resume
npm install
npm run demo                        # text 断点三策略（需 Ollama 运行）
npm run eval                        # 双断点×三策略对照表（需 Ollama 运行）

# 小模型代码化规则（5-5）
cd 5.codified-rules
npm install
npm run demo                        # R009 双臂（需 Ollama 运行）
npm run eval                        # 8 case×双臂对照表（需 Ollama 运行）

# 日志诊断与回归（5-11）
cd 11.log-diagnosis
npm install
npm run demo                        # S1 全链（需 Ollama 运行）
npm run eval                        # 三场景对照表（需 Ollama 运行）

# 权限内嵌数据对象（5-15）
cd 15.permission-objects
npm install
npm run demo                        # 1 accept + 3 reject（无需 Ollama）
npm run eval                        # 操作批 + 8 攻击（需 Ollama 运行）

# CAD 参数化精度（5-9 CAD 臂）
cd 9.cad-precision
npm install
python3 -m venv .venv && .venv/bin/pip install cadquery
npm run demo                        # M5 建模测量（需 Ollama 运行）
npm run eval                        # M5→M6 修补漂移表（需 Ollama 运行）

# 自然语言视频剪辑（5-8）
cd 8.video-edit
npm install
python3 -m venv .venv && .venv/bin/pip install pillow
npm run demo                        # 冲浪全链（需 Ollama 运行）
npm run eval                        # 双需求对照表（需 Ollama 运行）

# 论文转幻灯片（5-6）
cd 6.paper-to-ppt
npm install
python3 -m venv .venv && .venv/bin/pip install pymupdf matplotlib pillow
npm run prep                        # 下载校验 PDF（需联网）
npm run demo                        # 双臂全链（需 Ollama 运行）
npm run eval                        # 单 vs 双对照表（需 Ollama 运行）
```
```
```
```
```

```bash
# 逻辑谜题约束求解（5-4）
cd 4.code-for-logic
npm install
npm run solver                      # 离线约束求解基线（无需 Ollama）
npm run demo                        # 单题三模式追踪（需 Ollama 运行）
npm run eval                        # pure vs code 对照表（需 Ollama 运行）

# 代码辅助数学解题（5-3）
cd 3.code-for-math
npm install
npm run selfcheck                   # 参考解跑沙箱对真值（无需 Ollama）
npm run demo                        # 单题双模式追踪（需 Ollama 运行）
npm run eval                        # cot vs code 对照表（需 Ollama 运行）

# 自适应日志解析（5-10）
cd 10.adaptive-log-parser
npm install
npm run demo                        # 完整自愈闭环（需 Ollama 运行）
npm run demo -- --offline           # 预置版，无需 Ollama
npm run eval                        # 自愈成功率 + 持久化复用表

# ERP 自然语言转 SQL（5-13）
cd 13.erp-agent
npm install
npm run gold                        # 标准 SQL 跑 10 题（无需 Ollama）
npm run demo                        # Q2 + Q6 双题展示（需 Ollama 运行）
npm run eval                        # 10 题全跑（需 Ollama 运行）

# Agent 造 Agent（5-16）
cd 16.agent-creator
npm install
npm run demo                        # 双臂全流程（需 Ollama 运行，约 10 分钟）
npm run eval                        # 同 demo + 对照表 + comparison.json

# 对话式 UI 定制（5-14）
cd 14.conversational-ui
npm install
npm install --prefix frontend       # 夹具站点依赖
npm run demo                        # T1 全轨迹（需 Ollama 运行）
npm run eval                        # 三任务对照表（需 Ollama 运行）

# 动态表单意图澄清（5-12）
cd 12.dynamic-form
npm install
npm run demo                        # 在线臂全流程（需 Ollama 运行）
npm run eval                        # 双臂门禁对照表（需 Ollama 运行）
```

## 架构概览

```
5-1 跨厂商轨迹接管（三臂对照）：
┌─────────────────────────────────────────┐
│  A跑2工具 → 人为429 → 切B              │
│  直传搬杂质 / 剥离从头来 / 中立带叙事   │
│  熔断绑业务进展；轨迹存中立不存厂商格式 │
└─────────────────────────────────────────┘
```

**核心思想：切换时带叙事不带格式。**

```
Starter 最小编码循环（地基，后面每个实验都是它的一段）：
┌─────────────────────────────────────────┐
│  读/搜 → 补丁 → 测试 → 修复 → 验证      │
│  七工具：读/写/改/找文件/找内容/终端/执行│
│  状态栏每轮注入 + 格式错误回灌 + 指纹熔断│
└─────────────────────────────────────────┘
```

**核心思想：先有循环，再有智能。**

```
5-2 流式中断接续（三策略对照）：
┌─────────────────────────────────────────┐
│  120字真流掐断 → resend/prefill/meta    │
│  text 臂看恢复+省token；json 臂看合法≠正确│
│  小模型续写会复述：省是行为红利非保证    │
└─────────────────────────────────────────┘
```

**核心思想：省 token 是模型行为红利。**

```
5-5 小模型代码化规则（配对 8 题）：
┌─────────────────────────────────────────┐
│  control：自然语言政策 + 天真执行       │
│  codified：政策 + checklist + 自报      │
│            + 服务端真值校验（最后的锁） │
│  拦得住钱，拦不住嘴（空FINAL）          │
└─────────────────────────────────────────┘
```

**核心思想：约束优先于指导，校验修动作不修服务。**

```
5-11 日志诊断与回归（诊断三件套）：
┌─────────────────────────────────────────┐
│  读轨迹定位（R1/R2/R3）→ 生成回归用例  │
│  → 同输入修前修后重放，翻转才及格       │
│  诊断看眼力，用例看手艺                 │
└─────────────────────────────────────────┘
```

**核心思想：翻转才是回归测试的及格线。**

```
5-15 权限内嵌数据对象（生成自由执行不自由）：
┌─────────────────────────────────────────┐
│  模型只填操作参数，执行权在 store       │
│  租户→角色→状态机→跨字段→引用→反应     │
│  8 攻击各撞一层；副作用不禁但留痕       │
└─────────────────────────────────────────┘
```

**核心思想：模型负责想干什么，数据层负责允不允许。**

```
5-9 CAD 参数化精度（代码路线半边）：
┌─────────────────────────────────────────┐
│  模型填骨架 → 执行导出 → 6 项几何测量  │
│  M5→M6 改 1 行 0 调用，其余漂移全 0    │
│  参数是锚，代码是船                     │
└─────────────────────────────────────────┘
```

**核心思想：精度任务代码赢，变更只动锚。**

```
5-8 自然语言视频剪辑（提议审核闭环）：
┌─────────────────────────────────────────┐
│  合成4场景 → 解析 → 粗定位区间          │
│  → 细定位边界 → ffmpeg剪 → 抽帧审核     │
│  截图隔离在子调用，主上下文只收结论     │
└─────────────────────────────────────────┘
```

**核心思想：合成素材测循环，真实素材测眼力。**

```
5-6 论文转幻灯片（单/双臂对照）：
┌─────────────────────────────────────────┐
│  哈希 pin 的真实 PDF → 单臂/双臂出 6 页  │
│  matplotlib 渲染 → Vision 逐页打分      │
│  双臂省上下文，但丢全局视野（质量降）   │
└─────────────────────────────────────────┘
```

**核心思想：上下文隔离省钱不保质。**

```
5-4 逻辑谜题（三模式对照）：
┌─────────────────────────────────────────┐
│  solver（离线）：结构化陈述 → 穷举求解    │
│  └── 确定性 100%，验证"翻译+求解"本身    │
│                                         │
│  pure：题面 → 模型直答                   │
│  code：题面 → 模型写约束程序 → 跑 → 答   │
└─────────────────────────────────────────┘
```

**核心思想：把逻辑外包给确定性求解器。**

- 双条件约束：`X == (X 那句话的真值)`，一条规则管全部
- 穷举 2^n 种组合，心算再强也会漏，机器不会
- 正确性不再依赖模型推理强弱（弱模型增益最大）

```
5-3 代码辅助数学（双模式对照）：
┌─────────────────────────────────────────┐
│  cot：题面 → 模型心算 → 答               │
│  code：题面 → 模型写程序 → 跑 → 答       │
│  selfcheck：参考解跑沙箱对真值（离线）    │
└─────────────────────────────────────────┘
```

**核心思想：把计算外包给确定性执行。**

- 心算会错，代码不会——302 位数位和、12 万大数分解这种题，模型只能瞎编
- 建模错了程序照样错（m02 误用费马）——外包的是计算，不是理解
- 停机规则、答案格式、题库真值链，缺一不可

```
5-10 自适应日志解析（自愈闭环）：
┌─────────────────────────────────────────┐
│  新格式 → 解析失败 → Agent 写 parse()    │
│  → 自动测试（必需字段断言）→ 热更新注册  │
│  → 持久化 → 新引擎冷启动复用             │
└─────────────────────────────────────────┘
```

**核心思想：测试是进化的锁。**

- 没有客观验收，生成什么都敢入库
- 热更新管本次，持久化管重启，分开验证
- 离线版测机制，在线版测模型

```
5-13 ERP 自然语言转 SQL（artifact 模式）：
┌─────────────────────────────────────────┐
│  用户中文 → 模型写 SQL 制品              │
│  → 数据库执行 → 对独立参考实现           │
│  gold 验库 / reference 验分 / agent 练翻译│
└─────────────────────────────────────────┘
```

**核心思想：LLM 只产制品，机器管执行核对。**

```
5-16 Agent 造 Agent（双臂对照）：
┌─────────────────────────────────────────┐
│  从零：目标 + 契约 → 全文件自写          │
│  模板：目标 + 契约 + reference 全文 → 改 │
│  六道门禁：文件/密钥/编译/步数/测试/真跑 │
│  赢家规则：过门多者胜，同分比 token      │
└─────────────────────────────────────────┘
```

**核心思想：模板省协议，门禁按成本排序。**

```
5-14 对话式 UI 定制（可见产物验收）：
┌─────────────────────────────────────────┐
│  一句话需求 → 整文件改写白名单源码      │
│  → 内容断言（新值出现+旧值消失）        │
│  → vite build 通过即生效                │
└─────────────────────────────────────────┘
```

**核心思想：可见产物是最好的验收。**

```
5-12 动态表单意图澄清（一次提交胜追问）：
┌─────────────────────────────────────────┐
│  模糊请求 → 生成级联 HTML 表单          │
│  → 静态校验 → jsdom 真执行 → JSON 回交  │
│  → 摘要继续任务（在线/离线双臂）        │
└─────────────────────────────────────────┘
```

**核心思想：级联逻辑必须跑起来验。**

> 各实验使用不同的 LLM 后端，`.env` 各自独立，互不影响。
