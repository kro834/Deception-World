import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { rexonanceImage } from "@/lib/rexonance-images";
import { warmRexonanceStages } from "@/lib/warm-rexonance-stages";
import {
  FAR_FROM_SAGA,
  FFS_STAGE_ORDER,
  REALM_ROYAL,
  RR_FORM_ORDER,
  type Article,
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

export function FinalStage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<FfsStageKey>("middle");
  const [form, setForm] = useState<RrFormKey>("royal");
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const formTabsRef = useRef<HTMLDivElement | null>(null);
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
    const unbind = bindRail(rail, FFS_STAGE_ORDER, setStage);
    const stopWarmup = warmRexonanceStages(
      rail,
      FFS_STAGE_ORDER.filter((key) => key !== "middle").map(
        (key) => FAR_FROM_SAGA.stages[key].image,
      ),
    );
    return () => {
      stopWarmup();
      unbind();
    };
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
            <a href="#far-from-saga">ファーフロム</a>
            <a href="#realm-royal">ロイヤル</a>
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
          <p className="rxs-hero-lede">ファイナルステージ限定、二つの究極形態の記録。</p>
        </div>
        <a className="rxs-scroll-cue" href="#riders">
          <span>記録を開く</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section id="riders" className="rxs-section fst-entries-section" aria-label="収録ライダー">
        <div className="fst-entries">
          <a className="fst-entry rxs-reveal" href="#far-from-saga">
            <figure>
              <img
                src={FAR_FROM_SAGA.stages.ultra.image}
                {...rexonanceImage(FAR_FROM_SAGA.stages.ultra.image)}
                alt=""
                width={FAR_FROM_SAGA.stages.ultra.width}
                height={FAR_FROM_SAGA.stages.ultra.height}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div>
              <small>RIDER RECORD 01 / {FAR_FROM_SAGA.en}</small>
              <strong>
                <span>仮面ライダー</span>
                {FAR_FROM_SAGA.name}
              </strong>
              <em>{FAR_FROM_SAGA.stagesLine}</em>
              <i aria-hidden="true">↓</i>
            </div>
          </a>
          <a className="fst-entry rxs-reveal" href="#realm-royal">
            <figure>
              <img
                src={REALM_ROYAL.visuals[0].image}
                {...rexonanceImage(REALM_ROYAL.visuals[0].image)}
                alt=""
                width={REALM_ROYAL.visuals[0].width}
                height={REALM_ROYAL.visuals[0].height}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div>
              <small>RIDER RECORD 02 / {REALM_ROYAL.en}</small>
              <strong>
                <span>仮面ライダー</span>
                {REALM_ROYAL.name}
              </strong>
              <em>{REALM_ROYAL.formsLine}</em>
              <i aria-hidden="true">↓</i>
            </div>
          </a>
        </div>
      </section>

      {/* ---------------- FAR FROM SAGA ---------------- */}
      <section id="far-from-saga" className="rxs-section fst-rider fst-ffs">
        <header className="rxs-section-heading rxs-reveal">
          <p>RIDER RECORD 01 / {FAR_FROM_SAGA.en}</p>
          <h2>
            <span className="fst-prefix">仮面ライダー</span>
            ファーフロム
            <br />
            サーガ
          </h2>
          <span>{FAR_FROM_SAGA.stagesLine}</span>
        </header>

        <CallOuts calls={FAR_FROM_SAGA.calls} label="ファーフロムサーガ 変身音声" />

        <div className="fst-spec-block rxs-reveal">
          <SpecList rows={FAR_FROM_SAGA.specs} label="ファーフロムサーガ スペック" />
          <p className="fst-note">{FAR_FROM_SAGA.specNote}</p>
        </div>

        <SubHeading kicker="OVERVIEW" title="概要" />
        <Prose paragraphs={FAR_FROM_SAGA.overview} className="rxs-reveal" />

        <SubHeading kicker="FIVE STAGES" title="形態段階" />
        <div className="rxs-stage-switcher rxs-reveal">
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
        <ArticleGrid items={[FAR_FROM_SAGA.bits, FAR_FROM_SAGA.os]} columns={2} label="装甲とOS" />

        <SubHeading kicker="DIVINE AUTHORITY" title="神属権限・継承能力" />
        <ArticleGrid items={FAR_FROM_SAGA.powers} columns={3} label="神属権限・継承能力" />

        <SubHeading kicker="ARSENAL" title="追加武装" />
        <div className="fst-arsenal rxs-reveal">
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
            <article key={finisher.name} className="rxs-reveal">
              <small>{finisher.code}</small>
              <h4>{finisher.name}</h4>
              <CallOuts calls={finisher.calls} label={`${finisher.name} 発動音声`} />
              {finisher.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- REALM ROYAL ---------------- */}
      <section id="realm-royal" className="rxs-section fst-rider fst-rr">
        <header className="rxs-section-heading rxs-reveal">
          <p>RIDER RECORD 02 / {REALM_ROYAL.en}</p>
          <h2>
            <span className="fst-prefix">仮面ライダー</span>
            レルム
            <br />
            ロイヤル
          </h2>
          <span>{REALM_ROYAL.formsLine}</span>
        </header>

        <SubHeading kicker="FIVE CROWNS" title="形態とスペック" />
        <div className="rxs-stage-switcher rxs-reveal">
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
        <div className="fst-gallery rxs-reveal" role="list" aria-label="レルムロイヤル ビジュアル">
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
        <Prose paragraphs={REALM_ROYAL.overview} className="rxs-reveal" />

        <SubHeading kicker="ARMOR / APPEARANCE" title="装甲・外観" />
        <Prose paragraphs={REALM_ROYAL.armor} className="rxs-reveal" />

        <SubHeading kicker="ABILITY" title="能力" />
        <ArticleGrid items={REALM_ROYAL.abilities} columns={3} label="レルムロイヤルの能力" />

        <SubHeading kicker="MULTI TYPE" title={REALM_ROYAL.multiType.title} />
        <Prose paragraphs={REALM_ROYAL.multiType.body} className="rxs-reveal" />

        <SubHeading kicker="ARSENAL" title="追加武装" />
        <ArticleGrid items={REALM_ROYAL.arsenal} columns={3} label="レルムロイヤル 追加武装" />

        <SubHeading kicker="FINISHER" title="必殺技" />
        <div className="fst-finishers">
          {REALM_ROYAL.finishers.map((finisher) => (
            <article key={finisher.name} className="rxs-reveal">
              <small>{finisher.code}</small>
              <h4>{finisher.name}</h4>
              <CallOuts calls={finisher.calls} label={`${finisher.name} 発動音声`} />
              {finisher.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
      </section>

      <footer className="rxs-footer fst-footer">
        <div>
          <p>FINAL STAGE / TWO ULTIMATE FORMS</p>
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
