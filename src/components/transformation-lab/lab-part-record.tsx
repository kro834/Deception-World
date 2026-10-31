import { LAB_PART_LABELS, labPartRecord } from "@/lib/transformation-lab-details";
import type { LabRider, LabZoom } from "@/lib/transformation-lab-state.js";

export function LabPartRecord({ rider, zoom }: { rider: LabRider; zoom: LabZoom }) {
  const record = labPartRecord(rider, zoom);
  return (
    <section
      className="tl-part-record"
      aria-label={`${LAB_PART_LABELS[zoom]}の関連記録`}
      data-part={zoom}
    >
      <div className="tl-part-record-heading">
        <span>{LAB_PART_LABELS[zoom]} / 関連記録</span>
        <a href={record.href}>設定資料へ ↗</a>
      </div>
      <h3>{record.title}</h3>
      <p>{record.description}</p>
    </section>
  );
}
