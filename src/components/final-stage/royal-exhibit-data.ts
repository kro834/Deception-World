import type { RrFormKey } from "./final-stage-data";

export const PARTS = {
  reactor: { label: "胸部", armor: 2, span: 0.84 },
  star: { label: "肩部", armor: 3, span: 0.77 },
  cloak: { label: "外套", armor: 4, span: 0.56 },
} as const;
export type Part = keyof typeof PARTS;
type Point = { x: number; y: number };
type Plate = Record<Part, Point> & { shoulderSpan: number };

// Measured on the five supplied original portraits. The shoulder medallion spacing,
// in fractions of image width, gives every form the same anatomical scale in a pair.
export const PLATES: Record<RrFormKey, Plate> = {
  royal: {
    reactor: { x: 0.436, y: 0.39 },
    star: { x: 0.722, y: 0.319 },
    cloak: { x: 0.891, y: 0.942 },
    shoulderSpan: 0.483,
  },
  wrath: {
    reactor: { x: 0.438, y: 0.389 },
    star: { x: 0.723, y: 0.317 },
    cloak: { x: 0.9, y: 0.926 },
    shoulderSpan: 0.486,
  },
  abyss: {
    reactor: { x: 0.438, y: 0.389 },
    star: { x: 0.725, y: 0.317 },
    cloak: { x: 0.902, y: 0.931 },
    shoulderSpan: 0.486,
  },
  birth: {
    reactor: { x: 0.438, y: 0.389 },
    star: { x: 0.725, y: 0.317 },
    cloak: { x: 0.902, y: 0.931 },
    shoulderSpan: 0.485,
  },
  nehan: {
    reactor: { x: 0.441, y: 0.38 },
    star: { x: 0.731, y: 0.307 },
    cloak: { x: 0.925, y: 0.965 },
    shoulderSpan: 0.487,
  },
};

export function cropFor(form: RrFormKey, part: Part, width: number, height: number) {
  const plate = PLATES[form];
  const span = plate.shoulderSpan * PARTS[part].span;
  const halfWidth = span / 2;
  const halfHeight = (halfWidth * width) / height;
  const anchor = plate[part];
  // At the outer hem keep the edge of the original plate in frame.
  return {
    width: 1 / span,
    x: Math.min(1 - halfWidth, Math.max(halfWidth, anchor.x)),
    y: Math.min(1 - halfHeight, Math.max(halfHeight, anchor.y)),
  };
}
