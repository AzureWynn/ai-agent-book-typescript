import { tokenize } from './tokenizer.js';
import { TextIndex } from './index.js';
import { CARDS, CHUNKS, PREFIXES } from './corpus.js';
import { MemoryCard, RankedDoc } from './types.js';

export function contextualText(chunkId: string, text: string): string {
  const prefix = PREFIXES[chunkId] ?? '';
  return prefix ? `${prefix} ${text}` : text;
}

export function buildIndexes(): { plain: TextIndex; ctx: TextIndex } {
  const plain = new TextIndex(CHUNKS.map((c) => ({ id: c.id, text: c.text })));
  const ctx = new TextIndex(CHUNKS.map((c) => ({ id: c.id, text: contextualText(c.id, c.text) })));
  return { plain, ctx };
}

export function lookupCards(query: string, topK = 2): Array<{ card: MemoryCard; overlap: number }> {
  const queryTerms = new Set(tokenize(query));
  return CARDS.map((card) => {
    const haystack = tokenize(`${card.key} ${card.category} ${card.backstory} ${Object.values(card.facts).join(' ')}`);
    const overlap = haystack.filter((t) => queryTerms.has(t)).length;
    return { card, overlap };
  })
    .filter((r) => r.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, topK);
}

function parseMonthDay(s: string): { month: number; day: number } | null {
  const m = s.match(/(\d+)月(\d+)日/);
  if (!m) return null;
  return { month: parseInt(m[1] ?? '0', 10), day: parseInt(m[2] ?? '0', 10) };
}

export interface TravelRisk {
  atRisk: boolean;
  message: string;
}

export function checkTravelRisk(): TravelRisk {
  const trip = CARDS.find((c) => c.key === 'travel.tokyo_trip');
  const passport = CARDS.find((c) => c.key === 'personal.passport');
  const depart = trip ? parseMonthDay(trip.facts['depart'] ?? '') : null;
  const expiry = passport ? parseMonthDay(passport.facts['expiry'] ?? '') : null;
  if (!depart || !expiry) return { atRisk: false, message: '缺少行程或护照日期，无法判断。' };
  const gapDays = (expiry.month - depart.month) * 30 + (expiry.day - depart.day);
  if (gapDays < 60) {
    return {
      atRisk: true,
      message: `护照 ${passport?.facts['expiry']} 过期，距 ${trip?.facts['depart']} 出发仅约 ${gapDays} 天，建议立即加急续签。`,
    };
  }
  return { atRisk: false, message: `护照有效期充足（距出发约 ${gapDays} 天）。` };
}

export interface DualResult {
  cards: Array<{ card: MemoryCard; overlap: number }>;
  chunks: RankedDoc[];
  risk: TravelRisk;
}

export function dualSearch(query: string, topK = 3): DualResult {
  const { ctx } = buildIndexes();
  return {
    cards: lookupCards(query, 2),
    chunks: ctx.search(query, topK),
    risk: checkTravelRisk(),
  };
}
