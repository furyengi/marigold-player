import { store } from './store.js';
import * as P from './player.js';
import * as A from './audio.js';
import { removeFolder } from './library.js';
import { clearThumbCache } from './thumbs.js';
import { ACTIONS, keysFor, setKeys, resetKeys, conflictFor, eventCombo, pretty } from './hotkeys.js';
import { bus } from './bus.js';
import { ACCENTS } from './brand.js';
import { h, clear, ico, iconButton, modal, topModal, toggle, segmented, select, range, confirmBox, toast } from './ui.js';
import { icon } from './icons.js';
import { addFolderFlow } from './actions.js';
import { update, openUpdates, onUpdate } from './updates.js';

const row = (label, control, hint) => h('div.set-row', null, h('div', null, label, hint && h('span.hint', null, hint)), h('div.ctl-slot', null, control));
const set = (k) => (v) => store.update((st) => { st.settings[k] = v; }, 'settings');
const btn = (label, onclick, cls = '') => h('button.btn' + (cls ? '.' + cls : ''), { onclick }, label);

function swatches(cur, cols, onPick) {
  const el = h('div.swatches');
  const draw = (v) => { clear(el); for (const c of cols) el.append(h('button.swatch' + (c === v ? '.on' : ''), { title: c, style: { background: c }, onclick: () => { onPick(c); draw(c); } })); };
  draw(cur);
  return el;
}

/** Sync the settings main needs to know about (proxy, dev mode, logging). */
export function syncNative() {
  const s = store.s;
  window.native.config({ devMode: s.devMode, saveLog: s.saveLog, logLevel: s.logLevel, logFile: s.logFile || '' });
  window.native.setProxy(s.proxyMode, s.proxyUrl);
}

/** Add or remove a customizable player item from the right-hand control group. */
const inLayout = (...ids) => ids.every((id) => Object.values(store.state.player.layout).flat().includes(id));
function placeItems(ids, on) {
  store.update((s) => {
    const l = s.player.layout;
    for (const id of ids) {
      for (const z of Object.keys(l)) l[z] = l[z].filter((x) => x !== id);
      if (on) l.right.splice(Math.max(0, l.right.indexOf('settings')), 0, id);
    }
  }, 'player');
}

