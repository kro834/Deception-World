import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useWorldMode } from "./use-world-mode";
import { DossierNav, ROKUEI_NAV, NameText } from "./dossier-nav";

type Section = { no: string; kicker: string; title: string; body: string[] };

export type RiderForm = {
  img: string;
  pos: string;
  system: string;
  name: string;
  sub?: string;
  calls: string[];
  quote?: string;
  stats?: { dt: string; dd: string }[];
  abilities?: { name: string; body: string }[];
  arsenal?: { name: string; body: string }[];
  finishers?: { name: string; body: string }[];
  extraForms?: { img: string; pos: string; name: string; sub?: string }[];
};

type Profile = {
  id: string;
  numeral: string;
  name: string;
  title: string;
  image: string;
  pos: string;
  accent: string;
  quotes: string[];
  facts: { dt: string; dd: string }[];
  sections: Section[];
  rider?: RiderForm;
};

export function FormPickup({ rider }: { rider: RiderForm }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const open = () => {
    try {
      dlg.current?.showModal();
    } catch {
      /* already open */
    }
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const close = () => dlg.current?.close();
  const stats = rider.stats ?? [];
  const abilities = rider.abilities ?? [];
  const arsenal = rider.arsenal ?? [];
  const finishers = rider.finishers ?? [];
  const extraForms = rider.extraForms ?? [];
  return (
    <section className="form-pickup" aria-label={`仮面ライダー${rider.name}の記録`}>
      <article className="form-pickup-card">
        <div className="form-pickup-visual">
          <img src={rider.img} alt={`仮面ライダー${rider.name}のフォームビジュアル`} style={{ objectPosition: rider.pos }} decoding="async" fetchPriority="high" loading="eager" />
          <span>RIDER</span>
          <button type="button" className="form-pickup-plus" aria-haspopup="dialog" aria-label={`仮面ライダー${rider.name}をピックアップ`} onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); open(); }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}>
            <span>+</span>
          </button>
        </div>
        <div className="form-pickup-copy">
          <p>TRANSFORMATION RECORD</p>
          <small>PICKUP</small>
          <h2><span>仮面ライダー</span><b>{rider.name}</b></h2>
          {rider.sub ? <em>{rider.sub}</em> : null}
          <q>{rider.quote ?? rider.system}</q>
        </div>
      </article>
      <dialog ref={dlg} className="form-pickup-dialog" tabIndex={-1} aria-label={`仮面ライダー${rider.name}`} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        <div className="form-pickup-panel">
          <button type="button" className="form-pickup-close" onClick={close} aria-label="閉じる"><span>CLOSE</span><i>×</i></button>
          <div className="form-pickup-heading">
            <p><span>RIDER PICKUP</span></p>
            <small>{rider.system}</small>
            <h2>仮面ライダー <b>{rider.name}</b></h2>
            {rider.sub ? <em>{rider.sub}</em> : null}
            <div className="rider-call">{rider.calls.map((c) => (<b key={c}>{c}</b>))}</div>
          </div>
          <div className="form-pickup-layout">
            <figure>
              <img src={rider.img} alt="" style={{ objectPosition: rider.pos }} decoding="async" loading="lazy" />
              <figcaption><span>FORM VISUAL</span><b>{rider.name}</b></figcaption>
            </figure>
            <div>
              {stats.length ? (<dl className="form-pickup-stats">{stats.map((s) => (<div key={s.dt}><dt>{s.dt}</dt><dd>{s.dd}</dd></div>))}</dl>) : null}
              <div className="form-pickup-sections">
                {abilities.length ? (<section><header><span>01</span><p>ABILITY</p></header>{abilities.map((a) => (<div key={a.name}><h3>{a.name}</h3><p>{a.body}</p></div>))}</section>) : null}
                {arsenal.length ? (<section><header><span>02</span><p>ARSENAL</p></header>{arsenal.map((a) => (<div key={a.name}><h3>{a.name}</h3><p>{a.body}</p></div>))}</section>) : null}
                {finishers.length ? (<section><header><span>03</span><p>FINISHER</p></header>{finishers.map((a) => (<div key={a.name}><h3>{a.name}</h3><p>{a.body}</p></div>))}</section>) : null}
              </div>
              {extraForms.length > 1 ? (<div className="form-pickup-gallery">{extraForms.map((f) => (<figure key={`${f.name}-${f.sub ?? ""}`}><img src={f.img} alt="" style={{ objectPosition: f.pos }} decoding="async" loading="lazy" /><figcaption><span>{f.sub ?? "FORM"}</span><b>{f.name}</b></figcaption></figure>))}</div>) : null}
            </div>
          </div>
        </div>
      </dialog>
    </section>
  );
}

