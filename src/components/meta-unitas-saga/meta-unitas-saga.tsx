import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import {
  FAR_FROM_SAGA_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
  WORLD_ENTER_ASSETS,
} from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
import {
  META_UNITAS_ARTWORK,
  META_UNITAS_KEY_VISUAL,
  META_UNITAS_STAGE_ORDER,
  metaUnitasImage,
  type MetaUnitasStageKey,
} from "@/lib/meta-unitas-saga-artwork";
import { warmRexonanceStages } from "@/lib/warm-rexonance-stages";
import { META_UNITAS_PERFORMANCE, META_UNITAS_SAGA } from "./meta-unitas-data";
import { Articles, Bracketed, CallLine } from "./meta-unitas-parts";
import { MetaUnitasPerformance } from "./meta-unitas-performance";
import { FORM_ACCENTS, FORM_LABELS, MetaUnitasSuitUp } from "./meta-unitas-suitup";
import { META_UNITAS_CALL_LINES } from "@/lib/meta-unitas-assembly";

/* META UNITAS SAGA special site (owner's record of 2026-10-23).

   The special sites' structure (/rexonance-saga, /far-from-saga): the local
   bar with five numbered chapters, a split hero (the key visual in its
   frame, the names and the five calls beside it), then the chapters —
   01 概要 (the record's overview, its specs side by side for ミドル and
   ウルトラ, and the comparison as its sub-chapters), 02 変身 (the scroll
   suit-up and the form it ends on), 03 機構 (基幹システム, 固有能力,
   装甲・支援機構), 04 形態段階, 05 武装 (専用武装, 必殺技) — and the end card.

   Every word of record is the owner's (meta-unitas-data.ts is generated from
   the owner's own texts). No kicker, caption or counter is added: the
   layout carries the structure (LABELS.md, 2026-10-23). The motif is the
   form's ability, separation without destruction: hairline boundaries,
   halos, a whole that holds as independent parts — the key visual's frame
   is partitioned into bands along orange seams, the plates of the articles
   are independent cells of one grid.

   Motion is granted (data-motion-ready) only without reduced motion, forced
   colours, economy rendering or a saving connection; the reveals are one
   IntersectionObserver, armed after paint; everything else rests drawn. */

function motionAllowed() {
  if (typeof window === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return !(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(forced-colors: active)").matches ||
    document.documentElement.dataset.worldEffects === "economy" ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType ?? "")
  );
}

const STAGE_LINK = /^#stages-(middle|ultra)$/;

