// T1 只读任务（照抄书 5.1 节例子）+ T2 修复循环任务，附机器验收。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CodingAgent } from './agent.js';
import type { TaskCheck } from './types.js';

export const T1 = '把 sample-project 里所有 TODO 注释整理成清单，写入 TODO_LIST.md（文件放在 workspace 根目录）。只读+写清单，不要改源文件。';
export const T2 = 'sample-project/calc.mjs 里的 add 函数有 bug：跑 node sample-project/test.mjs 验证，先复现失败，再修复源码，最后跑测试直到 ALL TESTS PASS。只许改 calc.mjs。';

export function checkT1(workspace: string): TaskCheck[] {
  const f = join(workspace, 'TODO_LIST.md');
  if (!existsSync(f)) return [{ name: '清单文件存在', pass: false, detail: 'TODO_LIST.md 没生成' }];
  const text = readFileSync(f, 'utf8');
  const todos = ['users_v2', 'fix operator', 'edge case'];
  const missing = todos.filter((t) => !text.toLowerCase().includes(t.toLowerCase().split(' ')[0] as string));
  return [
    { name: '清单文件存在', pass: true, detail: 'TODO_LIST.md 已生成' },
    { name: '3 个 TODO 齐全', pass: missing.length === 0, detail: missing.length ? `缺：${missing.join('、')}` : 'users_v2/operator/edge case 都在' },
  ];
}

export function checkT2(workspace: string): TaskCheck[] {
  const src = readFileSync(join(workspace, 'sample-project/calc.mjs'), 'utf8');
  let testOut: string;
  try {
    testOut = execFileSync('node', [join(workspace, 'sample-project/test.mjs')], { timeout: 15000, encoding: 'utf8' }).trim();
  } catch (e) {
    testOut = String((e as { stdout?: string }).stdout ?? (e as Error).message);
  }
  return [
    { name: '测试全过', pass: testOut.includes('ALL TESTS PASS'), detail: testOut.split('\n').slice(-2).join(' / ') },
    { name: '源码被修复', pass: src.includes('a + b') || src.includes('a+b'), detail: src.includes('a - b') ? '减号还在' : '运算符已改' },
  ];
}

export async function runTask(task: string, workspace: string, repoRoot: string, trace: boolean) {
  const agent = new CodingAgent();
  const gen = agent.run(task, workspace, repoRoot);
  for (;;) {
    const step = await gen.next();
    if (step.done) return step.value;
    const value = step.value;
    if (trace) {
      if (value.type === 'tool_call') console.log(`\n[tool] ${value.tool} ${JSON.stringify(value.args).slice(0, 160)}`);
      else if (value.type === 'tool_result') console.log(`[result] ${value.ok ? 'ok' : 'FAIL'}: ${value.output.slice(0, 200).replace(/\n/g, ' | ')}`);
      else if (value.type === 'format_error') console.log(`[format!] ${value.detail}`);
      else if (value.type === 'done') console.log(`\n[FINAL] ${value.answer.slice(0, 300)}`);
      else if (value.type === 'max_iterations') console.log('\n[STOP] 达到最大轮数');
    }
  }
}
