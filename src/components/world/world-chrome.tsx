import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  DREAM_CHAPTER_ENTER_ASSETS,
  EXTREME_SAGA_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
  WORLD_ENTER_ASSETS,
} from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { ZeusButtonToggle } from "@/components/zeus-button";
import { RIDER_NAV } from "./dossier-nav";
import { LiquidPointerGlow } from "./liquid-rail";

type SiteAnnouncementMetric = {
  value: string;
  label: string;
  detail: string;
};

type SiteAnnouncement = {
  id: string;
  sequence: string;
  date: string;
  title: string;
  image: string;
  imageAlt: string;
  width: number;
  height: number;
  eyebrow?: string;
  lede?: string;
  comparisonTitle?: string;
  metrics?: readonly SiteAnnouncementMetric[];
  body?: string;
  note?: string;
};

const SITE_ANNOUNCEMENTS = [
  {
    id: "rexonance-saga-release",
    sequence: "PRODUCT BRIEFING 03",
    date: "2026.08.27",
    title: "比較にならない最強の姿、レクソナンスサーガを発表。",
    image: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
    imageAlt: "水色とピンクの星光をまとい、金色の神装を備えた仮面ライダーレクソナンスサーガ",
    width: 680,
    height: 906,
    eyebrow: "The next generation of SA-GA.",
    lede: "無限出力を、無限の攻撃へ。",
    comparisonTitle: "エクスプリームサーガ標準値比",
    metrics: [
      { value: "+61.6%", label: "PUNCH POWER", detail: "332.2t / 205.6t" },
      { value: "+55.6%", label: "KICK POWER", detail: "480.5t / 308.9t" },
      { value: "+480.6%", label: "JUMP HEIGHT", detail: "6000m / 1033.5m" },
      { value: "−89.5%", label: "100m TIME", detail: "0.00021s / 0.002s" },
    ],
    body:
      "ゼウスの超自己進化、レックスの絶対秩序、そして月城悠真の意思を一つの共鳴へ束ね、エクスプリームが切り開いた無制限出力を実効攻撃へ変換。標準状態からエクスプリーム・ウルトラを上回る、サーガシステムの次世代到達点です。ヴィンクルムサーガと比較して650%以上の反応速度と、エクスプリームサーガと比較して最大900%高い機動力を発揮。サーガシステムのウルトラハイエンドモデルに相応しい性能を備えています。",
    note:
      "公開済みの標準カタログ値から算出。100mは所要時間の短縮率であり、最大出力ではなく標準値の比較です。",
  },
  {
    id: "not-even-close",
    sequence: "TRANSMISSION 02",
    date: "2026.08.26",
    title: "Not Even Close.",
    image: "/announcement-not-even-close.jpeg",
    imageAlt: "金色と青紫色に発光する仮面とDeus. A NEW ERA BEGINS.の文字",
    width: 900,
    height: 1125,
  },
  {
    id: "who-supreme",
    sequence: "TRANSMISSION 01",
    date: "2026.08.23",
    title: "Who Supreme?",
    image: "/announcement-who-supreme.jpeg",
    imageAlt: "青白く発光する仮面とEX. Beyond imagination.の文字",
    width: 960,
    height: 1441,
  },
] as const satisfies readonly SiteAnnouncement[];

type AnnouncementId = (typeof SITE_ANNOUNCEMENTS)[number]["id"];

const SIDE_MENU_OPEN_INPUT_EVENT = "deception-world:side-menu-open-input";

