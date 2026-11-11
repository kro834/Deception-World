import type { NaniteSkinStyle } from "./nanite-skin.ts";

/** FAR FROM's nanite skin (nanite-skin.ts; owner, 2026-11-11): dark steel
 * under ice light, its cells cut into triangles — the wireframe this page's
 * armour is generated as (owner, 2026-10-23), now the mesh the liquid
 * crystallises into. Gold droplets. Shared by the scroll suit-up and the
 * entry. */
export const FAR_FROM_SKIN_STYLE: NaniteSkinStyle = Object.freeze({
  steel: "rgb(24 30 40)",
  steelAlpha: 0.84,
  line: "rgb(150 236 255)",
  glint: [226, 248, 255] as const,
  motes: ["rgb(150 170 190)", "rgb(255 215 122)", "rgb(244 251 255)"] as const,
  cell: 9,
  triangles: true,
});
