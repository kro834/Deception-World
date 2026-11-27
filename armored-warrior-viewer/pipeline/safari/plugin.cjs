// Verifies the proposed GLTFLoader plugin (strip normal / metallicRoughness / occlusion refs in
// beforeRoot) by serving a patched viewer.js through request interception. Nothing under work/ changes.
// Counts decoded glTF images (blob: fetches of the ImageBitmap path) and compares settled frames.
const { chromium } = require('playwright');
const path = require('path');
const PLUGIN = `const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  loader.register((parser) => ({ name: 'strip-unused-maps', beforeRoot() {
    for (const m of parser.json.materials || []) { delete m.normalTexture; delete m.occlusionTexture; if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    return null;
  } }));`;
async function run(browser, patch, mode) {
  const context = await browser.newContext({ viewport: { width: 700, height: 860 } });
  const page = await context.newPage();
  let blobs = 0, bytes = 0, counting = mode === 'standard';
  page.on('requestfinished', async (r) => { if (!counting) return; if (r.url().startsWith('blob:')) blobs++; else if (/model-v10/.test(r.url())) { try { bytes += (await r.sizes()).responseBodySize; } catch (e) {} } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  if (patch) await page.route('**/work/viewer.js*', async (route) => {
    const response = await route.fetch(); const text = await response.text();
    const body = text.replace('const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);', PLUGIN);
    if (body === text) throw new Error('patch did not apply');
    await route.fulfill({ response, body });
  });
  await page.goto('http://localhost:8765/work/');
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  if (mode === 'detail') {
    counting = true;
    await page.click('#quality');
    await page.waitForFunction(() => { const q = document.querySelector('#quality'); return !q.disabled && q.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 400000 });
    await page.evaluate(() => window.__viewer.whenSettled());
  }
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => window.__viewer.state());
  const shot = await page.locator('#stage').screenshot();
  await context.close();
  return { patch, mode, blobs, tier: state.tier, maps: state.maps, errors, shot };
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = [];
  for (const mode of ['standard', 'detail']) for (const patch of [false, true]) out.push(await run(browser, patch, mode));
  const page = await (await browser.newContext()).newPage();
  for (const mode of ['standard', 'detail']) {
    const [a, b] = out.filter((r) => r.mode === mode);
    const diff = await page.evaluate(async ([x, y]) => {
      const load = async (d) => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
      const p = await load(x), q = await load(y); let max = 0;
      for (let k = 0; k < p.length; k += 4) for (let c = 0; c < 3; c++) max = Math.max(max, Math.abs(p[k + c] - q[k + c]));
      return max;
    }, [a.shot.toString('base64'), b.shot.toString('base64')]);
    console.log(mode, 'max channel diff', diff);
  }
  for (const r of out) { delete r.shot; console.log(JSON.stringify(r)); }
  await browser.close();
})();
