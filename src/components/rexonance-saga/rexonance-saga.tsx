import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import { RexonanceCallSequence } from "./rexonance-call-sequence";
import { RexonanceAperture } from "./rexonance-aperture";
import {
  REXONANCE_ENTRY_CALLS,
  REXONANCE_STAGE_DURATION_MS,
  type RexonanceStage,
  REXONANCE_SUIT_DRIVER,
  REXONANCE_ENTRY_TIMINGS,
} from "@/lib/rexonance-calls";
import { planStageCall, type RexonanceStageEntrance } from "@/lib/rexonance-stage-call";
import { GuardedLink } from "@/components/load-gate";
import { DisplayName } from "@/components/name-text";
import { LiquidLens } from "@/components/world/liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { useWorldMode } from "@/components/world/use-world-mode";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import { initRail } from "@/lib/liquid/boot.js";
import {
  ASSEMBLY_PARTS,
  mountRexonanceAssembly,
  mountRexonanceResonance,
  type RexonanceAssemblyConfig,
} from "@/lib/rexonance-resonance.js";
import { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } from "@/lib/rexonance-suit-gold";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_FACE_GLOW,
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_GOLD_ATLAS,
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
  REXONANCE_SUIT_UNDERSUIT,
} from "@/lib/rexonance-suit";
import { rexonanceImage } from "@/lib/rexonance-images";
import { REXONANCE_FORM_FIGURES, REXONANCE_FORM_PAD } from "@/lib/rexonance-forms";
import { REXONANCE_SUIT_BASE, REXONANCE_SUIT_ORNAMENTS } from "@/lib/rexonance-suit-base";
import {
  FORM_CHANGE_MS,
  FORM_LANDMARKS,
  FORM_TONES,
  drawOverwrite,
  planOverwrite,
  sampleCells,
  warpPicture,
} from "@/lib/rexonance-overwrite.js";
import { autoSizedImageRef } from "@/lib/auto-sized-image";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";
import { supportsIOS27Enhancements } from "@/lib/rendering-profile";
import { warmRexonanceStages } from "@/lib/warm-rexonance-stages";
import { mountLocalNavCurrent } from "@/lib/local-nav-current";
import { syncRexonanceRouteCover } from "@/lib/rexonance-route-cover";
import { releasePendingImage, releasePendingImages } from "@/lib/release-pending-images";

type P14Baseline = "p1" | "p2";
type PerformanceBaseline = "vertex" | "vinculum" | "extreme";

const p14ImageRef = autoSizedImageRef(rexonanceImage("/rexonance-p14-core.jpg", true).sizes!);

const STAGES: Record<
  RexonanceStage,
  {
    label: string;
    code: string;
    image: string;
    alt: string;
    title: string;
    /** One paragraph, or several (EXCELSIOR's 概要). */
    lede: string | readonly string[];
    points: readonly string[];
    accent: string;
  }
> = {
  standard: {
    label: "レクソナンス",
    code: "HIGH",
    image: REXONANCE_SITE_ARTWORK.standard,
    alt: "仮面ライダーレクソナンスサーガの全身ビジュアル",
    title: "無限出力が、平常運転。",
    lede: "精神的変化に伴う著しい適正値上昇によって第五の犬として完全覚醒した悠真が、自身に備わる『終焉』を完全制御した姿です。",
    points: ["終焉の完全制御", "自己共鳴型システム", "標準カタログ値を公開"],
    accent: "#63e2ff",
  },
  max: {
    label: "マックス",
    code: "MAX",
    image: REXONANCE_SITE_ARTWORK.max,
    alt: "仮面ライダーレクソナンスサーガ・マックスの全身ビジュアル",
    title: "神飾まで、武器になる。",
    lede: "P14を完全加速し、全神飾を攻撃用機構へ次々に組み込みます。動作の途中でも必要な部位へ何度も出力を移し替え、攻撃限界を拡張します。",
    points: ["P14完全加速", "SCALER《MAX》", "出力の連続再配分"],
    accent: "#969cff",
  },
  ultra: {
    label: "ウルトラ",
    code: "ULTRA 60s",
    image: REXONANCE_SITE_ARTWORK.ultra,
    alt: "仮面ライダーレクソナンスサーガ・ウルトラの全身ビジュアル",
    // Two keep-all phrases that break at their 、 on iPhone Safari, so this
    // title needs no break marker; renderStageTitle still turns a zero-width
    // marker into <wbr /> for any future title (rx2/COPY2.md C5).
    title: "終焉の全出力を、一動作に。",
    lede: "悠真自身が完全制御する『終焉』を対象へ限定し、空間崩壊を防ぎながら、身体、武装、リアクター、全演算と出力を60秒間、一動作へ集中します。",
    points: ["単一実在収束", "SCALER《ULTRA》", "60秒間の最上位状態"],
    accent: "#ff72da",
  },
  // Owner (2026-10-11/12): above ULTRA, also 60 s. The lede is a summary
  // of the owner's 概要, as the owner asked ("説明は端折って要約した物を").
  excelsior: {
    label: "エクセルシア",
    code: "EXCELSIOR 60s",
    image: REXONANCE_SITE_ARTWORK.excelsior,
    alt: "仮面ライダーレクソナンスサーガ・エクセルシアの全身ビジュアル",
    // Zero-width markers (renderStageTitle → <wbr />) only: it breaks at its words.
    title: "仮面ライダー\u200Bレクソナンスサーガ・\u200Bエクセルシア",
    lede: "レクソナンスサーガの《超自己進化》が生んだ新たな構造を、REALMSの科学者『フェイブル』が独立した強化形態として完成させた、ウルトラを超える到達点。最大稼働時間は同じく60秒間。",
    points: ["《超自己進化》", "フェイブルの技術", "最大稼働時間60秒間"],
    accent: "#7dffb8",
  },
};

// The forms the page shows (owner, 2026-10-12: EXCELSIOR withdrawn; its
// data and art stay for later).
const SHOWN_STAGES: RexonanceStage[] = ["standard", "max", "ultra"];

const PERFORMANCE_BASELINES: Record<
  PerformanceBaseline,
  {
    label: string;
    code: string;
    metrics: readonly {
      label: string;
      current: string;
      previous: string;
      relative: string;
      multiplier: string;
      delta: string;
      note?: string;
      bar: number;
    }[];
    processing: {
      baseline: readonly string[];
      rexonance: readonly string[];
      verdict: string;
    };
  }
