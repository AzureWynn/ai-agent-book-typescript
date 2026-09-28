import { tokenize } from './tokenizer.js';
import { ENTITIES, RELATIONS } from './kb.js';
import { Entity } from './types.js';

export interface GraphHit {
  chunkId: string;
  score: number;
  via: string[];
}

function aliasTokens(e: Entity): string[][] {
  return e.aliases.map((a) => tokenize(a));
}

export function matchEntities(query: string): Entity[] {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return [];
  return ENTITIES.filter((e) =>
    aliasTokens(e).some((tokens) => tokens.length > 0 && tokens.every((t) => queryTerms.has(t)))
  );
}

function neighbors(id: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const r of RELATIONS) {
    if (r.from === id) out.push({ id: r.to, label: r.label });
    else if (r.to === id) out.push({ id: r.from, label: `${r.label} (reverse)` });
  }
  return out;
}

export interface GraphTrace {
  matched: Entity[];
  path: string[];
  hits: GraphHit[];
}

export function searchGraph(query: string, maxHops = 2, topK = 5): GraphTrace {
  const matched = matchEntities(query);
  const visited = new Map<string, { dist: number; via: string[] }>();
  const queue: Array<{ id: string; dist: number; via: string[] }> = matched.map((e) => ({
    id: e.id,
    dist: 0,
    via: [e.name],
  }));
  for (const e of matched) visited.set(e.id, { dist: 0, via: [e.name] });

  const path: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || cur.dist >= maxHops) continue;
    for (const nb of neighbors(cur.id)) {
      if (visited.has(nb.id)) continue;
      const edge = `${cur.via[cur.via.length - 1]} --${nb.label}--> ${nb.id.toUpperCase()}`;
      path.push(edge);
      const via = [...cur.via, nb.id.toUpperCase()];
      visited.set(nb.id, { dist: cur.dist + 1, via });
      queue.push({ id: nb.id, dist: cur.dist + 1, via });
    }
  }

  const chunkScores = new Map<string, { score: number; via: string[] }>();
  for (const [entityId, info] of visited) {
    const entity = ENTITIES.find((e) => e.id === entityId);
    if (!entity) continue;
    const weight = 1 / (info.dist + 1);
    for (const chunkId of entity.chunkIds) {
      const prev = chunkScores.get(chunkId);
      const score = (prev?.score ?? 0) + weight;
      const via = prev ? [...prev.via, ...info.via.filter((v) => !prev.via.includes(v))] : info.via;
      chunkScores.set(chunkId, { score, via });
    }
  }

  const hits = [...chunkScores.entries()]
    .map(([chunkId, e]) => ({ chunkId, score: e.score, via: e.via }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return { matched, path, hits };
}
