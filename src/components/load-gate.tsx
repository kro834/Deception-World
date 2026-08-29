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
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  OpeningHandoffLayer,
  type OpeningHandoffDestination,
  type OpeningHandoffSnapshot,
  type OpeningHandoffSource,
} from "@/components/cinematic/opening-handoff";
import { preloadAssets } from "@/lib/asset-loader";

type RiderDiveVariant = "saga" | "realm" | "lore" | "vandal" | "dream" | "rexonance" | "extreme";
type RiderCutInVariant = "leddic" | "argenome" | "over-zeztz" | "cipher";
type RiderTransitionVariant = RiderDiveVariant | RiderCutInVariant;

type GateState = {
  active: boolean;
  percent: number;
  variant: "archive" | "zeus" | RiderTransitionVariant;
  phase: "covering" | "revealing";
};

type GoOptions = {
  to: string;
  hash?: string;
  assets?: readonly string[];
  transition?: "dream";
  transitionCovered?: boolean;
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
} as const satisfies Record<string, RiderDiveVariant>;

const RIDER_CUT_IN_ROUTES = {
  "/riders/leddic": "leddic",
  "/riders/argenome": "argenome",
  "/riders/over-zeztz": "over-zeztz",
  "/riders/cipher": "cipher",
} as const satisfies Record<string, RiderCutInVariant>;

const RIDER_CUT_IN_TIMINGS: Record<RiderCutInVariant, { cover: number; reveal: number }> = {
  leddic: { cover: 260, reveal: 680 },
  argenome: { cover: 320, reveal: 640 },
  "over-zeztz": { cover: 360, reveal: 760 },
  cipher: { cover: 400, reveal: 720 },
};

const RIDER_DIVE_TIMINGS: Record<RiderDiveVariant, { cover: number; reveal: number }> = {
  saga: { cover: 520, reveal: 480 },
  realm: { cover: 520, reveal: 480 },
  lore: { cover: 520, reveal: 480 },
  vandal: { cover: 520, reveal: 480 },
  dream: { cover: 620, reveal: 520 },
  rexonance: { cover: 560, reveal: 520 },
  extreme: { cover: 540, reveal: 500 },
};

