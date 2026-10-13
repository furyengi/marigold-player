import { store } from './store.js';
import { router } from './router.js';
import { h, clear, ico, iconButton, showMenu, fmtShort, fmtSize, baseName, stripExt, artGradient } from './ui.js';
import { icon } from './icons.js';
import { listDir, sortEntries, foldersFor, rootFor, crumbsFor, progressOf } from './library.js';
import { getThumb, knownDuration } from './thumbs.js';
import { player, toItem } from './player.js';
import * as P from './player.js';
import { playEntries, fileMenu, folderMenu, addMenu, addFolderFlow, openFilesDialog, newPlaylist, playPlaylist, deletePlaylist, renamePlaylist } from './actions.js';
import { openNetwork } from './dialogs.js';

const TITLES = { videos: 'Videos', music: 'Music', home: 'Home', network: 'Network', playlists: 'Playlists', recent: 'Recent', playlist: 'Playlist' };
const KIND = { videos: 'video', music: 'audio' };

let io = null; // lazy thumbnail observer for the current view
function observer(root) {
  if (io) io.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      e.target._load && e.target._load();
    }
  }, { root, rootMargin: '300px' });
  return io;
}

/** Thumbnail surface that fills in lazily; falls back to a generated tile. */
function thumb(entry, cls, { duration = false, glyph = 32 } = {}) {
  const el = h('div.' + cls);
  const paint = (r) => {
    if (r && r.thumb) { el.style.backgroundImage = `url(${r.thumb})`; el.textContent = ''; }
    else if (entry.kind === 'audio') {
      el.style.background = artGradient(entry.name);
      el.innerHTML = icon('music', glyph);
    } else el.innerHTML = icon('video', glyph);
    if (duration) {
      const d = (r && r.duration) || knownDuration(entry.path);
      if (d) el.append(h('span.badge', null, fmtShort(d)));
    }
  };
  el.innerHTML = icon(entry.kind === 'audio' ? 'music' : 'video', glyph);
  el._load = () => getThumb(entry).then(paint);
  const p = progressOf(entry.path);
  if (p > 0.01 && cls === 'thumb') el.append(h('div.prog', { style: { width: p * 100 + '%' } }));
  return el;
}

// ------------------------------------------------------------ shared pieces

function viewHead({ crumbs, title, count, tools = [], showNav = true }) {
  const el = h('div.view-head');
  if (showNav) {
    el.append(
      iconButton('back', { title: 'Back', onclick: () => router.back(), cls: router.canBack ? '' : 'dim' }),
      iconButton('forward', { title: 'Forward', onclick: () => router.forward(), cls: router.canForward ? '' : 'dim' }),
    );
    el.querySelectorAll('.dim').forEach((b) => { b.style.opacity = '.35'; b.style.pointerEvents = 'none'; });
  }
  if (crumbs) {
    const c = h('div.crumbs');
    crumbs.forEach((cr, i) => {
      const last = i === crumbs.length - 1;
      if (i) c.append(h('span.crumb-sep', { html: icon('chevronRight', 12) }));
      c.append(h('button.crumb' + (last ? '.last' : ''), { onclick: last ? null : cr.go }, cr.name));
    });
    el.append(c);
  } else {
    el.append(h('div.crumbs', null, h('span.view-title', null, title)));
  }
  if (count !== undefined) el.append(h('span.count', null, count));
  for (const t of tools) el.append(t);
  return el;
}

const sortMenu = (anchor, rerender) => {
  const cur = store.state.ui.sort;
  const set = (key, dir) => { store.update((s) => { s.ui.sort = { key, dir }; }, 'ui'); rerender(); };
  showMenu(anchor, [
    { heading: 'Sort by' },
    { label: 'Name', checked: cur.key === 'name', onClick: () => set('name', cur.dir) },
    { label: 'Date modified', checked: cur.key === 'mtime', onClick: () => set('mtime', cur.dir) },
    { label: 'Size', checked: cur.key === 'size', onClick: () => set('size', cur.dir) },
    { sep: true },
    { label: 'Ascending', checked: cur.dir === 1, onClick: () => set(cur.key, 1) },
    { label: 'Descending', checked: cur.dir === -1, onClick: () => set(cur.key, -1) },
  ], { align: 'end' });
};

