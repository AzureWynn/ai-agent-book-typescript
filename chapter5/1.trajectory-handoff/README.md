# trajectory-handoff / 跨厂商轨迹接管

> Chapter 5-1 · 官方 `chapter5/provider-failover` 中 5-1 部分的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

跑到一半的 Agent 轨迹换一家接着跑：直传（原样搬运）、剥离（从头再来）、中立（文字带走+凭证丢弃+调用记名）。2 次工具调用后人为 429 触发切换，比切换后报错、完成度与重复调用。

## 快速开始

```bash
cd chapter5/1.trajectory-handoff
npm install
cp .env.example .env
npm run demo                    # neutral 臂全轨迹（需 Ollama 运行）
npm run eval                    # 三臂对照表（需 Ollama 运行）
```

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- strip 真浪费（重复 2 个、多两轮）；neutral 0 重复一次接上。
- direct 本地通过是假通过——同模型看得懂自家杂质，真厂商对里会被拒。
- 熔断绑业务进展（2 工具调用完成）不绑请求次数；格式不给逐字示范必跑偏。

## 目录结构

```
src/
  trace.ts      中立轨迹（思考双槽/调用指纹/结果）
  tools.ts      三确定性工具 + 总额标准答案 10600
  vendors.ts    A=chat形状 / B=generate形状 + 人为429
  renderers.ts  三臂渲染（直传/剥离/中立叙事）
  handoff.ts    切换主循环 + 重复指纹计数
  main.ts       demo/eval 入口
```

## 核心实现讲解

- `Trace`：官方 `neutral_trace.py` 对应——reasoning 留 credential 空槽（Ollama 无签名，如实声明），调用只记名+参数。
- `renderForB.neutral`：进展叙事 + 已知结果清单 + "不许重做"禁令，三句管住 0 重复。
- `tripOutage`：工具调用满 2 才跳闸，A 此后持续 429（三臂都不许回头）。

## 实测结果（gemma4，Ollama 本地）

```
direct   首请求200 数据齐✓ 总额对✓ 重复0 2轮/871token（本地假通过，真厂商对会被拒）
strip    首请求200 数据齐✓ 总额对✓ 重复2 4轮/1342token
neutral  首请求200 数据齐✓ 总额对✓ 重复0 2轮/933token
```

## 关键洞察

- 轨迹不该按任何一家接口格式存——中立格式的价值不在切换，在重放/训练/复盘都能用同一份。
- 总额对不对和接管质量是两回事（模型算术 vs 搬运质量），分开记。

## 注意事项

- 双"厂商"底下同一模型：结论限格式搬运与进展保留；真厂商互斥行为以官方六组合为准。
- 熔断人为注入，非真实故障；无外部 API 依赖，需 Ollama 运行。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/provider-failover`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（故障与错误恢复一节）