const RIDER_DIVE_META: Record<RiderDiveVariant, { no: string; name: string; label: string }> = {
  saga: { no: "01", name: "SAGA", label: "サーガ" },
  realm: { no: "02", name: "REALM", label: "レルム" },
  lore: { no: "03", name: "LORE", label: "ローア" },
  vandal: { no: "04", name: "VANDAL", label: "ヴァンダール" },
  dream: { no: "I", name: "DREAM CHAPTER", label: "ドリームチャプター" },
  rexonance: { no: "P14", name: "REXONANCE", label: "レクソナンスサーガ" },
  extreme: { no: "EX", name: "EXTREME", label: "エクスプリームサーガ" },
};

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));
const nextFrame = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

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
const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);
let routeScrollMotionLocks = 0;

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
  const openingHandoff = useRef<OpeningHandoffRuntime | null>(null);
  const openingFocusFrames = useRef<number[]>([]);
  const pathnameRef = useRef(pathname);
  const [openingSnapshot, setOpeningSnapshot] = useState<OpeningHandoffSnapshot | null>(null);

  pathnameRef.current = pathname;

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
    document.documentElement.removeAttribute("data-loading");
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
  }, []);

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
    document.documentElement.dataset.loading = "true";
    dispatchOpeningHandoffState(true);
    setOpeningSnapshot({ token, phase: "covering", source });
    return true;
  }, []);

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
    const cancelTransition = () => {
      transitionId.current += 1;
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
      document.documentElement.removeAttribute("data-loading");
      setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
    };
    document.addEventListener("deception-world:cancel-route-transition", cancelTransition);
    window.addEventListener("pagehide", cancelTransition);
    return () => {
      document.removeEventListener("deception-world:cancel-route-transition", cancelTransition);
      window.removeEventListener("pagehide", cancelTransition);
      for (const frame of openingFocusFrames.current) {
        window.cancelAnimationFrame(frame);
      }
      openingFocusFrames.current = [];
      const runtime = openingHandoff.current;
      runtime?.covered.resolve(undefined);
      runtime?.destination.resolve(null);
      runtime?.animation.resolve(undefined);
      openingHandoff.current = null;
      document.documentElement.removeAttribute("data-loading");
      dispatchOpeningHandoffState(false);
      busy.current = false;
    };
  }, []);

  const go = useCallback(
    async ({ to, hash, assets = [], transition, transitionCovered }: GoOptions) => {
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
          // complete cover. A fail-safe prevents a permanently stuck route if
          // the browser aborts animation callbacks while backgrounded.
          await Promise.race([runtime.covered.promise, wait(1400)]);
          if (!isCurrent()) return;
          await Promise.race([Promise.all([routeWarmup, assetWarmup]), wait(2400)]);
          if (!isCurrent()) return;
          await navigate({ to: to as never, hash });
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
      const isArchiveTransition = pathname === "/form-archive" || to === "/form-archive";
      const isZeusTransition = to === "/managers/zeus";
      const isDreamTransition =
        pathname !== to && (to === "/dream-chapter" || transition === "dream");
      const diveVariant = isDreamTransition
        ? "dream"
        : RIDER_DIVE_ROUTES[to as keyof typeof RIDER_DIVE_ROUTES];
      const cutInVariant = RIDER_CUT_IN_ROUTES[to as keyof typeof RIDER_CUT_IN_ROUTES];
      const riderTransitionVariant = diveVariant ?? cutInVariant;
      if (!isArchiveTransition && !isZeusTransition && !riderTransitionVariant) {
        const changesDocument = pathname !== to;
        const releaseScrollMotion = changesDocument || hash ? holdRouteScrollMotion() : null;
        const assetWarmup = assets.length
          ? preloadAssets(assets, () => undefined).catch(() => undefined)
          : null;
        try {
          await navigate({ to: to as never, hash });
          if (hash) await settleRouteHash(hash);
        } finally {
          void assetWarmup;
          if (releaseScrollMotion) window.setTimeout(releaseScrollMotion, 360);
        }
        return;
      }
      busy.current = true;
      const requestId = ++transitionId.current;
      const isCurrent = () => transitionId.current === requestId;
      const startedAt = performance.now();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (riderTransitionVariant && !isArchiveTransition) {
        const releaseScrollMotion = holdRouteScrollMotion();
        const timings = reduceMotion
          ? { cover: 100, reveal: 160 }
          : diveVariant
            ? RIDER_DIVE_TIMINGS[diveVariant]
            : RIDER_CUT_IN_TIMINGS[cutInVariant];
        document.documentElement.dataset.loading = "true";
        setGate({ active: true, percent: 100, variant: riderTransitionVariant, phase: "covering" });
        try {
          if (assets.length) {
            void preloadAssets(assets, () => undefined).catch(() => undefined);
          }
          // Mobile Safari may coalesce the state update with route/module work.
          // Give the Dream dive two paints so its first frame is always visible.
          if (diveVariant === "dream") {
            await nextFrame();
            await nextFrame();
            if (!isCurrent()) return;
          }
          // Let the requested first-paint images keep warming while the route
          // module loads, without delaying the cinematic cover on slow links.
          await Promise.race([
            router.preloadRoute({ to: to as never }).catch(() => undefined),
            wait(2400),
          ]);
          const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
          if (coverTimeLeft > 0) await wait(coverTimeLeft);
          if (!isCurrent()) return;
          await navigate({ to: to as never, hash });
          if (!isCurrent()) return;
          setGate({
            active: true,
            percent: 100,
            variant: riderTransitionVariant,
            phase: "revealing",
          });
          await wait(timings.reveal);
        } finally {
          window.setTimeout(releaseScrollMotion, 360);
          if (isCurrent()) {
            document.documentElement.removeAttribute("data-loading");
            setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
            busy.current = false;
          }
        }
        return;
      }

      if (isZeusTransition && !isArchiveTransition) {
        const timings = reduceMotion ? { cover: 180, reveal: 140 } : { cover: 720, reveal: 360 };
        document.documentElement.dataset.loading = "true";
        setGate({ active: true, percent: 0, variant: "zeus", phase: "covering" });
        try {
          if (assets.length) {
            void preloadAssets(assets, () => undefined).catch(() => undefined);
          }
          await router.preloadRoute({ to: to as never }).catch(() => undefined);
          const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
          if (coverTimeLeft > 0) await wait(coverTimeLeft);
          if (!isCurrent()) return;
          await navigate({ to: to as never, hash });
          if (!isCurrent()) return;
          setGate({ active: true, percent: 0, variant: "zeus", phase: "revealing" });
          await wait(timings.reveal);
        } finally {
          if (isCurrent()) {
            document.documentElement.removeAttribute("data-loading");
            setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
            busy.current = false;
          }
        }
        return;
      }

      const timings = reduceMotion ? { cover: 180, reveal: 120 } : { cover: 900, reveal: 520 };
      let progressTimer = 0;
      document.documentElement.dataset.loading = "true";
      setGate({ active: true, percent: 4, variant: "archive", phase: "covering" });
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
        await router.preloadRoute({ to: to as never }).catch(() => undefined);
        const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
        if (coverTimeLeft > 0) await wait(coverTimeLeft);
        if (!isCurrent()) return;
        if (progressTimer) window.clearInterval(progressTimer);
        setGate({ active: true, percent: 100, variant: "archive", phase: "covering" });
        await navigate({ to: to as never, hash });
        if (!isCurrent()) return;
        setGate({ active: true, percent: 100, variant: "archive", phase: "revealing" });
        await wait(timings.reveal);
      } finally {
        if (progressTimer) window.clearInterval(progressTimer);
        if (isCurrent()) {
          document.documentElement.removeAttribute("data-loading");
          setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
          busy.current = false;
        }
      }
    },
    [finishOpeningHandoff, navigate, pathname, router],
  );

  const api = useMemo(
    () => ({ go, beginOpeningHandoff, notifyOpeningDestination }),
    [beginOpeningHandoff, go, notifyOpeningDestination],
  );

  return (
    <LoadGateContext.Provider value={api}>
      {children}
      <LoadOverlay active={gate.active} variant={gate.variant} phase={gate.phase} />
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
}: {
  active: boolean;
  variant: GateState["variant"];
  phase: GateState["phase"];
}) {
  if (!active) return null;
  const isRiderDive =
    variant === "saga" ||
    variant === "realm" ||
    variant === "lore" ||
    variant === "vandal" ||
    variant === "dream" ||
    variant === "rexonance" ||
    variant === "extreme";
  if (isRiderDive) {
    return <RiderRouteDive variant={variant} phase={phase} />;
  }
  const isRiderCutIn =
    variant === "leddic" ||
    variant === "argenome" ||
    variant === "over-zeztz" ||
    variant === "cipher";
  if (isRiderCutIn) {
    return (
      <div
        className={`load-gate rider-route-cutin is-${variant}-cutin is-${phase}`}
        role="status"
        aria-live="polite"
        aria-busy={phase === "covering"}
        aria-label={
          phase === "revealing"
            ? `${cutInLabel(variant)}の個別資料を展開しました`
            : `${cutInLabel(variant)}の個別資料を展開中`
        }
      >
        <RiderRouteCutIn variant={variant} />
      </div>
    );
  }
  if (variant === "zeus") {
    return (
      <div
        className={`load-gate is-sovereign-gate is-${phase}`}
        role="status"
        aria-live="polite"
        aria-busy={phase === "covering"}
        aria-label={
          phase === "revealing" ? "ゼウスの主権記録を開きました" : "ゼウスの主権記録を照合中"
        }
      >
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
      className={`load-gate archive-route-dive is-diving${phase === "revealing" ? " is-arriving" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="フォームアーカイブとの間を移動中"
    >
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
}: {
  variant: RiderDiveVariant;
  phase: GateState["phase"];
}) {
  const meta = RIDER_DIVE_META[variant];
  const revealing = phase === "revealing";
  return (
    <div
      className={`load-gate archive-route-dive rider-route-dive is-${variant}-dive is-diving${revealing ? " is-arriving" : ""} is-${phase}`}
      role="status"
      aria-live="polite"
      aria-busy={!revealing}
      aria-label={
        revealing ? `${meta.label}の個別資料へ到着しました` : `${meta.label}の個別資料へダイブ中`
      }
    >
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
      <span className="cine-dive-status rider-dive-status">
        <small>
          {variant === "rexonance"
            ? "REXONANCE // PERFORMANCE SITE"
            : variant === "extreme"
              ? "EXTREME // SUPREME SITE"
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
  return "オーバーゼッツ";
}

function RiderRouteCutIn({ variant }: { variant: RiderCutInVariant }) {
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
          <small>NO TRACE // DEAD DROP</small>
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
  const href = hash ? `${to}#${hash}` : to;

  const preloadDestination = useCallback(() => {
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
    beforeNavigate?.();
    void go({ to, hash, assets, transition });
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

export function AppGuards() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const locationHash = useRouterState({ select: (state) => state.location.hash });

  useLayoutEffect(() => {
    const resetRouteTop =
      DETAIL_ROUTE.test(pathname) ||
      (pathname === "/world" && (!locationHash || locationHash === "top"));
    if (!resetRouteTop) return;
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
    };
  }, [locationHash, pathname]);

  useEffect(() => {
    const editable = (t: EventTarget | null) => {
      if (!(t instanceof Element)) return false;
      return Boolean(t.closest("input, textarea, [contenteditable='true']"));
    };
    const block = (e: Event) => {
      if (!editable(e.target)) e.preventDefault();
    };
    const blockAlways = (e: Event) => e.preventDefault();
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", blockAlways);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", blockAlways);
    };
  }, []);
  return null;
}
