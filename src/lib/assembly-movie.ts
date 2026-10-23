/** The auto transformation movie (owner, 2026-10-23: 「自動変身ムービーも速度
 * 調整機能付きでつけて。レクソナンスにもこの機能は実装。」).
 *
 * `mountAssemblyMovie(control, runway)` wires the movie control
 * (rexonance-assembly-movie.tsx, beside the Rexonance and FAR FROM
 * runways) to its scroll suit-up. 再生 plays the suit-up from the runway's
 * start to its end over MOVIE_DURATION_MS at the chosen speed (0.5× … 2×);
 * 一時停止 holds it; 最初から starts it over; the scrubber seeks.
 *
 * The movie drives the page's scroll, never a second playhead: each frame
 * it scrolls the page (instantly, under the sticky frame) to the position
 * the suit-up's progress stands at, and the engine draws that progress as
 * it draws any scroll — the same frames, the same HUD, the same flags, the
 * selector's form, the Guide's status. So the picture and the page never
 * disagree: when the movie ends the reader is at the runway's end, as
 * after a scroll, and taking the wheel mid-movie continues from exactly
 * where the picture is, with nothing to catch up or snap back. (A playhead
 * decoupled from the scroll would leave the page behind the picture; the
 * first scroll after it would run the suit-up back to wherever the page
 * had stayed.)
 *
 * The reader's own input ends the movie's turn at once: a wheel, a touch,
 * a scroll key outside the control, or a scroll that lands anywhere but
 * where the movie put the page (a scrollbar drag). The control pauses and
 * the scroll is the reader's again; nothing fights.
 *
 * The control shows while the runway's frame is pinned (MOVIE_SHOW_AT of
 * what of it fits the window in view), or while it holds focus. It is live
 * as soon as this controller mounts (owner, 2026-10-23: 「自動変身再生が必ず
 * 読み込まれ、正常に動作する様にして。」): a 再生 pressed before the scene's
 * assets are ready is queued — the control reads 読み込み中 (aria-busy), the
 * engine is asked to prepare now (MOVIE_WAKE_EVENT), and the movie starts
 * by itself once the runway reads ready. A failed preparation is retried
 * through the engine's own retry (MOVIE_RETRY_EVENT, the guide's
 * 素材を再読み込み) with a backoff; when the retries run out the control
 * reads 再読み込み, and pressing it reloads the page: a chunk whose fetch
 * failed, or a chunk it imports, stays failed for this document (its
 * module map), and only a fresh one fetches it again; the router's scroll
 * restoration keeps the reading position. A scene that recovers by itself
 * meanwhile (the network back) reads 再生 again. Nothing fails silently.
 *
 * The still tiers (data-tier="still": the runway reads data-rzn-load
 * "static" — reduced motion, forced colours, economy, Save-Data, 2G — or
 * it has no pinned travel) hide the control: the runway is one still and
 * there is no sequence to play (stepping through stills would need
 * per-beat pictures the still tiers deliberately never download). The
 * sheets hide it by the same rules before this controller arrives. Nothing
 * here runs on the startup path: the component imports this chunk once the
 * page is idle, or sooner on the reader's approach.
 */

/** The movie's length at 1× (ms): the suit-up's twelve beats at a pace
 * the eye can follow — the fire about 3 s, each armour group about 3 s,
 * the seal, the ignition and the chosen form's change about 3 s. */
export const MOVIE_DURATION_MS = 24000;
/** The scrubber's resolution (steps over the runway). */
export const MOVIE_SEEK_STEPS = 200;
/** How far (px) the page may stand from where the movie put it before the
 * difference reads as the viewer's own scroll. */
export const MOVIE_SCROLL_TOLERANCE = 2;
/** The share of the frame in view before the control shows (of what of the
 * frame fits the window). */
export const MOVIE_SHOW_AT = 0.6;
/** The observer's thresholds: every twentieth, so the share is read near
 * MOVIE_SHOW_AT whatever the frame's height against the window's. */
