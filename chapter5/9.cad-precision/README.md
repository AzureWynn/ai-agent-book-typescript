# cad-precision / CAD 参数化精度

> Chapter 5-9 · 官方 `chapter5/cad-vs-diffusion` 的 CAD 臂本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

同一法兰盘规格，代码路线（CadQuery 参数化）vs 生成路线：建模 6 项全尺寸核验，M5→M6 变更只改 1 个参数、0 LLM 调用、其余零漂移。适用边界：精度任务代码赢。

## 快速开始

```bash
cd chapter5/9.cad-precision
npm install
python3 -m venv .venv && .venv/bin/pip install cadquery  # 一次，需联网
cp .env.example .env
npm run demo                    # M5 建模测量（需 Ollama 运行）
npm run eval                    # M5→M6 修补漂移表（需 Ollama 运行）
```

CadQuery 首次 import 慢（约 1 分钟），属正常。

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 小模型不会 CadQuery API：给 8 行骨架只填值，3 连挂变 1 次建成。
- 测量器必须独立：包围盒+圆柱面 6 项几何真值，不听模型自称。
- 变更 1 行 0 调用、漂移全 0；审美任务反过来（引用官方绿植对照）。

## 目录结构

```
src/
  spec.ts    M5/M6 规格 + 变更请求 + 代码生成 prompt（含骨架）
  cad.ts     生成→执行导出→测量→单点修补
  main.ts    demo/eval 入口 + 漂移表
work/        生成的 flange_m5/m6.py（git 忽略）
.venv/       CadQuery 环境（git 忽略，需自建）
```

## 核心实现讲解

- `generateCode`：` ```python ` 围栏提取；执行报错回灌最多 3 轮（裸 prompt 修不好，骨架版 1 次过）。
- `MEASURE`：包围盒（外径/厚度/底面）+ CYLINDER 面（孔数/孔径/孔位圆直径）。
- `patchHoleDiameter`：正则只改 `hole_diameter` 数值，返回修补记录（行数/LLM 调用）。

## 实测结果（gemma4 + CadQuery 2.8 本地）

```
M5 建模：6/6 通过
单点修补：5.5→6.5，改 1 行，LLM 调用 0 次
M6 建模：6/6 通过
漂移：外径 0 / 厚度 0 / 孔数 0 / 孔位圆 0（全 ✓）
B臂引用官方：4 通孔全丢、外径偏差−99.4%、M6 变更漂移+283%
```

## 关键洞察

- 参数是锚，代码是船：变更只动锚，船不动就不漂。
- 弱模型 + 生僻 API 必须给骨架——考思想不考 API 记忆。

## 注意事项

- 需 Ollama 运行 + 自建 `.venv`（`cadquery` 约数百 MB，装一次）。
- B臂未跑（需 HF Space），结论引用官方；审美侧结论以官方绿植对照为准。
- 仅教学机执行。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/cad-vs-diffusion`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码作为思考工具一节）
