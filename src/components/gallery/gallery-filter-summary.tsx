import {
  galleryFilterConditions,
  galleryFilterResultCount,
  type GalleryFilterSummaryState,
} from "./gallery-filter-summary-state";

export function GalleryFilterSummary(props: GalleryFilterSummaryState) {
  const conditions = galleryFilterConditions(props);

  return (
    <div className="gallery-filter-summary">
      <p className="gallery-filter-result" role="status" aria-live="polite" aria-atomic="true">
        {galleryFilterResultCount(props)}
      </p>
      {conditions && <p className="gallery-filter-conditions">{conditions}</p>}
    </div>
  );
}
