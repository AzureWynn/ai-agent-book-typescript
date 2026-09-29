# Chapter 4-2：感知工具 MCP · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**给 Agent 接"眼睛和耳朵"，并且用统一插头（MCP）来接。**

```
没有工具：模型只会凭记忆编（北京天气？编一个）
有了工具：模型先查 Weather 再回答（23.8°C，实测）
```

MCP 解决的是插头问题：以前每个框架的工具格式都不一样（OpenAI 一套、Anthropic 一套、LangChain 一套），工具要反复适配。MCP 规定：服务器暴露工具列表，客户端发现→校验参数→调用→拿结果，全走一套协议。

## 二、MCP 的三件事

```
1. 发现（list_tools）：客户端先问"你都有什么工具"
   → 12 个工具，带名字、描述、参数 schema

2. 调用（call_tool）：客户端说"调 weather，参数 location=Beijing"
   → 服务器校验必填参数 → 执行 → 返回统一信封

3. 理解（ActionResponse）：{success, message, metadata}
   → 成功给数据，失败给原因，不混在一起
```

本实验的 server 跑在 stdio 上（标准输入输出传协议），client 用子进程拉起它——和 Claude Desktop 接 MCP 服务器是同一套机制。

## 三、感知工具只观察不改变

感知 = 获取信息，不改变世界：

```
读文件、搜文档、查天气、搜论文 —— 全是只读
```

只读带来两个工程红利：**可缓存**（同样查询不用查两遍）、**可并行**（互相没依赖）。改世界的工具（执行类，3-4 再讲）才需要审批和沙盒。

## 四、沙盒是必须的

文件工具不做限制等于把整台机器交给模型。本实验三条硬规则：

```
1. 相对路径：只能传 workspace 下的相对路径
2. 拒绝逃逸：..、绝对路径一律拒绝
3. 拒绝软链接：防止链接到 /etc/passwd 这类地方
```

`resolveInside` 是全部检查的唯一入口——安全检查只应有一个地方做。

## 五、空结果和失败是两回事

Agent 决定"重试还是认栽"，靠的就是这个区分：

```
空结果（success=true, emptyResult=true）：查到了，确实没有
  → 例：grep 无匹配、地点搜不到
  → Agent 结论：换个问法或承认没有

失败（success=false, networkError=true）：根本没查成
  → 例：维基 API 连不上（本实验实测）
  → Agent 结论：网络问题，不是知识问题
```

把失败报成"没找到"，Agent 会自信地编答案——这是最坏的情况。

## 六、实测怎么读？

`npm run smoke`（协议三段式验证）：

```
[1/3] server up，list 到 12 个工具
[2/3] file_reader 调通
[3/3] catalog_receipt.json 落盘（含 mcp_sdk_version）
```

`npm run demo`：本地三件套（directory_browser / grep / knowledge_base_search）全通；联网 weather 实测 23.8°C；维基 API 在本环境连不上，诚实报错。

`npm run agent`（gemma4 开车）：模型自己决定调 directory_browser → file_reader → weather，最后综合回答。实测 6 轮里出现重复调用——客户端加了去重（同一工具+参数只执行一次，重复直接回"用上次结果"），外加"预算用完强制作答"兜底才拿到答案。小模型开车就是这样：机制正确，驾驶技术待提高。

## 七、本实验怎么跑

```bash
npm run smoke     # 协议冒烟：stdio 拉起 → list → 调 file_reader
npm run demo      # 感知流程演示（--offline 只跑本地步骤）
npm run agent     # Ollama gemma4 驱动 MCP 工具（需 Ollama）
npx tsx src/main.ts list --category filesystem
npx tsx src/main.ts run grep pattern=MCP directory=. 'file_pattern=*.md'
npx tsx src/main.ts info weather
```

## 八、核心代码结构

```
src/
├── types.ts              # ActionResponse + ToolDef + 参数解析
├── tools-filesystem.ts   # file_reader / directory_browser / grep / kb_search（含沙盒）
├── tools-public.ts       # web_search / webpage_reader / weather / wiki / arxiv / 汇率 / 地点
├── tools-summarize.ts    # 摘录式摘要（离线，不调模型）
├── catalog.ts            # 12 工具注册表 + 转 MCP 定义
├── server.ts             # MCP Server（底层 Server + 手写 Schema，不依赖 zod）
├── client.ts             # MCP Client（stdio 拉起 + list/call + 收据）
├── agent.ts              # Ollama 工具循环（去重 + 预算兜底）
├── smoke.ts              # 三段式协议验证
└── main.ts               # CLI（list / info / run / demo / agent）
```

## 九、关键洞察

1. **MCP 统一的是插头，不是能力**——每个工具的数据源和依赖还是各管各的
2. **schema 先行**：参数格式写在声明里，调用前就能校验，不到执行才炸
3. **感知工具只读**——天然可缓存可并行；改世界的工具另有一套安全账（4-4）
4. **空结果 ≠ 失败**——Agent 的重试决策全靠这个区分
5. **工具成功 ≠ 答案好**——小模型会留"[此处插入]"占位符，工具链和模型能力是两回事

## 十、官方正文补充要点（感知部分）

以下来自官方 book/chapter4.md"感知工具"一节，实现时对照：

- **输出量控制**：搜索返回候选列表（标题/位置/摘要）而非全文拼接；大文件用 offset/limit 按需读；超阈值截断必须明示省略了多少、怎么读剩下——静默截断会让 Agent 基于不完整信息下结论
- **分页游标**：结果多时给总数 + 取下一页的方式，让 Agent 自己决定翻不翻页，而不是一次倾倒
- **只读红利的另一面**：缓存键要含用户身份与授权范围，会变化的数据（天气/股价）设 TTL；并行读取注意速率限制与快照不一致
- **多模态输出形态**：纯文字用文本提取（省 token），布局敏感的（UI/复杂表格/设计稿）保留图像——形态选择本身就是设计（4-3 整节讲这个）
- **调试原则**：Agent 频繁选错工具，先查工具描述（边界不清/缺反例/参数模糊），修描述的投入产出比远高于换模型

## 十一、常见问题

- **stdio 和 HTTP 怎么选**：本地用 stdio（零配置），跨机器用 HTTP；本实验只做 stdio
- **为什么不用 zod**：Server 端用底层 API + 手写 JSON Schema，少一个版本摩擦点
- **联网工具失败**：先看是 networkError（环境网络）还是 emptyResult（真没结果），两种修法完全不同
- **Agent 打转**：小模型常见；去重 + 最终作答兜底是标准解法
- **私有数据源（日历/Notion）**：要 OAuth 授权，本实验明确标 blocked，不做假数据
