import { useEffect, useRef, useState, type ReactNode } from "react";
import { GuardedLink } from "@/components/load-gate";
import { LiquidLens, LiquidPointerGlow } from "@/components/world/liquid-rail";
import { resetPickupScroll, settlePickupScroll } from "@/components/world/pickup-scroll-reset";
import { SlideOpenControl } from "@/components/world/slide-open-control";
import { UiVectorIcon } from "@/components/world/ui-vector-icon";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { dossierImage } from "@/lib/dossier-images";
import { rexonanceImage } from "@/lib/rexonance-images";
import {
  CAST,
  FAR_FROM_SAGA,
  FFS_STAGE_ORDER,
  REALM_ROYAL,
  RR_FORM_ORDER,
  STORY,
  type Article,
  type CastEntry,
  type FfsStageKey,
  type RrFormKey,
  type SpecRow,
} from "./final-stage-data";

const LOGO = "/final-stage-logo.webp";

/* The liquid rail owns tap, long-press, drag and keyboard selection; React
   only mirrors the chosen index back into state. One rail per ref. */
function bindRail<K extends string>(
  rail: HTMLDivElement,
  keys: readonly K[],
  select: (key: K) => void,
) {
  const onSelect = (event: Event) => {
    const index = (event as CustomEvent<{ index?: number }>).detail?.index;
    const next = typeof index === "number" ? keys[index] : undefined;
    if (next) select(next);
  };
  rail.addEventListener("railselect", onSelect);
  const dispose = initRail(rail);
  return () => {
    rail.removeEventListener("railselect", onSelect);
    dispose?.();
  };
}

function CallOuts({ calls, label }: { calls: readonly string[]; label: string }) {
  return (
    <div className="fst-calls" aria-label={label}>
      {calls.map((call, index) => (
        <b key={`${call}-${index}`}>{call}</b>
      ))}
    </div>
  );
}

function SpecList({ rows, label }: { rows: readonly SpecRow[]; label: string }) {
  return (
    <dl className="fst-specs" aria-label={label}>
      {rows.map((row) => (
        <div key={row.dt}>
          <dt>{row.dt}</dt>
          <dd>{row.dd}</dd>
        </div>
      ))}
    </dl>
  );
}

function Prose({ paragraphs, className }: { paragraphs: readonly string[]; className?: string }) {
  return (
    <div className={className ? `fst-copy ${className}` : "fst-copy"}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function ArticleGrid({
  items,
  columns,
  label,
}: {
  items: readonly Article[];
  columns: 2 | 3;
  label: string;
}) {
  return (
    <div className={`fst-articles fst-articles-${columns}`} role="list" aria-label={label}>
      {items.map((item, index) => (
        <article key={item.title} className="rxs-reveal" role="listitem">
          <header>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.code ? <small>{item.code}</small> : null}
          </header>
          <h3>{item.title}</h3>
          {item.body.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
        </article>
      ))}
    </div>
  );
}

function SubHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="fst-subheading rxs-reveal">
      <p>{kicker}</p>
      <h3>{title}</h3>
    </header>
  );
}

/* A rider record behind the same hold-and-slide pickup as the dossier pages.
   The record stays mounted inside the dialog so its rails bind once. */
