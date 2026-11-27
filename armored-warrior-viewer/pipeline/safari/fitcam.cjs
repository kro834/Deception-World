// Debug: camera numbers in the #fit belt close-up.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto(process.argv[2] || 'http://localhost:8765/pipeline/safari/fittest/?tier=forward');
  await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
  await page.evaluate(async () => {
    const THREE = await import('/work-safari/vendor/three/build/three.module.min.js');
    const f = THREE.PerspectiveCamera.prototype.updateProjectionMatrix;
    THREE.PerspectiveCamera.prototype.updateProjectionMatrix = function () { window.__cam = this; return f.call(this); };
    if (location.hash === '#noculling') { THREE.Frustum.prototype.intersectsObject = () => true; THREE.Frustum.prototype.intersectsSprite = () => true; }
  });
  await page.evaluate(() => document.querySelector('[data-view="belt"]').click());
  await page.evaluate(() => window.__viewer.whenSettled());
  console.log(JSON.stringify(await page.evaluate(() => { const c = window.__cam; return { near: c.near, far: c.far, fov: c.fov, aspect: c.aspect, view: c.view, pos: c.position.toArray(), zoom: c.zoom }; })));
  if (process.argv[3] === 'clear') {
    await page.evaluate(() => { window.__cam.clearViewOffset(); window.__viewer.setOrbit(0, 90, 1); });
    await page.evaluate(() => window.__viewer.whenSettled());
    console.log('after clear', JSON.stringify(await page.evaluate(() => ({ view: window.__cam.view, near: window.__cam.near, far: window.__cam.far, pos: window.__cam.position.toArray() }))));
  }
  if (process.argv[3] === 'orbit') {
    await page.evaluate(() => window.__viewer.setOrbit(0, 90, 3.0, 0.57));
    await page.evaluate(() => window.__viewer.whenSettled());
    console.log('orbit', JSON.stringify(await page.evaluate(() => ({ view: window.__cam.view, near: window.__cam.near, far: window.__cam.far, pos: window.__cam.position.toArray() }))));
  }
  await page.screenshot({ path: require('path').resolve(__dirname, '../../shots/safari-04/fitcam' + (process.argv[2] || '').replace(/.*#/, '-') + (process.argv[3] ? '-' + process.argv[3] : '') + '.png') });
  await browser.close();
})();
