import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  useElementScrollRestoration,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  OpeningHandoffLayer,
  type OpeningHandoffDestination,
  type OpeningHandoffSnapshot,
  type OpeningHandoffSource,
} from "@/components/cinematic/opening-handoff";
import { preloadAssets, warmedSource } from "@/lib/asset-loader";
import { preloadRouteWithDeadline } from "@/lib/route-warmup-deadline";
import {
  prepareRexonanceTransition,
  type RexonanceTransitionRenderer,
} from "@/lib/rexonance-transition-loader";
import { REXONANCE_ENTRY_TIMINGS, REXONANCE_SUIT_LATE_MS } from "@/lib/rexonance-calls";
import { syncRexonanceRouteCover } from "@/lib/rexonance-route-cover";
import { prepareRexonanceEntry } from "@/lib/rexonance-entry-preparation";
import {
  isRexonanceSuitReady,
  pauseRexonanceSuitWarmup,
  scheduleRexonancePagePreload,
  scheduleRexonanceSuitWarm,
  warmRexonanceSuit,
} from "@/lib/rexonance-suit-warmup";
import { GalleryCurtain } from "@/components/gallery/gallery-curtain";
// FAR FROM SAGA's entry (owner, 2026-10-22): the gate plays its call the
// way it plays Rexonance's, through one light module (the sequence's chunk
// and the warm-up are its dynamic imports).
import { FAR_FROM_ENTRY_LATE_MS, FAR_FROM_ENTRY_TIMINGS } from "@/lib/far-from-entry-timings";
import { ILLUSIONCULUM_ENTRY_TIMINGS } from "@/lib/illusionculum-entry";
import { IllusionculumEntrySequence } from "@/components/illusionculum-saga/illusionculum-entry-sequence";
import {
  prefetchFarFromEntry,
  prepareFarFromTransition,
  releaseFarFromEntry,
  warmFarFromEntry,
  type FarFromTransitionRenderer,
} from "@/lib/far-from-entry-gate";

type RiderDiveVariant =
  | "saga"
  | "realm"
  | "lore"
  | "vandal"
  | "dream"
  | "rexonance"
  | "extreme"
  | "far-from"
  | "illusionculum"
  | "final-stage";
type RiderCutInVariant = "leddic" | "argenome" | "over-zeztz" | "cipher" | "ciel";
type RiderTransitionVariant = RiderDiveVariant | RiderCutInVariant;

type GateState = {
  active: boolean;
  percent: number;
  variant: "archive" | "zeus" | "gallery" | "cinema" | RiderTransitionVariant;
  phase: "covering" | "revealing";
  scene?: CineScene | null;
  rexonanceCall?: RexonanceTransitionRenderer | null;
  // rx12: the suit-up builds from its decoded pieces, or stands whole.
  rexonanceSuit?: "build" | "whole";
  // FAR FROM's call (far-from-entry-sequence) and its suit, the same way.
  farFromCall?: FarFromTransitionRenderer | null;
  farFromSuit?: "build" | "whole";
};

type CineRect = { x: number; y: number; w: number; h: number };

// The file shutter (styles-transition-cinema.css). Every covered route
// closes onto what was pressed and opens again from the destination's
// portrait frame, so the cover and the page read as one move.
type CineScene = {
  // iris: the ink closes onto the pressed card; flip: a dossier's prev/next
  // slides the next file in from the side it was pressed on.
  kind: "iris" | "flip";
  dir: 1 | -1;
  tier: "full" | "calm" | "reduced";
  origin: CineRect;
  frame: CineRect;
  landing: CineRect | null;
  // The destination's portrait image, where the carried file docks and is
  // handed over to the page's own plate; its crop is copied so the seam
  // between the two never shows a jump.
  plate: CineRect | null;
  platePosition: string | null;
  // A cut-in holds the destination's portrait under its stage, laid out on
  // the portrait image itself (its stage is the identity, so the file only
  // appears as the stage opens onto the page).
  hold: CineRect | null;
  // The pressed card's own image, lifted off the page; without one, the
  // destination's portrait (its first asset) is the held file.
  art: string | null;
  artRect: CineRect | null;
  artPosition: string;
  file: string | null;
  cover: number;
  reveal: number;
};

type GoOptions = {
  to: string;
  hash?: string;
  search?: Record<string, string>;
  assets?: readonly string[];
  transition?: "dream";
  transitionCovered?: boolean;
  focusDestination?: boolean;
};

type LoadGateApi = {
  go: (opts: GoOptions) => Promise<void>;
  beginOpeningHandoff: (source: OpeningHandoffSource) => boolean;
  notifyOpeningDestination: (destination: OpeningHandoffDestination) => void;
};

const LoadGateContext = createContext<LoadGateApi | null>(null);

const RIDER_DIVE_ROUTES = {
  "/riders/saga": "saga",
  "/riders/realm": "realm",
  "/riders/lore": "lore",
  "/riders/vandal": "vandal",
  "/rexonance-saga": "rexonance",
  "/extreme-saga": "extreme",
  "/far-from-saga": "far-from",
  "/illusionculum-saga": "illusionculum",
  "/final-stage": "final-stage",
} as const satisfies Record<string, RiderDiveVariant>;

const RIDER_CUT_IN_ROUTES = {
  "/riders/leddic": "leddic",
  "/riders/argenome": "argenome",
  "/riders/over-zeztz": "over-zeztz",
  "/riders/cipher": "cipher",
  "/characters/ciel": "ciel",
} as const satisfies Record<string, RiderCutInVariant>;

// cover: the least time from the press to the route change (a dive's shutter
// closes in 320 ms, a cut-in's in 260 ms, and then holds still, so the commit
// lands in a held frame); reveal: the shutter opening from the portrait.
// シエル's ribbons are the reference cut-in and keep their own clock.
const RIDER_CUT_IN_TIMINGS: Record<RiderCutInVariant, { cover: number; reveal: number }> = {
  leddic: { cover: 300, reveal: 520 },
  argenome: { cover: 320, reveal: 540 },
  "over-zeztz": { cover: 340, reveal: 560 },
  cipher: { cover: 340, reveal: 560 },
  ciel: { cover: 560, reveal: 760 },
};

const RIDER_DIVE_TIMINGS: Record<RiderDiveVariant, { cover: number; reveal: number }> = {
  saga: { cover: 360, reveal: 460 },
  realm: { cover: 360, reveal: 460 },
  lore: { cover: 360, reveal: 460 },
  vandal: { cover: 360, reveal: 460 },
  dream: { cover: 450, reveal: 540 },
  rexonance: REXONANCE_ENTRY_TIMINGS,
  extreme: { cover: 380, reveal: 480 },
  "far-from": FAR_FROM_ENTRY_TIMINGS,
  illusionculum: ILLUSIONCULUM_ENTRY_TIMINGS,
  "final-stage": { cover: 380, reveal: 480 },
};

// Dossier to dossier (PREV / NEXT): a lateral file flip, shorter than a dive.
const FILE_FLIP_TIMINGS = { cover: 300, reveal: 440 };
const SOVEREIGN_TIMINGS = { cover: 440, reveal: 400 };
// Economy rendering: one opacity shutter, no travel.
const CALM_TIMINGS = { cover: 180, reveal: 240 };

const RIDER_DIVE_META: Record<RiderDiveVariant, { no: string; name: string; label: string }> = {
  saga: { no: "01", name: "SAGA", label: "サーガ" },
  realm: { no: "02", name: "REALM", label: "レルム" },
  lore: { no: "03", name: "LORE", label: "ローア" },
  vandal: { no: "04", name: "VANDAL", label: "ヴァンダール" },
  dream: { no: "I", name: "DREAM CHAPTER", label: "ドリームチャプター" },
  rexonance: { no: "P14", name: "REXONANCE", label: "レクソナンスサーガ" },
  extreme: { no: "EX", name: "EXTREME", label: "エクスプリームサーガ" },
  "far-from": { no: "FF", name: "FAR FROM", label: "ファーフロムサーガ" },
  illusionculum: { no: "IC", name: "ILLUSIONCULUM", label: "イリュージョンクルムサーガ" },
  "final-stage": { no: "FS", name: "FINAL STAGE", label: "ファイナルステージ" },
};

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));
const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

