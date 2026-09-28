import { buildIndexes, checkTravelRisk, dualSearch, lookupCards } from './dual.js';
import { compare } from './compare.js';
import { generateDualAnswer } from './answer.js';

interface Args {
  mode: string;
  query: string;
  topK: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  return {
    mode: get('--mode') ?? 'demo',
    query: get('--query') ?? get('-q') ?? '',
    topK: parseInt(get('--top-k') ?? get('-k') ?? '3', 10),
  };
}

function runDemo(args: Args): void {
  console.log('\n=== Experiment 3-11: Dual-Layer Memory Demo ===');
  if (args.query) {
    const { cards, chunks } = dualSearch(args.query, args.topK);
    console.log(`\nQuery: "${args.query}"`);
    console.log(`Cards: [${cards.map((c) => c.card.key).join(', ') || '(none)'}]`);
    for (const r of chunks) console.log(`  ${r.id}  score=${r.score.toFixed(4)}  ${r.text.slice(0, 50)}...`);
    return;
  }

  console.log('\n--- Workflow: 一月东京之行还要准备什么 ---');
  console.log('[1. Fact review: cards always on]');
  for (const { card } of lookupCards('东京之行 护照', 5)) {
    console.log(`  [${card.key}] ${card.backstory}；${Object.entries(card.facts).map(([k, v]) => `${k}=${v}`).join('，')}`);
  }
  console.log('[2. Link & reason: compare dates]');
  const risk = checkTravelRisk();
  console.log(`  ${risk.message}`);
  console.log('[3. Detail check: contextual RAG]');
  const { chunks } = dualSearch('东京之行 护照', args.topK);
  for (const r of chunks) console.log(`  ${r.id}  score=${r.score.toFixed(4)}  ${r.text.slice(0, 50)}...`);
  console.log('[4. Proactive service]');
  console.log(`  ${risk.atRisk ? '护照临期风险：建议立即加急续签后再出行。' : '行程无风险。'}`);

  console.log('\n--- Compare trace: 西雅图酒店确认了吗 ---');
  const { plain, ctx } = buildIndexes();
  const q = '西雅图酒店确认了吗';
  console.log(`[Plain] ${plain.search(q, 3).map((r) => `${r.id}(${r.score.toFixed(2)})`).join(', ')}`);
  console.log(`[Contextual] ${ctx.search(q, 3).map((r) => `${r.id}(${r.score.toFixed(2)})`).join(', ')}`);
  console.log('Read: 前缀把"可以，帮我订下来"重新锚定回西雅图凯悦酒店。');
}

function runCompare(): void {
  console.log('\n=== Experiment 3-11: Plain vs Contextual Memory Recall ===');
  const report = compare();
  console.log('----------------------------------------------------');
  console.log('Method                    Recall@1  Recall@3    MRR');
  console.log('----------------------------------------------------');
  console.log(`Plain                     ${(report.plainRecallAt1 * 100).toFixed(1)}%      ${(report.plainRecallAt3 * 100).toFixed(1)}%  ${(report.plainMRR * 100).toFixed(1)}%`);
  console.log(`Contextual                ${(report.ctxRecallAt1 * 100).toFixed(1)}%      ${(report.ctxRecallAt3 * 100).toFixed(1)}%  ${(report.ctxMRR * 100).toFixed(1)}%`);
  console.log('----------------------------------------------------');
  const d1 = (report.ctxRecallAt1 - report.plainRecallAt1) * 100;
  const d3 = (report.ctxRecallAt3 - report.plainRecallAt3) * 100;
  const dm = (report.ctxMRR - report.plainMRR) * 100;
  console.log(`Gain (Δpp)                ${d1 >= 0 ? '+' : ''}${d1.toFixed(1)}pp     ${d3 >= 0 ? '+' : ''}${d3.toFixed(1)}pp  ${dm >= 0 ? '+' : ''}${dm.toFixed(1)}pp`);
  for (const r of report.rows) {
    if (r.plainRank !== 1 && r.ctxRank === 1) {
      console.log(`fixed by prefix: '${r.query.slice(0, 18)}…' plain=${r.plainRank} → ctx=${r.ctxRank}`);
    }
  }
}

async function runAnswer(args: Args): Promise<void> {
  const query = args.query || '一月东京之行还要准备什么';
  const { cards, chunks, risk } = dualSearch(query, args.topK);
  console.log(`\nQuery: "${query}"`);
  console.log(`Cards: [${cards.map((c) => c.card.key).join(', ') || '(none)'}]`);
  console.log(`Risk check: ${risk.message}`);
  console.log('\nGenerating answer with Ollama (gemma4)...');
  const answer = await generateDualAnswer(
    query,
    cards.map((c) => c.card),
    chunks
  );
  console.log(`\nAnswer:\n${answer}`);
}

function main(): void {
  const args = parseArgs();
  if (args.mode === 'compare') runCompare();
  else if (args.mode === 'answer') {
    runAnswer(args).catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      console.error('Make sure Ollama is running: `ollama serve`, model pulled: `ollama pull gemma4:latest`');
      process.exit(1);
    });
  } else runDemo(args);
}

main();
