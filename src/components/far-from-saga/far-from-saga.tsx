import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { FINAL_STAGE_ENTER_ASSETS, WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
import { mountFarFromFonts } from "@/lib/far-from-fonts";
import { FAR_FROM_SAGA, type Article } from "@/components/final-stage/final-stage-data";
import {
  FAR_FROM_SAGA_ARTWORK,
  FAR_FROM_SAGA_STAGE_ORDER,
  FAR_FROM_SAGA_ULTRA_BASE,
  farFromImage,
  type FarFromStageKey,
} from "@/lib/far-from-saga-artwork";
import { planStageCall, type RexonanceStageEntrance } from "@/lib/rexonance-stage-call";
import { FarFromEntryTransition } from "./far-from-entry-transition";
import { FarFromComparison } from "./far-from-comparison";
import { FarFromP16 } from "./far-from-p16";
import { FarFromReport } from "./far-from-report";
import { FarFromSuitUp } from "./far-from-suitup";
import { FarFromFormComparison } from "./far-from-form-comparison";
import { FAR_FROM_STAGE_CALL_MS, FarFromFormCall, FarFromSwitchFx } from "./far-from-stage-switch";
import { FarFromInterfaceDeploy } from "./far-from-ultra-deploy";
import { FarFromAperture, FarFromChapterMap, FarFromHeroRail } from "./far-from-editorial";

/* FAR FROM SAGA special site (owner's record of 2026-10-22; redesigned on
   the Rexonance / Extreme structure, 2026-10-22).

   The third special site beside /extreme-saga and /rexonance-saga, built
   on their composition: the local bar with numbered chapters, a split hero
   (the key visual in its stage with a slate and read-outs, the copy and its
   two doors beside it), the CONTENTS map, then numbered chapters whose
   heads carry a forged numeral, an etched kicker, the title and its lede
   over a hairline, and the end card with the figure standing behind the
   last line. Every word of record is the Final Stage's own
   (final-stage-data.ts, verbatim from the owner); the stage pictures are
   this site's (far-from-saga-artwork.ts). The shared special-site grammar
   (styles-rexonance-saga.css and the showcase sheets) draws the chrome;
   styles-far-from-saga.css is the page's own composition, type and motion.

   Chapters, as the Rexonance order goes (performance → processor →
   suit-up → stages → system) with the record's own chapters around them:
   01 overview (+ the calls), 02 specs, 03 performance (the console, then
   #report, the owner's two documents, as its second half), 04 P16,
   05 suit-up (ending on the form chosen right after its runway, ウルトラ
   included), 06 stages, 07 mechanism, 08 armour and OS, 09 authority,
   10 weapons, 11 finishers — and since 2026-10-23 (owner: 「サイトの構造も
   レクソナンス準拠にして」) grouped as the Rexonance site's five chapters:
   01 overview (specs, performance, #report as its sub-chapters), 02 P16,
   03 suit-up with the form selector, 04 stages, 05 system (the mechanism,
   then armour and OS, authority, weapons and finishers as sub-chapters).
   The numerals are CSS counters over the page's direct sections; a
   sub-chapter (.ffs-subchapter) keeps its chapter's number.

   #performance (far-from-comparison.tsx), #report (far-from-report.tsx)
   and #p16 (far-from-p16.tsx) are built from the owner's comparison text
   (far-from-report-text.ts, verbatim). #suitup is the scroll suit-up
   (far-from-suitup.tsx: the Rexonance runway playing FAR FROM's suit
   through src/lib/far-from-assembly.ts, ending on the form chosen in its
   selector — the page's stage, as on the Rexonance page; owner,
   2026-10-23). The page-entry transformation is
   far-from-entry-transition.tsx. Every engine is a lazy chunk mounted after
   paint, only where motion is allowed; nothing here delays first paint:
   the chapter reveals are one IntersectionObserver armed after mount, and
   only where motion is allowed. */

const releaseControlFocus = (control: HTMLElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
};

/** Whether a form switch may move (the Rexonance page's terms): not hidden,
 * no reduced motion, no forced colours, no economy, no Save-Data, no 2G. */
function stageMotionAllowed() {
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

/** A deep link to one form: /far-from-saga#stages-ultra (and the others). */
const STAGE_LINK = /^#stages-(middle|high|xhigh|max|ultra)$/;

/** Values that run long (the processors, the recognisers) read a size down. */
const LONG_SPEC = 12;

function CallOuts({ calls, label }: { calls: readonly string[]; label: string }) {
  return (
    <div className="ffs-calls" role="list" aria-label={label}>
      {calls.map((call, index) => (
        <b key={`${call}-${index}`} role="listitem">
          {call}
        </b>
      ))}
    </div>
  );
}

/** The record's articles (theories, armour and OS, authority): plates, each
 * marked by its numeral alone (owner, 2026-10-23: no secondary labels — the
 * "CORE 01" codes that restated the numeral went). */
function Articles({
  items,
  columns,
  label,
}: {
  items: readonly Article[];
  columns: 2 | 3;
  label: string;
}) {
  return (
    <div className={`ffs-articles ffs-articles-${columns}`} role="list" aria-label={label}>
      {items.map((item, index) => (
        <article key={item.title} className="rxs-reveal" role="listitem">
          <header aria-hidden="true">
            <span>{String(index + 1).padStart(2, "0")}</span>
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

export function FarFromSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  // The page's one form state (owner, 2026-10-23): the selector after the
  // suit-up's runway, #stages' rail and the comparison all choose it, and
  // the runway ends on it (as the Rexonance page's stage does).
  const [stage, setStageState] = useState<FarFromStageKey>("middle");
  const [motionReady, setMotionReady] = useState(false);
  const pageRef = useRef<HTMLElement | null>(null);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const stagePanelRef = useRef<HTMLDivElement | null>(null);

  // The form switch (owner, 2026-10-23: 「これらの切り替えもレクソナンスの様な
  // 切り替え効果が出る様にして。スクロールも同様に。」): the Rexonance page's
  // card and entrance (far-from-stage-switch.tsx), on its rest guard.
  const [stageCall, setStageCall] = useState<{ id: number; stage: FarFromStageKey } | null>(null);
  const [stageEntrance, setStageEntrance] = useState<RexonanceStageEntrance | null>(null);
  const latestStageRef = useRef<FarFromStageKey>("middle");
  const stageCallId = useRef(0);
  const stageCallTimer = useRef(0);
  const stageCallStartedAt = useRef(0);
  const stageCallExitedAt = useRef(Number.NEGATIVE_INFINITY);
  // The panel's place on screen before a switch (null when it is off screen).
  const panelAnchor = useRef<number | null>(null);

  const cancelStageCall = useCallback(() => {
    stageCallId.current += 1;
    window.clearTimeout(stageCallTimer.current);
    stageCallTimer.current = 0;
    setStageCall(null);
  }, []);

  /** Every form change goes through here. `card` is the rail's and the
   * comparison drawer's (the Rexonance card and entrance); the selector
   * after the runway and a deep link change the form quietly. */
  const selectStage = useCallback(
    (next: FarFromStageKey, card = true) => {
      // initRail emits railselect from a native click before React's onClick;
      // this synchronous ref also makes rapid swipes last-request-wins.
      if (latestStageRef.current === next) return;
      latestStageRef.current = next;
      // No switch moves the page (owner, 2026-10-23: 「『03 形態』でウルトラ
      // 切り替え時のみ勝手に画面が上下するのも修正して。」): note where the
      // panel stands; the layout effect below keeps it there.
      const panel = stagePanelRef.current?.getBoundingClientRect();
      panelAnchor.current =
        panel && panel.bottom > 0 && panel.top < window.innerHeight ? panel.top : null;
      const motionAllowed = stageMotionAllowed();
      if (!card) {
        cancelStageCall();
        setStageState(next);
        setStageEntrance(motionAllowed ? { kind: "quiet", delayMs: 0 } : null);
        return;
      }
      const now = performance.now();
      const plan = planStageCall({
        motionAllowed,
        cardMounted: stageCallTimer.current !== 0,
        cardElapsedMs: now - stageCallStartedAt.current,
        sinceNaturalExitMs: now - stageCallExitedAt.current,
      });
      setStageState(next);
      setStageEntrance(motionAllowed ? plan.entrance : null);
      if (plan.action === "retarget") {
        setStageCall((call) => call && { id: call.id, stage: next });
        return;
      }
      if (plan.action === "skip") {
        if (!motionAllowed) {
          cancelStageCall();
          stageCallExitedAt.current = Number.NEGATIVE_INFINITY;
        }
        return;
      }
      cancelStageCall();
      const id = stageCallId.current;
      stageCallStartedAt.current = now;
      setStageCall({ id, stage: next });
      stageCallTimer.current = window.setTimeout(() => {
        if (stageCallId.current === id) {
          stageCallTimer.current = 0;
          stageCallExitedAt.current = performance.now();
          setStageCall(null);
        }
      }, FAR_FROM_STAGE_CALL_MS);
    },
    [cancelStageCall],
  );
  const chooseQuietly = useCallback(
    (next: FarFromStageKey) => selectStage(next, false),
    [selectStage],
  );

  // The panel keeps its place through a switch. Its own height is reserved
  // (every form's copy sizes its cell, below), but the selector after the
  // runway, above it, grows for ウルトラ's note; where the browser has no
  // scroll anchoring (Safari) that pushed the page down and back. Measured
  // after the commit and before paint, so nothing is ever seen to move.
  useLayoutEffect(() => {
    const before = panelAnchor.current;
    panelAnchor.current = null;
    const panel = stagePanelRef.current;
    if (before === null || !panel) return;
    const delta = panel.getBoundingClientRect().top - before;
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }, [stage]);

  // A card never outlives the terms it was shown on (as on the Rexonance page).
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelOnPreference = () => {
      if (media.matches || document.documentElement.dataset.worldEffects === "economy")
        cancelStageCall();
    };
    const cancelWhenHidden = () => {
      if (document.hidden) cancelStageCall();
    };
    const observer = new MutationObserver(cancelOnPreference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-world-effects"],
    });
    media.addEventListener("change", cancelOnPreference);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    window.addEventListener("pagehide", cancelStageCall);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", cancelOnPreference);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      window.removeEventListener("pagehide", cancelStageCall);
      stageCallId.current += 1;
      window.clearTimeout(stageCallTimer.current);
    };
  }, [cancelStageCall]);

  // A deep link to one form (#stages-ultra …) selects it and opens #stages;
  // ウルトラ's interfaces then deploy as the panel comes on screen.
  useEffect(() => {
    const follow = () => {
      const match = STAGE_LINK.exec(window.location.hash);
      if (!match) return;
      selectStage(match[1] as FarFromStageKey, false);
      window.requestAnimationFrame(() =>
        document.getElementById("stages")?.scrollIntoView({ block: "start" }),
      );
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [selectStage]);

  const activeStage = FAR_FROM_SAGA.stages[stage];
  // ウルトラ shows its base first and deploys its interfaces where motion is
  // allowed; the calm tiers keep the painted ウルトラ (interfaces drawn).
  const ultraDeploys = stage === "ultra" && motionReady && stageMotionAllowed();
  const artKey = ultraDeploys ? "ultraBase" : stage;
  const activeArt = ultraDeploys ? FAR_FROM_SAGA_ULTRA_BASE : FAR_FROM_SAGA_ARTWORK[stage];
  const keyVisual = FAR_FROM_SAGA_ARTWORK.middle;

  useEffect(() => mountLocalNavCurrent(pageRef.current?.querySelector(".rxs-local-nav nav")), []);

  // The Japanese display face, applied after paint (src/lib/far-from-fonts.ts).
  useEffect(() => mountFarFromFonts(pageRef.current), []);

  // The liquid rail owns tap, long-press, drag and keyboard selection; React
  // only mirrors the chosen index back into state.
  useEffect(() => {
    const rail = stageTabsRef.current;
    if (!rail) return;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const next = typeof index === "number" ? FAR_FROM_SAGA_STAGE_ORDER[index] : undefined;
      if (next) selectStage(next);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    return () => {
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, [selectStage]);

  // In step with a swipe (「スクロールも同様に」): while the lens is dragged,
  // the figure shows the form under it — a band in that form's light that
  // follows the lens along the rail, and its name. The rail's own state
  // drives it (data-liquid-dragging, the lens's place, data-liquid-contact);
  // the release selects, and the card plays as for a tap.
  useEffect(() => {
    const rail = stageTabsRef.current;
    const panel = stagePanelRef.current;
    if (!rail || !panel) return;
    const lens = rail.querySelector<HTMLElement>(":scope > .liquid-selection-lens");
    let shown: string | null = null;
    const sync = () => {
      const tabs = [...rail.querySelectorAll<HTMLElement>(':scope > button[role="tab"]')];
      const contact = tabs.findIndex((tab) => tab.hasAttribute("data-liquid-contact"));
      const key = FAR_FROM_SAGA_STAGE_ORDER[contact];
      if (
        rail.dataset.liquidDragging !== "true" ||
        !key ||
        key === latestStageRef.current ||
        !stageMotionAllowed()
      ) {
        if (shown !== null) delete panel.dataset.tune;
        shown = null;
        return;
      }
      const travel = rail.clientWidth - (lens?.offsetWidth ?? 0);
      const lensX = lens ? new DOMMatrixReadOnly(getComputedStyle(lens).transform).m41 : 0;
      const along = travel > 0 ? lensX / travel : contact / (tabs.length - 1);
      panel.style.setProperty("--ffs-tune-x", Math.min(1, Math.max(0, along)).toFixed(3));
      if (shown === key) return;
      shown = key;
      panel.dataset.tune = key;
      panel.style.setProperty("--ffs-tune-accent", FAR_FROM_SAGA.stages[key].accent);
      const label = panel.querySelector(".ffs-stage-tune > b");
      if (label) label.textContent = FAR_FROM_SAGA.stages[key].label;
    };
    const observer = new MutationObserver(sync);
    observer.observe(rail, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-liquid-dragging", "data-liquid-contact", "style"],
    });
    return () => {
      observer.disconnect();
      delete panel.dataset.tune;
    };
  }, []);

  // A choice made by another control (the suit-up's selector, the
  // comparison) moves this rail's lens too (the Rexonance page's F57).
  useEffect(() => {
    stageTabsRef.current?.dispatchEvent(new Event("liquidrelayout"));
  }, [stage]);

  // The chapter reveals (as on the Extreme site): armed after paint, only
  // where motion is allowed; otherwise everything rests fully drawn. The
  // page grants motion (data-motion-ready) only on the same terms, so the
  // shared scroll choreography never runs under reduced motion, economy
  // rendering or a saving connection.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forced = window.matchMedia("(forced-colors: active)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const constrained =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";
    const allowMotion =
      !media.matches &&
      !forced.matches &&
      !constrained &&
      document.documentElement.dataset.worldEffects !== "economy";

    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!allowMotion || !("IntersectionObserver" in window)) {
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

  return (
    <main
      ref={pageRef}
      id="top"
      className="rxs-page ffs-page"
      data-motion-ready={motionReady ? "true" : "false"}
    >
      {/* Entry transition: prepared, renders nothing, never blocks paint. */}
      <FarFromEntryTransition stage={stage} />
      {/* The form switch's card (far-from-stage-switch.tsx; decorative). */}
      {stageCall ? <FarFromFormCall key={stageCall.id} stage={stageCall.stage} /> : null}

      <header className="rxs-local-nav">
        <div className="rxs-local-nav-inner">
          <GuardedLink
            className="rxs-brand"
            to="/world"
            hash="top"
            assets={WORLD_ENTER_ASSETS}
            aria-label="ディセプションワールドへ戻る"
          >
            <span lang="en">FAR FROM</span>
            <b>
              <DisplayName value={FAR_FROM_SAGA.name} />
            </b>
          </GuardedLink>
          {/* The bar lists the five chapters, numbered as CONTENTS numbers
              them (the Rexonance site's bar, owner 2026-10-23); a chapter
              stays lit through its sub-chapters. The side menu lists every
              section. */}
          <nav aria-label="ファーフロムサーガ ページ内ナビゲーション">
            <a href="#overview" data-local-nav-through="specs performance report">
              <span aria-hidden="true">01</span> 概要
            </a>
            <a href="#p16">
              <span aria-hidden="true">02</span> P16
            </a>
            <a href="#suitup" data-local-nav-through="far-from-assembly-runway">
              <span aria-hidden="true">03</span> 変身
            </a>
            <a href="#stages">
              <span aria-hidden="true">04</span> 形態
            </a>
            <a href="#theories" data-local-nav-through="system authority arsenal finishers">
              <span aria-hidden="true">05</span> 機構
            </a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="far-from" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="rxs-hero ffs-hero" aria-labelledby="ffs-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        {/* Owner (2026-10-23): no secondary labels — the name leads the copy
            (no eyebrow, no Latin duplicate: the FAR FROM ghost behind it is
            the Latin mark), the five forms run on one etched line, and the
            stage holds the figure alone (no slate, no read-outs: the spec
            table below is the record). */}
        <div className="rxs-hero-copy">
          <h1 id="ffs-title">
            <DisplayName value={FAR_FROM_SAGA.name} />
          </h1>
          <p className="rxs-hero-lede">
            <span className="rxs-hero-lede-text">
              <span>どこまで離れても、この拳の一部だ。</span>
              <span>ファイナルステージ限定の超究極フォーム、仮面ライダーファーフロムサーガ。</span>
            </span>
          </p>
          <p className="ffs-stages-line">{FAR_FROM_SAGA.stagesLine}</p>
          <FarFromHeroRail />
          {/* The name's ghost behind the copy (decorative). */}
          <span className="ffs-mark" aria-hidden="true">
            FAR FROM
          </span>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <FarFromAperture />
          <i className="ffs-ring is-ice" />
          <i className="ffs-ring is-gold" />
          <i className="ffs-ring is-violet" />
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <img
            src={keyVisual.src}
            {...farFromImage("middle")}
            alt=""
            width={keyVisual.width}
            height={keyVisual.height}
            decoding="async"
            fetchPriority="high"
          />
        </div>
        {/* The cue is its line: the way down; its words name it for
            assistive tech only (as on the Rexonance page). */}
        <a className="rxs-scroll-cue" href="#overview">
          <span className="visually-hidden">まず、概要から。</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <FarFromChapterMap />

      {/* 01 — the calls and the record's overview. */}
      <section
        id="overview"
        className="rxs-section ffs-overview"
        aria-labelledby="ffs-overview-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-overview-title">届かない<wbr />距離は、<wbr />もう<wbr />無い。</h2>
        </header>
        <CallOuts calls={FAR_FROM_SAGA.calls} label="ファーフロムサーガ 変身音声" />
        <div className="ffs-copy rxs-reveal">
          {FAR_FROM_SAGA.overview.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      {/* 01, continued — the spec table, as plates. */}
      <section
        id="specs"
        className="rxs-section ffs-specs-section ffs-subchapter"
        aria-labelledby="ffs-specs-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-specs-title">数字が、<wbr />追いつかない。</h2>
          <span>標準稼働時の数値です。</span>
        </header>
        <dl className="ffs-specs rxs-reveal" aria-label="ファーフロムサーガ スペック">
          {FAR_FROM_SAGA.specs.map((row) => (
            <div key={row.dt} data-long={row.dd.length > LONG_SPEC || undefined}>
              <dt>{row.dt}</dt>
              <dd>{row.dd}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 01, continued — #performance: the comparison console (far-from-comparison.tsx). */}
      <section
        id="performance"
        className="rxs-section ffs-performance ffs-subchapter"
        aria-labelledby="ffs-performance-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-performance-title">レクソナンス？<wbr />通過点だ。</h2>
        </header>
        <FarFromComparison />
      </section>

      {/* 01, continued — #report: the owner's comparison text in full
          (far-from-report.tsx). A sub-chapter: it keeps 01's number. */}
      <section
        id="report"
        className="rxs-section ffs-report-section ffs-subchapter"
        aria-labelledby="ffs-report-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-report-title">差は、<wbr />桁で<wbr />見せる。</h2>
        </header>
        <FarFromReport />
      </section>

      {/* 02 — #p16: the owner's two P16 chapters (far-from-p16.tsx). */}
      <section id="p16" className="rxs-section ffs-p16" aria-labelledby="ffs-p16-title">
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-p16-title">韋駄天？<wbr />遅過ぎる</h2>
        </header>
        <FarFromP16 />
      </section>

      {/* 03 — #suitup: the scroll suit-up (far-from-suitup.tsx), ending on
          the form chosen in the selector right after its runway. */}
      <FarFromSuitUp stage={stage} onChoose={chooseQuietly} />

      {/* 04 — the five forms. */}
      <section id="stages" className="rxs-stages rxs-section" aria-labelledby="ffs-stages-title">
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-stages-title">選べ。<wbr />どこまで<wbr />遠くへ<wbr />行くか。</h2>
        </header>

        <div className="rxs-stage-switcher rxs-reveal">
          <div
            ref={stageTabsRef}
            className="rxs-stage-tabs liquid-swipe-tabs ffs-stage-tabs"
            role="tablist"
            aria-label="ファーフロムサーガの形態段階"
            aria-describedby="ffs-stage-hint"
            data-liquid-glass="true"
            data-stage={stage}
          >
            <LiquidLens />
            {FAR_FROM_SAGA_STAGE_ORDER.map((key) => (
              <button
                key={key}
                id={`ffs-stage-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={stage === key}
                aria-controls="ffs-stage-panel"
                tabIndex={stage === key ? 0 : -1}
                className={stage === key ? "is-active" : ""}
                style={{ ["--liquid-accent" as string]: FAR_FROM_SAGA.stages[key].accent }}
                onClick={() => selectStage(key)}
                onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
              >
                <span>{FAR_FROM_SAGA.stages[key].label}</span>
              </button>
            ))}
          </div>
          {/* The rail says what it is; its gestures stay named for assistive
              tech (owner, 2026-10-23: no secondary labels). */}
          <p id="ffs-stage-hint" className="rxs-stage-hint visually-hidden">
            タップ・長押し・左右スライド・矢印キーで切り替え
          </p>

          <div
            ref={stagePanelRef}
            id="ffs-stage-panel"
            className="rxs-stage-panel ffs-stage-panel"
            role="tabpanel"
            aria-labelledby={`ffs-stage-tab-${stage}`}
            aria-live="polite"
            data-entrance={stageEntrance?.kind}
            style={{
              ["--ffs-accent" as string]: activeStage.accent,
              ["--ffs-entrance-delay" as string]: `${stageEntrance?.delayMs ?? 0}ms`,
            }}
          >
            {/* Keyed by form: every switch mounts a fresh figure, so its
                arrival (and ウルトラ's deploy) plays again each time. */}
            <figure key={stage} data-art={artKey}>
              <span aria-hidden="true" />
              <i className="ffs-stage-scan" aria-hidden="true" />
              {/* The picture and ウルトラ's interfaces share one box (and its
                  scroll settle), so the panels stay on the arms. */}
              <div className="ffs-stage-art">
                <img
                  src={activeArt.src}
                  {...farFromImage(artKey, stage !== "middle")}
                  alt={activeStage.alt}
                  width={activeArt.width}
                  height={activeArt.height}
                  // ミドル is the hero's own file, already decoded by now.
                  loading={stage === "middle" ? "eager" : "lazy"}
                  decoding="async"
                />
                {ultraDeploys ? (
                  <FarFromInterfaceDeploy
                    delayMs={stageEntrance?.kind === "card" ? stageEntrance.delayMs + 260 : 160}
                  />
                ) : null}
              </div>
              <FarFromSwitchFx />
            </figure>
            <div key={`${stage}-copy`} className="ffs-stage-copy">
              <h3>{activeStage.label}</h3>
              {activeStage.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {/* The form's name, outlined and huge (decorative; katakana
                  only, as every label naming a form). */}
              <i className="ffs-form-code" aria-hidden="true">
                {activeStage.label}
              </i>
            </div>
            {/* The copy's cell is as tall as the longest form's, at every
                width (hidden copies, stacked in the same cell), so no switch
                changes the panel's height. */}
            {FAR_FROM_SAGA_STAGE_ORDER.map((key) => (
              <div key={`sizer-${key}`} className="ffs-stage-sizer" aria-hidden="true" inert>
                <h3>{FAR_FROM_SAGA.stages[key].label}</h3>
                {FAR_FROM_SAGA.stages[key].body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
        <FarFromFormComparison selected={stage} onChoose={selectStage} />
      </section>

      {/* 05 — the system: the four theories, then the armour and OS, the
          authorities, the weapons and the finishers as its sub-chapters (the
          Rexonance site's 05 SYSTEM). */}
      <section
        id="theories"
        className="rxs-section ffs-theories"
        aria-labelledby="ffs-theories-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-theories-title">離れた<wbr />力を、<wbr />一つの<wbr />拳に。</h2>
        </header>
        <Articles items={FAR_FROM_SAGA.theories} columns={2} label="新規理論・中核機構" />
      </section>

      {/* 05, continued — the floating unit and the OS. */}
      <section
        id="system"
        className="rxs-section ffs-system ffs-subchapter"
        aria-labelledby="ffs-system-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-system-title">鎧も<wbr />頭脳も、<wbr />最終版。</h2>
        </header>
        <Articles
          items={[FAR_FROM_SAGA.bits, FAR_FROM_SAGA.os]}
          columns={2}
          label="装甲・浮遊ユニットと統合OS"
        />
      </section>

      {/* 05, continued — the authorities. */}
      <section
        id="authority"
        className="rxs-section ffs-authority ffs-subchapter"
        aria-labelledby="ffs-authority-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-authority-title">究極が<wbr />極まる</h2>
        </header>
        <Articles items={FAR_FROM_SAGA.powers} columns={2} label="能力" />
      </section>

      {/* 05, continued — the weapons, numbered. */}
      <section
        id="arsenal"
        className="rxs-section ffs-arsenal ffs-subchapter"
        aria-labelledby="ffs-arsenal-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-arsenal-title">届く<wbr />場所すべてが、<wbr />射程。</h2>
        </header>
        <ul className="ffs-weapons rxs-reveal" aria-label="ファーフロムサーガ 追加武装">
          {FAR_FROM_SAGA.arsenal.map((weapon, index) => (
            <li key={weapon}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {weapon}
            </li>
          ))}
        </ul>
        <p className="ffs-note ffs-arsenal-note">{FAR_FROM_SAGA.arsenalNote}</p>
      </section>

      {/* 05, continued — the finishers. */}
      <section
        id="finishers"
        className="rxs-section ffs-finishers ffs-subchapter"
        aria-labelledby="ffs-finishers-title"
      >
        <header className="rxs-section-heading rxs-reveal">
          <h2 id="ffs-finishers-title">終幕は、<wbr />彼方から。</h2>
        </header>
        <div className="ffs-finisher-list">
          {FAR_FROM_SAGA.finishers.map((finisher) => (
            <article key={finisher.name} className="ffs-finisher rxs-reveal">
              <h3>{finisher.name}</h3>
              <CallOuts calls={finisher.calls} label={`${finisher.name} 発動音声`} />
              <div className="ffs-copy">
                {finisher.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="rxs-footer ffs-footer" role="contentinfo">
        {/* The end card: ウルトラ stands behind the last line (lazy; decorative). */}
        <img
          className="ffs-end-figure"
          src={FAR_FROM_SAGA_ARTWORK.ultra.src}
          srcSet={farFromImage("ultra").srcSet}
          sizes="(max-width: 760px) 70vw, 36vw"
          alt=""
          aria-hidden="true"
          width={FAR_FROM_SAGA_ARTWORK.ultra.width}
          height={FAR_FROM_SAGA_ARTWORK.ultra.height}
          loading="lazy"
          decoding="async"
        />
        {/* Back to this page's own top: first in the end card, so its closing
            row still ends on the way home. */}
        <p className="ffs-footer-top">
          <a href="#top">
            <span>ページの先頭へ</span>
            <i aria-hidden="true">↑</i>
          </a>
        </p>
        <div>
          <h2>
            ファーフロムサーガの活躍は、
            <br />
            ファイナルステージで。
          </h2>
        </div>
        <GuardedLink to="/final-stage" hash="far-from-saga" assets={FINAL_STAGE_ENTER_ASSETS}>
          <span>ファイナルステージへ</span>
          <i aria-hidden="true">↗</i>
        </GuardedLink>
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
