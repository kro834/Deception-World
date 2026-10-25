import type { CSSProperties } from "react";
import { GALLERY_TOURS, getTourArtwork, getTourStopIndex } from "./tour-data";
import type { TourProgress } from "./tour-progress";

type GalleryTourEntranceProps = {
  progress: TourProgress;
  onStart: (tourId: string, workId?: string) => void;
  onReset: (tourId: string) => void;
  storageMessage?: string;
};

export function GalleryTourEntrance({
  progress,
  onStart,
  onReset,
  storageMessage,
}: GalleryTourEntranceProps) {
  const savedTours = GALLERY_TOURS.filter((tour) =>
    tour.stops.some((stop) => stop.artworkId === progress[tour.id]?.workId),
  );
  const recentTour = savedTours.reduce<(typeof GALLERY_TOURS)[number] | undefined>(
    (latest, candidate) =>
      !latest || progress[candidate.id].updatedAt > progress[latest.id].updatedAt
        ? candidate
        : latest,
    undefined,
  );
  const openingTour = recentTour ?? GALLERY_TOURS[0];
  const openingWorkId = recentTour ? progress[recentTour.id].workId : openingTour?.coverId;
  const openingArtwork = openingWorkId ? getTourArtwork(openingWorkId) : undefined;
  const openingIndex = openingTour ? getTourStopIndex(openingTour, openingWorkId) : 0;
  const recentReachedEnd = Boolean(recentTour && openingIndex === recentTour.stops.length - 1);

  function startSurprise() {
    const tour = GALLERY_TOURS[Math.floor(Math.random() * GALLERY_TOURS.length)];
    if (tour) onStart(tour.id);
  }

  return (
    <div className="gallery-tour-entrance">
      <section className="gallery-tour-introduction" aria-labelledby="gallery-tour-heading">
        <div className="gallery-tour-introduction-copy">
          <p className="gallery-tour-eyebrow">
            GUIDED EXHIBITIONS · {GALLERY_TOURS.length} COURSES
          </p>
          <h1 id="gallery-tour-heading" tabIndex={-1}>
            光景を、旅する。
          </h1>
          <p className="gallery-tour-introduction-lead">
            ひとつの光、ひとつの横顔から、次の一枚へ。色や構図でつながる作品を、小さな鑑賞ツアーで巡ります。
          </p>
          {recentTour && (
            <div className="gallery-tour-recent">
              <p className="gallery-tour-recent-label">
                {recentReachedEnd ? "最後に眺めた景色" : "前回の景色から"}
              </p>
              <p className="gallery-tour-recent-title">{recentTour.title}</p>
              <p className="gallery-tour-recent-position">
                {openingIndex + 1} / {recentTour.stops.length} 点目 · {openingArtwork?.title}
              </p>
              <button
                className="gallery-tour-action gallery-tour-action-primary"
                type="button"
                onClick={() => onStart(recentTour.id, openingWorkId)}
                aria-label={`鑑賞を再開：${recentTour.title}`}
              >
                {recentReachedEnd ? "最後の一枚に戻る" : "鑑賞を再開する"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
          <div className="gallery-tour-introduction-actions">
            <a
              className={`gallery-tour-action ${recentTour ? "gallery-tour-action-text" : "gallery-tour-action-primary"}`}
              href="#gallery-tour-catalogue"
            >
              {recentTour ? "別のコースを選ぶ" : "コースを選ぶ"} <span aria-hidden="true">↓</span>
            </a>
            <button
              className="gallery-tour-action gallery-tour-action-text"
              type="button"
              onClick={startSurprise}
            >
              おまかせで選ぶ <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        {openingArtwork && (
          <figure className="gallery-tour-opening-artwork">
            <div className="gallery-tour-opening-frame">
              <img
                src={openingArtwork.medium}
                srcSet={openingArtwork.srcSet}
                sizes="(max-width: 800px) calc(100vw - 40px), 48vw"
                width={openingArtwork.width}
                height={openingArtwork.height}
                alt={openingArtwork.alt}
                decoding="async"
                fetchPriority="high"
              />
            </div>
            <figcaption>
              <span>{openingArtwork.title}</span>
              <span>「{openingTour.title}」より</span>
            </figcaption>
          </figure>
        )}
      </section>

      <section
        id="gallery-tour-catalogue"
        className="gallery-tour-catalogue"
        aria-labelledby="gallery-tour-catalogue-heading"
      >
        <div className="gallery-tour-catalogue-heading">
          <div>
            <p className="gallery-tour-eyebrow">CHOOSE YOUR PATH</p>
            <h2 id="gallery-tour-catalogue-heading">いま惹かれる景色から。</h2>
          </div>
          <p>気になる光や仕草を入口に、全体を眺めながら一枚ずつ。途中の作品からも巡れます。</p>
        </div>
        <nav className="gallery-tour-course-index" aria-label="鑑賞コース">
          {GALLERY_TOURS.map((tour, index) => (
            <a href={`#gallery-tour-course-${tour.id}`} key={tour.id}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {tour.title}
            </a>
          ))}
        </nav>
        {storageMessage && (
          <p className="gallery-tour-entrance-message" role="status">
            {storageMessage}
          </p>
        )}
        <div className="gallery-tour-course-grid">
          {GALLERY_TOURS.map((tour, tourIndex) => {
            const artwork = getTourArtwork(tour.coverId);
            const saved = progress[tour.id];
            const hasSavedPosition = Boolean(
              saved && tour.stops.some((stop) => stop.artworkId === saved.workId),
            );
            const stopIndex = hasSavedPosition ? getTourStopIndex(tour, saved.workId) : 0;
            const reachedEnd = hasSavedPosition && stopIndex === tour.stops.length - 1;
            const startLabel = reachedEnd
              ? "最後の作品をもう一度"
              : hasSavedPosition
                ? "続きから巡る"
                : "このコースを巡る";
            const previewIndexes = [
              ...new Set([0, Math.floor(tour.stops.length / 2), tour.stops.length - 1]),
            ];
            const resumeArtwork = hasSavedPosition ? getTourArtwork(saved.workId) : undefined;

            return (
              <article
                className="gallery-tour-course"
                id={`gallery-tour-course-${tour.id}`}
                data-tour-id={tour.id}
                key={tour.id}
                style={{ "--gallery-tour-course-accent": tour.accent } as CSSProperties}
                aria-labelledby={`gallery-tour-title-${tour.id}`}
              >
                <div className="gallery-tour-course-visual">
                  <span className="gallery-tour-course-number" aria-hidden="true">
                    {String(tourIndex + 1).padStart(2, "0")}
                  </span>
                  {artwork && (
                    <img
                      className="gallery-tour-course-cover"
                      src={artwork.medium}
                      srcSet={artwork.srcSet}
                      sizes="(max-width: 600px) calc(100vw - 40px), (max-width: 980px) 45vw, 35vw"
                      width={artwork.width}
                      height={artwork.height}
                      alt={artwork.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </div>
                <div className="gallery-tour-course-body">
                  <p className="gallery-tour-course-kicker">{tour.kicker}</p>
                  <h3 id={`gallery-tour-title-${tour.id}`} tabIndex={-1}>
                    {tour.title}
                  </h3>
                  <p className="gallery-tour-course-description">{tour.description}</p>
                  <div
                    className="gallery-tour-course-previews"
                    role="group"
                    aria-label={`${tour.title}の作品から巡る`}
                  >
                    {previewIndexes.map((index) => {
                      const preview = getTourArtwork(tour.stops[index].artworkId);
                      return preview ? (
                        <button
                          className="gallery-tour-course-preview"
                          type="button"
                          key={preview.id}
                          onClick={() => onStart(tour.id, preview.id)}
                          aria-label={`${tour.title}の${index + 1}点目「${preview.title}」から巡る`}
                        >
                          <span className="gallery-tour-course-preview-image">
                            <img
                              src={preview.thumb}
                              width={preview.width}
                              height={preview.height}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          </span>
                          <span className="gallery-tour-course-preview-caption">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <span>{preview.title}</span>
                          </span>
                        </button>
                      ) : null;
                    })}
                  </div>
                  <details className="gallery-tour-course-observation">
                    <summary>最初の一枚の見どころ</summary>
                    <p>{tour.stops[0]?.note}</p>
                  </details>
                  <div className="gallery-tour-course-bottom">
                    <div className="gallery-tour-course-position">
                      <span>全{tour.stops.length}点</span>
                      <span>
                        {hasSavedPosition
                          ? reachedEnd
                            ? "最後の作品まで到達"
                            : `再開位置 ${stopIndex + 1} / ${tour.stops.length}`
                          : "最初の一枚から"}
                      </span>
                    </div>
                    {resumeArtwork && (
                      <p className="gallery-tour-course-resume-work">
                        再開する作品：{resumeArtwork.title}
                      </p>
                    )}
                    {hasSavedPosition && (
                      <progress
                        className="gallery-tour-course-progress"
                        value={stopIndex + 1}
                        max={tour.stops.length}
                        aria-label={`${tour.title}の再開位置`}
                      />
                    )}
                    <div className="gallery-tour-course-actions">
                      <button
                        className="gallery-tour-action gallery-tour-action-primary"
                        type="button"
                        onClick={() =>
                          onStart(tour.id, hasSavedPosition ? saved.workId : undefined)
                        }
                        aria-label={`${startLabel}：${tour.title}`}
                      >
                        {startLabel}
                        <span aria-hidden="true">→</span>
                      </button>
                      {hasSavedPosition && stopIndex > 0 && (
                        <button
                          className="gallery-tour-action gallery-tour-action-text"
                          type="button"
                          onClick={() => onStart(tour.id)}
                          aria-label={`${tour.title}を最初から巡る`}
                        >
                          最初から巡る
                        </button>
                      )}
                      {hasSavedPosition && (
                        <button
                          className="gallery-tour-reset"
                          type="button"
                          onClick={(event) => {
                            event.currentTarget
                              .closest(".gallery-tour-course-actions")
                              ?.querySelector<HTMLButtonElement>(".gallery-tour-action-primary")
                              ?.focus({ preventScroll: true });
                            onReset(tour.id);
                          }}
                          aria-label={`${tour.title}の記録をリセット`}
                        >
                          記録をリセット
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
