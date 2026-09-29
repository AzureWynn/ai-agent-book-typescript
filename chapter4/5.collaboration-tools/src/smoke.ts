import { callTool, listTools, sleep, withClient, writeReceipt } from './client.js';

async function main(): Promise<void> {
  console.log('=== MCP smoke: stdio → list → spawn → approval ===');
  await withClient(async (client) => {
    const tools = await listTools(client);
    console.log(`[1/4] server up, tools listed: ${tools.length}`);

    const spawned = await callTool(client, 'spawn_subagent', {
      task: '查询订单 A12345 状态',
      role: '订单查询助手',
      strategy: 'minimal',
      mode: 'sync',
    });
    console.log(`[2/4] spawn_subagent success=${spawned.success} result=${JSON.stringify(spawned.message).slice(0, 80)}`);
    if (!spawned.success) throw new Error(`smoke spawn failed: ${spawned.message}`);

    const approval = await callTool(client, 'request_admin_approval', {
      message: 'smoke test approval',
      timeout_seconds: 5,
      auto_approve: true,
    });
    console.log(`[3/4] approval success=${approval.success} status=${String(approval.metadata['status'])}`);
    if (!approval.success) throw new Error(`smoke approval failed: ${approval.message}`);

    const timer = await callTool(client, 'set_timer', { name: 'smoke', delay_seconds: 1, message: 'smoke fired' });
    await sleep(1500);
    const status = await callTool(client, 'get_timer_status', { timer_id: String(timer.metadata['timer_id']) });
    console.log(`[4/4] timer fired, receipt next`);
    if (!String(status.message).includes('fires=1')) throw new Error(`smoke timer failed: ${status.message}`);

    const receipt = writeReceipt(tools.length, { smoke: 'pass', tools: tools.map((t) => t.name) });
    console.log(`receipt written: ${receipt}`);
  });
  console.log('SMOKE PASS');
}

main().catch((err) => {
  console.error(`SMOKE FAIL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
