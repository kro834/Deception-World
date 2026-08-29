import { useWorldMode } from "./use-world-mode";
import { DossierNav, RELATED_NAV, NameText } from "./dossier-nav";
import { FormPickup, type RiderForm } from "./manager-stub";
import { DossierTopbar } from "./world-chrome";

type Related = {
  id: string;
  code: string;
  name: string;
  en: string;
  form: string;
  image: string;
  thumb: string;
  pos: string;
  accent: string;
  title: string;
  quotes: string[];
  facts: { dt: string; dd: string }[];
  sections: { no: string; kicker: string; title: string; body: string[] }[];
  rider: RiderForm;
};

const RELATED: Related[] = [
  {
    id: "terra",
    code: "01",
    name: "テラ・アレイン",
    en: "TERRA ALAIN",
    form: "EARTH FORM",
    image: "/character-terra.jpeg",
    thumb: "/character-terra-thumb.jpeg",
    pos: "50% 12%",
    accent: "#69df74",
    title: "世界の物質的基盤を支える、アレイン家共同当主",
    quotes: [
      "家名とは、誇るための冠ではない。守れなかったものを忘れぬための重石だ",
      "地は逃げない。ならば私も、ここから退く理由はない",
    ],
    facts: [
      { dt: "NAME", dd: "テラ・アレイン" },
      { dt: "AGE", dd: "32歳" },
      { dt: "GENDER", dd: "男性" },
      { dt: "NATIONALITY", dd: "フランス" },
      { dt: "HEIGHT", dd: "190.8cm" },
      { dt: "WEIGHT", dd: "84.6kg" },
    ],
    rider: {
      img: "/rider-realm-earth.jpeg",
      pos: "50% 12%",
      system: "レルムズドライバー × アースコア",
      name: "レルム",
      sub: "アースフォーム",
      calls: ["REALMS!", "EARTH!", "Rollout!", "STABILIZE! REALMS SYSTEM!", "EARTH!"],
      quote: "地は逃げない。ならば私も、ここから退く理由はない",
      stats: [
        { dt: "HEIGHT", dd: "223.8cm" },
        { dt: "WEIGHT", dd: "186.8kg" },
        { dt: "PUNCH", dd: "166.4t" },
        { dt: "KICK", dd: "188.6t" },
        { dt: "JUMP", dd: "72.0m" },
        { dt: "100m", dd: "0.24sec" },
      ],
      abilities: [
        {
          name: "EARTH",
          body: "位置、速度、質量、重力方向、構造状態の基準値を設定する。幻覚や座標偽装では変更前後を比較して検出し、根拠のない位置改変を著しく不安定化させる。",
        },
      ],
      arsenal: [
        {
          name: "アストラルエッジ",
          body: "ルナと共用するライズコア二基対応の剣銃複合武装。斬撃と量子射撃を変形なしで連続使用する。",
        },
      ],
      finishers: [
        {
          name: "アースモディフィカーレ",
          body: "足場、重心、回避方向を一つの基準座標へ収束させ、保存した慣性エネルギーを脚部へ集中するライダーキック。",
        },
      ],
    },
    sections: [
      {
        no: "01",
        kicker: "HOUSE / GROUND AUTHORITY",
        title: "特権ではなく、預けられた巨大な債務を背負う。",
        body: [
          "『REALMS』創設者にして元総責任者兼元帥ソル・アレインの長男。ルナの兄、ベルの実兄である。父の死後はルナと共にアレイン家の共同当主へ就き、『地上権』に属する資産、軍務、技術基盤、領地、関連企業、REALMS欧州圏の実働組織を統括する。",
          "家名、財産、軍事力を個人の所有物とは考えず、先祖と社会から一時的に預けられた莫大な債務と捉える。ベルが日本支部へ残り独自にレルムシステムを運用することは妨げなかった。",
        ],
      },
      {
        no: "02",
        kicker: "PERSONALITY / RESPONSIBILITY",
        title: "慰めより先に、明日困らない環境を整える。",
        body: [
          "寡黙で厳格、姿勢と語調を崩さないフランス上流階級の軍人紳士。優しさは抱擁ではなく、避難経路、治療設備、資金、敵勢力の排除という実務で表れる。",
          "ベルの戦闘力と判断を高く評価する一方、その自己犠牲を『優秀な人間が自らを消耗品と誤認している状態』と危惧する。衝突は多くとも不仲ではない。",
        ],
      },
      {
        no: "03",
        kicker: "COMBAT / IMMUTABLE GROUND",
        title: "敵が何を選んでも、同じ地点へ押し戻す。",
        body: [
          "戦場全体を一つの構造物として捉え、地形、荷重、反力、移動経路を短時間で把握し、被害の少ない形へ戦況を固定する。相手が何を選んでも最終的に同じ位置へ戻される、堅牢な戦場そのものとして振る舞う。",
        ],
      },
    ],
  },
  {
    id: "luna",
    code: "02",
    name: "ルナ・アレイン",
    en: "LUNA ALAIN",
    form: "MOON FORM",
    image: "/character-luna.jpeg",
    thumb: "/character-luna-thumb.jpeg",
    pos: "50% 12%",
    accent: "#c9d4ff",
    title: "関係と軌道を守る、アレイン家共同当主",
    quotes: [
      "月は太陽の光を借りる。けれど、どこへ返すかまでは太陽に決めさせぬ",
      "礼節とは、相手を遠ざける壁ではない。傷付けずに近付くための距離である",
    ],
    facts: [
      { dt: "NAME", dd: "ルナ・アレイン" },
      { dt: "AGE", dd: "30歳" },
      { dt: "GENDER", dd: "女性" },
      { dt: "NATIONALITY", dd: "フランス" },
      { dt: "HEIGHT", dd: "178.4cm" },
      { dt: "WEIGHT", dd: "64.8kg" },
    ],
    rider: {
      img: "/rider-realm-moon.jpeg",
      pos: "50% 10%",
      system: "レルムズドライバー × ムーンコア",
      name: "レルム",
      sub: "ムーンフォーム",
      calls: ["REALMS!", "MOON!", "Rollout!", "SYNCHRONIZE! REALMS SYSTEM!", "MOON!"],
      quote: "月は太陽の光を借りる。けれど、どこへ返すかまでは太陽に決めさせぬ",
      stats: [
        { dt: "HEIGHT", dd: "216.4cm" },
        { dt: "WEIGHT", dd: "79.2kg" },
        { dt: "PUNCH", dd: "96.4t" },
        { dt: "KICK", dd: "176.8t" },
        { dt: "JUMP", dd: "488.8m" },
        { dt: "100m", dd: "0.09sec" },
      ],
      abilities: [
        {
          name: "LUNAR",
          body: "回転運動へ補正を加える。盾を正面へ残したまま側面へ回り込み、視線を一方向へ固定して死角を作るなど、相手の防御姿勢そのものを弱点へ変換する。",
        },
      ],
      arsenal: [
        {
          name: "アストラルエッジ",
          body: "テラと共用するライズコア二基対応の剣銃複合武装。斬撃と量子射撃を同一動作体系として繋ぐ。",
        },
      ],
      finishers: [
        {
          name: "ムーンモディフィカーレ",
          body: "対象の移動、回避、反撃を一つの周回軌道として演算し、ムーンフォームへ最接近する近地点で放つライダーキック。",
        },
      ],
    },
    sections: [
      {
        no: "01",
        kicker: "HOUSE / SHADOW AUTHORITY",
        title: "目に見えない血流を守る、アレイン家の顔。",
        body: [
          "アレイン家の長女兼共同当主で、テラの妹、ベルの実姉。父ソルの死後、テラと共に家を継ぎ、『月影権』と呼ばれる外交、社交、情報、内部監査、家系記録、秘密協定、継承権を管理する。",
          "テラが家の肉体に当たる物質的基盤を維持するなら、ルナは関係、信用、契約、評判、文化という目に見えない血流を守る。公の場ではアレイン家の顔となる。",
        ],
      },
      {
        no: "02",
        kicker: "PERSONALITY / COURTESY",
        title: "弱点を知ることと、踏みにじることを分ける。",
        body: [
          "優雅で穏やか、言葉遣いと所作に育ちの良さが表れる。敵対者にも礼節を保つ一方、感情、嘘、恐怖、欲望を高精度で読み取る。弱点の理解と、それを踏みにじることは明確に区別する。",
          "家族への愛情は深く、ベルが損傷や苦痛を隠しても本人より先に気付く。『自分一人が損傷すれば解決する』という選択には同意を無視して止めることがある。",
        ],
      },
      {
        no: "03",
        kicker: "COMBAT / ORBIT CONTROL",
        title: "敵自身の運動から、逃れられない軌道を描く。",
        body: [
          "攻撃力で正面から上回るのではなく、攻撃周期、呼吸、加速、重心、能力発動間隔を観測し、運動が最も不安定になる位相へ攻撃を重ねる。テラの固定座標と組み合わせれば完全な軌道制御となる。",
        ],
      },
    ],
  },
];

