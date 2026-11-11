/* On-device performance overlay. Loaded ONLY by a dynamic import from
   src/lib/perf-hud-gate.js when sessionStorage["dw-perf"] === "1"
   (?perf=1 turns it on, ?perf=0 off). Nothing here may be imported statically.

   Measurement stays out of the page's way: one rAF loop that only pushes the
   frame delta into arrays, text written with textContent every 500 ms, no
   backdrop-filter, one tiny DPR-1 sparkline canvas. The panel lives in a shadow
   root so page CSS and the document-level hooks (liquid glass, press feedback)
   neither style nor target it. */

type RouteStat = {
  route: string;
  startedAt: number;
  durationMs: number;
  frames: number;
  avgFps: number;
  p95: number;
  stalls100: number;
};

const WINDOW_MS = 5000;
const SPARK_N = 120;
const ROUTE_CAP = 200000;
const HOST_ID = "dw-perf-hud";

let mounted = false;

function pct(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function sortedCopy(a: number[]): number[] {
  return a.slice().sort((x, y) => x - y);
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pad2 = (n: number) => String(n).padStart(2, "0");
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

function shortUa(): string {
  const ua = navigator.userAgent;
  const ver = /Version\/([\d.]+)/.exec(ua)?.[1];
  const ios = /OS (\d+)[_.](\d+)/.exec(ua);
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone/.test(ua)) return `iPhone iOS ${ios ? `${ios[1]}.${ios[2]}` : "?"} Safari ${ver ?? "?"}`;
  if (/iPad/.test(ua) || touchMac) return `iPad ${ios ? `iOS ${ios[1]}.${ios[2]} ` : ""}Safari ${ver ?? "?"}`;
  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(ua)?.[1];
  if (chrome) return `${/Android/.test(ua) ? "Android " : ""}Chrome ${chrome}`;
  if (ver) return `Safari ${ver}`;
  return ua.slice(0, 40);
}

export function mountPerfHud(): void {
  if (mounted || typeof document === "undefined" || document.getElementById(HOST_ID)) return;
  mounted = true;

  // ---- state -------------------------------------------------------------
  const sessionStart = Date.now();
  let resetAt = sessionStart;
  let lastT = 0;
  let frames = 0;
  let over33 = 0;
  let over50 = 0;
  let over100 = 0;
  let longest = 0;
  let ltCount = 0;
  let ltMax = 0;
  let ltObserver: PerformanceObserver | null = null;
  const winT: number[] = [];
  const winDt: number[] = [];
  const spark: number[] = [];
  let tickFrames = 0;
  let tickAt = performance.now();
  let curFps = 0;
  const routes: RouteStat[] = [];
  let cur = newSegment(location.pathname);

  function newSegment(route: string) {
    return { route, startedAt: Date.now(), dts: [] as number[], sum: 0, stalls100: 0 };
  }

  function freeze(seg: typeof cur): RouteStat {
    const sorted = sortedCopy(seg.dts);
    return {
      route: seg.route,
      startedAt: seg.startedAt,
      durationMs: Date.now() - seg.startedAt,
      frames: seg.dts.length,
      avgFps: seg.sum > 0 ? (seg.dts.length * 1000) / seg.sum : 0,
      p95: pct(sorted, 0.95),
      stalls100: seg.stalls100,
    };
  }

  function reset() {
    resetAt = Date.now();
    lastT = 0;
    frames = over33 = over50 = over100 = 0;
    longest = ltCount = ltMax = 0;
    winT.length = winDt.length = spark.length = 0;
    routes.length = 0;
    cur = newSegment(location.pathname);
    tickFrames = 0;
    tickAt = performance.now();
  }

  // ---- frame loop: arrays only, no DOM ------------------------------------
  let raf = 0;
  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const path = location.pathname;
    if (path !== cur.route) {
      routes.push(freeze(cur));
      cur = newSegment(path);
    }
    if (lastT) {
      const dt = t - lastT;
      frames++;
      tickFrames++;
      winT.push(t);
      winDt.push(dt);
      spark.push(dt);
      if (spark.length > SPARK_N) spark.shift();
      if (dt > 33) over33++;
      if (dt > 50) over50++;
      if (dt > 100) {
        over100++;
        cur.stalls100++;
      }
      if (dt > longest) longest = dt;
      if (cur.dts.length < ROUTE_CAP) {
        cur.dts.push(dt);
        cur.sum += dt;
      }
    }
    lastT = t;
  }
  const onVisibility = () => {
    lastT = 0; // a backgrounded gap is not a stall
    tickFrames = 0;
    tickAt = performance.now();
  };

  // ---- long tasks (observer where supported; rAF gaps otherwise) ----------
  const hasObserver =
    typeof PerformanceObserver !== "undefined" &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask");
  if (hasObserver) {
    try {
      ltObserver = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          ltCount++;
          if (e.duration > ltMax) ltMax = e.duration;
        }
      });
      ltObserver.observe({ type: "longtask" });
    } catch {
      ltObserver = null;
    }
  }
  const longTaskText = () =>
    ltObserver
      ? `${ltCount} (max ${Math.round(ltMax)}ms, observer)`
      : `${over50} (rAF gap >50ms)`;

  // ---- context -------------------------------------------------------------
  const rm = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const ua = shortUa();
  function contextText(): string {
    const root = document.documentElement;
    const liquid = root.getAttribute("data-button-style") === "liquid";
    const variant = root.getAttribute("data-glass-variant") ?? "clear";
    return (
      `${location.pathname} ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x ` +
      `${navigator.hardwareConcurrency ?? "?"}core ${ua} ` +
      `glass:${liquid ? `on(${variant})` : "off"} motion:${rm?.matches ? "reduce" : "full"} ` +
      `${document.visibilityState}`
    );
  }

  // ---- report ----------------------------------------------------------------
  type Snap = {
    fps5: number;
    p50: number;
    p95: number;
    max: number;
  };
  function windowSnap(): Snap {
    const sorted = sortedCopy(winDt);
    let sum = 0;
    for (const d of winDt) sum += d;
    return {
      fps5: sum > 0 ? (winDt.length * 1000) / sum : 0,
      p50: pct(sorted, 0.5),
      p95: pct(sorted, 0.95),
      max: sorted.length ? sorted[sorted.length - 1] : 0,
    };
  }

  function routeLine(r: RouteStat, live: boolean): string {
    return (
      `${r.route}  ${clock(r.startedAt)}  ${f1(r.durationMs / 1000)}s  ` +
      `avg ${f1(r.avgFps)}fps  p95 ${f1(r.p95)}ms  >100ms ${r.stalls100}` +
      (live ? "  (計測中)" : "")
    );
  }

  function buildReport(): string {
    const w = windowSnap();
    const all = [...routes, { ...freeze(cur) }];
    const root = document.documentElement;
    const liquid = root.getAttribute("data-button-style") === "liquid";
    const lines = [
      "Deception World perf report",
      `日時: ${new Date().toISOString()}`,
      `計測開始: ${new Date(sessionStart).toISOString()}  リセット: ${new Date(resetAt).toISOString()}  経過: ${f1((Date.now() - resetAt) / 1000)}s`,
      `URL: ${location.pathname}${location.search}`,
      `端末: ${ua}`,
      `UA: ${navigator.userAgent}`,
      `画面: ${window.innerWidth}x${window.innerHeight} DPR ${window.devicePixelRatio} cores ${navigator.hardwareConcurrency ?? "?"}`,
      `ガラス: ${liquid ? `on (${root.getAttribute("data-glass-variant") ?? "clear"})` : "off"}  低減モーション: ${rm?.matches ? "on" : "off"}  表示: ${document.visibilityState}`,
      "",
      "[全体]",
      `FPS 現在 ${f1(curFps)} / 5秒平均 ${f1(w.fps5)}`,
      `フレーム時間 直近5秒 p50 ${f1(w.p50)} / p95 ${f1(w.p95)} / max ${f1(w.max)} ms`,
      `フレーム数 ${frames}  >33ms ${over33} / >50ms ${over50} / >100ms ${over100}`,
      `最長停止 ${f1(longest)} ms`,
      `long task ${longTaskText()}`,
      "",
      "[ルート別] route  開始  時間  平均fps  p95  >100ms",
      ...all.map((r, i) => routeLine(r, i === all.length - 1)),
    ];
    return lines.join("\n");
  }

  // ---- panel (shadow root) -------------------------------------------------
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-perf-hud", "");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
:host{all:initial}
.w{position:fixed;top:calc(env(safe-area-inset-top,0px) + 4px);left:calc(env(safe-area-inset-left,0px) + 4px);max-width:min(360px,calc(100vw - 16px));pointer-events:none;color:#fff;font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-text-size-adjust:100%}
.p{background:rgba(0,0,0,.74);border-radius:8px;padding:5px 6px;border:1px solid rgba(255,255,255,.18)}
.pill{display:none;background:rgba(0,0,0,.74);border-radius:999px;border:1px solid rgba(255,255,255,.18);padding:0;color:#fff;font:inherit;pointer-events:auto;min-height:28px;min-width:44px}
.c .p{display:none}.c .pill{display:block}
pre{margin:0;white-space:pre-wrap;word-break:break-all;font:inherit;user-select:none;-webkit-user-select:none}
.r{display:flex;gap:4px;margin-top:4px}
button{pointer-events:auto;font:inherit;color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);border-radius:6px;padding:0 8px;min-height:28px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
canvas{display:block;width:120px;height:24px;margin-top:3px}
.ok{color:#8f8}
</style><div class="w" id="w"><div class="p"><pre id="a"></pre><canvas id="s" width="120" height="24"></canvas><pre id="rt"></pre><div class="r"><button id="rs">Reset</button><button id="cp">コピー</button><button id="sh">共有</button><button id="co">折りたたみ</button></div></div><button class="pill" id="ex" type="button"><span id="pl">FPS</span></button></div>`;
  const $ = <T extends HTMLElement>(id: string) => shadow.getElementById(id) as T;
  const wrap = $("w");
  const elA = $("a");
  const elRt = $("rt");
  const elPl = $("pl");
  const cv = $<HTMLCanvasElement>("s");
  const g = cv.getContext("2d");
  const btnCp = $("cp");
  for (const b of shadow.querySelectorAll("button")) b.setAttribute("type", "button");
  if (!navigator.share) $("sh").style.display = "none";

  let collapsed = false;
  try {
    collapsed = sessionStorage.getItem("dw-perf-collapsed") === "1";
  } catch {
    /* ignore */
  }
  const applyCollapsed = () => {
    wrap.classList.toggle("c", collapsed);
    try {
      sessionStorage.setItem("dw-perf-collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  applyCollapsed();

  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    // The textarea lives in the light DOM: the site's copy guard lets editable
    // targets through, and iOS needs a real selection.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  let flashTimer = 0;
  function flash(msg: string) {
    const old = "コピー";
    btnCp.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      btnCp.textContent = old;
    }, 1500);
  }

  const onReset = () => reset();
  const onCopy = async () => flash((await copyText(buildReport())) ? "コピー済" : "失敗");
  const onShare = () => {
    navigator.share?.({ title: "perf report", text: buildReport() }).catch(() => {});
  };
  const onCollapse = () => {
    collapsed = true;
    applyCollapsed();
  };
  const onExpand = () => {
    collapsed = false;
    applyCollapsed();
  };
  $("rs").addEventListener("click", onReset);
  btnCp.addEventListener("click", onCopy);
  $("sh").addEventListener("click", onShare);
  $("co").addEventListener("click", onCollapse);
  $("ex").addEventListener("click", onExpand);

  // ---- 500 ms tick: the only place text is written -------------------------
  function drawSpark() {
    if (!g || collapsed) return;
    g.clearRect(0, 0, 120, 24);
    const scale = 24 / 100; // 0..100ms
    g.fillStyle = "rgba(255,255,255,.25)";
    g.fillRect(0, 24 - 16.7 * scale, 120, 1);
    g.fillRect(0, 24 - 33.3 * scale, 120, 1);
    const off = SPARK_N - spark.length;
    for (let i = 0; i < spark.length; i++) {
      const d = spark[i];
      g.fillStyle = d > 100 ? "#f44" : d > 33 ? "#fa3" : "#6d6";
      const h = Math.max(1, Math.min(24, d * scale));
      g.fillRect(off + i, 24 - h, 1, h);
    }
  }

  function tick() {
    const now = performance.now();
    const el = now - tickAt;
    if (el > 0 && lastT) curFps = (tickFrames * 1000) / el;
    tickFrames = 0;
    tickAt = now;
    const cutoff = now - WINDOW_MS;
    let k = 0;
    while (k < winT.length && winT[k] < cutoff) k++;
    if (k) {
      winT.splice(0, k);
      winDt.splice(0, k);
    }
    const w = windowSnap();
    elPl.textContent = `${Math.round(curFps)}fps`;
    if (collapsed) return;
    const recent = routes.slice(-4);
    elA.textContent =
      `FPS ${Math.round(curFps)} / 5s ${f1(w.fps5)}\n` +
      `ms p50 ${f1(w.p50)} p95 ${f1(w.p95)} max ${f1(w.max)}\n` +
      `>33 ${over33}  >50 ${over50}  >100 ${over100}  最長 ${Math.round(longest)}ms\n` +
      `long task ${longTaskText()}\n` +
      contextText();
    elRt.textContent = recent.length
      ? "ルート\n" + recent.map((r) => routeLine(r, false)).join("\n")
      : "";
    drawSpark();
  }

  document.addEventListener("visibilitychange", onVisibility);
  document.documentElement.appendChild(host);
  raf = requestAnimationFrame(frame);
  const interval = window.setInterval(tick, 500);
  tick();

  // Exposed for the verification run only; harmless when unused.
  (window as unknown as { __dwPerfHud?: () => void }).__dwPerfHud = () => {
    cancelAnimationFrame(raf);
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibility);
    ltObserver?.disconnect();
    host.remove();
    mounted = false;
  };
}
