/** ILLUSIONCULUM SAGA — the armour generated as projections (2026-10-23).
 *
 * Rexonance's armour is grown by nanites; FAR FROM's is constructed as a
 * wireframe. ILLUSIONCULUM's is PROJECTED: the form's own power (《虚像と実在
 * の境界への干渉》 — the position the enemy observes and the position where
 * the attack is real, set apart). Each plate first appears as two or three
 * projections of itself — its exact silhouette in flat, scanned light, in
 * the iridescent light paths' colours (ice, ultramarine, violet, pink) —
 * displaced from where it really is, each tied to its seat by a thin line of
 * connection. Then the projections close in on the seat, the one that is
 * real resolves into the plate (its true art, its lights still held back),
 * a thin ice edge runs round it as it locks, and the rest dissolve. After the
 * seal the scene's own light wipe lights the reactor and every crystal, and
 * the eyes and the reactor fill with the scene's pixel squares.
 *
 * Every plate's window comes from the engine's own plan (its tiles' landing
 * times: the beats bottom first, the calls' groups), so the calls, the HUD
 * and the landing order are exactly the scene's.
 *
 * The chain of forms (the runway's data-form): リアクター・モア deploys its two
 * orbs from above the shoulders — each rises out of the shoulder line as a
 * projection and arcs out to its seat, where the real orb resolves; ウルトラ
 * takes the figure from the reactor out, a slow crimson front (a thin dim
 * ring, never a flash) behind which the ウルトラ figure resolves out of its
 * projection.
 *
 * The engine (rexonance-resonance.js) calls this as RexonanceAssemblyConfig
 * `generation`; it keeps the undersuit's scan, the seal, the light, the
 * pixel squares and the rings. Contracts (the engine's): every frame a
 * closed-form function of the progress; nothing allocated in a frame (the
 * sprites are made once in prepare, the paths are batched); no shadows, no
 * filters (Android).
 */

import type {
  RexonanceAssemblyGeneration,
  RexonanceAssemblyGenerationLayer,
  RexonanceAssemblyPiece,
} from "./rexonance-resonance.js";

/** The projection's timing (shares of the runway's progress). */
export const ILLUSIONCULUM_PROJECTION_TIMING = Object.freeze({
  /** The projections appear this long before their plate's window opens. */
  lead: 0.03,
  /** The shortest window a plate resolves over. */
  minWindow: 0.024,
  /** The real plate starts to show at this share of its window. */
  real: 0.32,
  /** The edge's light, over the window's last share. */
  edge: 0.3,
});

/** How far the projections stand from the seat: shares of the figure's
 * width (the nearest, the farthest). */
export const ILLUSIONCULUM_PROJECTION_REACH = Object.freeze([0.1, 0.2] as const);

