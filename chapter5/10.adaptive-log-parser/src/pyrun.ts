import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export interface PyRun {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runPythonFile(file: string, args: string[], timeoutMs = 20000): Promise<PyRun> {
  return new Promise((resolve) => {
    execFile('python3', [file, ...args], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

export function runPythonCode(code: string, timeoutMs = 20000): Promise<PyRun> {
  return new Promise((resolve) => {
    execFile('python3', ['-c', code], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

export function writeTextFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8');
}