function guardedHref(to: string, hash?: string, search?: Record<string, string>) {
  const query = search ? new URLSearchParams(search).toString() : "";
  return `${to}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

// The call hold can be shortened while it is playing. A live reduced
// motion/economy preference must not leave the static final word waiting for
// the old cinematic clock. Cancellation also releases this timer immediately.
function waitForRexonanceCover(duration: number) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const simplified = () =>
    media.matches || document.documentElement.dataset.worldEffects === "economy";
  let cancel: () => void = () => undefined;
  if (simplified()) return { promise: Promise.resolve(), cancel };
  const promise = new Promise<void>((resolve) => {
    let observer: MutationObserver | null = null;
    const finish = () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      media.removeEventListener("change", onPreference);
      document.removeEventListener("deception-world:cancel-route-transition", finish);
      window.removeEventListener("pagehide", finish);
      resolve();
    };
    const onPreference = () => {
      if (simplified()) finish();
    };
    const timer = window.setTimeout(finish, duration);
    cancel = finish;
    observer = new MutationObserver(onPreference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world-effects"],
    });
    media.addEventListener("change", onPreference);
    document.addEventListener("deception-world:cancel-route-transition", finish);
    window.addEventListener("pagehide", finish);
  });
  return { promise, cancel };
}

// Two painted frames under the still shutter after the route commits: the
// commit's long task lands in a held frame, and the portrait is measured on
// laid-out geometry. Capped, so a slow phone never looks stuck.
const settleUnderCover = () => Promise.race([nextFrame().then(nextFrame), wait(120)]);

type AppRouter = ReturnType<typeof useRouter>;

// The route change under a still cover is done when the destination has
// rendered: the router emits onRendered once React has committed the new
// matches. Its location store changes when the load starts, one render too
// early (the old page is still in the document then, and a keyboard arrival
// would focus its heading); navigate() settles later still, so it is only
// the fallback.
function navigateUnderCover(router: AppRouter, start: () => Promise<void>, to: string) {
  let stop: () => void = () => undefined;
  const rendered = new Promise<void>((resolve) => {
    stop = router.subscribe("onRendered", (event) => {
      if (event.toLocation.pathname === to) resolve();
    });
  });
  const settled = start().catch(() => undefined);
  return Promise.race([rendered, settled]).finally(() => stop());
}

// The page's own entrance starts on the hand-over (data-loading goes) and
// may hold its first beat (the dossier's --dm-arrive-delay). A cover with no
// file to dock stays still until that beat, so it opens onto a page that is
// already arriving rather than onto an empty ground. Capped.
async function entranceLead(cap = 160) {
  const from = performance.now();
  await nextFrame();
  const delays = (document.querySelector("main")?.getAnimations({ subtree: true }) ?? [])
    .filter((animation) => {
      const end = animation.effect?.getComputedTiming().endTime;
      return (
        typeof end === "number" && Number.isFinite(end) && Number(animation.currentTime ?? 0) <= 60
      );
    })
    .map((animation) => Number(animation.effect?.getTiming().delay ?? 0));
  if (!delays.length) return;
  const left = Math.min(cap, Math.max(0, Math.min(...delays))) - (performance.now() - from);
  if (left > 0) await wait(left);
}

function finiteRunning(animation: Animation) {
  if (animation.playState === "idle") return false;
  const end = animation.effect?.getComputedTiming().endTime;
  if (typeof end !== "number" || !Number.isFinite(end)) return false;
  return Number(animation.currentTime ?? 0) < end - 1;
}

// The reveal's clock starts on its first painted frame, so a long task
// between the state change and that frame never cuts it short; a docked
// file then stays until its hand-over to the page's plate has run out (the
// gate lets pointer events through by then). Capped, so a stalled page
// never keeps the cover.
async function revealRan(duration: number, onStart?: () => void, cap = 1400) {
  let started = 0;
  for (let frame = 0; frame < 8 && !started; frame += 1) {
    await nextFrame();
    if (document.querySelector(".load-gate.is-revealing")) started = performance.now();
  }
  started ||= performance.now();
  onStart?.();
  await wait(duration);
  while (performance.now() - started < cap) {
    // Only the docked file's own hand-over (script animations): the CSS
    // layers are timed to the reveal, and a stage's leftovers (Leddic's
    // motes) are already faded out with it.
    const gate = document.querySelector(".load-gate.has-cine.is-revealing");
    const handing = gate
      ?.getAnimations({ subtree: true })
      .some(
        (animation) =>
          !(animation instanceof CSSAnimation) &&
          !(animation instanceof CSSTransition) &&
          finiteRunning(animation),
      );
    if (!handing) return;
    await nextFrame();
  }
}

// The press that started a route change: the card it lands on is where the
// shutter closes. Read once, within the slide control's completion delay.
// Held weakly (audit #31): a page left without a guarded transition (Back, a
// plain link, router navigation) never takes its press, and a strong hold
// kept that whole removed page — /rexonance-saga's canvases and all — alive.
let lastPress: { target: WeakRef<Element>; at: number } | null = null;
const PRESS_WINDOW_MS = 1400;

function notePress(event: Event) {
  if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
  const target =
    event instanceof KeyboardEvent
      ? document.activeElement
      : event.target instanceof Element
        ? event.target
        : null;
  if (target) lastPress = { target: new WeakRef(target), at: performance.now() };
}

function takePress() {
  const press = lastPress;
  lastPress = null;
  const target = press?.target.deref();
  if (!press || !target || performance.now() - press.at > PRESS_WINDOW_MS || !target.isConnected) {
    return null;
  }
  return target;
}

function cineTier(reduceMotion: boolean): CineScene["tier"] {
  if (reduceMotion) return "reduced";
  return document.documentElement.dataset.worldEffects === "economy" ? "calm" : "full";
}

function visibleRect(element: Element | null | undefined): CineRect | null {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (box.width < 24 || box.height < 24) return null;
  if (box.right <= 0 || box.bottom <= 0 || box.left >= width || box.top >= height) return null;
  return { x: box.left, y: box.top, w: box.width, h: box.height };
}

// The rider panel's open control lifts the rider's art; a card lifts its own
// picture; anything else closes onto the control itself.
function pressedArt(target: Element) {
  const rider = target
    .closest(".rider-detail")
    ?.querySelector<HTMLImageElement>(".rider-visual img.is-on");
  const own = target.closest("a[href], button")?.querySelector<HTMLImageElement>("img");
  const image = rider ?? own ?? null;
  if (!image || !image.complete || image.naturalWidth === 0) return null;
  const rect = visibleRect(image);
  if (!rect || rect.w < 64 || rect.h < 64) return null;
  // Mostly scrolled away (a phone's rider art above the open control): the
  // picture still lifts in from there, but the ink closes onto the control.
  const shown =
    (Math.min(rect.x + rect.w, window.innerWidth) - Math.max(rect.x, 0)) *
    (Math.min(rect.y + rect.h, window.innerHeight) - Math.max(rect.y, 0));
  return {
    rect,
    inView: shown >= rect.w * rect.h * 0.5,
    src: image.currentSrc || image.src,
    position: getComputedStyle(image).objectPosition || "center",
  };
}

function isImageAsset(src: string | undefined) {
  return Boolean(src && /\.(?:jpe?g|webp|png|avif)(?:\?|$)/i.test(src));
}

// Where the file holds while the route changes: the lifted art keeps its
// own aspect (so the lift is one uniform scale), set a little above the
// middle; phones hold it higher, with the numeral and the status under it.
function identityFrame(origin: CineRect | null, hasArt: boolean): CineRect {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const phone = width < 700;
  const landscape = height < 500;
  const maxW = phone ? width * 0.62 : Math.min(width * 0.34, 520);
  const maxH = landscape ? height * 0.46 : phone ? height * 0.38 : height * 0.5;
  let w: number;
  let h: number;
  if (hasArt && origin) {
    const aspect = origin.w / origin.h;
    w = Math.min(maxW, maxH * aspect);
    h = w / aspect;
  } else {
    w = Math.min(maxW, maxH, phone ? 188 : 232);
    h = w * 1.25;
    if (h > maxH) {
      h = maxH;
      w = h / 1.25;
    }
  }
  const centreY = landscape ? height * 0.38 : phone ? height * 0.36 : height * 0.42;
  return { x: (width - w) / 2, y: centreY - h / 2, w, h };
}

function screenFrame(): CineRect {
  const inset = window.innerWidth < 700 ? 16 : 24;
  return {
    x: inset,
    y: inset,
    w: window.innerWidth - inset * 2,
    h: window.innerHeight - inset * 2,
  };
}

function centredRect(w: number, h: number): CineRect {
  return { x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2, w, h };
}

function composeScene({
  tier,
  kind,
  frameKind,
  timings,
  assets,
  to,
  callOnly = false,
}: {
  tier: CineScene["tier"];
  kind: CineScene["kind"];
  frameKind: "file" | "screen" | "seal";
  timings: { cover: number; reveal: number };
  assets: readonly string[];
  to: string;
  callOnly?: boolean;
}): CineScene {
  // The Rexonance call carries no pressed portrait. Keep only its timing
  // and tier metadata; measuring the closing menu would force a document
  // layout that the call never uses.
  if (callOnly) {
    lastPress = null;
    const frame = centredRect(0, 0);
    return {
      kind,
      dir: 1,
      tier,
      origin: frame,
      frame,
      landing: null,
      plate: null,
      platePosition: null,
      hold: null,
      art: null,
      artRect: null,
      artPosition: "center",
      file: null,
      cover: timings.cover,
      reveal: timings.reveal,
    };
  }
  const target = takePress();
  // The ink closes onto the pressed card's picture; only a file frame
  // carries it.
  const pressed = target && kind === "iris" ? pressedArt(target) : null;
  const art = frameKind === "file" ? pressed : null;
  const control = target?.closest("a[href], button, [role='button']") ?? target;
  const controlRect = visibleRect(control);
  const origin =
    (pressed?.inView ? pressed.rect : null) ??
    controlRect ??
    pressed?.rect ??
    centredRect(160, 120);
  // The destination's picture as the warm-up fetched it (a rider's delivery
  // WebP): a CSS background cannot follow the srcset, and naming the JPEG
  // fetched the same picture a second time.
  const file = DETAIL_ROUTE.test(to) && isImageAsset(assets[0]) ? warmedSource(assets[0]) : null;
  const frame =
    frameKind === "screen"
      ? screenFrame()
      : frameKind === "seal"
        ? centredRect(...sealSize())
        : ((kind === "flip" ? restingPortrait() : null) ??
          identityFrame(art?.rect ?? origin, Boolean(art)));
  const dir = origin.x + origin.w / 2 < window.innerWidth / 2 ? -1 : 1;
  return {
    kind,
    dir,
    tier,
    origin,
    frame,
    landing: null,
    plate: null,
    platePosition: null,
    hold: null,
    art: art?.src ?? null,
    artRect: art?.rect ?? null,
    artPosition: art?.position ?? "center",
    // Without a picture to lift, the held frame shows the destination's
    // file; a cut-in keeps it under its stage for the reveal.
    file: frameKind !== "seal" && !art ? file : null,
    cover: timings.cover,
    reveal: timings.reveal,
  };
}

// Zeus's seal: the rank-I mark with its crown frame, above the middle.
function sealSize(): [number, number] {
  const size = window.innerWidth < 700 ? 168 : 208;
  return [size, size];
}

// PREV / NEXT: the next file opens at the top of a page laid out like this
// one, so its portrait will rest where this page's does at scroll 0. The
// next file is held there, and the page arrives around it.
function restingPortrait(): CineRect | null {
  const plate =
    document.querySelector<HTMLElement>("main .manager-portrait-frame > img") ??
    document.querySelector<HTMLElement>("main .manager-portrait-frame");
  if (!plate) return null;
  const box = plate.getBoundingClientRect();
  // Layout size: a scroll-linked push may be scaling the image.
  const w = plate.offsetWidth || box.width;
  const h = plate.offsetHeight || box.height;
  const x = box.left + box.width / 2 - w / 2;
  const y = box.top + box.height / 2 - h / 2 + window.scrollY;
  if (w < 64 || h < 64 || y + h / 2 >= window.innerHeight) return null;
  return { x, y, w, h };
}

// The destination's portrait frame and image, measured under the still
// shutter (the page rests fully drawn while data-loading is set); a page
// without one opens from the held frame.
function landingRects() {
  const frame =
    document.querySelector("main .manager-portrait-frame") ??
    document.querySelector(".manager-portrait-frame");
  const image = frame?.querySelector<HTMLImageElement>(":scope > img") ?? null;
  const plate = visibleRect(image);
  return {
    landing: visibleRect(frame),
    plate,
    platePosition: plate && image ? getComputedStyle(image).objectPosition || null : null,
  };
}

function px(value: number) {
  return String(Math.round(value * 10) / 10);
}

function sceneStyle(scene: CineScene | null | undefined): CSSProperties | undefined {
  if (!scene) return undefined;
  const { origin: o, frame: f } = scene;
  const l = scene.landing ?? f;
  // The carried file is laid out at the held frame and FLIPped from the
  // pressed card (transform-origin at its top left).
  const a = scene.artRect;
  const lift = a ? a.w / f.w : 0.2;
  const liftX = a ? a.x - f.x : o.x + o.w / 2 - f.x - (f.w * lift) / 2;
  const liftY = a ? a.y - f.y : o.y + o.h / 2 - f.y - (f.h * lift) / 2;
  const vars: Record<string, string> = {
    "--ox": px(o.x),
    "--oy": px(o.y),
    "--ow": px(o.w),
    "--oh": px(o.h),
    "--fx": px(f.x),
    "--fy": px(f.y),
    "--fw": px(f.w),
    "--fh": px(f.h),
    "--lx": px(l.x),
    "--ly": px(l.y),
    "--lw": px(l.w),
    "--lh": px(l.h),
    "--dir": String(scene.dir),
    "--dwc-cover": `${scene.cover}ms`,
    "--dwc-reveal": `${scene.reveal}ms`,
    "--carry-from": `translate(${px(liftX)}px, ${px(liftY)}px) scale(${lift.toFixed(4)})`,
    "--art-position": scene.artPosition,
  };
  if (scene.hold) {
    vars["--cx"] = px(scene.hold.x);
    vars["--cy"] = px(scene.hold.y);
    vars["--cw"] = px(scene.hold.w);
    vars["--ch"] = px(scene.hold.h);
  }
  const dock = dockGeometry(scene);
  if (dock) {
    vars["--dock"] = dock.transform;
    vars["--dock-clip"] = dock.clip;
    if (scene.platePosition) vars["--plate-position"] = scene.platePosition;
  }
  if (scene.art) vars["--art"] = `url(${JSON.stringify(scene.art)})`;
  if (scene.file) vars["--file"] = `url(${JSON.stringify(scene.file)})`;
  return vars as CSSProperties;
}

// The carried file docks on the portrait image with one uniform scale (it
// keeps its own aspect) and a clip to the image's box, so it lands as the
// image's own crop and never stretches.
function dockGeometry(scene: CineScene) {
  const p = scene.plate;
  const f = scene.hold ?? scene.frame;
  if (!p || !(scene.art || scene.file) || scene.tier !== "full") return null;
  const scale = Math.max(p.w / f.w, p.h / f.h);
  const tx = p.x + p.w / 2 - f.x - (f.w * scale) / 2;
  const ty = p.y + p.h / 2 - f.y - (f.h * scale) / 2;
  const insetX = Math.max(0, (f.w - p.w / scale) / 2);
  const insetY = Math.max(0, (f.h - p.h / scale) / 2);
  return {
    transform: `translate(${px(tx)}px, ${px(ty)}px) scale(${scale.toFixed(4)})`,
    clip: `inset(${px(insetY)}px ${px(insetX)}px)`,
    insetY,
  };
}

// The hand-over of the docked file to the page's plate: the plate is
// projected in from the top (styles-dossier-cinema.css), so the file is
// cleared from the top on the same clock, and the seam between the two is
// the plate's own prism edge. Timing is read from the plate's animation;
// without one, the file dissolves over the page.
function handOverDockedFile(scene: CineScene) {
  const dock = dockGeometry(scene);
  const file = document.querySelector<HTMLElement>(".load-gate.has-cine > .dwc-carry > i");
  if (!dock || !file) return;
  // Docked on a page the reader may already scroll: the file lets go at once.
  window.addEventListener(
    "scroll",
    () => file.animate([{ opacity: 0 }], { duration: 140, easing: "ease-out", fill: "forwards" }),
    { once: true, passive: true },
  );
  const image = document.querySelector("main .manager-portrait-frame > img");
  const plate = image?.getAnimations().find((animation) => {
    const effect = animation.effect;
    return (
      effect instanceof KeyframeEffect &&
      effect.getKeyframes().some((frame) => "clipPath" in frame) &&
      finiteRunning(animation)
    );
  });
  if (!plate?.effect) {
    file.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      delay: scene.reveal * 0.4,
      easing: "ease-out",
      fill: "both",
    });
    return;
  }
  const effect = plate.effect as KeyframeEffect;
  const timing = effect.getTiming();
  const frames = effect.getKeyframes();
  // A CSS animation keeps its timing function on the keyframes, not the effect.
  const keyed = frames[0]?.easing;
  const easing = keyed && keyed !== "linear" ? keyed : (timing.easing ?? "linear");
  // The plate also settles from a slight push (scale about its centre), which
  // moves its seam; the file's seam follows it, sampled along the progress.
  const scaleOf = (frame: ComputedKeyframe | undefined) =>
    Number(/scale\(([\d.]+)/.exec(String(frame?.transform ?? ""))?.[1] ?? 1);
  const from = scaleOf(frames[0]);
  const to = scaleOf(frames[frames.length - 1]);
  const top = dock.insetY;
  const height = (scene.hold ?? scene.frame).h - dock.insetY * 2;
  const seams = Array.from({ length: 9 }, (_, index) => {
    const progress = index / 8;
    const push = from + (to - from) * progress;
    const seam = Math.min(1, Math.max(0, 0.5 + (progress - 0.5) * push));
    return { offset: progress, clipPath: `inset(${px(top + seam * height)}px 0 0 0)` };
  });
  file.animate(seams, {
    duration: Number(timing.duration) || 640,
    delay: Number(timing.delay ?? 0) - Number(plate.currentTime ?? 0),
    easing,
    fill: "both",
  });
}

function cineClass(scene: CineScene | null | undefined) {
  if (!scene) return "";
  return ` has-cine is-cine-${scene.kind} is-cine-${scene.tier}${scene.art ? " has-carry-art" : ""}${
    scene.file ? " has-carry-file" : ""
  }${scene.landing ? " has-landing" : ""}${dockGeometry(scene) ? " has-dock" : ""}`;
}

function CineLayers({ scene }: { scene: CineScene | null | undefined }) {
  if (!scene) return null;
  return (
    <>
      <span className="dwc-shutter" aria-hidden="true">
        <i className="is-left" />
        <i className="is-right" />
        <i className="is-top" />
        <i className="is-bottom" />
      </span>
      {scene.art || scene.file ? (
        <span className="dwc-carry" aria-hidden="true">
          {scene.art ? <i className="is-art" /> : null}
          {scene.file ? <i className="is-file" /> : null}
        </span>
      ) : null}
      <span className="dwc-lock" aria-hidden="true">
        <i className="is-tl" />
        <i className="is-tr" />
        <i className="is-bl" />
        <i className="is-br" />
      </span>
    </>
  );
}

// Routes without a cover (the other dossiers, returns to the World) change
// at once. This prism signal paints before the route's work and runs on the
// compositor while the old page is busy, so the press is answered in a frame.
function RouteSignal({ state }: { state: "idle" | "running" | "done" }) {
  if (state === "idle") return null;
  return <span className={`route-signal is-${state}`} aria-hidden="true" />;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  settled: boolean;
};

type OpeningHandoffRuntime = {
  token: number;
  source: OpeningHandoffSource;
  covered: Deferred<void>;
  destination: Deferred<OpeningHandoffDestination | null>;
  animation: Deferred<void>;
  destinationValue?: OpeningHandoffDestination;
};

function createDeferred<T>(): Deferred<T> {
  let settle: (value: T) => void = () => undefined;
  const deferred: Deferred<T> = {
    promise: new Promise<T>((resolve) => {
      settle = resolve;
    }),
    resolve: () => undefined,
    settled: false,
  };
  deferred.resolve = (value) => {
    if (deferred.settled) return;
    deferred.settled = true;
    settle(value);
  };
  return deferred;
}

function dispatchOpeningHandoffState(active: boolean) {
  if (active) {
    document.documentElement.dataset.openingHandoffActive = "true";
  } else {
    document.documentElement.removeAttribute("data-opening-handoff-active");
  }
  document.dispatchEvent(
    new CustomEvent("deception-world:opening-handoff", { detail: { active } }),
  );
}
const DETAIL_ROUTE = /^\/(?:riders|managers|characters)\//;
// The dossier reader's and contents' in-page links.
const DOSSIER_SECTION_LINK =
  /^#(?:character-section-[\w-]+|dossier-profile|dossier-index|identity-records|form-records|ruler-enigma|ruler-polaris)$/;
const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  // Tab can scroll to the next focusable control. A delayed route landing
  // must not pull that control back off-screen after keyboard navigation.
  "Tab",
  " ",
]);
let routeScrollMotionLocks = 0;
// Only the latest hash landing keeps aligning: a second jump made while the
// first is settling must not be pulled back to the first section.
let routeHashSettle = 0;

function holdRouteScrollMotion() {
  routeScrollMotionLocks += 1;
  document.documentElement.dataset.routeScrollSettling = "true";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    routeScrollMotionLocks = Math.max(0, routeScrollMotionLocks - 1);
    if (routeScrollMotionLocks === 0) {
      document.documentElement.removeAttribute("data-route-scroll-settling");
    }
  };
}

async function settleRouteHash(hash: string) {
  // TanStack restores the previous document position after the destination
  // route commits, and mobile WebKit can repeat that restoration after layout.
  // Keep aligning briefly, but stop the moment the user starts scrolling.
  const settle = ++routeHashSettle;
  let userInteracted = false;
  let stopWaiting: () => void = () => undefined;
  const userScrollIntent = new Promise<void>((resolve) => {
    stopWaiting = resolve;
  });
  const noteInteraction = (event: Event) => {
    if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
    if (event instanceof PointerEvent && event.pointerType === "mouse" && event.buttons === 0)
      return;
    if (userInteracted) return;
    userInteracted = true;
    stopWaiting();
  };
  const align = () => {
    if (settle !== routeHashSettle) userInteracted = true;
    if (!userInteracted) {
      document.getElementById(hash)?.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };
  const waitUntilNextAlignment = async (duration: number) => {
    await Promise.race([wait(duration), userScrollIntent]);
    return !userInteracted;
  };
  document.addEventListener("pointerdown", noteInteraction, true);
  document.addEventListener("pointermove", noteInteraction, true);
  document.addEventListener("touchmove", noteInteraction, { capture: true, passive: true });
  document.addEventListener("wheel", noteInteraction, { capture: true, passive: true });
  document.addEventListener("keydown", noteInteraction, true);
  try {
    align();
    await nextFrame();
    if (userInteracted) return;
    align();
    await nextFrame();
    if (userInteracted) return;
    align();
    if (!(await waitUntilNextAlignment(90))) return;
    align();
    if (!(await waitUntilNextAlignment(150))) return;
    align();
    if (!(await waitUntilNextAlignment(240))) return;
    align();
    if (!(await waitUntilNextAlignment(420))) return;
    align();
  } finally {
    document.removeEventListener("pointerdown", noteInteraction, true);
    document.removeEventListener("pointermove", noteInteraction, true);
    document.removeEventListener("touchmove", noteInteraction, true);
    document.removeEventListener("wheel", noteInteraction, true);
    document.removeEventListener("keydown", noteInteraction, true);
  }
}

// A keyboard activation hands focus to what it opened: the named section, or
// the page's heading. Otherwise focus stays with the menu trigger (or falls
// to <body>) and the next Tab jumps back to the top of the page.
function focusRouteDestination(hash?: string) {
  let target =
    (hash && hash !== "top" ? document.getElementById(hash) : null) ??
    document.querySelector<HTMLElement>("main h1") ??
    document.querySelector<HTMLElement>("h1") ??
    document.querySelector<HTMLElement>("main");
  // Return anchors are hidden markers; their section is the destination.
  const hidden = target?.closest<HTMLElement>('[aria-hidden="true"]');
  if (hidden) target = hidden.parentElement;
  if (!target) return;
  if (!target.matches("a[href],button,input,select,textarea,summary,[tabindex]")) {
    const focusTarget = target;
    focusTarget.tabIndex = -1;
    focusTarget.dataset.routeFocus = "true";
    // Only this arrival makes it focusable, so a later click on its text
    // does not select the whole section.
    focusTarget.addEventListener(
      "blur",
      () => {
        focusTarget.removeAttribute("tabindex");
        focusTarget.removeAttribute("data-route-focus");
      },
      { once: true },
    );
  }
  target.focus({ preventScroll: true });
}

export function useLoadGate() {
  const ctx = useContext(LoadGateContext);
  if (!ctx) throw new Error("LoadGateProvider missing");
  return ctx;
}

export function LoadGateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [gate, setGate] = useState<GateState>({
    active: false,
    percent: 0,
    variant: "archive",
    phase: "covering",
  });
  const busy = useRef(false);
  const transitionId = useRef(0);
  const rexonanceTransition = useRef<number | null>(null);
  // FAR FROM's call in flight (cancelled when the page hides, as
  // Rexonance's is), and its skip: the button or Escape shortens the cover.
  const farFromTransition = useRef<number | null>(null);
  const farFromSkip = useRef<(() => void) | null>(null);
  const skipFarFrom = useCallback(() => farFromSkip.current?.(), []);

  // Keep the suit ready on the public pages, but never compete with the
  // opening's title/video/World handoff. Leaving the opening schedules it
  // after that destination's own load; route changes cancel stale idle jobs.
  // rx17 (owner): soon after each page's load, with the call's own chunk.
  useEffect(() => scheduleRexonanceSuitWarm(), [pathname]);
  // Owner (2026-10-11): the Rexonance page itself (chunk, styles, hero) too.
  useEffect(
    () => scheduleRexonancePagePreload(() => router.preloadRoute({ to: "/rexonance-saga" })),
    [pathname, router],
  );
  const rexonanceCoverCancel = useRef<(() => void) | null>(null);
  const openingHandoff = useRef<OpeningHandoffRuntime | null>(null);
  const openingFocusFrames = useRef<number[]>([]);
  const pathnameRef = useRef(pathname);
  const [openingSnapshot, setOpeningSnapshot] = useState<OpeningHandoffSnapshot | null>(null);
  const [signal, setSignal] = useState<"idle" | "running" | "done">("idle");
  const signalTimer = useRef(0);
  const arrivalTimer = useRef(0);
  const [delayedRoute, setDelayedRoute] = useState<{ href: string; focus: boolean } | null>(null);
  const delayRetryRef = useRef<HTMLAnchorElement>(null);
  const scrollMotionReleases = useRef(new Set<() => void>());
  const suitWarmReleases = useRef(new Set<() => void>());
  const holdSuitWarmup = useCallback((preserveIntent = false) => {
    const releases = suitWarmReleases.current;
    const resume = pauseRexonanceSuitWarmup(preserveIntent);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releases.delete(release);
      resume();
    };
    releases.add(release);
    return release;
  }, []);
  const holdManagedScrollMotion = useCallback(() => {
    const release = holdRouteScrollMotion();
    const releaseManaged = () => {
      release();
      scrollMotionReleases.current.delete(releaseManaged);
    };
    scrollMotionReleases.current.add(releaseManaged);
    return releaseManaged;
  }, []);

  useEffect(() => {
    if (delayedRoute?.focus) delayRetryRef.current?.focus({ preventScroll: true });
  }, [delayedRoute]);

  pathnameRef.current = pathname;

  useEffect(() => {
    document.addEventListener("pointerdown", notePress, true);
    document.addEventListener("keydown", notePress, true);
    return () => {
      document.removeEventListener("pointerdown", notePress, true);
      document.removeEventListener("keydown", notePress, true);
      window.clearTimeout(signalTimer.current);
      window.clearTimeout(arrivalTimer.current);
    };
  }, []);

  // html[data-route-cover] marks a covered route change from the press until
  // the page has settled after the shutter: the scroll lock keeps its
  // scrollbar gutter, and the Zeus button waits for the page's entrance.
  const markRouteCover = useCallback((state: "covering" | "revealing" | "settling" | null) => {
    const root = document.documentElement;
    syncRexonanceRouteCover(
      document.querySelector("main.rxs-page.rxs-rexonance-page"),
      root,
    );
    window.clearTimeout(arrivalTimer.current);
    // A menu that unmounts under the cover leaves html[data-side-menu-open]
    // (and its overflow lock) for the shutter. Every cover path releases it
    // once the shutter ends, unless a side menu on the new page is open.
    if (
      (state === null || state === "settling") &&
      !document.querySelector?.('.side-panel[data-open="true"]')
    ) {
      delete root.dataset.sideMenuOpen;
    }
    if (state === null) {
      delete root.dataset.routeCover;
      return;
    }
    root.dataset.routeCover = state;
    if (state === "settling") {
      arrivalTimer.current = window.setTimeout(() => {
        if (root.dataset.routeCover === "settling") delete root.dataset.routeCover;
      }, 260);
    }
  }, []);

  const setDocumentLoading = useCallback((loading: boolean) => {
    const root = document.documentElement;
    // Startup/lower-page guards read the literal "true", not just presence.
    if (loading) root.setAttribute("data-loading", "true");
    else root.removeAttribute("data-loading");
    syncRexonanceRouteCover(document.querySelector("main.rxs-page.rxs-rexonance-page"), root);
  }, []);

  const finishOpeningHandoff = useCallback((token: number, restoreFocus = true) => {
    const runtime = openingHandoff.current;
    if (!runtime || runtime.token !== token) return;
    const destination = runtime.destinationValue;
    for (const frame of openingFocusFrames.current) {
      window.cancelAnimationFrame(frame);
    }
    openingFocusFrames.current = [];
    runtime.covered.resolve(undefined);
    runtime.destination.resolve(null);
    runtime.animation.resolve(undefined);
    openingHandoff.current = null;
    setOpeningSnapshot(null);
    setDocumentLoading(false);
    dispatchOpeningHandoffState(false);
    busy.current = false;

    if (
      !restoreFocus ||
      destination?.path !== "/world" ||
      !destination.focus?.isConnected ||
      pathnameRef.current !== "/world" ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const focusTarget = destination.focus;
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        openingFocusFrames.current = [];
        if (
          transitionId.current === token &&
          pathnameRef.current === "/world" &&
          focusTarget.isConnected &&
          document.visibilityState === "visible"
        ) {
          focusTarget.focus({ preventScroll: true });
        }
      });
      openingFocusFrames.current.push(secondFrame);
    });
    openingFocusFrames.current.push(firstFrame);
  }, [setDocumentLoading]);

  const beginOpeningHandoff = useCallback((source: OpeningHandoffSource) => {
    if (busy.current || openingHandoff.current) return false;
    busy.current = true;
    const token = ++transitionId.current;
    const runtime: OpeningHandoffRuntime = {
      token,
      source,
      covered: createDeferred<void>(),
      destination: createDeferred<OpeningHandoffDestination | null>(),
      animation: createDeferred<void>(),
    };
    openingHandoff.current = runtime;
    setDocumentLoading(true);
    dispatchOpeningHandoffState(true);
    setOpeningSnapshot({ token, phase: "covering", source });
    return true;
  }, [setDocumentLoading]);

  const notifyOpeningHandoffCovered = useCallback((token: number) => {
    const runtime = openingHandoff.current;
    if (!runtime || runtime.token !== token) return;
    runtime.covered.resolve(undefined);
  }, []);

  const notifyOpeningDestination = useCallback((destination: OpeningHandoffDestination) => {
    const runtime = openingHandoff.current;
    if (!runtime || runtime.destination.settled) return;
    if (destination.path !== "/world" || pathnameRef.current !== "/world") return;

    const targets = [
      destination.brand,
      destination.sigil,
      destination.hero,
      destination.backdrop,
      destination.focus,
    ];
    if (targets.some((target) => !target?.isConnected)) return;

    runtime.destinationValue = destination;
    runtime.destination.resolve(destination);
  }, []);

  const completeOpeningHandoff = useCallback((token: number) => {
    const runtime = openingHandoff.current;
    if (!runtime || runtime.token !== token) return;
    runtime.animation.resolve(undefined);
  }, []);

  useEffect(() => {
    const pendingScrollReleases = scrollMotionReleases.current;
    const cancelTransition = () => {
      transitionId.current += 1;
      rexonanceTransition.current = null;
      farFromTransition.current = null;
      farFromSkip.current = null;
      rexonanceCoverCancel.current?.();
      rexonanceCoverCancel.current = null;
      routeHashSettle += 1;
      pendingScrollReleases.forEach((release) => release());
      pendingSuitWarmReleases.forEach((release) => release());
      window.clearTimeout(signalTimer.current);
      window.clearTimeout(arrivalTimer.current);
      for (const frame of openingFocusFrames.current) {
        window.cancelAnimationFrame(frame);
      }
      openingFocusFrames.current = [];
      const runtime = openingHandoff.current;
      runtime?.covered.resolve(undefined);
      runtime?.destination.resolve(null);
      runtime?.animation.resolve(undefined);
      openingHandoff.current = null;
      setOpeningSnapshot(null);
      dispatchOpeningHandoffState(false);
      busy.current = false;
      setDocumentLoading(false);
      document.documentElement.removeAttribute("data-route-cover");
      if (!document.querySelector?.('.side-panel[data-open="true"]')) {
        delete document.documentElement.dataset.sideMenuOpen;
      }
      setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
      setSignal("idle");
      setDelayedRoute(null);
    };
    const pendingSuitWarmReleases = suitWarmReleases.current;
    document.addEventListener("deception-world:cancel-route-transition", cancelTransition);
    window.addEventListener("pagehide", cancelTransition);
    const cancelHiddenRexonance = () => {
      // The operation begins before React paints its cover. A DOM query here
      // misses backgrounding between the click and that first committed frame.
      if (
        document.hidden &&
        (rexonanceTransition.current !== null || farFromTransition.current !== null)
      ) {
        cancelTransition();
      }
    };
    document.addEventListener("visibilitychange", cancelHiddenRexonance);
    // Back/Forward can arrive while a cover is still warming its route. That
    // earlier request must never commit after the browser has moved elsewhere.
    const stopHistory = router.history.subscribe(({ action }) => {
      if (action.type === "BACK" || action.type === "FORWARD" || action.type === "GO") {
        cancelTransition();
      }
    });
    return () => {
      // A pending preload can settle after disposal (or router replacement).
      // Invalidate it before releasing the cover so it cannot navigate later.
      transitionId.current += 1;
      rexonanceTransition.current = null;
      farFromTransition.current = null;
      farFromSkip.current = null;
      rexonanceCoverCancel.current?.();
      rexonanceCoverCancel.current = null;
      routeHashSettle += 1;
      pendingScrollReleases.forEach((release) => release());
      pendingSuitWarmReleases.forEach((release) => release());
      window.clearTimeout(signalTimer.current);
      window.clearTimeout(arrivalTimer.current);
      stopHistory();
      document.removeEventListener("deception-world:cancel-route-transition", cancelTransition);
      window.removeEventListener("pagehide", cancelTransition);
      document.removeEventListener("visibilitychange", cancelHiddenRexonance);
      for (const frame of openingFocusFrames.current) {
        window.cancelAnimationFrame(frame);
      }
      openingFocusFrames.current = [];
      const runtime = openingHandoff.current;
      runtime?.covered.resolve(undefined);
      runtime?.destination.resolve(null);
      runtime?.animation.resolve(undefined);
      openingHandoff.current = null;
      setDocumentLoading(false);
      document.documentElement.removeAttribute("data-route-cover");
      if (!document.querySelector?.('.side-panel[data-open="true"]')) {
        delete document.documentElement.dataset.sideMenuOpen;
      }
      dispatchOpeningHandoffState(false);
      busy.current = false;
    };
  }, [router, setDocumentLoading]);

  // A deep link opened from outside the site (/world#manager-archive in a new
  // tab) lands like one followed inside it: in one jump, flush under the
  // header, and aligned again while the page settles. A single landing is
  // measured while the panel is still lifted by its scroll-linked entrance,
  // so it overshot by the lift. The /world head script holds smooth scrolling
  // off from the first paint (mirage-boot-gate.js); this hold takes it over
  // before the router's landing runs, and lets it go.
  useLayoutEffect(() => {
    if (!window.location.hash) return;
    const releaseScrollMotion = holdManagedScrollMotion();
    let hash = "";
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      /* A malformed hash names no section. */
    }
    if (!hash || hash === "top" || !document.getElementById(hash)) {
      releaseScrollMotion();
      return;
    }
    void settleRouteHash(hash).finally(() => window.setTimeout(releaseScrollMotion, 360));
    return releaseScrollMotion;
  }, [holdManagedScrollMotion]);

  const go = useCallback(
    async ({
      to,
      hash,
      search,
      assets = [],
      transition,
      transitionCovered,
      focusDestination,
    }: GoOptions) => {
      if (!transitionCovered && busy.current) return;
      const releaseSuitWarmup = holdSuitWarmup(to === "/rexonance-saga");
      try {
        const navigationSearch = search ? () => search : undefined;
        if (transitionCovered) {
          const runtime = openingHandoff.current;
          if (!runtime || to !== "/world") return;
          const requestId = runtime.token;
          const isCurrent = () =>
            transitionId.current === requestId && openingHandoff.current?.token === requestId;

          try {
            // Build both warmups inside the guarded region. Besides turning a
            // synchronous router/preloader failure into a handled rejection,
            // this guarantees the shared handoff is released by `finally`.
            const routeWarmup = Promise.resolve()
              .then(() => router.preloadRoute({ to: to as never }))
              .catch(() => undefined);
            const assetWarmup = assets.length
              ? Promise.resolve()
                  .then(() => preloadAssets(assets, () => undefined))
                  .catch(() => undefined)
              : Promise.resolve();

            // The opening owns the screen until the shared layer has painted its
            // complete cover: the dive lands on a still of the world (about
            // 1.45 s, plus up to 0.45 s for GL). A fail-safe prevents a
            // permanently stuck route if the browser aborts animation callbacks
            // while backgrounded.
            await Promise.race([runtime.covered.promise, wait(3000)]);
            if (!isCurrent()) return;
            await Promise.race([Promise.all([routeWarmup, assetWarmup]), wait(2400)]);
            if (!isCurrent()) return;
            await navigate({ to, hash, search: navigationSearch });
            if (!isCurrent()) return;
            const destination = await Promise.race([
              runtime.destination.promise,
              wait(2200).then(() => null),
            ]);
            if (!isCurrent() || !destination) return;
            setOpeningSnapshot({
              token: requestId,
              phase: "arriving",
              source: runtime.source,
              destination,
            });
            // The destination now owns document scrolling. Keep the handoff
            // artwork alive for its arrival animation, but release the global
            // loading lock before waiting for that animation to complete.
            setDocumentLoading(false);
            // The destination must paint twice before FLIP reads its geometry.
            // This prevents zero-sized target rects during iOS viewport changes.
            await nextFrame();
            await nextFrame();
            if (!isCurrent()) return;
            await Promise.race([runtime.animation.promise, wait(1800)]);
            if (!isCurrent()) return;
          } finally {
            if (isCurrent()) finishOpeningHandoff(requestId);
          }
          return;
        }
        if (busy.current) return;
        setDelayedRoute(null);
        const changesDocument = pathname !== to;
        const isGalleryTransition = changesDocument && to === "/gallery";
        const isCinemaTransition = changesDocument && to === "/saga-cinema";
        const isArchiveTransition =
          changesDocument &&
          to !== "/rexonance-saga" &&
          (pathname === "/form-archive" || to === "/form-archive");
        const isZeusTransition = changesDocument && to === "/managers/zeus";
        const isDreamTransition =
          pathname !== to && (to === "/dream-chapter" || transition === "dream");
        const diveVariant = isDreamTransition
          ? "dream"
          : changesDocument
            ? RIDER_DIVE_ROUTES[to as keyof typeof RIDER_DIVE_ROUTES]
            : undefined;
        const cutInVariant = changesDocument
          ? RIDER_CUT_IN_ROUTES[to as keyof typeof RIDER_CUT_IN_ROUTES]
          : undefined;
        const riderTransitionVariant = diveVariant ?? cutInVariant;
        const requestId = ++transitionId.current;
        const isCurrent = () => transitionId.current === requestId;
        const warmCoveredDestination = async () => {
          const ready = await preloadRouteWithDeadline(() =>
            router.preloadRoute({ to: to as never }),
          );
          if (!isCurrent()) return false;
          if (!ready)
            setDelayedRoute({ href: guardedHref(to, hash, search), focus: Boolean(focusDestination) });
          return ready;
        };
        if (
          !isArchiveTransition &&
          !isZeusTransition &&
          !isGalleryTransition &&
          !isCinemaTransition &&
          !riderTransitionVariant
        ) {
          const releaseScrollMotion = changesDocument || hash ? holdManagedScrollMotion() : null;
          const assetWarmup = assets.length
            ? preloadAssets(assets, () => undefined).catch(() => undefined)
            : null;
          // The signal paints before the route's work starts (one frame).
          const signalled =
            changesDocument && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          lastPress = null;
          try {
            if (signalled) {
              window.clearTimeout(signalTimer.current);
              setSignal("running");
              await nextFrame();
            }
            if (!isCurrent()) return;
            // A section jump stays in the current document, including its
            // selected archive. Only a new document starts with fresh search.
            await navigate({ to, hash, search: navigationSearch ?? (changesDocument ? undefined : true) });
            if (!isCurrent()) return;
            if (focusDestination) focusRouteDestination(hash);
            if (hash) await settleRouteHash(hash);
          } finally {
            void assetWarmup;
            if (releaseScrollMotion) window.setTimeout(releaseScrollMotion, 360);
            if (signalled && isCurrent()) {
              setSignal("done");
              signalTimer.current = window.setTimeout(() => setSignal("idle"), 320);
            }
          }
          return;
        }
        busy.current = true;
        let startedAt = performance.now();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const tier = cineTier(reduceMotion);

        if (isGalleryTransition || isCinemaTransition) {
          const releaseScrollMotion = holdManagedScrollMotion();
          const coverVariant = isCinemaTransition ? "cinema" : "gallery";
          const timings = isCinemaTransition
            ? tier === "full"
              ? { cover: 420, reveal: 560 }
              : { cover: 80, reveal: 180 }
            : tier === "full"
              ? { cover: 720, reveal: 1120 }
              : { cover: 100, reveal: 240 };
          setDocumentLoading(true);
          markRouteCover("covering");
          setGate({
            active: true,
            percent: 100,
            variant: coverVariant,
            phase: "covering",
            scene: null,
          });
          try {
            await nextFrame();
            await nextFrame();
            const cinemaArt = isCinemaTransition
              ? Promise.race([
                preloadAssets(assets, () => undefined).catch(() => undefined),
                wait(1000),
              ]) : null;
            if (!isCurrent() || !(await warmCoveredDestination())) return;
            if (cinemaArt) await cinemaArt;
            if (!isCurrent()) return;
            const remaining = timings.cover - (performance.now() - startedAt);
            if (remaining > 0) await wait(remaining);
            if (!isCurrent()) return;
            await navigateUnderCover(router, () => navigate({ to, hash, search: navigationSearch }), to);
            if (!isCurrent()) return;
            if (focusDestination) focusRouteDestination(hash);
            await settleUnderCover();
            if (!isCurrent()) return;
            setDocumentLoading(false);
            markRouteCover("revealing");
            setGate({
              active: true,
              percent: 100,
              variant: coverVariant,
              phase: "revealing",
              scene: null,
            });
            await revealRan(timings.reveal);
          } finally {
            window.setTimeout(releaseScrollMotion, 360);
            if (isCurrent()) {
              setDocumentLoading(false);
              markRouteCover("settling");
              setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
              busy.current = false;
            }
          }
          return;
        }

        if (riderTransitionVariant && !isArchiveTransition) {
          const releaseScrollMotion = holdManagedScrollMotion();
          if (diveVariant === "rexonance") rexonanceTransition.current = requestId;
          let rexonanceCall: RexonanceTransitionRenderer | null = null;
          // The suit's pieces decode beside the call chunk. A cold entry has
          // a finite, cancellable preparation window before its clock begins;
          // the five calls and face-pixel hold keep their original timing.
          const rexonanceSuitWarm =
            diveVariant === "rexonance" && tier === "full" ? warmRexonanceSuit("high") : null;
          let rexonanceSuit: "build" | "whole" = "whole";
          if (diveVariant === "rexonance") {
            if (document.documentElement.dataset.sideMenuOpen === "true") {
              markRouteCover("covering");
            }
            const preparation = prepareRexonanceTransition();
            rexonanceCoverCancel.current = preparation.cancel;
            rexonanceCall = await preparation.promise;
            if (rexonanceCoverCancel.current === preparation.cancel)
              rexonanceCoverCancel.current = null;
            if (!isCurrent()) return;
            // A cached chunk must not join the tap, menu close and overlay
            // render into one long task. Paint the close first. Prepare the
            // real engine in short slices before mounting it. A cold phone
            // gets a bounded preparation window rather than losing the
            // nanite engine simply because the atlas misses the first 300 ms.
            // No preparation changes the call's clock or can hold go forever.
            if (rexonanceCall && tier === "full") setSignal("running");
            await nextFrame();
            await nextFrame();
            if (!isCurrent()) return;
            if (rexonanceCall && tier === "full" && rexonanceSuitWarm) {
              const entry = prepareRexonanceEntry({
                decoded: rexonanceSuitWarm,
                prepare: () =>
                  import("./rexonance-saga/rexonance-suit-plan").then((plan) =>
                    isCurrent() ? plan.prepareRexonanceSuit("high") : false,
                  ),
                // Decoded bitmaps do not mean the sliced light/atlas plan is
                // finished. Give both one finite preparation budget; a cached
                // plan resolves immediately, without adding a warm-entry delay.
                deadlineMs: 1800,
              });
              rexonanceCoverCancel.current = entry.cancel;
              await entry.promise;
              if (rexonanceCoverCancel.current === entry.cancel)
                rexonanceCoverCancel.current = null;
              if (!isCurrent()) return;
            }
            setSignal("idle");
            startedAt = performance.now();
            if (isRexonanceSuitReady()) rexonanceSuit = "build";
          }
          // FAR FROM SAGA's entry (owner, 2026-10-22): the same shape as
          // Rexonance's. The sequence's chunk is prepared with a deadline,
          // the suit's images, the kits and the fire's tables decode beside
          // it (a bounded, cancellable window), and the call then runs from
          // its first painted frame; a still tier rests on the figure.
          let farFromCall: FarFromTransitionRenderer | null = null;
          const farFromWarm =
            diveVariant === "far-from" && tier === "full" ? warmFarFromEntry("high") : null;
          let farFromSuit: "build" | "whole" = "whole";
          let farFromSkipped = false;
          if (diveVariant === "far-from") {
            farFromTransition.current = requestId;
            if (document.documentElement.dataset.sideMenuOpen === "true") {
              markRouteCover("covering");
            }
            const preparation = prepareFarFromTransition();
            rexonanceCoverCancel.current = preparation.cancel;
            farFromCall = await preparation.promise;
            if (rexonanceCoverCancel.current === preparation.cancel)
              rexonanceCoverCancel.current = null;
            if (!isCurrent()) return;
            if (farFromCall && tier === "full") setSignal("running");
            await nextFrame();
            await nextFrame();
            if (!isCurrent()) return;
            if (farFromCall && tier === "full" && farFromWarm) {
              const entry = prepareRexonanceEntry({
                decoded: farFromWarm,
                // The warm-up makes the plan itself (far-from-entry-warmup).
                prepare: () => Promise.resolve(true),
                deadlineMs: 1800,
              });
              rexonanceCoverCancel.current = entry.cancel;
              const ready = await entry.promise;
              if (rexonanceCoverCancel.current === entry.cancel)
                rexonanceCoverCancel.current = null;
              if (!isCurrent()) return;
              if (ready) farFromSuit = "build";
            }
            setSignal("idle");
            startedAt = performance.now();
          }
          // PREV / NEXT between dossiers flips the file; entry from anywhere
          // else keeps the rider's own dive or cut-in.
          const flip =
            DETAIL_ROUTE.test(pathname) &&
            DETAIL_ROUTE.test(to) &&
            Boolean(lastPress?.target.deref()?.closest(".manager-pagination"));
          const timings = reduceMotion
            ? { cover: 100, reveal: 160 }
            : tier === "calm"
              ? CALM_TIMINGS
              : flip
                ? FILE_FLIP_TIMINGS
                : diveVariant
                  ? diveVariant === "rexonance" && !rexonanceCall
                    ? CALM_TIMINGS
                    : diveVariant === "far-from" && !farFromCall
                      ? CALM_TIMINGS
                      : RIDER_DIVE_TIMINGS[diveVariant]
                  : cutInVariant
                    ? RIDER_CUT_IN_TIMINGS[cutInVariant]
                    : CALM_TIMINGS;
          const scene =
            cutInVariant === "ciel"
              ? null
              : composeScene({
                  tier,
                  kind: flip ? "flip" : "iris",
                  frameKind: diveVariant || flip ? "file" : "screen",
                  timings,
                  assets,
                  to,
                  callOnly: Boolean(rexonanceCall) || Boolean(farFromCall),
                });
          setDocumentLoading(true);
          markRouteCover("covering");
          if (!document.querySelector?.('.side-panel[data-open="true"]')) {
            delete document.documentElement.dataset.sideMenuOpen;
          }
          setGate({
            active: true,
            percent: 100,
            variant: riderTransitionVariant,
            phase: "covering",
            scene,
            rexonanceCall,
            rexonanceSuit,
            farFromCall,
            farFromSuit,
          });
          // The skip, from the first painted frame: before the hold it marks
          // the cover spent; during the hold it ends it (below).
          if (farFromCall) {
            farFromSkip.current = () => {
              farFromSkipped = true;
            };
          }
          try {
            if (assets.length) {
              void preloadAssets(assets, () => undefined).catch(() => undefined);
            }
            // rx12: pieces that finish decoding while FAR UP！'s scan still
            // runs switch the call to the build (its clock is already
            // running unseen); later, the finished figure stays.
            if (rexonanceCall && rexonanceSuit === "whole" && rexonanceSuitWarm) {
              void rexonanceSuitWarm.then((decoded) => {
                if (
                  !decoded ||
                  !isCurrent() ||
                  performance.now() - startedAt > REXONANCE_SUIT_LATE_MS
                )
                  return;
                rexonanceSuit = "build";
                setGate((current) =>
                  current.active && current.phase === "covering" && current.rexonanceCall
                    ? { ...current, rexonanceSuit }
                    : current,
                );
              });
            }
            // FAR FROM's pieces decoded while the scan still runs switch the
            // call to the build the same way.
            if (farFromCall && farFromSuit === "whole" && farFromWarm) {
              void farFromWarm.then((decoded) => {
                if (
                  !decoded ||
                  !isCurrent() ||
                  performance.now() - startedAt > FAR_FROM_ENTRY_LATE_MS
                )
                  return;
                farFromSuit = "build";
                setGate((current) =>
                  current.active && current.phase === "covering" && current.farFromCall
                    ? { ...current, farFromSuit }
                    : current,
                );
              });
            }
            // Mobile Safari may coalesce the state update with route/module work.
            // Paint both cinematic entries before loading their route chunk.
            if (
              diveVariant === "dream" ||
              diveVariant === "rexonance" ||
              diveVariant === "far-from" ||
              diveVariant === "illusionculum"
            ) {
              await nextFrame();
              await nextFrame();
              if (!isCurrent()) return;
              // Rexonance's five calls run from the first painted frame, not
              // from the click (which may have included a long layout task).
              if (diveVariant === "rexonance") startedAt = performance.now();
              if (diveVariant === "far-from") startedAt = performance.now();
              if (diveVariant === "illusionculum") startedAt = performance.now();
            }
            // Images warm independently of the route chunk. A stalled chunk
            // releases the cover before navigation, rather than locking the page.
            if (!(await warmCoveredDestination())) return;
            const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
            if (coverTimeLeft > 0) {
              if (diveVariant === "rexonance" && rexonanceCall) {
                const hold = waitForRexonanceCover(coverTimeLeft);
                rexonanceCoverCancel.current = hold.cancel;
                await hold.promise;
                if (rexonanceCoverCancel.current === hold.cancel)
                  rexonanceCoverCancel.current = null;
              } else if (diveVariant === "far-from" && farFromCall) {
                // The same hold (a live reduced-motion or economy preference
                // ends it), and the skip ends it too.
                if (!farFromSkipped) {
                  const hold = waitForRexonanceCover(coverTimeLeft);
                  rexonanceCoverCancel.current = hold.cancel;
                  farFromSkip.current = hold.cancel;
                  await hold.promise;
                  if (farFromSkip.current === hold.cancel) farFromSkip.current = null;
                  if (rexonanceCoverCancel.current === hold.cancel)
                    rexonanceCoverCancel.current = null;
                }
              } else await wait(coverTimeLeft);
            }
            if (!isCurrent()) return;
            await navigateUnderCover(router, () => navigate({ to, hash, search: navigationSearch }), to);
            if (!isCurrent()) return;
            if (focusDestination) focusRouteDestination(hash);
            await settleUnderCover();
            if (!isCurrent()) return;
            const callOnly = Boolean(rexonanceCall);
            let landed = scene;
            // The call renderer has no carried portrait or docking layers. Keep
            // its tier/timing metadata without measuring unused destination art.
            if (!callOnly) {
              const rects = landingRects();
              landed = scene && {
                ...scene,
                ...rects,
                hold: scene.kind === "iris" && cutInVariant ? rects.plate : null,
              };
            }
            // The shutter lifts: the destination owns scrolling again, and its
            // own entrance (keyed to data-loading) starts with the hand-over.
            setDocumentLoading(false);
            markRouteCover("revealing");
            if (!callOnly && landed && (landed.hold || !dockGeometry(landed))) await entranceLead();
            if (!isCurrent()) return;
            setGate({
              active: true,
              percent: 100,
              variant: riderTransitionVariant,
              phase: "revealing",
              scene: landed,
              rexonanceCall,
              rexonanceSuit,
              farFromCall,
              farFromSuit,
            });
            await revealRan(
              timings.reveal,
              callOnly
                ? undefined
                : () => {
                    if (landed) handOverDockedFile(landed);
                  },
            );
          } finally {
            window.setTimeout(releaseScrollMotion, 360);
            if (!document.querySelector?.('.side-panel[data-open="true"]')) {
              delete document.documentElement.dataset.sideMenuOpen;
            }
            if (isCurrent()) {
              if (rexonanceTransition.current === requestId) rexonanceTransition.current = null;
              if (farFromTransition.current === requestId) farFromTransition.current = null;
              farFromSkip.current = null;
              setDocumentLoading(false);
              markRouteCover("settling");
              setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
              busy.current = false;
              // FAR FROM's decoded images are let go once the call has left
              // the document (its engine stops with the gate's unmount).
              if (diveVariant === "far-from") {
                window.setTimeout(() => {
                  if (farFromTransition.current === null) releaseFarFromEntry();
                }, 1000);
              }
            }
          }
          return;
        }

        if (isZeusTransition && !isArchiveTransition) {
          const timings = reduceMotion
            ? { cover: 180, reveal: 140 }
            : tier === "calm"
              ? CALM_TIMINGS
              : SOVEREIGN_TIMINGS;
          const scene = composeScene({
            tier,
            kind: "iris",
            frameKind: "seal",
            timings,
            assets,
            to,
          });
          setDocumentLoading(true);
          markRouteCover("covering");
          setGate({ active: true, percent: 0, variant: "zeus", phase: "covering", scene });
          try {
            if (assets.length) {
              void preloadAssets(assets, () => undefined).catch(() => undefined);
            }
            if (!(await warmCoveredDestination())) return;
            const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
            if (coverTimeLeft > 0) await wait(coverTimeLeft);
            if (!isCurrent()) return;
            await navigateUnderCover(router, () => navigate({ to, hash, search: navigationSearch }), to);
            if (!isCurrent()) return;
            if (focusDestination) focusRouteDestination(hash);
            await settleUnderCover();
            if (!isCurrent()) return;
            const landed = { ...scene, ...landingRects() };
            setDocumentLoading(false);
            markRouteCover("revealing");
            await entranceLead();
            if (!isCurrent()) return;
            setGate({
              active: true,
              percent: 0,
              variant: "zeus",
              phase: "revealing",
              scene: landed,
            });
            await revealRan(timings.reveal);
          } finally {
            if (isCurrent()) {
              setDocumentLoading(false);
              markRouteCover("settling");
              setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
              busy.current = false;
            }
          }
          return;
        }

        const timings = reduceMotion ? { cover: 180, reveal: 120 } : { cover: 900, reveal: 520 };
        const scene = composeScene({
          tier,
          kind: "iris",
          frameKind: "screen",
          timings,
          assets: [],
          to,
        });
        let progressTimer = 0;
        setDocumentLoading(true);
        markRouteCover("covering");
        setGate({ active: true, percent: 4, variant: "archive", phase: "covering", scene });
        try {
          if (!reduceMotion) {
            progressTimer = window.setInterval(() => {
              if (!isCurrent()) return;
              const elapsed = performance.now() - startedAt;
              const next = Math.min(88, 4 + (elapsed / timings.cover) * 84);
              setGate((state) => ({ ...state, percent: Math.max(state.percent, next) }));
            }, 120);
          }

          // Preload only the route module. The archive iframe remains the sole
          // owner of its multi-megabyte document, avoiding duplicate downloads.
          if (!(await warmCoveredDestination())) return;
          const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
          if (coverTimeLeft > 0) await wait(coverTimeLeft);
          if (!isCurrent()) return;
          if (progressTimer) window.clearInterval(progressTimer);
          setGate({ active: true, percent: 100, variant: "archive", phase: "covering", scene });
          await navigate({ to, hash, search: navigationSearch });
          if (!isCurrent()) return;
          if (focusDestination) focusRouteDestination(hash);
          await settleUnderCover();
          if (!isCurrent()) return;
          setDocumentLoading(false);
          markRouteCover("revealing");
          setGate({ active: true, percent: 100, variant: "archive", phase: "revealing", scene });
          await revealRan(timings.reveal);
        } finally {
          if (progressTimer) window.clearInterval(progressTimer);
          if (isCurrent()) {
            setDocumentLoading(false);
            markRouteCover("settling");
            setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
            busy.current = false;
          }
        }
      } finally {
        releaseSuitWarmup();
      }
    },
    [
      finishOpeningHandoff,
      holdManagedScrollMotion,
      holdSuitWarmup,
      markRouteCover,
      navigate,
      pathname,
      router,
      setDocumentLoading,
    ],
  );

  const api = useMemo(
    () => ({ go, beginOpeningHandoff, notifyOpeningDestination }),
    [beginOpeningHandoff, go, notifyOpeningDestination],
  );

  return (
    <LoadGateContext.Provider value={api}>
      {children}
      <LoadOverlay
        active={gate.active}
        variant={gate.variant}
        phase={gate.phase}
        scene={gate.scene}
        rexonanceCall={gate.rexonanceCall}
        rexonanceSuit={gate.rexonanceSuit}
        farFromCall={gate.farFromCall}
        farFromSuit={gate.farFromSuit}
        onSkip={skipFarFrom}
      />
      <RouteSignal state={signal} />
      {delayedRoute && (
        <aside
          className="route-load-delay"
          role="alert"
          aria-label="ページの読み込みが遅れています"
        >
          <p>読み込みが遅れています。元の画面で操作を続けられます。</p>
          <div>
            <a ref={delayRetryRef} href={delayedRoute.href}>
              もう一度開く
            </a>
            <button type="button" onClick={() => setDelayedRoute(null)}>
              閉じる
            </button>
          </div>
        </aside>
      )}
      <OpeningHandoffLayer
        snapshot={openingSnapshot}
        onCovered={notifyOpeningHandoffCovered}
        onComplete={completeOpeningHandoff}
      />
    </LoadGateContext.Provider>
  );
}

function LoadOverlay({
  active,
  variant,
  phase,
  scene,
  rexonanceCall,
  rexonanceSuit,
  farFromCall,
  farFromSuit,
  onSkip,
}: {
  active: boolean;
  variant: GateState["variant"];
  phase: GateState["phase"];
  scene?: CineScene | null;
  rexonanceCall?: RexonanceTransitionRenderer | null;
  rexonanceSuit?: GateState["rexonanceSuit"];
  farFromCall?: FarFromTransitionRenderer | null;
  farFromSuit?: GateState["farFromSuit"];
  onSkip?: () => void;
}) {
  if (!active) return null;
  if (variant === "gallery") return <GalleryCurtain phase={phase} />;
  if (variant === "cinema") {
    return (
      <div
        className={`load-gate cinema-route-curtain is-${phase}`}
        role="status"
        aria-live="polite"
        aria-busy={phase === "covering"}
        aria-label="映画四部作のページへ移動中"
      >
        <div className="cinema-route-shutter is-left" aria-hidden="true" />
        <div className="cinema-route-shutter is-right" aria-hidden="true" />
        <div className="cinema-route-title" aria-hidden="true">
          <small>FILMS 01 — 04</small>
          <b>仮面ライダーサーガ</b>
          <span>邂逅 ／ 覚醒 ／ 激情 ／ 終末</span>
        </div>
      </div>
    );
  }
  const isRiderDive =
    variant === "saga" ||
    variant === "realm" ||
    variant === "lore" ||
    variant === "vandal" ||
    variant === "dream" ||
    variant === "rexonance" ||
    variant === "extreme" ||
    variant === "far-from" ||
    variant === "illusionculum" ||
    variant === "final-stage";
  if (isRiderDive) {
    return (
      <RiderRouteDive
        variant={variant}
        phase={phase}
        scene={scene}
        rexonanceCall={rexonanceCall}
        rexonanceSuit={rexonanceSuit}
        farFromCall={farFromCall}
        farFromSuit={farFromSuit}
        onSkip={onSkip}
      />
    );
  }
  const isRiderCutIn =
    variant === "leddic" ||
    variant === "argenome" ||
    variant === "over-zeztz" ||
    variant === "cipher" ||
    variant === "ciel";
  if (isRiderCutIn) {
    return (
      <div
        className={`load-gate rider-route-cutin is-${variant}-cutin is-${phase}${cineClass(scene)}`}
        style={sceneStyle(scene)}
        role="status"
        aria-live="polite"
        aria-busy={phase === "covering"}
        aria-label={
          phase === "revealing"
            ? `${cutInLabel(variant)}の個別資料を展開しました`
            : `${cutInLabel(variant)}の個別資料を展開中`
        }
      >
        <CineLayers scene={scene} />
        <RiderRouteCutIn variant={variant} />
      </div>
    );
  }
  if (variant === "zeus") {
    return (
      <div
        className={`load-gate is-sovereign-gate is-${phase}${cineClass(scene)}`}
        style={sceneStyle(scene)}
        role="status"
        aria-live="polite"
        aria-busy={phase === "covering"}
        aria-label={
          phase === "revealing" ? "ゼウスの主権記録を開きました" : "ゼウスの主権記録を照合中"
        }
      >
        <CineLayers scene={scene} />
        <div className="load-gate-inner">
          <span className="load-gate-mark" aria-hidden="true">
            <span className="load-gate-sovereign-orbit" />
            <i>I</i>
          </span>
          <span className="load-gate-scan" aria-hidden="true" />
          <small className="load-gate-kicker">SOVEREIGN ARCHIVE // RIKUEI I</small>
          <p className="load-gate-label">
            {phase === "revealing" ? "主権記録を展開" : "主権記録を照合中"}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`load-gate archive-route-dive is-diving${phase === "revealing" ? " is-arriving" : ""} is-${phase}${cineClass(scene)}`}
      style={sceneStyle(scene)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="フォームアーカイブとの間を移動中"
    >
      <CineLayers scene={scene} />
      <span className="archive-dive-space" aria-hidden="true" />
      <span className="cine-dive-tunnel" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="cine-dive-flash" aria-hidden="true" />
      <span className="cine-dive-status">
        <small>SAGA / REALM // FORM ARCHIVE</small>
        <span>{phase === "revealing" ? "境界光を通過中" : "記録宇宙へダイブ中"}</span>
      </span>
    </div>
  );
}

function RiderRouteDive({
  variant,
  phase,
  scene,
  rexonanceCall: RexonanceCallSequence,
  rexonanceSuit,
  farFromCall: FarFromCallSequence,
  farFromSuit,
  onSkip,
}: {
  variant: RiderDiveVariant;
  phase: GateState["phase"];
  scene?: CineScene | null;
  rexonanceCall?: RexonanceTransitionRenderer | null;
  rexonanceSuit?: GateState["rexonanceSuit"];
  farFromCall?: FarFromTransitionRenderer | null;
  farFromSuit?: GateState["farFromSuit"];
  onSkip?: () => void;
}) {
  const meta = RIDER_DIVE_META[variant];
  const revealing = phase === "revealing";
  const rexonance = variant === "rexonance" && Boolean(RexonanceCallSequence);
  const farFrom = variant === "far-from" && Boolean(FarFromCallSequence);
  // ILLUSIONCULUM's entry (illusionculum-entry-sequence.tsx): its projections
  // resolving into the figure, under the cover, on the full tier only.
  const illusionculum = variant === "illusionculum" && scene?.tier === "full";
  // FAR FROM's call is skippable (owner, 2026-10-22): the button, or Escape
  // while it covers.
  const farFromSkippable = farFrom && !revealing && scene?.tier === "full" && Boolean(onSkip);
  useEffect(() => {
    if (!farFromSkippable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [farFromSkippable, onSkip]);
  return (
    <div
      className={`load-gate archive-route-dive rider-route-dive is-${variant}-dive is-diving${revealing ? " is-arriving" : ""} is-${phase}${cineClass(scene)}${rexonance ? " is-rexonance-calls" : ""}${farFrom ? " is-far-from-calls" : ""}${illusionculum ? " is-illusionculum-calls" : ""}`}
      style={sceneStyle(scene)}
      role="status"
      aria-live="polite"
      aria-busy={!revealing}
      aria-label={
        revealing ? `${meta.label}の個別資料へ到着しました` : `${meta.label}の個別資料へダイブ中`
      }
    >
      {rexonance && RexonanceCallSequence ? (
        <RexonanceCallSequence
          mode="entry"
          phase={phase}
          tier={scene?.tier ?? "reduced"}
          suit={rexonanceSuit}
        />
      ) : farFrom && FarFromCallSequence ? (
        <>
          <FarFromCallSequence
            phase={phase}
            tier={scene?.tier ?? "reduced"}
            suit={farFromSuit ?? "whole"}
          />
          {farFromSkippable ? (
            <button
              type="button"
              className="ffe-skip"
              onClick={onSkip}
              aria-label="変身演出をスキップ"
            >
              スキップ
            </button>
          ) : null}
        </>
      ) : illusionculum ? (
        <IllusionculumEntrySequence phase={phase} />
      ) : (
        <>
          <CineLayers scene={scene} />
          <span className="archive-dive-space" aria-hidden="true" />
          <span className="rider-dive-vector-field" aria-hidden="true" />
          <span className="cine-dive-tunnel" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="rider-dive-mark" aria-hidden="true">
            <i>{meta.no}</i>
          </span>
          <span className="cine-dive-flash" aria-hidden="true" />
        </>
      )}
      <span className="cine-dive-status rider-dive-status">
        <small>
          {variant === "rexonance"
            ? "REXONANCE // PERFORMANCE SITE"
            : variant === "extreme"
              ? "EXTREME // SUPREME SITE"
              : variant === "far-from"
                ? "FAR FROM // FINAL FORM SITE"
                : variant === "illusionculum"
                ? "ILLUSIONCULUM // SPECIAL SITE"
                : variant === "final-stage"
                ? "FINAL STAGE // STORY SITE"
                : variant === "dream"
                  ? "DREAM CHAPTER // LIQUID ABYSS"
                  : `${meta.name} // RIDER ${meta.no}`}
        </small>
        <span>
          {variant === "rexonance"
            ? revealing
              ? "共鳴位相へ到着"
              : "P14共鳴位相へダイブ中"
            : variant === "extreme"
              ? revealing
                ? "至高位相へ到着"
                : "P14至高位相へダイブ中"
              : variant === "far-from"
                ? revealing
                  ? "超究極位相へ到着"
                  : "超究極位相へダイブ中"
                : variant === "final-stage"
                  ? revealing
                    ? "最終位相へ到着"
                    : "最終位相へダイブ中"
                : variant === "dream"
                  ? revealing
                    ? "深層夢界へ沈降完了"
                    : "夢界の液層へ沈降中"
                  : revealing
                    ? "個別資料へ到着"
                    : "記録位相へダイブ中"}
        </span>
      </span>
    </div>
  );
}

