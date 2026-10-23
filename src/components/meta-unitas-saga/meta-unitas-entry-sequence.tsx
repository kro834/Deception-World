import { useEffect, useRef, type CSSProperties } from "react";
import { META_UNITAS_CALL_LINES } from "@/lib/meta-unitas-assembly";
import { META_UNITAS_ENTRY_TIMINGS } from "@/lib/meta-unitas-entry-gate";
import { metaUnitasPictures } from "@/lib/meta-unitas-entry-pictures";
import { createPartitionScene } from "@/lib/meta-unitas-partition";
import { META_UNITAS_SUIT_SIZE } from "@/lib/meta-unitas-suit";
import { META_UNITAS_MIDDLE_DONE, callsAt, easeInOut } from "@/lib/meta-unitas-timeline";
import { CallLine } from "./meta-unitas-parts";

/* META UNITAS SAGA — the entry transformation (2026-10-23), played by the
   route transition screen (load-gate.tsx) under its cover. The page's own
   partition scene (src/lib/meta-unitas-partition.ts) on a clock instead of
   a scroll: the wearer, the halo and its axis, the single glowing whole,
   the boundaries, the independent plates settling into armour, the bits on
   their orbits, the tail, and the seal on META UNITAS！ — ミドル complete as
   the cover lifts; the calls light in turn beneath. The full tier only (the
   gate gives the still tiers no call). Styles are inline: the gate is
   global and this page's sheet is not loaded on the departure page. */

const LAYER: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2,
  overflow: "hidden",
  background:
    "radial-gradient(44% 56% at 50% 52%, rgb(55 198 192 / 14%), transparent 70%), linear-gradient(180deg, #02070a, #03080c 70%, #020507)",
  transition: "opacity 0.5s ease",
  pointerEvents: "none",
};
const CANVAS: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
const CALLS: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "max(28px, env(safe-area-inset-bottom))",
  transform: "translateX(-50%)",
  width: "min(92vw, 720px)",
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "6px 18px",
  color: "rgb(233 239 242 / 30%)",
  fontFamily: '"Rexonance Forge", "Helvetica Neue", Arial, sans-serif',
  fontSize: "clamp(12px, 1.4vw, 16px)",
  fontWeight: 650,
  letterSpacing: "0.05em",
};

export function MetaUnitasEntrySequence({
  phase,
}: {
  phase: "covering" | "revealing";
  tier?: "full" | "calm" | "reduced";
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !layer || !context) return;
    let raf = 0;
    let disposed = false;
    const lines = [...layer.querySelectorAll<HTMLElement>("li")];
    const chips = [...layer.querySelectorAll<HTMLElement>(".mus-call-chip")];
    void metaUnitasPictures().then((pictures) => {
      if (disposed || !pictures) return;
      const scene = createPartitionScene(context, pictures);
      const started = performance.now();
      // The build runs to ミドル's completion a little before the cover ends.
      const span = META_UNITAS_ENTRY_TIMINGS.cover - 260;
      const frame = (now: number) => {
        raf = 0;
        if (disposed) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = window.innerWidth;
        const height = window.innerHeight;
        const w = Math.round(width * ratio);
        const h = Math.round(height * ratio);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const t = Math.min(1, (now - started) / span);
        const p = easeInOut(t) * META_UNITAS_MIDDLE_DONE + (t >= 1 ? 0.04 : 0);
        const figureH = Math.min(
          height * 0.74,
          (width * 0.92 * META_UNITAS_SUIT_SIZE.height) / META_UNITAS_SUIT_SIZE.width,
        );
        const scale = (figureH / META_UNITAS_SUIT_SIZE.height) * ratio;
        const figureW = META_UNITAS_SUIT_SIZE.width * (figureH / META_UNITAS_SUIT_SIZE.height);
        scene.draw(p, "middle", {
          x: ((width - figureW) / 2) * ratio,
          y: height * 0.08 * ratio,
          scale,
        });
        const { line, chant } = callsAt(p);
        lines.forEach((element, index) => {
          element.style.color =
            index < line ? "rgb(233 239 242 / 74%)" : index === line ? "#fff" : "";
          element.style.textShadow = index === line ? "0 0 18px rgb(255 154 74 / 46%)" : "";
        });
        chips.forEach((chip, index) => {
          chip.style.color = index < chant ? "inherit" : "rgb(233 239 242 / 30%)";
        });
        if (t < 1) raf = window.requestAnimationFrame(frame);
      };
      raf = window.requestAnimationFrame(frame);
    });
    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={layerRef}
      aria-hidden="true"
      style={{ ...LAYER, opacity: phase === "revealing" ? 0 : 1 }}
    >
      <canvas ref={canvasRef} style={CANVAS} />
      <ol style={CALLS}>
        {META_UNITAS_CALL_LINES.map((units, index) => (
          <li key={index} style={{ transition: "color 0.25s ease" }}>
            <CallLine units={units} />
          </li>
        ))}
      </ol>
    </div>
  );
}
