import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

/* Shared by <RevealText> (reveal-text.tsx) and the headings that label
   themselves with it in world-home.tsx. Kept apart from the component so
   Fast Refresh keeps working on it. */

export const BLANK = /^\s+$/;
const INLINE = new Set(["em", "strong", "b", "i", "span", "small"]);

type Parent = ReactElement<{ children?: ReactNode; "aria-hidden"?: unknown }>;
export const splittable = (node: ReactNode): node is Parent =>
  isValidElement(node) &&
  (node.type === Fragment ||
    (typeof node.type === "string" &&
      INLINE.has(node.type) &&
      !(node as Parent).props["aria-hidden"]));

/** The visible string, with <br> read as a space. */
export function revealLabel(node: ReactNode): string {
  let text = "";
  Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number") text += String(child);
    else if (isValidElement(child) && child.type === "br") text += " ";
    else if (splittable(child)) text += revealLabel(child.props.children);
  });
  return text.replace(/\s+/g, " ").trim();
}

/* Typed cells for <RevealText>: copy is typed a short phrase at a time (see
   reveal-text.tsx), headings one character at a time. */
export const COPY_CHUNK = 3;
const PHRASE_END = /[、。，．！？]/;

/** Code points, grouped into typed cells: blanks stay loose text; every
    other run is cut into groups of `size`, closing early after punctuation.
    Punctuation never opens a cell: it joins the phrase it ends. */
export function typedCells(text: string, size: number): string[] {
  const cells: string[] = [];
  let cell = "";
  let length = 0;
  for (const part of Array.from(text)) {
    if (BLANK.test(part)) {
      if (cell) cells.push(cell);
      cells.push(part);
      cell = "";
      length = 0;
      continue;
    }
    if (size > 1 && !cell && PHRASE_END.test(part) && cells.length && !BLANK.test(cells.at(-1)!)) {
      cells[cells.length - 1] += part;
      continue;
    }
    cell += part;
    length += 1;
    if (length >= size || PHRASE_END.test(part)) {
      cells.push(cell);
      cell = "";
      length = 0;
    }
  }
  if (cell) cells.push(cell);
  return cells;
}
