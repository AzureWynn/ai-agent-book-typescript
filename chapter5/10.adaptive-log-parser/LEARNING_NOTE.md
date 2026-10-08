# Chapter 5-10：自适应日志解析 · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**日志换格式了别报错，让 Agent 现场写个解析器，通过测试就上岗。**

```
一行日志进来
  → 引擎按顺序问已注册解析器：认识吗？
  → 都摇头 → 把样本+报错交给 Agent
  → Agent 写出 def parse(line) -> dict | None
  → 自动测试：必需字段全吗？空吗？
  → 通过 → 注册 + 存盘，下次直接用，不再问 Agent
```

## 二、为什么必须有"自动测试"这道门？

没有它，闭环就是"模型说什么就是什么"——错解析器进注册表，污染后面所有数据。测试是唯一的客观关：

```
pipe 格式要 5 个键：timestamp / level / module / step / message
bracket 格式要 6 个键：timestamp / level / tool / latency_ms / status / message
缺一个、空一个，都算不过
```

测试不过就把失败报告喂回去重写，最多 3 次。3 次还不过就认失败——重试预算本身也是设计。

## 三、热更新和持久化是两回事

```
热更新：本次运行内注册，立刻能用（import 级别）
持久化：写进 parsers/*.py，重启后 loadPersisted() 读回，不再问 Agent
```

演示最后一步专门起个全新引擎，只从 `parsers/` 加载，混合流 6/6 全过——证明"学会"的东西真的留下来了，不是本次运行的内存幻觉。

## 四、预置解析器不是作弊吗？

`--offline` 模式用预置代码代替现场生成，看起来像作弊，但分得清：

```
在线模式测的是：模型能不能写对（gemma4 实测两种格式各 1 次过）
离线模式测的是：失败检测→测试→热加载→持久化，这条机制本身
```

两条路径测的是不同东西，`--offline` 存在的意义是：没 Key 也能验证机制。文档里写明哪个模式测什么，不混着报数。

## 五、安全红线

Agent 生成的代码是直接执行的（importlib 级别），本实验三条约束：

```
1. prompt 约束：只用 re/json 标准库，无副作用，导入不执行
2. 运行环境：教学机，parsers/ 目录 gitignored、可随时清空
3. 生产要换：沙箱 + AST 白名单 + 资源限制（官方原话）
```

## 六、本实验怎么跑

```bash
npm run demo              # 完整闭环：JSON 原生 → A 自愈 → B 自愈 → 持久化复用（需 Ollama）
npm run demo -- --offline # 预置解析器版本，无需 Ollama
npm run demo -- --quick   # 只跑格式 A
npm run eval              # 自愈成功率 + 持久化复用表
```

注意：`npm run demo -- --offline`——npm 吃掉第一层参数，要双破折号透传。

## 七、核心代码结构

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

## 八、关键洞察

1. **测试是闭环的锁**——没有客观验收，生成什么都敢入库
2. **热更新 ≠ 持久化**——一个管本次，一个管重启，分开验证
3. **失败样本+报错一起给**——Agent 需要知道"怎么错的"才能改对
4. **重试预算写死**——3 次是设计，不是拍脑袋；超了就认失败
5. **离线版测机制，在线版测模型**——两个模式，两个结论，别混报

## 九、常见问题

- **Ollama 没起**：在线模式直接报错；加 `--offline` 走预置版
- **3 次都不过**：看 tester 的失败报告（缺哪个键），八成是字段名对不上；也可重跑（模型有随机性）
- **parsers/ 越堆越多**：demo/eval 开头会清空；手工删也行（gitignored）
- **想加新格式**：照 samples.ts 加样本 + 必需字段，调一次 selfHeal 即可
