export interface GateResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ArmResult {
  arm: 'scratch' | 'template';
  files: string[];
  genMs: number;
  genTokens: number;
  gates: GateResult[];
  traceSteps: number;
  liveAnswer: string;
  livePass: boolean;
}

export interface Comparison {
  runId: string;
  target: string;
  arms: Record<string, ArmResult>;
  winner: string;
  winnerReason: string;
}
