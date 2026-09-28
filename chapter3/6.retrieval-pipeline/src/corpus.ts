import { Document } from './types.js';

export const BUILT_IN_DOCS: Document[] = [
  { id: 'xr_7003', text: 'Product model XR-7003 is a smartphone available now. It features a 6.5 inch display and 5G connectivity.' },
  { id: 'xr_7001', text: 'Product model XR-7001 is a budget smartphone with a 6.1 inch display and 4G connectivity.' },
  { id: 'xr_7002', text: 'Product model XR-7002 is a tablet with a 10 inch display, stylus support, and WiFi 6.' },
  { id: 'http403', text: 'Error code HTTP-403 means forbidden access. The server understood the request but refuses to authorize it.' },
  { id: 'http404', text: 'Error code HTTP-404 means the requested resource was not found on the server. Check the URL path and routing.' },
  { id: 'alex', text: 'Alexander Humphrey is a historian specializing in medieval trade routes and archival research methods.' },
  { id: 'kitten', text: 'A kitten is playing with a ball of yarn in the living room, pouncing and tumbling across the rug.' },
  { id: 'feline', text: 'Feline behavior research notes: grooming patterns, sleep cycles, and territorial marking in domestic settings.' },
  { id: 'distill', text: 'Model distillation compresses a large teacher network into a small student model by matching soft targets.' },
  { id: 'bm25doc', text: 'The BM25 ranking function scores documents using term frequency, inverse document frequency, and length normalization.' },
  { id: 'happy', text: 'Happiness and excitement filled the festival as music played and crowds cheered under bright lights.' },
  { id: 'neural', text: 'Neural network training with the Adam optimizer and learning rate scheduling converges faster on benchmarks.' },
  { id: 'raft', text: 'Distributed consensus with Raft elects a leader to replicate the log across follower nodes reliably.' },
  { id: 'compiler', text: 'Compiler optimization passes include inlining, loop unrolling, and dead code elimination for release builds.' },
];

export const EVAL_LABELS: Record<string, string[]> = {
  'XR-7003': ['xr_7003'],
  cat: ['kitten', 'feline'],
  'kitty behavior': ['kitten', 'feline'],
  'Alexander Humphrey': ['alex'],
  'HTTP-403': ['http403'],
  'happiness and excitement': ['happy'],
  'model distillation': ['distill'],
};

export const EVAL_QUERIES = Object.keys(EVAL_LABELS);