function searchBox(onInput) {
  const input = h('input', { placeholder: 'Search', spellcheck: 'false', oninput: () => onInput(input.value.trim().toLowerCase()) });
  const box = h('div.search', { html: icon('search', 18) }, input);
  box.append(input);
  return { box, input };
}

function emptyState({ title, text, actions = [] }) {
  return h('div.empty', null, h('img', { src: '../assets/idle.png', alt: '' }), h('h3', null, title), h('p', null, text), h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } }, actions));
}

// ------------------------------------------------------------ browse (videos / music / folders)

async function renderBrowse(root, route) {
  const view = route.view;
  const kind = KIND[view];
  const layoutKey = view;
  const dir = route.dir || null;
  const label = TITLES[view];
  let query = '';
  let data = null;

  const body = h('div.view-body');
  const io2 = observer(body);
  const layoutBtn = h('button.icon-btn', { title: 'Change layout' });
  const countEl = h('span.count');
  const sortBtn = h('button.icon-btn', { title: 'Sort' }, ico('sort', 20));
  const { box } = searchBox((q) => { query = q; draw(); });

  const rerender = () => draw();
  const setLayout = () => {
    const cur = store.state.ui.layout[layoutKey] || 'grid';
    layoutBtn.innerHTML = icon(cur === 'grid' ? 'listview' : 'grid', 20);
  };
  layoutBtn.onclick = () => {
    const cur = store.state.ui.layout[layoutKey] || 'grid';
    store.update((s) => { s.ui.layout[layoutKey] = cur === 'grid' ? 'list' : 'grid'; }, 'ui');
    setLayout();
    draw();
  };
  sortBtn.onclick = () => sortMenu(sortBtn, rerender);
  setLayout();

  const crumbs = dir
    ? crumbsFor(dir, label).map((c) => ({ name: c.name, go: () => router.go({ view, dir: c.path }) }))
    : [{ name: label }];
  const addBtn = h('button.icon-btn', { title: 'Add', onclick: () => addMenu(addBtn, { align: 'end' }) }, ico('plus', 20));
  root.append(viewHead({ crumbs, tools: [countEl, sortBtn, layoutBtn, box, addBtn] }), body);

  function draw() {
    clear(body);
    if (!dir) return drawRoots();
    if (!data) return;
    if (!data.ok) {
      body.append(emptyState({ title: "Can't open this folder", text: `It may have been moved or removed (${data.error}).`, actions: [h('button.btn', { onclick: () => router.back() }, 'Go back')] }));
      return;
    }
    let entries = data.entries.filter((e) => e.type === 'dir' || e.kind === kind);
    if (query) entries = entries.filter((e) => e.name.toLowerCase().includes(query));
    entries = sortEntries(entries, store.state.ui.sort);
    countEl.textContent = `${entries.length} item${entries.length === 1 ? '' : 's'}`;
    if (!entries.length) {
      body.append(emptyState({ title: query ? 'No matches' : 'Nothing to play here', text: query ? 'Try a different search.' : `This folder has no ${kind === 'video' ? 'videos' : 'music'} in it.` }));
      return;
    }
    const files = entries.filter((e) => e.type === 'file');
    const layout = store.state.ui.layout[layoutKey] || 'grid';
    const wrap = h('div.' + (layout === 'grid' ? 'grid' : 'list'));
    const cur = player.current && player.current.path;
    for (const e of entries) {
      const open = () => (e.type === 'dir' ? router.go({ view, dir: e.path }) : playEntries(files, files.indexOf(e)));
      const menu = (ev) => {
        ev.preventDefault();
        e.type === 'dir' ? folderMenu({ x: ev.clientX, y: ev.clientY }, e, { onOpen: open }) : fileMenu({ x: ev.clientX, y: ev.clientY }, e, { onPlay: open });
      };
      const isCur = e.type === 'file' && cur === e.path;
      const watched = e.type === 'file' && progressOf(e.path) > 0.01;
      let node;
      if (layout === 'grid') {
        const t = e.type === 'dir' ? h('div.thumb.folder', { html: icon('folder', 34, 'class="big"') }) : thumb(e, 'thumb', { duration: true });
        node = h('button.card' + (isCur ? '.current' : '') + (watched ? '.watched' : ''), { onclick: open, oncontextmenu: menu, title: e.name }, t, h('div.name', null, e.name));
        if (e.type === 'file') io2.observe(t);
      } else {
        const t = e.type === 'dir' ? h('div.rthumb', { html: icon('folder', 22) }) : thumb(e, 'rthumb', { glyph: 16 });
        node = h('button.row' + (e.type === 'dir' ? '.folder' : '') + (isCur ? '.current' : '') + (watched ? '.watched' : ''), { onclick: open, oncontextmenu: menu, title: e.name }, t, h('span.rname', null, e.name), e.type === 'file' && h('span.rmeta', null, fmtSize(e.size)));
        if (e.type === 'file') io2.observe(t);
      }
      wrap.append(node);
    }
    body.append(wrap);
  }

  function drawRoots() {
    const roots = foldersFor(kind);
    countEl.textContent = `${roots.length} folder${roots.length === 1 ? '' : 's'}`;
    if (!roots.length) {
      body.append(emptyState({
        title: kind === 'video' ? 'Add your videos' : 'Add your music',
        text: 'Pick a folder and it will show up here. You can also drag files or folders into the window, or open a file straight away.',
        actions: [
          h('button.btn.primary', { onclick: async () => { const d = await addFolderFlow(kind); if (d) router.go({ view, dir: d }); } }, 'Add folder'),
          h('button.btn', { onclick: openFilesDialog }, 'Open files…'),
        ],
      }));
      return;
    }
    const wrap = h('div.folder-cards');
    for (const f of roots) {
      wrap.append(h('button.fcard', {
        onclick: () => router.go({ view, dir: f.path }),
        oncontextmenu: (ev) => { ev.preventDefault(); folderMenu({ x: ev.clientX, y: ev.clientY }, { path: f.path }, { onOpen: () => router.go({ view, dir: f.path }), root: f }); },
      }, ico('folder', 28), h('div', null, h('div.n', null, f.name), h('div.p', null, f.path))));
    }
    body.append(wrap);
  }

  if (!dir) { draw(); return; }
  body.append(h('div.none', null, 'Loading…'));
  data = await listDir(dir);
  if (router.route.view !== view || (router.route.dir || null) !== dir) return;
  draw();
}