function cutInLabel(variant: RiderCutInVariant) {
  if (variant === "leddic") return "レディック";
  if (variant === "argenome") return "アルゲノム";
  if (variant === "cipher") return "サイファー";
  if (variant === "ciel") return "シエル";
  return "オーバーゼッツ";
}

function RiderRouteCutIn({ variant }: { variant: RiderCutInVariant }) {
  // シエル (RE DIVE's 六詠 I): emerald and light-blue ribbons drift in over a
  // deep green sky around a four-pointed star, then part to open his page.
  if (variant === "ciel") {
    return (
      <div className="rider-cutin-stage ciel-cutin-stage" aria-hidden="true">
        <span className="ciel-sky" />
        <span className="ciel-ribbons">
          {Array.from({ length: 6 }, (_, index) => (
            <i key={index} style={{ ["--ribbon" as string]: index }} />
          ))}
        </span>
        <span className="ciel-star">
          <i />
        </span>
        <span className="rider-cutin-caption">
          <small>EMERALD × AQUA // RIKUEI I</small>
          <b>CIEL</b>
        </span>
      </div>
    );
  }

  if (variant === "leddic") {
    return (
      <div className="rider-cutin-stage leddic-cutin-stage" aria-hidden="true">
        <span className="leddic-room-glow" />
        <span className="leddic-floor" />
        <span className="leddic-motes">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="leddic-shoji is-left">
          <span className="leddic-paper" />
          <span className="leddic-kumiko" />
          <i />
        </span>
        <span className="leddic-shoji is-right">
          <span className="leddic-paper" />
          <span className="leddic-kumiko" />
          <i />
        </span>
        <span className="leddic-seam" />
        <span className="rider-cutin-caption">
          <small>CRIMSON × GREEN // OPEN</small>
          <b>LEDDIC</b>
        </span>
      </div>
    );
  }

  if (variant === "argenome") {
    return (
      <div className="rider-cutin-stage argenome-cutin-stage" aria-hidden="true">
        <span className="argenome-ink" />
        <span className="argenome-cut-plane is-upper" />
        <span className="argenome-cut-plane is-lower" />
        <span className="argenome-sigil" />
        <span className="argenome-slash is-echo-one" />
        <span className="argenome-slash is-echo-two" />
        <span className="argenome-slash is-main" />
        <span className="argenome-flare" />
        <span className="argenome-sparks">
          {Array.from({ length: 14 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="rider-cutin-caption">
          <small>SCARLET TRACE // SEVER</small>
          <b>ARGENOME</b>
        </span>
      </div>
    );
  }

  if (variant === "cipher") {
    return (
      <div className="rider-cutin-stage cipher-cutin-stage" aria-hidden="true">
        <span className="cipher-void" />
        <span className="cipher-scan-grid" />
        <span className="cipher-reticle" />
        <span className="cipher-slash-field">
          {Array.from({ length: 20 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="cipher-cross-flare" />
        <span className="cipher-data-fragments">
          {Array.from({ length: 16 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="rider-cutin-caption">
          <small>SPOOF // TRACE // PROXY</small>
          <b>CIPHER</b>
        </span>
      </div>
    );
  }

  return (
    <div className="rider-cutin-stage over-zeztz-cutin-stage" aria-hidden="true">
      <span className="over-zeztz-crack" />
      <span className="over-zeztz-strike">
        <i />
        <i />
      </span>
      <span className="over-zeztz-impact" />
      <span className="over-zeztz-pressure-ring" />
      <span className="over-zeztz-shards">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} />
        ))}
      </span>
      <span className="over-zeztz-debris">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} />
        ))}
      </span>
      <span className="rider-cutin-caption">
        <small>BREAK LIMIT // COLLAPSE</small>
        <b>OVER-ZEZTZ</b>
      </span>
    </div>
  );
}

export function GuardedLink({
  to,
  hash,
  search,
  assets,
  transition,
  className,
  style,
  beforeNavigate,
  children,
  ...rest
}: {
  to: string;
  hash?: string;
  search?: Record<string, string>;
  assets: readonly string[];
  transition?: "dream";
  className?: string;
  style?: CSSProperties;
  beforeNavigate?: () => void;
  children?: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
}) {
  const { go } = useLoadGate();
  const router = useRouter();
  const preloadedRoute = useRef<string | null>(null);
  const preloadedAssetKey = useRef<string | null>(null);
  const href = guardedHref(to, hash, search);

  const preloadDestination = useCallback(() => {
    // rx12: the Rexonance call's suit-up pieces decode on intent.
    // Actual hover/focus/touch owns this warm-up. go() may suspend
    // speculative work, but must not abort the visitor's intended call.
    if (to === "/rexonance-saga") void warmRexonanceSuit("high");
    // FAR FROM's call chunk and images, the same way (never on a still tier).
    if (to === "/far-from-saga") prefetchFarFromEntry();
    if (preloadedRoute.current !== to) {
      preloadedRoute.current = to;
      void router.preloadRoute({ to }).catch(() => {
        if (preloadedRoute.current === to) preloadedRoute.current = null;
      });
    }
    const assetKey = assets.join("\n");
    if (!assetKey || preloadedAssetKey.current === assetKey) return;
    preloadedAssetKey.current = assetKey;
    void preloadAssets(assets, () => undefined).catch(() => {
      if (preloadedAssetKey.current === assetKey) preloadedAssetKey.current = null;
    });
  }, [assets, router, to]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.detail !== 0) e.currentTarget?.blur?.();
    beforeNavigate?.();
    // detail 0: activated from the keyboard (Enter), not a pointer.
    void go({ to, hash, search, assets, transition, focusDestination: e.detail === 0 });
  };

  return (
    <a
      href={href}
      className={className}
      style={style}
      onPointerEnter={preloadDestination}
      onFocus={preloadDestination}
      onTouchStart={preloadDestination}
      onClick={onClick}
      {...rest}
    >
      {children}
    </a>
  );
}

