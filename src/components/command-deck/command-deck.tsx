import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
} from "lucide-react";
import { OPENING_LOGO_FIRST } from "@/lib/opening-logo";
import { launcherTile, posterImage } from "@/lib/thumbnail-images";
import { rexonanceImage } from "@/lib/rexonance-images";
import { GuardedLink } from "@/components/load-gate";
import {
  DREAM_CHAPTER_ENTER_ASSETS,
  FINAL_STAGE_ENTER_ASSETS,
  WORLD_ENTER_ASSETS,
} from "@/lib/asset-loader";

type Artwork = { src: string; alt: string; width: number; height: number; kind?: "final" };
const SCENES = [
  {
    id: "world",
    name: "World",
    japanese: "ディセプションワールド",
    title: ["DECEPTION", "WORLD"],
    href: "/world",
    accent: "#74d9ec",
    ink: "#c8faff",
    links: [
      { label: "物語", href: "/world#story" },
      { label: "ライダー", href: "/world#riders" },
      { label: "六詠", href: "/world#manager-archive" },
    ],
    artwork: [
      {
        src: "/deception-world-poster-delivery.webp",
        alt: "仮面ライダーサーガ Deception World のキービジュアル",
        width: 1024,
        height: 1536,
      },
      {
        src: "/poster-card-16.jpeg",
        alt: "二人のライダーが並ぶ Deception World のキービジュアル",
        width: 1672,
        height: 941,
      },
      {
        src: "/poster-card-17.jpeg",
        alt: "夜空の下で佇む青と金の仮面ライダーサーガ",
        width: 960,
        height: 1280,
      },
    ] satisfies Artwork[],
  },
  {
    id: "dream",
    name: "Dream",
    japanese: "夢の章",
    title: ["DREAM", "CHAPTER"],
    href: "/dream-chapter",
    accent: "#beb7f7",
    ink: "#e7ddff",
    links: [
      { label: "物語の記録", href: "/dream-chapter#cases" },
      { label: "登場人物", href: "/dream-chapter#characters" },
      { label: "絵看板", href: "/dream-chapter#posters" },
    ],
    artwork: [
      {
        src: "/dream-chapter-poster-05.jpeg",
        alt: "夢の章のキービジュアル",
        width: 1448,
        height: 1086,
      },
      { src: "/dream-chapter-poster-01.jpeg", alt: "夢の章の絵看板 01", width: 1126, height: 1397 },
      { src: "/dream-chapter-poster-14.jpeg", alt: "夢の章の絵看板 14", width: 1280, height: 723 },
    ] satisfies Artwork[],
  },
  {
    id: "final",
    name: "Final Stage",
    japanese: "ファイナルステージ",
    title: ["FINAL", "STAGE"],
    href: "/final-stage",
    accent: "#e5ca8e",
    ink: "#ffe2a8",
    links: [
      { label: "あらすじ", href: "/final-stage#story" },
      { label: "登場人物", href: "/final-stage#characters" },
      { label: "ライダー", href: "/final-stage#riders" },
    ],
    artwork: [
      {
        src: "/final-stage-logo.webp",
        alt: "仮面ライダーサーガ FINAL STAGE のタイトルロゴ",
        width: 1536,
        height: 1024,
        kind: "final",
      },
      {
        src: "/rider-far-from-saga-middle.webp",
        alt: "仮面ライダーファーフロムサーガ ミドル",
        width: 1070,
        height: 1470,
        kind: "final",
      },
      {
        src: "/rider-realm-royal.webp",
        alt: "仮面ライダーレルムロイヤル",
        width: 1008,
        height: 1560,
        kind: "final",
      },
    ] satisfies Artwork[],
  },
] as const;

const RIDERS = [
  ["saga", "サーガ"],
  ["realm", "レルム"],
  ["lore", "ローア"],
  ["vandal", "ヴァンダール"],
  ["leddic", "レディック"],
  ["argenome", "アルゲノム"],
  ["over-zeztz", "オーバーゼッツ"],
  ["cipher", "サイファー"],
] as const;

