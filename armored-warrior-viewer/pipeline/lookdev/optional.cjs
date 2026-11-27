// Everything but the model itself is optional: check the viewer with groups of helpers missing.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const run = async (name, url, block, shot, page = { viewport: { width: 700, height: 860 } }) => {
    const p = await b.newPage(page);
    const errors = [];
    p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
    for (const pattern of block) await p.route(pattern, (route) => route.abort());
    await p.goto(url);
    await p.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 120000 });
    await p.evaluate(() => window.__viewer.whenSettled());
    const st = await p.evaluate(() => window.__viewer.state());
    await p.locator('#stage').screenshot({ path: shot });
    console.log(name, '| tier', st.tier, '| maps', JSON.stringify(st.maps), '| cast', st.cast, '| brush', st.brush, '| notes', JSON.stringify(st.notes), '| page errors', errors.length);
    await p.close();
  };
  const base = 'http://localhost:8765/work/';
  const out = process.argv[2];
  await run('everything         ', base, [], out + '/all.png');
  await run('no replacement paint', base, ['**/model-v15/paint*'], out + '/nopaint.png');
  await run('no smoothed normals', base, ['**/model-v15/toonnormal_*'], out + '/nonormals.png');
  await run('no AO (style) maps ', base, ['**/model-v15/style_*'], out + '/nostyle.png');
  await run('phone, no model-v15', base, ['**/model-v15/**'], out + '/phone-nomaps.png', { viewport: { width: 428, height: 926 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await run('no model-v15 at all', base, ['**/model-v15/**'], out + '/nomaps.png');
  await run('no maps, matcaps, rig', base, ['**/model-v15/**', '**/look/matcaps/**', '**/look/lightrig.json'], out + '/nothing.png');
  await run('conf map + repair on', base + '?set=paint.confidenceMap:1,repair:0.5', [], out + '/extras.png');
  await b.close();
})();
