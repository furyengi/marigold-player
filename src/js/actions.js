import { store, uid } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { addFolder } from './library.js';
import { showMenu, toast, promptBox, confirmBox } from './ui.js';
import { openProperties } from './dialogs.js';
import { bus } from './bus.js';

export function playEntries(entries, index) {
  const files = entries.filter((e) => e.type !== 'dir');
  if (!files.length) return;
  P.play(files.map(P.toItem), Math.max(0, index));
  router.go({ view: 'player' });
}

export async function openFilesDialog() {
  const paths = await window.native.pickFiles('media');
  if (!paths.length) return;
  const entries = await window.native.expand(paths);
  playEntries(entries, 0);
}

export async function openMediaPaths(paths, { enqueue = false } = {}) {
  const entries = await window.native.expand(paths);
  if (!entries.length) { toast('No playable media found'); return; }
  if (enqueue && P.player.current) { P.enqueue(entries.map(P.toItem)); toast(`Added ${entries.length} item${entries.length > 1 ? 's' : ''} to the queue`); }
  else playEntries(entries, 0);
}

export async function addFolderFlow(kind) {
  const dir = await window.native.pickFolder();
  if (!dir) return null;
  addFolder(dir, kind);
  toast('Folder added to your library');
  return dir;
}

export async function playFolder(dir, { enqueue = false } = {}) {
  const entries = await window.native.expand([dir]);
  if (!entries.length) { toast('No playable media in this folder'); return; }
  if (enqueue && P.player.current) { P.enqueue(entries.map(P.toItem)); toast(`Added ${entries.length} items to the queue`); }
  else playEntries(entries, 0);
}

// ------------------------------------------------------------ playlists

export async function newPlaylist(items = []) {
  const name = await promptBox({ title: 'New playlist', label: 'Playlist name', placeholder: 'My playlist', okLabel: 'Create' });
  if (!name) return null;
  const pl = { id: uid(), name, items: items.map(slim) };
  store.update((s) => { s.playlists.push(pl); }, 'playlists');
  toast(`Created “${name}”`);
  return pl;
}

const slim = (e) => (e.url ? { url: e.url, name: e.name, kind: e.kind } : { path: e.path, name: e.name, kind: e.kind });

export function addToPlaylist(id, entries) {
  const list = entries.filter((e) => e.type !== 'dir').map(slim);
  store.update((s) => { const p = s.playlists.find((x) => x.id === id); if (p) p.items.push(...list); }, 'playlists');
  const p = store.state.playlists.find((x) => x.id === id);
  toast(`Added to “${p.name}”`);
}

export function playPlaylist(id, start = 0) {
  const p = store.state.playlists.find((x) => x.id === id);
  if (!p || !p.items.length) return;
  const items = p.items.map((i) => (i.url ? P.streamItem(i.url, i.name) : P.toItem({ ...i, ext: '' })));
  P.play(items, start, p.name);
  router.go({ view: 'player' });
}

export async function deletePlaylist(id) {
  const p = store.state.playlists.find((x) => x.id === id);
  if (!p) return;
  if (!(await confirmBox('Delete playlist', `Delete “${p.name}”? The media files themselves are not touched.`, 'Delete', true))) return;
  store.update((s) => { s.playlists = s.playlists.filter((x) => x.id !== id); }, 'playlists');
  const r = router.route;
  if (r.view === 'playlist' && r.id === id) router.go({ view: 'playlists' });
}

export async function renamePlaylist(id) {
  const p = store.state.playlists.find((x) => x.id === id);
  const name = await promptBox({ title: 'Rename playlist', label: 'Playlist name', value: p.name });
  if (name) store.update((s) => { s.playlists.find((x) => x.id === id).name = name; }, 'playlists');
}

// ------------------------------------------------------------ context menus

const isFavorite = (e) => store.state.favorites.some((f) => f.path && f.path === e.path);
function toggleFav(e) {
  const on = isFavorite(e);
  store.update((s) => {
    if (on) s.favorites = s.favorites.filter((f) => f.path !== e.path);
    else s.favorites.unshift({ path: e.path, name: e.name, kind: e.kind });
  }, 'favorites');
  toast(on ? 'Removed from favorites' : 'Added to favorites');
}

export function fileMenu(anchor, entry, { onPlay, extra = [] } = {}) {
  const pls = store.state.playlists;
  const item = [
    { label: 'Play', icon: 'play', onClick: onPlay },
    { label: isFavorite(entry) ? 'Remove from favorites' : 'Add to favorites', icon: 'heart', onClick: () => toggleFav(entry) },
    { label: 'Play next', icon: 'next', onClick: () => { P.enqueue([P.toItem(entry)], true); toast('Will play next'); }, disabled: !P.player.current },
    { label: 'Add to queue', icon: 'queue', onClick: () => { P.enqueue([P.toItem(entry)]); toast('Added to queue'); } },
    { sep: true },
    { heading: 'Add to playlist' },
    ...pls.map((p) => ({ label: p.name, icon: 'playlist', onClick: () => addToPlaylist(p.id, [entry]) })),
    { label: 'New playlist…', icon: 'plus', onClick: () => newPlaylist([entry]) },
    { sep: true },
    ...extra,
    { label: 'Show in folder', icon: 'folder', onClick: () => window.native.show(entry.path) },
    { label: 'Properties', icon: 'info', onClick: () => openProperties(entry) },
  ];
  showMenu(anchor, item);
}

export function folderMenu(anchor, entry, { onOpen, root } = {}) {
  showMenu(anchor, [
    { label: 'Open', icon: 'folder', onClick: onOpen },
    { label: 'Play all', icon: 'play', onClick: () => playFolder(entry.path) },
    { label: 'Add to queue', icon: 'queue', onClick: () => playFolder(entry.path, { enqueue: true }), disabled: !P.player.current },
    { label: 'Add subtitles…', icon: 'subtitles', onClick: async () => { const files = await window.native.expand([entry.path]); bus.openAddSubtitles({ title: `Add subtitles to ${entry.name || 'this folder'}`, items: files.filter((x) => x.kind === 'video') }); } },
    { sep: true },
    { label: 'Show in folder', icon: 'folder', onClick: () => window.native.show(entry.path) },
    root && { label: 'Remove from library', icon: 'trash', danger: true, onClick: () => store.update((s) => { s.folders = s.folders.filter((f) => f.id !== root.id); }, 'folders') },
  ]);
}

export function addMenu(anchor, opts) {
  showMenu(anchor, [
    { label: 'Open files…', icon: 'play', kbd: 'Ctrl+O', onClick: openFilesDialog },
    { label: 'Open folder…', icon: 'folder', kbd: 'Ctrl+Shift+O', onClick: async () => { const d = await window.native.pickFolder(); if (d) openMediaPaths([d]); } },
    { label: 'Open network stream…', icon: 'network', kbd: 'Ctrl+N', onClick: () => import('./dialogs.js').then((m) => m.openNetwork()) },
    { sep: true },
    { label: 'Add video folder to library…', icon: 'video', onClick: () => addFolderFlow('video') },
    { label: 'Add music folder to library…', icon: 'music', onClick: () => addFolderFlow('audio') },
  ], opts);
}