/** The light paths' colours (the owner's 群青、桃色、紫色 and the ice crystal). */
export const ILLUSIONCULUM_PROJECTION_TONES = Object.freeze([
  "rgb(166 230 255)",
  "rgb(255 143 210)",
  "rgb(169 131 255)",
  "rgb(92 124 255)",
] as const);
const EDGE = "rgb(230 248 255)";
const CRIMSON_FRONT = "rgb(184 31 58)";

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u: number) => u * u * (3 - 2 * u);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
const hash = (i: number, salt: number) => {
  let x = Math.imul((i + 1) ^ Math.imul(salt + 0x51ed27, 0x9e3779b1), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

type Canvas = HTMLCanvasElement;
type Plate = {
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
  real: Canvas;
  /** Its projections' sprites (the silhouette as scanned light), one per
   * projection in its tone, and its edge light (white). */
  ghosts: Canvas[];
  edge: Canvas;
  /** The projections' offsets (figure px) and their tones. */
  ox: Float32Array;
  oy: Float32Array;
  ot: Uint8Array;
  sx: number;
  sy: number;
};

/** The orbs' sprites for the forms that carry them (cut from those forms'
 * sheets in prepare: [x, y, radius], figure px). */
export type IllusionculumOrb = readonly [number, number, number];

export type IllusionculumProjectionOptions = {
  /** The plates' atlas (each plate's art, its alpha the plate's share). */
  atlas: () => CanvasImageSource | null;
  /** The two リアクター・モア: [x, y, radius] (figure px). */
  orbs: readonly IllusionculumOrb[];
  /** The forms that carry the orbs (the chain's keys). */
  orbForms: readonly string[];
  /** The ウルトラ forms (their change runs as the crimson front). */
  ultraForms: readonly string[];
};

function makeCanvas(document: Document, width: number, height: number): Canvas {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/** The generation's prepare / draw (the engine's `generation`). */
export function createIllusionculumProjection(
  options: IllusionculumProjectionOptions,
): RexonanceAssemblyGeneration {
  return {
    *prepare(input) {
      const { document, size, pieces, plan, core, coarse, unlit } = input;
      const { width: W, height: H } = size;
      // The atlas arrives with the scene's pictures (the config's loader);
      // a slice at a time until it has (or give up after a few seconds).
      let atlas = options.atlas();
      for (let wait = 0; !atlas && wait < 240; wait += 1) {
        yield;
        atlas = options.atlas();
      }
      if (!atlas) return null;
      const T = ILLUSIONCULUM_PROJECTION_TIMING;
      const [near, far] = ILLUSIONCULUM_PROJECTION_REACH;
      // Each plate's window: its tiles' landings in the engine's plan.
      const first = new Map<string, number>();
      const last = new Map<string, number>();
      for (const tile of plan.tiles) {
        if (!tile.pieceId) continue;
        const t0 = (tile as { t0?: number }).t0 ?? tile.t1;
        first.set(tile.pieceId, Math.min(first.get(tile.pieceId) ?? 1, t0));
        last.set(tile.pieceId, Math.max(last.get(tile.pieceId) ?? 0, tile.t1));
      }
      const projections = coarse ? 2 : 3;
      const plates: Plate[] = [];
      const piecesList = pieces as readonly (RexonanceAssemblyPiece & {
        ax?: number;
        ay?: number;
      })[];
      for (let index = 0; index < piecesList.length; index += 1) {
        const piece = piecesList[index];
        if (piece.preset || piece.ax === undefined || piece.ay === undefined) continue;
        const start = first.get(piece.id);
        const end = last.get(piece.id);
        if (start === undefined || end === undefined) continue;
        const { x, y, w, h } = piece;
        // The real plate: the unlit figure under the plate's own alpha.
        const real = makeCanvas(document, w, h);
        const rc = real.getContext("2d");
        if (!rc) continue;
        rc.drawImage(atlas, piece.ax, piece.ay, w, h, 0, 0, w, h);
        rc.globalCompositeOperation = "source-in";
        rc.drawImage(unlit, x, y, w, h, 0, 0, w, h);
        // Its projections: the same silhouette as flat light with scan lines
        // (a phone's sprites at half resolution: they are light, not detail).
        const k = coarse ? 0.5 : 1;
        const tone = Math.floor(hash(index, 3) * 4) % 4;
        // A projection is the plate's own image as light: its art's
        // luminance in the projection's hue (the "color" blend keeps the
        // plate's detail legible), lifted, with scan lines cut through it.
        const sprite = (fill: string, flat = false) => {
          const canvas = makeCanvas(document, w * k, h * k);
          const c = canvas.getContext("2d");
          if (!c) return canvas;
          c.drawImage(real, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
          c.globalCompositeOperation = flat ? "source-in" : "color";
          c.fillStyle = fill;
          c.fillRect(0, 0, canvas.width, canvas.height);
          if (!flat) {
            c.globalCompositeOperation = "screen";
            c.globalAlpha = 0.35;
            c.fillRect(0, 0, canvas.width, canvas.height);
            c.globalAlpha = 1;
            // The colour blends paint the transparent margin too: back to
            // the plate's own alpha.
            c.globalCompositeOperation = "destination-in";
            c.drawImage(real, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
          }
          c.globalCompositeOperation = "destination-out";
          c.fillStyle = "rgb(0 0 0 / 0.42)";
          for (let line = 0; line < canvas.height; line += 3) c.fillRect(0, line, canvas.width, 1);
          return canvas;
        };
        const edge = sprite(EDGE, true);
        // Each projection's place: out from the figure's centre line (and
        // up or down a little), at a reach between near and far.
        const cx = x + w / 2;
        const cy = y + h / 2;
        const ox = new Float32Array(projections);
        const oy = new Float32Array(projections);
        const ot = new Uint8Array(projections);
        const outward = cx < W / 2 ? -1 : 1;
        for (let p = 0; p < projections; p += 1) {
          const reach = (near + (far - near) * hash(index * 7 + p, 11)) * W;
          // Alternate sides: the projections are seen where the plate is not.
          const sideways = p % 2 === 0 ? outward : -outward;
          const lift = (hash(index * 13 + p, 5) - 0.5) * 0.12 * H;
          ox[p] = sideways * reach * (0.7 + 0.3 * p);
          oy[p] = lift + (cy < core[1] ? -0.02 : 0.02) * H;
          ot[p] = (tone + p + 1) % 4;
        }
        const ghosts = Array.from(ot, (t) => sprite(ILLUSIONCULUM_PROJECTION_TONES[t]));
        const window = Math.max(T.minWindow, end - start);
        plates.push({
          x,
          y,
          w,
          h,
          start: end - window,
          end,
          real,
          ghosts,
          edge,
          ox,
          oy,
          ot,
          sx: piece.seat[0],
          sy: piece.seat[1],
        });
        if (index % 4 === 3) yield;
      }
      // The orbs' projection sprites, made once (filled each frame of a change).
      const orbGhosts: Canvas[] = options.orbs.map(([, , r]) => makeCanvas(document, r * 2, r * 2));

      const layer: RexonanceAssemblyGenerationLayer = {
        draw(context, progress, calm) {
          const lead = T.lead;
          for (let pass = 0; pass < 3; pass += 1) {
            // Pass 0: the connection lines (one stroke per tone); pass 1: the
            // projections; pass 2: the real plates and their edges.
            if (pass === 0) {
              if (calm) continue;
              for (let tone = 0; tone < 4; tone += 1) {
                let any = false;
                context.beginPath();
                for (let i = 0; i < plates.length; i += 1) {
                  const plate = plates[i];
                  if (progress < plate.start - lead || progress >= plate.end) continue;
                  const u = clamp01((progress - plate.start) / (plate.end - plate.start));
                  const pull = 1 - easeOut(u);
                  for (let p = 0; p < plate.ox.length; p += 1) {
                    if (plate.ot[p] !== tone) continue;
                    context.moveTo(plate.sx, plate.sy);
                    context.lineTo(
                      plate.x + plate.w / 2 + plate.ox[p] * pull,
                      plate.y + plate.h / 2 + plate.oy[p] * pull,
                    );
                    any = true;
                  }
                }
                if (!any) continue;
                context.globalAlpha = 0.34;
                context.strokeStyle = ILLUSIONCULUM_PROJECTION_TONES[tone];
                context.lineWidth = 0.8;
                context.stroke();
              }
              continue;
            }
            for (let i = 0; i < plates.length; i += 1) {
              const plate = plates[i];
              if (progress < plate.start - lead) continue;
              if (pass === 2) {
                if (progress >= plate.end) {
                  context.globalAlpha = 1;
                  context.globalCompositeOperation = "source-over";
                  context.drawImage(plate.real, plate.x, plate.y, plate.w, plate.h);
                  continue;
                }
                const u = clamp01((progress - plate.start) / (plate.end - plate.start));
                const show = smooth(clamp01((u - T.real) / (1 - T.real)));
                if (show <= 0) continue;
                context.globalCompositeOperation = "source-over";
                context.globalAlpha = show;
                context.drawImage(plate.real, plate.x, plate.y, plate.w, plate.h);
                // The edge as it locks: its own silhouette in light, faint.
                const edge = clamp01((u - (1 - T.edge)) / T.edge);
                if (edge > 0 && !calm) {
                  context.globalCompositeOperation = "lighter";
                  context.globalAlpha = 0.22 * Math.sin(Math.PI * edge);
                  context.drawImage(plate.edge, plate.x, plate.y, plate.w, plate.h);
                }
                continue;
              }
              // The projections: in, held apart, then closing on the seat.
              if (progress >= plate.end) continue;
              const appear = smooth(clamp01((progress - (plate.start - lead)) / lead));
              const u = clamp01((progress - plate.start) / (plate.end - plate.start));
              const pull = 1 - easeOut(u);
              const fade = 1 - smooth(clamp01((u - 0.45) / 0.55));
              context.globalCompositeOperation = "lighter";
              for (let p = 0; p < plate.ox.length; p += 1) {
                const alpha = appear * fade * (0.5 - 0.1 * p);
                if (alpha <= 0.01) continue;
                context.globalAlpha = alpha;
                const gx = plate.x + plate.ox[p] * pull;
                const gy = plate.y + plate.oy[p] * pull;
                const grow = 1 + 0.06 * pull;
                const gw = plate.w * grow;
                const gh = plate.h * grow;
                context.drawImage(
                  plate.ghosts[p],
                  gx - (gw - plate.w) / 2,
                  gy - (gh - plate.h) / 2,
                  gw,
                  gh,
                );
              }
            }
          }
          context.globalAlpha = 1;
          context.globalCompositeOperation = "source-over";
        },
        form(context, from, to, fromKey, toKey, u, _tone, calm) {
          context.globalAlpha = 1;
          context.globalCompositeOperation = "source-over";
          const e = smooth(u);
          const orbsIn = options.orbForms.includes(toKey) && !options.orbForms.includes(fromKey);
          const ultraIn =
            options.ultraForms.includes(toKey) && !options.ultraForms.includes(fromKey);
          if (ultraIn) {
            // ウルトラ from the reactor out: the ウルトラ figure inside a circle
            // that grows over the change, its front a thin dim crimson ring
            // (the art itself carries the colour: no flash of red light).
            context.drawImage(from, 0, 0, W, H);
            const [cx, cy] = core;
            const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
            const radius = Math.max(0.5, reach * e);
            // Its projection first, displaced and closing (the same idea).
            if (!calm && u < 0.7) {
              context.globalCompositeOperation = "lighter";
              context.globalAlpha = 0.16 * (1 - u / 0.7);
              const shift = (1 - e) * W * 0.06;
              context.drawImage(to, -shift, 0, W, H);
              context.drawImage(to, shift, 0, W, H);
              context.globalCompositeOperation = "source-over";
            }
            context.save();
            context.beginPath();
            context.arc(cx, cy, radius, 0, Math.PI * 2);
            context.clip();
            context.clearRect(0, 0, W, H);
            context.globalAlpha = 1;
            context.drawImage(to, 0, 0, W, H);
            context.restore();
            if (u > 0 && u < 1) {
              context.globalAlpha = 0.5 * Math.sin(Math.PI * u);
              context.strokeStyle = CRIMSON_FRONT;
              context.lineWidth = 2;
              context.beginPath();
              context.arc(cx, cy, radius, 0, Math.PI * 2);
              context.stroke();
              context.globalAlpha = 1;
            }
            return true;
          }
          if (orbsIn) {
            // The body is the same in both sheets: the change is the orbs.
            context.drawImage(from, 0, 0, W, H);
            for (let k = 0; k < options.orbs.length; k += 1) {
              const [ox, oy, r] = options.orbs[k];
              const left = ox < W / 2;
              // Out of the shoulder line: from just above the shoulder, in
              // toward the neck and low, up and out along an arc to the seat.
              const fromX = ox + (left ? 1 : -1) * r * 1.1;
              const fromY = oy + r * 1.9;
              const arc = Math.sin(Math.PI * Math.min(1, e * 1.1)) * r * 0.5;
              const x = fromX + (ox - fromX) * e;
              const y = fromY + (oy - fromY) * e - arc;
              const scale = 0.42 + 0.58 * e;
              const size = r * 2 * scale;
              // Its projection, ahead of it at the seat, fading as it lands.
              const ghost = orbGhosts[k];
              const gc = ghost.getContext("2d");
              if (gc && !calm) {
                gc.globalCompositeOperation = "copy";
                gc.drawImage(to, ox - r, oy - r, r * 2, r * 2, 0, 0, r * 2, r * 2);
                gc.globalCompositeOperation = "source-in";
                gc.fillStyle = ILLUSIONCULUM_PROJECTION_TONES[k % 2 === 0 ? 0 : 2];
                gc.fillRect(0, 0, r * 2, r * 2);
                context.globalCompositeOperation = "lighter";
                context.globalAlpha = 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.15));
                context.drawImage(ghost, ox - r, oy - r, r * 2, r * 2);
                context.globalCompositeOperation = "source-over";
              }
              context.globalAlpha = smooth(clamp01(u * 1.8));
              context.drawImage(
                to,
                ox - r,
                oy - r,
                r * 2,
                r * 2,
                x - size / 2,
                y - size / 2,
                size,
                size,
              );
            }
            context.globalAlpha = 1;
            return true;
          }
          // Any other change: the next figure resolves over the last.
          context.drawImage(from, 0, 0, W, H);
          context.globalAlpha = e;
          context.drawImage(to, 0, 0, W, H);
          context.globalAlpha = 1;
          return true;
        },
        release() {
          for (const plate of plates) {
            plate.real.width = plate.real.height = 0;
            for (const ghost of plate.ghosts) ghost.width = ghost.height = 0;
            plate.edge.width = plate.edge.height = 0;
          }
          plates.length = 0;
          for (const ghost of orbGhosts) ghost.width = ghost.height = 0;
        },
      };
      return layer;
    },
  };
}
