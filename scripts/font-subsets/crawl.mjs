// Per-route rendered characters for scripts/build-font-subsets.mjs: text nodes (hidden ones
// too), ::before/::after content, placeholders and input values, keyed by the
// first family of their computed font-family. Needs a production preview:
//   BASE=http://127.0.0.1:4971 node scripts/font-subsets/crawl.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:4971";
const seeds = ["/", "/world", "/rexonance-saga", "/far-from-saga", "/extreme-saga", "/final-stage", "/riders/saga", "/characters/ciel", "/riders", "/characters", "/gallery", "/library", "/search", "/dream-chapter", "/meta-unitas-saga", "/illusionculum-saga", "/saga-cinema", "/managers", "/dogs-archive", "/download", "/form-archive", "/gallery-tours", "/world-map", "/transformation-lab", "/exhibition", "/login"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const out = {};
const queue = [...seeds]; const seen = new Set(seeds);
const c = await b.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
await c.addInitScript(`try{localStorage.setItem("dw-opening-notice-seen","1")}catch(e){}`);
while (queue.length && Object.keys(out).length < 90) {
  const r = queue.shift();
  const p = await c.newPage();
  try {
    await p.goto(BASE + r, { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(2500);
    const res = await p.evaluate(() => {
      const fams = {};
      const add = (fam, s) => { const k = (fam || "").split(",")[0].replace(/["']/g, "").trim(); (fams[k] ||= new Set()); for (const ch of s) fams[k].add(ch); };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue; add(getComputedStyle(el).fontFamily, n.data); }
      for (const el of document.body.querySelectorAll("*")) {
        for (const ps of ["::before", "::after"]) { const cs = getComputedStyle(el, ps); const ct = cs.content; if (ct && ct !== "none" && ct !== "normal") add(cs.fontFamily, ct.replace(/^["']|["']$/g, "")); }
        if (el.placeholder) add(getComputedStyle(el).fontFamily, el.placeholder);
        if (el.tagName === "INPUT" && el.value) add(getComputedStyle(el).fontFamily, el.value);
      }
      const links = [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href").split(/[?#]/)[0]);
      return { fams: Object.fromEntries(Object.entries(fams).map(([k, v]) => [k, [...v].join("")])), links };
    });
    out[r] = res.fams;
    for (const l of res.links) if (!seen.has(l) && !l.startsWith("/api") && !/\.(\w+)$/.test(l)) { seen.add(l); queue.push(l); }
    console.log(r, Object.entries(res.fams).map(([k, v]) => k + ":" + v.length).join(" "));
  } catch (e) { console.log("FAIL", r, e.message.slice(0, 100)); }
  await p.close();
}
writeFileSync(new URL("./route-chars.json", import.meta.url), JSON.stringify(out));
await b.close();
