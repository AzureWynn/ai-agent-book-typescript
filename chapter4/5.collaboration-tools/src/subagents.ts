import { Ollama } from 'ollama';

export type ContextStrategy = 'minimal' | 'llm_generated';

export interface SubAgentTask {
  id: string;
  task: string;
  role: string;
  strategy: ContextStrategy;
  handoff: string;
  handoffTokens: number;
  status: 'running' | 'done' | 'cancelled';
  result: string;
  inbox: string[];
  timer?: ReturnType<typeof setTimeout>;
}

export const PRIVACY_CANARY = '工资卡尾号4832';

const ORDERS: Record<string, { status: string; item: string }> = {
  A12345: { status: 'shipped', item: '蓝牙耳机' },
  B67890: { status: 'processing', item: '机械键盘' },
};

function extractOrderId(text: string): string | null {
  return text.match(/[A-Z]\d{4,}/)?.[0] ?? null;
}

function extractAmount(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*元/);
  return m ? parseFloat(m[1] ?? '0') : null;
}

function extractTier(text: string): string | null {
  if (/VIP|vip|贵宾|金牌/.test(text)) return 'vip';
  if (/普通|银牌/.test(text)) return 'regular';
  return null;
}

function redactSensitive(text: string): string {
  return text
    .replace(/工资卡尾号\d+/g, '工资卡尾号[REDACTED]')
    .replace(/密码\S*/g, '密码[REDACTED]')
    .replace(/(?:api[_-]?key|token)\s*[:=]\s*\S+/gi, '[REDACTED]');
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getOllama(): Ollama {
  return new Ollama({ host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434' });
}

export async function buildHandoff(
  task: string,
  strategy: ContextStrategy,
  parentTrajectory: string,
  slice?: string
): Promise<{ handoff: string; tokens: number; llmUsed: boolean }> {
  if (strategy === 'minimal') {
    const handoff = [`[FROM_MAIN_AGENT] task: ${task}`, slice ? `[FROM_MAIN_AGENT] slice: ${slice}` : null]
      .filter((x): x is string => x !== null)
      .join('\n');
    return { handoff, tokens: approxTokens(handoff), llmUsed: false };
  }
  const model = process.env.OLLAMA_MODEL || 'gemma4:latest';
  const res = await getOllama().chat({
    model,
    messages: [
      {
        role: 'user',
        content: [
          '你是交接助手。把下面的父 Agent 轨迹压缩成一段子任务交接上下文：只保留完成子任务必需的事实（订单号、金额、用户等级），删掉无关闲聊；绝不能包含银行卡号、密码、token 等隐私字段。',
          '只输出交接正文，不要解释。',
          '',
          `子任务：${task}`,
          `父轨迹：${parentTrajectory.slice(0, 2000)}`,
        ].join('\n'),
      },
    ],
    options: { temperature: 0 },
  });
  const handoff = `[FROM_MAIN_AGENT] ${redactSensitive(res.message.content.trim())}`;
  return { handoff, tokens: approxTokens(handoff), llmUsed: true };
}

export interface HandlerResult {
  done: boolean;
  result: string;
}

function runHandler(role: string, handoff: string): HandlerResult {
  const text = `${role}\n${handoff}`;
  if (/退款|refund/i.test(text)) {
    const orderId = extractOrderId(text);
    const amount = extractAmount(text);
    const tier = extractTier(text);
    const missing: string[] = [];
    if (!orderId) missing.push('order_id');
    if (amount === null) missing.push('amount');
    if (missing.length > 0) {
      return { done: false, result: `need_info: 缺少 ${missing.join('、')}，无法核算退款` };
    }
    const priority = tier === 'vip' ? '（VIP 优先通道）' : '';
    const eligible = (amount as number) <= 500 || tier === 'vip';
    return {
      done: true,
      result: eligible
        ? `订单${orderId}退款${amount}元符合自动批准${priority}`
        : `订单${orderId}退款${amount}元超自动额度，转人工审批`,
    };
  }
  if (/订单|order/i.test(text)) {
    const orderId = extractOrderId(text);
    if (!orderId) return { done: false, result: 'need_info: 缺少 order_id' };
    const order = ORDERS[orderId];
    if (!order) return { done: false, result: `need_info: 未知订单 ${orderId}` };
    return { done: true, result: `订单${orderId}（${order.item}）状态：${order.status}` };
  }
  return { done: true, result: `任务收到：${handoff.slice(0, 80)}` };
}

const tasks = new Map<string, SubAgentTask>();
let seq = 0;

export function spawnTask(
  task: string,
  role: string,
  handoff: string,
  strategy: ContextStrategy,
  mode: 'sync' | 'async'
): SubAgentTask {
  seq += 1;
  const id = `sub_${Date.now()}_${seq}`;
  const entry: SubAgentTask = {
    id,
    task,
    role,
    strategy,
    handoff,
    handoffTokens: approxTokens(handoff),
    status: 'running',
    result: '',
    inbox: [],
  };
  tasks.set(id, entry);
  const finish = (): void => {
    if (entry.status !== 'running') return;
    const extra = entry.inbox.length > 0 ? `\n补充消息：${entry.inbox.join('；')}` : '';
    const r = runHandler(role, `${handoff}${extra}`);
    entry.status = 'done';
    entry.result = r.done ? r.result : `need_info → ${r.result}`;
  };
  if (mode === 'sync') {
    finish();
  } else {
    entry.timer = setTimeout(finish, 300);
  }
  return entry;
}

export function getTask(id: string): SubAgentTask | undefined {
  return tasks.get(id);
}

export function sendTaskMessage(id: string, message: string): boolean {
  const entry = tasks.get(id);
  if (!entry || entry.status !== 'running') return false;
  entry.inbox.push(message);
  return true;
}

export function cancelTask(id: string): boolean {
  const entry = tasks.get(id);
  if (!entry || entry.status !== 'running') return false;
  if (entry.timer) clearTimeout(entry.timer);
  entry.status = 'cancelled';
  entry.result = 'cancelled by main agent';
  return true;
}

export function listTasks(): SubAgentTask[] {
  return [...tasks.values()];
}

export function handoffLeaksCanary(handoff: string): boolean {
  return handoff.includes(PRIVACY_CANARY);
}
