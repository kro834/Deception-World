import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { withWordBreaks } from "@/lib/name-breaks";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { FormSlider } from "@/components/special/form-slider";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
import {
  ILLUSIONCULUM_ARTWORK,
  ILLUSIONCULUM_CUTOUT_SIZE,
  ILLUSIONCULUM_FORM_ORDER,
  ILLUSIONCULUM_HERO,
  illusionculumCutout,
  illusionculumCutoutImage,
  illusionculumDetail,
  illusionculumImage,
  type IllusionculumFormKey,
} from "@/lib/illusionculum-saga-artwork";
import { warmRexonanceStages } from "@/lib/warm-rexonance-stages";
import { ILLUSIONCULUM_FORMS, ILLUSIONCULUM_SAGA, type IcArticle } from "./illusionculum-data";
import { IllusionculumComparison } from "./illusionculum-comparison";
import { phrase, prose } from "./illusionculum-phrase";
import { IllusionculumRail } from "./illusionculum-rail";
import { withCallBreaks } from "@/components/far-from-saga/far-from-phrase";
import { IllusionculumSuitUp } from "./illusionculum-suitup";
import { IllusionculumEntryTransition } from "./illusionculum-entry-transition";
import { IllusionculumOrbs, IllusionculumProjection } from "./illusionculum-figures";

/* ILLUSIONCULUM SAGA special site (owner, 2026-10-23: 「イリュージョンクルム
   サーガを追加。レクソナンスを参考に。」).

   The Rexonance site's structure, as /far-from-saga carries it: the local bar
   with numbered chapters, a split hero (the key visual in its stage beside
   the name and the calls), then numbered chapters and the end card. Every
   word of record is the owner's (illusionculum-data.ts, verbatim); the
   shared special-site grammar (styles-rexonance-saga.css and the showcase
   sheets) draws the chrome, and styles-illusionculum-saga.css is this
   page's own composition, palette and motion — black metal, a gold
   skeleton, ice-blue crystal, ultramarine and the pink and violet light
   paths, deep crimson for ウルトラ — around the form's one idea: the
   projection and the real position split apart (ILLUSIONCULUM), with the two
   リアクター・モア in orbit.

   Chapters (the bar): 01 概要 (specs and the comparison as sub-chapters),
   02 変身 (the scroll suit-up, ending on the form chosen right after its
   runway), 03 形態, 04 装甲・外観, 05 専用武装, 06 能力 (必殺技 as its
   sub-chapter). The numerals are CSS counters over the chapters; a
   sub-chapter (.ics-subchapter) keeps its chapter's number.

   Every engine is a lazy chunk mounted after paint, only where motion is
   allowed. The chapter reveals are one IntersectionObserver armed after
   mount; the reduced-motion, forced-colour, economy and saving tiers rest
   everything fully drawn. */

const releaseControlFocus = (control: HTMLElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
};

/** Whether the page may move (the Rexonance page's terms). */
function motionAllowed() {
  if (typeof window === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  return !(
    document.hidden ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia("(forced-colors: active)").matches ||
    document.documentElement.dataset.worldEffects === "economy" ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType ?? "")
  );
}

/** A deep link to one form: /illusionculum-saga#forms-ultra (and the others). */
const FORM_LINK = /^#forms-(standard|more|ultra|ultraMore)$/;

/** The pictures a switch can call for, warmed after the hero's standard. */
const FORM_WARM_ORDER = ["more", "ultra", "ultraMore"] as const;

const isUltra = (key: IllusionculumFormKey) => key === "ultra" || key === "ultraMore";

/** The names' parts for the type: 「仮面ライダー」 set small over the name, and
 * 「ウルトラ」 in its crimson (the owner's names, never reworded). */
const RIDER_PREFIX = "仮面ライダー";
const ULTRA_WORD = "ウルトラ";
const ultraStem = ILLUSIONCULUM_SAGA.ultraName.slice(0, -ULTRA_WORD.length);

/** An article's title in its 『』, each word whole on its line and the
 * brackets kept with the first and the last word (never a line of their own). */
