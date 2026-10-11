/** Rexonance's form changes (owner, 2026-10-11): MAX is the finished
 * Rexonance overwritten by cells; ULTRA runs Rexonance to MAX briefly, then
 * overwrites MAX with cells again and generates its additional parts.
 *
 * A plan is a grid of square cells over a picture box. Each cell has its
 * place in the wave (`key`, 0–1: from the reactor outward, a little noise);
 * an "extra" cell is one the next form adds (it has nothing to overwrite:
 * it is generated, its nanites flying in after the overwrite).
 *
 * drawOverwrite paints one moment of a change onto a 2D context already
 * transformed to the picture's box (0..width, 0..height): the old form,
 * the cells the wave has reached showing the new form (one clip and one
 * draw), a hot square on each cell as it flips and a hairline on the cells
 * about to flip; the extra cells fly in last. Nothing allocates per frame
 * beyond the path. */

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const random = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** `samples` (optional): { from, to } RGBA of the two pictures drawn down to
 * cols × rows; cells the next form adds (its emerald crystals, or paint where
 * the old form had none) become extra cells. */
/** `order`: "radial" (from the reactor out) or "descend" (EXCELSIOR's: a
 * light that comes down the figure from the crown). `extraBy`: "emerald"
 * (the next form's crystals) or "difference" (whatever the next form adds
 * or changes most). */
export function planOverwrite({
  width,
  height,
  cell,
  origin,
  seed = 1,
  samples = null,
  order = "radial",
  extraBy = "emerald",
}) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const n = cols * rows;
  const key = new Float32Array(n);
  const extra = new Uint8Array(n);
  // A cell the next form no longer has: its nanites break away as it flips.
  const gone = new Uint8Array(n);
  const flight = new Float32Array(n * 2);
  const next = random(seed);
  const [ox, oy] = origin;
  const reach = Math.hypot(Math.max(ox, width - ox), Math.max(oy, height - oy));
  const emerald = (data, i) =>
    data[i + 1] > 70 && data[i + 1] > data[i] * 1.6 && data[i + 1] > data[i + 2] * 1.25;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      key[index] =
        order === "descend"
          ? clamp01((cy / height) * 0.88 + next() * 0.12)
          : clamp01((Math.hypot(cx - ox, cy - oy) / reach) * 0.86 + next() * 0.14);
      if (samples) {
        const i = index * 4;
        const lum = (data) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const added =
          extraBy === "difference"
            ? samples.to[i + 3] - samples.from[i + 3] > 70 ||
              (samples.to[i + 3] > 120 && Math.abs(lum(samples.to) - lum(samples.from)) > 70)
            : (emerald(samples.to, i) && !emerald(samples.from, i)) ||
              samples.to[i + 3] - samples.from[i + 3] > 90;
        extra[index] = added ? 1 : 0;
        gone[index] = samples.from[i + 3] > 120 && samples.to[i + 3] < 40 ? 1 : 0;
      }
      // Where an extra cell's nanites come from: out from the reactor.
      const angle = Math.atan2(cy - oy, cx - ox) + (next() - 0.5) * 0.9;
      const distance = cell * (3 + next() * 5);
      flight[index * 2] = Math.cos(angle) * distance;
      flight[index * 2 + 1] = Math.sin(angle) * distance;
    }
  }
  return { cols, rows, cell, width, height, key, extra, gone, flight };
}

/** Draws the change at `u` (0–1, the overwrite) and `v` (0–1, the extra
 * cells' generation; ignored without extra cells). `tone`: the new form's
 * light (CSS colour). */
