// judging.py 对应：恢复成功？省了多少 token？参数合法且语义对吗？
// text 臂：续写不重复前缀尾（20字重叠检查）+ 含"第X天"剩余段落 → recovered。
// json 臂：full 可 JSON.parse（合法率）+ 四字段与参考值一致（语义正确率，合法≠正确）。
import type { BreakPoint } from './stream.js';
import type { Strategy } from './strategies.js';

export const JSON_REF = { city: '东京', days: 3, budget_jpy: 150000, must_eat: ['寿司', '拉面'] };

export interface Verdict {
  recovered: boolean;
  jsonLegal: boolean | null;
  jsonCorrect: boolean | null;
  note: string;
}

function overlap(a: string, b: string, n = 20): boolean {
  const tail = a.slice(-n);
  return tail.length >= n && b.startsWith(tail);
}

export function judge(bp: BreakPoint, strategy: Strategy, partial: string, continuation: string, full: string): Verdict {
  if (bp === 'text') {
    const dup = overlap(partial, continuation);
    // resend 的 full 是整轮重发：恢复成功=内容完整（含三天）；prefill/meta：不重复+有后文
    const hasDays = ['第1天', '第2天', '第3天'].filter((d) => full.includes(d)).length;
    if (strategy === 'resend') {
      return { recovered: hasDays >= 2, jsonLegal: null, jsonCorrect: null, note: `整轮重发含${hasDays}/3天` };
    }
    const recovered = !dup && full.length > partial.length + 20 && hasDays >= 2;
    return { recovered, jsonLegal: null, jsonCorrect: null, note: dup ? '重复了前缀尾' : hasDays < 2 ? `仅${hasDays}/3天` : '续上且完整' };
  }
  // tool_args 臂
  let parsed: Record<string, unknown> | null = null;
  try {
    const m = full.match(/\{[\s\S]*\}/);
    parsed = m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch { parsed = null; }
  const legal = parsed !== null;
  const p = parsed as Record<string, unknown> | null;
  const correct = legal && p !== null
    && p.city === JSON_REF.city && p.days === JSON_REF.days
    && p.budget_jpy === JSON_REF.budget_jpy
    && JSON.stringify(p.must_eat) === JSON.stringify(JSON_REF.must_eat);
  return { recovered: correct, jsonLegal: legal, jsonCorrect: correct, note: !legal ? 'JSON 非法' : !correct ? '合法但值错' : '合法且值对' };
}
