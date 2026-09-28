import { config, hnswConfig, annoyConfig } from './config.js';
import { embed, buildDocumentEmbeddings, exactSearch } from './embedding-service.js';
import { buildAnnoyIndex, searchAnnoy } from './annoy-index.js';
import { buildHnswIndex, searchHnsw } from './hnsw-index.js';
import { Document, SearchResult } from './types.js';

const TOPICS = [
  'machine learning algorithms and optimization',
  'neural network architectures and layers',
  'natural language processing and tokenization',
  'computer vision and image recognition',
  'reinforcement learning and reward shaping',
  'data preprocessing and normalization',
  'feature engineering and selection',
  'model evaluation and cross-validation',
  'transfer learning and fine-tuning',
  'distributed training and parallelism',
  'graph neural networks and message passing',
  'recommendation systems and collaborative filtering',
  'speech recognition and audio processing',
  'time series forecasting and anomaly detection',
  'generative models and diffusion processes',
  'knowledge graphs and relational reasoning',
  'information retrieval and ranking',
  'database query optimization',
  'distributed systems and consensus',
  'compiler design and optimization',
  'operating systems and scheduling',
  'computer networks and protocols',
  'cryptography and security',
  'software testing and verification',
  'human computer interaction',
  'robotics and control systems',
  'quantum computing and algorithms',
  'bioinformatics and genomics',
  'climate modeling and simulation',
  'financial modeling and risk analysis',
];

function createTestDocuments(count: number): Document[] {
  const docs: Document[] = [];
  for (let i = 0; i < count; i++) {
    const topic = TOPICS[i % TOPICS.length];
    docs.push({
      id: `doc_${i}`,
      text: `${topic} — study ${i}: this document covers advanced topics in ${topic}, including theoretical foundations, practical implementations, and empirical results from recent research`,
    });
  }
  return docs;
}

async function runComparison(): Promise<void> {
  const docCount = 200;
  console.log(`\n=== Experiment 3-4: ANNOY vs HNSW Comparison ===`);
  console.log(`Documents: ${docCount}`);
  console.log(`ANN: nTrees=${annoyConfig.nTrees}  HNSW: M=${hnswConfig.M}, efConstruction=${hnswConfig.efConstruction}, efSearch=${hnswConfig.efSearch}`);

  const docs = createTestDocuments(docCount);
  const embeddedDocs = await buildDocumentEmbeddings(docs);
  console.log(`Embedding dimension: ${embeddedDocs[0]?.embedding?.length}`);

  const queries = [
    'neural network architectures',
    'natural language processing',
    'computer vision techniques',
    'reinforcement learning methods',
    'model evaluation metrics',
  ];
  const queryVectors = await Promise.all(queries.map((q) => embed(q)));
  const k = 10;

  const exactIdSets = queryVectors.map(
    (q) => new Set(exactSearch(q, embeddedDocs, k).map((r) => r.id))
  );

  const annoyBuildMs = await buildAnnoyIndex(embeddedDocs);
  const hnswBuildMs = await buildHnswIndex(embeddedDocs);

  let annoyRecallSum = 0;
  let hnswRecallSum = 0;
  for (let i = 0; i < queryVectors.length; i++) {
    const q = queryVectors[i];
    const exactIds = exactIdSets[i];
    if (!q || !exactIds) continue;
    const annoyHits = searchAnnoy(q, k).filter((r) => exactIds.has(r.id)).length;
    const hnswHits = searchHnsw(q, k).filter((r) => exactIds.has(r.id)).length;
    annoyRecallSum += annoyHits / k;
    hnswRecallSum += hnswHits / k;
  }
  const annoyRecall = annoyRecallSum / queryVectors.length;
  const hnswRecall = hnswRecallSum / queryVectors.length;

  const annoyStart = Date.now();
  for (const q of queryVectors) searchAnnoy(q, k);
  const annoyQueryMs = (Date.now() - annoyStart) / queryVectors.length;
  const hnswStart = Date.now();
  for (const q of queryVectors) searchHnsw(q, k);
  const hnswQueryMs = (Date.now() - hnswStart) / queryVectors.length;

  console.log(`\n--- Build Time ---`);
  console.log(`ANNOY: ${annoyBuildMs}ms`);
  console.log(`HNSW:  ${hnswBuildMs}ms`);

  console.log(`\n--- Avg Query Latency (top-${k}, ${queries.length} queries) ---`);
  console.log(`ANNOY: ${annoyQueryMs.toFixed(2)}ms`);
  console.log(`HNSW:  ${hnswQueryMs.toFixed(2)}ms`);

  console.log(`\n--- Recall@${k} vs Exact (avg over ${queries.length} queries) ---`);
  console.log(`ANNOY: ${(annoyRecall * 100).toFixed(1)}%`);
  console.log(`HNSW:  ${(hnswRecall * 100).toFixed(1)}%`);
  console.log(`Exact: 100% (baseline)`);

  console.log(`\n--- Summary ---`);
  console.log(`ANNOY: fast build, memory-efficient, recall tuned by n_trees`);
  console.log(`HNSW:  higher recall, supports incremental updates, more memory`);
}

