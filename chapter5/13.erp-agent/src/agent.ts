import { Ollama } from 'ollama';
import { Question } from './types.js';

const MODEL = process.env.OLLAMA_MODEL || 'gemma4:latest';
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || '240000');

function getClient(): Ollama {
  return new Ollama({ host: BASE_URL });
}

async function chatWithTimeout(ollama: Ollama, payload: Parameters<Ollama['chat']>[0]): Promise<Awaited<ReturnType<Ollama['chat']>>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      ollama.chat(payload),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`ollama chat timeout after ${CHAT_TIMEOUT_MS}ms`)), CHAT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SCHEMA = `表 employees(id 员工编号, name 姓名, dept 部门, level 级别数字越大越高, hire_date 入职日期YYYY-MM-DD, leave_date 离职日期YYYY-MM-DD，NULL表示在职)；
表 salaries(emp_id 员工编号, pay_date 发薪日期每月一条YYYY-MM-01, amount 工资)。
数据库截止今天 2026-06-15：今年=2026，去年=2025，前年=2024。不要硬编码其它年份推导。`;

export function buildPrompt(q: Question): string {
  return [
    '你是数据分析师。只输出一个 SQLite 查询代码块，不要解释。',
    '',
    '数据库 schema：',
    SCHEMA,
    '',
    `问题：${q.text}`,
    `要求：${q.hint}`,
    '只输出 ```sql ... ``` 一个代码块。',
  ].join('\n');
}

export function extractSql(text: string): string | null {
  const m = text.match(/```sql([\s\S]*?)```/i) ?? text.match(/```([\s\S]*?)```/);
  const code = (m ? m[1] ?? '' : text).trim().replace(/^\s*sql\b/i, '').trim();
  return code.length > 0 ? code : null;
}

export async function generateSql(q: Question): Promise<string | null> {
  const res = await chatWithTimeout(getClient(), {
    model: MODEL,
    messages: [{ role: 'user', content: buildPrompt(q) }],
    options: { temperature: 0 },
  });
  return extractSql(res.message.content);
}
