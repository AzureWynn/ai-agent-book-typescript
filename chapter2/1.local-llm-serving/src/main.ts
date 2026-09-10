/**
 * CLI 入口（对应官方 main.py）。
 *
 * 用法：
 *   npm run interactive              - 交互模式（默认）
 *   npm run single -- "一句话任务"   - 单任务模式
 *   npm run demo                     - 跑第一个样例任务（快速验证）
 *   npm run info                     - 环境信息
 *
 * 交互模式内建命令：/reset /tools /samples /sample <n> /stream /help /exit
 */

import { OllamaNativeAgent } from './agent.js';
import { getSampleTasks } from './samples.js';

try {
  process.loadEnvFile('.env');
} catch {
  /* 无 .env 时用默认值 */
}

const GRAY = '\u001b[90m';
const RESET = '\u001b[0m';

interface CliArgs {
  mode: 'single' | 'interactive';
  task: string | undefined;
  info: boolean;
  stream: boolean;
  demo: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'interactive', task: undefined, info: false, stream: true, demo: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case '--mode':
        args.mode = argv[++i] === 'single' ? 'single' : 'interactive';
        break;
      case '--task':
        args.task = argv[++i];
        break;
      case '--info':
        args.info = true;
        break;
      case '--no-stream':
        args.stream = false;
        break;
      case '--demo':
        args.demo = true;
        break;
      case '--backend':
        // 本移植仅支持 ollama 后端（vLLM 需 Linux/GPU，见官方）
        ++i;
        break;
      default:
        if (!a.startsWith('--')) {
          args.task = a; // 直接传任务文本
          args.mode = 'single';
        }
    }
  }
  return args;
}

function showInfo(): void {
  const model = process.env.MODEL_NAME ?? 'gemma4:latest';
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  console.log('📊 System Information:');
  console.log(`  Platform: ${process.platform} ${process.arch}`);
  console.log(`  Node: ${process.version}`);
  console.log(`  Backend: ollama (${baseUrl})`);
  console.log(`  Model: ${model}`);
}

function printTools(): void {
  const registry = new OllamaNativeAgent().toolRegistry;
  console.log('\n📦 Available Tools:');
  for (const schema of registry.getToolSchemas()) {
    const fn = schema['function'] as { name: string; description: string };
    console.log(`  • ${fn.name}: ${fn.description}`);
  }
}

/** 把流式 chunk 渲染成终端输出（对齐官方 run_single_task 的展示）。 */
async function runStreaming(agent: OllamaNativeAgent, task: string): Promise<string> {
  let thinkingShown = false;
  let toolsShown = false;
  let responseStarted = false;
  let lastType = '';
  const chunks: string[] = [];

  for await (const chunk of agent.chatStream(task)) {
    switch (chunk.type) {
      case 'thinking':
        if (!thinkingShown) {
          process.stdout.write('🧠 Thinking: ');
          thinkingShown = true;
        }
        process.stdout.write(`${GRAY}${chunk.content}${RESET}`);
        break;
      case 'tool_call':
        if (!toolsShown) {
          console.log('\n🔧 Tool Calls:');
          toolsShown = true;
        }
        console.log(`  → ${chunk.content.name}: ${JSON.stringify(chunk.content.arguments)}`);
        responseStarted = false;
        break;
      case 'tool_result': {
        const text = chunk.content.length > 200 ? chunk.content.slice(0, 200) + '…' : chunk.content;
        console.log(`    ✓ ${text}`);
        responseStarted = false;
        break;
      }
      case 'content':
        if (!responseStarted) {
          if (lastType === 'tool_call' || lastType === 'tool_result') {
            process.stdout.write('\n🤖 Assistant: ');
          } else {
            process.stdout.write('\n🤖 Assistant: ');
          }
          responseStarted = true;
        }
        process.stdout.write(chunk.content);
        chunks.push(chunk.content);
        break;
      case 'error':
        console.log(`\n❌ Error: ${chunk.content}`);
        break;
    }
    lastType = chunk.type;
  }
  console.log('\n' + '-'.repeat(40));
  return chunks.join('');
}

async function runSingleTask(agent: OllamaNativeAgent, task: string, stream: boolean): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('TASK EXECUTION');
  console.log('='.repeat(60));
  console.log(`\n📋 Task: ${task}`);
  console.log('-'.repeat(60));

  try {
    if (stream) {
      console.log('\n⏳ Processing (streaming)...\n');
      await runStreaming(agent, task);
    } else {
      console.log('\n⏳ Processing...');
      const response = await agent.chat(task, { stream: false });
      console.log('\n✅ Response:');
      console.log('-'.repeat(40));
      console.log(response);
      console.log('-'.repeat(40));
    }
  } catch (e) {
    console.log(`\n❌ Error: ${e instanceof Error ? e.message : e}`);
  }
}

