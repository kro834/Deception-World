import { useEffect, useRef } from "react";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
  REXONANCE_SUIT_UNDERSUIT,
} from "@/lib/rexonance-suit";
import {
  rexonanceSuitPicture,
  rexonanceSuitSource,
  warmRexonanceSuit,
} from "@/lib/rexonance-suit-warmup";
import {
  FIG,
  FLIGHT,
  G,
  GOLD,
  GOLD_TOTAL,
  T,
  cells,
  forming,
  moteSheet,
  planEnd,
  planSurges,
  plateLights,
  plates,
  work,
} from "./rexonance-suit-plan";
import { REXONANCE_SUIT_LIGHT, REXONANCE_SUIT_REVEAL_MS } from "@/lib/rexonance-calls";
import { REXONANCE_SUIT_MARKS } from "@/lib/rexonance-suit";
import { reactorCoilAngle, reactorCoilScale } from "@/lib/rexonance-reactor.js";
import {
  drawBodyFlame,
  drawNaniteFlame,
  prepareBodyFlame,
  warmNaniteFlame,
} from "@/lib/rexonance-flame.js";
import {
  NANITE_FIRE_PHASES,
  entryCanonicalTime,
  naniteFlameEnvelope,
  naniteMaterialLanding,
} from "@/lib/rexonance-ignition.js";
import type { SuitExtrasEnv } from "./rexonance-suit-extras";
import { suitExtrasApi } from "./rexonance-suit-extras-hook";
import { entryFieldScore } from "@/lib/rexonance-field/field-entry";
import type { FieldLayer, FieldTake } from "@/lib/rexonance-field/index.js";

/* rx13 (owner, 2026-10-11): "subdivide extremely finely so it feels like
   nanomachines, and fit it on in turn". The armour assembles out of the
   plates' micro-tiles (REXONANCE_SUIT_TILE px squares of the artwork itself,
   ~5,700 in all): each tile streams in along the undersuit from its plate's
   seam side as a nanite mote, turns into its piece of the plate and locks
   in place, seam outward, plate after plate in the cascade's order
   (REXONANCE_SUIT_FIT).

   rx17 (owner, 2026-10-11): "the gold parts are formed by nanomachines
   right after each part is fitted". A plate now streams in and seats with
   its trims unformed — raw gunmetal channels (the gold atlas, drawn over
   the art once into a working copy of the atlas, `forming`) — and from its
   clank gold nanites (REXONANCE_SUIT_GOLD_CELL px cells, ~10,000 in all)
   run along the trims from the seat outward, like molten metal through a
   channel: each a white-hot mote that flies in from upstream, locks (its
   cell of the art is drawn into `forming`) and cools through bright gold
   to the painted gold; a glint then runs the finished trim, and each DEUS！
   accent sends a surge on through its whole group's gold. Once a plate's
   last gold cell has locked it is painted whole onto the settled canvas
   from the art itself, so the finished suit is the artwork exactly; only
   plates still assembling or forming are drawn each frame, and the gold's
   light is batched into a few paths per frame.

   The engine follows the overlay's own clock (the call meter's CSS
   animation), so it stays in step with the calls, with frame audits that
   seek the document's animations, and with a late start. It runs only in
   the full tier while the suit builds, and only if its layers are decoded
   (shared with the warm-up: ImageBitmaps where supported) before the first
   tile is due; otherwise the DOM plates play instead. Its plan and working
   atlas are prepared in idle time ahead of the call (rexonance-suit-plan).
   It never runs after the overlay closes.

   Owner (2026-10-16, 「超大幅な改善で。」): when the nanite kit is decoded and
   its extras prepared before the call (rexonance-suit-extras), the engine
   decides once, at its start, to draw them too: Blender hex chips born from
   the core into an orbital cocoon, rivers through each plate's gate, aim,
   dive, unfold and lock; each plate staged in raw nanite metal over its
   shadow, latched, clamped, seated with a seam of light, a shock ring and
   spall, and painted from the seat; each trim's 3D gold guideway built on
   the body from the toe tips up (never laid over it from above), printed
   onto the plate and poured molten. Its canvases then bleed past
   the figure on fine pointers (data-bleed), every draw sits under the
   figure's offset, and the plan, clock, gold and light below are
   unchanged. Otherwise today's call plays. */

/** The engine takes over only if it is ready before the first tile is due. */
const START_BY = 420;
// One shared quiet-kindling / explosive-front / material-handoff clock.
const CALL_FLAME_MS = 2400;
const MATERIAL_FROM = CALL_FLAME_MS * NANITE_FIRE_PHASES.materialStart;

// The extras through their hook (round 3, review 33): the call's chunk never
// imports them, so a still tier never downloads the kit's code; until the
// kit's warm-up has loaded and prepared them, the classic engine plays.
const isRexonanceNaniteReady = () => suitExtrasApi()?.ready() ?? false;
const createSuitExtras = (env: SuitExtrasEnv) => suitExtrasApi()?.create(env) ?? null;

