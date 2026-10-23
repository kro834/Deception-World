// ウルトラ's auxiliary interfaces on the stage panel (far-from-ultra-deploy.tsx):
// where they stand on ウルトラ's base picture (FAR_FROM_SAGA_ULTRA_BASE, 1083 ×
// 1452 px) and what they read. Data only, so the component file exports
// components alone.
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";

export type FarFromDeployPanel = {
  id: string;
  kind: "dial" | "bars" | "text" | "graph";
  /** The panel's box in the base picture's pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The side facing the figure: where it unfolds from. */
  inner: "left" | "right";
  /** The emitter on the armour, and the tether's run to the arm. */
  emitter: readonly [number, number];
  tether: readonly (readonly [number, number])[];
  /** Its start within the deploy (ms). */
  at: number;
  title: string;
  /** The title's short code, read where the panel's head holds no more
   * (the layer's type keeps a 9 px floor on screen, so a phone's panel is
   * five or six capitals wide). */
  short: string;
  /** The read-out rows under the glyph, drawn as data strips as wide as
   * their words (text at this size could not be read). */
  lines: readonly string[];
};

/** Placed by the owner's painted reference (ultra/stage-with-interface),
 * on the base render's arms (1083 × 1452), inside x 48–1035: the band the
 * narrowest stage figure (390 px) still shows of the cover-fitted picture. */
export const FAR_FROM_ULTRA_DEPLOY_PANELS: readonly FarFromDeployPanel[] = [
  {
    id: "l1",
    kind: "dial",
    x: 50,
    y: 664,
    w: 114,
    h: 176,
    inner: "right",
    emitter: [184, 742],
    tether: [
      [164, 800],
      [172, 800],
      [184, 812],
    ],
    at: 0,
    title: "SA-GA OS 6.1",
    short: "OS 6.1",
    lines: ["FARFROM", "DRIVE LINK", "SYNC"],
  },
  {
    id: "r1",
    kind: "bars",
    x: 920,
    y: 424,
    w: 114,
    h: 168,
    inner: "left",
    emitter: [948, 640],
    tether: [
      [920, 560],
      [908, 560],
      [900, 610],
    ],
    at: 90,
    title: "KHAOS DEUX",
    short: "KHAOS",
    lines: ["60000+ YOPS", "INF CORE"],
  },
  {
    id: "l2",
    kind: "text",
    x: 50,
    y: 462,
    w: 114,
    h: 104,
    inner: "right",
    emitter: [176, 590],
    tether: [
      [164, 540],
      [170, 540],
      [178, 572],
    ],
    at: 260,
    title: "P16",
    short: "P16",
    lines: ["NEURAL", "P16 ONLINE"],
  },
  {
    id: "r2",
    kind: "graph",
    x: 920,
    y: 984,
    w: 114,
    h: 96,
    inner: "left",
    emitter: [962, 958],
    tether: [
      [936, 984],
      [944, 972],
      [960, 962],
    ],
    at: 340,
    title: "KOSMOS DEUX",
    short: "KOSMOS",
    lines: ["9000 TOPS", "300 CORE"],
  },
];

/** The wrist rings about each wrist cuff, and the crown gauge about the halo. */
export const FAR_FROM_ULTRA_DEPLOY_RINGS = [
  { id: "wl", cx: 228, cy: 806, rx: 80, ry: 22, at: 700 },
  { id: "wr", cx: 979, cy: 826, rx: 74, ry: 21, at: 760 },
] as const;
export const FAR_FROM_ULTRA_DEPLOY_CROWN = { cx: 575, cy: 60, rx: 128, ry: 26, at: 1100 } as const;
/** The crown's read-out: the form's name in katakana and its limit (record). */
export const FAR_FROM_ULTRA_DEPLOY_CROWN_LABEL = `${FAR_FROM_SAGA.stages.ultra.label} 60S`;

/** The whole deploy, from data-run (ms, before --ffd-delay). */
export const FAR_FROM_ULTRA_DEPLOY_MS = 2000;

