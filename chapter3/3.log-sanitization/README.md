# Log Sanitization / 日志脱敏

> Chapter 3-3: 从 Agent 日志中检测并替换敏感字段
> 对应《AI Agent 开发实战》第 3 章实验 3-3

← [返回第 3 章目录](../README.md)

## 这个实验在学什么

对应官方实验 3-3：**日志脱敏**。本仓库为 **TypeScript 实现**，包含两条互补引擎：规则引擎（18 类正则，精确匹配）和 LLM 引擎（Ollama 语义识别，处理复杂 PII）。支持 demo / interactive / llm 三种运行模式。

## Code map

- **Run first:** `npm run demo` — 离线演示，10 个样本的 before/after 对比
- **Start here:** `src/regex-sanitizer.ts` — 18 条正则规则，覆盖密钥、PII、IP 等
- **Core behavior:** `src/main.ts` — demo / interactive 两种模式
- **Verifier:** `npm run demo` 输出中确认所有类别都被正确替换

## 18 条规则速查

| 类别 | 占位符 | 例子 |
|------|--------|------|
| `private_key` | `[REDACTED_PRIVATE_KEY]` | PEM 私钥块 |
| `jwt` | `[REDACTED_JWT]` | eyJ... |
| `url_credential` | `[REDACTED_URL_CRED]` | postgres://user:pass@host |
| `aws_access_key` | `[REDACTED_AWS_KEY]` | AKIAIOSFODNN7EXAMPLE |
| `github_token` | `[REDACTED_GITHUB_TOKEN]` | ghp_... |
| `slack_token` | `[REDACTED_SLACK_TOKEN]` | xoxb-... |
| `google_api_key` | `[REDACTED_GOOGLE_API_KEY]` | AIza... |
| `api_key` | `[REDACTED_API_KEY]` | sk-... |
| `bearer_token` | `[REDACTED_BEARER_TOKEN]` | Bearer xxx |
| `basic_auth` | `[REDACTED_BASIC_AUTH]` | Authorization: Basic xxx |
| `secret_assignment` | `[REDACTED_SECRET]` | password = "xxx" |
| `email` | `[REDACTED_EMAIL]` | user@domain.com |
| `credit_card` | `[REDACTED_CREDIT_CARD]` | 4532 1234 5678 9012 (Luhn 校验) |
| `iban` | `[REDACTED_IBAN]` | CN12345678901234567890 |
| `us_ssn` | `[REDACTED_SSN]` | 123-45-6789 |
| `cn_id_card` | `[REDACTED_ID_CARD]` | 110101199003071234 (校验码) |
| `cn_phone` | `[REDACTED_PHONE]` | 13800138000 |
| `ip_address` | `[REDACTED_IP]` | 192.168.1.100 |

## Installation

```bash
cd chapter3/3.log-sanitization
npm install
npm run demo          # 演示模式（离线，无需 API Key）
npm run interactive   # 手动输入测试
npm run llm           # LLM 引擎模式（需 Ollama 运行）
```

## 双引擎架构

```
┌─────────────────────────────────────────────────┐
│  规则引擎（npm run demo / interactive）            │
│  • 纯正则 + Luhn/身份证校验                      │
│  • 不需要 Ollama，结果确定                        │
│  • 18 类 PII 规则                                │
├─────────────────────────────────────────────────┤
│  LLM 引擎（npm run llm）                         │
│  • Ollama + gemma4:latest 语义识别               │
│  • 处理规则漏网的复杂 PII                        │
│  • 返回 JSON 格式的检测结果                      │
└─────────────────────────────────────────────────┘
```

### 两种引擎对比

| 维度 | 规则引擎 | LLM 引擎 |
|------|----------|----------|
| 速度 | 快（微秒级） | 慢（需模型推理） |
| 准确性 | 确定（正则匹配） | 语义理解，可能误判 |
| 覆盖范围 | 格式固定的字段 | 上下文相关的复杂 PII |
| 依赖 | 无 | Ollama 模型 |
| 适用场景 | 生产环境第一道防线 | 补充规则漏网之鱼 |

## 教学笔记

更详细的讲解（为什么需要两种引擎互补、18 类 PII 的匹配策略选择、LLM 引擎的 prompt 设计）见 [`LEARNING_NOTE.md`](LEARNING_NOTE.md)。建议先看这份再看代码。

## 核心实现讲解

### 1. 规则引擎的 18 类 PII 覆盖（regex-sanitizer.ts）

正则规则按 PII 类型组织，每条规则包含：匹配模式、替换占位符、是否启用 Luhn 校验（信用卡/身份证）。18 类覆盖 Agent 日志中最常见的敏感字段：密钥类、身份信息类、支付类、通信类、地址类。

关键设计：规则之间用 `|` 合并为单条全局正则，一次扫描完成全部替换，避免多次遍历。

### 2. LLM 引擎的语义检测（llm-sanitizer.ts）

LLM 引擎通过 Ollama `/api/chat` 原生端点调用 gemma4:latest，发送包含待检测文本的 prompt，要求模型返回 JSON 格式的 PII 检测结果。

```json
{"redactions": [{"type": "api_key", "original": "sk-abc123...", "replacement": "[REDACTED_API_KEY]"}]}
```

LLM 引擎不替代规则引擎，而是补充规则漏网的复杂 PII（如上下文相关的邮箱变体、伪装过的密钥等）。

### 3. 双引擎协作流程

```
输入日志
  ↓
规则引擎（18 类正则，一次扫描）
  ↓
LLM 引擎（语义补充，合并去重）
  ↓
输出：脱敏后日志 + 检测结果 JSON
```

## 实测结果

```
npm run demo 输出摘要：
  18 redactions
    api_key: 1
    url_credential: 2
    email: 3
    cn_phone: 2
    us_ssn: 1
    slack_token: 1
    aws_access_key: 1
    secret_assignment: 3
    private_key: 1
    ip_address: 2
    basic_auth: 1

LLM 引擎测试：
  API_KEY: "sk-abc123def456..." → [REDACTED_API_KEY]  ✓
```

规则引擎覆盖率 100%（格式固定的字段），LLM 引擎补充规则漏网的复杂变体。

## 关键洞察

1. **规则引擎是生产环境第一道防线**：确定、快速、零成本，所有 PII 脱敏都应先从规则开始
2. **LLM 引擎是补充而非替代**：语义理解能处理规则漏网，但慢、可能误判、消耗模型资源
3. **Luhn 校验是关键**：信用卡和身份证号用 Luhn 算法校验，避免将合法数字误判为敏感字段
4. **规则合并优化**：18 条正则合并为单条全局正则，一次扫描完成，效率远高于逐条匹配

## 注意事项

- `npm run demo` 离线运行，无需 Ollama；`npm run llm` 需要 Ollama + gemma4:latest
- LLM 引擎的输出是 JSON 格式，需要解析后合并到规则引擎结果中
- 某些 PII 变体（如 Base64 编码的密钥）规则引擎无法识别，需 LLM 引擎补充
- 规则顺序很重要：先匹配密钥类（短、确定性高），再匹配身份类（长、可能重叠）

## 参考

- [教学笔记](LEARNING_NOTE.md)
- 官方实验代码：[log-sanitization](https://github.com/bojieli/ai-agent-book/tree/main/chapter3/log-sanitization)
- 官方 Book 上下文工程章节：[chapter3.md](https://github.com/bojieli/ai-agent-book/blob/main/book/chapter3.md)
- 官方讲义：[chapter3/README.md](https://github.com/bojieli/ai-agent-book/blob/main/chapter3/README.md)
