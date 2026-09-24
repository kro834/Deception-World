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
