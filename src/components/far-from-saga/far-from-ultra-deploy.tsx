import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { FAR_FROM_SAGA_ULTRA_BASE } from "@/lib/far-from-saga-artwork";
import {
  FAR_FROM_DEPLOY_PAD,
  FAR_FROM_DEPLOY_TITLE_PAD,
  FAR_FROM_DEPLOY_UNITS_PER_PX,
  FAR_FROM_ULTRA_DEPLOY_CROWN,
  FAR_FROM_ULTRA_DEPLOY_CROWN_LABEL,
  FAR_FROM_ULTRA_DEPLOY_PANELS,
  FAR_FROM_ULTRA_DEPLOY_RINGS,
  deployType,
  labelWidth,
  panelStrips,
  panelTitle,
  type FarFromDeployPanel,
  type FarFromDeployType,
} from "@/lib/far-from-ultra-deploy";

/* FAR FROM SAGA — ウルトラ's auxiliary interfaces, deployed over the stage
   panel's picture (owner, 2026-10-23: 「スクロール後にウルトラに切り替えても、
   サイバーなパネルは後から出現する様にして下さい。」).

   The panel shows ウルトラ before its interfaces (FAR_FROM_SAGA_ULTRA_BASE)
   and this layer deploys them as crisp vector panels where the owner's
   painted ones are (beside both forearms, the wrist rings, the halo's
   gauge), in the #ultra sequence's language (src/lib/far-from-ultra-scene.ts):
   emitter → beam and projection cone → wireframe trace → hex fill sweep →
   glitch and scan → typed read-outs → settle, with data tethers to the arms.

   SVG and CSS only, no clock of its own: the layer mounts with the ウルトラ
   figure (the figure is keyed by form, so every switch back to ウルトラ mounts
   a fresh one) and waits, every part hidden, until the figure is on screen;
   then it sets data-run and the sheet plays the deploy once (~2 s) from
   --ffd-delay. It shares the picture's box exactly: the sheet sizes it as
   the image's object-fit: cover box (50% 5%) from the figure's container
   units, so every breakpoint keeps the panels on the arms. Mounted only
   where motion is allowed; the calm tiers show the painted ウルトラ instead.

   Type, legible at every width (polish sweep, 2026-10-23): the layer is
   drawn in the picture's 1083 px units, which a phone shows at about a
   third of a CSS pixel each, so a 10-unit read-out was 3.6 px tall. The
   layer measures its own width once on mount (and on resize) and sets its
   titles and the crown's label in units that come to 9 px and 12 px on
   screen at least; a title that would then run past its panel reads its
   short code (OS 6.1, KHAOS, KOSMOS), a size down to 7 px where the head
   is narrower still, and is left off rather than squeezed illegible where
   not even that fits. The read-out rows under the glyphs
   are drawn as data strips — one per line of the record, as wide as its
   words — rather than text no one could read. Read-outs are the record's
   own terms. */

const VIEW_W = FAR_FROM_SAGA_ULTRA_BASE.width;
const VIEW_H = FAR_FROM_SAGA_ULTRA_BASE.height;
const PAD = FAR_FROM_DEPLOY_PAD;
const TITLE_PAD = FAR_FROM_DEPLOY_TITLE_PAD;

const v = (props: Record<string, string | number>) => props as CSSProperties;

/** Picture units per CSS px, measured from the layer's own box (before
 * paint on mount, then on every resize). */
function useUnitsPerPx(ref: { current: SVGSVGElement | null }) {
  const [unitsPerPx, setUnitsPerPx] = useState(FAR_FROM_DEPLOY_UNITS_PER_PX);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      if (width <= 0) return;
      const next = VIEW_W / width;
      setUnitsPerPx((current) => (Math.abs(current - next) / current < 0.01 ? current : next));
    };
    measure();
    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [ref]);
  return unitsPerPx;
}

function Typed({
  text,
  x,
  y,
  start,
  className,
  size,
}: {
  text: string;
  x: number;
  y: number;
  start: number;
  className: string;
  size: number;
}) {
  return (
    <text className={className} x={x} y={y} style={v({ fontSize: `${size}px` })}>
      {Array.from(text).map((char, index) => (
        <tspan key={index} style={v({ "--ffd-c": start + index * 26 })}>
          {char}
        </tspan>
      ))}
    </text>
  );
}

