import { config } from './config.js';
import { RetrievalPipeline, SearchOptions } from './pipeline.js';
import { BUILT_IN_DOCS, EVAL_LABELS, EVAL_QUERIES } from './corpus.js';
import { scoreQuery } from './metrics.js';
import { RankedDoc } from './types.js';

interface Args {
  mode: string;
  query: string;
  topK: number;
  fusion: 'rrf' | 'weighted';
  noDense: boolean;
  noRerank: boolean;
  k1: number;
  b: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };
  const has = (name: string): boolean => argv.includes(name);
  const mode = get('--mode') ?? (has('--eval') ? 'eval' : 'demo');
  const fusionArg = get('--fusion') ?? config.fusionMethod;
  return {
    mode,
    query: get('--query') ?? get('-q') ?? 'XR-7003',
    topK: parseInt(get('--top-k') ?? get('-k') ?? '3', 10),
    fusion: fusionArg === 'weighted' ? 'weighted' : 'rrf',
    noDense: has('--no-dense'),
    noRerank: has('--no-rerank'),
    k1: parseFloat(get('--k1') ?? String(config.k1)),
    b: parseFloat(get('--b') ?? String(config.b)),
  };
}

function baseOpts(args: Args, fusion: 'rrf' | 'weighted'): SearchOptions {
  return {
    topK: args.topK,
    candidatePool: config.candidatePool,
    fusion,
    rrfK: config.rrfK,
    denseWeight: config.denseWeight,
    sparseWeight: config.sparseWeight,
    noDense: args.noDense,
    noRerank: true,
    rerankTopK: 10,
  };
}

function printList(title: string, list: RankedDoc[], limit: number): void {
  console.log(`[${title}]`);
  if (list.length === 0) {
    console.log('  (no candidates)');
    return;
  }
  list.slice(0, limit).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.id}  score=${r.score.toFixed(4)}  ${r.text.slice(0, 60)}...`);
  });
}

async function traceQuery(pipeline: RetrievalPipeline, query: string, args: Args): Promise<void> {
  const { trace, final } = await pipeline.search(query, {
    ...baseOpts(args, args.fusion),
    noRerank: args.noRerank,
  });
  console.log(`\nQuery: "${query}" (fusion=${args.fusion}${args.noDense ? ', dense=off' : ''}${args.noRerank ? ', rerank=off' : ''})`);
  printList('BM25 (sparse)', trace.sparse, args.topK);
  if (trace.dense) printList('Dense', trace.dense, args.topK);
  else console.log('[Dense]\n  (skipped --no-dense)');
  printList(`Hybrid-${args.fusion.toUpperCase()}`, trace.fused, args.topK);
  if (trace.reranked) printList('Rerank', trace.reranked, args.topK);
  else console.log('[Rerank]\n  (skipped --no-rerank)');
  console.log(`Final top-${args.topK}: [${final.map((r) => r.id).join(', ')}]`);
}

async function runDemo(args: Args): Promise<void> {
  console.log('\n=== Experiment 3-6: Hybrid Retrieval Demo ===');
  console.log(`Corpus: ${BUILT_IN_DOCS.length} docs. Stages: sparse → dense → fuse → rerank.`);
  const pipeline = await RetrievalPipeline.build(BUILT_IN_DOCS, args.k1, args.b, !args.noDense);
  await traceQuery(pipeline, args.query, args);
  if (args.query === 'XR-7003') {
    await traceQuery(pipeline, 'kitty behavior', args);
    console.log('\nRead: XR-7003 shows sparse fixing dense sibling confusion; "kitty behavior" shows dense fixing the BM25 synonym gap.');
  }
}

async function runEval(args: Args): Promise<void> {
  console.log('\n=== Experiment 3-6: Stage Eval (recall / MRR / nDCG) ===');
  const pipeline = await RetrievalPipeline.build(BUILT_IN_DOCS, args.k1, args.b, !args.noDense);
  const k = args.topK;

  interface Row { name: string; recall: number; mrr: number; ndcg: number }
  const rows: Row[] = [
    { name: 'BM25 (sparse)', recall: 0, mrr: 0, ndcg: 0 },
    ...(args.noDense ? [] : [{ name: 'Dense', recall: 0, mrr: 0, ndcg: 0 } as Row]),
    { name: 'Hybrid-RRF', recall: 0, mrr: 0, ndcg: 0 },
    { name: 'Hybrid-Weighted', recall: 0, mrr: 0, ndcg: 0 },
    ...(args.noRerank ? [] : [{ name: 'Hybrid-RRF+Rerank', recall: 0, mrr: 0, ndcg: 0 } as Row]),
  ];

  for (const q of EVAL_QUERIES) {
    const relevant = EVAL_LABELS[q] ?? [];
    const noRerankOpts = { ...baseOpts(args, 'rrf' as const) };
    const denseOnly = args.noDense ? [] : (await pipeline.search(q, { ...noRerankOpts, fusion: 'rrf', noDense: false })).trace.dense ?? [];
    const sparseOnly = (await pipeline.search(q, { ...noRerankOpts, noDense: true })).trace.sparse;
    const rrf = (await pipeline.search(q, { ...noRerankOpts, fusion: 'rrf' })).trace.fused;
    const weighted = (await pipeline.search(q, { ...noRerankOpts, fusion: 'weighted' })).trace.fused;
    const reranked = args.noRerank ? null : (await pipeline.search(q, { ...noRerankOpts, fusion: 'rrf', noRerank: false })).trace.reranked;

    const hits: Record<string, string[]> = {
      'BM25 (sparse)': sparseOnly.map((r) => r.id),
      'Hybrid-RRF': rrf.map((r) => r.id),
      'Hybrid-Weighted': weighted.map((r) => r.id),
    };
    if (!args.noDense && denseOnly) hits['Dense'] = denseOnly.map((r) => r.id);
    if (!args.noRerank && reranked) hits['Hybrid-RRF+Rerank'] = reranked.map((r) => r.id);

    for (const row of rows) {
      const m = scoreQuery(q, hits[row.name] ?? [], relevant, k);
      row.recall += m.recall;
      row.mrr += m.mrr;
      row.ndcg += m.ndcg;
    }
    const rrfTop = (hits['Hybrid-RRF'] ?? []).slice(0, k).join(',');
    console.log(`query '${q}' → RRF top-${k}: [${rrfTop}]`);
  }

  const n = EVAL_QUERIES.length;
  console.log(`\nStage / Method          Recall@${k}      MRR      nDCG@${k}`);
  console.log('-'.repeat(62));
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(22)} ${(row.recall / n).toFixed(4)}  ${(row.mrr / n).toFixed(4)}  ${(row.ndcg / n).toFixed(4)}`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.mode === 'eval') await runEval(args);
  else await runDemo(args);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
