import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorldMode } from "./use-world-mode";
import { DossierNav, RIKUEI_NAV, NameText } from "./dossier-nav";
import { SlideOpenControl } from "./slide-open-control";
import { UiVectorIcon } from "./ui-vector-icon";
import { LiquidPointerGlow } from "./liquid-rail";
import { resetPickupScroll, settlePickupScroll } from "./pickup-scroll-reset";
import { DossierTopbar } from "./world-chrome";
import { DossierContents, DossierReader } from "./dossier-reader";

type Section = { no: string; kicker: string; title: string; body: string[] };

export type RiderForm = {
  img: string;
  pos: string;
  system: string;
  name: string;
  prefix?: string;
  nameParts?: string[];
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
  const formName = rider.nameParts
    ? rider.nameParts.map((part) => (
        <span className="form-name-part" key={part}>
          {part}
        </span>
      ))
    : rider.name;
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
            <b>{formName}</b>
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
              <b>{formName}</b>
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
      <section className="manager-hero" id="dossier-profile">
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
          <header className="dossier-identity">
            <p className="manager-file-number">ARCHIVE ACCESS // {profile.numeral}</p>
            <h1>
              <small>RIKUEI {profile.numeral}</small>
              <span className="manager-display-name">
                <NameText value={profile.name} />
              </span>
            </h1>
            <p className="manager-title"># {profile.title}</p>
            <a className="dossier-read-link" href="#dossier-index">
              人物資料を読む <span aria-hidden="true">↓</span>
            </a>
          </header>
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
      <DossierReader name={profile.name} forms={Boolean(profile.rider)} />
      <section
        className="manager-dossier"
        id="dossier-index"
        aria-label={`${profile.name}の人物資料`}
      >
        <div className="manager-section-index">
          <span>{profile.numeral}</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <DossierContents sections={profile.sections} />
        <div className="manager-sections">
          {profile.sections.map((s) => (
            <article className="manager-copy-section" id={`character-section-${s.no}`} key={s.no}>
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
      {profile.rider ? (
        <div id="form-records">
          <FormPickup rider={profile.rider} />
        </div>
      ) : null}
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
  title: "秩序の大口と裁定者の仮面",
  image: "/manager-rex-loi.jpeg",
  imageWebp: "/manager-rex-loi.webp",
  pos: "50% 0%",
  accent: "#67d8ff",
  quotes: [
    "世界は、今日も選択を許されて居ます",
    "生者には生を。死者には静寂を",
    "力有る者には責任を",
    "私の力が、私の欲によって振るわれぬ様に",
    "今日も又、道を閉ざす物だけを壊しましょう",
    "我々と皆様の、秩序の為に",
  ],
  facts: [
    { dt: "NAME", dd: "レックス・ロワ" },
    { dt: "RANK", dd: "六詠・第二位" },
    { dt: "AGE", dd: "不明" },
    { dt: "GENDER", dd: "両性具有（性自認は女性。本人に強い自覚はない）" },
    { dt: "HEIGHT", dd: "185.0cm" },
    { dt: "WEIGHT", dd: "80.1kg" },
    { dt: "DIVINITY", dd: "秩序の神" },
    { dt: "AUTHORITY", dd: "秩序／破壊・固定管轄なし" },
    { dt: "RIDER", dd: "仮面ライダーヴァンダール" },
    { dt: "STATUS", dd: "ACCESS GRANTED" },
  ],
  sections: [
    {
      no: "01",
      kicker: "POSITION / RESPONSIBILITY",
      title: "世界を残し、支配だけを終わらせるために。",
      body: [
        "固定された管轄を持たない六詠の管理人であり、『仮面ライダーノット』の世界を臨時で管理している。管理人達の都護府のような立場から、三省及び御史台に相当する中央官制の全役割を単独で担う。率先して責任を引き受ける模範的な態度と、破壊者として猛々しく冷徹な判断を併せ持つ。",
        "サーガ世界の問題も自ら解決すべき事案と考えているが、その権能はローアの管理構造とともに、辛うじて維持される世界自体を破壊しかねない。誰よりも解放を望みながら自分の力だけでは実現できず、世界を残したまま管理構造だけを終わらせ得る存在を探し、他の六詠に先んじて暗躍する。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / CONSCIENCE",
      title: "他者の選択を奪わない、六詠唯一の完全なる良心。",
      body: [
        "冷静沈着で慇懃かつ親切。相手の立場や能力を認めながらも自他を対等に捉え、静かな口調と寛容さを崩さない。善意や友情、使命感を軽んじるように振る舞うことはあっても、その力を正確に理解して尊重し、意図的に踏みにじることはない。",
        "戦闘を『儀式』と呼び、他者の選択を奪ってきた絶対者に、自らの誤りと敗北を理解させるために破壊を行う。それは人格や尊厳を弄ぶためではない。策略に長け、必要なら正面戦闘や敵対者との一時的な共闘も選び、第一位と同等の行動権を用いて事案の解決へ協力する。",
        "予測を外す存在は重要な観測対象とするが、脅威か救済の可能性かを見極めるまでは排除しない。提案の拒絶も当然の自衛として尊重し、不利益を与えることはなく、過去に協力を断った者からの救援にも真摯に応じる。",
      ],
    },
    {
      no: "03",
      kicker: "BATTLE / VERDICT",
      title: "策を尽くした上で、真正面から絶対性を砕く。",
      body: [
        "卓越した身体能力による近接格闘を軸に、敵の能力、思考、関係性、戦闘履歴を解析する。逃走経路や反撃手段、能力の発動条件、精神的な支柱まで把握してなお正面から圧倒することを、支配の根拠を最も効率よく破壊する手段と考えている。戦闘開始直後には、あえて防御や回避を抑えて攻撃を観察する。",
      ],
    },
    {
      no: "04",
      kicker: "DIVINITY / LIGHT AND DARK",
      title: "光で輪郭を与え、闇で守り、役割を終えたものを還す。",
      body: [
        "ブロンドの髪と人ならざる麗貌、豪奢な祭服を持つ青年の姿を取るが、人間ではない。人々の想いが集積して成立した『秩序の神』であり、通常の物理攻撃は通用せず、口内には鋭い毒牙を備える。神体の人型部分には光、蛇状の尾『秩序』には闇の神性が強く表れる。",
        "光は隠されたものを明らかにし、生命、意思、法則を現実へ定着させる力。闇は外部の干渉を遮って休息を与え、過剰な力や不要な構造を呑み込み、静寂へ還す力である。過剰な光は監視と支配に、過剰な闇は停滞と消失に繋がるため、どちらも絶対的な正義ではない。双方を役割どおりに配置することこそ、レックスの秩序である。",
        "戦闘では光で本質、能力構造、偽装、因果を可視化して固定し、闇で外部供給、逃走、再生などの接続を断つ。ただし、世界と複雑に癒着した支配を完全に分離できるとは限らない。二つの神性は独立した人格や器官ではなく、一つの神格を循環しており、光にも裁定が、闇にも庇護が存在する。",
      ],
    },
    {
      no: "05",
      kicker: "LIFE / ORDER",
      title: "世界を管理する前に、自らの力を問い直す。",
      body: [
        "休息と覚醒を行い、目覚めると必ず祈りを捧げる。それは他の神へ救済を求める行為ではなく、世界の根源的な秩序と自らの責任を確かめる儀式である。自分を裁定する上位者を持たないからこそ、力を振るう前にその正当性を自問する。",
        "『秩序』は装備でも変異でもなく神体の一部で、巨大な捕食口が物質、エネルギー、権能、管理構造を呑み込み分解する。口と牙は強力な猛毒も分泌する。普段は祭服の背面へ収められ、戦闘や権限行使の際に展開される。",
        "尾の肉質は柔らかくしなやかで、仙骨の動きに連動して揺れ、ときには本人の意思と無関係に喜びなどの感情を表す。高い弾性と衝撃吸収性によって自他を包むエアバッグとなり、休息時には本人公認の抱き枕としても働く。",
      ],
    },
  ],
  rider: {
    img: "/rider-vandal-20260826.jpeg",
    pos: "50% 8%",
    system: "ヴァンダールドライバー × スペシャルコア",
    name: "ヴァンダール",
    calls: ["RIDE IN!", "SPECIAL!", "ROLLOUT!", "NONE SHALL TRANSCEND IT!", "VANDAL!"],
    quote: "道を閉ざす物だけを壊しましょう",
    overview: [
      "ヴァンダールドライバーとスペシャルコアで変身する、物理格闘戦に特化したライダー。アギトやギーツのシステムと関連性を持ち、エクスプリームサーガ・ウルトラにすら迫り得る実力を備える。",
      "光と闇を循環させる変換炉が終焉の炎『ヒネモス』を生み、正義の志、討伐・無力化した管理人から回収した力、大気や水などを再錬成して無尽蔵のエネルギーを得る。必要な攻撃へ身体を瞬時に再錬成する性能とレックスの思想から、他の五人にとっても最大級の脅威とされる。",
    ],
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
        body: "スペシャルコアを押し込んで発動。最高位の管理権限をさらに強化し、管理人殺しの力すら干渉できない攻撃と防御へ転用する。",
      },
    ],
    arsenal: [
      {
        name: "サーパスアタノール",
        body: "光で再錬成する構造を照合・固定し、闇で不要な組成や過剰なエネルギー、外部接続を分解・吸収する胸部変換炉。二つの神性を衝突させず循環し、損失を極限まで抑えてヒネモスを生む。",
      },
      {
        name: "デアグローブ",
        body: "接触対象を拳撃が最も効率よく伝わる組成へ再錬成し、観測・解析可能な対象を硬度や性質によらず破壊する。十分な解析後には、装甲効果、結界、空間構造といった非物質的防御も一時的に破壊可能な構造体として再定義する。",
      },
      {
        name: "デアブーツ",
        body: "腕部とともに膨大な回数の再錬成を続け、必要な組成・形状へ変化する。飛行や潜航などの推進機能を錬成し、深海から宇宙までを活動範囲とする。",
      },
    ],
    finishers: [
      {
        name: "デッドエンド",
        body: "『DEAD END！』。ドライバー右側面を殴り付けて発動する。光で全構造を可視化・固定し、闇で外部供給、再生、逃走、能力継承を遮断。解析結果をデアグローブまたはデアブーツへ反映し、防御を破壊に適した構造へ再錬成する。十分な解析後には防御そのものを衝撃の伝達経路へ変え、ヒネモスを纏う拳撃・蹴撃を中枢へ叩き込む。",
      },
    ],
  },
};

export const SHUZA: Profile = {
  id: "shuza",
  numeral: "III",
  name: "シュザ",
  title: "欲望と支配を統べる主座",
  image: "/manager-shuza.jpeg",
  imageWebp: "/manager-shuza.webp",
  pos: "50% 16%",
  accent: "#f14a60",
  quotes: [
    "我慢なんかせんでもええんよ。あんたの欲しいもん、うちにはぜぇんぶ見えてますさかい",
    "好きにしはったらええよ。───もっとも、何を“好き”やと思うかは、もう、うちが決めてしもうたけど",
    "嗚呼…この子、うちの物になったの",
  ],
  facts: [
    { dt: "NAME", dd: "シュザ" },
    { dt: "RANK", dd: "六詠・第三位" },
    { dt: "AGE", dd: "不明" },
    { dt: "SEX", dd: "女性" },
    { dt: "HEIGHT", dd: "176.8cm" },
    { dt: "WEIGHT", dd: "61.3kg" },
    { dt: "AUTHORITY", dd: "欲望／支配" },
  ],
  sections: [
    {
      no: "01",
      kicker: "AUTHORITY / DESIRE",
      title: "望みを奪わず、望む先だけを支配する。",
      body: [
        "欲望と支配を管轄する六詠第三位。下位三名を純戦闘力、管理権限、干渉範囲の全てで凌駕する。人格、記憶、思考を残したまま『何を望むか』という根源だけを書き換え、対象に支配を自らの意思だと信じさせる。それは精神を奪う洗脳ではなく、本人のまま従わせる完全な支配である。",
        "生命、武器、能力、世界法則にも欲望の指向性を与え、離反や暴走を誘導する。彼女が立つ場所は万物の《主座》となり、全ての生命、概念、物語が彼女の許可なく何かを望めない完全支配領域へ変わる。目的は世界の破壊ではない。世界を残したまま、あらゆる望みを自分の所有物にすることである。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / GRACE",
      title: "希望を差し出し、自ら跪く瞬間を待つ。",
      body: [
        "穏やかな京都弁で語り、優雅な微笑を崩さないが、本質は悪辣で選民的である。強い信念を持つ者にはあえて希望を与え、その希望ごと自発的に差し出して隷属する瞬間を好む。上位者の実力には表面上の敬意を示すものの、忠誠を誓うことはない。",
        "腰まで届く白銀の髪と紅玉の瞳、深紅の花房飾りを持つ。黒、紅、紫を重ねた着物には金糸の桜と蔓草が走り、袖と裾は刃、盾、拘束帯へ変わる外装でもある。煙管状の《朱雅管》は喫煙具ではなく権限補助端末で、紅紫の霧によって周囲の欲望を可視化する。",
      ],
    },
    {
      no: "03",
      kicker: "BATTLE / THRONE",
      title: "欲するほど、紅紫の糸は強くなる。",
      body: [
        "和舞の歩法から掌打と蹴りを繋ぎ、戦場に満ちる欲望を力へ変換する。紅紫の《欲糸》は肉体だけでなく攻撃、武器、能力の向きまで誘導する。管理権能を封じられても六詠第三位の基礎戦力は失われず、純粋な体術だけで戦線を制圧できる。",
      ],
    },
  ],
  rider: {
    img: "/manager-shuza-rider.jpeg",
    pos: "50% 10%",
    system: "ディセプションガヴ × グリードゴチゾウ",
    name: "ルーラー",
    calls: ["GREED!", "GAVV GAVV GAVV GAVV", "GREED!", "DOMINATE!"],
    quote: "我慢なんかせんでもええんよ。あんたの欲しいもん、うちにはぜぇんぶ見えてますさかい",
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
        name: "ディセプションガヴ／グリードプラズム",
        body: "装着機械ではなくシュザの肉体から直接形成される生体器官。欲望を生体組織グリードプラズムへ変換し、黒紫、深紅、金の装甲を構成する。Gavv系列ながら発生系統が異なり、精神、概念、世界への欲望支配とは別系統で純粋な身体性能を担う。変身音は短い語句、識別番号、囁きで構成され、背後で『欲しい』を反復し、完了時にシュザの名を告げる。",
      },
      {
        name: "ディセプションヘッド／デザイアサイト",
        body: "頭部セルの膨張と破裂で感覚を活性化し、熱、魔力、空間、感情を感知する。複眼は弱点、攻撃経路、欲望を可視化し、対象が攻撃を意図した時点で行動を察知する。ドミニオンホーンは支配対象の欲望を距離や世界を越えて受信し、位置を特定して力へ変える。",
      },
      {
        name: "グリードマスターブレスト／グリードバーストアーム",
        body: "胸部の微小破裂を同期させて膂力を数百倍へ増幅し、欲望が強いほど上限なく出力を高める。肩、腕、肘、拳の破裂連鎖は接触後も威力を高め、インテグラルフィストに肉薄する打撃力を生む。",
      },
      {
        name: "グリードバーストレッグ",
        body: "腿、膝、脛、足首で推進力を増幅、伝達し、命中直前に重量と速度を最大化する。カラクリポックリは空間面を知覚するヒールで、攻撃時には支配力も引き上げる。",
      },
    ],
    arsenal: [
      {
        name: "ドミネイトクロー",
        body: "収納、伸長、変形する生体刃。鉤爪、長刀、鞭状刃を戦況に応じて使い分ける。",
      },
      {
        name: "グリードカラパス／ドミネイトローブ",
        body: "外殻は被弾部を細片化して衝撃を分散し、即座に再生する。ローブは欲望誘発波で執着を表層化させ、《主座》の支配を補助する。",
      },
      {
        name: "フィニッシャー",
        body: "重量級の生体ハルバード。シュザは片手で操り、飛散した破片も短剣、遠隔刃、拘束用の棘へ再形成する。",
      },
    ],
    finishers: [
      {
        name: "フォボスクラック",
        body: "『PHOBOS CRACK！』。ディセプカッションを一度操作し、脚部へセルを集約。支配権限を右脚へ重ね、紅紫の衝撃を伴うキックを叩き込む。",
      },
      {
        name: "フォボスデストロイ",
        body: "『PHOBOS DESTROY！』。ディセプカッションを二度操作し、フィニッシャーへ巨大な紅紫の刃を形成。支配した能力、武器、法則を一斉に呼応させ、一点へ集中する。",
      },
    ],
  },
};

export const REEMU: Profile = {
  id: "reemu",
  numeral: "VI",
  name: "リームー",
  title: "言い訳を現実にする男",
  image: "/manager-reemu.jpeg",
  imageWebp: "/manager-reemu.webp",
  pos: "50% 14%",
  accent: "#d7ab51",
  quotes: [
    "なんかぁ……死なないといけない運命って辛いですよねぇ",
    "だからまあ、仕方ないですよね",
    "貴方が死ぬのは、僕のせいじゃない",
  ],
  facts: [
    { dt: "NAME", dd: "リームー" },
    { dt: "RANK", dd: "六詠・第六位" },
    { dt: "AGE", dd: "不明" },
    { dt: "SEX", dd: "男性" },
    { dt: "HEIGHT", dd: "169.0cm" },
    { dt: "WEIGHT", dd: "63.2kg" },
    { dt: "AUTHORITY", dd: "固定管轄なし" },
  ],
  sections: [
    {
      no: "01",
      kicker: "AUTHORITY / REDEFINITION",
      title: "世界を、都合のよい盤面へ言い換える。",
      body: [
        "六詠第六位だが、固定された管轄を持たない。それは無力だからではなく、管轄そのものを必要としないためである。侵入した世界の状況、責任、因果、運命を自分に都合のよい管理対象へ再定義し、世界全体を盤面へ変える。",
        "サーガ世界を含む全世界の掌握を目指し、他の六詠に先んじて独断で暗躍する。敵味方への憎愛ではなく自己保身を基準とし、他者の価値、覚悟、信念、愛情さえ自分を守るための踏み台として扱う。",
      ],
    },
    {
      no: "02",
      kicker: "PERSONALITY / EXCUSE",
      title: "責任を退け、言い訳の側へ現実を寄せる。",
      body: [
        "表向きは温厚で争いを嫌うが、実態は排他的で責任転嫁を重ねる人物である。自己肯定感は低く承認に飢えている一方、プライドは高く敗北を認めない。自分の言い訳が成立するように因果を組み替える、『言い訳を現実にする男』である。",
        "オランダ貴族を思わせる姿を持ち、愛刀《天智》を帯びる。正面衝突を嫌うだけで決して弱くなく、生身でも戦闘可能で、出力は並の管理人を大きく上回る。",
      ],
    },
    {
      no: "03",
      kicker: "BATTLE / RIGGED BOARD",
      title: "戦う前に、敗北だけを相手の責任にする。",
      body: [
        "不意打ち、誘導、分断、誤認、責任転嫁、敵対関係の捏造、勝利条件の変更を重ね、戦闘が始まる前に相手が詰んだ盤面を作る。真正面から斬り結ぶ場合も《天智》による近接瞬殺へ徹し、ディルクルムサーガを圧倒する戦闘力を示す。",
      ],
    },
  ],
  rider: {
    img: "/manager-reemu-rider.jpeg",
    pos: "50% 12%",
    system: "デザイアドライバー × キジンソードバックル",
    name: "フリート",
    calls: ["SET! AMBITIOUS!", "DIVINE GENERAL!", "KIJIN SWORD!", "READY FIGHT!"],
    quote: "貴方が死ぬのは、僕のせいじゃない",
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
        name: "キジンソードフリートヘッド",
        body: "キジンソードイヤーは5000京光年先で発生したダイヤモンドダストの生成音さえ聞き分け、目視せず斬撃を成立させる。マーダーグラスは弱点と最適打撃部位を解析し、キジンソードガードの頭部外骨格が鉄壁の防御を担う。",
      },
      {
        name: "アジャスティングファイ／マーダーマスターチェスト",
        body: "腿部の重量配分を瞬時に調整し、走力、蹴力、鍔迫り合いの全てで理想的な体捌きを実現する。胸部は天智の剣技を最大化し、多勢を単独で圧倒する。",
      },
      {
        name: "フルマックスデュアルカスタマイザー",
        body: "既存バックルをDual Onし、キジンソードを中核に能力と装備を最適化する。フリートは独立戦力としてキジンクグツも生成できる。",
      },
    ],
    arsenal: [
      { name: "天智", body: "近接瞬殺へ特化したリームーの愛刀。" },
      {
        name: "キジンアーマー／オラクルバンテージ",
        body: "膝と肩の多重重装甲が衝撃を吸収し、腰部のオラクルバンテージが戦闘力を極限まで引き上げる。黒いグリードマントは背後からジャミングを展開する。",
      },
    ],
    finishers: [
      {
        name: "キジンソードストライク",
        body: "『KIJIN SWORD STRIKE！』。バットウトリガーを一度引き、紅い月を背に円月殺法の斬撃を放つ。",
      },
      {
        name: "キジンソードビクトリー",
        body: "『KIJIN SWORD VICTORY！』。バットウトリガーを二度引き、黄金の墨から回転斬撃エネルギーを放つ。脚を回転させた十字剣とキック、連続斬りからの回し蹴り、紫のエネルギーを纏うライダーキックへ派生する。",
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
