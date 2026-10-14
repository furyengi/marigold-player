// Used by the release workflow: builds installers for the current OS.
// macOS gets one build per CPU architecture because each needs its own ffmpeg binary.
//   node scripts/ci-build.js always   (publish to the GitHub release)
//   node scripts/ci-build.js never    (just build)
const { spawnSync } = require('child_process');
const fs = require('fs');

const publish = process.argv[2] || 'never';
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status) process.exit(r.status);
};
const build = (extra) => run('npx', ['electron-builder', ...extra, '--publish', publish]);

if (process.platform === 'darwin') {
  const archs = process.arch === 'arm64' ? ['arm64', 'x64'] : ['x64', 'arm64'];
  build(['--mac', `--${archs[0]}`]);
  // Swap in the ffmpeg that matches the second architecture, then build again.
  fs.rmSync('node_modules/ffmpeg-static/ffmpeg', { force: true });
  run('node', ['node_modules/ffmpeg-static/install.js'], { npm_config_arch: archs[1] });
  build(['--mac', `--${archs[1]}`]);
} else {
  build([]);
}
