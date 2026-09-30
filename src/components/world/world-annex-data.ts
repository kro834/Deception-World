// World annex (世界と組織, 人物一覧, エピソードの言葉, 用語集, 名台詞).
// Every story string below is the owner's story source's own wording: lines
// are verbatim, profiles and definitions join sentences of the narration.
// Source line references for each string are kept outside the repo
// (scratchpad dw-src/provenance.json, built by dw-src/spec.py). Names keep the
// source's spelling; readings are left out (the source gives conflicting ones).

export type WorldAnnexLine = { text: string; by: string };

export type WorldBriefEntry = {
  id: string;
  code: string;
  name: string;
  body: readonly string[];
  said: readonly WorldAnnexLine[];
  hud?: readonly string[];
  docs?: readonly { office: string; subject: string; excerpt: string; verdict: string }[];
  mission?: { code: string; text: string };
};
export const WORLD_BRIEF: readonly WorldBriefEntry[] = [
  {
    id: "rikuei",
    code: "RIKUEI",
    name: "六詠",
    body: [
      "最上位に位置する管理人の中でも、通常の管轄という枠組みに収まらぬ者達。既存の管理体制では対処できない瑕疵が発生した時、その外側から介入し、物語そのものを正しい位置へ戻す存在。",
      "少なくとも彼ら自身は、そう認識している。",
    ],
    said: [
      {
        text: "『六詠』は管理人の王とも呼ばれる、6人の執政者の集まりだ。『ゼウス』が1位の座に代々座り、次いで2〜6位の管理人からなる。アイツらの仕事は世界の秩序を保つ事だ",
        by: "ローア",
      },
    ],
  },
  {
    id: "kanri",
    code: "ADMINISTRATOR",
    name: "管理人",
    said: [
      {
        text: "サーガがローアの管轄から逸脱しました",
        by: "レックス・ロワ",
      },
      {
        text: "生殺与奪の権はコイツらの作者の俺にしかないからな！",
        by: "ローア",
      },
      {
        text: "管理人同士って、不公平ですよねぇ",
        by: "リームー",
      },
    ],
    hud: [
      "【AUTHORITY ACCESS DETECTED】",
      "【EXTERNAL ADMINISTRATOR】",
      "【CONTROL LAYER OVERRIDDEN】",
    ],
    body: [],
  },
  {
    id: "realms",
    code: "ORGANIZATION 01",
    name: "REALMS",
    body: [
      "REALMSは異常存在を抑止するための機関であって、REALMSへ服従しない存在を異常存在へ変換する機関ではない。",
    ],
    docs: [
      {
        office: "REALMS最高危険度事象審査会提出文書",
        subject:
          "仮面ライダーサーガに発現した二種の未登録形態及び未知結晶状媒介体の継続保有・使用に関する技術的予防措置の必要性について",
        excerpt:
          "REALMSは、未知であるという理由だけで破壊を正当化してはならない。しかし同時に、未知であるという理由だけで自由使用を認めてもならない。",
        verdict: "限定運用、破壊保留、強制隔離準備、継続解析を要す。",
      },
      {
        office: "REALMS戦略倫理・対異常存在政策部提出意見書",
        subject:
          "仮面ライダーサーガに発現した未登録形態を理由とする予防的行動制限及び強制接収政策に対する異議",
        excerpt:
          "しかし、我々は「起こり得る罪」を理由として「未だ行われていない罪」を裁くことには反対する。",
        verdict:
          "条件付運用容認、非敵対時の強制接収及び恒常的使用禁止に反対、本人参加型共同監査を原則とする。",
      },
    ],
    said: [],
  },
  {
    id: "code",
    code: "ORGANIZATION 02",
    name: "CODE",
    body: [
      "極秘防衛機関『CODE』から命じられたその任務を受け、イギリス支部より派遣された最高峰のエージェント、ジェームズ・スミスは単身現地へと降り立っていた。",
    ],
    said: [
      {
        text: "……俺は、人間の夢を通じて襲い来る怪物『ナイトメア』から人々を守る組織、『CODE』のエージェントだ。コードナンバーはセヴン。本名が気になるなら、いつでも聞いてくれ",
        by: "ジェームズ・スミス",
      },
    ],
    mission: {
      code: "Defeat SA-GA",
      text: "日本の都市一部を壊滅させた元凶───仮面ライダーサーガの討伐。",
    },
  },
];