// The gold's light, batched per frame: a formed cell cools from white-hot
// through molten gold to the painted gold, as a square that shrinks into
// its cell (so the front glitters, cell by cell, instead of washing over
// the trim); the glints' head and trail. [colour, alpha, size of the cell].
const HEAT = [
  ["#fff3c4", 0.76, 0.6],
  ["#ffc642", 0.46, 0.48],
  ["#e08a1e", 0.2, 0.34],
] as const;
// A tight, faint halo rather than a gold wash over neighbouring crystals.
// A cell touching a thin trim is not itself entirely metal: keep the hot
// grain smaller than the cell so the artwork's bevel remains legible.
const BLOOM = ["#ffb02e", 0.1, 1.4] as const;
const GLINT = [
  ["#fffdf3", 0.44, 0.68],
  ["#ffe39a", 0.22, 0.54],
] as const;
/** With the extras, a gold mote by its approach (its size, figure px): far
 * (e < 0.6) faint, closing in (e < 0.9) dim, about to lock bright. */
const MOTE_MID = G * (0.22 + 0.42 * 0.6);
const MOTE_NEAR = G * (0.22 + 0.42 * 0.9);
const MOTE_A = [0.08, 0.22, 0.65] as const;

/** The light's wave is drawn in this many arcs (each fades near an edge). */
const RING_ARCS = 48;

/* RESONANCE FIELD (owner, 2026-10-21: 「装着方式はダイナミックでありつつ、何度
   見ても飽きない様な革新性や素晴らしさを追求して」): the call's engine also
   runs the field (src/lib/rexonance-field) — a WebGL layer of nanites on
   helical field lines about the body, charged on RIDER！, converging on each
   group as it prints, whipping on every DEUS！, imploding into the reactor
   from the helmet's clamp and detonating with the light — with its camera
   (a push, a punch on each lock, a follow, exact identity again before the
   light) on the figure's box and its impact grammar on the flight canvas.
   Its chunk is imported here, lazily, and joins when it arrives (every
   value is closed-form in the call clock, so a late start is seamless); a
   visit's take is rolled once per call. Nothing here touches the pinned
   clocks, plan, gold or light; the finished frame is the classic call's. */
type FieldLib = typeof import("@/lib/rexonance-field/index.js");
/** The camera's inline writes are quantized so a settled frame writes nothing. */
const CAMERA_STEP = 0.0005;

