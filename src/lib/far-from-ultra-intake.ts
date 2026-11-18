import { drawIntakeCell } from "./far-from-form-plumes.ts";

// Inlets and guides in full-body coordinates. The lanes enter across dark
// background before banking across the armour towards the twin chest core.
const lanes = [
  [-.18, .03, .02, -.035, .13, .286],
  [1.18, .075, .94, -.065, .87, .258],
  [-.19, .46, -.015, .55, .23, .245],
  [1.19, .49, 1.06, .37, .76, .226],
  [-.12, .85, .12, .88, .12, .39],
  [1.15, .82, .96, .86, .84, .37],
] as const;
const colors = ["#9ae8ff", "#f6faff", "#b4c7ff"];
const fraction = (value: number) => value - Math.floor(value);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

const cells = Array.from({ length: 384 }, (_, i) => {
  const [x, y, x1, y1, x2, y2] = lanes[i % lanes.length];
  const spread = fraction((i + 1) * .754877666) - .5;
  const offset = fraction((i + 1) * .569840296) - .5;
  const sx = x + spread * .29, sy = y + offset * .265;
  const ax = x1 - offset * .24, ay = y1 + spread * .26;
  const bx = x2 + spread * .19, by = y2 - offset * .127;
  return {
    x: sx, dx: 3 * (ax - sx), cx: 3 * (sx - 2 * ax + bx), ex: .5 - sx + 3 * (ax - bx),
    y: sy, dy: 3 * (ay - sy), cy: 3 * (sy - 2 * ay + by), ey: .264 - sy + 3 * (ay - by),
    birth: .464 + .30 * fraction((i + .5) * .618033989),
    duration: .186 + .092 * fraction((i + 1) * .381105),
    size: .021 + .020 * fraction((i + .5) * .314159265),
    spin: fraction(i * .732050808),
  };
});

// Reused by the trail and material passes. Cell poses depend only on progress.
const poses = new Float32Array(cells.length * 6);

export function drawFarFromNanoGather(ctx: CanvasRenderingContext2D, u: number, coarse: boolean) {
  const count = coarse ? 252 : cells.length;
  const envelope = clamp((u - .475) / .047) * clamp((1 - u) / .07);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const cell = cells[i], at = i * 6;
    const t = (u - cell.birth) / cell.duration;
    poses[at + 4] = 0;
    if (t <= 0 || t >= 1) continue;
    // Late arrivals are still crossing open air while the first cells seat.
    const p = .52 * t + .48 * t * t;
    const tail = Math.max(0, p - (.044 + .057 * t));
    poses[at] = cell.x + p * (cell.dx + p * (cell.cx + p * cell.ex));
    poses[at + 1] = cell.y + p * (cell.dy + p * (cell.cy + p * cell.ey));
    poses[at + 2] = cell.x + tail * (cell.dx + tail * (cell.cx + tail * cell.ex));
    poses[at + 3] = cell.y + tail * (cell.dy + tail * (cell.cy + tail * cell.ey));
    poses[at + 4] = Math.min(1, t * 12, (1 - t) * 10);
    poses[at + 5] = t;
  }

  // Dark metal can cross bright armour without vanishing into its engraving.
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "#152438";
  ctx.globalAlpha = envelope * .85;
  ctx.lineWidth = .008;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const at = i * 6;
    if (poses[at + 4] < .3 || ((i + Math.floor(i / lanes.length)) & 1)) continue;
    ctx.moveTo(poses[at + 2], poses[at + 3]);
    ctx.lineTo(poses[at], poses[at + 1]);
  }
  ctx.stroke();
  for (let band = 0; band < colors.length; band++) {
    ctx.strokeStyle = colors[band];
    ctx.lineWidth = band === 1 ? .0036 : .0027;
    ctx.globalAlpha = envelope * (band === 1 ? .92 : .75);
    ctx.beginPath();
    for (let i = band; i < count; i += 3) {
      const at = i * 6;
      if (!poses[at + 4]) continue;
      const x = poses[at], y = poses[at + 1];
      const opacity = poses[at + 4];
      ctx.moveTo(x + (poses[at + 2] - x) * opacity, y + (poses[at + 3] - y) * opacity);
      ctx.lineTo(x, y);
      // A short specular tip separates each cell from the trail behind it.
      ctx.lineTo(x + .0035 * opacity, y - .0019 * opacity);
    }
    ctx.stroke();
  }
  for (let i = 0; i < count; i += 5) {
    const at = i * 6;
    if (!poses[at + 4]) continue;
    const t = poses[at + 5], x = poses[at], y = poses[at + 1];
    const cell = cells[i], size = cell.size * (1 - .63 * t);
    const frame = Math.floor(24 * fraction(cell.spin + 1.65 * t));
    ctx.globalAlpha = envelope * poses[at + 4];
    if (!drawIntakeCell(ctx, x, y, size, frame, i % 3 !== 0)) {
      // On a slow connection the tumbling facets remain visible immediately.
      const width = size * (.38 + .62 * Math.abs(Math.cos(frame * Math.PI / 12)));
      ctx.fillStyle = "#253a53";
      ctx.beginPath();
      ctx.moveTo(x - width / 2, y);
      ctx.lineTo(x, y - size * .30);
      ctx.lineTo(x + width / 2, y);
      ctx.lineTo(x, y + size * .30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e1f8ff";
      ctx.lineWidth = .0028;
      ctx.beginPath();
      ctx.moveTo(x - width / 2, y);
      ctx.lineTo(x, y - size * .30);
      ctx.lineTo(x + width / 2, y);
      ctx.stroke();
    }
  }
  const light = clamp((u - .57) / .24) * clamp((1 - u) / .13);
  if (light <= 0) return;
  const radius = .030 + .041 * light;
  const core = ctx.createRadialGradient(.5, .264, 0, .5, .264, radius);
  core.addColorStop(0, "#fffffa");
  core.addColorStop(.18, "#ecfbff");
  core.addColorStop(.45, "rgba(149,209,255,.72)");
  core.addColorStop(1, "rgba(123,181,255,0)");
  ctx.globalAlpha = light;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = core;
  ctx.fillRect(.5 - radius, .264 - radius, radius * 2, radius * 2);
}
