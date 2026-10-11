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
      }
      // Where an extra cell's nanites come from: out from the reactor.
      const angle = Math.atan2(cy - oy, cx - ox) + (next() - 0.5) * 0.9;
      const distance = cell * (3 + next() * 5);
      flight[index * 2] = Math.cos(angle) * distance;
      flight[index * 2 + 1] = Math.sin(angle) * distance;
    }
  }
  return { cols, rows, cell, width, height, key, extra, flight };
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
  const { cols, rows, cell, width, height, key, extra, flight } = plan;
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
