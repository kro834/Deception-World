import assert from "node:assert/strict";
import { chromium } from "playwright";

// Scroll-lit type on /world (src/styles-world-reveal.css). Run against a fresh
// production preview, or the dev server with BASE_URL.
const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

// The revealed blocks, and the ones that must stay whole text.
const BLOCKS = [
  ".story-heading h2",
  ".story-copy > p[data-text-reveal]",
  ".story-copy > p[data-text-reveal] + p[data-text-reveal]",
  ".section-title h2",
  ".section-title > p[data-text-reveal]",
  ".records-heading h2",
];
const WHOLE = [
  ".rider-description",
  ".world-column-summary-pane p",
  ".threat-copy h3",
  ".threat-copy > p",
  ".story-lead-sequel",
  ".hero-lead",
  "h1",
  ".episode-archive-heading",
  ".episode-card-copy h4",
  ".rw-gate",
];
// Rails take the page scroll lock at pointerdown; the reveal holds still.
const RAILS = [
  ".manager-archive-tabs",
  ".world-column-tabs:not(.world-column-dialog-tabs)",
  ".rider-tabs",
];

// Headless Chrome reports the host's cores, and Android with 4 or fewer is
// economy (rendering-profile.js): pin a capable device so the result does not
// depend on the machine. configurable, so a later override does not throw.
const CAPABLE = () => {
  for (const [key, value] of [
    ["hardwareConcurrency", 8],
    ["deviceMemory", 8],
  ]) {
    Object.defineProperty(Navigator.prototype, key, { get: () => value, configurable: true });
  }
};
async function capableContext(options) {
  const context = await browser.newContext(options);
  await context.addInitScript(CAPABLE);
  return context;
}

// Short landscape phones (styles-world-reveal.css): headings are lit by about
// 89% of the viewport there, so a nav jump that lands them low reads whole.
const shortLandscape = (viewport) => viewport.width > viewport.height && viewport.height <= 520;

function luminance(color) {
  const channels = color
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  assert.ok(channels?.length === 3, `cannot read RGB color: ${color}`);
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

const settle = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

async function openWorld(context, path = "/world") {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydrat/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-shell.mirage-edition");
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
      undefined,
      { timeout: 6_000 },
    )
    .catch(() => {});
  await page.waitForFunction(
    () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
  );
  await page.waitForTimeout(1_200);
  // This check is about the full-effects page: a capable device (Android
  // included) must not get economy rendering. Never lifted here, so a
  // regression that makes Pixel economy again fails.
  const effects = await page.evaluate(() => document.documentElement.dataset.worldEffects ?? null);
  await settle(page);
  return { page, errors, effects };
}

// Visit every region once so content-visibility sections have computed style.
async function walk(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let top = 0; top < height; top += 480) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
    await page.waitForTimeout(25);
  }
}

async function placeTop(page, selector, fraction) {
  await page.evaluate(
    ([target, share]) => {
      const node = document.querySelector(target);
      const top = node.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top - innerHeight * share, behavior: "instant" });
    },
    [selector, fraction],
  );
  await settle(page);
  await page.waitForTimeout(60);
}

// Scroll-linked choreography moves some blocks as the page scrolls, so the
// block is placed by measuring it again after each step.
async function placeTopExact(page, selector, fraction) {
  let top = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    top = await page.evaluate(
      ([target, share]) => {
        const box = document.querySelector(target).getBoundingClientRect();
        const delta = box.top - innerHeight * share;
        if (Math.abs(delta) >= 2) window.scrollBy({ top: delta, behavior: "instant" });
        return box.top / innerHeight;
      },
      [selector, fraction],
    );
    await settle(page);
    await page.waitForTimeout(60);
    if (Math.abs(top - fraction) < 0.004) break;
  }
  top = await page.evaluate(
    (target) => document.querySelector(target).getBoundingClientRect().top / innerHeight,
    selector,
  );
  assert.ok(Math.abs(top - fraction) < 0.015, `${selector}: placed at ${top} for ${fraction}`);
  return top;
}

// The reveal line: every block is whole once its top reaches 74% of the
// viewport (26svh), and not yet whole a little below it. Short landscape
// screens light headings by about 89% (11svh).
async function revealLine(page, name, viewport) {
  for (const selector of BLOCKS) {
    const heading = / h2$/.test(selector);
    const [lit, ghost] = heading && shortLandscape(viewport) ? [0.87, 0.95] : [0.72, 0.78];
    await placeTopExact(page, selector, lit);
    assert.ok(
      (await ink(page, selector)).every((character) => character.full),
      `${name}: ${selector} not whole with its top at ${lit}`,
    );
    await placeTopExact(page, selector, ghost);
    assert.ok(
      (await ink(page, selector)).some((character) => !character.full),
      `${name}: ${selector} already whole with its top at ${ghost}`,
    );
  }
}

