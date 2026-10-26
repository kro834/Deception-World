import { createFileRoute, Link } from "@tanstack/react-router";
import { GALLERY_ARTWORKS } from "@/components/gallery/gallery-data";
import { ExhibitionStudio } from "@/components/exhibition/exhibition-studio";
import { ExhibitionArtworkBrowser } from "@/components/exhibition/exhibition-artwork-browser";
import { useExhibitionArtworkReady } from "@/lib/use-exhibition-artwork-ready";
import { normalizeExhibitionSearch } from "@/lib/gallery-route-search";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import studioCssUrl from "@/styles-exhibition-studio.css?url";
import roomCssUrl from "@/styles-exhibition-room.css?url";
import commandArchiveCssUrl from "@/styles-command-archive.css?url";

export const Route = createFileRoute("/exhibition")({
  validateSearch: normalizeExhibitionSearch,
  component: ExhibitionRoom,
  head: () =>
    createWorldHead({
      title: "原画のある展示室｜Deception World",
      description: "原画をそのまま飾り、額縁・ガラス・漆喰の壁・石床・照明を立体で鑑賞する展示室。",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: studioCssUrl },
        { rel: "stylesheet", href: roomCssUrl },
        { rel: "stylesheet", href: commandArchiveCssUrl },
      ],
    }),
});

function ExhibitionRoom() {
  const { work } = Route.useSearch();
  const navigate = Route.useNavigate();
  const ready = useExhibitionArtworkReady();
  const index = Math.max(
    0,
    GALLERY_ARTWORKS.findIndex((art) => art.id === work),
  );
  const artwork = GALLERY_ARTWORKS[index];
  const number = String(index + 1).padStart(3, "0");
  const select = (id: string) =>
    void navigate({ search: { work: id }, replace: true, resetScroll: false });

  return (
    <main
      className="exhibition-room exhibition-room-curated command-exhibition dg-focus-scope"
      id="main"
    >
      <header className="exhibition-room-heading dg-reveal">
        <div>
          <h1>原画のある、展示室。</h1>
          <p className="exhibition-room-lead">光と素材に囲まれて、一枚と向き合う。</p>
        </div>
        <div className="exhibition-room-entrances">
          <Link className="dg-control" to="/gallery">
            ギャラリーに戻る ↗
          </Link>
          <Link className="dg-control" to="/gallery-tours">
            展示を巡る ↗
          </Link>
        </div>
      </header>
      <section
        className="exhibition-room-current"
        id="exhibition-current-work"
        tabIndex={-1}
        aria-labelledby="exhibition-current-title"
      >
        <div className="exhibition-room-work-heading">
          <div className="exhibition-room-work-title" aria-live="polite" aria-atomic="true">
            <p className="exhibition-room-work-number">
              <span>{number}</span> / {GALLERY_ARTWORKS.length}
            </p>
            <h2 id="exhibition-current-title">{artwork.title}</h2>
          </div>
          <div className="exhibition-room-choose">
            <a href="#exhibition-shelf-heading">画像から選ぶ ↓</a>
            <label>
              <span>展示する原画</span>
              <select value={artwork.id} onChange={(event) => select(event.currentTarget.value)}>
                {GALLERY_ARTWORKS.map((art, position) => (
                  <option key={art.id} value={art.id}>
                    {String(position + 1).padStart(3, "0")} — {art.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="exhibition-room-view" aria-label={`${number}の立体展示`}>
          <ExhibitionStudio
            immersive
            initialView="room"
            showEnlargeHint={false}
            artworkUrl={artwork.full}
            artworkWidth={artwork.width}
            artworkHeight={artwork.height}
            artworkReady={ready}
          >
            <img
              className="exhibition-room-source"
              src={artwork.full}
              width={artwork.width}
              height={artwork.height}
              alt={artwork.alt}
              decoding="async"
            />
          </ExhibitionStudio>
        </div>
        <div className="exhibition-room-caption">
          <p>{artwork.alt}</p>
          <a href={artwork.full} target="_blank" rel="noreferrer">
            原画を別のタブで開く ↗
          </a>
        </div>
        <nav className="exhibition-room-adjacent" aria-label="展示する作品">
          <button
            type="button"
            className="dg-control"
            disabled={index === 0}
            onClick={() => select(GALLERY_ARTWORKS[index - 1].id)}
          >
            <span>← 前の作品</span>
            <span>{GALLERY_ARTWORKS[index - 1]?.title ?? "最初の作品です"}</span>
          </button>
          <span className="exhibition-room-adjacent-number" aria-hidden="true">
            {number}
          </span>
          <button
            type="button"
            className="dg-control"
            disabled={index === GALLERY_ARTWORKS.length - 1}
            onClick={() => select(GALLERY_ARTWORKS[index + 1].id)}
          >
            <span>次の作品 →</span>
            <span>{GALLERY_ARTWORKS[index + 1]?.title ?? "最後の作品です"}</span>
          </button>
        </nav>
      </section>
      <ExhibitionArtworkBrowser currentIndex={index} onSelect={select} />
    </main>
  );
}