export const WORLD_LOCATIONS: readonly { name: string; text: string }[] = [
  {
    name: "碧栄",
    text: "かつて塔が林立していた区画は、いまや骨だけになっている。ネオンはとうに死んでいる。",
  },
  {
    name: "レルムズフランス本部",
    text: "墨を落とした様に暗い、レルムズの倉庫。",
  },
  {
    name: "コンビニ",
    text: "内部は4次元空間的に外とは隔絶されている上に広い。500坪はあるだろう。俺が許可した奴しか入って来れない。",
  },
  {
    name: "神聖なる間",
    text: "無限の静寂が支配する空間",
  },
  {
    name: "天守閣",
    text: "無数の瓦屋根が漆黒の闇に沈み込む圧倒的な和の異界を見下ろす、天を突き刺す巨大な天守閣の最上階である。",
  },
];

export type WorldCastEntry = {
  id: string;
  name: string;
  role: string;
  profile: readonly { text: string; by?: string }[];
  line?: string;
  /** The existing dossier this person is filed under, if any. */
  to?: string;
};
export const WORLD_CAST_ROSTER: readonly WorldCastEntry[] = [
  {
    id: "yuma",
    name: "月城悠真",
    role: "仮面ライダーサーガ",
    profile: [
      {
        text: "装甲が粒子になって剥がれ落ち、痩せた十九歳の身体が夜明け前の空気に晒される。",
      },
      {
        text: "演算は最適解を出す。彼はそれに従う。",
      },
    ],
    line: "世界を変える",
    to: "/riders/saga",
  },
  {
    id: "bell",
    name: "ベル・アレイン",
    role: "仮面ライダーレルム",
    profile: [
      {
        text: "生きている人間で、ああいう走り方をする男を、悠真は一人しか知らない。そいつは、死んでいる。───俺が、殺した。",
      },
      {
        text: "自分が最も攻撃しやすい場所ではなく、悠真へ刃を通させない場所を選び続ける。",
      },
    ],
    line: "掴め、悠真",
    to: "/riders/realm",
  },
  {
    id: "roa",
    name: "ローア",
    role: "管理人・ローア",
    profile: [
      {
        text: "真っ白な衣服を纏った一人の男。白いシルクハット。銀髪。黒いマスク。",
      },
      {
        text: "この荒れ果てた碧栄には、場違いなほど潔白な姿。",
      },
    ],
    line: "此処は俺の世界なんだよ！",
    to: "/riders/lore",
  },
  {
    id: "rex",
    name: "レックス・ロワ",
    role: "六詠・第二位",
    profile: [
      {
        text: "その声には焦燥も緊張もなかった。",
      },
      {
        text: "男は間違いなく、物語の外側から自らを見つめる者の存在を認識していた。",
      },
    ],
    line: "世界は、私が救います",
    to: "/managers/rex-loi",
  },
  {
    id: "reemu",
    name: "リームー",
    role: "六詠・第六位",
    profile: [
      {
        text: "羽根飾りを挿した帽子。夜明け前の白を背に、男が一人、悠然と立っている。腰に帯びた一振りを、鞘ごと右手で軽く提げていた。",
      },
      {
        text: "都合の良い言葉を思い付く速さだけは、六詠の中でも比肩する者がいない。",
      },
    ],
    line: "リームー。貴方達は知らないかもしれませんが、『六詠』の下っ端です",
    to: "/managers/reemu",
  },
  {
    id: "shuza",
    name: "シュザ",
    role: "六詠・第三位",
    profile: [
      {
        text: "白銀の髪をなびかせ、黒、紅、紫の重厚な着物の裾を優美にはためかせながら歩むのは、六詠のナンバースリーこと『シュザ』。",
      },
      {
        text: "彼女の管轄する領域───《欲望》と、そこから派生する完全なる《支配》。",
      },
    ],
    line: "───もっとも、あんたらは私を愛し.......何を“好き”やと思うかさえも、うちが決めさせてもらうけど",
    to: "/managers/shuza",
  },
  {
    id: "hanabi",
    name: "在原華火",
    role: "捜査一課・警部補",
    profile: [
      {
        text: "こっちが…俺の相方の在原華火だ、こいつは警部補。とんでもなく口下手だが悪気があるわけじゃないから許してやってほしい",
        by: "無神千桐",
      },
      {
        text: "彼女はやはり運がいいらしい",
      },
    ],
    line: "しろいひと、うるさいからしずかにして",
    to: "/riders/leddic",
  },
  {
    id: "chigiri",
    name: "無神千桐",
    role: "大東京都市の警部",
    profile: [
      {
        text: "常に切り込み隊長、恐れを知らない武人のような男",
      },
    ],
    line: "どこの誰かは知らんが……殺人未遂及び銃刀法違反で現行犯逮捕だ。大人しくしてもらおうか。",
    to: "/riders/leddic",
  },
  {
    id: "mamoru",
    name: "紅城真守",
    role: "仮面ライダーアルゲノム",
    profile: [
      {
        text: "白髪に赤き瞳を宿した整った顔立ちの青年、紅城真守。",
      },
    ],
    line: "アルゲノム.......世界を奪う義賊だ",
    to: "/riders/argenome",
  },
  {
    id: "james",
    name: "ジェームズ・スミス",
    role: "CODE最強のエージェント",
    profile: [
      {
        text: "整えられた髪と鋭い眼光を持つ男───ジェームズ。",
      },
    ],
    line: "生憎、俺は紳士の嗜みとして、無駄な犠牲を出しながら仕事をする趣味はない",
    to: "/riders/over-zeztz",
  },
  {
    id: "luna",
    name: "ルナ・アレイン",
    role: "レルムズフランス本部",
    profile: [
      {
        text: "古風な貴族服に身を包み、近寄り難い冷徹な雰囲気を醸し出す淑女、ルナ・アレイン",
      },
    ],
    line: "我々も、動くべき時───月は満ちた",
    to: "/characters/luna",
  },
  {
    id: "terra",
    name: "テラ・アレイン",
    role: "誇り高きアレイン家の当主",
    profile: [
      {
        text: "ベルの戦い方を誰よりも長く見てきた兄",
      },
    ],
    line: "兄弟だ。似ることくらいある",
    to: "/characters/terra",
  },
  {
    id: "yoake",
    name: "夜明護尊",
    role: "黒い外套の男",
    profile: [
      {
        text: "黒いジャケット、白くシワのないYシャツ、ポニーテールのようにまとめられた黒く艶のある髪、そして左目にある一筋線の細い古傷",
      },
    ],
    line: "この夜明護尊に相手してもらえるのを光栄に思えよ",
    to: "/characters/yoake-mamori",
  },
  {
    id: "azato",
    name: "アザト",
    role: "アルフィクトとローアの子",
    profile: [
      {
        text: "アザトは、ローアから許可を得ることなく『サーガの世界』へ介入し、あろうことか、その実行権までも独断で掌握したのです。",
        by: "レックス・ロワ",
      },
    ],
  },
];

