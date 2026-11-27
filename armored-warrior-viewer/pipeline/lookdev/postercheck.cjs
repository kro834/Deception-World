// Poster variant + capture checks for work/viewer.js.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const run = async (name, viewport, url, routes) => {
    const p = await b.newPage({ viewport });
    const requested = [];
    p.on('request', (r) => { if (/previews-/.test(r.url())) requested.push(r.url().replace(/^.*\/work\//, '')); });
    for (const [pattern, handler] of routes || []) await p.route(pattern, handler);
    await p.goto(url);
    await p.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
    await p.evaluate(() => window.__viewer.whenSettled());
    const info = await p.evaluate(() => { const s = document.querySelector('#stage'), i = document.querySelector('#poster'); return { stage: [s.clientWidth, s.clientHeight], ratio: i.style.getPropertyValue('--poster-ratio'), src: i.src.replace(/^.*\/work\//, ''), hidden: i.hidden }; });
    console.log(name, JSON.stringify(info), 'requested', JSON.stringify([...new Set(requested)]));
    await p.close();
  };
  const base = 'http://localhost:8765/work/';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await run('landscape stage      ', { width: 1280, height: 800 }, base);
  await run('portrait, set missing', { width: 428, height: 926 }, base);
  await run('portrait, set present', { width: 428, height: 926 }, base, [['**/previews-v15p/*.webp', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png })]]);
  await run('capture=450x720      ', { width: 900, height: 900 }, base + '?capture=450x720');
  await run('capture=720          ', { width: 900, height: 900 }, base + '?capture=720');
  await b.close();
})();
