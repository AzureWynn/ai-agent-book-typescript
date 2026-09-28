import { BM25Index } from './bm25.js';
import { attachEmbeddings, denseSearch } from './dense.js';
import { rrfFuse, weightedFuse } from './fusion.js';
import { rerank } from './rerank.js';
import { Document, RankedDoc, StageTrace } from './types.js';

export interface SearchOptions {
  topK: number;
  candidatePool: number;
  fusion: 'rrf' | 'weighted';
  rrfK: number;
  denseWeight: number;
  sparseWeight: number;
  noDense: boolean;
  noRerank: boolean;
  rerankTopK: number;
}

export class RetrievalPipeline {
  private bm25: BM25Index;
  private docs: Document[];

  private constructor(bm25: BM25Index, docs: Document[]) {
    this.bm25 = bm25;
    this.docs = docs;
  }

  static async build(docs: Document[], k1: number, b: number, withDense: boolean): Promise<RetrievalPipeline> {
    const bm25 = new BM25Index(docs, k1, b);
    const withEmbeddings = withDense ? await attachEmbeddings(docs) : docs;
    return new RetrievalPipeline(bm25, withEmbeddings);
  }

  async search(query: string, opts: SearchOptions): Promise<{ trace: StageTrace; final: RankedDoc[] }> {
    const sparse = this.bm25.search(query, opts.candidatePool);
    const dense = opts.noDense ? null : await denseSearch(query, this.docs, opts.candidatePool);

    const lists = dense ? [sparse, dense] : [sparse];
    const fused =
      opts.fusion === 'weighted' && dense
        ? weightedFuse(dense, sparse, opts.denseWeight, opts.sparseWeight)
        : rrfFuse(lists, opts.rrfK);

    if (opts.noRerank) {
      const final = fused.slice(0, opts.topK);
      return { trace: { sparse, dense, fused, reranked: null }, final };
    }

    const candidates = fused.slice(0, opts.rerankTopK);
    const candidateDocs = candidates
      .map((c) => this.docs.find((d) => d.id === c.id))
      .filter((d): d is Document => d !== undefined);
    const fusedRank = new Map(candidates.map((c, i) => [c.id, i]));
    const reranked = rerank(query, candidateDocs, fusedRank).map((r) => ({
      id: r.id,
      text: r.text,
      score: r.score,
    }));
    const final = reranked.slice(0, opts.topK);
    return { trace: { sparse, dense, fused, reranked }, final };
  }
}
