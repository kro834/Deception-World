import {
  ILLUSIONCULUM_CUTOUT_SIZE,
  ILLUSIONCULUM_ORBS,
  illusionculumCutout,
  illusionculumOrb,
} from "@/lib/illusionculum-saga-artwork";

/* ILLUSIONCULUM SAGA — the page's own figures (decorative, aria-hidden).

   IllusionculumOrbs: the two リアクター・モア over the hero's figure. They
   deploy once from above the shoulders (styles-illusionculum-saga.css: a
   rise out of the shoulder line, an arc out to their seats, the reactor
   lighting last) and rest where the owner's art holds them; the calm tiers
   draw them at rest.

   IllusionculumProjection: the form's one idea, drawn — 敵が観測する位置と、
   実際に攻撃が成立する位置を切り離す. Three projections of the figure (its
   own cutout as flat, scanned light in the iridescent paths' colours) stand
   where they are seen; the real figure stands apart, its two orbs over its
   shoulders, and the connection runs between them. No words: the picture beside the owner's
   paragraphs explains itself. */

/** The orbs' seats as percentages of the cutout frame (1024 x 1536). */
const seat = (side: "left" | "right") => {
  const orb = ILLUSIONCULUM_ORBS[side];
  return {
    ["--ics-orb-x" as string]: `${(orb.cx / 1024) * 100}%`,
    ["--ics-orb-y" as string]: `${(orb.cy / 1536) * 100}%`,
    ["--ics-orb-d" as string]: `${((orb.r * 2) / 1024) * 100}%`,
  };
};

export function IllusionculumOrbs({ ultra = false }: { ultra?: boolean }) {
  return (
    <span className="ics-orbs" aria-hidden="true">
      {(["left", "right"] as const).map((side) => (
        <span key={side} className={`ics-orb is-${side}`} style={seat(side)}>
          <i className="ics-orb-trail" />
          <img
            src={illusionculumOrb(side, ultra)}
            alt=""
            width={256}
            height={256}
            decoding="async"
            fetchPriority="low"
          />
          <i className="ics-orb-core" />
        </span>
      ))}
    </span>
  );
}

const CUTOUT = illusionculumCutout("standard", 480);

const PROJECTION_TICKS = Array.from({ length: 23 }, (_, idx) => 60 + idx * 40);

export function IllusionculumProjection() {
  return (
    <figure className="ics-projection rxs-reveal" aria-hidden="true">
      <i className="ics-projection-rim" />
      <svg className="ics-projection-paths" viewBox="0 0 1000 560" preserveAspectRatio="none">
        {/* Quantum phase interference grid & Vernier graduation scale */}
        <g className="ics-proj-grid">
          <path
            className="ics-proj-axis"
            d="M44 280H956 M524 24L492 536 M588 24L556 536"
          />
          <path
            className="ics-proj-wave"
            d="M84 146A210 210 0 0 1 84 434 M168 112A260 260 0 0 1 168 468 M258 88A310 310 0 0 1 258 492 M716 98A240 240 0 0 0 716 462 M658 134A190 190 0 0 0 658 426"
          />
          <path
            className="ics-proj-shear"
            d="M524 24L588 24L556 536L492 536Z M508 112H574 M503 200H569 M498 288H564 M493 376H559 M488 464H554"
          />
          <path
            className="ics-proj-ticks"
            d={PROJECTION_TICKS.map((x, idx) => {
              const len = idx % 3 === 0 ? 11 : 5;
              return `M${x} 16v${len}M${x} ${544 - len}v${len}`;
            }).join("")}
          />
        </g>

        {/* Tri-chromatic spatial refraction splines (Cyan / Magenta / Gold dispersion) */}
        <g className="ics-proj-refraction">
          {/* Upper refraction manifold: Ghost A & B -> Shear Plane -> Left Reactor More -> Real Strike */}
          <path
            className="ics-proj-ray is-cyan"
            d="M150 246 C 276 164, 412 152, 514 196 L 578 174 C 642 156, 696 178, 748 214 L 896 198"
          />
          <path
            className="ics-proj-ray is-magenta"
            d="M150 252 C 282 178, 416 168, 513 206 L 577 186 C 644 170, 698 188, 748 214 L 896 204"
          />
          <path
            className="ics-proj-ray is-gold"
            d="M296 286 C 378 228, 448 214, 510 226 L 574 202 C 638 184, 696 196, 748 214 L 842 268"
          />

          {/* Lower refraction manifold: Ghost B & C -> Shear Plane -> Right Reactor More -> Real Strike */}
          <path
            className="ics-proj-ray is-cyan"
            d="M296 294 C 384 358, 446 376, 500 356 L 564 374 C 632 392, 696 372, 756 338 L 902 360"
          />
          <path
            className="ics-proj-ray is-magenta"
            d="M436 332 C 468 384, 488 398, 498 382 L 562 398 C 634 416, 700 388, 756 338 L 902 368"
          />
          <path
            className="ics-proj-ray is-gold"
            d="M436 324 C 468 350, 488 360, 501 344 L 565 358 C 636 374, 698 358, 756 338 L 842 268"
          />
        </g>

        {/* Tactical phase-lock reticles & refractive vertex anchors */}
        <g className="ics-proj-nodes">
          {/* Ghost phase origin diamonds */}
          <path d="M150 241l7 8-7 8-7-8Z M296 282l7 8-7 8-7-8Z M436 320l7 8-7 8-7-8Z" />
          {/* Shear-plane prism vertices */}
          <circle cx={514} cy={196} r={3.5} />
          <circle cx={578} cy={174} r={3.5} />
          <circle cx={500} cy={356} r={3.5} />
          <circle cx={564} cy={374} r={3.5} />
          {/* Reactor More dual relay reticles */}
          <circle cx={748} cy={214} r={14} className="ics-proj-reticle" />
          <circle cx={748} cy={214} r={4.5} className="ics-proj-core" />
          <circle cx={756} cy={338} r={14} className="ics-proj-reticle" />
          <circle cx={756} cy={338} r={4.5} className="ics-proj-core" />
          {/* Real actuation core & terminal vectors */}
          <path d="M842 256l10 12-10 12-10-12Z" className="ics-proj-core" />
          <circle cx={896} cy={200} r={5} className="ics-proj-lock" />
          <circle cx={902} cy={364} r={5} className="ics-proj-lock" />
        </g>
      </svg>
      {(["a", "b", "c"] as const).map((key) => (
        <span
          key={key}
          className={`ics-projection-ghost is-${key}`}
          style={{ ["--ics-cutout" as string]: `url("${CUTOUT}")` }}
        />
      ))}
      <img
        className="ics-projection-real"
        src={illusionculumCutout("more", 480)}
        alt=""
        width={ILLUSIONCULUM_CUTOUT_SIZE.width / 2}
        height={ILLUSIONCULUM_CUTOUT_SIZE.height / 2}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
