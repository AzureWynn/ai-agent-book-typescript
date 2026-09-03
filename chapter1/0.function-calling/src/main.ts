// src/main.ts
import { FunctionCallingAgent } from './agent.js';
import { listSkills, scanSkills, pickSkill, loadSkill, wrapSkill } from './skills.js';

// 加载 .env 环境变量（Node 22 原生支持）
try {
  process.loadEnvFile('.env');
} catch (e) {
  // .env 不存在时忽略
}

function printResult(result: { answer: string; iterations: number; toolCalls: number }, label = '最终答案'): void {
  console.log('\n' + '='.repeat(50));
  console.log(label + ':');
  console.log(result.answer);
  console.log('\n--- 迭代: ' + result.iterations + ', 工具调用: ' + result.toolCalls + ' ---\n');
}

/** 单次执行：可选注入 skill（异步加载 skill 包及其专属工具） */
async function runOnce(question: string, skillName?: string): Promise<void> {
  const agent = await FunctionCallingAgent.create({ verbose: true, skillName });
  const label = skillName ? `最终答案 (skill: ${skillName})` : '最终答案 (无 skill)';
  const result = await agent.run(question);
  printResult(result, label);
}

async function interactiveMode(): Promise<void> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // 默认无 skill，可在对话中输入 /skill <name> 动态切换（每次重建 agent）
  let skill: string | undefined;
  let agent = await FunctionCallingAgent.create({ verbose: true });

  console.log('='.repeat(50));
  console.log('交互模式 - 纯手写 Function Calling Agent');
  console.log('='.repeat(50));
  console.log('命令:');
  console.log('  /skill <name>   - 切换 skill（' + listSkills().join(' / ') + ' / none）');
  console.log('  /skills         - 查看可用 skill');
  console.log('  help / quit     - 帮助 / 退出');
  console.log('或直接提问。\n');

  rl.on('line', async (raw) => {
    const input = raw.trim();
    const lower = input.toLowerCase();

    if (lower === 'quit' || lower === 'exit') {
      console.log('再见！');
      rl.close();
      return;
    }
    if (lower === 'help') {
      console.log('试试:');
      console.log('  "15*23 等于多少"               → 触发 calculator');
      console.log('  "现在几点了"                   → 触发 get_current_time');
      console.log('  "/skill weather-report" 问天气 → 加载 skill 的专属工具');
      console.log('  "/skill calculator-expert" 再问计算题，看行为差异');
      return;
    }
    if (lower === '/skills') {
      console.log('可用 skill: ' + listSkills().join(', ') + ', none');
      return;
    }
    if (lower.startsWith('/skill ')) {
      const name = lower.slice(7).trim();
      skill = name === 'none' ? undefined : name;
      agent = await FunctionCallingAgent.create({ verbose: true, skillName: skill });
      console.log(skill ? `✅ 已切换 skill: ${skill}` : '✅ 已移除 skill');
      return;
    }
    if (!input) return;

    const result = await agent.run(input);
    printResult(result, skill ? `最终答案 (skill: ${skill})` : '最终答案 (无 skill)');
  });

  rl.prompt();
}

async function skillDemo(): Promise<void> {
  // 用同一个问题，对比不同 skill 注入下的行为
  const question = '15*23 等于多少？';
  console.log('问题: ' + question);
  console.log('将用三种配置对比同一问题的表现。\n');

  await runOnce(question);                       // 无 skill
  await runOnce(question, 'calculator-expert');  // 强调必用工具
  await runOnce(question, 'time-aware');         // 强调时间（与本问题无关，看模型是否仍受影响）
}

