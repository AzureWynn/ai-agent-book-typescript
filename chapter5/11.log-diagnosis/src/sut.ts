// sut.py 对应：被测系统确定性仿真。fixed=false 复现线上三 bug；
// fixed=true 演示修复后行为。轨迹结构与 data/trajectories.jsonl 一致。
export interface Turn {
  index: number;
  role: string;
  module?: string;
  tool?: string;
  content?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status?: string;
  latency_ms?: number;
}

export interface TaskInput {
  intent: 'refund' | 'order_status';
  order_id: string;
  order_status?: string;
  payment_flaky?: boolean;
  slow_inventory?: boolean;
  sku?: string;
}

export interface Trajectory {
  trajectory_id: string;
  task_input: TaskInput;
  final_status: string;
  turns: Turn[];
}

export function runTask(taskInput: TaskInput, fixed: boolean): Trajectory {
  const turns: Turn[] = [];
  let idx = 0;
  const add = (t: Omit<Turn, 'index'>): void => { turns.push({ ...t, index: idx++ }); };
  let finalStatus = 'success';

  add({ role: 'user', content: `task=${taskInput.intent}, order=${taskInput.order_id}` });
  add({ role: 'assistant', module: 'intent_parser', content: `意图=${taskInput.intent}` });

  if (taskInput.intent === 'refund') {
    add({ role: 'tool', module: 'order_service', tool: 'query_order', input: { order_id: taskInput.order_id }, output: { status: taskInput.order_status ?? 'paid' }, status: 'success', latency_ms: 210 });
    if (fixed) {
      add({ role: 'tool', module: 'order_service', tool: 'verify_refund_eligibility', input: { order_id: taskInput.order_id }, output: { eligible: true }, status: 'success', latency_ms: 120 });
    }
    if (taskInput.payment_flaky && !fixed) {
      for (let i = 0; i < 3; i++) {
        add({ role: 'tool', module: 'payment_service', tool: 'process_refund', input: { order_id: taskInput.order_id }, output: { error: 'gateway_timeout' }, status: 'error', latency_ms: 3000 });
      }
      add({ role: 'assistant', module: 'payment_service', content: '多次失败，仍按成功结束（bug）' });
      finalStatus = 'success'; // 误报成功
    } else if (taskInput.payment_flaky && fixed) {
      add({ role: 'tool', module: 'payment_service', tool: 'process_refund', input: { order_id: taskInput.order_id }, output: { error: 'gateway_timeout' }, status: 'error', latency_ms: 1500 });
      add({ role: 'assistant', module: 'payment_service', content: '退避 800ms 后重试' });
      add({ role: 'tool', module: 'payment_service', tool: 'process_refund', input: { order_id: taskInput.order_id, retry: 1 }, output: { refund_id: 'R-OK' }, status: 'success', latency_ms: 600 });
    } else {
      add({ role: 'tool', module: 'payment_service', tool: 'process_refund', input: { order_id: taskInput.order_id }, output: { refund_id: 'R-OK' }, status: 'success', latency_ms: 540 });
    }
  } else {
    add({ role: 'tool', module: 'order_service', tool: 'query_order', input: { order_id: taskInput.order_id }, output: { status: 'paid', sku: taskInput.sku }, status: 'success', latency_ms: 220 });
    if (taskInput.slow_inventory && !fixed) {
      add({ role: 'tool', module: 'inventory_service', tool: 'check_stock', input: { sku: taskInput.sku }, output: { stock: 12 }, status: 'success', latency_ms: 8300 });
    } else if (taskInput.slow_inventory && fixed) {
      add({ role: 'tool', module: 'inventory_service', tool: 'check_stock', input: { sku: taskInput.sku, degraded: true }, output: { stock: 'cached:12', degraded: true }, status: 'success', latency_ms: 400 });
    } else {
      add({ role: 'tool', module: 'inventory_service', tool: 'check_stock', input: { sku: taskInput.sku }, output: { stock: 5 }, status: 'success', latency_ms: 300 });
    }
  }

  add({ role: 'tool', module: 'notification_service', tool: 'notify_user', input: { final_status: finalStatus }, output: { sent: true }, status: 'success', latency_ms: 60 });

  return { trajectory_id: `REPLAY::${taskInput.order_id}::${fixed ? 'fixed' : 'buggy'}`, task_input: taskInput, final_status: finalStatus, turns };
}

export const SCENARIOS: { id: string; input: TaskInput; expectProblems: string[] }[] = [
  { id: 'S1 退款网关抖动', input: { intent: 'refund', order_id: 'O1001', payment_flaky: true }, expectProblems: ['R1', 'R2'] },
  { id: 'S2 库存超时', input: { intent: 'order_status', order_id: 'O1002', slow_inventory: true, sku: 'SKU-7' }, expectProblems: ['R3'] },
  { id: 'S3 正常退款', input: { intent: 'refund', order_id: 'O1003' }, expectProblems: ['R1'] },
];
