// ffmpeg_utils.py + make_test_video.py 对应：
// 4 场景合成测试片（色块+大字标签，非实拍，如实声明）+ 抽帧/时长/剪辑。
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const GROUND_TRUTH: Record<string, [number, number]> = {
  hiking: [0, 10],
  surfing: [10, 20],
  skiing: [20, 30],
  cycling: [30, 40],
};

const SCENES = [
  { key: 'HIKING', color: 'red', secs: 10 },
  { key: 'SURFING', color: 'blue', secs: 10 },
  { key: 'SKIING', color: 'white', secs: 10 },
  { key: 'CYCLING', color: 'green', secs: 10 },
];

function sh(cmd: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolveP, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.slice(-500)));
      else resolveP(stdout);
    });
  });
}

const LABEL_PY = `
from PIL import Image, ImageDraw
import sys
label, out = sys.argv[1:3]
img = Image.new("RGBA", (320, 240), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.text((160, 120), label, fill=(0, 0, 0, 255), anchor="mm")
img.save(out)
`;

async function labelPng(label: string, out: string, root: string): Promise<void> {
  const script = out.replace(/\.png$/, '_mk.py');
  writeFileSync(script, LABEL_PY);
  await sh(joinPy(root), [script, label, out]);
}

function joinPy(root: string): string {
  return root + '/.venv/bin/python';
}

export async function makeTestVideo(root: string, out: string): Promise<void> {
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  const parts: string[] = [];
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i] as { key: string; color: string; secs: number };
    const seg = out.replace(/\.mp4$/, `.seg${i}.mp4`);
    const label = out.replace(/\.mp4$/, `.label${i}.png`);
    // 本机 ffmpeg 无 drawtext：PIL 烧字 + overlay（合成素材，声明）
    await labelPng(s.key, label, root);
    await sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${s.color}:s=320x240:d=${s.secs}:r=10`,
      '-i', label, '-filter_complex', '[0][1]overlay=(W-w)/2:(H-h)/2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', seg]);
    parts.push(seg);
  }
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  const list = out.replace(/\.mp4$/, '.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  await sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
}

export async function probeDuration(path: string): Promise<number> {
  const out = await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  return Number(out.trim());
}

export async function extractFrame(video: string, t: number, out: string): Promise<string> {
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  await sh('ffmpeg', ['-y', '-ss', String(t), '-i', video, '-frames:v', '1', out]);
  return out;
}

export async function cutClip(src: string, start: number, end: number, out: string, subtitle?: string): Promise<string | null> {
  const args = ['-y', '-ss', String(start), '-to', String(end), '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'];
  let srt: string | null = null;
  if (subtitle) {
    // 本机 ffmpeg 无 libass 烧录：字幕落 srt 旁路文件（播放器可挂载），如实声明
    srt = out.replace(/\.mp4$/, '.srt');
    writeFileSync(srt, `1\n00:00:00,000 --> 00:59:59,000\n${subtitle}\n`);
  }
  args.push(out);
  await sh('ffmpeg', args);
  return srt;
}
