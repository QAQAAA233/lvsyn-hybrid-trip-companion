import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TMP_VIDEO_DIR = path.resolve('tmp/e2e-video');
const REPORT_PATH = path.resolve('tmp/e2e-report.json');
const OUT_TASK_DIR = path.resolve(process.env.DEMO_OUT_DIR || 'tmp/out');
const OUT_SHOWCASE_DIR = process.env.SHOWCASE_OUT_DIR ? path.resolve(process.env.SHOWCASE_OUT_DIR) : null;

fs.mkdirSync(OUT_TASK_DIR, { recursive: true });
if (OUT_SHOWCASE_DIR) fs.mkdirSync(OUT_SHOWCASE_DIR, { recursive: true });
fs.mkdirSync(TMP_VIDEO_DIR, { recursive: true });

function findBinary(name) {
  if (name === 'ffmpeg' && process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (name === 'ffprobe' && process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const winDefault = `C:/ffmpeg/ffmpeg-8.1.1-essentials_build/bin/${name}.exe`;
  if (fs.existsSync(winDefault)) return winDefault;
  try {
    const out = execFileSync('where.exe', [name], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (out) return out;
  } catch {
    // ignore
  }
  throw new Error(`${name} executable not found`);
}

const FFMPEG = findBinary('ffmpeg');
const FFPROBE = findBinary('ffprobe');

function runFfmpeg(args, label, cwd = ROOT) {
  const res = spawnSync(FFMPEG, args, { cwd, stdio: 'pipe', encoding: 'utf8', timeout: 90_000 });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed (${label}): ${res.stderr || res.error?.message}`);
  }
}

function getDurationSec(filePath) {
  const res = spawnSync(
    FFPROBE,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf8', timeout: 15_000 }
  );
  const parsed = Number.parseFloat((res.stdout || '').trim());
  return Number.isFinite(parsed) ? parsed : 10;
}

function formatSrtTime(sec) {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60000) % 60;
  const h = Math.floor(totalMs / 3600000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function makeTitleSlatePng(outPath, heading, subheading, badge, bgHex, accentHex) {
  const escape = (s) => s.replace(/:/g, '\\:').replace(/'/g, "\\'");

  runFfmpeg(
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${bgHex}:s=1280x720:d=1`,
      '-vf',
      [
        `drawbox=x=70:y=70:w=1140:h=580:color=#FFFFFF@0.96:t=fill`,
        `drawbox=x=70:y=70:w=1140:h=12:color=${accentHex}:t=fill`,
        `drawtext=text='${escape(badge)}':font='Segoe UI':x=120:y=140:fontsize=24:fontcolor=${accentHex}`,
        `drawtext=text='${escape(heading)}':font='Segoe UI':x=120:y=220:fontsize=48:fontcolor=#1C1917`,
        `drawtext=text='${escape(subheading)}':font='Segoe UI':x=120:y=310:fontsize=24:fontcolor=#57534E`,
      ].join(','),
      '-frames:v',
      '1',
      '-update',
      '1',
      outPath,
    ],
    path.basename(outPath)
  );
}

function pngToSegment(pngPath, outMp4, durationSec) {
  runFfmpeg(
    [
      '-y',
      '-loop',
      '1',
      '-i',
      pngPath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t',
      String(durationSec),
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#F8F7F4,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-shortest',
      outMp4,
    ],
    path.basename(outMp4)
  );
}

function framesDirToSegment(runDir, outMp4) {
  const framesJsonPath = path.join(runDir, 'frames.json');
  if (!fs.existsSync(framesJsonPath)) {
    throw new Error(`Missing frames.json in ${runDir}`);
  }
  const frames = JSON.parse(fs.readFileSync(framesJsonPath, 'utf8'));
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error(`No recorded frames in ${framesJsonPath}`);
  }

  const lines = [];
  for (const f of frames) {
    const abs = path.join(runDir, f.file).replace(/\\/g, '/');
    lines.push(`file '${abs}'`);
    lines.push(`duration ${f.durationSec}`);
  }
  // Repeat last frame per FFmpeg concat demuxer spec so final duration is honored
  lines.push(`file '${path.join(runDir, frames[frames.length - 1].file).replace(/\\/g, '/')}'`);

  const listPath = path.join(runDir, 'frames_concat.txt');
  fs.writeFileSync(listPath, lines.join('\n'), 'utf8');

  runFfmpeg(
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf',
      'fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=#F8F7F4,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-shortest',
      outMp4,
    ],
    path.basename(outMp4)
  );
}

