type UiVectorIconKind =
  | "arrow-down-left"
  | "arrow-left"
  | "arrow-right"
  | "close"
  | "plus"
  | "reset"
  | "shuffle";

type UiVectorIconProps = {
  className?: string;
  kind: UiVectorIconKind;
  size?: number;
};

const PATHS: Record<UiVectorIconKind, string> = {
  "arrow-down-left": "M18 6 6 18m0-8v8h8",
  "arrow-left": "M19 12H5m6-6-6 6 6 6",
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  close: "M6.5 6.5l11 11m0-11-11 11",
  plus: "M12 5.5v13M5.5 12h13",
  reset: "M5 6v12m14-6H6m6-6-6 6 6 6",
  shuffle: "M18.5 8A7 7 0 1 0 19 15.5M18.5 8V4.5M18.5 8H15",
};

export function UiVectorIcon({ className = "", kind, size = 18 }: UiVectorIconProps) {
  return (
    <svg
      className={`ui-vector-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={PATHS[kind]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
