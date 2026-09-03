/**
 * 带注释的逐行演示 —— 一步一步看懂"托管工具"协议。
 *
 * 运行: npm run walkthrough
 *
 * 它不像 scenario 那样让模型自由发挥，而是像老师讲课一样，
 * 每一步：打印【这步在做什么】→ 执行 → 打印【结果长什么样】。
 * 重点看：托管工具和 function-calling 到底差在哪。
 */

import { runWebSearch, runCodeInterpreter, formatSearchResults } from './hosted-tools.js';
import type { ResponsesResponse } from './protocol.js';

// 加载 .env
try {
  process.loadEnvFile('.env');
} catch (e) { /* ignore */ }

const searxng = process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080';

// 一个小工具函数：打印带分隔线的小节标题
function step(n: number, title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`【${n}】${title}`);
  console.log('─'.repeat(60));
}

async function main(): Promise<void> {
  console.log('带注释的逐行演示：Responses 托管工具协议\n');

  // ────────────────────────────── 第 1 步 ──────────────────────────────
  step(1, '请求：声明"托管工具"（和 function-calling 一样，在请求里带 tools）');
  console.log('解释：这里只声明工具"类型"，没有执行逻辑。执行交给托管层。');
  console.log('代码：');
  console.log('  const body = { model, messages, tools: [');
  console.log('    { type: "function", function: { name: "web_search", ... } },');
  console.log('    { type: "function", function: { name: "code_interpreter", ... } },');
  console.log('  ] };');
  console.log('注意：Ollama 协议仍是 function-calling 结构；我们仿真"托管"语义。');

  // ────────────────────────────── 第 2 步 ──────────────────────────────
  step(2, '模型"心想"要用 web_search → 托管层执行（而不是你的代码执行）');
  console.log('对比 function-calling：那里是"你的代码调 calculator"，这里工具在托管层。');
  console.log('执行：runWebSearch("东盟十国首都 经纬度", searxng)\n');

  const results = await runWebSearch('东盟十国首都 经纬度', searxng);
  const { text, citations } = formatSearchResults(results);

  console.log('→ 结果是一组结构化条目（每条约 title/url/content）:');
  for (const r of results.slice(0, 3)) {
    console.log(`    • ${r.title}`);
    console.log(`      ${r.url}`);
  }

  // ────────────────────────────── 第 3 步 ──────────────────────────────
  step(3, '托管层把结果封装成"类型化记录" web_search_call（含引用）');
  console.log('关键：这不是"请求"，是"已完成"的记录（status=completed）。');
  console.log('引用(citations)是 web_search_call 特有的——程序能精确拿到来源链接。\n');

  const webItem = {
    type: 'web_search_call' as const,
    status: 'completed' as const,
    query: '东盟十国首都 经纬度',
    citations,
  };
  console.log('→ 生成的 web_search_call 记录:');
  console.log(`    type=${webItem.type}  status=${webItem.status}  citations=${citations.length} 条`);
  console.log('  引用（前 3 条）:');
  for (const c of citations.slice(0, 3)) console.log(`    [${c.index}] ${c.url}`);
  console.log('  结果文本（给模型的下一轮，前 80 字）:');
  console.log('    ' + text.replace(/\n/g, ' ').slice(0, 80) + '...');

  // ────────────────────────────── 第 4 步 ──────────────────────────────
  step(4, '模型"心想"要用 code_interpreter → 托管层执行沙箱代码');
  console.log('同样的逻辑：模型只声明"我要算"，执行在托管层（node:vm 沙箱）。\n');

  const code = [
    "const coords = { '吉隆坡': [3.14, 101.69], '新加坡': [1.35, 103.82], '曼谷': [13.76, 100.5] };",
    "const R = 6371; const rad = (d) => d * Math.PI / 180;",
    'let best = null; const names = Object.keys(coords);',
    'for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {',
    '  const [a, b] = [coords[names[i]], coords[names[j]]];',
    '  const dLat = rad(b[0]-a[0]), dLon = rad(b[1]-a[1]);',
    '  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;',
    '  const dist = 2 * R * Math.asin(Math.sqrt(h));',
    '  if (!best || dist < best.d) best = { pair: [names[i], names[j]], d: dist };',
    '}',
    'return JSON.stringify(best);',
  ].join('\n');
  console.log('执行代码（前 4 行）:');
  console.log('  ' + code.split('\n').slice(0, 4).join('\n  '));

  const output = await runCodeInterpreter(code);
  console.log('\n→ 计算结果: ' + output);

  // ────────────────────────────── 第 5 步 ──────────────────────────────
  step(5, '托管层把结果封装成 code_interpreter_call 记录');
  console.log('同样 type=code_interpreter_call、status=completed，携带 code 与 output。');

  const calcItem = {
    type: 'code_interpreter_call' as const,
    status: 'completed' as const,
    code,
    output,
  };
  console.log(`    type=${calcItem.type}  status=${calcItem.status}`);
  console.log(`    output=${calcItem.output.slice(0, 60)}`);

  // ────────────────────────────── 第 6 步 ──────────────────────────────
  step(6, '组装"完整响应对象"（Responses 风格）并提取最终答案');
  console.log('所有类型化记录 + 最终 message 拼成一个 response.output 列表。');
  console.log('程序可精确遍历它：有多少条 web_search_call、多少条 code_interpreter_call、引用几何。\n');

  const response: ResponsesResponse = {
    id: 'resp_demo',
    model: 'gemma4:latest',
    output: [
      webItem,
      calcItem,
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '东盟首都中最近的一对是吉隆坡与新加坡。' }],
      },
    ],
  };

  const toolCounts = response.output.reduce(
    (acc, i) => {
      if (i.type === 'web_search_call') acc.web++;
      if (i.type === 'code_interpreter_call') acc.code++;
      return acc;
    },
    { web: 0, code: 0 }
  );
  console.log(`→ response.output 共 ${response.output.length} 条 item:`);
  console.log(`    web_search_call × ${toolCounts.web}`);
  console.log(`    code_interpreter_call × ${toolCounts.code}`);
  console.log(`    message × 1（最终答案）`);

  // ────────────────────────────── 第 7 步 ──────────────────────────────
  step(7, '回顾：和 function-calling 的本质差异');
  console.log('  function-calling:  model 返回 tool_calls「请求」→ 你的代码执行');
  console.log('  托管工具:          model 产出「已完成」记录 → 托管层执行，Agent 看不到过程');
  console.log('');
  console.log('  相同点：模型都要"决定"用不用工具、用哪个。');
  console.log('  不同点：执行方不同。托管后，工具变成"平台能力"，模型只负责编排。');
  console.log('');
  console.log('  这也是为什么官方验收必须看 web_search_call / code_interpreter_call 记录：');
  console.log('  —— 只有类型化记录能证明"模型真的用了工具"，而不是嘴上说说。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});