export type WorldEpisodeNote = {
  no: string;
  title: string;
  stage: string;
  lines: readonly WorldAnnexLine[];
};
export const WORLD_EPISODE_NOTES: readonly WorldEpisodeNote[] = [
  {
    no: "01",
    title: "HIDE-AND-SEEK",
    stage: "碧栄",
    lines: [
      {
        text: "世界を変える",
        by: "月城悠真",
      },
      {
        text: "我々『六詠』が介入し、秩序を保ちます",
        by: "レックス・ロワ",
      },
      {
        text: "僕は定時なので帰りますね、さようなら",
        by: "リームー",
      },
    ],
  },
  {
    no: "02",
    title: "LEGENDS",
    stage: "レルムズフランス本部",
    lines: [
      {
        text: "明日、アイツをぶっ飛ばす道具",
        by: "ベル・アレイン",
      },
      {
        text: "お帰りなさい、ベル",
        by: "ルナ・アレイン",
      },
      {
        text: "全く……日本時間基準とは限りません。フランスでは、もう二月十七日でしょう？",
        by: "リームー",
      },
    ],
  },
  {
    no: "03",
    title: "DECEPTION WORLD",
    stage: "天守閣",
    lines: [
      {
        text: "どちらにせよ、近いうちに恐らく第三波が来る。備えておいた方が良い",
        by: "ローア",
      },
      {
        text: "レックスはんには悪いけど、あの子らはうちが貰うわ",
        by: "シュザ",
      },
      {
        text: "ならば、次は俺が相手をする",
        by: "月城悠真",
      },
    ],
  },
];