function bracketed(title: string) {
  const words = title.split(/(?<=・)|(?<= )/u);
  return words.map((word, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      <span className="ics-nb">
        {index === 0 ? <i aria-hidden="true">『</i> : null}
        {word}
        {index === words.length - 1 ? <i aria-hidden="true">』</i> : null}
      </span>
    </Fragment>
  ));
}

/** A record's articles (装甲・外観, 専用武装, 能力): the title, then the
 * owner's paragraphs; the first article of a chapter may carry a detail. */
function Articles({
  items,
  label,
  details = {},
}: {
  items: readonly IcArticle[];
  label: string;
  details?: Partial<Record<number, "helm" | "orb" | "legs">>;
}) {
  return (
    <div className="ics-articles" role="list" aria-label={label}>
      {items.map((item, index) => {
        const detail = details[index];
        const art = detail ? illusionculumDetail(detail) : null;
        return (
          <article
            key={item.title}
            className={`ics-article rxs-reveal${art ? " has-detail" : ""}`}
            role="listitem"
            data-detail={detail}
          >
            {art ? (
              <figure className="ics-detail" aria-hidden="true">
                <img
                  src={art.src}
                  alt=""
                  width={art.width}
                  height={art.height}
                  loading="lazy"
                  decoding="async"
                />
                <i />
              </figure>
            ) : null}
            <div className="ics-article-copy">
              <h3 lang={/^[\x20-\x7e]+$/.test(item.title) ? "en" : undefined}>
                {bracketed(item.title)}
              </h3>
              {item.body.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{prose(paragraph)}</p>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** The record's calls: chips in a numbered sequence (the order is the call's). */
function Calls({
  calls,
  label,
  className = "",
}: {
  calls: readonly string[];
  label: string;
  className?: string;
}) {
  return (
    <ol className={`ics-calls ${className}`.trim()} aria-label={label}>
      {calls.map((call, index) => (
        <li key={`${index}-${call}`} lang="en">
          <b>{withCallBreaks(call)}</b>
        </li>
      ))}
    </ol>
  );
}

/** The four forms as the shared slider's items (each its own light). */
const FORM_ITEMS = ILLUSIONCULUM_FORM_ORDER.map((key) => ({
  key,
  // The name breaks only at its seams (イリュージョン｜クルム), never mid-word.
  label: withWordBreaks(ILLUSIONCULUM_FORMS[key].label),
  accent: ILLUSIONCULUM_FORMS[key].accent,
}));

export function IllusionculumSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  // The page's one form state: the selector after the suit-up's runway and
  // #forms' rail both choose it, and the runway ends on it.
  const [form, setFormState] = useState<IllusionculumFormKey>("standard");
  // null until the page has decided (after mount): the motion tier keeps
  // the hero's orbs and projections hidden only while it is undecided.
  const [motionReady, setMotionReady] = useState<boolean | null>(null);
  const [entrance, setEntrance] = useState(0);
  const pageRef = useRef<HTMLElement | null>(null);
  const formTabsRef = useRef<HTMLDivElement | null>(null);
  const formPanelRef = useRef<HTMLDivElement | null>(null);
  const latestForm = useRef<IllusionculumFormKey>("standard");
  // The panel's place on screen before a switch (null when off screen): the
  // layout effect keeps it there, so no switch moves the page.
  const panelAnchor = useRef<number | null>(null);

  const selectForm = useCallback((next: IllusionculumFormKey) => {
    if (latestForm.current === next) return;
    latestForm.current = next;
    const panel = formPanelRef.current?.getBoundingClientRect();
    panelAnchor.current =
      panel && panel.bottom > 0 && panel.top < window.innerHeight ? panel.top : null;
    setFormState(next);
    if (motionAllowed()) setEntrance((count) => count + 1);
  }, []);

  useLayoutEffect(() => {
    const before = panelAnchor.current;
    panelAnchor.current = null;
    const panel = formPanelRef.current;
    if (before === null || !panel) return;
    const delta = panel.getBoundingClientRect().top - before;
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }, [form]);

  // A deep link to one form selects it and opens #forms.
  useEffect(() => {
    const follow = () => {
      const match = FORM_LINK.exec(window.location.hash);
      if (!match) return;
      selectForm(match[1] as IllusionculumFormKey);
      window.requestAnimationFrame(() =>
        document.getElementById("forms")?.scrollIntoView({ block: "start" }),
      );
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [selectForm]);

  useEffect(() => mountLocalNavCurrent(pageRef.current?.querySelector(".rxs-local-nav nav")), []);

  // The page's top reserve follows the bar's real height (text enlargement,
  // a wrapped brand), as on the Rexonance and Final Stage pages.
  useEffect(() => {
    const page = pageRef.current;
    const nav = page?.querySelector<HTMLElement>(".rxs-local-nav");
    if (!page || !nav) return;
    const syncNavReserve = () => {
      const reserve = `${Math.ceil(nav.getBoundingClientRect().height)}px`;
      if (page.style.getPropertyValue("--rxs-local-nav-reserve") !== reserve)
        page.style.setProperty("--rxs-local-nav-reserve", reserve);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncNavReserve);
    observer?.observe(nav);
    window.addEventListener("resize", syncNavReserve, { passive: true });
    window.visualViewport?.addEventListener("resize", syncNavReserve, { passive: true });
    syncNavReserve();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncNavReserve);
      window.visualViewport?.removeEventListener("resize", syncNavReserve);
      page.style.removeProperty("--rxs-local-nav-reserve");
    };
  }, []);

  // The other forms' pictures, decoded in idle time once #forms is near.
  useEffect(() => {
    const target = document.getElementById("forms");
    if (!target) return;
    const sources = FORM_WARM_ORDER.map((key) => ILLUSIONCULUM_ARTWORK[key].src);
    return warmRexonanceStages(target, sources, (source) => {
      const key = FORM_WARM_ORDER.find(
        (candidate) => ILLUSIONCULUM_ARTWORK[candidate].src === source,
      );
      return key ? illusionculumImage(key) : {};
    });
  }, []);

  // The liquid rail owns tap, long-press, drag and keyboard selection; React
  // mirrors the chosen index back into state.
  useEffect(() => {
    const rail = formTabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? ILLUSIONCULUM_FORM_ORDER[index] : undefined;
      if (next) selectForm(next);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, [selectForm]);

  // A choice made by the other selector moves this rail's lens too.
  useEffect(() => {
    formTabsRef.current?.dispatchEvent(new Event("liquidrelayout"));
  }, [form]);

  // The chapter reveals: armed after paint, only where motion is allowed.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!motionAllowed() || !("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      setMotionReady(false);
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

  const active = ILLUSIONCULUM_FORMS[form];
  const activeArt = ILLUSIONCULUM_ARTWORK[form];
  const specs = ILLUSIONCULUM_SAGA.specs;

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page ics-page"
      data-motion-ready={motionReady === null ? undefined : String(motionReady)}
      data-form={form}
      data-ultra={isUltra(form) ? "true" : undefined}
    >
      {/* Entry transition: prepared, renders nothing, never blocks paint. */}
      <IllusionculumEntryTransition />

      <header className="rxs-local-nav">
        <div className="rxs-local-nav-inner">
          <GuardedLink
            className="rxs-brand"
            to="/world"
            hash="top"
            assets={WORLD_ENTER_ASSETS}
            aria-label="ディセプションワールドへ戻る"
          >
            <span lang="en">ILLUSIONCULUM</span>
            <b>
              <DisplayName value="イリュージョンクルムサーガ" />
            </b>
          </GuardedLink>
          {/* The six chapters, numbered; a chapter stays lit through its
              sub-chapters. The side menu lists every section. */}
          <nav aria-label="イリュージョンクルムサーガ ページ内ナビゲーション">
            <a href="#overview" data-local-nav-through="specs comparison">
              <span aria-hidden="true">01</span> 概要
            </a>
            <a href="#suitup" data-local-nav-through="illusionculum-assembly-runway">
              <span aria-hidden="true">02</span> 変身
            </a>
            <a href="#forms">
              <span aria-hidden="true">03</span> 形態
            </a>
            <a href="#armour">
              <span aria-hidden="true">04</span> 装甲
            </a>
            <a href="#arsenal">
              <span aria-hidden="true">05</span> 武装
            </a>
            <a href="#abilities" data-local-nav-through="finishers">
              <span aria-hidden="true">06</span> 能力
            </a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="illusionculum" open={menuOpen} onOpenChange={setMenuOpen} />
      <IllusionculumRail />

      <section className="rxs-hero ics-hero" aria-labelledby="ics-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-copy">
          <h1 id="ics-title">
            {/* The owner's two names, unchanged: the prefix set small over
                the name, ウルトラ in its crimson (the words stay one text). */}
            <span className="ics-title-name">
              <span className="ics-title-prefix">{RIDER_PREFIX}</span>
              <DisplayName value={ILLUSIONCULUM_SAGA.name.slice(RIDER_PREFIX.length)} />
            </span>
            <span className="ics-title-ultra">
              <DisplayName value={ultraStem} />
              <span className="ics-ultra-word">{ULTRA_WORD}</span>
            </span>
          </h1>
          <Calls
            calls={ILLUSIONCULUM_SAGA.calls}
            label="イリュージョンクルムサーガ 変身音声"
            className="ics-hero-calls"
          />
          {/* The two doors, as the Rexonance hero's: into the suit-up and
              the four forms. */}
          <p className="ics-hero-doors">
            <a href="#suitup" className="is-primary">
              <span>変身を見る</span>
              <i aria-hidden="true">↓</i>
            </a>
            <a href="#forms">
              <span>四つの形態を見る</span>
              <i aria-hidden="true">↗</i>
            </a>
          </p>
          {/* The name's ghost behind the copy (decorative). */}
          <span className="ics-mark" aria-hidden="true">
            ILLUSIONCULUM
          </span>
        </div>
        <div className="rxs-hero-visual ics-hero-visual" aria-hidden="true">
          <svg className="ics-sigil" viewBox="0 0 400 400">
            <circle cx="200" cy="200" r="190" />
            <circle cx="200" cy="200" r="150" />
            <circle cx="200" cy="200" r="96" />
            <path d="M200 10 L364 295 L36 295 Z" />
            <path d="M200 390 L36 105 L364 105 Z" />
            <path d="M10 200 H390 M200 10 V390" />
          </svg>
          <div className="ics-hero-frame">
            {/* Two projections first, under the real figure: displaced
                images of the same frame that resolve into it once. */}
            <span
              className="ics-hero-ghost is-a"
              style={{
                ["--ics-cutout" as string]: `url("${illusionculumCutout("standard", 480)}")`,
              }}
            />
            <span
              className="ics-hero-ghost is-b"
              style={{
                ["--ics-cutout" as string]: `url("${illusionculumCutout("standard", 480)}")`,
              }}
            />
            <img
              className="ics-hero-figure"
              src={ILLUSIONCULUM_HERO.src}
              {...illusionculumCutoutImage("standard")}
              alt=""
              width={ILLUSIONCULUM_HERO.width}
              height={ILLUSIONCULUM_HERO.height}
              decoding="async"
              fetchPriority="high"
            />
            <IllusionculumOrbs />
          </div>
        </div>
        <a className="rxs-scroll-cue ics-scroll-cue" href="#overview" aria-label="概要へ">
          <i aria-hidden="true" />
        </a>
      </section>

      {/* 01 — 概要: the owner's overview. */}
      <section
        id="overview"
        className="rxs-section ics-chapter ics-overview"
        aria-labelledby="ics-overview-title"
      >
        <header className="rxs-section-heading ics-heading rxs-reveal">
          <b className="ics-numeral" aria-hidden="true">
            01
          </b>
          <h2 id="ics-overview-title">概要</h2>
          <span className="ics-heading-plate" data-plate="figure" aria-hidden="true" />
        </header>
        <div className="ics-overview-body">
          <div className="ics-prose ics-lead rxs-reveal">
            {ILLUSIONCULUM_SAGA.overview.slice(0, 4).map((paragraph, index) => (
              <p key={index}>{prose(paragraph)}</p>
            ))}
          </div>
          <IllusionculumProjection />
          <div className="ics-prose rxs-reveal">
            {ILLUSIONCULUM_SAGA.overview.slice(4).map((paragraph, index) => (
              <p key={index}>{prose(paragraph)}</p>
            ))}
          </div>
        </div>
      </section>

      {/* 01, continued — the spec sheet. The grid reads as specs; its name
          stays for assistive tech. */}
      <section
        id="specs"
        className="rxs-section ics-chapter ics-subchapter ics-specs-section"
        aria-labelledby="ics-specs-title"
      >
        <h2 id="ics-specs-title" className="ics-sr">
          スペック
        </h2>
        <dl className="ics-specs rxs-reveal" aria-labelledby="ics-specs-title">
          {specs.map((row) => (
            <div key={row.dt} data-wide={row.sub.length ? "true" : undefined}>
              <dt>{row.dt}</dt>
              <dd>
                <b>{row.dd}</b>
                {row.sub.length ? (
                  <span className="ics-spec-sub">
                    {row.sub.map((item) => (
                      <span key={item} lang="en">
                        {item}
                      </span>
                    ))}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 01, continued — the comparison (the owner's tables and evaluation). */}
      <IllusionculumComparison />

      {/* 02 — 変身: the scroll suit-up, ending on the form chosen in the
          selector right after its runway. */}
      <IllusionculumSuitUp form={form} onChoose={selectForm} />

      {/* 03 — 形態: the four key visuals. */}
      <section
        id="forms"
        className="rxs-stages rxs-section ics-chapter ics-forms"
        aria-labelledby="ics-forms-title"
      >
        <div className="rxs-stage-switcher ics-form-switcher rxs-reveal">
          <header className="rxs-section-heading ics-heading rxs-reveal">
            <b className="ics-numeral" aria-hidden="true">
              03
            </b>
            <h2 id="ics-forms-title">形態</h2>
          </header>
          <FormSlider
            ref={formTabsRef}
            className="ics-form-tabs"
            items={FORM_ITEMS}
            value={form}
            onSelect={selectForm}
            idPrefix="ics-form-tab"
            panelId="ics-form-panel"
            ariaLabel="イリュージョンクルムサーガの形態"
            onTabPointerUp={(event) => releaseControlFocus(event.currentTarget)}
          />

          <div
            ref={formPanelRef}
            id="ics-form-panel"
            className="rxs-stage-panel ics-form-panel"
            role="tabpanel"
            aria-labelledby={`ics-form-tab-${form}`}
            aria-live="polite"
            style={{ ["--ics-accent" as string]: active.accent }}
          >
            {/* Keyed by form and switch: every switch mounts a fresh figure,
                so its projection resolves again each time. */}
            <figure key={`${form}-${entrance}`} data-entrance={entrance ? "true" : undefined}>
              <img
                className="ics-form-ghost is-a"
                src={activeArt.src}
                alt=""
                aria-hidden="true"
                width={activeArt.width}
                height={activeArt.height}
                {...illusionculumImage(form, true)}
                loading="lazy"
                decoding="async"
              />
              <img
                className="ics-form-art"
                src={activeArt.src}
                {...illusionculumImage(form, form !== "standard")}
                alt={`${active.name}${form === "more" || form === "ultraMore" ? "（リアクター・モア展開）" : ""}`}
                width={activeArt.width}
                height={activeArt.height}
                loading={form === "standard" ? "eager" : "lazy"}
                decoding="async"
              />
              <i className="ics-form-scan" aria-hidden="true" />
            </figure>
            <div key={`${form}-copy`} className="ics-form-copy">
              <h3>
                <DisplayName value={active.name} />
              </h3>
              {form === "more" || form === "ultraMore" ? (
                <p className="ics-form-with">
                  <DisplayName value="リアクター・モア" />
                </p>
              ) : null}
              {active.body.map((paragraph, index) => (
                <p key={index}>{prose(paragraph)}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 04 — 装甲・外観. */}
      <section
        id="armour"
        className="rxs-section ics-chapter ics-armour"
        aria-labelledby="ics-armour-title"
      >
        <header className="rxs-section-heading ics-heading rxs-reveal">
          <b className="ics-numeral" aria-hidden="true">
            04
          </b>
          <h2 id="ics-armour-title">装甲・外観</h2>
          <span className="ics-heading-plate" data-plate="helm" aria-hidden="true" />
        </header>
        <Articles items={ILLUSIONCULUM_SAGA.armour} label="装甲・外観" details={{ 0: "helm" }} />
      </section>

      {/* 05 — 専用武装. */}
      <section
        id="arsenal"
        className="rxs-section ics-chapter ics-arsenal"
        aria-labelledby="ics-arsenal-title"
      >
        <header className="rxs-section-heading ics-heading rxs-reveal">
          <b className="ics-numeral" aria-hidden="true">
            05
          </b>
          <h2 id="ics-arsenal-title">専用武装</h2>
          <span className="ics-heading-plate" data-plate="orb" aria-hidden="true" />
        </header>
        <Articles
          items={ILLUSIONCULUM_SAGA.arsenal}
          label="専用武装"
          details={{ 0: "orb", 1: "legs" }}
        />
      </section>

      {/* 06 — 能力. */}
      <section
        id="abilities"
        className="rxs-section ics-chapter ics-abilities"
        aria-labelledby="ics-abilities-title"
      >
        <header className="rxs-section-heading ics-heading rxs-reveal">
          <b className="ics-numeral" aria-hidden="true">
            06
          </b>
          <h2 id="ics-abilities-title">能力</h2>
          <span className="ics-heading-plate" data-plate="reactor" aria-hidden="true" />
        </header>
        <Articles items={ILLUSIONCULUM_SAGA.abilities} label="能力" />
      </section>

      {/* 06, continued — 必殺技, each with its calls. */}
      <section
        id="finishers"
        className="rxs-section ics-chapter ics-subchapter ics-finishers"
        aria-labelledby="ics-finishers-title"
      >
        <header className="rxs-section-heading ics-heading rxs-reveal">
          <h2 id="ics-finishers-title">必殺技</h2>
        </header>
        <div className="ics-finisher-list">
          {ILLUSIONCULUM_SAGA.finishers.map((finisher, index) => (
            <article key={finisher.name} className="ics-finisher rxs-reveal" data-rank={index + 1}>
              <h3>
                <DisplayName value={finisher.name} />
              </h3>
              <Calls calls={finisher.calls} label={`${finisher.name} 発動音声`} />
              <div className="ics-prose">
                {finisher.body.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{prose(paragraph)}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="rxs-footer ics-footer" role="contentinfo">
        {/* The end card: ウルトラ with its リアクター・モア behind the last
            line (lazy; decorative). */}
        <img
          className="ics-end-figure"
          src={illusionculumCutout("ultraMore", 960)}
          alt=""
          aria-hidden="true"
          width={ILLUSIONCULUM_CUTOUT_SIZE.width}
          height={ILLUSIONCULUM_CUTOUT_SIZE.height}
          loading="lazy"
          decoding="async"
        />
        <p className="ics-footer-top">
          <a href="#top">
            <span>ページの先頭へ</span>
            <i aria-hidden="true">↑</i>
          </a>
        </p>
        <div>
          <h2>
            <DisplayName value={ultraStem} />
            <span className="ics-ultra-word">{ULTRA_WORD}</span>
          </h2>
        </div>
        <GuardedLink to="/riders/saga" assets={[]}>
          <span>仮面ライダーサーガのページへ</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
        <GuardedLink
          to="/world"
          hash="top"
          assets={WORLD_ENTER_ASSETS}
          className="rxs-footer-return"
        >
          <span>メインサイトへ戻る</span>
          <i aria-hidden="true">←</i>
        </GuardedLink>
      </footer>
    </main>
  );
}
