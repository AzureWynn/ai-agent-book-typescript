import { callTool, listTools, withClient, writeReceipt } from './client.js';

async function main(): Promise<void> {
  console.log('=== MCP smoke: stdio → list → write → verify ===');
  await withClient(async (client) => {
    const tools = await listTools(client);
    console.log(`[1/4] server up, tools listed: ${tools.length}`);
    console.log(`      ${tools.map((t) => t.name).join(', ')}`);

    const stamp = Date.now();
    const write = await callTool(client, 'file_write', { path: `smoke-${stamp}.txt`, content: 'print("smoke ok")\n' });
    console.log(`[2/4] file_write success=${write.success}`);
    if (!write.success) throw new Error(`smoke write failed: ${write.message}`);

    const run = await callTool(client, 'code_interpreter', { code: 'print(6 * 7)' });
    console.log(`[3/4] code_interpreter success=${run.success}, output=${JSON.stringify(run.message).slice(0, 60)}`);
    if (!run.success || !run.message.includes('42')) throw new Error(`smoke run failed: ${run.message}`);

    const receipt = writeReceipt(tools.length, { smoke: 'pass', tools: tools.map((t) => t.name) });
    console.log(`[4/4] receipt written: ${receipt}`);
  }, { EXEC_NO_APPROVAL: '1' });
  console.log('SMOKE PASS');
}

main().catch((err) => {
  console.error(`SMOKE FAIL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