> = {
  vertex: {
    label: "ヴァーテックス",
    code: "VERTEX STANDARD",
    metrics: [
      {
        label: "パンチ力",
        current: "372.2t",
        previous: "68.0t",
        relative: "547.4%",
        multiplier: "5.47倍",
        delta: "+447.4%",
        bar: 18.3,
      },
      {
        label: "キック力",
        current: "483.5t",
        previous: "172.4t",
        relative: "280.5%",
        multiplier: "2.80倍",
        delta: "+180.5%",
        bar: 35.7,
      },
      {
        label: "ジャンプ力",
        current: "6000m",
        previous: "100.0m",
        relative: "6000%",
        multiplier: "60.0倍",
        delta: "+5900%",
        bar: 1.7,
      },
      {
        label: "走力（100m）",
        current: "0.00021秒",
        previous: "0.6秒",
        relative: "285,714.3%",
        multiplier: "約2857.14倍",
        delta: "+285,614.3%",
        note: "所要時間 約99.97%短縮",
        bar: 0.04,
      },
    ],
    processing: {
      baseline: ["50,000〜TOPS / 200Core", "URANUS X", "TAMAYURA X（アクセラレータ）", "P1"],
      rexonance: ["50,000〜YOPS / ∞Core · KHAOS DeuX", "9,000TOPS / 300Core · KOSMOS DeuX", "P14"],
      verdict:
        "URANUS XのTOPS値とKHAOS DeuXのYOPS値は単位・演算系統が異なります。KOSMOS DeuXを含めた総合演算倍率への単純換算は行わず、公開スペックを並列表示しています。",
    },
  },
  vinculum: {
    label: "ヴィンクルム",
    code: "VINCULUM STANDARD",
    metrics: [
      {
        label: "パンチ力",
        current: "372.2t",
        previous: "98.8t（est.）",
        relative: "376.7%",
        multiplier: "3.77倍",
        delta: "+276.7%（推定値比）",
        bar: 26.5,
      },
      {
        label: "キック力",
        current: "483.5t",
        previous: "198.8t（est.）",
        relative: "243.2%",
        multiplier: "2.43倍",
        delta: "+143.2%（推定値比）",
        bar: 41.1,
      },
      {
        label: "ジャンプ力",
        current: "6000m",
        previous: "5000.0m（est.）",
        relative: "120.0%",
        multiplier: "1.20倍",
        delta: "+20.0%（推定値比）",
        bar: 83.3,
      },
      {
        label: "走力（100m）",
        current: "0.00021秒",
        previous: "0.1秒（est.）",
        relative: "47,619.0%",
        multiplier: "約476.19倍",
        delta: "+47,519.0%（推定値比）",
        note: "所要時間 99.79%短縮",
        bar: 0.21,
      },
    ],
    processing: {
      baseline: [
        "10,000YOPS / 500Core · KHAOS",
        "300TOPS / 300Core · KOSMOS",
        "P2",
        "Paranormal Realizer Pro",
        "Neural Resonancer Pro",
      ],
      rexonance: [
        "50,000〜YOPS / ∞Core · KHAOS DeuX",
        "9,000TOPS / 300Core · KOSMOS DeuX",
        "P14",
        "Paranormal Realizer Ultra",
        "Neural Resonancer Ultra",
      ],
      verdict:
        "基準値比ではKHAOS系YOPSが5.0倍、KOSMOS系TOPSが30.0倍です。KHAOSの50,000YOPSは標準稼働時の基準値で、固定された最大性能を示しません。Core数と補助機構は構成差として併記し、異なる指標を一つの倍率へ合算していません。",
    },
  },
  extreme: {
    label: "エクスプリーム",
    code: "EXTREME STANDARD",
    metrics: [
      {
        label: "パンチ力",
        current: "372.2t",
        previous: "205.6t〜",
        relative: "181.0%",
        multiplier: "1.81倍",
        delta: "+81.0%",
        bar: 55.2,
      },
      {
        label: "キック力",
        current: "483.5t",
        previous: "308.9t〜",
        relative: "156.5%",
        multiplier: "1.57倍",
        delta: "+56.5%",
        bar: 63.9,
      },
      {
        label: "ジャンプ力",
        current: "6000m",
        previous: "1033.5m",
        relative: "580.6%",
        multiplier: "5.81倍",
        delta: "+480.6%",
        bar: 17.2,
      },
      {
        label: "走力（100m）",
        current: "0.00021秒",
        previous: "0.002秒",
        relative: "952.4%",
        multiplier: "9.52倍",
        delta: "+852.4%",
        note: "所要時間 89.5%短縮",
        bar: 10.5,
      },
    ],
    processing: {
      baseline: ["20,000YOPS / ∞Core · KHAOS Ultra", "5,000TOPS / 300Core · KOSMOS Ultra"],
      rexonance: ["50,000〜YOPS / ∞Core · KHAOS DeuX", "9,000TOPS / 300Core · KOSMOS DeuX", "P14"],
      verdict:
        "基準値比ではKHAOS系YOPSが2.5倍、KOSMOS系TOPSが1.8倍です。KHAOSの50,000YOPSは標準稼働時の基準値で、固定された最大性能を示しません。YOPSとTOPSを合算した総合倍率には換算していません。",
    },
  },
};

const P14_METRICS = [
  {
    label: "同じエーテル量で発揮する性能",
    p1: "100%",
    p2: "180%",
    p14: "900%",
    relative: { p1: "900%", p2: "650%" },
    delta: { p1: "9.0倍 / +800%", p2: "6.5倍 / +550%" },
    deltaLabel: "性能向上",
  },
  {
    label: "実効変換率",
    p1: "10%",
    p2: "18%",
    p14: "90%",
    relative: { p1: "900%", p2: "500%" },
    delta: { p1: "9.0倍 / +800%", p2: "5.0倍 / +400%" },
    deltaLabel: "変換率向上",
  },
  {
    label: "熱として失われる割合",
    p1: "35%",
    p2: "25%",
    p14: "3%",
    relative: { p1: "8.6%", p2: "12.0%" },
    delta: { p1: "−91.4%", p2: "−88.0%" },
    deltaLabel: "損失削減",
  },
  {
    label: "位相ノイズとして失われる割合",
    p1: "25%",
    p2: "18%",
    p14: "2%",
    relative: { p1: "8.0%", p2: "11.1%" },
    delta: { p1: "−92.0%", p2: "−88.9%" },
    deltaLabel: "損失削減",
  },
  {
    label: "能力間干渉による損失",
    p1: "20%",
    p2: "14%",
    p14: "2%",
    relative: { p1: "10.0%", p2: "14.3%" },
    delta: { p1: "−90.0%", p2: "−85.7%" },
    deltaLabel: "損失削減",
  },
  {
    label: "高負荷時の出力低下",
    p1: "約35%",
    p2: "約18%",
    p14: "約4%",
    relative: { p1: "約11.4%", p2: "約22.2%" },
    delta: { p1: "約−88.6%", p2: "約−77.8%" },
    deltaLabel: "低下率削減",
  },
  {
    label: "出力変更への応答時間",
    p1: "約1.0ms",
    p2: "約0.45ms",
    p14: "約0.06ms",
    relative: { p1: "約6.0%", p2: "約13.3%" },
    delta: { p1: "約−94.0%", p2: "約−86.7%" },
    deltaLabel: "応答時間短縮",
  },
  {
    label: "瞬間的な負荷変動への追従率",
    p1: "62%",
    p2: "81%",
    p14: "99.4%",
    relative: { p1: "160.3%", p2: "122.7%" },
    delta: { p1: "+60.3%", p2: "+22.7%" },
    deltaLabel: "追従率向上",
  },
  {
    label: "連続最大出力時の安定率",
    p1: "58%",
    p2: "79%",
    p14: "96%",
    relative: { p1: "165.5%", p2: "121.5%" },
    delta: { p1: "+65.5%", p2: "+21.5%" },
    deltaLabel: "安定率向上",
  },
] as const;

const CORE_SYSTEMS = [
  {
    number: "01",
    code: "i-2 / SECOND-GENERATION PROCESS",
    title: "i-2 第二世代無限縮小製造プロセス",
    body: "無限縮小を可能にする第二世代の製造プロセスです。第五の犬としての悠真自身が持つ性質に合わせ、レクソナンスコア、ドライバー、全身の戦闘機構を同一の『終焉』へ同期させます。",
  },
  {
    number: "02",
    code: "TWO-ANGLE STRUCTURE",
    title: "二角形構造",
    body: "二つの頂点と二本の位相境界によって構成される特殊な演算構造。通常空間の内部だけでは完結しない閉路を形成し、その内側へ限定的なベクトル仮想演算空間を生成する。",
  },
  {
    number: "03",
    code: "SELF-RESONANCE / FINAL JUDGMENT",
    title: "悠真自身による自己共鳴",
    body: "第五の犬として完全覚醒した悠真自身の性質と、レクソナンスコア、ドライバー、全身の機構を一つの『終焉』へ同調させます。KHAOSが進化候補を生成し、KOSMOSが整合性を検証し、超自己進化や反エントロピー・位相推進の運用と作用対象の最終判断は悠真自身が担います。",
  },
] as const;