// Nav links (the topbar's STORY / RIDERS / RECORDS) from the top of the page:
// wherever a section lands, every block whose top is above the reveal line is
// whole, and on short landscape screens so is every visible heading character.
async function navJumps(page, name, viewport) {
  const landings = [];
  for (const id of ["story", "riders", "records"]) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await settle(page);
    await page.waitForTimeout(200);
    await page.click(`.topbar nav a[href="#${id}"]`);
    // Wait for the (smooth) scroll to come to rest.
    let last = -1;
    for (let tick = 0; tick < 40; tick += 1) {
      await page.waitForTimeout(100);
      const y = await page.evaluate(() => Math.round(window.scrollY));
      if (y === last && y > 0) break;
      last = y;
    }
    await page.waitForTimeout(300);
    const landing = await page.evaluate(
      ([section, short]) => {
        const full = (span) =>
          getComputedStyle(span).color === getComputedStyle(span.parentElement).color;
        const blocks = [...document.querySelectorAll("[data-text-reveal]")]
          .filter((block) => !block.closest(".finale-content"))
          .map((block) => ({ block, top: block.getBoundingClientRect().top / innerHeight }));
        const checked = blocks.filter(({ top }) => top >= 0 && top <= 0.72);
        const unlit = checked
          .filter(({ block }) => ![...block.querySelectorAll(".tr-c")].every(full))
          .map(({ block, top }) => `${block.textContent.slice(0, 6)}@${top.toFixed(2)}`);
        const heading = document.querySelector(`#${section} [data-text-reveal="heading"]`);
        const visible = short
          ? [...heading.querySelectorAll(".tr-c")].filter(
              (span) => span.getBoundingClientRect().top < innerHeight - 8,
            )
          : [];
        return {
          scrollY: Math.round(window.scrollY),
          heading: Number((heading.getBoundingClientRect().top / innerHeight).toFixed(2)),
          checked: checked.length + (visible.length > 0 ? 1 : 0),
          unlit,
          visibleUnlit: visible.filter((span) => !full(span)).length,
        };
      },
      [id, shortLandscape(viewport)],
    );
    assert.ok(landing.scrollY > 0, `${name} #${id}: the nav link did not scroll`);
    assert.deepEqual(landing.unlit, [], `${name} #${id}: ghosted above the line`);
    assert.equal(landing.visibleUnlit, 0, `${name} #${id}: visible heading ghosted`);
    landings.push({ id, ...landing });
  }
  assert.ok(
    landings.some((landing) => landing.checked > 0),
    `${name}: no nav landing checked a block ${JSON.stringify(landings)}`,
  );
  return landings;
}

async function placeFinale(page, share) {
  await page.evaluate((fraction) => {
    const section = document.querySelector(".finale-section");
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: top + (section.offsetHeight - innerHeight) * fraction,
      behavior: "instant",
    });
  }, share);
  await settle(page);
  await page.waitForTimeout(60);
}

const ink = (page, selector) =>
  page.evaluate((target) => {
    const node = document.querySelector(target);
    const alpha = (color) => {
      const match = color.match(/\/\s*([\d.]+)\s*\)$/) ?? color.match(/rgba\([^)]*,\s*([\d.]+)\)$/);
      return match ? Number(match[1]) : 1;
    };
    return [...node.querySelectorAll(".tr-c")].map((span) => ({
      alpha: alpha(getComputedStyle(span).color),
      full: getComputedStyle(span).color === getComputedStyle(span.parentElement).color,
    }));
  }, selector);

// Sections skipped by content-visibility keep their last computed style, so
// only characters that are currently rendered are counted.
const trCount = (page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.animationName === "tr-ink" &&
            animation.effect.target.checkVisibility({ contentVisibilityAuto: true }),
        ).length,
  );

// Rendered characters that lost their reveal.
const unanimated = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".tr-c")].filter(
        (span) =>
          span.checkVisibility({ contentVisibilityAuto: true }) &&
          !span.getAnimations().some((animation) => animation.animationName === "tr-ink"),
      ).length,
  );

