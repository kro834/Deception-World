#!/usr/bin/env node
// Low-resolution turntable preview: orbits the camera with window.__viewer.setOrbit and writes frames,
// then (with ffmpeg) an animated WebP and an MP4.
//
//   node tools/turntable.cjs --url http://localhost:8765/work/ --out shots/preview-01
//     [--size 360x450] [--dpr 1] [--frames 36] [--polar 82] [--fps 12] [--mode standard|detail]
//
// Needs the viewer's test hooks (window.__viewer.setOrbit / whenSettled). Software GL: timings mean nothing.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[key] = true;
  else { args[key] = next; i++; }
}
const url = args.url || 'http://localhost:8765/work/';
const out = path.resolve(args.out || 'shots/preview-tmp');
const [width, height] = (args.size || '360x450').split('x').map(Number);
const dpr = Number(args.dpr || 1);
const frames = Number(args.frames || 36);
const polar = Number(args.polar || 82);
const fps = Number(args.fps || 12);
const mode = args.mode || 'standard';
const timeout = Number(args.timeout || 300000);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  // ?capture pins the stage to exactly width x height CSS pixels and hides the chrome inside it.
  const page = await browser.newPage({ viewport: { width: Math.max(width, 480), height: Math.max(height, 480) }, deviceScaleFactor: dpr });
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error.message)));
  const target = new URL(url);
  target.searchParams.set('capture', `${width}x${height}`);
  await page.goto(target.href, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout });
  if (mode === 'detail') {
    await page.click('#quality');
    await page.waitForFunction(() => {
      const button = document.querySelector('#quality');
      return button && !button.disabled && button.getAttribute('aria-pressed') === 'true';
    }, null, { timeout });
  }
  const hasHooks = await page.evaluate(() => !!(window.__viewer && window.__viewer.setOrbit && window.__viewer.whenSettled));
  if (!hasHooks) throw new Error('window.__viewer test hooks are missing');
  for (let frame = 0; frame < frames; frame++) {
    const azimuth = (360 * frame) / frames;
    await page.evaluate(async ({ azimuth, polar }) => {
      window.__viewer.setOrbit(azimuth, polar);
      await window.__viewer.whenSettled();
    }, { azimuth, polar });
    await page.waitForTimeout(60);
    await page.locator('#stage').screenshot({ path: path.join(out, `f${String(frame).padStart(3, '0')}.png`) });
  }
  await browser.close();
  const pattern = path.join(out, 'f%03d.png');
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', pattern, '-vf', even,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', path.join(out, 'turntable.mp4')]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', pattern,
      '-loop', '0', '-quality', '70', path.join(out, 'turntable.webp')]);
  } catch (error) {
    problems.push(`ffmpeg: ${error.message}`);
  }
  console.log(`frames: ${frames} -> ${out}  problems: ${problems.length}`);
  for (const problem of problems) console.log(`  ${problem}`);
})().catch((error) => {
  console.error('turntable.cjs failed:', error.message);
  process.exit(1);
});
