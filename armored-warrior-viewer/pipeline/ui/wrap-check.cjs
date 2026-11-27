#!/usr/bin/env node
// Checks how every viewer.js status string wraps in #status, and that the HUD plate never overlaps
// the poster box. viewer.js is stubbed.
//   node pipeline/ui/wrap-check.cjs [--url http://localhost:8765/ui-work/] [--out shots/ui-wrap]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, ''); const n = process.argv[i + 1];
  if (n === undefined || n.startsWith('--')) args[k] = true; else { args[k] = n; i++; }
}
const url = args.url || 'http://localhost:8765/ui-work/';
const out = path.resolve(args.out || 'shots/ui-wrap');
const sizes = (args.sizes || '375x667m,390x844m,428x926m,844x390m,667x375m,1440x900').split(',');
const strings = [
  ['loading', '3Dモデルを読み込み中'],
  ['loading', '高精細モデルを読み込み中'],
  ['ready', '切替に失敗しました。現在のモデルを表示しています。'],
  ['error', '3Dを読み込めませんでした。画像で確認するか、再試行できます。'],
  ['lost', '3D表示を復旧中。各方向の画像を確認できます。'],
  ['error', '3D表示を再試行できます。'],
  ['error', 'このブラウザでは3Dを表示できません。画像で各方向を確認できます。'],
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  let bad = 0;
  for (const spec of sizes) {
    const mobile = spec.endsWith('m');
    const [w, h] = spec.replace(/m$/, '').split('x').map(Number);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await page.route('**/viewer.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(url, { waitUntil: 'load' });
    for (const [i, [state, text]] of strings.entries()) {
      const r = await page.evaluate(([state, text]) => {
        document.documentElement.dataset.viewer = state;
        const s = document.querySelector('#status'); s.hidden = false; s.textContent = text;
        document.querySelector('#progress').textContent = state === 'loading' ? '42%' : '';
        const node = s.firstChild; const range = document.createRange();
        const lines = new Map();
        for (let k = 0; k < text.length; k++) {
          range.setStart(node, k); range.setEnd(node, k + 1);
          const rect = range.getClientRects()[0]; if (!rect) continue;
          const y = Math.round(rect.top); lines.set(y, (lines.get(y) || '') + text[k]);
        }
        const plate = s.getBoundingClientRect(); const poster = document.querySelector('#poster').getBoundingClientRect();
        // Figure is framed inside ~95% of the poster height; overlap with that zone is a failure.
        const figureBottom = poster.top + poster.height * 0.955;
        return { lines: [...lines.values()], overlap: Math.max(0, Math.round(figureBottom - plate.top)), posterH: Math.round(poster.height) };
      }, [state, text]);
      await page.waitForTimeout(350);
      const last = r.lines[r.lines.length - 1];
      const lone = r.lines.length > 1 && last.replace(/[。、]/g, '').length <= 2;
      if (lone || r.overlap > 0) bad++;
      console.log(`${spec} #${i} ${state}: ${r.lines.join(' / ')}${lone ? '  <-- LONE TAIL' : ''}  poster ${r.posterH}px overlap ${r.overlap}px${r.overlap ? '  <-- OVERLAP' : ''}`);
      if (i === 3 || i === 4) await page.screenshot({ path: path.join(out, `${spec}-${state}.png`) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `${bad} problem(s)` : 'all strings wrap cleanly, no overlap');
})().catch((e) => { console.error(e); process.exit(1); });
