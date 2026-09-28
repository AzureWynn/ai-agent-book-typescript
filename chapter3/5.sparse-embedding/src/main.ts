import { BM25Index } from './bm25.js';
import { BUILT_IN_DOCS, EVAL_LABELS, EVAL_QUERIES } from './corpus.js';
import { scoreQuery } from './metrics.js';
import { tokenize } from './tokenizer.js';

interface Args {
  mode: string;
  query: string;
  topK: number;
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
  const mode = get('--mode') ?? (has('--eval') ? 'eval' : has('--explain') ? 'explain' : 'demo');
  return {
    mode,
    query: get('--query') ?? get('-q') ?? 'model distillation',
    topK: parseInt(get('--top-k') ?? get('-k') ?? '5', 10),
    k1: parseFloat(get('--k1') ?? '1.5'),
    b: parseFloat(get('--b') ?? '0.75'),
  };
}

function printResults(query: string, index: BM25Index, topK: number): void {
  const tokens = tokenize(query);
  console.log(`\nQuery: "${query}"`);
  console.log(`Tokens: [${tokens.join(', ')}]`);
  const results = index.search(query, topK);
  if (results.length === 0) {
    console.log('No matches (all query terms missing from the index).');
    return;
  }
  for (const r of results) {
    console.log(`  ${r.id}  score=${r.score.toFixed(4)}  len=${r.docLen}  matched=[${r.matchedTerms.join(', ')}]`);
    console.log(`    ${r.text.slice(0, 80)}...`);
  }
}

function printExplain(query: string, index: BM25Index, topK: number): void {
  const tokens = tokenize(query);
  console.log(`\nExplain: "${query}" (k1=${index.k1}, b=${index.b})`);
  console.log(`Query tokens: [${tokens.join(', ')}]`);
  for (const term of [...new Set(tokens)]) {
    const df = index.docFreq.get(term) ?? 0;
    console.log(`  term "${term}": df=${df}, idf=${index.idf(term).toFixed(4)}, posting=${JSON.stringify(index.postingList(term))}`);
  }
  const results = index.search(query, topK);
  for (const r of results) {
    console.log(`\n  ${r.id}  total=${r.score.toFixed(4)}`);
    for (const t of r.termScores) {
      console.log(`    ${t.term}: tf=${t.tf} idf=${t.idf.toFixed(4)} contribution=${t.contribution.toFixed(4)}`);
    }
  }
}

function runDemo(args: Args): void {
  console.log('\n=== Experiment 3-5: BM25 Sparse Search Demo ===');
  const index = new BM25Index(BUILT_IN_DOCS, args.k1, args.b);
  console.log(`\nIndex: ${BUILT_IN_DOCS.length} docs, vocab=${index.vocabularySize()}, avgdl=${index.avgdl.toFixed(2)}, k1=${args.k1}, b=${args.b}`);

  printResults(args.query, index, args.topK);

  console.log('\n--- Synonym gap demo ---');
  printResults('cat', index, args.topK);
  console.log('Note: docs doc_4/doc_5 only say "kitten"/"feline". BM25 matches surface terms, so "cat" misses.');

  console.log('\n--- Index structure ---');
  console.log(`posting("model") = ${JSON.stringify(index.postingList('model'))}`);
  console.log(`posting("404") = ${JSON.stringify(index.postingList('404'))}`);
  console.log(`posting("xk9-2b4-7q1") = ${JSON.stringify(index.postingList('xk9-2b4-7q1'))}`);
}

function runEval(args: Args): void {
  console.log('\n=== Experiment 3-5: BM25 Eval (recall@k / precision@k / MRR) ===');
  const index = new BM25Index(BUILT_IN_DOCS, args.k1, args.b);
  let sumRecall = 0;
  let sumPrecision = 0;
  let sumRR = 0;
  for (const q of EVAL_QUERIES) {
    const relevant = EVAL_LABELS[q] ?? [];
    const hits = index.search(q, args.topK).map((r) => r.id);
    const m = scoreQuery(q, hits, relevant, args.topK);
    sumRecall += m.recall;
    sumPrecision += m.precision;
    sumRR += m.rr;
    console.log(`query '${q}'  recall@${args.topK}=${m.recall.toFixed(2)}  precision@${args.topK}=${m.precision.toFixed(2)}  RR=${m.rr.toFixed(2)}${m.recall === 0 ? '  <- miss (synonym gap)' : ''}`);
  }
  const n = EVAL_QUERIES.length;
  console.log(`macro avg  recall@${args.topK}=${(sumRecall / n).toFixed(3)}  precision@${args.topK}=${(sumPrecision / n).toFixed(3)}  MRR=${(sumRR / n).toFixed(3)}  miss-rate=${(1 - sumRecall / n).toFixed(3)}`);
}

function main(): void {
  const args = parseArgs();
  switch (args.mode) {
    case 'eval':
      runEval(args);
      break;
    case 'explain':
      printExplain(args.query, new BM25Index(BUILT_IN_DOCS, args.k1, args.b), args.topK);
      break;
    case 'demo':
    default:
      runDemo(args);
  }
}

main();
