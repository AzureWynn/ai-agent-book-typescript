import { TextIndex } from './index.js';
import { CHUNKS, QUERIES } from './kb.js';
import { searchRaptor, coveredChunks } from './raptor.js';
import { searchGraph } from './graph.js';
import { recallAtK, reciprocalRank } from './metrics.js';

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

const flatIndex = new TextIndex(CHUNKS.map((c) => ({ id: c.id, text: c.text })));
const chunkText = new Map(CHUNKS.map((c) => [c.id, c.text]));

function short(id: string): string {
  const text = chunkText.get(id) ?? '';
  return `${id} — ${text.slice(0, 60)}...`;
}

function traceQuery(query: string, topK: number): void {
  console.log(`\nQuery: "${query}"`);

  const flat = flatIndex.search(query, topK);
  console.log('[Flat: isolated snippets by surface match]');
  if (flat.length === 0) console.log('  (no matches)');
  for (const r of flat) console.log(`  ${r.id}  score=${r.score.toFixed(4)}`);

  const raptorHits = searchRaptor(query, topK);
  console.log('[RAPTOR: best node + root→leaf path]');
  for (const h of raptorHits) {
    console.log(`  ${h.node.id} (level ${h.node.level}, score=${h.score.toFixed(4)})  path: ${h.path.join(' → ')}`);
  }
  console.log(`  covered chunks: [${coveredChunks(raptorHits, topK).join(', ')}]`);

  const graph = searchGraph(query, 2, topK);
  console.log('[Graph: matched entities + multi-hop traversal]');
  console.log(`  matched: [${graph.matched.map((e) => e.name).join(', ') || '(none)'}]`);
  for (const edge of graph.path.slice(0, 6)) console.log(`  ${edge}`);
  for (const h of graph.hits) {
    console.log(`  ${h.chunkId}  score=${h.score.toFixed(3)}  via [${h.via.join(' → ')}]`);
  }
}

function runDemo(args: Args): void {
  console.log('\n=== Experiment 3-7: Structured Index Demo ===');
  console.log(`Tree: root → 3 mid summaries → 10 leaf chunks. Graph: 10 entities, multi-hop BFS.`);
  if (args.query) {
    traceQuery(args.query, args.topK);
    return;
  }
  const multiHop = QUERIES.find((q) => q.kind === 'multi-hop');
  const synthesis = QUERIES.find((q) => q.kind === 'synthesis');
  const overview = QUERIES.find((q) => q.kind === 'overview');
  if (multiHop) {
    console.log('\n--- Type 1: multi-hop (answer needs a 2-hop connection) ---');
    traceQuery(multiHop.query, args.topK);
  }
  if (synthesis) {
    console.log('\n--- Type 2: cross-node synthesis ---');
    traceQuery(synthesis.query, args.topK);
  }
  if (overview) {
    console.log('\n--- Type 3: multi-level navigation ---');
    traceQuery(overview.query, args.topK);
  }
  console.log('\nRead: flat returns isolated snippets; RAPTOR answers from a mid-level summary; graph derives the answer along relation edges.');
}

function runEval(args: Args): void {
  console.log('\n=== Experiment 3-7: Flat vs RAPTOR vs Graph ===');
  const k = args.topK;
  let flatR = 0;
  let raptorR = 0;
  let graphR = 0;
  let flatMRR = 0;
  let raptorMRR = 0;
  let graphMRR = 0;
  for (const q of QUERIES) {
    const flatHits = flatIndex.search(q.query, k).map((r) => r.id);
    const raptorHits = coveredChunks(searchRaptor(q.query, k), k);
    const graphHits = searchGraph(q.query, 2, k).hits.map((h) => h.chunkId);
    const fr = recallAtK(flatHits, q.relevant, k);
    const rr = recallAtK(raptorHits, q.relevant, k);
    const gr = recallAtK(graphHits, q.relevant, k);
    flatR += fr;
    raptorR += rr;
    graphR += gr;
    flatMRR += reciprocalRank(flatHits, q.relevant);
    raptorMRR += reciprocalRank(raptorHits, q.relevant);
    graphMRR += reciprocalRank(graphHits, q.relevant);
    console.log(`query '${q.query.slice(0, 45)}...' [${q.kind}]`);
    console.log(`  flat=[${flatHits.join(',')}] raptor=[${raptorHits.join(',')}] graph=[${graphHits.join(',')}]`);
  }
  const n = QUERIES.length;
  console.log(`\nMethod      Recall@${k}    MRR`);
  console.log('-'.repeat(34));
  console.log(`Flat        ${(flatR / n).toFixed(4)}  ${(flatMRR / n).toFixed(4)}`);
  console.log(`RAPTOR      ${(raptorR / n).toFixed(4)}  ${(raptorMRR / n).toFixed(4)}`);
  console.log(`Graph       ${(graphR / n).toFixed(4)}  ${(graphMRR / n).toFixed(4)}`);
}

function main(): void {
  const args = parseArgs();
  if (args.mode === 'eval') runEval(args);
  else runDemo(args);
}

main();
