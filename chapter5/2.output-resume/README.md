# output-resume / 流式中断接续

> Chapter 5-2 · 官方 `chapter5/provider-failover` 中 5-2 部分的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

流式输出到一半断掉，怎么恢复最划算：整轮重发（resend）、半截作前缀续写（prefill）、元指令断点续（meta），在 text 与 tool_args 两种断点上对照。reasoning 断点本地 N/A（无独立思考通道）。

## 快速开始

```bash
cd chapter5/2.output-resume
npm install
cp .env.example .env
npm run demo                    # text 断点三策略各一次（需 Ollama 运行）
npm run eval                    # 双断点×三策略×2轮对照表（需 Ollama 运行）
```

token 用 Ollama 真实 `eval_count`；断点固定 120 字真流掐断。

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 本地结论和官方反过来：小模型续写会复述前缀，prefill 反而多花 21%+——省的前提是模型只写后半截。
- 恢复 12/12 全成功；要省用 resend，要首字快用 prefill，meta 本地垫底。
- JSON"合法≠正确"分开记；temp 0 下 repeats 是验稳定不是测方差。

## 目录结构

```
src/
  stream.ts      真流掐断（120字）+ 单次调用（取 eval_count）
  strategies.ts  三恢复策略
  judge.ts       恢复/合法/正确三列判定
  main.ts        demo/eval 入口 + 节省率对照表
```

## 核心实现讲解

- `streamUntil`：`stream:true` 攒够 120 字即 break（固定位置断点，诚实声明）。
- `prefill`：半截作末尾 assistant 消息 + 紧接续写 hint；`meta`：只给断点前后 60 字描述。
- `judge`：text 看"不重复前缀尾 + 含剩余段落"；json 看 `JSON.parse` + 四字段对参考值。

## 实测结果（gemma4，Ollama 本地）

```
text       resend  580（基准）  prefill 702（-21%）  meta 760（-31%）  恢复6/6
tool_args  resend  183（基准）  prefill 410（-124%） meta 399（-118%） 合法正确6/6
```

## 关键洞察

- 省 token 是模型行为红利，不是 harness 保证——harness 只能给机会，模型不配合就倒贴。
- 拼接风险与节省同源：prefill 的复述既费 token 又可能带偏 JSON，短 JSON 本实验没爆不等于没风险。

## 注意事项

- 需 Ollama 运行；无外部 API 依赖。
- reasoning 断点 N/A；结论限 temp 0 确定性小模型，大模型行为以官方为准。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/provider-failover`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（故障与错误恢复一节）
