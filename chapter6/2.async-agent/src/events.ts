// events.ts —— 事件模型 + 紧急度判定（对应官方 Event / classify_urgency）
//
// 与 6-1 不同，这里的 Event 自带 message（可回放进 LLM 上下文的聊天消息）：
// 轨迹（trajectory）就是一条条 Event，build_messages() 只把 message 抽出来
// 拼成 OpenAI/Ollama 兼容的消息列表——这正是官方"轨迹即工作记忆"的落点。

export type EventType =
  | 'user.input' // 用户普通消息
  | 'user.interrupt' // 用户打断（取消/停止）
  | 'async.result' // 后台异步任务完成（以"新事件"注入）
  | 'system.note' // 系统回执/说明
  | 'agent.output' // Agent 最终回复
  | 'agent.tool_call' // Agent 发起工具调用
  | 'tool.result'; // 工具执行结果

/** 紧急度判定（官方规则，简单可解释）：
 * 1. 含打断关键词（取消/停止/stop…）→ INTERRUPT：取消当前 turn + 后台任务
 * 2. 提问（带问号或疑问词，如"现在几点了？"）→ IMMEDIATE：立即回应，但不打断后台
 * 3. 其它补充性指令（如"用日语回复"）→ DEFERRED：进 pending 缓冲，批量处理 */
export type Urgency = 'INTERRUPT' | 'IMMEDIATE' | 'DEFERRED';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: Record<string, unknown> };
}

/** 可回放进 LLM 上下文的聊天消息（OpenAI/Ollama 兼容结构） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Event {
  id: string;
  type: EventType;
  urgency?: Urgency;
  label: string; // 打印用的短标签
  message: ChatMessage | null; // null 表示不入 LLM 上下文
  metadata: Record<string, unknown>;
  at: number;
}

let seq = 0;
export function makeEvent(
  type: EventType,
  label: string,
  message: ChatMessage | null = null,
  metadata: Record<string, unknown> = {},
): Event {
  return { id: `e${++seq}`, type, label, message, metadata, at: Date.now() };
}

const INTERRUPT_KEYWORDS = ['取消', '停止', '停', '别做了', 'stop', 'cancel', 'abort'];
const QUESTION_WORDS = [
  '吗', '几', '谁', '什么', '哪', '怎么', '为什么', '何时', '多少', '?', '？',
  'how', 'what', 'when', 'where', 'who', 'why', 'which',
];

export function classifyUrgency(text: string): Urgency {
  const t = text.toLowerCase();
  if (INTERRUPT_KEYWORDS.some((k) => t.includes(k))) return 'INTERRUPT';
  if (QUESTION_WORDS.some((k) => t.includes(k))) return 'IMMEDIATE';
  return 'DEFERRED';
}