// ------------------------------------------------------------ home

function mediaCard(item, { sub, onclick } = {}) {
  const entry = { path: item.path, name: item.name, kind: item.kind || 'video', type: 'file' };
  const t = thumb(entry, 'thumb', { duration: true });
  const card = h('button.card', {
    onclick,
    title: item.name,
    oncontextmenu: (ev) => { ev.preventDefault(); fileMenu({ x: ev.clientX, y: ev.clientY }, entry, { onPlay: onclick }); },
  }, t, h('div.name', null, stripExt(item.name)), sub && h('div.sub', null, sub));
  return { card, t };
}

function renderHome(root) {
  const body = h('div.view-body');
  const io2 = observer(body);
  const addBtn = h('button.icon-btn', { title: 'Add', onclick: () => addMenu(addBtn, { align: 'end' }) }, ico('plus', 20));
  root.append(viewHead({ title: 'Home', tools: [addBtn] }), body);

  const st = store.state;
  const resumes = Object.entries(st.resume).sort((a, b) => b[1].ts - a[1].ts).slice(0, 12).map(([path, r]) => ({ path, name: baseName(path), kind: 'video', r }));
  const recents = st.recent.slice(0, 12);

  const playOne = (item) => () => playEntries([{ type: 'file', path: item.path, name: item.name, kind: item.kind }], 0);

  if (resumes.length) {
    const sec = h('section.section', null, h('h2', null, 'Continue watching'));
    const row = h('div.hscroll');
    for (const it of resumes) {
      const left = it.r.d - it.r.t;
      const { card, t } = mediaCard(it, { sub: `${fmtShort(left)} left`, onclick: playOne(it) });
      row.append(card);
      io2.observe(t);
    }
    sec.append(row);
    body.append(sec);
  }
  if (recents.length) {
    const sec = h('section.section', null, h('h2', null, 'Recently played', h('button.link', { onclick: () => router.go({ view: 'recent' }) }, 'See all')));
    const row = h('div.hscroll');
    for (const it of recents) {
      const { card, t } = mediaCard(it, { onclick: playOne(it) });
      row.append(card);
      io2.observe(t);
    }
    sec.append(row);
    body.append(sec);
  }
  if (st.folders.length) {
    const sec = h('section.section', null, h('h2', null, 'Your library'));
    const wrap = h('div.folder-cards');
    for (const f of st.folders) {
      const view = f.kind === 'audio' ? 'music' : 'videos';
      wrap.append(h('button.fcard', { onclick: () => router.go({ view, dir: f.path }) }, ico(f.kind === 'audio' ? 'music' : 'folder', 28), h('div', null, h('div.n', null, f.name), h('div.p', null, f.path))));
    }
    sec.append(wrap);
    body.append(sec);
  }
  if (!body.children.length) {
    body.append(emptyState({
      title: 'Welcome to VLC Redesign',
      text: 'Add a folder of videos or music, or just drop files here to start playing.',
      actions: [
        h('button.btn.primary', { onclick: () => addFolderFlow('video') }, 'Add video folder'),
        h('button.btn', { onclick: () => addFolderFlow('audio') }, 'Add music folder'),
        h('button.btn', { onclick: openFilesDialog }, 'Open files…'),
      ],
    }));
  }
}

