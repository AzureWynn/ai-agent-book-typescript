import { CASES, CHARGE_CN } from './data.js';
import { FACTOR_LABELS, discoverSchema } from './discovery.js';
import { applicableFactors, extractionAccuracy, extractFactors } from './extractor.js';
import { clusterAll, globalImportance } from './archetypes.js';
import { advise, matchArchetype, parseDescription } from './advisor.js';
import { compareDiscovery } from './discover-llm.js';
import { verbalizeAdvice } from './answer.js';
import { Charge } from './types.js';

interface Args {
  mode: string;
  query: string;
  llmDiscover: boolean;
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
    llmDiscover: has('--llm-discover'),
  };
}

function label(factor: string): string {
  return FACTOR_LABELS[factor] ?? factor;
}

async function runDemo(): Promise<void> {
  console.log('\n=== Experiment 3-12: Knowledge Extraction Demo ===');
  console.log(`Cases: ${CASES.length} (theft/injury/fraud × 7). Formula + noise in data.ts, fully transparent.`);

  console.log('\n--- Stage 1: bottom-up factor discovery (rule free-list + merge) ---');
  const { schema, hits } = discoverSchema();
  console.log(`Core: ${schema.core.map(label).join(' / ')}`);
  for (const ch of ['theft', 'injury', 'fraud'] as Charge[]) {
    console.log(`Ext·${CHARGE_CN[ch]}: ${schema.extensions[ch].map(label).join(' / ')}`);
  }
  console.log(`(${hits.length} factors, each with supporting case ids)`);

  console.log('\n--- Stage 2: structured extraction (sample t3) ---');
  const sample = CASES.find((c) => c.id === 't3');
  if (sample) {
    const extracted = extractFactors(sample.fact, sample.charge);
    console.log(`fact: ${sample.fact}`);
    console.log(`extracted: ${JSON.stringify(extracted)}`);
    console.log(`gold:      ${JSON.stringify(Object.fromEntries(Object.entries(sample.gold).filter(([k]) => applicableFactors(sample.charge).includes(k))))}`);
  }

  console.log('\n--- Stage 3: per-charge clustering (k by silhouette) ---');
  const all = clusterAll();
  const importance = globalImportance(all);
  for (const cl of all) {
    console.log(`[${CHARGE_CN[cl.charge]}] k=${cl.k} silhouette=${cl.silhouette.toFixed(3)}`);
    for (const a of cl.archetypes) {
      console.log(`  ▸ ${a.id} n=${a.size} median=${a.medianMonths}m range=${a.lo}~${a.hi}m: ${a.defining.map((d) => `${label(d.factor)}(z=${d.z.toFixed(1)})`).join('、')}`);
    }
  }
  console.log(`Global importance: ${importance.slice(0, 6).map((g) => `${label(g.factor)}(${g.score.toFixed(2)})`).join(' > ')}`);

  console.log('\n--- Stage 4: advisory dialogue (theft, missing amount) ---');
  const order = importance.map((g) => g.factor);
  const turn1 = advise('朋友偷了辆电动车', all, order);
  console.log(`User: 朋友偷了辆电动车`);
  console.log(`Agent: 识别${turn1.charge ? CHARGE_CN[turn1.charge] : '未知'}，已知[${Object.keys(turn1.known).map(label).join(', ') || '无'}]，追问：${turn1.ask ? label(turn1.ask) : '无'}`);
  const turn2 = advise('偷电动车价值8000元，自首并赔偿', all, order);
  console.log(`User: 偷电动车价值8000元，自首并赔偿`);
  if (turn2.archetype) {
    console.log(`Agent: 匹配${turn2.archetype.id}（中位 ${turn2.archetype.medianMonths} 月，区间 ${turn2.archetype.lo}~${turn2.archetype.hi} 月），距离 ${turn2.distance.toFixed(2)}。`);
  }
  console.log(turn2.advice);
}

