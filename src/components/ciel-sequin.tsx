import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { createCielSequinRenderer } from "@/lib/ciel-sequin-renderer";
import { guardCielSequinTouch } from "@/lib/ciel-sequin-touch-guard";
import styles from "@/styles-ciel-sequin.css?url";

type Renderer = ReturnType<typeof createCielSequinRenderer>;
type State = "loading" | "webgl" | "fallback" | "unavailable";

/** A new surface inside the burned document's existing modal, never a route. */
export default function CielSequin() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const face = useRef<"front" | "back">("front");
  const imageFit = useRef<"cover" | "contain">("cover");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [state, setState] = useState<State>("loading");
  const [plain, setPlain] = useState(false);
  const id = useId();

  useLayoutEffect(() => {
    if (!canvas.current || !fallback.current) return;
    // Guard the first painted frame, before the stylesheet/Three effect runs.
    const releases = [canvas.current, fallback.current].map(guardCielSequinTouch);
    return () => releases.forEach((release) => release());
  }, []);

  useEffect(() => {
    if (!root.current || !canvas.current || !fallback.current) return;
    const surface = root.current;
    const field = canvas.current;
    const backup = fallback.current;
    const html = document.documentElement;
    const media = matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)");
    const coarse = matchMedia("(pointer: coarse), (any-pointer: coarse)").matches;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = styles;
    document.head.append(link);
    let disposed = false;
    let generation = 0;
    let away = false;
    let preferences = "";
    const resize = () => {
      if (disposed) return;
      const rect = surface.getBoundingClientRect();
      renderer.current?.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    };
    const pause = () => renderer.current?.setPaused(document.hidden || away);
    const leave = () => {
      away = true;
      pause();
    };
    const shown = () => {
      away = false;
      resize();
      pause();
    };
    const prepare = async () => {
      const economy = html.dataset.worldEffects === "economy";
      const next = `${media.matches}/${economy}`;
      if (next === preferences) return;
      preferences = next;
      const token = ++generation;
      renderer.current?.dispose();
      renderer.current = null;
      setState("loading");
      try {
        const { createCielSequinRenderer } = await import("@/lib/ciel-sequin-renderer");
        if (disposed || token !== generation) return;
        renderer.current = createCielSequinRenderer({
          canvas: field,
          fallback: backup,
          imageUrl:
            coarse || innerWidth <= 768 || economy
              ? "/ciel-sequin-20261028/ciel-768.webp"
              : "/ciel-sequin-20261028/ciel-1536.webp",
          coarse,
          reducedMotion: media.matches,
          economy,
          onState: (value) => {
            if (!disposed && token === generation) {
              if (value === "unavailable") setPlain(face.current === "back");
              setState(value);
            }
          },
        });
        renderer.current.setFace(face.current);
        renderer.current.setImageFit(imageFit.current);
        resize();
        pause();
      } catch {
        if (!disposed && token === generation) {
          setPlain(face.current === "back");
          setState("unavailable");
        }
      }
    };
    const changed = () => void prepare();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(surface);
    const tierObserver = new MutationObserver(changed);
    tierObserver.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
    window.addEventListener("resize", resize, { passive: true });
    window.visualViewport?.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", shown);
    media.addEventListener("change", changed);
    void prepare();
    return () => {
      disposed = true;
      generation++;
      renderer.current?.dispose();
      renderer.current = null;
      observer?.disconnect();
      tierObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", shown);
      media.removeEventListener("change", changed);
      link.remove();
    };
  }, []);

  const show = (next: "front" | "back") => {
    face.current = next;
    renderer.current?.setFace(next);
    if (state === "unavailable") setPlain(next === "back");
  };
  const toggleFit = () => {
    const next = imageFit.current === "cover" ? "contain" : "cover";
    imageFit.current = next;
    setFit(next);
    renderer.current?.setImageFit(next);
  };
  return (
    <section
      ref={root}
      className="ciel-sequin"
      data-ciel-sequin=""
      data-renderer={state}
      data-image-fit={fit}
      aria-label="眠っているシエルのスパンコール"
      style={{ position: "absolute", inset: 0, zIndex: 5, background: "#000", color: "#e3ece6" }}
    >
      <p id={`${id}-help`} className="ciel-inferno-sr">
        なでる方向を変えると表裏が切り替わります。ボタンでも絵全体を表示できます。
      </p>
      <div className="ciel-sequin-surface" aria-describedby={`${id}-help`}>
        <canvas ref={canvas} aria-hidden="true" />
        <canvas ref={fallback} aria-hidden="true" />
        {state === "unavailable" && (
          <img
            src="/ciel-sequin-20261028/ciel-768.webp"
            srcSet="/ciel-sequin-20261028/ciel-768.webp 768w, /ciel-sequin-20261028/ciel-1536.webp 1086w"
            sizes="(max-aspect-ratio: 3/4) 100vw, 75dvh"
            width="1086"
            height="1448"
            decoding="async"
            alt="眠っているシエル"
            hidden={!plain}
            style={{ objectFit: fit }}
          />
        )}
      </div>
      <div className="ciel-sequin-controls">
        <p>なでる方向を変えて裏返す</p>
        <button type="button" onClick={() => show("front")}>
          表に戻す
        </button>
        <button type="button" onClick={() => show("back")}>
          絵を見る
        </button>
        <button type="button" onClick={toggleFit}>
          {fit === "cover" ? "画像全体" : "画面いっぱい"}
        </button>
      </div>
      <p className="ciel-inferno-sr" role="status">
        {state === "loading"
          ? "スパンコールを準備しています。"
          : state === "webgl"
            ? "スパンコールをなでて裏返せます。"
            : "眠っているシエルの絵を軽量表示で見られます。"}
      </p>
    </section>
  );
}
