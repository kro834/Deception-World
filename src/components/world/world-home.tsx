import { forwardRef, memo, useEffect, useRef, useState } from "react";
import { bootLiquidGlass } from "@/lib/liquid/boot.js";
import { MANAGER_ASSETS, warmLater } from "@/lib/asset-loader";
import { GuardedLink } from "@/components/load-gate";
import { useWorldMode } from "./use-world-mode";
import { LiquidLens } from "./liquid-rail";
import { SiteUpdateButton, SideMenuLayer, SideMenuTrigger } from "./world-chrome";
import { RIDER_NAV, NameText } from "./dossier-nav";

const POSTERS = [
  { src: "/deception-world-poster.jpeg", pos: "50% 50%", fit: "cover", alt: "仮面ライダーサーガ Deception Worldの集合ポスター" },
  { src: "/poster-card-03.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダーサーガのキービジュアル 03" },
  { src: "/poster-card-04.jpeg", pos: "50% 30%", fit: "cover", alt: "仮面ライダーサーガのキービジュアル 04" },
  { src: "/poster-card-05.jpeg", pos: "50% 32%", fit: "cover", alt: "Deception Worldのキービジュアル 05" },
  { src: "/poster-card-06.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダーレルムのキービジュアル 06" },
  { src: "/poster-card-07.jpeg", pos: "50% 50%", fit: "contain", alt: "仮面ライダーローアのキービジュアル 07" },
  { src: "/poster-card-08.jpeg", pos: "50% 50%", fit: "contain", alt: "青い装甲のライダーのキービジュアル 08" },
  { src: "/poster-card-09.jpeg", pos: "50% 30%", fit: "cover", alt: "仮面ライダーヴァンダールのキービジュアル 09" },
  { src: "/poster-card-10.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダーレディックのキービジュアル 10" },
  { src: "/poster-card-11.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダーアルゲノムのキービジュアル 11" },
  { src: "/poster-card-12.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダーオーバーゼッツのキービジュアル 12" },
  { src: "/poster-card-13.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダーフリートのキービジュアル 13" },
  { src: "/poster-card-14.jpeg", pos: "50% 28%", fit: "cover", alt: "仮面ライダールーラーのキービジュアル 14" },
  { src: "/poster-card-15.jpeg", pos: "50% 50%", fit: "contain", alt: "仮面ライダーサーガ Deception Worldのタイトルポスター" },
  { src: "/poster-card-16.jpeg", pos: "50% 50%", fit: "contain", alt: "二人のライダーが並ぶDeception Worldのキービジュアル" },
  { src: "/poster-card-17.jpeg", pos: "50% 46%", fit: "cover", alt: "夜空の下で佇む青と金の仮面ライダーサーガ" },
  { src: "/poster-card-18.jpeg", pos: "50% 44%", fit: "cover", alt: "星の装甲をまとい座る仮面ライダーのキービジュアル" },
  { src: "/poster-card-19.jpeg", pos: "50% 50%", fit: "contain", alt: "雪原で赤い剣を振るうライダーの戦闘キービジュアル" },
  { src: "/poster-card-20.jpeg", pos: "50% 46%", fit: "cover", alt: "赤いライダーと白緑のライダーが並ぶキービジュアル" },
  { src: "/poster-card-21.jpeg", pos: "50% 50%", fit: "contain", alt: "白緑と青金のライダーが対峙するキービジュアル" },
  { src: "/poster-card-22.jpeg", pos: "50% 42%", fit: "cover", alt: "星空を宿す装甲のライダーのキービジュアル" },
  { src: "/poster-card-23.jpeg", pos: "50% 48%", fit: "cover", alt: "青と金の仮面ライダーサーガが構えるキービジュアル" },
  { src: "/poster-card-24.jpeg", pos: "50% 46%", fit: "cover", alt: "星の装甲をまとったライダーが低く構えるキービジュアル" },
  { src: "/poster-card-25.jpeg", pos: "50% 43%", fit: "cover", alt: "荒野で大剣を構える赤いライダーのキービジュアル" },
  { src: "/poster-card-26.jpeg", pos: "50% 48%", fit: "cover", alt: "森で向き合うライダーとレックス・ロワのキービジュアル" },
  { src: "/poster-card-27.jpeg", pos: "50% 42%", fit: "cover", alt: "赤い装甲と大剣を携えた仮面ライダーサーガのキービジュアル" },
];

