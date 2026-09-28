import dotenv from 'dotenv';

dotenv.config();

export const config = {
  ollamaModel: process.env.OLLAMA_MODEL || 'nomic-embed-text',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  k1: parseFloat(process.env.BM25_K1 ?? '1.5'),
  b: parseFloat(process.env.BM25_B ?? '0.75'),
  fusionMethod: (process.env.FUSION_METHOD || 'rrf') as 'rrf' | 'weighted',
  rrfK: parseInt(process.env.RRF_K ?? '60', 10),
  denseWeight: parseFloat(process.env.DENSE_WEIGHT ?? '0.5'),
  sparseWeight: parseFloat(process.env.SPARSE_WEIGHT ?? '0.5'),
  candidatePool: parseInt(process.env.CANDIDATE_POOL ?? '20', 10),
};
