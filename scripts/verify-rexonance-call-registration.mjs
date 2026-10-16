// Review (2026-10-16, owner: 「前がけの生成完了時にズレるのを修正して。」): a
// seated plate is drawn on the call's flight canvas until its gold is whole
// (`to`), then painted once on the settled canvas. On fine pointers the
// flight canvas bleeds past the figure, and the browser snaps each canvas's
// box to whole pixels on its own: with the bleed in percent of the figure,
// the same figure pixel landed up to 1.9 device px apart on the two
// canvases and each plate dropped about 1 device px at its hand-off. The
// flight canvas's edges now lie whole CSS px outside the figure's (its
// backing store the settled canvas's plus those pixels), and the settled
// canvas is untouched, so the finished suit is drawn as before. This plays
// the rich entry call on a production preview (1440x900 at 2x, fine pointer):
//  1. the boxes: the settled canvas is the figure's box at the figure's
//     backing; the flight canvas bleeds left and up by whole CSS px, never
//     past the stylesheet's bleed nor below the figure, and its backing store
//     is the settled canvas's plus those pixels at 2x;
//  2. the pixels: across each plate's hand-off (`to` − 2 ms → `to` + 2 ms)
//     the best sub-pixel fit of the frame after onto the frame before is no
//     shift at all. The figure's own jolt (rxSuitJolt) is held at one time
//     for both frames, so only the canvases' drawing differs; the fit ignores
//     the fifth of the pixels that change most (chips and sparks passing,
//     the glint starting);
//  3. the screen: last, the engine's draws are muted and the same grid of
//     dots is drawn at the same figure pixels on each canvas; shown one at a
//     time, the dots land on the same device pixels: exactly (< 0.05 device
//     px) vertically, and within 0.25 device px horizontally. That remainder
//     is the settled canvas's own: Chrome shows its 856 backing px over
//     429 CSS px (858 device px), a stretch the flight canvas cannot copy
//     without moving the finished suit.
// ALL=1 scrubs every plate with gold; PLATES=id,id picks plates; OUT=<dir>
// keeps the frames. LEGACY_GEOMETRY=1 puts the flight canvas back on its old
// box (the stylesheet's percentages at its rounded CSS size; checks 1 and 3
// only) to show that this verify fails on it.
// BASE_URL=http://127.0.0.1:8705 PW_BROWSER_CHANNEL=chrome node scripts/verify-rexonance-call-registration.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sharp from "sharp";
import { REXONANCE_SUIT_GOLD_AT } from "../src/lib/rexonance-calls.ts";
import { REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";

const base = process.env.BASE_URL ?? process.env.BASE ?? "http://127.0.0.1:8705";
const DPR = 2;
const VIEW = { width: 1440, height: 900 };
const legacy = process.env.LEGACY_GEOMETRY === "1";
const pieces = new Map(REXONANCE_SUIT_PIECES.map((piece) => [piece.id, piece]));
const withGold = REXONANCE_SUIT_PIECES.filter((piece) => {
  const at = REXONANCE_SUIT_GOLD_AT[piece.id];
  return at && at[1] > at[0];
});
const ids = legacy
  ? []
  : process.env.ALL
    ? withGold.map((piece) => piece.id)
    : (
        process.env.PLATES ??
        "boot-foot-l,boot-shin-l,knee-disc-r,tasset-low,tasset-top,arm-fist-l,arm-fist-r,chest-pec-l,shoulder-outer-r,ribbon-lower-l"
      )
        .split(",")
        .filter(Boolean);
for (const id of ids)
  assert.ok(pieces.has(id) && REXONANCE_SUIT_GOLD_AT[id], `unknown plate ${id}`);
// In the call's order (the engine replays from the start when rewound).
ids.sort((a, b) => REXONANCE_SUIT_GOLD_AT[a][1] - REXONANCE_SUIT_GOLD_AT[b][1]);

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const failures = [];
const check = (ok, message) => ok || failures.push(message);

// Every document animation to `time` (the engine reads the call meter's);
// those on the figure and its ancestors (its jolt) to `hold`.
const seek = (time, hold = time) =>
  page.evaluate(
    ([at, still]) => {
      const box = document.querySelector(".rx-suit-nanites");
      const chain = new Set();
      for (let element = box; element; element = element.parentElement) chain.add(element);
      for (const animation of document.getAnimations()) {
        if (animation.timeline && !(animation.timeline instanceof DocumentTimeline)) continue;
        try {
          animation.pause();
          animation.currentTime = chain.has(animation.effect?.target) ? still : at;
        } catch {
          // A scroll-driven animation of the page below: not the call's.
        }
      }
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
    [time, hold],
  );

async function enter() {
  await page.goto(`${base}/world`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      !document.documentElement.hasAttribute("data-loading") &&
      !document.querySelector(".load-gate"),
    null,
    { timeout: 30000 },
  );
  // The suit's plan and the nanite kit prepare in idle time.
  await page.waitForTimeout(5000);
  await page.locator(".side-panel-trigger").first().click();
  const link = page.locator('#site-side-panel a[href="/rexonance-saga#top"]').first();
  await link.waitFor({ state: "visible" });
  await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await link.click();
  await page.locator('.rx-call-sequence[data-mode="entry"]').waitFor({ timeout: 10000 });
  await page
    .waitForFunction(
      () => document.querySelectorAll(".rx-suit-nanites > canvas").length === 2,
      null,
      { timeout: 2000 },
    )
    .catch(() => {});
  await seek(600);
  if (legacy)
    await page.evaluate(() => {
      // HEAD 6b7943a: the flight canvas on the stylesheet's bleed (percent of
      // the figure) at its rounded CSS size.
      const flight = document.querySelectorAll(".rx-suit-nanites > canvas")[1];
      flight.removeAttribute("style");
      flight.width = Math.round(flight.offsetWidth * 2);
      flight.height = Math.round(flight.offsetHeight * 2);
    });
  return page.evaluate(() => {
    const box = document.querySelector(".rx-suit-nanites");
    const canvases = box ? [...box.querySelectorAll("canvas")] : [];
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    return {
      bleed: box?.dataset.bleed !== undefined,
      swarm: document.querySelector(".rx-suit")?.dataset.swarm ?? null,
      box: box ? rect(box) : null,
      client: box ? [box.clientWidth, box.clientHeight] : null,
      canvases: canvases.map((canvas) => ({
        rect: rect(canvas),
        backing: [canvas.width, canvas.height],
        style: canvas.getAttribute("style"),
      })),
    };
  });
}

// 1. The boxes.
const info = await enter();
assert.equal(info.canvases.length, 2, "the nanite engine runs (settled + flight canvases)");
assert.ok(info.bleed, "the rich call bleeds its flight canvas on a fine pointer");
assert.equal(info.swarm, "canvas", "the rich call draws its own swarm");
console.log("boxes", JSON.stringify({ box: info.box, canvases: info.canvases }));
{
  const [settled, flight] = info.canvases;
  const { box } = info;
  const near = (a, b) => Math.abs(a - b) <= 1 / 64 + 1e-9;
  // The settled canvas: the figure's box at the figure's backing, as before.
  for (const key of ["x", "y", "w", "h"])
    check(near(settled.rect[key], box[key]), `the settled canvas left the figure's box (${key})`);
  check(settled.style === null, `the settled canvas has a style: ${settled.style}`);
  const figure = info.client.map((size) => Math.round(size * DPR));
  check(
    settled.backing[0] === figure[0] && settled.backing[1] === figure[1],
    `the settled canvas's backing ${settled.backing} is not the figure's ${figure}`,
  );
  // The flight canvas: whole CSS px outside the figure on every side.
  const insets = {
    left: box.x - flight.rect.x,
    top: box.y - flight.rect.y,
    right: flight.rect.x + flight.rect.w - (box.x + box.w),
    bottom: flight.rect.y + flight.rect.h - (box.y + box.h),
  };
  console.log("flight insets (CSS px)", JSON.stringify(insets));
  for (const [side, inset] of Object.entries(insets))
    check(
      near(inset, Math.round(inset)) && inset > -1 / 64,
      `the flight canvas's ${side} edge is ${inset} CSS px from the figure's, not whole`,
    );
  check(insets.left >= 1 && insets.top >= 1, "the flight canvas does not bleed left and up");
  // Never past the stylesheet's bleed (−4 % / −2 % / 114 % × 102 %) nor below.
  check(insets.left <= box.w * 0.04 + 1 / 64, `the flight canvas bleeds ${insets.left} px left`);
  check(insets.top <= box.h * 0.02 + 1 / 64, `the flight canvas bleeds ${insets.top} px up`);
  check(insets.right <= box.w * 0.1 + 1 / 64, `the flight canvas bleeds ${insets.right} px right`);
  check(near(insets.bottom, 0), `the flight canvas bleeds ${insets.bottom} px below the figure`);
  const expected = [
    settled.backing[0] + Math.round((insets.left + insets.right) * DPR),
    settled.backing[1] + Math.round((insets.top + insets.bottom) * DPR),
  ];
  check(
    flight.backing[0] === expected[0] && flight.backing[1] === expected[1],
    `the flight canvas's backing ${flight.backing} is not the settled canvas's plus its bleed (${expected})`,
  );
}

// 2. The pixels.
const U = 4; // quarter pixels
const R = 6; // ±1.5 device px
const load = (buffer, width, height) =>
  sharp(buffer)
    .extract({ left: 0, top: 0, width, height })
    .greyscale()
    .resize(width * U, height * U, { kernel: "cubic" })
    .raw()
    .toBuffer();
// The mean of the lowest 80 % of |a − b shifted| (8-bit, by histogram), for
// each shift on the grid.
function fit(a, b, width, height) {
  const W = width * U;
  const H = height * U;
  const histogram = new Float64Array(256);
  let best = null;
  let still = 0;
  for (let dy = -R; dy <= R; dy += 1)
    for (let dx = -R; dx <= R; dx += 1) {
      histogram.fill(0);
      let n = 0;
      for (let y = R; y < H - R; y += 2)
        for (let x = R; x < W - R; x += 2) {
          histogram[Math.abs(a[y * W + x] - b[(y + dy) * W + x + dx])] += 1;
          n += 1;
        }
      const keep = Math.floor(n * 0.8);
      let left = keep;
      let sum = 0;
      for (let v = 0; v < 256 && left > 0; v += 1) {
        const take = Math.min(left, histogram[v]);
        sum += take * v;
        left -= take;
      }
      const mad = sum / keep;
      if (dx === 0 && dy === 0) still = mad;
      if (!best || mad < best.mad - 1e-9) best = { dx: dx / U, dy: dy / U, mad };
    }
  return { still, best };
}
const show = ({ still, best }) =>
  `still ${still.toFixed(2)} best (${best.dx},${best.dy}) ${best.mad.toFixed(2)}`;

const scrubs = [];
let sinceEnter = 0;
let at = info;
for (const id of ids) {
  // The overlay closes on its own in real time: re-enter every few plates.
  if (sinceEnter >= 4) {
    at = await enter();
    sinceEnter = 0;
  }
  sinceEnter += 1;
  const piece = pieces.get(id);
  const to = REXONANCE_SUIT_GOLD_AT[id][1];
  const scale = at.box.w / REXONANCE_SUIT_SIZE.width;
  const inset = 3;
  const clip = {
    x: Math.max(0, Math.floor(at.box.x + (piece.x + inset) * scale)),
    y: Math.max(0, Math.floor(at.box.y + (piece.y + inset) * scale)),
  };
  clip.width = Math.min(Math.ceil((piece.w - inset * 2) * scale), VIEW.width - clip.x);
  clip.height = Math.min(Math.ceil((piece.h - inset * 2) * scale), VIEW.height - clip.y);
  const shots = [];
  for (const time of [to - 6, to - 2, to + 2]) {
    await seek(time, to - 2);
    const path = process.env.OUT ? `${process.env.OUT}/${id}-${time}.png` : undefined;
    shots.push(await page.screenshot({ clip, path }));
  }
  scrubs.push({ id, to, shots });
}

// 3. The screen: one grid of dots, drawn on each canvas in turn.
if (ids.length) at = await enter();
const STEP = 40;
const placed = await page.evaluate((step) => {
  const box = document.querySelector(".rx-suit-nanites");
  const canvases = [...box.querySelectorAll("canvas")];
  const P = CanvasRenderingContext2D.prototype;
  // The figure's origin on each canvas, in its backing pixels.
  const r = (element) => element.getBoundingClientRect();
  const out = [];
  for (const canvas of canvases) {
    const g = canvas.getContext("2d");
    // Mute the engine on this context; draw through the prototype.
    for (const key of [
      "drawImage",
      "fillRect",
      "clearRect",
      "fill",
      "stroke",
      "strokeRect",
      "putImageData",
    ])
      g[key] = () => {};
    const rect = r(canvas);
    const kx = canvas.width / rect.width;
    const ky = canvas.height / rect.height;
    const ox = Math.round((r(box).left - rect.left) * kx);
    const oy = Math.round((r(box).top - rect.top) * ky);
    P.setTransform.call(g, 1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = "#000";
    P.fillRect.call(g, 0, 0, canvas.width, canvas.height);
    g.fillStyle = "#fff";
    // 2x2 dots on the figure's pixels (whole backing px from its origin).
    for (let y = 20; y < 1500; y += step)
      for (let x = 20; x < 830; x += step) P.fillRect.call(g, ox + x, oy + y, 2, 2);
    out.push({
      ox,
      oy,
      rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
      backing: [canvas.width, canvas.height],
    });
  }
  document.querySelector(".rx-call-sequence").style.visibility = "hidden";
  return out;
}, STEP);
const maps = [];
for (let k = 0; k < 2; k += 1) {
  await page.evaluate((index) => {
    for (const [i, canvas] of [...document.querySelectorAll(".rx-suit-nanites > canvas")].entries())
      canvas.style.visibility = i === index ? "visible" : "hidden";
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, k);
  const c = placed[k];
  const clip = {
    x: Math.max(0, Math.floor(c.rect.x)),
    y: Math.max(0, Math.floor(c.rect.y)),
  };
  clip.width = Math.min(VIEW.width - clip.x, Math.ceil(c.rect.w) + 2);
  clip.height = Math.min(VIEW.height - clip.y, Math.ceil(c.rect.h) + 2);
  const { data, info: image } = await sharp(await page.screenshot({ clip }))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const kx = (c.rect.w * DPR) / c.backing[0];
  const ky = (c.rect.h * DPR) / c.backing[1];
  const points = [];
  for (let y = 20; y < 1500; y += STEP)
    for (let x = 20; x < 830; x += STEP) {
      // The dot's centre where the box says it is (device px), then its
      // centroid within ±5 px of that.
      const ix = (c.rect.x - clip.x) * DPR + (c.ox + x + 1) * kx;
      const iy = (c.rect.y - clip.y) * DPR + (c.oy + y + 1) * ky;
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let py = Math.floor(iy - 5); py <= Math.ceil(iy + 5); py += 1)
        for (let px = Math.floor(ix - 5); px <= Math.ceil(ix + 5); px += 1) {
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          const v = data[py * image.width + px];
          if (v < 20) continue;
          sx += (px + 0.5) * v;
          sy += (py + 0.5) * v;
          sw += v;
        }
      if (sw > 200) points.push([x + 1, y + 1, sx / sw + clip.x * DPR, sy / sw + clip.y * DPR]);
    }
  maps.push(points);
}
// The same figure pixel, as each canvas puts it on the screen.
const byKey = new Map(maps[1].map(([x, y, dx, dy]) => [`${x},${y}`, [dx, dy]]));
let worstX = 0;
let worstY = 0;
let pairs = 0;
for (const [x, y, dx, dy] of maps[0]) {
  const other = byKey.get(`${x},${y}`);
  if (!other) continue;
  pairs += 1;
  worstX = Math.max(worstX, Math.abs(dx - other[0]));
  worstY = Math.max(worstY, Math.abs(dy - other[1]));
}
console.log(
  `screen: ${pairs} dots on both canvases, worst gap ${worstX.toFixed(3)} device px across, ${worstY.toFixed(3)} down`,
);
check(pairs > 500, `only ${pairs} dots found on both canvases`);
check(
  worstY < 0.05,
  `the canvases put the same figure pixel ${worstY.toFixed(3)} device px apart down`,
);
check(
  worstX < 0.25,
  `the canvases put the same figure pixel ${worstX.toFixed(3)} device px apart across`,
);

await browser.close();

for (const { id, to, shots } of scrubs) {
  const { width: w, height: h } = await sharp(shots[0]).metadata();
  const [early, before, after] = await Promise.all(shots.map((shot) => load(shot, w, h)));
  const handOff = fit(before, after, w, h);
  const ahead = fit(early, before, w, h);
  console.log(`${id} @${to}: hand-off ${show(handOff)} | the 4 ms before it ${show(ahead)}`);
  // No shift fits the frame after the hand-off better than no shift at all.
  const { still, best } = handOff;
  check(
    (best.dx === 0 && best.dy === 0) || still - best.mad < 0.05,
    `${id} shifts (${best.dx},${best.dy}) device px at its hand-off (${to} ms): ${show(handOff)}`,
  );
}
check(errors.length === 0, `page errors: ${errors.join(" | ")}`);
assert.deepEqual(failures, [], "the canvases register and the hand-offs hold still");
console.log(`PASS: the canvases register; ${ids.length} hand-offs hold still`);
