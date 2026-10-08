import { runAgent } from './agent.js';

const result = await runAgent('What was added in v2.4.0?');
const ok = /dark mode/i.test(result.answer);
console.log(ok ? 'PASS: answer mentions dark mode' : `FAIL: ${result.answer.slice(0, 200)}`);
process.exit(ok ? 0 : 1);