function sections() {
  const s = store.s;
  const v = store.state;
  return {
    General: {
      icon: 'sliders', group: 'App',
      blocks: [
        { title: 'Appearance', rows: [
          { label: 'Theme', build: () => segmented([['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], s.theme, set('theme')) },
          { label: 'Accent color', build: () => swatches(s.accent, ACCENTS, set('accent')) },
        ] },
        { title: 'Startup', rows: [
          { label: 'Open on', hint: 'The view shown when the app starts', build: () => select([['home', 'Home'], ['videos', 'Videos'], ['music', 'Music'], ['playlists', 'Playlists'], ['recent', 'Recent']], s.startView, set('startView')) },
          { label: 'Show confirmation dialogs', hint: 'Ask before deleting playlists or clearing data', build: () => toggle(s.confirmDialogs, set('confirmDialogs')) },
        ] },
        { title: 'Updates', rows: [
          { label: 'Marigold Player', hint: 'The version you are running', build: () => h('span', { style: { color: 'var(--fg-2)' } }, `Version ${update.state.current || ''}`) },
          { label: 'Check for updates automatically', hint: 'Contacts GitHub when the app starts. Nothing else is sent.', build: () => toggle(s.checkUpdates, set('checkUpdates')) },
          { label: 'Software update', hint: 'Look for a newer version', build: () => btn(['available', 'ready', 'downloading'].includes(update.state.status) ? 'Update available…' : 'Check for updates', () => openUpdates(), ['available', 'ready'].includes(update.state.status) ? 'primary' : '') },
        ] },
        { title: 'Diagnostics', advanced: true, rows: [
          { label: 'Developer mode', hint: 'F12 opens the developer tools', build: () => toggle(s.devMode, (x) => { set('devMode')(x); syncNative(); }) },
          { label: 'Save a log', hint: 'Writes errors from the app to a text file', build: () => toggle(s.saveLog, (x) => { set('saveLog')(x); syncNative(); }) },
          { label: 'Log file', build: () => {
            const input = h('input.input', { value: s.logFile, placeholder: 'Default location', style: { width: '230px' }, readonly: true });
            return h('div', { style: { display: 'flex', gap: '8px' } }, input,
              btn('Browse', async () => { const f = await window.native.saveDialog('marigold.log'); if (f) { set('logFile')(f); input.value = f; syncNative(); } }),
              btn('Show', async () => window.native.show(s.logFile || (await window.native.logPath()))));
          } },
          { label: 'Log details', build: () => select([['errors', 'Errors only'], ['warnings', 'Warnings and errors'], ['all', 'Everything']], s.logLevel, (x) => { set('logLevel')(x); syncNative(); }) },
          { label: 'Reset everything', hint: 'Settings, library folders, playlists and history', build: () => h('button.btn', { style: { color: 'var(--danger)' }, onclick: async () => { if (await confirmBox('Reset Marigold Player', 'This clears your settings, library folders, playlists, history and saved positions.', 'Reset', true, true)) { store.reset(); location.reload(); } } }, 'Reset…') },
        ] },
      ],
    },
    Interface: {
      icon: 'cursor', group: 'App',
      blocks: [
        { title: 'Library', rows: [
          { label: 'Show video thumbnails', hint: 'Generated from the file while you browse', build: () => toggle(s.thumbs, set('thumbs')) },
          { label: 'Thumbnail size', build: () => select([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], s.thumbSize, set('thumbSize')) },
          { label: 'Show file extensions', build: () => toggle(s.showExt, set('showExt')) },
          { label: 'Show hidden files', build: () => toggle(s.showHidden, set('showHidden')) },
        ] },
        { title: 'Player', rows: [
          { label: 'Show the queue sidebar', build: () => toggle(v.player.sidebar, (x) => store.update((st) => { st.player.sidebar = x; }, 'player')) },
          { label: 'Queue sidebar side', build: () => segmented([['left', 'Left'], ['right', 'Right']], v.player.sidebarSide, (x) => store.update((st) => { st.player.sidebarSide = x; }, 'player')) },
          { label: 'Hide controls in fullscreen after', build: () => select([[1.5, '1.5 s'], [2.5, '2.5 s'], [4, '4 s'], [6, '6 s']], s.idleHide, (x) => set('idleHide')(Number(x))) },
          { label: 'Mini player corner', build: () => segmented([['left', 'Left'], ['right', 'Right']], s.miniSide, set('miniSide')) },
          { label: 'Customize player buttons', build: () => btn('Customize…', () => { topModal().close(); bus.openCustomize(); }) },
        ] },
      ],
    },
    Privacy: {
      icon: 'shield', group: 'App',
      blocks: [
        { title: 'History', rows: [
          { label: 'Remember what I played', hint: 'Powers Recent and Home', build: () => toggle(s.saveHistory, set('saveHistory')) },
          { label: 'Clear history', build: () => btn('Clear', () => { store.update((st) => { st.recent = []; }, 'recent'); toast('History cleared'); }) },
          { label: 'Remember playback position', hint: 'Resume long videos where you left off', build: () => toggle(s.resume, set('resume')) },
          { label: 'Forget saved positions', build: () => btn('Forget', () => { store.update((st) => { st.resume = {}; }, 'resume'); toast('Saved positions cleared'); }) },
        ] },
        { title: 'Stored on this computer', rows: [
          { label: 'Clear thumbnail cache', build: () => btn('Clear', async () => { await clearThumbCache(); toast('Thumbnail cache cleared'); }) },
          { label: 'Clear bookmarks', build: () => btn('Clear', () => { store.update((st) => { st.bookmarks = {}; }, 'bookmarks'); toast('Bookmarks cleared'); }) },
        ] },
      ],
    },
    Controls: {
      icon: 'keyboard', group: 'App',
      blocks: [
        { title: 'Keyboard & mouse', rows: [
          { label: 'Keyboard shortcuts', hint: 'Every shortcut can be changed', build: () => btn('Edit shortcuts…', () => { topModal().close(); bus.openShortcuts(); }) },
          { label: 'Skip step', hint: 'Used by the arrow keys and the skip buttons', build: () => select([[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']], s.skipStep, (x) => set('skipStep')(Number(x))) },
          { label: 'Mouse wheel on the video', build: () => select([['volume', 'Changes volume'], ['seek', 'Skips forward / back'], ['none', 'Does nothing']], s.wheelAction, set('wheelAction')) },
          { label: 'Customize player buttons', build: () => btn('Customize…', () => { topModal().close(); bus.openCustomize(); }) },
        ] },
      ],
    },
    Playback: {
      icon: 'play', group: 'Media',
      blocks: [
        { title: 'Playback', rows: [
          { label: 'Play next item automatically', build: () => toggle(s.autoNext, set('autoNext')) },
          { label: 'Repeat', build: () => select([['off', 'Off'], ['all', 'All'], ['one', 'One']], v.player.repeat, (x) => store.update((st) => { st.player.repeat = x; }, 'player')) },
          { label: 'Shuffle', build: () => toggle(v.player.shuffle, (x) => { if (x !== store.state.player.shuffle) P.toggleShuffle(); }) },
          { label: 'Default speed', build: () => select(P.rateOptions.map((r) => [r, r === 1 ? 'Normal' : `${r}×`]), s.defaultRate, (x) => { set('defaultRate')(Number(x)); P.setRate(Number(x)); }) },
        ] },
        { title: 'Format support', rows: [
          { label: 'Play every format', hint: 'Converts HEVC, AVI, WMV, FLV, AC-3, DTS and more on the fly using the built-in ffmpeg', build: () => toggle(s.compat, set('compat')) },
          { label: 'Conversion quality', hint: 'Only used for files that need converting', build: () => select([['fast', 'Fast (lighter on the CPU)'], ['balanced', 'Balanced'], ['high', 'High quality']], s.compatQuality, set('compatQuality')) },
        ] },
      ],
    },
    Video: {
      icon: 'film', group: 'Media',
      blocks: [
        { title: 'Picture', rows: [
          { label: 'Aspect ratio', build: () => select([['contain', 'Fit to window'], ['cover', 'Fill (crop edges)'], ['fill', 'Stretch']], v.video.fit, (x) => A.setVideo({ fit: x })) },
          { label: 'Colors, crop and transform', hint: 'Brightness, contrast, gamma, rotation and more', build: () => btn('Open…', () => { topModal().close(); bus.openEffects(null, 'video'); }) },
          { label: 'Reset all picture adjustments', build: () => btn('Reset', () => { A.setVideo(structuredClone(A.VIDEO_DEFAULTS)); toast('Picture settings reset'); }) },
        ] },
      ],
    },
    Audio: {
      icon: 'equalizer', group: 'Media',
      blocks: [
        { title: 'Output', rows: [
          { label: 'Volume', build: () => range({ min: 0, max: 100, value: Math.round(v.audio.volume * 100), onInput: (x) => P.setVolume(x / 100) }) },
          { label: 'Loudness normalizer', hint: 'Keeps quiet and loud scenes closer together', build: () => toggle(s.normalize, (x) => { set('normalize')(x); A.applyAudioFx(); }) },
          { label: 'Equalizer and effects', hint: 'Equalizer, compressor, spatializer, stereo widener', build: () => btn('Open…', () => { topModal().close(); bus.openEffects(null, 'audio'); }) },
        ] },
      ],
    },
    Subtitles: {
      icon: 'subtitles', group: 'Media',
      blocks: [
        { title: 'Subtitles', rows: [
          { label: 'Load subtitles automatically', hint: 'Files next to the video that share its name, or a default embedded track', build: () => toggle(s.autoSubs, set('autoSubs')) },
          { label: 'Text size', build: () => range({ min: 16, max: 56, value: s.subSize, onInput: set('subSize') }) },
          { label: 'Background opacity', build: () => range({ min: 0, max: 100, value: s.subBg, onInput: set('subBg') }) },
          { label: 'Text color', build: () => swatches(s.subColor, ['#ffffff', '#ffe066', '#7ee3ff', '#9dff8a'], set('subColor')) },
          { label: 'Add subtitles to a folder or playlist', build: () => btn('Choose…', () => { topModal().close(); bus.pickSubtitleTarget(); }) },
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
              wrap.append(list, h('div', { style: { display: 'flex', gap: '10px' } }, btn('Add video folder…', async () => { await addFolderFlow('video'); draw(); }), btn('Add music folder…', async () => { await addFolderFlow('audio'); draw(); })));
            };
            draw();
            return wrap;
          } },
        ] },
        { title: 'Display', rows: [
          { label: 'Show hidden files', build: () => toggle(s.showHidden, set('showHidden')) },
          { label: 'Show file extensions', build: () => toggle(s.showExt, set('showExt')) },
        ] },
      ],
    },
    Network: {
      icon: 'network', group: 'System',
      blocks: [
        { title: 'Connection', rows: [
          { label: 'Proxy', build: () => segmented([['system', 'System'], ['direct', 'None'], ['custom', 'Custom']], s.proxyMode, (x) => { set('proxyMode')(x); syncNative(); }) },
          { label: 'Proxy address', hint: 'For example http://127.0.0.1:8080', build: () => h('input.input', { value: s.proxyUrl, placeholder: 'http://host:port', style: { width: '240px' }, onchange: (e) => { set('proxyUrl')(e.target.value.trim()); syncNative(); } }) },
        ] },
        { title: 'Streaming', rows: [
          { label: 'Buffering', hint: 'How much of a network stream is loaded ahead of time', build: () => select([['auto', 'Automatic'], ['metadata', 'Minimal'], ['none', 'None']], s.preload, set('preload')) },
          { label: 'Clear saved streams', build: () => btn('Clear', () => { store.update((st) => { st.streams = []; }, 'streams'); toast('Saved streams cleared'); }) },
        ] },
      ],
    },
    Performance: {
      icon: 'gauge', group: 'System',
      blocks: [
        { title: 'Rendering', rows: [
          { label: 'Hardware acceleration', hint: 'Uses the graphics card for decoding and drawing. Restart to apply.', build: () => {
            const wrap = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
            window.native.config().then((c) => {
              wrap.append(toggle(c.hwAccel !== false, (x) => { window.native.config({ hwAccel: x }); wrap.append(btn('Restart now', () => window.native.relaunch())); }));
            });
            return wrap;
          } },
          { label: 'Reduce motion', hint: 'Turns off animations', build: () => toggle(s.reduceMotion, set('reduceMotion')) },
        ] },
        { title: 'Thumbnails', rows: [
          { label: 'Cache thumbnails on disk', hint: 'Makes folders open faster the next time', build: () => toggle(s.thumbCache, set('thumbCache')) },
          { label: 'Thumbnails built at once', build: () => select([[1, '1 (lightest)'], [2, '2'], [4, '4 (fastest)']], s.thumbWorkers, (x) => set('thumbWorkers')(Number(x))) },
        ] },
      ],
    },
    Recording: {
      icon: 'record', group: 'System',
      blocks: [
        { title: 'Recording', rows: [
          { label: 'Save recordings to', build: () => {
            const input = h('input.input', { value: s.recordDir, placeholder: 'Videos/Marigold Recordings', style: { width: '230px' }, readonly: true });
            return h('div', { style: { display: 'flex', gap: '8px' } }, input, btn('Browse', async () => { const d = await window.native.pickFolder(); if (d) { set('recordDir')(d); input.value = d; } }));
          } },
          { label: 'Format', hint: 'Recordings are saved as WebM', build: () => select([['webm', 'Video and audio'], ['audio', 'Audio only']], s.recordFormat, set('recordFormat')) },
          { label: 'Video quality', build: () => select([[2, '2 Mbit/s'], [5, '5 Mbit/s'], [8, '8 Mbit/s'], [12, '12 Mbit/s']], s.recordBitrate, (x) => set('recordBitrate')(Number(x))) },
          { label: 'Start or stop a recording', hint: 'Add the Record button in Customize player, or press Shift+R', build: () => btn('Toggle now', () => P.toggleRecording()) },
        ] },
      ],
    },
    Extensions: {
      icon: 'puzzle', group: 'System',
      blocks: [
        { title: 'Built-in extensions', rows: [
          { label: 'Loudness normalizer', hint: 'Evens out volume between scenes and tracks', build: () => toggle(s.normalize, (x) => { set('normalize')(x); A.applyAudioFx(); }) },
          { label: 'Track change notifications', hint: 'Shows a notification when the next item starts while the window is in the background', build: () => toggle(s.notify, set('notify')) },
          { label: 'A-B loop button', hint: 'Repeat a section. Shortcut: L', build: () => toggle(inLayout('loop'), (x) => placeItems(['loop'], x)) },
          { label: 'Sleep timer button', hint: 'Pause playback after a set time', build: () => toggle(inLayout('sleep'), (x) => placeItems(['sleep'], x)) },
          { label: 'Sleep timer length', build: () => select([[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '90 minutes']], s.sleepMinutes, (x) => set('sleepMinutes')(Number(x))) },
          { label: 'Recording button', hint: 'Capture what you are watching or listening to', build: () => toggle(inLayout('record'), (x) => placeItems(['record'], x)) },
          { label: 'Bookmark buttons', hint: 'Save and jump back to moments in a file', build: () => toggle(inLayout('bookmark', 'bookmarks'), (x) => placeItems(['bookmark', 'bookmarks'], x)) },
        ] },
      ],
    },
  };
}

export function openSettings(initial = 'General') {
  let cat = initial;
  let query = '';
  let showAdvanced = false;
  const body = h('div.set-body');
  const cats = h('div.set-cats');
  const search = h('div.search', { html: icon('search', 18) });
  const input = h('input', { placeholder: 'Search', spellcheck: 'false', oninput: () => { query = input.value.trim().toLowerCase(); drawBody(); drawCats(); } });
  search.append(input);

  function drawCats() {
    clear(cats);
    let lastGroup = '';
    for (const [name, c] of Object.entries(sections())) {
      if (c.group !== lastGroup) { cats.append(h('div.cat-label', null, c.group)); lastGroup = c.group; }
      cats.append(h('button.cat' + (!query && name === cat ? '.active' : ''), { onclick: () => { cat = name; query = ''; input.value = ''; showAdvanced = false; drawBody(); drawCats(); } }, ico(c.icon, 20), name));
    }
  }
  function drawBody() {
    clear(body);
    body.scrollTop = 0;
    const d = sections();
    if (query) {
      let n = 0;
      for (const [name, c] of Object.entries(d)) for (const b of c.blocks) {
        const hits = b.rows.filter((r) => ((r.label || '') + ' ' + (r.hint || '') + ' ' + b.title).toLowerCase().includes(query));
        if (!hits.length) continue;
        n++;
        body.append(h('h3', null, `${name} · ${b.title}`), ...hits.map((r) => (r.full ? r.build() : row(r.label, r.build(), r.hint))));
      }
      if (!n) body.append(h('div.none', { style: { marginTop: '24px' } }, 'No settings match your search.'));
      return;
    }
    const blocks = d[cat].blocks;
    for (const b of blocks.filter((x) => !x.advanced)) {
      body.append(h('h3', null, b.title));
      for (const r of b.rows) body.append(r.full ? r.build() : row(r.label, r.build(), r.hint));
    }
    const adv = blocks.filter((x) => x.advanced);
    if (adv.length) {
      body.append(h('button.adv-toggle', { onclick: () => { showAdvanced = !showAdvanced; drawBody(); } }, 'Advanced Options', h('span', { html: icon(showAdvanced ? 'chevronDown' : 'chevronRight', 16) })));
      if (showAdvanced) for (const b of adv) { body.append(h('h3', null, b.title)); for (const r of b.rows) body.append(row(r.label, r.build(), r.hint)); }
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

// ------------------------------------------------------------ keyboard shortcuts

export function openShortcuts() {
  let query = '';
  let capturing = null; // { id, slot }
  const list = h('div.kb-list');
  const searchInput = h('input.input', { placeholder: 'Search shortcuts', spellcheck: 'false', oninput: () => { query = searchInput.value.trim().toLowerCase(); draw(); } });

  function draw() {
    clear(list);
    let group = '';
    for (const a of ACTIONS) {
      if (query && !(a.label + ' ' + a.group + ' ' + keysFor(a.id).join(' ')).toLowerCase().includes(query)) continue;
      if (a.group !== group) { group = a.group; list.append(h('h4.kb-h', null, group)); }
      const keys = keysFor(a.id);
      const chips = h('div.kb-keys');
      keys.forEach((k, slot) => {
        const isCap = capturing && capturing.id === a.id && capturing.slot === slot;
        chips.append(h('button.kb-chip' + (isCap ? '.cap' : ''), { title: 'Click to change, right-click to remove', onclick: () => { capturing = { id: a.id, slot }; draw(); }, oncontextmenu: (e) => { e.preventDefault(); setKeys(a.id, keys.filter((_, i) => i !== slot)); draw(); } }, isCap ? 'Press keys…' : pretty(k)));
      });
      const addCap = capturing && capturing.id === a.id && capturing.slot === keys.length;
      chips.append(h('button.kb-chip.add' + (addCap ? '.cap' : ''), { title: 'Add another shortcut', onclick: () => { capturing = { id: a.id, slot: keys.length }; draw(); } }, addCap ? 'Press keys…' : '+'));
      list.append(h('div.kb-row2', null, h('span', null, a.label), chips));
    }
    if (!list.children.length) list.append(h('div.none', null, 'No shortcuts match.'));
  }

  const onKey = (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { capturing = null; draw(); return; }
    const combo = eventCombo(e);
    if (!combo) return;
    const { id, slot } = capturing;
    const clash = conflictFor(combo, id);
    if (clash) setKeys(clash.id, keysFor(clash.id).filter((k) => k !== combo));
    const next = [...keysFor(id)];
    next[slot] = combo;
    setKeys(id, next.filter(Boolean));
    capturing = null;
    if (clash) toast(`Moved from “${clash.label}”`);
    draw();
  };
  document.addEventListener('keydown', onKey, true);

  const m = modal({
    title: 'Keyboard shortcuts',
    width: 760,
    onClose: () => document.removeEventListener('keydown', onKey, true),
    body: h('div.dlg-body', { style: { paddingTop: '0' } }, h('div.field', { style: { margin: '4px 0 6px' } }, searchInput), list),
    footer: h('div.dlg-foot', null, h('button.btn.ghost', { style: { marginRight: 'auto' }, onclick: () => { resetKeys(); draw(); } }, 'Reset all'), h('button.btn.primary', { onclick: () => m.close() }, 'Done')),
  });
  draw();
  return m;
}