/* The layer's type (polish sweep, 2026-10-23). The panels are drawn in the
   picture's 1083 px units, which a phone shows at about a third of a CSS
   pixel each, so a 10-unit read-out was 3.6 px tall. The layer measures
   its own width (far-from-ultra-deploy.tsx) and sets its titles and the
   crown's label in units that come to 9 px and 12 px on screen at least;
   a title that would then run past its panel reads its short code, and
   the read-out rows under the glyphs are data strips, one per line of the
   record, as wide as its words. */

/** The title's and the crown label's size on screen, at least (CSS px). */
export const FAR_FROM_DEPLOY_TITLE_PX = 9;
export const FAR_FROM_DEPLOY_CROWN_PX = 12;
/** Picture units per CSS px before the layer has measured itself (a
 * desktop stage figure; the first measure runs before paint). */
export const FAR_FROM_DEPLOY_UNITS_PER_PX = 1.72;
/** The panel's inner padding, and the head bar's room around its title. */
export const FAR_FROM_DEPLOY_PAD = 8;
export const FAR_FROM_DEPLOY_TITLE_PAD = 6;

/** Michroma's capitals and digits run about 0.78 em wide, a space 0.3 em. */
export const latinWidth = (text: string, size: number) =>
  Array.from(text).reduce((sum, char) => sum + (char === " " ? 0.3 : 0.78), 0) * size;
/** The crown's label mixes katakana (one em) with digits and capitals. */
export const labelWidth = (text: string, size: number) =>
  Array.from(text).reduce(
    (sum, char) => sum + (char === " " ? 0.3 : char > "\u007f" ? 1 : 0.72),
    0,
  ) * size;

export type FarFromDeployType = {
  /** The title's size (picture units). */
  title: number;
  /** The head bar: the title with a little air. */
  head: number;
  /** A read-out strip's height, and the gap between strips. */
  strip: number;
  gap: number;
  /** The crown label's size. */
  crown: number;
};

/** The type's units at this scale (picture units per CSS px). */
export function deployType(unitsPerPx: number): FarFromDeployType {
  const title = Math.max(10, Math.ceil(FAR_FROM_DEPLOY_TITLE_PX * unitsPerPx));
  return {
    title,
    head: Math.round(title * 1.3 + 5),
    strip: Math.max(3, Math.round(title * 0.34)),
    gap: Math.max(3, Math.round(title * 0.2)),
    crown: Math.max(17, Math.ceil(FAR_FROM_DEPLOY_CROWN_PX * unitsPerPx)),
  };
}

/** How tall each glyph is, under the head. */
const GLYPH_HEIGHT: Record<FarFromDeployPanel["kind"], number> = {
  dial: 60,
  bars: 58,
  graph: 28,
  text: 16,
};

/** The panel's title as it fits: the record's name where there is room,
 * its short code where there is not; past that, the text is fitted. */
export function panelTitle(panel: FarFromDeployPanel, type: FarFromDeployType) {
  const room = panel.w - FAR_FROM_DEPLOY_TITLE_PAD * 2;
  const full = latinWidth(panel.title, type.title);
  if (full <= room) return { text: panel.title, fit: undefined };
  const short = latinWidth(panel.short, type.title);
  return { text: panel.short, fit: short <= room ? undefined : room };
}

/** The read-out strips a panel has room for under its glyph, from the
 * bottom up: as many of its lines as fit, each as wide as its words. */
export function panelStrips(panel: FarFromDeployPanel, type: FarFromDeployType) {
  const pad = FAR_FROM_DEPLOY_PAD;
  const room = panel.h - type.head - 6 - GLYPH_HEIGHT[panel.kind] - pad;
  const count = Math.max(
    0,
    Math.min(panel.lines.length, Math.floor((room + type.gap) / (type.strip + type.gap))),
  );
  const height = count * type.strip + Math.max(0, count - 1) * type.gap;
  const top = panel.y + panel.h - pad - height;
  return panel.lines.slice(0, count).map((line, index) => ({
    line,
    x: panel.x + pad,
    y: top + index * (type.strip + type.gap),
    width: Math.min(panel.w - pad * 2, Math.round(line.length * 0.62 * type.title)),
    height: type.strip,
  }));
}
