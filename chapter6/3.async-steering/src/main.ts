// main.ts —— 实验 6-3 统一入口
//
// 用法（见 package.json scripts）：
//   npm run sync    → 只跑同步对照（工具执行期间模型零输出，最终选 A）
//   npm run async   → 只跑异步对照（工具执行期间并行生成准备清单，最终选 A）
//   npm run steer   → 只跑中途引导（工具执行中更新条件，最终选 B）
//   npm run eval    → 三组全跑

import 'dotenv/config';
import { Ollama } from 'ollama';
import { runSync } from './sync.js';
import { runAsync } from './async.js';
import { runSteer } from './steer.js';

const model = process.env.OLLAMA_MODEL ?? 'gemma4:latest';
const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const client = new Ollama({ host: baseUrl });

console.log(`实验 6-3：模型 ${model}；Ollama 服务 ${baseUrl}\n`);

const arg = process.argv[2];

async function main(): Promise<void> {
  if (arg === 'sync') return runSync({ client, model });
  if (arg === 'async') return runAsync({ client, model });
  if (arg === 'steer') return runSteer({ client, model });
  // 默认：三组对照全部跑一遍
  await runSync({ client, model });
  await runAsync({ client, model });
  await runSteer({ client, model });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
