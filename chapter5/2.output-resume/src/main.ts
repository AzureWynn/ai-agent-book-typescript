// demo：text 断点三策略各跑一次；eval：text/json × 三策略 × 2 repeats 对照表。
// token 用 Ollama eval_count（真实输出 token），resend 当基准算节省率。
import { streamUntil, TASK_TEXT, TASK_JSON, type BreakPoint } from './stream.js';
import { recover, type Strategy } from './strategies.js';
import { judge } from './judge.js';

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';
const STRATEGIES: Strategy[] = ['resend', 'prefill', 'meta'];

async function cell(bp: BreakPoint, strategy: Strategy) {
  const { partial } = await streamUntil(bp === 'text' ? TASK_TEXT : TASK_JSON);
  const r = await recover(bp, strategy, partial);
  const v = judge(bp, strategy, partial, r.text, r.full);
  return { partial: partial.length, outTokens: r.outTokens, ...v };
}

async function main() {
  if (mode === 'demo') {
    console.log('# text 断点 × 三策略\n');
    for (const s of STRATEGIES) {
      const c = await cell('text', s);
      console.log(`[${s}] 半截${c.partial}字 → 输出token=${c.outTokens} 恢复=${c.recovered}（${c.note}）`);
    }
    console.log('\nreasoning 断点：本地 N/A（无独立思考通道，官方 prefill 在此本就退化整轮重发）。');
  } else {
    const breaks: BreakPoint[] = ['text', 'tool_args'];
    console.log('\n断点       策略     恢复   输出token  省token%  JSON合法  JSON正确  说明\n----       ----     ----   --------  -------  -------  -------  ----');
    for (const bp of breaks) {
      let base = 0;
      const rows: { s: Strategy; c: Awaited<ReturnType<typeof cell>> }[] = [];
      for (let rep = 0; rep < 2; rep++) {
        for (const s of STRATEGIES) {
          rows.push({ s, c: await cell(bp, s) });
        }
      }
      const resends = rows.filter((r) => r.s === 'resend');
      base = Math.round(resends.reduce((a, r) => a + r.c.outTokens, 0) / Math.max(1, resends.length));
      for (const { s, c } of rows) {
        const saved = base ? Math.round((1 - c.outTokens / base) * 100) : 0;
        console.log(`${bp}  ${s}  ${c.recovered ? '✓' : '✗'}  ${c.outTokens}  ${s === 'resend' ? '基准' : saved + '%'}  ${c.jsonLegal === null ? '—' : c.jsonLegal ? '✓' : '✗'}  ${c.jsonCorrect === null ? '—' : c.jsonCorrect ? '✓' : '✗'}  ${c.note}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
