import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { bootLiquidGlass } from "@/lib/liquid/boot.js";
import { MANAGER_ASSETS } from "@/lib/asset-loader";
import { GuardedLink, useLoadGate } from "@/components/load-gate";
import { useWorldMode } from "./use-world-mode";
import { LiquidLens, LiquidPointerGlow } from "./liquid-rail";
import { SideMenuLayer, SideMenuTrigger } from "./world-chrome";
import { RIDER_NAV, NameText } from "./dossier-nav";
import { SlideOpenControl } from "./slide-open-control";
import { UiVectorIcon } from "./ui-vector-icon";
import { resetPickupScroll, settlePickupScroll } from "./pickup-scroll-reset";
import { clearRiderReturn, readRiderReturn } from "./rider-return-state";

const POSTERS = [
  {
    src: "/deception-world-poster-delivery.webp",
    pos: "50% 50%",
    fit: "cover",
    alt: "仮面ライダーサーガ Deception Worldの集合ポスター",
  },
  {
    src: "/poster-card-03.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーサーガのキービジュアル 03",
  },
  {
    src: "/poster-card-04.jpeg",
    pos: "50% 30%",
    fit: "cover",
    alt: "仮面ライダーサーガのキービジュアル 04",
  },
  {
    src: "/poster-card-05.jpeg",
    pos: "50% 32%",
    fit: "cover",
    alt: "Deception Worldのキービジュアル 05",
  },
  {
    src: "/poster-card-06.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーレルムのキービジュアル 06",
  },
  {
    src: "/poster-card-07.jpeg",
    pos: "50% 50%",
    fit: "contain",
    alt: "仮面ライダーローアのキービジュアル 07",
  },
  {
    src: "/poster-card-08.jpeg",
    pos: "50% 50%",
    fit: "contain",
    alt: "青い装甲のライダーのキービジュアル 08",
  },
  {
    src: "/poster-card-10.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーレディックのキービジュアル 10",
  },
  {
    src: "/poster-card-11.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーアルゲノムのキービジュアル 11",
  },
  {
    src: "/poster-card-12.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーオーバーゼッツのキービジュアル 12",
  },
  {
    src: "/poster-card-13.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーフリートのキービジュアル 13",
  },
  {
    src: "/poster-card-14.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダールーラーのキービジュアル 14",
  },
  {
    src: "/poster-card-15.jpeg",
    pos: "50% 50%",
    fit: "contain",
    alt: "仮面ライダーサーガ Deception Worldのタイトルポスター",
  },
  {
    src: "/poster-card-16.jpeg",
    pos: "50% 50%",
    fit: "contain",
    alt: "二人のライダーが並ぶDeception Worldのキービジュアル",
  },
  {
    src: "/poster-card-17.jpeg",
    pos: "50% 46%",
    fit: "cover",
    alt: "夜空の下で佇む青と金の仮面ライダーサーガ",
  },
  {
    src: "/poster-card-18.jpeg",
    pos: "50% 44%",
    fit: "cover",
    alt: "星の装甲をまとい座る仮面ライダーのキービジュアル",
  },
  {
    src: "/poster-card-19.jpeg",
    pos: "50% 50%",
    fit: "contain",
    alt: "雪原で赤い剣を振るうライダーの戦闘キービジュアル",
  },
  {
    src: "/poster-card-20.jpeg",
    pos: "50% 46%",
    fit: "cover",
    alt: "赤いライダーと白緑のライダーが並ぶキービジュアル",
  },
  {
    src: "/poster-card-21.jpeg",
    pos: "50% 50%",
    fit: "contain",
    alt: "白緑と青金のライダーが対峙するキービジュアル",
  },
  {
    src: "/poster-card-22.jpeg",
    pos: "50% 42%",
    fit: "cover",
    alt: "星空を宿す装甲のライダーのキービジュアル",
  },
  {
    src: "/poster-card-23.jpeg",
    pos: "50% 48%",
    fit: "cover",
    alt: "青と金の仮面ライダーサーガが構えるキービジュアル",
  },
  {
    src: "/poster-card-24.jpeg",
    pos: "50% 46%",
    fit: "cover",
    alt: "星の装甲をまとったライダーが低く構えるキービジュアル",
  },
  {
    src: "/poster-card-25.jpeg",
    pos: "50% 43%",
    fit: "cover",
    alt: "荒野で大剣を構える赤いライダーのキービジュアル",
  },
  {
    src: "/poster-card-26.jpeg",
    pos: "50% 48%",
    fit: "cover",
    alt: "森で向き合うライダーとレックス・ロワのキービジュアル",
  },
  {
    src: "/poster-card-27.jpeg",
    pos: "50% 42%",
    fit: "cover",
    alt: "赤い装甲と大剣を携えた仮面ライダーサーガのキービジュアル",
  },
  {
    src: "/poster-card-28.jpeg",
    pos: "50% 38%",
    fit: "cover",
    alt: "夕焼けの廃都に立つ多色の神装ライダー",
  },
  {
    src: "/poster-card-29.jpeg",
    pos: "50% 38%",
    fit: "cover",
    alt: "夕焼けの廃都に立つ星光のライダー",
  },
  {
    src: "/poster-card-30.jpeg",
    pos: "50% 34%",
    fit: "cover",
    alt: "紅い光を宿すヴェール姿の人物",
  },
  {
    src: "/poster-card-31.jpeg",
    pos: "50% 40%",
    fit: "cover",
    alt: "アーマードライダーモスコのキービジュアル",
  },
  {
    src: "/poster-card-32-20260825.jpeg",
    pos: "50% 50%",
    fit: "cover",
    alt: "青と桃色の光をまとった仮面ライダーサイファー",
  },
  {
    src: "/poster-card-33.jpeg",
    pos: "50% 50%",
    fit: "cover",
    alt: "夜の遊園地に立つ紅黒の装甲ライダー",
  },
  {
    src: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
    pos: "50% 28%",
    fit: "cover",
    alt: "仮面ライダーレクソナンスサーガのキービジュアル",
  },
  {
    src: "/rider-vandal-thumbnail-20260827.jpeg",
    pos: "50% 26%",
    fit: "cover",
    alt: "仮面ライダーヴァンダールの新キービジュアル",
  },
];

const RIDERS = [
  {
    id: "saga",
    no: "01",
    name: "SAGA",
    ja: "サーガ",
    person: "シエル ／ 月城悠真",
    tone: "#248cff",
    img: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
    pos: "50% 22%",
    desc: "最も弱い地点から、それでも世界の結末へ踏み込む第一のライダー。",
  },
  {
    id: "realm",
    no: "02",
    name: "REALM",
    ja: "レルム",
    person: "ベル・アレイン",
    tone: "#f14a60",
    img: "/rider-realm.jpeg",
    pos: "50% 16%",
    desc: "サーガ世界の歴史を継承し、再び戦場へ帰還した第二のライダー。",
  },
  {
    id: "lore",
    no: "03",
    name: "LORE",
    ja: "ローア",
    person: "ローア",
    tone: "#67d8ff",
    img: "/rider-loa.jpeg",
    pos: "50% 12%",
    desc: "サーガ世界を管轄し、二人と並び立つ第三のライダー。",
  },
  {
    id: "vandal",
    no: "04",
    name: "VANDAL",
    ja: "ヴァンダール",
    person: "レックス・ロワ",
    tone: "#e71a9c",
    img: "/rider-vandal-thumbnail-20260827.jpeg",
    pos: "50% 14%",
    desc: "『六詠』のレックス・ロワが変身し、肉弾戦特化の力で戦場へ立つ第四のライダー。",
  },
  {
    id: "leddic",
    no: "05",
    name: "LEDDIC",
    ja: "レディック",
    person: "在原華火 ／ 捜査一課・警部補",
    tone: "#69df74",
    img: "/rider-leddic-home.jpeg",
    pos: "50% 18%",
    desc: "規格外の幸運と無敗の体術で、本人も気付かぬまま事件の核心へ辿り着く警部補。",
  },
  {
    id: "argenome",
    no: "06",
    name: "ARGENOME",
    ja: "アルゲノム",
    person: "紅城真守",
    tone: "#d71920",
    img: "/rider-algenome.jpeg",
    pos: "50% 16%",
    desc: "幻想郷を救った紅魔館の執事。高速機動と無音の接近を両立し、ガシャコンエッジで異常を切り分ける。",
  },
  {
    id: "over-zeztz",
    no: "07",
    name: "OVER ZEZTZ",
    ja: "オーバーゼッツ",
    person: "コードナンバー：セヴン ／ ジェームズ・スミス",
    tone: "#32e1d0",
    img: "/rider-over-zeztz-thumbnail-20260829.jpg",
    pos: "50% 30%",
    desc: "陽気な軽口の奥で最適解を選び、改良型ゼッツシステムを駆るCODE英国支部の最強エージェント。",
  },
  {
    id: "cipher",
    no: "08",
    name: "CIPHER",
    ja: "サイファー",
    person: "リュシアン・ヴァレール ／ SCARS特務情報官",
    tone: "#f05bcf",
    img: "/rider-cipher-thumbnail-20260825.jpeg",
    pos: "50% 8%",
    desc: "最期の死者",
  },
];

