// Compatibility engine: uses a bundled ffmpeg to play files Chromium cannot decode itself
// (HEVC, AC-3/DTS audio, AVI, WMV, FLV, MPEG-TS, ...). Files the browser engine can play are never touched.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) ffmpegPath = ffmpegPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep).replace('app.asar/', 'app.asar.unpacked/');
  if (ffmpegPath && !fs.existsSync(ffmpegPath)) ffmpegPath = null;
} catch { ffmpegPath = null; }

const available = () => !!ffmpegPath;

// ------------------------------------------------------------ probing

const NATIVE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const NATIVE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_u8', 'pcm_s16be']);
const NATIVE_CONTAINER = /(^|,)(mov|mp4|m4a|3gp|3g2|mj2|matroska|webm|ogg|wav|mp3|flac|aac)(,|$)/;
const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'ttml']);

const probeCache = new Map();

function run(args, { input, maxBytes = 64 * 1024 * 1024, timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    const out = [];
    const err = [];
    let size = 0;
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', (d) => { size += d.length; if (size <= maxBytes) out.push(d); else p.kill('SIGKILL'); });
    p.stderr.on('data', (d) => { if (err.length < 400) err.push(d); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') }); });
    p.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout: Buffer.alloc(0), stderr: '' }); });
  });
}

function parseProbe(text) {
  const info = { container: '', duration: 0, video: null, audios: [], subs: [], chapters: [], title: null };
  const input = /Input #0, ([^,]+(?:,[^,]+)*?), from /.exec(text);
  if (input) info.container = input[1].trim();
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (dur) info.duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);

  const lines = text.split(/\r?\n/);
  let cur = null;
  let inMeta = false;
  let chapter = null;
  for (const line of lines) {
    const st = /^\s*Stream #0:(\d+)(?:\[0x[0-9a-fA-F]+\])?(?:\(([^)]*)\))?[^:]*: (Video|Audio|Subtitle|Data|Attachment): (.*)$/.exec(line);
    if (st) {
      const [, idx, lang, type, rest] = st;
      const codec = /^([\w-]+)/.exec(rest)[1].toLowerCase();
      cur = { index: Number(idx), lang: lang && lang !== 'und' ? lang : '', codec, rest, title: '', default: /\(default\)/.test(rest) };
      inMeta = false;
      chapter = null;
      if (type === 'Video') {
        if (/attached pic/.test(rest)) { cur = null; continue; }
        const dim = /(\d{2,5})x(\d{2,5})/.exec(rest.replace(/\b0x[0-9a-f]+\b/gi, ''));
        const fps = /([\d.]+) fps/.exec(rest);
        const pix = /\b(yuv\w+|gbr\w+|rgb\w+|nv12|gray\w*|pal8)\b/.exec(rest);
        const profile = /\(([^)]*)\)/.exec(rest);
        const v = { ...cur, width: dim ? Number(dim[1]) : 0, height: dim ? Number(dim[2]) : 0, fps: fps ? Number(fps[1]) : 0, pix: pix ? pix[1] : '', profile: profile ? profile[1] : '' };
        if (!info.video) info.video = v; else cur = null;
        if (info.video === v) cur = v;
      } else if (type === 'Audio') {
        cur.channels = rest.split(/,s+/)[2] || '';
        info.audios.push(cur);
      } else if (type === 'Subtitle') {
        cur.text = TEXT_SUBS.has(codec);
        info.subs.push(cur);
      } else cur = null;
      continue;
    }
    const ch = /^\s*Chapter #0:(\d+): start ([\d.]+), end ([\d.]+)/.exec(line);
    if (ch) { chapter = { title: '', start: Number(ch[2]) }; info.chapters.push(chapter); cur = null; inMeta = false; continue; }
    if (/^\s*Metadata:/.test(line)) { inMeta = true; continue; }
    const kv = /^\s{4,}(\w+)\s*:\s*(.*)$/.exec(line);
    if (inMeta && kv) {
      if (cur && kv[1].toLowerCase() === 'title' && !cur.title) cur.title = kv[2].trim();
      else if (chapter && kv[1].toLowerCase() === 'title') chapter.title = kv[2].trim();
      else if (!cur && !chapter && kv[1].toLowerCase() === 'title' && !info.title) info.title = kv[2].trim();
    } else if (!/^\s{4,}/.test(line)) inMeta = false;
  }
  return info;
}

/** Decide how to play: straight through Chromium, remux (copy video, convert audio) or full transcode. */
function plan(info) {
  const v = info.video;
  const audio = info.audios.find((a) => a.default) || info.audios[0];
  const containerOk = NATIVE_CONTAINER.test(info.container);
  let videoOk = true;
  let reason = '';
  if (v) {
    videoOk = NATIVE_VIDEO.has(v.codec);
    // Chromium has no decoder for 10-bit or 4:2:2 / 4:4:4 H.264.
    if (v.codec === 'h264' && (/10|12|422|444/.test(v.pix) || /High 10|High 4:|Hi10|Hi422|Hi444/i.test(v.profile))) { videoOk = false; reason = 'high-bit-depth H.264'; }
    if (!videoOk && !reason) reason = `${v.codec.toUpperCase()} video`;
  }
  const audioOk = !audio || NATIVE_AUDIO.has(audio.codec);
  if (!audioOk && !reason) reason = `${audio.codec.toUpperCase()} audio`;
  if (!containerOk && !reason) reason = `${info.container.split(',')[0]} container`;
  if (containerOk && videoOk && audioOk) return { mode: 'direct', reason: '' };
  const copyable = v && videoOk && ['h264', 'vp9', 'av1'].includes(v.codec);
  if (!v) return { mode: 'transcode', reason };
  return { mode: copyable ? 'remux' : 'transcode', reason };
}