function PanelContent({ panel, body }: { panel: FarFromDeployPanel; body: number }) {
  const { x, w } = panel;
  switch (panel.kind) {
    case "dial": {
      const cx = x + w / 2;
      const cy = body + 34;
      return (
        <g className="ffd-glyph">
          {/* Precision optical reticle: coordinate grid & concentric targeting rings */}
          <line className="ffd-glyph-dim" x1={cx - 32} y1={cy} x2={cx + 32} y2={cy} strokeDasharray="2,3" />
          <line className="ffd-glyph-dim" x1={cx} y1={cy - 32} x2={cx} y2={cy + 32} strokeDasharray="2,3" />
          <circle cx={cx} cy={cy} r={30} className="ffd-glyph-dim" strokeDasharray="1,4" />
          <circle cx={cx} cy={cy} r={26} />
          <circle cx={cx} cy={cy} r={18} className="ffd-glyph-dim" />
          <circle cx={cx} cy={cy} r={6} className="ffd-glyph-dim" />
          <circle cx={cx} cy={cy} r={2} />
          {/* Quadrant vernier notches */}
          <line className="ffd-glyph-dim" x1={cx - 26} y1={cy - 4} x2={cx - 26} y2={cy + 4} />
          <line className="ffd-glyph-dim" x1={cx + 26} y1={cy - 4} x2={cx + 26} y2={cy + 4} />
          <line className="ffd-glyph-dim" x1={cx - 4} y1={cy - 26} x2={cx + 4} y2={cy - 26} />
          <line className="ffd-glyph-dim" x1={cx - 4} y1={cy + 26} x2={cx + 4} y2={cy + 26} />
          <path
            className="ffd-glyph-arc"
            pathLength={1}
            d={`M ${cx - 26} ${cy} A 26 26 0 1 1 ${cx + 18} ${cy + 18.7}`}
          />
          <path d={`M ${cx} ${cy} L ${cx + 14} ${cy - 14}`} />
          {/* Vector alignment ticks */}
          <line x1={cx + 14} y1={cy - 14} x2={cx + 18} y2={cy - 14} />
        </g>
      );
    }
    case "bars":
      return (
        <g className="ffd-glyph">
          {/* Multi-wavelength frequency matrix: reference grids & dB thresholds */}
          {[0.25, 0.5, 0.75, 1.0].map((ratio, gIdx) => (
            <line
              key={`grid-${gIdx}`}
              className="ffd-glyph-dim"
              x1={x + PAD}
              y1={body + 58 - 58 * ratio}
              x2={x + w - PAD}
              y2={body + 58 - 58 * ratio}
              strokeDasharray="1,3"
            />
          ))}
          {[0.62, 0.86, 0.48, 0.94, 0.7].map((level, index) => {
            const bw = (w - PAD * 2 - 4 * 6) / 5;
            const bx = x + PAD + index * (bw + 6);
            const full = 58;
            const barHeight = full * level;
            const barY = body + full - barHeight;
            return (
              <g key={index}>
                {/* Background channel rail */}
                <rect
                  className="ffd-glyph-dim"
                  x={bx}
                  y={body}
                  width={bw}
                  height={full}
                  opacity={0.18}
                />
                {/* Active frequency spectral column */}
                <rect
                  className="ffd-bar"
                  x={bx}
                  y={barY}
                  width={bw}
                  height={barHeight}
                  style={v({ "--ffd-c": 640 + index * 50 })}
                />
                {/* Peak hold indicator */}
                <line
                  x1={bx - 0.5}
                  y1={barY - 2}
                  x2={bx + bw + 0.5}
                  y2={barY - 2}
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </g>
      );
    case "graph":
      return (
        <g className="ffd-glyph">
          {/* Quantum waveform oscilloscope: horizontal timeline, grid coordinates & modulation harmonics */}
          <line className="ffd-glyph-dim" x1={x + PAD} y1={body + 18} x2={x + w - PAD} y2={body + 18} strokeDasharray="2,3" />
          <line className="ffd-glyph-dim" x1={x + PAD} y1={body + 6} x2={x + w - PAD} y2={body + 6} strokeDasharray="1,4" />
          <line className="ffd-glyph-dim" x1={x + PAD} y1={body + 30} x2={x + w - PAD} y2={body + 30} strokeDasharray="1,4" />
          {/* Sub-harmonic interference carrier */}
          <path
            className="ffd-glyph-dim"
            d={`M ${x + PAD} ${body + 20} Q ${x + 25} ${body + 8}, ${x + 50} ${body + 20} T ${x + 95} ${body + 20} T ${x + w - PAD} ${body + 14}`}
            fill="none"
          />
          {/* Primary quantum wave trace */}
          <path
            className="ffd-glyph-arc"
            pathLength={1}
            d={`M ${x + PAD} ${body + 26} L ${x + 30} ${body + 14} L ${x + 50} ${body + 22} L ${x + 70} ${body + 4} L ${x + 92} ${body + 12} L ${x + w - PAD} ${body + 2}`}
          />
          {/* Peak nodal measurement coordinates */}
          <circle cx={x + 30} cy={body + 14} r={1.5} />
          <circle cx={x + 70} cy={body + 4} r={1.5} />
          <circle cx={x + w - PAD} cy={body + 2} r={2} />
        </g>
      );
    default:
      return (
        <g className="ffd-glyph">
          {/* High-density status bus matrix & binary quantum state blocks */}
          <rect className="ffd-glyph-dim" x={x + PAD} y={body + 2} width={w - PAD * 2} height={3} />
          <rect className="ffd-glyph-dim" x={x + PAD} y={body + 8} width={(w - PAD * 2) * 0.72} height={2.5} />
          <rect className="ffd-glyph-dim" x={x + PAD} y={body + 13} width={(w - PAD * 2) * 0.44} height={2} />
          <circle cx={x + w - PAD - 6} cy={body + 9} r={2} className="ffd-glyph-dim" />
          <circle cx={x + w - PAD - 13} cy={body + 9} r={2} />
        </g>
      );
  }
}

function Panel({ panel, hex, type }: { panel: FarFromDeployPanel; hex: string; type: FarFromDeployType }) {
  const { x, y, w, h } = panel;
  const edgeX = panel.inner === "right" ? x + w : x;
  const [ex, ey] = panel.emitter;
  const cone = `${ex},${ey} ${edgeX},${y} ${edgeX},${y + h}`;
  const beamY = y + h / 2;
  const body = y + type.head + 6;
  const title = panelTitle(panel, type);
  const strips = panelStrips(panel, type);
  return (
    <g
      className="ffd-panel"
      data-panel={panel.id}
      data-inner={panel.inner}
      style={v({ "--ffd-o": `${panel.at}ms` })}
    >
      <polygon className="ffd-cone" points={cone} />
      <line className="ffd-beam" pathLength={1} x1={ex} y1={ey} x2={edgeX} y2={beamY} />
      <polyline
        className="ffd-tether"
        pathLength={1}
        points={[[edgeX, beamY + 20], ...panel.tether].map((point) => point.join(",")).join(" ")}
      />
      <path className="ffd-emitter" d={`M ${ex} ${ey - 7} L ${ex + 7} ${ey} L ${ex} ${ey + 7} L ${ex - 7} ${ey} Z`} />
      <g className="ffd-settle">
        <g className="ffd-glitch">
          <rect className="ffd-glass" x={x} y={y} width={w} height={h} />
          <rect className="ffd-hex" x={x} y={y} width={w} height={h} fill={`url(#${hex})`} />
          <rect className="ffd-head" x={x} y={y} width={w} height={type.head} />
          <rect className="ffd-wire" pathLength={1} x={x} y={y} width={w} height={h} />
          <path
            className="ffd-corners"
            d={`M ${x - 4} ${y + 12} V ${y - 4} H ${x + 12} M ${x + w - 12} ${y - 4} H ${x + w + 4} V ${y + 12} M ${x + w + 4} ${y + h - 12} V ${y + h + 4} H ${x + w - 12} M ${x + 12} ${y + h + 4} H ${x - 4} V ${y + h - 12}`}
          />
          {title ? (
            <Typed
              className="ffd-title"
              text={title.text}
              size={title.size}
              x={x + TITLE_PAD}
              y={Math.round(y + type.head / 2 + title.size * 0.36)}
              start={780}
            />
          ) : null}
          <PanelContent panel={panel} body={body} />
          {strips.map((strip, index) => (
            <rect
              key={strip.line}
              className="ffd-strip"
              data-line={strip.line}
              x={strip.x}
              y={strip.y}
              width={strip.width}
              height={strip.height}
              style={v({ "--ffd-c": 900 + index * 140 })}
            />
          ))}
          <rect
            className="ffd-scan"
            x={x}
            y={y}
            width={w}
            height={3}
            style={v({ "--ffd-h": `${h}px` })}
          />
        </g>
      </g>
    </g>
  );
}

function Ring({ ring }: { ring: (typeof FAR_FROM_ULTRA_DEPLOY_RINGS)[number] }) {
  const { cx, cy, rx, ry } = ring;
  // The back half passes behind the wrist (dim), the front half before it.
  const back = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy}`;
  const front = `M ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy}`;
  const outer = `M ${cx - rx - 12} ${cy + 8} A ${rx + 12} ${ry + 5} 0 0 0 ${cx + rx + 12} ${cy + 8}`;
  return (
    <g className="ffd-ring" data-ring={ring.id} style={v({ "--ffd-o": `${ring.at}ms` })}>
      <path className="ffd-ring-back" pathLength={1} d={back} />
      <path className="ffd-ring-front" pathLength={1} d={front} />
      <path className="ffd-ring-ticks" d={outer} />
    </g>
  );
}

function Crown({ type }: { type: FarFromDeployType }) {
  const { cx, cy, rx, ry, at } = FAR_FROM_ULTRA_DEPLOY_CROWN;
  const arc = `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx * 0.94} ${cy + ry * 0.34}`;
  const labelX = cx + rx + 30;
  // The lead runs under the whole label, and stops short of the picture's edge.
  const leadEnd = Math.min(VIEW_W - 12, Math.round(labelX + labelWidth(FAR_FROM_ULTRA_DEPLOY_CROWN_LABEL, type.crown) + 10));
  return (
    <g className="ffd-crown" style={v({ "--ffd-o": `${at}ms` })}>
      <ellipse className="ffd-crown-ticks" cx={cx} cy={cy} rx={rx + 12} ry={ry + 4} />
      <path className="ffd-crown-arc" pathLength={1} d={arc} />
      <path
        className="ffd-crown-lead"
        pathLength={1}
        d={`M ${cx + rx + 4} ${cy + 4} L ${cx + rx + 26} ${cy + 26} H ${leadEnd}`}
      />
      <Typed
        className="ffd-crown-label"
        text={FAR_FROM_ULTRA_DEPLOY_CROWN_LABEL}
        size={type.crown}
        x={labelX}
        y={cy + 20}
        start={260}
      />
    </g>
  );
}

/** The deploy layer over ウルトラ's base picture (decorative). */
export function FarFromInterfaceDeploy({ delayMs }: { delayMs: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [run, setRun] = useState(false);
  const hex = `ffd-hex-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const type = deployType(useUnitsPerPx(ref));

  // Wait, hidden, until the figure is on screen: a switch made elsewhere
  // (the selector after the runway, a deep link) deploys when it is seen.
  useEffect(() => {
    const figure = ref.current?.closest("figure");
    if (!figure) return;
    if (!("IntersectionObserver" in window)) {
      setRun(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setRun(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      className="ffs-ultra-deploy"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden="true"
      focusable="false"
      data-run={run ? "true" : undefined}
      style={v({ "--ffd-delay": `${delayMs}ms` })}
    >
      <defs>
        <pattern id={hex} width="18" height="31.18" patternUnits="userSpaceOnUse">
          <path d="M9 0 18 5.2v10.4L9 20.8 0 15.6V5.2Zm0 20.8V31.18" />
        </pattern>
      </defs>
      {FAR_FROM_ULTRA_DEPLOY_RINGS.map((ring) => (
        <Ring key={ring.id} ring={ring} />
      ))}
      {FAR_FROM_ULTRA_DEPLOY_PANELS.map((panel) => (
        <Panel key={panel.id} panel={panel} hex={hex} type={type} />
      ))}
      <Crown type={type} />
    </svg>
  );
}
