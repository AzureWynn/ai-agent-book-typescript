// src/main.ts
import { HostedToolsAgent } from './agent.js';
import type { AgentRunResult } from './agent.js';
import { toolItems, allCitations } from './protocol.js';

// 加载 .env 环境变量
try {
  process.loadEnvFile('.env');
} catch (e) {
  // .env 不存在时忽略
}

/** 打印"响应对象"的关键信息：类型化 tool 记录 + 引用 + 最终答案 */
function report(label: string, result: AgentRunResult): void {
  console.log('\n' + '='.repeat(56));
  console.log(`📋 ${label}`);
  console.log('='.repeat(56));

  const items = toolItems(result.response);
  console.log(`\n类型化工具记录（${items.length} 条）:`);
  for (const item of items) {
    if (item.type === 'web_search_call') {
      console.log(`  🌐 web_search_call  [${item.status}]  query="${item.query}"`);
      for (const c of item.citations ?? []) {
        console.log(`      └ 引用[${c.index}] ${c.url}`);
      }
    } else if (item.type === 'code_interpreter_call') {
      console.log(`  🧮 code_interpreter_call  [${item.status}]`);
      const codeLine = (item.code ?? '').split('\n').filter(Boolean)[0];
      console.log(`      code: ${codeLine ?? '(空)'}`);
      console.log(`      output: ${(item.output ?? '').slice(0, 80)}`);
    }
  }

  const citations = allCitations(result.response);
  console.log(`\n引用总数: ${citations.length}`);
  console.log(`迭代: ${result.iterations}, 托管工具调用: ${result.toolCalls}`);

  console.log('\n最终答案:');
  console.log(result.answer.slice(0, 600));
}

async function scenarioAsean(): Promise<void> {
  console.log('场景：东盟 10 国首都之间最近的一对？');
  console.log('（需要 web_search 搜首都坐标 + code_interpreter 枚举距离）\n');
  const agent = new HostedToolsAgent({ verbose: true, maxIterations: 8 });
  const result = await agent.run(
    '东盟 10 国（文莱、柬埔寨、印度尼西亚、老挝、马来西亚、缅甸、菲律宾、新加坡、泰国、越南）' +
    '的首都之间，最近的一对是哪两个？请用 web_search 搜索各首都，再用 code_interpreter 计算所有首都两两之间的球面距离。'
  );
  report('东盟首都最近距离', result);
}

async function scenarioBitcoin(): Promise<void> {
  console.log('场景：比特币技术分析');
  console.log('（先澄清数据源与指标，再用搜索 + 代码计算）\n');
  const agent = new HostedToolsAgent({ verbose: true, clarifyFirst: true, maxIterations: 6 });
  const result = await agent.run(
    '请对比特币做一次技术分析。'
  );
  report('比特币技术分析', result);
}