export function RelatedPage({ id }: { id: "terra" | "luna" }) {
  useWorldMode();
  const person = RELATED.find((p) => p.id === id) ?? RELATED[0];
  return (
    <main className="manager-page" style={{ ["--manager-accent" as string]: person.accent }}>
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <DossierTopbar
        fileLabel={`RELATED / ${person.code}`}
        returnHash="manager-archive"
        returnLabel="その他へ戻る"
      />
      <section className="manager-hero">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src={person.image}
              alt={`${person.name}のキャラクタービジュアル`}
              style={{ objectPosition: person.pos, objectFit: "cover" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <span className="manager-numeral">{person.code}</span>
          </div>
        </div>
        <div className="manager-introduction">
          <p className="manager-file-number">CHARACTER FILE // {person.code}</p>
          <h1>
            <small>
              {person.en} / {person.form}
            </small>
            <span className="manager-display-name">
              <NameText value={person.name} />
            </span>
          </h1>
          <p className="manager-title"># {person.title}</p>
          <div className="manager-quotes">
            {person.quotes.map((q) => (
              <q key={q}>{q}</q>
            ))}
          </div>
          <dl className="manager-facts">
            {person.facts.map((f) => (
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
      <section className="manager-dossier">
        <div className="manager-section-index">
          <span>{person.code}</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <div className="manager-sections">
          {person.sections.map((s) => (
            <article className="manager-copy-section" key={s.no}>
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
      <FormPickup rider={person.rider} />
      <DossierNav
        items={RELATED_NAV}
        currentHref={`/characters/${person.id}`}
        indexLabel="RELATED"
      />
    </main>
  );
}