const RIDERS = [
  { id: "saga", no: "01", name: "SAGA", ja: "サーガ", person: "シエル ／ 月城悠真", tone: "#248cff", img: "/rider-saga.jpeg", pos: "44% 14%", desc: "最も弱い地点から、それでも世界の結末へ踏み込む第一のライダー。" },
  { id: "realm", no: "02", name: "REALM", ja: "レルム", person: "ベル・アレイン", tone: "#f14a60", img: "/rider-realm.jpeg", pos: "50% 16%", desc: "サーガ世界の歴史を継承し、再び戦場へ帰還した第二のライダー。" },
  { id: "lore", no: "03", name: "LORE", ja: "ローア", person: "ローア", tone: "#67d8ff", img: "/rider-loa.jpeg", pos: "50% 12%", desc: "サーガ世界を管轄し、二人と並び立つ第三のライダー。" },
  { id: "vandal", no: "04", name: "VANDAL", ja: "ヴァンダール", person: "レックス・ロワ", tone: "#e71a9c", img: "/rider-vandaal.jpeg", pos: "50% 14%", desc: "『六詠』のレックス・ロワが変身し、肉弾戦特化の力で戦場へ立つ第四のライダー。" },
  { id: "leddic", no: "05", name: "LEDDIC", ja: "レディック", person: "在原華火 ／ 捜査一課・警部補", tone: "#69df74", img: "/rider-leddic-home.jpeg", pos: "50% 18%", desc: "規格外の幸運と無敗の体術で、本人も気付かぬまま事件の核心へ辿り着く警部補。" },
  { id: "argenome", no: "06", name: "ARGENOME", ja: "アルゲノム", person: "紅城真守", tone: "#d71920", img: "/rider-algenome.jpeg", pos: "50% 16%", desc: "幻想郷を救った紅魔館の執事。高速機動と無音の接近を両立し、ガシャコンエッジで異常を切り分ける。" },
  { id: "over-zeztz", no: "07", name: "OVER ZEZTZ", ja: "オーバーゼッツ", person: "コードナンバー：セヴン ／ ジェームズ・スミス", tone: "#32e1d0", img: "/rider-over-zeztz-home.jpeg", pos: "50% 12%", desc: "陽気な軽口の奥で最適解を選び、改良型ゼッツシステムを駆るCODE英国支部の最強エージェント。" },
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
    kicker: "ROKUEI",
    body: "世界・概念・領域・物語・法則。あらゆる層を管轄する管理人の最上位、六詠。六つの信号が揃ったとき、サーガ世界の勝敗条件は書き換えられる。",
    pickup: [
      "世界・概念・領域・物語・法則。あらゆる層を管轄する管理人の最上位、六詠。六つの信号が揃ったとき、サーガ世界の勝敗条件は書き換えられる。",
      "六詠は人格ではなく、権限の集合体として観測される。個体名が解禁されるのは、その信号が物語側へ露出した瞬間だけだ。",
      "現在フロントから参照できるのは一部に限られる。未解禁のシグナルは、閲覧そのものが世界への干渉になるため、意図的に伏せられている。",
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
      "七人のライダーが交差するこの世界では、誰が伝説で誰が新参か、観測する側の権限によってすら揺らぐ。",
    ],
  },
];

