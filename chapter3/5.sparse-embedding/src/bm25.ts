import { tokenize } from './tokenizer.js';
import { Document, ScoredDoc, TermScore } from './types.js';

export class BM25Index {
  readonly docs: Document[];
  readonly k1: number;
  readonly b: number;
  readonly docTokens: string[][];
  readonly docLengths: number[];
  readonly avgdl: number;
  readonly docFreq: Map<string, number>;
  readonly postings: Map<string, Map<number, number>>;

  constructor(docs: Document[], k1 = 1.5, b = 0.75) {
    this.docs = docs;
    this.k1 = k1;
    this.b = b;
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

  idf(term: string): number {
    const n = this.docs.length;
    const df = this.docFreq.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  private termContribution(term: string, tf: number, docLen: number): { idf: number; contribution: number } {
    const idf = this.idf(term);
    const denom = tf + this.k1 * (1 - this.b + (this.b * docLen) / (this.avgdl || 1));
    const contribution = denom > 0 ? idf * ((tf * (this.k1 + 1)) / denom) : 0;
    return { idf, contribution };
  }

  search(query: string, topK = 5): ScoredDoc[] {
    const queryTerms = [...new Set(tokenize(query))];
    const scores = new Map<number, { score: number; terms: TermScore[] }>();

    for (const term of queryTerms) {
      const posting = this.postings.get(term);
      if (!posting) continue;
      const df = this.docFreq.get(term) ?? 0;
      for (const [docIdx, tf] of posting) {
        const docLen = this.docLengths[docIdx] ?? 0;
        const { idf, contribution } = this.termContribution(term, tf, docLen);
        const entry = scores.get(docIdx) ?? { score: 0, terms: [] };
        entry.score += contribution;
        entry.terms.push({ term, tf, df, idf, contribution });
        scores.set(docIdx, entry);
      }
    }

    return [...scores.entries()]
      .map(([docIdx, entry]) => {
        const doc = this.docs[docIdx];
        if (!doc) throw new Error(`Document index ${docIdx} out of range`);
        return {
          id: doc.id,
          text: doc.text,
          score: entry.score,
          docLen: this.docLengths[docIdx] ?? 0,
          matchedTerms: entry.terms.map((t) => t.term),
          termScores: entry.terms.sort((a, b) => b.contribution - a.contribution),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  postingList(term: string): Array<{ docId: string; tf: number }> {
    const posting = this.postings.get(term.toLowerCase());
    if (!posting) return [];
    return [...posting.entries()].map(([docIdx, tf]) => ({
      docId: this.docs[docIdx]?.id ?? `doc_${docIdx}`,
      tf,
    }));
  }

  vocabularySize(): number {
    return this.docFreq.size;
  }
}
