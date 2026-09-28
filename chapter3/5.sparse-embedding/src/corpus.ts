import { Document } from './types.js';

export const BUILT_IN_DOCS: Document[] = [
  {
    id: 'doc_0',
    text: 'Model distillation compresses a large teacher network into a small student model by matching soft targets and intermediate features.',
  },
  {
    id: 'doc_1',
    text: 'Troubleshooting guide: an HTTP 404 error means the requested resource was not found on the server. Check the URL path and routing rules.',
  },
  {
    id: 'doc_2',
    text: 'Inventory record: device XK9-2B4-7Q1 is stored in warehouse B. The product code XK9-2B4-7Q1 uniquely identifies this batch.',
  },
  {
    id: 'doc_3',
    text: 'The BM25 ranking function scores documents using term frequency, inverse document frequency, and document length normalization.',
  },
  {
    id: 'doc_4',
    text: 'A kitten is playing with a ball of yarn in the living room, pouncing and tumbling across the rug.',
  },
  {
    id: 'doc_5',
    text: 'Feline behavior research notes: grooming patterns, sleep cycles, and territorial marking in domestic settings.',
  },
  {
    id: 'doc_6',
    text: 'Neural network training with Adam optimizer and learning rate scheduling converges faster on image classification benchmarks.',
  },
  {
    id: 'doc_7',
    text: 'Database indexing with B-trees speeds up range queries, while hash indexes serve exact key lookups.',
  },
  {
    id: 'doc_8',
    text: 'Compiler optimization passes include inlining, loop unrolling, and dead code elimination for release builds.',
  },
  {
    id: 'doc_9',
    text: 'Distributed consensus with Raft elects a leader to replicate the log across follower nodes reliably.',
  },
];

export const EVAL_LABELS: Record<string, string[]> = {
  'model distillation': ['doc_0'],
  'HTTP 404 error': ['doc_1'],
  'XK9-2B4-7Q1': ['doc_2'],
  'BM25 ranking function': ['doc_3'],
  cat: ['doc_4', 'doc_5'],
};

export const EVAL_QUERIES = Object.keys(EVAL_LABELS);
