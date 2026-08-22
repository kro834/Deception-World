import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { assetsWarmed, preloadAssets } from "@/lib/asset-loader";

type RiderCutInVariant = "leddic" | "argenome" | "over-zeztz";

type GateState = {
  active: boolean;
  percent: number;
  variant: "default" | "zeus" | "archive" | RiderCutInVariant;
  phase: "loading" | "covering" | "revealing";
};

type GoOptions = {
  to: string;
  hash?: string;
  assets: readonly string[];
};

type LoadGateApi = {
  go: (opts: GoOptions) => Promise<void>;
};

const LoadGateContext = createContext<LoadGateApi | null>(null);

const RIDER_CUT_IN_ROUTES = {
  "/riders/leddic": "leddic",
  "/riders/argenome": "argenome",
  "/riders/over-zeztz": "over-zeztz",
} as const satisfies Record<string, RiderCutInVariant>;

const RIDER_CUT_IN_TIMINGS: Record<RiderCutInVariant, { cover: number; reveal: number }> = {
  leddic: { cover: 230, reveal: 660 },
  argenome: { cover: 300, reveal: 620 },
  "over-zeztz": { cover: 340, reveal: 820 },
};

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

export function useLoadGate() {
  const ctx = useContext(LoadGateContext);
  if (!ctx) throw new Error("LoadGateProvider missing");
  return ctx;
}

