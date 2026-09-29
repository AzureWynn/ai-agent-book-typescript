import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { findTool, toMcpTool, TOOLS } from './catalog.js';
import { workspaceRoot } from './safety.js';
import { ExecContext } from './types.js';

export const SERVER_NAME = 'execution-tools';
export const SERVER_VERSION = '1.0.0';

export function execContextFromEnv(): ExecContext {
  return {
    workspace: workspaceRoot(),
    noApproval: process.env.EXEC_NO_APPROVAL === '1',
    noVerify: process.env.EXEC_NO_VERIFY === '1',
  };
}

export function createServer(ctx: ExecContext): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(toMcpTool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const rawArgs = request.params.arguments ?? {};
    const args: Record<string, unknown> =
      rawArgs && typeof rawArgs === 'object' ? (rawArgs as Record<string, unknown>) : {};
    const tool = findTool(name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, message: `unknown tool: ${name}`, metadata: { tool: name } }) }],
        isError: true,
      };
    }
    for (const required of tool.inputSchema.required) {
      if (args[required] === undefined) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, message: `missing required argument: ${required}`, metadata: { tool: name } }),
            },
          ],
          isError: true,
        };
      }
    }
    const result = await tool.handler(args, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  return server;
}

async function main(): Promise<void> {
  const server = createServer(execContextFromEnv());
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
