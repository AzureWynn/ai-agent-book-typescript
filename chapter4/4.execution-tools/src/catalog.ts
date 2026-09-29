import { ToolDef } from './types.js';
import { fileTools } from './tools-files.js';
import { execTools } from './tools-exec.js';
import { externalTools } from './tools-external.js';

export const TOOLS: ToolDef[] = [...fileTools, ...execTools, ...externalTools];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toMcpTool(t: ToolDef): { name: string; description: string; inputSchema: ToolDef['inputSchema'] } {
  return { name: t.name, description: `${t.description} [${t.category}]`, inputSchema: t.inputSchema };
}

export function categories(): string[] {
  return [...new Set(TOOLS.map((t) => t.category))];
}
