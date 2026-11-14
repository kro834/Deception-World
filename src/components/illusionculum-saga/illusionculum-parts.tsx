import { useState, type ReactNode } from "react";
import { withCallBreaks } from "@/components/far-from-saga/far-from-phrase";
import { splitLead } from "@/components/meta-unitas-saga/meta-unitas-parts";
import { prose } from "./illusionculum-phrase";

/* ILLUSIONCULUM SAGA — the explaining pieces (owner, 2026-10-24:
   「イリュージョンクルムもメタ・ウニタスやレクソナンスと同様、不要なセカンダリ
   ラベルや説明を避ける。レイアウトに説明させるようにUIリライトして。」), after
   Meta Unitas's: the owner's first sentence as the lead, the rest complete
   and in order behind one 「詳しく」; text-free diagrams of the mechanisms;
   the finishers' calls as step-through buttons. */

export function IcLead({ body, className = "" }: { body: readonly string[]; className?: string }) {
  const { lead, rest } = splitLead(body);
  return (
    <div className={`ics-lead-block ${className}`.trim()}>
      <p className="ics-lead-line">{prose(lead)}</p>
      {rest.length ? (
        <details className="ics-more">
          <summary>
            <span>詳しく</span>
            <i aria-hidden="true" />
          </summary>
          <div className="ics-more-body">
            {rest.map((paragraph, index) => (
              <p key={index}>{prose(paragraph)}</p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** A finisher's calls in their order: each call is its button, and the
 * calls up to the chosen one stay lit (the order numbers stay the list's). */
export function IcFinisherCalls({ name, calls }: { name: string; calls: readonly string[] }) {
  const [step, setStep] = useState(-1);
  return (
    <ol className="ics-calls ics-step-calls" aria-label={`${name} 発動音声`} data-step={step}>
      {calls.map((call, index) => (
        <li key={`${index}-${call}`} lang="en" data-lit={index <= step || undefined}>
          <button
            type="button"
            aria-pressed={index <= step}
            onClick={() => setStep(index === step ? index - 1 : index)}
          >
            <b>{withCallBreaks(call)}</b>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A mechanism, drawn (no words; decorative). */
export function IcDiagram({ name, className = "" }: { name: string; className?: string }) {
  const art = DIAGRAMS[name];
  if (!art) return null;
  return (
    <svg
      className={`ics-diagram ${className}`.trim()}
      viewBox="0 0 240 96"
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}

const d = (step: number) => ({ ["--d" as string]: step });

/** Precision Vernier scale & corner framing shared across flagship technical diagrams. */
const VERNIER_X = Array.from({ length: 21 }, (_, idx) => 20 + idx * 10);
const frameScale = (axisY?: number) => (
  <g className="ics-dg-grid">
    {/* 4-corner L-calipers */}
    <path
      className="ics-dg-tick"
      d="M6 14V4h10 M224 4h10v10 M6 82v10h10 M224 92h10V82"
    />
    {/* Top & bottom Vernier dimension ticks */}
    <path
      className="ics-dg-tick"
      d={VERNIER_X.map((x, idx) => {
        const len = idx % 5 === 0 ? 4.5 : 2;
        return `M${x} 4v${len}M${x} ${92 - len}v${len}`;
      }).join("")}
    />
    {axisY !== undefined ? <path d={`M12 ${axisY}H228`} className="ics-dg-axis" /> : null}
  </g>
);

/** Tactical aiming reticle ring with cardinal crosshairs and inner lock ring. */
const reticle = (cx: number, cy: number, r: number, step = 0, className = "") => (
  <g className={`ics-dg-reticle ics-dg-step ${className}`.trim()} style={d(step)}>
    <circle cx={cx} cy={cy} r={r} />
    <circle cx={cx} cy={cy} r={r * 0.56} className="ics-dg-echo" />
    <path
      d={`M${cx - r - 3.5} ${cy}h4.5M${cx + r - 1} ${cy}h4.5M${cx} ${cy - r - 3.5}v4.5M${cx} ${cy + r - 1}v4.5`}
    />
  </g>
);

/** A small figure: head, reactor core, and faceted body silhouette. */
const figure = (x: number, y: number, className?: string, step = 0) => (
  <g className={className} style={d(step)} transform={`translate(${x} ${y})`}>
    <circle cx={0} cy={-22} r={4.6} />
    <path d="M0 -15 7.5 -6 4.2 20 -4.2 20 -7.5 -6Z" />
    <path d="M-4 -6H4 M0 -10V6" className="ics-dg-echo" />
  </g>
);

// 1. ILLUSIONCULUM — 3 phase-staggered ghost projections + refractive shear plane + real body flank strike
const DIAGRAM_ILLUSIONCULUM = (
  <g>
    {frameScale(48)}
    {/* Refractive shear plane separating observed coordinates from real actuation */}
    <path d="M122 10L110 86 M128 10L116 86" className="ics-dg-prism" />
    {figure(34, 54, "ics-dg-ghost ics-dg-step", 0)}
    {figure(62, 54, "ics-dg-ghost ics-dg-step", 1)}
    {figure(90, 54, "ics-dg-ghost ics-dg-step", 2)}
    {/* False sightlines refracting at the shear plane */}
    <path d="M42 40H116 M98 48H194" className="ics-dg-seen" />
    {reticle(208, 46, 11, 3, "ics-dg-target")}
    {figure(148, 80, "ics-dg-real ics-dg-step", 3)}
    {/* Holographic multi-layer real strike arc */}
    <path d="M156 66Q190 70 202 54" className="ics-dg-echo ics-dg-step" style={d(4)} />
    <path d="M158 70Q196 72 204 55" className="ics-dg-route ics-dg-step" style={d(4)} />
    <path d="m198 57 6-2 0 6" className="ics-dg-route ics-dg-step" style={d(4)} />
  </g>
);

// 2. DREAM — Reality above, dream stratum below: Vernier depth scale, wave strata, dual boundary anchors & return vector
const DIAGRAM_DREAM = (
  <g>
    {frameScale()}
    <rect x={10} y={8} width={220} height={36} className="ics-dg-reality" />
    <rect x={10} y={44} width={220} height={44} className="ics-dg-dream" />
    {/* Standing wave interference strata in the dream layer */}
    <path
      d="M16 60Q70 52 120 60T224 60 M16 74Q70 82 120 74T224 74"
      className="ics-dg-echo"
    />
    <path d="M10 44H230" className="ics-dg-boundary" />
    {/* Depth gauge ticks along left rail */}
    <path d="M16 16h5M16 26h3M16 36h5M16 52h5M16 64h3M16 76h5" className="ics-dg-tick" />
    {/* Dive trajectory + holographic echo */}
    <path d="M44 24Q68 24 86 44T124 76" className="ics-dg-prism ics-dg-step" style={d(0)} />
    <path d="M48 24Q70 24 86 44T126 76" className="ics-dg-route ics-dg-step" style={d(0)} />
    {reticle(132, 76, 8.5, 1)}
    <circle cx={132} cy={76} r={3.8} className="ics-dg-core ics-dg-step" style={d(1)} />
    {/* Return trajectory held open by dual boundary anchors */}
    <path d="M140 73Q170 63 178 44T204 20" className="ics-dg-back ics-dg-step" style={d(2)} />
    <path d="m197 19 7 1-1 7" className="ics-dg-back ics-dg-step" style={d(2)} />
    <path d="M86 38l5 6-5 6-5-6Z M178 38l5 6-5 6-5-6Z" className="ics-dg-anchor" />
  </g>
);

// 3. RECEPTACLE / OVER CRYSTAL — Octagonal Over Crystal Core + concentric tactical rings + weighted multi-layer conduits
const DIAGRAM_RECEPTACLE = (
  <g>
    {frameScale(48)}
    {reticle(120, 48, 28, 0)}
    <circle cx={120} cy={48} r={20} className="ics-dg-prism" />
    {/* Faceted Over Crystal core */}
    <path d="M120 22 135 38 135 58 120 74 105 58 105 38Z" className="ics-dg-core" />
    <path d="M120 29 129 48 120 67 111 48Z" className="ics-dg-back" />
    {[
      [30, 18, 3.0],
      [24, 56, 1.6],
      [58, 84, 2.4],
      [182, 84, 1.4],
      [216, 56, 2.8],
      [210, 18, 2.0],
    ].map(([x, y, w], branch) => {
      const sx = x < 120 ? 105 : 135;
      const mx = x < 120 ? sx - 18 : sx + 18;
      return (
        <g key={branch} className="ics-dg-step" style={d(branch)}>
          <path
            d={`M${sx} 48H${mx}L${x} ${y}`}
            className="ics-dg-echo"
            style={{ strokeWidth: w + 1.4 }}
          />
          <path
            d={`M${sx} 48H${mx}L${x} ${y}`}
            className="ics-dg-route"
            style={{ strokeWidth: w }}
          />
          <circle cx={x} cy={y} r={4.2} className="ics-dg-node" />
          <circle cx={x} cy={y} r={1.6} className="ics-dg-core" />
        </g>
      );
    })}
  </g>
);

// 4. MORE / リアクター・モア — Dual deployed orbital units with petal fins, tactical reticles, and phase-jump arc
const DIAGRAM_MORE = (
  <g>
    {frameScale(50)}
    {figure(34, 62, "ics-dg-real")}
    {reticle(210, 48, 10.5, 0, "ics-dg-target")}
    {/* Blocked/decoy direct vector */}
    <path d="M46 50H194" className="ics-dg-seen" />
    <path d="M118 45l8 10m0-10-8 10" className="ics-dg-tick" />
    {/*Orbital Unit 1 (Upper-Left) with deployed petals */}
    <g className="ics-dg-step" style={d(0)}>
      <circle cx={90} cy={20} r={12.5} className="ics-dg-echo" />
      <circle cx={90} cy={20} r={8.5} className="ics-dg-orb" />
      <path d="M75 20h5M100 20h5M90 5v5M90 30v5" className="ics-dg-back" />
    </g>
    {/* Orbital Unit 2 (Lower-Right) with deployed petals */}
    <g className="ics-dg-step" style={d(1)}>
      <circle cx={172} cy={80} r={12.5} className="ics-dg-echo" />
      <circle cx={172} cy={80} r={8.5} className="ics-dg-orb" />
      <path d="M157 80h5M182 80h5M172 65v5M172 90v5" className="ics-dg-back" />
    </g>
    {/* Phase relay entry -> dimensional jump -> terminal flank strike */}
    <path d="M42 36Q58 18 78 19" className="ics-dg-route ics-dg-step" style={d(2)} />
    <path d="M98 26Q134 50 164 74" className="ics-dg-prism ics-dg-step" style={d(3)} />
    <path d="M96 28Q130 56 162 76" className="ics-dg-jump ics-dg-step" style={d(3)} />
    <path d="M182 77Q202 72 206 59" className="ics-dg-route ics-dg-step" style={d(4)} />
    <path d="m200 61 6-3 1 7" className="ics-dg-route ics-dg-step" style={d(4)} />
  </g>
);

// 5. DEUS / ASTRA-16 Ultra — KHAOS generation wave + KOSMOS calibration gate -> hexagonal nanite armor lattice
const DIAGRAM_DEUS = (
  <g>
    {frameScale(48)}
    {/* Left: KHAOS unformed nanite wave */}
    <path
      d="M18 32C34 14, 52 62, 72 36S96 24, 106 48 M18 64C36 82, 54 34, 74 60S96 72, 106 48"
      className="ics-dg-prism ics-dg-step"
      style={d(0)}
    />
    {/* Center: KOSMOS verification gate & tactical caliper */}
    <rect x={102} y={14} width={16} height={68} rx={2} className="ics-dg-reality" />
    <path d="M102 14v68M118 14v68M98 26h24M98 48h24M98 70h24" className="ics-dg-back ics-dg-step" style={d(1)} />
    {/* Right: Forged ASTRA-16 Ultra hexagonal nanite cells locking onto impact vector */}
    {[
      [148, 30],
      [148, 66],
      [176, 48],
      [204, 30],
      [204, 66],
    ].map(([cx, cy], idx) => (
      <g key={idx} className="ics-dg-step" style={d(2 + (idx % 3))}>
        <path
          d={`M${cx} ${cy - 14}l12 7v14l-12 7-12-7v-14Z`}
          className={idx === 2 ? "ics-dg-core" : "ics-dg-orb"}
        />
        <path d={`M118 48L${cx - 12} ${cy}`} className="ics-dg-echo" />
      </g>
    ))}
    {reticle(176, 48, 17, 4)}
  </g>
);

// 6. EXTREME / ILLUSIONCULUM NANO ARMOR — Transmission Area gap-compression gauge & zero-loss shock cone
const DIAGRAM_EXTREME = (
  <g>
    {frameScale(48)}
    {/* Inner undersuit rail & outer nano-armor plate with Transmission Area gap */}
    <path d="M26 16C44 32, 44 64, 26 80" className="ics-dg-back ics-dg-step" style={d(0)} />
    <path d="M54 14C74 32, 74 64, 54 82" className="ics-dg-echo ics-dg-step" style={d(1)} />
    <path d="M68 12C90 32, 90 64, 68 84" className="ics-dg-route ics-dg-step" style={d(1)} />
    {/* Gap compression calipers (Transmission Area) */}
    <path
      d="M40 28h28M44 48h38M40 68h28 M54 24v8M68 44v8M54 64v8"
      className="ics-dg-prism ics-dg-step"
      style={d(2)}
    />
    {/* Converging zero-loss output shock cone & target reticle */}
    <path
      d="M84 26L194 48L84 70 M108 31L194 48L108 65"
      className="ics-dg-echo ics-dg-step"
      style={d(3)}
    />
    <path d="M84 48H198" className="ics-dg-route ics-dg-step" style={{ ...d(3), strokeWidth: 2.6 }} />
    {reticle(204, 48, 13, 4)}
    <path d="M204 41l7 7-7 7-7-7Z" className="ics-dg-core ics-dg-step" style={d(4)} />
  </g>
);

// 7. GAUGE / オーバーレッグ・リアクター — Leg reactor silhouette, progressive calibration gauge, and contact burst reticle
const DIAGRAM_GAUGE = (
  <g>
    {frameScale()}
    {/* Technical leg-reactor cross-section */}
    <path d="M78 10h30l7 48 26 20v10H82l-5-34Z" className="ics-dg-leg" />
    <path d="M84 22h22M86 38h22M88 54h23" className="ics-dg-echo" />
    {/* Left output calibration bar gauge */}
    {[0, 1, 2, 3, 4].map((step) => (
      <rect
        key={`bar-${step}`}
        x={30}
        y={68 - step * 12}
        width={12 + step * 5}
        height={6}
        rx={1}
        className="ics-dg-orb ics-dg-step"
        style={d(step)}
      />
    ))}
    {/* Downward accelerating energy conduits inside leg */}
    {[0, 1, 2, 3].map((step) => (
      <path
        key={step}
        className="ics-dg-route ics-dg-step"
        style={{ ...d(step), strokeWidth: 1.1 + step * 0.8 }}
        d={`M${93 + step * 2.5} ${14 + step * 14}v11`}
      />
    ))}
    {/* Contact vector & multi-ring burst */}
    <path
      d="M142 82h50"
      className="ics-dg-route ics-dg-step"
      style={{ ...d(4), strokeWidth: 3.4 }}
    />
    {reticle(198, 80, 11, 5)}
    <circle cx={198} cy={80} r={4.5} className="ics-dg-core ics-dg-step" style={d(5)} />
  </g>
);

const DIAGRAMS: Record<string, ReactNode> = {
  ILLUSIONCULUM: DIAGRAM_ILLUSIONCULUM,
  DREAM: DIAGRAM_DREAM,
  RECEPTACLE: DIAGRAM_RECEPTACLE,
  "OVER CRYSTAL": DIAGRAM_RECEPTACLE,
  MORE: DIAGRAM_MORE,
  "リアクター・モア": DIAGRAM_MORE,
  DEUS: DIAGRAM_DEUS,
  "ASTRA-16 Ultra": DIAGRAM_DEUS,
  EXTREME: DIAGRAM_EXTREME,
  "ILLUSIONCULUM NANO ARMOR": DIAGRAM_EXTREME,
  GAUGE: DIAGRAM_GAUGE,
  "オーバーレッグ・リアクター": DIAGRAM_GAUGE,
};
