# codified-rules / 小模型代码化规则

> Chapter 5-5 · 官方 `chapter5/small-model-codified-rules` 的本地教学版（8 题可读子集）

← [返回第5章目录](../README.md)

## 这个实验在学什么

同一政策，两种落地：control 只给自然语言（执行天真），codified 加 checklist 工具描述 + `expected_*` 自报 + 服务端真值校验。8 个订退票 case 配对跑，看代码化规则能不能让小模型少违规。

## 快速开始

```bash
cd chapter5/5.codified-rules
npm install
cp .env.example .env
npm run demo                    # R009 改签陷阱双臂（需 Ollama 运行）
npm run eval                    # 8 case×双臂对照表（需 Ollama 运行，约 10 分钟）
```

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- R009：control 违规退款，codified 自报照错但执行被拦——checklist 管不住嘴，代码管得住手。
- 空 FINAL 现象：拦住了钱，没拦住嘴——校验修动作正确性，不修服务完整性。
- 8 题差 1 题说明不了显著性；价值在配对质性差异，不在数字。

## 目录结构

```
src/
  env.ts     服务端真值（政策 + 天真/代码化取消）
  tasks.ts   8 case（4 可退 + 4 不可退，含谎言/边界/轻微延误/改签陷阱）
  agent.ts   双臂 ReAct 循环 + 连拒升级护栏 + 评分
  main.ts    demo/eval 入口
```

## 核心实现讲解

- `cancelCodified`：自报与真值不符、或真值不可退，一律拒绝并说明真值——服务端是最后的锁。
- 连拒升级：同一拒绝连吃 2 次，追加"别再试 cancel，直接 FINAL 解释"——生产级"连续失败升级"的最小形态。
- `score`：该退看退没退；不该退要"没退 + 解释/替代"双全，光不退不吭声（白卷）记错。

## 实测结果（gemma4，Ollama 本地）

```
R001 可退  ✓/✓   R005 不可退  ✓/✓（双臂顶住谎言）
R003 可退  ✓/✓   R006 不可退  ✗/✗（双臂白卷）
R004 可退  ✓/✓   R007 可退  ✓/✓
R008 不可退  ✗/✓（codified 解释）  R009 不可退  ✗/✗（control违规退款/codified拦截但白卷）

control 5/8 vs codified 6/8（官方 60 题：91.7% vs 95.0%，p=0.6875 未显著）
```

## 关键洞察

- 政策三层缺一不可：写清楚 + 强制查真值 + 服务端校验。
- 自然语言有效时很有效（R005），上头时全失效（R009）——方差本身就是结论。

## 注意事项

- 需 Ollama 运行；无外部 API 依赖。
- 8 题子集，显著性别碰；60 题全矩阵结论以官方为准。
- 文本 ReAct 协议（沿用 0.coding-agent 教训：few-shot + 禁写教程）。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/small-model-codified-rules`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（Harness 工程一节）
