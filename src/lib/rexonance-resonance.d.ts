export interface RexonanceCountTemplate {
  prefix: string;
  suffix: string;
  width: number;
  decimals: number;
  grouped: boolean;
  value: number;
}

export function countTemplate(text: string): RexonanceCountTemplate | null;

export function formatCount(template: RexonanceCountTemplate, current: number): string;

export function mountRexonanceResonance(
  page: HTMLElement | null,
  environment?: typeof globalThis,
): () => void;

export interface RexonanceAssemblyPiece {
  readonly id: string;
  readonly group: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly seat: readonly [number, number];
  readonly tiles?: string;
  /** Its cell in the plates' atlas (and in the gold atlas). */
  readonly ax?: number;
  readonly ay?: number;
  /** On the body, finished, from the start (the driver). */
  readonly preset?: boolean;
}

export interface RexonanceAssemblyGold {
  /** The gold atlas: each plate's raw gunmetal channel, alpha the trims' mask. */
  atlas: string;
  cell: number;
  cells: Readonly<Record<string, string>>;
}

export const ASSEMBLY_GOLD: {
  delay: number;
  form: number;
  helmDelay: number;
  helm: number;
  approach: number;
  cool: number;
  glint: number;
};

export function planAssemblyGold(options: {
  pieces: readonly RexonanceAssemblyPiece[];
  gold: RexonanceAssemblyGold | undefined;
  landed: Map<string, number>;
}): {
  count: number;
  x: Float32Array;
  y: Float32Array;
  w: Float32Array;
  h: Float32Array;
  lock: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  /** Each cell's plate (its index in `pieces`). */
  piece: Int16Array;
  overlaps: Int32Array[];
} | null;

export function assemblyGoldPlanSteps(
  options: {
    pieces: readonly RexonanceAssemblyPiece[];
    gold: RexonanceAssemblyGold | undefined;
  } & (
    | { landed: Map<string, number>; tiles?: never }
    | { landed?: never; tiles: readonly Pick<RexonanceAssemblyTile, "pieceId" | "t1">[] }
  ),
): Generator<undefined, ReturnType<typeof planAssemblyGold>, unknown>;

export function rewindAssemblyGold(
  context: Pick<CanvasRenderingContext2D, "clearRect" | "drawImage">,
  art: CanvasImageSource,
  gold: {
    x: Float32Array;
    y: Float32Array;
    w: Float32Array;
    h: Float32Array;
    overlaps: Int32Array[];
  },
  state: { count: number; dirty: number; at: number },
  target: number,
  budget: number,
): number;

/** A kit's chip sheet geometry (REXONANCE_NANITE_CELLS's layout). */
export interface RexonanceAssemblyCells {
  readonly src: string;
  readonly cell: number;
  readonly mip: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly unfold: { readonly y: number; readonly x: readonly number[] };
  readonly bokeh: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly bead: { readonly x: number; readonly y: number };
  readonly spark: { readonly x: number; readonly y: number };
}

/** The nanite kit's sheet geometry (REXONANCE_NANITES, generated). */
export interface RexonanceAssemblyNanites {
  readonly cells: RexonanceAssemblyCells;
  /** A second kind of chip (FAR FROM): the chips split between the kits. */
  readonly cellsB?: RexonanceAssemblyCells;
  readonly comets: {
    readonly src: string;
    readonly rows: { readonly ice: number; readonly pink: number; readonly gold: number };
    readonly tail: readonly number[];
  };
  readonly fx: {
    readonly src: string;
    readonly clamp: {
      readonly x: number;
      readonly y: number;
      readonly cell: number;
      readonly anchor: Readonly<Record<"tl" | "tr" | "bl" | "br", readonly number[]>>;
    };
    readonly latch: { readonly x: number; readonly y: number; readonly cell: number };
    readonly scan: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly edgeY: number;
    };
    readonly drop: { readonly x: number; readonly y: number; readonly cell: number };
    readonly shock: {
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly cols: number;
      readonly centre: readonly number[];
    };
  };
  readonly guide: { readonly src: string };
  /** Each plate's real outline (base64 Int16 LE loops, quarter figure px). */
  readonly seams: Readonly<Record<string, string>>;
  /** Each plate's gold box [x, y, w, h], figure px. */
  readonly goldBoxes: Readonly<Record<string, readonly [number, number, number, number]>>;
}

// (The swarm's timings and budgets: rexonance-assembly-nanites.js.)

/** A page's palette for the scene (FAR FROM: ice, gold, white); every
 * field optional, Rexonance's by default (assemblyPalette). */
