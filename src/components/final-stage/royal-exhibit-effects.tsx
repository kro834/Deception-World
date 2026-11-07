import { useId, useState, type CSSProperties } from "react";
import type { RrFormKey } from "./final-stage-data";

type Point = { x: number; y: number };
type BurstProps = { form: RrFormKey; origin: Point; reactor?: Point };

// A roulette gathers at the chosen armour part before releasing its armament.
// Each silhouette follows the form's role: a bastion, a greatsword, absorption
// rings, moving blades, or the three combined.
function RegaliaBurst({ form, origin, reactor }: BurstProps) {
  const id = useId();
  const [settled, setSettled] = useState(false);
  if (settled) return null;
  const blade = `#${id}-blade`;
  const shield = `#${id}-shield`;
  return (
    <div
      className="rr-surge"
      data-form={form}
      data-demonstration={Boolean(reactor)}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setSettled(true);
      }}
      style={
        {
          "--rr-origin-x": `${origin.x * 100}%`,
          "--rr-origin-y": `${origin.y * 100}%`,
        } as CSSProperties
      }
    >
      {reactor && (
        <svg
          className="rr-surge-route"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          focusable="false"
        >
          <g fill="none" vectorEffect="non-scaling-stroke">
            <path
              className="rr-arc-in"
              pathLength="1"
              d={`M-4 18 Q16 21 20 34 T${reactor.x * 100} ${reactor.y * 100}`}
            />
            <path
              className="rr-arc-out"
              pathLength="1"
              d={`M${reactor.x * 100} ${reactor.y * 100} Q53 32 ${origin.x * 100} ${origin.y * 100}`}
            />
          </g>
          <ellipse
            className="rr-reactor-charge"
            cx={reactor.x * 100}
            cy={reactor.y * 100}
            rx="6.4"
            ry="4.1"
          />
        </svg>
      )}
      <div className="rr-surge-origin">
        <svg viewBox="-110 -110 220 220" focusable="false">
          <defs>
            <linearGradient id={`${id}-metal`} x2="1" y2=".3" gradientUnits="objectBoundingBox">
              <stop stopColor="var(--rr-energy)" stopOpacity=".25" />
              <stop offset=".46" stopColor="var(--rr-energy)" />
              <stop offset=".51" stopColor="#fffbe5" />
              <stop offset=".65" stopColor="#d2a768" />
              <stop offset="1" stopColor="var(--rr-energy)" stopOpacity=".3" />
            </linearGradient>
            <g id={`${id}-blade`} fill={`url(#${id}-metal)`} stroke="#ffe1a1" strokeWidth=".65">
              <path d="M0 -83 4 -48 2 -38 0 -34 -2 -38 -4 -48Z" />
              <path d="M-7 -42 0 -38 7 -42 4 -36 1 -35 1 -29 0 -27 -1 -29 -1 -35 -4 -36Z" />
            </g>
            <g id={`${id}-shield`} fill={`url(#${id}-metal)`} stroke="#fff1ce" strokeWidth=".9">
              <path d="M-10 -53 -6 -62 0 -57 6 -62 10 -53 8 -43 0 -34 -8 -43Z" />
              <path d="M-7 -51 0 -55 7 -51 0 -39Z" fill="none" />
            </g>
          </defs>
          <g className="rr-surge-intake" fill="none" stroke="var(--rr-energy)">
            <circle r="76" strokeWidth="1.5" strokeDasharray="64 11 5 11" />
            <circle r="68" strokeWidth="3" strokeDasharray="2 16" />
          </g>
          <g className="rr-surge-crown" fill="none" stroke="#fce0a0">
            <path d="M-26 8 -33 -13 -15 -5 0 -25 15 -5 33 -13 26 8Z M-23 14H23" />
            <circle r="37" strokeDasharray="55 22.5" />
          </g>
          <g className="rr-surge-armament">
            <g className="rr-surge-wards">
              <use href={shield} transform="rotate(-62)" />
              <use href={shield} transform="rotate(62)" />
            </g>
            <g className="rr-surge-lances">
              <use href={blade} transform="rotate(-34)" />
              <use href={blade} transform="rotate(34)" />
            </g>
            <use className="rr-surge-heavy" href={blade} transform="rotate(12) scale(1.75 1.25)" />
            <g className="rr-surge-return" fill="none" stroke="var(--rr-energy)">
              <ellipse
                rx="84"
                ry="38"
                transform="rotate(-32)"
                strokeWidth="2"
                strokeDasharray="110 60"
              />
              <ellipse rx="84" ry="38" transform="rotate(32)" strokeDasharray="95 34" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

export function RoyalExhibitEffects({ cue, ...props }: BurstProps & { cue: number }) {
  return <RegaliaBurst key={`${props.form}-${cue}`} {...props} />;
}
