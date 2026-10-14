import { store } from './store.js';
import * as P from './player.js';
import { player } from './player.js';
import { h, clear, modal, select, toast, showMenu, baseName, stripExt } from './ui.js';
import { ico } from './ui.js';

const norm = (s) => stripExt(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Season/episode key such as 1x05 from "S01E05", "1x05" or "Episode 5". */
function episodeKey(name) {
  const n = stripExt(name);
  let m = /s(\d{1,2})\s*[ ._-]?\s*e(\d{1,3})/i.exec(n);
  if (m) return `${Number(m[1])}x${Number(m[2])}`;
  m = /\b(\d{1,2})x(\d{2,3})\b/i.exec(n);
  if (m) return `${Number(m[1])}x${Number(m[2])}`;
  m = /(?:^|[^a-z])(?:e|ep|episode)[ ._-]?(\d{1,3})(?:[^0-9]|$)/i.exec(n);
  if (m) return `1x${Number(m[1])}`;
  return null;
}

/** Pair each media file with its most likely subtitle file. Returns an array of subtitle indexes (or -1). */
export function matchSubtitles(media, subs) {
  const result = media.map(() => -1);
  const used = new Set();
  const take = (i, j) => { result[i] = j; used.add(j); };
  // 1. same base name
  media.forEach((m, i) => {
    const mn = norm(m.name);
    const j = subs.findIndex((s, k) => !used.has(k) && (norm(s.name) === mn || norm(s.name).startsWith(mn)));
    if (j >= 0) take(i, j);
  });
  // 2. same season/episode
  media.forEach((m, i) => {
    if (result[i] >= 0) return;
    const key = episodeKey(m.name);
    if (!key) return;
    const j = subs.findIndex((s, k) => !used.has(k) && episodeKey(s.name) === key);
    if (j >= 0) take(i, j);
  });
  // 3. equal counts: pair by order
  const free = media.map((_, i) => i).filter((i) => result[i] < 0);
  const freeSubs = subs.map((_, j) => j).filter((j) => !used.has(j));
  if (free.length && free.length === freeSubs.length) free.forEach((i, n) => take(i, freeSubs[n]));
  return result;
}

/**
 * Dialog for attaching subtitle files to many videos at once (a folder, a playlist or the queue).
 * `items` are { path, name } media entries.
 */
export function openAddSubtitles({ title = 'Add subtitles', items, startDir }) {
  const media = items.filter((i) => i.path);
  if (!media.length) { toast('Nothing to attach subtitles to'); return null; }
  let subs = [];
  let picks = media.map(() => -1);
  const table = h('div.sub-table');
  const summary = h('p.dlg-note', null, '');

  const rematch = () => { picks = matchSubtitles(media, subs); draw(); };
  async function addFiles() {
    const files = await window.native.pickFiles('subtitles');
    if (!files.length) return;
    for (const f of files) if (!subs.some((s) => s.path === f)) subs.push({ path: f, name: baseName(f) });
    rematch();
  }
  async function addFolder() {
    const dir = await window.native.pickFolder();
    if (!dir) return;
    const files = await window.native.listSubs(dir);
    if (!files.length) { toast('No subtitle files in that folder'); return; }
    for (const f of files) if (!subs.some((s) => s.path === f)) subs.push({ path: f, name: baseName(f) });
    rematch();
  }

  function draw() {
    clear(table);
    const matched = picks.filter((p) => p >= 0).length;
    summary.textContent = subs.length ? `${subs.length} subtitle file${subs.length === 1 ? '' : 's'} found, ${matched} of ${media.length} videos matched. Adjust any pairing below.` : 'Choose the subtitle files (or the folder that holds them) and they will be matched to your videos by name or episode number.';
    media.forEach((m, i) => {
      const opts = [[-1, 'No subtitles'], ...subs.map((s, j) => [j, s.name])];
      table.append(h('div.sub-row', null,
        h('span.sub-media', { title: m.path }, ico('video', 18), stripExt(m.name)),
        select(opts, picks[i], (v) => { picks[i] = Number(v); })));
    });
  }
  draw();

  const apply = () => {
    let n = 0;
    store.update((s) => {
      media.forEach((m, i) => {
        if (picks[i] >= 0) { s.subMap[m.path] = [subs[picks[i]].path]; n++; } else delete s.subMap[m.path];
      });
    }, 'subMap');
    toast(`Subtitles attached to ${n} video${n === 1 ? '' : 's'}`);
    // If one of them is playing right now, show the subtitle straight away.
    const cur = player.current;
    const idx = cur ? media.findIndex((m) => m.path === cur.path) : -1;
    if (idx >= 0 && picks[idx] >= 0) P.addSubtitle(subs[picks[idx]].path, true);
    m.close();
  };

  const m = modal({
    title,
    width: 820,
    body: h('div.dlg-body', null,
      summary,
      h('div', { style: { display: 'flex', gap: '10px', marginBottom: '12px' } },
        h('button.btn', { onclick: addFiles }, 'Choose subtitle files…'),
        h('button.btn', { onclick: addFolder }, 'Choose subtitle folder…'),
        h('button.btn.ghost', { onclick: () => { subs = []; picks = media.map(() => -1); draw(); } }, 'Clear')),
      table),
    footer: h('div.dlg-foot', null, h('button.btn.ghost', { onclick: () => m.close() }, 'Cancel'), h('button.btn.primary', { onclick: apply }, 'Apply')),
  });
  return m;
}

/** Let the user choose what to attach subtitles to: the queue, a library folder or a playlist. */
export async function pickSubtitleTarget(anchor) {
  const entries = [];
  if (player.queue.length) entries.push({ label: `Current queue (${player.queue.length})`, icon: 'queue', onClick: () => openAddSubtitles({ title: 'Add subtitles to the queue', items: player.queue.filter((q) => q.path) }) });
  for (const f of store.state.folders.filter((x) => x.kind !== 'audio')) {
    entries.push({ label: `Folder: ${f.name}`, icon: 'folder', onClick: async () => { const files = await window.native.expand([f.path]); openAddSubtitles({ title: `Add subtitles to ${f.name}`, items: files.filter((x) => x.kind === 'video') }); } });
  }
  for (const p of store.state.playlists) {
    entries.push({ label: `Playlist: ${p.name}`, icon: 'playlist', onClick: () => openAddSubtitles({ title: `Add subtitles to ${p.name}`, items: p.items.filter((x) => x.path) }) });
  }
  entries.push({ sep: true }, { label: 'Another folder…', icon: 'plus', onClick: async () => { const d = await window.native.pickFolder(); if (!d) return; const files = await window.native.expand([d]); openAddSubtitles({ title: `Add subtitles to ${baseName(d)}`, items: files.filter((x) => x.kind === 'video') }); } });
  showMenu(anchor || { x: innerWidth / 2 - 100, y: innerHeight / 3 }, entries);
}