// ZENITH: use the suit atlas's shape masks, not the overlapping part boxes.
const SUIT_UP: RexonanceAssemblyConfig = {
  forms: { ...REXONANCE_FORM_FIGURES, pad: REXONANCE_FORM_PAD },
  figure: REXONANCE_SUIT_FIGURE,
  // The armour assembles whole from the figure without its ornaments; the
  // tail and ribbons then form over it (owner, 2026-10-16).
  base: REXONANCE_SUIT_BASE,
  ornaments: REXONANCE_SUIT_ORNAMENTS,
  undersuit: REXONANCE_SUIT_UNDERSUIT,
  size: REXONANCE_SUIT_SIZE,
  maskTile: REXONANCE_SUIT_TILE,
  pieces: REXONANCE_SUIT_PIECES.map(({ id, group, x, y, w, h, seat, tiles, ax, ay }) => ({
    id,
    group,
    x,
    y,
    w,
    h,
    seat,
    tiles,
    ax,
    ay,
    // The driver is on the body, finished, from the start (owner).
    preset: REXONANCE_SUIT_DRIVER.includes(id),
  })),
  core: REXONANCE_SUIT_MARKS.core,
  visor: REXONANCE_SUIT_MARKS.visor,
  glow: REXONANCE_SUIT_FACE_GLOW,
  // The gold forms by nanites right after each plate seats (owner), as in the call.
  atlas: REXONANCE_SUIT_ATLAS.src,
  gold: {
    atlas: REXONANCE_SUIT_GOLD_ATLAS.src,
    cell: REXONANCE_SUIT_GOLD_CELL,
    cells: REXONANCE_SUIT_GOLD_CELLS,
  },
};
// The entry overlay follows its established five-beat grouping; repeated
// chant text still splits into individual visual units within its existing beat.
const SUIT_UP_LINES = REXONANCE_ENTRY_CALLS.map((call) => {
  const repeats = call.match(/SA-GA！DEUS！|REXONANCE！(?=REXONANCE！|$)/g);
  return repeats && repeats.length > 1 && repeats.join("") === call ? repeats : [call];
});

// The form change's nanite sweep: twelve strips of cells woven across the
// art, one after another, alternately from the left and the right.
const FORM_MESH = Array.from({ length: 12 }, (_, index) => (
  <i key={index} style={{ ["--rzn-d" as string]: index }} />
));

const RexonanceSuitUp = memo(function RexonanceSuitUp({ stage }: { stage: RexonanceStage }) {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mountRexonanceAssembly(runwayRef.current, SUIT_UP), []);
  return (
    <div
      ref={runwayRef}
      className="rzn-suitup"
      aria-hidden="true"
      // The suit-up ends on the form chosen in 03 (owner, 2026-10-11).
      data-form={stage}
      style={{
        ["--rzn-aspect" as string]: `${REXONANCE_SUIT_SIZE.width} / ${REXONANCE_SUIT_SIZE.height}`,
      }}
    >
      <div className="rzn-frame">
        <i className="rzn-light" />
        <i className="rzn-depth" />
        <i className="rzn-aura" />
        <i className="rzn-crown" />
        <i className="rzn-floor" />
        <img
          className="rzn-still"
          src={stage === "standard" ? REXONANCE_SUIT_FIGURE : REXONANCE_FORM_FIGURES[stage]}
          alt=""
          width={REXONANCE_SUIT_SIZE.width}
          height={REXONANCE_SUIT_SIZE.height}
          loading="lazy"
          decoding="async"
        />
        <canvas className="rzn-canvas" width={0} height={0} />
        <div className="rzn-call">
          <p className="rzn-kicker">
            <span>SUIT-UP</span>
            <span>NANITE ASSEMBLY</span>
          </p>
          <p className="rzn-phase">
            <span data-phase="prepare">
              <b>01</b>構成情報を読み込み
            </span>
            <span data-phase="assemble">
              <b>02</b>装甲を装着
            </span>
            <span data-phase="seal">
              <b>03</b>構造を固定
            </span>
            <span data-phase="ignite">
              <b>04</b>出力を起動
            </span>
            <span data-phase="evolve">
              <b>05</b>選択フォームへ進化
            </span>
            <span data-phase="complete">
              <b>06</b>装着完了
            </span>
          </p>
          <ol className="rzn-lines">
            {SUIT_UP_LINES.map((units, index) => (
              <li key={REXONANCE_ENTRY_CALLS[index]} className="rzn-line">
                {units.map((unit, unitIndex) => (
                  <span key={`${unit}-${unitIndex}`} className="rzn-chip">
                    {unit}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          <p className="rzn-hint">スクロールで装着</p>
        </div>
        <div className="rzn-hud">
          <p className="rzn-readout">
            <b className="rzn-percent">100</b>
            <span>%</span>
          </p>
          <p className="rzn-nanites">
            <small>NANITES</small>
            <span className="rzn-count">ONLINE</span>
          </p>
          <ol className="rzn-parts">
            {ASSEMBLY_PARTS.map((part) => (
              <li key={part} className="rzn-part">
                {part}
              </li>
            ))}
          </ol>
          <p className="rzn-stamp">
            <span>REXONANCE SAGA</span>
            <b>{STAGES[stage].code}</b>
          </p>
        </div>
        <i className="rzn-rail">
          <i />
        </i>
      </div>
    </div>
  );
});

/* The form change over the 03 panel's art (owner, 2026-10-11): a canvas
   laid exactly over the new form's picture (same fit and position) plays
   the change, then clears to the picture itself. To MAX: the old form is
   overwritten by cells from the reactor out. To ULTRA: from Rexonance a
   short run to MAX first, then the overwrite to ULTRA and its additional
   parts (its emerald crystals) generated last. Back to Rexonance: no morph.
   Reduced motion, economy and Save-Data change quietly. */
const MORPH_ORIGIN = [0.5, 0.38] as const;
function FormMorph({
  from,
  to,
  delay,
}: {
  from: RexonanceStage;
  to: RexonanceStage;
  delay: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const img = canvas?.parentElement?.querySelector("img");
    if (!canvas || !img || to === "standard" || from === to) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.worldEffects === "economy" ||
      connection?.saveData
    )
      return;
    let cancelled = false;
    let frame = 0;
    // Owned until the effect ends (audit #31): a load still in flight would
    // hold this canvas, and through it the page; the sheets are freed at once.
    const loaders = new Set<HTMLImageElement>();
    const sheets: HTMLCanvasElement[] = [];
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        loaders.add(image);
        image.decoding = "async";
        image.onload = () => {
          loaders.delete(image);
          void image.decode().then(
            () => resolve(image),
            () => resolve(image),
          );
        };
        image.onerror = (error) => {
          loaders.delete(image);
          reject(error);
        };
        image.src = src;
      });
    // A source is a form's panel art (drawn as the panel draws it) or, for
    // the run up to EXCELSIOR, a form's full figure (owner, 2026-10-11).
    type Source = `panel:${RexonanceStage}` | "suit:max" | "suit:ultra";
    type Step = {
      a: Source;
      b: Source;
      ms: number;
      extra?: "emerald" | "difference";
      style?: "square" | "shard";
      order?: "radial" | "descend";
      tone: string;
    };
    const panel = (stage: RexonanceStage) => `panel:${stage}` as Source;
    const steps: Step[] =
      to === "max"
        ? [{ a: panel(from), b: "panel:max", ms: FORM_CHANGE_MS.max, tone: FORM_TONES.max }]
        : to === "ultra"
          ? [
              ...(from === "standard"
                ? [
                    {
                      a: "panel:standard",
                      b: "panel:max",
                      ms: FORM_CHANGE_MS.quick,
                      tone: FORM_TONES.max,
                    } as Step,
                  ]
                : []),
              {
                a: from === "standard" ? "panel:max" : panel(from),
                b: "panel:ultra",
                ms: FORM_CHANGE_MS.ultra,
                extra: "emerald",
                tone: FORM_TONES.ultra,
              },
            ]
          : [
              // EXCELSIOR: from MAX to ULTRA, then its own nanites (prism
              // shards, coming down from the crown) add its decoration.
              ...(from === "standard"
                ? ([
                    { a: "panel:standard", b: "panel:max", ms: 360, tone: FORM_TONES.max },
                    { a: "panel:max", b: "panel:ultra", ms: 460, tone: FORM_TONES.ultra },
                  ] as Step[])
                : from === "max"
                  ? ([
                      { a: "panel:max", b: "panel:ultra", ms: 460, tone: FORM_TONES.ultra },
                    ] as Step[])
                  : []),
              {
                a: "panel:ultra",
                b: "panel:excelsior",
                ms: FORM_CHANGE_MS.excelsior,
                extra: "difference",
                style: "shard",
                order: "descend",
                tone: FORM_TONES.excelsior,
              },
            ];
    const sources = [...new Set(steps.flatMap(({ a, b }) => [a, b]))];
    const url = (source: Source) =>
      source.startsWith("panel:")
        ? STAGES[source.slice(6) as RexonanceStage].image
        : REXONANCE_FORM_FIGURES[source.slice(5) as "max" | "ultra"];
    // The old form shows at once (it is cached), so the new picture never flashes first.
    canvas.style.opacity = "1";
    Promise.all(
      sources.map((source) => load(url(source)).then((image) => [source, image] as const)),
    )
      .then((loaded) => {
        if (cancelled) return;
        // The picture's layout box (offsets ignore its entrance transform).
        const width = img.offsetWidth;
        const height = img.offsetHeight;
        const parent = img.offsetParent === canvas.offsetParent;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.left = `${parent ? img.offsetLeft : 0}px`;
        canvas.style.top = `${parent ? img.offsetTop : 0}px`;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const W = Math.max(1, Math.round(width * ratio));
        const H = Math.max(1, Math.round(height * ratio));
        canvas.width = W;
        canvas.height = H;
        const context = canvas.getContext("2d");
        if (!context) return;
        // Each source drawn once, as it will stand: the panel art with the
        // picture's own fit and position; a figure whole, on the stage's dark.
        const style = getComputedStyle(img);
        const [px, py] = style.objectPosition
          .split(" ")
          .map((part) => (part.endsWith("%") ? Number.parseFloat(part) / 100 : 0.5));
        const prepared = new Map<Source, HTMLCanvasElement>();
        // Where each panel picture stands in the canvas (for the pose warp).
        const boxes = new Map<Source, { x: number; y: number; w: number; h: number }>();
        const pictures = new Map(loaded);
        const sheet = () => {
          const made = Object.assign(document.createElement("canvas"), { width: W, height: H });
          sheets.push(made);
          return made;
        };
        for (const [source, image] of loaded) {
          const prepare = sheet();
          const c = prepare.getContext("2d")!;
          const nw = image.naturalWidth || 1;
          const nh = image.naturalHeight || 1;
          if (source.startsWith("panel:")) {
            // The panel's own object-fit (contain on this page): drawn any
            // other way, the change showed the art enlarged (owner, 2026-10-12).
            const scale = (style.objectFit === "cover" ? Math.max : Math.min)(W / nw, H / nh);
            const box = {
              x: (W - nw * scale) * (px ?? 0.5),
              y: (H - nh * scale) * (py ?? 0.5),
              w: nw * scale,
              h: nh * scale,
            };
            boxes.set(source, box);
            c.drawImage(image, box.x, box.y, box.w, box.h);
          } else {
            c.fillStyle = "#04070d";
            c.fillRect(0, 0, W, H);
            const scale = Math.min(W / nw, (H * 0.96) / nh);
            c.drawImage(image, (W - nw * scale) / 2, H - nh * scale, nw * scale, nh * scale);
          }
          prepared.set(source, prepare);
        }
        const cell = Math.max(8, Math.round(Math.min(W, H) / 34));
        const plans = steps.map((step, index) => {
          const base = {
            width: W,
            height: H,
            cell,
            origin: [W * MORPH_ORIGIN[0], H * MORPH_ORIGIN[1]] as const,
            seed: 31 + index,
            order: step.order ?? "radial",
            extraBy: step.extra ?? "emerald",
          };
          if (!step.extra) return planOverwrite(base);
          const grid = planOverwrite(base);
          const fromCells = sampleCells(prepared.get(step.a)!, grid);
          const toCells = sampleCells(prepared.get(step.b)!, grid);
          return fromCells && toCells
            ? planOverwrite({ ...base, samples: { from: fromCells, to: toCells } })
            : grid;
        });
        // ULTRA and EXCELSIOR stand a little differently (owner, 2026-10-12):
        // through their change the limbs are carried over a little at a time.
        const posed = (step: Step) => step.a === "panel:ultra" && step.b === "panel:excelsior";
        const warpA = steps.some(posed) ? sheet() : null;
        const warpB = steps.some(posed) ? sheet() : null;
        const tail = steps.at(-1)!.extra ? FORM_CHANGE_MS.extra * 0.6 : 0;
        const total = steps.reduce((sum, step) => sum + step.ms, 0) + tail;
        let start = 0;
        const tick = (now: number) => {
          frame = 0;
          if (cancelled) return;
          if (!start) start = now + delay;
          let t = Math.max(0, now - start);
          let index = 0;
          while (index < steps.length - 1 && t >= steps[index].ms) {
            t -= steps[index].ms;
            index += 1;
          }
          const step = steps[index];
          const u = Math.min(1, t / step.ms);
          const v = step.extra
            ? Math.min(1, Math.max(0, (t - step.ms * 0.6) / FORM_CHANGE_MS.extra))
            : 1;
          // The canvas moves with the picture (its scroll settle and its
          // lean), so nothing jumps when it hands back to the picture.
          const live = getComputedStyle(img);
          canvas.style.transform = live.transform;
          canvas.style.scale = live.scale;
          canvas.style.translate = live.translate;
          canvas.style.transformOrigin = live.transformOrigin;
          let fromSheet: HTMLCanvasElement = prepared.get(step.a)!;
          let toSheet: HTMLCanvasElement = prepared.get(step.b)!;
          if (posed(step) && warpA && warpB) {
            const e = u * u * (3 - 2 * u);
            const own = FORM_LANDMARKS.panel.ultra;
            const goal = FORM_LANDMARKS.panel.excelsior;
            const mid = own.map(
              ([x, y], i) =>
                [x + (goal[i][0] - x) * e, y + (goal[i][1] - y) * e] as [number, number],
            );
            for (const [target, source, landmarks] of [
              [warpA, step.a, own],
              [warpB, step.b, goal],
            ] as const) {
              const c = target.getContext("2d")!;
              c.setTransform(1, 0, 0, 1, 0, 0);
              c.clearRect(0, 0, W, H);
              warpPicture(c, pictures.get(source)!, boxes.get(source)!, landmarks, mid);
            }
            fromSheet = warpA;
            toSheet = warpB;
          }
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, W, H);
          drawOverwrite(
            context,
            plans[index],
            fromSheet,
            toSheet,
            u,
            v,
            step.tone,
            false,
            step.style ?? "square",
          );
          if (now - start >= total) {
            canvas.style.opacity = "0";
            for (const done of [...prepared.values(), warpA, warpB])
              if (done) done.width = done.height = 0;
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        canvas.style.opacity = "0";
      });
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      for (const image of loaders) releasePendingImage(image);
      loaders.clear();
      for (const done of sheets) done.width = done.height = 0;
      sheets.length = 0;
    };
  }, [from, to, delay]);
  return <canvas ref={ref} className="rxs-form-morph" aria-hidden="true" />;
}

const releaseControlFocus = (control: HTMLElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === control) control.blur();
  });
};