function RiderPickup({
  id,
  accent,
  image,
  imageWidth,
  imageHeight,
  imagePos,
  eyebrow,
  name,
  sub,
  quote,
  children,
}: {
  id: string;
  accent: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  imagePos: string;
  eyebrow: string;
  name: string;
  sub: string;
  quote: string;
  children: ReactNode;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pointerOpened = useRef(false);
  const cancelScrollReset = useRef<(() => void) | null>(null);
  const dialogId = `${id}-pickup`;
  const resetScroll = () => {
    const dialog = dlg.current;
    if (!dialog) return;
    resetPickupScroll(dialog, [".fst-pickup-panel"]);
  };
  const clearPointerFocus = () => {
    if (!pointerOpened.current) return;
    const button = opener.current;
    if (!button) return;
    button.dataset.keyboardFocus = "false";
    button.blur();
  };
  const open = (source: "keyboard" | "pointer") => {
    const dialog = dlg.current;
    if (!dialog) return;
    pointerOpened.current = source === "pointer";
    clearPointerFocus();
    cancelScrollReset.current?.();
    try {
      dialog.showModal();
    } catch {
      /* already open */
    }
    cancelScrollReset.current = settlePickupScroll(dialog, [".fst-pickup-panel"], () => {
      dialog.focus({ preventScroll: true });
      clearPointerFocus();
    });
  };
  const close = () => {
    cancelScrollReset.current?.();
    cancelScrollReset.current = null;
    dlg.current?.close();
    clearPointerFocus();
    window.requestAnimationFrame(clearPointerFocus);
    resetScroll();
  };
  useEffect(() => () => cancelScrollReset.current?.(), []);
  return (
    <section
      id={id}
      className="fst-pickup"
      aria-label={`仮面ライダー${name}の記録`}
      style={{ ["--fst-accent" as string]: accent, ["--manager-accent" as string]: accent }}
    >
      <article className="fst-pickup-card">
        <div className="fst-pickup-visual">
          <img
            src={image}
            {...rexonanceImage(image)}
            alt={`仮面ライダー${name}のフォームビジュアル`}
            style={{ objectPosition: imagePos }}
            width={imageWidth}
            height={imageHeight}
            loading="lazy"
            decoding="async"
          />
          <span>RIDER</span>
          <SlideOpenControl
            buttonRef={opener}
            className="form-pickup-plus fst-pickup-plus"
            ariaControls={dialogId}
            ariaLabel={`仮面ライダー${name}をピックアップ`}
            label="記録を開く"
            onOpen={open}
          />
        </div>
        <div className="fst-pickup-copy">
          <p>{eyebrow}</p>
          <small>PICKUP</small>
          <h3>
            <span>仮面ライダー</span>
            <b>{name}</b>
          </h3>
          <em>{sub}</em>
          <q>{quote}</q>
        </div>
      </article>
      <dialog
        ref={dlg}
        id={dialogId}
        className="form-pickup-dialog fst-pickup-dialog"
        tabIndex={-1}
        aria-label={`仮面ライダー${name}`}
        onClose={resetScroll}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dlg.current) close();
        }}
      >
        <button
          type="button"
          className="form-pickup-close"
          data-liquid-pointer="true"
          onClick={close}
          aria-label="閉じる"
        >
          <LiquidPointerGlow />
          <span>CLOSE</span>
          <i aria-hidden="true">
            <UiVectorIcon kind="close" size={16} />
          </i>
        </button>
        <div className="form-pickup-panel fst-pickup-panel">
          <div className="fst-pickup-heading">
            <p>
              <span>RIDER PICKUP</span>
            </p>
            <small>{eyebrow}</small>
            <h2>
              <span>仮面ライダー</span>
              <b>{name}</b>
            </h2>
            <em>{sub}</em>
          </div>
          <div className="fst-pickup-record">{children}</div>
        </div>
      </dialog>
    </section>
  );
}

