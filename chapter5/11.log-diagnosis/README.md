# log-diagnosis / 日志诊断与回归

> Chapter 5-11 · 官方 `chapter5/log-diagnosis` 的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

诊断三件套：读生产轨迹定位根因 → 生成回归测试用例（断言 DSL）→ 同一输入在修前/修后重放验证翻转。投递动作换成本地 Issue 草稿（有 token 照草稿投递）。

## 快速开始

```bash
cd chapter5/11.log-diagnosis
npm install
cp .env.example .env
npm run demo                    # S1 全链（需 Ollama 运行）
npm run eval                    # 三场景对照表（需 Ollama 运行）
```

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 诊断 4/4 全中：读轨迹找偏离是小模型干得好的活。
- S3 臆造"退款须查库存"：prompt 写"不要臆造"也拦不住加戏。
- 用例看手艺：param 格式错、期望写反的用例比没用例更坏；翻转才是及格线。

## 目录结构

```
src/
  sut.ts         被测系统仿真（buggy/fixed 双版本，三场景）
  diagnoser.ts   两调：诊断 JSON + 用例 JSON（围栏鲁棒提取）
  replay.ts      断言 DSL 求值 + 重放翻转
  issue.ts       Issue 草稿投递（MCP 的本地替代）
  main.ts        demo/eval 入口
data/
  architecture.md / prd.md / trajectories.jsonl
```

## 核心实现讲解

- `runTask(input, fixed)`：R1 缺前置校验 / R2 无退避误报成功 / R3 超时无降级，只在 buggy 版复现。
- 断言 DSL 四类型：step_present / tool_succeeds（含"多次失败误报成功"专检）/ latency_under / final_status_is；用例类型非法直接丢弃。
- `replay`：同一输入双版本求值，`!buggy.pass && fixed.pass` 才算翻转。

## 实测结果（gemma4，Ollama 本地）

```
S1 退款网关抖动  诊断2/2  用例2条  翻转1/2
S2 库存超时      诊断1/1  用例1条  翻转0/1（param格式错）
S3 正常退款      诊断1/1+1臆造  用例2条  翻转1/2
```

## 关键洞察

- 诊断看眼力（找偏离模型行），用例看手艺（DSL 语义模型弱）——两阶段难度不对称。
- 每个诊断问题应强制引用轨迹轮次号，否则臆造混进来验不出。

## 注意事项

- 需 Ollama 运行；无外部 API 依赖。
- GitHub 真实 Issue 未创建（需 token），草稿格式照官方脱敏收据。
- 轨迹为确定性仿真，非生产实录；结论限机制验证。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/log-diagnosis`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码作为系统适配器一节）
