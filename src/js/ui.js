import { icon } from './icons.js';
import { store } from './store.js';

/** Tiny hyperscript helper: h('div.card', { onclick }, child, 'text') */
export function h(tag, props, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { el.replaceChildren(); return el; };
export const ico = (name, size = 20) => h('span', { html: icon(name, size), style: { display: 'contents' } });

export function iconButton(name, { title, onclick, cls = '', size = 20 } = {}) {
  return h(`button.icon-btn${cls ? '.' + cls.split(' ').join('.') : ''}`, { title, onclick, 'aria-label': title, html: icon(name, size) });
}

// ---------------------------------------------------------------- formatting

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function fmtShort(sec) {
  if (!Number.isFinite(sec)) return '';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const baseName = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;
export const stripExt = (n) => n.replace(/\.[^.]+$/, '');
export const dirName = (p) => { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : p; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Stable colour pair derived from a string, used for generated artwork. */
export function artGradient(seed) {
  let hsh = 0;
  for (let i = 0; i < seed.length; i++) hsh = (hsh * 31 + seed.charCodeAt(i)) >>> 0;
  const a = hsh % 360;
  const b = (a + 40 + (hsh >> 8) % 60) % 360;
  return `linear-gradient(135deg, hsl(${a} 45% 22%), hsl(${b} 50% 12%))`;
}

// ---------------------------------------------------------------- toast

export function toast(msg, ms = 2600) {
  const root = $('#toasts');
  const t = h('div.toast', null, msg);
  root.append(t);
  setTimeout(() => t.classList.add('fade'), ms);
  setTimeout(() => t.remove(), ms + 350);
}

// ---------------------------------------------------------------- popover menu

let openMenu = null;
export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escClose, true); }
}
const outside = (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); };
const escClose = (e) => { if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); } };

/**
 * items: { label, icon?, kbd?, checked?, danger?, disabled?, onClick } | { sep: true } | { heading }
 * anchor: Element or {x,y}. Menu opens above anchors that sit near the bottom of the window.
 */
export function showMenu(anchor, items, { align = 'start', minWidth } = {}) {
  closeMenu();
  const m = h('div.popover');
  if (minWidth) m.style.minWidth = minWidth + 'px';
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h('div.menu-sep')); continue; }
    if (it.heading) { m.append(h('div.menu-label', null, it.heading)); continue; }
    const b = h('button.menu-item' + (it.danger ? '.danger' : ''), {
      disabled: it.disabled,
      onclick: () => { closeMenu(); it.onClick && it.onClick(); },
    });
    b.innerHTML = (it.icon ? icon(it.icon, 18) : '<span style="width:18px"></span>');
    b.append(h('span', null, it.label));
    if (it.kbd) b.append(h('span.kbd', null, it.kbd));
    if (it.checked) b.append(h('span.chk', { html: icon('check', 16) }));
    m.append(b);
  }
  document.body.append(m);
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  let x = align === 'end' ? r.right - mw : r.left;
  let y = r.bottom + 6;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  x = clamp(x, 8, innerWidth - mw - 8);
  m.style.left = x + 'px';
  m.style.top = y + 'px';
  openMenu = m;
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escClose, true);
  });
  return m;
}

// ---------------------------------------------------------------- modal

const stack = [];
export function modal({ title, body, footer, className = '', width, onClose, closable = true, head = true }) {
  closeMenu();
  const backdrop = h('div.backdrop');
  const dlg = h('div.dialog' + (className ? '.' + className.split(' ').join('.') : ''));
  if (width) dlg.style.width = width + 'px';
  if (head) {
    dlg.append(h('div.dlg-head', null, h('h2', null, title || ''), closable && iconButton('close', { title: 'Close', onclick: () => api.close() })));
  }
  if (body) dlg.append(body);
  if (footer) dlg.append(footer);
  backdrop.append(dlg);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop && closable) api.close(); });
  $('#overlays').append(backdrop);
  const api = {
    el: dlg,
    close() {
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      backdrop.remove();
      onClose && onClose();
    },
    closable,
  };
  stack.push(api);
  return api;
}
export const topModal = () => stack[stack.length - 1];
export const hasModal = () => stack.length > 0;

// ---------------------------------------------------------------- form widgets

export function toggle(value, onChange) {
  const el = h('div.toggle' + (value ? '.on' : ''), { role: 'switch', tabindex: 0, 'aria-checked': String(!!value) }, h('i'), h('b', null, value ? 'ON' : 'OFF'));
  const flip = () => {
    value = !value;
    el.classList.toggle('on', value);
    el.setAttribute('aria-checked', String(value));
    el.querySelector('b').textContent = value ? 'ON' : 'OFF';
    onChange(value);
  };
  el.addEventListener('click', flip);
  el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  return el;
}

export function segmented(options, value, onChange) {
  const el = h('div.segmented');
  const render = () => {
    clear(el);
    for (const [v, label] of options) {
      el.append(h('button' + (v === value ? '.on' : ''), { onclick: () => { value = v; render(); onChange(v); } }, label));
    }
  };
  render();
  return el;
}

export function select(options, value, onChange) {
  const el = h('select.select', { onchange: () => onChange(el.value) });
  for (const [v, label] of options) el.append(h('option', { value: String(v), selected: String(v) === String(value) }, label));
  return el;
}

export function range({ min, max, step = 1, value, onInput, cls = '' }) {
  return h('input.range' + (cls ? '.' + cls : ''), { type: 'range', min, max, step, value, oninput: (e) => onInput(Number(e.target.value)) });
}

export const confirmBox = (title, text, okLabel = 'OK', danger = false, always = false) => new Promise((resolve) => {
  // Users can turn confirmations off for routine actions; irreversible resets always ask.
  if (!always && danger && store.s.confirmDialogs === false) { resolve(true); return; }
  let done = false;
  const finish = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
  const m = modal({
    title,
    width: 420,
    onClose: () => { if (!done) { done = true; resolve(false); } },
    body: h('div.dlg-body', null, h('p.dlg-note', null, text)),
    footer: h('div.dlg-foot', null, h('button.btn.ghost', { onclick: () => finish(false) }, 'Cancel'), h('button.btn' + (danger ? '' : '.primary'), { style: danger ? { background: 'var(--danger)', color: '#fff' } : null, onclick: () => finish(true) }, okLabel)),
  });
});

export function promptBox({ title, label, value = '', okLabel = 'Save', placeholder = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input.input', { value, placeholder, spellcheck: 'false' });
    const finish = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
    const m = modal({
      title,
      width: 460,
      onClose: () => { if (!done) { done = true; resolve(null); } },
      body: h('div.dlg-body', null, h('div.field', null, h('label', null, label), input)),
      footer: h('div.dlg-foot', null, h('button.btn.ghost', { onclick: () => finish(null) }, 'Cancel'), h('button.btn.primary', { onclick: () => finish(input.value.trim() || null) }, okLabel)),
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value.trim() || null); });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}
