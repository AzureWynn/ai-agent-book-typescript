import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionResponse } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: unknown;
}

function sdkVersion(): string {
  try {
    const pkgPath = resolve(HERE, '../node_modules/@modelcontextprotocol/sdk/package.json');
    if (!existsSync(pkgPath)) return 'unknown';
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function clientEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return { ...env, ...extra };
}

export async function withClient<T>(fn: (client: Client) => Promise<T>, envExtra: Record<string, string> = {}): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(HERE, '../node_modules/tsx/dist/cli.mjs'), resolve(HERE, 'server.ts')],
    env: clientEnv(envExtra),
  });
  const client = new Client({ name: 'collaboration-tools-client', version: '1.0.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export async function listTools(client: Client): Promise<McpToolInfo[]> {
  const res = await client.listTools();
  return res.tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema }));
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<ActionResponse> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  const text = content.find((c) => c.type === 'text')?.text ?? '{}';
  try {
    return JSON.parse(text) as ActionResponse;
  } catch {
    return { success: false, message: `non-JSON tool output: ${text.slice(0, 200)}`, metadata: { tool: name } };
  }
}

export function writeReceipt(toolCount: number, extra: Record<string, unknown> = {}): string {
  const receipt = {
    mcp_sdk_version: sdkVersion(),
    toolCount,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  const outPath = resolve(HERE, '../catalog_receipt.json');
  writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf-8');
  return outPath;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