export function drawOverwrite(
  context,
  plan,
  from,
  to,
  u,
  v = 1,
  tone = "#8cf5e0",
  calm = false,
  style = "square",
) {
  const { cols, rows, cell, width, height, key, extra, gone, flight } = plan;
  const hot = 0.08;
  const lead = 0.05;
  context.globalAlpha = 1;
  context.drawImage(from, 0, 0, width, height);
  // The cells the wave has reached (and the extra cells generated) show the
  // new form.
  context.save();
  context.beginPath();
  let any = false;
  for (let index = 0; index < key.length; index += 1) {
    const ready = extra[index] ? v >= 1 || key[index] <= v - 0.06 : key[index] <= u;
    if (!ready) continue;
    const col = index % cols;
    const row = (index - col) / cols;
    context.rect(col * cell, row * cell, cell, cell);
    any = true;
  }
  if (any) {
    context.clip();
    // The old form's paint is taken away first (the forms differ in shape:
    // a part the new form does not have is not left standing under it).
    context.clearRect(0, 0, width, height);
    context.drawImage(to, 0, 0, width, height);
  }
  context.restore();
  // `calm`: the change is held still (a scroll at rest): no transient
  // squares stay standing on it.
  if (calm) {
    context.globalAlpha = 1;
    return;
  }
  // Hot squares on the cells flipping now; hairlines on the next ones.
  context.beginPath();
  for (let index = 0; index < key.length; index += 1) {
    if (extra[index]) continue;
    const age = u - key[index];
    if (age < 0 || age >= hot) continue;
    const col = index % cols;
    const row = (index - col) / cols;
    const inset = cell * (0.06 + 0.3 * (age / hot));
    context.rect(col * cell + inset, row * cell + inset, cell - inset * 2, cell - inset * 2);
  }
  context.globalAlpha = 0.72;
  context.fillStyle = tone;
  context.fill();
  if (u < 1) {
    context.beginPath();
    for (let index = 0; index < key.length; index += 1) {
      if (extra[index]) continue;
      const ahead = key[index] - u;
      if (ahead <= 0 || ahead >= lead) continue;
      const col = index % cols;
      const row = (index - col) / cols;
      context.rect(col * cell + 0.5, row * cell + 0.5, cell - 1, cell - 1);
    }
    context.globalAlpha = 0.5;
    context.strokeStyle = tone;
    context.lineWidth = Math.max(0.6, cell * 0.06);
    context.stroke();
  }
  // The parts that go: their nanites break away outward and fade.
  if (gone && !calm) {
    context.beginPath();
    for (let index = 0; index < key.length; index += 1) {
      if (!gone[index]) continue;
      const age = (u - key[index]) / 0.12;
      if (age <= 0 || age >= 1) continue;
      const col = index % cols;
      const row = (index - col) / cols;
      const size = cell * 0.5 * (1 - age);
      const x = (col + 0.5) * cell - flight[index * 2] * age - size / 2;
      const y = (row + 0.5) * cell - flight[index * 2 + 1] * age - size / 2;
      context.rect(x, y, size, size);
    }
    context.globalAlpha = 0.7;
    context.fillStyle = tone;
    context.fill();
    context.globalAlpha = 1;
  }
  // EXCELSIOR's nanites are of another kind: prism shards (emerald and
  // violet diamonds) that spiral in round the reactor and seat edge-on.
  if (style === "shard" && v > 0 && v < 1) {
    for (const [tint, parity] of [
      ["#7dffb8", 0],
      ["#c79bff", 1],
    ]) {
      context.beginPath();
      for (let index = parity; index < key.length; index += 2) {
        if (!extra[index]) continue;
        const w = (v - key[index] * 0.94) / 0.06;
        if (w <= 0 || w >= 1.4) continue;
        const col = index % cols;
        const row = (index - col) / cols;
        const e = w >= 1 ? 1 : 1 - (1 - w) * (1 - w) * (1 - w);
        const turn = (1 - e) * 2.4;
        const fx = flight[index * 2] * 1.6;
        const fy = flight[index * 2 + 1] * 1.6;
        const cx = (col + 0.5) * cell + (fx * Math.cos(turn) - fy * Math.sin(turn)) * (1 - e);
        const cy = (row + 0.5) * cell + (fx * Math.sin(turn) + fy * Math.cos(turn)) * (1 - e);
        const r = cell * (w >= 1 ? (0.7 * (1.4 - w)) / 0.4 : 0.35 + 0.35 * e);
        const a = turn + Math.PI / 4;
        const dx = Math.cos(a) * r;
        const dy = Math.sin(a) * r;
        context.moveTo(cx + dx, cy + dy);
        context.lineTo(cx - dy * 0.55, cy + dx * 0.55);
        context.lineTo(cx - dx, cy - dy);
        context.lineTo(cx + dy * 0.55, cy - dx * 0.55);
        context.closePath();
      }
      context.globalAlpha = 0.9;
      context.fillStyle = tint;
      context.fill();
    }
    context.globalAlpha = 1;
    return;
  }
  // The additional parts: their nanites fly in from the reactor's side and
  // lock (a bright square that settles into the new form's cell).
  if (v > 0 && v < 1) {
    context.beginPath();
    for (let index = 0; index < key.length; index += 1) {
      if (!extra[index]) continue;
      const w = (v - key[index] * 0.94) / 0.06;
      if (w <= 0 || w >= 1.6) continue;
      const col = index % cols;
      const row = (index - col) / cols;
      const e = w >= 1 ? 1 : 1 - (1 - w) * (1 - w);
      const size = cell * (0.35 + 0.65 * Math.min(1, e));
      const x = col * cell + flight[index * 2] * (1 - e) + (cell - size) / 2;
      const y = row * cell + flight[index * 2 + 1] * (1 - e) + (cell - size) / 2;
      context.rect(x, y, size, size);
    }
    context.globalAlpha = 0.85;
    context.fillStyle = "#eafff4";
    context.fill();
  }
  context.globalAlpha = 1;
  void rows;
}

