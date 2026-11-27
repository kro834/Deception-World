// Max / mean per-channel difference between two PNGs of the same size (decoded in a browser page).
//   node pixdiff.cjs a.png b.png
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [a, b] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const r = await page.evaluate(async ([x, y]) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: g.getImageData(0, 0, i.width, i.height).data }; };
    const p = await load(x), q = await load(y);
    if (p.w !== q.w || p.h !== q.h) return { sizeMismatch: [p.w, p.h, q.w, q.h] };
    let max = 0, sum = 0, n = 0, changed = 0;
    for (let k = 0; k < p.d.length; k += 4) { let px = 0; for (let c = 0; c < 3; c++) { const d = Math.abs(p.d[k + c] - q.d[k + c]); max = Math.max(max, d); sum += d; n++; px = Math.max(px, d); } if (px) changed++; }
    return { max, mean: +(sum / n).toFixed(4), changedPixels: changed, pixels: p.w * p.h };
  }, [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')]);
  console.log(JSON.stringify({ a, b, ...r }));
  await browser.close();
})();