/** The two values of a ミドル／ウルトラ spec, or the one value over both. */
function SpecTable() {
  return (
    <div className="mus-specs-wrap rxs-reveal">
      <table className="mus-specs">
        <caption className="visually-hidden">メタ・ウニタスサーガ スペック</caption>
        <thead>
          <tr>
            <td />
            <th scope="col">{FORM_LABELS.middle}</th>
            <th scope="col">{FORM_LABELS.ultra}</th>
          </tr>
        </thead>
        <tbody>
          {META_UNITAS_SAGA.specs.map((row) => (
            <tr key={row.key} data-dual={"middle" in row || undefined}>
              <th scope="row">{row.key}</th>
              {"middle" in row ? (
                <>
                  <td>{row.middle}</td>
                  <td>{row.ultra}</td>
                </>
              ) : (
                <td colSpan={2}>
                  <span>{row.value}</span>
                  {"more" in row && row.more
                    ? row.more.map((line) => (
                        <span key={line} className="mus-spec-more">
                          {line}
                        </span>
                      ))
                    : null}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The key visual, whole; thin orange boundaries trace across it once. */
function HeroVisual() {
  const image = metaUnitasImage("middle");
  return (
    <div className="mus-hero-visual" aria-hidden="true">
      <i className="mus-hero-halo" />
      <div className="mus-hero-bands">
        <img
          className="mus-hero-art"
          src={META_UNITAS_KEY_VISUAL.src}
          srcSet={image.srcSet}
          sizes={image.sizes}
          alt=""
          width={META_UNITAS_KEY_VISUAL.width}
          height={META_UNITAS_KEY_VISUAL.height}
          decoding="async"
          fetchPriority="high"
        />
        {[1, 2, 3].map((seam) => (
          <i key={seam} className="mus-hero-seam" style={{ ["--seam" as string]: seam }} />
        ))}
      </div>
    </div>
  );
}

export function MetaUnitasSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  // The page's one form state: the selector after the runway and #stages'
  // rail both choose it, and the runway ends on it.
  const [stage, setStageState] = useState<MetaUnitasStageKey>("middle");
  const [entrance, setEntrance] = useState(0);
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const stagePanelRef = useRef<HTMLDivElement | null>(null);
  const latestStageRef = useRef<MetaUnitasStageKey>("middle");
  const panelAnchor = useRef<number | null>(null);

  const selectStage = useCallback((next: MetaUnitasStageKey, animate = true) => {
    if (latestStageRef.current === next) return;
    latestStageRef.current = next;
    // No switch moves the page: note where #stages' panel stands.
    const panel = stagePanelRef.current?.getBoundingClientRect();
    panelAnchor.current =
      panel && panel.bottom > 0 && panel.top < window.innerHeight ? panel.top : null;
    setStageState(next);
    if (animate && motionAllowed()) setEntrance((value) => value + 1);
  }, []);
  const chooseQuietly = useCallback(
    (next: MetaUnitasStageKey) => selectStage(next, false),
    [selectStage],
  );

  useLayoutEffect(() => {
    const before = panelAnchor.current;
    panelAnchor.current = null;
    const panel = stagePanelRef.current;
    if (before === null || !panel) return;
    const delta = panel.getBoundingClientRect().top - before;
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }, [stage]);

  // #stages-ultra / #stages-middle select the form and open #stages.
  useEffect(() => {
    const follow = () => {
      const match = STAGE_LINK.exec(window.location.hash);
      if (!match) return;
      selectStage(match[1] as MetaUnitasStageKey, false);
      window.requestAnimationFrame(() =>
        document.getElementById("stages")?.scrollIntoView({ block: "start" }),
      );
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [selectStage]);

  useEffect(() => mountLocalNavCurrent(pageRef.current?.querySelector(".rxs-local-nav nav")), []);

  // The page's top reserve follows the bar's real height (a larger text
  // size wraps it), as the other special sites keep it: measured on layout
  // and font changes, never on scroll.
  useEffect(() => {
    const page = pageRef.current;
    const nav = page?.querySelector<HTMLElement>(".rxs-local-nav");
    if (!page || !nav) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const reserve = `${Math.ceil(nav.getBoundingClientRect().height)}px`;
      if (page.style.getPropertyValue("--rxs-local-nav-reserve") !== reserve)
        page.style.setProperty("--rxs-local-nav-reserve", reserve);
    };
    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queue);
    observer?.observe(nav);
    window.addEventListener("resize", queue, { passive: true });
    document.fonts?.addEventListener("loadingdone", queue);
    sync();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", queue);
      document.fonts?.removeEventListener("loadingdone", queue);
      if (frame) window.cancelAnimationFrame(frame);
      page.style.removeProperty("--rxs-local-nav-reserve");
    };
  }, []);

  // ウルトラ's key visual, decoded in idle time once #stages is near.
  useEffect(() => {
    const target = document.getElementById("stages");
    if (!target) return;
    return warmRexonanceStages(target, [META_UNITAS_ARTWORK.ultra.src], () =>
      metaUnitasImage("ultra"),
    );
  }, []);

  // #stages' rail (tap, long-press, drag, arrow keys: the liquid rail).
  useEffect(() => {
    const rail = stageTabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? META_UNITAS_STAGE_ORDER[index] : undefined;
      if (next) selectStage(next);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, [selectStage]);
  useEffect(() => {
    stageTabsRef.current?.dispatchEvent(new Event("liquidrelayout"));
  }, [stage]);

  // The reveals, armed after paint and only where motion is allowed.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!motionAllowed() || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    setMotionReady(true);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const [riderName, ultraName] = META_UNITAS_SAGA.names;
  const activeStage = META_UNITAS_SAGA.stages[stage];
  const activeArt = META_UNITAS_ARTWORK[stage];
  const stageImage = metaUnitasImage(stage, stage !== "middle");

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page mus-page"
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
            <b>メタ・ウニタスサーガ</b>
          </GuardedLink>
          <nav aria-label="メタ・ウニタスサーガ ページ内ナビゲーション">
            <a href="#overview" data-local-nav-through="specs performance">
              <span aria-hidden="true">01</span> 概要
            </a>
            <a href="#suitup" data-local-nav-through="meta-unitas-runway">
              <span aria-hidden="true">02</span> 変身
            </a>
            <a href="#system" data-local-nav-through="abilities armor">
              <span aria-hidden="true">03</span> 機構
            </a>
            <a href="#stages">
              <span aria-hidden="true">04</span> 形態
            </a>
            <a href="#arsenal" data-local-nav-through="finishers">
              <span aria-hidden="true">05</span> 武装
            </a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="meta-unitas" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="mus-hero" aria-labelledby="mus-title">
        <HeroVisual />
        <div className="mus-hero-copy">
          <h1 id="mus-title">
            <span className="mus-hero-rider">仮面ライダー</span>
            <span className="mus-hero-name">{riderName.replace(/^仮面ライダー/, "")}</span>
          </h1>
          <p className="mus-hero-ultra">{ultraName}</p>
          <ol className="mus-calls" aria-label="変身音声">
            {META_UNITAS_CALL_LINES.map((units, index) => (
              <li key={index} data-chant={units.length > 1 || undefined}>
                <CallLine units={units} />
              </li>
            ))}
          </ol>
          <div className="mus-hero-doors">
            <a className="is-primary" href="#suitup">
              <span>変身</span>
              <i aria-hidden="true">↘</i>
            </a>
            <a href="#stages">
              <span>形態段階</span>
              <i aria-hidden="true">↘</i>
            </a>
          </div>
        </div>
      </section>

      {/* 01 — the overview, the specs and the comparison. */}
      <section
        id="overview"
        className="mus-chapter mus-overview"
        aria-labelledby="mus-overview-title"
      >
        <header className="mus-head rxs-reveal">
          <h2 id="mus-overview-title">概要</h2>
        </header>
        <div className="mus-copy mus-overview-copy rxs-reveal">
          {META_UNITAS_SAGA.overview.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section
        id="specs"
        className="mus-chapter mus-sub mus-specs-section"
        aria-labelledby="mus-specs-title"
      >
        <h2 id="mus-specs-title" className="visually-hidden">
          スペック
        </h2>
        <SpecTable />
      </section>

      <section
        id="performance"
        className="mus-chapter mus-sub mus-performance-section"
        aria-labelledby="mus-performance-title"
      >
        <header className="mus-head rxs-reveal">
          <h2 id="mus-performance-title">{META_UNITAS_PERFORMANCE.title}</h2>
        </header>
        <MetaUnitasPerformance />
      </section>

      {/* 02 — the scroll suit-up and the form it ends on. */}
      <MetaUnitasSuitUp stage={stage} onChoose={chooseQuietly} />

      {/* 03 — the systems, the abilities, the armour and support mechanisms. */}
      <section id="system" className="mus-chapter mus-system" aria-labelledby="mus-system-title">
        <header className="mus-head rxs-reveal">
          <h2 id="mus-system-title">基幹システム</h2>
        </header>
        <Articles items={META_UNITAS_SAGA.systems} label="基幹システム" variant="system" />
      </section>
      <section
        id="abilities"
        className="mus-chapter mus-sub mus-abilities"
        aria-labelledby="mus-abilities-title"
      >
        <header className="mus-head rxs-reveal">
          <h2 id="mus-abilities-title">固有能力</h2>
        </header>
        <Articles items={META_UNITAS_SAGA.abilities} label="固有能力" variant="ability" />
      </section>
      <section
        id="armor"
        className="mus-chapter mus-sub mus-armor"
        aria-labelledby="mus-armor-title"
      >
        <header className="mus-head rxs-reveal">
          <h2 id="mus-armor-title">装甲・支援機構</h2>
        </header>
        <Articles items={META_UNITAS_SAGA.armor} label="装甲・支援機構" variant="armor" />
      </section>

      {/* 04 — the two forms. */}
      <section id="stages" className="mus-chapter mus-stages" aria-labelledby="mus-stages-title">
        <header className="mus-head rxs-reveal">
          <h2 id="mus-stages-title">形態段階</h2>
        </header>
        <div
          className="mus-stage-switcher rxs-reveal"
          style={{ ["--mus-accent" as string]: FORM_ACCENTS[stage] }}
        >
          <div
            ref={stageTabsRef}
            className="rxs-stage-tabs liquid-swipe-tabs mus-tabs"
            role="tablist"
            aria-label="メタ・ウニタスサーガの形態段階"
            data-liquid-glass="true"
            data-stage={stage}
          >
            <LiquidLens />
            {META_UNITAS_STAGE_ORDER.map((key) => (
              <button
                key={key}
                id={`mus-stage-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={stage === key}
                aria-controls="mus-stage-panel"
                tabIndex={stage === key ? 0 : -1}
                className={stage === key ? "is-active" : ""}
                style={{ ["--liquid-accent" as string]: FORM_ACCENTS[key] }}
                onClick={() => selectStage(key)}
              >
                <span>{FORM_LABELS[key]}</span>
              </button>
            ))}
          </div>
          <div
            ref={stagePanelRef}
            id="mus-stage-panel"
            className="mus-stage-panel"
            role="tabpanel"
            aria-labelledby={`mus-stage-tab-${stage}`}
            data-stage={stage}
          >
            <figure key={`${stage}-${entrance}`} data-entrance={entrance > 0 || undefined}>
              <img
                className="mus-stage-backdrop"
                src={activeArt.src}
                srcSet={stageImage.srcSet}
                sizes={stageImage.sizes}
                alt=""
                aria-hidden="true"
                width={activeArt.width}
                height={activeArt.height}
                loading={stage === "middle" ? "eager" : "lazy"}
                decoding="async"
              />
              {[0, 1, 2, 3].map((band) => (
                <span key={band} className="mus-stage-band" style={{ ["--band" as string]: band }}>
                  <img
                    src={activeArt.src}
                    srcSet={stageImage.srcSet}
                    sizes={stageImage.sizes}
                    alt={band === 0 ? activeStage.title : ""}
                    aria-hidden={band === 0 ? undefined : true}
                    width={activeArt.width}
                    height={activeArt.height}
                    loading={stage === "middle" ? "eager" : "lazy"}
                    decoding="async"
                  />
                </span>
              ))}
            </figure>
            <div key={`${stage}-copy`} className="mus-stage-copy">
              <h3>
                <Bracketed text={`《 ${activeStage.title} 》`} />
              </h3>
              <div className="mus-copy">
                {activeStage.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 05 — the armaments and the finishers. */}
      <section id="arsenal" className="mus-chapter mus-arsenal" aria-labelledby="mus-arsenal-title">
        <header className="mus-head rxs-reveal">
          <h2 id="mus-arsenal-title">専用武装</h2>
        </header>
        <ul className="mus-weapons rxs-reveal" aria-label="専用武装">
          {META_UNITAS_SAGA.arsenal.map((weapon) => (
            <li key={weapon}>{weapon}</li>
          ))}
        </ul>
        <div className="mus-copy mus-arsenal-note rxs-reveal">
          {META_UNITAS_SAGA.arsenalNote.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
      <section
        id="finishers"
        className="mus-chapter mus-sub mus-finishers"
        aria-labelledby="mus-finishers-title"
      >
        <header className="mus-head rxs-reveal">
          <h2 id="mus-finishers-title">必殺技</h2>
        </header>
        <div className="mus-finisher-list">
          {META_UNITAS_SAGA.finishers.map((finisher, index) => (
            <article key={finisher.name} className="mus-finisher rxs-reveal" data-tier={index}>
              <h3>{finisher.name}</h3>
              <ol className="mus-finisher-calls" aria-label={`${finisher.name} 発動音声`}>
                {finisher.calls.map((call) => (
                  <li key={call}>
                    <Bracketed text={call} />
                  </li>
                ))}
              </ol>
              <div className="mus-copy">
                {finisher.body.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mus-footer" role="contentinfo">
        <img
          className="mus-end-figure"
          src={META_UNITAS_ARTWORK.ultra.src}
          srcSet={metaUnitasImage("ultra").srcSet}
          sizes="(max-width: 760px) 80vw, 40vw"
          alt=""
          aria-hidden="true"
          width={META_UNITAS_ARTWORK.ultra.width}
          height={META_UNITAS_ARTWORK.ultra.height}
          loading="lazy"
          decoding="async"
        />
        <div className="mus-end-names">
          <p>{riderName}</p>
          <p>{ultraName}</p>
        </div>
        <nav className="mus-end-doors" aria-label="ほかのページへ">
          <a href="#top">
            <span>ページの先頭へ</span>
            <i aria-hidden="true">↑</i>
          </a>
          <GuardedLink to="/far-from-saga" hash="top" assets={FAR_FROM_SAGA_ENTER_ASSETS}>
            <span>ファーフロムサーガ</span>
            <i aria-hidden="true">↗</i>
          </GuardedLink>
          <GuardedLink to="/rexonance-saga" hash="top" assets={REXONANCE_SAGA_ENTER_ASSETS}>
            <span>レクソナンスサーガ</span>
            <i aria-hidden="true">↗</i>
          </GuardedLink>
          <GuardedLink to="/riders/saga" assets={[]}>
            <span>仮面ライダーサーガのページへ</span>
            <i aria-hidden="true">↗</i>
          </GuardedLink>
          <GuardedLink to="/world" hash="top" assets={WORLD_ENTER_ASSETS} className="is-return">
            <span>メインサイトへ戻る</span>
            <i aria-hidden="true">←</i>
          </GuardedLink>
        </nav>
      </footer>
    </main>
  );
}