const EPISODES = [
  { no: "01", title: "HIDE-AND-SEEK", src: "/episode-01-hide-and-seek.jpeg", pos: "50% 30%", alt: "紫と金の装甲をまとった仮面ライダーが剣を構えるEP1のサムネイル" },
  { no: "02", title: "LEGENDS", src: "/episode-02-legends.jpeg", pos: "50% 50%", alt: "赤い装甲のライダーと黒金のライダーが交戦するEP2のサムネイル" },
  { no: "03", title: "DECEPTION WORLD", src: "/episode-03-deception-world.jpeg", pos: "55% 18%", alt: "白い帽子と衣装の人物が崩壊した街を見下ろすEP3のサムネイル" },
  { no: "04", title: "殺す", src: "/episode-04-kill.jpeg", pos: "50% 16%", alt: "黒い衣装の人物が崩壊した街に立つEP4のサムネイル" },
];

function scrollAxisX(scroller: HTMLElement | null, child: HTMLElement | null) {
  if (!scroller || !child) return;
  const left = child.offsetLeft - (scroller.clientWidth - child.clientWidth) / 2;
  scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
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
  });
  rail.dispatchEvent(new Event("liquidrelayout"));
}

/* Rails are memoized so poster autoplay / tab-panel state cannot reset
   the vanilla liquid-glass DOM (is-active, lens transform, WebGL bind). */
const ManagerRail = memo(
  forwardRef<HTMLDivElement>(function ManagerRail(_props, ref) {
    return (
      <div ref={ref} className="manager-archive-tabs liquid-swipe-tabs" role="tablist" aria-label="キャラクター分類">
        <LiquidLens />
        <button type="button" role="tab" className="is-active" aria-selected="true" style={{ ["--liquid-accent" as string]: "var(--cyan)" }}>
          <small>FRONT / 01</small>
          <b>六詠</b>
        </button>
        <button type="button" role="tab" aria-selected="false" style={{ ["--liquid-accent" as string]: "var(--red)" }}>
          <small>REVERSE / 02</small>
          <b>管理外</b>
        </button>
        <button type="button" role="tab" aria-selected="false" style={{ ["--liquid-accent" as string]: "#69df74" }}>
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
      <div ref={ref} className="world-column-tabs liquid-swipe-tabs" role="tablist" aria-label="コラムを選択">
        <LiquidLens />
        {COLUMNS.map((c, i) => (
          <button
            key={c.no}
            type="button"
            role="tab"
            className={i === 0 ? "is-active" : ""}
            aria-selected={i === 0}
            style={{ ["--liquid-accent" as string]: "var(--gold)" }}
          >
            <small>{c.no}</small>
            <b>{c.title === "脚本制と採録制" ? <>脚本制と<br className="tab-br" />採録制</> : c.title}</b>
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
            className={i === 0 ? "is-active" : ""}
            aria-selected={i === 0}
            style={{ ["--liquid-accent" as string]: "var(--gold)" }}
          >
            <small>{c.no}</small>
            <b>{c.title === "脚本制と採録制" ? <>脚本制と<br className="tab-br" />採録制</> : c.title}</b>
          </button>
        ))}
      </div>
    );
  }),
);

const RiderRail = memo(
  forwardRef<HTMLDivElement>(function RiderRail(_props, ref) {
    return (
      <div ref={ref} className="rider-tabs liquid-swipe-tabs" role="tablist" aria-label="七人のメインライダー">
        <LiquidLens />
        {RIDERS.map((r, i) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            className={i === 0 ? "is-active" : ""}
            aria-selected={i === 0}
            style={{
              ["--tab-tone" as string]: r.tone,
              ["--liquid-accent" as string]: r.tone,
            }}
          >
            <small>{r.no}</small>
            <span>{r.name === "OVER ZEZTZ" ? <>OVER<br className="tab-br" />ZEZTZ</> : r.name}</span>
            <i />
          </button>
        ))}
      </div>
    );
  }),
);

