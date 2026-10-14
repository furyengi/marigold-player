import { store } from './store.js';
import { addFolder } from './library.js';
import { ACCENTS } from './brand.js';
import { h, clear, ico, modal, toggle } from './ui.js';

const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];

function preview() {
  return h('div.ob-preview', null,
    h('div.pv-top', null, h('img', { src: '../assets/logo.svg', alt: '' }), h('span.pv-dot'), h('span.pv-dot'), h('span.pv-title')),
    h('div.pv-stage', null, h('img', { src: '../assets/logo.svg', alt: '' })),
    h('div.pv-bar', null, h('span.pv-btn'), h('span.pv-play'), h('span.pv-btn'), h('span.pv-seek', null, h('i')), h('span.pv-vol')));
}

/** First-run setup: pick folders, theme and accent, then a few tips. */
export async function openOnboarding(onDone) {
  const info = await window.native.info();
  const state = { video: info.videos, music: info.music };
  let step = 0;
  const content = h('div.ob-inner');
  const foot = h('div.ob-foot');

  const finish = async () => {
    for (const [kind, key] of [['video', 'video'], ['audio', 'music']]) {
      const p = state[key].trim();
      if (!p) continue;
      const r = await window.native.list(p);
      if (r.ok) addFolder(p, kind);
    }
    store.update((s) => { s.onboarded = true; }, 'onboard');
    m.close();
    onDone && onDone();
  };

  const folderField = (label, key) => {
    const input = h('input.input', { value: state[key], spellcheck: 'false', oninput: () => { state[key] = input.value; } });
    return h('div.field', null, h('label', null, label), h('div.input-row', null, input, h('button.btn', { onclick: async () => { const d = await window.native.pickFolder(); if (d) { state[key] = d; input.value = d; } } }, 'Browse')));
  };

  function themeTile(id, label) {
    const on = store.s.theme === id;
    return h('button.theme-tile' + (on ? '.on' : ''), { onclick: () => { store.update((s) => { s.settings.theme = id; }, 'settings'); draw(); } },
      h('span.tile.' + id), h('span.tile-label', null, label));
  }

  function draw() {
    clear(content);
    clear(foot);
    content.classList.toggle('wide', step === 1);
    if (step === 0) {
      content.append(
        h('img.logo', { src: '../assets/logo.svg', alt: '' }),
        h('h1', null, 'Welcome to Marigold Player!'),
        h('p', null, 'A calm, friendly player for your videos and music. It plays almost any format, and you can point it at a folder to get started or drop files onto the window any time.'),
        folderField('Choose a video folder', 'video'),
        folderField('Choose a music folder (optional)', 'music'));
    } else if (step === 1) {
      const accent = store.s.accent;
      content.append(
        h('p.ob-lead', null, 'Select your preferred theme and color.'),
        preview(),
        h('div.theme-tiles', null, THEMES.map(([id, label]) => themeTile(id, label))),
        h('div.accent-row', null, ACCENTS.map((c) => h('button.accent-dot' + (c === accent ? '.on' : ''), { title: c, style: { '--c': c }, onclick: () => { store.update((s) => { s.settings.accent = c; }, 'settings'); draw(); } }))));
    } else {
      content.append(
        h('h1', null, 'You’re all set'),
        h('div.tips', null,
          h('div.tip', null, ico('plus', 22), 'Drag videos, music or whole folders onto the window to play them.'),
          h('div.tip', null, ico('keyboard', 22), 'Space plays and pauses, F goes fullscreen, F1 lists every shortcut, and you can change them all.'),
          h('div.tip', null, ico('settings', 22), 'Right-click anything for more, and use Settings to tune subtitles, effects and the player layout.')),
        h('div.set-row', { style: { margin: '0 4px' } }, h('div', null, 'Check for updates automatically', h('span.hint', null, 'Contacts GitHub when the app starts. Nothing else is sent.')), toggle(store.s.checkUpdates, (x) => store.update((s) => { s.settings.checkUpdates = x; }, 'settings'))));
    }
    const dots = h('div.ob-dots', null, [0, 1, 2].map((i) => h('i' + (i === step ? '.on' : ''))));
    foot.append(
      step === 1 ? h('div') : dots,
      h('div', { style: { display: 'flex', gap: '10px' } },
        step > 0 && h('button.btn', { onclick: () => { step--; draw(); } }, 'Back'),
        step === 0 && h('button.btn.ghost', { onclick: () => { state.video = ''; state.music = ''; finish(); } }, 'Skip'),
        h('button.btn.primary', { onclick: () => (step < 2 ? (step++, draw()) : finish()) }, step < 2 ? 'Next' : 'Start watching')));
  }

  const m = modal({ className: 'onboard', head: false, closable: false, body: h('div', { style: { display: 'contents' } }, content, foot) });
  m.el.style.flexDirection = 'column';
  draw();
}
