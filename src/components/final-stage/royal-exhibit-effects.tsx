import { useId, useState, type CSSProperties } from "react";
import type { RrFormKey } from "./final-stage-data";

type Point = { x: number; y: number };
type BurstProps = { form: RrFormKey; origin: Point; reactor?: Point };

const SPARK_VECTORS: readonly { x: number; y: number; scale: number; rot: number }[] = [
  { x: 0, y: -96, scale: 1.08, rot: 0 },
  { x: 66, y: -68, scale: 0.86, rot: 22 },
  { x: 94, y: -6, scale: 0.94, rot: 45 },
  { x: 64, y: 66, scale: 0.78, rot: 18 },
  { x: 0, y: 92, scale: 0.88, rot: 0 },
  { x: -64, y: 66, scale: 0.78, rot: -18 },
  { x: -94, y: -6, scale: 0.94, rot: -45 },
  { x: -66, y: -68, scale: 0.86, rot: -22 },
];

// A roulette gathers at the chosen armour part before releasing its armament.
// Each silhouette follows the form's role: a bastion, a greatsword, absorption
// rings, high-speed lances, or the sovereign Ultra regalia combining all four.
function RegaliaBurst({ form, origin, reactor }: BurstProps) {
  const id = useId();
  const [settled, setSettled] = useState(false);
  if (settled) return null;
  const blade = `#${id}-blade`;
  const shield = `#${id}-shield`;
  const mote = `#${id}-mote`;
  const rx = reactor ? reactor.x * 100 : 0;
  const ry = reactor ? reactor.y * 100 : 0;
  const ox = origin.x * 100;
  const oy = origin.y * 100;
  const arcInPath = `M-4 18 Q16 21 20 34 T${rx} ${ry}`;
  const arcOutPath = `M${rx} ${ry} Q53 32 ${ox} ${oy}`;

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
          "--rr-origin-x": `${ox}%`,
          "--rr-origin-y": `${oy}%`,
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
            <path className="rr-arc-aura rr-arc-in" pathLength="1" d={arcInPath} />
            <path className="rr-arc-core rr-arc-in" pathLength="1" d={arcInPath} />
            <path className="rr-arc-aura rr-arc-out" pathLength="1" d={arcOutPath} />
            <path className="rr-arc-core rr-arc-out" pathLength="1" d={arcOutPath} />
          </g>
          <g className="rr-reactor-node">
            <ellipse className="rr-reactor-charge" cx={rx} cy={ry} rx="7.2" ry="4.6" />
            <ellipse className="rr-reactor-ring" cx={rx} cy={ry} rx="3.9" ry="2.5" />
          </g>
        </svg>
      )}
      <div className="rr-surge-origin">
        <svg viewBox="-120 -120 240 240" focusable="false">
          <defs>
            <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff9df" stopOpacity=".46" />
              <stop offset="34%" stopColor="var(--rr-gold)" stopOpacity=".24" />
              <stop offset="68%" stopColor="var(--rr-energy)" stopOpacity=".12" />
              <stop offset="100%" stopColor="var(--rr-energy)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-metal`} x2="1" y2=".3" gradientUnits="objectBoundingBox">
              <stop stopColor="var(--rr-energy)" stopOpacity=".28" />
              <stop offset=".44" stopColor="var(--rr-energy)" />
              <stop offset=".51" stopColor="#fffdf0" />
              <stop offset=".68" stopColor="var(--rr-gold)" />
              <stop offset="1" stopColor="var(--rr-energy)" stopOpacity=".34" />
            </linearGradient>
            <g id={`${id}-blade`} fill={`url(#${id}-metal)`} stroke="#ffe6ad" strokeWidth=".68">
              <path d="M0 -88 4.4 -50 2.2 -38 0 -33 -2.2 -38 -4.4 -50Z" />
              <path d="M0 -82 V-39" fill="none" stroke="#fffbe8" strokeWidth=".45" />
              <path d="M-8 -42 0 -37.5 8 -42 4.6 -35.8 1.2 -34.8 1.2 -28.5 0 -26 -1.2 -28.5 -1.2 -34.8 -4.6 -35.8Z" />
            </g>
            <g id={`${id}-shield`} fill={`url(#${id}-metal)`} stroke="#fff2d2" strokeWidth=".88">
              <path d="M-11 -54 -6.5 -64 0 -58.5 6.5 -64 11 -54 8.6 -42.5 0 -33 -8.6 -42.5Z" />
              <path d="M-7.2 -51.5 0 -56 7.2 -51.5 0 -38.5Z" fill="none" />
              <circle cx="0" cy="-48.5" r="1.4" fill="#fffbe8" stroke="none" />
            </g>
            <path
              id={`${id}-mote`}
              d="M0 -5.2 L1.35 -1.35 L5.2 0 L1.35 1.35 L0 5.2 L-1.35 1.35 L-5.2 0 L-1.35 -1.35Z"
            />
          </defs>

          <g className="rr-surge-halo">
            <circle r="98" fill={`url(#${id}-halo)`} />
            <circle
              className="rr-surge-wave"
              r="88"
              fill="none"
              stroke="var(--rr-gold)"
              strokeWidth=".85"
              strokeDasharray="22 9 3 9"
            />
            <g className="rr-surge-sovereign" fill="none" stroke="var(--rr-gold)">
              <circle r="104" strokeWidth="1.15" strokeDasharray="34 8 4 8" />
              <path
                stroke="var(--rr-energy)"
                strokeWidth=".8"
                d="M0 -110 V-95 M0 95 V110 M-110 0 H-95 M95 0 H110 M-77 -77 L-67 -67 M67 67 L77 77 M77 -77 L67 -67 M-67 67 L-77 77"
              />
            </g>
          </g>

          <g className="rr-surge-intake" fill="none" stroke="var(--rr-energy)">
            <circle r="80" strokeWidth="1.45" strokeDasharray="52 9 4 9 14 9" />
            <circle r="71" strokeWidth="3.1" strokeDasharray="1.8 13.07" stroke="var(--rr-gold)" />
            <circle r="62" strokeWidth=".95" strokeDasharray="28 11" />
          </g>

          <g className="rr-surge-crown" fill="none" stroke="var(--rr-gold)">
            <path
              className="rr-surge-starcompass"
              stroke="var(--rr-energy)"
              strokeWidth=".9"
              d="M0 -48 L4.2 -12.5 L31 -31 L12.5 -4.2 L48 0 L12.5 4.2 L31 31 L4.2 12.5 L0 48 L-4.2 12.5 L-31 31 L-12.5 4.2 L-48 0 L-12.5 -4.2 L-31 -31 L-4.2 -12.5Z"
            />
            <path
              strokeWidth="1.55"
              fill="rgba(255, 241, 200, 0.08)"
              d="M-27 9 -35 -12 -20 -4 -11 -20 0 -7 0 -27 0 -7 11 -20 20 -4 35 -12 27 9Z"
            />
            <path
              strokeWidth="1.55"
              d="M-27 9 -34 -13 -16 -5 0 -26 16 -5 34 -13 27 9Z M-24 14.5 H24 M-19 18.5 H19"
            />
            <g fill="#fffbe8" stroke="none">
              <circle cx="0" cy="-29.5" r="2.2" />
              <circle cx="-35" cy="-16" r="1.65" />
              <circle cx="35" cy="-16" r="1.65" />
              <circle cx="0" cy="1.5" r="1.8" fill="var(--rr-energy)" />
            </g>
            <circle r="40" strokeWidth="1.15" strokeDasharray="48 14.8" />
          </g>

          <g className="rr-surge-armament">
            <g className="rr-surge-wards">
              <use href={shield} transform="rotate(-62)" />
              <use href={shield} transform="rotate(62)" />
              <use className="rr-surge-ward-flank" href={shield} transform="rotate(-118) scale(.86)" />
              <use className="rr-surge-ward-flank" href={shield} transform="rotate(118) scale(.86)" />
            </g>
            <g className="rr-surge-lances">
              <use href={blade} transform="rotate(-34)" />
              <use href={blade} transform="rotate(34)" />
              <use className="rr-surge-lance-swift" href={blade} transform="rotate(-76) scale(.84)" />
              <use className="rr-surge-lance-swift" href={blade} transform="rotate(76) scale(.84)" />
            </g>
            <g className="rr-surge-heavy">
              <use href={blade} transform="rotate(12) scale(1.8 1.28)" />
              <path
                fill="none"
                stroke="var(--rr-energy)"
                strokeWidth="1.6"
                strokeDasharray="68 40"
                d="M-64 -58 A86 86 0 0 1 74 -42"
              />
            </g>
            <g className="rr-surge-return" fill="none" stroke="var(--rr-energy)">
              <ellipse
                rx="88"
                ry="39"
                transform="rotate(-32)"
                strokeWidth="2"
                strokeDasharray="114 56"
              />
              <ellipse
                rx="88"
                ry="39"
                transform="rotate(32)"
                stroke="var(--rr-gold)"
                strokeWidth="1.25"
                strokeDasharray="96 34"
              />
            </g>
            <g className="rr-surge-vectors" fill="none" stroke="var(--rr-energy)" strokeWidth="1.35">
              <path d="M-56 44 L-38 22 L-16 28 M56 -44 L38 -22 L16 -28" />
              <path stroke="var(--rr-gold)" strokeWidth=".95" d="M-74 28 L-50 4 M74 -28 L50 -4" />
            </g>
          </g>

          <g className="rr-surge-sparks">
            {SPARK_VECTORS.map((spark, index) => (
              <use
                key={index}
                href={mote}
                fill={index % 2 === 0 ? "#fffbe8" : "var(--rr-energy)"}
                transform={`translate(${spark.x} ${spark.y}) rotate(${spark.rot}) scale(${spark.scale})`}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function RoyalExhibitEffects({ cue, ...props }: BurstProps & { cue: number }) {
  return <RegaliaBurst key={`${props.form}-${cue}`} {...props} />;
}
