import { store } from './store.js';

const cache = new Map(); // path -> { promise, duration }
const waiting = [];
let running = 0;

// Containers the browser engine reads itself; everything else goes straight to the compatibility engine.
const NATIVE_EXT = new Set(['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv']);

// ------------------------------------------------------------ persistent cache (IndexedDB)

let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('marigold-thumbs', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('t');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const store_ = d.transaction('t', mode).objectStore('t');
      const req = fn(store_);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
};
const keyOf = (e) => `${e.path}|${e.mtime || 0}|${e.size || 0}`;
export const clearThumbCache = () => tx('readwrite', (s) => s.clear());

// ------------------------------------------------------------ queue

/** Resolve a thumbnail data URL (and duration) for a local video, or an embedded cover for audio. */
export function getThumb(entry) {
  const hit = cache.get(entry.path);
  if (hit && hit.promise) return hit.promise;
  const promise = new Promise((resolve) => {
    waiting.push({ entry, resolve });
    pump();
  });
  cache.set(entry.path, { promise });
  return promise;
}

export const knownDuration = (path) => { const c = cache.get(path); return c && c.duration; };
export function rememberDuration(path, d) { const c = cache.get(path) || {}; c.duration = d; cache.set(path, c); }

function pump() {
  const max = Math.max(1, Math.min(4, store.s.thumbWorkers || 2));
  while (running < max && waiting.length) {
    const job = waiting.shift();
    running++;
    work(job.entry).then((r) => job.resolve(r)).finally(() => { running--; pump(); });
  }
}

async function work(entry) {
  if (entry.kind === 'audio') {
    const m = await window.native.meta(entry.path);
    if (m && m.duration) rememberDuration(entry.path, m.duration);
    return { thumb: m && m.cover, meta: m, duration: m && m.duration };
  }
  if (!store.s.thumbs) return { thumb: null };

  const useCache = store.s.thumbCache && entry.mtime;
  if (useCache) {
    const hit = await tx('readonly', (s) => s.get(keyOf(entry)));
    if (hit && hit.thumb) { if (hit.duration) rememberDuration(entry.path, hit.duration); return hit; }
  }
  const ext = (entry.path.split('.').pop() || '').toLowerCase();
  let result = null;
  if (NATIVE_EXT.has(ext)) result = await videoElementThumb(entry);
  if ((!result || !result.thumb) && store.s.compat) {
    const r = await window.native.thumb(entry.path);
    if (r) { if (r.duration) rememberDuration(entry.path, r.duration); result = { thumb: r.thumb, duration: r.duration }; }
  }
  result = result || { thumb: null };
  if (useCache && result.thumb) tx('readwrite', (s) => s.put(result, keyOf(entry)));
  return result;
}

function videoElementThumb(entry) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.crossOrigin = 'anonymous';
    let settled = false;
    const done = (r) => { if (settled) return; settled = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(r); };
    const timer = setTimeout(() => done(null), 8000);
    v.addEventListener('error', () => done(null));
    v.addEventListener('loadedmetadata', () => {
      rememberDuration(entry.path, v.duration);
      v.currentTime = Math.min(Math.max(v.duration * 0.1, 1), 60);
    });
    const grab = () => {
      try {
        const c = document.createElement('canvas');
        const w = 320;
        c.width = w;
        c.height = Math.round((w * v.videoHeight) / v.videoWidth) || 180;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(v, 0, 0, c.width, c.height);
        // A completely black frame usually means the picture was not painted yet or could not be decoded.
        const px = g.getImageData(0, 0, c.width, c.height).data;
        let lum = 0;
        for (let i = 0; i < px.length; i += 4 * 97) lum += px[i] + px[i + 1] + px[i + 2];
        if (lum < 12) return done(null);
        done({ thumb: c.toDataURL('image/jpeg', 0.72), duration: v.duration });
      } catch { done(null); }
    };
    v.addEventListener('seeked', () => {
      // Wait until the frame has actually been presented before copying it.
      if ('requestVideoFrameCallback' in v) { v.requestVideoFrameCallback(() => grab()); setTimeout(grab, 700); } else setTimeout(grab, 200);
    });
    v.src = window.native.mediaUrl(entry.path);
  });
}
