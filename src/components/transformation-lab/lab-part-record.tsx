import { LAB_PART_LABELS, labPartRecord } from "@/lib/transformation-lab-details";
import type { LabRider, LabZoom } from "@/lib/transformation-lab-state.js";

function TargetReticle({ zoom }: { zoom: LabZoom }) {
  const common = {
    "aria-hidden": "true" as const,
    width: 20,
    height: 20,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    style: { flexShrink: 0, opacity: 0.88 },
  };

  switch (zoom) {
    case "head":
      return (
        <svg {...common} className="tl-part-reticle tl-part-reticle-head">
          <path d="M12 8h-6v6M36 8h6v6M6 34v6h6M42 34v6h-6" strokeOpacity="0.75" />
          <circle cx="24" cy="22" r="11" strokeDasharray="2 3" strokeOpacity="0.8" />
          <path d="M24 6v6M24 32v6M8 22h6M34 22h6" strokeOpacity="0.9" />
          <circle cx="24" cy="22" r="2.5" fill="currentColor" fillOpacity="0.85" />
          <path d="M18 16l6-4 6 4" strokeWidth="1.2" strokeOpacity="0.65" />
        </svg>
      );
    case "reactor":
      return (
        <svg {...common} className="tl-part-reticle tl-part-reticle-reactor">
          <circle cx="24" cy="24" r="18" strokeDasharray="3 3" strokeOpacity="0.45" />
          <circle cx="24" cy="24" r="12" strokeOpacity="0.85" />
          <circle cx="24" cy="24" r="5" fill="currentColor" fillOpacity="0.22" strokeOpacity="0.95" />
          <circle cx="24" cy="24" r="2" fill="currentColor" />
          <path d="M24 3v5M24 40v5M3 24h5M40 24h5M9 9l3.5 3.5M35.5 35.5L39 39M39 9l-3.5 3.5M12.5 35.5L9 39" strokeOpacity="0.75" />
        </svg>
      );
    case "legs":
      return (
        <svg {...common} className="tl-part-reticle tl-part-reticle-legs">
          <path d="M6 38h36M10 42h28M14 46h20" strokeOpacity="0.55" />
          <path d="M11 26l7 12M37 26l-7 12" strokeOpacity="0.8" />
          <path d="M16 10v12M32 10v12M24 6v16" strokeDasharray="2 2" strokeOpacity="0.65" />
          <path d="M18 38h-4v-4M30 38h4v-4" strokeOpacity="0.95" />
          <circle cx="24" cy="38" r="2.2" fill="currentColor" fillOpacity="0.9" />
        </svg>
      );
    case "full":
    default:
      return (
        <svg {...common} className="tl-part-reticle tl-part-reticle-full">
          <path d="M6 14V6h8M34 6h8v8M6 34v8h8M42 34v8h-8" strokeOpacity="0.9" />
          <path d="M24 8v5M24 35v5M8 24h5M35 24h5" strokeOpacity="0.65" />
          <circle cx="24" cy="24" r="8" strokeDasharray="2 3" strokeOpacity="0.55" />
          <circle cx="24" cy="24" r="1.8" fill="currentColor" fillOpacity="0.8" />
          <rect x="15" y="18" width="18" height="12" rx="1" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.5" />
        </svg>
      );
  }
}

export function LabPartRecord({ rider, zoom }: { rider: LabRider; zoom: LabZoom }) {
  const record = labPartRecord(rider, zoom);
  return (
    <section
      className="tl-part-record"
      aria-label={`${LAB_PART_LABELS[zoom]}の関連記録`}
      data-part={zoom}
      data-rider={rider}
    >
      <div className="tl-part-record-heading">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <TargetReticle zoom={zoom} />
          <span>{LAB_PART_LABELS[zoom]} / 関連記録</span>
        </span>
        <a href={record.href}>設定資料へ ↗</a>
      </div>
      <h3>{record.title}</h3>
      <p>{record.description}</p>
    </section>
  );
}
