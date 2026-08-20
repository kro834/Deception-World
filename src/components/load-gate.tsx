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

type GateState = {
  active: boolean;
  percent: number;
};

type GoOptions = {
  to: string;
  hash?: string;
  assets: readonly string[];
  always?: boolean;
};

type LoadGateApi = {
  go: (opts: GoOptions) => Promise<void>;
};

const LoadGateContext = createContext<LoadGateApi | null>(null);

export function useLoadGate() {
  const ctx = useContext(LoadGateContext);
  if (!ctx) throw new Error("LoadGateProvider missing");
  return ctx;
}

export function LoadGateProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [gate, setGate] = useState<GateState>({ active: false, percent: 0 });
  const busy = useRef(false);

  const go = useCallback(
    async ({ to, hash, assets, always = false }: GoOptions) => {
      if (busy.current) return;
      if (!always && assetsWarmed(assets)) {
        await navigate({ to: to as never, hash });
        return;
      }
      busy.current = true;
      setGate({ active: true, percent: 1 });
      document.documentElement.dataset.loading = "true";
      const started = performance.now();
      try {
        await Promise.all([
          preloadAssets(assets, (percent) => {
            setGate((s) => ({ ...s, percent: Math.max(1, percent) }));
          }),
          router.preloadRoute({ to: to as never }).catch(() => undefined),
        ]);
      } finally {
        setGate({ active: true, percent: 100 });
        const wait = Math.max(0, 680 - (performance.now() - started));
        await new Promise((r) => window.setTimeout(r, wait));
        await navigate({ to: to as never, hash });
        await new Promise((r) => window.setTimeout(r, 220));
        document.documentElement.removeAttribute("data-loading");
        setGate({ active: false, percent: 0 });
        busy.current = false;
      }
    },
    [navigate, router],
  );

  const api = useMemo(() => ({ go }), [go]);

  return (
    <LoadGateContext.Provider value={api}>
      {children}
      <LoadOverlay active={gate.active} percent={gate.percent} />
    </LoadGateContext.Provider>
  );
}

function LoadOverlay({ active, percent }: { active: boolean; percent: number }) {
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

  return (
    <div
      className="load-gate"
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
          <i>DW</i>
        </span>
        <span className="load-gate-scan" aria-hidden="true" />
        <p className="load-gate-label">読み込み中</p>
        <b className="load-gate-percent">{display}%</b>
        <div className="load-gate-track" aria-hidden="true">
          <i style={{ transform: `scaleX(${display / 100})` }} />
        </div>
      </div>
    </div>
  );
}

export function GuardedLink({
  to,
  hash,
  assets,
  className,
  style,
  children,
  always,
  ...rest
}: {
  to: string;
  hash?: string;
  assets: readonly string[];
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  always?: boolean;
  "aria-label"?: string;
}) {
  const { go } = useLoadGate();
  const href = hash ? `${to}#${hash}` : to;

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      window.location.assign(href);
      return;
    }
    void go({ to, hash, assets, always });
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
    const lockZoom = (e: Event) => e.preventDefault();
    const lockPinchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const lockCtrlWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener("gesturestart", lockZoom, { passive: false });
    document.addEventListener("gesturechange", lockZoom, { passive: false });
    document.addEventListener("gestureend", lockZoom, { passive: false });
    document.addEventListener("touchmove", lockPinchMove, { passive: false });
    window.addEventListener("wheel", lockCtrlWheel, { passive: false });
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", blockAlways);
      document.removeEventListener("gesturestart", lockZoom);
      document.removeEventListener("gesturechange", lockZoom);
      document.removeEventListener("gestureend", lockZoom);
      document.removeEventListener("touchmove", lockPinchMove);
      window.removeEventListener("wheel", lockCtrlWheel);
    };
  }, []);
  return null;
}