export type WorldGlossaryEntry = {
  term: string;
  body: readonly string[];
  said: readonly WorldAnnexLine[];
};
export const WORLD_GLOSSARY: readonly WorldGlossaryEntry[] = [
  {
    term: "脚本",
    body: [],
    said: [
      {
        text: "脚本が消失した様です",
        by: "レックス・ロワ",
      },
      {
        text: "補正かは知らんが……少なくとも俺たちは、アルフィクトの脚本だからな",
        by: "紅城真守",
      },
    ],
  },
  {
    term: "観測者",
    body: [
      "物語の外側から自らを見つめる者。この世界で起きる出来事を、安全な場所から読み進める我々の存在を。",
    ],
    said: [],
  },
  {
    term: "管理権限",
    body: [],
    said: [
      {
        text: "コンビニは今から俺が、管理権限で作るんだ",
        by: "ローア",
      },
    ],
  },
  {
    term: "管理外の存在",
    body: [],
    said: [
      {
        text: "やはり管理外の存在からの攻撃は、管理人に対しては弱点の様です。",
        by: "リームー",
      },
    ],
  },
  {
    term: "ナイトメア",
    body: ["人間の夢を通じて襲い来る怪物『ナイトメア』"],
    said: [],
  },
  {
    term: "ネクストピース",
    body: [],
    said: [
      {
        text: "管理からの逸脱には“ターミナル”型の特別なネクストピースが必要なのだ",
        by: "ルナ・アレイン",
      },
    ],
  },
  {
    term: "レジェンズルーレット",
    body: ["透明な耐圧ケースの中央で、未完成の『レジェンズルーレット』が紅金の光を放っている。"],
    said: [],
  },
  {
    term: "特異点",
    body: [
      "物体としてはREALMSフランス本部へ存在する。製造記録もREALMSにある。だが、ローアの管理記録上ではその存在座標が僅かに欠損し、別の参照系から見れば、未だ成立していない未来の装置として分類されている。",
    ],
    said: [],
  },
  {
    term: "未知結晶状媒介体",
    body: ["出所・製造主体・内部構造・情報保持様式・安全限界の一切が不明である結晶状物体"],
    said: [],
  },
  {
    term: "自己成就的敵性化",
    body: ["この構造は危機管理ではない。自己成就的敵性化である。"],
    said: [],
  },
  {
    term: "朱雅管",
    body: ["煙管状の管理端末《朱雅管》"],
    said: [],
  },
  {
    term: "《欲糸》",
    body: ["目に見えない「欲望」の波形を美しく鮮やかな光の糸───《欲糸》として可視化していった。"],
    said: [],
  },
  {
    term: "《主座》",
    body: ["彼女が玉座に座るのではない。彼女が立ったその場所そのものが、万物の主座となるのだ。"],
    said: [],
  },
];

export const WORLD_QUOTES: readonly WorldAnnexLine[] = [
  {
    text: "しかし、賞賛と許容は同義ではありません",
    by: "レックス・ロワ",
  },
  {
    text: "死するは玉響。生も死も、永劫の流れから見れば、瞬きほどの差異でしかありません",
    by: "レックス・ロワ",
  },
  {
    text: "お前を悠真に近づけなきゃ、俺の勝ちだ",
    by: "ベル・アレイン",
  },
  {
    text: "あの人がどれだけ怒ろうが…俺の創作物を勝手に傷付けることだけは許さん！！",
    by: "ローア",
  },
  {
    text: "俺の目の前で死にかけてんだよ。それ以上に理由いるか？",
    by: "ベル・アレイン",
  },
  {
    text: "……まだ、終わってねえ",
    by: "月城悠真",
  },
  {
    text: "Code Number Seven.......I'll carry out my mission！",
    by: "ジェームズ・スミス",
  },
  {
    text: "復活するなら、何度も倒して奪うまでだ",
    by: "紅城真守",
  },
  {
    text: "お前は守ろうとした瞬間、自分の退路を捨てる！",
    by: "テラ・アレイン",
  },
  {
    text: "覚悟しときや、ローア───",
    by: "シュザ",
  },
];
