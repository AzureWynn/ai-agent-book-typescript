export interface BarDatum {
  quarter: string;
  value: number;
}

export interface ParadigmResult {
  paradigm: 'extract-to-text' | 'tool-based' | 'native';
  answer: string;
  exactCorrect: boolean;
  notes: string[];
  elapsedMs: number;
}
