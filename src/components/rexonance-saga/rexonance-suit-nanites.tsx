import { useEffect, useRef } from "react";
import { REXONANCE_SUIT_ATLAS, REXONANCE_SUIT_GOLD_ATLAS } from "@/lib/rexonance-suit";
import { rexonanceSuitSource, warmRexonanceSuit } from "@/lib/rexonance-suit-warmup";
import {
  FIG,
  FLIGHT,
  G,
  GOLD,
  GOLD_TOTAL,
  T,
  cells,
  forming,
  planEnd,
  planSurges,
  plates,
  work,
} from "./rexonance-suit-plan";

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
   It never runs after the overlay closes. */

/** The engine takes over only if it is ready before the first tile is due. */
const START_BY = 420;

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

export function SuitNanites({ onReady }: { onReady: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let stop = () => {};
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
      const clock = () => {
        const animation = meter.getAnimations()[0];
        return animation ? Number(animation.currentTime) : null;
      };
      const start = () => {
        const now = clock();
        if (cancelled || now === null || now > START_BY || !box.clientWidth) return;
        const atlas = rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src);
        const raw = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
        if (!atlas || !raw) return;
        const atlasWork = forming(atlas, raw);
        const scale = Math.min(2, globalThis.devicePixelRatio || 1);
        const width = Math.round(box.clientWidth * scale);
        const height = Math.round(box.clientHeight * scale);
        const make = () => {
          const canvas = Object.assign(globalThis.document.createElement("canvas"), {
            width,
            height,
          });
          box.append(canvas);
          return canvas.getContext("2d");
        };
        const settled = make();
        const flight = make();
        const source = work.canvas;
        if (!atlasWork || !source || !settled || !flight) {
          box.replaceChildren();
          return;
        }
        work.dirty = true;
        const s = width / FIG.width;
        const all = plates();
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
        const settle = (index: number) => {
          const { piece } = all[index];
          settled.drawImage(
            atlas,
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
          settled.clearRect(0, 0, width, height);
          done.fill(0);
          for (let p = 0; p < all.length; p += 1) locked[p] = all[p].first;
          work.dirty = true;
          forming(atlas, raw);
          work.dirty = true;
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
        const draw = (t: number) => {
          if (t < last) reset();
          last = t;
          flight.clearRect(0, 0, width, height);
          heats.fill(0);
          glints.fill(0);
          moteCount = 0;
          for (let p = 0; p < all.length; p += 1) {
            const plate = all[p];
            if (t < plate.spawn || (done[p] && t >= plate.last)) continue;
            const { piece } = plate;
            if (t < plate.fit) {
              for (const tile of plate.tiles) {
                const u = (t - tile.land + FLIGHT) / FLIGHT;
                if (u <= 0) continue;
                if (u >= 1) {
                  flight.globalAlpha = 1;
                  flight.drawImage(
                    source,
                    tile.sx,
                    tile.sy,
                    T,
                    T,
                    tile.dx * s,
                    tile.dy * s,
                    T * s,
                    T * s,
                  );
                  continue;
                }
                const e = 1 - (1 - u) ** 3;
                const x = (tile.dx + tile.ox * (1 - e)) * s;
                const y = (tile.dy + tile.oy * (1 - e)) * s;
                if (u < 0.62) {
                  // A nanite mote, streaming in.
                  const size = T * s * (0.3 + 0.4 * (u / 0.62));
                  flight.globalAlpha = Math.min(1, u * 5) * 0.85;
                  flight.fillStyle = tile.tone;
                  flight.fillRect(x + (T * s - size) / 2, y + (T * s - size) / 2, size, size);
                } else {
                  // It turns into its piece of the plate (gold unformed) and locks.
                  const v = (u - 0.62) / 0.38;
                  const size = T * s * (0.72 + 0.28 * v);
                  flight.globalAlpha = 0.55 + 0.45 * v;
                  flight.drawImage(
                    source,
                    tile.sx,
                    tile.sy,
                    T,
                    T,
                    x + (T * s - size) / 2,
                    y + (T * s - size) / 2,
                    size,
                    size,
                  );
                }
              }
              continue;
            }
            // Seated. Its gold cells lock as they are due (into the working
            // atlas, unless the plate settles this frame anyway).
            if (!done[p]) {
              if (t >= plate.to) {
                locked[p] = plate.end;
                settle(p);
              } else {
                while (locked[p] < plate.end && gold.lock[locked[p]] <= t) {
                  const i = locked[p];
                  atlasWork.drawImage(
                    atlas,
                    gold.ax[i],
                    gold.ay[i],
                    gold.cw[i],
                    gold.ch[i],
                    gold.ax[i],
                    gold.ay[i],
                    gold.cw[i],
                    gold.ch[i],
                  );
                  locked[p] += 1;
                }
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
            }
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
          glow(heat[0], heats[0], BLOOM);
          for (let k = HEAT.length - 1; k >= 0; k -= 1) glow(heat[k], heats[k], HEAT[k]);
          for (let k = GLINT.length - 1; k >= 0; k -= 1) glow(glint[k], glints[k], GLINT[k]);
          if (moteCount) {
            flight.globalAlpha = 0.86;
            flight.fillStyle = "#fff8de";
            flight.beginPath();
            for (let k = 0; k < moteCount; k += 1)
              flight.rect(
                motes[k * 3] * s,
                motes[k * 3 + 1] * s,
                motes[k * 3 + 2] * s,
                motes[k * 3 + 2] * s,
              );
            flight.fill();
          }
          flight.globalAlpha = 1;
        };
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          work.drawing -= 1;
          flight.clearRect(0, 0, width, height);
          for (let p = 0; p < all.length; p += 1) if (!done[p]) settle(p);
        };
        stop = () => {
          if (!finished) work.drawing -= 1;
          finished = true;
        };
        const tick = () => {
          frame = 0;
          if (cancelled) return;
          const t = clock();
          // The meter's covering clock ends at the hand-over: all plates seat
          // and the last gold has formed and cooled long before.
          if (t === null || t >= end) {
            finish();
            return;
          }
          draw(t);
          frame = globalThis.requestAnimationFrame(tick);
        };
        work.drawing += 1;
        ready.current();
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