function ManagerDossier({ profile }: { profile: Profile }) {
  useWorldMode();
  return (
    <main className="manager-page" style={{ ["--manager-accent" as string]: profile.accent, ["--manager-accent-soft" as string]: profile.accent }}>
      <div className="manager-ambient" aria-hidden="true"><div className="manager-grid" /><div className="manager-glow" /></div>
      <header className="manager-topbar">
        <Link to="/world" hash="manager-archive" className="brand">
          <span className="brand-sigil"><i>DW</i></span>
          <span><b>DECEPTION WORLD</b><small>MANAGER ARCHIVE / {profile.numeral}</small></span>
        </Link>
        <Link to="/world" hash="manager-archive" className="manager-back"><span>六詠一覧へ戻る</span><i aria-hidden="true">↙</i></Link>
      </header>
      <section className="manager-hero">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img src={profile.image} alt={`${profile.name}のキャラクタービジュアル`} style={{ objectPosition: profile.pos, objectFit: "cover" }} />
            <span className="manager-numeral">{profile.numeral}</span>
          </div>
        </div>
        <div className="manager-introduction">
          <p className="manager-file-number">ARCHIVE ACCESS // {profile.numeral}</p>
          <h1><small>ROKUEI {profile.numeral}</small><span className="manager-display-name"><NameText value={profile.name} /></span></h1>
          <p className="manager-title"># {profile.title}</p>
          <div className="manager-quotes" aria-label={`${profile.name}の台詞`}>{profile.quotes.map((q) => (<q key={q}>{q}</q>))}</div>
          <dl className="manager-facts">{profile.facts.map((f) => (<div key={f.dt}><dt>{f.dt}</dt><dd><NameText value={f.dd} /></dd></div>))}</dl>
        </div>
      </section>
      <section className="manager-dossier" aria-label={`${profile.name}の人物資料`}>
        <div className="manager-section-index"><span>{profile.numeral}</span><small>CHARACTER DOSSIER</small></div>
        <div className="manager-sections">{profile.sections.map((s) => (<article className="manager-copy-section" key={s.no}><div className="manager-copy-heading"><span>{s.no}</span><p>{s.kicker}</p><h2>{s.title}</h2></div><div className="manager-copy-body">{s.body.map((p) => (<p key={p.slice(0, 24)}>{p}</p>))}</div></article>))}</div>
      </section>
      {profile.rider ? <FormPickup rider={profile.rider} /> : null}
      <DossierNav items={ROKUEI_NAV} currentHref={`/managers/${profile.id}`} indexLabel="ROKUEI" />
    </main>
  );
}

export function ManagerStub({ profile }: { profile: Profile }) {
  return <ManagerDossier profile={profile} />;
}

