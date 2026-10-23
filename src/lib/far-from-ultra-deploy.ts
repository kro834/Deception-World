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