const report = fs.existsSync(REPORT_PATH)
  ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))
  : { usedNativeNano: false, nativeAvailability: 'unknown' };

const usedNativeNano = Boolean(report.usedNativeNano);
const run1Dir = path.join(TMP_VIDEO_DIR, 'run1');
const run2Dir = path.join(TMP_VIDEO_DIR, 'run2');

const segsDir = path.join(TMP_VIDEO_DIR, 'segments');
fs.mkdirSync(segsDir, { recursive: true });

const introPng = path.join(segsDir, '00-intro.png');
const bridgePng = path.join(segsDir, '02-bridge.png');
const outroPng = path.join(segsDir, '04-outro.png');

makeTitleSlatePng(
  introPng,
  'LvSyn Hybrid Trip Companion',
  'Firebase AI Logic  |  Chrome Gemini Nano  |  Deterministic Verification',
  '#BUILDHYBRIDAI 2026  •  WEB / CHROME PWA',
  '#F8F7F4',
  '#059669'
);

makeTitleSlatePng(
  bridgePng,
  'Automatic Cloud Fallback + App Check',
  'Sign Vision + Schedule Optimizer via firebase/ai + Keep / Discard guardrails',
  'INFERENCE_MODE.PREFER_ON_DEVICE  ->  IN_CLOUD',
  '#F8F7F4',
  '#2563EB'
);

makeTitleSlatePng(
  outroPng,
  'Open Source Under Apache-2.0',
  'Built with firebase/ai, App Check, Remote Config & Offline Firestore Cache',
  'ZERO EMBEDDED SECRETS  •  RELIABLE HYBRID ROUTING',
  '#F8F7F4',
  '#059669'
);

const seg0 = path.join(segsDir, 'seg0.mp4');
const seg1 = path.join(segsDir, 'seg1.mp4');
const seg2 = path.join(segsDir, 'seg2.mp4');
const seg3 = path.join(segsDir, 'seg3.mp4');
const seg4 = path.join(segsDir, 'seg4.mp4');

pngToSegment(introPng, seg0, 6);
framesDirToSegment(run1Dir, seg1);
pngToSegment(bridgePng, seg2, 4);
framesDirToSegment(run2Dir, seg3);
pngToSegment(outroPng, seg4, 6);

const d0 = getDurationSec(seg0);
const d1 = getDurationSec(seg1);
const d2 = getDurationSec(seg2);
const d3 = getDurationSec(seg3);
const d4 = getDurationSec(seg4);

const t0 = 0;
const t1 = d0;
const t2 = t1 + d1;
const t3 = t2 + d2;
const t4 = t3 + d3;
const tEnd = t4 + d4;

