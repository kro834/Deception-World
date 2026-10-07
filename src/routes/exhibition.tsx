import { createFileRoute, Link } from "@tanstack/react-router";
import { GALLERY_ARTWORKS } from "@/components/gallery/gallery-data";
import { ExhibitionStudio } from "@/components/ultra/exhibition-studio";
import { useUltraArtworkReady } from "@/lib/use-ultra-artwork-ready";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import studioCssUrl from "@/styles-exhibition-studio.css?url";

export const Route = createFileRoute("/exhibition")({
  validateSearch: (search: Record<string, unknown>): { work?: string } => ({
    work:
      typeof search.work === "string" && GALLERY_ARTWORKS.some((art) => art.id === search.work)
        ? search.work
        : undefined,
  }),
  component: ExhibitionRoom,
  head: () =>
    createWorldHead({
      title: "原画のある展示室｜Deception World",
      description: "原画をそのまま飾り、額縁・ガラス・漆喰の壁・石床・照明を立体で鑑賞する展示室。",
      stylesheetLinks: [...WORLD_CORE_STYLESHEET_LINKS, { rel: "stylesheet", href: studioCssUrl }],
    }),
});

function ExhibitionRoom() {
  const { work } = Route.useSearch();
  const navigate = Route.useNavigate();
  const ready = useUltraArtworkReady();
  const index = Math.max(
    0,
    GALLERY_ARTWORKS.findIndex((art) => art.id === work),
  );
  const artwork = GALLERY_ARTWORKS[index];
  const select = (id: string) =>
    void navigate({ search: { work: id }, replace: true, resetScroll: false });
  return (
    <main className="exhibition-room" id="main">
      <header className="exhibition-room-heading">
        <div>
          <p>DECEPTION WORLD / EXHIBITION ROOM</p>
          <h1>原画のある、展示室。</h1>
        </div>
        <Link to="/gallery">ギャラリーに戻る ↗</Link>
      </header>
      <p className="exhibition-room-intro">
        原画の構図を保ったまま、照明と素材の表情を味わう展示室です。作品を選び、鑑賞する角度を切り替えてご覧ください。高精細な3D表示のため、端末の負荷が高くなる場合があります。
      </p>
      <nav className="exhibition-room-selector" aria-label="展示する作品">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => select(GALLERY_ARTWORKS[index - 1].id)}
        >
          ← 前の作品
        </button>
        <label>
          <span>展示する原画</span>
          <select value={artwork.id} onChange={(event) => select(event.currentTarget.value)}>
            {GALLERY_ARTWORKS.map((art, position) => (
              <option key={art.id} value={art.id}>
                {String(position + 1).padStart(3, "0")} — {art.alt}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={index === GALLERY_ARTWORKS.length - 1}
          onClick={() => select(GALLERY_ARTWORKS[index + 1].id)}
        >
          次の作品 →
        </button>
      </nav>
      <section
        className="exhibition-room-view"
        aria-label={`${String(index + 1).padStart(3, "0")}の立体展示`}
      >
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
      </section>
      <div className="exhibition-room-caption">
        <p>
          <b>{String(index + 1).padStart(3, "0")}</b> {artwork.alt}
        </p>
        <a href={artwork.full} target="_blank" rel="noreferrer">
          原画を別のタブで開く ↗
        </a>
        <p>
          Blenderで制作した照明・漆喰の材質データを使用。3Dを利用できない環境や表示の軽減設定がある場合は、原画をそのまま表示します。
        </p>
      </div>
    </main>
  );
}
