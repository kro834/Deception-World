import { ILLUSIONCULUM_ENTRY_CALLS, ILLUSIONCULUM_ENTRY_FIGURE } from "@/lib/illusionculum-entry";
import { ILLUSIONCULUM_ORBS, illusionculumOrb } from "@/lib/illusionculum-saga-artwork";
import { ILLUSIONCULUM_ENTRY_UNDERSUIT as REXONANCE_SUIT_UNDERSUIT } from "@/lib/illusionculum-entry";
import {
  ILLUSIONCULUM_SUIT_ATLAS,
  ILLUSIONCULUM_SUIT_DRIVER,
  ILLUSIONCULUM_SUIT_DRIVER_STANDIN,
  ILLUSIONCULUM_SUIT_PIECES,
  ILLUSIONCULUM_SUIT_SIZE,
} from "@/lib/illusionculum-suit";

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

/** The nanite chips that stream in to form the plates: where each lands on
 * the armour's (raised) place, where it comes from, its tone and its delay —
 * a fixed, hashed spread, so every play is the same. */
const CHIPS = Array.from({ length: 96 }, (_, i) => {
  const h = (n: number) => {
    const v = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const x = 28 + h(1) * 44;
  const y = 8 + h(2) * 80;
  const angle = h(3) * Math.PI * 2;
  return [
    Math.round(x * 10) / 10,
    Math.round(y * 10) / 10,
    Math.round(Math.cos(angle) * 60),
    Math.round(Math.sin(angle) * 60),
    i % 3,
    Math.round(80 + h(4) * 1300),
  ] as const;
});

const SIZE = ILLUSIONCULUM_SUIT_SIZE;
const ATLAS = ILLUSIONCULUM_SUIT_ATLAS;
/** The groups' start (ms) in the calls' order, and each plate's stagger. */
const GROUP_START: Record<string, number> = {
  legs: 150,
  waist: 480,
  arms: 760,
  chest: 820,
  shoulders: 1080,
  tail: 1220,
  helm: 1380,
  bits: 1460,
};
const PLATES = (() => {
  const seen: Record<string, number> = {};
  return ILLUSIONCULUM_SUIT_PIECES.filter(
    (piece) => !ILLUSIONCULUM_SUIT_DRIVER.includes(piece.id),
  ).map((piece) => {
    const k = (seen[piece.group] = (seen[piece.group] ?? -1) + 1);
    const from = { up: "bottom", down: "top", left: "right", right: "left" }[piece.dir];
    return { ...piece, start: (GROUP_START[piece.group] ?? 900) + k * 60, from };
  });
})();

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
      {/* The dream-dive vortex: rings of the light paths' colours, far and
          near, spinning in and converging into the reactor (the form's own
          signature event, at the scale of Rexonance's flame vortex). */}
      <span className="ice-entry-vortex" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((ring) => (
          <i key={ring} style={{ ["--ring" as string]: ring }} />
        ))}
      </span>
      {/* Far cells, drifting behind the figure (the depth's back plane). */}
      <span className="ice-entry-far" aria-hidden="true" />
      <svg className="ice-entry-sigil" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="190" pathLength="1" />
        <circle cx="200" cy="200" r="132" pathLength="1" />
        <path d="M200 10 L364 295 L36 295 Z" pathLength="1" />
        <path d="M200 390 L36 105 L364 105 Z" pathLength="1" />
      </svg>
      <div className="ice-entry-stage">
        <div className="ice-entry-figure">
          <img className="ice-entry-under" src={REXONANCE_SUIT_UNDERSUIT} alt="" decoding="async" />
          {/* The driver, on the undersuit from the first frame (owner). */}
          <img className="ice-entry-driver" src={ILLUSIONCULUM_SUIT_DRIVER_STANDIN} alt="" decoding="async" />
          {/* The armour generated from nanite cells away from the body
              (forward and above), then flown in and locked on. */}
          {/* The nanites' source: an ice surge out of the reactor up and down
              the undersuit (this suit's, not fire), before the cells pour. */}
          <span className="ice-entry-surge" />
          <span className="ice-entry-chips">
            {CHIPS.map(([x, y, fx, fy, tone, delay], index) => (
              <i
                key={index}
                style={{
                  ["--x" as string]: `${x}%`,
                  ["--y" as string]: `${y}%`,
                  ["--fx" as string]: `${fx}vmax`,
                  ["--fy" as string]: `${fy}vmax`,
                  ["--d" as string]: `${delay}ms`,
                }}
                data-tone={tone}
              />
            ))}
          </span>
          {/* The plates, group by group in the calls' order, each cut by its
              SAM outline (the suit's plate atlas): its nanite cells build up
              from its seat off the body, the formed plate drops on and locks,
              each plate a beat after the last within its group. */}
          {PLATES.map((plate) => (
            <span
              key={plate.id}
              className="ice-entry-plate"
              data-driver={plate.start < 0 || undefined}
              style={{
                left: `${(plate.x / SIZE.width) * 100}%`,
                top: `${(plate.y / SIZE.height) * 100}%`,
                width: `${(plate.w / SIZE.width) * 100}%`,
                height: `${(plate.h / SIZE.height) * 100}%`,
                ["--atlas" as string]: `url("${ATLAS.src}")`,
                ["--ax" as string]: `${(-plate.ax / ATLAS.width) * 100}%`,
                ["--ay" as string]: `${(-plate.ay / ATLAS.height) * 100}%`,
                ["--aw" as string]: `${(ATLAS.width / plate.w) * 100}%`,
                ["--ah" as string]: `${(ATLAS.height / plate.h) * 100}%`,
                ["--start" as string]: `${plate.start}ms`,
                ["--from" as string]: plate.from,
              }}
            >
              {/* The atlas at the plate's own scale, shifted so its cell
                  fills the box (overflow clips the neighbours). */}
              <i className="ice-entry-plate-cells" />
              <i className="ice-entry-plate-art" />
            </span>
          ))}
          <span className="ice-entry-core" />
          {(["left", "right"] as const).map((side) => (
            <span key={side} className={`ice-entry-orb is-${side}`} style={seat(side)}>
              <img src={illusionculumOrb(side)} alt="" width={256} height={256} decoding="async" />
            </span>
          ))}
        </div>
      </div>
      {/* The calls, one at a time, large and centred under the figure (as
          Rexonance's entry stages them); a chant's units light in turn. */}
      <ol className="ice-entry-calls">
        {ILLUSIONCULUM_ENTRY_CALLS.map((call, index) => {
          const units = call.match(/[^！]+！/g) ?? [call];
          return (
            <li
              key={call}
              style={{ ["--ice-call" as string]: index }}
              data-last={index === ILLUSIONCULUM_ENTRY_CALLS.length - 1 || undefined}
            >
              {units.map((unit, k) => (
                <span key={k} style={{ ["--ice-unit" as string]: k }}>
                  {unit}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
      {/* The frame: corner ticks, the scan line down the undersuit, and the
          lock's ring at the reactor once the suit is whole. */}
      {/* The orbit plane, tilted, the orbs' path round the figure. */}
      <span className="ice-entry-orbit" />
      {/* Near cells, larger and faster in front (the depth's front plane). */}
      <span className="ice-entry-near" />
      <span className="ice-entry-frame" />
      <span className="ice-entry-scan" />
      <span className="ice-entry-lock" />
    </div>
  );
}