export const REX_LOI: Profile = {
  id: "rex-loi", numeral: "II", name: "レックス・ロワ", title: "真の選択肢を残す管理人", image: "/manager-rex-loi.jpeg", pos: "50% 0%", accent: "#67d8ff",
  quotes: ["選択肢は残しておく。結末は、選んだ側が引き受ける", "私が決めたのではない。君が、残された道を歩いただけだ", "ヴァンダールは破壊ではない。盤面を開くための一手だ"],
  facts: [{ dt: "NAME", dd: "レックス・ロワ" }, { dt: "RANK", dd: "六詠・第二位" }, { dt: "AUTHORITY", dd: "選択肢／分岐" }, { dt: "RIDER", dd: "仮面ライダーヴァンダール" }, { dt: "STATUS", dd: "ACCESS GRANTED" }],
  sections: [
    { no: "01", kicker: "AUTHORITY / CHOICE", title: "結末を決めず、選べる道だけを残す。", body: ["六詠第二位。勝敗そのものより、勝敗へ至る分岐を管轄する。他の管理人が盤面を閉じようとするとき、レックスは最後の選択肢を一筋だけ残す。", "残された道は希望ではない。選んだ者が責任を引き受けるための通路であり、通路を通った瞬間、因果は確定する。"] },
    { no: "02", kicker: "PERSONALITY / WEIGHT", title: "温和な声で、最も重い権利を渡す。", body: ["口調は穏やかで、命令口調を嫌う。代わりに、相手が自分で選んだと思える配置を作る。その配置がどれほど残酸でも、レックスはそれを『選択』と呼ぶ。"] },
    { no: "03", kicker: "RIDER / VANDAL", title: "管理人自身が、破壊側のライダーになる。", body: ["仮面ライダーヴァンダールは、レックス・ロワが前線へ降りるための肉弾戦特化形態。管理権限を放すのではなく、権限を拳に変換する。", "戦場では盤面を外側から揺らす。壊すことが目的ではなく、閉じかけた選択肢を物理的にこじ開けることが目的だ。"] },
  ],
  rider: {
    img: "/manager-rex-loi-rider.jpeg", pos: "50% 8%", system: "ヴァンダールドライバー × スペシャルコア", name: "ヴァンダール",
    calls: ["RIDE IN!", "SPECIAL!", "NONE SHALL TRANSCEND IT!", "VANDAL!"], quote: "道を閉ざす物だけを壊しましょう",
    stats: [{ dt: "HEIGHT", dd: "203.6cm" }, { dt: "WEIGHT", dd: "113.2kg" }, { dt: "PUNCH", dd: "262.9t" }, { dt: "KICK", dd: "372.2t" }, { dt: "JUMP", dd: "5000m" }, { dt: "100m", dd: "0.01sec" }],
    abilities: [{ name: "SCANNING", body: "一撃を見た時点で、重心、意図、発動条件、癖、精神状態、さらに相手の未来まで読み取り、最適な戦法を提示する。" }, { name: "SPECIAL", body: "最高位の管理権限をさらに強化し、管理人殺しの力すら干渉できない攻撃と防御へ転用する。" }],
    arsenal: [{ name: "サーパスアタノール", body: "胸部変換炉。光と闇の神性を均衡循環させ、終焉の炎『ヒネモス』を生む。" }, { name: "デアグローブ／デアブーツ", body: "接触対象を拳撃が最も通る組成へ変性し、飛行・潜航を錬成して深海から宇宙まで対応する。" }],
    finishers: [{ name: "DEAD END", body: "光で全構造を可視化・固定し、闇で外部供給、再生、逃走、能力継承を遮断する。ヒネモスを纏った拳または蹴りを中枢へ叩き込んで裁定を完遂する。" }],
  },
};

export const SHUZA: Profile = {
  id: "shuza", numeral: "III", name: "シュザ", title: "最上位の戦闘演算", image: "/manager-shuza.jpeg", pos: "50% 16%", accent: "#f14a60",
  quotes: ["演算は終わっている。あとは実行するだけだ", "感情は変数にすぎない。結果は先に出ている", "最速で終わらせる。それが一番の慈悲だ"],
  facts: [{ dt: "NAME", dd: "シュザ" }, { dt: "RANK", dd: "六詠・第三位" }, { dt: "AUTHORITY", dd: "戦闘演算／最適解" }, { dt: "STATUS", dd: "ACCESS GRANTED" }],
  sections: [
    { no: "01", kicker: "AUTHORITY / COMBAT MATH", title: "戦場は、解を出すための計算空間になる。", body: ["六詠第三位。戦闘そのものを演算として処理し、相手の行動を手番として先読みする。最上位クラスの戦闘能力を持ちながら、勝敗を『予測の検証』として扱う。", "レジャスが盤面で相手を誤らせるのに対し、シュザは正しい計算で相手を詰ませる。嘘は不要で、最適解がそのまま圧力になる。"] },
    { no: "02", kicker: "PERSONALITY / COLD FIRE", title: "熱を持たない炎は、消えない。", body: ["会話は短い。不要な慰めを返さず、結果だけを置く。冷酸というより、演算結果を改ざんしない誠実さに近い。"] },
    { no: "03", kicker: "BATTLE / EXECUTION", title: "手を出す前に、終わり方が決まっている。", body: ["シュザの戦闘は開幕が遅いように見える。実際は開始前に終了条件が決まっており、開幕後はそれを実行しているだけだ。"] },
  ],
  rider: {
    img: "/manager-shuza-rider.jpeg", pos: "50% 10%", system: "フィフスセプションガヴ × グリードゴチゾウ", name: "ルーラー",
    calls: ["GREED!", "GAVV GAVV GAVV GAVV", "DOMINATE!"], quote: "演算は終わっている。あとは実行するだけだ",
    stats: [{ dt: "HEIGHT", dd: "209.6cm" }, { dt: "WEIGHT", dd: "108.8kg" }, { dt: "PUNCH", dd: "29.8t" }, { dt: "KICK", dd: "39.4t" }, { dt: "JUMP", dd: "58m" }, { dt: "100m", dd: "0.8sec" }],
    abilities: [{ name: "DESIRE SIGHT", body: "対象が『攻撃したい』と思った段階で次の行動を察知し、その動きを生じさせた欲望まで視覚化する。" }, { name: "GREED CELL", body: "周囲の欲望を糧に増殖と微小破裂を加速。臆力、速度、防御、再生、戦闘継続能力を際限なく高める。" }],
    arsenal: [{ name: "グリードセル", body: "微小な破裂を同期させ、欲望が強いほど身体能力を増幅する。変形する刃、自己再形成する外殻、欲望誘発波を放つローブを備える。" }, { name: "フィニッシャー", body: "破損した碎片さえ短剣、遠隔刃、拘束用の棘へ変化するハルバード。" }],
    finishers: [{ name: "PHOBOS CRACK", body: "全身のグリードセルを脚部へ集約し、支配権限を右脚へ重ねて放つ、紅紫色の衝撃を伴うライダーキック。" }, { name: "PHOBOS DESTROY", body: "フィニッシャーへ巨大な紅紫色の刃を形成し、既に支配している能力、武器、法則を一斉に対象へ集中させる。" }],
  },
};