const timelineState = (page) =>
  page.evaluate(() => {
    const spans = [...document.querySelectorAll(".tr-c")];
    const animations = document
      .getAnimations()
      .filter((animation) => animation.animationName === "tr-ink");
    return {
      spans: spans.length,
      animations: animations.length,
      perSpan: spans.filter(
        (span) =>
          span.getAnimations().filter((animation) => animation.animationName === "tr-ink")
            .length !== 1,
      ).length,
      detached: animations
        .filter((animation) => animation.timeline?.source !== document.scrollingElement)
        .map(
          (animation) =>
            `${animation.effect.target.textContent} → ${animation.timeline?.source?.className ?? animation.timeline}`,
        ),
      timeBased: animations.filter(
        (animation) =>
          !(animation.timeline instanceof ViewTimeline) ||
          animation.effect.getComputedTiming().iterations !== 1,
      ).length,
      finaleOwnTimeline: getComputedStyle(document.querySelector(".finale-content h2"))
        .viewTimelineName,
    };
  });

const wholeText = (page) =>
  page.evaluate(
    (selectors) =>
      selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter(
            (node) =>
              node.querySelector(".tr-c, [data-text-reveal]") || node.matches("[data-text-reveal]"),
          )
          .map(() => selector),
      ),
    WHOLE,
  );

// Global rules that restyle a descendant span would turn characters into
// blocks or move them; every character must look exactly like its parent.
const spanAudit = (page) =>
  page.evaluate(() => {
    const inherited = [
      "font-size",
      "font-weight",
      "font-family",
      "font-style",
      "letter-spacing",
      "line-height",
      "white-space",
      "text-transform",
      "text-shadow",
      "-webkit-text-fill-color",
    ];
    const still = {
      display: "inline",
      position: "static",
      transform: "none",
      translate: "none",
      scale: "none",
      rotate: "none",
      opacity: "1",
      filter: "none",
      "clip-path": "none",
      "background-image": "none",
      "vertical-align": "baseline",
      "margin-left": "0px",
      "margin-right": "0px",
      "padding-left": "0px",
      "padding-right": "0px",
    };
    const problems = new Set();
    for (const span of document.querySelectorAll(".tr-c")) {
      const own = getComputedStyle(span);
      const parent = getComputedStyle(span.parentElement);
      for (const property of inherited) {
        // An unset fill follows the character's own (animated) colour.
        if (property === "-webkit-text-fill-color" && own.webkitTextFillColor === own.color)
          continue;
        if (own.getPropertyValue(property) !== parent.getPropertyValue(property))
          problems.add(`${property}: ${own.getPropertyValue(property)} (${span.textContent})`);
      }
      for (const [property, value] of Object.entries(still)) {
        if (own.getPropertyValue(property) !== value)
          problems.add(`${property}: ${own.getPropertyValue(property)} (${span.textContent})`);
      }
    }
    return [...problems].slice(0, 12);
  });

const accessibility = (page) =>
  page.evaluate(() => {
    const squash = (text) => text.replace(/\s+/g, "");
    const headings = [...document.querySelectorAll('[data-text-reveal="heading"]')].map(
      (heading) => ({
        tag: heading.tagName,
        label: heading.getAttribute("aria-label") ?? "",
        text: heading.textContent,
        hiddenSpans: heading.querySelectorAll('[aria-hidden="true"] .tr-c').length,
      }),
    );
    const copies = [...document.querySelectorAll('[data-text-reveal="copy"]')].map((copy) => {
      const spoken = copy.querySelector(":scope > .visually-hidden");
      const shown = copy.querySelector(':scope > [aria-hidden="true"]');
      const box = spoken?.getBoundingClientRect();
      return {
        same: Boolean(spoken && shown) && squash(spoken.textContent) === squash(shown.textContent),
        spokenHasSpans: Boolean(spoken?.querySelector(".tr-c")),
        tiny: Boolean(box && box.width <= 1 && box.height <= 1),
      };
    });
    return {
      headings,
      copies,
      squashedMatch: headings.map((h) => squash(h.label) === squash(h.text)),
    };
  });

async function layerCount(page, cdp, disable) {
  let latest = null;
  const listener = (event) => {
    if (event.layers) latest = event.layers;
  };
  cdp.on("LayerTree.layerTreeDidChange", listener);
  await page.evaluate((off) => {
    document.getElementById("verify-reveal-off")?.remove();
    if (!off) return;
    const style = document.createElement("style");
    style.id = "verify-reveal-off";
    style.textContent = ".tr-c { animation: none !important; }";
    document.head.append(style);
  }, disable);
  await placeTop(page, ".story-copy > p[data-text-reveal]", 0.8);
  await page.evaluate(() => window.scrollBy({ top: 1, behavior: "instant" }));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollBy({ top: -1, behavior: "instant" }));
  await page.waitForTimeout(400);
  cdp.off("LayerTree.layerTreeDidChange", listener);
  return latest?.length ?? 0;
}

// A rail contact takes the page scroll lock (viewport-scroll-lock.js). The
// reveal must hold still under it: with the rail at several heights, the ink
// of every block in view is the same before, during and after a press on the
// selected tab, and the page does not move.
async function railHold(page, touch) {
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  const press = async (type, x, y) => {
    if (cdp) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: { down: "touchStart", move: "touchMove", up: "touchCancel" }[type],
        touchPoints: type === "up" ? [] : [{ x, y }],
      });
    } else if (type === "down") {
      await page.mouse.move(x, y);
      await page.mouse.down();
    } else if (type === "move") await page.mouse.move(x, y, { steps: 3 });
    else await page.mouse.up();
  };
  const state = () =>
    page.evaluate(() => ({
      top: Math.round(window.scrollY),
      lock: document.documentElement.hasAttribute("data-rail-lock"),
      ink: [...document.querySelectorAll("[data-text-reveal]")]
        .filter((block) => {
          const box = block.getBoundingClientRect();
          return box.bottom > 0 && box.top < innerHeight;
        })
        .map((block) =>
          [...block.querySelectorAll(".tr-c")].map((span) => getComputedStyle(span).color).join(),
        )
        .join("|"),
    }));
  const problems = [];
  let pressed = 0;
  let partLit = 0;
  for (const selector of RAILS) {
    for (const share of [0.25, 0.32, 0.5, 0.8]) {
      // Scroll-linked choreography moves panels as the page scrolls, so the
      // rail is placed by measuring it after each step.
      let placed = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const offset = await page.evaluate(
          ([target, fraction]) => {
            const rail = document.querySelector(target);
            if (!rail?.querySelector('[aria-selected="true"]')) return null;
            const delta = rail.getBoundingClientRect().bottom - innerHeight * fraction;
            window.scrollBy({ top: delta, behavior: "instant" });
            return delta;
          },
          [selector, share],
        );
        if (offset === null) break;
        placed = true;
        await settle(page);
        await page.waitForTimeout(60);
        if (Math.abs(offset) < 3) break;
      }
      if (!placed) continue;
      await page.waitForTimeout(60);
      const point = await page.evaluate((target) => {
        const tab = document.querySelector(target).querySelector('[aria-selected="true"]');
        const box = tab.getBoundingClientRect();
        if (box.top < 72 || box.bottom > innerHeight - 8) return null;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        return tab.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
      }, selector);
      if (!point) continue;
      const before = await state();
      await press("down", point.x, point.y);
      await page.waitForTimeout(220);
      const held = await state();
      await press("move", point.x + 12, point.y);
      await page.waitForTimeout(80);
      await press("move", point.x, point.y);
      await page.waitForTimeout(80);
      const moved = await state();
      await press("up");
      await page.waitForTimeout(400);
      const after = await state();
      pressed += 1;
      if (/oklab|rgba|\/ 0/.test(before.ink)) partLit += 1;
      if (!held.lock) problems.push(`${selector} @${share}: no rail lock`);
      for (const [name, now] of [
        ["held", held],
        ["dragged", moved],
        ["released", after],
      ]) {
        // On release a rail may bring itself into view; the ink then follows.
        if (now.top !== before.top) {
          if (name !== "released") problems.push(`${selector} @${share}: page moved ${name}`);
        } else if (now.ink !== before.ink)
          problems.push(`${selector} @${share}: ink changed ${name}`);
      }
    }
  }
  if (cdp) await cdp.detach();
  return { pressed, partLit, problems };
}

// A jump from the top: once a heading is actually rendered, its ink must
// already match where it landed (no lit→ghost or ghost→lit snap).
const jump = (page, selector, share) =>
  page.evaluate(
    async ([target, fraction]) => {
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const heading = document.querySelector(target);
      const read = () =>
        [...heading.querySelectorAll(".tr-c")]
          .map((span) =>
            getComputedStyle(span).color === getComputedStyle(span.parentElement).color ? 1 : 0,
          )
          .join("");
      const top =
        target === ".finale-content h2"
          ? (() => {
              const section = document.querySelector(".finale-section");
              return (
                section.getBoundingClientRect().top +
                window.scrollY +
                (section.offsetHeight - innerHeight) * fraction
              );
            })()
          : heading.getBoundingClientRect().top + window.scrollY - innerHeight * fraction;
      window.scrollTo({ top, behavior: "instant" });
      const frames = [];
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (heading.checkVisibility({ contentVisibilityAuto: true })) frames.push(read());
      }
      return frames;
    },
    [selector, share],
  );

// The finale headline must write itself (pass through part-lit states) as the
// finale scrolls in and through its stage, pinned or not, and end whole. An
// empty range (an unpinned stage exactly one viewport tall) pops it at once.
const finaleWrites = (page) =>
  page.evaluate(async () => {
    const section = document.querySelector(".finale-section");
    const heading = section.querySelector(".finale-content h2");
    const top = section.getBoundingClientRect().top + window.scrollY;
    const unlit = () =>
      [...heading.querySelectorAll(".tr-c")].filter(
        (span) => getComputedStyle(span).color !== getComputedStyle(span.parentElement).color,
      ).length;
    const total = heading.querySelectorAll(".tr-c").length;
    let partial = 0;
    const end = top + Math.max(0, section.offsetHeight - innerHeight);
    for (let y = top - innerHeight * 0.8; y <= end; y += 6) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const count = unlit();
      if (count > 0 && count < total) partial += 1;
    }
    return { partial, unlitAtEnd: unlit() };
  });

async function styleCost(context) {
  const page = await context.newPage();
  await page.goto(new URL("/world", base).href, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-shell.mirage-edition");
  await page
    .waitForFunction(
      () => document.querySelector(".site-shell")?.dataset.mirageBoot === "done",
      undefined,
      { timeout: 6_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1_200);
  await walk(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const metric = async (name) =>
    (await cdp.send("Performance.getMetrics")).metrics.find((entry) => entry.name === name).value;
  const results = { on: [], off: [] };
  for (const run of ["on", "off", "on", "off"]) {
    await page.evaluate((off) => {
      document.getElementById("verify-reveal-off")?.remove();
      if (!off) return;
      const style = document.createElement("style");
      style.id = "verify-reveal-off";
      style.textContent = ".tr-c { animation: none !important; }";
      document.head.append(style);
    }, run === "off");
    const [from, to] = await page.evaluate(() => {
      const start = document.querySelector(".story-section");
      const end = document.querySelector(".riders-section");
      return [
        Math.max(0, start.getBoundingClientRect().top + window.scrollY - innerHeight),
        end.getBoundingClientRect().top + window.scrollY + 200,
      ];
    });
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), from);
    await page.waitForTimeout(300);
    const before = await metric("RecalcStyleDuration");
    const frames = await page.evaluate(
      async ([start, end]) => {
        let count = 0;
        for (let top = start; top <= end; top += 16) {
          window.scrollTo({ top, behavior: "instant" });
          await new Promise((resolve) => requestAnimationFrame(resolve));
          count += 1;
        }
        return count;
      },
      [from, to],
    );
    results[run].push((((await metric("RecalcStyleDuration")) - before) * 1000) / frames);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.close();
  const best = (list) => Math.min(...list);
  return { on: best(results.on), off: best(results.off) };
}

// Phone at full effects: the Android target once economy no longer applies.
{
  const context = await capableContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  });
  const { page, errors, effects } = await openWorld(context);
  assert.equal(effects, null, "phone-412: capable Android fell back to economy rendering");

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settle(page);
  const firstView = await page.evaluate(() =>
    [...document.querySelectorAll("[data-text-reveal]")]
      .filter((block) => {
        const box = block.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight && box.height > 0;
      })
      .map((block) => block.textContent.slice(0, 8)),
  );
  assert.deepEqual(firstView, [], "phone-412: a reveal block sits in the first viewport");

  await walk(page);
  const timelines = await timelineState(page);
  assert.ok(
    timelines.spans >= 200 && timelines.spans <= 260,
    `phone-412: ${timelines.spans} character spans`,
  );
  assert.equal(timelines.animations, timelines.spans, "phone-412: one animation per character");
  assert.equal(timelines.perSpan, 0, "phone-412: a character without exactly one reveal");
  assert.deepEqual(timelines.detached, [], "phone-412: reveal bound to a panel scroller");
  assert.equal(timelines.timeBased, 0, "phone-412: reveal must be scroll-linked and finite");
  assert.equal(timelines.finaleOwnTimeline, "none", "phone-412: finale heading declares --tr");
  assert.deepEqual(await wholeText(page), [], "phone-412: a block that must stay whole is split");

  // Mid-reveal: written in reading order, the tail still a ghost.
  await placeTop(page, ".story-heading h2", 0.85);
  const writing = await ink(page, ".story-heading h2");
  const alphas = writing.map((character) => character.alpha);
  assert.ok(alphas[0] > alphas.at(-1) + 0.3, `phone-412: story heading mid-reveal ${alphas}`);
  assert.ok(alphas.at(-1) <= 0.2, `phone-412: story heading tail ${alphas.at(-1)}`);
  assert.ok(
    alphas.every((alpha, index) => index === 0 || alpha <= alphas[index - 1] + 0.01),
    `phone-412: story heading lights out of reading order ${alphas}`,
  );

  // Past the middle of the viewport every block is at full ink.
  for (const selector of BLOCKS) {
    await placeTop(page, selector, 0.5);
    const lit = await ink(page, selector);
    assert.ok(lit.length > 0, selector);
    assert.ok(
      lit.every((character) => character.alpha === 1 && character.full),
      `phone-412: ${selector} not fully lit at 50%`,
    );
  }
  // Whole at the 74% line, not yet whole just below it.
  await revealLine(page, "phone-412", { width: 412, height: 915 });
  // The finale headline writes itself early in the pin and is whole later.
  await placeFinale(page, 0.08);
  assert.ok(
    (await ink(page, ".finale-content h2")).some((character) => !character.full),
    "phone-412: finale headline already whole at the start of its pin",
  );
  await placeFinale(page, 0.7);
  assert.ok(
    (await ink(page, ".finale-content h2")).every((character) => character.full),
    "phone-412: finale headline unlit late in its pin",
  );

  // Nothing is left behind at the end of the page.
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
  );
  await settle(page);
  const behind = await page.evaluate(
    () =>
      [...document.querySelectorAll(".tr-c")].filter(
        (span) => getComputedStyle(span).color !== getComputedStyle(span.parentElement).color,
      ).length,
  );
  assert.equal(behind, 0, "phone-412: characters unlit at the end of the page");

  assert.deepEqual(await spanAudit(page), [], "phone-412: a rule restyles character spans");

  const a11y = await accessibility(page);
  assert.equal(a11y.headings.length, 4, "phone-412: reveal headings");
  assert.ok(
    a11y.squashedMatch.every(Boolean),
    `phone-412: heading labels ${JSON.stringify(a11y.headings)}`,
  );
  assert.ok(
    a11y.headings.every((heading) => heading.hiddenSpans === 0),
    "phone-412: heading characters hidden from assistive tech",
  );
  assert.ok(
    a11y.copies.length === 3 &&
      a11y.copies.every((copy) => copy.same && !copy.spokenHasSpans && copy.tiny),
    `phone-412: copy text alternatives ${JSON.stringify(a11y.copies)}`,
  );

  // The heading stays readable, hit-testable text at rest.
  await page.evaluate(() =>
    document
      .querySelector(".story-heading h2")
      .scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await settle(page);
  const rest = await page.evaluate(() => {
    const heading = document.querySelector(".story-heading h2");
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    let textHit = false;
    for (let text = walker.nextNode(); text && !textHit; text = walker.nextNode()) {
      if (!text.textContent.trim() || text.parentElement.closest('[aria-hidden="true"]')) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      textHit = heading.contains(
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
      );
    }
    const box = heading.getBoundingClientRect();
    const edgeHit = heading.contains(
      document.elementFromPoint(box.left + Math.min(40, box.width / 4), box.top + box.height / 2),
    );
    return {
      textHit,
      edgeHit,
      ink: getComputedStyle(heading).color,
      background: getComputedStyle(document.querySelector(".story-layout")).backgroundColor,
    };
  });
  assert.ok(rest.textHit && rest.edgeHit, `phone-412: heading hit-test ${JSON.stringify(rest)}`);
  const contrast =
    (Math.max(luminance(rest.ink), luminance(rest.background)) + 0.05) /
    (Math.min(luminance(rest.ink), luminance(rest.background)) + 0.05);
  assert.ok(contrast >= 7, `phone-412: story heading contrast ${contrast.toFixed(2)}:1`);
  assert.ok(
    (await ink(page, ".story-heading h2")).every((character) => character.full),
    "phone-412: centred heading not fully lit",
  );

  // Characters never get a compositor layer of their own.
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("LayerTree.enable");
  const withReveal = await layerCount(page, cdp, false);
  const withoutReveal = await layerCount(page, cdp, true);
  await layerCount(page, cdp, false);
  assert.ok(withReveal > 0 && withoutReveal > 0, `layers ${withReveal}/${withoutReveal}`);
  assert.ok(
    withReveal - withoutReveal <= 10,
    `phone-412: reveal adds ${withReveal - withoutReveal} layers`,
  );

  // Locks and economy show the words at full ink, and hand them back after.
  const full = await trCount(page);
  assert.ok(full >= 50, `phone-412: ${full} rendered reveal animations`);
  for (const [name, apply, undo] of [
    [
      "side menu",
      "document.documentElement.dataset.sideMenuOpen = 'true'",
      "delete document.documentElement.dataset.sideMenuOpen",
    ],
    [
      "loading",
      "document.documentElement.dataset.loading = 'true'",
      "delete document.documentElement.dataset.loading",
    ],
    [
      "economy",
      "document.documentElement.dataset.worldEffects = 'economy'",
      "delete document.documentElement.dataset.worldEffects",
    ],
    [
      "open dialog",
      "document.body.append(Object.assign(document.createElement('dialog'), { id: 'verify-reveal-dialog', open: true }))",
      "document.getElementById('verify-reveal-dialog').remove()",
    ],
  ]) {
    await page.evaluate(apply);
    await settle(page);
    assert.equal(await trCount(page), 0, `phone-412: reveal runs under ${name}`);
    await page.evaluate(undo);
    await settle(page);
    assert.equal(await unanimated(page), 0, `phone-412: reveal not restored after ${name}`);
  }
  for (const feature of [
    { name: "forced-colors", value: "active" },
    { name: "prefers-contrast", value: "more" },
    { name: "prefers-reduced-transparency", value: "reduce" },
  ]) {
    await cdp.send("Emulation.setEmulatedMedia", { features: [feature] });
    await settle(page);
    assert.equal(await trCount(page), 0, `phone-412: reveal runs under ${feature.name}`);
  }
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await settle(page);

  const rails = await railHold(page, true);
  assert.ok(rails.pressed >= 6, `phone-412: ${rails.pressed} rail presses`);
  // At this width the column rail sits above the part-lit riders heading.
  assert.ok(rails.partLit >= 1, "phone-412: no rail press beside part-lit text");
  assert.deepEqual(rails.problems, [], "phone-412: the reveal moves under a rail lock");

  // Jumps (nav links, hash changes) land on text in its final state.
  for (const [selector, share, lit] of [
    [".section-title h2", 0.4, true],
    [".records-heading h2", 0.4, true],
    [".section-title h2", 0.86, false],
    [".finale-content h2", 0.7, true],
  ]) {
    const frames = await jump(page, selector, share);
    assert.ok(frames.length >= 3, `jump ${selector}: rendered in ${frames.length} frames`);
    assert.ok(
      frames.every((frame) => frame === frames.at(-1)),
      `jump ${selector} @${share}: ink snaps after landing ${frames.join(" ")}`,
    );
    if (lit) assert.ok(!frames.at(-1).includes("0"), `jump ${selector} @${share}: unlit`);
    else assert.ok(frames.at(-1).includes("0"), `jump ${selector} @${share}: already whole`);
  }

  const navs = await navJumps(page, "phone-412", { width: 412, height: 915 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `phone-412: horizontal overflow ${overflow}`);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `phone-412: ${timelines.animations} characters on the document timeline, layers +${withReveal - withoutReveal}, ${rails.pressed} rail presses (${rails.partLit} beside part-lit text) held still, gating, jumps and nav links ok ${JSON.stringify(navs.map(({ id, heading, checked }) => ({ id, heading, checked })))}`,
  );
  await context.close();
}

// A hash landing and a restored scroll read at full ink straight away.
{
  const context = await capableContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  });
  const { page, errors, effects } = await openWorld(context, "/world#riders");
  assert.equal(effects, null, "hash landing: economy");
  await page.waitForTimeout(600);
  // Never vacuous: the page must have moved, and at least one block is checked.
  const landed = async (label) => {
    assert.ok((await page.evaluate(() => window.scrollY)) > 0, `${label}: the page did not move`);
    let checked = 0;
    for (const selector of [".section-title h2", ".section-title > p[data-text-reveal]"]) {
      const top = await page.evaluate(
        (target) => document.querySelector(target).getBoundingClientRect().top / innerHeight,
        selector,
      );
      if (top > 0.72) continue;
      checked += 1;
      assert.ok(
        (await ink(page, selector)).every((character) => character.full),
        `${label}: ${selector} unlit at ${top.toFixed(2)}`,
      );
    }
    assert.ok(checked >= 1, `${label}: no block landed above the reveal line`);
    return checked;
  };
  const hashChecked = await landed("hash landing");
  await placeTop(page, ".section-title > p[data-text-reveal]", 0.3);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".site-shell.mirage-edition");
  await page.waitForTimeout(1_800);
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.worldEffects ?? null),
    null,
    "restored scroll: economy",
  );
  await settle(page);
  const restoredChecked = await landed("restored scroll");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `hash landing and restored scroll: text above the fold is lit (${hashChecked} and ${restoredChecked} blocks checked)`,
  );
  await context.close();
}

