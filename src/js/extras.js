import { store } from './store.js';
import * as P from './player.js';
import { showMenu, toast } from './ui.js';
import { skipIcon, icon } from './icons.js';

/** Optional buttons that can be switched on in Customize player. */
export const EXTRAS = [
  { id: 'stop', label: 'Stop', icon: () => icon('stop', 20), run: () => P.stop() },
  { id: 'skipBack', label: 'Skip back', icon: () => skipIcon(-1, store.s.skipStep), run: () => P.seekBy(-store.s.skipStep) },
  { id: 'skipFwd', label: 'Skip forward', icon: () => skipIcon(1, store.s.skipStep), run: () => P.seekBy(store.s.skipStep) },
  { id: 'shuffle', label: 'Shuffle', icon: () => icon('shuffle', 20), active: () => store.state.player.shuffle, run: () => P.toggleShuffle() },
  { id: 'repeat', label: 'Repeat', icon: () => icon(store.state.player.repeat === 'one' ? 'repeatOne' : 'repeat', 20), active: () => store.state.player.repeat !== 'off', run: () => P.cycleRepeat() },
  { id: 'speed', label: 'Playback speed', icon: () => icon('speed', 20), active: () => P.player.rate !== 1, run: (anchor) => speedMenu(anchor) },
  { id: 'snapshot', label: 'Snapshot', icon: () => icon('snapshot', 20), run: () => snapshot() },
  { id: 'pip', label: 'Picture in picture', icon: () => icon('pip', 20), run: () => pip() },
];

export function speedMenu(anchor) {
  showMenu(anchor, [
    { heading: 'Playback speed' },
    ...P.rateOptions.map((r) => ({ label: r === 1 ? 'Normal' : `${r}×`, checked: P.player.rate === r, onClick: () => P.setRate(r) })),
  ]);
}

export async function snapshot() {
  const el = P.player.el;
  if (!P.player.current || P.player.kind !== 'video' || !el.videoWidth) { toast('Snapshots work while a video is playing'); return; }
  try {
    const c = document.createElement('canvas');
    c.width = el.videoWidth;
    c.height = el.videoHeight;
    c.getContext('2d').drawImage(el, 0, 0);
    const name = `${(P.player.current.title || 'snapshot').slice(0, 60)} ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const file = await window.vlc.saveImage(c.toDataURL('image/png'), name);
    toast(file ? 'Snapshot saved to Pictures/VLC Redesign' : 'Could not save the snapshot');
  } catch {
    toast("Snapshots aren't available for this stream");
  }
}

export async function pip() {
  const el = P.player.el;
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (P.player.kind === 'video') await el.requestPictureInPicture();
  } catch { toast('Picture in picture is not available'); }
}
