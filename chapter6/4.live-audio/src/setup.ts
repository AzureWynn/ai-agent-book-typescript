// setup.ts：检查 ffmpeg / macOS say / 中文音色 / faster-whisper，缺什么报什么。
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = join(ROOT, '.venv/bin/python');

function sh(cmd: string, args: string[], timeout = 20_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolveP) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      resolveP({ ok: !err, out: (stdout + stderr).trim() });
    });
  });
}

async function main() {
  console.log('第 6-4 实验环境自检\n');

  const ff = await sh('ffmpeg', ['-version']);
  console.log(`${ff.ok ? '✓' : '✗'} ffmpeg —— ${ff.ok ? ff.out.split('\n')[0]?.slice(0, 40) : '未安装（brew install ffmpeg）'}`);

  const voices = await sh('say', ['-v', '?']);
  const zh = voices.out.split('\n').filter((l) => /zh_CN/.test(l));
  const voiceNames = zh.map((l) => (l.match(/^(.+?)\s{2,}zh_CN/) as RegExpMatchArray | null)?.[1]).filter(Boolean);
  console.log(`${zh.length > 0 ? '✓' : '✗'} macOS say 中文音色 —— ${zh.length} 个：${voiceNames.slice(0, 5).join(', ')}${zh.length > 5 ? ' …' : ''}`);

  const hasVenv = existsSync(PY);
  const hasFw = hasVenv ? (await sh(PY, ['-c', 'import faster_whisper; print("ok")'])).ok : false;
  console.log(`${hasFw ? '✓' : '✗'} faster-whisper —— ${hasFw ? '已安装' : '未安装，运行：python3 -m venv .venv && .venv/bin/pip install faster-whisper "av<19"'}`);
  // faster-whisper 1.2.x 用 av.open(..., metadata_errors=...)，PyAV>=19 已移除该参数
  const avOk = hasVenv ? (await sh(PY, ['-c', 'import av; assert int(av.__version__.split(".")[0]) < 19; print("ok")'])).ok : false;
  if (hasFw && !avOk) console.log('  ✗ PyAV 版本冲突 —— 需 PyAV<19，运行：.venv/bin/pip install "av<19"');

  const ollamaOk = (await sh('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', `${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}/api/tags`])).out === '200';
  console.log(`${ollamaOk ? '✓' : '✗'} Ollama —— ${ollamaOk ? '已就绪' : '未启动（ollama serve）'}`);

  const model = process.env.ASR_MODEL || 'tiny';
  const ready = [ff.ok, zh.length > 0, hasFw, avOk, ollamaOk].every(Boolean);
  console.log(`\n${ready ? '✓ 全部就绪，可以跑 npm run demo' : '✗ 有缺失项，见上方提示'}`);
  console.log(`提示：首次运行会自动下载 faster-whisper 的 ${model} 模型（约 ${model === 'tiny' ? '75' : model === 'base' ? '145' : '480'}MB），需要联网。`);
  if (!ready) process.exitCode = 1;
}

main();