export interface TimerEntry {
  id: string;
  name: string;
  kind: 'once' | 'recurring';
  status: 'scheduled' | 'fired' | 'cancelled';
  fires: number;
  maxOccurrences: number | null;
  message: string;
  timer?: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;
}

export const firedLog: string[] = [];

const timers = new Map<string, TimerEntry>();
let seq = 0;

function recordFire(entry: TimerEntry): void {
  entry.fires += 1;
  firedLog.push(`${new Date().toISOString()} [${entry.id}] ${entry.message}`);
  if (entry.kind === 'once' || (entry.maxOccurrences !== null && entry.fires >= entry.maxOccurrences)) {
    entry.status = 'fired';
  }
}

export function setTimer(name: string, delayMs: number, message: string): TimerEntry {
  seq += 1;
  const id = `timer_${Date.now()}_${seq}`;
  const entry: TimerEntry = {
    id,
    name,
    kind: 'once',
    status: 'scheduled',
    fires: 0,
    maxOccurrences: 1,
    message,
  };
  timers.set(id, entry);
  entry.timer = setTimeout(() => recordFire(entry), Math.max(0, delayMs));
  return entry;
}

export function setRecurringTimer(name: string, intervalMs: number, maxOccurrences: number, message: string): TimerEntry {
  seq += 1;
  const id = `timer_${Date.now()}_${seq}`;
  const entry: TimerEntry = {
    id,
    name,
    kind: 'recurring',
    status: 'scheduled',
    fires: 0,
    maxOccurrences,
    message,
  };
  timers.set(id, entry);
  entry.timer = setInterval(() => {
    const current = timers.get(id);
    if (!current) return;
    if (current.status !== 'scheduled') {
      if (current.timer) clearInterval(current.timer as ReturnType<typeof setInterval>);
      return;
    }
    recordFire(current);
  }, Math.max(10, intervalMs));
  return entry;
}

export function cancelTimer(id: string): boolean {
  const entry = timers.get(id);
  if (!entry || entry.status !== 'scheduled') return false;
  if (entry.timer) {
    if (entry.kind === 'once') clearTimeout(entry.timer as ReturnType<typeof setTimeout>);
    else clearInterval(entry.timer as ReturnType<typeof setInterval>);
  }
  entry.status = 'cancelled';
  return true;
}

export function listTimers(): TimerEntry[] {
  return [...timers.values()];
}

export function getTimer(id: string): TimerEntry | undefined {
  return timers.get(id);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
