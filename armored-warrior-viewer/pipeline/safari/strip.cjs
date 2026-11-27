// Simulates the proposed fix "do not let GLTFLoader fetch the PBR maps the shader never reads":
// detail-v14.gltf is served with normalTexture / metallicRoughnessTexture / occlusionTexture removed
// (request interception only; nothing under work/ changes). Compares bytes and the settled picture.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, '../../shots/safari-01');
async function run(browser, strip) {
  const context = await browser.newContext({ viewport: { width: 700, height: 860 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let bytes = 0; let count = 0; let counting = false;
  page.on('requestfinished', async (r) => { if (!counting) return; try { bytes += (await r.sizes()).responseBodySize; count++; } catch (e) {} });
  if (strip) await page.route('**/detail-v14.gltf', async (route) => {
    const response = await route.fetch(); const json = await response.json();
    for (const m of json.materials) { delete m.normalTexture; delete m.occlusionTexture; if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    await route.fulfill({ response, body: JSON.stringify(json) });
  });
  await page.goto('http://localhost:8765/work/');
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  counting = true;
  await page.click('#quality');
  await page.waitForFunction(() => { const q = document.querySelector('#quality'); return !q.disabled && q.getAttribute('aria-pressed') === 'true'; }, null, { timeout: 400000 });
  await page.evaluate(() => window.__viewer.whenSettled());
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => window.__viewer.state());
  const shot = await page.locator('#stage').screenshot({ path: path.join(OUT, `detail-${strip ? 'stripped' : 'asis'}.png`) });
  await context.close();
  return { strip, bytes, count, tier: state.tier, maps: state.maps, shot };
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const a = await run(browser, false);
  const b = await run(browser, true);
  // Pixel difference between the two settled frames (decoded in a page).
  const page = await (await browser.newContext()).newPage();
  const diff = await page.evaluate(async ([x, y]) => {
    const load = async (d) => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const p = await load(x), q = await load(y); let max = 0, sum = 0, n = 0;
    for (let k = 0; k < p.length; k += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(p[k + c] - q[k + c]); max = Math.max(max, d); sum += d; n++; }
    return { max, mean: sum / n };
  }, [a.shot.toString('base64'), b.shot.toString('base64')]);
  await browser.close();
  for (const r of [a, b]) { delete r.shot; console.log(JSON.stringify(r)); }
  console.log('pixel diff', JSON.stringify(diff));
})();
