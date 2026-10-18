import { chromium, webkit } from "playwright";

const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:8594").replace(/\/$/, "");
const timeoutMs = Number(process.env.STARTUP_TIMEOUT_MS ?? 30000);
const engine = process.env.PW_ENGINE ?? "chromium";
if (!new Set(["chromium", "webkit"]).has(engine))
  throw new Error(`Unsupported PW_ENGINE: ${engine}`);
const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch(
  engine === "webkit" ? {} : { channel: process.env.PW_BROWSER_CHANNEL ?? "chrome" },
);
const results = [];

const addFaults = async (page, faults = []) => {
  await page.addInitScript(
    ({ faults }) => {
      const diag = (window.__rznStartupRecovery = {
        idleRequested: 0,
        idleCalled: 0,
        bitmapStalled: 0,
      });
      if (faults.includes("idle-starved")) {
        let id = 0;
        window.requestIdleCallback = () => {
          diag.idleRequested++;
          return ++id;
        };
        window.cancelIdleCallback = () => {};
      }
      if (faults.includes("bitmap-stalled")) {
        const createBitmap = window.createImageBitmap?.bind(window);
        if (createBitmap) {
          window.createImageBitmap = (...args) => {
            const src = args[0]?.currentSrc || args[0]?.src || "";
            if (/rexonance-nanites.*cells\.webp/i.test(src)) {
              diag.bitmapStalled++;
              return new Promise(() => {});
            }
            return createBitmap(...args);
          };
        }
      }
      if (faults.includes("save-data")) {
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: {
            saveData: true,
            effectiveType: "4g",
            addEventListener() {},
            removeEventListener() {},
          },
        });
      }
    },
    { faults },
  );
};

const openPage = async ({
  path = "",
  faults = [],
  failFigureUntilManualRetry = false,
  clientWorldTransition = false,
} = {}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  const layoutTrace = [];
  const requests = { figure: 0, figureFailures: 0, naniteAssets: [] };
  let allowFigure = !failFigureUntilManualRetry;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/rexonance-nanites/i.test(request.url())) requests.naniteAssets.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      // Chrome emits this for the deliberately aborted figure requests in
      // the manual-retry case; all other browser errors remain failures.
      const expectedFigureAbort = failFigureUntilManualRetry && text.includes("net::ERR_FAILED");
      const unsupportedViewportHint =
        engine === "webkit" &&
        text.includes('Viewport argument key "interactive-widget" not recognized');
      if (!expectedFigureAbort && !unsupportedViewportHint) errors.push(`console: ${text}`);
    }
  });
  await addFaults(page, faults);
  if (failFigureUntilManualRetry) {
    await page.route("**/rexonance-suit-20261016/figure.webp", async (route) => {
      requests.figure++;
      if (!allowFigure) {
        requests.figureFailures++;
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
  }
  const response = await page.goto(
    `${baseUrl}${clientWorldTransition ? "/world" : `/rexonance-saga${path}`}`,
    {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    },
  );
  layoutTrace.push({ milestone: "domcontentloaded", ...(await readLayout(page)) });
  if (clientWorldTransition) {
    await page.getByRole("button", { name: "メニューを開く" }).click({ timeout: timeoutMs });
    const menuLink = page.locator('#site-side-panel a[href^="/rexonance-saga"]');
    await menuLink.waitFor({ state: "visible", timeout: timeoutMs });
    await page.evaluate(() => {
      window.__rznHeroHashClick = null;
      document.addEventListener(
        "click",
        (event) => {
          const link = event.target?.closest?.("a.rxe-hero-primary");
          if (link)
            window.__rznHeroHashClick = {
              lowerMountedBeforeClick: Boolean(document.querySelector("#assembly")),
              loadingBeforeClick: document.documentElement.hasAttribute("data-loading"),
              targetHref: link.getAttribute("href"),
            };
        },
        true,
      );
    });
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/rexonance-saga", { timeout: timeoutMs }),
      menuLink.click({ timeout: timeoutMs }),
    ]);
    layoutTrace.push({ milestone: "client-route-transition", ...(await readLayout(page)) });
    // Begin observing the CTA before waiting for the route cover. This lets
    // the click happen on the first usable frame after the cover clears,
    // rather than after an extra visibility wait has allowed lazy sections
    // to finish mounting.
    const firstVisibleHeroCta = page.waitForFunction(
      () => {
        const link = document.querySelector("a.rxe-hero-primary");
        return (
          link && link.getClientRects().length > 0 && getComputedStyle(link).visibility !== "hidden"
        );
      },
      null,
      { timeout: timeoutMs },
    );
    await page.waitForFunction(() => !document.documentElement.hasAttribute("data-loading"), null, {
      timeout: timeoutMs,
    });
    await firstVisibleHeroCta;
    layoutTrace.push({ milestone: "route-cover-cleared", ...(await readLayout(page)) });
    return {
      context,
      page,
      errors,
      requests,
      layoutTrace,
      responseStatus: response?.status() ?? null,
      setFigureAllowed: () => {
        allowFigure = true;
      },
    };
  }
  await page.waitForSelector(".rzn-suitup", { timeout: timeoutMs });
  layoutTrace.push({ milestone: "runway-mounted", ...(await readLayout(page)) });
  if (!faults.includes("save-data")) {
    await page.waitForFunction(
      () => document.querySelector('main[data-motion-ready="true"]'),
      null,
      { timeout: timeoutMs },
    );
    layoutTrace.push({ milestone: "motion-ready", ...(await readLayout(page)) });
  }
  await page.waitForFunction(() => document.querySelector("#stages"), null, { timeout: timeoutMs });
  layoutTrace.push({ milestone: "stages-mounted", ...(await readLayout(page)) });
  await waitForStableLayout(page, timeoutMs);
  layoutTrace.push({ milestone: "layout-stable", ...(await readLayout(page)) });
  return {
    context,
    page,
    errors,
    requests,
    layoutTrace,
    responseStatus: response?.status() ?? null,
    setFigureAllowed: () => {
      allowFigure = true;
    },
  };
};

