// src/main.ts
import { FunctionCallingAgent } from './agent.js';

// 加载 .env 环境变量（Node 22 原生支持）
try {
  process.loadEnvFile('.env');
} catch (e) {
  // .env 不存在时忽略
}

async function interactiveMode(): Promise<void> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const agent = new FunctionCallingAgent({ verbose: true });

  console.log('='.repeat(50));
  console.log('交互模式 - 纯手写 Function Calling Agent');
  console.log('='.repeat(50));
  console.log('输入 "help" 查看命令，输入 "quit" 退出，或直接提问。\n');

  rl.on('line', async (raw) => {
    const input = raw.trim();
    const lower = input.toLowerCase();

    if (lower === 'quit' || lower === 'exit') {
      console.log('再见！');
      rl.close();
      return;
    }
    if (lower === 'help') {
      console.log('试试这些问题:');
      console.log('  "15*23 等于多少"         → 触发 calculator');
      console.log('  "现在几点了"             → 触发 get_current_time');
      console.log('  "你好"                  → 无需工具，直接回答');
      return;
    }
    if (!input) return;

    const result = await agent.run(input);
    console.log('\n' + '='.repeat(50));
    console.log('最终答案:');
    console.log(result.answer);
    console.log('\n--- 迭代: ' + result.iterations + ', 工具调用: ' + result.toolCalls + ' ---\n');
  });

  rl.prompt();
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'interactive';

  if (mode === 'interactive') {
    await interactiveMode();
  } else if (mode === 'single') {
    const question = process.argv.slice(3).join(' ') || '15*23 等于多少？';
    const agent = new FunctionCallingAgent({ verbose: true });
    const result = await agent.run(question);
    console.log('\n最终答案:');
    console.log(result.answer);
    console.log('\n--- 迭代: ' + result.iterations + ', 工具调用: ' + result.toolCalls + ' ---');
  } else {
    console.log('用法: npm run interactive | npx tsx src/main.ts single "问题"');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});