export function SuitNanites({ onReady }: { onReady: (rich: boolean) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let stop = () => {};
    void warmNaniteFlame();
    // rx17: the engine begins on the overlay's next frame, never inside the
    // task that mounts it (its style and layout reads would force the whole
    // overlay's style there).
    const begin = () => {
      frame = 0;
      const box = host.current;
      const build = box?.parentElement;
      const meter = box?.closest(".rx-call-sequence")?.querySelector(".rx-call-meter > i");
      if (cancelled || !box || !build || !meter || getComputedStyle(build).display === "none")
        return;
      let elapsed = 0;
      const clock = () => {
        const animation = meter.getAnimations()[0];
        if (!animation) return null;
        elapsed = Number(animation.currentTime);
        return entryCanonicalTime(elapsed);
      };
      const start = () => {
        const now = clock();
        if (cancelled || now === null || now > START_BY || !box.clientWidth) return;
        const atlas = rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src);
        const raw = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
        if (!atlas || !raw) return;
        const bare = rexonanceSuitPicture(REXONANCE_SUIT_UNDERSUIT);
        if (bare) prepareBodyFlame(bare, FIG);
        const atlasWork = forming(atlas, raw);
        // Touch screens draw at up to 1.25x (the tiles are 9 px of art; a 2x
        // backing store only doubled the fill work on a tablet).
        const coarse = Boolean(
          globalThis.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches,
        );
        const scale = Math.min(coarse ? 1.25 : 2, globalThis.devicePixelRatio || 1);
        // The extras are decided once, here (2026-10-16); on fine pointers
        // the flight canvas then bleeds past the figure (CSS) for the cocoon
        // and spall, and the settled canvas shares its box (below).
        const rich = isRexonanceNaniteReady();
        // Fire now rolls outside the silhouette on touch screens too.
        // Both canvases still receive the same pixel-aligned box below.
        box.dataset.bleed = "";
        const make = () => {
          const canvas = globalThis.document.createElement("canvas");
          box.append(canvas);
          return canvas;
        };
        const settledCanvas = make();
        const flightCanvas = make();
        settledCanvas.width = Math.round(box.clientWidth * scale);
        settledCanvas.height = Math.round(box.clientHeight * scale);
        // The flight canvas's bleed (the stylesheet's) cut to whole pixels,
        // never past it. Review 2026-10-16, owner:
        // 「前がけの生成完了時にズレるのを修正して。」 A seated plate is drawn on
        // the flight canvas until its gold is whole and then on the settled
        // canvas, and the browser snaps each canvas's box to whole pixels on
        // its own: with the bleed in percent of the figure, the two canvases'
        // pixels fell up to 2 device px apart and each plate jumped as it
        // changed canvas. Now the flight canvas's edges lie a whole number of
        // CSS, backing and device pixels outside the figure's, so both boxes
        // snap alike, and its backing store is the settled canvas's plus those
        // pixels (round 4: the settled canvas then takes the same box, below).
        // The figure's transforms are translations, alike on both rects.
        const outer = flightCanvas.getBoundingClientRect();
        const inner = box.getBoundingClientRect();
        const dpr = globalThis.devicePixelRatio || 1;
        const exact = (value: number) => Math.abs(value - Math.round(value)) < 1e-3;
        // The CSS px that are whole in every pixel: 1 at 1x and 2x, 2 at 1.5x.
        const step = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => exact(n * scale) && exact(n * dpr)) ?? 1;
        const cut = (value: number) => Math.max(0, Math.floor(value / step + 1e-6) * step);
        const left = cut(inner.left - outer.left);
        const top = cut(inner.top - outer.top);
        const right = cut(outer.right - inner.right);
        const bottom = cut(outer.bottom - inner.bottom);
        const ox = Math.round(left * scale);
        const oy = Math.round(top * scale);
        const width = settledCanvas.width + ox + Math.round(right * scale);
        const height = settledCanvas.height + oy + Math.round(bottom * scale);
        // The figure's scale, from its own backing (before the settled
        // canvas takes the bled box).
        const s = settledCanvas.width / FIG.width;
        // Round 4 (patch A): the settled canvas shares the flight canvas's
        // box and backing, and draws the finished plates under the same
        // whole-pixel offset. Chrome snapped its figure-sized layer (856
        // backing px over 428.22 CSS px, shown at 858 device px) apart from
        // the bled one, leaving 0.16 device px across at each hand-off; two
        // identical boxes snap alike, so a plate changes canvas in place. The
        // finished frame moves by that same sub-pixel snap. Touch screens do
        // not bleed: both canvases stay on the figure's box, as before.
        settledCanvas.width = width;
        settledCanvas.height = height;
        flightCanvas.width = width;
        flightCanvas.height = height;
        if (left + top + right + bottom > 0)
          for (const canvas of [settledCanvas, flightCanvas])
            Object.assign(canvas.style, {
              left: `${-left}px`,
              top: `${-top}px`,
              width: `calc(100% + ${left + right}px)`,
              height: `calc(100% + ${top + bottom}px)`,
            });
        // Round 3 (owner 「更にブラッシュアップして」): what the flight canvas
        // leaves clear, from the figure's origin in device px — its own edges
        // (sprites fade out within `fence[4]` of them, so nothing meets a
        // straight cut) and the HUD's P14 / FINAL ARRIVAL label where it
        // overlaps the bleed (nothing draws over its glyphs).
        const fence = new Float32Array(9);
        fence[0] = -ox;
        fence[1] = -oy;
        fence[2] = width - ox;
        fence[3] = height - oy;
        fence[4] = (coarse ? 8 : 20) * scale;
        const label = box
          .closest(".rx-call-sequence")
          ?.querySelector(".rx-call-caption > span:last-child")
          ?.getBoundingClientRect();
        if (label && label.width > 0 && label.height > 0) {
          const x0 = Math.floor((label.left - inner.left - 6) * scale);
          const y0 = Math.floor((label.top - inner.top - 4) * scale);
          const x1 = Math.ceil((label.right - inner.left + 6) * scale);
          const y1 = Math.ceil((label.bottom - inner.top) * scale);
          if (x0 < fence[2] && x1 > fence[0] && y0 < fence[3] && y1 > fence[1]) {
            fence[5] = x0;
            fence[6] = y0;
            fence[7] = x1;
            fence[8] = y1;
          }
        }
        const keepOut = fence[7] > fence[5];
        const settled = settledCanvas.getContext("2d");
        const flight = flightCanvas.getContext("2d");
        // The field (its chunk arrives in a frame or two; the call goes on
        // without it until then, and without it altogether if WebGL is not
        // to be had). Its canvases take the flight canvas's box, before the
        // engine's own two so `canvas:last-child` stays the flight canvas.
        let fieldLib: FieldLib | null = null;
        let field: FieldLayer | null = null;
        let fieldTake: FieldTake | null = null;
        let fieldState: Float32Array | null = null;
        let fieldCamera: Float32Array | null = null;
        const fieldScore = entryFieldScore();
        const figure = box.closest(".rx-suit-figure") as HTMLElement | null;
        let cameraZoom = 1;
        let cameraX = 0;
        let cameraY = 0;
        let fieldDone = false;
        const fieldWidth = box.clientWidth + left + right;
        const fieldHeight = box.clientHeight + top + bottom;
        const fieldScale = s / scale;
        const restCamera = () => {
          if (!figure) return;
          if (cameraZoom !== 1 || cameraX !== 0 || cameraY !== 0) {
            figure.style.scale = "";
            figure.style.translate = "";
            figure.style.transformOrigin = "";
          }
          cameraZoom = 1;
          cameraX = 0;
          cameraY = 0;
        };
        const quantize = (value: number) => Math.round(value / CAMERA_STEP) * CAMERA_STEP;
        const moveCamera = (camera: Float32Array) => {
          if (!figure) return;
          const zoom = quantize(camera[0]);
          const x = quantize(camera[1]) * box.clientHeight;
          const y = quantize(camera[2]) * box.clientHeight;
          if (zoom === cameraZoom && x === cameraX && y === cameraY) return;
          if (zoom === 1 && x === 0 && y === 0) {
            restCamera();
            return;
          }
          if (cameraZoom === 1 && cameraX === 0 && cameraY === 0)
            figure.style.transformOrigin = `50% ${(camera[3] * 100).toFixed(1)}%`;
          cameraZoom = zoom;
          cameraX = x;
          cameraY = y;
          figure.style.scale = zoom === 1 ? "" : zoom.toFixed(4);
          figure.style.translate =
            x === 0 && y === 0
              ? ""
              : `calc(-50% + ${x.toFixed(2)}px) calc(-50% + ${y.toFixed(2)}px)`;
        };
        const releaseField = () => {
          fieldDone = true;
          field?.release();
          field = null;
          restCamera();
        };
        void import("@/lib/rexonance-field/index.js").then(
          (lib) => {
            if (cancelled || fieldDone) return;
            fieldLib = lib;
            fieldTake = lib.fieldTake(lib.fieldVisitSeed(globalThis));
            fieldState = lib.fieldStateBuffer();
            fieldCamera = lib.fieldCameraBuffer();
            const layer = lib.createFieldLayer({
              document: globalThis.document,
              coarse,
              take: fieldTake,
              className: "rx-suit-field",
            });
            if (!layer) return;
            for (const canvas of layer.canvases) {
              if (left + top + right + bottom > 0)
                Object.assign(canvas.style, {
                  left: `${-left}px`,
                  top: `${-top}px`,
                  width: `calc(100% + ${left + right}px)`,
                  height: `calc(100% + ${top + bottom}px)`,
                });
              box.insertBefore(canvas, settledCanvas);
            }
            layer.resize(fieldWidth, fieldHeight, globalThis.devicePixelRatio || 1);
            field = layer;
          },
          () => undefined,
        );
        const source = work.canvas;
        const all = plates();
        const sheet = moteSheet(atlas);
        if (!atlasWork || !source || !sheet || !settled || !flight) {
          box.replaceChildren();
          return;
        }
        work.dirty = true;
        settled.setTransform(1, 0, 0, 1, ox, oy);
        // Round 3 (review 30): a pass of the extras that throws drops them
        // for the rest of the call (tick), and the classic engine draws on.
        let extras = rich
          ? createSuitExtras({ flight, s, ox, oy, all, gold: cells(), source, sheet, fence })
          : null;
        const used = Boolean(extras);
        const surges = planSurges();
        const end = planEnd();
        const gold = cells();
        // Per plate: settled (its art painted whole), and its gold cells
        // locked into the working atlas so far.
        const done = new Uint8Array(all.length);
        const locked = Int32Array.from(all, (plate) => plate.first);
        // The batches (cell indices; the motes' own boxes).
        const heat = HEAT.map(() => new Int32Array(GOLD_TOTAL));
        const heats = new Int32Array(HEAT.length);
        const glint = GLINT.map(() => new Int32Array(GOLD_TOTAL));
        const glints = new Int32Array(GLINT.length);
        const motes = new Float32Array(GOLD_TOTAL * 3);
        let moteCount = 0;
        let last = -1;
        // The lights are held back while the suit assembles (owner): its
        // plates settle with their ice-cyan and pink in monochrome, and once
        // the whole suit is on they light from the reactor out.
        const held = plateLights();
        const art = held?.unlit ?? atlas;
        const [coreX, coreY] = REXONANCE_SUIT_MARKS.core;
        const reach = Math.hypot(
          Math.max(coreX, FIG.width - coreX),
          Math.max(coreY, FIG.height - coreY),
        );
        let lit = !held;
        // The lights on the figure, composed once ahead of the call.
        const paintLights = (target: CanvasRenderingContext2D) =>
          target.drawImage(held!.figure, 0, 0, FIG.width * s, FIG.height * s);
        const settle = (index: number) => {
          const { piece } = all[index];
          settled.drawImage(
            art,
            piece.ax,
            piece.ay,
            piece.w,
            piece.h,
            piece.x * s,
            piece.y * s,
            piece.w * s,
            piece.h * s,
          );
          done[index] = 1;
        };
        const reset = () => {
          settled.setTransform(1, 0, 0, 1, 0, 0);
          settled.clearRect(0, 0, width, height);
          settled.setTransform(1, 0, 0, 1, ox, oy);
          done.fill(0);
          for (let p = 0; p < all.length; p += 1) locked[p] = all[p].first;
          work.dirty = true;
          forming(atlas, raw);
          work.dirty = true;
          lit = !held;
        };
        const glow = (
          list: Int32Array,
          count: number,
          [colour, alpha, size]: readonly [string, number, number],
        ) => {
          if (!count) return;
          flight.globalAlpha = alpha;
          flight.fillStyle = colour;
          flight.beginPath();
          for (let k = 0; k < count; k += 1) {
            const i = list[k];
            const w = gold.cw[i] * size;
            const h = gold.ch[i] * size;
            flight.rect(
              (gold.fx[i] + (gold.cw[i] - w) / 2) * s,
              (gold.fy[i] + (gold.ch[i] - h) / 2) * s,
              w * s,
              h * s,
            );
          }
          flight.fill();
        };
        // The pinned grains: the cooling cells, the glint and the gold motes
        // in flight. With the extras they lie under the molten band (round 3,
        // owner 「更にブラッシュアップして」: the band is the pour's hero), and
        // the motes still far from their cells are faint, so the bright ones
        // gather at the band's head instead of dotting the whole trim.
        const grains = () => {
          glow(heat[0], heats[0], BLOOM);
          for (let k = HEAT.length - 1; k >= 0; k -= 1) glow(heat[k], heats[k], HEAT[k]);
          for (let k = GLINT.length - 1; k >= 0; k -= 1) glow(glint[k], glints[k], GLINT[k]);
          if (!moteCount) return;
          flight.fillStyle = "#fff8de";
          for (let pass = extras ? 0 : 2; pass < 3; pass += 1) {
            flight.globalAlpha = extras ? MOTE_A[pass] : 0.86;
            flight.beginPath();
            for (let k = 0; k < moteCount; k += 1) {
              const size = motes[k * 3 + 2];
              if (extras && (size < MOTE_MID ? 0 : size < MOTE_NEAR ? 1 : 2) !== pass) continue;
              flight.rect(
                motes[k * 3] * s,
                motes[k * 3 + 1] * s,
                motes[k * 3 + 2] * s,
                motes[k * 3 + 2] * s,
              );
            }
            flight.fill();
          }
        };
        const draw = (t: number) => {
          if (t < last) reset();
          last = t;
          flight.setTransform(1, 0, 0, 1, 0, 0);
          flight.clearRect(0, 0, width, height);
          flight.setTransform(1, 0, 0, 1, ox, oy);
          if (keepOut) {
            // The label stays clear (round 3): the frame is drawn around it.
            flight.save();
            flight.beginPath();
            flight.rect(fence[0], fence[1], fence[2] - fence[0], fence[3] - fence[1]);
            flight.rect(fence[5], fence[6], fence[7] - fence[5], fence[8] - fence[6]);
            flight.clip("evenodd");
          }
          heats.fill(0);
          glints.fill(0);
          moteCount = 0;
          // The extras' back of the frame: the cocoon behind, the guideways
          // built on the body ahead of each plate, the lifted plates' shadows.
          extras?.before(t);
          // The nanites' source (owner, 2026-10-18): the forest-green flame
          // at the reactor, burning as the first plates stream in.
          const flamePhase = t / CALL_FLAME_MS;
          const flame = naniteFlameEnvelope(flamePhase);
          const material = t >= MATERIAL_FROM;
          if (flame > 0) {
            // The choreography lingers, while the fire itself keeps rolling
            // at real speed throughout the longer vortex window.
            drawBodyFlame(flight, FIG, flame, elapsed / 1000, s, "back", flamePhase);
            drawNaniteFlame(flight, REXONANCE_SUIT_MARKS.core, flame, elapsed / 1000, s);
          }
          for (let p = 0; p < all.length; p += 1) {
            const plate = all[p];
            if ((!material && plate.fit > 0) || t < plate.spawn || (done[p] && t >= plate.last))
              continue;
            const { piece } = plate;
            if (t < plate.fit && extras) {
              // Staged in raw metal under its jig; its tiles fly the river,
              // aim, dive, unfold and lock onto it.
              extras.forming(p, t);
              continue;
            }
            if (t < plate.fit) {
              // The classic canvas path uses the same real coil artwork and
              // reactor clock as the richer kit. Only this isolated atlas
              // piece rotates: the disc and neighbouring chest stay put.
              const coil = piece.id === "core-swirl";
              if (coil) {
                const u = (t - plate.fit + REXONANCE_SUIT_REVEAL_MS) / REXONANCE_SUIT_REVEAL_MS;
                const angle = reactorCoilAngle(u);
                const scale = reactorCoilScale(u);
                const cos = Math.cos(angle) * scale;
                const sin = Math.sin(angle) * scale;
                flight.save();
                flight.setTransform(
                  cos,
                  sin,
                  -sin,
                  cos,
                  (coreX - cos * coreX + sin * coreY) * s + ox,
                  (coreY - sin * coreX - cos * coreY) * s + oy,
                );
              }
              // The tiles that have locked: one clip of their cells and one
              // draw of the plate. Drawn one by one at the canvas's scale,
              // their resampled edges left a dark lattice between them, so a
              // forming plate looked chopped into squares (owner, 2026-10-15).
              let locked = false;
              flight.save();
              flight.beginPath();
              for (const tile of plate.tiles) {
                if (t < naniteMaterialLanding(tile.land, plate.fit)) continue;
                const x0 = Math.round(tile.dx * s);
                const y0 = Math.round(tile.dy * s);
                flight.rect(
                  x0,
                  y0,
                  Math.round((tile.dx + tile.tw) * s) - x0,
                  Math.round((tile.dy + tile.th) * s) - y0,
                );
                locked = true;
              }
              if (locked) {
                flight.clip();
                flight.globalAlpha = 1;
                flight.drawImage(
                  source,
                  piece.ax,
                  piece.ay,
                  piece.w,
                  piece.h,
                  piece.x * s,
                  piece.y * s,
                  piece.w * s,
                  piece.h * s,
                );
              }
              flight.restore();
              for (const tile of plate.tiles) {
                const land = naniteMaterialLanding(tile.land, plate.fit);
                const flightStart = Math.max(MATERIAL_FROM, land - FLIGHT);
                const u = (t - flightStart) / (land - flightStart);
                if (u <= 0 || u >= 1) continue;
                const e = 1 - (1 - u) ** 3;
                const x = (tile.dx + tile.ox * (1 - e)) * s;
                const y = (tile.dy + tile.oy * (1 - e)) * s;
                if (u < 0.62) {
                  // A nanite mote, streaming in: its own tile of the art in
                  // its tone (the mote sheet), so even now the suit's edge is
                  // the artwork's edge (owner, 2026-10-15).
                  const size = T * s * (0.3 + 0.4 * (u / 0.62));
                  flight.globalAlpha = Math.min(1, u * 5) * 0.85;
                  flight.drawImage(
                    sheet,
                    tile.sx,
                    tile.sy,
                    tile.tw,
                    tile.th,
                    x + (tile.tw * s - size * (tile.tw / T)) / 2,
                    y + (tile.th * s - size * (tile.th / T)) / 2,
                    size * (tile.tw / T),
                    size * (tile.th / T),
                  );
                } else {
                  // It turns into its piece of the plate (gold unformed) and
                  // locks: whole and on the pixel grid, fading up, its mote's
                  // light fading into it. (It used to grow into place from
                  // 72%: the gaps that opened between neighbours, and the
                  // seams of tiles drawn off the pixel grid, read as a plate
                  // chopped into squares — owner, 2026-10-15.)
                  const v = (u - 0.62) / 0.38;
                  const x0 = Math.round(x);
                  const y0 = Math.round(y);
                  const w = Math.round(x + tile.tw * s) - x0;
                  const h = Math.round(y + tile.th * s) - y0;
                  flight.globalAlpha = 0.55 + 0.45 * v;
                  flight.drawImage(source, tile.sx, tile.sy, tile.tw, tile.th, x0, y0, w, h);
                  flight.globalAlpha = 0.6 * (1 - v);
                  flight.drawImage(sheet, tile.sx, tile.sy, tile.tw, tile.th, x0, y0, w, h);
                }
              }
              if (coil) flight.restore();
              continue;
            }
            // Seated. Its gold cells lock as they are due. The working atlas
            // is never written during the call (owner, 2026-10-11: a canvas
            // drawn into and drawn from in the same frame is copied whole by
            // Safari each time): the plate is drawn raw, then its locked
            // cells from the art, through one clip.
            if (!done[p]) {
              if (t >= plate.to) {
                locked[p] = plate.end;
                settle(p);
              } else {
                while (locked[p] < plate.end && gold.lock[locked[p]] <= t) locked[p] += 1;
                flight.globalAlpha = 1;
                // Seated: metal until the paint reaches each tile (extras).
                if (extras) extras.seat(p, t);
                else
                  flight.drawImage(
                    source,
                    piece.ax,
                    piece.ay,
                    piece.w,
                    piece.h,
                    piece.x * s,
                    piece.y * s,
                    piece.w * s,
                    piece.h * s,
                  );
                if (locked[p] > plate.first) {
                  flight.save();
                  flight.beginPath();
                  for (let i = plate.first; i < locked[p]; i += 1)
                    flight.rect(gold.fx[i] * s, gold.fy[i] * s, gold.cw[i] * s, gold.ch[i] * s);
                  flight.clip();
                  flight.drawImage(
                    art,
                    piece.ax,
                    piece.ay,
                    piece.w,
                    piece.h,
                    piece.x * s,
                    piece.y * s,
                    piece.w * s,
                    piece.h * s,
                  );
                  flight.restore();
                }
                extras?.unseat();
              }
            }
            // The conduit over the seated plate, receding behind the pour.
            extras?.conduit(p, t);
            if (plate.end === plate.first) continue;
            // The gold's light: motes in flight, cells cooling, the glint.
            const sweep = (t - plate.to) / GOLD.glint;
            const head = sweep * 1.3 - 0.1;
            for (let i = plate.first; i < plate.end; i += 1) {
              const lock = gold.lock[i];
              if (lock > t + GOLD.approach) break;
              if (lock > t) {
                const u = 1 - (lock - t) / GOLD.approach;
                const e = 1 - (1 - u) * (1 - u);
                const size = G * (0.22 + 0.42 * e);
                motes[moteCount * 3] = gold.fx[i] + gold.ox[i] * (1 - e) + (G - size) / 2;
                motes[moteCount * 3 + 1] = gold.fy[i] + gold.oy[i] * (1 - e) + (G - size) / 2;
                motes[moteCount * 3 + 2] = size;
                moteCount += 1;
              } else if (t - lock < GOLD.cool) {
                const v = (t - lock) / GOLD.cool;
                const k = v < 0.22 ? 0 : v < 0.55 ? 1 : 2;
                heat[k][heats[k]++] = i;
              } else if (sweep > 0 && sweep < 1) {
                const behind = head - gold.order[i];
                if (behind >= 0 && behind < 0.12) {
                  const k = behind < 0.04 ? 0 : 1;
                  glint[k][glints[k]++] = i;
                }
              }
            }
          }
          // The accents' surges: a band of light out from the DEUS！ seat
          // through the group's formed gold.
          for (const surge of surges) {
            if (t < surge.from || t >= surge.to) continue;
            const head = ((t - surge.from) / (surge.to - surge.from)) * 1.2;
            for (let k = 0; k < surge.cells.length; k += 1) {
              const behind = head - surge.reach[k];
              if (behind < 0) break;
              if (behind >= 0.12) continue;
              const i = surge.cells[k];
              if (gold.lock[i] + GOLD.cool > t) continue;
              const bucket = behind < 0.04 ? 0 : 1;
              glint[bucket][glints[bucket]++] = i;
            }
          }
          // With the extras, the pinned grains first: the front passes (seams,
          // rings, spall, links, latches, clamps, the molten band and its
          // droplets, the front of the cocoon) come after the light, over them.
          if (extras && material) grains();
          // The suit is whole: the reactor ignites and the light runs out
          // through the body; a bloom rides it and settles.
          if (held && t >= REXONANCE_SUIT_LIGHT.from) {
            const u = Math.min(1, (t - REXONANCE_SUIT_LIGHT.from) / REXONANCE_SUIT_LIGHT.spread);
            if (u >= 1 && !lit) {
              lit = true;
              paintLights(settled);
            }
            const radius = reach * (1 - (1 - u) ** 3) * s;
            flight.save();
            flight.beginPath();
            flight.arc(coreX * s, coreY * s, Math.max(1, radius), 0, Math.PI * 2);
            flight.clip();
            if (!lit) {
              flight.globalAlpha = 1;
              paintLights(flight);
            }
            flight.restore();
            // The light's front: a wave from the reactor, fading as it settles.
            // Round 3: drawn in arcs, each fading out as it nears the flight
            // canvas's edges, so the wave never ends on a straight cut.
            const bloom = 1 - (t - REXONANCE_SUIT_LIGHT.from) / REXONANCE_SUIT_LIGHT.bloom;
            if (bloom > 0 && u < 1) {
              flight.strokeStyle = "#c8f5ff";
              flight.lineWidth = 6 * s;
              const r = Math.max(1, radius);
              const margin = fence[4] + 3 * s;
              for (let k = 0; k < RING_ARCS; k += 1) {
                const a0 = (Math.PI * 2 * k) / RING_ARCS;
                const mid = a0 + Math.PI / RING_ARCS;
                const x = coreX * s + r * Math.cos(mid);
                const y = coreY * s + r * Math.sin(mid);
                let edge = x - fence[0];
                if (fence[2] - x < edge) edge = fence[2] - x;
                if (y - fence[1] < edge) edge = y - fence[1];
                if (fence[3] - y < edge) edge = fence[3] - y;
                if (edge <= 0) continue;
                const f = edge < margin ? edge / margin : 1;
                flight.globalAlpha = 0.7 * bloom * f * f * (3 - 2 * f);
                flight.beginPath();
                flight.arc(coreX * s, coreY * s, r, a0, a0 + (Math.PI * 2) / RING_ARCS + 0.004);
                flight.stroke();
              }
              flight.globalAlpha = 1;
            }
          }
          if (extras) extras.after(t);
          else if (material) grains();
          // The field: its state at this clock, its camera on the figure's
          // box, its impact grammar (the pop and the rays of the freshest
          // lock) on the flight canvas, its lines on its own canvases.
          // (The camera and the impacts are the field's: without its layer,
          // no WebGL, the call is exactly the call it was.)
          if (field && fieldLib && fieldState && fieldCamera && fieldTake) {
            fieldLib.fieldState(fieldScore, t, fieldState);
            fieldLib.fieldCamera(fieldState, fieldTake, FIG.height, fieldCamera);
            moveCamera(fieldCamera);
            // (Fine pointers: the rays. No composite operation here, so no
            // disc pop: the lock's flash is the field's and the camera's.)
            if (!coarse && fieldState[fieldLib.FIELD_STATE.IMPULSES] > 0) {
              flight.save();
              flight.scale(s, s);
              fieldLib.drawFieldImpact(
                flight,
                fieldState,
                FIG.width,
                FIG.height,
                fieldLib.fieldHash,
                true,
                false,
              );
              flight.restore();
            }
            field.render(
              fieldState,
              fieldScale,
              left,
              top,
              FIG.height,
              extras?.governed() ? 0.5 : 1,
            );
          }
          if (flame > 0) drawBodyFlame(flight, FIG, flame, elapsed / 1000, s, "front", flamePhase);
          // Burning fragments carry material out of the broad fire. Their
          // machine crossfade remains visible on the near side of the plume.
          extras?.firebrands(t);
          flight.globalAlpha = 1;
          if (keepOut) flight.restore();
        };
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          work.drawing -= 1;
          flight.setTransform(1, 0, 0, 1, 0, 0);
          flight.clearRect(0, 0, width, height);
          // The field is gone and the camera at rest before the finished
          // frame (its canvases removed, its context released).
          releaseField();
          // A call that drew its swarm hands RIDER！'s motes back their own end
          // state (the finished frame is the classic call's exactly). One
          // that started before the kit was ready leaves the kit to the next
          // route's warm (review 2026-10-16: never on the page it lands on).
          if (extras) ready.current(false);
          // Keep one prepared kit for visible World/Rexonance return visits;
          // its retention policy releases it on other routes or when hidden.
          if (used) suitExtrasApi()?.release();
          for (let p = 0; p < all.length; p += 1) if (!done[p]) settle(p);
          if (!lit) {
            lit = true;
            paintLights(settled);
          }
        };
        stop = () => {
          if (!finished) work.drawing -= 1;
          finished = true;
          releaseField();
          if (used) suitExtrasApi()?.release();
        };
        const tick = () => {
          frame = 0;
          if (cancelled) return;
          const t = clock();
          // The meter's covering clock ends at the hand-over: all plates seat
          // and the last gold has formed and cooled long before.
          if (
            t === null ||
            t >= Math.max(end, REXONANCE_SUIT_LIGHT.from + REXONANCE_SUIT_LIGHT.bloom)
          ) {
            finish();
            return;
          }
          const began = performance.now();
          try {
            draw(t);
          } catch {
            if (!extras) {
              finish();
              return;
            }
            // The extras threw: drop them, settle the canvas's state, and
            // let the classic engine (and RIDER！'s motes) carry the call.
            extras = null;
            if (typeof flight.reset === "function") flight.reset();
            else for (let k = 0; k < 32; k += 1) flight.restore();
            flight.setTransform(1, 0, 0, 1, 0, 0);
            flight.globalAlpha = 1;
            flight.clearRect(0, 0, width, height);
            ready.current(false);
          }
          if (extras) {
            extras.cost(performance.now() - began);
            if (extras.governed() && !("governed" in box.dataset)) box.dataset.governed = "";
          }
          frame = globalThis.requestAnimationFrame(tick);
        };
        work.drawing += 1;
        ready.current(Boolean(extras));
        draw(now);
        frame = globalThis.requestAnimationFrame(tick);
      };
      if (
        rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src) &&
        rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src)
      )
        start();
      // A late start: the warm-up already in flight (at high priority now).
      else void warmRexonanceSuit("high").then((decoded) => decoded && start());
    };
    frame = globalThis.requestAnimationFrame(begin);
    return () => {
      cancelled = true;
      stop();
      if (frame) globalThis.cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={host} className="rx-suit-nanites" />;
}
