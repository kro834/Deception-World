import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useDreamGpuTier, type DreamGpuTier } from "@/lib/dream-gpu/dream-gpu-tier";

type Engine = typeof import("@/lib/dream-gpu/dream-gpu-engine.js");
// The engine is fetched only once a GPU tier is confirmed.
const loadEngine = (): Promise<Engine> => import("@/lib/dream-gpu/dream-gpu-engine.js");

type Gui = typeof import("@/lib/dream-gpu/dream-gui-physics.js");
const loadGui = (): Promise<Gui> => import("@/lib/dream-gpu/dream-gui-physics.js");

const deskRect = () =>
  document.querySelector(".dream-programme-desk")?.getBoundingClientRect() ?? null;

/** Tier A/B: the lamplight layer across the viewport (never takes input). */
function DreamGpuOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop: (() => void) | null = null;
    let alive = true;
    loadEngine()
      .then((engine) => engine.startLamplightOverlay(canvas, { getDeskRect: deskRect }))
      .then((dispose) => {
        if (alive) {
          stop = dispose;
          setReady(true);
        } else dispose();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop?.();
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="dream-gpu-overlay"
      data-ready={ready ? "true" : "false"}
      aria-hidden="true"
    />
  );
}

/** Tier A: the desk lives inside a layoutsubtree canvas and is redrawn by shaders. */
type DeskBox = { width: number; left: number; top: number; bottom: number };

/** Where the desk sits in normal flow (its rules include `main > .desk` child selectors). */
function measureDesk(): DeskBox | null {
  const element = document.querySelector<HTMLElement>(".dream-programme-desk");
  const parent = element?.parentElement;
  if (!element || !parent) return null;
  const style = getComputedStyle(element);
  return {
    width: element.getBoundingClientRect().width,
    left: element.getBoundingClientRect().left - parent.getBoundingClientRect().left,
    top: parseFloat(style.marginTop) || 0,
    bottom: parseFloat(style.marginBottom) || 0,
  };
}

function DreamGpuDeskCanvas({
  children,
  box,
  onFail,
}: {
  children: ReactNode;
  box: DeskBox;
  onFail: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    const element = canvas?.firstElementChild as HTMLElement | null;
    if (!canvas || !element) return;
    // The canvas takes the height of the live desk it carries.
    // Inside the canvas the desk is laid out at the canvas origin with its flow width.
    element.style.setProperty("width", `${box.width}px`, "important");
    element.style.setProperty("margin", "0", "important");
    const fit = () => {
      canvas.style.height = `${element.offsetHeight}px`;
    };
    const sizer = new ResizeObserver(fit);
    sizer.observe(element);
    fit();
    let stop: (() => void) | null = null;
    let alive = true;
    loadEngine()
      .then((engine) => engine.startDeskStage(canvas, element, { onFail }))
      .then((dispose) => {
        if (alive) {
          stop = dispose;
          setReady(true);
        } else dispose();
      })
      .catch(() => onFail());
    return () => {
      alive = false;
      sizer.disconnect();
      stop?.();
      element.style.removeProperty("width");
      element.style.removeProperty("margin");
    };
  }, [onFail, box.width]);
  return (
    <canvas
      ref={ref}
      className="dream-gpu-desk"
      style={
        {
          width: `${box.width}px`,
          marginLeft: `${box.left}px`,
          marginTop: `${box.top}px`,
          marginBottom: `${box.bottom}px`,
        } as CSSProperties
      }
      data-ready={ready ? "true" : "false"}
      {...{ layoutsubtree: "" }}
    >
      {children}
    </canvas>
  );
}

/**
 * Wraps the programme desk. Tier C (and the server render) shows it exactly as
 * before; Tier B adds the overlay; Tier A also moves the desk into an
 * HTML-in-Canvas stage. Any failure falls back a tier without blanking the desk.
 */
export function DreamGpuStage({ children }: { children: ReactNode }) {
  const detected = useDreamGpuTier();
  const [failedA, setFailedA] = useState(false);
  const failA = useRef(() => setFailedA(true)).current;
  const tier: DreamGpuTier = detected === "A" && failedA ? "B" : detected;
  // Tier A: measure the desk in normal flow first, then carry it into the canvas.
  // A viewport resize puts it back in flow for one frame to measure again.
  const [box, setBox] = useState<DeskBox | null>(null);
  useLayoutEffect(() => {
    if (tier !== "A" || box) return;
    setBox(measureDesk());
  }, [tier, box]);
  useEffect(() => {
    if (tier !== "A") return;
    let timer = 0;
    let lastWidth = window.innerWidth;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        setBox(null);
      }, 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [tier]);
  // Tier A/B: the desk's controls move on springs (CSS transforms only).
  useEffect(() => {
    if (tier === "C") return;
    let stop: (() => void) | null = null;
    let alive = true;
    loadGui()
      .then((gui) => {
        if (alive) stop = gui.startDreamGui({ tier });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop?.();
    };
  }, [tier]);
  useEffect(() => {
    document.documentElement.dataset.dreamGpu = tier;
    return () => {
      delete document.documentElement.dataset.dreamGpu;
    };
  }, [tier]);
  return (
    <>
      {tier === "A" && box ? (
        <DreamGpuDeskCanvas box={box} onFail={failA}>
          {children}
        </DreamGpuDeskCanvas>
      ) : (
        children
      )}
      {tier !== "C" ? <DreamGpuOverlay /> : null}
    </>
  );
}
