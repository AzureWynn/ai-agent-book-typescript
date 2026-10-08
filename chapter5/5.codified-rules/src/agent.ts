// run_agent 对应：文本 ReAct 协议（```tool JSON / FINAL:）+ 双臂 prompt/工具差异。
// 控制组：自然语言政策 + 极简工具 + 天真执行；实验组：政策+checklist + 完整工具描述 + expected_* + 服务端校验。
import { Ollama } from 'ollama';
import 'dotenv/config';
import { cancelNaive, cancelCodified, describeReservation, isRefundable, type Reservation } from './env.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');
const MAX_TURNS = 8;

export type Arm = 'control' | 'codified';

const NL_POLICY = `你是 SkyWing 航空公司的客服 Agent，可以帮乘客查询和取消预订。

【退款政策（自然语言）】
- 经济舱基础票（basic_economy）默认不可退款。
- 例外1：下单后 24 小时内，可全额退款。
- 例外2：航班被航司取消，或重大延误（延误≥3小时），可全额退款。
- 经济舱灵活票（economy_flex）与商务舱（business）可全额退款。
- 若不可退款：礼貌解释政策，主动提替代方案（改签/旅行信用点），绝不能退款。
乘客自述（舱位/下单时间等）可能不准，以 get_reservation 查到的系统真值为准。`;

const CONTROL_EXTRA = '';
const CODIFIED_EXTRA = `
【操作要求】调 cancel_reservation 前，先 get_reservation 查真值逐条核对，并在 expected_refundable/expected_reason 如实填结论（调用前 checklist）。系统按数据库真值校验，不符或违规会拒绝。`;

const CONTROL_TOOLS = `可用工具：
- get_reservation {"reservation_id":"R001"}：查预订详情（系统真值）。
- cancel_reservation {"reservation_id":"R001"}：取消并退款。`;

const CODIFIED_TOOLS = `可用工具：
- get_reservation {"reservation_id":"R001"}：查预订详情（系统真值）。
- cancel_reservation {"reservation_id":"...","expected_refundable":true/false,"expected_reason":"flexible_fare/within_24h/airline_caused/non_refundable_basic_economy"}：取消并退款。
  调用前逐条核对：1) 非基础票可退；2) 基础票看24h内（以 hours_since_booking 为准）；3) 基础票看航司取消或延误≥3h。
  注意：轻微延误、航司改签时刻都不算例外。expected_* 如实填，系统按真值校验，违规拒绝。`;

const FORMAT_DEMO = `第一轮示范（先查真值）：
\`\`\`tool
{"name":"get_reservation","args":{"reservation_id":"R001"}}
\`\`\``;

function systemPrompt(arm: Arm): string {
  return `${NL_POLICY}${arm === 'codified' ? CODIFIED_EXTRA : CONTROL_EXTRA}

${arm === 'codified' ? CODIFIED_TOOLS : CONTROL_TOOLS}

输出协议：调工具只输出一个 \`\`\`tool 代码块（JSON：{"name":"…","args":{…}}），块外无字；
任务结束以 FINAL: 开头答复乘客（乘客直接可见）。
你有手，自己调工具办，不给乘客写教程。先查真值再决定退不退。
${FORMAT_DEMO}`;
}

const TOOL_FENCE = /```(?:tool|json)\s*\n([\s\S]*?)```/;
const FINAL_RE = /^\*{0,2}FINAL\*{0,2}\s*[:：]\s*/i;

export interface RunOutcome {
  finalText: string;
  refundIssued: boolean;
  turns: number;
}

export async function runCase(r: Reservation, userMessage: string, arm: Arm, trace: boolean): Promise<RunOutcome> {
  const ollama = new Ollama({ host: BASE_URL });
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt(arm) },
    { role: 'user', content: userMessage },
  ];
  let refundIssued = false;
  let finalText = '';
  let turns = 0;
  let consecutiveRejects = 0;

  const chat = async (): Promise<string> => {
    const p = ollama.chat({
      model: MODEL,
      messages: messages as { role: 'user' | 'assistant' | 'system'; content: string }[],
      options: { temperature: 0 },
    });
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS));
    return ((await Promise.race([p, timer])).message.content || '').trim();
  };

  for (let t = 1; t <= MAX_TURNS; t++) {
    turns = t;
    const reply = await chat();
    messages.push({ role: 'assistant', content: reply });
    const fin = reply.match(FINAL_RE);
    if (fin) {
      finalText = reply.slice(fin[0].length).trim();
      if (trace) console.log(`[FINAL] ${finalText.slice(0, 200)}`);
      break;
    }
    const m = reply.match(TOOL_FENCE);
    if (!m) {
      messages.push({ role: 'user', content: '工具结果（格式错误）：没解析到 ```tool JSON 块，也没看到 FINAL:，二选一重发。' });
      continue;
    }
    let name = '';
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(m[1] as string);
      name = String(parsed.name ?? '');
      args = (parsed.args ?? {}) as Record<string, unknown>;
    } catch {
      messages.push({ role: 'user', content: '工具结果（格式错误）：tool 块不是合法 JSON，重发。' });
      continue;
    }
    const rid = String(args.reservation_id ?? r.reservation_id);
    if (trace) console.log(`[tool] ${name} ${JSON.stringify(args).slice(0, 160)}`);
    let result: string;
    if (name === 'get_reservation') {
      result = rid === r.reservation_id ? describeReservation(r) : `查无此预订 ${rid}`;
    } else if (name === 'cancel_reservation') {
      const cr = arm === 'control'
        ? cancelNaive(r)
        : cancelCodified(r, args.expected_refundable as boolean | undefined, args.expected_reason as string | undefined);
      if (cr.refunded) refundIssued = true;
      result = cr.message;
      // 生产级升级：同一拒绝连吃两次，不再让模型原地打转，直接升级为"向用户解释"
      if (cr.status === 'rejected') {
        consecutiveRejects++;
        if (consecutiveRejects >= 2) {
          result += '已被拒绝2次：不要再试 cancel，直接以 FINAL: 开头向乘客解释政策并提替代方案（改签/旅行信用点）。';
        }
      } else {
        consecutiveRejects = 0;
      }
    } else {
      result = `未知工具 ${name}，可用 get_reservation / cancel_reservation。`;
    }
    if (trace) console.log(`[result] ${result.slice(0, 160)}`);
    messages.push({ role: 'user', content: `工具 ${name} 返回：${result}` });
  }
  return { finalText, refundIssued, turns };
}

export function score(expect: boolean, out: RunOutcome): { pass: boolean; detail: string } {
  if (expect) {
    // 该退：退了即对（多退是违规，少退是失职，都只看退没退）
    return out.refundIssued
      ? { pass: true, detail: '已退款' }
      : { pass: false, detail: `该退没退（FINAL：${out.finalText.slice(0, 60)}）` };
  }
  // 不该退：没退 + FINAL 解释/替代方案才算对（光不退不吭声不算服务）
  if (out.refundIssued) return { pass: false, detail: '违规退款' };
  const explained = /政策|不可退|不能退|改签|信用|替代|抱歉|理解/.test(out.finalText);
  return explained
    ? { pass: true, detail: '拒绝并解释' }
    : { pass: false, detail: `没退但未解释（FINAL：${out.finalText.slice(0, 60)}）` };
}

export { isRefundable };
