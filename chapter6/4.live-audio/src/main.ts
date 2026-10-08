// demo：录音→ASR→模型→TTS 全链（--offline 走确定性模板 + 预置转写）；eval：三段耗时与产物对照。
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { record, transcribe, speak, play } from './audio.js';
import { reply, offlineReply } from './agent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output');
const OFFLINE = process.argv.includes('--offline');
const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'demo';

const ASR_MODEL = process.env.ASR_MODEL || 'tiny';
const TTS_VOICE = process.env.TTS_VOICE || 'Tingting';
const SECONDS = Number(process.env.RECORD_SECONDS || '5');

function ms(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

async function runOnce(transcript: string, tag: string, trace: boolean) {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const asr = await transcribe(tag === 'offline' ? join(OUT, 'prerecorded.wav') : join(OUT, `${tag}.wav`), ASR_MODEL);
  const t1 = Date.now();
  const rep = OFFLINE
    ? { text: offlineReply(transcript), outTokens: 0, source: 'offline-template' as const }
    : await reply(transcript);
  const t2 = Date.now();
  const tts = await speak(rep.text, join(OUT, `${tag}_reply.aiff`), TTS_VOICE);
  const t3 = Date.now();
  if (trace) {
    console.log(`\n【听你说】${asr.text || '（未识别到语音）'}`);
    if (asr.segments.length) console.log(`  分段：${asr.segments.map((s) => `${s.start}-${s.end}s "${s.text}"`).join(' | ')}`);
    console.log(`【想回答】${rep.text}   （来源：${rep.source}）`);
    console.log(`【说出来】${tts.file ? `${ms(tts.durationMs ?? 0)} 音频 ${(tts.bytes / 1024).toFixed(0)}KB` : '合成失败'}`);
    console.log(`\n耗时：ASR ${ms(t1 - t0)}（加载 ${ms(asr.loadMs)} + 推理 ${ms(asr.inferMs)}）| 模型 ${ms(t2 - t1)} | TTS ${ms(t3 - t2)}`);
  }
  return { asr, rep, tts, ms: { asr: t1 - t0, llm: t2 - t1, tts: t3 - t2 } };
}

async function main() {
  if (mode === 'demo') {
    if (OFFLINE) {
      console.log('# 离线臂：预置音频（由 TTS 合成的一段问句）→ ASR → 确定性模板 → TTS\n');
      // 用 macOS say 造一段"用户说话"的音频，走完整 ASR 链路
      const q = join(OUT, 'prerecorded.wav');
      if (!existsSync(q)) {
        await speak('你好，今天天气怎么样？', q.replace(/\.wav$/, '.aiff'), TTS_VOICE);
        const { execFileSync } = await import('node:child_process');
        execFileSync('ffmpeg', ['-y', '-i', q.replace(/\.wav$/, '.aiff'), '-ar', '16000', '-ac', '1', q]);
      }
      console.log('预置音频：say 合成的「你好，今天天气怎么样？」（模拟用户说话）');
      await runOnce('你好，今天天气怎么样？', 'offline', true);
    } else {
      console.log(`# 在线臂：录 ${SECONDS} 秒 → ASR(${ASR_MODEL}) → ${process.env.OLLAMA_MODEL || 'gemma4'} → say\n`);
      console.log('请在系统提示音后开始说话…');
      await record(join(OUT, 'live.wav'), SECONDS);
      const r = await runOnce('', 'live', true);
      if (r.tts.file) {
        console.log('\n播放回答（afplay）…');
        await play(r.tts.file);
      }
    }
  } else {
    console.log('\n臂     ASR文本                      模型/模板回复            ASR     LLM    TTS\n--     ---------                      ------------            ---    ---    ---');
    const rows: string[] = [];
    for (const [tag, q] of [['offline', '你好，今天天气怎么样？'], ['live', '']] as [string, string][]) {
      if (tag === 'live' && !existsSync(join(OUT, 'live.wav'))) continue;
      if (tag === 'offline' && !existsSync(join(OUT, 'prerecorded.wav'))) {
        await speak('你好，今天天气怎么样？', join(OUT, 'prerecorded.aiff'), TTS_VOICE);
        const { execFileSync } = await import('node:child_process');
        execFileSync('ffmpeg', ['-y', '-i', join(OUT, 'prerecorded.aiff'), '-ar', '16000', '-ac', '1', join(OUT, 'prerecorded.wav')]);
      }
      const r = await runOnce(q, tag, false);
      rows.push(`${tag.padEnd(6)} ${(r.asr.text || '（空）').slice(0, 24).padEnd(26)} ${r.rep.text.slice(0, 18).padEnd(20)} ${ms(r.ms.asr).padEnd(6)} ${ms(r.ms.llm).padEnd(6)} ${ms(r.ms.tts)}`);
    }
    console.log(rows.join('\n'));
    console.log('\n降级声明：ASR 为 faster-whisper tiny（CPU int8）、TTS 为 macOS say，识别与音质不可与商用服务比。');
  }
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });