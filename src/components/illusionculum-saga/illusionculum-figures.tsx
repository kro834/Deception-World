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

export function IllusionculumProjection() {
  return (
    <figure className="ics-projection rxs-reveal" aria-hidden="true">
      <svg className="ics-projection-paths" viewBox="0 0 1000 560" preserveAspectRatio="none">
        <path d="M120 300 C 300 150, 520 140, 760 250" />
        <path d="M120 360 C 340 470, 560 470, 760 330" />
        <path d="M760 250 L 905 210 M760 330 L 905 360" />
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
