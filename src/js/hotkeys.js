import { store } from './store.js';
import * as P from './player.js';
import { player } from './player.js';
import { bus } from './bus.js';

/**
 * Every keyboard-triggered action. `keys` are the defaults; users can rebind them in
 * Settings -> Controls, and overrides are stored in store.state.keys.
 */
export const ACTIONS = [
  { id: 'play', group: 'Playback', label: 'Play / pause', keys: ['Space', 'K'], run: () => P.toggle() },
  { id: 'next', group: 'Playback', label: 'Next item', keys: ['N'], run: () => P.next() },
  { id: 'prev', group: 'Playback', label: 'Previous item', keys: ['P'], run: () => P.prev() },
  { id: 'seekBack', group: 'Playback', label: 'Skip back', keys: ['ArrowLeft'], run: () => player.current && P.seekBy(-store.s.skipStep) },
  { id: 'seekFwd', group: 'Playback', label: 'Skip forward', keys: ['ArrowRight'], run: () => player.current && P.seekBy(store.s.skipStep) },
  { id: 'seekBackLong', group: 'Playback', label: 'Skip back one minute', keys: ['Shift+ArrowLeft'], run: () => player.current && P.seekBy(-60) },
  { id: 'seekFwdLong', group: 'Playback', label: 'Skip forward one minute', keys: ['Shift+ArrowRight'], run: () => player.current && P.seekBy(60) },
  { id: 'speedDown', group: 'Playback', label: 'Slower', keys: ['['], run: () => P.setRate(Math.max(0.25, +(player.rate - 0.25).toFixed(2))) },
  { id: 'speedUp', group: 'Playback', label: 'Faster', keys: [']'], run: () => P.setRate(Math.min(3, +(player.rate + 0.25).toFixed(2))) },
  { id: 'speedReset', group: 'Playback', label: 'Normal speed', keys: ['='], run: () => P.setRate(1) },
  { id: 'stop', group: 'Playback', label: 'Stop', keys: ['S'], run: () => P.stop() },
  { id: 'replay', group: 'Playback', label: 'Replay from the start', keys: ['R'], run: () => { P.seek(0); P.resume(); } },
  { id: 'loop', group: 'Playback', label: 'Set A-B loop point', keys: ['L'], run: () => P.cycleLoop() },
  { id: 'shuffle', group: 'Playback', label: 'Toggle shuffle', keys: ['Ctrl+H'], run: () => P.toggleShuffle() },
  { id: 'repeat', group: 'Playback', label: 'Cycle repeat mode', keys: ['Ctrl+E'], run: () => P.cycleRepeat() },
  { id: 'volUp', group: 'Audio & video', label: 'Volume up', keys: ['ArrowUp'], run: () => P.setVolume(player.volume + 0.05) },
  { id: 'volDown', group: 'Audio & video', label: 'Volume down', keys: ['ArrowDown'], run: () => P.setVolume(player.volume - 0.05) },
  { id: 'mute', group: 'Audio & video', label: 'Mute', keys: ['M'], run: () => P.toggleMute() },
  { id: 'fullscreen', group: 'Audio & video', label: 'Fullscreen', keys: ['F'], run: () => window.native.win('fullscreen') },
  { id: 'snapshot', group: 'Audio & video', label: 'Snapshot', keys: ['Shift+S'], run: () => bus.snapshot() },
  { id: 'record', group: 'Audio & video', label: 'Start / stop recording', keys: ['Shift+R'], run: () => P.toggleRecording() },
  { id: 'subs', group: 'Audio & video', label: 'Toggle subtitles', keys: ['V'], run: () => player.subs.length && P.setSubtitle(player.subIndex >= 0 ? -1 : 0) },
  { id: 'zoom', group: 'Audio & video', label: 'Cycle zoom', keys: ['Z'], run: () => bus.cycleZoom() },
  { id: 'rotate', group: 'Audio & video', label: 'Rotate video', keys: ['Shift+Z'], run: () => bus.rotate() },
  { id: 'pip', group: 'Audio & video', label: 'Picture in picture', keys: ['Ctrl+P'], run: () => bus.pip() },
  { id: 'hideUi', group: 'Interface', label: 'Hide / show interface', keys: ['H'], run: () => bus.toggleHideUi() },
  { id: 'queue', group: 'Interface', label: 'Queue sidebar', keys: ['Q'], run: () => bus.toggleQueue() },
  { id: 'home', group: 'Interface', label: 'Go home', keys: ['Alt+Home'], run: () => bus.goHome() },
  { id: 'settings', group: 'Interface', label: 'Settings', keys: ['Ctrl+,'], run: () => bus.openSettings() },
  { id: 'shortcuts', group: 'Interface', label: 'Keyboard shortcuts', keys: ['F1'], run: () => bus.openShortcuts() },
  { id: 'openFiles', group: 'Library', label: 'Open files', keys: ['Ctrl+O'], run: () => bus.openFiles() },
  { id: 'openFolder', group: 'Library', label: 'Open folder', keys: ['Ctrl+Shift+O'], run: () => bus.openFolder() },
  { id: 'openNetwork', group: 'Library', label: 'Open network stream', keys: ['Ctrl+N'], run: () => bus.openNetwork() },
  { id: 'favorite', group: 'Library', label: 'Favorite current item', keys: ['Ctrl+D'], run: () => bus.toggleFavorite() },
  { id: 'bookmark', group: 'Library', label: 'Bookmark this moment', keys: ['Ctrl+B'], run: () => bus.addBookmark() },
  { id: 'sleep', group: 'Library', label: 'Start / cancel sleep timer', keys: ['Ctrl+T'], run: () => bus.toggleSleep() },
];

const byId = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const actionById = (id) => byId[id];

/** Current combos for an action (defaults unless the user rebound it). */
export const keysFor = (id) => (store.state.keys[id] !== undefined ? store.state.keys[id] : byId[id].keys);

let map = new Map();
function rebuild() {
  map = new Map();
  for (const a of ACTIONS) for (const k of keysFor(a.id)) if (!map.has(k)) map.set(k, a);
}
rebuild();
store.subscribe((key) => { if (key === 'keys' || key === '*') rebuild(); });

export function eventCombo(e) {
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  const named = k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k;
  // Shift is only meaningful for named keys and letters; symbols already carry it (e.g. "+" or "?").
  if (e.shiftKey && (k.length > 1 || /[a-z]/i.test(k))) parts.push('Shift');
  parts.push(named);
  return parts.join('+');
}

export function actionForEvent(e) {
  const c = eventCombo(e);
  return c ? map.get(c) : null;
}

export function setKeys(id, combos) {
  store.update((s) => {
    const same = JSON.stringify(combos) === JSON.stringify(byId[id].keys);
    if (same) delete s.keys[id]; else s.keys[id] = combos;
  }, 'keys');
}
export function resetKeys() { store.update((s) => { s.keys = {}; }, 'keys'); }
/** Another action that already uses this combo, if any. */
export const conflictFor = (combo, exceptId) => ACTIONS.find((a) => a.id !== exceptId && keysFor(a.id).includes(combo));

export const pretty = (combo) => combo.replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓');
/** First bound combo, formatted for tooltips, e.g. "Space". */
export const hint = (id) => { const k = byId[id] && keysFor(id)[0]; return k ? pretty(k) : ''; };

