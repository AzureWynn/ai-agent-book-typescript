// run_handoff.run_pair 对应：A 跑 2 次工具调用 → 切 B（三臂）→ 跑完。
// 记录：切换后首请求状态、数据齐备、总额正确、重复调用指纹、切换后轮数/token。
import { Trace, fingerprint, type ToolCall } from './trace.js';
import { TASK, execute, answerIsCorrect } from './tools.js';
import { callA, callB, resetOutage, tripOutage, SWITCH_AFTER, ProviderError } from './vendors.js';
import { renderForB, type Arm } from './renderers.js';

const TOOL_FENCE = /```[^\n`]*\n([\s\S]*?)```/;
const FINAL_RE = /^\*{0,2}FINAL\*{0,2}\s*[:：]\s*/i;
const MAX_ROUNDS = 10;

export interface HandoffRecord {
  arm: Arm;
  handoffStatus: number | null;
  dataComplete: boolean;
  answerCorrect: boolean;
  repeatedCalls: string[];
  roundsAfterSwitch: number;
  tokensAfterSwitch: number;
  finalText: string;
  error: string | null;
}

let callSeq = 0;

async function modelStep(current: 'A' | 'B', aMessages: { role: string; content: string }[], bHistory: string[]): Promise<{ text: string; outTokens: number }> {
  if (current === 'A') {
    return callA(aMessages);
  }
  const prompt = bHistory.join('\n');
  const r = await callB(prompt);
  bHistory.push(`助手上一轮：${r.text}`);
  return r;
}

export async function runPair(arm: Arm, traceLog: boolean): Promise<HandoffRecord> {
  resetOutage();
  const trace = new Trace();
  trace.user(TASK);
  const aMessages: { role: string; content: string }[] = [
    { role: 'system', content: (await import('./vendors.js')).SYSTEM },
    { role: 'user', content: TASK },
  ];
  const bHistory: string[] = [];
  const rec: HandoffRecord = {
    arm, handoffStatus: null, dataComplete: false, answerCorrect: false,
    repeatedCalls: [], roundsAfterSwitch: 0, tokensAfterSwitch: 0, finalText: '', error: null,
  };
  const beforeSwitch = new Set<string>();
  let callsDone = 0;
  let switched = false;
  let current: 'A' | 'B' = 'A';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (callsDone >= SWITCH_AFTER && !switched) {
      switched = true;
      current = 'B';
      tripOutage();
      bHistory.push(renderForB(trace, arm, TASK));
      if (traceLog) console.log(`  [switch→B/${arm}] ${bHistory[0]?.slice(0, 120).replace(/\n/g, ' ')}…`);
    }
    let step: { text: string; outTokens: number };
    try {
      step = await modelStep(current, aMessages, bHistory);
    } catch (e) {
      if (switched && rec.handoffStatus === null && e instanceof ProviderError) {
        rec.handoffStatus = e.status;
      }
      rec.error = e instanceof Error ? `${(e as ProviderError).status ?? ''} ${(e as Error).message}`.trim() : String(e);
      break;
    }
    if (switched && rec.handoffStatus === null) rec.handoffStatus = 200;
    if (switched) {
      rec.roundsAfterSwitch++;
      rec.tokensAfterSwitch += step.outTokens;
    }
    const reply = step.text;
    if (current === 'A') aMessages.push({ role: 'assistant', content: reply });
    else bHistory.push(`助手：${reply}`);

    const fin = reply.match(FINAL_RE);
    if (fin) {
      rec.finalText = reply.slice(fin[0].length).trim();
      const called = new Set(trace.steps.flatMap((s) => (s.tool_calls ?? []).map((c) => c.name)));
      rec.dataComplete = ['get_flight_price', 'get_hotel_price', 'get_meal_budget'].every((n) => called.has(n));
      rec.answerCorrect = answerIsCorrect(rec.finalText);
      if (traceLog) console.log(`  [FINAL] ${rec.finalText.slice(0, 160)}`);
      break;
    }
    const m = reply.match(TOOL_FENCE);
    if (!m) {
      const fb = '工具结果（格式错误）：没解析到 ```tool JSON 块，也没看到 FINAL:，二选一重发。';
      if (current === 'A') aMessages.push({ role: 'user', content: fb });
      else bHistory.push(`工具结果（格式错误）：${fb}`);
      continue;
    }
    let name = '';
    let args: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(m[1] as string);
      name = String(parsed.name ?? '');
      args = (parsed.args ?? {}) as Record<string, unknown>;
    } catch {
      const fb = '工具结果（格式错误）：tool 块不是合法 JSON，重发。';
      if (current === 'A') aMessages.push({ role: 'user', content: fb });
      else bHistory.push(`工具结果（格式错误）：${fb}`);
      continue;
    }
    const call: ToolCall = { name, args, call_id: `call_${++callSeq}` };
    const fp = fingerprint(call);
    if (switched) {
      if (beforeSwitch.has(fp)) rec.repeatedCalls.push(fp);
    } else {
      beforeSwitch.add(fp);
    }
    const result = execute(name, args);
    trace.add({ role: 'assistant', text: null, tool_calls: [call], issuer: current, reasoning: { text: reply.slice(0, 200), credential: null, issuer: current, kind: 'plaintext' } });
    trace.toolResult(call.call_id, name, result);
    if (traceLog) console.log(`  [${current}] ${name} → ${result}`);
    const back = `工具 ${name} 返回：${result}`;
    if (current === 'A') aMessages.push({ role: 'user', content: back });
    else bHistory.push(back);
    callsDone++;
  }
  return rec;
}