/** One picture drawn down to cols × rows, RGBA (null if it cannot be read). */
export function sampleCells(picture, plan, document = globalThis.document) {
  try {
    const canvas = Object.assign(document.createElement("canvas"), {
      width: plan.cols,
      height: plan.rows,
    });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(picture, 0, 0, plan.cols, plan.rows);
    const { data } = context.getImageData(0, 0, plan.cols, plan.rows);
    canvas.width = canvas.height = 0;
    return data;
  } catch {
    return null;
  }
}

/** The forms' order and lights. */
export const FORM_TONES = {
  standard: "#bfe8ff",
  max: "#7ff5d8",
  ultra: "#c79bff",
  excelsior: "#7dffb8",
};
/** A change's timing (ms, the 03 viewer): to MAX one overwrite; to ULTRA from
 * Rexonance a short run to MAX first, then the overwrite to ULTRA and its
 * additional parts. */
export const FORM_CHANGE_MS = { max: 1100, quick: 420, ultra: 900, extra: 560, excelsior: 1100 };

/* The pose between two forms (owner, 2026-10-12): where two forms' art
   stand a little differently (an arm, a leg, the tail), the change carries
   the limbs over a little at a time. Landmarks are matched points of the two
   pictures (normalised 0–1); warpPicture draws a picture with its landmarks
   moved part of the way to the other's, through a coarse mesh of affine
   triangles (displacement by inverse-distance weighting, the frame's edge
   held still). */
const MESH = { cols: 8, rows: 10 };
const affine = (s, d) => {
  // Maps source triangle s ([x,y]×3) onto destination triangle d.
  const [[x0, y0], [x1, y1], [x2, y2]] = s;
  const [[u0, v0], [u1, v1], [u2, v2]] = d;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) || 1e-6;
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  return [a, b, c, dd, u0 - a * x0 - c * y0, v0 - b * x0 - dd * y0];
};
/** Draws `picture` (box: x, y, w, h on the context) with its landmarks
 * `own` moved to `target` (both normalised to the box). */
