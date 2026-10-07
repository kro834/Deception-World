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
  const openingTour = GALLERY_TOURS[0];
  const openingArtwork = openingTour && getTourArtwork(openingTour.coverId);
  const savedTourCount = GALLERY_TOURS.filter((tour) =>
    tour.stops.some((stop) => stop.artworkId === progress[tour.id]?.workId),
  ).length;

  function startSurprise() {
    const tour = GALLERY_TOURS[Math.floor(Math.random() * GALLERY_TOURS.length)];
    if (tour) onStart(tour.id);
  }

  return (
    <div className="gallery-tour-entrance">
      <section className="gallery-tour-introduction" aria-labelledby="gallery-tour-heading">
        <div className="gallery-tour-introduction-copy">
          <p className="gallery-tour-eyebrow">A DIFFERENT WAY TO LOOK</p>
          <h1 id="gallery-tour-heading" tabIndex={-1}>
            光景を、旅する。
          </h1>
          <p className="gallery-tour-introduction-lead">
            ひとつの光、ひとつの横顔から、次の一枚へ。色や構図でつながる作品を、小さな鑑賞ツアーで巡ります。
          </p>
          <p className="gallery-tour-introduction-note">
            気になるコースを選び、自分のペースで進んでください。それぞれの作品に添えた見どころが、いつもとは違う眺め方への入口になります。
          </p>
          <div className="gallery-tour-introduction-actions">
            <a
              className="gallery-tour-action gallery-tour-action-primary"
              href="#gallery-tour-catalogue"
            >
              コースを選ぶ <span aria-hidden="true">↓</span>
            </a>
            <button
              className="gallery-tour-action gallery-tour-action-text"
              type="button"
              onClick={startSurprise}
            >
              おまかせで選ぶ <span aria-hidden="true">↗</span>
            </button>
          </div>
          <p className="gallery-tour-introduction-facts">
            <span>{GALLERY_TOURS.length}つの鑑賞コース</span>
            <span>途中からでも再開できます</span>
          </p>
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
              <span>EXHIBITION PREVIEW</span>
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
          <p>
            {savedTourCount > 0
              ? `${savedTourCount}つのコースに再開位置が残っています。途中の一枚に戻ることも、最初から巡ることもできます。`
              : "どのコースからでも、好きな順番で。作品の全体を眺めながら、一枚ずつ進みます。"}
          </p>
        </div>
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
              ? "最初から巡る"
              : hasSavedPosition
                ? "続きから巡る"
                : "このコースを巡る";
            const previewIndexes = [
              ...new Set([0, Math.floor(tour.stops.length / 2), tour.stops.length - 1]),
            ];

            return (
              <article
                className="gallery-tour-course"
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
                  <h3 id={`gallery-tour-title-${tour.id}`}>{tour.title}</h3>
                  <p className="gallery-tour-course-description">{tour.description}</p>
                  <div className="gallery-tour-course-previews" aria-hidden="true">
                    {previewIndexes.map((index) => {
                      const preview = getTourArtwork(tour.stops[index].artworkId);
                      return preview ? (
                        <div className="gallery-tour-course-preview" key={preview.id}>
                          <img
                            src={preview.thumb}
                            width={preview.width}
                            height={preview.height}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      ) : null;
                    })}
                  </div>
                  <div className="gallery-tour-course-observation">
                    <span>最初の見どころ</span>
                    <p>{tour.stops[0]?.note}</p>
                  </div>
                  <div className="gallery-tour-course-bottom">
                    <div className="gallery-tour-course-position">
                      <span>全{tour.stops.length}点</span>
                      <span>
                        {hasSavedPosition
                          ? reachedEnd
                            ? "最後の作品まで到達"
                            : `再開位置 ${stopIndex + 1} / ${tour.stops.length}`
                          : "ゆっくり、一枚ずつ"}
                      </span>
                    </div>
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
                          onStart(
                            tour.id,
                            hasSavedPosition && !reachedEnd ? saved.workId : undefined,
                          )
                        }
                        aria-label={`${startLabel}：${tour.title}`}
                      >
                        {startLabel}
                        <span aria-hidden="true">→</span>
                      </button>
                      {hasSavedPosition && !reachedEnd && stopIndex > 0 && (
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