export const MOVIE_SHOW_THRESHOLDS: readonly number[] = Object.freeze(
  Array.from({ length: 21 }, (_, k) => k / 20),
);
/** The keys that scroll a page: pressed outside the control, they pause. */
export const MOVIE_SCROLL_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
]);
/** How long (ms) the opened sheet waits, untouched, before it closes. */
export const MOVIE_IDLE_COLLAPSE_MS = 4000;
/** The figure's picture: height over width (the canvas and the stills). */
export const MOVIE_FIGURE_ASPECT = 1040 / 693;
/** The play button's label by state. */
export const MOVIE_PLAY_LABELS = Object.freeze({
  play: "再生",
  pause: "一時停止",
  loading: "読み込み中",
  retry: "再読み込み",
});
/** The longest step (ms) one frame may advance the movie by: a hitch on a
 * slow device is caught up (the movie keeps its length), a long stall (a
 * frozen tab) is not jumped over. */
export const MOVIE_MAX_STEP_MS = 1000;
/** How long (ms) after a resize or a rotation a scroll the movie did not
 * make is still the layout settling, not the reader. */
export const MOVIE_RESIZE_GRACE_MS = 700;
/** How far (px) a touch must move before it reads as the reader's scroll
 * (a tap is not one). */
export const MOVIE_TOUCH_SLOP = 10;
/** A queued 再生's retries of a failed preparation (ms before each): when
 * they run out the control reads 再読み込み. */
export const MOVIE_LOAD_RETRY_DELAYS: readonly number[] = Object.freeze([
  1000, 2500, 5000, 10000, 15000,
]);
/** While a 再生 waits, the engine is reminded this often (ms). */
export const MOVIE_WAKE_INTERVAL_MS = 4000;
/** The events the movie sends the runway's engine: prepare now (the reader
 * asked to play, or is about to), and retry a failed preparation. */
export const MOVIE_WAKE_EVENT = "rexonance:assembly-wake";
export const MOVIE_RETRY_EVENT = "rexonance:assembly-retry";

export type MovieState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

/** One controller per control: a second mount disposes the first. */
const mounted = new WeakMap<HTMLElement, () => void>();

type MovieEnvironment = Pick<
  Window,
  | "requestAnimationFrame"
  | "cancelAnimationFrame"
  | "addEventListener"
  | "removeEventListener"
  | "scrollTo"
  | "scrollY"
  | "innerHeight"
  | "getComputedStyle"