export interface RexonanceAssemblyPalette {
  /** The three chip, mosaic and pixel-square tones (sRGB triples). */
  tones?: readonly (readonly [number, number, number])[];
  /** The core's three rings (CSS colours). */
  rings?: readonly string[];
  /** The reactor's spiralling motes (three CSS colours). */
  reactorMotes?: readonly string[];
  /** The light's arms at the ignition (two CSS colours). */
  lightArms?: readonly string[];
  /** The core's glow (three gradient stops, CSS colours with alpha). */
  coreGlow?: readonly string[];
  /** The field layer's tones (rexonance-field: FieldTones). */
  field?: {
    readonly ice: readonly number[];
    readonly pink: readonly number[];
    readonly white: readonly number[];
    readonly leads?: readonly (readonly number[])[];
  };
  /** The swarm's (rexonance-assembly-nanites.js createAssemblyNanites). */
  nanites?: {
    readonly tone?: readonly string[];
    readonly shade?: readonly string[];
    readonly touchTone?: readonly string[];
    readonly touchShade?: readonly string[];
    /** The kit's sprite row for each chip tone. */
    readonly toneRows?: readonly number[];
  };
}

export function assemblyPalette(palette?: RexonanceAssemblyPalette | null): {
  tones: readonly (readonly [number, number, number])[];
  toneCss: string[];
  rings: readonly string[];
  reactorMotes: readonly string[];
  lightArms: readonly string[];
  coreGlow: readonly string[];
  field: RexonanceAssemblyPalette["field"] | null;
  nanites: RexonanceAssemblyPalette["nanites"] | null;
};

/** Pixel squares inside an outline, in six burst groups (the eyes'; the
 * reactor's). */
export function glowPixels(
  glow: readonly (readonly [number, number])[] | undefined,
  centre: readonly [number, number],
  seed?: number,
  count?: number,
): { x: number; y: number; size: number; tone: number; group: number }[];

/** A page's own draws, called by the scene each frame with the context
 * transformed to figure px: behind the figure (after the swarm's far
 * side) and over it (after the core's rings). Allocation-free, closed-form
 * in the progress. */
export interface RexonanceAssemblyAccents {
  back?(
    context: CanvasRenderingContext2D,
    progress: number,
    calm: boolean,
    width: number,
    height: number,
  ): void;
  front?(
    context: CanvasRenderingContext2D,
    progress: number,
    calm: boolean,
    width: number,
    height: number,
  ): void;
}

/** A page's own armour generation's layer (FAR FROM, 2026-10-23: the
 * wireframe, far-from-wireframe-layer.ts). Allocation-free, closed-form in
 * the progress; the context is in figure px, `vs` device px per figure px,
 * `ratio` device px per CSS px. */
export interface RexonanceAssemblyGenerationLayer {
  /** The armour at `progress`: called each frame until the seal is whole. */
  draw(
    context: CanvasRenderingContext2D,
    progress: number,
    calm: boolean,
    vs: number,
    ratio: number,
  ): void;
  /** One change of a page's chain of forms (`from` overwritten by `to`, by
   * their keys; "standard" the base figure) at `u` (0–1). False when it
   * cannot (the scene's square cells then draw it). */
  form(
    context: CanvasRenderingContext2D,
    from: CanvasImageSource,
    to: CanvasImageSource,
    fromKey: string,
    toKey: string,
    u: number,
    tone: string,
    calm: boolean,
    vs: number,
    ratio: number,
  ): boolean;
  release(): void;
}

/** A page's own armour generation (FAR FROM: 「ワイヤーフレーム風の生成方式」):
 * prepared once the plan is made (a generator the scene steps in idle
 * slices), its layer draws the armour in place of the nanite swarm, the
 * plates' paint, the gold's pour and the field. */
export interface RexonanceAssemblyGeneration {
  /** True: the nanite scene builds the armour and the layer draws over it
   * (its wire); otherwise the layer replaces the armour's build. */
  overlay?: boolean;
  prepare(input: {
    document: Document;
    size: { readonly width: number; readonly height: number };
    pieces: readonly RexonanceAssemblyPiece[];
    plan: {
      readonly tiles: readonly RexonanceAssemblyTile[];
      readonly cols: number;
      readonly rows: number;
      readonly tile: number;
    };
    core: readonly [number, number];
    visor: readonly [number, number];
    coarse: boolean;
    reactorGlow?: readonly (readonly [number, number])[];
    /** The figure with its lights held back. */
    unlit: CanvasImageSource;
    /** The gold atlas (each plate's raw gunmetal channel), if any. */
    gold?: CanvasImageSource | null;
    /** The chain's form keys to prepare ("standard" first). */
    forms: readonly string[];
    overlay?: boolean;
  }): Generator<undefined, RexonanceAssemblyGenerationLayer | null, unknown>;
}

