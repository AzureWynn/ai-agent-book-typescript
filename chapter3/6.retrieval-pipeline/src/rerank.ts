import { tokenize } from './tokenizer.js';
import { Document, RerankedDoc } from './types.js';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasPhrase(docNorm: string, queryNorm: string): boolean {
  if (queryNorm.length === 0) return false;
  const padded = ` ${docNorm.replace(/\s+/g, ' ').trim()} `;
  const pattern = queryNorm
    .split(' ')
    .filter((w) => w.length > 0)
    .map((w) => `\\b${escapeRegExp(w)}\\b`)
    .join('.*?');
  return new RegExp(pattern).test(padded);
}

export function rerank(query: string, docs: Document[], fusedRank: Map<string, number>): RerankedDoc[] {
  const queryTerms = [...new Set(tokenize(query))];
  const queryNorm = normalize(query).replace(/\s+/g, ' ').trim();
  return docs
    .map((d) => {
      const rank = fusedRank.get(d.id) ?? docs.length;
      const baseScore = 1 / (rank + 1);
      const docNorm = normalize(d.text);
      const phraseBonus = hasPhrase(docNorm, queryNorm) ? 0.5 : 0;
      const docTerms = new Set(tokenize(d.text));
      const matched = queryTerms.filter((t) => docTerms.has(t)).length;
      const coverageBonus = queryTerms.length > 0 ? 0.5 * (matched / queryTerms.length) : 0;
      return {
        id: d.id,
        text: d.text,
        score: baseScore + phraseBonus + coverageBonus,
        baseScore,
        phraseBonus,
        coverageBonus,
      };
    })
    .sort((a, b) => b.score - a.score);
}
