// demo：neutral 臂全轨迹；eval：三臂对照表。
import { runPair, type HandoffRecord } from './handoff.js';
import type { Arm } from './renderers.js';

const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

function line(r: HandoffRecord): string {
  return `${r.arm}  首请求${r.handoffStatus}  数据齐${r.dataComplete ? '✓' : '✗'}  总额对${r.answerCorrect ? '✓' : '✗'}  重复${r.repeatedCalls.length}  ${r.roundsAfterSwitch}轮/${r.tokensAfterSwitch}token${r.error ? `  ERR:${r.error.slice(0, 60)}` : ''}`;
}

async function main() {
  if (mode === 'demo') {
    console.log('# neutral 臂：A(chat)跑2个工具 → 切B(generate)中立接管\n');
    const r = await runPair('neutral', true);
    console.log(`\n${line(r)}`);
    console.log(`FINAL: ${r.finalText.slice(0, 200)}`);
  } else {
    console.log('\n臂       首请求  数据齐  总额对  重复调用  切换后轮数/token\n--       ------  ------  ------  --------  ----------------');
    for (const arm of ['direct', 'strip', 'neutral'] as Arm[]) {
      const r = await runPair(arm, false);
      console.log(line(r));
    }
    console.log('\n（双"厂商"=Ollama chat/generate 两种接口形状；熔断人为注入；总额标准答案 10600）');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
