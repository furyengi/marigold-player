# VLC Redesign

A desktop media player built from the **VLC Redesign (Community)** design on Figma: dark, calm, orange-accented, with a proper music view, a mini player, a customizable control bar and a real settings window.

> **Unofficial fan project.** It is not affiliated with or endorsed by VideoLAN. "VLC" and the traffic-cone logo are trademarks of VideoLAN. The player runs on the Chromium media engine that ships with Electron — it is *not* libVLC — so its codec support is that of Chrome (see [Supported formats](#supported-formats)).

## Download

Grab the installer for your system from the [latest release](https://github.com/furyengi/vlc-redesign/releases/latest):

| System  | File |
| ------- | ---- |
| Windows | `VLC Redesign-Setup-x.y.z-x64.exe` (installer) or `VLC Redesign-x.y.z-portable-x64.exe` (no install) |
| macOS   | `.dmg` (Intel and Apple Silicon) |
| Linux   | `.AppImage` or `.deb` |

The builds are not code-signed yet, so your OS will warn you the first time:

- **Windows** – SmartScreen: *More info → Run anyway*.
- **macOS** – right-click the app → *Open*, or run `xattr -cr "/Applications/VLC Redesign.app"` once.
- **Linux** – `chmod +x` the AppImage and run it.

## Features

- **Library** – add video and music folders, browse them as thumbnail grids or lists, sort, search, and see watch progress on each video.
- **Player** – click-to-pause, double-click fullscreen, hover seek preview, volume wedge, playback speed, snapshots, picture-in-picture, shuffle / repeat and a queue sidebar.
- **Music view** – embedded cover art, blurred backdrop and a waveform seek bar.
- **Mini player** – keep playing while you browse.
- **Effects** – 10-band equalizer with presets, preamp, and brightness / contrast / saturation / hue.
- **Subtitles** – picks up `.srt`, `.vtt` and `.ass` files next to the video, or add one by hand.
- **Playlists, history and resume** – pick up long videos where you stopped.
- **Network streams** – paste a direct http(s) link to a media file.
- **Customization** – dark / light / system theme, nine accent colors, and choose which extra buttons appear in the control bar.
- Drag & drop files or folders anywhere, open files from the OS ("Open with…"), media keys, single-instance.

Press **F1** in the app for every keyboard shortcut.

## Supported formats

Playback uses Chromium's decoders: H.264, VP8/VP9, AV1, AAC, MP3, FLAC, Opus, Vorbis and WAV in MP4, WebM, MKV, MOV, Ogg and friends. Files that need codecs Chromium does not ship (HEVC/H.265 on most machines, AC-3, DTS, WMV, FLV…) show a message instead of playing. Playlist protocols such as HLS and DASH are not supported yet.

## Develop

Requires Node.js 20+.

```bash
npm install
npm start
```

Project layout:

```
main.js          Electron main process: window, file system access, media:// protocol
preload.js       the small, audited bridge exposed to the page as window.vlc
src/index.html   app shell
src/css/         theme tokens + layout, views, dialogs
src/js/          player core, library, views, dialogs (plain ES modules, no bundler)
assets/          logo, fonts, idle artwork
```

## Build installers

```bash
npm run icon       # re-render build/icon.png from assets/cone.svg (only when the logo changes)
npm run dist       # installers for the OS you are on, written to dist/
```

### Publishing a release

Pushing a version tag builds Windows, macOS and Linux installers on GitHub Actions and attaches them to a release:

```bash
npm version patch          # or minor / major – bumps package.json and creates the tag
git push --follow-tags
```

## Credits

- Design: *VLC Redesign (Community)* on Figma.
- Built with [Electron](https://www.electronjs.org/) and [music-metadata](https://github.com/Borewit/music-metadata). Inter typeface by Rasmus Andersson (SIL OFL).

## License

[MIT](LICENSE) for the code in this repository. VLC branding belongs to VideoLAN.
