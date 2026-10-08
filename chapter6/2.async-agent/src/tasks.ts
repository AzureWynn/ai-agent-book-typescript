// tasks.ts —— 异步任务管理（对应官方 TaskManager / TaskState）
//
// 用"模拟异步终端命令"（setInterval 推进进度）替代真实子进程，保证可复现、
// 无危险命令。教学点：
//   - 异步工具调用后【立即返回 task_id 占位符】，任务在后台跑，不阻塞调用方；
//   - 进度可查询（query）、可取消（cancel）、可快照恢复（snapshot/restore）；
//   - 任务自然完成时通过 onComplete 回调把真实结果【作为新事件】交回给运行时；
//   - 取消只冻结任务本身（status → canceled），运行时无损，可立即继续工作。

export type TaskStatus = 'running' | 'completed' | 'canceled' | 'suspended';

export interface TaskState {
  taskId: string;
  command: string;
  status: TaskStatus;
  progress: number; // 0-100
  result?: string;
}

export interface TaskOptions {
  totalTicks?: number; // 总 tick 数（决定耗时）
  tickMs?: number; // 每 tick 的真实毫秒数
  progress?: number; // 从检查点恢复时使用
  suspended?: boolean; // 从检查点恢复时标记为挂起
}

export type OnComplete = (state: TaskState) => void;

let seq = 0;

export class AsyncTask {
  private ticks = 0;
  private status: TaskStatus;
  private resultText?: string;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public readonly taskId: string,
    public readonly command: string,
    private readonly totalTicks: number,
    private readonly tickMs: number,
    private progress: number,
    private readonly onComplete: OnComplete | undefined,
    suspended = false,
  ) {
    this.status = suspended ? 'suspended' : 'running';
  }

  start(): void {
    if (this.status !== 'running' || this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private tick(): void {
    this.ticks++;
    this.progress = Math.min(100, Math.round((this.ticks / this.totalTicks) * 100));
    if (this.progress >= 100) this.finish();
  }

  private finish(): void {
    this.status = 'completed';
    this.resultText = `完成: ${this.command}（任务 ${this.taskId}）`;
    if (this.timer) clearInterval(this.timer);
    this.onComplete?.(this.query());
  }

  query(): TaskState {
    return {
      taskId: this.taskId,
      command: this.command,
      status: this.status,
      progress: this.progress,
      result: this.resultText,
    };
  }

  cancel(): TaskState {
    if (this.status === 'running') this.status = 'canceled';
    if (this.timer) clearInterval(this.timer);
    return this.query();
  }

  /** 快照：用于检查点持久化 */
  snapshot(): Record<string, unknown> {
    return {
      taskId: this.taskId,
      command: this.command,
      progress: this.progress,
      status: this.status,
    };
  }
}

export class TaskManager {
  private tasks = new Map<string, AsyncTask>();

  constructor(private readonly opts: { onComplete?: OnComplete } = {}) {}

  /** 启动一个后台任务（立即返回，不阻塞调用方） */
  start(command: string, opts: TaskOptions = {}): TaskState {
    const id = `T${++seq}`;
    const task = new AsyncTask(
      id,
      command,
      opts.totalTicks ?? 20,
      opts.tickMs ?? 150,
      opts.progress ?? 0,
      this.opts.onComplete,
      opts.suspended ?? false,
    );
    this.tasks.set(id, task);
    task.start();
    return task.query();
  }

  query(taskId: string): TaskState | null {
    return this.tasks.get(taskId)?.query() ?? null;
  }

  cancel(taskId: string): boolean {
    const t = this.tasks.get(taskId);
    if (!t) return false;
    t.cancel();
    return true;
  }

  cancelAll(): TaskState[] {
    const cancelled: TaskState[] = [];
    for (const t of this.tasks.values()) {
      if (t.query().status === 'running') cancelled.push(t.cancel());
    }
    return cancelled;
  }

  anyRunning(): boolean {
    for (const t of this.tasks.values()) {
      if (t.query().status === 'running') return true;
    }
    return false;
  }

  allStates(): TaskState[] {
    return [...this.tasks.values()].map((t) => t.query());
  }

  snapshot(): Array<Record<string, unknown>> {
    return [...this.tasks.values()].map((t) => t.snapshot());
  }

  /** 从检查点恢复：把记录还原为 suspended 任务（保留最后进度，供上层决定续跑/重跑） */
  restore(records: Array<Record<string, unknown>>): void {
    for (const rec of records) {
      const id = String(rec.taskId ?? `T${++seq}`);
      const task = new AsyncTask(
        id,
        String(rec.command ?? '(恢复任务)'),
        20,
        150,
        Number(rec.progress ?? 0),
        this.opts.onComplete,
        true, // suspended
      );
      this.tasks.set(id, task);
    }
  }
}