// A stage title's zero-width marker becomes a <wbr /> so the visible text is
// unchanged while WebKit gets its one phrase break.
const renderStageTitle = (title: string) =>
  title.split("\u200B").map((part, index) => (
    <Fragment key={part}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));

// Units that never split across lines: the OS keeps its version (narrow
// phones split 「SA-GA OS / 5.5」) and 必要部位 stays one noun (844×390 split
// 「必要部 / 位」). The lede's visible text is unchanged (rx2/COPY2.md L3, L6).
const STAGE_LEDE_UNITS = /(SA-GA OS 5\.5|必要部位)/;
const renderStageLede = (lede: string) =>
  lede.split(STAGE_LEDE_UNITS).map((part, index) =>
    index % 2 === 1 ? (
      <span key={`${index}-${part}`} className="rxp-nowrap">
        {part}
      </span>
    ) : (
      <Fragment key={`${index}-${part}`}>{part}</Fragment>
    ),
  );

// Keep frequent comparison input updates out of the hero, stage art and effects.
const P14Comparator = memo(function P14Comparator({
  nativeIOSSelection,
}: {
  nativeIOSSelection: boolean;
}) {
  const [p14Baseline, setP14Baseline] = useState<P14Baseline>("p1");
  const syncP14Baseline = (value: number) => setP14Baseline(value >= 2 ? "p2" : "p1");
  return (
    <div className="rxs-p14-comparator rxs-reveal">
      <header>
        <div>
          <small>GENERATION COMPARISON</small>
          <h3>P14 / {p14Baseline.toUpperCase()}比</h3>
        </div>
        <output htmlFor="rxs-p14-baseline">{p14Baseline.toUpperCase()}比</output>
      </header>

      <div className="rxs-p14-range-control" data-baseline={p14Baseline}>
        <div className="rxs-p14-range-labels">
          <button
            type="button"
            className={p14Baseline === "p1" ? "is-active" : undefined}
            aria-pressed={p14Baseline === "p1"}
            onClick={() => setP14Baseline("p1")}
            onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
          >
            P1比
          </button>
          <button
            type="button"
            className={p14Baseline === "p2" ? "is-active" : undefined}
            aria-pressed={p14Baseline === "p2"}
            onClick={() => setP14Baseline("p2")}
            onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
          >
            P2比
          </button>
        </div>
        {nativeIOSSelection ? (
          <label className="rxs-p14-native-select">
            <span>基準にする世代</span>
            <select
              id="rxs-p14-baseline"
              value={p14Baseline}
              aria-label="P14の比較基準"
              aria-describedby="rxs-p14-baseline-help"
              onPointerDown={(event) => {
                event.currentTarget.dataset.pointerFocus = "true";
              }}
              onInput={(event) => {
                setP14Baseline(event.currentTarget.value as P14Baseline);
              }}
              onChange={(event) => {
                setP14Baseline(event.currentTarget.value as P14Baseline);
              }}
            >
              <option value="p1">P1比</option>
              <option value="p2">P2比</option>
            </select>
          </label>
        ) : (
          <div className="rxs-p14-ios-slider" data-value={p14Baseline}>
            <span className="rxs-p14-ios-track" aria-hidden="true">
              <i />
            </span>
            <span className="rxs-p14-ios-thumb" aria-hidden="true" />
            <input
              id="rxs-p14-baseline"
              type="range"
              min="1"
              max="2"
              step="1"
              value={p14Baseline === "p1" ? 1 : 2}
              aria-label="P14の比較対象"
              aria-describedby="rxs-p14-baseline-help"
              aria-valuetext={`${p14Baseline.toUpperCase()}を100%とした比較`}
              onInput={(event) => syncP14Baseline(event.currentTarget.valueAsNumber)}
              onChange={(event) => syncP14Baseline(event.currentTarget.valueAsNumber)}
              onPointerUp={(event) => {
                syncP14Baseline(event.currentTarget.valueAsNumber);
                releaseControlFocus(event.currentTarget);
              }}
              onTouchEnd={(event) => {
                syncP14Baseline(event.currentTarget.valueAsNumber);
                releaseControlFocus(event.currentTarget);
              }}
            />
          </div>
        )}
        <p id="rxs-p14-baseline-help">
          {nativeIOSSelection
            ? "100%にする世代を、P1かP2から選べます。"
            : "100%にする世代を、P1かP2へ。スライダー、両端のタップ、矢印キーで切り替えられます。"}
        </p>
      </div>

      <div
        key={p14Baseline}
        className="rxs-p14-metrics"
        data-baseline={p14Baseline}
        aria-live="polite"
        aria-atomic="true"
      >
        {P14_METRICS.map((metric) => (
          <article key={metric.label}>
            <small>{metric.label}</small>
            <div className="rxs-p14-values">
              <span>
                <i>{p14Baseline.toUpperCase()}（基準）</i>
                <b>100%</b>
              </span>
              <span>
                <i>P14（換算）</i>
                <strong>{metric.relative[p14Baseline]}</strong>
              </span>
            </div>
            <p key={`${metric.label}-${p14Baseline}`}>
              <span>{metric.deltaLabel}</span>
              <b>{metric.delta[p14Baseline]}</b>
            </p>
          </article>
        ))}
      </div>
      <p className="rxs-p14-method-note">
        選択したP1またはP2を100%として、P14を相対換算しています。損失割合、高負荷時の出力低下、応答時間は、値が小さいほど高性能なため削減率・短縮率で表示しています。
      </p>
    </div>
  );
});

