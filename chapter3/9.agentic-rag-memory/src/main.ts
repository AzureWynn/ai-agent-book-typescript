import { CHUNKS, evidenceRecall, readFullSessionOf, runAgentic, runNaive } from './agent.js';
import { QUESTIONS } from './corpus.js';
import { generateAnswer } from './answer.js';
import { avg } from './metrics.js';

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
  const spec = QUESTIONS.find((q) => q.query === query);
  console.log(`\nQuery: "${query}"`);

  const naive = runNaive({ query, relevant: [], facets: [], subqueries: [], difficulty: 'easy', layer: 'L1' }, topK);
  console.log(`[Naive: single search_memory × top-${topK}]`);
  console.log(`  hits: [${naive.join(', ') || '(none)'}]`);

  if (!spec) {
    console.log('(custom query without labeled facets; showing single retrieval only)');
    return;
  }
  console.log(`  evidence recall: ${evidenceRecall(naive, spec.relevant).toFixed(2)}`);

  const trace = runAgentic(spec, topK);
  console.log(`[Agentic ReAct: ${trace.retrievals} retrieval(s), ${trace.toolCalls} tool call(s)]`);
  for (const r of trace.rounds) {
    console.log(`  round ${r.round}: ${r.thought}`);
    for (const tc of r.toolCalls) {
      console.log(`    ${tc.tool}(${Object.values(tc.args).join(', ')}) → ${String(tc.result).slice(0, 70)}`);
    }
  }
  console.log(`  evidence: [${trace.evidence.join(', ')}] recall=${trace.recall.toFixed(2)}`);
}

function runDemo(args: Args): void {
  console.log('\n=== Experiment 3-9: Agentic RAG for User Memory Demo ===');
  console.log(`Memory: ${CHUNKS.length} session chunks (with 1-round overlap). Tools: search_memory / get_conversation_context / get_full_conversation.`);
  if (args.query) {
    traceQuestion(args.query, args.topK);
    return;
  }
  const vehicle = QUESTIONS.find((q) => q.query === '哪辆车先去保养');
  const stale = QUESTIONS.find((q) => q.query === '海边旅行还去吗');
  if (vehicle) {
    console.log('\n--- L2 multi-session: which vehicle first ---');
    traceQuestion(vehicle.query, args.topK);
  }
  if (stale) {
    console.log('\n--- L2 staleness: keep memory, prefer latest ---');
    traceQuestion(stale.query, args.topK);
  }
  console.log('\nRead: single search covers what words overlap; the agent spends one retrieval per memory gap and reads the full session before answering.');
}

function runEval(args: Args): void {
  console.log('\n=== Experiment 3-9: Naive vs Agentic Memory Recall ===');
  const k = args.topK;
  const rows: Array<{ q: string; layer: string; naive: number; agentic: number; rounds: number; tools: number }> = [];
  for (const spec of QUESTIONS) {
    const naive = runNaive(spec, k);
    const naiveRecall = evidenceRecall(naive, spec.relevant);
    const trace = runAgentic(spec, k);
    rows.push({ q: spec.query, layer: spec.layer, naive: naiveRecall, agentic: trace.recall, rounds: trace.retrievals, tools: trace.toolCalls });
    console.log(`${spec.query.slice(0, 16)}…  ${spec.layer}  naive=${(naiveRecall * 100).toFixed(0)}%  agentic=${(trace.recall * 100).toFixed(0)}%  retrievals=1 → ${trace.retrievals}  tools=${trace.toolCalls}`);
  }
  console.log(`\nAggregate (avg evidence recall):`);
  console.log(`  all  naive=${avg(rows.map((r) => r.naive)).toFixed(2)}  agentic=${avg(rows.map((r) => r.agentic)).toFixed(2)}`);
  for (const layer of ['L1', 'L2', 'L3']) {
    const rs = rows.filter((r) => r.layer === layer);
    if (rs.length === 0) continue;
    console.log(`  ${layer}   naive=${avg(rs.map((r) => r.naive)).toFixed(2)}  agentic=${avg(rs.map((r) => r.agentic)).toFixed(2)}`);
  }
}

async function runAnswer(args: Args): Promise<void> {
  const byId = new Map(CHUNKS.map((c) => [c.id, c.text]));
  const query = args.query || '哪辆车先去保养';
  const spec = QUESTIONS.find((q) => q.query === query);
  const evidenceIds = spec ? runAgentic(spec, args.topK).evidence : runNaive({ query, relevant: [], facets: [], subqueries: [], difficulty: 'easy', layer: 'L1' }, args.topK);
  const evidence = evidenceIds.map((id) => ({ id, text: byId.get(id) ?? '' }));
  console.log(`\nQuery: "${query}"`);
  console.log(`Evidence (${evidence.length}): [${evidenceIds.join(', ')}]`);
  if (evidenceIds.length > 0) {
    console.log(`Full session of ${evidenceIds[0]}: ${readFullSessionOf(evidenceIds[0] ?? '').slice(0, 120)}...`);
  }
  console.log('\nGenerating answer with Ollama (gemma4)...');
  const answer = await generateAnswer(query, evidence);
  console.log(`\nAnswer:\n${answer}`);
}

function main(): void {
  const args = parseArgs();
  if (args.mode === 'eval') runEval(args);
  else if (args.mode === 'answer') {
    runAnswer(args).catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      console.error('Make sure Ollama is running: `ollama serve`, model pulled: `ollama pull gemma4:latest`');
      process.exit(1);
    });
  } else runDemo(args);
}

main();
