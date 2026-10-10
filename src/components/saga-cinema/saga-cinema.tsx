import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent,
} from "react";
import { useRouter } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { acquireViewportScrollLock } from "@/lib/viewport-scroll-lock.js";
import {
  SAGA_CINEMA_FILMS,
  SAGA_CINEMA_LOGO,
  SAGA_CINEMA_TITLE,
  cinemaDownload,
  cinemaNumber,
  cinemaPosterAlt,
  cinemaWrap,
  loadCinemaPoster,
} from "./saga-cinema-data";
import { useCinemaMotion, useCinemaPreferences } from "./use-cinema-motion";

function useNativeDialog(ref: RefObject<HTMLDialogElement | null>, open: boolean) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [ref, open]);
}

function WorldReturn({
  className,
  beforeNavigate,
  children,
}: {
  className: string;
  beforeNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <GuardedLink
      className={className}
      to="/world"
      hash="top"
      transition="dream"
      assets={WORLD_ENTER_ASSETS}
      beforeNavigate={beforeNavigate}
      aria-label="ディセプションワールドへ戻る"
    >
      {children}
    </GuardedLink>
  );
}

function SectionLabel({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="section-label">
      <span>{number}</span>
      <h2>{title}</h2>
      <span>{children}</span>
    </div>
  );
}

