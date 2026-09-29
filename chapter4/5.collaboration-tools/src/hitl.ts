export type RequestKind = 'approval' | 'input';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'answered' | 'expired';

export interface HitlRequest {
  id: string;
  kind: RequestKind;
  message: string;
  status: RequestStatus;
  response: string;
  createdAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

const requests = new Map<string, HitlRequest>();
let seq = 0;

function timeoutMs(fallback: number): number {
  const v = Number(process.env.HITL_TIMEOUT_SECONDS ?? fallback);
  return Number.isFinite(v) && v > 0 ? v * 1000 : fallback * 1000;
}

export interface HitlOptions {
  timeoutSeconds?: number;
  autoApprove?: boolean;
  defaultDecision?: boolean;
}

export async function requestApproval(message: string, opts: HitlOptions = {}): Promise<HitlRequest> {
  seq += 1;
  const id = `hitl_${Date.now()}_${seq}`;
  const entry: HitlRequest = {
    id,
    kind: 'approval',
    message,
    status: 'pending',
    response: '',
    createdAt: Date.now(),
  };
  requests.set(id, entry);
  if (opts.autoApprove) {
    entry.status = 'approved';
    entry.response = 'auto-approved (simulated admin)';
    return entry;
  }
  const ms = opts.timeoutSeconds !== undefined ? opts.timeoutSeconds * 1000 : timeoutMs(5);
  await new Promise<void>((resolve) => {
    entry.timer = setTimeout(() => {
      if (entry.status === 'pending') {
        entry.status = 'expired';
        entry.response = `timeout: conservative default applied (approved=${opts.defaultDecision === true})`;
      }
      resolve();
    }, ms);
  });
  return entry;
}

export async function requestInput(message: string, opts: HitlOptions = {}): Promise<HitlRequest> {
  seq += 1;
  const id = `hitl_${Date.now()}_${seq}`;
  const entry: HitlRequest = {
    id,
    kind: 'input',
    message,
    status: 'pending',
    response: '',
    createdAt: Date.now(),
  };
  requests.set(id, entry);
  if (opts.autoApprove) {
    entry.status = 'answered';
    entry.response = 'auto-answered (simulated admin): 同意，按流程继续';
    return entry;
  }
  const ms = opts.timeoutSeconds !== undefined ? opts.timeoutSeconds * 1000 : timeoutMs(5);
  await new Promise<void>((resolve) => {
    entry.timer = setTimeout(() => {
      if (entry.status === 'pending') {
        entry.status = 'expired';
        entry.response = 'timeout: no input received (conservative default: proceed without it)';
      }
      resolve();
    }, ms);
  });
  return entry;
}

export function respondToRequest(id: string, decision: boolean, note = ''): HitlRequest | undefined {
  const entry = requests.get(id);
  if (!entry || entry.status !== 'pending') return undefined;
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.kind === 'approval') {
    entry.status = decision ? 'approved' : 'rejected';
  } else {
    entry.status = 'answered';
  }
  entry.response = note || (decision ? 'approved by admin' : 'rejected by admin');
  return entry;
}

export function listPending(): HitlRequest[] {
  return [...requests.values()].filter((r) => r.status === 'pending');
}

export function listAllRequests(): HitlRequest[] {
  return [...requests.values()];
}
