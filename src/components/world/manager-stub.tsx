import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorldMode } from "./use-world-mode";
import { DossierNav, RIKUEI_NAV, NameText } from "./dossier-nav";
import { SlideOpenControl } from "./slide-open-control";
import { UiVectorIcon } from "./ui-vector-icon";
import { LiquidPointerGlow } from "./liquid-rail";
import { resetPickupScroll, settlePickupScroll } from "./pickup-scroll-reset";
import { DossierTopbar } from "./world-chrome";

type Section = { no: string; kicker: string; title: string; body: string[] };

export type RiderForm = {
  img: string;
  pos: string;
  system: string;
  name: string;
  prefix?: string;
  sub?: string;
  calls: string[];
  quote?: string;
  overview?: string[];
  stats?: { dt: string; dd: string }[];
  abilities?: { name: string; body: string }[];
  arsenal?: { name: string; body: string }[];
  finishers?: { name: string; body: string }[];
  extraForms?: { img: string; pos: string; name: string; sub?: string }[];
  theme?: "rexonance";
  weaponGallery?: { img: string; pos?: string; name: string; label: string }[];
};

type Profile = {
  id: string;
  numeral: string;
  name: string;
  title: string;
  image: string;
  imageWebp: string;
  pos: string;
  accent: string;
  quotes: string[];
  facts: { dt: string; dd: string }[];
  sections: Section[];
  rider?: RiderForm;
  sovereign?: boolean;
};