async function probe(file) {
  if (!available()) return null;
  let st;
  try { st = await fs.promises.stat(file); } catch { return null; }
  const key = `${file}|${st.mtimeMs}`;
  if (probeCache.has(key)) return probeCache.get(key);
  const r = await run(['-hide_banner', '-i', file], { timeout: 15000 });
  if (!/Input #0/.test(r.stderr)) return null;
  const info = parseProbe(r.stderr);
  info.plan = plan(info);
  if (probeCache.size > 300) probeCache.delete(probeCache.keys().next().value);
  probeCache.set(key, info);
  return info;
}

// ------------------------------------------------------------ streaming

const procs = new Set();
let active = { key: '', proc: null };

function killProc(p) { try { p.kill('SIGKILL'); } catch {} procs.delete(p); }
function killAll() { for (const p of [...procs]) killProc(p); }

const PRESETS = { fast: ['ultrafast', '27'], balanced: ['veryfast', '22'], high: ['faster', '19'] };

function streamArgs(file, { start = 0, mode = 'transcode', audio = null, video = true, quality = 'balanced' }, info) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  const v = info && info.video;
  const a = info && (info.audios.find((x) => x.index === audio) || info.audios.find((x) => x.default) || info.audios[0]);
  if (v && video) args.push('-map', `0:${v.index}`); else args.push('-vn');
  if (a) args.push('-map', `0:${a.index}`); else args.push('-an');
  args.push('-sn', '-dn');
  if (v && video) {
    if (mode === 'remux') args.push('-c:v', 'copy');
    else args.push('-c:v', 'libx264', '-preset', (PRESETS[quality] || PRESETS.balanced)[0], '-tune', 'zerolatency', '-crf', (PRESETS[quality] || PRESETS.balanced)[1], '-pix_fmt', 'yuv420p', '-vf', "scale='min(1920,iw)':-2", '-g', '48');
  }
  if (a) args.push('-c:a', 'aac', '-aac_coder', 'fast', '-b:a', '192k', '-ac', '2');
  args.push('-avoid_negative_ts', 'make_zero', '-max_muxing_queue_size', '2048', '-flush_packets', '1', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset', 'pipe:1');
  return args;
}

/** HTTP handler for /transcode/<path>?start=&mode=&audio=&q= */
async function serveStream(req, res, file, q, cors) {
  const fail = (code, msg) => { res.writeHead(code, { ...cors, 'Content-Type': 'text/plain' }); res.end(msg); };
  if (!available()) return fail(501, 'Compatibility engine not installed');
  const opts = {
    start: Math.max(0, Number(q.get('start')) || 0),
    mode: q.get('mode') === 'remux' ? 'remux' : 'transcode',
    audio: q.get('audio') === null ? null : Number(q.get('audio')),
    quality: q.get('q') || 'balanced',
  };
  const info = await probe(file);
  if (!info) return fail(415, 'Unreadable media');
  if (req.method === 'HEAD') { res.writeHead(200, { ...cors, 'Content-Type': info.video ? 'video/mp4' : 'audio/mp4' }); return res.end(); }
  const key = `${file}|${opts.start}|${opts.mode}|${opts.audio}|${opts.quality}`;
  if (active.proc) killProc(active.proc);
  const proc = spawn(ffmpegPath, streamArgs(file, opts, info), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(proc);
  active = { key, proc };
  proc.stderr.on('data', () => {});
  proc.on('close', () => { procs.delete(proc); if (active.proc === proc) active = { key: '', proc: null }; });
  proc.on('error', () => { procs.delete(proc); if (!res.headersSent) fail(500, 'ffmpeg failed'); });
  res.on('close', () => killProc(proc));
  res.writeHead(200, { ...cors, 'Content-Type': info.video ? 'video/mp4' : 'audio/mp4', 'Cache-Control': 'no-store' });
  proc.stdout.pipe(res);
}

// ------------------------------------------------------------ thumbnails and subtitles

async function thumbnail(file, seconds) {
  if (!available()) return null;
  const info = await probe(file);
  if (!info || !info.video) return { thumb: null, duration: info ? info.duration : 0 };
  const t = seconds ?? Math.min(Math.max(info.duration * 0.1, 1), 60);
  const r = await run(['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-map', `0:${info.video.index}`, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', '-f', 'mjpeg', 'pipe:1'], { timeout: 20000, maxBytes: 4 * 1024 * 1024 });
  if (!r.stdout.length) return { thumb: null, duration: info.duration };
  return { thumb: `data:image/jpeg;base64,${r.stdout.toString('base64')}`, duration: info.duration };
}

async function subtitleText(file, index) {
  if (!available()) return null;
  const r = await run(['-hide_banner', '-loglevel', 'error', '-i', file, '-map', `0:${index}`, '-f', 'webvtt', 'pipe:1'], { timeout: 60000, maxBytes: 8 * 1024 * 1024 });
  const text = r.stdout.toString('utf8');
  return text.startsWith('WEBVTT') ? text : null;
}

module.exports = { available, probe, serveStream, thumbnail, subtitleText, killAll };