export interface RexonanceAssemblyConfig {
  figure: string;
  undersuit: string;
  size: { readonly width: number; readonly height: number };
  pieces: readonly RexonanceAssemblyPiece[];
  maskTile?: number;
  core: readonly [number, number];
  visor: readonly [number, number];
  glow: readonly (readonly [number, number])[];
  /** The reactor's outline (FAR FROM): it fills with pixel squares that
   * scatter, like the compound eyes, on the final call. */
  reactorGlow?: readonly (readonly [number, number])[];
  /** The reactor's radius in figure px (40 by default). */
  reactorRadius?: number;
  /** The fire's end tone (rexonance-fire/fire-tuning.js FIRE_TONES): 0 the
   * clean combustion (the default), 1 gold. */
  fireTone?: number;
  /** False: the suit-up has no fire (ILLUSIONCULUM). Unset: it burns. */
  fire?: boolean;
  palette?: RexonanceAssemblyPalette;
  accents?: RexonanceAssemblyAccents;
  /** A page's own armour generation (FAR FROM: the wireframe). Without it
   * the nanite swarm builds the armour (Rexonance). */
  generation?: RexonanceAssemblyGeneration;
  gold?: RexonanceAssemblyGold;
  /** The plates' atlas (art | mosaic), for the driver's cut-outs. */
  atlas?: string;
  /** The figure without its ornaments (owner, 2026-10-16): the armour
   * assembles whole from it; the `ornaments` groups then form over it
   * from the full figure. */
  base?: string;
  ornaments?: readonly string[];
  /** The nanite kit (owner, 2026-10-16): the swarm's sprites, the
   * guideway conduit, the plates' seams and gold boxes. Optional: without
   * it the swarm plays as two-tone rect chips over the traced gold frame.
   * Either the kit or its loader (round 3: loaded with the pictures, so the
   * still tiers never download it). */
  nanites?: RexonanceAssemblyNanites | (() => Promise<RexonanceAssemblyNanites | null>);
  /** The MAX and ULTRA figures (same frame): the suit-up ends on the form
   * named by the runway's data-form. Or a page's own chain (FAR FROM:
   * `chain: ["high", "xhigh", "max"]`, each key's picture in the same
   * frame): the suit-up runs through them in order to the named form. */
  forms?:
    | {
        readonly max: string;
        readonly ultra: string;
        readonly excelsior?: string;
        /** How much wider either side the EXCELSIOR picture is than the frame. */
        readonly pad?: number;
        readonly chain?: undefined;
      }
    | ({
        readonly chain: readonly string[];
        /** Each form's light (CSS colour) as its cells overwrite the last. */
        readonly tones?: Readonly<Record<string, string>>;
        /** A form's own route through the chain (its keys in order); without
         * it a form runs the chain up to itself. */
        readonly paths?: Readonly<Record<string, readonly string[]>>;
      } & Readonly<Record<string, unknown>>);
}

export interface RexonanceAssemblyTile {
  sx: number;
  sy: number;
  tw: number;
  th: number;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
  m: number;
  t0: number;
  t1: number;
  hover: number;
  beat: number;
  tone: number;
  fill: string;
  spin: number;
  depth: number;
  curveX: number;
  curveY: number;
  pieceId: string | null;
}

export const ASSEMBLY_BEATS: {
  scan: [number, number];
  motes: [number, number];
  deus: [number, number];
  rexonance: [number, number];
  clamp: number;
  seal: [number, number];
  light: [number, number];
  form: [number, number];
  pixels: [number, number];
  rings: [number, number];
  complete: number;
};

export const ASSEMBLY_PARTS: readonly string[];
export const ASSEMBLY_TOUCH_ART_BUDGET: number;

export function assemblyCacheStep(
  current: number,
  target: number,
  budget: number,
): {
  reset: boolean;
  start: number;
  end: number;
  remove: number;
  pending: boolean;
};
export function assemblyPhase(
  progress: number,
  form?: string,
  ready?: boolean,
): {
  phase: "prepare" | "assemble" | "seal" | "ignite" | "evolve" | "complete";
  complete: boolean;
};
export function assemblyTilePose(
  item: RexonanceAssemblyTile,
  progress: number,
  out?: Float32Array,
  offset?: number,
): Float32Array;

export function planAssembly(options: {
  size: { readonly width: number; readonly height: number };
  pieces: readonly RexonanceAssemblyPiece[];
  core: readonly [number, number];
  tile: number;
  maskTile?: number;
  sample?: { data: ArrayLike<number> } | null;
  seed?: number;
}): {
  tiles: RexonanceAssemblyTile[];
  cols: number;
  rows: number;
  tile: number;
  partDone: number[];
  centroids: [number, number][];
};

export function mountRexonanceAssembly(
  runway: HTMLElement | null,
  config: RexonanceAssemblyConfig | null,
  environment?: typeof globalThis,
): () => void;
