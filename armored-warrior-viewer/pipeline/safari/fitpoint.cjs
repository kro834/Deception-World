// Debug: every element whose box covers (195, 150) on the #fit test page, with paint-relevant styles.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto('http://localhost:8765/pipeline/safari/fittest/');
  await page.waitForTimeout(1500);
  console.log(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.left <= 195 && r.right >= 195 && r.top <= 150 && r.bottom >= 150; }).map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${e.tagName}${e.id ? '#' + e.id : ''}.${(e.className && typeof e.className === 'string') ? e.className : ''} [${Math.round(r.top)}..${Math.round(r.bottom)}] z=${s.zIndex} pos=${s.position} bg=${s.backgroundImage.slice(0, 50)}|${s.backgroundColor} vis=${s.visibility} disp=${s.display}`; })), null, 1));
  await browser.close();
})();
