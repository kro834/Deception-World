import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

/* The ring system's React primitives (src/styles-ring.css, DESIGN: the ring
   design system). They only compose class names and the --ring-* custom
   properties, so a page that cannot change its markup can use the classes
   directly and get the same result. None of them renders text. */

type RingStyle = CSSProperties & Record<`--ring-${string}`, string | number>;

const join = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** A circular frame around a portrait, a sigil or an icon. */
export function RingFrame({
  as: Tag = "span",
  card = false,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  /** A 28px-radius card instead of a circle. */
  card?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={join(card ? "ring-frame-card" : "ring-frame", className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Children on a circle (or on part of one, with `sweep`). Wrap each child in
 * <RingOrbitItem>. `radius` and `item` are CSS lengths, so a page can hand
 * them clamp() values that follow the viewport.
 */
export function RingOrbit({
  as: Tag = "div",
  count,
  radius,
  item,
  sweep,
  start,
  enter = true,
  track = true,
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  count: number;
  radius?: string;
  item?: string;
  /** Degrees. Omit for a full ring; set it for an arc list. */
  sweep?: number;
  start?: number;
  /** Turn into place the first time it is seen. */
  enter?: boolean;
  track?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const ring: RingStyle = { ...style, "--ring-n": count };
  if (radius) ring["--ring-r"] = radius;
  if (item) ring["--ring-item"] = item;
  if (sweep !== undefined) ring["--ring-sweep"] = `${sweep}deg`;
  if (start !== undefined) ring["--ring-start"] = `${start}deg`;
  return (
    <Tag
      className={join(sweep === undefined ? "ring-orbit" : "ring-arc", enter && "ring-enter", className)}
      style={ring}
      {...rest}
    >
      {track && sweep === undefined && <span className="ring-orbit-track" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

export function RingOrbitItem({
  as: Tag = "div",
  index,
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  index: number;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={join("ring-orbit-item", className)}
      style={{ ...style, "--ring-i": index } as RingStyle}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Circular progress. With `scroll` the helper feeds it the document's scroll
 * position; otherwise pass `value` (0..1). Decorative unless given a label.
 */
export function RingProgress({
  value,
  scroll = false,
  className,
  style,
  children,
  ...rest
}: {
  value?: number;
  scroll?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={join("ring-progress", className)}
      data-ring-scroll={scroll ? "" : undefined}
      aria-hidden={rest["aria-label"] ? undefined : true}
      style={value === undefined ? style : ({ ...style, "--ring-p": value } as RingStyle)}
      {...rest}
    >
      {children}
    </span>
  );
}

/** A section divider: a hairline that opens around a small double ring. */
export function RingDivider({ className }: { className?: string }) {
  return <i className={join("ring-divider ring-enter", className)} aria-hidden="true" />;
}
