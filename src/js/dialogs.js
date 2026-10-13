import { store } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { player } from './player.js';
import * as A from './audio.js';
import { addFolder, removeFolder } from './library.js';
import { h, clear, ico, iconButton, modal, topModal, showMenu, closeMenu, toggle, segmented, select, range, confirmBox, toast, fmtSize, fmtTime, fmtShort, baseName, $ } from './ui.js';
import { icon } from './icons.js';
import { EXTRAS } from './extras.js';
import { addFolderFlow } from './actions.js';

export const REPO_URL = 'https://github.com/furyengi/vlc-redesign';
export const ACCENTS = ['#d37918', '#b94a35', '#a08a1f', '#2f9a3f', '#2a9bb5', '#2f62c4', '#7a3fc9', '#c23f8b', '#8a8a8a'];

const row = (label, control, hint) => h('div.set-row', null, h('div', null, label, hint && h('span.hint', null, hint)), h('div.ctl-slot', null, control));

// ------------------------------------------------------------ settings

function sections(rerender, dlgState) {
  const s = store.s;
  const set = (k) => (v) => store.update((st) => { st.settings[k] = v; }, 'settings');
  const swatches = (cur, onPick) => {
    const el = h('div.swatches');
    const draw = (v) => { clear(el); for (const c of ACCENTS) el.append(h('button.swatch' + (c === v ? '.on' : ''), { title: c, style: { background: c }, onclick: () => { onPick(c); draw(c); } })); };
    draw(cur);
    return el;
  };
  return {
    General: {
      icon: 'sliders', group: 'App',
      blocks: [
        { title: 'Appearance', rows: [
          { label: 'Theme', build: () => segmented([['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], s.theme, set('theme')) },
          { label: 'Accent color', build: () => swatches(s.accent, set('accent')) },
        ] },
        { title: 'Startup', rows: [
          { label: 'Open on', hint: 'The view shown when the app starts', build: () => select([['home', 'Home'], ['videos', 'Videos'], ['music', 'Music'], ['playlists', 'Playlists'], ['recent', 'Recent']], s.startView, set('startView')) },
        ] },
        { title: 'Reset', rows: [
          { label: 'Reset everything', hint: 'Settings, library folders, playlists and history', build: () => h('button.btn', { style: { color: 'var(--danger)' }, onclick: async () => { if (await confirmBox('Reset VLC Redesign', 'This clears your settings, library folders, playlists, history and saved positions.', 'Reset', true)) { store.reset(); location.reload(); } } }, 'Reset…') },
        ] },
      ],
    },
    Interface: {
      icon: 'cursor', group: 'App',
      blocks: [
        { title: 'Library', rows: [
          { label: 'Show video thumbnails', hint: 'Generated from the file while you browse', build: () => toggle(s.thumbs, set('thumbs')) },
        ] },
        { title: 'Player', rows: [
          { label: 'Show the queue sidebar', build: () => toggle(store.state.player.sidebar, (v) => store.update((st) => { st.player.sidebar = v; }, 'player')) },
          { label: 'Hide controls in fullscreen after', build: () => select([[1.5, '1.5 s'], [2.5, '2.5 s'], [4, '4 s'], [6, '6 s']], s.idleHide, (v) => set('idleHide')(Number(v))) },
          { label: 'Mouse wheel changes volume', build: () => toggle(s.wheelVolume, set('wheelVolume')) },
        ] },
      ],
    },
    Privacy: {
      icon: 'shield', group: 'App',
      blocks: [
        { title: 'History', rows: [
          { label: 'Remember what I played', hint: 'Powers Recent and Home', build: () => toggle(s.saveHistory, set('saveHistory')) },
          { label: 'Clear history', build: () => h('button.btn', { onclick: () => { store.update((st) => { st.recent = []; }, 'recent'); toast('History cleared'); } }, 'Clear') },
          { label: 'Remember playback position', hint: 'Resume long videos where you left off', build: () => toggle(s.resume, set('resume')) },
          { label: 'Forget saved positions', build: () => h('button.btn', { onclick: () => { store.update((st) => { st.resume = {}; }, 'resume'); toast('Saved positions cleared'); } }, 'Forget') },
        ] },
      ],
    },
    Controls: {
      icon: 'keyboard', group: 'App',
      blocks: [
        { title: 'Keyboard & buttons', rows: [
          { label: 'Skip step', hint: 'Used by the arrow keys and the skip buttons', build: () => select([[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']], s.skipStep, (v) => set('skipStep')(Number(v))) },
          { label: 'Customize player buttons', build: () => h('button.btn', { onclick: openCustomize }, 'Customize…') },
          { label: 'Keyboard shortcuts', build: () => h('button.btn', { onclick: openShortcuts }, 'View') },
        ] },
      ],
    },
    Playback: {
      icon: 'play', group: 'Media',
      blocks: [
        { title: 'Playback', rows: [
          { label: 'Play next item automatically', build: () => toggle(s.autoNext, set('autoNext')) },
          { label: 'Repeat', build: () => select([['off', 'Off'], ['all', 'All'], ['one', 'One']], store.state.player.repeat, (v) => store.update((st) => { st.player.repeat = v; }, 'player')) },
          { label: 'Shuffle', build: () => toggle(store.state.player.shuffle, (v) => { if (v !== store.state.player.shuffle) P.toggleShuffle(); }) },
          { label: 'Default speed', build: () => select(P.rateOptions.map((r) => [r, r === 1 ? 'Normal' : `${r}×`]), s.defaultRate, (v) => { set('defaultRate')(Number(v)); P.setRate(Number(v)); }) },
        ] },
      ],
    },
    Video: {
      icon: 'film', group: 'Media',
      blocks: [
        { title: 'Picture', rows: [
          { label: 'Aspect ratio', build: () => select([['contain', 'Fit to window'], ['cover', 'Fill (crop edges)'], ['fill', 'Stretch']], store.state.video.fit, (v) => { store.update((st) => { st.video.fit = v; }, 'video'); A.applyVideoFx(...[...document.querySelectorAll('#mediaSlot video')]); }) },
          { label: 'Adjust colors and filters', hint: 'Brightness, contrast, saturation and hue', build: (_, ctx) => h('button.btn', { onclick: (e) => { topModal().close(); openEffects(null, 'video'); } }, 'Open…') },
        ] },
      ],
    },
    Audio: {
      icon: 'equalizer', group: 'Media',
      blocks: [
        { title: 'Output', rows: [
          { label: 'Volume', build: () => range({ min: 0, max: 100, value: Math.round(store.state.audio.volume * 100), onInput: (v) => P.setVolume(v / 100) }) },
          { label: 'Equalizer', hint: 'Ten bands with presets', build: () => h('button.btn', { onclick: () => { topModal().close(); openEffects(null, 'audio'); } }, 'Open…') },
        ] },
      ],
    },
    Subtitles: {
      icon: 'subtitles', group: 'Media',
      blocks: [
        { title: 'Subtitles', rows: [
          { label: 'Load matching subtitle files automatically', hint: '.srt, .vtt and .ass files that share the video’s name', build: () => toggle(s.autoSubs, set('autoSubs')) },
          { label: 'Text size', build: () => range({ min: 16, max: 56, value: s.subSize, onInput: set('subSize') }) },
          { label: 'Background opacity', build: () => range({ min: 0, max: 100, value: s.subBg, onInput: set('subBg') }) },
          { label: 'Text color', build: () => { const el = h('div.swatches'); const cols = ['#ffffff', '#ffe066', '#7ee3ff', '#9dff8a']; const draw = (v) => { clear(el); for (const c of cols) el.append(h('button.swatch' + (c === v ? '.on' : ''), { style: { background: c }, onclick: () => { set('subColor')(c); draw(c); } })); }; draw(s.subColor); return el; } },
        ] },
      ],
    },
    Library: {
      icon: 'library', group: 'Media',
      blocks: [
        { title: 'Media folders', rows: [
          { label: '', full: true, build: () => {
            const wrap = h('div', { style: { width: '100%' } });
            const draw = () => {
              clear(wrap);
              const list = h('div.folder-list');
              if (!store.state.folders.length) list.append(h('div.none', null, 'No folders yet.'));
              for (const f of store.state.folders) list.append(h('div.folder-row', null, ico(f.kind === 'audio' ? 'music' : 'folder', 18), h('span', { title: f.path }, f.path), h('span', { style: { flex: 'none', color: 'var(--fg-3)', fontSize: '12px' } }, f.kind === 'audio' ? 'Music' : f.kind === 'both' ? 'Both' : 'Videos'), iconButton('trash', { title: 'Remove', size: 16, onclick: () => { removeFolder(f.id); draw(); } })));
              wrap.append(list, h('div', { style: { display: 'flex', gap: '10px' } }, h('button.btn', { onclick: async () => { await addFolderFlow('video'); draw(); } }, 'Add video folder…'), h('button.btn', { onclick: async () => { await addFolderFlow('audio'); draw(); } }, 'Add music folder…')));
            };
            draw();
            return wrap;
          } },
        ] },
      ],
    },
  };
}

export function openSettings(initial = 'General') {
  let cat = initial;
  let query = '';
  const body = h('div.set-body');
  const cats = h('div.set-cats');
  const search = h('div.search', { html: icon('search', 18) });
  const input = h('input', { placeholder: 'Search', spellcheck: 'false', oninput: () => { query = input.value.trim().toLowerCase(); drawBody(); drawCats(); } });
  search.append(input);

  const data = () => sections();
  function drawCats() {
    clear(cats);
    let lastGroup = '';
    for (const [name, c] of Object.entries(data())) {
      if (c.group !== lastGroup) { cats.append(h('div.cat-label', null, c.group)); lastGroup = c.group; }
      cats.append(h('button.cat' + (!query && name === cat ? '.active' : ''), { onclick: () => { cat = name; query = ''; input.value = ''; drawBody(); drawCats(); } }, ico(c.icon, 20), name));
    }
  }
  function drawBody() {
    clear(body);
    body.scrollTop = 0;
    const d = data();
    if (query) {
      let n = 0;
      for (const [name, c] of Object.entries(d)) for (const b of c.blocks) {
        const hits = b.rows.filter((r) => (r.label + ' ' + (r.hint || '') + ' ' + b.title).toLowerCase().includes(query));
        if (!hits.length) continue;
        n++;
        body.append(h('h3', null, `${name} · ${b.title}`), ...hits.map((r) => row(r.label, r.build(), r.hint)));
      }
      if (!n) body.append(h('div.none', { style: { marginTop: '24px' } }, 'No settings match your search.'));
      return;
    }
    for (const b of d[cat].blocks) {
      body.append(h('h3', null, b.title));
      for (const r of b.rows) body.append(r.full ? r.build() : row(r.label, r.build(), r.hint));
    }
  }
  const m = modal({
    title: 'Settings',
    className: 'settings',
    head: false,
    body: h('div', { style: { display: 'flex', flex: 1, minHeight: 0 } },
      h('div.set-side', null, search, cats),
      h('div.set-main', null, h('div.dlg-head', null, h('h2', null, 'Settings'), iconButton('close', { title: 'Close', onclick: () => m.close() })), body)),
  });
  drawCats();
  drawBody();
  return m;
}

// ------------------------------------------------------------ shortcuts

const SHORTCUTS = [
  ['Playback', [['Play / pause', ['Space']], ['Next / previous', ['N', 'P']], ['Seek back / forward', ['←', '→']], ['Seek 1 minute', ['Shift', '← →']], ['Slower / faster', ['[', ']']], ['Normal speed', ['=']], ['Stop', ['S']]]],
  ['Audio & video', [['Volume up / down', ['↑', '↓']], ['Mute', ['M']], ['Fullscreen', ['F']], ['Exit fullscreen / back', ['Esc']], ['Snapshot', ['Shift', 'S']], ['Toggle subtitles', ['V']]]],
  ['App', [['Open files', ['Ctrl', 'O']], ['Open folder', ['Ctrl', 'Shift', 'O']], ['Open network stream', ['Ctrl', 'N']], ['Queue sidebar', ['Q']], ['Settings', ['Ctrl', ',']], ['Keyboard shortcuts', ['F1']]]],
];
export function openShortcuts() {
  const grid = h('div.kb-grid');
  const cols = [h('div'), h('div')];
  SHORTCUTS.forEach(([title, rows], i) => {
    cols[i === 0 ? 0 : 1].append(h('div.kb-group', null, h('h4', null, title), ...rows.map(([l, keys]) => h('div.kb-row', null, h('span', null, l), h('span', null, keys.map((k) => h('kbd', null, k)))))));
  });
  grid.append(...cols);
  return modal({ title: 'Keyboard shortcuts', width: 760, body: h('div.dlg-body', null, grid) });
}

// ------------------------------------------------------------ about

export async function openAbout() {
  const info = await window.vlc.info();
  return modal({
    title: 'About',
    width: 480,
    body: h('div.dlg-body', { style: { textAlign: 'center', paddingTop: '10px' } },
      h('img', { src: '../assets/cone.svg', width: 72, height: 72, alt: '' }),
      h('h2', { style: { margin: '14px 0 4px', fontWeight: 500 } }, 'VLC Redesign'),
      h('div', { style: { color: 'var(--fg-3)', fontSize: '13px', marginBottom: '16px' } }, `Version ${info.version}`),
      h('p.dlg-note', null, 'A community redesign of the VLC interface, playing your media with the Chromium engine built into Electron.'),
      h('p.dlg-note', null, 'This is an unofficial fan project and is not affiliated with or endorsed by VideoLAN. “VLC” and the traffic-cone logo are trademarks of VideoLAN. The interface follows the “VLC Redesign (Community)” design on Figma.'),
      h('button.btn', { onclick: () => window.vlc.external(REPO_URL) }, ico('external', 16), 'Project page'),
    ),
  });
}

// ------------------------------------------------------------ customize player

export function openCustomize() {
  const chosen = new Set(store.state.player.controls);
  const grid = h('div.cust-grid');
  const draw = () => {
    clear(grid);
    for (const x of EXTRAS) {
      grid.append(h('button.cust-item' + (chosen.has(x.id) ? '.on' : ''), { onclick: () => { chosen.has(x.id) ? chosen.delete(x.id) : chosen.add(x.id); draw(); } }, h('span', { html: x.icon() }), x.label));
    }
  };
  draw();
  const m = modal({
    title: 'Customize player',
    width: 640,
    body: h('div.dlg-body', null, h('p.dlg-note', null, 'Choose the extra buttons that appear next to the volume control.'), grid),
    footer: h('div.dlg-foot', null, h('button.btn.ghost', { onclick: () => m.close() }, 'Cancel'), h('button.btn.primary', { onclick: () => { store.update((s) => { s.player.controls = EXTRAS.map((x) => x.id).filter((id) => chosen.has(id)); }, 'player'); m.close(); } }, 'Save')),
  });
}

// ------------------------------------------------------------ effects (equalizer + video)

let fxPanel = null;
let fxTab = 'audio';
export function closeEffects() { if (fxPanel) { fxPanel.remove(); fxPanel = null; document.removeEventListener('pointerdown', fxOutside, true); document.removeEventListener('keydown', fxKey, true); } }
const fxOutside = (e) => { if (fxPanel && !fxPanel.contains(e.target) && !e.target.closest('.popover, .backdrop')) closeEffects(); };
const fxKey = (e) => { if (e.key === 'Escape') { closeEffects(); e.stopPropagation(); } };

export function openEffects(anchor, tab) {
  if (fxPanel && !tab) { closeEffects(); return; }
  closeEffects();
  closeMenu();
  if (tab) fxTab = tab;
  const panel = h('div.fx');
  const draw = () => {
    clear(panel);
    const tabs = h('div.fx-tabs', null,
      h('button' + (fxTab === 'audio' ? '.on' : ''), { onclick: () => { fxTab = 'audio'; draw(); } }, 'Audio'),
      h('button' + (fxTab === 'video' ? '.on' : ''), { onclick: () => { fxTab = 'video'; draw(); } }, 'Video'),
      h('span', { style: { flex: 1 } }),
      iconButton('close', { title: 'Close', size: 18, onclick: closeEffects }));
    panel.append(tabs, fxTab === 'audio' ? audioTab(draw) : videoTab(draw));
  };
  draw();
  document.body.append(panel);
  const r = anchor ? anchor.getBoundingClientRect() : { right: innerWidth - 20 };
  panel.style.right = Math.max(10, innerWidth - r.right - 8) + 'px';
  panel.style.bottom = '64px';
  fxPanel = panel;
  setTimeout(() => { document.addEventListener('pointerdown', fxOutside, true); document.addEventListener('keydown', fxKey, true); });
}

function audioTab(redraw) {
  const a = store.state.audio;
  const body = h('div.fx-body');
  let out;
  let out2;
  const presets = Object.keys(A.EQ_PRESETS);
  if (a.preset === 'Custom') presets.push('Custom');
  body.append(h('div.fx-top', null,
    select(presets.map((p) => [p, p]), a.preset, (v) => { A.setPreset(v); redraw(); }),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg-2)', fontSize: '13px' } }, 'Equalizer', toggle(a.eqOn, (v) => A.setEqOn(v)))));
  const bands = h('div.eq-bands');
  A.EQ_FREQS.forEach((f, i) => {
    const inp = h('input', { type: 'range', min: -12, max: 12, step: 0.5, value: a.eq[i], title: `${a.eq[i]} dB`, oninput: (e) => { A.setEqBand(i, Number(e.target.value)); e.target.title = `${e.target.value} dB`; } });
    inp.setAttribute('orient', 'vertical');
    bands.append(h('div.eq-band', null, inp, f >= 1000 ? `${f / 1000}k` : f));
  });
  body.append(bands);
  body.append(fxRow('Preamp', range({ min: -12, max: 12, step: 0.5, value: a.preamp, onInput: (v) => { A.setPreamp(v); out.textContent = `${v} dB`; } }), `${a.preamp} dB`, (o) => (out = o)));
  body.append(fxRow('Speed', range({ min: 0.25, max: 3, step: 0.05, value: player.rate, onInput: (v) => { P.setRate(Math.round(v * 100) / 100); out2.textContent = `${Math.round(v * 100) / 100}×`; } }), `${player.rate}×`, (o) => (out2 = o)));
  if (player.current && player.current.remote) body.append(h('p.dlg-note', { style: { margin: '10px 0 0' } }, 'The equalizer only works on local files; network streams play unprocessed.'));
  return body;
}

function fxRow(label, input, text, grab) {
  const o = h('output', null, text);
  grab(o);
  return h('div.fx-row', null, h('span', null, label), input, o);
}

function videoTab(redraw) {
  const v = store.state.video;
  const body = h('div.fx-body');
  const apply = () => A.applyVideoFx(...document.querySelectorAll('#mediaSlot video'));
  const slider = (label, key, min, max, unit = '%') => {
    let o;
    const r = range({ min, max, value: v[key], onInput: (val) => { store.update((s) => { s.video[key] = val; }, 'video'); apply(); o.textContent = val + unit; } });
    return fxRow(label, r, v[key] + unit, (x) => (o = x));
  };
  body.append(slider('Brightness', 'brightness', 40, 180), slider('Contrast', 'contrast', 40, 180), slider('Saturation', 'saturation', 0, 220), slider('Hue', 'hue', -180, 180, '°'));
  body.append(h('div.fx-row', null, h('span', null, 'Aspect'), select([['contain', 'Fit to window'], ['cover', 'Fill (crop edges)'], ['fill', 'Stretch']], v.fit, (val) => { store.update((s) => { s.video.fit = val; }, 'video'); apply(); })));
  body.append(h('div', { style: { marginTop: '8px' } }, h('button.btn.ghost', { onclick: () => { store.update((s) => { s.video = { ...s.video, brightness: 100, contrast: 100, saturation: 100, hue: 0, fit: 'contain' }; }, 'video'); apply(); redraw(); } }, 'Reset')));
  return body;
}

// ------------------------------------------------------------ subtitles

export function openSubtitleMenu(anchor) {
  const subs = player.subs;
  showMenu(anchor, [
    { heading: 'Subtitles' },
    { label: 'Off', checked: player.subIndex < 0, onClick: () => P.setSubtitle(-1) },
    ...subs.map((s, i) => ({ label: s.label, checked: player.subIndex === i, onClick: () => P.setSubtitle(i) })),
    { sep: true },
    { label: 'Add subtitle file…', icon: 'plus', disabled: !player.current, onClick: async () => { const files = await window.vlc.pickFiles('subtitles'); let ok = 0; for (const f of files) if (await P.addSubtitle(f, ok === 0)) ok++; if (files.length && !ok) toast("Couldn't read that subtitle file"); } },
  ]);
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
  const meta = entry.kind === 'audio' && entry.path ? await window.vlc.meta(entry.path) : null;
  const rows = [
    ['Name', entry.name],
    ['Type', entry.kind === 'audio' ? 'Audio' : 'Video'],
    entry.size ? ['Size', fmtSize(entry.size)] : null,
    entry.mtime ? ['Modified', new Date(entry.mtime).toLocaleString()] : null,
    meta && meta.duration ? ['Duration', fmtShort(meta.duration)] : null,
    meta && meta.title ? ['Title', meta.title] : null,
    meta && meta.artist ? ['Artist', meta.artist] : null,
    meta && meta.album ? ['Album', meta.album] : null,
    ['Location', entry.path],
  ].filter(Boolean);
  return modal({
    title: 'Properties',
    width: 560,
    body: h('div.dlg-body', null, ...rows.map(([k, v]) => h('div.set-row', { style: { alignItems: 'flex-start' } }, h('div', { style: { width: '90px', flex: 'none', color: 'var(--fg-3)' } }, k), h('div', { style: { flex: 1, wordBreak: 'break-all', color: 'var(--fg)' } }, v)))),
  });
}

// ------------------------------------------------------------ onboarding

export async function openOnboarding(onDone) {
  const info = await window.vlc.info();
  const state = { video: info.videos, music: info.music };
  let step = 0;
  const content = h('div.ob-inner');
  const foot = h('div.ob-foot');
  const finish = async () => {
    for (const [kind, key] of [['video', 'video'], ['audio', 'music']]) {
      const p = state[key].trim();
      if (!p) continue;
      const r = await window.vlc.list(p);
      if (r.ok) addFolder(p, kind);
    }
    store.update((s) => { s.onboarded = true; }, 'onboard');
    m.close();
    onDone && onDone();
  };
  const folderField = (label, key) => {
    const input = h('input.input', { value: state[key], spellcheck: 'false', oninput: () => { state[key] = input.value; } });
    return h('div.field', null, h('label', null, label), h('div.input-row', null, input, h('button.btn', { onclick: async () => { const d = await window.vlc.pickFolder(); if (d) { state[key] = d; input.value = d; } } }, 'Browse')));
  };
  const draw = () => {
    clear(content);
    clear(foot);
    if (step === 0) {
      content.append(
        h('img.cone', { src: '../assets/cone.svg', alt: '' }),
        h('h1', null, 'Welcome to VLC Redesign!'),
        h('p', null, 'A fresh, friendly take on the free media player. It plays most videos and music you throw at it — just point it at a folder to get started, or drop files onto the window any time.'),
        folderField('Choose a video folder', 'video'),
        folderField('Choose a music folder (optional)', 'music'));
    } else if (step === 1) {
      const s = store.s;
      const sw = h('div.swatches', { style: { alignSelf: 'flex-start' } });
      const drawSw = (v) => { clear(sw); for (const c of ACCENTS) sw.append(h('button.swatch' + (c === v ? '.on' : ''), { style: { background: c }, onclick: () => { store.update((st) => { st.settings.accent = c; }, 'settings'); drawSw(c); } })); };
      drawSw(s.accent);
      content.append(
        h('h1', null, 'Make it yours'),
        h('p', null, 'Pick a look. You can change this whenever you like in Settings.'),
        h('div.field', null, h('label', null, 'Theme'), segmented([['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], s.theme, (v) => store.update((st) => { st.settings.theme = v; }, 'settings'))),
        h('div.field', null, h('label', null, 'Accent color'), sw));
    } else {
      content.append(
        h('h1', null, 'You’re all set'),
        h('div.tips', null,
          h('div.tip', null, ico('plus', 22), 'Drag videos, music or whole folders onto the window to play them.'),
          h('div.tip', null, ico('keyboard', 22), 'Space plays and pauses, F goes fullscreen, F1 shows every shortcut.'),
          h('div.tip', null, ico('settings', 22), 'Settings has subtitles, the equalizer and player customization.')));
    }
    foot.append(
      h('div.ob-dots', null, [0, 1, 2].map((i) => h('i' + (i === step ? '.on' : '')))),
      h('div', { style: { display: 'flex', gap: '10px' } },
        step > 0 && h('button.btn.ghost', { onclick: () => { step--; draw(); } }, 'Back'),
        step === 0 && h('button.btn.ghost', { onclick: () => { state.video = ''; state.music = ''; finish(); } }, 'Skip'),
        h('button.btn.primary', { onclick: () => (step < 2 ? (step++, draw()) : finish()) }, step < 2 ? 'Next' : 'Start watching')));
  };
  const m = modal({ className: 'onboard', head: false, closable: false, body: h('div', { style: { display: 'contents' } }, content, foot) });
  m.el.style.flexDirection = 'column';
  draw();
}
