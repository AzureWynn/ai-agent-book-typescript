// src/main.ts
import {
  runAblationStudy, runSingleExperiment,
  ABLATION_CONFIGS, EXPERIMENT_TASK,
} from './ablation.js';
import { ContextMode } from './types.js';
import { FinancialAgent } from './agent.js';
import { getSampleTasks } from './samples.js';
import { createSamplePdfs, samplePdfsReady } from './pdfs.js';

// 加载 .env 环境变量（Node 22 原生支持）
try {
  process.loadEnvFile('.env');
} catch (e) {
  // .env 不存在时忽略
}

// 上下文模式 → 配置 的映射（用于交互模式切换）
const MODE_MAP: Record<string, ContextMode> = {
  full: ContextMode.FULL,
  no_history: ContextMode.NO_HISTORY,
  no_reasoning: ContextMode.NO_REASONING,
  no_tool_calls: ContextMode.NO_TOOL_CALLS,
  no_tool_results: ContextMode.NO_TOOL_RESULTS,
};

async function interactiveMode() {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const printHelp = () => {
    console.log('\n📚 可用命令:');
    console.log('  samples          - 查看所有内置示例任务');
    console.log('  sample <n>       - 运行第 n 个示例任务（sample 2 = PDF 分析）');
    console.log('  create_pdfs      - 下载样例 PDF 到 fixtures/pdfs/');
    console.log('  modes            - 查看可用上下文模式');
    console.log('  mode <name>      - 切换上下文模式');
    console.log('  reset            - 重置 Agent 会话');
    console.log('  status           - 查看当前配置');
    console.log('  help             - 显示帮助');
    console.log('  quit / exit      - 退出');
    console.log('\n或者直接输入任意任务/问题。');
  };

  const printSamples = () => {
    console.log('\n📋 内置示例任务:');
    getSampleTasks().forEach((s, i) => {
      console.log(`\n${i + 1}. ${s.name}`);
      console.log(`   ${s.description}`);
    });
  };

  // 启动时确保样例 PDF 存在（对应参考实现的 ensure_sample_pdfs）
  if (!samplePdfsReady()) {
    console.log('未找到样例 PDF，正在下载...');
    try {
      const created = await createSamplePdfs();
      console.log('样例 PDF 已就绪: ' + created.join(', '));
    } catch (e) {
      console.warn('⚠️ 样例 PDF 下载失败（sample 2 的 PDF 任务不可用）: ' +
        (e instanceof Error ? e.message : '未知错误'));
    }
  }

  // 当前上下文模式与 Agent（切换模式时重建）
  let currentMode = ContextMode.FULL;
  let agent = new FinancialAgent(ABLATION_CONFIGS[currentMode]);
  let totalToolCalls = 0;

  console.log('='.repeat(60));
  console.log('交互模式 - 上下文感知 Agent');
  console.log('='.repeat(60));
  printHelp();

  rl.on('line', async (raw) => {
    const input = raw.trim();
    const lower = input.toLowerCase();

    if (lower === 'quit' || lower === 'exit') {
      console.log('再见！');
      rl.close();
      return;
    }
    if (lower === 'help') {
      printHelp();
      return;
    }
    if (lower === 'samples') {
      printSamples();
      return;
    }
    if (lower === 'create_pdfs') {
      console.log('\n📄 正在下载样例 PDF...');
      try {
        const created = await createSamplePdfs();
        console.log('✅ 样例 PDF 已就绪: ' + created.join(', '));
      } catch (e) {
        console.log('⚠️ 下载失败: ' + (e instanceof Error ? e.message : '未知错误'));
      }
      return;
    }
    if (lower === 'modes') {
      console.log('\n🔧 可用上下文模式: ' + Object.keys(MODE_MAP).join(', '));
      return;
    }
    if (lower.startsWith('mode ')) {
      const name = lower.slice(5).trim();
      const mode = MODE_MAP[name];
      if (!mode) {
        console.log('❌ 未知模式。可用: ' + Object.keys(MODE_MAP).join(', '));
        return;
      }
      currentMode = mode;
      agent = new FinancialAgent(ABLATION_CONFIGS[currentMode]);
      console.log(`✅ 已切换上下文模式: ${currentMode}`);
      if (currentMode !== ContextMode.FULL) {
        console.log('⚠️ 该模式会故意禁用部分能力用于测试');
      }
      return;
    }
    if (lower === 'reset') {
      agent.reset();
      totalToolCalls = 0;
      console.log('✅ Agent 会话已重置。');
      return;
    }
    if (lower === 'status') {
      console.log('\n📊 当前配置:');
      console.log('  Model: ' + (process.env.MODEL_NAME || 'gemma4:latest'));
      console.log('  OLLAMA_BASE_URL: ' + (process.env.OLLAMA_BASE_URL || 'http://localhost:11434'));
      console.log('  Context Mode: ' + currentMode);
      console.log('  Conversation History: ' + (agent.messageCount) + ' messages');
      console.log('  Tool Calls (本次会话): ' + totalToolCalls);
      console.log('  样例 PDF: ' + (samplePdfsReady() ? '已就绪' : '缺失'));
      return;
    }
    if (lower === 'sample' || lower.startsWith('sample ')) {
      const n = parseInt(lower.slice(6).trim(), 10);
      const samples = getSampleTasks();
      const sample = Number.isInteger(n) ? samples[n - 1] : undefined;
      if (!sample) {
        console.log(`❌ 无效编号。用 'sample 1' 到 'sample ${samples.length}'`);
        return;
      }
      console.log(`\n📌 运行: ${sample.name}`);
      console.log('任务: ' + sample.task + '\n');
      const result = await agent.run(sample.task);
      totalToolCalls += result.toolCalls;
      console.log(`\n${'='.repeat(40)}`);
      console.log('终止回复完成: ' + (result.finalAnswer !== null));
      console.log('迭代: ' + result.iterations);
      console.log('工具调用: ' + result.toolCalls);
      if (result.finalAnswer) {
        console.log('\n答案:');
        console.log(result.finalAnswer);
      }
      if (result.answer && !result.finalAnswer) {
        console.log('\n（未产生最终答案）' + result.answer);
      }
      return;
    }
    if (!input) {
      return;
    }

    // 其余输入一律作为任务执行
    console.log('\nAgent 正在思考...\n');
    const result = await agent.run(input);
    totalToolCalls += result.toolCalls;
    console.log('\nAgent 回答:');
    console.log(result.finalAnswer ?? result.answer);
    console.log('\n--- 完成: ' + (result.finalAnswer !== null) +
      ', 迭代: ' + result.iterations +
      ', 工具调用: ' + result.toolCalls + ' ---\n');
  });

  // Ctrl+C 不退出进程，提示可用命令
  rl.on('SIGINT', () => {
    console.log('\n输入 quit / exit 退出，或输入 help 查看命令。');
    rl.prompt();
  });

  rl.prompt();
}

async function main() {
  const mode = process.argv[2] || 'ablation';

  if (mode === 'interactive') {
    await interactiveMode();
  } else if (mode === 'ablation') {
    await runAblationStudy();
  } else if (mode === 'single') {
    const targetMode = process.argv[3] || ContextMode.FULL;
    const task = process.argv.slice(4).join(' ') || EXPERIMENT_TASK;
    const config = ABLATION_CONFIGS[targetMode as ContextMode];
    if (!config) {
      console.error('未知模式: ' + targetMode);
      console.log('可用模式:', Object.values(ContextMode).join(', '));
      process.exit(1);
    }
    console.log('\n运行单次实验: ' + targetMode + '\n');
    const result = await runSingleExperiment(targetMode as ContextMode, config, task);
    console.log('\n结果:');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('用法: npx tsx src/main.ts [模式]');
    console.log('  interactive  - 交互模式（支持 samples/sample/mode/reset/status 等）');
    console.log('  ablation     - 运行全部 5 种消融模式（默认）');
    console.log('  single       - 运行指定模式');
  }
}

main().catch(console.error);