export function FormPickup({ rider }: { rider: RiderForm }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pointerOpened = useRef(false);
  const cancelScrollReset = useRef<(() => void) | null>(null);
  const gateTimer = useRef<number | null>(null);
  const gatePending = useRef(false);
  const gateSource = useRef<"keyboard" | "pointer">("pointer");
  const gateImage = useRef<HTMLImageElement | null>(null);
  const [gateActive, setGateActive] = useState(false);
  const riderPrefix = rider.prefix ?? "仮面ライダー";
  const isRexonance = rider.theme === "rexonance";
  const resetScroll = () => {
    const dialog = dlg.current;
    if (!dialog) return;
    resetPickupScroll(dialog, [".form-pickup-panel"]);
  };
  const clearPointerFocus = () => {
    if (!pointerOpened.current) return;
    const button = opener.current;
    if (!button) return;
    button.dataset.keyboardFocus = "false";
    button.blur();
  };
  const showDialog = (source: "keyboard" | "pointer") => {
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
    cancelScrollReset.current = settlePickupScroll(dialog, [".form-pickup-panel"], () => {
      dialog.focus({ preventScroll: true });
      clearPointerFocus();
    });
  };
  const finishGate = () => {
    if (!gatePending.current) return;
    gatePending.current = false;
    if (gateTimer.current !== null) {
      window.clearTimeout(gateTimer.current);
      gateTimer.current = null;
    }
    setGateActive(false);
    window.requestAnimationFrame(() => showDialog(gateSource.current));
  };
  const open = (source: "keyboard" | "pointer") => {
    if (!isRexonance) {
      showDialog(source);
      return;
    }
    pointerOpened.current = source === "pointer";
    clearPointerFocus();
    if (gatePending.current) return;
    gatePending.current = true;
    gateSource.current = source;
    setGateActive(true);
    const preload = new window.Image();
    preload.decoding = "async";
    preload.fetchPriority = "high";
    preload.src = rider.img;
    gateImage.current = preload;
    void preload.decode?.().catch(() => undefined);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    gateTimer.current = window.setTimeout(finishGate, reducedMotion ? 180 : 1400);
  };
  const close = () => {
    cancelScrollReset.current?.();
    cancelScrollReset.current = null;
    dlg.current?.close();
    // WebKit restores dialog focus to its opener after close(). Pointer-opened
    // sliders must not look selected after that restoration. Keyboard-opened
    // sliders keep the native return focus for accessible navigation.
    clearPointerFocus();
    window.requestAnimationFrame(clearPointerFocus);
    resetScroll();
  };
  const stats = rider.stats ?? [];
  const abilities = rider.abilities ?? [];
  const arsenal = rider.arsenal ?? [];
  const finishers = rider.finishers ?? [];
  const extraForms = rider.extraForms ?? [];
  const overview = rider.overview ?? [];
  const weaponGallery = rider.weaponGallery ?? [];
  useEffect(
    () => () => {
      gatePending.current = false;
      if (gateTimer.current !== null) window.clearTimeout(gateTimer.current);
      gateImage.current = null;
      cancelScrollReset.current?.();
    },
    [],
  );
  return (
    <section
      className={`form-pickup${isRexonance ? " is-rexonance-pickup" : ""}`}
      aria-label={`${riderPrefix}${rider.name}の記録`}
      aria-busy={gateActive}
    >
      <article className="form-pickup-card">
        {isRexonance ? (
          <div className="rexonance-card-ornaments" aria-hidden="true">
            <i />
            <i />
            <i />
            <span />
          </div>
        ) : null}
        <div className="form-pickup-visual">
          <img
            src={rider.img}
            alt={`${riderPrefix}${rider.name}のフォームビジュアル`}
            style={{ objectPosition: rider.pos }}
            decoding="async"
            fetchPriority={isRexonance ? "high" : "auto"}
            loading={isRexonance ? "eager" : "lazy"}
          />
          <span>RIDER</span>
          <SlideOpenControl
            buttonRef={opener}
            className="form-pickup-plus"
            ariaLabel={`${riderPrefix}${rider.name}をピックアップ`}
            label="フォーム詳細"
            onOpen={open}
          />
        </div>
        <div className="form-pickup-copy">
          <p>TRANSFORMATION RECORD</p>
          <small>PICKUP</small>
          <h2>
            <span>{riderPrefix}</span>
            <b>{rider.name}</b>
          </h2>
          {rider.sub ? <em>{rider.sub}</em> : null}
          <q>{rider.quote ?? rider.system}</q>
        </div>
      </article>
      <dialog
        ref={dlg}
        className={`form-pickup-dialog${isRexonance ? " is-rexonance-dialog" : ""}`}
        tabIndex={-1}
        aria-label={`${riderPrefix}${rider.name}`}
        onClose={resetScroll}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dlg.current) close();
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
        <div className="form-pickup-panel">
          {isRexonance ? (
            <div className="rexonance-panel-ambient" aria-hidden="true">
              <i />
              <i />
              <i />
              <span />
            </div>
          ) : null}
          <div className="form-pickup-heading">
            <p>
              <span>RIDER PICKUP</span>
            </p>
            <small>{rider.system}</small>
            <h2>
              <span>{riderPrefix}</span>
              <b>{rider.name}</b>
            </h2>
            {rider.sub ? <em>{rider.sub}</em> : null}
            <div className="rider-call">
              {rider.calls.map((c, index) => (
                <b key={`${c}-${index}`}>{c}</b>
              ))}
            </div>
          </div>
          <div className="form-pickup-layout">
            <figure>
              <img
                src={rider.img}
                alt=""
                style={{ objectPosition: rider.pos }}
                decoding="async"
                loading={isRexonance ? "eager" : "lazy"}
                fetchPriority={isRexonance ? "high" : "auto"}
              />
              <figcaption>
                <span>FORM VISUAL</span>
                <b>{rider.name}</b>
              </figcaption>
            </figure>
            <div>
              {overview.length ? (
                <section className="form-pickup-overview" aria-label="フォーム概要">
                  <header>
                    <span>00</span>
                    <p>{isRexonance ? "OVERVIEW / TRINITY RESONANCE" : "OVERVIEW"}</p>
                  </header>
                  <div>
                    {overview.map((paragraph) => (
                      <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ) : null}
              {stats.length ? (
                <dl className="form-pickup-stats">
                  {stats.map((s) => (
                    <div key={s.dt}>
                      <dt>{s.dt}</dt>
                      <dd>{s.dd}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <div className="form-pickup-sections">
                {abilities.length ? (
                  <section>
                    <header>
                      <span>01</span>
                      <p>ABILITY</p>
                    </header>
                    {abilities.map((a) => (
                      <div key={a.name}>
                        <h3>{a.name}</h3>
                        <p>{a.body}</p>
                      </div>
                    ))}
                  </section>
                ) : null}
                {arsenal.length ? (
                  <section>
                    <header>
                      <span>02</span>
                      <p>ARSENAL</p>
                    </header>
                    {arsenal.map((a) => (
                      <div key={a.name}>
                        <h3>{a.name}</h3>
                        <p>{a.body}</p>
                      </div>
                    ))}
                  </section>
                ) : null}
                {finishers.length ? (
                  <section>
                    <header>
                      <span>03</span>
                      <p>FINISHER</p>
                    </header>
                    {finishers.map((a) => (
                      <div key={a.name}>
                        <h3>{a.name}</h3>
                        <p>{a.body}</p>
                      </div>
                    ))}
                  </section>
                ) : null}
              </div>
              {extraForms.length > 1 ? (
                <div className="form-pickup-gallery">
                  {extraForms.map((f) => (
                    <figure key={`${f.name}-${f.sub ?? ""}`}>
                      <img
                        src={f.img}
                        alt=""
                        style={{ objectPosition: f.pos }}
                        decoding="async"
                        loading="lazy"
                      />
                      <figcaption>
                        <span>{f.sub ?? "FORM"}</span>
                        <b>{f.name}</b>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {weaponGallery.length ? (
            <section className="rexonance-weapon-gallery" aria-label="レクソナンス追加武装">
              <header>
                <div>
                  <small>LINKED ARMAMENTS / REXONANCE DRIVE</small>
                  <h3>共鳴武装群</h3>
                </div>
                <span>{String(weaponGallery.length).padStart(2, "0")} SYSTEMS</span>
              </header>
              <div className="rexonance-weapon-grid">
                {weaponGallery.map((weapon, index) => (
                  <figure
                    key={weapon.name}
                    className={index === weaponGallery.length - 1 ? "is-wide" : undefined}
                  >
                    <div>
                      <img
                        src={weapon.img}
                        alt={`${weapon.name}の武装ビジュアル`}
                        style={{ objectPosition: weapon.pos ?? "50% 50%" }}
                        decoding="async"
                        loading="lazy"
                        fetchPriority="low"
                      />
                    </div>
                    <figcaption>
                      <small>{weapon.label}</small>
                      <b>{weapon.name}</b>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </dialog>
      {gateActive && typeof document !== "undefined"
        ? createPortal(
            <div
              className="rexonance-gate"
              role="status"
              aria-live="polite"
              aria-label="レクソナンスサーガの記録を展開中"
              onAnimationEnd={(event) => {
                if (
                  event.currentTarget !== event.target ||
                  event.animationName !== "rexonanceGateLife"
                )
                  return;
                finishGate();
              }}
            >
              <div className="rexonance-gate-field" aria-hidden="true">
                <i className="rexonance-gate-spiral is-cyan" />
                <i className="rexonance-gate-spiral is-pink" />
                <i className="rexonance-gate-orbit is-outer" />
                <i className="rexonance-gate-orbit is-inner" />
                <div className="rexonance-gate-stars">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="rexonance-gate-prism">
                  <i className="is-one" />
                  <i className="is-two" />
                  <i className="is-three" />
                </div>
                <div className="rexonance-gate-horizon">
                  <span className="is-cyan" />
                  <span className="is-pink" />
                </div>
                <span className="rexonance-gate-rush is-left" />
                <span className="rexonance-gate-rush is-right" />
                <div className="rexonance-gate-sigil">
                  <i />
                  <b>R</b>
                </div>
              </div>
              <div className="rexonance-gate-copy">
                <small>ORDER × DIVINITY × WILL</small>
                <strong>REXONANCE</strong>
                <span>TRINITY SOVEREIGN LINK ESTABLISHED</span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function ManagerDossier({ profile }: { profile: Profile }) {
  useWorldMode();
  return (
    <main
      className={`manager-page${profile.sovereign ? " is-sovereign" : ""}`}
      style={{
        ["--manager-accent" as string]: profile.accent,
        ["--manager-accent-soft" as string]: profile.accent,
        ["--future-hud-primary" as string]: profile.accent,
      }}
    >
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
        {profile.sovereign ? (
          <div className="sovereign-aura">
            <i />
            <i />
            <i />
            <span>I</span>
          </div>
        ) : null}
      </div>
      <DossierTopbar
        fileLabel={`MANAGER ARCHIVE / ${profile.numeral}`}
        returnHash="manager-archive"
        returnLabel="六詠一覧へ戻る"
      />
      <section className="manager-hero">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src={profile.image}
              srcSet={profile.imageWebp}
              sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1120px) 42vw, 520px"
              alt={`${profile.name}のキャラクタービジュアル`}
              style={{ objectPosition: profile.pos, objectFit: "cover" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            {profile.sovereign ? (
              <div className="sovereign-portrait-effects" aria-hidden="true">
                <i />
                <i />
              </div>
            ) : null}
            {profile.sovereign ? (
              <div className="sovereign-apex-seal" role="img" aria-label="六詠第一位、主権の管理人">
                <small>SOVEREIGNTY</small>
                <strong>I</strong>
                <span>RIKUEI // PRIMARY</span>
              </div>
            ) : null}
            <span className="manager-numeral">{profile.numeral}</span>
          </div>
        </div>
        <div className="manager-introduction">
          {profile.sovereign ? (
            <p className="sovereign-dominance">
              <span>AUTHORITY TRACE</span>
              <b>主権</b>
            </p>
          ) : null}
          <p className="manager-file-number">ARCHIVE ACCESS // {profile.numeral}</p>
          <h1>
            <small>RIKUEI {profile.numeral}</small>
            <span className="manager-display-name">
              <NameText value={profile.name} />
            </span>
          </h1>
          <p className="manager-title"># {profile.title}</p>
          {profile.sovereign ? (
            <section className="sovereign-status" aria-label="六詠第一位・主権の管理人">
              <div className="sovereign-emblem" aria-hidden="true">
                <i />
                <span>I</span>
              </div>
              <div className="sovereign-status-copy">
                <small>AUTHORITY PROTOCOL // RANK I</small>
                <strong>第一位</strong>
                <p>SOVEREIGNTY CONFIRMED</p>
              </div>
              <div className="sovereign-scale" aria-hidden="true">
                <span>
                  <i />
                  <b>VI</b>
                </span>
                <span>
                  <i />
                  <b>V</b>
                </span>
                <span>
                  <i />
                  <b>IV</b>
                </span>
                <span>
                  <i />
                  <b>III</b>
                </span>
                <span>
                  <i />
                  <b>II</b>
                </span>
                <span className="is-apex">
                  <i />
                  <b>I</b>
                </span>
              </div>
            </section>
          ) : null}
          <div className="manager-quotes" aria-label={`${profile.name}の台詞`}>
            {profile.quotes.map((q) => (
              <q key={q}>{q}</q>
            ))}
          </div>
          <dl className="manager-facts">
            {profile.facts.map((f) => (
              <div key={f.dt}>
                <dt>{f.dt}</dt>
                <dd>
                  <NameText value={f.dd} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="manager-dossier" aria-label={`${profile.name}の人物資料`}>
        <div className="manager-section-index">
          <span>{profile.numeral}</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <nav className="manager-section-nav" aria-label="人物資料の章">
          {profile.sections.map((section) => (
            <a key={section.no} href={`#character-section-${section.no}`}>
              <span>{section.no}</span>
              <b>{section.kicker}</b>
            </a>
          ))}
        </nav>
        <div className="manager-sections">
          {profile.sections.map((s) => (
            <article
              className="manager-copy-section"
              id={`character-section-${s.no}`}
              key={s.no}
            >
              <div className="manager-copy-heading">
                <span>{s.no}</span>
                <p>{s.kicker}</p>
                <h2>{s.title}</h2>
              </div>
              <div className="manager-copy-body">
                {s.body.map((p) => (
                  <p key={p.slice(0, 24)}>{p}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      {profile.rider ? <FormPickup rider={profile.rider} /> : null}
      <DossierNav items={RIKUEI_NAV} currentHref={`/managers/${profile.id}`} indexLabel="RIKUEI" />
    </main>
  );
}

export function ManagerStub({ profile }: { profile: Profile }) {
  return <ManagerDossier profile={profile} />;
}

export const REX_LOI: Profile = {
  id: "rex-loi",
  numeral: "II",
  name: "レックス・ロワ",
  title: "真の選択肢を残す管理人",
  image: "/manager-rex-loi.jpeg",
  imageWebp: "/manager-rex-loi.webp",
  pos: "50% 0%",
  accent: "#67d8ff",
  quotes: [
    "選択肢は残しておく。結末は、選んだ側が引き受ける",
    "私が決めたのではない。君が、残された道を歩いただけだ",
    "ヴァンダールは破壊ではない。盤面を開くための一手だ",
  ],
  facts: [
    { dt: "NAME", dd: "レックス・ロワ" },
    { dt: "RANK", dd: "六詠・第二位" },
    { dt: "AUTHORITY", dd: "選択肢／分岐" },
    { dt: "RIDER", dd: "仮面ライダーヴァンダール" },
    { dt: "STATUS", dd: "ACCESS GRANTED" },
  ],
  sections: [
    {
      no: "01",
      kicker: "AUTHORITY / CHOICE",
      title: "結末を決めず、選べる道だけを残す。",
      body: [
        "六詠第二位。勝敗そのものより、勝敗へ至る分岐を管轄する。他の管理人が盤面を閉じようとするとき、レックスは最後の選択肢を一筋だけ残す。",
        "残された道は希望ではない。選んだ者が責任を引き受けるための通路であり、通路を通った瞬間、因果は確定する。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / WEIGHT",
      title: "温和な声で、最も重い権利を渡す。",
      body: [
        "口調は穏やかで、命令口調を嫌う。代わりに、相手が自分で選んだと思える配置を作る。その配置がどれほど残酷でも、レックスはそれを『選択』と呼ぶ。",
      ],
    },
    {
      no: "03",
      kicker: "RIDER / VANDAL",
      title: "管理人自身が、破壊側のライダーになる。",
      body: [
        "仮面ライダーヴァンダールは、レックス・ロワが前線へ降りるための肉弾戦特化形態。管理権限を手放すのではなく、権限を拳に変換する。",
        "戦場では盤面を外側から揺らす。壊すことが目的ではなく、閉じかけた選択肢を物理的にこじ開けることが目的だ。",
      ],
    },
  ],
  rider: {
    img: "/rider-vandal-20260826.jpeg",
    pos: "50% 8%",
    system: "ヴァンダールドライバー × スペシャルコア",
    name: "ヴァンダール",
    calls: ["RIDE IN!", "SPECIAL!", "NONE SHALL TRANSCEND IT!", "VANDAL!"],
    quote: "道を閉ざす物だけを壊しましょう",
    stats: [
      { dt: "HEIGHT", dd: "203.6cm" },
      { dt: "WEIGHT", dd: "113.2kg" },
      { dt: "PUNCH", dd: "262.9t" },
      { dt: "KICK", dd: "372.2t" },
      { dt: "JUMP", dd: "5000m" },
      { dt: "100m", dd: "0.01sec" },
    ],
    abilities: [
      {
        name: "SCANNING",
        body: "一撃を見た時点で、重心、意図、発動条件、癖、精神状態、さらに相手の未来まで読み取り、最適な戦法を提示する。",
      },
      {
        name: "SPECIAL",
        body: "最高位の管理権限をさらに強化し、管理人殺しの力すら干渉できない攻撃と防御へ転用する。",
      },
    ],
    arsenal: [
      {
        name: "サーパスアタノール",
        body: "胸部変換炉。光と闇の神性を均衡循環させ、終焉の炎『ヒネモス』を生む。",
      },
      {
        name: "デアグローブ／デアブーツ",
        body: "接触対象を拳撃が最も通る組成へ変性し、飛行・潜航を錬成して深海から宇宙まで対応する。",
      },
    ],
    finishers: [
      {
        name: "DEAD END",
        body: "光で全構造を可視化・固定し、闇で外部供給、再生、逃走、能力継承を遮断する。ヒネモスを纏った拳または蹴りを中枢へ叩き込んで裁定を完遂する。",
      },
    ],
  },
};

export const SHUZA: Profile = {
  id: "shuza",
  numeral: "III",
  name: "シュザ",
  title: "最上位の戦闘演算",
  image: "/manager-shuza.jpeg",
  imageWebp: "/manager-shuza.webp",
  pos: "50% 16%",
  accent: "#f14a60",
  quotes: [
    "演算は終わっている。あとは実行するだけだ",
    "感情は変数にすぎない。結果は先に出ている",
    "最速で終わらせる。それが一番の慈悲だ",
  ],
  facts: [
    { dt: "NAME", dd: "シュザ" },
    { dt: "RANK", dd: "六詠・第三位" },
    { dt: "AUTHORITY", dd: "戦闘演算／最適解" },
    { dt: "STATUS", dd: "ACCESS GRANTED" },
  ],
  sections: [
    {
      no: "01",
      kicker: "AUTHORITY / COMBAT MATH",
      title: "戦場は、解を出すための計算空間になる。",
      body: [
        "六詠第三位。戦闘そのものを演算として処理し、相手の行動を手番として先読みする。最上位クラスの戦闘能力を持ちながら、勝敗を『予測の検証』として扱う。",
        "レジャスが盤面で相手を誤らせるのに対し、シュザは正しい計算で相手を詰ませる。嘘は不要で、最適解がそのまま圧力になる。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / COLD FIRE",
      title: "熱を持たない炎は、消えない。",
      body: [
        "会話は短い。不要な慰めを返さず、結果だけを置く。冷酷というより、演算結果を改ざんしない誠実さに近い。",
      ],
    },
    {
      no: "03",
      kicker: "BATTLE / EXECUTION",
      title: "手を出す前に、終わり方が決まっている。",
      body: [
        "シュザの戦闘は開幕が遅いように見える。実際は開始前に終了条件が決まっており、開幕後はそれを実行しているだけだ。",
      ],
    },
  ],
  rider: {
    img: "/manager-shuza-rider.jpeg",
    pos: "50% 10%",
    system: "フィフスセプションガヴ × グリードゴチゾウ",
    name: "ルーラー",
    calls: ["GREED!", "GAVV GAVV GAVV GAVV", "DOMINATE!"],
    quote: "演算は終わっている。あとは実行するだけだ",
    stats: [
      { dt: "HEIGHT", dd: "209.6cm" },
      { dt: "WEIGHT", dd: "108.8kg" },
      { dt: "PUNCH", dd: "29.8t" },
      { dt: "KICK", dd: "39.4t" },
      { dt: "JUMP", dd: "58m" },
      { dt: "100m", dd: "0.8sec" },
    ],
    abilities: [
      {
        name: "DESIRE SIGHT",
        body: "対象が『攻撃したい』と思った段階で次の行動を察知し、その動きを生じさせた欲望まで視覚化する。",
      },
      {
        name: "GREED CELL",
        body: "周囲の欲望を糧に増殖と微小破裂を加速。膂力、速度、防御、再生、戦闘継続能力を際限なく高める。",
      },
    ],
    arsenal: [
      {
        name: "グリードセル",
        body: "微小な破裂を同期させ、欲望が強いほど身体能力を増幅する。変形する刃、自己再形成する外殻、欲望誘発波を放つローブを備える。",
      },
      {
        name: "フィニッシャー",
        body: "破損した破片さえ短剣、遠隔刃、拘束用の棘へ変化するハルバード。",
      },
    ],
    finishers: [
      {
        name: "PHOBOS CRACK",
        body: "全身のグリードセルを脚部へ集約し、支配権限を右脚へ重ねて放つ、紅紫色の衝撃を伴うライダーキック。",
      },
      {
        name: "PHOBOS DESTROY",
        body: "フィニッシャーへ巨大な紅紫色の刃を形成し、既に支配している能力、武器、法則を一斉に対象へ集中させる。",
      },
    ],
  },
};

export const REEMU: Profile = {
  id: "reemu",
  numeral: "VI",
  name: "リームー",
  title: "責任から逃れる観測者",
  image: "/manager-reemu.jpeg",
  imageWebp: "/manager-reemu.webp",
  pos: "50% 14%",
  accent: "#d7ab51",
  quotes: [
    "見ていないことにすれば、責任は発生しない",
    "観測しない世界は、まだ終わっていない",
    "私は関与していない。ただ、そこにいただけだ",
  ],
  facts: [
    { dt: "NAME", dd: "リームー" },
    { dt: "RANK", dd: "六詠・第六位" },
    { dt: "AUTHORITY", dd: "観測／非介入" },
    { dt: "STATUS", dd: "ACCESS GRANTED" },
  ],
  sections: [
    {
      no: "01",
      kicker: "AUTHORITY / UNOBSERVED",
      title: "見なければ、因果は確定しない。",
      body: [
        "六詠第六位。観測そのものを権限として持ち、同時に『観測しない』ことで責任を回避する。リームーが見た瞬間、その出来事は記録され、見ていない出来事は未確定のまま残る。",
        "他の六詠が干渉で世界を動かすのに対し、リームーは動かないことで世界の穴を維持する。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / ESCAPE",
      title: "逃げは弱さではなく、管轄の形だ。",
      body: [
        "飄々としており、決断を先送りする。だがその先送り自体が権限行使であり、未確定領域を広げるための技術でもある。",
      ],
    },
    {
      no: "03",
      kicker: "RECORD / ABSENCE",
      title: "不在の記録が、最も正確な署名になる。",
      body: [
        "リームーの関与は、残された空白として検出される。現場にいた痕跡はあるのに、決定を下した記録がない。その空白こそが第六位の仕事だ。",
      ],
    },
  ],
  rider: {
    img: "/manager-reemu-rider.jpeg",
    pos: "50% 12%",
    system: "デザインチャイバー × キジンソードバックル",
    name: "フリート",
    calls: ["SET! AMBITIOUS!", "DIVINE GENERAL!", "KIJIN SWORD!", "READY FIGHT!"],
    quote: "見ていないことにすれば、責任は発生しない",
    stats: [
      { dt: "HEIGHT", dd: "192.3cm" },
      { dt: "WEIGHT", dd: "98.8kg" },
      { dt: "PUNCH", dd: "189.9t" },
      { dt: "KICK", dd: "266.8t" },
      { dt: "JUMP", dd: "1000m" },
      { dt: "100m", dd: "0.003sec" },
    ],
    abilities: [
      {
        name: "KIJIN SWORD",
        body: "天智による高速近接戦闘へ全装備を最適化。知覚、防御、体捌き、弱点解析を統合し、瞬殺へ収束させる。",
      },
      {
        name: "DUAL ON",
        body: "既存バックルと組み合わせ、キジンソードを中心とする追加能力と装備構成を実行する。",
      },
    ],
    arsenal: [
      { name: "天智", body: "愛刀。キジンクグツも生成できる。" },
      { name: "マーダーグラス", body: "構造的弱点と最適打撃点を即座に発見する。" },
    ],
    finishers: [
      {
        name: "KIJIN SWORD STRIKE",
        body: "バットウトリガーを一度引き、紅い月を背に円月殺法の斬撃を放つ。",
      },
      {
        name: "KIJIN SWORD VICTORY",
        body: "トリガーを二度引き、黄金の墨を思わせる回転斬撃を放つ。紫色のライダーキックへも派生する。",
      },
    ],
  },
};

export const ZEUS: Profile = {
  id: "zeus",
  numeral: "I",
  name: "ゼウス",
  title: "主権を継いだ六詠第一位",
  image: "/manager-zeus-detail.jpeg?v=20260823-2",
  imageWebp: "/manager-zeus-detail.webp",
  pos: "50% 42%",
  accent: "#e6c58b",
  sovereign: true,
  quotes: [
    "俺…私が一位なのは事実だけど、それで毎回偉そうに座ってろって？　疲れるやん",
    "じゃあ、そういう事で",
    "いやだぁぁぁぁぁめんどくさぁぁぁぁぁぁい！！！",
  ],
  facts: [
    { dt: "NAME", dd: "ゼウス" },
    { dt: "AGE", dd: "不明" },
    { dt: "SEX", dd: "男性" },
    { dt: "HEIGHT", dd: "188.9cm" },
    { dt: "WEIGHT", dd: "85.6kg" },
    { dt: "RANK", dd: "六詠・第一位" },
    { dt: "AUTHORITY", dd: "主権" },
    { dt: "CV", dd: "花江夏樹" },
  ],
  sections: [
    {
      no: "01",
      kicker: "OVERVIEW / SOVEREIGNTY",
      title: "生まれながらに、第一位の名を継いだ神。",
      body: [
        "『六詠』の一位に位置する青年の姿をした『主権』の神。",
        "産まれて100年も経過していないが、生まれながらに秩序により一位の後任として“ゼウス”の名を襲名しており、彼自身はルーキーであり、あまり管理も上手くない。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / CASUAL ABSOLUTE",
      title: "気さくなまま、拒否する余地だけを消す。",
      body: [
        "六詠第一位らしい強烈な自信と高圧性を持つ一方、実際の人柄は意外なほど気さく。敬語はほぼ使わず、年長者や他の管理人に対しても『お前』『君』『レックス』などと普通に呼び掛ける。これは相手を侮辱しているというより、そもそも上下関係を過剰に儀礼化する習慣が本人にないためである。",
        "自分が第一位であり、周囲より遥かに強いことについても隠さないが、それを何度も誇示するような性格ではない。『私の方が上なんだから黙って従え』と怒鳴るより、『私の方が上だろ。で、何か問題ある？』と記した方が近いだろう。",
        "所作や行動原理も高尚ではない。面白そうなものを見れば普通に近寄り、知らない文化について質問し、人間の妙な習慣を見て笑うこともある。世界内部の食事や娯楽に興味を持ち、管理任務の途中で寄り道することさえある。",
        "ただし、第一位として判断を下す瞬間には空気が変わる。普段の気安さを残したまま、『駄目だ。それは通さない』の一言で全てを止める。声を低くする必要すらない。いつもの口調のまま、拒否する余地だけが消える。",
        "この『親しみやすさ』と『逆らえない絶対性』が同居しているのが、ゼウス最大の特徴となる。",
        "管理人歴が数年しかないため、本人も自分が経験不足であることは自覚している。変に知ったかぶりはしないが、教わる態度まで殊勝になるわけではない。頭の回転と学習能力は極めて高く、彼の成長は危険性を伴う。",
        "本人にとって未知のものほど興味深いため、人間の突拍子もない行動や、合理性を無視した友情、意地、善意などには強い好奇心を示す。",
      ],
    },
  ],
};

export const OPUS: Profile = {
  id: "opus",
  numeral: "V",
  name: "オパス",
  title: "祈願と代価を処理する管理人",
  image: "/manager-opus.jpeg",
  imageWebp: "/manager-opus.webp",
  pos: "50% 12%",
  accent: "#d54cff",
  quotes: [
    "祈らないでください。私は、叶えてしまう",
    "奇跡とは、責任を神へ譲り渡した結果です",
    "願いは受理されました。代価も、既に選ばれています",
  ],
  facts: [
    { dt: "NAME", dd: "オパス" },
    { dt: "AGE", dd: "不明" },
    { dt: "SEX", dd: "男性" },
    { dt: "HEIGHT", dd: "198.8cm" },
    { dt: "WEIGHT", dd: "88.8kg" },
    { dt: "RANK", dd: "六詠・第五位" },
    { dt: "AUTHORITY", dd: "祈願／代価" },
    { dt: "RIDER", dd: "アーマードライダー モスコ" },
  ],
  sections: [
    {
      no: "01",
      kicker: "OVERVIEW / PRAYER & PRICE",
      title: "祈りが他者へ委ねられた瞬間、申請は受理される。",
      body: [
        "『祈願』と『代価』を管轄する、『六詠』第五位の管理人。あらゆる世界で発生する祈り、懇願、救済要求と、それが実現することで生じる代償を管理する。",
        "シュザが人間の内側に存在する『欲望』を扱うのに対し、オパスが対象とするのは、欲望の実現を自分以外の存在へ委ねた瞬間である。誰かに救ってほしい。神に勝たせてほしい。自分の代わりに敵を倒してほしい。そうして自身の選択と責任を外部へ預けた時、その願いはオパスの管理対象となる。",
        "オパスは願いの善悪を判断しない。世界を救いたいという祈りも、誰かを消したいという願いも、彼にとっては等しく処理すべき申請である。祈願の実現に必要な代価を算出し、要求された結果と釣り合う何かを徴収した上で、奇跡を成立させる。",
        "ただし、オパス自身が願いを持つことはほとんどない。他者から与えられた祈願を実行することに特化しているため、能動的な判断力と戦闘意思に乏しく、通常状態における戦闘能力は六詠最下位とされる。",
        "しかし、明確な祈願を受理した場合、その願いを実現するために必要な出力を、代価と引き換えに際限なく獲得する。故に彼は、最弱でありながら、条件次第では上位の六詠すら滅ぼし得る存在でもある。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / IMPARTIAL EXECUTION",
      title: "悪意のないまま、破滅を実行する。",
      body: [
        "物静かで礼儀正しく、常に落ち着いた口調で話す。相手を脅迫することも、祈りを強要することもない。むしろ、自分へ願いを向けようとする者には一度だけ警告を行う。『私に願えば、必ず何かが失われる』と。",
        "それでも願いが撤回されなかった場合、オパスは迷わず受理する。彼にとって祈願とは、願った者が代価の発生を受け入れたという意思表示である。",
        "願った者が具体的な代価を指定しなかった場合は、オパスの権能が願いの実現に最も適したものを自動的に選定する。それが願った本人の命であろうと、守りたかった相手であろうと、世界の未来であろうと、彼が処理を止めることはない。",
        "オパス自身に残虐性はない。苦しむ姿を楽しまず、死者を嘲笑うこともない。ただ祈願を受理し、代価を徴収し、結果を渡す。この『悪意が存在しないまま破滅を実行する』という性質こそ、彼の最大の不気味さである。",
        "また、彼は自身を人間や神としてではなく、祈りを実現するための『武器』と認識している。自ら判断しないことを中立性と考え、自ら責任を負わないことを公平性と考えている。そのため、力を持つ者自身が責任を負うべきだとするレックスとは、根本的に思想が対立している。",
      ],
    },
    {
      no: "03",
      kicker: "COMBAT / ANSWERED PRAYER",
      title: "願われた結果が成立するまで、手段を追加し続ける。",
      body: [
        "通常時は、六詠の中で最も消極的な戦い方をする。自ら攻勢へ出ることは少なく、重厚な装甲による防御、相手の攻撃の受け流し、内蔵兵装による迎撃を中心とする。",
        "技量自体は管理人相応に高いが、戦闘に勝利したいという欲望が希薄であるため、攻撃には決定的な執念が存在しない。",
        "その一方、第三者から明確な祈願を受けた場合は戦闘様式が一変する。祈願の内容が勝利であれば、相手を倒すための武器を。防衛であれば、攻撃を阻む装甲を。破壊であれば、対象の構造を終わらせる神兵を。徴収可能な代価の範囲内で、願いを成立させるための能力と武装を即座に生成する。",
        "オパスは相手を攻略するのではない。願われた結果が成立するまで、必要な手段を追加し続ける。",
        "このため、通常戦闘では六詠最弱でありながら、祈願成立後の必殺技出力だけは六詠でも最大級となる。長期戦はかなり危険だ。",
      ],
    },
    {
      no: "04",
      kicker: "APPEARANCE / FACELESS VESSEL",
      title: "祈りが個人へ向かわぬよう、顔を捨てた。",
      body: [
        "漆黒の礼装と長い外套を纏い、顔を黒いヴェールで完全に覆った大柄な男性。ヴェールの周囲には、茨と後光を組み合わせたような黄金の装飾が取り付けられている。",
        "顔を隠しているのは、素顔を見られることを嫌っているためではない。オパスは祈りが『個人』に向けられることを望まず、あくまで自身を祈願を処理する役割として認識している。そのため、人間としての顔や表情を意図的に排除している。",
        "ヴェールの奥に本当に顔が存在するかは不明。",
      ],
    },
  ],
  rider: {
    img: "/manager-opus-rider.jpeg",
    pos: "50% 10%",
    prefix: "アーマードライダー",
    system: "戦極ドライバー × ディバインロックシード／極超ロックシード",
    name: "モスコ",
    sub: "ディバインアームズ",
    calls: [
      "INFERNO BASKET！",
      "DIVINE！",
      "LOCK ON！",
      "ソイヤッ！",
      "LOCK OPEN！",
      "DIVINE ARMS！",
      "AMBITIOUS！",
    ],
    quote: "祈らないでください。私は、叶えてしまう",
    stats: [
      { dt: "HEIGHT", dd: "216.8cm" },
      { dt: "WEIGHT", dd: "158.8kg" },
      { dt: "PUNCH", dd: "78.8t" },
      { dt: "KICK", dd: "138.8t" },
      { dt: "JUMP", dd: "288.8m" },
      { dt: "100m", dd: "0.018sec" },
    ],
    abilities: [
      {
        name: "神饌から成る禁断のアームズ",
        body: "オパスが、神饌用に改造された『戦極ドライバー』と『ディバインロックシード』『極超ロックシード』を用いて変身したアーマードライダー。ヘルヘイム由来の果実へ、無数の世界で神へ届かなかった祈願と、奇跡の成立に伴って失われた代価を接ぎ木することで完成した、禁断のロックシードを2つ使用する。変身時には上空から巨大な神殿状のアームズが降下。オパスの頭部を覆った後、深紅、群青、紫紺、黄金の装甲へ展開し、全身を重厚な神装へ変化させる。",
      },
      {
        name: "祈願に応じる無制限の追加",
        body: "基本性能は六詠の変身形態としては低い部類に入り、なんとヴィンクルムサーガを下回るが、受理した祈願と徴収可能な代価に応じ、装甲、武器、出力、能力を際限なく追加する性質を持つ。装甲そのものが巨大な祭壇であり、オパスはその中央に安置された『神へ捧げる武器』に過ぎない。",
      },
      {
        name: "戦極ドライバー",
        body: "戦極ドライバーの魔改造品。従来機より1000%以上の性能を発揮する。右側の『オラトリオチャンバー』には受理した祈願が保存され、左側の『サクリファイスチャンバー』には徴収可能な代価が記録される。祈願と代価が釣り合わない場合、必殺技の発動は拒否される。ただし不足分を別の対象から徴収する許可が与えられた場合、ドライバーは周囲から最も価値の高い対象を自動選定する。",
      },
    ],
    arsenal: [
      {
        name: "カテドラルブレスト",
        body: "胸部を覆う神殿状装甲。祈願の内容を解析し、結果の成立に必要なエネルギー、武装、代価を算出する。祈願者が本心を偽っていた場合でも、言葉ではなく潜在意識に存在する本当の願望を読み取る。",
      },
      {
        name: "リタニーヴェール",
        body: "頭部を覆う黒い装甲膜。精神干渉、視線による支配、正体や真名を利用する攻撃を遮断する。オパス個人ではなく『祈願を実行する役割』として存在を固定するため、人格や経歴を標的とする能力が成立しにくい。",
      },
      {
        name: "エクスヴォートショルダー",
        body: "両肩に備わる巨大な祭器。右肩は祈願を吸収し、左肩は支払われた代価を保存する。蓄積量が増すほど装甲の赤紫色の発光が強まり、肩部から角や刃、砲口などの追加神兵が生成される。",
      },
      {
        name: "リタニーエッジ",
        body: "両腕に形成される一体型の神装刃。斬りつけた対象から、願いを成立させる上で障害となる能力や構造を切り離す。対象そのものを斬るのではなく、『願いの邪魔になる部分』を斬るため、能力封印、結界破壊、武装解除などに適する。",
      },
      {
        name: "ヴェスパーマント",
        body: "背部を覆う黒紫色の外套。オパスへ向けられた攻撃を、受理済みの代価へ分配する。代価が十分に存在する間、本人の損傷は抑制されるが、代わりにどこかで何かが失われ続ける。",
      },
    ],
    finishers: [
      {
        name: "ディバインスカッシュ // DIVINE SQUASH！",
        body: "カッティングブレードを一度押し下げて発動。祈願エネルギーをリタニーエッジへ収束し、巨大な十字状斬撃を放つ。通常戦闘で使用する基本必殺技であり、受理した祈願が存在しない場合でも発動可能。",
      },
      {
        name: "ディバインスパーキング // DIVINE SPARKING！",
        body: "カッティングブレードを三度操作して発動。受理済みの祈願に基づき、対象の防御、回避、再生、逃走手段に対応した複数の神兵を同時生成する。相手が対処法を増やすほど、それを突破する神兵も追加される。",
      },
    ],
  },
};
