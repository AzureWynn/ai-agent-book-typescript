# conversational-ui / 对话式 UI 定制

> Chapter 5-14 · 官方 `chapter5/conversational-ui` 的本地教学版

← [返回第5章目录](../README.md)

## 这个实验在学什么

官方"第一次阅读顺序"第 3 步：把 Starter 编码循环用于可见产物。用户一句话提 UI 需求（颜色/文案/字号），Agent 改 React 源码，构建验证通过即生效——"代码变化是否满足用户需求"，机器说了算。

## 快速开始

```bash
cd chapter5/14.conversational-ui
npm install
npm install --prefix frontend   # 夹具站点的 React+Vite 依赖
cp .env.example .env
npm run demo                    # T1 全轨迹（需 Ollama 运行）
npm run eval                    # 三任务对照表（需 Ollama 运行）
```

跑完 frontend 自动重置回初始态，可重复跑。`frontend/dist` 为构建产物，不提交。

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 整文件改写比零散 edit 稳：小文件上"定位+改写"合成一步，T1 diff 精确到 1 行。
- 白名单两行配置就是"执行边界"的最小形态；畸形项丢弃、白名单外抛错。
- "其他不动"翻成正向检查：旧值必须消失 + 新值出现；`vite build` 当客观裁判。

## 目录结构

```
src/
  agent.ts    customize（读白名单源码→模型整文件改写→sanitize）
  verify.ts   落盘 + 行级 diff + vite build
  tasks.ts    三任务 + 断言 + 最多3轮重试
  main.ts     demo/eval 入口 + 夹具重置
frontend/     最小 Vite+React 站点（App.jsx + theme.css 可改）
```

## 核心实现讲解

- `customize`：白名单文件全文 + 需求一次发给模型，返回 ` ```file:路径 ` 块；`sanitize` 丢弃形状不对的项，白名单外抛错（官方三类畸形测试的本地对应）。
- `runTask`：落盘 → 内容断言（must/mustNot）→ `vite build`；不过则把"哪项没过"回灌，最多 3 轮。
- 文本协议（沿用 0.coding-agent 教训）：few-shot 首轮示范 + "你有手"规则，不给模型留写教程的缝。

## 实测结果（gemma4，Ollama 本地）

```
T1 按钮变蓝  按钮蓝色  ✓  命中
T1 按钮变蓝  vite构建  ✓  built
T2 改标题文案  标题已换  ✓  命中
T2 改标题文案  vite构建  ✓  built
T3 标题放大  字号40  ✓  命中
T3 标题放大  vite构建  ✓  built
```

三任务全部 1 次尝试通过；T1 diff 仅改 1 行，T2/T3 各只碰一个文件。

## 关键洞察

- 可见产物的循环比开放式生成稳——"长什么样"有编译器兜底。
- 自然语言否定约束（别碰 X）必须翻成正向检查，否则验不了。

## 注意事项

- 需 Ollama 运行；frontend 依赖需单独安装（`npm install --prefix frontend`）。
- 整文件改写对大文件费 token，本实验小文件够用。
- 仅改白名单内文件，教学机执行。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/conversational-ui`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码作为生成式 UI 一节）
