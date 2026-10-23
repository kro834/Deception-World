import { ILLUSIONCULUM_ENTRY_CALLS, ILLUSIONCULUM_ENTRY_FIGURE } from "@/lib/illusionculum-entry";
import { ILLUSIONCULUM_ORBS, illusionculumOrb } from "@/lib/illusionculum-saga-artwork";

/* ILLUSIONCULUM SAGA's entry transformation: the route transition screen of
   an in-site navigation to /illusionculum-saga (load-gate.tsx, the
   "illusionculum" dive), as Rexonance's and FAR FROM's calls play in theirs.

   Under the cover, on one clock (styles-illusionculum-entry.css, the gate's
   ILLUSIONCULUM_ENTRY_TIMINGS): the gold sigil draws; the owner's four calls
   come in one after another; three projections of the figure — its own
   silhouette as scanned light in the light paths' colours — stand apart and
   close in on where it really is, and the real figure resolves out of them;
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
          {(["a", "b", "c"] as const).map((key) => (
            <span
              key={key}
              className={`ice-entry-ghost is-${key}`}
              style={{ ["--ice-cutout" as string]: `url("${ILLUSIONCULUM_ENTRY_FIGURE}")` }}
            />
          ))}
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
