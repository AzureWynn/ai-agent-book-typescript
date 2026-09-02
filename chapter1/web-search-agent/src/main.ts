// src/main.ts
import { WebSearchAgent } from './agent.js';
import { createWebSearchTool } from './tools.js';
import { EXAMPLE_QUESTIONS } from './examples.js';

// 加载 .env 环境变量（Node 22 原生支持）
try {
  process.loadEnvFile('.env');
} catch (e) {
  // .env 不存在时忽略
}

function buildAgent(verbose: boolean = true): WebSearchAgent {
  const searxngBaseUrl = process.env.SEARXNG_BASE_URL ?? 'http://localhost:8080';
  const maxIterations = Number(process.env.MAX_SEARCH_ITERATIONS ?? 5);
  const timeoutMs = Number(process.env.SEARCH_TIMEOUT_MS ?? 30000);

  return new WebSearchAgent({
    verbose,
    maxIterations,
    tools: [createWebSearchTool({ searxngBaseUrl, timeoutMs })],
  });
}

async function runTask(question: string, verbose: boolean = true): Promise<void> {
  console.log('\nAgent 正在搜索并思考...\n');
  const agent = buildAgent(verbose);
  const result = await agent.searchAndAnswer(question);
  console.log('\n' + '='.repeat(50));
  console.log('最终答案:');
  console.log(result.answer);
  console.log('\n--- 迭代: ' + result.iterations + ', 工具调用: ' + result.toolCalls + ' ---');
}

async function interactiveMode(): Promise<void> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let agent = buildAgent();

  console.log('='.repeat(50));
  console.log('交互模式 - 联网搜索 Agent（Ollama + SearXNG）');
  console.log('='.repeat(50));
  console.log('命令:');
  console.log('  examples      - 查看内置示例问题');
  console.log('  example <n>   - 运行第 n 个示例');
  console.log('  verbose off   - 关闭轨迹输出');
  console.log('  verbose on    - 打开轨迹输出');
  console.log('  quit / exit   - 退出');
  console.log('或者直接输入问题。\n');

  const toggleVerbose = (on: boolean) => {
    console.log(on ? '轨迹输出已打开。' : '轨迹输出已关闭。');
    agent = buildAgent(on);
  };
  rl.on('line', async (raw) => {
    const input = raw.trim();
    const lower = input.toLowerCase();

    if (lower === 'quit' || lower === 'exit') {
      console.log('再见！');
      rl.close();
      return;
    }
    if (lower === 'examples') {
      console.log('\n📋 内置示例问题:');
      EXAMPLE_QUESTIONS.forEach((q, i) => {
        console.log(`\n${i + 1}. ${q.name} - ${q.description}`);
        console.log(`   问题: ${q.question}`);
      });
      return;
    }
    if (lower === 'verbose off') {
      toggleVerbose(false);
      return;
    }
    if (lower === 'verbose on') {
      toggleVerbose(true);
      return;
    }
    if (lower === 'example' || lower.startsWith('example ')) {
      const n = parseInt(lower.slice(7).trim(), 10);
      const q = Number.isInteger(n) ? EXAMPLE_QUESTIONS[n - 1] : undefined;
      if (!q) {
        console.log(`❌ 无效编号。用 'example 1' 到 'example ${EXAMPLE_QUESTIONS.length}'`);
        return;
      }
      console.log(`\n📌 运行示例: ${q.name}`);
      const result = await agent.searchAndAnswer(q.question);
      printResult(result.answer, result.iterations, result.toolCalls);
      return;
    }
    if (!input) return;

    console.log('\nAgent 正在搜索并思考...\n');
    const result = await agent.searchAndAnswer(input);
    printResult(result.answer, result.iterations, result.toolCalls);
  });

  rl.on('SIGINT', () => {
    console.log('\n输入 quit / exit 退出。');
    rl.prompt();
  });
  rl.prompt();
}

function printResult(answer: string, iterations: number, toolCalls: number): void {
  console.log('\n' + '='.repeat(50));
  console.log('最终答案:');
  console.log(answer);
  console.log('\n--- 迭代: ' + iterations + ', 工具调用: ' + toolCalls + ' ---\n');
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'interactive';

  if (mode === 'interactive') {
    await interactiveMode();
  } else if (mode === 'single') {
    const question = process.argv.slice(3).join(' ') || (EXAMPLE_QUESTIONS[0]?.question ?? '');
    await runTask(question);
  } else if (mode === 'example') {
    const n = Number(process.argv[3] ?? 1);
    const q = EXAMPLE_QUESTIONS[n - 1];
    if (!q) {
      console.error('无效示例编号');
      process.exit(1);
    }
    await runTask(q.question);
  } else {
    console.log('用法: npx tsx src/main.ts [模式]');
    console.log('  interactive  - 交互模式（默认）');
    console.log('  single       - 运行单个问题: npx tsx src/main.ts single "你的问题"');
    console.log('  example <n>  - 运行内置示例: npx tsx src/main.ts example 1');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});