export function warpPicture(context, picture, box, own, target) {
  const { x, y, w, h } = box;
  const anchors = [];
  for (let i = 0; i <= 4; i += 1)
    for (const [px, py] of [
      [i / 4, 0],
      [i / 4, 1],
      [0, i / 4],
      [1, i / 4],
    ])
      anchors.push([px, py, 0, 0]);
  const points = own
    .map(([px, py], i) => [px, py, target[i][0] - px, target[i][1] - py])
    .concat(anchors);
  const moved = (px, py) => {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (const [qx, qy, dx, dy] of points) {
      const d2 = (px - qx) ** 2 + ((py - qy) * (h / w)) ** 2;
      const wgt = 1 / (d2 * d2 + 1e-7);
      sx += dx * wgt;
      sy += dy * wgt;
      sw += wgt;
    }
    return [px + sx / sw, py + sy / sw];
  };
  const { cols, rows } = MESH;
  const grid = [];
  for (let r = 0; r <= rows; r += 1)
    for (let c = 0; c <= cols; c += 1) {
      const px = c / cols;
      const py = r / rows;
      const edge = c === 0 || r === 0 || c === cols || r === rows;
      const [mx, my] = edge ? [px, py] : moved(px, py);
      grid.push([
        [x + px * w, y + py * h],
        [x + mx * w, y + my * h],
      ]);
    }
  const at = (r, c) => grid[r * (cols + 1) + c];
  const base = context.getTransform();
  const pw = picture.width || w;
  const ph = picture.height || h;
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const quad = [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)];
      for (const tri of [
        [quad[0], quad[1], quad[2]],
        [quad[0], quad[2], quad[3]],
      ]) {
        const [a, b, cc, d, e, f] = affine(
          tri.map(([s]) => s),
          tri.map(([, t]) => t),
        );
        context.save();
        context.beginPath();
        // A hair larger than the triangle, so the seams never show.
        const [cx, cy] = tri.reduce(([sx, sy], [, [tx, ty]]) => [sx + tx / 3, sy + ty / 3], [0, 0]);
        tri.forEach(([, [tx, ty]], i) => {
          const gx = tx + Math.sign(tx - cx) * 0.6;
          const gy = ty + Math.sign(ty - cy) * 0.6;
          if (i) context.lineTo(gx, gy);
          else context.moveTo(gx, gy);
        });
        context.closePath();
        context.clip();
        context.transform(a, b, cc, d, e, f);
        context.drawImage(picture, x, y, w, h);
        context.restore();
      }
    }
  context.setTransform(base);
  void pw;
  void ph;
}

/** Landmarks of the forms' art (normalised): the head, the shoulders, the
 * core, the belt, the forearms, the fists, the knees, the feet, the tail's
 * tip. `panel`: 03's stage art (1086 × 1448); `figure`: the suit figures
 * (EXCELSIOR's at its fit: scale 0.591, left -16, top 153 of its art). */
export const FORM_LANDMARKS = {
  panel: {
    ultra: [
      [0.5, 0.175],
      [0.375, 0.27],
      [0.7, 0.32],
      [0.58, 0.33],
      [0.6, 0.51],
      [0.21, 0.46],
      [0.785, 0.525],
      [0.25, 0.65],
      [0.9, 0.61],
      [0.38, 0.85],
      [0.7, 0.83],
      [0.825, 0.25],
    ],
    excelsior: [
      [0.505, 0.145],
      [0.37, 0.27],
      [0.71, 0.31],
      [0.58, 0.34],
      [0.6, 0.51],
      [0.165, 0.49],
      [0.79, 0.525],
      [0.265, 0.645],
      [0.905, 0.605],
      [0.37, 0.85],
      [0.715, 0.82],
      [0.865, 0.22],
    ],
  },
  figure: {
    ultra: [
      [0.495, 0.1],
      [0.3, 0.22],
      [0.67, 0.22],
      [0.49, 0.25],
      [0.49, 0.39],
      [0.15, 0.4],
      [0.85, 0.4],
      [0.17, 0.53],
      [0.81, 0.53],
      [0.3, 0.65],
      [0.65, 0.65],
      [0.3, 0.93],
      [0.73, 0.93],
      [0.88, 0.28],
    ],
    excelsior: [
      [0.506, 0.235],
      [0.341, 0.324],
      [0.662, 0.324],
      [0.501, 0.37],
      [0.501, 0.493],
      [0.146, 0.493],
      [0.848, 0.493],
      [0.18, 0.603],
      [0.814, 0.603],
      [0.341, 0.704],
      [0.662, 0.704],
      [0.273, 0.937],
      [0.738, 0.941],
      [0.899, 0.307],
    ],
  },
};
