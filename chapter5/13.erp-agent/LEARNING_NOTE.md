# Chapter 5-13：ERP 自然语言转 SQL · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**模型只写 SQL，查数的是数据库——LLM 不亲自搬运数据。**

```
用户："研发部有多少在职员工？"
传统做法：模型背数据 → 编数字（必错）
artifact 模式：模型写 SQL → 数据库执行 → 返回真实表
```

这就是 artifact（制品）模式：LLM 的产出物是一件"制品"（SQL 语句），执行和核对交给机器。省 token（几万行结果不用进上下文），还不手算。

## 二、三条基准线

```
gold（离线）：人工写的标准 SQL 跑 10 题
  → 10/10，证明数据模型自洽（题、库、参考答案互相咬合）

reference（独立实现）：不用 SQL，纯 TS 在种子数据上直算
  → 判分基准。SQL 结果和它对不上，就是 SQL 的错

agent（在线）：模型现场写 SQL → 执行 → 对参考答案
  → 测的是"翻译"能力，不是数据库能力
```

三条线各司其职：gold 验库，reference 验分，agent 练翻译。

## 三、日期是最大的坑

"今年/去年/前年"是相对概念，模型不知道"今天"是哪年：

```
库的截止日固定 2026-06-15（写死在种子里）
prompt 明示：今年=2026，去年=2025，前年=2024
禁止硬编码其它年份推导（strftime 也不许瞎猜）
```

这不算泄题——这是业务口径。真实 ERP 里"在职=离职日期为空"这类定义同样要进 prompt，否则模型只能猜。

## 四、难点的 SQL 长什么样

Q8（工龄分档 + 最近一月）：CASE WHEN 分档 + 相关子查询取每人最新发薪月。

Q10（拖欠检查）：递归 CTE 生成"应发月份序列"减去"实发明细"：

```sql
WITH RECURSIVE ms(emp_id, m, end_m) AS (
  SELECT id, substr(hire_date,1,7), ... FROM employees
  UNION ALL
  SELECT emp_id, substr(date(m||'-01','+1 month'),1,7), end_m
  FROM ms WHERE m < end_m
)
SELECT ... WHERE NOT EXISTS (当月发薪记录)
```

prompt 里给这两题结构模板（官方也这么干）——模板给的是"形状"，表名条件还得模型自己填。

## 五、比对为什么不用字符串全等？

```
1. 浮点末位：SQL 的 AVG 和 TS 的 sum/n 求和顺序不同，差 1e-12 正常
   → 相对误差 1e-6 内算等
2. 行顺序：除 Q9（排名本身就是答案）外全按多重集比
3. 中文排序：SQL ORDER BY 是二进制序，参考实现是拼音序
   → 有序题只敢让 Q9 当（且给了 name 二级排序兜底）
```

官方用"多重集合 + 数值容差"，这里一样。

## 六、本实验怎么跑

```bash
npm run gold        # 标准 SQL 跑 10 题（无需 Ollama，先跑这个）
npm run demo        # Q2 + Q6 双模式展示（需 Ollama）
npm run eval        # 10 题全跑（需 Ollama，约 10～15 分钟）
npx tsx src/main.ts --mode eval --only 2,3,6   # 子集
npx tsx src/main.ts --mode ask --query "研发部现在有多少在职员工？"
npx tsx src/main.ts --mode initdb              # 落盘 erp.db 手工查看（gitignored）
```

## 七、核心代码结构

```
13.erp-agent/
├── src/
│   ├── types.ts      # Employee / SalaryRow / Question / ResultRow
│   ├── seed.ts       # 确定性种子库（mulberry32/42，截止 2026-06-15）
│   ├── questions.ts  # 10 个问题 + 返回列/业务口径 hint
│   ├── reference.ts  # 独立 TS 参考实现（判分基准，不用 SQL）
│   ├── gold.ts       # 10 条手写标准 SQL（离线自检）
│   ├── compare.ts    # 多重集 + 容差比对（Q9 有序）
│   ├── agent.ts      # NL→SQL 生成（含 schema 与口径提示）
│   └── main.ts       # CLI（demo/gold/ask/eval/initdb）
├── package.json
└── tsconfig.json
```

## 八、关键洞察

1. **artifact 模式**——LLM 只产 SQL 制品，执行核对交给机器
2. **三线分工**——gold 验库、reference 验分、agent 练翻译，别混
3. **日期口径进 prompt**——相对时间必须锚定，不算泄题
4. **比对容差**——浮点、排序、中文 collation，没有无痛的全等
5. **模板给形状不给答案**——Q8/Q10 的结构提示帮小模型，表名条件自己填

## 九、常见问题

- **gold 挂了**：先看是 SQL 错还是 reference 错——本实验修过递归 CTE 差一格和 base 行混入两处
- **agent 报不存在的表**：模型编表名了；prompt 已给全 DDL，再犯就是模型问题，记 ✗
- **Q9 排名抖动**：并列时靠 name 二级排序；种子保证涨薪额互不相同，大概率稳定
- **想换真 PG**：日期函数对照官方文档换（strftime→EXTRACT，julianday→AGE），其余通用
