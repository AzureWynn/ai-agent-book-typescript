export interface ParsedFields {
  _parser: string;
  [key: string]: unknown;
}

export interface ParseAttempt {
  parser: string | null;
  fields: ParsedFields | null;
}

export interface TestReport {
  passed: boolean;
  details: string[];
}

export interface HealResult {
  formatName: string;
  healed: boolean;
  attempts: number;
  parserName: string | null;
  lastError: string;
}
