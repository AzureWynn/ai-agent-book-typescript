import { LAWS, QUESTIONS } from './corpus.js';
import { evidenceRecall, runAgentic, singleSearch } from './agent.js';
import { generateAnswer } from './answer.js';
import { avg, missRate } from './metrics.js';

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

function traceQuestion(query: string, topK: number): void {
  const spec = QUESTIONS.find((q) => q.query === query) ?? {
    query,
    relevant: [] as string[],
    facets: [] as string[],
    subqueries: [] as string[],
    difficulty: 'easy' as const,
  };
  console.log(`\nQuery: "${query}"`);

  const single = singleSearch(query, topK);
  console.log(`[Non-Agentic: single retrieval × top-${topK}]`);
  console.log(`  hits: [${single.join(', ')}]`);
  if (spec.relevant.length > 0) {
    console.log(`  evidence recall: ${evidenceRecall(single, spec.relevant).toFixed(2)}`);
  }

  if (spec.subqueries.length === 0) {
    console.log('(custom query without labeled facets; showing single retrieval only)');
    return;
  }
  const trace = runAgentic(spec, topK);
  console.log(`[Agentic ReAct: ${trace.retrievals} retrieval(s), stop when facets covered]`);
  for (const r of trace.rounds) {
    console.log(`  round ${r.round} query="${r.query}"`);
    console.log(`    hits=[${r.hits.join(', ') || '(none new)'}] newFacets=[${r.newFacets.join(', ') || '(none)'}] missing=[${r.missingFacets.join(', ') || '(none)'}]`);
  }
  console.log(`  evidence: [${trace.evidence.join(', ')}] recall=${trace.recall.toFixed(2)}`);
}

function runDemo(args: Args): void {
  console.log('\n=== Experiment 3-8: Agentic vs Non-Agentic RAG Demo ===');
  if (args.query) {
    traceQuestion(args.query, args.topK);
    return;
  }
  const hard = QUESTIONS.find((q) => q.difficulty === 'hard');
  const easy = QUESTIONS.find((q) => q.difficulty === 'easy');
  if (hard) {
    console.log('\n--- Hard: needs 3 evidence facets ---');
    traceQuestion(hard.query, args.topK);
  }
  if (easy) {
    console.log('\n--- Easy: single facet, agent stops after round 1 ---');
    traceQuestion(easy.query, args.topK);
  }
  console.log('\nRead: single retrieval covers one facet per budget; the agent spends one retrieval per evidence gap and stops when covered.');
}

function runEval(args: Args): void {
  console.log('\n=== Experiment 3-8: Single vs Decomposed Evidence Recall ===');
  const k = args.topK;
  const rows: Array<{ q: string; d: string; single: number; decomposed: number; rounds: number }> = [];
  for (const spec of QUESTIONS) {
    const single = singleSearch(spec.query, k);
    const singleRecall = evidenceRecall(single, spec.relevant);
    const trace = runAgentic(spec, k);
    rows.push({ q: spec.query, d: spec.difficulty, single: singleRecall, decomposed: trace.recall, rounds: trace.retrievals });
    console.log(`${spec.query.slice(0, 18)}…  ${spec.difficulty.padEnd(4)}  single=${(singleRecall * 100).toFixed(0)}%  decomposed=${(trace.recall * 100).toFixed(0)}%  retrievals=1 → ${trace.retrievals}`);
  }
  const all = rows.map((r) => r.single);
  const dec = rows.map((r) => r.decomposed);
  const easyRows = rows.filter((r) => r.d === 'easy');
  const hardRows = rows.filter((r) => r.d === 'hard');
  console.log(`\nAggregate (avg evidence recall):`);
  console.log(`  all     single=${avg(all).toFixed(2)}  decomposed=${avg(dec).toFixed(2)}`);
  console.log(`  easy    single=${avg(easyRows.map((r) => r.single)).toFixed(2)}  decomposed=${avg(easyRows.map((r) => r.decomposed)).toFixed(2)}`);
  console.log(`  hard    single=${avg(hardRows.map((r) => r.single)).toFixed(2)}  decomposed=${avg(hardRows.map((r) => r.decomposed)).toFixed(2)}  miss-rate=${missRate(avg(hardRows.map((r) => r.decomposed))).toFixed(2)}`);
}

async function runAnswer(args: Args): Promise<void> {
  const byId = new Map(LAWS.map((c) => [c.id, c.text]));
  const query = args.query || '故意伤害致人重伤的，如何处罚';
  const spec = QUESTIONS.find((q) => q.query === query);
  const evidenceIds = spec
    ? runAgentic(spec, args.topK).evidence
    : singleSearch(query, args.topK);
  const evidence = evidenceIds.map((id) => ({ id, text: byId.get(id) ?? '' }));
  console.log(`\nQuery: "${query}"`);
  console.log(`Evidence (${evidence.length}): [${evidenceIds.join(', ')}]`);
  console.log('\nGenerating answer with Ollama (gemma4)...');
  const answer = await generateAnswer(query, evidence);
  console.log(`\nAnswer:\n${answer}`);
}

function main(): void {
  const args = parseArgs();
  if (args.mode === 'eval') runEval(args);
  else if (args.mode === 'answer') runAnswer(args).catch(handleError);
  else runDemo(args);
}

function handleError(err: unknown): void {
  console.error(err instanceof Error ? err.message : err);
  console.error('Make sure Ollama is running: `ollama serve`, and the model is pulled: `ollama pull gemma4:latest`');
  process.exit(1);
}

main();
