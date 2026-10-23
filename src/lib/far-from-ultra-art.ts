/* FAR FROM SAGA — the ウルトラ sequence's pictures, geometry and timing
   (owner, 2026-10-22: 「ファーフロム・ウルトラだけ体全身が白に染まった後、さらに
   ナノマシンにより追加部分が生成された後、…コンピュータの様な補助インター
   フェースが腕の外などに展開されます。」).

   Pure data, importable by the tests under Node: the cutouts' delivery files
   (scripts/build-far-from-ultra-art.mjs), the figure's pixel grid, where it
   stands in a stage, the sequence's windows along the scroll, the draw
   budgets by pointer, and the auxiliary interfaces' layout in figure px —
   placed where the owner's painted interfaces are (ultra/suit-with-interface,
   the reference), rebuilt as vector HUD by far-from-ultra-scene.ts. */

export const FAR_FROM_ULTRA_REVISION = "20261022";
const FOLDER = `/far-from-ultra-${FAR_FROM_ULTRA_REVISION}`;

/** The delivery widths every cutout is encoded at (the last is canonical). */
export const FAR_FROM_ULTRA_WIDTHS = [768, 1024] as const;

/** The cutouts' shared pixel grid (figure px): every coordinate below. */
export const FAR_FROM_ULTRA_FIGURE = { width: 1024, height: 1536 } as const;

export type FarFromUltraArtKey = "max" | "body" | "interface";

/** The three cutouts: マックス (the first frame), the ウルトラ body without
 * its interfaces (the sequence's body) and the owner's body with its painted
 * interfaces (the quiet tiers' still). */
export const FAR_FROM_ULTRA_ART: Record<FarFromUltraArtKey, { stem: string }> = {
  max: { stem: `${FOLDER}/max` },
  body: { stem: `${FOLDER}/ultra` },
  interface: { stem: `${FOLDER}/ultra-interface` },
};

/** One delivery file. */
export function farFromUltraSrc(
  key: FarFromUltraArtKey,
  width: (typeof FAR_FROM_ULTRA_WIDTHS)[number],
) {
  return `${FAR_FROM_ULTRA_ART[key].stem}-${width}.webp`;
}

/** srcset / sizes for a cutout drawn as the figure of a stage. */
export function farFromUltraImage(key: FarFromUltraArtKey) {
  return {
    src: farFromUltraSrc(key, 1024),
    srcSet: FAR_FROM_ULTRA_WIDTHS.map((width) => `${farFromUltraSrc(key, width)} ${width}w`).join(
      ", ",
    ),
    sizes: "(max-width: 767px) 92vw, min(92vw, 640px)",
  };
}

/** Where the figure stands in the stage is the #suitup runway's own
 * placement (src/lib/far-from-stage.ts: FAR_FROM_STAGE_TIERS, read by the
 * mount through farFromFigureBox), so マックス stands exactly where that
 * runway's last frame left it. The cutouts' frame is FAR_FROM_CUTOUT there
 * and FAR_FROM_ULTRA_FIGURE here: the same 1024 × 1536 grid. */

/** The sequence's windows as shares of the scroll (overlapping, in order):
 * マックス stands; the body turns white from the feet up; the crystal armour
 * spreads over the body from the chest; the added parts (the extended head,
 * the shoulder mechanisms, the bits' crystals, the blade tips) are built;
 * the light rings open; the auxiliary interfaces deploy; the final still. */
export const FAR_FROM_ULTRA_WINDOWS = {
  max: [0, 0.08],
  white: [0.08, 0.3],
  armour: [0.3, 0.54],
  parts: [0.5, 0.68],
  halo: [0.6, 0.76],
  interface: [0.72, 0.96],
  final: [0.96, 1],
} as const satisfies Record<string, readonly [number, number]>;

/** The phases the runway's read-out names, each lit from its window's start. */
export const FAR_FROM_ULTRA_PHASES = [
  { phase: "max", step: "01", label: "マックス" },
  { phase: "white", step: "02", label: "WHITE" },
  { phase: "armour", step: "03", label: "ARMOUR" },
  { phase: "halo", step: "04", label: "HALO" },
  { phase: "interface", step: "05", label: "INTERFACE" },
] as const;

/** The crystal armour's tile (figure px) and the chest point it spreads from. */
export const FAR_FROM_ULTRA_TILE = 24;
export const FAR_FROM_ULTRA_CORE = [512, 430] as const;

/** A tile's nanites fly for this long before it (progress), and its landing
 * flash lasts this long after. */
export const FAR_FROM_ULTRA_FLIGHT = { armour: 0.05, parts: 0.07, flash: 0.016 } as const;

/** The draw budgets by pointer: the device-ratio cap, the chips in flight
 * drawn in one frame, the orbiting motes, the landed tiles drawn into the
 * cache in one frame, and the delivery width the engine decodes. */
export const FAR_FROM_ULTRA_BUDGET = {
  fine: { ratio: 2, sprites: 960, motes: 160, cache: 640, width: 1024 },
  coarse: { ratio: 1.5, sprites: 440, motes: 72, cache: 320, width: 768 },
} as const;
export type FarFromUltraTier = keyof typeof FAR_FROM_ULTRA_BUDGET;

/** The light rings (figure px): centre, radii, the window each opens over
 * (within FAR_FROM_ULTRA_WINDOWS.halo, as shares) and its tick count. The
 * upper two pass behind the figure at the top and before it at the bottom. */