async function protocolDemo(): Promise<void> {
  console.log('协议演示：手动驱动"托管工具闭环"，展示 Responses 风格的类型化记录。');
  console.log('（不依赖模型编排，重点看协议本身：声明工具 → 托管执行 → 类型化记录 + 引用）\n');

  // 1. 声明托管工具（等价于 Requests API 的 tools 字段）
  console.log('【1】请求声明的托管工具（等价 Responses 的 tools）:');
  console.log('  { type: web_search }');
  console.log('  { type: code_interpreter }');

  // 2. web_search 托管执行
  console.log('\n【2】模型调用 web_search → 托管层执行 → 返回带引用的结果:');
  const { runWebSearch, formatSearchResults } = await import('./hosted-tools.js');
  const results = await runWebSearch('东盟十国首都 经纬度', process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080');
  const { text, citations } = formatSearchResults(results);
  console.log('  → 生成 web_search_call 记录:');
  console.log(`     type=web_search_call  status=completed  citations=${citations.length} 条`);
  console.log('  引用:');
  for (const c of citations) console.log(`    [${c.index}] ${c.url}`);
  console.log('  结果文本(前 120 字): ' + text.slice(0, 120).replace(/\n/g, ' '));

  // 3. code_interpreter 托管执行
  console.log('\n【3】模型调用 code_interpreter → 托管层执行沙箱代码:');
  const { runCodeInterpreter } = await import('./hosted-tools.js');
  const calcCode = `
const coords = { '吉隆坡': [3.14, 101.69], '新加坡': [1.35, 103.82], '曼谷': [13.76, 100.5] };
const R = 6371; const rad = (d) => d * Math.PI / 180;
let best = null; const names = Object.keys(coords);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const [a, b] = [coords[names[i]], coords[names[j]]];
  const dLat = rad(b[0]-a[0]), dLon = rad(b[1]-a[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;
  const dist = 2 * R * Math.asin(Math.sqrt(h));
  if (!best || dist < best.d) best = { pair: [names[i], names[j]], d: dist };
}
return JSON.stringify(best);`;
  const calcOut = await runCodeInterpreter(calcCode);
  console.log('  → 生成 code_interpreter_call 记录:');
  console.log('     type=code_interpreter_call  status=completed');
  console.log('  计算输出: ' + calcOut);

  // 4. 最终 message（综合）
  console.log('\n【4】模型综合产出最终 message + 引用:');
  console.log('  东盟首都中最近的一对是：吉隆坡(Kuala Lumpur) — 新加坡(Singapore)。');
  console.log('  （计算依据 code_interpreter_call，坐标来源见上方 web_search 引用）\n');

  console.log('='.repeat(56));
  console.log('协议要点：与 function-calling 的区别');
  console.log('='.repeat(56));
  console.log('  0.function-calling: 模型返回 tool_calls「请求」→ 你的代码执行');
  console.log('  Responses 托管工具:  模型产出「已完成」的 web_search_call /');
  console.log('                       code_interpreter_call 记录 + 引用');
  console.log('  Agent 只看到结果记录，看不到执行过程（执行在托管层/服务端）');
}

async function interactiveMode(): Promise<void> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const agent = new HostedToolsAgent({ verbose: true });

  console.log('='.repeat(50));
  console.log('交互模式 - 托管工具 Agent（web_search + code_interpreter）');
  console.log('='.repeat(50));
  console.log('输入 "scenario" 查看场景，输入 "quit" 退出，或直接提问。\n');

  rl.on('line', async (raw) => {
    const input = raw.trim();
    const lower = input.toLowerCase();
    if (lower === 'quit' || lower === 'exit') { rl.close(); return; }
    if (lower === 'scenario') {
      console.log('  scenario asean    - 东盟首都最近距离');
      console.log('  scenario bitcoin  - 比特币技术分析（澄清优先）');
      console.log('  protocol-demo     - 协议演示（推荐先看）');
      return;
    }
    if (lower === 'protocol-demo') { await protocolDemo(); return; }
    if (lower === 'scenario asean') { await scenarioAsean(); return; }
    if (lower === 'scenario bitcoin') { await scenarioBitcoin(); return; }
    if (!input) return;

    const result = await agent.run(input);
    report('结果', result);
  });
  rl.prompt();
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'interactive';

  if (mode === 'interactive') await interactiveMode();
  else if (mode === 'scenario') {
    const name = process.argv[3] || 'asean';
    if (name === 'asean') await scenarioAsean();
    else if (name === 'bitcoin') await scenarioBitcoin();
    else console.error('未知场景');
  } else if (mode === 'protocol-demo') {
    await protocolDemo();
  } else if (mode === 'single') {
    const question = process.argv.slice(3).join(' ') || '用搜索加计算回答：15*23 是多少？';
    const agent = new HostedToolsAgent({ verbose: true });
    const result = await agent.run(question);
    report('结果', result);
  } else {
    console.log('用法:');
    console.log('  interactive              - 交互模式');
    console.log('  protocol-demo            - 协议演示（手动驱动托管工具闭环，推荐先看）');
    console.log('  scenario asean           - 东盟首都最近距离（模型驱动）');
    console.log('  scenario bitcoin         - 比特币技术分析（澄清优先）');
    console.log('  single "问题"            - 单次提问');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });