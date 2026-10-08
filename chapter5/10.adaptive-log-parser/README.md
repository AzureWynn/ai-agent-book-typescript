# adaptive-log-parser / 自适应日志解析系统

> Chapter 5-10: 新格式不报错——Agent 现场写解析器，测试通过就热更新上岗
> 对应《AI Agent 开发实战》第 5 章实验 5-10（官方 README 标题作 5-7，章节索引表作 5-10，此处跟索引表）

← [返回第 5 章目录](../README.md)

## 这个实验在学什么

对应官方实验 5-10：**自适应的日志解析系统**。本仓库为 **TypeScript 实现**：解析引擎（内置 JSON + 注册表）遇到新格式不报错，把失败样本交给 gemma4 写 `def parse(line)`，自动测试（必需字段结构断言）通过后热加载注册并持久化到 `parsers/`，新引擎冷启动直接复用。三种日志格式：JSON 行（原生）、竖线分隔（新 A）、嵌套括号（新 B）。

## 快速开始

```bash
npm install
npm run demo              # 完整闭环：原生 → A 自愈 → B 自愈 → 持久化复用（需 Ollama 运行）
npm run demo -- --offline # 预置解析器版本，无需 Ollama
npm run demo -- --quick   # 只跑格式 A
npm run eval              # 自愈成功率 + 持久化复用表
```

## 教学笔记

更详细的讲解（测试为什么是锁、热更新≠持久化、预置版测什么、安全红线）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
10.adaptive-log-parser/
├── src/
│   ├── types.ts     # ParseAttempt / TestReport / HealResult
│   ├── samples.ts   # 三种格式样本 + 必需字段表
│   ├── pyrun.ts     # python3 子进程执行 + 写文件
│   ├── engine.ts    # 注册表 + 内置 JSON + 文件解析器调用 + 持久化/加载
│   ├── agent.ts     # gemma4 写 parse()（含失败反馈）+ 预置版
│   ├── tester.ts    # 结构断言：必需字段全且非空
│   └── main.ts      # 自愈闭环 + demo/eval/quick
├── parsers/         # 学会的解析器（运行时生成，gitignored）
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 自愈闭环（main.ts selfHeal）

先确认真失败（已有解析器能处理就跳过）→ 最多 3 次"生成→测试→失败反馈" → 通过则持久化 + 热注册 → 用同一样本复验。`required_keys` 是验收标准，换格式就换它。

### 2. 跨语言调用（engine.ts）

TS 引擎调 Python 解析器：写文件 → `python3 -c` 里 `importlib` 按路径加载 → 调 `parse(line)` → stdout 取 JSON。null/异常/非对象一律按"不认识"处理，继续试下一个解析器。

### 3. 测试即契约（tester.ts）

不断言具体值，只断言结构：必需字段全在且非空。格式 A 要 5 个键，格式 B 要 6 个键。字段名对不上（比如把 `module` 写成 `service`）就过不了——这正是要拦的东西。

## 实测结果（gemma4）

`npm run demo`：JSON 原生直解；A、B 各 1 次尝试自愈成功；全新引擎从 `parsers/` 加载后混合流 6/6。

`npm run eval`：自愈成功 2/2，持久化复用 6/6。

**解读**：两种格式一次过，说明约束写到位时（只用 re/json、字段清单明确）这类"翻译型"代码生成对当前模型不难。重试预算一次没用上——运气成分有，机制完整才是重点。

## 关键洞察

1. **测试是闭环的锁**——没有客观验收，生成什么都敢入库
2. **热更新 ≠ 持久化**——分开验证，后者是"学会"的证明
3. **失败样本+报错一起给**——Agent 需要知道怎么错的
4. **离线版测机制，在线版测模型**——两个结论别混报
5. **生成代码直接执行只许教学机**——生产换沙箱 + AST 白名单

## 注意事项

- 在线模式需要 Ollama 运行 + `gemma4:latest`；无 Key 用 `--offline`（注意 npm 透传要双破折号）
- 生成的代码经 `importlib` 直接执行，仅限可信实验环境
- `parsers/` 运行时生成，已 gitignore；demo/eval 开头会清空
- 3 次不过就认失败，重跑即可（模型有随机性）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[adaptive-log-parser](https://github.com/bojieli/ai-agent-book/tree/main/chapter5/adaptive-log-parser)
- 官方 Book 相关章节：[第 5 章 · Coding Agent 与通用 Agent](https://bojieli.github.io/ai-agent-book/chapter5/)
