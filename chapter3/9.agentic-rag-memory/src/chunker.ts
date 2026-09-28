import { tokenize } from './tokenizer.js';
import { MemChunk, Round } from './types.js';

export interface ChunkOptions {
  overlapRounds: number;
}

function roundText(r: Round): string {
  return `U: ${r.user} A: ${r.assistant}`;
}

export function chunkBySession(rounds: Round[], opts: ChunkOptions = { overlapRounds: 1 }): MemChunk[] {
  const sessions = new Map<string, Round[]>();
  for (const r of rounds) {
    const list = sessions.get(r.sessionId) ?? [];
    list.push(r);
    sessions.set(r.sessionId, list);
  }
  const sessionIds = [...sessions.keys()];
  return sessionIds.map((sid, idx) => {
    const own = sessions.get(sid) ?? [];
    const prev = idx > 0 ? (sessions.get(sessionIds[idx - 1] ?? '') ?? []) : [];
    const overlap = prev.slice(-opts.overlapRounds);
    const allRounds = [...overlap, ...own];
    const facets = [...new Set(allRounds.flatMap((r) => r.facets))];
    const header = `[session ${sid} | rounds ${allRounds.map((r) => r.roundNo).join(',')}${overlap.length > 0 ? ' (overlap)' : ''}]`;
    const overlapSessions = [...new Set(overlap.map((r) => r.sessionId))].filter((s) => s !== sid);
    return {
      id: `k_${sid}`,
      sessionIds: [sid, ...overlapSessions],
      text: `${header} ${allRounds.map(roundText).join(' ')}`,
      facets,
      roundNos: allRounds.map((r) => r.roundNo),
    };
  });
}
