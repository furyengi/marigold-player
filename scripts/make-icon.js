// Renders build/icon.png (512x512) from assets/logo.svg. Run with: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  process.on('unhandledRejection', (e) => { console.error(e); app.exit(1); });
  const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.svg'), 'utf8');
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  const html = `<style>html,body{margin:0;background:transparent}
    .tile{width:512px;height:512px;border-radius:115px;background:linear-gradient(160deg,#242424,#101010);display:grid;place-items:center;box-shadow:inset 0 0 0 4px rgba(255,255,255,.05)}
    img{width:340px;height:340px}</style><div class="tile"><img src="${uri}"></div>`;
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.toPNG());
  console.log('wrote build/icon.png', img.getSize());
  app.quit();
});