> & {
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (id: never) => void;
  setInterval?: (callback: () => void, ms: number) => unknown;
  clearInterval?: (id: never) => void;
  document: Document;
  location?: Pick<Location, "reload">;
  IntersectionObserver?: typeof IntersectionObserver;
  MutationObserver?: typeof MutationObserver;
};

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function mountAssemblyMovie(
  control: HTMLElement | null,
  runway: HTMLElement | null,
  environment: MovieEnvironment = window,
): () => void {
  if (!control || !runway) return () => {};
  // (function declarations below do not keep the guard's narrowing)
  const host: HTMLElement = control;
  const { document } = environment;
  const frame = runway.querySelector<HTMLElement>(".rzn-frame");
  const play = control.querySelector<HTMLButtonElement>(".rzn-movie-play");
  // The pill (phones, tablets, short windows): 再生／一時停止 with the
  // progress ring, and the speed, whose tap opens the sheet.
  const mini = control.querySelector<HTMLButtonElement>(".rzn-movie-mini");
  const toggle = control.querySelector<HTMLButtonElement>(".rzn-movie-toggle");
  const speedNow = control.querySelector<HTMLElement>(".rzn-movie-speed-now");
  const restart = control.querySelector<HTMLButtonElement>(".rzn-movie-restart");
  const radios = [...control.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const seek = control.querySelector<HTMLInputElement>(".rzn-movie-seek input");
  if (!frame || !play) return () => {};
  // A second mount on the same control (a remount before the first one's
  // cleanup) takes over: never two controllers on one control.
  mounted.get(control)?.();
  const later = (callback: () => void, ms: number): unknown =>
    (environment.setTimeout ?? globalThis.setTimeout)(callback, ms);
  const cancelLater = (id: unknown) => {
    if (id) (environment.clearTimeout ?? globalThis.clearTimeout)(id as never);
  };
  const every = (callback: () => void, ms: number): unknown =>
    (environment.setInterval ?? globalThis.setInterval)(callback, ms);
  const cancelEvery = (id: unknown) => {
    if (id) (environment.clearInterval ?? globalThis.clearInterval)(id as never);
  };
  const now = () => Date.now();

  let disposed = false;
  let state: MovieState = "idle";
  let speed = 1;
  // The movie's clock, in the runway's progress (0–1).
  let progress = 0;
  let lastStamp = 0;
  let rafId = 0;
  // Where the movie last put the page, and the frame before (a scroll event
  // for a frame's scroll arrives with the next frame).
  let expectedY = NaN;
  let previousY = NaN;
  let scrubbing = false;
  let shown = false;
  // Scroll events that landed away from where the movie put the page: two
  // in a row are the reader's (a scrollbar drag); one alone may be a stray
  // (a smooth scroll ending, a layout settling).
  let strays = 0;
  // Scrolls landing before this time are the layout settling (a resize).
  let graceUntil = 0;
  // A 再生 waiting for the scene: where it starts ("here": wherever the page
  // stands when the scene is ready), its retries, its reminder.
  let queued: number | "here" | null = null;
  let retries = 0;
  let retryTimer: unknown = 0;
  let wakeTimer: unknown = 0;
  // Paused by a hidden page (or the page leaving): resumed when it is back.
  let resumeOnShow = false;
  let touchStart: { x: number; y: number } | null = null;
  let pinTop = 0;
  let travel = 0;
  let top = 0;

  const labelOf = (value: MovieState) =>
    value === "playing"
      ? MOVIE_PLAY_LABELS.pause
      : value === "loading"
        ? MOVIE_PLAY_LABELS.loading
        : value === "error"
          ? MOVIE_PLAY_LABELS.retry
          : MOVIE_PLAY_LABELS.play;
  const setState = (next: MovieState) => {
    if (state === next) return;
    state = next;
    control.dataset.state = next;
    const label = labelOf(next);
    if (play.textContent !== label) play.textContent = label;
    if (mini && mini.getAttribute("aria-label") !== label) mini.setAttribute("aria-label", label);
    if (next === "loading") control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
  };
  control.dataset.state = state;

  /* ---------------- the runway's geometry ---------------- */
  const measure = () => {
    pinTop = Number.parseFloat(environment.getComputedStyle(frame).top) || 0;
    travel = runway.offsetHeight - frame.offsetHeight;
    top = runway.getBoundingClientRect().top + environment.scrollY - pinTop;
  };
  /** The room beside the figure, from its box (the frame's --rzn-fig-*: the
   * picture's height is the smaller of fig-h of the frame and fig-w of its
   * width, standing on fig-x with its foot fig-b above the frame's), for the
   * sheet's width and the rail's place: custom properties on the control. */
  const place = () => {
    const style = control.style;
    if (!style) return;
    const styles = environment.getComputedStyle(frame);
    const read = (name: string) => Number.parseFloat(styles.getPropertyValue?.(name) ?? "");
    const h = read("--rzn-fig-h");
    const w = read("--rzn-fig-w");
    const x = read("--rzn-fig-x");
    const b = read("--rzn-fig-b");
    const width = frame.offsetWidth || document.documentElement?.clientWidth || 0;
    const height = frame.offsetHeight;
    if (![h, w, x, b].every(Number.isFinite) || width <= 0 || height <= 0) return;
    const figureHeight = Math.min(height * h, width * w * MOVIE_FIGURE_ASPECT);
    const figureWidth = figureHeight / MOVIE_FIGURE_ASPECT;
    const left = width * x - figureWidth / 2;
    const frameLeft = frame.getBoundingClientRect?.().left ?? 0;
    const viewportWidth = document.documentElement?.clientWidth || width;
    const pin = Number.parseFloat(styles.top) || 0;
    const set = (name: string, value: number) =>
      style.setProperty(name, `${Math.max(0, Math.round(value))}px`);
    set("--mc-left-room", frameLeft + left);
    set("--mc-right-room", viewportWidth - (frameLeft + left + figureWidth));
    set("--mc-fig-top", pin + height * (1 - b) - figureHeight);
    // Where the HUD's call ends (the stacked tiers' rail starts below it).
    const call = runway.querySelector<HTMLElement>(".rzn-call");
    if (call) set("--mc-call-bottom", call.getBoundingClientRect().bottom);
  };
  const readProgress = () => {
    if (travel <= 0) return 1;
    return clamp01((pinTop - runway.getBoundingClientRect().top) / travel);
  };
  const maxScroll = () =>
    Math.max(0, (document.documentElement?.scrollHeight ?? 0) - environment.innerHeight);
  /** Puts the page where progress `q` stands on the runway. */
  const scrollTo = (q: number) => {
    const y = Math.min(top + travel * q, maxScroll());
    previousY = expectedY;
    expectedY = y;
    environment.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  };

  /* ---------------- the scrubber ---------------- */
  const syncSeek = (q: number) => {
    // The pill's progress ring (a share of 100).
    control.style?.setProperty("--rzn-movie-p", String(Math.round(q * 1000) / 10));
    if (!seek || scrubbing) return;
    const value = String(Math.round(q * MOVIE_SEEK_STEPS));
    if (seek.value !== value) seek.value = value;
    const text = `${Math.round(q * 100)}%`;
    if (seek.getAttribute("aria-valuetext") !== text) seek.setAttribute("aria-valuetext", text);
  };

  /* ---------------- the clock ---------------- */
  const stop = () => {
    if (rafId) environment.cancelAnimationFrame(rafId);
    rafId = 0;
    lastStamp = 0;
  };
  const pause = () => {
    if (state !== "playing") return;
    stop();
    setState(progress >= 1 ? "ended" : "paused");
  };
  const tick = (stamp: number) => {
    rafId = 0;
    if (disposed || state !== "playing") return;
    if (lastStamp) {
      // A hitch is caught up (the movie keeps its length on a slow device);
      // a stall is not jumped over.
      const dt = Math.min(MOVIE_MAX_STEP_MS, Math.max(0, stamp - lastStamp));
      progress = clamp01(progress + (dt * speed) / MOVIE_DURATION_MS);
    }
    lastStamp = stamp;
    // The runway is measured each frame: the page above it may settle
    // (images, fonts, content-visibility, scroll anchoring) or the window
    // change, and the movie's scroll follows the runway, never a stale
    // offset.
    measure();
    scrollTo(progress);
    syncSeek(progress);
    if (progress >= 1) {
      stop();
      setState("ended");
      return;
    }
    rafId = environment.requestAnimationFrame(tick);
  };
  const loadOf = () => runway.dataset.rznLoad || "waiting";
  const ready = () => loadOf() === "ready";
  /** No sequence to play: the still tiers, or a runway with no travel. */
  const still = () => loadOf() === "static" || runway.offsetHeight - frame.offsetHeight <= 0;
  const start = (from: number) => {
    if (!ready()) return;
    clearQueue();
    measure();
    progress = clamp01(from);
    scrollTo(progress);
    syncSeek(progress);
    setState("playing");
    strays = 0;
    resumeOnShow = false;
    stop();
    rafId = environment.requestAnimationFrame(tick);
  };
  /** Where 再生 starts from the page as it stands: at the end, the start. */
  const here = () => {
    measure();
    const at = readProgress();
    return at >= 1 ? 0 : at;
  };

  /* ---------------- a 再生 waiting for the scene ---------------- */
  /** An event to the engine; `keep`: the movie's own backoff, which keeps
   * the engine's slow requests going (the reader's press starts them over). */
  const send = (type: string, keep = false) => {
    if (typeof runway.dispatchEvent !== "function") return;
    if (keep && typeof CustomEvent === "function")
      runway.dispatchEvent(new CustomEvent(type, { detail: { keep: true } }));
    else if (typeof Event === "function") runway.dispatchEvent(new Event(type));
  };
  function clearQueue() {
    queued = null;
    cancelLater(retryTimer);
    retryTimer = 0;
    cancelEvery(wakeTimer);
    wakeTimer = 0;
  }
  /** The engine's preparation failed while a 再生 waits: retried after a
   * backoff; when the retries run out the control reads 再読み込み. */
  const retryLater = () => {
    if (retryTimer || queued === null) return;
    if (retries >= MOVIE_LOAD_RETRY_DELAYS.length) {
      clearQueue();
      setState("error");
      return;
    }
    const delay = MOVIE_LOAD_RETRY_DELAYS[retries];
    retries += 1;
    retryTimer = later(() => {
      retryTimer = 0;
      if (disposed || queued === null) return;
      if (loadOf() === "error") send(MOVIE_RETRY_EVENT, true);
      else send(MOVIE_WAKE_EVENT);
    }, delay);
  };
  /** 再生 (or 最初から) asked for: played now if the scene is ready, else
   * queued until it is, the engine asked to prepare now. */
  const request = (from: number | "here") => {
    if (disposed || still()) return;
    if (ready()) {
      start(from === "here" ? here() : from);
      return;
    }
    // A fresh press: the whole backoff again.
    if (state !== "loading") retries = 0;
    queued = from;
    setState("loading");
    send(MOVIE_WAKE_EVENT);
    // A preparation that already failed is retried at once.
    if (loadOf() === "error") send(MOVIE_RETRY_EVENT);
    if (!wakeTimer)
      wakeTimer = every(() => {
        if (disposed || queued === null) return;
        if (loadOf() === "error") retryLater();
        else send(MOVIE_WAKE_EVENT);
      }, MOVIE_WAKE_INTERVAL_MS);
  };
  /** The reader took the scroll, or the frame unpinned: a waiting 再生 is
   * dropped. */
  function cancelQueue() {
    if (queued === null && state !== "loading") return;
    clearQueue();
    if (state === "loading") setState("idle");
  }
  /** 再読み込み (the retries ran out): a fresh document, at the same place. */
  const reloadPage = () => {
    (environment.location ?? globalThis.location)?.reload();
  };
  const onPlay = () => {
    // A choice made in the sheet closes it (the pill's own 再生 has none open).
    collapse(true);
    if (state === "playing") {
      resumeOnShow = false;
      pause();
      return;
    }
    // Already waiting for the scene: it starts by itself.
    if (state === "loading") return;
    if (state === "error") {
      reloadPage();
      return;
    }
    // At the end, 再生 plays again from the start.
    request(state === "ended" ? 0 : "here");
  };
  const onRestart = () => {
    collapse(true);
    if (state === "error") {
      reloadPage();
      return;
    }
    request(0);
  };

  /* ---------------- the sheet's opening (pill layouts) ---------------- */
  // Where the sheet would stand over the figure (phones, tablets, short
  // windows) the control is a pill; its speed button opens the sheet, and the
  // sheet closes after a choice, a few seconds untouched, a scroll or a touch
  // outside, Escape, or focus leaving. Wide screens show the sheet docked
  // beside the figure and never use any of this (the pill is not drawn).
  let open = false;
  let idleTimer: ReturnType<typeof setTimeout> | 0 = 0;
  // A keyboard user's open sheet waits for them (no idle timer takes the
  // focused control away).
  let keyboardDriven = false;
  const clearIdle = () => {
    if (idleTimer) globalThis.clearTimeout(idleTimer);
    idleTimer = 0;
  };
  function setOpen(next: boolean) {
    if (open === next) return;
    open = next;
    toggle?.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      host.dataset.open = "true";
      place();
      bump();
    } else {
      delete host.dataset.open;
      clearIdle();
    }
  }
  function collapse(restoreFocus = false) {
    if (!open) return;
    setOpen(false);
    // The sheet takes its controls with it: focus returns to the toggle.
    if (restoreFocus && toggle && host.contains(document.activeElement ?? null))
      toggle.focus({ preventScroll: true });
  }
  /** Any use of the open sheet restarts its idle wait. */
  function bump() {
    clearIdle();
    if (!open) return;
    idleTimer = globalThis.setTimeout(() => {
      idleTimer = 0;
      if (!open || disposed) return;
      if (scrubbing || (keyboardDriven && host.contains(document.activeElement ?? null))) {
        bump();
        return;
      }
      collapse(true);
    }, MOVIE_IDLE_COLLAPSE_MS);
  }
  const onToggle = () => setOpen(!open);
  const onControlPointer = () => {
    keyboardDriven = false;
    bump();
  };
  const onControlKey = (event: KeyboardEvent) => {
    keyboardDriven = true;
    bump();
    if (event.key === "Escape" && open) {
      event.stopPropagation?.();
      collapse(true);
    }
  };
  const onControlFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (open && !(next && control.contains(next))) collapse(false);
  };
  const onOutsidePointer = (event: Event) => {
    if (open && !control.contains(event.target as Node | null)) collapse(false);
  };

  /* ---------------- the speed ---------------- */
  const speedOf = (radio: HTMLElement) => Number(radio.dataset.speed) || 1;
  const choose = (index: number, focus = false) => {
    const radio = radios[index];
    if (!radio) return;
    speed = speedOf(radio);
    radios.forEach((element, k) => {
      const checked = k === index;
      element.setAttribute("aria-checked", checked ? "true" : "false");
      element.tabIndex = checked ? 0 : -1;
    });
    // The pill shows the speed chosen.
    const shown = `${speed}×`;
    if (speedNow && speedNow.textContent !== shown) speedNow.textContent = shown;
    toggle?.setAttribute("aria-label", `速度 ${shown} と操作`);
    if (focus) radio.focus();
  };
  const onRadioClick = (event: Event) => {
    const index = radios.indexOf(event.currentTarget as HTMLButtonElement);
    if (index < 0) return;
    choose(index);
    collapse(true);
  };
  const onRadioKey = (event: KeyboardEvent) => {
    const index = radios.indexOf(event.currentTarget as HTMLButtonElement);
    if (index < 0) return;
    const last = radios.length - 1;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next < 0) return;
    event.preventDefault();
    choose(next, true);
  };

  /* ---------------- the seek ---------------- */
  const onSeekInput = () => {
    if (!seek) return;
    const q = clamp01(Number(seek.value) / MOVIE_SEEK_STEPS);
    measure();
    progress = q;
    scrollTo(q);
    control.style?.setProperty("--rzn-movie-p", String(Math.round(q * 1000) / 10));
    seek.setAttribute("aria-valuetext", `${Math.round(q * 100)}%`);
    if (state === "ended" && q < 1) setState("paused");
    else if (state === "paused" && q >= 1) setState("ended");
  };
  const onSeekDown = () => {
    scrubbing = true;
  };
  const onSeekUp = () => {
    scrubbing = false;
  };

  /* ---------------- the reader's own input ---------------- */
  const outside = (event: Event) => !control.contains(event.target as Node | null);
  /** The reader's own scroll: the movie's turn is over. */
  const yieldToReader = () => {
    resumeOnShow = false;
    cancelQueue();
    pause();
  };
  const onWheel = () => {
    collapse(false);
    yieldToReader();
  };
  const point = (event: Event) => {
    const touch = (event as TouchEvent).touches?.[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  // A touch outside the control closes the sheet; it pauses the movie once
  // it moves (a drag scrolls the page; a tap does not).
  const onTouch = (event: Event) => {
    if (!outside(event)) {
      touchStart = null;
      return;
    }
    collapse(false);
    touchStart = point(event) ?? { x: Number.NaN, y: Number.NaN };
  };
  const onTouchMove = (event: Event) => {
    if (!touchStart || !outside(event)) return;
    const at = point(event);
    const moved =
      !at ||
      !Number.isFinite(touchStart.x) ||
      Math.hypot(at.x - touchStart.x, at.y - touchStart.y) > MOVIE_TOUCH_SLOP;
    if (!moved) return;
    touchStart = null;
    yieldToReader();
  };
  const onTouchEnd = () => {
    touchStart = null;
  };
  const onKey = (event: KeyboardEvent) => {
    if (
      (state === "playing" || state === "loading") &&
      outside(event) &&
      MOVIE_SCROLL_KEYS.has(event.key)
    )
      yieldToReader();
  };
  const onScroll = () => {
    const y = environment.scrollY;
    const ours =
      Math.abs(y - expectedY) <= MOVIE_SCROLL_TOLERANCE ||
      Math.abs(y - previousY) <= MOVIE_SCROLL_TOLERANCE ||
      now() < graceUntil;
    // A scroll that is the reader's own closes the open sheet (the movie's
    // own scrolling, and the seek's, do not).
    if (!ours && open) collapse(false);
    if (state === "playing") {
      if (ours) strays = 0;
      else if ((strays += 1) >= 2) {
        pause();
        if (shown) syncSeek(readProgress());
      }
      return;
    }
    if (shown) {
      if (travel <= 0) measure();
      syncSeek(readProgress());
    }
  };
  const onResize = () => {
    // The layout settles over the next frames (the runway's height follows
    // the window): its scrolls are not the reader's.
    graceUntil = now() + MOVIE_RESIZE_GRACE_MS;
    strays = 0;
    if (state === "playing") measure();
    else travel = 0;
    syncLoad();
    if (shown) place();
  };
  /** A hidden page (another tab, the page leaving) holds the movie; it
   * resumes where it was when the page is back. */
  const hold = () => {
    if (state !== "playing") return;
    pause();
    // (At the end there is nothing to resume.)
    resumeOnShow = progress < 1;
  };
  const resume = () => {
    if (!resumeOnShow || disposed) return;
    resumeOnShow = false;
    if (state === "paused" && shown) start(progress);
  };
  const onVisibility = () => {
    if (document.hidden) hold();
    else resume();
  };
  const onPageHide = () => {
    hold();
    cancelQueue();
    collapse(false);
  };
  const onPageShow = (event: Event) => {
    // Back from the back/forward cache: the page's state is read again.
    if ((event as PageTransitionEvent).persisted) {
      travel = 0;
      graceUntil = now() + MOVIE_RESIZE_GRACE_MS;
      syncLoad();
      if (shown) onScroll();
    }
    resume();
  };

  /* ---------------- the runway's state ---------------- */
  const syncLoad = () => {
    if (disposed) return;
    const load = loadOf();
    if (control.dataset.load !== load) control.dataset.load = load;
    const tier = still() ? "still" : "motion";
    if (control.dataset.tier !== tier) control.dataset.tier = tier;
    // Live as soon as this controller is here: a 再生 before the scene is
    // ready waits for it (読み込み中), never a dead button.
    const enabled = tier === "motion";
    play.disabled = !enabled;
    if (mini) mini.disabled = !enabled;
    // The toggle needs only this controller.
    if (toggle) toggle.disabled = false;
    if (restart) restart.disabled = !enabled;
    if (seek) seek.disabled = !enabled;
    if (!enabled) {
      // No sequence to play (reduced motion, economy… turned on mid-visit).
      cancelQueue();
      pause();
      if (state === "error") setState("idle");
      return;
    }
    if (load === "ready") {
      retries = 0;
      if (queued !== null) {
        const from = queued;
        start(from === "here" ? here() : from);
      }
      // Recovered by itself (the network back): 再生 again, not 再読み込み.
      else if (state === "error") setState("idle");
      return;
    }
    // The scene went away mid-movie (the engine prepares it again): the
    // movie waits for it and continues from where it was.
    if (state === "playing") {
      stop();
      queued = progress;
      setState("loading");
      send(MOVIE_WAKE_EVENT);
    }
    if (load === "error" && queued !== null) retryLater();
  };
  const loadObserver =
    typeof environment.MutationObserver === "function"
      ? new environment.MutationObserver(syncLoad)
      : null;
  loadObserver?.observe(runway, { attributes: true, attributeFilter: ["data-rzn-load"] });
  const setShown = (next: boolean) => {
    if (disposed) return;
    shown = next;
    if (next) {
      control.dataset.shown = "true";
      travel = 0;
      place();
      onScroll();
      // In view: the scene is asked to prepare now (the engine does once the
      // runway is near; this covers a reader who jumped straight here).
      if (!ready() && !still()) send(MOVIE_WAKE_EVENT);
    } else {
      delete control.dataset.shown;
      collapse(false);
      // The frame unpinned: the movie's turn is over (再生 then plays from
      // wherever the page stands).
      resumeOnShow = false;
      cancelQueue();
      if (state === "playing") pause();
      setState("idle");
    }
  };
  /** Whether the frame is in view: MOVIE_SHOW_AT of what of it fits the
   * window (a frame taller than a short landscape window is pinned while
   * only part of it can show). An entry crossing a threshold on its way out
   * still intersects: the share decides, never isIntersecting alone. */
  const inView = (entry: IntersectionObserverEntry) => {
    if (!entry.isIntersecting) return false;
    const box = entry.boundingClientRect;
    const seen = entry.intersectionRect?.height;
    if (!box || typeof seen !== "number") return true;
    const room = Math.min(box.height, entry.rootBounds?.height ?? box.height);
    return room <= 0 || seen / room >= MOVIE_SHOW_AT - 0.001;
  };
  const showObserver =
    typeof environment.IntersectionObserver === "function"
      ? new environment.IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const next = inView(entry);
              if (next !== shown) setShown(next);
            }
          },
          { threshold: [...MOVIE_SHOW_THRESHOLDS] },
        )
      : null;
  showObserver?.observe(frame);
  if (!showObserver) setShown(true);

  /* ---------------- listeners ---------------- */
  const initial = radios.findIndex((radio) => radio.getAttribute("aria-checked") === "true");
  choose(initial < 0 ? radios.findIndex((radio) => speedOf(radio) === 1) : initial);
  syncLoad();
  play.addEventListener("click", onPlay);
  mini?.addEventListener("click", onPlay);
  toggle?.addEventListener("click", onToggle);
  control.addEventListener("pointerdown", onControlPointer);
  control.addEventListener("keydown", onControlKey);
  control.addEventListener("input", bump);
  control.addEventListener("focusout", onControlFocusOut);
  environment.addEventListener("pointerdown", onOutsidePointer, { passive: true });
  restart?.addEventListener("click", onRestart);
  for (const radio of radios) {
    radio.addEventListener("click", onRadioClick);
    radio.addEventListener("keydown", onRadioKey);
  }
  seek?.addEventListener("input", onSeekInput);
  seek?.addEventListener("pointerdown", onSeekDown);
  seek?.addEventListener("pointerup", onSeekUp);
  seek?.addEventListener("pointercancel", onSeekUp);
  environment.addEventListener("scroll", onScroll, { passive: true });
  environment.addEventListener("resize", onResize, { passive: true });
  environment.addEventListener("wheel", onWheel, { passive: true });
  environment.addEventListener("touchstart", onTouch, { passive: true });
  environment.addEventListener("touchmove", onTouchMove, { passive: true });
  environment.addEventListener("touchend", onTouchEnd, { passive: true });
  environment.addEventListener("touchcancel", onTouchEnd, { passive: true });
  environment.addEventListener("orientationchange", onResize, { passive: true });
  environment.addEventListener("keydown", onKey);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibility);
  // The reader's intent (a pointer or focus on the control): the scene is
  // asked to prepare before 再生 is pressed.
  const onIntent = () => {
    if (!ready() && !still()) send(MOVIE_WAKE_EVENT);
  };
  control.addEventListener("pointerenter", onIntent);
  control.addEventListener("focusin", onIntent);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (mounted.get(control) === dispose) mounted.delete(control);
    stop();
    clearQueue();
    loadObserver?.disconnect();
    showObserver?.disconnect();
    clearIdle();
    play.removeEventListener("click", onPlay);
    mini?.removeEventListener("click", onPlay);
    toggle?.removeEventListener("click", onToggle);
    control.removeEventListener("pointerdown", onControlPointer);
    control.removeEventListener("keydown", onControlKey);
    control.removeEventListener("input", bump);
    control.removeEventListener("focusout", onControlFocusOut);
    environment.removeEventListener("pointerdown", onOutsidePointer);
    restart?.removeEventListener("click", onRestart);
    for (const radio of radios) {
      radio.removeEventListener("click", onRadioClick);
      radio.removeEventListener("keydown", onRadioKey);
    }
    seek?.removeEventListener("input", onSeekInput);
    seek?.removeEventListener("pointerdown", onSeekDown);
    seek?.removeEventListener("pointerup", onSeekUp);
    seek?.removeEventListener("pointercancel", onSeekUp);
    environment.removeEventListener("scroll", onScroll);
    environment.removeEventListener("resize", onResize);
    environment.removeEventListener("wheel", onWheel);
    environment.removeEventListener("touchstart", onTouch);
    environment.removeEventListener("touchmove", onTouchMove);
    environment.removeEventListener("touchend", onTouchEnd);
    environment.removeEventListener("touchcancel", onTouchEnd);
    environment.removeEventListener("orientationchange", onResize);
    environment.removeEventListener("keydown", onKey);
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibility);
    control.removeEventListener("pointerenter", onIntent);
    control.removeEventListener("focusin", onIntent);
    delete control.dataset.shown;
    delete control.dataset.load;
    delete control.dataset.tier;
    delete control.dataset.open;
    control.removeAttribute("aria-busy");
    toggle?.setAttribute("aria-expanded", "false");
    // Back to the markup as rendered: nothing is left live without its
    // controller (a disposed controller's buttons would do nothing).
    state = "idle";
    control.dataset.state = "idle";
    play.textContent = MOVIE_PLAY_LABELS.play;
    mini?.setAttribute("aria-label", MOVIE_PLAY_LABELS.play);
    for (const button of [play, mini, toggle, restart]) if (button) button.disabled = true;
    if (seek) seek.disabled = true;
  };
  mounted.set(control, dispose);
  return dispose;
}
