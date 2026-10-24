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

/** A small figure: head and body as one mark. */
const figure = (x: number, y: number, className?: string, step = 0) => (
  <g className={className} style={d(step)} transform={`translate(${x} ${y})`}>
    <circle cx={0} cy={-22} r={5} />
    <path d="M0 -15 7 -6 4 20 -4 20 -7 -6Z" />
  </g>
);

const DIAGRAMS: Record<string, ReactNode> = {
  // Seen where it is not: three projections, the real body apart, and the
  // strike reaching the target from the real body's side.
  ILLUSIONCULUM: (
    <g>
      {figure(38, 54, "ics-dg-ghost ics-dg-step", 0)}
      {figure(66, 54, "ics-dg-ghost ics-dg-step", 1)}
      {figure(94, 54, "ics-dg-ghost ics-dg-step", 2)}
      <circle cx={212} cy={48} r={8} className="ics-dg-target" />
      <path d="M118 48h70" className="ics-dg-seen" />
      {figure(150, 82, "ics-dg-real ics-dg-step", 3)}
      <path d="M160 70Q196 72 206 56" className="ics-dg-route ics-dg-step" style={d(4)} />
      <path d="m200 58 6-2 0 6" className="ics-dg-route ics-dg-step" style={d(4)} />
    </g>
  ),
  // Reality above, the dream below: the dive through the boundary and the
  // path back, held open at the boundary.
  DREAM: (
    <g>
      <path d="M8 44H232" className="ics-dg-boundary" />
      <rect x={8} y={4} width={224} height={40} className="ics-dg-reality" />
      <rect x={8} y={44} width={224} height={48} className="ics-dg-dream" />
      <path d="M48 26Q70 26 86 44T124 76" className="ics-dg-route ics-dg-step" style={d(0)} />
      <circle cx={130} cy={78} r={5} className="ics-dg-core ics-dg-step" style={d(1)} />
      <path d="M138 74Q170 64 178 44T202 22" className="ics-dg-back ics-dg-step" style={d(2)} />
      <path d="m196 20 6 2-1 6" className="ics-dg-back ics-dg-step" style={d(2)} />
      <circle cx={86} cy={44} r={3.5} className="ics-dg-anchor" />
      <circle cx={178} cy={44} r={3.5} className="ics-dg-anchor" />
    </g>
  ),
  // The two orbs as connection points: the body's strike leaves through one
  // and arrives from the other's side; the straight line is not the route.
  "リアクター・モア": (
    <g>
      {figure(36, 62, "ics-dg-real")}
      <circle cx={212} cy={50} r={8} className="ics-dg-target" />
      <path d="M48 50H200" className="ics-dg-seen" />
      <circle cx={92} cy={18} r={9} className="ics-dg-orb ics-dg-step" style={d(0)} />
      <circle cx={176} cy={84} r={9} className="ics-dg-orb ics-dg-step" style={d(1)} />
      <path d="M44 36Q60 18 82 18" className="ics-dg-route ics-dg-step" style={d(2)} />
      <path d="M92 28Q130 60 166 82" className="ics-dg-jump ics-dg-step" style={d(3)} />
      <path d="M186 80Q204 74 208 60" className="ics-dg-route ics-dg-step" style={d(4)} />
      <path d="m202 62 6-3 1 7" className="ics-dg-route ics-dg-step" style={d(4)} />
    </g>
  ),
  // One crystal core distributing its power: each branch's weight is its share.
  "OVER CRYSTAL": (
    <g>
      <path d="M120 22 134 48 120 74 106 48Z" className="ics-dg-core" />
      {[
        [30, 18, 3.2],
        [24, 58, 1.6],
        [62, 88, 2.4],
        [178, 88, 1.2],
        [216, 58, 2.8],
        [210, 18, 2],
      ].map(([x, y, w], branch) => (
        <g key={branch} className="ics-dg-step" style={d(branch)}>
          <path
            d={`M${x < 120 ? 106 : 134} 48L${x} ${y}`}
            className="ics-dg-route"
            style={{ strokeWidth: w }}
          />
          <circle cx={x} cy={y} r={4} className="ics-dg-node" />
        </g>
      ))}
    </g>
  ),
  // The leg's energy, gathered down to the foot just before contact.
  "オーバーレッグ・リアクター": (
    <g>
      <path d="M96 6h26l6 52 22 22v10H98l-4-34Z" className="ics-dg-leg" />
      {[0, 1, 2, 3].map((step) => (
        <path
          key={step}
          className="ics-dg-route ics-dg-step"
          style={{ ...d(step), strokeWidth: 1 + step * 0.9 }}
          d={`M${106 + step * 2} ${14 + step * 16}v10`}
        />
      ))}
      <path d="M150 86h40" className="ics-dg-route ics-dg-step" style={{ ...d(4), strokeWidth: 4 }} />
      <circle cx={196} cy={86} r={6} className="ics-dg-core ics-dg-step" style={d(5)} />
    </g>
  ),
};
