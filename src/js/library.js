import { store, uid } from './store.js';
import { collator, baseName } from './ui.js';
import { knownDuration } from './thumbs.js';

const dirCache = new Map();

export async function listDir(dir) {
  const hit = dirCache.get(dir);
  if (hit && Date.now() - hit.t < 4000) return hit.v;
  const v = await window.native.list(dir, store.s.showHidden);
  dirCache.set(dir, { t: Date.now(), v });
  return v;
}
export const invalidate = () => dirCache.clear();

const sepOf = (p) => (p.includes('\\') ? '\\' : '/');
const norm = (p) => p.replace(/[\\/]+$/, '');
// Compare paths regardless of separator style or case (Windows and macOS are case-insensitive by default).
const cmp = (p) => norm(p).replace(/\\/g, '/').toLowerCase();
const isInside = (p, root) => { const a = cmp(p), b = cmp(root); return a === b || a.startsWith(b + '/'); };

/** Library folders that belong to a view ('video' or 'audio'). */
export const foldersFor = (kind) => store.state.folders.filter((f) => f.kind === 'both' || f.kind === kind);
export const rootFor = (dir) => store.state.folders.filter((f) => isInside(dir, f.path)).sort((a, b) => b.path.length - a.path.length)[0] || null;

export function crumbsFor(dir, rootLabel) {
  const root = rootFor(dir);
  const out = [{ name: rootLabel, path: null }];
  if (!root) {
    const parts = dir.split(/[\\/]/).filter(Boolean);
    let acc = dir.startsWith('/') ? '' : parts.shift();
    if (acc) out.push({ name: acc, path: acc + sepOf(dir) });
    for (const p of parts) { acc = acc === '' ? '/' + p : acc + sepOf(dir) + p; out.push({ name: p, path: acc }); }
    return out;
  }
  out.push({ name: root.name, path: root.path });
  const rel = norm(dir).slice(norm(root.path).length).split(/[\\/]/).filter(Boolean);
  let acc = norm(root.path);
  for (const p of rel) { acc += sepOf(dir) + p; out.push({ name: p, path: acc }); }
  return out;
}

export function addFolder(path, kind) {
  const exists = store.state.folders.find((f) => cmp(f.path) === cmp(path));
  store.update((s) => {
    if (exists) { const f = s.folders.find((x) => cmp(x.path) === cmp(path)); if (f.kind !== kind) f.kind = 'both'; }
    else s.folders.push({ id: uid(), path, name: baseName(path), kind });
  }, 'folders');
  invalidate();
}
export function removeFolder(id) { store.update((s) => { s.folders = s.folders.filter((f) => f.id !== id); }, 'folders'); }

const playedRank = (e) => { const i = store.state.recent.findIndex((r) => r.path === e.path); return i < 0 ? 1e9 : i; };

export function sortEntries(entries, { key, dir }) {
  const by = {
    name: (a, b) => collator.compare(a.name, b.name),
    mtime: (a, b) => a.mtime - b.mtime,
    size: (a, b) => (a.size || 0) - (b.size || 0),
    duration: (a, b) => (knownDuration(a.path) || 0) - (knownDuration(b.path) || 0),
    played: (a, b) => playedRank(a) - playedRank(b),
  }[key] || ((a, b) => collator.compare(a.name, b.name));
  return entries.slice().sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.type === 'dir' ? collator.compare(a.name, b.name) * (key === 'name' ? dir : 1) : by(a, b) * dir;
  });
}

/** Resume progress 0..1 for a local file, or 0. */
export function progressOf(path) {
  const r = store.state.resume[path];
  return r && r.d ? Math.min(1, r.t / r.d) : 0;
}
