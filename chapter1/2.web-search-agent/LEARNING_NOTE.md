# Chapter 1-2：联网搜索 Agent · 学习笔记（大白话版）

## 一、这个实验在干什么？

一句话：**让本地 LLM（Ollama）自主决定"何时需要搜索"，通过自部署的 SearXNG 搜索实时信息，多轮迭代后综合作答。**

全程本地运行，无需任何云端 API Key。

## 二、为什么需要搜索工具？

模型的知识有截止日期（训练数据截止），**实时性问题**（今天的汇率、最新进展）它答不了。

```
没有搜索：
  用户："今天美元兑人民币汇率？" → 模型：凭训练记忆瞎答 ❌

有搜索：
  用户："今天美元兑人民币汇率？" → 模型决定调用 web_search
  → SearXNG 返回实时结果 → 模型综合作答 ✅
```

**大白话：工具是 Agent 的"眼睛"，搜索工具让它看到训练数据之外的世界。**

## 三、ReAct 循环（与 1-1 结构一致，目的不同）

```
循环直到 maxIterations（默认 5）:
  1. 把「系统提示词 + 对话历史」发给本地 LLM（已绑定 web_search 工具）
  2. 若模型返回 tool_calls → 执行搜索 → 结果回填 tool role → 继续循环
  3. 若模型不再调用工具 → 视为最终答案，返回
```

实现细节：

- **消息回填**：工具结果用 `ToolMessage({ content, tool_call_id })` 回填，`tool_call_id` 必须与模型返回的 `id` 一致，否则多轮对话报错
- **轨迹记录**：每次循环把「思考/行动/观察/答案」记入 `trace`，verbose 模式实时打印（💭🔧👀✅）
- **终止条件**：模型自己决定"信息够了"；若搜索了 `maxIterations` 轮仍未收尾，返回兜底文案——**防止死循环的关键闸门**

## 四、两层结构：搜索客户端 vs 工具适配层

```
search.ts（纯搜索客户端）        tools.ts（工具适配层）
  GET /search?q=&format=json      tool(..., { name: 'web_search',
  → 结构化 SearchResult[]          schema: zod })
  不含任何 LLM 概念，可独立测试    把客户端包成模型可调用的工具
```

```ts
tool(
  async ({ query, max_results }) => {
    const results = await engine.search({ q: query, maxResults: max_results });
    return formatResults(results);  // 压缩成紧凑文本喂给模型
  },
  { name: 'web_search', schema: z.object({ query: z.string(), max_results: z.number().optional() }) }
)
```

**`formatResults` 的作用（容易忽略但很重要）**：把搜索结果压缩成"编号 + 标题 + 来源 + 摘要（截断 200 字）"的紧凑文本。不截断的话搜索结果会撑爆上下文。

## 五、SearXNG 一键启动（scripts/searxng.sh）

| 命令 | 作用 |
|---|---|
| `start` | 启动（自动拉镜像、等待就绪） |
| `stop` | 停止并移除容器 |
| `restart` | 重启并等待就绪 |
| `status` | 查看容器状态 |
| `logs` | 跟踪容器日志 |

**关键配置**：`searxng/settings.yml` 的 `search.formats` 里必须加 `json`，否则 SearXNG 只返回 HTML，程序无法解析。`start` 内置健康检查：循环请求 `search?format=json`，就绪才提示成功。

## 六、与实验 1-1 的对比（理解工具本质的关键）

| | 1-1 context | 1-2 web-search-agent |
|---|---|---|
| ReAct 循环 | 一样 | 一样 |
| 工具类型 | 确定性工具（计算/汇率/PDF） | 外部数据源（搜索） |
| 工具失败模式 | 确定（算错/网络失败） | 不确定（搜不到好结果） |
| 学习要点 | 上下文能力消融 | 工具是外部世界的窗口 |

**想通这个对比，你就理解了 Agent 工具的本质：工具就是"模型与环境之间的接口"。**

## 七、核心结论

1. **搜索工具解决知识时效性问题**：模型知识有截止日期，实时信息靠工具补
2. **ReAct 循环结构不变，工具语义不同**：确定性工具 vs 外部数据源
3. **工具结果必须格式化压缩**：搜索结果不截断会撑爆上下文
4. **终止条件必须硬编码闸门**：模型可能无限搜索，`maxIterations` 防死循环
5. **`tool_call_id` 回填是所有多轮工具的通用规则**

## 运行命令

```bash
./scripts/searxng.sh start          # 启动 SearXNG（需 Docker）
npm install
npm run interactive                 # 交互模式
npm run single -- "2026年AI领域最新进展是什么？"
```

## 自测题

1. 为什么 SearXNG 必须开 JSON 格式？
2. 如果模型搜索了 5 轮还不收尾，会发生什么？这个闸门为什么必要？
3. `formatResults` 如果不截断，会发生什么问题？
