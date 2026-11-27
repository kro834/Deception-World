// ?capture=720 hides the stage's children, so #fit is zero-size: the #fit test page must give exactly
// the same frame as the page without #fit. Screenshots #stage of both and compares them.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = [];
  for (const [name, url] of [['plain', 'http://localhost:8765/work-safari/?capture=720'], ['fitpage', 'http://localhost:8765/pipeline/safari/fittest/?capture=720']]) {
    const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.dataset.viewer === 'ready', null, { timeout: 240000 });
    await page.evaluate(() => window.__viewer.whenSettled());
    // The test page's placeholder bars are page furniture over the stage, not part of the frame.
    await page.addStyleTag({ content: '.fake{display:none!important}' });
    const file = path.resolve(__dirname, `../../shots/safari-04/capture-${name}.png`);
    await page.locator('#stage').screenshot({ path: file });
    console.log(name, JSON.stringify(await page.evaluate(() => window.__viewer.state().fit)));
    out.push(file);
    await page.context().close();
  }
  await browser.close();
  console.log(out.join(' '));
})();
