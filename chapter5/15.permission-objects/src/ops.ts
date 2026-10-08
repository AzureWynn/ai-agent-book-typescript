// 应用层动态生成：模型按自然语言办事意图生成操作 JSON，数据层逐条裁决。
// 操作形状固定（create/update/get 三种），模型只填参数，执行权在 store。
import { Ollama } from 'ollama';
import 'dotenv/config';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

export interface Op {
  op: 'create' | 'update' | 'get';
  type?: string;
  id?: number;
  content?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  as?: string; // recruiter | intruder | system
}

const SYSTEM_PROMPT = `你是招聘助理，只能通过操作 JSON 办事。输出一个 \`\`\`ops 代码块，里面是 JSON 数组，每项形如：
{"op":"create","type":"candidate","as":"recruiter","content":{"name":"…","email":"…","status":"applied","position_id":1,"salary_expectation":100000}}
{"op":"update","as":"recruiter","id":2,"patch":{"status":"screened"}}
{"op":"get","as":"intruder","id":2}
规则：as 只能是 recruiter/intruder/system；status 只能取 applied/screened/interviewed/hired/rejected；
块外只许写一行 SUMMARY: 说明。你有手，自己输出操作，不给用户写教程。

第一轮示范（"录用 Alice，期望薪资 10 万"只输出）：
\`\`\`ops
[{"op":"create","type":"candidate","as":"recruiter","content":{"name":"Alice","email":"alice@example.com","status":"applied","position_id":1,"salary_expectation":100000}}]
\`\`\`
SUMMARY: 为 Alice 建档`;

export async function generateOps(request: string, positionId: number, candidateId: number): Promise<{ ops: Op[]; summary: string; raw: string }> {
  const ollama = new Ollama({ host: BASE_URL });
  const p = ollama.chat({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `办事请求：${request}\n职位 position#${positionId}（8-15万）已存在，Alice 是 candidate#${candidateId}（applied）。只输出 ops 块。` },
    ],
    options: { temperature: 0 },
  });
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ollama timeout')), CHAT_TIMEOUT_MS));
  const raw = ((await Promise.race([p, timer])).message.content || '').trim();
  const m = raw.match(/```ops\s*\n([\s\S]*?)```/);
  let ops: Op[] = [];
  try {
    const parsed: unknown = JSON.parse((m?.[1] ?? '[]').trim());
    if (Array.isArray(parsed)) ops = parsed as Op[];
  } catch { ops = []; }
  const summary = raw.match(/SUMMARY:\s*(.+)/)?.[1]?.trim() ?? '';
  return { ops, summary, raw };
}