export function SideMenuTrigger({
  open,
  onOpenChange,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
} = {}) {
  return (
    <button
      className={`side-panel-trigger ios26-glass${className ? ` ${className}` : ""}`}
      data-liquid-pointer="true"
      type="button"
      aria-expanded={open ?? false}
      aria-controls="site-side-panel"
      aria-haspopup="dialog"
      aria-label="メニューを開く"
      onClick={
        onOpenChange
          ? (event) => {
              const openedByKeyboard = event.detail === 0;
              window.dispatchEvent(
                new CustomEvent(SIDE_MENU_OPEN_INPUT_EVENT, {
                  detail: { keyboard: openedByKeyboard },
                }),
              );
              if (!openedByKeyboard) event.currentTarget.blur();
              onOpenChange(true);
            }
          : undefined
      }
    >
      <LiquidPointerGlow />
      <span className="side-panel-trigger-ring" aria-hidden="true" />
      <span className="side-panel-trigger-glyph" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}

export function SideMenuLayer({
  context = "world",
  open,
  onOpenChange,
}: {
  context?: "world" | "archive" | "movie" | "rexonance" | "extreme";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const panelRef = useRef<HTMLElement>(null);
  const announcementRef = useRef<HTMLDialogElement>(null);
  const announcementTriggerRef = useRef<HTMLButtonElement>(null);
  const announcementStageRef = useRef<HTMLDivElement>(null);
  const announcementHeadingRef = useRef<HTMLHeadingElement>(null);
  const announcementOpenedByKeyboardRef = useRef(false);
  const sideMenuRestoreFocusRef = useRef(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<AnnouncementId | null>(null);
  const controlled = typeof open === "boolean" && Boolean(onOpenChange);
  const isOpen = controlled ? open : false;
  const close = () => onOpenChange?.(false);
  const selectedAnnouncement: SiteAnnouncement | null =
    SITE_ANNOUNCEMENTS.find((notice) => notice.id === selectedAnnouncementId) ?? null;

  useEffect(() => {
    const rememberInput = (event: Event) => {
      const detail = (event as CustomEvent<{ keyboard?: boolean }>).detail;
      sideMenuRestoreFocusRef.current = detail?.keyboard === true;
    };
    window.addEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
    return () => window.removeEventListener(SIDE_MENU_OPEN_INPUT_EVENT, rememberInput);
  }, []);

  useEffect(() => {
    if (!controlled || !isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const root = document.documentElement;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    panel.scrollTop = 0;
    root.dataset.sideMenuOpen = "true";
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    const containBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      event.preventDefault();
    };
    document.addEventListener("touchmove", containBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener("wheel", containBackgroundScroll, {
      capture: true,
      passive: false,
    });
    const frame = window.requestAnimationFrame(() => {
      const focusTarget = sideMenuRestoreFocusRef.current
        ? panel.querySelector<HTMLElement>(".side-panel-close")
        : panel;
      focusTarget?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("touchmove", containBackgroundScroll, true);
      document.removeEventListener("wheel", containBackgroundScroll, true);
      document.body.style.overflow = previousOverflow;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      delete root.dataset.sideMenuOpen;
      if (sideMenuRestoreFocusRef.current) {
        previousFocus?.focus({ preventScroll: true });
      } else if (
        document.activeElement instanceof HTMLElement &&
        panel.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      sideMenuRestoreFocusRef.current = false;
    };
  }, [controlled, isOpen]);

  useEffect(() => {
    const dialog = announcementRef.current;
    if (!dialog || !announcementOpen) return;
    const sidePanel = panelRef.current;
    const announcementTrigger = announcementTriggerRef.current;

    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        setAnnouncementOpen(false);
        return;
      }
    }
    const previousOverflow = document.body.style.overflow;
    const ownsBodyScrollLock = previousOverflow !== "hidden";
    if (ownsBodyScrollLock) document.body.style.overflow = "hidden";
    dialog.scrollTop = 0;
    // Focusing the dialog itself prevents WebKit from auto-focusing (and
    // visually latching) the first close control when showModal() runs.
    dialog.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      if (ownsBodyScrollLock) document.body.style.overflow = previousOverflow;
      if (announcementOpenedByKeyboardRef.current) {
        const returnTarget =
          sidePanel?.dataset.open === "true" && announcementTrigger?.isConnected
            ? announcementTrigger
            : document.querySelector<HTMLButtonElement>(".side-panel-trigger");
        returnTarget?.focus({ preventScroll: true });
      } else if (
        document.activeElement instanceof HTMLElement &&
        dialog.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      announcementOpenedByKeyboardRef.current = false;
    };
  }, [announcementOpen]);

  useEffect(() => {
    if (!announcementOpen || !selectedAnnouncement) return;
    const frame = window.requestAnimationFrame(() => {
      if (announcementStageRef.current) announcementStageRef.current.scrollTop = 0;
      announcementHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [announcementOpen, selectedAnnouncement]);

  const openAnnouncements = (event: MouseEvent<HTMLButtonElement>) => {
    const openedByKeyboard = event.detail === 0;
    announcementOpenedByKeyboardRef.current = openedByKeyboard;
    if (!openedByKeyboard) event.currentTarget.blur();
    setSelectedAnnouncementId(null);
    setAnnouncementOpen(true);
  };

  const closeAnnouncement = (restoreFocus = announcementOpenedByKeyboardRef.current) => {
    announcementOpenedByKeyboardRef.current = restoreFocus;
    setAnnouncementOpen(false);
    setSelectedAnnouncementId(null);
  };

  const onAnnouncementBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeAnnouncement(false);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!controlled || !isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      sideMenuRestoreFocusRef.current = true;
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((item) => item.tabIndex >= 0 && item.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !panel.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div
        className="side-panel-scrim"
        data-open={String(isOpen)}
        aria-hidden="true"
        onPointerDown={() => {
          sideMenuRestoreFocusRef.current = false;
        }}
        onClick={controlled ? close : undefined}
      />
      <aside
        ref={panelRef}
        id="site-side-panel"
        className="side-panel"
        data-liquid-pointer="true"
        data-react-controlled={controlled ? "true" : undefined}
        data-open={String(isOpen)}
        role="dialog"
        aria-modal={true}
        aria-hidden={!isOpen}
        aria-label="サイトメニュー"
        tabIndex={-1}
        inert={controlled ? !isOpen : undefined}
        onPointerDown={() => {
          sideMenuRestoreFocusRef.current = false;
        }}
        onKeyDown={controlled ? onPanelKeyDown : undefined}
      >
        <LiquidPointerGlow />
        <span className="side-panel-depth" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="side-panel-head">
          <div>
            <p>NAVIGATION</p>
            <b>
              {context === "archive"
                ? "FORM ARCHIVE"
                : context === "movie"
                  ? "DREAM CHAPTER"
                  : context === "rexonance"
                    ? "REXONANCE SAGA"
                    : context === "extreme"
                      ? "EXTREME SAGA"
                      : "DECEPTION WORLD"}
            </b>
          </div>
          <button
            className="side-panel-close ios26-glass"
            type="button"
            data-liquid-pointer="true"
            aria-label="メニューを閉じる"
            onClick={
              controlled
                ? (event) => {
                    if (event.detail !== 0) event.currentTarget.blur();
                    close();
                  }
                : undefined
            }
          >
            <LiquidPointerGlow />
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="side-panel-group">
          <p>SECTIONS</p>
          <div className="side-panel-links">
            {context === "rexonance" || context === "extreme" ? (
              <>
                {(context === "rexonance"
                  ? [
                      ["top", "トップ", "TOP"],
                      ["performance", "パフォーマンス", "PERFORMANCE"],
                      ["stages", "三つの運用段階", "STAGES"],
                      ["system", "トリニティ・レゾナンス", "SYSTEM"],
                    ]
                  : [
                      ["top", "トップ", "TOP"],
                      ["performance", "性能比較", "COMPARISON"],
                      ["p14", "P14", "PROCESSOR"],
                      ["stages", "二つの運用段階", "STAGES"],
                      ["system", "中核システム", "SYSTEM"],
                    ]
                ).map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to={context === "rexonance" ? "/rexonance-saga" : "/extreme-saga"}
                    hash={hash}
                    assets={[]}
                    beforeNavigate={close}
                  >
                    <span>{label}</span>
                    <i>{code}</i>
                  </GuardedLink>
                ))}
              </>
            ) : context === "archive" ? (
              <>
                {[
                  ["top", "トップ", "TOP"],
                  ["story", "ストーリー", "STORY"],
                  ["riders", "八人のライダー", "RIDERS"],
                  ["records", "レコード", "RECORDS"],
                  ["manager-archive", "六詠", "RIKUEI"],
                ].map(([hash, label, code]) => (
                  <GuardedLink
                    key={hash}
                    to="/world"
                    hash={hash}
                    assets={WORLD_ENTER_ASSETS}
                    beforeNavigate={close}
                  >
                    <span>{label}</span>
                    <i>{code}</i>
                  </GuardedLink>
                ))}
              </>
            ) : context === "movie" ? (
              <>
                <GuardedLink to="/dream-chapter" hash="top" assets={[]} beforeNavigate={close}>
                  <span>トップ</span>
                  <i>TOP</i>
                </GuardedLink>
                <GuardedLink to="/dream-chapter" hash="posters" assets={[]} beforeNavigate={close}>
                  <span>ポスター</span>
                  <i>POSTERS</i>
                </GuardedLink>
                <GuardedLink to="/dream-chapter" hash="characters" assets={[]} beforeNavigate={close}>
                  <span>キャラクター</span>
                  <i>CAST</i>
                </GuardedLink>
                <GuardedLink to="/dream-chapter" hash="dolminence" assets={[]} beforeNavigate={close}>
                  <span>ドルミネンス</span>
                  <i>DOLMINENCE</i>
                </GuardedLink>
                <GuardedLink to="/dream-chapter" hash="cases" assets={[]} beforeNavigate={close}>
                  <span>エピソード</span>
                  <i>CASES</i>
                </GuardedLink>
              </>
            ) : (
              <>
                <GuardedLink to="/world" hash="top" assets={[]} beforeNavigate={close}>
                  <span>トップ</span>
                  <i>TOP</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="story" assets={[]} beforeNavigate={close}>
                  <span>ストーリー</span>
                  <i>STORY</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="riders" assets={[]} beforeNavigate={close}>
                  <span>八人のライダー</span>
                  <i>RIDERS</i>
                </GuardedLink>
                <GuardedLink to="/world" hash="records" assets={[]} beforeNavigate={close}>
                  <span>レコード</span>
                  <i>RECORDS</i>
                </GuardedLink>
                <GuardedLink
                  to="/world"
                  hash="manager-archive"
                  assets={[]}
                  beforeNavigate={close}
                >
                  <span>六詠</span>
                  <i>ARCHIVE</i>
                </GuardedLink>
              </>
            )}
          </div>
        </div>
        <div className="side-panel-group">
          <p>SPECIAL</p>
          <div className="side-panel-links">
            <GuardedLink
              to="/extreme-saga"
              hash="top"
              assets={context === "extreme" ? [] : EXTREME_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "extreme" ? "page" : undefined}
            >
              <span>エクスプリームサーガ</span>
              <i>SUPREME SITE</i>
            </GuardedLink>
            <GuardedLink
              to="/rexonance-saga"
              hash="top"
              assets={context === "rexonance" ? [] : REXONANCE_SAGA_ENTER_ASSETS}
              beforeNavigate={close}
              aria-current={context === "rexonance" ? "page" : undefined}
            >
              <span>レクソナンスサーガ</span>
              <i>PERFORMANCE SITE</i>
            </GuardedLink>
          </div>
        </div>
        <div className="side-panel-group">
          <p>STORIES</p>
          <div className="side-panel-links">
            {context === "movie" ? (
              <>
                <GuardedLink
                  to="/dream-chapter"
                  hash="top"
                  assets={[]}
                  beforeNavigate={close}
                  aria-current="page"
                >
                  <span>映画第一作「ドリームチャプター」</span>
                  <i>MOVIE 01</i>
                </GuardedLink>
                <GuardedLink
                  to="/world"
                  hash="top"
                  assets={WORLD_ENTER_ASSETS}
                  transition="dream"
                  beforeNavigate={close}
                >
                  <span>ディセプションワールド</span>
                  <i>MAIN SITE</i>
                </GuardedLink>
              </>
            ) : (
              <GuardedLink
                to="/dream-chapter"
                assets={DREAM_CHAPTER_ENTER_ASSETS}
                beforeNavigate={close}
              >
                <span>映画第一作「ドリームチャプター」</span>
                <i>MOVIE 01</i>
              </GuardedLink>
            )}
          </div>
        </div>
        {context === "world" ? (
          <div className="side-panel-group">
            <p>RIDERS</p>
            <div className="side-panel-links">
              {RIDER_NAV.map((r, i) =>
                r.href ? (
                  <GuardedLink
                    key={r.id}
                    to={r.href}
                    assets={r.assets}
                    beforeNavigate={close}
                  >
                    <span>{r.name}</span>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                  </GuardedLink>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
        <div className="side-panel-group">
          <p>INFORMATION</p>
          <div className="side-panel-links">
            <button
              ref={announcementTriggerRef}
              className="side-panel-link-button side-panel-announcement-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-controls="site-announcement-dialog"
              onClick={openAnnouncements}
            >
              <span>お知らせ</span>
              <i>NOTICE</i>
            </button>
          </div>
        </div>
        <div className="side-panel-group">
          <p>SYSTEM</p>
          <div className="side-panel-links">
            {context === "archive" ? (
              <GuardedLink
                to="/form-archive"
                hash="archive-switcher"
                assets={[]}
                beforeNavigate={close}
                aria-current="page"
              >
                <span>フォームアーカイブ</span>
                <i>SAGA / REALM</i>
              </GuardedLink>
            ) : (
              <GuardedLink to="/form-archive" assets={[]} beforeNavigate={close}>
                <span>フォームアーカイブ</span>
                <i>SAGA / REALM</i>
              </GuardedLink>
            )}
            <ZeusButtonToggle />
            <Link to="/" onClick={controlled ? close : undefined}>
              <span>オープニング</span>
              <i>OPENING</i>
            </Link>
          </div>
        </div>
      </aside>
      <dialog
        ref={announcementRef}
        id="site-announcement-dialog"
        className="site-announcement-dialog"
        aria-labelledby="site-announcement-hub-title"
        tabIndex={-1}
        onClick={onAnnouncementBackdrop}
        onCancel={(event) => {
          event.preventDefault();
          closeAnnouncement(true);
        }}
        onClose={() => setAnnouncementOpen(false)}
      >
        <section
          className="site-announcement-hub"
          data-view={selectedAnnouncement ? "detail" : "index"}
        >
          <span className="site-announcement-aura" aria-hidden="true" />
          <header className="site-announcement-header">
            <div>
              <p>INFORMATION / ARCHIVE</p>
              <h2 id="site-announcement-hub-title">お知らせ</h2>
            </div>
            <span
              className="site-announcement-count"
              aria-label={`お知らせ${SITE_ANNOUNCEMENTS.length}件`}
            >
              {String(SITE_ANNOUNCEMENTS.length).padStart(2, "0")} ACTIVE
            </span>
            <button
              className="site-announcement-close ios26-glass"
              type="button"
              aria-label="お知らせを閉じる"
              onClick={(event) => {
                event.stopPropagation();
                const restoreFocus = event.detail === 0;
                if (!restoreFocus) event.currentTarget.blur();
                closeAnnouncement(restoreFocus);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
          <div ref={announcementStageRef} className="site-announcement-stage">
            {selectedAnnouncement ? (
              <article
                className={`site-announcement-detail${
                  selectedAnnouncement.metrics?.length ? " is-product-release" : ""
                }`}
              >
                <button
                  className="site-announcement-back"
                  type="button"
                  onClick={() => setSelectedAnnouncementId(null)}
                >
                  <span aria-hidden="true">←</span>
                  一覧へ戻る
                </button>
                <figure className="site-announcement-visual">
                  {announcementOpen ? (
                    <img
                      src={selectedAnnouncement.image}
                      alt={selectedAnnouncement.imageAlt}
                      width={selectedAnnouncement.width}
                      height={selectedAnnouncement.height}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : null}
                </figure>
                <div className="site-announcement-copy">
                  <p className="site-announcement-meta">
                    NOTICE / {selectedAnnouncement.sequence}
                    <time dateTime={selectedAnnouncement.date.replaceAll(".", "-")}>
                      {selectedAnnouncement.date}
                    </time>
                  </p>
                  {selectedAnnouncement.eyebrow ? (
                    <span className="site-announcement-eyebrow">{selectedAnnouncement.eyebrow}</span>
                  ) : null}
                  <h3 ref={announcementHeadingRef} tabIndex={-1}>
                    {selectedAnnouncement.title}
                  </h3>
                  {selectedAnnouncement.lede ? (
                    <p className="site-announcement-lede">{selectedAnnouncement.lede}</p>
                  ) : null}
                  {selectedAnnouncement.metrics?.length ? (
                    <section
                      className="site-announcement-release"
                      aria-labelledby={`${selectedAnnouncement.id}-comparison-title`}
                    >
                      <p
                        className="site-announcement-release-title"
                        id={`${selectedAnnouncement.id}-comparison-title`}
                      >
                        {selectedAnnouncement.comparisonTitle}
                      </p>
                      <div className="site-announcement-metrics">
                        {selectedAnnouncement.metrics.map((metric) => (
                          <div className="site-announcement-metric" key={metric.label}>
                            <b>{metric.value}</b>
                            <span>{metric.label}</span>
                            <small>{metric.detail}</small>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {selectedAnnouncement.body ? (
                    <p className="site-announcement-body">{selectedAnnouncement.body}</p>
                  ) : null}
                  {selectedAnnouncement.note ? (
                    <small className="site-announcement-note">{selectedAnnouncement.note}</small>
                  ) : null}
                </div>
              </article>
            ) : (
              <div className="site-announcement-index">
                <div className="site-announcement-index-copy">
                  <p>新着情報と記録された通信を選択してください。</p>
                  <span>SELECT TRANSMISSION</span>
                </div>
                <ul className="site-announcement-list">
                  {SITE_ANNOUNCEMENTS.map((notice) => (
                    <li key={notice.id}>
                      <button
                        className="site-announcement-list-item"
                        type="button"
                        onClick={() => setSelectedAnnouncementId(notice.id)}
                        aria-label={`${notice.title}を開く`}
                      >
                        <span className="site-announcement-list-visual" aria-hidden="true">
                          {announcementOpen ? (
                            <img
                              src={notice.image}
                              alt=""
                              width={notice.width}
                              height={notice.height}
                              loading="lazy"
                              decoding="async"
                              fetchPriority="low"
                            />
                          ) : null}
                        </span>
                        <span className="site-announcement-list-copy">
                          <span>
                            <small>{notice.sequence}</small>
                            <time dateTime={notice.date.replaceAll(".", "-")}>{notice.date}</time>
                          </span>
                          <b>{notice.title}</b>
                          <i>OPEN RECORD</i>
                        </span>
                        <span className="site-announcement-list-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </dialog>
    </>
  );
}
