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

type GateState = {
  active: boolean;
  percent: number;
  variant: "archive" | "zeus";
  phase: "covering" | "revealing";
};

type GoOptions = {
  to: string;
  hash?: string;
  assets?: readonly string[];
  transitionCovered?: boolean;
};

type LoadGateApi = {
  go: (opts: GoOptions) => Promise<void>;
};

const LoadGateContext = createContext<LoadGateApi | null>(null);

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));
const nextFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
const DETAIL_ROUTE = /^\/(?:riders|managers|characters)\//;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
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

async function settleWorldHash(hash: string) {
  // TanStack restores the previous document position after the destination
  // route commits, and mobile WebKit can repeat that restoration after layout.
  // Keep aligning briefly, but stop the moment the user starts interacting.
  let userInteracted = false;
  const noteInteraction = (event: Event) => {
    if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
    userInteracted = true;
  };
  const align = () => {
    if (!userInteracted) {
      document.getElementById(hash)?.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };
  document.addEventListener("pointerdown", noteInteraction, true);
  document.addEventListener("touchstart", noteInteraction, { capture: true, passive: true });
  document.addEventListener("wheel", noteInteraction, { capture: true, passive: true });
  document.addEventListener("keydown", noteInteraction, true);
  try {
    align();
    await nextFrame();
    align();
    await nextFrame();
    align();
    await wait(90);
    align();
    await wait(150);
    align();
  } finally {
    document.removeEventListener("pointerdown", noteInteraction, true);
    document.removeEventListener("touchstart", noteInteraction, true);
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

  useEffect(() => {
    const cancelTransition = () => {
      transitionId.current += 1;
      busy.current = false;
      document.documentElement.removeAttribute("data-loading");
      setGate({ active: false, percent: 0, variant: "archive", phase: "covering" });
    };
    document.addEventListener("deception-world:cancel-route-transition", cancelTransition);
    return () => document.removeEventListener("deception-world:cancel-route-transition", cancelTransition);
  }, []);

  const go = useCallback(
    async ({ to, hash }: GoOptions) => {
      if (busy.current) return;
      const isArchiveTransition = pathname === "/form-archive" || to === "/form-archive";
      const isZeusTransition = to === "/managers/zeus";
      if (!isArchiveTransition && !isZeusTransition) {
        const changesDocument = pathname !== to;
        const releaseScrollMotion = changesDocument ? holdRouteScrollMotion() : null;
        try {
          await navigate({ to: to as never, hash });
          if (changesDocument && to === "/world" && hash) await settleWorldHash(hash);
        } finally {
          if (releaseScrollMotion) window.setTimeout(releaseScrollMotion, 360);
        }
        return;
      }
      busy.current = true;
      const requestId = ++transitionId.current;
      const isCurrent = () => transitionId.current === requestId;
      const startedAt = performance.now();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (isZeusTransition && !isArchiveTransition) {
        const timings = reduceMotion ? { cover: 180, reveal: 140 } : { cover: 720, reveal: 360 };
        document.documentElement.dataset.loading = "true";
        setGate({ active: true, percent: 0, variant: "zeus", phase: "covering" });
        try {
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
    [navigate, pathname, router],
  );

  const api = useMemo(() => ({ go }), [go]);

  return (
    <LoadGateContext.Provider value={api}>
      {children}
      <LoadOverlay
        active={gate.active}
        percent={gate.percent}
        variant={gate.variant}
        phase={gate.phase}
      />
    </LoadGateContext.Provider>
  );
}

function LoadOverlay({
  active,
  percent,
  variant,
  phase,
}: {
  active: boolean;
  percent: number;
  variant: GateState["variant"];
  phase: GateState["phase"];
}) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (!active) {
      shownRef.current = 0;
      setShown(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const cur = shownRef.current;
      const next = cur + (percent - cur) * 0.11;
      const snapped = percent >= 100 && next > 99.2 ? 100 : next;
      shownRef.current = snapped;
      setShown(snapped);
      if (Math.abs(percent - snapped) > 0.15) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, percent]);

  if (!active) return null;
  if (variant === "zeus") {
    return (
      <div
        className={`load-gate is-sovereign-gate is-${phase}`}
        role="status"
        aria-live="polite"
        aria-busy={phase === "covering"}
        aria-label={phase === "revealing" ? "ゼウスの主権記録を開きました" : "ゼウスの主権記録を照合中"}
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
  const display = Math.max(0, Math.min(100, Math.round(shown)));
  return (
    <div
      className={`load-gate archive-route-dive is-diving${phase === "revealing" ? " is-arriving" : ""}`}
      role="progressbar"
      aria-live="polite"
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={display}
      aria-label={`フォームアーカイブとの間を移動中 ${display}%`}
    >
      <span className="archive-dive-space" aria-hidden="true" />
      <span className="cine-dive-tunnel" aria-hidden="true"><i /><i /></span>
      <span className="cine-dive-flash" aria-hidden="true" />
      <span className="cine-dive-status">
        <small>SAGA / REALM // FORM ARCHIVE</small>
        <span>{phase === "revealing" ? "境界光を通過中" : `記録宇宙へダイブ中 ${display}%`}</span>
      </span>
    </div>
  );
}

export function GuardedLink({
  to,
  hash,
  assets,
  className,
  style,
  beforeNavigate,
  children,
  ...rest
}: {
  to: string;
  hash?: string;
  assets: readonly string[];
  className?: string;
  style?: CSSProperties;
  beforeNavigate?: () => void;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  const { go } = useLoadGate();
  const href = hash ? `${to}#${hash}` : to;

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    beforeNavigate?.();
    void go({ to, hash, assets });
  };

  return (
    <a href={href} className={className} style={style} onClick={onClick} {...rest}>
      {children}
    </a>
  );
}

export function AppGuards() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useLayoutEffect(() => {
    if (!DETAIL_ROUTE.test(pathname)) return;
    const releaseScrollMotion = holdRouteScrollMotion();
    const timers: number[] = [];
    let firstFrame = 0;
    let finalFrame = 0;
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
      timers.splice(0).forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("pointerdown", noteInteraction, true);
      document.removeEventListener("touchstart", noteInteraction, true);
      document.removeEventListener("wheel", noteInteraction, true);
      document.removeEventListener("keydown", noteInteraction, true);
      releaseScrollMotion();
    };
    function noteInteraction(event: Event) {
      if (event instanceof KeyboardEvent && !SCROLL_KEYS.has(event.key)) return;
      userInteracted = true;
      stopResetting();
    }

    // The router snapshots the outgoing world's position before this layout
    // effect runs. Keep smooth scrolling disabled until its delayed restoration
    // has settled, otherwise the outgoing world visibly races toward the top.
    resetDetailScroll();
    document.addEventListener("pointerdown", noteInteraction, true);
    document.addEventListener("touchstart", noteInteraction, { capture: true, passive: true });
    document.addEventListener("wheel", noteInteraction, { capture: true, passive: true });
    document.addEventListener("keydown", noteInteraction, true);
    firstFrame = window.requestAnimationFrame(() => {
      resetDetailScroll();
      finalFrame = window.requestAnimationFrame(resetDetailScroll);
    });
    [90, 240].forEach((delay) => {
      timers.push(window.setTimeout(resetDetailScroll, delay));
    });
    timers.push(window.setTimeout(stopResetting, 360));

    return () => {
      // Cover browser-back and native history restoration as the detail route
      // unmounts, even when navigation did not originate from GuardedLink.
      const releaseExitMotion = holdRouteScrollMotion();
      window.setTimeout(releaseExitMotion, 360);
      stopResetting();
    };
  }, [pathname]);

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