const readLayout = async (page) =>
  page.evaluate(() => {
    const heading = document.querySelector("#assembly");
    const runway = document.querySelector(".rzn-suitup");
    const stages = document.querySelector("#stages");
    const docTop = (element) =>
      element ? Math.round(element.getBoundingClientRect().top + scrollY) : null;
    return {
      url: location.href,
      scrollY: Math.round(scrollY),
      documentHeight: document.documentElement.scrollHeight,
      assemblyDocTop: docTop(heading),
      assemblyViewportTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
      assemblyScrollMargin: heading ? getComputedStyle(heading).scrollMarginBlockStart : null,
      runwayDocTop: docTop(runway),
      runwayHeight: runway?.offsetHeight ?? null,
      stagesDocTop: docTop(stages),
      fontsReady: document.fonts?.status ?? null,
    };
  });

const waitForStableLayout = async (page, timeout = 10000) => {
  const started = Date.now();
  let previous = "";
  let same = 0;
  while (Date.now() - started < timeout) {
    const layout = await readLayout(page);
    const signature = JSON.stringify([
      layout.documentHeight,
      layout.assemblyDocTop,
      layout.runwayDocTop,
      layout.stagesDocTop,
    ]);
    same = signature === previous ? same + 1 : 0;
    if (same >= 4) return layout;
    previous = signature;
    await page.waitForTimeout(100);
  }
  throw new Error(`layout did not stabilize: ${JSON.stringify(await readLayout(page))}`);
};

const moveIntoAssembly = async (page) => {
  await page.waitForFunction(
    () => {
      const runway = document.querySelector(".rzn-suitup");
      const stages = document.querySelector("#stages");
      return runway && stages && stages.offsetTop > runway.offsetTop;
    },
    null,
    { timeout: timeoutMs },
  );
  await waitForStableLayout(page, timeoutMs);
  await page.locator(".rzn-suitup").evaluate((runway) => {
    const frame = runway.querySelector(".rzn-frame");
    if (!frame) throw new Error("Rexonance frame is missing");
    const pinTop = Number.parseFloat(getComputedStyle(frame).top) || 0;
    const top =
      runway.getBoundingClientRect().top +
      scrollY -
      pinTop +
      (runway.offsetHeight - frame.offsetHeight) * 0.45;
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    scrollTo(0, top);
    root.style.scrollBehavior = previousBehavior;
  });
};

