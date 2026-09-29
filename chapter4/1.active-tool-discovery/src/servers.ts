import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionResponse, RegistryTool } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAPTER4 = resolve(HERE, '../..');

export interface ServerConn {
  id: string;
  dir: string;
  client: Client;
  transport: StdioClientTransport;
}

const SERVER_DIRS: Array<{ id: string; dir: string }> = [
  { id: 'perception', dir: '2.perception-tools' },
  { id: 'execution', dir: '4.execution-tools' },
  { id: 'collaboration', dir: '5.collaboration-tools' },
];

function childEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return { ...env, ...extra };
}

export async function connectAll(execWorkspace: string): Promise<{ conns: ServerConn[]; registry: RegistryTool[] }> {
  const conns: ServerConn[] = [];
  const registry: RegistryTool[] = [];
  for (const s of SERVER_DIRS) {
    const dir = resolve(CHAPTER4, s.dir);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(dir, 'node_modules/tsx/dist/cli.mjs'), resolve(dir, 'src/server.ts')],
      env: childEnv({ EXECUTION_ROOT: execWorkspace }),
      cwd: dir,
    });
    const client = new Client({ name: `discovery-hub-${s.id}`, version: '1.0.0' });
    await client.connect(transport);
    conns.push({ id: s.id, dir, client, transport });
    const listed = await client.listTools();
    for (const t of listed.tools) {
      registry.push({ server: s.id, name: t.name, description: t.description ?? '', inputSchema: t.inputSchema });
    }
  }
  return { conns, registry };
}

export async function closeAll(conns: ServerConn[]): Promise<void> {
  for (const c of conns) {
    try {
      await c.client.close();
    } catch {
      /* ignore close errors */
    }
  }
}

export async function routeCall(conns: ServerConn[], server: string, name: string, args: Record<string, unknown>): Promise<ActionResponse> {
  const conn = conns.find((c) => c.id === server);
  if (!conn) return { success: false, message: `unknown server: ${server}`, metadata: {} };
  const res = await conn.client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  const text = content.find((c) => c.type === 'text')?.text ?? '{}';
  try {
    return JSON.parse(text) as ActionResponse;
  } catch {
    return { success: false, message: `non-JSON output: ${text.slice(0, 200)}`, metadata: { server, tool: name } };
  }
}

export function sdkVersion(): string {
  try {
    const pkgPath = resolve(HERE, '../node_modules/@modelcontextprotocol/sdk/package.json');
    if (!existsSync(pkgPath)) return 'unknown';
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function writeReceipt(toolCount: number, extra: Record<string, unknown> = {}): string {
  const receipt = {
    mcp_sdk_version: sdkVersion(),
    toolCount,
    timestamp: new Date().toISOString(),
    servers: SERVER_DIRS.map((s) => s.id),
    ...extra,
  };
  const outPath = resolve(HERE, '../catalog_receipt.json');
  writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf-8');
  return outPath;
}

export function ownWorkspace(): string {
  return resolve(HERE, '../workspace');
}
