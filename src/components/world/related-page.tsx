import { useWorldMode } from "./use-world-mode";
import { DossierNav, RELATED_NAV, NameText } from "./dossier-nav";
import { FormPickup, type RiderForm } from "./manager-stub";
import { DossierContents, DossierReader } from "./dossier-reader";
import { DossierTopbar } from "./world-chrome";
import { dossierImage } from "@/lib/dossier-images";
import { RELATED_SECTIONS } from "./related-data";

type Related = {
  id: string;
  code: string;
  name: string;
  en: string;
  form: string;
  image: string;
  imageWebp: string;
  imageWidth: number;
  imageHeight: number;
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
    imageWebp: "/character-terra.webp",
    imageWidth: 1470,
    imageHeight: 1948,
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
    sections: RELATED_SECTIONS.terra,
  },
  {
    id: "luna",
    code: "02",
    name: "ルナ・アレイン",
    en: "LUNA ALAIN",
    form: "MOON FORM",
    image: "/character-luna.jpeg",
    imageWebp: "/character-luna.webp",
    imageWidth: 1028,
    imageHeight: 1800,
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
    sections: RELATED_SECTIONS.luna,
  },
];

export function RelatedPage({ id }: { id: "terra" | "luna" }) {
  useWorldMode();
  const person = RELATED.find((p) => p.id === id) ?? RELATED[0];
  return (
    <main
      className="manager-page related-character-page"
      style={{
        ["--manager-accent" as string]: person.accent,
        ["--manager-accent-soft" as string]: person.accent,
        ["--future-hud-primary" as string]: person.accent,
      }}
    >
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <DossierTopbar
        fileLabel={`RELATED / ${person.code}`}
        returnHash="manager-archive-other"
        returnLabel="その他へ戻る"
      />
      <section className="manager-hero" id="dossier-profile">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img
              src={person.image}
              {...dossierImage(person.image)}
              alt={`${person.name}のキャラクタービジュアル`}
              width={person.imageWidth}
              height={person.imageHeight}
              style={{ objectPosition: person.pos, objectFit: "cover" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <i className="dossier-arrive-scan" aria-hidden="true" />
            <span className="manager-numeral">{person.code}</span>
          </div>
        </div>
        <div className="manager-introduction">
          <header className="dossier-identity">
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
            <a className="dossier-read-link" href="#dossier-index">
              人物資料を読む <span aria-hidden="true">↓</span>
            </a>
          </header>
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
                  <NameText value={f.dd} seams />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <DossierReader name={person.name} forms />
      <section
        className="manager-dossier"
        id="dossier-index"
        aria-label={`${person.name}の人物資料`}
      >
        <div className="manager-section-index">
          <span>{person.code}</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <DossierContents sections={person.sections} />
        <div className="manager-sections">
          {person.sections.map((s) => (
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
      <div id="form-records">
        <FormPickup rider={person.rider} />
      </div>
      <DossierNav
        items={RELATED_NAV}
        currentHref={`/characters/${person.id}`}
        indexLabel="RELATED"
      />
    </main>
  );
}
