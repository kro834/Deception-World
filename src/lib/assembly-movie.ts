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
 * it in view), or while it holds focus; it is disabled until the scene is
 * ready, and hidden by its sheet in the still tiers (data-load="static":
 * reduced motion, forced colours, economy, Save-Data), where the runway
 * is one still and there is no sequence to play — stepping through stills
 * would need per-beat pictures the still tiers deliberately never
 * download. Nothing here runs on the startup path: the component imports
 * this chunk once the page is idle.
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
/** The share of the frame in view before the control shows. */
export const MOVIE_SHOW_AT = 0.6;
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
export const MOVIE_PLAY_LABELS = Object.freeze({ play: "再生", pause: "一時停止" });

export type MovieState = "idle" | "playing" | "paused" | "ended";

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
  document: Document;
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
  let remeasure = false;
  let pinTop = 0;
  let travel = 0;
  let top = 0;

  const setState = (next: MovieState) => {
    if (state === next) return;
    state = next;
    control.dataset.state = next;
    const label = next === "playing" ? MOVIE_PLAY_LABELS.pause : MOVIE_PLAY_LABELS.play;
    if (play.textContent !== label) play.textContent = label;
    if (mini && mini.getAttribute("aria-label") !== label) mini.setAttribute("aria-label", label);
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
      // A hitch advances the movie by at most a tenth of a second.
      const dt = Math.min(100, Math.max(0, stamp - lastStamp));
      progress = clamp01(progress + (dt * speed) / MOVIE_DURATION_MS);
    }
    lastStamp = stamp;
    if (remeasure) {
      remeasure = false;
      measure();
    }
    scrollTo(progress);
    syncSeek(progress);
    if (progress >= 1) {
      stop();
      setState("ended");
      return;
    }
    rafId = environment.requestAnimationFrame(tick);
  };
  const ready = () => runway.dataset.rznLoad === "ready";
  const start = (from: number) => {
    if (!ready()) return;
    measure();
    progress = clamp01(from);
    scrollTo(progress);
    syncSeek(progress);
    setState("playing");
    // The page may settle its layout as the movie starts: the runway is
    // measured again on the first frame.
    remeasure = true;
    strays = 0;
    stop();
    rafId = environment.requestAnimationFrame(tick);
  };
  const onPlay = () => {
    // A choice made in the sheet closes it (the pill's own 再生 has none open).
    collapse(true);
    if (state === "playing") {
      pause();
      return;
    }
    measure();
    const at = readProgress();
    // At the end, 再生 plays again from the start.
    start(state === "ended" || at >= 1 ? 0 : at);
  };
  const onRestart = () => {
    collapse(true);
    if (!ready()) return;
    start(0);
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
    seek.setAttribute("aria-valuetext", `${Math.round(q * 100)}%`);
    if (state === "ended" && q < 1) setState("paused");
  };
  const onSeekDown = () => {
    scrubbing = true;
  };
  const onSeekUp = () => {
    scrubbing = false;
  };

  /* ---------------- the reader's own input ---------------- */
  const outside = (event: Event) => !control.contains(event.target as Node | null);
  const onWheel = () => {
    collapse(false);
    pause();
  };
  const onTouch = (event: Event) => {
    if (!outside(event)) return;
    collapse(false);
    pause();
  };
  const onKey = (event: KeyboardEvent) => {
    if (state === "playing" && outside(event) && MOVIE_SCROLL_KEYS.has(event.key)) pause();
  };
  const onScroll = () => {
    const y = environment.scrollY;
    const ours =
      Math.abs(y - expectedY) <= MOVIE_SCROLL_TOLERANCE ||
      Math.abs(y - previousY) <= MOVIE_SCROLL_TOLERANCE;
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
    if (state === "playing") measure();
    else travel = 0;
    if (shown) place();
  };
  const onVisibility = () => {
    if (document.hidden) pause();
  };

  /* ---------------- the runway's state ---------------- */
  const syncLoad = () => {
    const load = runway.dataset.rznLoad || "waiting";
    if (control.dataset.load !== load) control.dataset.load = load;
    const enabled = load === "ready";
    play.disabled = !enabled;
    if (mini) mini.disabled = !enabled;
    // The toggle needs only this controller.
    if (toggle) toggle.disabled = false;
    if (restart) restart.disabled = !enabled;
    if (seek) seek.disabled = !enabled;
    if (!enabled) pause();
  };
  const loadObserver =
    typeof environment.MutationObserver === "function"
      ? new environment.MutationObserver(syncLoad)
      : null;
  loadObserver?.observe(runway, { attributes: true, attributeFilter: ["data-rzn-load"] });
  const setShown = (next: boolean) => {
    shown = next;
    if (next) {
      control.dataset.shown = "true";
      travel = 0;
      place();
      onScroll();
    } else {
      delete control.dataset.shown;
      collapse(false);
      // The frame unpinned: the movie's turn is over (再生 then plays from
      // wherever the page stands).
      if (state === "playing") pause();
      setState("idle");
    }
  };
  const showObserver =
    typeof environment.IntersectionObserver === "function"
      ? new environment.IntersectionObserver(
          (entries) => {
            for (const entry of entries) setShown(entry.isIntersecting);
          },
          { threshold: [MOVIE_SHOW_AT] },
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
  environment.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    disposed = true;
    stop();
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
    environment.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    delete control.dataset.shown;
    delete control.dataset.load;
    delete control.dataset.open;
    toggle?.setAttribute("aria-expanded", "false");
    control.dataset.state = "idle";
  };
}