function CastVisual({ person }: { person: CastEntry }) {
  if (person.image) {
    return (
      <img
        src={person.image}
        {...dossierImage(person.image)}
        alt={`${person.name}のビジュアル`}
        style={{ objectPosition: person.pos }}
        width={person.width}
        height={person.height}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className="fst-cast-monogram" aria-hidden="true">
      <i />
      <b>{person.monogram}</b>
      <small>VISUAL PENDING</small>
    </div>
  );
}

export function FinalStage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<FfsStageKey>("middle");
  const [form, setForm] = useState<RrFormKey>("royal");
  const [castIndex, setCastIndex] = useState(0);
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const formTabsRef = useRef<HTMLDivElement | null>(null);
  const castTabsRef = useRef<HTMLDivElement | null>(null);
  const activeCast = CAST[castIndex];
  const activeStage = FAR_FROM_SAGA.stages[stage];
  const activeForm = REALM_ROYAL.forms[form];

  const releaseControlFocus = (control: HTMLElement) => {
    window.requestAnimationFrame(() => {
      if (document.activeElement === control) control.blur();
    });
  };

  useEffect(() => {
    const rail = stageTabsRef.current;
    if (!rail) return;
    return bindRail(rail, FFS_STAGE_ORDER, setStage);
  }, []);

  useEffect(() => {
    const rail = castTabsRef.current;
    if (!rail) return;
    return bindRail(
      rail,
      CAST.map((_, index) => String(index)),
      (key) => setCastIndex(Number(key)),
    );
  }, []);

  useEffect(() => {
    const rail = formTabsRef.current;
    if (!rail) return;
    return bindRail(rail, RR_FORM_ORDER, setForm);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const constrained =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    const allowMotion = !media.matches && !constrained;
    setMotionReady(allowMotion);

    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!allowMotion || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.1 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!motionReady || window.matchMedia("(pointer: coarse)").matches) return;
    const page = pageRef.current;
    if (!page) return;
    let frame = 0;
    let lastProgress = -1;
    const update = () => {
      frame = 0;
      const viewportHeight = window.visualViewport?.height || window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, window.scrollY / viewportHeight));
      if (Math.abs(progress - lastProgress) < 0.002) return;
      lastProgress = progress;
      page.style.setProperty("--rxs-hero-progress", progress.toFixed(3));
    };
    const onScroll = () => {
      if (!frame && document.visibilityState === "visible") {
        frame = window.requestAnimationFrame(update);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onScroll();
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [motionReady]);

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page fst-page"
      data-motion-ready={motionReady ? "true" : "false"}
    >
      <header className="rxs-local-nav">
        <div className="rxs-local-nav-inner">
          <GuardedLink
            className="rxs-brand"
            to="/world"
            hash="top"
            assets={WORLD_ENTER_ASSETS}
            aria-label="ディセプションワールドへ戻る"
          >
            <span>FINAL STAGE</span>
            <b>ファイナルステージ</b>
          </GuardedLink>
          <nav aria-label="ファイナルステージ ページ内ナビゲーション">
            <a href="#story">あらすじ</a>
            <a href="#characters">人物</a>
            <a href="#riders">ライダー</a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="final-stage" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="rxs-hero fst-hero" aria-labelledby="fst-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-visual fst-hero-logo" aria-hidden="true">
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <img
            src={LOGO}
            {...rexonanceImage(LOGO)}
            alt=""
            width="1536"
            height="1024"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <div className="rxs-hero-copy">
          <p>KAMEN RIDER SAGA / FINAL STAGE</p>
          <h1 id="fst-title">
            <span>FINAL STAGE</span>
            ファイナル
            <br />
            ステージ
          </h1>
          <p className="rxs-hero-lede">{STORY.lead}</p>
        </div>
        <a className="rxs-scroll-cue" href="#story">
          <span>あらすじを読む</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section id="story" className="rxs-section fst-story">
        <header className="rxs-section-heading rxs-reveal">
          <p>01 / STORY</p>
          <h2>
            帰るべき場所へ、
            <br />
            明日へと続く帰り道を。
          </h2>
          <span>{STORY.title}</span>
        </header>
        <div className="fst-story-layout rxs-reveal">
          <div className="fst-story-index" aria-hidden="true">
            <span>FINAL</span>
            <span>STAGE</span>
            <i />
          </div>
          <Prose paragraphs={STORY.paragraphs} className="fst-story-copy" />
        </div>
      </section>

      <section id="characters" className="rxs-section fst-cast-section">
        <header className="rxs-section-heading rxs-reveal">
          <p>02 / CHARACTERS</p>
          <h2>
            帰還した仲間と、
            <br />
            道を照らす者たち。
          </h2>
          <span>八人の登場人物。各記録はディセプションワールドの人物資料へ接続します。</span>
        </header>
        <div className="fst-cast-console rxs-reveal">
          <div
            ref={castTabsRef}
            className="rxs-stage-tabs liquid-swipe-tabs fst-cast-tabs"
            role="tablist"
            aria-label="登場人物"
            aria-describedby="fst-cast-hint"
            data-liquid-glass="true"
            data-stage={activeCast.id}
          >
            <LiquidLens />
            {CAST.map((person, index) => (
              <button
                key={person.id}
                id={`fst-cast-tab-${person.id}`}
                type="button"
                role="tab"
                aria-selected={castIndex === index}
                aria-controls="fst-cast-panel"
                tabIndex={castIndex === index ? 0 : -1}
                className={castIndex === index ? "is-active" : ""}
                style={{ ["--liquid-accent" as string]: person.accent }}
                onClick={() => setCastIndex(index)}
                onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
              >
                <span>{person.no}</span>
                <small>{person.name}</small>
              </button>
            ))}
          </div>
          <p id="fst-cast-hint" className="rxs-stage-hint">
            タップ、長押し、またはスライドで切り替え
          </p>
          <div
            id="fst-cast-panel"
            className="fst-cast-detail"
            role="tabpanel"
            aria-labelledby={`fst-cast-tab-${activeCast.id}`}
            aria-live="polite"
            style={{ ["--fst-accent" as string]: activeCast.accent }}
          >
            <figure key={`${activeCast.id}-visual`}>
              <CastVisual person={activeCast} />
              <figcaption>
                <span>CHARACTER {activeCast.no}</span>
              </figcaption>
            </figure>
            <div key={`${activeCast.id}-copy`} className="fst-cast-copy">
              <small>{activeCast.kicker}</small>
              <h3>{activeCast.name}</h3>
              <em>{activeCast.en}</em>
              <strong>{activeCast.role}</strong>
              {activeCast.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {activeCast.to ? (
                <GuardedLink
                  to={activeCast.to}
                  assets={activeCast.assets ?? []}
                  aria-label={`${activeCast.name}の人物資料を開く`}
                >
                  <span>人物資料</span>
                  <i aria-hidden="true">↗</i>
                </GuardedLink>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section id="riders" className="rxs-section fst-riders-section" aria-label="ライダー記録">
        <header className="rxs-section-heading rxs-reveal">
          <p>03 / RIDERS</p>
          <h2>二つの究極形態。</h2>
          <span>ピックアップを開いて、各形態の記録を閲覧できます。</span>
        </header>

        <RiderPickup
          id="far-from-saga"
          accent="#7fe6ff"
          image={FAR_FROM_SAGA.stages.middle.image}
          imageWidth={FAR_FROM_SAGA.stages.middle.width}
          imageHeight={FAR_FROM_SAGA.stages.middle.height}
          imagePos="50% 8%"
          eyebrow={`RIDER RECORD 01 / ${FAR_FROM_SAGA.en}`}
          name={FAR_FROM_SAGA.name}
          sub={FAR_FROM_SAGA.stagesLine}
          quote="レクソナンスの超共鳴と、ヴィンクルムの接続を一つの戦闘体系へ。ファイナルステージ限定の超究極フォーム。"
        >
          <CallOuts calls={FAR_FROM_SAGA.calls} label="ファーフロムサーガ 変身音声" />

          <div className="fst-spec-block">
            <SpecList rows={FAR_FROM_SAGA.specs} label="ファーフロムサーガ スペック" />
            <p className="fst-note">{FAR_FROM_SAGA.specNote}</p>
          </div>

          <SubHeading kicker="OVERVIEW" title="概要" />
          <Prose paragraphs={FAR_FROM_SAGA.overview} className="fst-plain" />

          <SubHeading kicker="FIVE STAGES" title="形態段階" />
          <div className="rxs-stage-switcher">
            <div
              ref={stageTabsRef}
              className="rxs-stage-tabs liquid-swipe-tabs fst-ffs-stage-tabs"
              role="tablist"
              aria-label="ファーフロムサーガの形態段階"
              aria-describedby="fst-ffs-stage-hint"
              data-liquid-glass="true"
              data-stage={stage}
            >
              <LiquidLens />
              {FFS_STAGE_ORDER.map((key) => (
                <button
                  key={key}
                  id={`fst-ffs-stage-tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={stage === key}
                  aria-controls="fst-ffs-stage-panel"
                  tabIndex={stage === key ? 0 : -1}
                  className={stage === key ? "is-active" : ""}
                  style={{ ["--liquid-accent" as string]: FAR_FROM_SAGA.stages[key].accent }}
                  onClick={() => setStage(key)}
                  onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
                >
                  <span>{FAR_FROM_SAGA.stages[key].code}</span>
                  <small>{FAR_FROM_SAGA.stages[key].label}</small>
                </button>
              ))}
            </div>
            <p id="fst-ffs-stage-hint" className="rxs-stage-hint">
              タップ、長押し、または左右へのスライドで切り替え
            </p>

            <div
              id="fst-ffs-stage-panel"
              className="rxs-stage-panel fst-stage-panel"
              role="tabpanel"
              aria-labelledby={`fst-ffs-stage-tab-${stage}`}
              aria-live="polite"
              style={{ ["--fst-accent" as string]: activeStage.accent }}
            >
              <figure key={stage}>
                <span aria-hidden="true" />
                <img
                  src={activeStage.image}
                  {...rexonanceImage(activeStage.image)}
                  alt={activeStage.alt}
                  width={activeStage.width}
                  height={activeStage.height}
                  loading={stage === "middle" ? "eager" : "lazy"}
                  decoding="async"
                />
              </figure>
              <div key={`${stage}-copy`}>
                <small>{activeStage.code}</small>
                <h3>{activeStage.label}</h3>
                {activeStage.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>

          <SubHeading kicker="CORE MECHANISM" title="新規理論・中核機構" />
          <ArticleGrid items={FAR_FROM_SAGA.theories} columns={2} label="新規理論・中核機構" />

          <SubHeading kicker="ARMOR / OS" title="装甲・浮遊ユニットと統合OS" />
          <ArticleGrid
            items={[FAR_FROM_SAGA.bits, FAR_FROM_SAGA.os]}
            columns={2}
            label="装甲とOS"
          />

          <SubHeading kicker="DIVINE AUTHORITY" title="神属権限・継承能力" />
          <ArticleGrid items={FAR_FROM_SAGA.powers} columns={3} label="神属権限・継承能力" />

          <SubHeading kicker="ARSENAL" title="追加武装" />
          <div className="fst-arsenal">
            <ul aria-label="ファーフロムサーガ 追加武装">
              {FAR_FROM_SAGA.arsenal.map((weapon) => (
                <li key={weapon}>{weapon}</li>
              ))}
            </ul>
            <p>{FAR_FROM_SAGA.arsenalNote}</p>
          </div>

          <SubHeading kicker="FINISHER" title="必殺技" />
          <div className="fst-finishers">
            {FAR_FROM_SAGA.finishers.map((finisher) => (
              <article key={finisher.name} className="fst-plain">
                <small>{finisher.code}</small>
                <h4>{finisher.name}</h4>
                <CallOuts calls={finisher.calls} label={`${finisher.name} 発動音声`} />
                {finisher.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </article>
            ))}
          </div>
        </RiderPickup>

        <RiderPickup
          id="realm-royal"
          accent="#ff6f8d"
          image={REALM_ROYAL.visuals[0].image}
          imageWidth={REALM_ROYAL.visuals[0].width}
          imageHeight={REALM_ROYAL.visuals[0].height}
          imagePos="50% 10%"
          eyebrow={`RIDER RECORD 02 / ${REALM_ROYAL.en}`}
          name={REALM_ROYAL.name}
          sub={REALM_ROYAL.formsLine}
          quote="戦場を王国として宣言し、味方全員に勝利譚の加護を分配する。仮面ライダーレルムの究極形態。"
        >
          <SubHeading kicker="FIVE CROWNS" title="形態とスペック" />
          <div className="rxs-stage-switcher">
            <div
              ref={formTabsRef}
              className="rxs-stage-tabs liquid-swipe-tabs fst-rr-form-tabs"
              role="tablist"
              aria-label="レルムロイヤルの形態"
              aria-describedby="fst-rr-form-hint"
              data-liquid-glass="true"
              data-stage={form}
            >
              <LiquidLens />
              {RR_FORM_ORDER.map((key) => (
                <button
                  key={key}
                  id={`fst-rr-form-tab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={form === key}
                  aria-controls="fst-rr-form-panel"
                  tabIndex={form === key ? 0 : -1}
                  className={form === key ? "is-active" : ""}
                  style={{ ["--liquid-accent" as string]: REALM_ROYAL.forms[key].accent }}
                  onClick={() => setForm(key)}
                  onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
                >
                  <span>{REALM_ROYAL.forms[key].code}</span>
                  <small>{REALM_ROYAL.forms[key].label}</small>
                </button>
              ))}
            </div>
            <p id="fst-rr-form-hint" className="rxs-stage-hint">
              タップ、長押し、または左右へのスライドで切り替え
            </p>

            <div
              id="fst-rr-form-panel"
              className="fst-form-panel"
              role="tabpanel"
              aria-labelledby={`fst-rr-form-tab-${form}`}
              aria-live="polite"
              style={{ ["--fst-accent" as string]: activeForm.accent }}
            >
              <div key={`${form}-copy`} className="fst-form-copy">
                <small>{activeForm.code}</small>
                <h3>{activeForm.name}</h3>
                <CallOuts calls={activeForm.calls} label={`${activeForm.name} 変身音声`} />
              </div>
              <div key={`${form}-specs`} className="fst-form-specs">
                <SpecList rows={activeForm.specs} label={`${activeForm.name} スペック`} />
              </div>
            </div>
          </div>

          <SubHeading kicker="VISUAL" title="ビジュアル" />
          <div className="fst-gallery" role="list" aria-label="レルムロイヤル ビジュアル">
            {REALM_ROYAL.visuals.map((visual, index) => (
              <figure key={visual.image} role="listitem">
                <img
                  src={visual.image}
                  {...rexonanceImage(visual.image, true)}
                  alt={visual.alt}
                  width={visual.width}
                  height={visual.height}
                  loading="lazy"
                  decoding="async"
                  fetchPriority={index === 0 ? "auto" : "low"}
                />
                <figcaption>{visual.label}</figcaption>
              </figure>
            ))}
          </div>

          <SubHeading kicker="OVERVIEW" title="概要" />
          <Prose paragraphs={REALM_ROYAL.overview} className="fst-plain" />

          <SubHeading kicker="ARMOR / APPEARANCE" title="装甲・外観" />
          <Prose paragraphs={REALM_ROYAL.armor} className="fst-plain" />

          <SubHeading kicker="ABILITY" title="能力" />
          <ArticleGrid items={REALM_ROYAL.abilities} columns={3} label="レルムロイヤルの能力" />

          <SubHeading kicker="MULTI TYPE" title={REALM_ROYAL.multiType.title} />
          <Prose paragraphs={REALM_ROYAL.multiType.body} className="fst-plain" />

          <SubHeading kicker="ARSENAL" title="追加武装" />
          <ArticleGrid items={REALM_ROYAL.arsenal} columns={3} label="レルムロイヤル 追加武装" />

          <SubHeading kicker="FINISHER" title="必殺技" />
          <div className="fst-finishers">
            {REALM_ROYAL.finishers.map((finisher) => (
              <article key={finisher.name} className="fst-plain">
                <small>{finisher.code}</small>
                <h4>{finisher.name}</h4>
                <CallOuts calls={finisher.calls} label={`${finisher.name} 発動音声`} />
                {finisher.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </article>
            ))}
          </div>
        </RiderPickup>
      </section>

      <footer className="rxs-footer fst-footer">
        <div>
          <p>FINAL STAGE / STORY &amp; RECORDS</p>
          <h2>ファイナルステージ、開幕。</h2>
        </div>
        <GuardedLink to="/riders/saga" assets={[]}>
          <span>サーガの人物・能力を見る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink to="/riders/realm" assets={[]}>
          <span>レルムの人物・能力を見る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink to="/world" hash="top" assets={WORLD_ENTER_ASSETS}>
          <span>メインサイトへ戻る</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
      </footer>
    </main>
  );
}
