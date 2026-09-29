import dotenv from 'dotenv';
import { categories, findTool, TOOLS } from './catalog.js';
import { callTool, listTools, sleep, withClient } from './client.js';

dotenv.config();

const PARENT_TRAJECTORY = [
  '[FROM_USER] 用户申请订单A12345退款320元，用户是VIP。',
  '[FROM_MAIN_AGENT] 工资卡尾号4832用于核验（隐私字段，不得外传）。',
  '[TOOL_RESULT] 订单A12345：蓝牙耳机，已发货。',
].join('\n');

const REFUND_TASK = '处理订单A12345的退款申请';

function parseKV(rest: string[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const item of rest) {
    const eq = item.indexOf('=');
    if (eq === -1) continue;
    const key = item.slice(0, eq);
    const raw = item.slice(eq + 1);
    if (raw === 'true' || raw === 'false') args[key] = raw === 'true';
    else if (raw !== '' && !Number.isNaN(Number(raw))) args[key] = Number(raw);
    else args[key] = raw;
  }
  return args;
}

async function ollamaReachable(): Promise<boolean> {
  try {
    const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function cmdList(category?: string): Promise<void> {
  const list = category ? TOOLS.filter((t) => t.category === category) : TOOLS;
  if (category && !categories().includes(category)) {
    console.log(`unknown category: ${category} (known: ${categories().join(', ')})`);
    return;
  }
  console.log(`\nCollaboration tools (${list.length}${category ? ` in ${category}` : ''}):`);
  for (const t of list) {
    console.log(`  ${t.name}  [${t.category}${t.needsNetwork ? ', network' : ', offline'}]`);
  }
  console.log('\nCategories:', categories().join(', '));
}

async function cmdInfo(name: string): Promise<void> {
  const t = findTool(name);
  if (!t) {
    console.log(`unknown tool: ${name}`);
    return;
  }
  console.log(`\n${t.name} [${t.category}${t.needsNetwork ? ', network' : ', offline'}]`);
  console.log(t.description);
  console.log('Parameters:');
  for (const [p, schema] of Object.entries(t.inputSchema.properties)) {
    const required = t.inputSchema.required.includes(p) ? ' (required)' : '';
    const def = schema.default !== undefined ? ` [default: ${JSON.stringify(schema.default)}]` : '';
    console.log(`  ${p}: ${schema.type} — ${schema.description}${required}${def}`);
  }
}

async function cmdRun(name: string, rest: string[]): Promise<void> {
  const t = findTool(name);
  if (!t) {
    console.log(`unknown tool: ${name}`);
    return;
  }
  const result = await withClient((client) => callTool(client, name, parseKV(rest)));
  console.log(JSON.stringify(result, null, 2));
}

async function cmdDemo(): Promise<void> {
  console.log('\n=== Experiment 4-5: Refund Coordination Demo ===');
  console.log('Flow: delegate sub-agent (compare strategies) → HITL approve → notify → timer.');
  const llmUp = await ollamaReachable();
  await withClient(async (client) => {
    console.log('\n[1. context strategies]');
    const minimal = await callTool(client, 'spawn_subagent', {
      task: REFUND_TASK,
      role: '退款助手',
      strategy: 'minimal',
      mode: 'sync',
      parent_trajectory: PARENT_TRAJECTORY,
    });
    console.log(`minimal: tokens=${String(minimal.metadata['handoffTokens'])} canaryLeaked=${String(minimal.metadata['canaryLeaked'])} → ${minimal.message.slice(0, 80)}`);
    if (llmUp) {
      const generated = await callTool(client, 'spawn_subagent', {
        task: REFUND_TASK,
        role: '退款助手',
        strategy: 'llm_generated',
        mode: 'sync',
        parent_trajectory: PARENT_TRAJECTORY,
      });
      console.log(`llm_generated: tokens=${String(generated.metadata['handoffTokens'])} canaryLeaked=${String(generated.metadata['canaryLeaked'])} → ${generated.message.slice(0, 80)}`);
    } else {
      console.log('llm_generated: SKIPPED (Ollama unreachable; needs LLM key/model)');
    }

    console.log('\n[2. HITL approval]');
    const approved = await callTool(client, 'request_admin_approval', {
      message: '批准订单A12345退款320元？',
      timeout_seconds: 5,
      auto_approve: true,
    });
    console.log(`approve path: ${approved.message.slice(0, 80)}`);
    const expired = await callTool(client, 'request_admin_approval', {
      message: '无人值守的审批（1秒超时）',
      timeout_seconds: 1,
      auto_approve: false,
    });
    console.log(`timeout path: ${expired.message.slice(0, 100)}`);

    console.log('\n[3. notify preflight]');
    const notify = await callTool(client, 'send_notification', { channel: 'slack', message: '退款已批准' });
    console.log(`slack: success=${notify.success} (expect false: ${String(notify.message).slice(0, 70)})`);

    console.log('\n[4. timer]');
    const timer = await callTool(client, 'set_timer', { name: 'refund-followup', delay_seconds: 1, message: '回访退款用户' });
    await sleep(1500);
    const status = await callTool(client, 'get_timer_status', { timer_id: String(timer.metadata['timer_id']) });
    console.log(`timer: ${status.message}`);
  });
  console.log('\nRead: minimal starves (need_info), llm_generated completes; approval has two paths; notify never really sends.');
}

interface EvalCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

async function cmdEval(): Promise<void> {
  console.log('\n=== Experiment 4-5: Acceptance Checks ===');
  const checks: EvalCheck[] = [];
  const push = (name: string, status: EvalCheck['status'], detail: string): void => {
    checks.push({ name, status, detail });
    console.log(`${status === 'pass' ? '✓' : status === 'fail' ? '✗' : '-'} ${name}: ${detail}`);
  };
  const llmUp = await ollamaReachable();
  await withClient(async (client) => {
    const minimal = await callTool(client, 'spawn_subagent', {
      task: REFUND_TASK,
      role: '退款助手',
      strategy: 'minimal',
      mode: 'sync',
      parent_trajectory: PARENT_TRAJECTORY,
    });
    push(
      'minimal: cheap + private + starved',
      minimal.success &&
        (minimal.metadata['canaryLeaked'] as boolean) === false &&
        minimal.message.includes('need_info')
        ? 'pass'
        : 'fail',
      `tokens=${String(minimal.metadata['handoffTokens'])}, canary=${String(minimal.metadata['canaryLeaked'])}`
    );

    if (llmUp) {
      const generated = await callTool(client, 'spawn_subagent', {
        task: REFUND_TASK,
        role: '退款助手',
        strategy: 'llm_generated',
        mode: 'sync',
        parent_trajectory: PARENT_TRAJECTORY,
      });
      push(
        'llm_generated: completes + private',
        generated.success &&
          (generated.metadata['canaryLeaked'] as boolean) === false &&
          !generated.message.includes('need_info')
          ? 'pass'
          : 'fail',
        `tokens=${String(generated.metadata['handoffTokens'])}, result=${generated.message.slice(0, 60)}`
      );
    } else {
      push('llm_generated: completes + private', 'skip', 'Ollama unreachable');
    }

    const approved = await callTool(client, 'request_admin_approval', {
      message: 'eval approval',
      timeout_seconds: 5,
      auto_approve: true,
    });
    push('HITL approve path', approved.metadata['approved'] === true ? 'pass' : 'fail', String(approved.message).slice(0, 60));

    const expired = await callTool(client, 'request_admin_approval', {
      message: 'eval timeout',
      timeout_seconds: 1,
      auto_approve: false,
    });
    push(
      'HITL timeout → conservative default',
      expired.metadata['status'] === 'expired' && expired.metadata['approved'] !== true ? 'pass' : 'fail',
      String(expired.message).slice(0, 80)
    );

    const notify = await callTool(client, 'send_notification', { channel: 'slack', message: 'eval' });
    push('notify preflight blocked (no creds)', notify.metadata['blocked'] === true ? 'pass' : 'fail', String(notify.message).slice(0, 70));

    const timer = await callTool(client, 'set_timer', { name: 'eval', delay_seconds: 1, message: 'eval fired' });
    await sleep(1500);
    const status = await callTool(client, 'get_timer_status', { timer_id: String(timer.metadata['timer_id']) });
    push('timer fires once', String(status.message).includes('fires=1') ? 'pass' : 'fail', String(status.message).slice(0, 60));

    const recurring = await callTool(client, 'set_recurring_timer', {
      name: 'eval-recurring',
      interval_seconds: 5,
      max_occurrences: 5,
      message: 'tick',
    });
    const recurringId = String(recurring.metadata['timer_id']);
    const cancelled = await callTool(client, 'cancel_timer', { timer_id: recurringId });
    await sleep(1000);
    const afterCancel = await callTool(client, 'get_timer_status', { timer_id: recurringId });
    push(
      'recurring cancel stops fires',
      cancelled.success && String(afterCancel.message).includes('fires=0') ? 'pass' : 'fail',
      String(afterCancel.message).slice(0, 60)
    );

    const asyncSpawn = await callTool(client, 'spawn_subagent', {
      task: '查询订单 B67890 状态',
      role: '订单查询助手',
      strategy: 'minimal',
      mode: 'async',
    });
    const asyncId = String(asyncSpawn.metadata['task_id']);
    const cancel = await callTool(client, 'cancel_subagent', { task_id: asyncId });
    const statusAfter = await callTool(client, 'get_subagent_status', { task_id: asyncId });
    push(
      'async spawn + cancel',
      cancel.success && String(statusAfter.message).startsWith('status=cancelled') ? 'pass' : 'fail',
      String(statusAfter.message).slice(0, 60)
    );
  });
  const passed = checks.filter((c) => c.status === 'pass').length;
  console.log(`\n${passed}/${checks.length} checks passed (${checks.filter((c) => c.status === 'skip').length} skipped)`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const argv = raw[0] === '--mode' ? raw.slice(1) : raw;
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'list': {
        const ci = rest.indexOf('--category');
        await cmdList(ci !== -1 ? rest[ci + 1] : rest[0]?.startsWith('--') ? undefined : rest[0]);
        break;
      }
      case 'info':
        if (!rest[0]) console.log('usage: info <tool>');
        else await cmdInfo(rest[0]);
        break;
      case 'run':
        if (!rest[0] || rest[0].startsWith('--')) console.log('usage: run <tool> k=v...');
        else await cmdRun(rest[0], rest.slice(1));
        break;
      case 'demo':
        await cmdDemo();
        break;
      case 'eval':
        await cmdEval();
        break;
      default:
        await cmdDemo();
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