const readVisualState = async (page) =>
  page.evaluate(() => {
    const runway = document.querySelector(".rzn-suitup");
    const canvas = runway?.querySelector(".rzn-canvas");
    let nonzeroAlpha = 0;
    if (canvas?.width && canvas?.height) {
      const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (pixels) for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) nonzeroAlpha++;
    }
    return {
      url: location.href,
      hash: location.hash,
      scrollY: Math.round(scrollY),
      documentHeight: document.documentElement.scrollHeight,
      runwayTop: Math.round(runway?.getBoundingClientRect().top ?? 0),
      runwayHeight: runway?.offsetHeight ?? 0,
      frameTop: runway ? getComputedStyle(runway.querySelector(".rzn-frame")).top : null,
      state: runway?.dataset.rznState ?? null,
      load: runway?.dataset.rznLoad ?? null,
      phase: runway?.dataset.rznPhase ?? null,
      percent: Number.parseInt(runway?.querySelector(".rzn-percent")?.textContent ?? "0", 10) || 0,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      display: canvas ? getComputedStyle(canvas).display : "missing",
      nonzeroAlpha,
      idleRequested: window.__rznStartupRecovery?.idleRequested ?? null,
      bitmapStalled: window.__rznStartupRecovery?.bitmapStalled ?? null,
      nativeRIC: typeof window.requestIdleCallback,
    };
  });

const assertLiveAssembly = async (page, label) => {
  try {
    await page.waitForFunction(
      () => {
        const runway = document.querySelector(".rzn-suitup");
        return (
          runway?.dataset.rznState === "live" &&
          Number.parseInt(runway.querySelector(".rzn-percent")?.textContent ?? "0", 10) > 0
        );
      },
      null,
      { timeout: timeoutMs, polling: 150 },
    );
  } catch {
    throw new Error(
      `${label}: assembly did not become live before deadline; got ${JSON.stringify(await readVisualState(page))}`,
    );
  }
  await page.waitForTimeout(200);
  const state = await readVisualState(page);
  // A fast WebKit fallback can finish while the assertion samples the
  // canvas; reaching 100% still proves successful recovery, not a stall.
  if (
    state.state !== "live" ||
    state.percent <= 0 ||
    state.canvasWidth <= 0 ||
    state.canvasHeight <= 0 ||
    state.display === "none" ||
    state.nonzeroAlpha <= 0
  ) {
    throw new Error(
      `${label}: expected visible, progressing assembly; got ${JSON.stringify(state)}`,
    );
  }
  return state;
};

const runCase = async (name, options, exercise) => {
  if (process.env.ONLY_CASE && process.env.ONLY_CASE !== name) return;
  let session;
  try {
    session = await openPage(options);
    const result = await exercise(session);
    if (session.errors.length)
      throw new Error(`${name}: browser errors: ${session.errors.join(" | ")}`);
    results.push({
      name,
      ok: true,
      responseStatus: session.responseStatus,
      layoutTrace: session.layoutTrace,
      ...result,
    });
    console.log(
      JSON.stringify({ case: name, ok: true, layoutTrace: session.layoutTrace, ...result }),
    );
  } finally {
    await session?.context.close();
  }
};