function runEval(): void {
  console.log('\n=== Experiment 3-12: Extraction Accuracy + Archetypes ===');
  let correct = 0;
  let total = 0;
  const perFactor = new Map<string, { c: number; t: number }>();
  for (const c of CASES) {
    const extracted = extractFactors(c.fact, c.charge);
    const r = extractionAccuracy(extracted, c.gold, c.charge);
    correct += r.correct;
    total += r.total;
    for (const f of applicableFactors(c.charge)) {
      const entry = perFactor.get(f) ?? { c: 0, t: 0 };
      const e = JSON.stringify(extracted[f] ?? null);
      const g = JSON.stringify((c.gold as unknown as Record<string, unknown>)[f] ?? null);
      if (e === g) entry.c += 1;
      entry.t += 1;
      perFactor.set(f, entry);
    }
  }
  console.log(`\nExtraction accuracy: ${correct}/${total} = ${(correct / total).toFixed(3)}`);
  for (const [f, s] of [...perFactor.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${label(f).padEnd(8)} ${(s.c / s.t).toFixed(2)} (${s.c}/${s.t})`);
  }

  console.log('\nArchetypes (in-sample coverage: label within matched [lo, hi]):');
  const all = clusterAll();
  let covered = 0;
  for (const cl of all) {
    console.log(`[${CHARGE_CN[cl.charge]}] k=${cl.k} silhouette=${cl.silhouette.toFixed(3)}`);
    for (const a of cl.archetypes) {
      console.log(`  ${a.id} n=${a.size} median=${a.medianMonths}m [${a.lo}~${a.hi}m] ${a.members.join(',')}`);
    }
  }
  for (const c of CASES) {
    const { known } = parseDescription(c.fact);
    const cl = all.find((x) => x.charge === c.charge);
    if (!cl) continue;
    const match = matchArchetype(known, c.charge, cl);
    if (match.archetype && c.labelMonths >= match.archetype.lo && c.labelMonths <= match.archetype.hi) covered += 1;
  }
  console.log(`\nIn-sample coverage: ${covered}/${CASES.length} = ${(covered / CASES.length).toFixed(3)} (optimistic: archetypes built WITH these cases)`);
}

async function runDiscover(llm: boolean): Promise<void> {
  const { schema } = discoverSchema();
  console.log('\nRule schema:');
  console.log(`  core: ${schema.core.join(', ')}`);
  for (const ch of ['theft', 'injury', 'fraud'] as Charge[]) {
    console.log(`  ${ch}: ${schema.extensions[ch].join(', ')}`);
  }
  if (!llm) {
    console.log('\n(add --llm-discover to compare with gemma4 free-listing; needs Ollama)');
    return;
  }
  console.log('\nAsking gemma4 to free-list factors from the same facts...');
  const { rule, llm: lines, covered, missed } = await compareDiscovery();
  console.log(`\nLLM raw lines: ${lines.length}`);
  for (const line of lines.slice(0, 15)) console.log(`  - ${line.slice(0, 60)}`);
  console.log(`\nCoverage of rule factors: ${covered.length}/${rule.length}`);
  console.log(`Covered: ${covered.join(', ')}`);
  console.log(`Missed: ${missed.join(', ') || '(none)'}`);
}

async function runAnswer(query: string): Promise<void> {
  const q = query || '朋友偷电动车价值8000元，自首并赔偿，怎么判';
  const all = clusterAll();
  const order = globalImportance(all).map((g) => g.factor);
  const result = advise(q, all, order);
  console.log(`\nQuery: "${q}"`);
  console.log(result.advice);
  console.log('\nVerbalizing with Ollama (gemma4)...');
  console.log(`\n${await verbalizeAdvice(result)}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.mode === 'eval') runEval();
    else if (args.mode === 'answer') await runAnswer(args.query);
    else if (args.mode === 'discover') await runDiscover(args.llmDiscover);
    else await runDemo();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
