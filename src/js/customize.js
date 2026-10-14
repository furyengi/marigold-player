import { store, DEFAULT_LAYOUT } from './store.js';
import { h, clear, modal } from './ui.js';
import { icon } from './icons.js';
import { ITEMS, ITEM_ORDER } from './items.js';

const ZONES = [
  ['top', 'Top bar', 'Buttons next to the logo while a video or song is open'],
  ['left', 'Controls, left of the seek bar', ''],
  ['right', 'Controls, right of the seek bar', ''],
];
const REPEATABLE = new Set(['spacer', 'divider']);

const glyph = (id) => { const d = ITEMS[id]; return d.html ? d.html() : icon(d.icon, 20); };

/** Drag items between the palette and the three bars. Native drag and drop, no dependencies. */
export function openCustomize() {
  const layout = structuredClone(store.state.player.layout);
  let drag = null; // { id, zone }

  const used = () => new Set(Object.values(layout).flat());
  const body = h('div.dlg-body');

  function chip(id, zone) {
    const d = ITEMS[id];
    const el = h('div.cust-chip' + (zone ? '.placed' : ''), { draggable: 'true', title: d.label });
    el.innerHTML = glyph(id);
    el.append(h('span', null, d.label));
    el.addEventListener('dragstart', (e) => { drag = { id, zone }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setTimeout(() => el.classList.add('dragging'), 0); });
    el.addEventListener('dragend', () => { drag = null; draw(); });
    return el;
  }

  function insertAt(container, x) {
    const kids = [...container.querySelectorAll('.cust-chip:not(.dragging)')];
    let idx = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (x < r.left + r.width / 2) { idx = i; break; }
    }
    return idx;
  }

  function drop(zoneName, container, e) {
    e.preventDefault();
    if (!drag) return;
    const idx = insertAt(container, e.clientX);
    if (drag.zone) layout[drag.zone].splice(layout[drag.zone].indexOf(drag.id), 1);
    // Removing an earlier item from the same bar shifts the insertion point left by one.
    const target = layout[zoneName];
    const at = drag.zone === zoneName && target.indexOf(drag.id) >= 0 ? idx : Math.min(idx, target.length);
    if (!REPEATABLE.has(drag.id) && used().has(drag.id)) { drag = null; draw(); return; }
    target.splice(at, 0, drag.id);
    drag = null;
    draw();
  }

  function zoneEl(name, title, hint) {
    const box = h('div.cust-zone');
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { box.classList.remove('over'); drop(name, box, e); });
    if (!layout[name].length) box.append(h('span.cust-empty', null, 'Drop items here'));
    layout[name].forEach((id) => box.append(chip(id, name)));
    return h('div', null, h('div.cust-label', null, title, hint && h('small', null, hint)), box);
  }

  function draw() {
    clear(body);
    body.append(h('p.dlg-note', null, 'Drag items between the boxes to re-order them, and drag them onto the item list to remove them from the player.'));
    for (const [name, title, hint] of ZONES) body.append(zoneEl(name, title, hint));
    const free = ITEM_ORDER.filter((id) => REPEATABLE.has(id) || !used().has(id));
    const palette = h('div.cust-palette');
    palette.addEventListener('dragover', (e) => { if (drag && drag.zone) e.preventDefault(); });
    palette.addEventListener('drop', (e) => {
      e.preventDefault();
      if (drag && drag.zone) { layout[drag.zone].splice(layout[drag.zone].indexOf(drag.id), 1); drag = null; draw(); }
    });
    if (!free.length) palette.append(h('span.cust-empty', null, 'Every item is in use'));
    for (const id of free) palette.append(chip(id, null));
    body.append(h('div.cust-label', null, 'Available items', h('small', null, 'Spacers and dividers can be used more than once')), palette);
  }
  draw();

  const m = modal({
    title: 'Customize player',
    width: 880,
    body,
    footer: h('div.dlg-foot', null,
      h('button.btn.ghost', { style: { marginRight: 'auto' }, onclick: () => { for (const k of Object.keys(DEFAULT_LAYOUT)) layout[k] = [...DEFAULT_LAYOUT[k]]; draw(); } }, 'Reset to default'),
      h('button.btn.ghost', { onclick: () => m.close() }, 'Cancel'),
      h('button.btn.primary', { onclick: () => { store.update((s) => { s.player.layout = layout; }, 'player'); m.close(); } }, 'Save')),
  });
  return m;
}
