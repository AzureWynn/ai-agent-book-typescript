import { TextIndex } from './index.js';
import { RAPTOR_NODES } from './kb.js';
import { RaptorNode } from './types.js';

export interface RaptorHit {
  node: RaptorNode;
  score: number;
  path: string[];
}

const nodeIndex = new TextIndex(RAPTOR_NODES.map((n) => ({ id: n.id, text: `${n.label} ${n.text}` })));
const byId = new Map(RAPTOR_NODES.map((n) => [n.id, n]));
const parentOf = new Map<string, string>();
for (const n of RAPTOR_NODES) {
  for (const child of n.children) parentOf.set(child, n.id);
}

export function pathToRoot(nodeId: string): string[] {
  const path = [nodeId];
  let cur = parentOf.get(nodeId);
  while (cur) {
    path.unshift(cur);
    cur = parentOf.get(cur);
  }
  return path;
}

export function searchRaptor(query: string, topK = 3): RaptorHit[] {
  return nodeIndex
    .search(query, topK)
    .map((r) => {
      const node = byId.get(r.id);
      if (!node) throw new Error(`RAPTOR node ${r.id} not found`);
      return { node, score: r.score, path: pathToRoot(r.id) };
    });
}

export function coveredChunks(hits: RaptorHit[], limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const ordered = [...hits].sort((a, b) => a.node.level - b.node.level || b.score - a.score);
  for (const h of ordered) {
    for (const c of h.node.chunks) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
