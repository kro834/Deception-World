#!/usr/bin/env node
// Poster stills: captures the seven preset views from the live viewer in its ?capture mode and
// writes them as WebP, delivered atomically (temp name, then rename).
//
//   node tools/posters.cjs --out work/previews-v15  --capture 720      (square, 1440² at dpr 2)
//   node tools/posters.cjs --out work/previews-v15p --capture 450x720  (portrait, 900×1440 at dpr 2)
//     [--url http://localhost:8765/work/] [--dpr 2] [--quality 88] [--views front,rear,...] [--keep-png dir]
//
// Software GL: the pictures are right, the timings mean nothing.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else { args[key] = next; i++; }
}
const base = args.url || 'http://localhost:8765/work/';
const capture = String(args.capture || '720');
if (!/^\d{2,4}(x\d{2,4})?$/.test(capture)) throw new Error('--capture must be N or WxH');
const [cw, ch] = capture.includes('x') ? capture.split('x').map(Number) : [Number(capture), Number(capture)];
const out = path.resolve(args.out || 'shots/posters-tmp');
const dpr = Number(args.dpr || 2);
const quality = String(args.quality || 88);
const views = (args.views || 'front,rear,side,face,chest,belt,belt-rear').split(',').filter(Boolean);
const timeout = Number(args.timeout || 300000);
const pngDir = args['keep-png'] ? path.resolve(args['keep-png']) : fs.mkdtempSync(path.join(os.tmpdir(), 'posters-'));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(pngDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: { width: Math.max(cw, 900), height: Math.max(ch, 900) },
    deviceScaleFactor: dpr,
  });
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error.message)));
  const url = new URL(base);
  url.searchParams.set('capture', capture);
  await page.goto(url.href, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout });
  for (const view of views) {
    await page.evaluate(async (name) => {
      document.querySelector(`[data-view="${name}"]`).click();
      await window.__viewer.whenSettled();
    }, view);
    await page.waitForTimeout(150);
    const png = path.join(pngDir, `${view}.png`);
    await page.locator('#stage').screenshot({ path: png });
    const tmp = path.join(out, `.${view}.tmp.webp`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', quality,
      '-compression_level', '6', '-preset', 'picture', tmp]);
    fs.renameSync(tmp, path.join(out, `${view}.webp`));
    console.log(`${view}: ${fs.statSync(path.join(out, `${view}.webp`)).size} bytes`);
  }
  const state = await page.evaluate(() => window.__viewer.state());
  await browser.close();
  console.log(`posters: ${views.length} -> ${out}  (${cw}x${ch} css px at dpr ${dpr}, tier ${state.tier})  problems: ${problems.length}`);
  for (const problem of problems) console.log(`  ${problem}`);
})().catch((error) => {
  console.error('posters.cjs failed:', error.message);
  process.exit(1);
});