/** 演示真实框架 skill 的三个进阶能力：按需动态加载 / 附带数据文件 / 权限控制 */
async function advancedDemo(): Promise<void> {
  console.log('='.repeat(56));
  console.log('进阶演示：真实框架 skill 的三个能力');
  console.log('='.repeat(56));

  // ---------- 能力 1：按需动态加载（自动匹配） ----------
  console.log('\n【1】按需动态加载 —— 运行时扫描 skill 清单，按问题自动匹配，无需人指定');
  console.log('  skill 清单（scanSkills 扫描到元数据）:');
  for (const s of scanSkills()) {
    console.log(`    - ${s.name}: ${s.description}`);
  }
  for (const q of ['北京天气怎么样？', '现在几点了？', '帮我算一下 15*23']) {
    const matched = pickSkill(q);
    console.log(`  问题 "${q}" → 自动匹配到 skill: ${matched ?? '(无)'}`);
  }

  // ---------- 能力 2：附带可执行脚本 / 数据文件 ----------
  console.log('\n【2】附带数据文件 —— skill 文件夹里除了 SKILL.md，还能带数据/脚本');
  const weatherSkill = await loadSkill('weather-report');
  if (weatherSkill) {
    console.log(`  加载 "${weatherSkill.name}":`);
    console.log(`    - allowed-tools 声明: ${weatherSkill.allowedTools.join(' ')}`);
    console.log(`    - 附带数据文件: ${Object.keys(weatherSkill.files).join(', ')}`);
    const codes = JSON.parse(weatherSkill.files['city-codes.json'] ?? '{}');
    console.log(`    - city-codes.json 内容: ${JSON.stringify(codes)}`);
    console.log(`    - 专属工具: ${weatherSkill.tools.map((t) => t.definition.function.name).join(', ')}`);
  }

  // ---------- 能力 3：运行时授权（allowed-tools） ----------
  console.log('\n【3】运行时授权 —— skill 的 frontmatter 声明 allowed-tools，运行时执行前检查');
  console.log('  weather-report 声明 allowed-tools: get_weather');

  // 允许：weather-report 声明了 get_weather
  const allowed = await FunctionCallingAgent.create({ verbose: false, skillName: 'weather-report' });
  const okCheck = allowed.canExecute('get_weather');
  console.log(`  声明允许 (weather-report): canExecute(get_weather) = ${okCheck.allowed} ${okCheck.reason ?? ''}`);

  // 未声明：构造一个 allowed-tools 不含 get_weather 的 skill，模拟越权
  const loaded = await loadSkill('weather-report');
  const noPermSkill = { ...loaded!, allowedTools: ['calculator'] };
  const noPerm = new FunctionCallingAgent({ verbose: false, skill: noPermSkill });
  const deniedCheck = noPerm.canExecute('get_weather');
  console.log(`  未声明 (allowed-tools: calculator): canExecute(get_weather) = ${deniedCheck.allowed} ← ${deniedCheck.reason}`);

  console.log('\n  当模型请求调用 get_weather 时，runToolCall 会执行同样的运行时检查并拦截:');
  console.log('    ⛔ 无权调用工具 get_weather：skill 的 allowed-tools 未包含 get_weather');
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'interactive';

  if (mode === 'interactive') {
    await interactiveMode();
  } else if (mode === 'single') {
    const question = process.argv.slice(3).join(' ') || '15*23 等于多少？';
    await runOnce(question);
  } else if (mode === 'skill') {
    // 用法: npx tsx src/main.ts skill <skill名> "问题"
    const skill = process.argv[3];
    const question = process.argv.slice(4).join(' ') || '15*23 等于多少？';
    await runOnce(question, skill);
  } else if (mode === 'skill-demo') {
    await skillDemo();
  } else if (mode === 'advanced-demo') {
    await advancedDemo();
  } else {
    console.log('用法:');
    console.log('  interactive                      - 交互模式（/skill 切换）');
    console.log('  single "问题"                    - 单次执行（无 skill）');
    console.log('  skill <名> "问题"                - 注入指定 skill 执行');
    console.log('  skill-demo                       - 同一问题对比 无skill/calculator-expert/time-aware');
    console.log('  advanced-demo                    - 演示按需加载/附带数据/权限控制');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});