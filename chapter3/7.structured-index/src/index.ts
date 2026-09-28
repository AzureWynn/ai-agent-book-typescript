import { tokenize } from './tokenizer.js';
import { RankedDoc } from './types.js';

export class TextIndex {
  private docTokens: string[][];
  private docLengths: number[];
  private avgdl: number;
  private docFreq: Map<string, number>;
  private postings: Map<string, Map<number, number>>;
  private ids: string[];
  private texts: string[];

  constructor(docs: Array<{ id: string; text: string }>, private k1 = 1.5, private b = 0.75) {
    this.ids = docs.map((d) => d.id);
    this.texts = docs.map((d) => d.text);
    this.docTokens = docs.map((d) => tokenize(d.text));
    this.docLengths = this.docTokens.map((t) => t.length);
    const total = this.docLengths.reduce((s, n) => s + n, 0);
    this.avgdl = docs.length > 0 ? total / docs.length : 0;
    this.docFreq = new Map();
    this.postings = new Map();
    this.docTokens.forEach((tokens, docIdx) => {
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [term, count] of tf) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
        let posting = this.postings.get(term);
        if (!posting) {
          posting = new Map();
          this.postings.set(term, posting);
        }
        posting.set(docIdx, count);
      }
    });
  }

  search(query: string, topK = 5): RankedDoc[] {
    const queryTerms = [...new Set(tokenize(query))];
    const scores = new Map<number, number>();
    for (const term of queryTerms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const df = this.docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (this.ids.length - df + 0.5) / (df + 0.5));
      for (const [docIdx, tf] of posting) {
        const docLen = this.docLengths[docIdx] ?? 0;
        const denom = tf + this.k1 * (1 - this.b + (this.b * docLen) / (this.avgdl || 1));
        const contribution = denom > 0 ? idf * ((tf * (this.k1 + 1)) / denom) : 0;
        scores.set(docIdx, (scores.get(docIdx) ?? 0) + contribution);
      }
    }
    return [...scores.entries()]
      .map(([docIdx, score]) => ({
        id: this.ids[docIdx] ?? `idx_${docIdx}`,
        text: this.texts[docIdx] ?? '',
        score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