export function LoadGateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [gate, setGate] = useState<GateState>({
    active: false,
    percent: 0,
    variant: "default",
    phase: "loading",
  });
  const busy = useRef(false);
  const transitionId = useRef(0);

  useEffect(() => {
    const cancelTransition = () => {
      transitionId.current += 1;
      busy.current = false;
      document.documentElement.removeAttribute("data-loading");
      setGate({ active: false, percent: 0, variant: "default", phase: "loading" });
    };
    document.addEventListener("deception-world:cancel-route-transition", cancelTransition);
    return () => document.removeEventListener("deception-world:cancel-route-transition", cancelTransition);
  }, []);

  const go = useCallback(
    async ({ to, hash, assets }: GoOptions) => {
      if (busy.current) return;
      const cutInVariant = RIDER_CUT_IN_ROUTES[to as keyof typeof RIDER_CUT_IN_ROUTES];
      const isArchive = to === "/form-archive";
      if (assetsWarmed(assets) && !cutInVariant && !isArchive) {
        await navigate({ to: to as never, hash });
        return;
      }
      busy.current = true;
      const requestId = ++transitionId.current;
      const isCurrent = () => transitionId.current === requestId;
      const variant = isArchive ? "archive" : to === "/managers/zeus" ? "zeus" : "default";

      if (isArchive) {
        const startedAt = performance.now();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

          // Only warm the lightweight React route. The archive document is loaded
          // once by its iframe; fetching the multi-megabyte standalone document
          // here as well could exhaust iOS WebKit's per-tab memory budget.
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
            setGate({ active: false, percent: 0, variant: "default", phase: "loading" });
            busy.current = false;
          }
        }
        return;
      }

      if (cutInVariant) {
        const startedAt = performance.now();
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const timings = reduceMotion ? { cover: 80, reveal: 140 } : RIDER_CUT_IN_TIMINGS[cutInVariant];
        document.documentElement.dataset.loading = "true";
        setGate({ active: true, percent: assetsWarmed(assets) ? 100 : 1, variant: cutInVariant, phase: "covering" });
        try {
          await Promise.all([
            preloadAssets(assets, (percent) => {
              setGate((state) => ({ ...state, percent: Math.max(1, percent) }));
            }),
            router.preloadRoute({ to: to as never }).catch(() => undefined),
          ]);
          const coverTimeLeft = Math.max(0, timings.cover - (performance.now() - startedAt));
          if (coverTimeLeft > 0) await wait(coverTimeLeft);
          if (!isCurrent()) return;
          setGate({ active: true, percent: 100, variant: cutInVariant, phase: "covering" });
          await navigate({ to: to as never, hash });
          if (!isCurrent()) return;
          setGate({ active: true, percent: 100, variant: cutInVariant, phase: "revealing" });
          await wait(timings.reveal);
        } finally {
          if (isCurrent()) {
            document.documentElement.removeAttribute("data-loading");
            setGate({ active: false, percent: 0, variant: "default", phase: "loading" });
            busy.current = false;
          }
        }
        return;
      }

      let overlayVisible = false;
      let overlayShownAt = 0;
      let latestPercent = 1;
      const showTimer = window.setTimeout(() => {
        if (!isCurrent()) return;
        overlayVisible = true;
        overlayShownAt = performance.now();
        document.documentElement.dataset.loading = "true";
        setGate({ active: true, percent: latestPercent, variant, phase: "loading" });
      }, variant === "zeus" ? 0 : 140);
      try {
        await Promise.all([
          preloadAssets(assets, (percent) => {
            latestPercent = Math.max(1, percent);
            if (overlayVisible) {
              setGate((s) => ({ ...s, percent: latestPercent, variant }));
            }
          }),
          router.preloadRoute({ to: to as never }).catch(() => undefined),
        ]);
      } finally {
        window.clearTimeout(showTimer);
        if (overlayVisible) {
          setGate({ active: true, percent: 100, variant, phase: "loading" });
          const minimumDuration = variant === "zeus" ? 860 : 120;
          const minimumVisibleTime = Math.max(0, minimumDuration - (performance.now() - overlayShownAt));
          if (minimumVisibleTime > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, minimumVisibleTime));
          }
        }
        if (isCurrent()) {
          try {
            await navigate({ to: to as never, hash });
          } finally {
            if (isCurrent()) {
              document.documentElement.removeAttribute("data-loading");
              setGate({ active: false, percent: 0, variant: "default", phase: "loading" });
              busy.current = false;
            }
          }
        }
      }
    },
    [navigate, router],
  );

  const api = useMemo(() => ({ go }), [go]);

  return (
    <LoadGateContext.Provider value={api}>
      {children}
      <LoadOverlay active={gate.active} percent={gate.percent} variant={gate.variant} phase={gate.phase} />
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
  const display = Math.max(0, Math.min(100, Math.round(shown)));
  const isZeus = variant === "zeus";
  const isArchive = variant === "archive";
  const isRiderCutIn = variant === "leddic" || variant === "argenome" || variant === "over-zeztz";

  if (isRiderCutIn) {
    return (
      <div
        className={`load-gate rider-route-cutin is-${variant}-cutin is-${phase}`}
        role="progressbar"
        aria-live="polite"
        aria-busy="true"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={display}
        aria-label={`${cutInLabel(variant)}の個別資料を読み込み中 ${display}%`}
      >
        <RiderRouteCutIn variant={variant} />
      </div>
    );
  }

  if (isArchive) {
    return (
      <div
        className={`load-gate archive-route-dive is-diving${phase === "revealing" ? " is-arriving" : ""}`}
        role="progressbar"
        aria-live="polite"
        aria-busy="true"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={display}
        aria-label={`フォームアーカイブへ移動中 ${display}%`}
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

  return (
    <div
      className={isZeus ? "load-gate is-sovereign-gate" : "load-gate"}
      role="progressbar"
      aria-live="polite"
      aria-busy="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={display}
      aria-label={`読み込み中 ${display}%`}
    >
      <div className="load-gate-inner">
        <span className="load-gate-mark" aria-hidden="true">
          <span className="load-gate-sovereign-orbit" />
          <i>{isZeus ? "I" : "DW"}</i>
        </span>
        <span className="load-gate-scan" aria-hidden="true" />
        {isZeus ? <small className="load-gate-kicker">SOVEREIGN ARCHIVE // RIKUEI I</small> : null}
        <p className="load-gate-label">{isZeus ? "主権記録を照合中" : "読み込み中"}</p>
        <b className="load-gate-percent">{display}%</b>
        <div className="load-gate-track" aria-hidden="true">
          <i style={{ transform: `scaleX(${display / 100})` }} />
        </div>
      </div>
    </div>
  );
}

function cutInLabel(variant: RiderCutInVariant) {
  if (variant === "leddic") return "レディック";
  if (variant === "argenome") return "アルゲノム";
  return "オーバーゼッツ";
}

function RiderRouteCutIn({ variant }: { variant: RiderCutInVariant }) {
  if (variant === "leddic") {
    return (
      <div className="rider-cutin-stage leddic-cutin-stage" aria-hidden="true">
        <span className="leddic-room-glow" />
        <span className="leddic-floor" />
        <span className="leddic-shoji is-left"><span className="leddic-paper" /><span className="leddic-kumiko" /><i /></span>
        <span className="leddic-shoji is-right"><span className="leddic-paper" /><span className="leddic-kumiko" /><i /></span>
        <span className="leddic-seam" />
        <span className="rider-cutin-caption"><small>GREEN VEIL // OPEN</small><b>LEDDIC</b></span>
      </div>
    );
  }

  if (variant === "argenome") {
    return (
      <div className="rider-cutin-stage argenome-cutin-stage" aria-hidden="true">
        <span className="argenome-ink" />
        <span className="argenome-cut-plane is-upper" />
        <span className="argenome-cut-plane is-lower" />
        <span className="argenome-slash is-echo-one" />
        <span className="argenome-slash is-echo-two" />
        <span className="argenome-slash is-main" />
        <span className="argenome-flare" />
        <span className="argenome-sparks">
          {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
        </span>
        <span className="rider-cutin-caption"><small>SCARLET TRACE // SEVER</small><b>ARGENOME</b></span>
      </div>
    );
  }

  return (
    <div className="rider-cutin-stage over-zeztz-cutin-stage" aria-hidden="true">
      <span className="over-zeztz-crack" />
      <span className="over-zeztz-strike"><i /><i /></span>
      <span className="over-zeztz-impact" />
      <span className="over-zeztz-shards">
        {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
      </span>
      <span className="over-zeztz-debris">
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </span>
      <span className="rider-cutin-caption"><small>BREAK LIMIT // COLLAPSE</small><b>OVER-ZEZTZ</b></span>
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
