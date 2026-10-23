import { ILLUSIONCULUM_ENTRY_CALLS, ILLUSIONCULUM_ENTRY_FIGURE } from "@/lib/illusionculum-entry";
import { ILLUSIONCULUM_ORBS, illusionculumOrb } from "@/lib/illusionculum-saga-artwork";
import { ILLUSIONCULUM_ENTRY_UNDERSUIT as REXONANCE_SUIT_UNDERSUIT } from "@/lib/illusionculum-entry";

/* ILLUSIONCULUM SAGA's entry transformation: the route transition screen of
   an in-site navigation to /illusionculum-saga (load-gate.tsx, the
   "illusionculum" dive), as Rexonance's and FAR FROM's calls play in theirs.

   Under the cover, on one clock (styles-illusionculum-entry.css, the gate's
   ILLUSIONCULUM_ENTRY_TIMINGS): the gold sigil draws; the owner's four calls
   come in one after another; over the bare undersuit (the same wearer as
   Rexonance) the armour is generated from nanite cells away from the body
   (owner, 2026-10-23: 「ナノマシンで生成された装甲をしてから装着する方式」),
   then flies in and locks on;
   the two リアクター・モア rise from above the shoulders to their seats; the
   reactor lights. Then the gate reveals the page.

   Decorative (aria-hidden); the gate owns the tier (only "full" plays this;
   economy and reduced motion get the gate's short calm shutter), the
   timing and the reveal. The figure is the page's hero file, which the gate
   warms as the link's asset, so the cover never waits on a picture. Runs
   once: no loop, no flash (the reactor's light is a small, slow glow). */

const seat = (side: "left" | "right") => {
  const orb = ILLUSIONCULUM_ORBS[side];
  return {
    ["--ice-orb-x" as string]: `${(orb.cx / 1024) * 100}%`,
    ["--ice-orb-y" as string]: `${(orb.cy / 1536) * 100}%`,
    ["--ice-orb-d" as string]: `${((orb.r * 2) / 1024) * 100}%`,
  };
};

export function IllusionculumEntrySequence({ phase }: { phase: "covering" | "revealing" }) {
  return (
    <div className="ice-entry" data-phase={phase} aria-hidden="true">
      <span className="ice-entry-ground" />
      <svg className="ice-entry-sigil" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="190" pathLength="1" />
        <circle cx="200" cy="200" r="132" pathLength="1" />
        <path d="M200 10 L364 295 L36 295 Z" pathLength="1" />
        <path d="M200 390 L36 105 L364 105 Z" pathLength="1" />
      </svg>
      <div className="ice-entry-stage">
        <div className="ice-entry-figure">
          <img
            className="ice-entry-under"
            src={REXONANCE_SUIT_UNDERSUIT}
            alt=""
            decoding="async"
          />
          {/* The armour generated from nanite cells away from the body
              (forward and above), then flown in and locked on. */}
          <span
            className="ice-entry-cells"
            style={{ ["--ice-cutout" as string]: `url("${ILLUSIONCULUM_ENTRY_FIGURE}")` }}
          />
          <img
            className="ice-entry-real"
            src={ILLUSIONCULUM_ENTRY_FIGURE}
            alt=""
            width={960}
            height={1440}
            decoding="async"
          />
          <span className="ice-entry-core" />
          {(["left", "right"] as const).map((side) => (
            <span key={side} className={`ice-entry-orb is-${side}`} style={seat(side)}>
              <img src={illusionculumOrb(side)} alt="" width={256} height={256} decoding="async" />
            </span>
          ))}
        </div>
      </div>
      <ol className="ice-entry-calls">
        {ILLUSIONCULUM_ENTRY_CALLS.map((call, index) => (
          <li key={call} style={{ ["--ice-call" as string]: index }}>
            {call}
          </li>
        ))}
      </ol>
    </div>
  );
}