export function SagaCinema() {
  useWorldMode();
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const openingRef = useRef<HTMLDialogElement>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const galleryRef = useRef<HTMLDialogElement>(null);
  const detailPosterRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const selectionRef = useRef(0);
  const requestedHeroRef = useRef(3);
  const committedHeroRef = useRef(3);
  const galleryFromDetailRef = useRef(false);
  const openingInitializedRef = useRef(false);
  const releaseScrollLockRef = useRef<(() => void) | null>(null);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const openingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const [heroIndex, setHeroIndex] = useState(3);
  const [heroChanging, setHeroChanging] = useState(false);
  const [detailIndex, setDetailIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [automatic, setAutomatic] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingDeparting, setOpeningDeparting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [toast, setToast] = useState("");
  const { calm, ready, visible } = useCinemaPreferences();
  const modalOpen = openingOpen || detailOpen || galleryOpen;
  const hero = SAGA_CINEMA_FILMS[heroIndex];
  const detail = SAGA_CINEMA_FILMS[detailIndex];
  const gallery = SAGA_CINEMA_FILMS[galleryIndex];

  useNativeDialog(openingRef, openingOpen);
  useNativeDialog(detailRef, detailOpen);
  useNativeDialog(galleryRef, galleryOpen);
  useCinemaMotion(
    pageRef,
    canvasRef,
    heroIndex,
    calm,
    ready,
    modalOpen || menuOpen || !visible || !heroVisible,
  );

  const showToast = useCallback((message: string) => {
    if (!mountedRef.current) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setToast("");
    }, 3500);
  }, []);

  const closeAll = useCallback(() => {
    selectionRef.current += 1;
    requestedHeroRef.current = committedHeroRef.current;
    setHeroChanging(false);
    if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    [openingRef, galleryRef, detailRef].forEach((ref) => {
      if (ref.current?.open) ref.current.close();
    });
    releaseScrollLockRef.current?.();
    releaseScrollLockRef.current = null;
    setOpeningOpen(false);
    setOpeningDeparting(false);
    setGalleryOpen(false);
    setDetailOpen(false);
    setMenuOpen(false);
  }, []);

  useEffect(
    () =>
      router.history.subscribe(({ action }) => {
        if (action.type === "BACK" || action.type === "FORWARD" || action.type === "GO") closeAll();
      }),
    [router, closeAll],
  );

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      selectionRef.current += 1;
      timers.forEach((timer) => clearTimeout(timer));
      if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      [openingRef, galleryRef, detailRef].forEach((ref) => {
        if (ref.current?.open) ref.current.close();
      });
    };
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const release = acquireViewportScrollLock({ freezeBody: true });
    releaseScrollLockRef.current = release;
    return () => {
      release();
      if (releaseScrollLockRef.current === release) releaseScrollLockRef.current = null;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!heroRef.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => setHeroVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.08 },
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || openingInitializedRef.current) return;
    openingInitializedRef.current = true;
    if (calm || (window.location.hash && window.location.hash !== "#top")) return;
    try {
      if (sessionStorage.getItem("saga-opening-v2") === "seen") return;
    } catch {
      /* Session storage is optional. */
    }
    const root = document.documentElement;
    const openWhenReady = () => {
      if (root.hasAttribute("data-loading")) return;
      setOpeningOpen(true);
      observer.disconnect();
    };
    const observer = new MutationObserver(openWhenReady);
    observer.observe(root, { attributes: true, attributeFilter: ["data-loading"] });
    openWhenReady();
    return () => observer.disconnect();
  }, [calm, ready]);

  useEffect(() => {
    if (!calm) return;
    setAutomatic(false);
    setOpeningOpen(false);
    setOpeningDeparting(false);
    if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
  }, [calm]);

  const selectHero = useCallback(
    async (value: number, manual = false) => {
      const index = cinemaWrap(value);
      const selection = ++selectionRef.current;
      requestedHeroRef.current = index;
      if (manual) setAutomatic(false);
      try {
        await loadCinemaPoster(index);
      } catch {
        if (!mountedRef.current || selection !== selectionRef.current) return;
        requestedHeroRef.current = committedHeroRef.current;
        setHeroChanging(false);
        setAutomatic(false);
        showToast("画像を読み込めませんでした。もう一度作品を選んでください。");
        return;
      }
      if (!mountedRef.current || selection !== selectionRef.current) return;
      if (!calm) {
        setHeroChanging(true);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            timersRef.current.delete(timer);
            resolve();
          }, 170);
          timersRef.current.add(timer);
        });
      }
      if (!mountedRef.current || selection !== selectionRef.current) return;
      committedHeroRef.current = index;
      setHeroIndex(index);
      setHeroChanging(false);
    },
    [calm, showToast],
  );

  useEffect(() => {
    if (!automatic || !heroVisible || !visible || modalOpen || menuOpen || calm) return;
    const timer = setTimeout(() => {
      void selectHero(heroIndex + 1);
    }, 6500);
    return () => clearTimeout(timer);
  }, [automatic, heroVisible, visible, modalOpen, menuOpen, calm, heroIndex, selectHero]);

  const chapterKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = cinemaWrap(requestedHeroRef.current + (event.key === "ArrowRight" ? 1 : -1));
    void selectHero(index, true);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`button[data-chapter="${index}"]`)
      ?.focus({ preventScroll: true });
  };

  const enterSaga = () => {
    if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    try {
      sessionStorage.setItem("saga-opening-v2", "seen");
    } catch {
      /* Optional persistence. */
    }
    if (calm) {
      setOpeningOpen(false);
      setOpeningDeparting(false);
      return;
    }
    setOpeningDeparting(true);
    openingTimerRef.current = setTimeout(() => {
      setOpeningOpen(false);
      setOpeningDeparting(false);
    }, 650);
  };
  const replayOpening = () => {
    if (openingTimerRef.current) clearTimeout(openingTimerRef.current);
    setOpeningDeparting(false);
    setOpeningOpen(true);
  };
  const openDetail = (index: number) => {
    setDetailIndex(cinemaWrap(index));
    setDetailOpen(true);
  };
  const changeDetail = (index: number) => {
    setDetailIndex(cinemaWrap(index));
    if (detailRef.current) detailRef.current.scrollTop = 0;
  };
  const openGallery = (index: number, fromDetail = false) => {
    galleryFromDetailRef.current = fromDetail;
    setGalleryIndex(cinemaWrap(index));
    setGalleryOpen(true);
  };
  const galleryClosed = () => {
    setGalleryOpen(false);
    if (galleryFromDetailRef.current && detailRef.current?.open)
      detailPosterRef.current?.focus({ preventScroll: true });
    galleryFromDetailRef.current = false;
  };
  const galleryTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5)
      setGalleryIndex((index) => cinemaWrap(index + (dx < 0 ? 1 : -1)));
  };
  const shareSite = async () => {
    const data = {
      title: SAGA_CINEMA_TITLE,
      url: new URL("/saga-cinema", window.location.origin).href,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        showToast("サイトのURLをコピーしました");
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError")
        showToast("アドレスバーからURLをコピーできます");
    }
  };

  return (
    <>
      <div
        ref={pageRef}
        className="saga-cinema"
        data-chapter={heroIndex + 1}
        data-motion={calm ? "calm" : "full"}
      >
        <canvas ref={canvasRef} id="atmosphere" aria-hidden="true" />
        <div id="site-shell">
          <header className="site-header">
            <a className="site-brand" href="#top" aria-label="仮面ライダーサーガ トップ">
              <span className="brand-mark" aria-hidden="true">
                S
              </span>
              <span>
                <span className="brand-name">KAMEN RIDER SAGA</span>
                <span className="brand-sub">THE CINEMATIC TETRALOGY</span>
              </span>
            </a>
            <nav className="desktop-nav" aria-label="メインナビゲーション">
              <a href="#introduction">
                <span>01</span> INTRODUCTION
              </a>
              <a href="#films">
                <span>02</span> FILMS
              </a>
              <a href="#visuals">
                <span>03</span> VISUALS
              </a>
            </nav>
            <WorldReturn className="world-return-link" beforeNavigate={closeAll}>
              <span>← WORLD</span>
              <span>本編へ</span>
            </WorldReturn>
            <SideMenuTrigger className="menu-button" open={menuOpen} onOpenChange={setMenuOpen} />
          </header>
          <main id="main">
            <section
              ref={heroRef}
              className="hero"
              id="top"
              aria-label="映画4部作 メインビジュアル"
            >
              <div className="hero-backdrop" aria-hidden="true">
                <img
                  id="hero-backdrop"
                  className={heroChanging ? "changing" : undefined}
                  src={hero.image}
                  alt=""
                  width="853"
                  height="1280"
                />
              </div>
              <div className="hero-rings" aria-hidden="true" />
              <div className="hero-layout">
                <div className="hero-copy">
                  <p className="eyebrow">
                    KAMEN RIDER SAGA <span>—</span> MOVIE PROJECT
                  </p>
                  <p className="hero-project">本編リメイク 映画4部作</p>
                  <h1 className="logo-crop">
                    <img
                      src={SAGA_CINEMA_LOGO}
                      width="1536"
                      height="1024"
                      alt="仮面ライダーサーガ"
                      fetchPriority="high"
                    />
                  </h1>
                  <p className="hero-catch">
                    四つの映画で、
                    <br />
                    サーガは新たな姿へ。
                  </p>
                  <p className="hero-description">
                    「邂逅」「覚醒」「激情」「終末」。
                    <br />
                    本編を映画4部作として、新たに描く。
                  </p>
                  <div className="hero-actions">
                    <a className="frame-button" href="#films">
                      4部作を見る <span>↗</span>
                    </a>
                    <button
                      className="text-button"
                      id="hero-gallery"
                      onClick={() => openGallery(heroIndex)}
                    >
                      ポスターを見る <span>＋</span>
                    </button>
                  </div>
                  <div className="project-data">
                    <div>
                      <span>FORMAT</span>
                      <p>全4部作</p>
                    </div>
                    <div>
                      <span>PROJECT</span>
                      <p>本編リメイク</p>
                    </div>
                    <div>
                      <span>RELEASE</span>
                      <p>公開日未発表</p>
                    </div>
                  </div>
                </div>
                <div className="hero-poster-area">
                  <div className="poster-heading">
                    <span>KEY VISUAL</span>
                    <span id="hero-counter">
                      {cinemaNumber(heroIndex)} <i>/</i> 04
                    </span>
                  </div>
                  <button
                    className="hero-poster frame"
                    id="hero-poster"
                    aria-label={`${hero.part} ${hero.title}のポスターを拡大`}
                    onClick={() => openGallery(heroIndex)}
                  >
                    <img
                      id="hero-image"
                      className={heroChanging ? "changing" : undefined}
                      src={hero.image}
                      width="853"
                      height="1280"
                      alt={cinemaPosterAlt(heroIndex)}
                      fetchPriority="high"
                    />
                    <span className="poster-zoom" aria-hidden="true">
                      ＋
                    </span>
                  </button>
                  <div className="poster-caption" aria-live="polite" aria-atomic="true">
                    <span id="hero-chapter">{hero.part}</span>
                    <span id="hero-title">{hero.title}</span>
                    <span id="hero-roman">{hero.roman}</span>
                  </div>
                  <div className="poster-controls" onKeyDown={chapterKeyboard}>
                    <button
                      id="hero-prev"
                      aria-label="前の作品"
                      onClick={() => {
                        void selectHero(requestedHeroRef.current - 1, true);
                      }}
                    >
                      ←
                    </button>
                    <div className="chapter-switch" aria-label="作品を選ぶ">
                      {SAGA_CINEMA_FILMS.map((film, index) => (
                        <button
                          key={film.slug}
                          data-chapter={index}
                          aria-label={`${film.part} ${film.title}`}
                          aria-pressed={heroIndex === index}
                          onClick={() => {
                            void selectHero(index, true);
                          }}
                        >
                          {cinemaNumber(index)}
                        </button>
                      ))}
                    </div>
                    <button
                      id="hero-next"
                      aria-label="次の作品"
                      onClick={() => {
                        void selectHero(requestedHeroRef.current + 1, true);
                      }}
                    >
                      →
                    </button>
                  </div>
                  <button
                    id="auto-play"
                    className="auto-play"
                    aria-pressed={automatic}
                    onClick={() => {
                      if (calm) showToast("動きを減らす設定が有効です。番号から作品を選べます。");
                      else setAutomatic((value) => !value);
                    }}
                  >
                    <span className="play-icon" aria-hidden="true">
                      {automatic ? "Ⅱ" : "▷"}
                    </span>{" "}
                    自動切替 <span id="auto-label">{automatic ? "ON" : "OFF"}</span>
                  </button>
                </div>
              </div>
              <div className="chapter-reel" aria-label="四部作をめぐる" onKeyDown={chapterKeyboard}>
                {SAGA_CINEMA_FILMS.map((film, index) => (
                  <button
                    key={film.slug}
                    data-chapter={index}
                    aria-label={`${film.part} ${film.title}`}
                    aria-pressed={heroIndex === index}
                    onClick={() => {
                      void selectHero(index, true);
                    }}
                  >
                    <small>CHAPTER {cinemaNumber(index)}</small>
                    <strong>{film.title}</strong>
                    <span>{film.roman}</span>
                  </button>
                ))}
              </div>
              <div className="hero-floor">
                <a href="#introduction">
                  SCROLL TO EXPLORE <span>↓</span>
                </a>
                <span>
                  邂逅 <i>/</i> 覚醒 <i>/</i> 激情 <i>/</i> 終末
                </span>
                <button className="text-button" id="replay-intro" onClick={replayOpening}>
                  OPENING <span>↺</span>
                </button>
              </div>
            </section>
            <section className="intro section" id="introduction">
              <SectionLabel number="01" title="INTRODUCTION">
                作品について
              </SectionLabel>
              <div className="intro-layout" data-reveal>
                <div className="intro-art">
                  <div className="intro-art-image">
                    <img
                      src={SAGA_CINEMA_FILMS[0].image}
                      alt="桜と街並みを背景に立つサーガ"
                      width="853"
                      height="1280"
                      loading="lazy"
                    />
                  </div>
                  <span className="image-caption">CHAPTER I / KAIKŌ</span>
                  <span className="intro-numeral" aria-hidden="true">
                    I—IV
                  </span>
                </div>
                <div className="intro-copy">
                  <p className="eyebrow">A SAGA, REIMAGINED.</p>
                  <h3>
                    あの物語を、
                    <br />
                    新たな映画体験へ。
                  </h3>
                  <div className="intro-paragraphs">
                    <p>
                      『仮面ライダーサーガ』の本編を、
                      <br />
                      映画4部作としてリメイク。
                    </p>
                    <p>
                      第一部「邂逅」。
                      <br />
                      第二部「覚醒」。
                      <br />
                      第三部「激情」。
                      <br />
                      そして、第四部「終末」。
                    </p>
                    <p>
                      四つの作品からなる、
                      <br />
                      新たなサーガをここから。
                    </p>
                  </div>
                  <a className="text-button" href="#films">
                    作品ラインナップ <span>↓</span>
                  </a>
                </div>
              </div>
            </section>
            <section className="films section" id="films">
              <SectionLabel number="02" title="THE FOUR FILMS">
                映画4部作
              </SectionLabel>
              <div className="section-heading" data-reveal>
                <h3>邂逅から、終末へ。</h3>
                <p>各作品のビジュアルと作品情報をご覧いただけます。</p>
              </div>
              <div className="film-grid">
                {SAGA_CINEMA_FILMS.map((film, index) => (
                  <button
                    key={film.slug}
                    className="film-card"
                    data-detail={index}
                    data-reveal
                    onClick={() => openDetail(index)}
                  >
                    <div className="film-card-top">
                      <span>CHAPTER {cinemaNumber(index)}</span>
                      <span>{film.part}</span>
                    </div>
                    <div className="film-poster">
                      <img
                        src={film.image}
                        width="853"
                        height="1280"
                        loading="lazy"
                        alt={cinemaPosterAlt(index)}
                      />
                      <span className="film-open" aria-hidden="true">
                        ↗
                      </span>
                    </div>
                    <div className="film-name">
                      <h4>{film.title}</h4>
                      <span>{film.roman}</span>
                    </div>
                    <div className="film-bottom">
                      <span>作品情報</span>
                      <span>＋</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
            <section className="visuals section" id="visuals">
              <SectionLabel number="03" title="VISUAL ARCHIVE">
                ビジュアル
              </SectionLabel>
              <div className="visual-layout" data-reveal>
                <div className="visual-copy">
                  <p className="eyebrow">THE WORLD OF SAGA</p>
                  <h3>
                    一枚から、
                    <br />
                    世界は広がる。
                  </h3>
                  <p>
                    4部作のメインビジュアルを、
                    <br />
                    大きな画面で。
                  </p>
                  <button className="frame-button" id="open-gallery" onClick={() => openGallery(0)}>
                    ギャラリーを開く <span>↗</span>
                  </button>
                  <div className="visual-index">
                    <span>KEY VISUALS</span>
                    <span>01 — 04</span>
                  </div>
                </div>
                <button
                  className="visual-feature"
                  id="visual-feature"
                  aria-label="第二部 覚醒のビジュアルを拡大"
                  onClick={() => openGallery(1)}
                >
                  <img
                    src={SAGA_CINEMA_FILMS[1].image}
                    width="853"
                    height="1280"
                    alt="第二部『覚醒』、水面と宙に浮かぶ遺跡のビジュアル"
                    loading="lazy"
                  />
                  <div className="visual-feature-caption">
                    <span>II / 覚醒</span>
                    <span>VIEW VISUAL ＋</span>
                  </div>
                </button>
              </div>
            </section>
            <section className="information section" id="information">
              <SectionLabel number="04" title="INFORMATION">
                公開情報
              </SectionLabel>
              <div className="information-content" data-reveal>
                <h3>
                  映画『仮面ライダーサーガ』
                  <br />
                  本編リメイク 全4部作
                </h3>
                <div className="information-rows">
                  <div>
                    <span>公開日</span>
                    <p>未発表</p>
                  </div>
                  <div>
                    <span>ラインナップ</span>
                    <p>邂逅 ／ 覚醒 ／ 激情 ／ 終末</p>
                  </div>
                </div>
              </div>
            </section>
          </main>
          <footer className="site-footer">
            <div className="footer-top">
              <a href="#top" className="footer-brand">
                KAMEN RIDER SAGA<span>THE CINEMATIC TETRALOGY</span>
              </a>
              <div className="footer-actions">
                <WorldReturn className="text-button" beforeNavigate={closeAll}>
                  ディセプションへ戻る <span>↗</span>
                </WorldReturn>
                <button
                  className="text-button"
                  id="share-site"
                  onClick={() => {
                    void shareSite();
                  }}
                >
                  SHARE <span>↗</span>
                </button>
                <a className="text-button" href="#top">
                  TOP <span>↑</span>
                </a>
              </div>
            </div>
            <div className="footer-bottom">
              <p>{SAGA_CINEMA_TITLE}</p>
              <span>邂逅・覚醒・激情・終末</span>
            </div>
          </footer>
        </div>
        <dialog
          ref={openingRef}
          id="opening"
          className={`opening${openingDeparting ? " departing" : ""}`}
          aria-label="映画 仮面ライダーサーガ オープニング"
          onClose={() => {
            setOpeningOpen(false);
            setOpeningDeparting(false);
          }}
          onCancel={(event) => {
            event.preventDefault();
            enterSaga();
          }}
        >
          <div className="opening-background" aria-hidden="true" />
          <div className="opening-panels" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="opening-frame" aria-hidden="true" />
          <div className="opening-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="opening-top">
            <span>SAGA / THE CINEMATIC TETRALOGY</span>
            <span>FILMS 01 — 04</span>
          </div>
          <button className="opening-skip" id="opening-skip" onClick={enterSaga}>
            SKIP <span>↗</span>
          </button>
          <div className="opening-center">
            <p className="opening-project">本編リメイク 映画4部作</p>
            <div className="logo-crop opening-logo">
              <img src={SAGA_CINEMA_LOGO} width="1536" height="1024" alt="仮面ライダーサーガ" />
            </div>
            <div className="opening-titles">
              <span>邂逅</span>
              <i />
              <span>覚醒</span>
              <i />
              <span>激情</span>
              <i />
              <span>終末</span>
            </div>
            <p className="opening-caption">FOUR CHAPTERS. ONE SAGA.</p>
            <button id="enter-world" className="frame-button" onClick={enterSaga}>
              ENTER THE SAGA <span>→</span>
            </button>
          </div>
          <div className="opening-bottom">
            <WorldReturn className="opening-world-return" beforeNavigate={closeAll}>
              ← ディセプションワールドへ戻る
            </WorldReturn>
            <span>KAMEN RIDER SAGA</span>
          </div>
        </dialog>
        <dialog
          ref={detailRef}
          id="film-dialog"
          className="film-dialog"
          aria-labelledby="dialog-title"
          onClose={() => setDetailOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              changeDetail(detailIndex + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              setDetailOpen(false);
          }}
        >
          <button
            className="close-button"
            data-close
            aria-label="作品情報を閉じる"
            onClick={() => setDetailOpen(false)}
          >
            ×
          </button>
          <div className="dialog-layout">
            <button
              ref={detailPosterRef}
              id="detail-poster-button"
              className="detail-poster-button"
              aria-label="ポスターを拡大"
              onClick={() => openGallery(detailIndex, true)}
            >
              <img
                id="dialog-image"
                src={detail.image}
                width="853"
                height="1280"
                alt={cinemaPosterAlt(detailIndex)}
              />
              <span>ポスターを拡大 ＋</span>
            </button>
            <div className="dialog-copy">
              <p className="eyebrow" id="dialog-chapter">
                CHAPTER {cinemaNumber(detailIndex)} / THE FOUR FILMS
              </p>
              <p id="dialog-part" className="dialog-part">
                {detail.part}
              </p>
              <h2 id="dialog-title">{detail.title}</h2>
              <p className="dialog-roman" id="dialog-roman">
                {detail.roman}
              </p>
              <p className="dialog-project">
                仮面ライダーサーガ
                <br />
                本編リメイク 映画4部作
              </p>
              <dl className="detail-data">
                <div>
                  <dt>作品</dt>
                  <dd id="dialog-fulltitle">仮面ライダーサーガ {detail.title}</dd>
                </div>
                <div>
                  <dt>公開日</dt>
                  <dd>未発表</dd>
                </div>
              </dl>
              <a
                id="detail-download"
                className="text-button"
                href={detail.image}
                download={cinemaDownload(detailIndex)}
              >
                ポスターを保存 <span>↓</span>
              </a>
              <div className="detail-navigation">
                <button
                  id="previous-film"
                  aria-label="前の作品"
                  onClick={() => changeDetail(detailIndex - 1)}
                >
                  ← PREV
                </button>
                <span
                  id="detail-counter"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={`${detail.part}『${detail.title}』`}
                >
                  {cinemaNumber(detailIndex)} / 04
                </span>
                <button
                  id="next-film"
                  aria-label="次の作品"
                  onClick={() => changeDetail(detailIndex + 1)}
                >
                  NEXT →
                </button>
              </div>
            </div>
          </div>
        </dialog>
        <dialog
          ref={galleryRef}
          id="gallery-dialog"
          className="gallery-dialog"
          aria-label="メインビジュアル ギャラリー"
          onClose={galleryClosed}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              setGalleryIndex((index) => cinemaWrap(index + (event.key === "ArrowRight" ? 1 : -1)));
            }
          }}
        >
          <div className="gallery-top">
            <p>
              VISUAL ARCHIVE <span id="gallery-counter">{cinemaNumber(galleryIndex)} / 04</span>
            </p>
            <button
              className="close-button"
              data-close
              aria-label="ギャラリーを閉じる"
              onClick={() => setGalleryOpen(false)}
            >
              ×
            </button>
          </div>
          <div
            className="gallery-stage"
            id="gallery-stage"
            onTouchStart={(event) => {
              touchRef.current =
                event.touches.length === 1
                  ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
                  : null;
            }}
            onTouchEnd={galleryTouchEnd}
            onTouchCancel={() => {
              touchRef.current = null;
            }}
          >
            <button
              id="gallery-prev"
              className="gallery-arrow previous"
              aria-label="前のビジュアル"
              onClick={() => setGalleryIndex((index) => cinemaWrap(index - 1))}
            >
              ←
            </button>
            <img
              id="gallery-image"
              src={gallery.image}
              width="853"
              height="1280"
              alt={cinemaPosterAlt(galleryIndex)}
            />
            <button
              id="gallery-next"
              className="gallery-arrow next"
              aria-label="次のビジュアル"
              onClick={() => setGalleryIndex((index) => cinemaWrap(index + 1))}
            >
              →
            </button>
          </div>
          <div className="gallery-bottom">
            <p id="gallery-caption" aria-live="polite" aria-atomic="true">
              {gallery.part}『{gallery.title}』
            </p>
            <div className="gallery-dots" aria-label="ビジュアルを選ぶ">
              {SAGA_CINEMA_FILMS.map((film, index) => (
                <button
                  key={film.slug}
                  data-gallery={index}
                  aria-label={film.title}
                  aria-pressed={galleryIndex === index}
                  onClick={() => setGalleryIndex(index)}
                >
                  {cinemaNumber(index)}
                </button>
              ))}
            </div>
            <a
              id="gallery-download"
              className="text-button"
              href={gallery.image}
              download={cinemaDownload(galleryIndex)}
            >
              保存 <span>↓</span>
            </a>
          </div>
        </dialog>
        <div className={`toast${toast ? " visible" : ""}`} id="toast" role="status">
          {toast}
        </div>
      </div>
      <SideMenuLayer context="cinema" open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