/* 2026-10-21 sweep F34: a reload (or a return to this entry from another
   site) is not a fresh entry. The router restores the reader's position once,
   when it first renders, but a long page is still short then (the gate holds
   the body, the lower chapters mount on idle), so the restore landed at the
   top and stayed there. Where the router kept a position for this entry, and
   the URL names no section, it is applied again once the page is tall enough
   to hold it, at most once and within RELOAD_RESTORE_MS; any scroll, key,
   wheel or touch of the reader's own ends the wait. */
const RELOAD_RESTORE_MS = 4000;

function reloadPosition(saved: { scrollX: number; scrollY: number } | undefined) {
  if (typeof window === "undefined" || !saved || !(saved.scrollY > 0)) return null;
  if (window.location.hash.length > 1) return null;
  const [navigation] = (window.performance?.getEntriesByType?.("navigation") ??
    []) as PerformanceNavigationTiming[];
  if (navigation?.type !== "reload" && navigation?.type !== "back_forward") return null;
  return { x: Number.isFinite(saved.scrollX) ? saved.scrollX : 0, y: saved.scrollY };
}

function restoreReloadPosition(target: { x: number; y: number }, dossier: boolean) {
  const root = document.documentElement;
  const path = window.location.pathname;
  const started = performance.now();
  let frame = 0;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    document.removeEventListener("pointerdown", readerTookOver, true);
    document.removeEventListener("touchmove", readerTookOver, true);
    document.removeEventListener("wheel", readerTookOver, true);
    document.removeEventListener("keydown", readerTookOver, true);
  };
  function readerTookOver(event: Event) {
    if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
    stop();
  }
  const tick = () => {
    frame = 0;
    if (done) return;
    if (window.location.pathname !== path || performance.now() - started > RELOAD_RESTORE_MS) {
      stop();
      return;
    }
    if (root.scrollHeight - window.innerHeight >= target.y - 1) {
      if (Math.abs(window.scrollY - target.y) > 2) {
        // A dossier lays its long records out in full while the offset lands,
        // as a Back/Forward arrival does (25.css), so it lands on the words
        // it was measured on; `auto` then keeps their real sizes.
        const hold = dossier && root.dataset.routeRestoring !== "true";
        if (hold) root.dataset.routeRestoring = "true";
        window.scrollTo({ top: target.y, left: target.x, behavior: "instant" });
        if (hold) window.requestAnimationFrame(() => delete root.dataset.routeRestoring);
      }
      stop();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };
  document.addEventListener("pointerdown", readerTookOver, true);
  document.addEventListener("touchmove", readerTookOver, { capture: true, passive: true });
  document.addEventListener("wheel", readerTookOver, { capture: true, passive: true });
  document.addEventListener("keydown", readerTookOver, true);
  frame = window.requestAnimationFrame(tick);
  return stop;
}

