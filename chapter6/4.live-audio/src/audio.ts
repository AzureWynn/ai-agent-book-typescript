// 语音链路的三个外部环节：ffmpeg 录音、faster-whisper ASR、macOS say 合成。
// Python 只用来跑 ASR（faster-whisper 是 Python 库），其余全在 TS。
import { execFile } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = join(ROOT, '.venv/bin/python');

function sh(cmd: string, args: string[], timeout = 120_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolveP) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolveP({ ok: !err, out: (stdout + stderr).trim() });
    });
  });
}

// 录音：ffmpeg 从默认输入设备录 N 秒为 16k 单声道 wav（whisper 期望的输入格式）
export async function record(out: string, seconds: number): Promise<string> {
  mkdirSync(dirname(out), { recursive: true });
  const r = await sh('ffmpeg', [
    '-y', '-f', 'avfoundation', '-i', ':0',
    '-t', String(seconds), '-ar', '16000', '-ac', '1',
    '-c:a', 'pcm_s16le', out,
  ], seconds * 1000 + 15_000);
  if (!r.ok || !existsSync(out)) throw new Error(`录音失败：${r.out.slice(-300)}（macOS 需授予终端麦克风权限）`);
  return out;
}

export interface AsrResult {
  text: string;
  segments: { start: number; end: number; text: string }[];
  loadMs: number;
  inferMs: number;
  prob: number;
}

// ASR：调 venv 里的 faster-whisper。首次会下载模型，需联网。
const ASR_SCRIPT = `
import sys, json, time
from faster_whisper import WhisperModel
model_name, wav, lang = sys.argv[1], sys.argv[2], sys.argv[3]
t0 = time.time()
model = WhisperModel(model_name, device="cpu", compute_type="int8")
load_ms = (time.time() - t0) * 1000
t1 = time.time()
segments, info = model.transcribe(wav, language=lang, beam_size=1, vad_filter=True)
segs = [{"start": round(s.start,2), "end": round(s.end,2), "text": s.text.strip()} for s in segments]
print(json.dumps({"text": "".join(s["text"] for s in segs).strip(),
                  "segments": segs, "load_ms": round(load_ms), "infer_ms": round((time.time()-t1)*1000),
                  "prob": round(getattr(info, "language_probability", 0), 3)}, ensure_ascii=False))
`;

export async function transcribe(wav: string, model = 'tiny', lang = 'zh'): Promise<AsrResult> {
  const script = join(ROOT, 'output/_asr.py');
  mkdirSync(dirname(script), { recursive: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(script, ASR_SCRIPT);
  const r = await sh(PY, [script, model, wav, lang], 600_000);
  if (!r.ok) throw new Error(`ASR 失败：${r.out.slice(-400)}`);
  const j = JSON.parse(r.out.split('\n').filter(Boolean).pop() as string) as {
    text: string; segments: AsrResult['segments']; load_ms: number; infer_ms: number; prob: number;
  };
  // Python 侧是 snake_case，这里映射成 TS 的 camelCase
  return {
    text: j.text,
    segments: j.segments,
    loadMs: j.load_ms,
    inferMs: j.infer_ms,
    prob: j.prob,
  };
}

export interface TtsResult {
  file: string | null;
  durationMs: number | null;
  bytes: number;
}

// TTS：macOS say 出 aiff。若目标语言无音色，回落英文音色并如实标注。
export async function speak(text: string, out: string, voice = 'Tingting'): Promise<TtsResult> {
  mkdirSync(dirname(out), { recursive: true });
  let v = voice;
  const voices = await sh('say', ['-v', '?']);
  if (voices.ok && !new RegExp(`^${v}\\s{2,}zh_CN`, 'm').test(voices.out)) {
    const firstZh = voices.out.split('\n').find((l) => /zh_CN/.test(l));
    const name = firstZh?.match(/^(.+?)\s{2,}zh_CN/)?.[1];
    if (name) v = name;
  }
  const r = await sh('say', ['-v', v, '-o', out, '--data-format=LEF32@22050', text]);
  if (!r.ok || !existsSync(out)) {
    // 有些音色不支持 LEF32，退回默认格式重试
    const r2 = await sh('say', ['-v', v, '-o', out, text]);
    if (!r2.ok || !existsSync(out)) return { file: null, durationMs: null, bytes: 0 };
  }
  const bytes = statSync(out).size;
  const probe = await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out]);
  const dur = Number(probe.out) || 0;
  return { file: out, durationMs: Math.round(dur * 1000), bytes };
}

export async function play(file: string): Promise<void> {
  await sh('afplay', [file], 600_000);
}