type Renderer = ReturnType<
  (typeof import("@/lib/command-deck-renderer"))["mountCommandDeckRenderer"]
>;
type HtmlCanvas = ReturnType<
  (typeof import("@/lib/command-deck-html-canvas"))["mountCommandDeckHtmlCanvas"]
>;

function imageProps(art: Artwork) {
  return art.kind === "final"
    ? {
        src: art.src,
        ...rexonanceImage(art.src),
        sizes: "(max-width: 620px) 76vw, (max-width: 1100px) 48vw, 460px",
      }
    : {
        src: art.src,
        ...posterImage(art.src),
        sizes: "(max-width: 620px) 76vw, (max-width: 1100px) 48vw, 460px",
      };
}

function DeckLink({
  href,
  ...props
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const [to, hash] = href.split("#");
  const assets =
    to === "/world"
      ? WORLD_ENTER_ASSETS
      : to === "/dream-chapter"
        ? DREAM_CHAPTER_ENTER_ASSETS
        : to === "/final-stage"
          ? FINAL_STAGE_ENTER_ASSETS
          : [];
  return <GuardedLink to={to} hash={hash} assets={assets} {...props} />;
}

/** All navigation and artwork are server-rendered; the canvas layers only add light and depth. */
export function CommandDeck({ onReplay }: { onReplay?: () => void }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [artIndex, setArtIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const rendererHost = useRef<HTMLDivElement>(null);
  const htmlHost = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const htmlCanvas = useRef<HtmlCanvas | null>(null);
  const currentScene = useRef(0);
  const scene = SCENES[sceneIndex];
  const artwork = scene.artwork[artIndex];

  useEffect(() => {
    const root = rootRef.current;
    const host = rendererHost.current;
    const projection = htmlHost.current;
    if (!root || !host || !projection) return;
    let disposed = false;
    let inView = true;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pause = () => {
      const paused = document.hidden || !inView || motion.matches;
      renderer.current?.setPaused(paused);
      htmlCanvas.current?.setPaused(paused);
    };
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => {
              inView = entry.isIntersecting;
              pause();
            },
            { rootMargin: "100px" },
          )
        : null;
    observer?.observe(root);
    const mount = async () => {
      const economy = document.documentElement.dataset.worldEffects === "economy";
      const [renderModule, htmlModule] = await Promise.allSettled([
        import("@/lib/command-deck-renderer"),
        import("@/lib/command-deck-html-canvas"),
      ]);
      if (disposed) return;
      const activeScene = SCENES[currentScene.current];
      if (renderModule.status === "fulfilled") {
        try {
          renderer.current = renderModule.value.mountCommandDeckRenderer(host, {
            economy,
            maxDpr: economy ? 1 : 1.5,
          });
          renderer.current.setScene(currentScene.current);
        } catch {
          /* The static stage remains complete if a rendering context is unavailable. */
        }
      }
      if (htmlModule.status === "fulfilled" && !economy) {
        try {
          htmlCanvas.current = htmlModule.value.mountCommandDeckHtmlCanvas(projection, {
            title: activeScene.title.join(" "),
            subtitle: activeScene.japanese,
            accent: activeScene.accent,
          });
        } catch {
          /* This is an optional reflection of the visible DOM title. */
        }
      }
      pause();
    };
    // Let the artwork, text and controls paint before importing optional engines.
    const timer = window.setTimeout(() => {
      void mount();
    }, 180);
    document.addEventListener("visibilitychange", pause);
    motion.addEventListener("change", pause);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", pause);
      motion.removeEventListener("change", pause);
      renderer.current?.dispose();
      htmlCanvas.current?.dispose();
      renderer.current = null;
      htmlCanvas.current = null;
    };
  }, []);

  const selectScene = (index: number) => {
    if (index === sceneIndex) return;
    currentScene.current = index;
    setSceneIndex(index);
    setArtIndex(0);
    const next = SCENES[index];
    renderer.current?.setScene(index);
    renderer.current?.pulse();
    htmlCanvas.current?.update({
      title: next.title.join(" "),
      subtitle: next.japanese,
      accent: next.accent,
    });
  };
  const turnArt = (direction: number) => {
    setArtIndex((index) => (index + direction + scene.artwork.length) % scene.artwork.length);
    renderer.current?.pulse();
  };
  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType !== "mouse" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--deck-tilt-x",
      `${((event.clientX - box.left) / box.width - 0.5) * 5}deg`,
    );
    event.currentTarget.style.setProperty(
      "--deck-tilt-y",
      `${((event.clientY - box.top) / box.height - 0.5) * -4}deg`,
    );
  };
  const resetTilt = () => {
    rootRef.current?.style.setProperty("--deck-tilt-x", "0deg");
    rootRef.current?.style.setProperty("--deck-tilt-y", "0deg");
  };

  return (
    <div
      ref={rootRef}
      className="command-deck"
      data-scene={scene.id}
      style={{ "--deck-accent": scene.accent, "--deck-accent-ink": scene.ink } as CSSProperties}
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
    >
      <a className="command-deck-skip" href="#command-deck-main">
        本文へスキップ
      </a>
      <div className="command-deck-engine" ref={rendererHost} aria-hidden="true" />
      <div className="command-deck-grain" aria-hidden="true" />
      <header className="command-deck-header">
        <DeckLink href="/" className="command-deck-brand" aria-label="Deception World トップ">
          <span className="command-deck-brand-mark" aria-hidden="true">
            D<span>W</span>
          </span>
          <span>
            仮面ライダーサーガ
            <br />
            <strong>Deception World</strong>
          </span>
        </DeckLink>
        <nav aria-label="共通ナビゲーション" className="command-deck-header-nav">
          <DeckLink href="/library">
            ライブラリ
            <ArrowUpRight size={14} aria-hidden="true" />
          </DeckLink>
          <DeckLink href="/search" aria-label="資料検索">
            <Search size={19} aria-hidden="true" />
            <span>検索</span>
          </DeckLink>
          <a
            href="/?opening=1"
            aria-label="オープニング"
            className="command-deck-replay"
            onClick={(event) => {
              if (
                !onReplay ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onReplay();
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>オープニング</span>
          </a>
        </nav>
      </header>

      <main id="command-deck-main" className="command-deck-main dg-focus-scope" tabIndex={-1}>
        <div className="command-deck-title" key={`title-${scene.id}`}>
          <h1>
            <span>{scene.title[0]}</span>
            <span>{scene.title[1]}</span>
          </h1>
        </div>
        <div className="command-deck-layout">
          <section className="command-deck-select" aria-label="作品選択">
            <div className="command-deck-section-rule" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="command-deck-scene-buttons" role="group" aria-label="作品を切り替える">
              {SCENES.map((item, index) => (
                <a
                  href={item.href}
                  key={item.id}
                  aria-current={sceneIndex === index ? "true" : undefined}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    selectScene(index);
                  }}
                  className={sceneIndex === index ? "is-selected" : ""}
                >
                  <span className="command-deck-scene-number" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <span className="command-deck-scene-ja">{item.japanese}</span>
                  </span>
                  <ArrowUpRight className="command-deck-scene-arrow" size={21} aria-hidden="true" />
                </a>
              ))}
            </div>
            <DeckLink className="command-deck-enter" href={scene.href}>
              <span>
                {scene.japanese}
                <strong>世界に入る</strong>
              </span>
              <ArrowRight size={31} aria-hidden="true" />
            </DeckLink>
            <a className="command-deck-down" href="#command-deck-riders">
              ライダーを見る
              <ArrowDown size={15} aria-hidden="true" />
            </a>
          </section>

          <section className="command-deck-art-stage" aria-label={`${scene.japanese}のビジュアル`}>
            <div className="command-deck-art-orbit" aria-hidden="true">
              <i />
              <i />
            </div>
            <div className="command-deck-art-backing" aria-hidden="true" />
            <div className="command-deck-art-frame">
              <div className="command-deck-art" key={`${scene.id}-${artIndex}`}>
                <img
                  {...imageProps(artwork)}
                  alt={artwork.alt}
                  width={artwork.width}
                  height={artwork.height}
                  decoding="async"
                  fetchPriority={sceneIndex === 0 && artIndex === 0 ? "high" : "auto"}
                />
              </div>
              <div
                className="command-deck-art-scan"
                aria-hidden="true"
                key={`scan-${scene.id}-${artIndex}`}
              />
              <i className="command-deck-corner command-deck-corner-a" aria-hidden="true" />
              <i className="command-deck-corner command-deck-corner-b" aria-hidden="true" />
            </div>
            <div className="command-deck-art-controls" role="group" aria-label="ビジュアル切替">
              <button type="button" onClick={() => turnArt(-1)} aria-label="前のビジュアル">
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <span aria-live="polite" aria-atomic="true">
                <b>{String(artIndex + 1).padStart(2, "0")}</b>
                <span aria-hidden="true"> / </span>
                <span className="command-deck-sr">枚目、全</span>
                {String(scene.artwork.length).padStart(2, "0")}
                <span className="command-deck-sr">枚</span>
              </span>
              <button type="button" onClick={() => turnArt(1)} aria-label="次のビジュアル">
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </section>

          <aside className="command-deck-side" aria-label="作品の見どころと資料">
            <div className="command-deck-logo-panel">
              <img
                {...OPENING_LOGO_FIRST}
                sizes="(max-width: 620px) 220px, 250px"
                alt="仮面ライダーサーガ Deception World"
                width="1536"
                height="1024"
                decoding="async"
              />
            </div>
            <nav
              className="command-deck-chapter-links"
              aria-label={`${scene.japanese}の内容`}
              key={`links-${scene.id}`}
            >
              {scene.links.map((link) => (
                <DeckLink key={link.href} href={link.href}>
                  <span>{link.label}</span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </DeckLink>
              ))}
            </nav>
            <DeckLink href="/gallery" className="command-deck-gallery-link">
              <span>ギャラリー</span>
              <ArrowUpRight size={25} aria-hidden="true" />
              <div ref={htmlHost} className="command-deck-html-projection" aria-hidden="true" />
            </DeckLink>
          </aside>
        </div>

        <section
          className="command-deck-riders"
          id="command-deck-riders"
          aria-labelledby="command-deck-riders-title"
        >
          <header>
            <h2 id="command-deck-riders-title">ライダー</h2>
            <DeckLink href="/riders">
              すべて見る
              <ArrowUpRight size={16} aria-hidden="true" />
            </DeckLink>
          </header>
          <nav aria-label="ライダーショートカット" className="command-deck-rider-rail">
            {RIDERS.map(([id, name], index) => (
              <DeckLink href={`/riders/${id}`} key={id} aria-label={name}>
                <span className="command-deck-rider-portrait">
                  <img
                    src={launcherTile(`/riders/${id}`)}
                    alt=""
                    width="240"
                    height="300"
                    loading="lazy"
                    decoding="async"
                  />
                  <span aria-hidden="true">0{index + 1}</span>
                </span>
                <strong>
                  {id === "over-zeztz" ? (
                    <>
                      <span>オーバー</span>
                      <wbr />
                      <span>ゼッツ</span>
                    </>
                  ) : id === "vandal" ? (
                    <>
                      <span>ヴァン</span>
                      <wbr />
                      <span>ダール</span>
                    </>
                  ) : (
                    name
                  )}
                </strong>
                <ArrowUpRight size={15} aria-hidden="true" />
              </DeckLink>
            ))}
          </nav>
        </section>
        <nav className="command-deck-footer" aria-label="資料を探す">
          <DeckLink href="/world#manager-archive-other">
            人物一覧
            <ArrowUpRight size={19} aria-hidden="true" />
          </DeckLink>
          <DeckLink href="/gallery">
            ギャラリー
            <ArrowUpRight size={19} aria-hidden="true" />
          </DeckLink>
          <DeckLink href="/library">
            ライブラリ
            <ArrowUpRight size={19} aria-hidden="true" />
          </DeckLink>
          <DeckLink href="/search">
            資料検索
            <Search size={18} aria-hidden="true" />
          </DeckLink>
        </nav>
      </main>
    </div>
  );
}
