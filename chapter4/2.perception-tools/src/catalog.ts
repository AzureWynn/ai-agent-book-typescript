import { ToolDef } from './types.js';
import { filesystemTools } from './tools-filesystem.js';
import { publicTools } from './tools-public.js';
import { summarizeTools } from './tools-summarize.js';

export const TOOLS: ToolDef[] = [...filesystemTools, ...publicTools, ...summarizeTools];

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toMcpTool(t: ToolDef): { name: string; description: string; inputSchema: ToolDef['inputSchema'] } {
  return { name: t.name, description: `${t.description} [${t.category}${t.needsNetwork ? ', network' : ', offline'}]`, inputSchema: t.inputSchema };
}

export function categories(): string[] {
  return [...new Set(TOOLS.map((t) => t.category))];
}