async function interactiveMode(agent: OllamaNativeAgent, stream: boolean): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('💬 INTERACTIVE MODE' + (stream ? ' (STREAMING)' : ''));
  console.log('='.repeat(60));
  console.log('\nYou can now chat with the AI agent. It has access to various tools:');
  printTools();
  console.log('\n💡 Commands:');
  console.log('  /reset      - Reset conversation');
  console.log('  /tools      - Show available tools');
  console.log('  /samples    - Show sample tasks');
  console.log('  /sample <n> - Run sample task number n');
  console.log('  /stream     - Toggle streaming mode');
  console.log('  /help       - Show this help');
  console.log('  /exit       - Exit the program');
  console.log('-'.repeat(60));

  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let streaming = stream;

  const question = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  let exited = false;
  const ask = async (): Promise<void> => {
    const raw = await question('\n👤 You: ');
    const input = raw.trim();
    if (input) await handle(input);
    if (!exited) await ask();
  };

  const handle = async (input: string): Promise<void> => {
    const lower = input.toLowerCase();
    if (lower === '/exit' || lower === 'quit') {
      console.log('👋 Goodbye!');
      exited = true;
      rl.close();
      return;
    }
    if (lower === '/reset') {
      agent.resetConversation();
      console.log('✅ Conversation reset');
      return;
    }
    if (lower === '/tools') {
      printTools();
      return;
    }
    if (lower === '/samples') {
      console.log('\n📋 Sample Tasks:');
      getSampleTasks().forEach((s, i) => {
        const preview = s.task.replace(/\n/g, ' ').slice(0, 100);
        console.log(`  ${i + 1}. ${s.name}`);
        console.log(`     ${preview}${s.task.length > 100 ? '...' : ''}`);
      });
      console.log('\n💡 Tip: Use /sample <n> to run a specific sample (e.g., /sample 1)');
      return;
    }
    if (lower.startsWith('/sample ')) {
      const n = Number(input.split(' ')[1]);
      const task = getSampleTasks()[n - 1];
      if (!task) {
        console.log(`❌ Invalid sample number. Please choose between 1 and ${getSampleTasks().length}`);
        return;
      }
      console.log(`\n🎯 Running Sample: ${task.name}`);
      console.log('-'.repeat(60));
      console.log(`Task: ${task.task}`);
      console.log('-'.repeat(60));
      if (streaming) await runStreaming(agent, task.task);
      else {
        const resp = await agent.chat(task.task, { stream: false });
        console.log(`🤖 Assistant: ${resp}`);
      }
      return;
    }
    if (lower === '/stream') {
      streaming = !streaming;
      console.log(`✅ Streaming ${streaming ? 'enabled' : 'disabled'}`);
      return;
    }
    if (lower === '/help') {
      console.log('\n💡 Commands:');
      console.log('  /reset      - Reset conversation');
      console.log('  /tools      - Show available tools');
      console.log('  /samples    - Show sample tasks');
      console.log('  /sample <n> - Run sample task number n');
      console.log('  /stream     - Toggle streaming mode');
      console.log('  /help       - Show this help');
      console.log('  /exit       - Exit the program');
      return;
    }
    // 普通用户输入
    if (streaming) {
      console.log('\n⏳ Processing (streaming)...\n');
      await runStreaming(agent, input);
    } else {
      console.log('\n⏳ Processing...');
      const resp = await agent.chat(input, { stream: false });
      console.log(`🤖 Assistant: ${resp}`);
    }
  };

  await ask();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('='.repeat(60));
  console.log('🚀 Local LLM Tool Calling Agent');
  console.log('='.repeat(60));

  if (args.info) {
    showInfo();
    printTools();
    return;
  }

  console.log('\n⚙️  Initializing agent...');
  const agent = new OllamaNativeAgent();
  // 预检：Ollama 是否在运行、模型是否可用
  const resp = await fetch(`${agent.baseUrl}/api/tags`).catch(() => null);
  if (!resp || !resp.ok) {
    console.log(`❌ Ollama 未在 ${agent.baseUrl} 运行。请先启动: ollama serve`);
    process.exit(1);
  }
  const tags = (await resp.json()) as { models?: Array<{ name?: string; model?: string }> };
  const names = (tags.models ?? []).map((m) => m.name ?? m.model ?? '');
  if (!names.some((n) => n.includes(agent.model.split(':')[0] ?? agent.model))) {
    console.log(`⚠️  模型 ${agent.model} 未安装。安装: ollama pull ${agent.model}`);
  }
  console.log(`✅ Agent ready! backend=ollama model=${agent.model}\n`);

  if (args.mode === 'single') {
    const task = args.task ?? (args.demo ? getSampleTasks()[0]!.task : undefined);
    if (!task) {
      console.log('SINGLE TASK MODE - 未提供任务，可用样例：');
      getSampleTasks().forEach((s, i) => console.log(`  ${i + 1}. ${s.name} — ${s.description}`));
      console.log('\n用法: npm run single -- "你的任务"  或  npm run demo');
      return;
    }
    await runSingleTask(agent, task, args.stream);
  } else {
    await interactiveMode(agent, args.stream);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});