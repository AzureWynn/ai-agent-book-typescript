import { callTool, listTools, withClient, writeReceipt } from './client.js';

async function main(): Promise<void> {
  console.log('=== MCP smoke: stdio → list → call ===');
  const summary = await withClient(async (client) => {
    const tools = await listTools(client);
    console.log(`[1/3] server up, tools listed: ${tools.length}`);
    console.log(`      ${tools.map((t) => t.name).join(', ')}`);
    const res = await callTool(client, 'file_reader', { file_path: 'README.md', max_length: 200 });
    console.log(`[2/3] file_reader success=${res.success}, chars=${String(res.message).length}`);
    if (!res.success) throw new Error(`smoke call failed: ${res.message}`);
    const receipt = writeReceipt(tools.length, {
      smoke: 'pass',
      tools: tools.map((t) => t.name),
    });
    console.log(`[3/3] receipt written: ${receipt}`);
    return { tools: tools.length, receipt };
  });
  console.log(`SMOKE PASS (${summary.tools} tools)`);
}

main().catch((err) => {
  console.error(`SMOKE FAIL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