export const FAR_FROM_ULTRA_RINGS = [
  { cx: 512, cy: 300, rx: 520, ry: 96, from: 0, to: 0.55, ticks: 48, behind: false },
  { cx: 512, cy: 640, rx: 430, ry: 80, from: 0.2, to: 0.75, ticks: 36, behind: false },
  { cx: 512, cy: 430, rx: 660, ry: 300, from: 0.4, to: 1, ticks: 72, behind: true },
] as const;

export type FarFromUltraPanelKind = "dial" | "bars" | "text" | "graph";
export type FarFromUltraPanelSize = "tall" | "low";

export type FarFromUltraPanel = {
  id: string;
  kind: FarFromUltraPanelKind;
  size: FarFromUltraPanelSize;
  /** Which side of the figure it hangs on (−1 left, 1 right on screen). */
  side: -1 | 1;
  /** The midpoint of its inner edge (the edge facing the figure), figure px. */
  ix: number;
  iy: number;
  /** Its lean, radians (about the inner edge's midpoint). */
  rot: number;
  /** The point on the arm its tether line runs to, figure px. */
  tether: readonly [number, number];
  /** When it deploys within the interface window (share) and for how long. */
  at: number;
  span: number;
  title: string;
};

/** The auxiliary interfaces: positions in figure px where the owner's
 * painted interfaces are (ultra/suit-with-interface), panel sizes in CSS px
 * by tier (a panel is read, so it never shrinks with the figure), the
 * wrist rings as concentric ellipses about each wrist and the crown gauge
 * (the 60-second arc over the head's halo). A panel is a rectangle hung
 * from its inner edge, unfolding outward. */
export const FAR_FROM_ULTRA_HUD = {
  panels: [
    {
      id: "l1",
      kind: "dial",
      size: "tall",
      side: -1,
      ix: 192,
      iy: 586,
      rot: -0.09,
      tether: [232, 598],
      at: 0,
      span: 0.42,
      title: "SA-GA OS 6.1",
    },
    {
      id: "r1",
      kind: "bars",
      size: "tall",
      side: 1,
      ix: 832,
      iy: 586,
      rot: 0.09,
      tether: [792, 598],
      at: 0.08,
      span: 0.42,
      title: "KHAOS DEUX",
    },
    {
      id: "l2",
      kind: "text",
      size: "low",
      side: -1,
      ix: 254,
      iy: 900,
      rot: -0.24,
      tether: [250, 712],
      at: 0.2,
      span: 0.4,
      title: "P16",
    },
    {
      id: "r2",
      kind: "graph",
      size: "low",
      side: 1,
      ix: 770,
      iy: 900,
      rot: 0.24,
      tether: [774, 712],
      at: 0.28,
      span: 0.4,
      title: "KOSMOS DEUX",
    },
  ] as readonly FarFromUltraPanel[],
  /** Panel sizes [width, height] and the type sizes, CSS px: the least a
   * panel takes (it widens to fit its longest read-out in the HUD face). */
  sizes: {
    fine: { tall: [92, 150], low: [72, 112], text: 9, title: 9.5 },
    coarse: { tall: [66, 108], low: [52, 84], text: 7.5, title: 8 },
  },
  wrists: [
    { cx: 246, cy: 690, rx: 62, ry: 20, at: 0.36, span: 0.34 },
    { cx: 778, cy: 690, rx: 62, ry: 20, at: 0.4, span: 0.34 },
  ],
  /** The crown gauge starts after the system sync (FAR_FROM_ULTRA_SYNC). */
  crown: { cx: 512, cy: 54, rx: 176, ry: 30, at: 0.86, span: 0.14, label: "ウルトラ 60S" },
} as const;

/** The system sync (progress): one pulse through every panel, tether and
 * ring at once, once the last interface has settled and before the crown
 * gauge starts. */
export const FAR_FROM_ULTRA_SYNC = [0.885, 0.925] as const;

/** A panel's emergence, as shares of its own window: the emitter's beam and
 * projection cone, the wireframe tracing itself, the hex fill sweeping
 * outward, the content resolving through a glitch and scan, the read-outs
 * typing on, then settling. */
export const FAR_FROM_ULTRA_EMERGE = {
  beam: [0, 0.12],
  cone: [0.06, 0.3],
  wire: [0.1, 0.34],
  fill: [0.28, 0.52],
  glass: [0.32, 0.5],
  glitch: [0.46, 0.62],
  scan: [0.5, 0.72],
  type: [0.5, 0.86],
  settle: [0.72, 1],
} as const satisfies Record<string, readonly [number, number]>;

/** The HUD's face (the page's --fft-etch; Michroma's subset is A–Z,
 * digits and / - . : + # % & · | < >, so the read-outs use only those).
 * A form's name is katakana only (the crown's ウルトラ), drawn in the
 * page's Japanese display gothic (src/lib/far-from-fonts.ts). */
export const FAR_FROM_ULTRA_HUD_FONT =
  '"Michroma", "Oxanium", "M PLUS 1", "Hiragino Sans", "Noto Sans JP", sans-serif';

/** The read-outs the panels type on (ten characters or fewer, the face is
 * wide): terms from the record only. */
export const FAR_FROM_ULTRA_READOUTS: Record<FarFromUltraPanelKind, readonly string[]> = {
  dial: ["FARFROM", "DRIVE LINK", "SYNC"],
  bars: ["60000+ YOPS", "INF CORE", "EMP: FREE"],
  text: ["PARANORMAL", "REALIZER", "NEURAL", "RESONANCER", "P16 ONLINE"],
  graph: ["9000 TOPS", "300 CORE", "SA-GA OS"],
};
