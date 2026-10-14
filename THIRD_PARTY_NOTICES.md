# Third-party notices

Marigold Player's own code is released under the MIT license (see `LICENSE`). It ships with and depends on
the following third-party software.

## FFmpeg (bundled program) — GPL v3

Formats the built-in browser engine cannot play (HEVC, AC-3, DTS, AVI, WMV, FLV, MPEG-TS and others) are
converted on the fly by an **FFmpeg** executable that is installed with the app (via the
[`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) package). Marigold Player starts it as a
separate program and talks to it only through command-line arguments and pipes; it is not linked into the app.

The bundled build is licensed under the **GNU General Public License v3** (it includes libx264 and other GPL
components). The license text and build information are shipped next to the executable
(`resources/app.asar.unpacked/node_modules/ffmpeg-static/`, files `ffmpeg*.LICENSE` and `ffmpeg*.README`).
Corresponding source code for FFmpeg is available from <https://ffmpeg.org/download.html>, and the exact
build sources are listed in the build README shipped with the executable. FFmpeg is a trademark of Fabrice Bellard.

If you only want the MIT-licensed code, set `compat` off in Settings -> Playback or delete the
`ffmpeg-static` folder; the player then plays whatever the Chromium engine supports.

## Electron and Chromium

[Electron](https://www.electronjs.org/) (MIT) bundles Chromium and its third-party components. The full list of
licenses is included in the installed app as `LICENSES.chromium.html`.

## music-metadata

[music-metadata](https://github.com/Borewit/music-metadata) — MIT.

## Inter typeface

[Inter](https://rsms.me/inter/) by Rasmus Andersson — SIL Open Font License 1.1 (`assets/fonts/inter.woff2`).
