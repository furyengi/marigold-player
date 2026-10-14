import { store } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { player } from './player.js';
import { h, ico, modal, showMenu, toast, fmtSize, fmtShort } from './ui.js';
import { REPO_URL, APP_NAME } from './brand.js';
import { audioTrackLabel } from './items.js';

export { REPO_URL, ACCENTS } from './brand.js';
export { openSettings, openShortcuts } from './settings.js';
export { openCustomize } from './customize.js';
export { openEffects, closeEffects } from './effects.js';
export { openOnboarding } from './onboarding.js';
export { openAddSubtitles, pickSubtitleTarget } from './subtitles.js';

// ------------------------------------------------------------ about

export async function openAbout() {
  const info = await window.native.info();
  const engine = await window.native.engine();
  return modal({
    title: 'About',
    width: 520,
    body: h('div.dlg-body', { style: { textAlign: 'center', paddingTop: '10px' } },
      h('img', { src: '../assets/logo.svg', width: 72, height: 72, alt: '' }),
      h('h2', { style: { margin: '14px 0 4px', fontWeight: 500 } }, APP_NAME),
      h('div', { style: { color: 'var(--fg-3)', fontSize: '13px', marginBottom: '16px' } }, `Version ${info.version}`),
      h('p.dlg-note', null, 'A calm, orange-accented media player for your videos and music, built with Electron.'),
      h('p.dlg-note', null, engine
        ? 'Formats the built-in player cannot decode are converted on the fly with FFmpeg (GPL build, bundled as a separate program). FFmpeg is a trademark of Fabrice Bellard; source code is available from ffmpeg.org.'
        : 'The compatibility engine (FFmpeg) is not available in this build, so only formats supported by Chromium will play.'),
      h('p.dlg-note', null, 'Marigold Player is an independent project. It is not affiliated with or endorsed by VideoLAN or the VLC project. Its interface is inspired by a community redesign concept shared on Figma.'),
      h('button.btn', { onclick: () => window.native.external(REPO_URL) }, ico('external', 16), 'Project page'),
    ),
  });
}

// ------------------------------------------------------------ subtitles menu

export function openSubtitleMenu(anchor) {
  const loaded = player.subs;
  const external = loaded.map((s, i) => ({ s, i })).filter((x) => x.s.embeddedIndex === undefined);
  const embedded = player.embeddedSubs;
  showMenu(anchor, [
    { heading: 'Subtitles' },
    { label: 'Off', checked: player.subIndex < 0, onClick: () => P.setSubtitle(-1) },
    ...external.map(({ s, i }) => ({ label: s.label, checked: player.subIndex === i, onClick: () => P.setSubtitle(i) })),
    embedded.length && { sep: true },
    embedded.length && { heading: 'Inside this file' },
    ...embedded.map((s) => {
      const at = loaded.findIndex((x) => x.embeddedIndex === s.index);
      return { label: P.embeddedLabel(s) + (s.text ? '' : ' (image-based)'), disabled: !s.text, checked: at >= 0 && player.subIndex === at, onClick: () => P.enableEmbeddedSub(s) };
    }),
    { sep: true },
    { label: 'Add subtitle file…', icon: 'plus', disabled: !player.current, onClick: async () => { const files = await window.native.pickFiles('subtitles'); let ok = 0; for (const f of files) if (await P.addSubtitle(f, ok === 0)) ok++; if (files.length && !ok) toast("Couldn't read that subtitle file"); } },
    { label: 'Add subtitles to a folder or playlist…', icon: 'subtitles', onClick: () => import('./subtitles.js').then((m) => m.pickSubtitleTarget(anchor)) },
  ], { align: 'end' });
}

// ------------------------------------------------------------ network stream

export function openNetwork() {
  const input = h('input.input', { placeholder: 'https://example.com/video.mp4', spellcheck: 'false' });
  const err = h('div', { style: { color: 'var(--danger)', fontSize: '12.5px', minHeight: '18px' } });
  const go = () => {
    const url = input.value.trim();
    let u;
    try { u = new URL(url); } catch { err.textContent = 'That doesn’t look like a web address.'; return; }
    if (!/^https?:$/.test(u.protocol)) { err.textContent = 'Only http and https links are supported.'; return; }
    const item = P.streamItem(url);
    store.update((s) => { s.streams = [{ url, name: item.name }, ...s.streams.filter((x) => x.url !== url)].slice(0, 30); }, 'streams');
    m.close();
    P.play([item], 0);
    router.go({ view: 'player' });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const m = modal({
    title: 'Open network stream',
    width: 560,
    body: h('div.dlg-body', null,
      h('p.dlg-note', null, 'Enter the address of a video or audio file on the web. Direct links to MP4, WebM, MP3, OGG and similar files work; HLS and DASH playlists do not yet.'),
      h('div.field', null, h('label', null, 'Network URL'), input), err),
    footer: h('div.dlg-foot', null, h('button.btn.ghost', { onclick: () => m.close() }, 'Cancel'), h('button.btn.primary', { onclick: go }, 'Play')),
  });
  setTimeout(() => input.focus(), 30);
  navigator.clipboard.readText().then((t) => { if (/^https?:\/\//i.test(t) && !input.value) { input.value = t.trim(); input.select(); } }).catch(() => {});
}

// ------------------------------------------------------------ properties

export async function openProperties(entry) {
  const meta = entry.kind === 'audio' && entry.path ? await window.native.meta(entry.path) : null;
  const info = entry.path ? await window.native.probe(entry.path) : null;
  const v = info && info.video;
  const rows = [
    ['Name', entry.name],
    ['Type', entry.kind === 'audio' ? 'Audio' : 'Video'],
    entry.size ? ['Size', fmtSize(entry.size)] : null,
    entry.mtime ? ['Modified', new Date(entry.mtime).toLocaleString()] : null,
    (info && info.duration) || (meta && meta.duration) ? ['Duration', fmtShort((info && info.duration) || meta.duration)] : null,
    info ? ['Container', info.container.split(',')[0]] : null,
    v ? ['Video', `${v.codec.toUpperCase()}${v.profile ? ` (${v.profile})` : ''}, ${v.width}×${v.height}${v.fps ? `, ${v.fps} fps` : ''}`] : null,
    info && info.audios.length ? ['Audio', info.audios.map((a, i) => audioTrackLabel(a, i)).join('\n')] : null,
    info && info.subs.length ? ['Subtitles', info.subs.map((s) => P.embeddedLabel(s)).join('\n')] : null,
    info ? ['Playback', info.plan.mode === 'direct' ? 'Direct' : `Converted on the fly (${info.plan.reason})`] : null,
    meta && meta.title ? ['Title', meta.title] : null,
    meta && meta.artist ? ['Artist', meta.artist] : null,
    meta && meta.album ? ['Album', meta.album] : null,
    ['Location', entry.path || entry.url],
  ].filter(Boolean);
  return modal({
    title: 'Properties',
    width: 600,
    body: h('div.dlg-body', null, ...rows.map(([k, val]) => h('div.set-row', { style: { alignItems: 'flex-start' } }, h('div', { style: { width: '90px', flex: 'none', color: 'var(--fg-3)' } }, k), h('div', { style: { flex: 1, wordBreak: 'break-all', color: 'var(--fg)', whiteSpace: 'pre-line' } }, val)))),
  });
}
