import { TextIndex } from './index.js';
import { LAWS } from './corpus.js';
import { AgentRound, AgentTrace, QuestionSpec } from './types.js';

const index = new TextIndex(LAWS.map((c) => ({ id: c.id, text: c.text })));
const byId = new Map(LAWS.map((c) => [c.id, c]));

export function singleSearch(query: string, topK: number): string[] {
  return index.search(query, topK).map((r) => r.id);
}

export function facetsOf(chunkIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of chunkIds) {
    const chunk = byId.get(id);
    if (chunk) for (const f of chunk.facets) out.add(f);
  }
  return [...out];
}

export function evidenceRecall(retrieved: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1;
  return retrieved.filter((id) => relevant.includes(id)).length / relevant.length;
}

export function runAgentic(spec: QuestionSpec, topK: number, maxRounds = 4): AgentTrace {
  const rounds: AgentRound[] = [];
  const evidence = new Set<string>();
  const planned = [spec.query, ...spec.subqueries];

  for (let i = 0; i < planned.length && i < maxRounds; i++) {
    const q = planned[i] ?? '';
    const coveredBefore = new Set(facetsOf([...evidence]));
    const hits = singleSearch(q, topK).filter((id) => !evidence.has(id));
    for (const id of hits) evidence.add(id);
    const coveredAfter = facetsOf([...evidence]);
    const newFacets = coveredAfter.filter((f) => !coveredBefore.has(f));
    const missing = spec.facets.filter((f) => !coveredAfter.includes(f));
    rounds.push({
      round: i + 1,
      query: q,
      hits,
      newFacets,
      coveredFacets: coveredAfter,
      missingFacets: missing,
    });
    if (missing.length === 0) break;
  }

  const evidenceList = [...evidence];
  return {
    rounds,
    evidence: evidenceList,
    recall: evidenceRecall(evidenceList, spec.relevant),
    retrievals: rounds.length,
  };
}
