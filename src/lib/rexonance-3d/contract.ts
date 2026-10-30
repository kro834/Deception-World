/** The web side of the Blender export contract (scripts/blender/rexonance3d/README.md and
 * export.py): material families, glint anchors, the tail's pivot chain, ribbons and the
 * chest core. Pure functions only (no three.js), so the viewer and the node tests share
 * them. Everything optional is optional: a model without a tail, glints or ribbons is
 * still a valid model. */

export const REXONANCE_FAMILIES = [
  "Suit",
  "Black",
  "Gold",
  "GoldDark",
  "Silver",
  "Crystal",
  "Gem",
  "Glow",
  "Visor",
  "Dark",
] as const;
export type RexonanceFamily = (typeof REXONANCE_FAMILIES)[number];

const FAMILIES = new Set<string>(REXONANCE_FAMILIES);

/** "RX_Gold" -> "Gold". A Blender duplicate ("RX_Gold.001") keeps its family. When the
 * material is unnamed, a joined release node ("RX_<Part>_<Family>") still names it. */
export function rexonanceFamilyOf(
  materialName?: string | null,
  nodeName?: string | null,
): RexonanceFamily | null {
  const material = /^RX_([A-Za-z]+)(?:[._]\d+)?$/u.exec(materialName ?? "")?.[1];
  if (material && FAMILIES.has(material)) return material as RexonanceFamily;
  const node = /^RX_[A-Za-z0-9]+_([A-Za-z]+)(?:[._]\d+)?$/u.exec(nodeName ?? "")?.[1];
  return node && FAMILIES.has(node) ? (node as RexonanceFamily) : null;
}

export type RexonanceGlint = { size: number; hue: number };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** An RX_Glint_* anchor (an empty) with its extras: rx_glint_size in metres (default 3 cm)
 * and rx_glint_hue, 0 ice blue .. 1 pink (default 0.5). */
export function readRexonanceGlint(
  name: string,
  extras?: Record<string, unknown> | null,
): RexonanceGlint | null {
  if (!/^RX_Glint_/u.test(name)) return null;
  const size = extras?.rx_glint_size;
  const hue = extras?.rx_glint_hue;
  return {
    size: finite(size) && size > 0 ? clamp(size, 0.004, 0.4) : 0.03,
    hue: finite(hue) ? clamp(hue, 0, 1) : 0.5,
  };
}

/** RX_Tail_Pivot00 .. RX_Tail_PivotNN: the empties of the tail chain, root first. */
export function rexonanceTailPivotIndex(name: string): number | null {
  const match = /^RX_Tail_Pivot(\d{1,3})$/u.exec(name);
  return match ? Number(match[1]) : null;
}

/** Ribbon meshes flutter in the vertex shader (RX_Ribbon_*, or a joined RX_Ribbons_*). */
export function isRexonanceRibbon(name: string) {
  return /^RX_Ribbons?_/u.test(name);
}

/** The chest core's optional spinning pivot. */
export function isRexonanceCorePivot(name: string) {
  return /^RX_Torso_CorePivot(?:[._]\d+)?$/u.test(name);
}

/** The undersuit: the node whose bounds centre the figure (the tail and fins are not
 * allowed to pull the turntable axis off the body). */
export function isRexonanceBody(name: string) {
  return /^RX_Body_/u.test(name);
}

/** rx_bend_axis on a tail pivot, written in Blender's world frame (Z up, the suit faces -Y):
 * "X", "-Z", ... or [x, y, z]. Returned as a unit vector in the glTF frame (Y up, faces +Z),
 * i.e. Blender (x, y, z) -> glTF (x, z, -y). Anything else: null (the viewer picks a
 * side-to-side axis from the chain itself). */
export function rexonanceBendAxis(value: unknown): [number, number, number] | null {
  let blender: [number, number, number] | null = null;
  if (typeof value === "string") {
    const match = /^\s*([+-]?)([XYZ])\s*$/iu.exec(value);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const axis = match[2].toUpperCase();
      blender = [axis === "X" ? sign : 0, axis === "Y" ? sign : 0, axis === "Z" ? sign : 0];
    }
  } else if (Array.isArray(value) && value.length === 3 && value.every(finite)) {
    blender = [value[0], value[1], value[2]];
  }
  if (!blender) return null;
  const length = Math.hypot(...blender);
  if (!(length > 1e-6)) return null;
  const [x, y, z] = blender.map((component) => component / length);
  return [x, z, -y === 0 ? 0 : -y];
}

/** A unit vector already in the glTF frame ([x, y, z]), or null. */
export function rexonanceGltfAxis(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(finite)) return null;
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-6 ? [value[0] / length, value[1] / length, value[2] / length] : null;
}

/** A pivot's authored axis: `<key>_gltf` (glTF frame) wins over `<key>` (Blender frame). */
export function rexonancePivotAxis(
  extras: Record<string, unknown> | null | undefined,
  key: "rx_bend_axis" | "rx_side_axis" | "rx_spin_axis",
): [number, number, number] | null {
  return rexonanceGltfAxis(extras?.[`${key}_gltf`]) ?? rexonanceBendAxis(extras?.[key]);
}

/** model-manifest.json beside the GLB (scripts/rexonance-3d-assets.mjs manifest). */
export type RexonanceManifest = {
  model: string;
  assetBytes: number;
  assetSha256: string;
  triangles: number;
  materials: string[];
  nodes: {
    name: string;
    type: string;
    parent: string | null;
    triangles?: number;
    materials?: string[];
    tint?: boolean;
  }[];
  glints: { name: string; size: number; hue: number }[];
  units?: string;
  built?: string;
  blender?: string;
};