const COLUMNS = [
  {
    no: "01",
    title: "脚本制と採録制",
    kicker: "SCRIPT / RECORD",
    body: "世界は脚本として書かれるものと、現場で採録されるものに分かれる。最上位管理人は両者の境界を管轄し、物語が現実へ漏洩する瞬間を監視する。",
    pickup: [
      "世界は脚本として書かれるものと、現場で採録されるものに分かれる。最上位管理人は両者の境界を管轄し、物語が現実へ漏洩する瞬間を監視する。",
      "脚本制は結末を先に置く。採録制は現場の選択を正史として残す。どちらが勝つかで、サーガ世界の因果はまったく別の形になる。",
      "漏洩は常に微細だ。台詞のひとこと、小道具の配置、ライダーの視線。それが現実側へ染み出したとき、管理人は記録を封じるか、物語を追認するかを決める。",
      "このコラムは確定した年表ではない。境界そのものを観測するためのフィールドノートであり、いま進行中の干渉を拾い上げている。",
    ],
  },
  {
    no: "02",
    title: "六詠",
    kicker: "RIKUEI",
    body: "世界・概念・領域・物語・法則。あらゆる層を管轄する管理人の最上位、六詠。六つの信号が揃ったとき、サーガ世界の勝敗条件は書き換えられる。",
    pickup: [
      "世界・概念・領域・物語・法則。あらゆる層を管轄する管理人の最上位、六詠。六つの信号が揃ったとき、サーガ世界の勝敗条件は書き換えられる。",
      "六詠は人格ではなく、権限の集合体として観測される。個体名が解禁されるのは、その信号が物語側へ露出した瞬間だけだ。",
      "現在フロントでは六つの個体記録を参照できる。すべての信号が露出したことで、六詠同士の関係と権限の衝突が同一の盤面上へ現れ始めている。",
      "ライダーが世界へ踏み込むたび、六詠の均衡はわずかに傾く。傾きを戻すのか、加速させるのか。それがこの時代の管轄である。",
    ],
  },
  {
    no: "03",
    title: "レジェンズ",
    kicker: "LEGENDS",
    body: "過去作から帰還するライダーと、この世界で新たに名乗りを上げる者たち。伝説は記録ではなく、いま現在進行形の干渉である。",
    pickup: [
      "過去作から帰還するライダーと、この世界で新たに名乗りを上げる者たち。伝説は記録ではなく、いま現在進行形の干渉である。",
      "仮面ライダーレルム、ベル・アレインの復活はその象徴だ。失われた信号が再び名前を持ったとき、周囲の因果は追記ではなく上書きされる。",
      "伝説扱いされた瞬間に、その人物は「終わった物語」へ送られる。レジェンズはそれを拒否し、進行中の盤面へ自ら戻ってくる。",
      "八人のライダーが交差するこの世界では、誰が伝説で誰が新参か、観測する側の権限によってすら揺らぐ。",
    ],
  },
  {
    no: "04",
    title: "ゼウス",
    kicker: "ZEUS",
    body: "ゼウスは最上位に位置する神であり、彼は5代目。初心者故に手の甲にはなんと初心者マークが付いており、管理の主権はレックスが握っている。学習能力の高さ故にレックスに軟禁されていたが……？",
    pickup: [
      "ゼウスは最上位に位置する神であり、彼は5代目。初心者故に手の甲にはなんと初心者マークが付いており、管理の主権はレックスが握っている。学習能力の高さ故にレックスに軟禁されていたが……？",
    ],
  },
];

type EpisodePickup = {
  label: string;
  displayLines?: readonly string[];
  src: string;
  pos: string;
  alt: string;
  width: number;
  height: number;
  to: string;
  assets: readonly string[];
};

type EpisodeRecord = {
  no: string;
  title: string;
  src: string;
  pos: string;
  alt: string;
  pickups?: EpisodePickup[];
};

const EPISODES: EpisodeRecord[] = [
  {
    no: "01",
    title: "HIDE-AND-SEEK",
    src: "/episode-01-hide-and-seek.jpeg",
    pos: "50% 30%",
    alt: "紫と金の装甲をまとった仮面ライダーが剣を構えるEP1のサムネイル",
    pickups: [
      {
        label: "リームー/仮面ライダーフリート",
        src: "/manager-reemu-rider.jpeg",
        pos: "50% 12%",
        alt: "リームーが変身した仮面ライダーフリート",
        width: 1086,
        height: 1448,
        to: "/managers/reemu",
        assets: MANAGER_ASSETS.reemu,
      },
      {
        label: "紅城真守/仮面ライダーアルゲノム",
        src: "/rider-profile-argenome.jpeg",
        pos: "50% 8%",
        alt: "紅城真守が変身した仮面ライダーアルゲノム",
        width: 1350,
        height: 1800,
        to: "/riders/argenome",
        assets: RIDER_NAV.find((item) => item.id === "argenome")?.assets ?? [
          "/civilian-argenome.jpeg",
        ],
      },
    ],
  },
  {
    no: "02",
    title: "LEGENDS",
    src: "/episode-02-legends.jpeg",
    pos: "50% 50%",
    alt: "赤い装甲のライダーと黒金のライダーが交戦するEP2のサムネイル",
    pickups: [
      {
        label: "仮面ライダーレルムレジェンズ",
        displayLines: ["仮面ライダーレルム", "レジェンズ"],
        src: "/rider-profile-realm.jpeg",
        pos: "50% 8%",
        alt: "仮面ライダーレルムレジェンズ",
        width: 1221,
        height: 1800,
        to: "/riders/realm",
        assets: RIDER_NAV.find((item) => item.id === "realm")?.assets ?? [
          "/civilian-bell-20260826.jpeg",
        ],
      },
      {
        label: "仮面ライダーレルム　アースフォーム",
        src: "/rider-realm-earth.jpeg",
        pos: "50% 12%",
        alt: "仮面ライダーレルム アースフォーム",
        width: 1026,
        height: 1533,
        to: "/characters/terra",
        assets: ["/character-terra.jpeg", "/character-terra-thumb.jpeg", "/rider-realm-earth.jpeg"],
      },
      {
        label: "仮面ライダーレルム　ムーンフォーム",
        src: "/rider-realm-moon.jpeg",
        pos: "50% 10%",
        alt: "仮面ライダーレルム ムーンフォーム",
        width: 1024,
        height: 1536,
        to: "/characters/luna",
        assets: ["/character-luna.jpeg", "/character-luna-thumb.jpeg", "/rider-realm-moon.jpeg"],
      },
    ],
  },
  {
    no: "03",
    title: "DECEPTION WORLD",
    src: "/episode-03-deception-world.jpeg",
    pos: "50% 18%",
    alt: "紅い夜の和風都市に青金と紅黒の仮面ライダーが並ぶEP3のサムネイル",
  },
  {
    no: "04",
    title: "殺す",
    src: "/episode-04-kill.jpeg",
    pos: "50% 16%",
    alt: "黒い衣装の人物が崩壊した街に立つEP4のサムネイル",
  },
  {
    no: "05",
    title: "FARCE",
    src: "/episode-05-farce.jpeg",
    pos: "50% 44%",
    alt: "夜の遊園地で赤黒と青金の仮面ライダーが対峙するEP5のサムネイル",
  },
];

function scrollAxisX(scroller: HTMLElement | null, child: HTMLElement | null) {
  if (!scroller || !child) return;
  const left = child.offsetLeft - (scroller.clientWidth - child.clientWidth) / 2;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
  scroller.scrollTo({ left: Math.max(0, left), behavior });
}

function bindRail(el: HTMLElement | null, onIndex: (i: number) => void) {
  if (!el) return () => undefined;
  const handler = (e: Event) => onIndex((e as CustomEvent).detail.index);
  el.addEventListener("railselect", handler);
  return () => el.removeEventListener("railselect", handler);
}