async function runDemo(): Promise<void> {
  console.log('\n=== Experiment 3-4: Dense Embedding Search Demo ===\n');

  const docs = createTestDocuments(10);
  const embeddedDocs = await buildDocumentEmbeddings(docs);

  console.log('Sample documents:');
  embeddedDocs.forEach((d) => console.log(`  ${d.id}: ${d.text.slice(0, 55)}...`));

  const query = await embed('deep learning models');
  const exactResults = exactSearch(query, embeddedDocs, 3);

  console.log(`\nExact search for "deep learning models":`);
  exactResults.forEach((r) => console.log(`  ${r.id}: ${r.text.slice(0, 40)}... (score: ${r.score.toFixed(3)})`));

  const annoyBuildMs = await buildAnnoyIndex(embeddedDocs);
  const hnswBuildMs = await buildHnswIndex(embeddedDocs);
  console.log(`\nIndex build: ANNOY=${annoyBuildMs}ms, HNSW=${hnswBuildMs}ms`);

  const annoyResults = searchAnnoy(query, 3);
  const hnswResults = searchHnsw(query, 3);

  console.log(`\nANNOY search for "deep learning models":`);
  annoyResults.forEach((r) => console.log(`  ${r.id}: ${r.text.slice(0, 40)}... (score: ${r.score.toFixed(3)})`));

  console.log(`\nHNSW search for "deep learning models":`);
  hnswResults.forEach((r) => console.log(`  ${r.id}: ${r.text.slice(0, 40)}... (score: ${r.score.toFixed(3)})`));
}

async function runSweep(): Promise<void> {
  const docCount = 500;
  console.log(`\n=== Experiment 3-4: ANN Parameter Sweep ===`);
  console.log(`Documents: ${docCount}, top-k=10\n`);

  const docs = createTestDocuments(docCount);
  const embeddedDocs = await buildDocumentEmbeddings(docs);

  const queries = [
    'neural network architectures',
    'natural language processing',
    'computer vision techniques',
    'reinforcement learning methods',
    'model evaluation metrics',
  ];
  const queryVectors = await Promise.all(queries.map((q) => embed(q)));
  const k = 10;
  const exactIdSets = queryVectors.map(
    (q) => new Set(exactSearch(q, embeddedDocs, k).map((r) => r.id))
  );

  await buildAnnoyIndex(embeddedDocs);
  await buildHnswIndex(embeddedDocs);

  console.log('--- ANNOY: recall vs n_trees ---');
  console.log('n_trees | recall@10');
  for (const nTrees of [1, 2, 5, 10, 50]) {
    await buildAnnoyIndex(embeddedDocs, nTrees);
    let sum = 0;
    for (let i = 0; i < queryVectors.length; i++) {
      const q = queryVectors[i];
      const exactIds = exactIdSets[i];
      if (!q || !exactIds) continue;
      const hits = searchAnnoy(q, k).filter((r) => exactIds.has(r.id)).length;
      sum += hits / k;
    }
    console.log(`${String(nTrees).padStart(7)} | ${((sum / queryVectors.length) * 100).toFixed(1)}%`);
  }

  console.log('\n--- HNSW: recall vs ef_search ---');
  console.log('ef_search | recall@10');
  for (const efSearch of [1, 2, 5, 10, 50]) {
    await buildHnswIndex(embeddedDocs, efSearch);
    let sum = 0;
    for (let i = 0; i < queryVectors.length; i++) {
      const q = queryVectors[i];
      const exactIds = exactIdSets[i];
      if (!q || !exactIds) continue;
      const hits = searchHnsw(q, k).filter((r) => exactIds.has(r.id)).length;
      sum += hits / k;
    }
    console.log(`${String(efSearch).padStart(9)} | ${((sum / queryVectors.length) * 100).toFixed(1)}%`);
  }
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';
  switch (mode) {
    case 'compare':
      await runComparison();
      break;
    case 'sweep':
      await runSweep();
      break;
    case 'demo':
    default:
      await runDemo();
  }
}

main().catch(console.error);
