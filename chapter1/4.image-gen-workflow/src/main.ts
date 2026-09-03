// src/main.ts
import { rewritePrompt } from './rewriter.js';
import { runWorkflowRoute } from './pipeline.js';

// 加载 .env
try {
  process.loadEnvFile('.env');
} catch (e) { /* ignore */ }

// 测试需求（对应官方 main.py REQUIREMENTS）：口语化中文，分具体/宽泛两类
interface Requirement {
  id: string;
  category: 'specific' | 'broad';
  text: string;
  /** 具体需求：用户明确要求保留的关键细节（忠实度检查对象） */
  keyDetail?: string;
  /** 检测该细节是否被改写进 prompt 的英文关键词（gemma 会用专业 SD 词而非原词，如"丧"→ melancholic） */
  keyRegex?: RegExp;
}

const REQUIREMENTS: Requirement[] = [
  {
    id: 'programmer-overtime',
    category: 'specific',
    text: '帮我画一个周末加班的程序员，风格丧一点',
    keyDetail: '丧',
    keyRegex: /sad|melanchol|somber|gloomy|weary|tired|exhaust|depress|moody|lonely|isolat/i,
  },
  {
    id: 'windowsill-plant',
    category: 'specific',
    text: '帮我画一盆放在窗台上的绿植，早晨的阳光刚好照进来',
    keyDetail: '早晨阳光',
    keyRegex: /sun|sunlight|sunrise|morning|golden hour|god rays|volumetric|daylight|warm light/i,
  },
  {
    id: 'headphone-poster',
    category: 'specific',
    text: '帮我做一张新款降噪耳机的产品海报，主打"深夜独处也清净"这句文案，风格简约高级',
    keyDetail: '深夜清净+简约',
    keyRegex: /night|nocturnal|dark|quiet|silent|serene|calm|peaceful|minimal|minimalism/i,
  },
  { id: 'agi-programmer', category: 'broad', text: '帮我画一个 AGI 实现以后程序员的工作场景' },
  { id: 'future-city-morning', category: 'broad', text: '帮我画一幅"未来城市的早晨"的画' },
];

function fmt(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** 单句需求跑工作流路线并打印 */
async function runOne(req: Requirement): Promise<void> {
  console.log('\n' + '═'.repeat(64));
  console.log(`[${req.id}] (${req.category}) ${req.text}`);
  console.log('═'.repeat(64));

  const result = await runWorkflowRoute(req.text);

  if (!result.ok || !result.rewrite.prompt) {
    console.log('  ✗ 工作流失败');
    return;
  }

  console.log('\n── 节点 1：提示词改写 ──');
  console.log('  prompt:           ' + fmt(result.rewrite.prompt));
  console.log('  negative_prompt:  ' + fmt(result.rewrite.negative_prompt));
  console.log('  style_notes:      ' + result.rewrite.style_notes);

  console.log('\n── 节点 2：文生图 ──');
  console.log(`  generator: ${result.image.model}`);
  console.log(`  note: ${result.image.note ?? ''}`);

  console.log('\n── 对照观察 ──');
  if (req.category === 'specific') {
    // 具体需求：检查改写是否"弄丢"了用户明确指定的关键细节
    console.log('  [具体需求 → 考察忠实度] 用户明确的细节是否被改写保留?');
    // 用该需求自己的关键词集合判断（gemma 会用 melancholic/somber 等专业词而非原词）
    const ok = req.keyRegex?.test(result.rewrite.prompt) ?? false;
    console.log(`  提示词保留"${req.keyDetail}": ${ok}`);
  } else {
    // 宽泛需求：考察改写节点做了哪些"场景具象化"
    console.log('  [宽泛需求 → 考察信息增益] 改写替用户想象了什么画面细节?');
    console.log('  style_notes 里改写说明的增补: ' + result.rewrite.style_notes);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] || 'workflow';

  if (mode === 'rewrite') {
    // 只测改写节点（不发生图）
    const text = process.argv.slice(3).join(' ') || REQUIREMENTS[0]!.text;
    console.log('改写节点测试：' + text + '\n');
    const out = await rewritePrompt(text);
    console.log('prompt:           ' + out.prompt);
    console.log('negative_prompt:  ' + out.negative_prompt);
    console.log('style_notes:      ' + out.style_notes);
  } else if (mode === 'workflow') {
    const target = process.argv[3];
    const list = target ? REQUIREMENTS.filter((r) => r.id === target) : REQUIREMENTS;
    if (list.length === 0) {
      console.error('未知需求 ID。可用: ' + REQUIREMENTS.map((r) => r.id).join(', '));
      process.exit(1);
    }
    for (const req of list) await runOne(req);
    console.log('\n' + '─'.repeat(64));
    console.log('提示：生图节点是占位实现（未真出图）。');
  } else {
    console.log('用法:');
    console.log('  npm run workflow             - 全部 5 句需求跑工作流路线');
    console.log('  npm run workflow -- <id>     - 跑指定需求');
    console.log('  npm run rewrite -- "一句话"  - 只测改写节点');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });