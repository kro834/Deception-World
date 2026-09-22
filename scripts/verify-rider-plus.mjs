import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.BASE_URL || "http://127.0.0.1:8082");
const output = process.env.AUDIT_OUT || "/tmp/rider-plus-audit";
const noFrost = process.env.PW_NO_FROST === "1";
const engineName = process.env.PW_ENGINE || "chromium";
const browserType = engineName === "webkit" ? webkit : chromium;
let baselineCaptured = false;
let noFrostAborted = 0;
await mkdir(output, { recursive: true });
const browser = await browserType.launch(
  engineName === "chromium" ? { channel: "chrome" } : undefined,
);
async function position(page, control) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await control.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(180);
  }
}
function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]
    .split(/[,/ ]+/)
    .filter(Boolean)
    .map(Number);
  return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
}
function luminance({ r, g, b }) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function composite(foreground, background) {
  const alpha = foreground.a;
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}
function contrast(foreground, background) {
  const first = luminance(composite(foreground, background));
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
async function inspect(control, label, pressed = false, checkLabels = true) {
  const metrics = await control.evaluate((node) => {
    const thumb = node.querySelector(".ios-slide-open-thumb");
    const labelSmall = node.querySelector(".ios-slide-open-label small");
    const labelText = node.querySelector(".ios-slide-open-label b");
    const arrows = node.querySelector(".ios-slide-open-arrows");
    const arrow = arrows?.querySelector("i");
    const svg = thumb.querySelector("svg");
    const path = svg.querySelector("path");
    const rect = (el) => el.getBoundingClientRect().toJSON();
    return {
      button: rect(node),
      thumb: rect(thumb),
      labelSmall: rect(labelSmall),
      labelText: rect(labelText),
      arrows: rect(arrows),
      svg: rect(svg),
      path: rect(path),
      buttonBackground: getComputedStyle(node).backgroundColor,
      buttonRadius: parseFloat(getComputedStyle(node).borderTopLeftRadius),
      labelSmallColor: getComputedStyle(labelSmall).color,
      labelTextColor: getComputedStyle(labelText).color,
      arrowColor: getComputedStyle(arrow).borderTopColor,
      labelSmallOpacity: getComputedStyle(labelSmall).opacity,
      labelTextOpacity: getComputedStyle(labelText).opacity,
      labelParentOpacity: getComputedStyle(labelSmall.parentElement).opacity,
      arrowOpacity: getComputedStyle(arrow).opacity,
      arrowParentOpacity: getComputedStyle(arrows).opacity,
      color: getComputedStyle(svg).color,
      background: getComputedStyle(thumb).backgroundColor,
      stroke: parseFloat(getComputedStyle(path).strokeWidth),
      ring: getComputedStyle(thumb.querySelector("i")).display,
    };
  });
  const { button, thumb, svg, path } = metrics;
  const buttonBackground = parseColor(metrics.buttonBackground);
  if (noFrost && !baselineCaptured) {
    baselineCaptured = true;
    await writeFile(
      "/tmp/rider-plus-no-frost-baseline.json",
      JSON.stringify(
        { label, buttonBackground: metrics.buttonBackground, buttonRadius: metrics.buttonRadius },
        null,
        2,
      ),
    );
    console.log(
      `NO_FROST baseline: ${label} background=${metrics.buttonBackground} radius=${metrics.buttonRadius} abortedStylesheets=${noFrostAborted}`,
    );
  }
  const darkBackground =
    buttonBackground && buttonBackground.a === 1 && luminance(buttonBackground) < 0.25;
  if (!buttonBackground || buttonBackground.a !== 1) {
    assert.fail(`${label}: rail background must be opaque, got ${metrics.buttonBackground}`);
  }
  if (noFrost && luminance(buttonBackground) > 0.55) {
    // Keep the diagnostic assertion explicit: this is the old programme-paper
    // baseline that the no-frost run is intended to expose and log.
    assert.fail(`${label}: no-frost baseline still has the old light rail`);
  }
  if (darkBackground) {
    assert.ok(
      metrics.buttonRadius >= 20,
      `${label}: rail must remain rounded, got ${metrics.buttonRadius}px`,
    );
  } else {
    assert.ok(darkBackground, `${label}: rail must remain dark, got ${metrics.buttonBackground}`);
  }
  const inside = (child) =>
    child.x >= button.x &&
    child.right <= button.right &&
    child.y >= button.y &&
    child.bottom <= button.bottom;
  assert.ok(inside(metrics.labelSmall), `${label}: HOLD + SLIDE label inside rail`);
  assert.ok(inside(metrics.labelText), `${label}: detail label inside rail`);
  assert.ok(inside(metrics.arrows), `${label}: arrows inside rail`);
  if (checkLabels && buttonBackground) {
    // Even where the progress fill crosses the text, its 8% tint must not
    // erase contrast (use full opacity as the conservative bound).
    const textBackground = composite({ r: 111, g: 227, b: 255, a: 0.08 }, buttonBackground);
    for (const [name, color, opacity, minimumContrast] of [
      [
        "HOLD + SLIDE",
        metrics.labelSmallColor,
        Number(metrics.labelSmallOpacity) * Number(metrics.labelParentOpacity),
        4.5,
      ],
      [
        "detail label",
        metrics.labelTextColor,
        Number(metrics.labelTextOpacity) * Number(metrics.labelParentOpacity),
        4.5,
      ],
      [
        "arrows",
        metrics.arrowColor,
        Number(metrics.arrowOpacity) * Number(metrics.arrowParentOpacity),
        3,
      ],
    ]) {
      const foreground = parseColor(color);
      assert.ok(foreground, `${label}: ${name} color is readable`);
      foreground.a *= opacity;
      assert.ok(
        contrast(foreground, textBackground) >= minimumContrast,
        `${label}: ${name} contrast`,
      );
    }
  }
  assert.equal(metrics.color, "rgb(255, 255, 255)", `${label}: white glyph`);
  assert.ok(
    ["rgb(16, 26, 40)", "rgb(11, 20, 33)"].includes(metrics.background),
    `${label}: opaque dark surface`,
  );
  assert.ok(
    path.width >= (pressed ? 15 : 17) && path.height >= (pressed ? 15 : 17),
    `${label}: plus must have a readable painted size, got ${path.width}x${path.height}`,
  );
  assert.ok(metrics.stroke >= 3, `${label}: plus stroke`);
  assert.equal(metrics.ring, "none", `${label}: inner ring must not compete with glyph`);
  assert.ok(
    thumb.x >= button.x &&
      thumb.right <= button.right &&
      thumb.y >= button.y &&
      thumb.bottom <= button.bottom,
    `${label}: thumb inside rail`,
  );
  assert.ok(
    svg.x >= thumb.x && svg.right <= thumb.right && svg.y >= thumb.y && svg.bottom <= thumb.bottom,
    `${label}: icon inside thumb`,
  );
  assert.ok(
    Math.abs(svg.x + svg.width / 2 - thumb.x - thumb.width / 2) < 1,
    `${label}: centered x`,
  );
  assert.ok(
    Math.abs(svg.y + svg.height / 2 - thumb.y - thumb.height / 2) < 1,
    `${label}: centered y`,
  );
  assert.ok(button.height >= 44 && button.width >= 44, `${label}: touch target`);
  return metrics;
}
try {
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [1024, 768],
    [1280, 960],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
    });
    const abortedBefore = noFrostAborted;
    if (noFrost) {
      await page.route("**/*", async (route) => {
        if (
          route.request().resourceType() === "stylesheet" &&
          /styles-frosted-controls/i.test(route.request().url())
        ) {
          noFrostAborted += 1;
          await route.abort();
          return;
        }
        await route.continue();
      });
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/world", base).href);
    if (noFrost)
      assert.ok(
        noFrostAborted > abortedBefore,
        "PW_NO_FROST must abort styles-frosted-controls.css",
      );
    await page
      .locator('.rider-tabs[data-liquid-initialized="true"]')
      .waitFor({ state: "attached" });
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute("data-route-scroll-settling"),
    );
    const tabs = page.locator('.rider-tabs button[role="tab"]');
    assert.equal(await tabs.count(), 8);
    const control = page.locator(".rider-dossier-open");
    const cdp = engineName === "chromium" ? await page.context().newCDPSession(page) : null;
    const touch = async (type, point) => {
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: point ? [point] : [] });
        return;
      }
      // WebKit has no CDP touch dispatcher here; use pointer dispatch with a
      // touch pointer and report this branch as a pointer-dispatch audit.
      const event =
        type === "touchStart" ? "pointerdown" : type === "touchMove" ? "pointermove" : "pointerup";
      await page.dispatchEvent(".rider-dossier-open", event, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        clientX: point?.x ?? 0,
        clientY: point?.y ?? 0,
        bubbles: true,
      });
    };
    let expectedSize;
    for (let index = 0; index < 8; index++) {
      await tabs.nth(index).click();
      await page.waitForFunction(
        (id) =>
          document.querySelector("#rider-active-panel")?.getAttribute("aria-labelledby") === id,
        await tabs.nth(index).getAttribute("id"),
      );
      await position(page, control);
      const metrics = await inspect(control, `${width}/rider-${index + 1}`);
      const size = [metrics.button.width, metrics.button.height];
      expectedSize ??= size;
      // DOMRect subtraction at fractional scroll offsets can differ by ~0.00003px.
      assert.ok(
        size.every((value, axis) => Math.abs(value - expectedSize[axis]) < 0.05),
        "all rider controls retain identical dimensions",
      );
      const point = {
        x: metrics.thumb.x + metrics.thumb.width / 2,
        y: metrics.thumb.y + metrics.thumb.height / 2,
      };
      assert.equal(
        await control.evaluate(
          (node, p) => node.contains(document.elementFromPoint(p.x, p.y)),
          point,
        ),
        true,
        "visible hit target",
      );
      await touch("touchStart", point);
      // The hold timer runs on the page main thread and can be delayed while
      // a newly selected rider's artwork/layout settles. Wait for the actual
      // state transition instead of sampling at a fixed 100 ms boundary.
      await page.waitForFunction(
        () =>
          document.querySelector(".rider-dossier-open")?.getAttribute("data-dragging") === "true",
        null,
        { timeout: 500 },
      );
      assert.equal(await control.getAttribute("data-dragging"), "true");
      await inspect(control, `${width}/rider-${index + 1}/hold`, true);
      await touch("touchMove", { x: point.x + 16, y: point.y });
      await page.waitForTimeout(40);
      await inspect(control, `${width}/rider-${index + 1}/drag`, true, false);
      await touch("touchEnd");
      await page.waitForTimeout(350);
      assert.equal(await control.getAttribute("data-dragging"), "false");
      assert.equal(new URL(page.url()).pathname, "/world", "short slide cancels navigation");
      if (index === 0 || index === 7)
        await page.screenshot({
          path: checkedOutputPath(`${output}/${width}-rider-${index + 1}.png`, [output]),
        });
    }
    // The same enlarged plus still opens the selected rider with a tap.
    await control.focus();
    // Programmatic focus is not necessarily :focus-visible in Chrome. Send a
    // non-activating keydown so the component's keyboard-focus path is tested
    // without opening the dossier before the final pointer tap.
    await control.press("Shift");
    assert.equal(
      await control.getAttribute("data-keyboard-focus"),
      "true",
      `${width}: keyboard focus state`,
    );
    await inspect(control, `${width}/keyboard-focus`);
    const final = await inspect(control, `${width}/tap`);
    await page.touchscreen.tap(
      final.thumb.x + final.thumb.width / 2,
      final.thumb.y + final.thumb.height / 2,
    );
    await page.waitForURL("**/riders/cipher");
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}: plus/rail contrast, all 8 hold/drag/cancel, keyboard focus, tap navigation`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
