import dotenv from 'dotenv';
import { EmbeddingConfig } from './types.js';

dotenv.config();

export const config: EmbeddingConfig = {
  model: process.env.OLLAMA_MODEL || 'nomic-embed-text',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  dimension: parseInt(process.env.VEC_DIMENSION || '768', 10),
  maxDocuments: parseInt(process.env.VEC_MAX_DOCUMENTS || '10000', 10),
};

export const hnswConfig = {
  M: parseInt(process.env.VEC_HNSW_M || '16', 10),
  efConstruction: parseInt(process.env.VEC_HNSW_EF_CONSTRUCTION || '200', 10),
  efSearch: parseInt(process.env.VEC_HNSW_EF_SEARCH || '50', 10),
};

export const annoyConfig = {
  nTrees: parseInt(process.env.VEC_ANNOY_N_TREES || '50', 10),
};

export const logLevel = process.env.VEC_LOG_LEVEL || 'INFO';