export function WorldHome() {
  useWorldMode();
  const [poster, setPoster] = useState(0);
  const [prevPoster, setPrevPoster] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [managerTab, setManagerTab] = useState(0);
  const [columnTab, setColumnTab] = useState(0);
  const [riderTab, setRiderTab] = useState(0);
  const [episode, setEpisode] = useState(0);
  const [pickupOpen, setPickupOpen] = useState(false);
  const managerRail = useRef<HTMLDivElement>(null);
  const columnRail = useRef<HTMLDivElement>(null);
  const riderRail = useRef<HTMLDivElement>(null);
  const episodeGridRef = useRef<HTMLDivElement>(null);
  const pickupBtnRef = useRef<HTMLButtonElement>(null);
  const pickupDialogRef = useRef<HTMLDialogElement>(null);
  const danteDialogRef = useRef<HTMLDialogElement>(null);
  const pickupRail = useRef<HTMLDivElement>(null);
  const pickupCloseTimer = useRef<number | null>(null);
  const shuffleTimers = useRef<number[]>([]);
  const danteCloseTimer = useRef<number | null>(null);
  const episodeProgrammatic = useRef(false);

  useEffect(() => {
    const off1 = bindRail(managerRail.current, setManagerTab);
    const off2 = bindRail(columnRail.current, setColumnTab);
    const off3 = bindRail(riderRail.current, setRiderTab);
    const off4 = bindRail(pickupRail.current, setColumnTab);
    const id = requestAnimationFrame(() => bootLiquidGlass(document));
    return () => {
      off1();
      off2();
      off3();
      off4();
      cancelAnimationFrame(id);
    };
  }, []);

  useEffect(() => {
    if (locked) return;
    const t = window.setInterval(() => {
      setPoster((p) => {
        setPrevPoster(p);
        return (p + 1) % POSTERS.length;
      });
    }, 5200);
    return () => window.clearInterval(t);
  }, [locked]);

  useEffect(() => {
    RIDERS.forEach((r) => {
      const img = new Image();
      img.decoding = "async";
      img.src = r.img;
      void img.decode?.().catch(() => undefined);
    });
    warmLater([
      ...POSTERS.map((p) => p.src),
      ...EPISODES.map((e) => e.src),
      "/manager-rex-loi.jpeg",
      "/manager-shuza.jpeg",
      "/manager-lejas-portrait.jpeg",
      "/manager-reemu.jpeg",
    ]);
  }, []);

  useEffect(() => {
    const grid = episodeGridRef.current;
    if (!grid) return;
    let frame = 0;
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
    grid.addEventListener("scroll", onScroll, { passive: true });
    grid.addEventListener("scrollend", syncFromScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
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
      shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
      if (danteCloseTimer.current != null) window.clearTimeout(danteCloseTimer.current);
    };
  }, []);
  const current = POSTERS[poster];
  const previous = prevPoster != null ? POSTERS[prevPoster] : null;
  const rider = RIDERS[riderTab];
  const column = COLUMNS[columnTab];

  const goPoster = (next: number | ((p: number) => number)) => {
    setPoster((p) => {
      const n = typeof next === "function" ? next(p) : next;
      const wrapped = ((n % POSTERS.length) + POSTERS.length) % POSTERS.length;
      if (wrapped !== p) setPrevPoster(p);
      return wrapped;
    });
  };

  const shufflePoster = () => {
    if (shuffling) return;
    setLocked(true);
    shuffleTimers.current.forEach((timer) => window.clearTimeout(timer));
    shuffleTimers.current = [];

    const jumpToAnotherPoster = () => {
      goPoster((p) => p + 1 + Math.floor(Math.random() * (POSTERS.length - 1)));
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      jumpToAnotherPoster();
      return;
    }

    setShuffling(true);
    [0, 90, 185, 290, 415, 565, 740].forEach((delay, index, steps) => {
      const timer = window.setTimeout(() => {
        jumpToAnotherPoster();
        if (index === steps.length - 1) {
          const settleTimer = window.setTimeout(() => {
            setShuffling(false);
            shuffleTimers.current = [];
          }, 180);
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
    window.setTimeout(() => {
      episodeProgrammatic.current = false;
    }, 520);
  };

  const openPickup = () => {
    const dlg = pickupDialogRef.current;
    if (!dlg) return;
    if (pickupCloseTimer.current != null) {
      window.clearTimeout(pickupCloseTimer.current);
      pickupCloseTimer.current = null;
    }
    delete dlg.dataset.closing;
    if (!dlg.open) {
      try {
        dlg.showModal();
      } catch {
        /* already open */
      }
    }
    setPickupOpen(true);
    (document.activeElement as HTMLElement | null)?.blur();
    syncRail(pickupRail.current, columnTab);
    requestAnimationFrame(() => {
      bootLiquidGlass(dlg);
      pickupRail.current?.dispatchEvent(new Event("liquidrelayout"));
    });
  };

  const closePickup = (event?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
    event?.stopPropagation?.();
    const dlg = pickupDialogRef.current;
    if (!dlg?.open) {
      setPickupOpen(false);
      return;
    }
    if (dlg.dataset.closing === "true") return;
    dlg.dataset.closing = "true";
    if (pickupCloseTimer.current != null) window.clearTimeout(pickupCloseTimer.current);
    pickupCloseTimer.current = window.setTimeout(() => {
      try {
        dlg.close();
      } catch {
        /* already closed */
      }
      delete dlg.dataset.closing;
      pickupCloseTimer.current = null;
      setPickupOpen(false);
    }, 360);
  };

  return (
    <div className="site-shell motion-on" data-motion-enabled="true">
      <SideMenuLayer />
      <div className="ambient" aria-hidden="true">
        <div className="ambient-grid" />
        <div className="ambient-orb orb-a" />
        <div className="ambient-orb orb-b" />
        <div className="grain" />
      </div>

      <header className="topbar">
        <div className="topbar-leading">
          <a className="brand" href="#top" aria-label="Deception World トップへ">
            <span className="brand-sigil">
              <i>DW</i>
            </span>
            <span>
              <b>DECEPTION WORLD</b>
              <small>KAMEN RIDER SAGA</small>
            </span>
          </a>
        </div>
        <nav aria-label="メインメニュー">
          <a href="#story">STORY</a>
          <a href="#riders">RIDERS</a>
          <a href="#records">RECORDS</a>
        </nav>
        <div className="topbar-actions">
          <SideMenuTrigger />
        </div>
      </header>
      <SiteUpdateButton />

      <section className="hero" id="top">
        <div className="hero-backdrop" aria-hidden="true">
          {previous ? (
            <span className="hero-backdrop-layer hero-backdrop-previous" key={`hb-prev-${prevPoster}`}>
              <img src={previous.src} alt="" style={{ objectPosition: previous.pos }} decoding="async" />
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
          <p className="eyebrow">
            <span>THE SECOND SAGA</span>
            <i />
          </p>
          <h1>
            <span>世界は、</span>
            <strong>欺瞞でできている。</strong>
          </h1>
          <p className="hero-lead">
            救うべきものは、夢の向こうにはない。
            <br />
            6人の最上位管理人と、7人のライダーが同じ世界で交差する。
          </p>
          <div className="hero-actions">
            <a className="primary-action ios26-glass" href="#story">
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

        <div className="poster-stage" id="poster-stage">
          <div className={shuffling ? "poster-deck is-shuffling" : "poster-deck"} aria-busy={shuffling}>
            <div className="poster-back-card poster-back-card-1" aria-hidden="true">
              <img src={POSTERS[(poster + 1) % POSTERS.length].src} alt="" decoding="async" />
            </div>
            <div className="poster-back-card poster-back-card-2" aria-hidden="true">
              <img src={POSTERS[(poster + 2) % POSTERS.length].src} alt="" decoding="async" />
            </div>
            <div className="poster-back-card poster-back-card-3" aria-hidden="true">
              <img src={POSTERS[(poster + 3) % POSTERS.length].src} alt="" loading="lazy" decoding="async" />
            </div>
            <div className="poster-back-card poster-back-card-4" aria-hidden="true">
              <img src={POSTERS[(poster + 4) % POSTERS.length].src} alt="" loading="lazy" decoding="async" />
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
                    style={{ objectPosition: previous.pos, objectFit: previous.fit === "contain" ? "contain" : "cover" }}
                    onAnimationEnd={() => setPrevPoster(null)}
                  />
                ) : null}
                <img
                  className={current.fit === "contain" ? "poster-image poster-image-current is-contain" : "poster-image poster-image-current"}
                  key={`poster-${poster}`}
                  src={current.src}
                  alt={current.alt}
                  style={{ objectPosition: current.pos, objectFit: current.fit === "contain" ? "contain" : "cover" }}
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
                disabled={shuffling}
                onClick={shufflePoster}
              >
                <span aria-hidden="true">↻</span>
                <b>{shuffling ? "SHUFFLING..." : "SHUFFLE POSTER"}</b>
              </button>
              <button
                type="button"
                className="poster-reset ios26-glass"
                disabled={poster === 0 || shuffling}
                onClick={() => goPoster(0)}
              >
                <span aria-hidden="true">↤</span>
                <b>RESET</b>
              </button>
              <button
                type="button"
                className={locked ? "poster-lock ios26-glass is-locked" : "poster-lock ios26-glass is-unlocked"}
                aria-pressed={locked}
                aria-label={locked ? "ロックを解除して自動切替にする" : "ポスターをロックして固定する"}
                disabled={shuffling}
                onClick={() => setLocked((v) => !v)}
              >
                <span aria-hidden="true">
                  {locked ? (
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <rect x="6" y="10" width="12" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14">
                      <path d="M8 10V8a4 4 0 0 1 7.5-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <rect x="6" y="10" width="12" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
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
            <p>世界、概念、領域、物語、法則。あらゆるものを管轄する管理人。その最上位に位置する六つの存在が、サーガ世界の行く末へ干渉を始める。</p>
            <p>シエル、ベル、ローア、レックス、華火、真守、ジェームズ。異なる立場を背負った七人は、ひとつの結末へ向けて交差する。</p>
          </div>
        </div>

        <div className="threat-panel" id="manager-archive">
          <div className="threat-copy">
            <span className="system-label">MANAGER ARCHIVE</span>
            <h3>
              SIX SIGNALS
              <br />
              ABOVE THE WORLD.
            </h3>
            <p>最上位管理人、六詠。個体情報へのアクセスは一部制限されています。</p>
          </div>
          <div className="signal-column">
            <ManagerRail ref={managerRail} />

            {managerTab === 0 ? (
              <div className="manager-archive-panel is-managers" role="tabpanel">
                <div className="signal-array" aria-label="六詠を示す6つのシグナル">
                  <div className="signal" style={{ ["--delay" as string]: "0s" }} aria-label="六詠I 未解禁">
                    <span>I</span>
                    <i />
                    <small>RESTRICTED</small>
                  </div>
                  <GuardedLink
                    className="signal has-visual is-accessible"
                    to="/managers/rex-loi"
                    assets={MANAGER_ASSETS["rex-loi"]}
                    style={{ ["--delay" as string]: "0.16s" }}
                  >
                    <img src="/manager-rex-loi.jpeg" alt="レックス・ロワのキャラクタービジュアル" width={1024} height={1536} style={{ objectPosition: "50% 0%" }} loading="lazy" decoding="async" />
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
                    <img src="/manager-shuza.jpeg" alt="シュザのキャラクタービジュアル" width={1050} height={1498} style={{ objectPosition: "50% 16%" }} loading="lazy" decoding="async" />
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
                      src="/manager-lejas-portrait.jpeg"
                      alt="レジャスの顔アップ"
                      width={1500}
                      height={1872}
                      style={{ objectPosition: "50% 8%", objectFit: "cover" }}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>IV</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>レジャス</b>
                  </GuardedLink>
                  <div className="signal" style={{ ["--delay" as string]: "0.64s" }} aria-label="六詠V 未解禁">
                    <span>V</span>
                    <i />
                    <small>RESTRICTED</small>
                  </div>
                  <GuardedLink
                    className="signal has-visual is-accessible"
                    to="/managers/reemu"
                    assets={MANAGER_ASSETS.reemu}
                    style={{ ["--delay" as string]: "0.8s" }}
                  >
                    <img src="/manager-reemu.jpeg" alt="リームーのキャラクタービジュアル" width={941} height={1672} style={{ objectPosition: "50% 14%" }} loading="lazy" decoding="async" />
                    <span>VI</span>
                    <i />
                    <small>OPEN DOSSIER</small>
                    <b>リームー</b>
                  </GuardedLink>
                </div>
              </div>
            ) : managerTab === 1 ? (
              <div className="manager-archive-panel is-unmanaged" role="tabpanel">
                <p className="system-label">UNMANAGED / REVERSE</p>
                <h3 className="unmanaged-heading">
                  管理外
                </h3>
                <p>個体情報へのアクセスは制限されています。</p>
                <div className="unmanaged-array" aria-label="管理外">
                  <button
                    className="dante-archive"
                    type="button"
                    aria-label="管理人殺し ダンテへのアクセスを試みる"
                    onClick={(e) => {
                      const host = e.currentTarget;
                      host.classList.add("is-glitching");
                      window.setTimeout(() => {
                        host.classList.remove("is-glitching");
                        const dlg = danteDialogRef.current;
                        if (!dlg) return;
                        if (danteCloseTimer.current != null) window.clearTimeout(danteCloseTimer.current);
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
                </div>
              </div>
            ) : (
              <div className="manager-archive-panel is-other" role="tabpanel">
                <p className="system-label is-other">RELATED / ALAIN</p>
                <h3>その他</h3>
                <div className="other-array" aria-label="その他">
                  <GuardedLink
                    className="other-archive-card"
                    to="/characters/terra"
                    assets={["/character-terra.jpeg", "/character-terra-thumb.jpeg", "/rider-realm-earth.jpeg"]}
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
                    assets={["/character-luna.jpeg", "/character-luna-thumb.jpeg", "/rider-realm-moon.jpeg"]}
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
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="world-column" aria-label="世界観コラム">
          <div className="world-column-content">
            <div className="world-column-index">
              <span>WORLD COLUMN</span>
              <ColumnRail ref={columnRail} />
            </div>
            <div className="world-column-copy" role="tabpanel">
              <p className="world-column-number">コラム{column.no}</p>
              <h3>{column.title}</h3>
              <div>
                <p>{column.body}</p>
              </div>
              <button
                ref={pickupBtnRef}
                type="button"
                className="world-column-orbit-trigger ios26-glass"
                aria-haspopup="dialog"
                aria-expanded={pickupOpen}
                aria-controls="world-column-pickup"
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPickup();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPickup();
                }}
              >
                <span>
                  <small>PICK UP</small>
                  <b>ピックアップ</b>
                </span>
                <i aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      d="M12 6v12M6 12h12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                  </svg>
                </i>
              </button>
            </div>
          </div>
        </section>
      </section>

      <section className="riders-section" id="riders">
        <div className="section-index">
          <span>02</span>
          <small>SEVEN RIDERS</small>
        </div>
        <div className="section-title">
          <p className="eyebrow">
            <span>SEVEN RIDERS / ONE WORLD</span>
            <i />
          </p>
          <h2>七人が、世界へ。</h2>
          <p>主人公、帰還者、二人の管理人、刑事、怪盗、英国支部のエージェント。七つの軌跡が同じ世界で交差する。</p>
        </div>
        <div className="rider-console">
          <RiderRail ref={riderRail} />
          <div className="rider-detail" role="tabpanel" style={{ ["--rider-tone" as string]: rider.tone }}>
            <div className="rider-visual fit-cover">
              {RIDERS.map((r, i) => (
                <img
                  key={r.id}
                  src={r.img}
                  alt={i === riderTab ? `仮面ライダー${r.ja}のビジュアル` : ""}
                  className={i === riderTab ? "is-on" : ""}
                  style={{ objectPosition: r.pos }}
                  decoding="async"
                  fetchPriority={i === 0 ? "high" : "low"}
                  draggable={false}
                />
              ))}
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
              <GuardedLink
                className="rider-dossier-open"
                to={`/riders/${rider.id}`}
                assets={RIDER_NAV.find((n) => n.id === rider.id)?.assets ?? [rider.img]}
              >
                <small>OPEN DOSSIER</small>
                <b>個別資料</b>
              </GuardedLink>
            </div>
          </div>
        </div>
      </section>

      <section className="records-section" id="records">
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
                <strong>04</strong>
                <span>RECORDS FOUND</span>
              </p>
              <div className="episode-controls" aria-label="エピソードの表示操作">
                <button
                  type="button"
                  className="ios26-glass"
                  disabled={episode === 0}
                  onClick={() => goEpisode(episode - 1)}
                  aria-label="前のエピソードへ"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <output>{String(episode + 1).padStart(2, "0")} / 04</output>
                <button
                  type="button"
                  className="ios26-glass"
                  disabled={episode === EPISODES.length - 1}
                  onClick={() => goEpisode(episode + 1)}
                  aria-label="次のエピソードへ"
                >
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
          <div className="episode-grid" ref={episodeGridRef} role="region" aria-label="判明済みエピソードのハイライト">
            {EPISODES.map((ep, i) => (
              <article
                key={ep.no}
                className={i === episode ? "episode-card is-active" : "episode-card"}
                onClick={() => goEpisode(i)}
              >
                <div className="episode-card-surface">
                  <div className="episode-thumbnail">
                    <img src={ep.src} alt={ep.alt} style={{ objectPosition: ep.pos }} loading="lazy" decoding="async" />
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
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="finale-section">
        <div className="finale-sticky">
          <div className="finale-backdrop" aria-hidden="true">
            <img src="/deception-world-poster.jpeg" alt="" loading="lazy" decoding="async" />
          </div>
          <div className="finale-content">
            <span>THE WORLD IS WAITING.</span>
            <h2>
              サーガは、
              <br />
              まだ終わらない。
            </h2>
            <a className="primary-action ios26-glass" href="#top">
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
        ref={pickupDialogRef}
        id="world-column-pickup"
        className="world-column-dialog"
        tabIndex={-1}
        aria-labelledby="world-column-pickup-title"
        onCancel={(e) => {
          e.preventDefault();
          closePickup();
        }}
        onClick={(e) => {
          if (e.target === pickupDialogRef.current) closePickup();
        }}
      >
        <div className="world-column-dialog-card">
          <div className="world-column-dialog-toolbar">
            <p>
              WORLD COLUMN
              <i>FIELD NOTES</i>
            </p>
            <button
              type="button"
              className="world-column-dialog-close"
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
          </div>
          <div className="world-column-dialog-heading">
            <small>ARCHIVE / {column.kicker}</small>
            <h2 id="world-column-pickup-title">世界観コラム</h2>
          </div>
          <PickupRail ref={pickupRail} />
          <div className="world-column-dialog-copy" key={column.no}>
            <p className="world-column-dialog-number">コラム{column.no}</p>
            <h3>{column.title}</h3>
            <div>
              {column.pickup.map((para) => (
                <p key={para.slice(0, 18)}>{para}</p>
              ))}
            </div>
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
    </div>
  );
}