// Keep performance selection updates inside their own chapter.
const RexonancePerformance = memo(function RexonancePerformance() {
  const [performanceBaseline, setPerformanceBaseline] = useState<PerformanceBaseline>("extreme");
  const activePerformanceBaseline = PERFORMANCE_BASELINES[performanceBaseline];
  return (
    <section id="performance" className="rxs-performance rxs-section">
      <header className="rxs-section-heading rxs-reveal">
        <p>PERFORMANCE</p>
        <h2>
          これで、
          <br />
          まだ標準。
        </h2>
        {/* Keep each phrase intact on narrow screens; the selected baseline
            applies to the standard-value comparison below. */}
        <span>
          <span>
            <span>{activePerformanceBaseline.label}サーガと、</span>
            <span>標準値で比較。</span>
          </span>
          <span>
            <span>マックスとウルトラの数値は、</span>
            <span>未公表です。</span>
          </span>
        </span>
      </header>

      {/* RESONANCE (rx11): each cut holds the screen. The figure keeps the
          owner's value as its text; the hidden <b> is the counter that runs
          over it once, and the field rings out from it on the lock. */}
      <div className="rxs-headline-metrics">
        <article className="rxs-reveal">
          <small>REACTION / VS VINCULUM</small>
          <strong data-rsn-count="">
            650<span>%+</span>
            <b className="rsn-count" aria-hidden="true">
              650<span>%+</span>
            </b>
          </strong>
          <p>ヴィンクルムサーガと比較した反応速度</p>
          <i className="rxp-gauge" aria-hidden="true" />
          <span className="rsn-field" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </article>
        <article className="rxs-reveal">
          <small>MOBILITY / VS EXTREME</small>
          <strong data-rsn-count="">
            900<span>%</span>
            <b className="rsn-count" aria-hidden="true">
              900<span>%</span>
            </b>
          </strong>
          <p>エクスプリームサーガと比較した最大機動力</p>
          <i className="rxp-gauge" aria-hidden="true" />
          <span className="rsn-field" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </article>
      </div>

      <div className="rxs-comparison rxs-reveal" aria-label="標準カタログ値の比較">
        <label className="rxs-comparison-selector">
          <span>比較する相手</span>
          <select
            value={performanceBaseline}
            aria-label="レクソナンスの比較対象"
            onPointerDown={(event) => {
              event.currentTarget.dataset.pointerFocus = "true";
            }}
            onInput={(event) => {
              setPerformanceBaseline(event.currentTarget.value as PerformanceBaseline);
            }}
            onChange={(event) => {
              setPerformanceBaseline(event.currentTarget.value as PerformanceBaseline);
            }}
          >
            <option value="vertex">ヴァーテックスサーガ</option>
            <option value="vinculum">ヴィンクルムサーガ</option>
            <option value="extreme">エクスプリームサーガ</option>
          </select>
        </label>
        <p className="rxs-comparison-formula">
          比較基準：<b>{activePerformanceBaseline.label}＝100%</b>
        </p>
        <div className="rxs-comparison-key" aria-hidden="true">
          <span>
            <i className="is-rexonance" />
            レクソナンス
          </span>
          <span>
            <i className="is-extreme" />
            {activePerformanceBaseline.label}
          </span>
        </div>
        <div
          key={performanceBaseline}
          className="rxs-comparison-metrics"
          data-baseline={performanceBaseline}
          aria-live="polite"
          aria-atomic="true"
        >
          {activePerformanceBaseline.metrics.map((metric) => (
            <article key={metric.label}>
              <header>
                <div>
                  <small>{metric.label}</small>
                  <strong>{metric.current}</strong>
                </div>
                <span className="rxs-comparison-result">
                  <i>基準比</i>
                  <b>{metric.relative}</b>
                  <em>
                    {metric.multiplier} / {metric.delta}
                  </em>
                </span>
              </header>
              <div
                className="rxs-bars"
                aria-label={`${metric.label}、${activePerformanceBaseline.label}を100%としたレクソナンスの性能は${metric.relative}、${metric.multiplier}、増加分${metric.delta}`}
              >
                <i className="is-rexonance" />
                <i className="is-extreme" style={{ width: `${metric.bar}%` }} />
              </div>
              <p>
                {activePerformanceBaseline.code} / {metric.previous}
                {metric.note ? <span> / {metric.note}</span> : null}
              </p>
            </article>
          ))}
        </div>
        <section
          key={`${performanceBaseline}-processing`}
          className="rxs-processing-comparison"
          aria-label={`${activePerformanceBaseline.label}とレクソナンスの演算構成比較`}
        >
          <header>
            <small>PROCESSING ARCHITECTURE</small>
            <h3>演算は、系統ごとに。</h3>
          </header>
          <div>
            <section>
              <h4>{activePerformanceBaseline.label}</h4>
              <ul>
                {activePerformanceBaseline.processing.baseline.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4>レクソナンス</h4>
              <ul>
                {activePerformanceBaseline.processing.rexonance.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          </div>
          <p>{activePerformanceBaseline.processing.verdict}</p>
        </section>
      </div>
      <p className="rxs-comparison-note rxs-reveal">
        主表示は選択した形態を100%としたレクソナンスの性能比です。「+」は100%を超えた増加分を示します。走力は100m所要時間の逆数から速度性能を換算し、所要時間の短縮率を補足表示しています。「est.」は推定値を示し、演算はYOPSとTOPSを別指標として比較しています。各値は最大出力ではなく標準運用値であり、マックス／ウルトラの定量上限を示すものではありません。
      </p>
    </section>
  );
});

export function RexonanceSaga() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<RexonanceStage>("standard");
  // Owner (2026-10-11): the call must not stutter as it clears. Arriving
  // under a route cover (a client transition, never a direct load, so the
  // server's markup always matches), the page first renders its hero and
  // 01 only; the rest (P14 on) renders in an idle slot once the reveal has
  // run, so the hand-over lays out a short page. A hash arrival renders all.
  const [lower, setLower] = useState(
    () =>
      typeof document === "undefined" ||
      document.documentElement.dataset.loading !== "true" ||
      // A hash arrival (not #top) needs its section at once.
      (window.location.hash.length > 1 && window.location.hash !== "#top"),
  );
  useEffect(() => {
    if (lower) return;
    const root = document.documentElement;
    let idle = 0;
    let timer = 0;
    const show = () => setLower(true);
    const later = () => {
      timer = window.setTimeout(() => {
        timer = 0;
        if (window.requestIdleCallback) idle = window.requestIdleCallback(show, { timeout: 700 });
        // Safari has no idle callback: leave the reveal's last frames alone.
        else timer = window.setTimeout(show, 400);
      }, REXONANCE_ENTRY_TIMINGS.reveal + 80);
    };
    const observer = new MutationObserver(() => {
      if (root.hasAttribute("data-loading")) return;
      observer.disconnect();
      later();
    });
    if (root.hasAttribute("data-loading"))
      observer.observe(root, { attributes: true, attributeFilter: ["data-loading"] });
    else later();
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
      if (idle) window.cancelIdleCallback?.(idle);
    };
  }, [lower]);

  const [nativeIOSSelection, setNativeIOSSelection] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [stageCall, setStageCall] = useState<{ id: number; stage: RexonanceStage } | null>(null);
  // How the panel's new form arrives: under a card, or quietly (rx2 rest guard).
  const [stageEntrance, setStageEntrance] = useState<RexonanceStageEntrance | null>(null);
  const latestStageRef = useRef<RexonanceStage>("standard");
  // The form shown before the latest change (what the morph starts from).
  const morphFrom = useRef<RexonanceStage>("standard");
  const shownStage = useRef<RexonanceStage>("standard");
  if (shownStage.current !== stage) {
    morphFrom.current = shownStage.current;
    shownStage.current = stage;
  }
  const stageCallId = useRef(0);
  const stageCallTimer = useRef(0);
  const stageCallStartedAt = useRef(0);
  const stageCallExitedAt = useRef(Number.NEGATIVE_INFINITY);
  const pageRef = useRef<HTMLElement | null>(null);
  const setPageRef = useCallback((page: HTMLElement | null) => {
    pageRef.current = page;
    syncRexonanceRouteCover(page);
  }, []);
  const stageTabsRef = useRef<HTMLDivElement | null>(null);
  const activeStage = STAGES[stage];

  const cancelStageCall = useCallback(() => {
    stageCallId.current += 1;
    window.clearTimeout(stageCallTimer.current);
    stageCallTimer.current = 0;
    setStageCall(null);
  }, []);

  const selectStage = useCallback(
    (nextStage: RexonanceStage) => {
      // initRail emits railselect from a native click before React's onClick.
      // This synchronous ref also makes rapid swipes last-request-wins.
      if (latestStageRef.current === nextStage) return;
      latestStageRef.current = nextStage;
      const connection = (
        navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
        }
      ).connection;
      const motionAllowed = !(
        document.hidden ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.dataset.worldEffects === "economy" ||
        connection?.saveData ||
        /^(slow-)?2g$/.test(connection?.effectiveType ?? "")
      );
      // A running card is retargeted to the latest form and keeps its clock;
      // a selection just after a card has left changes the form quietly. Card
      // starts stay ≥950 ms apart, so any tapping cadence keeps ≤1 flash/s.
      const now = performance.now();
      const plan = planStageCall({
        motionAllowed,
        cardMounted: stageCallTimer.current !== 0,
        cardElapsedMs: now - stageCallStartedAt.current,
        sinceNaturalExitMs: now - stageCallExitedAt.current,
      });
      setStage(nextStage);
      setStageEntrance(plan.entrance);
      if (plan.action === "retarget") {
        setStageCall((call) => call && { id: call.id, stage: nextStage });
        return;
      }
      if (plan.action === "skip") {
        // A calm interlude (reduced motion, economy, Save-Data, a hidden
        // tab) ends the streak: the next selection may show its card.
        if (!motionAllowed) {
          cancelStageCall();
          stageCallExitedAt.current = Number.NEGATIVE_INFINITY;
        }
        return;
      }
      cancelStageCall();
      const id = stageCallId.current;
      stageCallStartedAt.current = now;
      setStageCall({ id, stage: nextStage });
      stageCallTimer.current = window.setTimeout(() => {
        if (stageCallId.current === id) {
          stageCallTimer.current = 0;
          stageCallExitedAt.current = performance.now();
          setStageCall(null);
        }
      }, REXONANCE_STAGE_DURATION_MS);
    },
    [cancelStageCall],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cancelOnPreference = () => {
      if (media.matches || document.documentElement.dataset.worldEffects === "economy") {
        cancelStageCall();
      }
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

  // Leaving releases the page (audit #31): an <img> of the removed page still
  // downloading (a stalled connection) would otherwise keep the whole page,
  // canvases and all, until the network gives up. Runs after the removal.
  useEffect(() => {
    const page = pageRef.current;
    return () => releasePendingImages(page);
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    const nav = page?.querySelector<HTMLElement>(".rxs-local-nav");
    if (!page || !nav) return;
    let frame = 0;
    const syncNavReserve = () => {
      const reserve = `${Math.ceil(nav.getBoundingClientRect().height)}px`;
      if (page.style.getPropertyValue("--rxs-local-nav-reserve") !== reserve) {
        page.style.setProperty("--rxs-local-nav-reserve", reserve);
      }
    };
    // Rotation can deliver all three resize notifications in one frame.
    // Read layout once for that frame, keeping the first measurement immediate.
    const queueNavReserve = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncNavReserve();
      });
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queueNavReserve);
    observer?.observe(nav);
    window.addEventListener("resize", queueNavReserve, { passive: true });
    window.visualViewport?.addEventListener("resize", queueNavReserve, { passive: true });
    syncNavReserve();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", queueNavReserve);
      window.visualViewport?.removeEventListener("resize", queueNavReserve);
      if (frame) window.cancelAnimationFrame(frame);
      page.style.removeProperty("--rxs-local-nav-reserve");
    };
  }, []);

  useEffect(() => {
    const isIOSDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setNativeIOSSelection(isIOSDevice);
  }, []);

  useEffect(() => {
    const restoreKeyboardFocus = () => {
      pageRef.current
        ?.querySelectorAll<HTMLSelectElement>('select[data-pointer-focus="true"]')
        .forEach((control) => delete control.dataset.pointerFocus);
    };
    document.addEventListener("keydown", restoreKeyboardFocus, true);
    return () => document.removeEventListener("keydown", restoreKeyboardFocus, true);
  }, []);

  useEffect(() => {
    const rail = stageTabsRef.current;
    if (!rail) return;
    const stages = SHOWN_STAGES;
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<{ index?: number }>).detail?.index;
      const nextStage = typeof index === "number" ? stages[index] : undefined;
      if (nextStage) selectStage(nextStage);
    };
    rail.addEventListener("railselect", onSelect);
    const dispose = initRail(rail);
    const stopWarmup = warmRexonanceStages(rail, [STAGES.max.image, STAGES.ultra.image]);
    return () => {
      stopWarmup();
      rail.removeEventListener("railselect", onSelect);
      dispose?.();
    };
  }, [selectStage, lower]);

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
    const updateMotion = () => setMotionReady(!media.matches && !constrained);
    updateMotion();
    media.addEventListener("change", updateMotion);
    const updateVisibility = () => {
      page.dataset.motionPaused = String(document.hidden);
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    const cleanup = () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };

    const reveals = [...page.querySelectorAll<HTMLElement>(".rxs-reveal")];
    if (!("IntersectionObserver" in window)) {
      reveals.forEach((element) => element.classList.add("is-visible"));
      return cleanup;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10%", threshold: 0 },
    );
    reveals.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, [lower]);

  // RESONANCE (rx11): the figures' one-time count and lock, and the stage's
  // fine-pointer parallax. Mounted once; it follows reduced motion, economy
  // rendering and page visibility itself, so a form, menu or baseline change
  // never restarts it.
  // (Once the whole page is rendered: it reads every section.)
  useEffect(() => (lower ? mountRexonanceResonance(pageRef.current) : undefined), [lower]);
  useEffect(
    () =>
      lower
        ? mountLocalNavCurrent(pageRef.current?.querySelector(".rxs-local-nav nav"))
        : undefined,
    [lower],
  );

  useEffect(() => {
    // Where view timelines run, the motion sheet's recede already follows the
    // scroll on the compositor; this per-frame write cost ~5 ms of style work
    // on desktop (rx2 F4). It remains the fallback without timelines.
    if (
      !motionReady ||
      window.matchMedia("(pointer: coarse)").matches ||
      (CSS.supports("animation-timeline", "view()") &&
        CSS.supports("animation-range", "entry 0% entry 100%"))
    )
      return;
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
    let listening = false;
    const detach = () => {
      window.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      listening = false;
    };
    const syncNativeMotion = () => {
      if (document.documentElement.dataset.ios27Enhanced === "true") {
        detach();
        page.style.removeProperty("--rxs-hero-progress");
        lastProgress = -1;
      } else if (!listening) {
        listening = true;
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.visualViewport?.addEventListener("resize", onScroll, { passive: true });
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
    };
    // A trackpad iPad can have a fine pointer. Follow the installed capability
    // mode, not just its UA, so unsupported timelines retain the old fallback.
    const observer = supportsIOS27Enhancements(navigator)
      ? new MutationObserver(syncNativeMotion)
      : null;
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ios27-enhanced"],
    });
    syncNativeMotion();
    return () => {
      observer?.disconnect();
      detach();
    };
  }, [motionReady]);

  return (
    <main
      ref={setPageRef}
      id="top"
      className="rxs-page rxs-rexonance-page"
      data-motion-ready={motionReady ? "true" : "false"}
    >
      {stageCall && (
        <RexonanceCallSequence
          key={stageCall.id}
          mode="stage"
          phase="covering"
          tier="full"
          stage={stageCall.stage}
        />
      )}
      <header className="rxs-local-nav">
        <div className="rxs-local-nav-inner">
          <GuardedLink
            className="rxs-brand"
            to="/world"
            hash="top"
            assets={WORLD_ENTER_ASSETS}
            aria-label="ディセプションワールドへ戻る"
          >
            <span>REXONANCE</span>
            <b>
              <DisplayName value="レクソナンスサーガ" />
            </b>
          </GuardedLink>
          <nav aria-label="レクソナンスサーガ ページ内ナビゲーション">
            <a href="#performance">性能</a>
            <a href="#p14">P14</a>
            <a href="#stages">形態</a>
            <a href="#system">システム</a>
          </nav>
          <SideMenuTrigger
            className="rxs-menu-trigger"
            open={menuOpen}
            onOpenChange={setMenuOpen}
          />
        </div>
      </header>

      <SideMenuLayer context="rexonance" open={menuOpen} onOpenChange={setMenuOpen} />

      <section className="rxs-hero" aria-labelledby="rxs-title">
        <div className="rxs-hero-ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-resonance-field" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="rxs-hero-copy">
          <p>
            THE NEXT GENERATION <span className="rxs-hero-kicker-tail">OF SA-GA</span>
          </p>
          <h1 id="rxs-title">
            <span>REXONANCE SAGA</span>
            究極が
            <br />
            始まる。
          </h1>
          <p className="rxs-hero-lede">
            <span className="rxs-hero-lede-text">
              <span>覚醒する、</span>
              <span>全てが最高峰で。</span>
            </span>
          </p>
        </div>
        <div className="rxs-hero-visual" aria-hidden="true">
          <RexonanceAperture />
          {/* Three rings settle once onto the aperture's circles (rx2 arrival). */}
          <i className="rxp-ring is-ice" />
          <i className="rxp-ring is-violet" />
          <i className="rxp-ring is-gold" />
          <span className="rxs-orbit rxs-orbit-a" />
          <span className="rxs-orbit rxs-orbit-b" />
          <img
            src={REXONANCE_SITE_ARTWORK.standard}
            {...rexonanceImage(REXONANCE_SITE_ARTWORK.standard)}
            alt=""
            width="1086"
            height="1448"
            decoding="async"
            fetchPriority="high"
          />
          {/* RESONANCE (rx11): the stage in depth. Prism shafts behind the
              armour, waves from its core, the burst each locked figure rings
              into it, shards in front; each layer drifts at its own rate. */}
          <span className="rsn-depth">
            <i className="rsn-shaft" />
            <i className="rsn-shaft" />
            <i className="rsn-shaft" />
            <i className="rsn-wave" />
            <i className="rsn-wave" />
            <i className="rsn-wave" />
            <i className="rsn-burst" />
            <i className="rsn-burst" />
            <i className="rsn-shard" />
            <i className="rsn-shard" />
            <i className="rsn-shard" />
            <i className="rsn-shard" />
            <i className="rsn-shard" />
            <i className="rsn-shard" />
          </span>
          {/* ZENITH (rx15): while the stage holds beside 01 and 02, it reads
              out what the script is saying — a lock-on per beat. */}
          <span className="rzn-callouts">
            <span className="rzn-callout is-reaction">
              <span>
                <i />
                <b>
                  650<small>%+</small>
                </b>
                <em>REACTION</em>
              </span>
            </span>
            <span className="rzn-callout is-mobility">
              <span>
                <i />
                <b>
                  900<small>%</small>
                </b>
                <em>MOBILITY</em>
              </span>
            </span>
            <span className="rzn-callout is-core">
              <span>
                <i />
                <b>P14</b>
                <em>PROCESSING CORE</em>
              </span>
            </span>
          </span>
        </div>
        <a className="rxs-scroll-cue" href="#performance">
          <span>まず、数字から。</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <nav className="rxs-chapter-index" aria-label="レクソナンスの見どころ">
        <a href="#p14">
          <small>P14</small>
          <span>演算基盤</span>
          <i aria-hidden="true">↗</i>
        </a>
        <a href="#stages">
          <small>3 STAGES</small>
          <span>三つの形態</span>
          <i aria-hidden="true">↗</i>
        </a>
        <a href="#system">
          <small>SELF-RESONANCE</small>
          <span>共鳴構造</span>
          <i aria-hidden="true">↗</i>
        </a>
      </nav>

      <RexonancePerformance />

      {lower ? (
        <>
          <section id="p14" className="rxs-p14 rxs-section" aria-labelledby="rxs-p14-title">
            <header className="rxs-section-heading rxs-reveal">
              <p>PROCESSING CORE / P14</p>
              <h2 id="rxs-p14-title">
                同じエーテルで、
                <br />
                P1の9倍。
              </h2>
              <span>
                P14は、出力変換・位相制御・能力間調停を
                <span className="rxp-nowrap">一体化した</span>
                <span className="rxp-nowrap">第14世代</span>
                演算基盤です。同じエーテル量からP1の9倍に相当する性能を引き出し、熱・位相ノイズ・能力間干渉による損失を合計7%まで抑えます。
              </span>
            </header>

            <div className="rxs-p14-overview rxs-reveal">
              <figure>
                <img
                  src="/rexonance-p14-core.jpg"
                  {...rexonanceImage("/rexonance-p14-core.jpg", true)}
                  ref={p14ImageRef}
                  alt="青い回路に接続されたP14演算コア"
                  width="1000"
                  height="1000"
                  loading="lazy"
                  decoding="async"
                />
                {/* RESONANCE (rx11): the light the chip catches as it turns. */}
                <i className="rsn-glint" aria-hidden="true" />
              </figure>
              <div className="rxs-p14-copy">
                <small>P14 / FOURTEENTH GENERATION</small>
                <h3>最大出力を支える、安定性。</h3>
                <p>
                  入力されたエーテルを攻撃・機動・防御へ変換する際の損失を局所ごとに抑え、必要な部位へ出力を再配分します。急激な負荷変動にも99.4%で追従し、連続最大出力でも96%の安定率を維持します。マックスでは、このP14を完全加速して全神飾の連続実装を支えます。
                </p>
                <dl aria-label="P14の主要指標">
                  <div>
                    <dt>実効変換率</dt>
                    <dd data-rsn-count="">
                      90%
                      <b className="rsn-count" aria-hidden="true">
                        90%
                      </b>
                    </dd>
                  </div>
                  <div>
                    <dt>応答時間</dt>
                    <dd data-rsn-count="">
                      約0.06ms
                      <b className="rsn-count" aria-hidden="true">
                        約0.06ms
                      </b>
                    </dd>
                  </div>
                  <div>
                    <dt>最大出力安定率</dt>
                    <dd data-rsn-count="">
                      96%
                      <b className="rsn-count" aria-hidden="true">
                        96%
                      </b>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <P14Comparator nativeIOSSelection={nativeIOSSelection} />
          </section>

          <RexonanceSuitUp stage={stage} />

          <section id="stages" className="rxs-stages rxs-section">
            <header className="rxs-section-heading rxs-reveal">
              <p>THREE OPERATING STAGES</p>
              <h2>まだ、次元は変わる。</h2>
            </header>

            <div className="rxs-stage-switcher rxs-reveal">
              <div
                ref={stageTabsRef}
                className="rxs-stage-tabs liquid-swipe-tabs"
                role="tablist"
                aria-label="レクソナンスの運用段階"
                aria-describedby="rxs-stage-hint"
                data-liquid-glass="true"
                data-stage={stage}
              >
                <LiquidLens />
                {SHOWN_STAGES.map((key) => (
                  <button
                    key={key}
                    id={`rxs-stage-tab-${key}`}
                    type="button"
                    role="tab"
                    aria-selected={stage === key}
                    aria-controls="rxs-stage-panel"
                    tabIndex={stage === key ? 0 : -1}
                    className={stage === key ? "is-active" : ""}
                    style={{ ["--liquid-accent" as string]: STAGES[key].accent }}
                    onClick={() => selectStage(key)}
                    onPointerUp={(event) => releaseControlFocus(event.currentTarget)}
                  >
                    <span>{STAGES[key].label}</span>
                    <small>{STAGES[key].code}</small>
                  </button>
                ))}
              </div>
              <p id="rxs-stage-hint" className="rxs-stage-hint">
                タップ・長押し・左右スライド・矢印キーで切り替え
              </p>

              <div
                id="rxs-stage-panel"
                className="rxs-stage-panel"
                role="tabpanel"
                aria-labelledby={`rxs-stage-tab-${stage}`}
                aria-live="polite"
                data-entrance={stageEntrance?.kind}
                style={{
                  ["--rxs-stage-accent" as string]: activeStage.accent,
                  ["--rxp-entrance-delay" as string]: `${stageEntrance?.delayMs ?? 0}ms`,
                }}
              >
                <figure key={stage}>
                  <span aria-hidden="true" />
                  <i className="rxs-stage-scan" aria-hidden="true" />
                  <img
                    src={activeStage.image}
                    {...rexonanceImage(activeStage.image)}
                    alt={activeStage.alt}
                    width={1086}
                    height={1448}
                    loading={stage === "standard" ? "eager" : "lazy"}
                    decoding="async"
                  />
                  {/* RESONANCE (rx11): the transformation, replayed with each
                  form (the figure re-keys): three rings from the core and
                  one refraction band, in the form's light. */}
                  <i className="rsn-form" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </i>
                  {/* The form change (owner, 2026-10-11): MAX overwrites the
                  finished Rexonance with cells; ULTRA runs to MAX briefly,
                  overwrites it again and generates its additional parts. */}
                  {morphFrom.current !== stage ? (
                    <FormMorph
                      from={morphFrom.current}
                      to={stage}
                      delay={stageEntrance?.delayMs ?? 0}
                    />
                  ) : null}
                  {/* ZENITH (rx15): nanites re-forming over the new art. */}
                  <i className="rzn-mesh" aria-hidden="true">
                    {FORM_MESH}
                  </i>
                </figure>
                <div key={`${stage}-copy`}>
                  <small>{activeStage.code}</small>
                  <h3>{renderStageTitle(activeStage.title)}</h3>
                  {(typeof activeStage.lede === "string"
                    ? [activeStage.lede]
                    : activeStage.lede
                  ).map((paragraph) => (
                    <p key={paragraph}>{renderStageLede(paragraph)}</p>
                  ))}
                  <ul>
                    {activeStage.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  {/* ZENITH (rx15): the form's code, outlined and huge. */}
                  <i className="rzn-form-code" aria-hidden="true">
                    {activeStage.code}
                  </i>
                </div>
              </div>
            </div>
          </section>

          <section id="system" className="rxs-system rxs-section">
            <header className="rxs-section-heading rxs-reveal">
              <p>SELF-RESONANCE</p>
              <h2>
                悠真自身が、
                <br />
                終焉を制御する。
              </h2>
            </header>

            {/* Three system layers converge on Yuma's self-resonance. */}
            <div className="rzn-trinity" aria-hidden="true">
              {CORE_SYSTEMS.map((system) => (
                <span key={system.number} className="rzn-tri">
                  <i className="rzn-tri-ring">
                    <b>{system.number}</b>
                  </i>
                </span>
              ))}
              <i className="rzn-tri-wave" />
              <i className="rzn-tri-core" />
              <small className="rzn-tri-lock">PHASE LOCK</small>
            </div>

            <div className="rxs-system-grid">
              {CORE_SYSTEMS.map((system) => (
                <article key={system.number} className="rxs-reveal">
                  <header>
                    <span>{system.number}</span>
                    <small>{system.code}</small>
                  </header>
                  <h3>{system.title}</h3>
                  <p>{system.body}</p>
                </article>
              ))}
            </div>

            <div className="rxs-specs rxs-reveal">
              <div>
                <small>KHAOS DeuX</small>
                <strong data-rsn-count="">
                  50,000〜<span>YOPS</span>
                  <b className="rsn-count" aria-hidden="true">
                    50,000〜<span>YOPS</span>
                  </b>
                </strong>
                <p>∞ CORE / 基準値</p>
              </div>
              {/* A drawn hairline, not a multiplication sign: the two units stand
              side by side and are never multiplied (rx2/COPY2.md C8). */}
              <i aria-hidden="true" />
              <div>
                <small>KOSMOS DeuX</small>
                <strong data-rsn-count="">
                  9,000<span>TOPS</span>
                  <b className="rsn-count" aria-hidden="true">
                    9,000<span>TOPS</span>
                  </b>
                </strong>
                <p>300 CORE</p>
              </div>
            </div>
          </section>

          <footer className="rxs-footer">
            {/* ZENITH (rx15): the suit, finished, stands behind the last line. */}
            <img
              className="rzn-end-figure"
              src={REXONANCE_SUIT_FIGURE}
              alt=""
              aria-hidden="true"
              width={REXONANCE_SUIT_SIZE.width}
              height={REXONANCE_SUIT_SIZE.height}
              loading="lazy"
              decoding="async"
            />
            {/* RESONANCE (rx11): the last wave, gold — the decision is his. */}
            <span className="rsn-coda" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div>
              <p>REXONANCE SAGA / FINAL ARRIVAL</p>
              <h2>
                理不尽すら
                <wbr />
                殺して見せろ。
              </h2>
            </div>
            <GuardedLink to="/riders/saga" assets={[]}>
              <span>人物・能力の詳細を見る</span>
              <i aria-hidden="true">↗</i>
            </GuardedLink>
            <GuardedLink to="/form-archive" assets={[]}>
              <span>全形態を比較する</span>
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
        </>
      ) : (
        <div className="rxs-lower-pending" aria-hidden="true" />
      )}
    </main>
  );
}