export const REEMU: Profile = {
  id: "reemu", numeral: "VI", name: "リームー", title: "責任から逃れる観測者", image: "/manager-reemu.jpeg", pos: "50% 14%", accent: "#d7ab51",
  quotes: ["見ていないことにすれば、責任は発生しない", "観測しない世界は、まだ終わっていない", "私は関与していない。ただ、そこにいただけだ"],
  facts: [{ dt: "NAME", dd: "リームー" }, { dt: "RANK", dd: "六詠・第六位" }, { dt: "AUTHORITY", dd: "観測／非介入" }, { dt: "STATUS", dd: "ACCESS GRANTED" }],
  sections: [
    { no: "01", kicker: "AUTHORITY / UNOBSERVED", title: "見なければ、因果は確定しない。", body: ["六詠第六位。観測そのものを権限として持ち、同時に『観測しない』ことで責任を回避する。リームーが見た瞬間、その出来事は記録され、見ていない出来事は未確定のまま残る。", "他の六詠が干渉で世界を動かすのに対し、リームーは動かないことで世界の穴を維持する。"] },
    { no: "02", kicker: "PERSONALITY / ESCAPE", title: "逃げは弱さではなく、管轄の形だ。", body: ["飄々としており、決断を先送りする。だがその先送り自体が権限行使であり、未確定領域を広げるための技術でもある。"] },
    { no: "03", kicker: "RECORD / ABSENCE", title: "不在の記録が、最も正確な署名になる。", body: ["リームーの関与は、残された空白として検出される。現場にいた痕跡はあるのに、決定を下した記録がない。その空白こそが第六位の仕事だ。"] },
  ],
  rider: {
    img: "/manager-reemu-rider.jpeg", pos: "50% 12%", system: "デザインチャイバー × キジンソードバックル", name: "フリート",
    calls: ["SET! AMBITIOUS!", "DIVINE GENERAL!", "KIJIN SWORD!", "READY FIGHT!"], quote: "見ていないことにすれば、責任は発生しない",
    stats: [{ dt: "HEIGHT", dd: "192.3cm" }, { dt: "WEIGHT", dd: "98.8kg" }, { dt: "PUNCH", dd: "189.9t" }, { dt: "KICK", dd: "266.8t" }, { dt: "JUMP", dd: "1000m" }, { dt: "100m", dd: "0.003sec" }],
    abilities: [{ name: "KIJIN SWORD", body: "天智による高速近接戦闘へ全装備を最適化。知覚、防御、体捏き、弱点解析を統合し、瞬殺へ収束させる。" }, { name: "DUAL ON", body: "既存バックルと組み合わせ、キジンソードを中心とする追加能力と装備構成を実行する。" }],
    arsenal: [{ name: "天智", body: "愛刀。キジンクグツも生成できる。" }, { name: "マーダーグラス", body: "構造的弱点と最適打撃点を即座に発見する。" }],
    finishers: [{ name: "KIJIN SWORD STRIKE", body: "バットウトリガーを一度引き、紅い月を背に円月殺法の斬撃を放つ。" }, { name: "KIJIN SWORD VICTORY", body: "トリガーを二度引き、黄金の墨を思わせる回転斬撃を放つ。紫色のライダーキックへも派生する。" }],
  },
};
