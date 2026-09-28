import { tokenize } from './tokenizer.js';
import { Document, RankedDoc } from './types.js';

export class BM25Index {
  readonly docs: Document[];
  readonly k1: number;
  readonly b: number;
  readonly docLengths: number[];
  readonly avgdl: number;
  readonly docFreq: Map<string, number>;
  readonly postings: Map<string, Map<number, number>>;

  constructor(docs: Document[], k1 = 1.5, b = 0.75) {
    this.docs = docs;
    this.k1 = k1;
    this.b = b;
    const docTokens = docs.map((d) => tokenize(d.text));
    this.docLengths = docTokens.map((t) => t.length);
    const total = this.docLengths.reduce((s, n) => s + n, 0);
    this.avgdl = docs.length > 0 ? total / docs.length : 0;
    this.docFreq = new Map();
    this.postings = new Map();
    docTokens.forEach((tokens, docIdx) => {
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

  idf(term: string): number {
    const n = this.docs.length;
    const df = this.docFreq.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, topK = 20): RankedDoc[] {
    const queryTerms = [...new Set(tokenize(query))];
    const scores = new Map<number, number>();
    for (const term of queryTerms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const idf = this.idf(term);
      for (const [docIdx, tf] of posting) {
        const docLen = this.docLengths[docIdx] ?? 0;
        const denom = tf + this.k1 * (1 - this.b + (this.b * docLen) / (this.avgdl || 1));
        const contribution = denom > 0 ? idf * ((tf * (this.k1 + 1)) / denom) : 0;
        scores.set(docIdx, (scores.get(docIdx) ?? 0) + contribution);
      }
    }
    return [...scores.entries()]
      .map(([docIdx, score]) => {
        const doc = this.docs[docIdx];
        if (!doc) throw new Error(`Document index ${docIdx} out of range`);
        return { id: doc.id, text: doc.text, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
