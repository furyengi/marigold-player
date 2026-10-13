import { store } from './store.js';

const cache = new Map(); // path -> { thumb, duration }
const waiting = [];
let running = 0;
const MAX = 2;

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
  while (running < MAX && waiting.length) {
    const job = waiting.shift();
    running++;
    work(job.entry).then((r) => { job.resolve(r); }).finally(() => { running--; pump(); });
  }
}

async function work(entry) {
  if (entry.kind === 'audio') {
    const m = await window.vlc.meta(entry.path);
    if (m && m.duration) rememberDuration(entry.path, m.duration);
    return { thumb: m && m.cover, meta: m, duration: m && m.duration };
  }
  if (!store.s.thumbs) return { thumb: null };
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.crossOrigin = 'anonymous';
    let settled = false;
    const done = (r) => { if (settled) return; settled = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(r); };
    const timer = setTimeout(() => done({ thumb: null }), 8000);
    v.addEventListener('error', () => done({ thumb: null }));
    v.addEventListener('loadedmetadata', () => {
      rememberDuration(entry.path, v.duration);
      v.currentTime = Math.min(Math.max(v.duration * 0.1, 1), 60);
    });
    v.addEventListener('seeked', () => {
      try {
        const c = document.createElement('canvas');
        const w = 320;
        c.width = w;
        c.height = Math.round((w * v.videoHeight) / v.videoWidth) || 180;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        done({ thumb: c.toDataURL('image/jpeg', 0.72), duration: v.duration });
      } catch { done({ thumb: null, duration: v.duration }); }
    });
    v.src = window.vlc.mediaUrl(entry.path);
  });
}
