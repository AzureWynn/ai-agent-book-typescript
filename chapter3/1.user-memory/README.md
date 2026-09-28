# User Memory System / 用户记忆系统

> Chapter 3-1: 长期用户记忆 — 对话与后台记忆处理分离、多种记忆模式、Ollama 本地模型
> 对应《AI Agent 开发实战》第 3 章实验 3-1

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-1：**长期用户记忆系统**。本仓库为 **TypeScript 实现**，采用对话 Agent 与后台记忆处理器分离的架构。内置 4 种记忆模式（便签/档案袋/知识图谱/自动摘要），涵盖记忆的创建、检索、衰减与清理全生命周期。

## Code map

- **Run first:** `npm run quickstart` — 验证 Ollama 连接 + 记忆读写
- **Start here:** `src/user-memory-agent.ts` — 核心 Agent，带 React 循环和记忆工具
- **Core behavior:** `src/background-processor.ts` — 分离的后台处理器，分析对话并更新记忆
- **State / protocol:** `src/memory-manager.ts` — 4 种记忆模式的存储管理
- **Conversation:** `src/conversation-history.ts` — 对话轮次追踪
- **Verifier:** `npm run demo` — 完整演示流程，验证记忆是否正确存储和检索

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                            │
│                        (main.ts / interactive)                    │
└──────────────┬──────────────────────────────────┬───────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│   ConversationalAgent    │    │   BackgroundMemoryProcessor       │
│                          │    │                                  │
│  • 读取记忆（只读）        │    │  • 分析对话                       │
│  • 不直接更新记忆        │    │  • 调用 UserMemoryAgent 工具      │
│  • 发送带记忆的提示词      │    │  • 定期触发                       │
│                          │    │                                  │
│  ┌────────────────────┐  │    │  ┌────────────────────────────┐  │
│  │  memoryContext     │  │    │  │  UserMemoryAgent            │  │
│  │  (getContextString)│  │    │  │                             │  │
│  └────────────────────┘  │    │  │  • add_memory 工具          │  │
│                          │    │  │  • update_memory 工具       │  │
│  ┌────────────────────┐  │    │  │  • delete_memory 工具       │  │
│  │  ConversationHistory│  │    │  │  • search_memories 工具     │  │
│  └────────────────────┘  │    │  │                             │  │
│                          │    │  └──────────┬─────────────────┘  │
└──────────────────────────┘    │             │                     │
                                │             ▼                     │
                                │  ┌────────────────────────────┐  │
                                │  │   MemoryManager             │  │
                                │  │  ┌──────────────────────┐  │  │
                                │  │  │ notes / enhanced_   │  │  │
                                │  │  │ notes / json_cards /│  │  │
                                │  │  │ advanced_json_cards │  │  │
                                │  │  └──────────────────────┘  │  │
                                │  └─────────────┬─────────────┘  │
                                │                ▼                  │
                                │  ┌────────────────────────────┐  │
                                │  │   data/memories/           │  │
                                │  │   {userId}_memory.json     │  │
                                │  └────────────────────────────┘  │
                                └──────────────────────────────────┘
```

## Memory Modes（4 种模式）

| 模式 | 结构 | 用途 | 示例 |
|------|------|------|------|
| `notes` | 简单列表 | 基础事实 | `- 用户喜欢咖啡` |
| `enhanced_notes` | 段落文本 | 完整上下文 | `用户 Alice 在 TechCorp 担任高级工程师...` |
| `json_cards` | 层级 JSON | 结构化数据 | `{category: "personal", key: "email", value: "..."}` |
| `advanced_json_cards` | 完整卡片 | 完整档案（含 backstory, person, relationship） | `{card: {backstory: "...", person: "Alice", relationship: "primary"}}` |

## How It Works

```
对话阶段（ConversationalAgent）：
  1. 用户说："我喜欢吃火锅"
  2. Agent 读取现有记忆 → 拼到提示词里
  3. Agent 只回答，不写记忆
  4. 对话记录保存到历史文件

后台阶段（BackgroundMemoryProcessor）：
  1. 每 N 轮对话后自动触发
  2. 读取最近的对话历史
  3. 调用 UserMemoryAgent 分析对话
  4. Agent 使用 add_memory 工具写入记忆
  5. 记忆持久化到 JSON 文件
```

## Installation

```bash
cd chapter3/1.user-memory
npm install

# 确保 Ollama 运行且模型已下载
ollama serve
ollama pull gemma4:latest

# 验证连接
npm run quickstart
```

## Usage

```bash
# 快速验证（Ollama 连接 + 记忆读写）
npm run quickstart

# 演示模式（自动跑 3 轮对话，展示记忆从无到有）
npm run demo

# 交互模式（手动对话，随时输入 "memory" 查看记忆）
npm run interactive

# 后台处理模式（演示分离架构）
npm run background
```

## 实验变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MEMORY_MODE` | 记忆模式 | `notes` |
| `OLLAMA_MODEL` | Ollama 模型 | `gemma4:latest` |
| `CONVERSATION_INTERVAL` | 后台触发间隔（轮数） | `2` |
| `VERBOSE` | 详细日志 | `true` |

