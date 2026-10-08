// replay.py 对应：断言 DSL 求值 + 同一输入 buggy/fixed 重放，演示 FAIL→PASS 翻转。
import type { Trajectory } from './sut.js';
import type { TestCase } from './diagnoser.js';

export interface ReplayVerdict {
  test_id: string;
  buggy: boolean;
  fixed: boolean;
  flip: boolean;
  detail: string;
}

function toolTurns(t: Trajectory, name: string) {
  return t.turns.filter((x) => x.tool === name);
}

export function evaluate(tc: TestCase, traj: Trajectory): { pass: boolean; detail: string } {
  const { type, params } = tc.assertion;
  if (type === 'step_present') {
    const tool = String(params.tool ?? '');
    const hit = toolTurns(traj, tool).length > 0;
    return { pass: hit, detail: hit ? `${tool} 出现` : `${tool} 缺失` };
  }
  if (type === 'tool_succeeds') {
    const tool = String(params.tool ?? '');
    const turns = toolTurns(traj, tool);
    if (!turns.length) return { pass: false, detail: `${tool} 缺失` };
    const fails = turns.filter((x) => x.status === 'error').length;
    const lastOk = turns[turns.length - 1]?.status === 'success';
    // 多次失败后误报成功：失败≥2 且 final_status 仍 success → 判错
    const falseSuccess = fails >= 2 && traj.final_status === 'success' && turns.every((x) => x.status === 'error' || !x.output?.refund_id);
    if (falseSuccess) return { pass: false, detail: `${tool} ${fails}次失败后误报成功` };
    return lastOk ? { pass: true, detail: `${tool} 最终成功` } : { pass: false, detail: `${tool} 未成功` };
  }
  if (type === 'latency_under') {
    const tool = String(params.tool ?? '');
    const th = Number(params.threshold_ms ?? 5000);
    const turns = toolTurns(traj, tool);
    if (!turns.length) return { pass: false, detail: `${tool} 缺失` };
    const max = Math.max(...turns.map((x) => x.latency_ms ?? 0));
    return max < th ? { pass: true, detail: `最大${max}ms<${th}ms` } : { pass: false, detail: `最大${max}ms≥${th}ms` };
  }
  if (type === 'final_status_is') {
    const want = String(params.value ?? '');
    return traj.final_status === want
      ? { pass: true, detail: `final=${want}` }
      : { pass: false, detail: `final=${traj.final_status}≠${want}` };
  }
  return { pass: false, detail: `未知断言 ${type}` };
}

export function replay(tc: TestCase, buggy: Trajectory, fixed: Trajectory): ReplayVerdict {
  const b = evaluate(tc, buggy);
  const f = evaluate(tc, fixed);
  return {
    test_id: tc.test_id,
    buggy: b.pass,
    fixed: f.pass,
    flip: !b.pass && f.pass,
    detail: `buggy:${b.pass ? '过' : '挂'}(${b.detail}) → fixed:${f.pass ? '过' : '挂'}(${f.detail})`,
  };
}
