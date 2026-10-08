import { execFile } from 'node:child_process';

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export function runPython(code: string, timeoutMs = 30000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile('python3', ['-c', code], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        code: error ? 1 : 0,
      });
    });
  });
}