const cues = usedNativeNano
  ? [
      [t0, t0 + d0 * 0.5, 'Meet LvSyn Hybrid Trip Companion — powered by Firebase AI Logic, Gemini Nano, and deterministic verification.'],
      [t0 + d0 * 0.5, t1, 'Travelers face two problems: signal dead-zones in transit, and pure cloud chatbots that invent venue hours.'],
      [t1, t1 + d1 * 0.5, 'Part 1: True Offline Mode. With network set to Offline, PREFER_ON_DEVICE executes locally on Chrome Gemini Nano.'],
      [t1 + d1 * 0.5, t2, 'Concierge and Multimodal Sign Vision complete locally on-device with 0 outbound cloud requests.'],
      [t2, t3, 'Part 2: Automatic Cloud Fallback. When Gemini Nano is unavailable, the same Firebase AI Logic call routes to Cloud Gemini.'],
      [t3, t3 + d3 * 0.55, 'App Check verifies the request while the deterministic Schedule Engine previews conflicts dropping from 2 to 0.'],
      [t3 + d3 * 0.55, t4, 'Changes apply only after clicking Keep, and Privacy Vault ONLY_ON_DEVICE blocks cloud leaks.'],
      [t4, tEnd, 'Open-source under Apache-2.0 with zero embedded secrets. Reliable hybrid travel planning online or off.'],
    ]
  : [
      [t0, t0 + d0 * 0.5, 'Meet LvSyn Hybrid Trip Companion — powered by Firebase AI Logic, Gemini Nano, and deterministic verification.'],
      [t0 + d0 * 0.5, t1, 'Built to handle connectivity dead-zones, strict on-device privacy, and deterministic schedule checking.'],
      [t1, t1 + d1 * 0.5, 'Part 1: Offline PWA & Privacy Shield. With browser networking Offline, local timeline edits remain instant.'],
      [t1 + d1 * 0.5, t2, 'Without local Gemini Nano weights loaded, Privacy Vault ONLY_ON_DEVICE blocks cloud uploads (0 bytes sent).'],
      [t2, t3, 'Part 2: Automatic Cloud Fallback via local dev emulator. PREFER_ON_DEVICE routes seamlessly to IN_CLOUD with App Check.'],
      [t3, t3 + d3 * 0.55, 'Multimodal Sign Vision and Schedule Optimizer preview conflicts dropping from 2 to 0 before Keep/Discard.'],
      [t3 + d3 * 0.55, t4, 'Clicking Keep updates all 5 stops to Verified, while Privacy Vault continues blocking any cloud leak.'],
      [t4, tEnd, 'Apache-2.0 open source with zero embedded secrets. Pair with Chrome Gemini Nano & Spark Firebase for live deployment.'],
    ];

const srtContent = cues
  .map((c, idx) => `${idx + 1}\n${formatSrtTime(c[0])} --> ${formatSrtTime(c[1])}\n${c[2]}\n`)
  .join('\n');

const srtPathTask = path.join(OUT_TASK_DIR, 'demo_subtitles.srt');
fs.writeFileSync(srtPathTask, srtContent, 'utf8');
if (OUT_SHOWCASE_DIR) {
  fs.writeFileSync(path.join(OUT_SHOWCASE_DIR, 'demo_subtitles.srt'), srtContent, 'utf8');
}

const concatFile = path.join(segsDir, 'concat.txt');
fs.writeFileSync(
  concatFile,
  [seg0, seg1, seg2, seg3, seg4].map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'),
  'utf8'
);

const rawConcat = path.join(segsDir, 'raw_concat.mp4');
runFfmpeg(
  ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', rawConcat],
  'concat'
);

const finalOutTask = path.join(OUT_TASK_DIR, 'demo_hybrid_trip_companion.mp4');
runFfmpeg(
  [
    '-y',
    '-i',
    rawConcat,
    '-vf',
    "subtitles='demo_subtitles.srt':force_style='FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,MarginV=24'",
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '22',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    finalOutTask,
  ],
  'burn-subtitles',
  OUT_TASK_DIR
);

console.log(`Built demo MP4 (${tEnd.toFixed(1)}s, usedNativeNano=${usedNativeNano}):`, finalOutTask);
if (OUT_SHOWCASE_DIR) {
  const finalOutShowcase = path.join(OUT_SHOWCASE_DIR, 'demo_hybrid_trip_companion.mp4');
  fs.copyFileSync(finalOutTask, finalOutShowcase);
  console.log('Copied demo MP4:', finalOutShowcase);
}
