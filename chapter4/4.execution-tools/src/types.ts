export interface ActionResponse {
  success: boolean;
  message: string;
  metadata: Record<string, unknown>;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'denied';
export type ToolCategory = 'filesystem' | 'execute' | 'external';

export interface ToolDef {
  name: string;
  description: string;
  category: ToolCategory;
  needsNetwork: boolean;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; default?: unknown }>;
    required: string[];
  };
  handler: (args: Record<string, unknown>, ctx: ExecContext) => Promise<ActionResponse>;
}

export interface ExecContext {
  workspace: string;
  noApproval: boolean;
  noVerify: boolean;
}

export function ok(message: string, metadata: Record<string, unknown> = {}): ActionResponse {
  return { success: true, message, metadata };
}

export function fail(message: string, metadata: Record<string, unknown> = {}): ActionResponse {
  return { success: false, message, metadata };
}

export function strArg(args: Record<string, unknown>, name: string, fallback = ''): string {
  const v = args[name];
  return typeof v === 'string' ? v : fallback;
}

export function numArg(args: Record<string, unknown>, name: string, fallback: number): number {
  const v = args[name];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const parsed = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function boolArg(args: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const v = args[name];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return fallback;
}
