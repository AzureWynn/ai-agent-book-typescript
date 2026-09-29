import { categories, findTool, TOOLS } from './catalog.js';
import { callTool, listTools, withClient } from './client.js';
import { AGENT_TASK_DEFAULT, runAgent } from './agent.js';

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

async function cmdList(category?: string): Promise<void> {
  const list = category ? TOOLS.filter((t) => t.category === category) : TOOLS;
  if (category && !categories().includes(category)) {
    console.log(`unknown category: ${category} (known: ${categories().join(', ')})`);
    return;
  }
  console.log(`\nPerception tools (${list.length}${category ? ` in ${category}` : ''}):`);
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
  console.log(`\nExample: npx tsx src/main.ts run ${t.name} ${Object.keys(t.inputSchema.properties).slice(0, 2).map((p) => `${p}=...`).join(' ')}`);
}

async function cmdRun(name: string, rest: string[]): Promise<void> {
  const t = findTool(name);
  if (!t) {
    console.log(`unknown tool: ${name}`);
    return;
  }
  const args = parseKV(rest);
  const result = await withClient((client) => callTool(client, name, args));
  console.log(JSON.stringify(result, null, 2));
}

async function cmdDemo(offlineOnly: boolean): Promise<void> {
  console.log('\n=== Experiment 4-1: Perception Flow Demo ===');
  console.log(`Mode: ${offlineOnly ? 'offline (filesystem + local KB only)' : 'full (includes network tools)'}`);
  await withClient(async (client) => {
    const tools = await listTools(client);
    console.log(`\n[discover] ${tools.length} tools via MCP list_tools`);
    const scope = offlineOnly ? tools.filter((t) => !t.description.includes('network')) : tools;
    console.log(`[scope] using ${scope.length} tools`);

    const dir = await callTool(client, 'directory_browser', { directory: '.' });
    console.log(`\n[directory_browser] success=${dir.success}\n${String(dir.message).split('\n').slice(0, 6).join('\n')}`);

    const grep = await callTool(client, 'grep', { pattern: 'ActionResponse', directory: '.', file_pattern: '*.md' });
    console.log(`\n[grep] success=${grep.success}, matches=${String(grep.metadata['matches'] ?? '?')}`);

    const kb = await callTool(client, 'knowledge_base_search', { query: 'MCP tools list arguments', top_k: 3 });
    console.log(`\n[knowledge_base_search] success=${kb.success}\n${String(kb.message).split('\n').slice(0, 3).join('\n')}`);

    if (!offlineOnly) {
      const wx = await callTool(client, 'weather', { location: 'Beijing' });
      console.log(`\n[weather] success=${wx.success}\n${String(wx.message).slice(0, 200)}`);
      const wiki = await callTool(client, 'wikipedia_search', { query: 'Model Context Protocol' });
      console.log(`\n[wikipedia_search] success=${wiki.success}\n${String(wiki.message).slice(0, 300)}`);
    } else {
      console.log('\n[network tools skipped in offline mode]');
    }
  });
  console.log('\nRead: discovery → local evidence → external evidence; failures are reported, never mocked.');
}

async function cmdAgent(offlineOnly: boolean, task: string): Promise<void> {
  console.log('\n=== Experiment 4-1: MCP Agent (Ollama drives MCP tools) ===');
  console.log(`Task: ${task}`);
  const trace = await runAgent(task, offlineOnly);
  trace.steps.forEach((s, i) => {
    console.log(`\n[step ${i + 1}] ${s.thought.slice(0, 120)}`);
    for (const c of s.calls) console.log(`  ${c.tool}(${JSON.stringify(c.args).slice(0, 80)}) ok=${c.ok} → ${c.preview.slice(0, 120)}`);
  });
  console.log(`\nAnswer:\n${trace.answer}`);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const argv = raw[0] === '--mode' ? raw.slice(1) : raw;
  const [cmd, ...rest] = argv;
  const offlineOnly = rest.includes('--offline');
  const filtered = rest.filter((r) => r !== '--offline');
  try {
    switch (cmd) {
      case 'list': {
        const ci = filtered.indexOf('--category');
        await cmdList(ci !== -1 ? filtered[ci + 1] : filtered[0]);
        break;
      }
      case 'info':
        if (!filtered[0]) console.log('usage: list | info <tool> | run <tool> k=v... | demo [--offline] | agent [--offline] [--task ...]');
        else await cmdInfo(filtered[0]);
        break;
      case 'run':
        if (!filtered[0]) console.log('usage: run <tool> k=v...');
        else await cmdRun(filtered[0], filtered.slice(1));
        break;
      case 'demo':
        await cmdDemo(offlineOnly);
        break;
      case 'agent': {
        const ti = filtered.indexOf('--task');
        const task = ti !== -1 ? (filtered[ti + 1] ?? AGENT_TASK_DEFAULT) : AGENT_TASK_DEFAULT;
        await cmdAgent(offlineOnly, task);
        break;
      }
      default:
        await cmdDemo(offlineOnly);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