// Reduced motion: no reveal at all, every character at full ink.
{
  const context = await capableContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const { page, errors } = await openWorld(context);
  await walk(page);
  assert.equal(await trCount(page), 0, "reduced motion: reveal animations");
  await placeTop(page, ".story-heading h2", 0.9);
  assert.ok(
    (await ink(page, ".story-heading h2")).every((character) => character.full),
    "reduced motion: heading not at full ink",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("reduced motion: no reveal");
  await context.close();
}

// Other shapes: nothing in the first view, every timeline on the document.
// Android landscape phones (the Galaxy and Pixel sizes, toolbar subtracted)
// and a 1366 laptop also check nav-link landings.
for (const viewport of [
  { name: "phone-360", width: 360, height: 780, mobile: true },
  { name: "landscape-844", width: 844, height: 390, mobile: true, android: true, nav: true },
  { name: "landscape-915", width: 915, height: 412, mobile: true, android: true, nav: true },
  { name: "landscape-740", width: 740, height: 360, mobile: true, android: true, nav: true },
  { name: "tablet-1024", width: 1024, height: 768, mobile: false },
  { name: "laptop-1366", width: 1366, height: 768, mobile: false, nav: true },
  { name: "desktop-1440", width: 1440, height: 900, mobile: false },
  { name: "desktop-2560", width: 2560, height: 1440, mobile: false },
]) {
  const context = await capableContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: (viewport.mobile && viewport.width < 600) || Boolean(viewport.android),
    hasTouch: viewport.mobile,
    ...(viewport.android ? { userAgent: ANDROID_UA } : {}),
  });
  const { page, errors, effects } = await openWorld(context);
  assert.equal(effects, null, `${viewport.name}: economy rendering`);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settle(page);
  const firstView = await page.evaluate(
    () =>
      [...document.querySelectorAll("[data-text-reveal]")].filter((block) => {
        const box = block.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight && box.height > 0;
      }).length,
  );
  assert.equal(firstView, 0, `${viewport.name}: a reveal block sits in the first viewport`);
  await walk(page);
  const timelines = await timelineState(page);
  assert.equal(timelines.animations, timelines.spans, `${viewport.name}: animations`);
  assert.deepEqual(timelines.detached, [], `${viewport.name}: reveal bound to a panel scroller`);
  assert.deepEqual(await wholeText(page), [], `${viewport.name}: a whole block is split`);
  for (const selector of BLOCKS) {
    await placeTop(page, selector, 0.5);
    assert.ok(
      (await ink(page, selector)).every((character) => character.full),
      `${viewport.name}: ${selector} not fully lit at 50%`,
    );
  }
  await revealLine(page, viewport.name, viewport);
  const navs = viewport.nav ? await navJumps(page, viewport.name, viewport) : [];
  assert.deepEqual(await spanAudit(page), [], `${viewport.name}: a rule restyles character spans`);
  const finale = await finaleWrites(page);
  assert.ok(finale.partial >= 3, `${viewport.name}: finale headline pops (${finale.partial})`);
  assert.equal(finale.unlitAtEnd, 0, `${viewport.name}: finale headline unlit after its stage`);
  const rails = await railHold(page, viewport.mobile);
  assert.ok(rails.pressed >= 3, `${viewport.name}: ${rails.pressed} rail presses`);
  assert.deepEqual(rails.problems, [], `${viewport.name}: the reveal moves under a rail lock`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `${viewport.name}: horizontal overflow ${overflow}`);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    `${viewport.name}: ${timelines.animations} characters, timelines, ink, reveal line${navs.length ? `, nav links ${JSON.stringify(navs.map(({ id, heading, checked }) => ({ id, heading, checked })))}` : ""} and rails ok`,
  );
  await context.close();
}

// Style cost on the JS progress path (desktop, iOS 26): per-character spans
// multiply the cost of any inherited custom property written on <html> every
// scroll frame. use-world-mode.ts writes --page-progress only on the header
// hosts, so this measures the page as shipped and fails if the root write
// returns.
{
  const context = await capableContext({ viewport: { width: 412, height: 915 } });
  const cost = await styleCost(context);
  await context.close();
  assert.ok(
    cost.on - cost.off <= 1.5 && cost.on <= 6,
    `desktop style cost ${cost.on.toFixed(2)} ms/frame with the reveal, ${cost.off.toFixed(2)} without (4× CPU)`,
  );
  console.log(
    `desktop style cost at 4× CPU: ${cost.on.toFixed(2)} ms/frame with the reveal, ${cost.off.toFixed(2)} without`,
  );
}

await browser.close();
console.log("world reveal ok");