// ------------------------------------------------------------ recent

function renderRecent(root) {
  const body = h('div.view-body');
  const io2 = observer(body);
  const clearBtn = h('button.btn.ghost', { onclick: () => { store.update((s) => { s.recent = []; }, 'recent'); renderRecent(clear(root)); } }, 'Clear history');
  root.append(viewHead({ title: 'Recent', count: `${store.state.recent.length} items`, tools: [store.state.recent.length ? clearBtn : null] }), body);
  if (!store.state.recent.length) {
    body.append(emptyState({ title: 'Nothing played yet', text: store.s.saveHistory ? 'Media you play will show up here.' : 'History is turned off in Settings → Privacy.' }));
    return;
  }
  const list = h('div.list.single');
  for (const it of store.state.recent) {
    const entry = { ...it, type: 'file' };
    const t = thumb(entry, 'rthumb', { glyph: 18 });
    const open = () => playEntries([entry], 0);
    list.append(h('button.row', { onclick: open, oncontextmenu: (ev) => { ev.preventDefault(); fileMenu({ x: ev.clientX, y: ev.clientY }, entry, { onPlay: open }); } }, t, h('span.rname', null, it.name), h('span.rmeta', null, ago(it.ts))));
    io2.observe(t);
  }
  body.append(list);
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const d = Math.round(hrs / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ------------------------------------------------------------ network

function renderNetwork(root) {
  const body = h('div.view-body');
  const open = h('button.btn.primary', { onclick: openNetwork }, 'Open network stream…');
  root.append(viewHead({ title: 'Network', tools: [open] }), body);
  const streams = store.state.streams;
  if (!streams.length) {
    body.append(emptyState({
      title: 'Stream from the web',
      text: 'Paste a direct link to a video or audio file (http or https) and it plays right here. Playlists in HLS or DASH format are not supported yet.',
      actions: [h('button.btn.primary', { onclick: openNetwork }, 'Open network stream…')],
    }));
    return;
  }
  const list = h('div.plist');
  for (const s of streams) {
    const play = () => { P.play([P.streamItem(s.url, s.name)], 0); router.go({ view: 'player' }); };
    list.append(h('button.row', {
      onclick: play,
      oncontextmenu: (ev) => { ev.preventDefault(); showMenu({ x: ev.clientX, y: ev.clientY }, [{ label: 'Play', icon: 'play', onClick: play }, { label: 'Remove', icon: 'trash', danger: true, onClick: () => { store.update((st) => { st.streams = st.streams.filter((x) => x.url !== s.url); }, 'streams'); renderNetwork(clear(root)); } }]); },
    }, ico('network', 20), h('span.rname', null, s.name), h('span.rmeta', null, new URL(s.url).host)));
  }
  body.append(list);
}

// ------------------------------------------------------------ playlists

function renderPlaylists(root) {
  const body = h('div.view-body');
  const pls = store.state.playlists;
  root.append(viewHead({ title: 'Playlists', count: `${pls.length} item${pls.length === 1 ? '' : 's'}` }), body);
  const list = h('div.plist');
  list.append(h('button.row.create', { onclick: async () => { const p = await newPlaylist(); if (p) router.go({ view: 'playlist', id: p.id }); } }, ico('plus', 20), h('span.rname', null, 'Create playlist')));
  for (const p of pls) {
    list.append(h('button.row', {
      onclick: () => router.go({ view: 'playlist', id: p.id }),
      oncontextmenu: (ev) => { ev.preventDefault(); showMenu({ x: ev.clientX, y: ev.clientY }, [{ label: 'Play', icon: 'play', onClick: () => playPlaylist(p.id), disabled: !p.items.length }, { label: 'Rename', icon: 'edit', onClick: () => renamePlaylist(p.id) }, { label: 'Delete', icon: 'trash', danger: true, onClick: () => deletePlaylist(p.id) }]); },
    }, ico('playlist', 20), h('span.rname', null, p.name), h('span.rmeta', null, `${p.items.length} item${p.items.length === 1 ? '' : 's'}`)));
  }
  body.append(list);
}

function renderPlaylist(root, route) {
  const p = store.state.playlists.find((x) => x.id === route.id);
  if (!p) { router.go({ view: 'playlists' }); return; }
  const body = h('div.view-body');
  const io2 = observer(body);
  const tools = [
    h('button.btn.primary', { disabled: !p.items.length, onclick: () => playPlaylist(p.id) }, ico('play', 16), 'Play'),
    iconButton('edit', { title: 'Rename', onclick: () => renamePlaylist(p.id) }),
    iconButton('trash', { title: 'Delete playlist', onclick: () => deletePlaylist(p.id) }),
  ];
  root.append(viewHead({ crumbs: [{ name: 'Playlists', go: () => router.go({ view: 'playlists' }) }, { name: p.name }], count: `${p.items.length} items`, tools }), body);
  if (!p.items.length) {
    body.append(emptyState({ title: 'This playlist is empty', text: 'Right-click any video or song and choose “Add to playlist”.' }));
    return;
  }
  const list = h('div.list.single');
  p.items.forEach((it, i) => {
    const entry = { ...it, type: 'file' };
    const t = it.url ? h('div.rthumb', { html: icon('network', 18) }) : thumb(entry, 'rthumb', { glyph: 18 });
    const remove = iconButton('close', { title: 'Remove from playlist', size: 16, onclick: (ev) => { ev.stopPropagation(); store.update((s) => { s.playlists.find((x) => x.id === p.id).items.splice(i, 1); }, 'playlists'); renderPlaylist(clear(root), route); } });
    list.append(h('button.row', { onclick: () => playPlaylist(p.id, i) }, t, h('span.rname', null, stripExt(it.name)), remove));
    if (!it.url) io2.observe(t);
  });
  body.append(list);
}

// ------------------------------------------------------------ entry

export function renderView(root, route) {
  clear(root);
  switch (route.view) {
    case 'videos': case 'music': return renderBrowse(root, route);
    case 'home': return renderHome(root);
    case 'recent': return renderRecent(root);
    case 'network': return renderNetwork(root);
    case 'playlists': return renderPlaylists(root);
    case 'playlist': return renderPlaylist(root, route);
  }
}