function syncRail(rail: HTMLElement | null, index: number) {
  if (!rail || rail.dataset.liquidDragging === "true") return;
  rail.querySelectorAll<HTMLElement>('button[role="tab"]').forEach((tab, i) => {
    tab.classList.toggle("is-active", i === index);
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  rail.dispatchEvent(new Event("liquidrelayout"));
}

function ArchivePlaceholder({ index, tone }: { index: number; tone: "unmanaged" | "other" }) {
  return (
    <div
      className={`archive-placeholder is-${tone}`}
      role="img"
      aria-label={`未判明の資料スロット ${index}`}
    >
      <span>{String(index).padStart(2, "0")}</span>
      <i aria-hidden="true" />
      <small>UNRESOLVED</small>
      <b>？？？</b>
    </div>
  );
}

/* Rails are memoized so poster autoplay / tab-panel state cannot reset
   the vanilla liquid-glass DOM (is-active, lens transform, WebGL bind). */
const ManagerRail = memo(
  forwardRef<HTMLDivElement>(function ManagerRail(_props, ref) {
    return (
      <div
        ref={ref}
        className="manager-archive-tabs liquid-swipe-tabs"
        role="tablist"
        aria-label="キャラクター分類"
      >
        <LiquidLens />
        <button
          id="manager-tab-0"
          type="button"
          role="tab"
          className="is-active"
          aria-selected="true"
          aria-controls="manager-panel-0"
          style={{ ["--liquid-accent" as string]: "var(--cyan)" }}
        >
          <small>FRONT / 01</small>
          <b>六詠</b>
        </button>
        <button
          id="manager-tab-1"
          type="button"
          role="tab"
          tabIndex={-1}
          aria-selected="false"
          aria-controls="manager-panel-1"
          style={{ ["--liquid-accent" as string]: "var(--red)" }}
        >
          <small>REVERSE / 02</small>
          <b>管理外</b>
        </button>
        <button
          id="manager-tab-2"
          type="button"
          role="tab"
          tabIndex={-1}
          aria-selected="false"
          aria-controls="manager-panel-2"
          style={{ ["--liquid-accent" as string]: "#69df74" }}
        >
          <small>RELATED / 03</small>
          <b>その他</b>
        </button>
      </div>
    );
  }),
);

const ColumnRail = memo(
  forwardRef<HTMLDivElement>(function ColumnRail(_props, ref) {
    return (
      <div
        ref={ref}
        className="world-column-tabs liquid-swipe-tabs"
        role="tablist"
        aria-label="コラムを選択"
      >
        <LiquidLens />
        {COLUMNS.map((c, i) => (
          <button
            key={c.no}
            type="button"
            role="tab"
            id={`column-tab-${i}`}
            aria-controls="world-column-panel"
            className={i === 0 ? "is-active" : ""}
            aria-selected={i === 0}
            tabIndex={i === 0 ? 0 : -1}
            style={{ ["--liquid-accent" as string]: "var(--gold)" }}
          >
            <small>{c.no}</small>
            <b>
              {c.title === "脚本制と採録制" ? (
                <>
                  脚本制と
                  <br className="tab-br" />
                  採録制
                </>
              ) : (
                c.title
              )}
            </b>
          </button>
        ))}
      </div>
    );
  }),
);

const PickupRail = memo(
  forwardRef<HTMLDivElement>(function PickupRail(_props, ref) {
    return (
      <div
        ref={ref}
        className="world-column-tabs world-column-dialog-tabs liquid-swipe-tabs"
        role="tablist"
        aria-label="ピックアップするコラム"
      >
        <LiquidLens />
        {COLUMNS.map((c, i) => (
          <button
            key={c.no}
            type="button"
            role="tab"
            id={`column-dialog-tab-${i}`}
            aria-controls={`column-dialog-panel-${i}`}
            className={i === 0 ? "is-active" : ""}
            aria-selected={i === 0}
            tabIndex={i === 0 ? 0 : -1}
            style={{ ["--liquid-accent" as string]: "var(--gold)" }}
          >
            <small>{c.no}</small>
            <b>
              {c.title === "脚本制と採録制" ? (
                <>
                  脚本制と
                  <br className="tab-br" />
                  採録制
                </>
              ) : (
                c.title
              )}
            </b>
          </button>
        ))}
      </div>
    );
  }),
);

const RiderRail = memo(
  forwardRef<HTMLDivElement, { initialIndex: number }>(function RiderRail({ initialIndex }, ref) {
    return (
      <div
        ref={ref}
        className="rider-tabs liquid-swipe-tabs"
        role="tablist"
        aria-label="八人のメインライダー"
      >
        <LiquidLens />
        {RIDERS.map((r, i) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            id={`rider-tab-${r.id}`}
            aria-controls="rider-active-panel"
            className={i === initialIndex ? "is-active" : ""}
            aria-selected={i === initialIndex}
            tabIndex={i === initialIndex ? 0 : -1}
            style={{
              ["--tab-tone" as string]: r.tone,
              ["--liquid-accent" as string]: r.tone,
            }}
          >
            <small>{r.no}</small>
            <span>
              {r.name === "OVER ZEZTZ" ? (
                <>
                  OVER
                  <br className="tab-br" />
                  ZEZTZ
                </>
              ) : (
                r.name
              )}
            </span>
            <i />
          </button>
        ))}
      </div>
    );
  }),
);

export function WorldHome() {
  useWorldMode();
  const { go, notifyOpeningDestination } = useLoadGate();
  const shellRef = useRef<HTMLDivElement>(null);
  const openingBrandRef = useRef<HTMLAnchorElement>(null);
  const openingSigilRef = useRef<HTMLSpanElement>(null);
  const openingHeroRef = useRef<HTMLElement>(null);
  const openingBackdropRef = useRef<HTMLDivElement>(null);
  const openingFocusRef = useRef<HTMLHeadingElement>(null);
  const [initialRiderTab, setInitialRiderTab] = useState(0);
  const [poster, setPoster] = useState(0);
  const [prevPoster, setPrevPoster] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [ambientPaused, setAmbientPaused] = useState(
    () =>
      typeof document !== "undefined" &&
      (document.hidden || document.documentElement.hasAttribute("data-opening-handoff-active")),
  );
  const [managerTab, setManagerTab] = useState(0);
  const [columnTab, setColumnTab] = useState(0);
  const [riderTab, setRiderTab] = useState(0);
  const [previousRiderTab, setPreviousRiderTab] = useState<number | null>(null);
  const [episode, setEpisode] = useState(0);
  const [episodePickup, setEpisodePickup] = useState<number | null>(null);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  const [motionReduced, setMotionReduced] = useState(false);
  const [activeSection, setActiveSection] = useState<"story" | "riders" | "records" | null>(null);
  const managerRail = useRef<HTMLDivElement>(null);
  const columnRail = useRef<HTMLDivElement>(null);
  const riderRail = useRef<HTMLDivElement>(null);
  const episodeGridRef = useRef<HTMLDivElement>(null);
  const episodePickupDialogRef = useRef<HTMLDialogElement>(null);
  const episodePickupTriggerRef = useRef<HTMLButtonElement | null>(null);
  const episodePickupOpenedByKeyboard = useRef(false);
  const episodePointerFocusTimer = useRef<number | null>(null);
  const episodeScrollTimer = useRef<number | null>(null);
  const cancelEpisodePickupScrollReset = useRef<(() => void) | null>(null);
  const pickupBtnRef = useRef<HTMLButtonElement>(null);
  const pickupDialogRef = useRef<HTMLDialogElement>(null);
  const danteDialogRef = useRef<HTMLDialogElement>(null);
  const pickupRail = useRef<HTMLDivElement>(null);
  const pickupCloseTimer = useRef<number | null>(null);
  const cancelColumnPickupScrollReset = useRef<(() => void) | null>(null);
  const shuffleTimers = useRef<number[]>([]);
  const shuffleActive = useRef(false);
  const shuffleRunId = useRef(0);
  const danteOpenTimer = useRef<number | null>(null);
  const danteCloseTimer = useRef<number | null>(null);
  const episodeProgrammatic = useRef(false);
  const riderTabRef = useRef(riderTab);
  const riderTransitionTimer = useRef<number | null>(null);
  const pausedAmbientAnimations = useRef<Animation[]>([]);

  useLayoutEffect(() => {
    const returnId = readRiderReturn();
    const returnIndex = returnId == null ? -1 : RIDERS.findIndex((rider) => rider.id === returnId);
    if (returnIndex < 0) return;
    riderTabRef.current = returnIndex;
    setInitialRiderTab(returnIndex);
    setRiderTab(returnIndex);
  }, []);

  useLayoutEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let retryFrame = 0;
    let cancelled = false;
    // LoadGate keeps the destination handshake open for 2.2s. Keep probing
    // connected targets for almost that whole window instead of assuming a
    // fixed 24-frame budget, which can expire early on throttled devices.
    const destinationReadyDeadline = window.performance.now() + 2_000;

    const announceDestination = () => {
      if (cancelled) return;
      const destination = {
        path: "/world",
        brand: openingBrandRef.current,
        sigil: openingSigilRef.current,
        hero: openingHeroRef.current,
        backdrop: openingBackdropRef.current,
        focus: openingFocusRef.current,
      };
      const targets = [
        destination.brand,
        destination.sigil,
        destination.hero,
        destination.backdrop,
        destination.focus,
      ];

      if (
        window.location.pathname === destination.path &&
        targets.every((target) => target?.isConnected)
      ) {
        notifyOpeningDestination(destination);
        return;
      }

      if (window.performance.now() < destinationReadyDeadline) {
        retryFrame = window.requestAnimationFrame(announceDestination);
      }
    };

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        announceDestination();
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(retryFrame);
    };
  }, [notifyOpeningDestination]);

  useEffect(() => {
    let handoffActive = document.documentElement.hasAttribute("data-opening-handoff-active");
    const syncAmbientPause = () => {
      setAmbientPaused(document.hidden || handoffActive);
    };
    const handleVisibilityChange = () => {
      handoffActive = document.documentElement.hasAttribute("data-opening-handoff-active");
      syncAmbientPause();
    };
    const handleOpeningHandoff = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      handoffActive =
        typeof detail?.active === "boolean"
          ? detail.active
          : document.documentElement.hasAttribute("data-opening-handoff-active");
      syncAmbientPause();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("deception-world:opening-handoff", handleOpeningHandoff);
    syncAmbientPause();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("deception-world:opening-handoff", handleOpeningHandoff);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setMotionReduced(media.matches);
    syncMotionPreference();
    media.addEventListener?.("change", syncMotionPreference);
    return () => media.removeEventListener?.("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    clearRiderReturn();
  }, []);

  const selectRider = useCallback((next: number) => {
    const current = riderTabRef.current;
    if (current === next) return;
    if (riderTransitionTimer.current != null) window.clearTimeout(riderTransitionTimer.current);
    setPreviousRiderTab(current);
    riderTabRef.current = next;
    setRiderTab(next);
    riderTransitionTimer.current = window.setTimeout(() => {
      setPreviousRiderTab(null);
      riderTransitionTimer.current = null;
    }, 220);
  }, []);

  useEffect(() => {
    const off1 = bindRail(managerRail.current, setManagerTab);
    const off2 = bindRail(columnRail.current, setColumnTab);
    const off3 = bindRail(riderRail.current, selectRider);
    const off4 = bindRail(pickupRail.current, setColumnTab);
    let disposeGlass: (() => void) | undefined;
    const id = requestAnimationFrame(() => {
      disposeGlass = bootLiquidGlass(document);
    });
    return () => {
      off1();
      off2();
      off3();
      off4();
      cancelAnimationFrame(id);
      disposeGlass?.();
    };
  }, [selectRider]);

  useEffect(() => {
    if (locked || ambientPaused || motionReduced || !heroVisible) return;
    const t = window.setInterval(() => {
      setPoster((p) => {
        setPrevPoster(p);
        return (p + 1) % POSTERS.length;
      });
    }, 5200);
    return () => window.clearInterval(t);
  }, [ambientPaused, heroVisible, locked, motionReduced]);

  useEffect(() => {
    if (ambientPaused || motionReduced || !heroVisible) return;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g"
    )
      return;
    const timer = window.setTimeout(() => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = POSTERS[(poster + 2) % POSTERS.length].src;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [ambientPaused, heroVisible, motionReduced, poster]);

  useEffect(() => {
    if (!ambientPaused) {
      const paused = pausedAmbientAnimations.current;
      pausedAmbientAnimations.current = [];
      paused.forEach((animation) => {
        if (animation.playState !== "paused") return;
        try {
          animation.play();
        } catch {
          // A route handoff can detach one animated node while the remaining
          // ambient loops are still valid. Resume each loop independently.
        }
      });
      return;
    }
    const pauseInfiniteAnimations = () => {
      const shell = shellRef.current;
      if (!shell || typeof shell.getAnimations !== "function") return;
      const runningLoops = shell
        .getAnimations({ subtree: true })
        .filter(
          (animation) =>
            animation.playState === "running" &&
            animation.effect?.getTiming().iterations === Infinity,
        );
      runningLoops.forEach((animation) => animation.pause());
      pausedAmbientAnimations.current = Array.from(
        new Set([...pausedAmbientAnimations.current, ...runningLoops]),
      );
    };
    pauseInfiniteAnimations();
    const frame = window.requestAnimationFrame(pauseInfiniteAnimations);
    return () => window.cancelAnimationFrame(frame);
  }, [ambientPaused]);

  useEffect(() => {
    if ((!ambientPaused && !motionReduced) || !shuffleActive.current) return;
    shuffleRunId.current += 1;
    shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
    shuffleTimers.current = [];
    shuffleActive.current = false;
    setShuffling(false);
  }, [ambientPaused, motionReduced]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof IntersectionObserver === "undefined") return;
    const regions = shell.querySelectorAll<HTMLElement>("[data-performance-region]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          (entry.target as HTMLElement).dataset.viewportActive = String(entry.isIntersecting);
          if (entry.target === openingHeroRef.current) setHeroVisible(entry.isIntersecting);
        });
      },
      { rootMargin: "240px 0px" },
    );
    regions.forEach((region) => observer.observe(region));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections = (["story", "riders", "records"] as const)
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section != null);
    if (!sections.length) return;
    let frame = 0;
    const syncActiveSection = () => {
      frame = 0;
      const marker = Math.max(92, Math.min(200, window.innerHeight * 0.22));
      let current: "story" | "riders" | "records" | null = null;
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= marker) {
          current = section.id as "story" | "riders" | "records";
        }
      });
      setActiveSection(current);
    };
    const requestSectionSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncActiveSection);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(requestSectionSync);
    sections.forEach((section) => resizeObserver?.observe(section));
    window.addEventListener("scroll", requestSectionSync, { passive: true });
    window.addEventListener("resize", requestSectionSync, { passive: true });
    window.visualViewport?.addEventListener("resize", requestSectionSync, { passive: true });
    syncActiveSection();
    return () => {
      window.removeEventListener("scroll", requestSectionSync);
      window.removeEventListener("resize", requestSectionSync);
      window.visualViewport?.removeEventListener("resize", requestSectionSync);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const grid = episodeGridRef.current;
    if (!grid) return;
    let frame = 0;
    const releaseProgrammaticScroll = () => {
      episodeProgrammatic.current = false;
      if (episodeScrollTimer.current != null) {
        window.clearTimeout(episodeScrollTimer.current);
        episodeScrollTimer.current = null;
      }
    };
    const syncFromScroll = () => {
      frame = 0;
      if (episodeProgrammatic.current) return;
      const cards = Array.from(grid.querySelectorAll<HTMLElement>(".episode-card"));
      if (!cards.length) return;
      const mid = grid.scrollLeft + grid.clientWidth / 2;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      cards.forEach((card, i) => {
        const center = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setEpisode((cur) => (cur === best ? cur : best));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(syncFromScroll);
    };
    grid.addEventListener("pointerdown", releaseProgrammaticScroll, { passive: true });
    grid.addEventListener("wheel", releaseProgrammaticScroll, { passive: true });
    grid.addEventListener("scroll", onScroll, { passive: true });
    grid.addEventListener("scrollend", syncFromScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      grid.removeEventListener("pointerdown", releaseProgrammaticScroll);
      grid.removeEventListener("wheel", releaseProgrammaticScroll);
      grid.removeEventListener("scroll", onScroll);
      grid.removeEventListener("scrollend", syncFromScroll);
    };
  }, []);

  useEffect(() => {
    syncRail(columnRail.current, columnTab);
    syncRail(pickupRail.current, columnTab);
  }, [columnTab]);

  useEffect(() => {
    syncRail(riderRail.current, riderTab);
  }, [riderTab]);

  useEffect(() => {
    return () => {
      if (pickupCloseTimer.current != null) window.clearTimeout(pickupCloseTimer.current);
      shuffleRunId.current += 1;
      shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
      shuffleActive.current = false;
      if (danteOpenTimer.current != null) window.clearTimeout(danteOpenTimer.current);
      if (danteCloseTimer.current != null) window.clearTimeout(danteCloseTimer.current);
      if (riderTransitionTimer.current != null) window.clearTimeout(riderTransitionTimer.current);
      if (episodeScrollTimer.current != null) window.clearTimeout(episodeScrollTimer.current);
      if (episodePointerFocusTimer.current != null) {
        window.clearTimeout(episodePointerFocusTimer.current);
      }
      cancelEpisodePickupScrollReset.current?.();
      cancelColumnPickupScrollReset.current?.();
    };
  }, []);
  const current = POSTERS[poster];
  const previous = prevPoster != null ? POSTERS[prevPoster] : null;
  const nextPoster = POSTERS[(poster + 1) % POSTERS.length];
  const rider = RIDERS[riderTab];
  const column = COLUMNS[columnTab];
  const selectedEpisodePickup = episodePickup == null ? null : EPISODES[episodePickup];

  const goPoster = (next: number | ((p: number) => number)) => {
    setPoster((p) => {
      const n = typeof next === "function" ? next(p) : next;
      const wrapped = ((n % POSTERS.length) + POSTERS.length) % POSTERS.length;
      if (wrapped !== p) setPrevPoster(p);
      return wrapped;
    });
  };

  const shufflePoster = () => {
    if (ambientPaused || shuffleActive.current) return;
    shuffleActive.current = true;
    setLocked(true);
    const runId = ++shuffleRunId.current;
    shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
    shuffleTimers.current = [];

    const randomBelow = (upperBound: number) => {
      if (typeof window.crypto?.getRandomValues !== "function") {
        return Math.floor(Math.random() * upperBound);
      }
      const values = new Uint32Array(1);
      const rejectionLimit = Math.floor(0x1_0000_0000 / upperBound) * upperBound;
      do {
        window.crypto.getRandomValues(values);
      } while (values[0] >= rejectionLimit);
      return values[0] % upperBound;
    };
    const posterSequence = POSTERS.map((_, index) => index).filter((index) => index !== poster);
    for (let index = posterSequence.length - 1; index > 0; index -= 1) {
      const swapIndex = randomBelow(index + 1);
      [posterSequence[index], posterSequence[swapIndex]] = [
        posterSequence[swapIndex],
        posterSequence[index],
      ];
    }
    const finalPoster = posterSequence.pop() ?? (poster + 1) % POSTERS.length;
    const previewPool = [
      poster,
      prevPoster ?? poster,
      (poster + 1) % POSTERS.length,
      (poster + 2) % POSTERS.length,
    ].filter((value, index, values) => values.indexOf(value) === index);
    for (let index = previewPool.length - 1; index > 0; index -= 1) {
      const swapIndex = randomBelow(index + 1);
      [previewPool[index], previewPool[swapIndex]] = [previewPool[swapIndex], previewPool[index]];
    }
    const previewPosters = Array.from(
      { length: 9 },
      (_, index) => previewPool[index % previewPool.length],
    );
    const finalImage = new Image();
    finalImage.decoding = "async";
    finalImage.fetchPriority = "high";
    finalImage.src = POSTERS[finalPoster].src;
    const finalReady =
      finalImage
        .decode?.()
        .then(() => true)
        .catch(() => finalImage.complete && finalImage.naturalWidth > 0) ??
      Promise.resolve(finalImage.complete && finalImage.naturalWidth > 0);
    const waitForFinalImage = () =>
      Promise.race([
        finalReady,
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 480)),
      ]);
    if (motionReduced) {
      void waitForFinalImage().then((ready) => {
        if (!shuffleActive.current || shuffleRunId.current !== runId) return;
        if (ready || (finalImage.complete && finalImage.naturalWidth > 0)) goPoster(finalPoster);
        shuffleActive.current = false;
      });
      return;
    }

    setShuffling(true);
    [0, 75, 155, 240, 335, 440, 560, 695, 850, 1025].forEach((delay, index, steps) => {
      const timer = window.setTimeout(async () => {
        const isFinalStep = index === steps.length - 1;
        const ready = isFinalStep ? await waitForFinalImage() : true;
        if (!shuffleActive.current || shuffleRunId.current !== runId) return;
        const next = isFinalStep ? finalPoster : previewPosters[index % previewPosters.length];
        if (!isFinalStep || ready || (finalImage.complete && finalImage.naturalWidth > 0)) {
          goPoster(next);
        }
        if (isFinalStep) {
          const settleTimer = window.setTimeout(() => {
            setShuffling(false);
            shuffleActive.current = false;
            shuffleTimers.current = [];
          }, 300);
          shuffleTimers.current.push(settleTimer);
        }
      }, delay);
      shuffleTimers.current.push(timer);
    });
  };

  const closeDante = () => {
    if (danteCloseTimer.current != null) {
      window.clearTimeout(danteCloseTimer.current);
      danteCloseTimer.current = null;
    }
    const dlg = danteDialogRef.current;
    if (dlg?.open) dlg.close();
  };

  const goEpisode = (index: number) => {
    const next = Math.max(0, Math.min(EPISODES.length - 1, index));
    setEpisode(next);
    const card = episodeGridRef.current?.querySelectorAll<HTMLElement>(".episode-card")[next];
    episodeProgrammatic.current = true;
    scrollAxisX(episodeGridRef.current, card ?? null);
    if (episodeScrollTimer.current != null) window.clearTimeout(episodeScrollTimer.current);
    episodeScrollTimer.current = window.setTimeout(() => {
      episodeProgrammatic.current = false;
      episodeScrollTimer.current = null;
    }, 520);
  };

  const openEpisodePickup = (
    index: number,
    trigger: HTMLButtonElement,
    openedByKeyboard: boolean,
  ) => {
    const dialog = episodePickupDialogRef.current;
    if (!dialog || !EPISODES[index]?.pickups?.length) return;
    if (episodePointerFocusTimer.current != null) {
      window.clearTimeout(episodePointerFocusTimer.current);
      episodePointerFocusTimer.current = null;
    }
    episodeGridRef.current?.removeAttribute("data-pointer-focus-suppressed");
    goEpisode(index);
    episodePickupTriggerRef.current = trigger;
    episodePickupOpenedByKeyboard.current = openedByKeyboard;
    setEpisodePickup(index);
    cancelEpisodePickupScrollReset.current?.();
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        /* already open */
      }
    }
    if (!openedByKeyboard) dialog.focus({ preventScroll: true });
    cancelEpisodePickupScrollReset.current = settlePickupScroll(
      dialog,
      [".episode-pickup-panel"],
      () => {
        if (episodePickupOpenedByKeyboard.current) {
          dialog
            .querySelector<HTMLButtonElement>(".episode-pickup-close")
            ?.focus({ preventScroll: true });
        } else {
          dialog.focus({ preventScroll: true });
        }
      },
    );
  };

  const closeEpisodePickup = () => {
    cancelEpisodePickupScrollReset.current?.();
    cancelEpisodePickupScrollReset.current = null;
    const dialog = episodePickupDialogRef.current;
    if (dialog?.open) dialog.close();
  };

  const openPickup = () => {
    const dlg = pickupDialogRef.current;
    if (!dlg) return;
    if (pickupCloseTimer.current != null) {
      window.clearTimeout(pickupCloseTimer.current);
      pickupCloseTimer.current = null;
    }
    delete dlg.dataset.closing;
    cancelColumnPickupScrollReset.current?.();
    if (!dlg.open) {
      try {
        dlg.showModal();
      } catch {
        /* already open */
      }
    }
    // WebKit otherwise auto-focuses the first column tab for a frame after a
    // pointer slide, making column 01 look selected even when another column
    // is active. Move focus to the neutral dialog surface immediately; the
    // rail remains keyboard-accessible when a user deliberately tabs into it.
    dlg.focus({ preventScroll: true });
    setPickupOpen(true);
    syncRail(pickupRail.current, columnTab);
    cancelColumnPickupScrollReset.current = settlePickupScroll(
      dlg,
      [".world-column-dialog-card"],
      () => {
        bootLiquidGlass(dlg);
        pickupRail.current?.dispatchEvent(new Event("liquidrelayout"));
        dlg.focus({ preventScroll: true });
      },
    );
  };

  const closePickup = (event?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
    event?.stopPropagation?.();
    const dlg = pickupDialogRef.current;
    if (!dlg?.open) {
      setPickupOpen(false);
      return;
    }
    if (dlg.dataset.closing === "true") return;
    cancelColumnPickupScrollReset.current?.();
    cancelColumnPickupScrollReset.current = null;
    dlg.dataset.closing = "true";
    if (pickupCloseTimer.current != null) window.clearTimeout(pickupCloseTimer.current);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pickupCloseTimer.current = window.setTimeout(
      () => {
        try {
          dlg.close();
        } catch {
          /* already closed */
        }
        delete dlg.dataset.closing;
        pickupCloseTimer.current = null;
        setPickupOpen(false);
      },
      reducedMotion ? 0 : 360,
    );
  };

  return (
    <main ref={shellRef} className="site-shell motion-on" data-motion-enabled="true">
      <SideMenuLayer open={sideMenuOpen} onOpenChange={setSideMenuOpen} />
      <div className="ambient" aria-hidden="true">
        <div className="ambient-grid" />
        <div className="ambient-orb orb-a" />
        <div className="ambient-orb orb-b" />
        <div className="grain" />
      </div>

      <header className="topbar">
        <div className="topbar-leading">
          <a
            ref={openingBrandRef}
            className="brand"
            href="#top"
            aria-label="Deception World トップへ"
          >
            <span ref={openingSigilRef} className="brand-sigil">
              <i>DW</i>
            </span>
            <span>
              <b>DECEPTION WORLD</b>
              <small>KAMEN RIDER SAGA</small>
            </span>
          </a>
        </div>
        <nav aria-label="メインメニュー">
          <a href="#story" aria-current={activeSection === "story" ? "location" : undefined}>
            STORY
          </a>
          <a href="#riders" aria-current={activeSection === "riders" ? "location" : undefined}>
            RIDERS
          </a>
          <a href="#records" aria-current={activeSection === "records" ? "location" : undefined}>
            RECORDS
          </a>
        </nav>
        <div className="topbar-actions">
          <SideMenuTrigger open={sideMenuOpen} onOpenChange={setSideMenuOpen} />
        </div>
      </header>
      <section ref={openingHeroRef} className="hero" id="top" data-performance-region>
        <div ref={openingBackdropRef} className="hero-backdrop" aria-hidden="true">
          {previous ? (
            <span
              className="hero-backdrop-layer hero-backdrop-previous"
              key={`hb-prev-${prevPoster}`}
            >
              <img
                src={previous.src}
                alt=""
                style={{ objectPosition: previous.pos }}
                decoding="async"
              />
            </span>
          ) : null}
          <span className="hero-backdrop-layer hero-backdrop-current" key={`hb-${poster}`}>
            <img
              src={current.src}
              alt=""
              style={{ objectPosition: current.pos }}
              fetchPriority="high"
              decoding="async"
            />
          </span>
        </div>
        <div className="hero-copy">
          <p className="anime-work-title">
            <span>仮面ライダーサーガ 劇場版第二作</span>
            <b>DECEPTION WORLD</b>
          </p>
          <p className="eyebrow">
            <span>THE SECOND SAGA</span>
            <i />
          </p>
          <h1 ref={openingFocusRef} tabIndex={-1} data-opening-handoff-focus-target>
            <span>世界は、</span>
            <strong>欺瞞でできている。</strong>
          </h1>
          <p className="hero-lead">
            救うべきものは、夢の向こうにはない。
            <br />
            6人の最上位管理人と、8人のライダーが同じ世界で交差する。
          </p>
          <div className="hero-actions">
            <a className="primary-action ios26-glass" href="#story" data-liquid-pointer="true">
              <LiquidPointerGlow />
              <span>ENTER THE WORLD</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </a>
            <a className="text-action" href="#poster-stage">
              POSTER
            </a>
          </div>
          <div className="hero-metadata" aria-label="作品情報">
            <span>
              <small>FORMAT</small>
              <b>ORIGINAL MOVIE</b>
            </span>
            <span>
              <small>WORLD</small>
              <b>SAGA / REALITY</b>
            </span>
            <span>
              <small>STATUS</small>
              <b>THE STORY CONTINUES</b>
            </span>
          </div>
        </div>

        <div className={shuffling ? "poster-stage is-shuffling" : "poster-stage"} id="poster-stage">
          <div
            className={shuffling ? "poster-deck is-shuffling" : "poster-deck"}
            aria-busy={shuffling}
          >
            <div className="poster-back-card poster-back-card-1" aria-hidden="true">
              <img
                src={nextPoster.src}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
            </div>
            <div className="poster-back-card poster-back-card-2" aria-hidden="true">
              <img src={current.src} alt="" loading="lazy" decoding="async" fetchPriority="low" />
            </div>
            <div className="poster-back-card poster-back-card-3" aria-hidden="true">
              <img src={current.src} alt="" loading="lazy" decoding="async" fetchPriority="low" />
            </div>
            <div className="poster-back-card poster-back-card-4" aria-hidden="true">
              <img src={current.src} alt="" loading="lazy" decoding="async" fetchPriority="low" />
            </div>
            <div className="poster-frame">
              <span className="poster-holo-ring" aria-hidden="true" />
              <div className="poster-media">
                {previous ? (
                  <img
                    className="poster-image poster-image-previous"
                    key={`poster-prev-${prevPoster}`}
                    src={previous.src}
                    alt=""
                    style={{
                      objectPosition: previous.pos,
                      objectFit: previous.fit === "contain" ? "contain" : "cover",
                    }}
                    onAnimationEnd={() => setPrevPoster(null)}
                  />
                ) : null}
                <img
                  className={
                    current.fit === "contain"
                      ? "poster-image poster-image-current is-contain"
                      : "poster-image poster-image-current"
                  }
                  key={`poster-${poster}`}
                  src={current.src}
                  alt={current.alt}
                  style={{
                    objectPosition: current.pos,
                    objectFit: current.fit === "contain" ? "contain" : "cover",
                  }}
                  fetchPriority="high"
                  decoding="async"
                />
                <span className="poster-sheen" aria-hidden="true" />
              </div>
              <span className="corner corner-tl" aria-hidden="true" />
              <span className="corner corner-tr" aria-hidden="true" />
              <span className="corner corner-bl" aria-hidden="true" />
              <span className="corner corner-br" aria-hidden="true" />
            </div>
          </div>
          <div className="orbit" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <div className="poster-index">
            <span>KEY VISUAL</span>
            <b>{String(poster + 1).padStart(2, "0")}</b>
          </div>
          <div className="poster-controls">
            <div className="poster-control-cluster" role="group" aria-label="キービジュアル操作">
              <button
                type="button"
                className="poster-shuffle ios26-glass"
                data-liquid-pointer="true"
                disabled={shuffling}
                aria-busy={shuffling}
                onClick={shufflePoster}
              >
                <LiquidPointerGlow />
                <span aria-hidden="true">
                  <UiVectorIcon kind="shuffle" size={18} />
                </span>
                <b>{shuffling ? "SHUFFLING..." : "SHUFFLE POSTER"}</b>
              </button>
              <button
                type="button"
                className="poster-reset ios26-glass"
                data-liquid-pointer="true"
                disabled={poster === 0 || shuffling}
                onClick={() => goPoster(0)}
              >
                <LiquidPointerGlow />
                <span aria-hidden="true">
                  <UiVectorIcon kind="reset" size={17} />
                </span>
                <b>RESET</b>
              </button>
              <button
                type="button"
                className={
                  locked
                    ? "poster-lock ios26-glass is-locked"
                    : "poster-lock ios26-glass is-unlocked"
                }
                data-liquid-pointer="true"
                aria-pressed={locked}
                aria-label={
                  locked ? "ロックを解除して自動切替にする" : "ポスターをロックして固定する"
                }
                disabled={shuffling}
                onClick={() => setLocked((v) => !v)}
              >
                <LiquidPointerGlow />
                <span aria-hidden="true">
                  {locked ? (
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path
                        d="M8 10V8a4 4 0 0 1 8 0v2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <rect
                        x="6"
                        y="10"
                        width="12"
                        height="10"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path
                        d="M8 10V8a4 4 0 0 1 7.5-2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <rect
                        x="6"
                        y="10"
                        width="12"
                        height="10"
                        rx="2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </span>
                <b>
                  <small>{locked ? "LOCKED" : "AUTO"}</small>
                  {locked ? "固定中" : "自動切替"}
                </b>
              </button>
            </div>
            <output>
              {String(poster + 1).padStart(2, "0")} / {String(POSTERS.length).padStart(2, "0")}
            </output>
          </div>
        </div>
        <a className="scroll-cue" href="#story">
          <span>SCROLL TO DESCEND</span>
          <i />
        </a>
      </section>

      <section className="story-section" id="story">
        <div className="section-index">
          <span>01</span>
          <small>WORLD / STORY</small>
        </div>
        <div className="story-layout">
          <div className="story-heading">
            <p className="eyebrow">
              <span>THIS IS NOT A DREAM</span>
              <i />
            </p>
            <h2>
              救うべき世界は、
              <br />
              <em>現実</em>にある。
            </h2>
          </div>
          <div className="story-copy">
            <p className="story-lead story-lead-sequel">
              <span>『ドリームチャプター』に続く</span>
              <span>劇場版第二作</span>
            </p>
            <p>
              世界、概念、領域、物語、法則。あらゆるものを管轄する管理人。その最上位に位置する六つの存在が、サーガ世界の行く末へ干渉を始める。
            </p>
            <p>
              シエル、ベル、ローア、レックス、華火、真守、ジェームズ、リュシアン。異なる立場を背負った八人は、ひとつの結末へ向けて交差する。
            </p>
          </div>
        </div>

        <div className="threat-panel" id="manager-archive" data-performance-region>
          <div className="threat-copy">
            <span className="system-label">MANAGER ARCHIVE</span>
            <h3>
              SIX SIGNALS
              <br />
              ABOVE THE WORLD.
            </h3>
            <p>最上位管理人、六詠。六つの個体記録を照合できます。</p>
          </div>
          <div className="signal-column">
            <ManagerRail ref={managerRail} />

            {managerTab === 0 ? (
              <div
                id="manager-panel-0"
                key="managers"
                className="manager-archive-panel is-managers"
                role="tabpanel"
                aria-labelledby="manager-tab-0"
              >
                <div
                  className="manager-slot-grid signal-array"
                  aria-label="六詠を示す6つのシグナル"
                >
                  <GuardedLink
                    className="signal has-visual is-accessible is-face-safe zeus-signal"
                    to="/managers/zeus"
                    assets={MANAGER_ASSETS.zeus}
                    style={{ ["--delay" as string]: "0s" }}
                    aria-label="六詠I ゼウスの個別資料を開く"
                  >
                    <img
                      src="/manager-zeus-thumb.jpeg"
                      alt="ゼウスのキャラクタービジュアル"
                      width={640}
                      height={497}
                      style={{ objectPosition: "50% 0%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>I</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>ゼウス</b>
                    <em className="signal-apex" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M12 1.5 14.4 9.6 22.5 12l-8.1 2.4L12 22.5l-2.4-8.1L1.5 12l8.1-2.4L12 1.5Z" />
                      </svg>
                    </em>
                  </GuardedLink>
                  <GuardedLink
                    className="signal has-visual is-accessible"
                    to="/managers/rex-loi"
                    assets={MANAGER_ASSETS["rex-loi"]}
                    style={{ ["--delay" as string]: "0.16s" }}
                  >
                    <img
                      src="/manager-rex-loi-thumb.jpeg"
                      alt="レックス・ロワのキャラクタービジュアル"
                      width={640}
                      height={960}
                      style={{ objectPosition: "50% 0%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>II</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>レックス・ロワ</b>
                  </GuardedLink>
                  <GuardedLink
                    className="signal has-visual is-accessible"
                    to="/managers/shuza"
                    assets={MANAGER_ASSETS.shuza}
                    style={{ ["--delay" as string]: "0.32s" }}
                  >
                    <img
                      src="/manager-shuza-thumb.jpeg"
                      alt="シュザのキャラクタービジュアル"
                      width={640}
                      height={913}
                      style={{ objectPosition: "50% 16%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>III</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>シュザ</b>
                  </GuardedLink>
                  <GuardedLink
                    className="signal has-visual is-accessible lejas-signal"
                    to="/managers/lejas"
                    assets={MANAGER_ASSETS.lejas}
                    style={{ ["--delay" as string]: "0.48s" }}
                    aria-label="六詠IV レジャスの個別資料を開く"
                  >
                    <img
                      src="/manager-lejas-portrait-thumb.jpeg"
                      alt="レジャスの顔アップ"
                      width={640}
                      height={799}
                      style={{ objectPosition: "50% 8%", objectFit: "cover" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>IV</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>レジャス</b>
                  </GuardedLink>
                  <GuardedLink
                    className="signal has-visual is-accessible is-face-safe"
                    to="/managers/opus"
                    assets={MANAGER_ASSETS.opus}
                    style={{ ["--delay" as string]: "0.64s" }}
                    aria-label="六詠V オパスの個別資料を開く"
                  >
                    <img
                      src="/manager-opus-thumb.jpeg"
                      alt="オパスのキャラクタービジュアル"
                      width={640}
                      height={851}
                      style={{ objectPosition: "50% 0%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>V</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>オパス</b>
                  </GuardedLink>
                  <GuardedLink
                    className="signal has-visual is-accessible"
                    to="/managers/reemu"
                    assets={MANAGER_ASSETS.reemu}
                    style={{ ["--delay" as string]: "0.8s" }}
                  >
                    <img
                      src="/manager-reemu-thumb.jpeg"
                      alt="リームーのキャラクタービジュアル"
                      width={540}
                      height={960}
                      style={{ objectPosition: "50% 14%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>VI</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>リームー</b>
                  </GuardedLink>
                </div>
              </div>
            ) : managerTab === 1 ? (
              <div
                id="manager-panel-1"
                key="unmanaged"
                className="manager-archive-panel is-unmanaged"
                role="tabpanel"
                aria-labelledby="manager-tab-1"
              >
                <p className="visually-hidden">管理外。個体情報へのアクセスは制限されています。</p>
                <div className="manager-slot-grid unmanaged-array" aria-label="管理外">
                  <button
                    className="dante-archive"
                    type="button"
                    aria-label="管理人殺し ダンテへのアクセスを試みる"
                    onClick={(e) => {
                      if (danteOpenTimer.current != null) return;
                      const host = e.currentTarget;
                      host.classList.add("is-glitching");
                      danteOpenTimer.current = window.setTimeout(() => {
                        danteOpenTimer.current = null;
                        host.classList.remove("is-glitching");
                        const dlg = danteDialogRef.current;
                        if (!dlg) return;
                        if (danteCloseTimer.current != null)
                          window.clearTimeout(danteCloseTimer.current);
                        try {
                          dlg.showModal();
                        } catch {
                          /* already open */
                        }
                        (document.activeElement as HTMLElement | null)?.blur();
                        const inner = dlg.querySelector(".dante-denied-inner");
                        inner?.classList.remove("is-slam");
                        void (inner as HTMLElement | null)?.offsetWidth;
                        inner?.classList.add("is-slam");
                        danteCloseTimer.current = window.setTimeout(() => {
                          danteCloseTimer.current = null;
                          if (dlg.open) dlg.close();
                        }, 2600);
                      }, 420);
                    }}
                  >
                    <span className="dante-visual">
                      <img
                        src="/manager-killer-dante.jpeg"
                        alt="ダンテのキャラクタービジュアル"
                        width={1416}
                        height={1756}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="dante-copy">
                      <small>ANOMALOUS RECORD</small>
                      <b>DANTE</b>
                      <em>管理人殺し</em>
                      <i>ACCESS //</i>
                    </span>
                  </button>
                  {Array.from({ length: 5 }, (_, index) => (
                    <ArchivePlaceholder key={index} index={index + 2} tone="unmanaged" />
                  ))}
                </div>
              </div>
            ) : (
              <div
                id="manager-panel-2"
                key="other"
                className="manager-archive-panel is-other"
                role="tabpanel"
                aria-labelledby="manager-tab-2"
              >
                <p className="visually-hidden">その他の関連資料</p>
                <div className="manager-slot-grid other-array" aria-label="その他">
                  <GuardedLink
                    className="other-archive-card"
                    to="/characters/terra"
                    assets={[
                      "/character-terra.jpeg",
                      "/character-terra-thumb.jpeg",
                      "/rider-realm-earth.jpeg",
                    ]}
                    aria-label="テラ・アレインの個別資料を開く"
                  >
                    <img
                      src="/character-terra-thumb.jpeg"
                      alt="テラ・アレインのキャラクタービジュアル"
                      width={720}
                      height={954}
                      style={{ objectPosition: "50% 12%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="other-card-shade" aria-hidden="true" />
                    <span className="other-card-code">RELATED / 01</span>
                    <span className="other-card-copy">
                      <small>TERRA ALAIN</small>
                      <b>
                        <NameText value="テラ・アレイン" />
                      </b>
                      <i>レルム アースフォーム</i>
                    </span>
                  </GuardedLink>
                  <GuardedLink
                    className="other-archive-card"
                    to="/characters/luna"
                    assets={[
                      "/character-luna.jpeg",
                      "/character-luna-thumb.jpeg",
                      "/rider-realm-moon.jpeg",
                    ]}
                    aria-label="ルナ・アレインの個別資料を開く"
                  >
                    <img
                      src="/character-luna-thumb.jpeg"
                      alt="ルナ・アレインのキャラクタービジュアル"
                      width={720}
                      height={1260}
                      style={{ objectPosition: "50% 12%" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="other-card-shade" aria-hidden="true" />
                    <span className="other-card-code">RELATED / 02</span>
                    <span className="other-card-copy">
                      <small>LUNA ALAIN</small>
                      <b>
                        <NameText value="ルナ・アレイン" />
                      </b>
                      <i>レルム ムーンフォーム</i>
                    </span>
                  </GuardedLink>
                  {Array.from({ length: 4 }, (_, index) => (
                    <ArchivePlaceholder key={index} index={index + 3} tone="other" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="world-column" aria-label="世界観コラム" data-performance-region>
          <div className="world-column-content">
            <div className="world-column-index">
              <span>WORLD COLUMN</span>
              <ColumnRail ref={columnRail} />
            </div>
            <div
              id="world-column-panel"
              className="world-column-copy"
              role="tabpanel"
              aria-labelledby={`column-tab-${columnTab}`}
              aria-label={`コラム${column.no} ${column.title}`}
            >
              <div className="world-column-number-stack">
                {COLUMNS.map((item, index) => (
                  <p
                    key={item.no}
                    className={`world-column-number world-column-stack-item${index === columnTab ? " is-active" : ""}`}
                    aria-hidden={index !== columnTab}
                  >
                    コラム{item.no}
                  </p>
                ))}
              </div>
              <div className="world-column-heading-stack">
                {COLUMNS.map((item, index) => (
                  <h3
                    key={item.no}
                    className={`world-column-stack-item${index === columnTab ? " is-active" : ""}`}
                    aria-hidden={index !== columnTab}
                  >
                    {item.title}
                  </h3>
                ))}
              </div>
              <div className="world-column-summary-stack">
                {COLUMNS.map((item, index) => (
                  <div
                    key={item.no}
                    className={`world-column-summary-pane world-column-stack-item${index === columnTab ? " is-active" : ""}`}
                    aria-hidden={index !== columnTab}
                  >
                    <p>{item.body}</p>
                  </div>
                ))}
              </div>
              <SlideOpenControl
                ariaControls="world-column-pickup"
                ariaLabel="世界観コラムのピックアップを開く"
                buttonRef={pickupBtnRef}
                className="world-column-slide-open"
                expanded={pickupOpen}
                label="ピックアップ"
                onOpen={openPickup}
              />
            </div>
          </div>
        </section>
      </section>

      <section className="riders-section" id="riders" data-performance-region>
        <span id="riders-return" className="riders-return-anchor" aria-hidden="true" />
        <div className="section-index">
          <span>02</span>
          <small>EIGHT RIDERS</small>
        </div>
        <div className="section-title">
          <p className="eyebrow">
            <span>EIGHT RIDERS / ONE WORLD</span>
            <i />
          </p>
          <h2>八人が、世界へ。</h2>
          <p>
            主人公、帰還者、二人の管理人、刑事、怪盗、英国支部のエージェント、潜入情報官。八つの軌跡が同じ世界で交差する。
          </p>
        </div>
        <div className="rider-console">
          <RiderRail ref={riderRail} initialIndex={initialRiderTab} />
          <div
            id="rider-active-panel"
            className="rider-detail"
            role="tabpanel"
            aria-labelledby={`rider-tab-${rider.id}`}
            style={{ ["--rider-tone" as string]: rider.tone }}
          >
            <div className="rider-visual fit-cover">
              {RIDERS.map((r, i) =>
                i === riderTab || i === previousRiderTab ? (
                  <img
                    key={r.id}
                    src={r.img}
                    srcSet={r.img.replace(/\.jpe?g$/i, ".webp")}
                    sizes="(max-width: 760px) 92vw, (max-width: 1120px) 48vw, 560px"
                    alt={i === riderTab ? `仮面ライダー${r.ja}のビジュアル` : ""}
                    className={i === riderTab ? "is-on" : ""}
                    style={{ objectPosition: r.pos }}
                    decoding="async"
                    loading="lazy"
                    fetchPriority={i === riderTab ? "auto" : "low"}
                    draggable={false}
                  />
                ) : null,
              )}
            </div>
            <div className="rider-monogram" aria-hidden="true">
              {rider.name.slice(0, 1)}
            </div>
            <div className="rider-number">RIDER / {rider.no}</div>
            <div className="rider-copy-block">
              <p className="rider-person">
                <NameText value={rider.person} />
              </p>
              <h3 aria-label={`仮面ライダー${rider.ja}`}>
                <span className="rider-name-line">仮面ライダー</span>
                <br />
                <span className="rider-name-line">{rider.ja}</span>
              </h3>
              <p className="rider-description">{rider.desc}</p>
              <div className="rider-line">
                <span />
                <b>{rider.name}</b>
              </div>
              <SlideOpenControl
                className="rider-dossier-open"
                ariaLabel={`仮面ライダー${rider.ja}の個別資料を開く`}
                label="個別資料"
                opensDialog={false}
                onOpen={() => {
                  void go({
                    to: `/riders/${rider.id}`,
                    assets: RIDER_NAV.find((n) => n.id === rider.id)?.assets ?? [rider.img],
                  });
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="records-section" id="records" data-performance-region>
        <div className="section-index">
          <span>03</span>
          <small>NEW RECORDS</small>
        </div>
        <div className="records-heading">
          <p className="eyebrow">
            <span>POWER BEYOND THE BORDER</span>
            <i />
          </p>
          <h2>
            到達点は、
            <br />
            ひとつではない。
          </h2>
        </div>
        <div className="return-strip">
          <div>
            <span>RETURNING SIGNAL</span>
            <b>KAMEN RIDER REALM / BELL ALLAIN</b>
          </div>
          <p>仮面ライダーレルム、ベル・アレイン。復活。</p>
          <i aria-hidden="true" />
        </div>
        <section className="episode-archive" aria-labelledby="episode-archive-title">
          <div className="episode-archive-heading">
            <div>
              <span>EPISODE ARCHIVE</span>
              <h3 id="episode-archive-title">判明済みエピソード</h3>
            </div>
            <div className="episode-archive-meta">
              <p>
                <strong>{String(EPISODES.length).padStart(2, "0")}</strong>
                <span>RECORDS FOUND</span>
              </p>
              <div className="episode-controls" aria-label="エピソードの表示操作">
                <button
                  type="button"
                  className="ios26-glass"
                  data-liquid-pointer="true"
                  disabled={episode === 0}
                  onClick={() => goEpisode(episode - 1)}
                  aria-label="前のエピソードへ"
                >
                  <LiquidPointerGlow />
                  <span aria-hidden="true">
                    <UiVectorIcon kind="arrow-left" size={17} />
                  </span>
                </button>
                <output aria-live="polite">
                  {String(episode + 1).padStart(2, "0")} /{" "}
                  {String(EPISODES.length).padStart(2, "0")}
                </output>
                <button
                  type="button"
                  className="ios26-glass"
                  data-liquid-pointer="true"
                  disabled={episode === EPISODES.length - 1}
                  onClick={() => goEpisode(episode + 1)}
                  aria-label="次のエピソードへ"
                >
                  <LiquidPointerGlow />
                  <span aria-hidden="true">
                    <UiVectorIcon kind="arrow-right" size={17} />
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div
            className="episode-grid"
            ref={episodeGridRef}
            role="region"
            tabIndex={0}
            aria-label="判明済みエピソードのハイライト。左右キーでも切り替えられます"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              goEpisode(episode + (event.key === "ArrowRight" ? 1 : -1));
            }}
          >
            {EPISODES.map((ep, i) => (
              <article
                key={ep.no}
                className={`episode-card${i === episode ? " is-active" : ""}${ep.pickups?.length ? " has-pickup" : ""}`}
              >
                <div className="episode-card-surface">
                  <div className="episode-thumbnail">
                    <img
                      src={ep.src}
                      alt={ep.alt}
                      style={{ objectPosition: ep.pos }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span aria-hidden="true">EP.{ep.no}</span>
                    <i aria-hidden="true" />
                  </div>
                  <div className="episode-card-copy">
                    <p>
                      <span>EPISODE</span>
                      <b>{ep.no}</b>
                    </p>
                    <h4>{ep.title}</h4>
                    <small>IDENTIFIED RECORD</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="episode-card-select"
                  aria-label={`EP.${ep.no} ${ep.title}を選択`}
                  aria-pressed={i === episode}
                  onClick={() => goEpisode(i)}
                />
                {ep.pickups?.length ? (
                  <button
                    type="button"
                    className="episode-pickup-plus ios26-glass"
                    data-liquid-pointer="true"
                    aria-haspopup="dialog"
                    aria-controls="episode-pickup-dialog"
                    aria-label={`EP.${ep.no}のピックアップを開く`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openEpisodePickup(i, event.currentTarget, event.detail === 0);
                    }}
                  >
                    <LiquidPointerGlow />
                    <span className="episode-pickup-plus-icon" aria-hidden="true">
                      <UiVectorIcon kind="plus" size={23} />
                    </span>
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="finale-section" data-performance-region>
        <div className="finale-sticky">
          <div className="finale-backdrop" aria-hidden="true">
            <img
              src="/deception-world-poster-delivery.webp"
              alt=""
              width={1024}
              height={1536}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          </div>
          <div className="finale-content">
            <span>THE WORLD IS WAITING.</span>
            <h2>
              サーガは、
              <br />
              まだ終わらない。
            </h2>
            <a className="primary-action ios26-glass" href="#top" data-liquid-pointer="true">
              <LiquidPointerGlow />
              <span>RETURN TO THE KEY VISUAL</span>
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-title">
          <span>仮面ライダーサーガ</span>
          <b>DECEPTION WORLD</b>
        </div>
        <p>ORIGINAL PROJECT / CONCEPT VISUAL EXPERIENCE</p>
        <a href="#top">BACK TO TOP ↑</a>
      </footer>

      <dialog
        ref={episodePickupDialogRef}
        id="episode-pickup-dialog"
        className="episode-pickup-dialog"
        tabIndex={-1}
        aria-labelledby="episode-pickup-title"
        onClose={() => {
          const dialog = episodePickupDialogRef.current;
          if (dialog) resetPickupScroll(dialog, [".episode-pickup-panel"]);
          setEpisodePickup(null);
          if (!episodePickupOpenedByKeyboard.current) {
            const trigger = episodePickupTriggerRef.current;
            const grid = episodeGridRef.current;
            const clearPointerFocus = () => {
              trigger?.blur();
              grid?.blur();
              const active = document.activeElement;
              if (
                active instanceof HTMLElement &&
                (active === trigger || active === grid || grid?.contains(active))
              ) {
                active.blur();
              }
            };
            grid?.setAttribute("data-pointer-focus-suppressed", "true");
            clearPointerFocus();
            window.requestAnimationFrame(clearPointerFocus);
            episodePointerFocusTimer.current = window.setTimeout(() => {
              clearPointerFocus();
              grid?.removeAttribute("data-pointer-focus-suppressed");
              episodePointerFocusTimer.current = null;
            }, 240);
          }
          episodePickupTriggerRef.current = null;
          episodePickupOpenedByKeyboard.current = false;
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeEpisodePickup();
        }}
        onClick={(event) => {
          if (event.target === episodePickupDialogRef.current) closeEpisodePickup();
        }}
      >
        <button
          type="button"
          className="episode-pickup-close ios26-glass"
          data-liquid-pointer="true"
          onClick={closeEpisodePickup}
          aria-label="エピソードのピックアップを閉じる"
        >
          <LiquidPointerGlow />
          <span className="episode-pickup-close-icon" aria-hidden="true">
            <UiVectorIcon kind="close" size={16} />
          </span>
        </button>
        <div className="episode-pickup-panel">
          <header className="episode-pickup-heading">
            <small>EPISODE {selectedEpisodePickup?.no ?? "--"} / PICKUP</small>
            <h2 id="episode-pickup-title">{selectedEpisodePickup?.title ?? "EPISODE PICKUP"}</h2>
            <p>IDENTIFIED CHARACTER / RIDER RECORDS</p>
          </header>
          <div className="episode-pickup-grid">
            {selectedEpisodePickup?.pickups
              ? selectedEpisodePickup.pickups.map((item, index) => (
                  <GuardedLink
                    className="episode-pickup-item"
                    key={item.label}
                    to={item.to}
                    assets={item.assets}
                    beforeNavigate={closeEpisodePickup}
                    aria-label={`${item.label}の個別ページを開く`}
                  >
                    <figure>
                      <img
                        src={item.src}
                        alt={item.alt}
                        style={{ objectPosition: item.pos }}
                        width={item.width}
                        height={item.height}
                        loading={index === 0 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index === 0 ? "high" : "low"}
                      />
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </figure>
                    <div>
                      <small>EP.{selectedEpisodePickup.no} / PICKUP</small>
                      <h3>
                        {item.displayLines?.map((line) => (
                          <span className="episode-pickup-name-line" key={line}>
                            <NameText value={line} />
                          </span>
                        )) ?? <NameText value={item.label} />}
                      </h3>
                      <span className="episode-pickup-open" aria-hidden="true">
                        OPEN DOSSIER <UiVectorIcon kind="arrow-right" size={15} />
                      </span>
                    </div>
                  </GuardedLink>
                ))
              : null}
          </div>
        </div>
      </dialog>

      <dialog
        ref={pickupDialogRef}
        id="world-column-pickup"
        className="world-column-dialog"
        tabIndex={-1}
        aria-labelledby="world-column-pickup-title"
        onClose={() => {
          const dialog = pickupDialogRef.current;
          if (pickupCloseTimer.current != null) {
            window.clearTimeout(pickupCloseTimer.current);
            pickupCloseTimer.current = null;
          }
          if (dialog) delete dialog.dataset.closing;
          if (dialog) resetPickupScroll(dialog, [".world-column-dialog-card"]);
          setPickupOpen(false);
        }}
        onCancel={(e) => {
          e.preventDefault();
          closePickup();
        }}
        onClick={(e) => {
          if (e.target === pickupDialogRef.current) closePickup();
        }}
      >
        <button
          type="button"
          className="world-column-dialog-close"
          data-liquid-pointer="true"
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePickup(e);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePickup(e);
          }}
          aria-label="ピックアップを閉じる"
        >
          <LiquidPointerGlow />
          <span>CLOSE</span>
          <i aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </i>
        </button>
        <div className="world-column-dialog-card">
          <div className="world-column-dialog-toolbar">
            <p>
              WORLD COLUMN
              <i>FIELD NOTES</i>
            </p>
          </div>
          <div className="world-column-dialog-heading">
            <small>ARCHIVE / {column.kicker}</small>
            <h2 id="world-column-pickup-title">世界観コラム</h2>
          </div>
          <PickupRail ref={pickupRail} />
          <div className="world-column-dialog-copy-stack">
            {COLUMNS.map((item, index) => (
              <div
                key={item.no}
                id={`column-dialog-panel-${index}`}
                className={`world-column-dialog-copy world-column-dialog-copy-pane${index === columnTab ? " is-active" : ""}`}
                role="tabpanel"
                aria-labelledby={`column-dialog-tab-${index}`}
                aria-hidden={index !== columnTab}
              >
                <p className="world-column-dialog-number">コラム{item.no}</p>
                <h3>{item.title}</h3>
                <div>
                  {item.pickup.map((para) => (
                    <p key={para.slice(0, 18)}>{para}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </dialog>

      <dialog
        ref={danteDialogRef}
        className="dante-denied-dialog"
        tabIndex={-1}
        aria-label="アクセス拒否"
        onCancel={(e) => {
          e.preventDefault();
          closeDante();
        }}
        onClick={(e) => {
          if (e.target === danteDialogRef.current) closeDante();
        }}
      >
        <div className="dante-denied-inner" tabIndex={-1}>
          <p className="dante-denied-kicker">ACCESS DENIED</p>
          <div className="dante-no-stack" aria-hidden="true">
            <strong className="dante-no-ghost">NO</strong>
            <strong className="dante-no-ghost is-offset">NO</strong>
          </div>
          <strong className="dante-no">NO</strong>
          <p className="dante-denied-note">管理外 ／ 対象外記録</p>
        </div>
      </dialog>
    </main>
  );
}
