import { useWorldMode } from "./use-world-mode";
import { DossierContents, DossierReader } from "./dossier-reader";
import { DossierTopbar } from "./world-chrome";

const facts = [
  ["名前", "▢▢▢　▢▢"],
  ["名前の読み", "▢▢▢　▢▢▢"],
  ["神名", "夜明護尊"],
  ["神名の読み", "よあけまもりのみこと"],
  ["年齢", "不詳"],
  ["能力", "▢▢▢▢▢▢▢▢▢"],
  ["種族", "神"],
  ["身長", "186.4cm"],
  ["体重", "78.7kg"],
  ["好き", "シュザ"],
  ["嫌い", "その他全て"],
  ["一人称", "俺"],
  ["二人称", "お前"],
];

const sections = [
  {
    no: "01",
    kicker: "DIVINITY",
    title: "能力概要",
    body: [
      "神として、八百万の一柱として完全に顕現した姿であり、次元を超えた格をもつ存在。武、風、理解の神として八百万の一柱に名を連ねる。",
    ],
  },
  {
    no: "02",
    kicker: "PERSONALITY / COMBAT",
    title: "性格と闘い方",
    body: [
      "……虚無。基本的には何も感じないし、感じようとしない。シュザに関わること以外で感情及び行動が変わることが無く、命令されれば、たとえ六詠だろうとその場で殺しにかかる。",
      "素手オンリーの近接格闘特化タイプ。",
    ],
  },
  {
    no: "03",
    kicker: "PROTECTION / REGENERATION",
    title: "肩代わりと再生",
    body: [
      "彼が指定した相手の受けた痛み及び身体へのダメージを肩代わりする。仮面ライダー変身による肉体、ドライバーへの負荷、技による自傷効果も肩代わりすることが可能。また、その損傷によって死ぬことはない。",
      "仮に四肢がもげようとも、その場で即座に生え変わり、さらに強度を上昇させる。上昇割合は y = 2^x。y は強度上昇割合、x はダメージを受けた回数を表す。",
      "加えて、同じ手段による攻撃が続いた場合、7回を超えると完全耐性を獲得し、その攻撃によるダメージを受けなくなる。",
    ],
  },
  {
    no: "04",
    kicker: "ENRAI",
    title: "慶弥の固有魔法・焔雷",
    body: [
      "火属性と雷属性の固有魔法。設置型にして地雷のようにしたり、拳に纏わせることで、殴ると爆発する某ダイナミック田植えのような芸当ができる。",
      "詠唱：雷鳴轟き黒雲を断つ／焔嗟犇 めき地を穿つ／さらば地上の楽園",
    ],
  },
  {
    no: "05",
    kicker: "ENRAI / GYOTENSEN",
    title: "焔雷・暁天穿（エンライ・ギョウテンセン）",
    body: [
      "この状態で魔法を放つと神力による強化が入る。従来の焔雷の設置、拳に纏うといった使い方のほか、時限式、射出への切り替えも可能。射出は単発式と連射式（秒間6発）を使い分けられる。",
      "神の声による詠唱によって魔力の質が大きく高まり、半神時では到底敵わぬ威力にまで底上げされる。",
    ],
  },
  {
    no: "06",
    kicker: "MEMORY",
    title: "完全神化の代償",
    body: [
      "完全神化により、人として生きたという事実が彼の中で消えて行く。大切な場所、大切な思い出、大切な他人。例外は無く、いとも容易く全てが消えた。",
      "また、神としての彼は、その記憶が消えることに対しては何も感じられなかった。護る者のための姿で、護るべき物は全て彼の中から姿を消す。護られるものは忘れぬままに、そして彼はそれを認識できない……。",
    ],
  },
];

export function YoakeMamoriPage() {
  useWorldMode();
  return (
    <main className="manager-page" style={{ ["--manager-accent" as string]: "#a8c7ff" }}>
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <DossierTopbar
        fileLabel="CHARACTER FILE // 05"
        returnHash="manager-archive-other"
        returnLabel="その他の人物一覧へ戻る"
      />
      <section className="manager-hero" id="dossier-profile">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src="/character-yoake-mamori.jpeg"
              alt="夜明護尊のキャラクタービジュアル"
              width={736}
              height={976}
              style={{ objectFit: "contain" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <span className="manager-numeral">05</span>
          </div>
        </div>
        <div className="manager-introduction">
          <header className="dossier-identity">
            <p className="manager-file-number">CHARACTER FILE // 05</p>
            <h1>
              <small>よあけまもりのみこと</small>
              <span className="manager-display-name">夜明護尊</span>
            </h1>
            <p className="manager-title">武、風、理解の神</p>
            <a className="dossier-read-link" href="#dossier-index">
              人物資料を読む <span aria-hidden="true">↓</span>
            </a>
          </header>
          <dl className="manager-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DossierReader name="夜明護尊" />
      <section className="manager-dossier" id="dossier-index" aria-label="夜明護尊の人物資料">
        <div className="manager-section-index">
          <span>05</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <DossierContents sections={sections} />
        <div className="manager-sections">
          {sections.map((section) => (
            <article
              className="manager-copy-section"
              id={`character-section-${section.no}`}
              key={section.no}
            >
              <div className="manager-copy-heading">
                <span>{section.no}</span>
                <p>{section.kicker}</p>
                <h2>{section.title}</h2>
              </div>
              <div className="manager-copy-body">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
