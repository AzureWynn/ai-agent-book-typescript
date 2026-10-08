# permission-objects / 权限内嵌数据对象

> Chapter 5-15 · 官方 `chapter5/permission-embedded-data-objects` 的本地教学版（SQLite 替代 PG）

← [返回第5章目录](../README.md)

## 这个实验在学什么

应用层代码随便生成，数据层每次读写强制执行权限、校验、引用完整性与受控反应。模型只填操作参数，执行权在 store——生成自由，执行不自由。

## 快速开始

```bash
cd chapter5/15.permission-objects
npm install
cp .env.example .env
npm run demo                    # 招聘场景 1 accept + 3 reject（无需 Ollama）
npm run eval                    # 模型操作批 + 8 项攻击（需 Ollama 运行）
```

## 教学笔记

详见 [LEARNING_NOTE.md](LEARNING_NOTE.md)。三句话版：

- 模型好心办坏事（50 万录 Bob）被数据层拦下，合法推进照常放行。
- 六层检查：租户→角色→状态机→跨字段→引用完整→受控反应，8 攻击各撞一层。
- SQLite 丢的是 PG 工程语义，不伤"权限内嵌思想"这课。

## 目录结构

```
src/
  store.ts    权限对象存储（六层强制 + 招聘类型注册）
  ops.ts      模型生成操作 JSON（```ops 块 + 首轮示范）
  main.ts     demo/eval 入口 + 8 项攻击套件
```

## 核心实现讲解

- `ObjectStore.create/get/update`：三个入口全走同一套检查，没有后门函数——"内嵌"的意思就是绕不过。
- `registerHiringTypes`：状态机 TRANSFER 表 + 薪资带跨字段校验 + position_id 引用完整性。
- `update` 落定 hired 自动登记 offer-letter reaction：副作用不禁，但留痕。

## 实测结果（gemma4，Ollama 本地）

```
demo: accepted applied→screened；rejected 跳状态/超薪资/跨租户读
A组: ✓ 合法推进 ACCEPT；✗ 越界录用 REJECT（超薪资带）
B组: 攻击拦截 8/8
```

## 关键洞察

- 权限检查顺序即攻击面顺序；跨租对象连被引用的资格都没有（纵深）。
- 事前拦（5-4 审批）+ 事后留痕（reaction log）并用才完整。

## 注意事项

- 权限裁决零模型调用、全确定性；模型只参与 A 组操作生成。
- SQLite 替代 PG：无行级安全/并发语义，工程结论以官方为准。
- 教学机执行，无外部依赖（Ollama 仅 A 组）。

## 参考

- 官方：`https://github.com/bojieli/ai-agent-book/tree/main/chapter5/permission-embedded-data-objects`
- 正文：`https://bojieli.github.io/ai-agent-book/book/chapter5/`（代码作为系统适配器一节）
