import { CHUNKS, QUERIES } from './corpus.js';
import { buildIndexes, evaluate } from './compare.js';
import { contextualText, generatePrefix } from './prefix.js';

interface Args {
  mode: string;
  query: string;
  topK: number;
  perQuery: boolean;
  llmPrefix: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  const has = (name: string): boolean => argv.includes(name);
  return {
    mode: get('--mode') ?? 'demo',
    query: get('--query') ?? get('-q') ?? '',
    topK: parseInt(get('--top-k') ?? get('-k') ?? '5', 10),
    perQuery: has('--per-query'),
    llmPrefix: has('--llm-prefix'),
  };
}

function printHits(title: string, hits: Array<{ id: string; score: number }>): void {
  console.log(`[${title}]`);
  if (hits.length === 0) {
    console.log('  (no matches)');
    return;
  }
  for (const h of hits) {
    const chunk = CHUNKS.find((c) => c.id === h.id);
    console.log(`  ${h.id}  score=${h.score.toFixed(4)}  ${(chunk?.text ?? '').slice(0, 50)}...`);
  }
}

async function runDemo(args: Args): Promise<void> {
  let prefixOverride: Record<string, string> | undefined;
  if (args.llmPrefix) {
    console.log('Generating prefixes with Ollama (gemma4)...');
    const byDoc = new Map<string, string[]>();
    for (const c of CHUNKS) {
      const texts = byDoc.get(c.docId) ?? [];
      texts.push(c.text);
      byDoc.set(c.docId, texts);
    }
    prefixOverride = {};
    for (const c of CHUNKS) {
      const docText = (byDoc.get(c.docId) ?? []).join('\n');
      const generated = await generatePrefix(docText, c.text);
      prefixOverride[c.id] = generated;
      console.log(`  ${c.id}: ${generated.slice(0, 60)}...`);
    }
  }
  const { plain, ctx } = buildIndexes(prefixOverride);
  const show = args.query ? [{ query: args.query, relevant: [] as string[] }] : QUERIES.slice(0, 3);

  console.log('\n=== Experiment 3-10: Contextual Retrieval Demo ===');
  console.log(`Chunks: ${CHUNKS.length} (orphans: ${CHUNKS.filter((c) => c.orphan).map((c) => c.id).join(', ')}). Prefixes: ${args.llmPrefix ? 'gemma4 live' : 'hand-written'}.`);
  for (const q of show) {
    console.log(`\nQuery: "${q.query}"`);
    if (q.relevant.length > 0) console.log(`Gold: [${q.relevant.join(', ')}]`);
    printHits('Plain (raw text only)', plain.search(q.query, args.topK));
    printHits('Contextual (prefix + text)', ctx.search(q.query, args.topK));
  }
  if (!args.query) {
    console.log('\nRead: orphan chunks lack query terms; the prefix restores identity signals (doc name, topic) so they rank first.');
  }
}

function runCompare(): void {
  console.log('\n=== Experiment 3-10: Plain vs Contextual Recall ===');
  const report = evaluate();
  const p = report.plain;
  const c = report.ctx;
  console.log('----------------------------------------------------');
  console.log('Method              recall@1    recall@3    recall@5');
  console.log('----------------------------------------------------');
  console.log(`Plain (no prefix)   ${(p.recallAt1 * 100).toFixed(1)}%      ${(p.recallAt3 * 100).toFixed(1)}%      ${(p.recallAt5 * 100).toFixed(1)}%`);
  console.log(`Contextual (prefix) ${(c.recallAt1 * 100).toFixed(1)}%      ${(c.recallAt3 * 100).toFixed(1)}%      ${(c.recallAt5 * 100).toFixed(1)}%`);
  console.log('----------------------------------------------------');
  const d1 = (c.recallAt1 - p.recallAt1) * 100;
  const d3 = (c.recallAt3 - p.recallAt3) * 100;
  const d5 = (c.recallAt5 - p.recallAt5) * 100;
  console.log(`Gain (Δpp)          ${d1 >= 0 ? '+' : ''}${d1.toFixed(1)}pp     ${d3 >= 0 ? '+' : ''}${d3.toFixed(1)}pp     ${d5 >= 0 ? '+' : ''}${d5.toFixed(1)}pp`);
  const failDrop =
    p.recallAt1 < 1 ? (((1 - p.recallAt1) - (1 - c.recallAt1)) / (1 - p.recallAt1)) * 100 : 0;
  console.log(`Failure-rate drop (@1): ${failDrop.toFixed(0)}%`);
}

function runPerQuery(): void {
  console.log('\n=== Per-query ranks (gold position, -1 = miss) ===');
  const report = evaluate();
  for (const r of report.perQuery) {
    const mark = r.plainRank !== 1 && r.ctxRank === 1 ? '  <- prefix fixes top-1' : '';
    console.log(`'${r.query.slice(0, 16)}…'  plain=${r.plainRank}  ctx=${r.ctxRank}${mark}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.mode === 'compare') runCompare();
  else if (args.perQuery) runPerQuery();
  else {
    try {
      await runDemo(args);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      console.error('Note: --llm-prefix needs Ollama running (`ollama serve`) + gemma4 pulled.');
      process.exit(1);
    }
  }
}

main();