export function AppGuards() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const savedWindow = useElementScrollRestoration({
    getElement: () => (typeof window === "undefined" ? undefined : window),
  });
  // Read once, on the first render of this document.
  const [reloadTarget] = useState(() => reloadPosition(savedWindow));
  const reloadArrival = useRef(reloadTarget !== null);
  const locationHash = useRouterState({ select: (state) => state.location.hash });
  const previousPathname = useRef<string | null>(null);
  const router = useRouter();
  const historyTraversal = useRef(false);
  const [topRepeat, setTopRepeat] = useState(0);

  // A jump from a dossier's reader or contents is a native anchor. It lands
  // before the records above the section are laid out, so their
  // content-visibility placeholders give way to the real height after it and
  // 変身記録 could open 650 px short on a phone. Align again from the next
  // frame while they settle, as a route's own hash landing does; any scroll
  // stops it.
  useEffect(() => {
    const onClick = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!DETAIL_ROUTE.test(window.location.pathname)) return;
      const target = event.target instanceof Element ? event.target : null;
      const href = target?.closest("a")?.getAttribute("href") ?? "";
      if (!DOSSIER_SECTION_LINK.test(href)) return;
      const releaseJumpMotion = holdRouteScrollMotion();
      window.requestAnimationFrame(() => {
        void settleRouteHash(href.slice(1)).finally(() =>
          window.setTimeout(releaseJumpMotion, 360),
        );
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // History notifies subscribers before the router commits the location, so
  // the layout effect below knows whether it is answering Back/Forward.
  useEffect(() => {
    let previousHref = router.history.location.href;
    return router.history.subscribe(({ action, location }) => {
      const pop = action.type === "BACK" || action.type === "FORWARD" || action.type === "GO";
      const repeated = pop && location.href === previousHref;
      previousHref = location.href;
      // A native in-page link (href="#top") also arrives as a pop, but its
      // entry has no router state; only Back/Forward returns to a keyed one.
      historyTraversal.current = pop && !repeated && window.history.state?.__TSR_key != null;
      // That entry (the World header's #riders) then keeps the key the router
      // made up for it. The router files the reader's position under that key
      // as they leave, and with a new key made up again on Back it found
      // nothing and fell back to the section's top, not where they had read
      // to. The native replaceState leaves the router's own copy untouched.
      if (pop && window.history.state == null && location.state.__TSR_key) {
        History.prototype.replaceState.call(window.history, location.state, "");
      }
      // Back/Forward into a dossier lays its long records out in full before
      // the router restores the offset (25.css), so the offset lands on the
      // words it was measured on.
      if (historyTraversal.current && DETAIL_ROUTE.test(location.pathname)) {
        document.documentElement.dataset.routeRestoring = "true";
      }
      // Pressed again while the world is already at #top, the link changes no
      // location, so nothing below would run and the page would glide all the
      // way up. Ask for the same instant reset as the first press.
      if (repeated && location.pathname === "/world" && location.hash === "#top") {
        setTopRepeat((count) => count + 1);
      }
    });
  }, [router]);

  useEffect(() => {
    if (!reloadTarget) return;
    return restoreReloadPosition(reloadTarget, DETAIL_ROUTE.test(window.location.pathname));
  }, [reloadTarget]);

  useLayoutEffect(() => {
    // A reloaded document's first route keeps the reader's place: it is not a
    // fresh entry, so it is restored like a history arrival
    // (restoreReloadPosition), not sent to the top.
    const reloaded = previousPathname.current === null && reloadArrival.current;
    const pathnameChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    // Back/Forward into the world returns the reader to where they were, and
    // into a dossier to where they left it: the router restores that
    // position, so only fresh entries start at the top.
    if (reloaded) historyTraversal.current = true;
    const fromHistory = historyTraversal.current;
    historyTraversal.current = false;
    const root = document.documentElement;
    // The full layout is held while the router's delayed restoration settles
    // (set again here: the outgoing route's cleanup has just let it go), then
    // content-visibility skips the off-screen records again, now sized from
    // what was laid out.
    const historyDossier = fromHistory && DETAIL_ROUTE.test(pathname);
    let restoringTimer = 0;
    if (historyDossier) {
      root.dataset.routeRestoring = "true";
      restoringTimer = window.setTimeout(() => {
        restoringTimer = 0;
        delete root.dataset.routeRestoring;
      }, 1500);
    } else {
      delete root.dataset.routeRestoring;
    }
    const releaseRestoring = () => {
      if (restoringTimer) window.clearTimeout(restoringTimer);
      restoringTimer = 0;
      delete root.dataset.routeRestoring;
    };
    const isDossierSectionHash =
      /^#?character-section-/.test(locationHash) ||
      /^#?(?:dossier-profile|dossier-index|identity-records|form-records|ruler-enigma|ruler-polaris)$/.test(locationHash);
    const resetRouteTop =
      (DETAIL_ROUTE.test(pathname) && pathnameChanged && !isDossierSectionHash && !fromHistory) ||
      (pathname === "/world" && (!locationHash || locationHash === "top") && !fromHistory);
    if (!resetRouteTop) {
      if (!historyDossier) return releaseRestoring;
      // A dossier reached by Back/Forward is left like any other: its exit is
      // covered as below.
      return () => {
        const releaseExitMotion = holdRouteScrollMotion();
        window.setTimeout(releaseExitMotion, 360);
        releaseRestoring();
      };
    }
    const releaseScrollMotion = holdRouteScrollMotion();
    const timers: number[] = [];
    let firstFrame = 0;
    let finalFrame = 0;
    let viewportFrame = 0;
    let userInteracted = false;
    let stopped = false;

    const resetDetailScroll = () => {
      if (stopped || userInteracted) return;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    const stopResetting = () => {
      if (stopped) return;
      stopped = true;
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (finalFrame) window.cancelAnimationFrame(finalFrame);
      if (viewportFrame) window.cancelAnimationFrame(viewportFrame);
      timers.splice(0).forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("pointermove", noteInteraction, true);
      document.removeEventListener("pointerdown", noteInteraction, true);
      document.removeEventListener("touchmove", noteInteraction, true);
      document.removeEventListener("wheel", noteInteraction, true);
      document.removeEventListener("keydown", noteInteraction, true);
      window.removeEventListener("pageshow", alignAfterViewportChange);
      window.removeEventListener("resize", alignAfterViewportChange);
      window.visualViewport?.removeEventListener("resize", alignAfterViewportChange);
      releaseScrollMotion();
    };
    function noteInteraction(event: Event) {
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      if (event instanceof PointerEvent && event.pointerType === "mouse" && event.buttons === 0)
        return;
      userInteracted = true;
      stopResetting();
    }
    function alignAfterViewportChange() {
      if (stopped || userInteracted || viewportFrame) return;
      viewportFrame = window.requestAnimationFrame(() => {
        viewportFrame = 0;
        resetDetailScroll();
      });
    }

    // The router snapshots the outgoing world's position before this layout
    // effect runs. Keep smooth scrolling disabled until its delayed restoration
    // has settled, otherwise the outgoing world visibly races toward the top.
    resetDetailScroll();
    document.addEventListener("pointerdown", noteInteraction, true);
    document.addEventListener("pointermove", noteInteraction, true);
    document.addEventListener("touchmove", noteInteraction, { capture: true, passive: true });
    document.addEventListener("wheel", noteInteraction, { capture: true, passive: true });
    document.addEventListener("keydown", noteInteraction, true);
    window.addEventListener("pageshow", alignAfterViewportChange);
    window.addEventListener("resize", alignAfterViewportChange);
    window.visualViewport?.addEventListener("resize", alignAfterViewportChange);
    firstFrame = window.requestAnimationFrame(() => {
      resetDetailScroll();
      finalFrame = window.requestAnimationFrame(resetDetailScroll);
    });
    [90, 240, 480, 900, 1500].forEach((delay) => {
      timers.push(window.setTimeout(resetDetailScroll, delay));
    });
    timers.push(window.setTimeout(stopResetting, 1800));

    return () => {
      // Cover browser-back and native history restoration as the detail route
      // unmounts, even when navigation did not originate from GuardedLink.
      const releaseExitMotion = holdRouteScrollMotion();
      window.setTimeout(releaseExitMotion, 360);
      stopResetting();
      releaseRestoring();
    };
  }, [locationHash, pathname, topRepeat]);

  return null;
}
