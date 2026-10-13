// Line icon set drawn on a 24px grid. Stroke icons inherit `currentColor`.
const P = {
  home: '<path d="M4 11l8-6.5 8 6.5v8a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z"/>',
  video: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M10 9.3v5.4l4.6-2.7z" fill="currentColor"/>',
  music: '<path d="M9 18V6.2l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  network: '<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.7 5.7a8.9 8.9 0 0 0 0 12.6M18.3 5.7a8.9 8.9 0 0 1 0 12.6"/>',
  playlist: '<path d="M4 6.5h12M4 11.5h12M4 16.5h6"/><path d="M14.5 14l5.5 3.2-5.5 3.2z" fill="currentColor"/>',
  history: '<path d="M4.2 12a7.8 7.8 0 1 0 2.4-5.6"/><path d="M4 4.5v4.2h4.2"/><path d="M12 8v4.2l2.8 1.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path d="M4.5 5.5h4v13h-4z" fill="currentColor" stroke="none"/>',
  folder: '<path d="M3.5 7.2a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  dots: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  minimize: '<path d="M6 12h12"/>',
  maximize: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  restore: '<rect x="5" y="9" width="10" height="10" rx="1.5"/><path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5H17.5A1.5 1.5 0 0 1 19 6.5V13.5a1.5 1.5 0 0 1-1.5 1.5H15"/>',
  fullscreen: '<path d="M5 9.5V5h4.5M19 9.5V5h-4.5M5 14.5V19h4.5M19 14.5V19h-4.5"/>',
  exitFullscreen: '<path d="M9.5 5v4.5H5M14.5 5v4.5H19M9.5 19v-4.5H5M14.5 19v-4.5H19"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  prev: '<path d="M6.5 5.5v13" stroke-width="2"/><path d="M18.5 6v12L9 12z" fill="currentColor"/>',
  next: '<path d="M17.5 5.5v13" stroke-width="2"/><path d="M5.5 6v12L15 12z" fill="currentColor"/>',
  play: '<path d="M8 5.2v13.6l11-6.8z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  volumeLow: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.2 9.2a4 4 0 0 1 0 5.6"/>',
  volumeMute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  equalizer: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3"/>',
  subtitles: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M7 12h3.5M13 12h4M7 15.2h5.5M15 15.2h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  queue: '<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.5" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="17.5" r=".9" fill="currentColor"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  listview: '<rect x="4" y="5" width="4" height="4" rx="1"/><path d="M11.5 7h8.5"/><rect x="4" y="15" width="4" height="4" rx="1"/><path d="M11.5 17h8.5"/>',
  sort: '<path d="M7 20V5M3.5 8.5L7 5l3.5 3.5M17 4v15M13.5 15.5L17 19l3.5-3.5"/>',
  search: '<circle cx="11" cy="11" r="6.3"/><path d="M15.8 15.8l4.4 4.4"/>',
  shuffle: '<path d="M3 7h3.5c4.8 0 4.8 10 10 10H21M3 17h3.5c1.7 0 2.8-.9 3.7-2.1M13.7 8.9C14.6 7.8 15.6 7 17 7h4M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>',
  repeat: '<path d="M17 3.5l3 3-3 3M4 11V9.5a3 3 0 0 1 3-3h13M7 20.5l-3-3 3-3M20 13v1.5a3 3 0 0 1-3 3H4"/>',
  repeatOne: '<path d="M17 3.5l3 3-3 3M4 11V9.5a3 3 0 0 1 3-3h13M7 20.5l-3-3 3-3M20 13v1.5a3 3 0 0 1-3 3H4"/><path d="M11 10.6l1.4-1v5.4" stroke-width="1.4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.3"/><circle cx="12" cy="7.9" r=".6" fill="currentColor"/>',
  speed: '<path d="M4.6 17.2a8.2 8.2 0 1 1 14.8 0"/><path d="M12 13.5l3.6-3.6"/><circle cx="12" cy="13.8" r="1" fill="currentColor"/>',
  skipBack: '<path d="M12 4.8a7.2 7.2 0 1 1-7.2 7.2"/><path d="M12 1.8L8.4 4.8 12 7.8z" fill="currentColor"/>',
  skipFwd: '<path d="M12 4.8A7.2 7.2 0 1 0 19.2 12"/><path d="M12 1.8l3.6 3L12 7.8z" fill="currentColor"/>',
  snapshot: '<path d="M4 8.5V6.5a2 2 0 0 1 2-2h2M16 4.5h2a2 2 0 0 1 2 2v2M20 15.5v2a2 2 0 0 1-2 2h-2M8 19.5H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  pip: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><rect x="11.5" y="11.5" width="6" height="4.5" rx="1" fill="currentColor"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  sliders: '<path d="M5 4v6M5 14v6M12 4v2M12 10v10M19 4v10M19 18v2"/><path d="M3 12h4M10 8h4M17 16h4"/>',
  cursor: '<path d="M5.5 3.5l13 6.6-5.8 1.9-1.9 5.8z"/>',
  shield: '<path d="M12 3.2l7.5 2.8v5.6c0 4.4-3 7.6-7.5 9.2-4.5-1.6-7.5-4.8-7.5-9.2V6z"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 14h10"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/>',
  library: '<path d="M3.5 7.2a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/>',
  warn: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  eject: '<path d="M5 15.5h14L12 6z"/><path d="M5 19.5h14"/>',
};

export function icon(name, size = 20, extra = '') {
  const body = P[name];
  if (!body) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
}

// Skip icons carry the step in seconds, e.g. a circular arrow reading "10".
export function skipIcon(dir, secs, size = 22) {
  const arrow = dir < 0 ? P.skipBack : P.skipFwd;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${arrow}<text x="12" y="16.4" font-size="7.4" font-weight="600" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter, sans-serif">${secs}</text></svg>`;
}

export const hasIcon = (n) => n in P;