## 关键概念对比

```
┌─────────────────────┬──────────────────────┬──────────────────────┐
│                     │  dynamic_system      │  System Hint         │
│                     │  (KV Cache 反模式)    │  (推荐)               │
├─────────────────────┼──────────────────────┼──────────────────────┤
│ 修改位置             │ system prompt 内部    │ 末尾 user 消息        │
│ KV Cache            │ ❌ 全部失效           │ ✓ 命中               │
│ 首次 token 延迟      │ 慢 3-5 倍            │ 快（缓存命中）         │
│ 适用场景             │ ❌ 不推荐            │ ✅ 状态栏、时间戳      │
└─────────────────────┴──────────────────────┴──────────────────────┘

┌─────────────────────┬──────────────────────┬──────────────────────┐
│                     │  对话 Agent          │  后台处理器            │
│                     │  (ConversationalAgent)│  (BackgroundProcessor) │
├─────────────────────┼──────────────────────┼──────────────────────┤
│ 职责               │ 回复用户             │ 分析并写入记忆         │
│ 写记忆             │ ❌ 不写              │ ✅ 专门写             │
│ 触发时机            │ 用户每句话           │ 每 N 轮自动触发        │
│ 性能影响            │ 低（只读）           │ 可容忍慢              │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

## 教学笔记

更详细的讲解（为什么对话和后台要分离、4 种记忆模式各自适用什么场景、记忆衰减策略的选择）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 目录结构

```
1.user-memory/
├── src/
│   ├── user-memory-agent.ts       # 核心 Agent（ConversationalAgent + 记忆工具）
│   ├── background-processor.ts    # 后台处理器，定期分析对话并写入记忆
│   ├── memory-manager.ts          # 4 种记忆模式的存储管理
│   ├── conversation-history.ts    # 对话轮次追踪
│   └── config.ts                  # 实验变量配置
├── data/memories/                 # 记忆持久化文件
├── package.json
└── tsconfig.json
```

## 核心实现讲解

### 1. 对话 Agent 与后台处理器分离

这是本实验最重要的设计决策。直接在一个 Agent 中同时"回复用户"和"写入记忆"会导致两个问题：

1. **KV Cache 失效**：每次修改 system prompt 都会使缓存失效，对话变慢
2. **职责耦合**：回复逻辑和记忆逻辑互相干扰，难以调试

分离后：对话 Agent（`ConversationalAgent`）只负责读取记忆并拼入提示词，后台处理器（`BackgroundMemoryProcessor`）负责分析对话并调用 `UserMemoryAgent` 写入。两者通过文件系统共享数据，互不阻塞。

### 2. 4 种记忆模式的演进

| 模式 | 结构复杂度 | 适用场景 | 读写成本 |
|------|-----------|----------|----------|
| `notes` | 低 | 简单事实记录 | O(1) 追加 |
| `enhanced_notes` | 中 | 完整上下文段落 | O(n) 搜索 |
| `json_cards` | 高 | 结构化数据查询 | O(1) 精确查找 |
| `advanced_json_cards` | 最高 | 完整用户画像 | O(n) 语义搜索 |

模式选择通过 `MEMORY_MODE` 环境变量控制，无需修改代码。

### 3. 记忆衰减机制

`MemoryManager` 在每次写入时检查已有记忆，根据时间和重要性自动衰减旧记忆。衰减策略可配置，确保记忆文件不会无限膨胀。

## 实测结果

```
npm run demo 输出：
  3 轮对话 → 记忆从空到逐步积累
  Quickstart 验证：Ollama 连接成功，记忆读写正常
  
npm run background 输出：
  后台处理器按 CONVERSATION_INTERVAL 自动触发
  记忆文件正确更新
```

## 关键洞察

1. **分离架构是核心**：对话 Agent 只读不写，保证响应速度和 KV Cache 命中率
2. **模式选择影响性能**：`notes` 模式最快，`advanced_json_cards` 最灵活但搜索成本最高
3. **记忆衰减防止膨胀**：不衰减的记忆文件会无限增长，影响读取性能
4. **工具调用是桥梁**：`add_memory`/`search_memories` 等工具让 Agent 自主决定何时写入记忆

## 注意事项

- `npm run quickstart` 需要 Ollama 运行 + gemma4:latest 已下载
- `MEMORY_MODE` 切换后需要重新初始化记忆文件
- 后台处理器的触发间隔（`CONVERSATION_INTERVAL`）过短会导致过多 LLM 调用
- `npm run background` 模式演示分离架构，实际生产环境应使用消息队列替代文件轮询
- 记忆文件路径通过 `data/memories/` 配置，支持按用户 ID 隔离

## 参考

- [教学笔记](LEARNING_NOTE.md) — 核心概念速查
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md) — 用户记忆、RAG、上下文工程原理
- 官方实验代码：[user-memory](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/user-memory) — Python 实现对照
- 官方讲义：[chapter3/README.md](https://github.com/bojieli/ai-agent-book/blob/main/chapter3/README.md) — 12 个实验全景
