import { useEffect, useRef } from "react";
import { REXONANCE_SUIT_FIT, REXONANCE_SUIT_REVEAL_MS } from "@/lib/rexonance-calls";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
  type RexonanceSuitPiece,
} from "@/lib/rexonance-suit";

/* rx13 (owner, 2026-10-11): "subdivide extremely finely so it feels like
   nanomachines, and fit it on in turn". The armour assembles out of the
   plates' micro-tiles (REXONANCE_SUIT_TILE px squares of the artwork itself,
   ~5,700 in all): each tile streams in along the undersuit from its plate's
   seam side as a nanite mote, turns into its piece of the art and locks in
   place, seam outward, plate after plate in the cascade's order
   (REXONANCE_SUIT_FIT). When a plate's last tile has locked, the whole plate
   is painted once onto a settled canvas, so the finished suit is the art
   exactly; only plates still assembling are drawn each frame.

   The engine follows the overlay's own clock (the call meter's CSS
   animation), so it stays in step with the calls, with frame audits that
   seek the document's animations, and with a late start. It runs only in
   the full tier (its host is not rendered otherwise) and only if the
   atlas is decoded before the first tile is due; otherwise the DOM plates
   play instead. It never runs after the overlay closes. */

const T = REXONANCE_SUIT_TILE;
const FIG = REXONANCE_SUIT_SIZE;
/** How long a tile streams before it locks (ms). */
const FLIGHT = 170;
/** The engine takes over only if it is ready before the first tile is due. */
const START_BY = 420;
const GROW = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
const TONES = ["#8cefff", "#8cefff", "#ff8fd8", "#f2d896", "#8cefff", "#ff8fd8", "#eefcff"];

type Tile = {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  land: number;
  ox: number;
  oy: number;
  tone: string;
};
type Plate = { piece: RexonanceSuitPiece; fit: number; spawn: number; tiles: Tile[] };

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let PLATES: Plate[] | undefined;
// Built once: every plate's tiles, their landing times (from the seam
// outward across the plate's growth) and where they stream in from.
function plates() {
  if (PLATES) return PLATES;
  PLATES = REXONANCE_SUIT_PIECES.map((piece, index) => {
    const fit = REXONANCE_SUIT_FIT[piece.id];
    const [gx, gy] = GROW[piece.dir];
    const cols = Math.ceil(piece.w / T);
    const rows = Math.ceil(piece.h / T);
    const bits = Uint8Array.from(atob(piece.tiles), (c) => c.charCodeAt(0));
    const tiles: Tile[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const bit = row * cols + col;
        if (!(bits[bit >> 3] & (1 << (bit & 7)))) continue;
        const cx = (col + 0.5) * T;
        const cy = (row + 0.5) * T;
        const along =
          piece.dir === "up"
            ? 1 - cy / piece.h
            : piece.dir === "down"
              ? cy / piece.h
              : piece.dir === "left"
                ? 1 - cx / piece.w
                : cx / piece.w;
        const k = hash(index * 131 + col, row * 17 + index);
        const k2 = hash(row + index * 7, col * 29 + 3);
        const progress = Math.min(1, Math.max(0, along + (k - 0.5) * 0.28));
        // Behind the seam, a little to the side: streaming along the body.
        const reach = FIG.height * (0.016 + 0.02 * k2);
        const side = FIG.height * (k - 0.5) * 0.024;
        tiles.push({
          sx: piece.ax + col * T,
          sy: piece.ay + row * T,
          dx: piece.x + col * T,
          dy: piece.y + row * T,
          land: fit - REXONANCE_SUIT_REVEAL_MS + progress * REXONANCE_SUIT_REVEAL_MS,
          ox: -gx * reach + gy * side,
          oy: -gy * reach + gx * side,
          tone: TONES[Math.floor(k2 * TONES.length)],
        });
      }
    }
    const spawn = Math.min(...tiles.map((tile) => tile.land)) - FLIGHT;
    return { piece, fit, spawn, tiles };
  });
  return PLATES;
}

export function SuitNanites({ onReady }: { onReady: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    const box = host.current;
    const build = box?.parentElement;
    const meter = box?.closest(".rx-call-sequence")?.querySelector(".rx-call-meter > i");
    if (!box || !build || !meter || getComputedStyle(build).display === "none") return;
    const clock = () => {
      const animation = meter.getAnimations()[0];
      return animation ? Number(animation.currentTime) : null;
    };
    let cancelled = false;
    let frame = 0;
    const atlas = new Image();
    atlas.decoding = "async";
    atlas.src = REXONANCE_SUIT_ATLAS.src;
    const start = () => {
      const now = clock();
      if (cancelled || now === null || now > START_BY || !box.clientWidth) return;
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
      if (!settled || !flight) {
        box.replaceChildren();
        return;
      }
      const s = width / FIG.width;
      const half = REXONANCE_SUIT_ATLAS.width / 2;
      const all = plates();
      const done = new Set<Plate>();
      let last = -1;
      const settle = (plate: Plate) => {
        const { piece } = plate;
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
        done.add(plate);
      };
      const draw = (t: number) => {
        if (t < last) {
          settled.clearRect(0, 0, width, height);
          done.clear();
        }
        last = t;
        flight.clearRect(0, 0, width, height);
        for (const plate of all) {
          if (done.has(plate) || t < plate.spawn) continue;
          if (t >= plate.fit) {
            settle(plate);
            continue;
          }
          for (const tile of plate.tiles) {
            const u = (t - tile.land + FLIGHT) / FLIGHT;
            if (u <= 0) continue;
            if (u >= 1) {
              flight.globalAlpha = 1;
              flight.drawImage(
                atlas,
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
              // It turns into its piece of the plate and locks.
              const v = (u - 0.62) / 0.38;
              const size = T * s * (0.72 + 0.28 * v);
              flight.globalAlpha = 0.55 + 0.45 * v;
              flight.drawImage(
                atlas,
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
        }
        flight.globalAlpha = 1;
      };
      const finish = () => {
        flight.clearRect(0, 0, width, height);
        for (const plate of all) if (!done.has(plate)) settle(plate);
      };
      const tick = () => {
        frame = 0;
        if (cancelled) return;
        const t = clock();
        // The meter's covering clock ends at the hand-over: all plates seat.
        if (t === null || t >= REXONANCE_SUIT_FIT["helmet-crest"] + 40) {
          finish();
          return;
        }
        draw(t);
        frame = globalThis.requestAnimationFrame(tick);
      };
      ready.current();
      draw(now);
      frame = globalThis.requestAnimationFrame(tick);
    };
    void atlas.decode().then(start, () => undefined);
    return () => {
      cancelled = true;
      if (frame) globalThis.cancelAnimationFrame(frame);
      atlas.src = "";
    };
  }, []);
  return <div ref={host} className="rx-suit-nanites" />;
}
