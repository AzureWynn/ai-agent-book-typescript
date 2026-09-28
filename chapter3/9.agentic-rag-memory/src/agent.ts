import { TextIndex } from './index.js';
import { chunkBySession } from './chunker.js';
import { ROUNDS } from './corpus.js';
import { AgentRound, AgentTrace, MemChunk, QuerySpec, ToolCall } from './types.js';

export const CHUNKS: MemChunk[] = chunkBySession(ROUNDS, { overlapRounds: 1 });

const index = new TextIndex(CHUNKS.map((c) => ({ id: c.id, text: c.text })));
const chunkById = new Map(CHUNKS.map((c) => [c.id, c]));
const orderById = new Map(CHUNKS.map((c, i) => [c.id, i]));

function call(tool: string, args: Record<string, string | number>, result: string): ToolCall {
  return { tool, args, result };
}

export function searchMemory(query: string, topK: number): string[] {
  return index.search(query, topK).map((r) => r.id);
}

export function getConversationContext(chunkId: string): string[] {
  const pos = orderById.get(chunkId);
  if (pos === undefined) return [];
  const out: string[] = [];
  const prev = CHUNKS[pos - 1];
  const next = CHUNKS[pos + 1];
  if (prev) out.push(prev.id);
  if (next) out.push(next.id);
  return out;
}

export function getFullConversation(sessionId: string): string {
  const rounds = ROUNDS.filter((r) => r.sessionId === sessionId);
  return rounds.map((r) => `R${r.roundNo} U: ${r.user} A: ${r.assistant}`).join(' / ');
}

export function facetsOf(chunkIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of chunkIds) {
    const chunk = chunkById.get(id);
    if (chunk) for (const f of chunk.facets) out.add(f);
  }
  return [...out];
}

export function evidenceRecall(retrieved: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1;
  return retrieved.filter((id) => relevant.includes(id)).length / relevant.length;
}

export function runNaive(spec: QuerySpec, topK: number): string[] {
  return searchMemory(spec.query, topK);
}

export function runAgentic(spec: QuerySpec, topK: number, maxRounds = 4): AgentTrace {
  const rounds: AgentRound[] = [];
  const evidence = new Set<string>();
  const used = new Set<string>([spec.query]);
  let current: string | null = spec.query;
  let toolCalls = 0;
  let contextExpanded = false;

  for (let i = 0; current !== null && i < maxRounds; i++) {
    const q = current;
    const coveredBefore = new Set(facetsOf([...evidence]));
    const hits = searchMemory(q, topK).filter((id) => !evidence.has(id));
    const calls: ToolCall[] = [call('search_memory', { query: q, top_k: topK }, `[${hits.join(', ') || 'none'}]`)];
    toolCalls += 1;

    for (const id of hits) evidence.add(id);
    const coveredAfter = facetsOf([...evidence]);
    const newFacets = coveredAfter.filter((f) => !coveredBefore.has(f));
    const missing = spec.facets.filter((f) => !coveredAfter.includes(f));

    const topNew = hits[0];
    if (topNew && !contextExpanded) {
      const neighbors = getConversationContext(topNew);
      calls.push(call('get_conversation_context', { chunk_id: topNew }, `[${neighbors.join(', ') || 'none'}]`));
      toolCalls += 1;
      contextExpanded = true;
    }

    const thought =
      missing.length === 0
        ? `Facets covered [${coveredAfter.join(', ')}]; stop.`
        : `Covered [${coveredAfter.join(', ')}]; missing [${missing.join(', ')}]; next: follow-up targeting the gap.`;
    rounds.push({ round: i + 1, thought, toolCalls: calls, newFacets, coveredFacets: coveredAfter, missingFacets: missing });
    if (missing.length === 0) break;

    let best: string | null = null;
    let bestScore = 0;
    for (const sq of spec.subqueries) {
      if (used.has(sq.text)) continue;
      const score = sq.facets.filter((f) => missing.includes(f)).length;
      if (score > bestScore) {
        bestScore = score;
        best = sq.text;
      }
    }
    current = bestScore > 0 ? best : null;
    if (current) used.add(current);
  }

  const evidenceList = [...evidence];
  const firstId = evidenceList[0];
  if (firstId) {
    const sessionId = chunkById.get(firstId)?.sessionIds[0] ?? '';
    const fullText = getFullConversation(sessionId);
    const lastRound = rounds[rounds.length - 1];
    if (lastRound) {
      lastRound.toolCalls.push(
        call('get_full_conversation', { session_id: sessionId }, `${fullText.slice(0, 80)}...`)
      );
      toolCalls += 1;
    }
  }

  return {
    rounds,
    evidence: evidenceList,
    recall: evidenceRecall(evidenceList, spec.relevant),
    retrievals: rounds.length,
    toolCalls,
  };
}

export function readFullSessionOf(chunkId: string): string {
  const chunk = chunkById.get(chunkId);
  if (!chunk) return '';
  return getFullConversation(chunk.sessionIds[0] ?? '');
}