try {
  await runCase("direct-assembly-hash", { path: "#assembly" }, async ({ page }) => {
    await page.waitForFunction(
      () => location.hash === "#assembly" && document.querySelector("#assembly"),
      null,
      { timeout: timeoutMs },
    );
    const landing = await page.locator("#assembly").evaluate((element) => ({
      top: Math.round(element.getBoundingClientRect().top),
      scrollMargin: getComputedStyle(element).scrollMarginBlockStart,
    }));
    if (landing.top < 0 || landing.top > 180)
      throw new Error(
        `direct-assembly-hash: anchor drifted out of view after layout settled; ${JSON.stringify(landing)}`,
      );
    await moveIntoAssembly(page);
    return { landing, state: await assertLiveAssembly(page, "direct-assembly-hash") };
  });

  await runCase(
    "client-world-to-hero-cta-early-assembly",
    { clientWorldTransition: true },
    async ({ page }) => {
      const heroCta = page.getByRole("link", { name: "変身を体験" });
      await heroCta.click({ timeout: timeoutMs });
      await page.waitForFunction(
        () => location.hash === "#assembly" && document.querySelector("#assembly"),
        null,
        { timeout: timeoutMs },
      );
      await page.waitForFunction(() => document.querySelector("#stages"), null, {
        timeout: timeoutMs,
      });
      await waitForStableLayout(page, timeoutMs);
      const click = await page.evaluate(() => window.__rznHeroHashClick);
      const landing = await page.locator("#assembly").evaluate((element) => ({
        top: Math.round(element.getBoundingClientRect().top),
        scrollMargin: getComputedStyle(element).scrollMarginBlockStart,
      }));
      if (click?.targetHref !== "#assembly")
        throw new Error(
          `client-world-to-hero-cta-early-assembly: actual hero CTA was not observed; ${JSON.stringify(click)}`,
        );
      if (click.loadingBeforeClick)
        throw new Error(
          `client-world-to-hero-cta-early-assembly: clicked before the route cover cleared; ${JSON.stringify(click)}`,
        );
      if (landing.top < 0 || landing.top > 180)
        throw new Error(
          `client-world-to-hero-cta-early-assembly: anchor drifted after route transition/layout; click=${JSON.stringify(click)} landing=${JSON.stringify(landing)}`,
        );
      await moveIntoAssembly(page);
      return {
        click,
        landing,
        state: await assertLiveAssembly(page, "client-world-to-hero-cta-early-assembly"),
      };
    },
  );

  await runCase("idle-starved-recovery", { faults: ["idle-starved"] }, async ({ page }) => {
    await moveIntoAssembly(page);
    const state = await assertLiveAssembly(page, "idle-starved-recovery");
    if (!(state.idleRequested > 0))
      throw new Error("idle-starved-recovery: the idle callback fault did not engage");
    return { state };
  });

  await runCase("bitmap-stall-recovery", { faults: ["bitmap-stalled"] }, async ({ page }) => {
    await moveIntoAssembly(page);
    const state = await assertLiveAssembly(page, "bitmap-stall-recovery");
    if (!(state.bitmapStalled > 0))
      throw new Error("bitmap-stall-recovery: the bitmap fault did not engage");
    return { state };
  });

  await runCase(
    "lower-chapter-entry-idle-starved",
    { path: "#stages", faults: ["idle-starved"] },
    async ({ page }) => {
      await page.waitForFunction(
        () => location.hash === "#stages" && document.querySelector("#stages"),
        null,
        { timeout: timeoutMs },
      );
      await moveIntoAssembly(page);
      return { state: await assertLiveAssembly(page, "lower-chapter-entry-idle-starved") };
    },
  );

  await runCase(
    "required-figure-failure-manual-retry",
    { failFigureUntilManualRetry: true },
    async (session) => {
      const { page, requests, setFigureAllowed } = session;
      await moveIntoAssembly(page);
      await page.waitForFunction(
        () => document.querySelector(".rzn-suitup")?.dataset.rznLoad === "error",
        null,
        { timeout: timeoutMs },
      );
      const retry = page.getByRole("button", { name: "素材を再読み込み" });
      await retry.waitFor({ state: "visible", timeout: timeoutMs });
      if (requests.figureFailures < 1)
        throw new Error(
          `required-figure-failure-manual-retry: expected failed figure request; got ${JSON.stringify(requests)}`,
        );
      setFigureAllowed();
      await retry.click({ timeout: timeoutMs });
      await page.waitForFunction(
        () => document.querySelector(".rzn-suitup")?.dataset.rznLoad === "ready",
        null,
        { timeout: timeoutMs },
      );
      await moveIntoAssembly(page);
      const state = await assertLiveAssembly(page, "required-figure-failure-manual-retry");
      if (requests.figure <= requests.figureFailures)
        throw new Error(
          "required-figure-failure-manual-retry: retry did not request the figure again",
        );
      return { state, requests };
    },
  );

  await runCase(
    "save-data-static-fallback",
    { faults: ["save-data"] },
    async ({ page, requests }) => {
      await page
        .locator(".rzn-suitup")
        .evaluate((runway) => runway.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForFunction(
        () => {
          const still = document.querySelector(".rzn-suitup .rzn-still");
          return still?.complete && still.naturalWidth > 0;
        },
        null,
        { timeout: timeoutMs },
      );
      const state = await readVisualState(page);
      if (
        state.state !== null ||
        state.canvasWidth !== 0 ||
        state.canvasHeight !== 0 ||
        state.nonzeroAlpha !== 0
      ) {
        throw new Error(
          `save-data-static-fallback: expected still-image path without an assembly canvas; got ${JSON.stringify(state)}`,
        );
      }
      if (requests.naniteAssets.length)
        throw new Error(
          `save-data-static-fallback: Save-Data downloaded animation assets: ${JSON.stringify(requests.naniteAssets)}`,
        );
      return {
        state,
        staticImage: await page.locator(".rzn-suitup .rzn-still").evaluate((image) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
      };
    },
  );

  console.log(JSON.stringify({ event: "summary", ok: true, cases: results.length }));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        event: "summary",
        ok: false,
        cases: results.length,
        error: error?.stack ?? String(error),
        passed: results,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
