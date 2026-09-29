import { ExecContext, ToolDef, fail } from './types.js';

function blocked(tool: string, missing: string): ToolDef {
  return {
    name: tool,
    description: `BLOCKED: needs ${missing}. Listed for honest capability reporting; never mocked.`,
    category: 'external',
    needsNetwork: true,
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async (_args: Record<string, unknown>, _ctx: ExecContext) =>
      fail(`${tool} blocked: ${missing} not configured`, { tool, blocked: true }),
  };
}

export const externalTools: ToolDef[] = [
  blocked('calendar_add', 'Google Calendar OAuth credentials'),
  blocked('github_create_pr', 'GITHUB_TOKEN with repo scope'),
];
