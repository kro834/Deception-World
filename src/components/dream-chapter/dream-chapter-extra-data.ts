// Dream Chapter archive: new information taken from the owner's story source (the LINE
// role-play log the Dream Chapter is written from). Every string here is the source's own
// wording: quotes are verbatim, descriptions are the source's sentences selected and joined,
// never paraphrased; "\n" is a line break of the source or a break between joined fragments.
// `lines` are global line numbers of that log (dreamx/src/log-numbered.txt, kept outside the
// repo together with provenance.json and check-provenance.mjs); they are references only and
// are never rendered. The owner's own Dream text stays in dream-chapter-data.ts and is not
// repeated or reworded here. Spoiler line: no deaths, no identity reveals beyond the site's own
// synopses, no final-act truths. Shape pinned by scripts/dream-extra-data.test.mjs.
import type { DreamCharacter, DreamDolminence } from "./dream-chapter-data";

/** Global line references into the source log, e.g. "2243,2247,2897". Not rendered. */
export type DreamSourceLines = string;

/** A verbatim source phrase used as a heading, a tie label, a rider or a device name. */
export type DreamArchiveLabel = { readonly text: string; readonly lines: DreamSourceLines };

/** One run of a passage: narration, or speech when `by` names the speaker. */
export type DreamArchiveSegment = { readonly by?: string; readonly text: string };

type DreamArchivePassageBase = {
  /** Caption for the whole passage when it is one speaker's words ("―― by"). */
  readonly by?: string;
  readonly lines: DreamSourceLines;
};

/** A passage: one `text` ("\n" = line break) or speaker `segments`, never both. */
export type DreamArchivePassage = DreamArchivePassageBase &
  (
    | { readonly text: string; readonly segments?: undefined }
    | { readonly segments: readonly DreamArchiveSegment[]; readonly text?: undefined }
  );

/** A lookup keyed by the owner's own ids, codes, terms or labels in dream-chapter-data.ts. */
export type DreamArchiveTable<T, K extends string = string> = Readonly<Partial<Record<K, T>>>;

export type DreamArchiveCornerId = "chronicle" | "atlas" | "relations" | "arsenal";

export type DreamArchiveCorner = {
  /** Section id and 目次 href (#id). */
  readonly id: DreamArchiveCornerId;
  /** HUD kicker, English capitals. */
  readonly kicker: string;
  /** HUD unit of the heading count, e.g. "40 EVENTS". */
  readonly unit: string;
  /** The owner's 目次 row (DREAM_CONTENTS act) that the corner's link joins. */
  readonly act: "第四幕" | "附録";
  /** Heading and 目次 label: a source word. */
  readonly title: DreamArchiveLabel;
};

/** HUD eyebrows that mark where the owner's text ends and the archive begins. */
export type DreamArchiveLabels = {
  readonly index: string;
  readonly voices: string;
  readonly additions: string;
  readonly record: string;
};

/** DREAM_CASES[].no */
export type DreamCaseNo = "0" | "1" | "2" | "3" | "4" | "5";

export type DreamChronicleEvent = DreamArchivePassage & {
  readonly no: number;
  readonly case: DreamCaseNo;
  readonly title: DreamArchiveLabel;
  readonly place: string;
  readonly cast: readonly string[];
};

export type DreamAtlasPlace = {
  readonly name: string;
  /** HUD kicker: the CASE range, or DOLMINENCE. */
  readonly kicker: string;
  readonly passages: readonly DreamArchivePassage[];
};

export type DreamRelationCircle = "三人" | "幻想郷" | "ドルミネンス";

export type DreamRelationTie = {
  readonly circle: DreamRelationCircle;
  readonly a: string;
  readonly b: string;
  readonly label: DreamArchiveLabel;
  readonly quote: DreamArchivePassage;
};

export type DreamArsenalEntry = DreamArchivePassage & {
  readonly name: string;
  readonly owner?: string;
};

export type DreamArsenalGroup = {
  readonly group: string;
  /** HUD kicker, English capitals. */
  readonly kicker: string;
  readonly entries: readonly DreamArsenalEntry[];
};

export type DreamVoice = {
  readonly speaker: string;
  /** A quote's `by` is set only when it differs from the fold's speaker. */
  readonly quotes: readonly DreamArchivePassage[];
};

export type DreamGlossaryIndexEntry = DreamArchivePassage & { readonly term: string };

/** Added after the owner's note / line of an existing DREAM_AGENT_ROSTER code. */
export type DreamAgentSupplement = {
  readonly rider?: DreamArchiveLabel;
  readonly device?: DreamArchiveLabel;
  readonly note?: DreamArchivePassage;
  readonly line?: DreamArchivePassage;
};

/** A code the owner's agent roster does not list yet. */
export type DreamAgentAddition = {
  readonly code: string;
  readonly name: string;
  readonly rider: DreamArchiveLabel;
  readonly note: DreamArchivePassage;
  readonly line: DreamArchivePassage;
};

export type DreamFactionSupplement = {
  readonly statements?: readonly DreamArchivePassage[];
  readonly members?: readonly { readonly name: string; readonly note: DreamArchivePassage }[];
  /** Keyed by a member name already in DREAM_FACTIONS. */
  readonly memberNotes?: DreamArchiveTable<DreamArchivePassage>;
  readonly paragraphs?: readonly DreamArchivePassage[];
};

export const DREAM_ARCHIVE_CORNERS: readonly DreamArchiveCorner[] = [
  {
    id: "chronicle",
    kicker: "CHRONICLE",
    unit: "EVENTS",
    act: "第四幕",
    title: {
      text: "出来事",
      lines: "6009",
    },
  },
  {
    id: "atlas",
    kicker: "ATLAS",
    unit: "PLACES",
    act: "第四幕",
    title: {
      text: "舞台",
      lines: "4272",
    },
  },
  {
    id: "relations",
    kicker: "RELATIONS",
    unit: "TIES",
    act: "第四幕",
    title: {
      text: "繋がり",
      lines: "1531",
    },
  },
  {
    id: "arsenal",
    kicker: "ARSENAL",
    unit: "ENTRIES",
    act: "第四幕",
    title: {
      text: "武装",
      lines: "5420",
    },
  },
] as const;

export const DREAM_ARCHIVE_LABELS: DreamArchiveLabels = {
  index: "INDEX",
  voices: "VOICES",
  additions: "ADDITIONAL AGENTS",
  record: "RECORD",
};

export const DREAM_CHRONICLE: readonly DreamChronicleEvent[] = [
  {
    no: 1,
    case: "0",
    title: {
      text: "夜は終わらない。",
      lines: "61",
    },
    place: "碧栄",
    cast: ["一人の男"],
    text: "手には、黄金に輝く鉱石――ネクストピース。彼の瞳が、同じ黄金に染まり蝶が一つの黒い球体のアイテムに吸い込まれる。一つの金色のカプセムが誕生し、それにより発生した紫色のエネルギーが辺りを照らした。都市全体を覆い尽くすほどの蝶を世界中に解き放っては彼はフード越しに不気味に微笑んだ。夜は終わらない。mission start.",
    lines: "20,41,47,55,61-63",
  },
  {
    no: 2,
    case: "0",
    title: {
      text: "ここはベルベットルーム",
      lines: "1215",
    },
    place: "ベルベットルーム",
    cast: ["シエル", "ヴァルトマン"],
    segments: [
      {
        by: "ヴァルトマン",
        text: "「ここはベルベットルーム」",
      },
      {
        by: "ヴァルトマン",
        text: "「貴方とそしてこの世界の人々の未来に破滅の魔の手が迫ってきていることを知らせに参りました」",
      },
      {
        text: "――気づけば、現実だ。",
      },
    ],
    lines: "1215,1257,1651",
  },
  {
    no: 3,
    case: "0",
    title: {
      text: "生活の音がしない",
      lines: "1693",
    },
    place: "碧栄",
    cast: ["シエル", "東風谷慶弥"],
    text: "街だった。風は吹いているのに、生活の音がしない。看板は明かりを失い、信号は虚ろに点滅を繰り返し、路面には何かを急いでいた気配だけが置き去りにされている。そして、倒れていた。人々が。そして、目の前で眠るように沈黙する暁 慶弥。『ターミナルコア』により、相手の精神への介入を試みる。",
    lines: "1690,1693-1698,1761,1769",
  },
  {
    no: 4,
    case: "0",
    title: {
      text: "半神の鉄槌",
      lines: "2897",
    },
    place: "東風谷邸",
    cast: ["東風谷慶弥", "東風谷早苗", "シエル"],
    segments: [
      {
        by: "東風谷慶弥",
        text: "「テメェ……人の嫁子供に何しようとしてやがる」",
      },
      {
        text: "彼は旧友の能力を借りて、制限のある中でも時を止め右腕を代償に早苗と我が子を救い出した。",
      },
      {
        text: "半神の鉄槌。一撃で十分だった。",
      },
      {
        text: "カナコナイトメアという存在は、完全に消え去った。",
      },
    ],
    lines: "2243,2247,2897,2911,2936",
  },
  {
    no: 5,
    case: "0",
    title: {
      text: "僕は貴方を信じたい",
      lines: "3565",
    },
    place: "人里",
    cast: ["怪作", "東風谷慶弥", "シエル"],
    segments: [
      {
        by: "怪作",
        text: "「……助けてくれて、本当にありがとうございます」",
      },
      {
        by: "怪作",
        text: "「もし、ここが誰かの夢であったとしても貴方は僕とあの女の人のことをあの怪物から守ってくれた」",
      },
      {
        by: "怪作",
        text: "「悪夢から救ってくれたんです.......だから」",
      },
      {
        by: "怪作",
        text: "「僕は貴方を信じたい」",
      },
    ],
    lines: "3271,3557,3559,3565",
  },
  {
    no: 6,
    case: "0",
    title: {
      text: "茶番は終わったかい？諸君！",
      lines: "3961",
    },
    place: "人里",
    cast: ["クロク"],
    segments: [
      {
        by: "クロク",
        text: "「茶番は終わったかい？諸君！」",
      },
      {
        text: "人里の人混みを退かせるように一人。フード越しに見える白髪とドス黒い瞳。そして妙に軽い声。",
      },
    ],
    lines: "3961,3964,3967-3969",
  },
  {
    no: 7,
    case: "0",
    title: {
      text: "皆んな、あの扉に！",
      lines: "6540",
    },
    place: "人里",
    cast: ["怪作"],
    text: "怪作は内側へと潜る、意識を、落とすのではなく“押し込む”、深く、深く、底へ。そして――“それ”に触れる。“もともと在ったものに気付いてしまった”という感覚。そう認識した次の瞬間。それは裸婦像と融合したような白い扉の形として完全に成立した。「皆んな、あの扉に！」",
    lines: "6521-6524,6535-6540",
  },
  {
    no: 8,
    case: "1",
    title: {
      text: "初めてだな、こういうの",
      lines: "7099",
    },
    place: "人里",
    cast: ["シエル", "東風谷慶弥", "怪作"],
    text: "卓へ運ばれてきた団子から、白い湯気が立っている。「……こういうの、久しぶりかもしれないな」一口。柔らかい。甘い。───甘い？温かい。いや、熱い！「初めてだな、こういうの」───久々に心が安らぎ、良い気分だ。",
    lines: "7062,7066,7069-7072,7087,7099,7109",
  },
  {
    no: 9,
    case: "1",
    title: {
      text: "……久しぶりだな、怪作",
      lines: "7739",
    },
    place: "人里",
    cast: ["Dyna・Mite", "怪作"],
    text: "仮面ライダーコーカサス。仮面ライダー風魔。仮面ライダー4号。仮面ライダーゲンム。仮面ライダーベイル。【爆道拳】「……久しぶりだな、怪作」――Dyna・Mite。死んだと思われていた亡霊が、確かにそこに立っていた。",
    lines: "7476-7480,7687,7739,7744-7746",
  },
  {
    no: 10,
    case: "1",
    title: {
      text: "何やったのよ、アンタ達",
      lines: "10695",
    },
    place: "人里",
    cast: ["博麗霊夢"],
    segments: [
      {
        text: "そこに、一人の巫女が立っていた。音もなく。まるで最初からそこに存在していたかのように。",
      },
      {
        by: "博麗霊夢",
        text: "「……ちょっと」",
      },
      {
        by: "博麗霊夢",
        text: "「何やったのよ、アンタ達」",
      },
    ],
    lines: "10657-10659,10677,10695",
  },
  {
    no: 11,
    case: "1",
    title: {
      text: "やめときな、博麗",
      lines: "11547",
    },
    place: "人里",
    cast: ["永守荘司", "博麗霊夢"],
    segments: [
      {
        text: "夢想天生。博麗の巫女が持つ、幻想郷最強格の切り札。",
      },
      {
        by: "永守荘司",
        text: "「やめときな、博麗」",
      },
      {
        by: "永守荘司",
        text: "「人里ごと消す気か？」「流石にこれ以上は黙ってられねぇな」",
      },
      {
        by: "永守荘司",
        text: "「少なくとも、そいつらは“人里を落とす側”じゃねぇ」",
      },
      {
        text: "夢想天生が、消滅した。",
      },
    ],
    lines: "11521-11523,11547,11570-11571,11603,11633",
  },
  {
    no: 12,
    case: "1",
    title: {
      text: "喪失を超えた本当の悪夢",
      lines: "14402",
    },
    place: "悪夢のアクアリウム",
    cast: ["ムツキ"],
    segments: [
      {
        text: "モニターには未だ幻想郷での戦闘記録。爆炎。博麗霊夢。サーガ。花火屋。慶弥。そして、“敗北”の文字と怪作。",
      },
      {
        by: "ムツキ",
        text: "「仮面ライダーサーガ。彼の“心の扉”が完全に開く」「喪失を超えた本当の悪夢がついに目覚めるんだよ」",
      },
      {
        by: "ムツキ",
        text: "「目覚めた時、君たちエージェントには全力で手に入れてもらうよ」「アルフィクトを復活させるためにも怪作、彼と悪夢の力を使ってね」",
      },
    ],
    lines: "14092-14096,14400-14402,14429-14431",
  },
  {
    no: 13,
    case: "1",
    title: {
      text: "俺は殴るぞ",
      lines: "14650",
    },
    place: "超深層",
    cast: ["シエル", "マキャベル"],
    segments: [
      {
        text: "シエル───いつの間にかヴァーテックスサーガに変身していた───は自分がまだ“落ちていない”ことに気づいた。周囲には花が咲いていた。その一つ一つが、自分の顔をしている。",
      },
      {
        by: "シエル",
        text: "「俺って悪趣味だったのか」",
      },
      {
        by: "シエル",
        text: "「主人公ってのは、作者を殴れないだろ」",
      },
      {
        by: "シエル",
        text: "「俺は殴るぞ」",
      },
      {
        text: "拒絶されたものを、拒絶し返す為に。",
      },
    ],
    lines: "14523,14525,14531,14546,14646,14650,14659",
  },
  {
    no: 14,
    case: "1",
    title: {
      text: "起きろ",
      lines: "16140",
    },
    place: "永守邸",
    cast: ["東風谷慶弥", "シエル", "マキャベル"],
    segments: [
      {
        by: "東風谷慶弥",
        text: "「おい！！！シエル！！！！起きろ！！！！！！！！！」",
      },
      {
        text: "悪夢の世界に、有り得ない“現実の音”が叩き込まれた。空の月に、",
      },
      {
        text: "びしり、と亀裂が走った。",
      },
      {
        by: "マキャベル",
        text: "「アナタ、\nちゃんと独りじゃなかったんだ」",
      },
      {
        by: "シエル",
        text: "「大丈夫」「朝食に行こうか」",
      },
    ],
    lines: "16140,16197,16201-16202,16257-16258,16352-16353",
  },
  {
    no: 15,
    case: "2",
    title: {
      text: "俺達は敵じゃない",
      lines: "18763",
    },
    place: "博麗神社",
    cast: ["シエル", "博麗霊夢"],
    segments: [
      {
        by: "博麗霊夢",
        text: "「昨日は……悪かったわね」",
      },
      {
        by: "シエル",
        text: "「俺達は敵じゃない。そして俺の持ち合わせている全ての知識を貴方に共有する」",
      },
      {
        by: "シエル",
        text: "「連中は俺達の痕跡を“整理”し始めてる」",
      },
      {
        by: "博麗霊夢",
        text: "「最悪じゃない」",
      },
      {
        by: "博麗霊夢",
        text: "「でも異変なら、私は勝手に動く」「結果的に利害が一致するなら協力くらいはするわよ」",
      },
      {
        text: "完全な敵意は、もうそこには無かった。",
      },
    ],
    lines: "18405,18763,18788,18929,19040-19042,19107",
  },
  {
    no: 16,
    case: "2",
    title: {
      text: "……誰のシマで暴れてる",
      lines: "19556",
    },
    place: "永守邸",
    cast: ["永守荘司", "怪作", "ソル"],
    text: "木片。瓦。粉塵。屋敷の外壁が爆ぜ飛んだ。夕暮れの部屋へ、破壊と共に黒い影が踏み込んでくる。永守が即座に怪作を背後へ庇う。夕暮れの永守邸は、一瞬で戦場へ変わっていた。",
    lines: "19405-19408,19434,19718",
  },
  {
    no: 17,
    case: "2",
    title: {
      text: "なぁ、私と喧嘩しようぜ……！",
      lines: "21541",
    },
    place: "守矢神社",
    cast: ["星熊勇儀", "東風谷慶弥"],
    text: "守矢神社へ続く石段。その中腹。いつの間にそこに立っていたのか――巨大な影が、夕焼けを背負っていた。旧地獄最強格の鬼が、嬉々として戦場を始めようとしていた。",
    lines: "21412-21414,21570",
  },
  {
    no: 18,
    case: "2",
    title: {
      text: "同時多発的に発生した襲撃",
      lines: "27953",
    },
    place: "博麗神社",
    cast: ["八雲紫", "博麗霊夢"],
    text: "幻想郷各地で同時多発的に発生した襲撃。もはや異変という言葉だけでは片付けられない規模だった。",
    lines: "27953-27955",
  },
  {
    no: 19,
    case: "2",
    title: {
      text: "隔離された戦場",
      lines: "29129",
    },
    place: "博麗神社",
    cast: ["シエル", "八雲紫"],
    text: "博麗大結界。八雲紫の隙間。隔離された戦場。精神世界から引き剥がされたマキャベルを、幻想郷最大の境界の内側で迎え撃つ。外へ出す危険はある。失敗すれば終わる。",
    lines: "29129,29133",
  },
  {
    no: 20,
    case: "2",
    title: {
      text: "おかえり",
      lines: "29958",
    },
    place: "裂け目の向こう側",
    cast: ["マキャベルゴアナイトメア", "シエル"],
    text: "深い群青。紫。夜の色を溶かし込んだような巨大なドレス。胸元には薔薇に似た紅い花。だが決して薔薇ではない。フードの奥。本来顔があるべき場所。そこには何も無かった。ただ一輪。巨大な紅い花だけが咲いていた。",
    lines: "29907-29911,29915-29916,29924,29928-29930",
  },
  {
    no: 21,
    case: "2",
    title: {
      text: "開けるぞ",
      lines: "33600",
    },
    place: "最後の扉",
    cast: ["シエル", "マキャベル"],
    text: "奪い、乗っ取るのではない。彼が彼という形を保ったまま、その命の器を満たすための、本当の意味での融和。\n「帰ってこい」と言われた。なら、帰らなければならない。シエルの手。マキャベルの手。二つが同じ扉へ触れる。\n「開けるぞ」",
    lines: "33511-33512,33586-33587,33595-33597,33600",
  },
  {
    no: 22,
    case: "2",
    title: {
      text: "帰る場所が見えた",
      lines: "33613",
    },
    place: "博麗神社",
    cast: ["シエル", "八雲紫", "サヨ"],
    segments: [
      {
        text: "現実が見えた。帰る場所が見えた。",
      },
      {
        by: "シエル",
        text: "「さっきぶりだな」",
      },
      {
        text: "手に握られていた『フェイタルエッジ』を適当にロードボマーに投げつけ、息を整えながらぼやいた。シエル。復活である。",
      },
    ],
    lines: "33612-33613,33616,33618-33620",
  },
  {
    no: 23,
    case: "3",
    title: {
      text: "変身完了",
      lines: "34751",
    },
    place: "博麗神社",
    cast: ["シエル"],
    text: "世界がホワイトアウトする。ギガンティムの砲口に橙光が灯り、胸部のリアクターが静かに曙光を放つ。変身完了。残されたのは、地に立たず、暁闇の中へ浮かぶ究極のサーガ。仮面ライダーディルクルムサーガ。",
    lines: "34748,34750-34751,34758-34760",
  },
  {
    no: 24,
    case: "3",
    title: {
      text: "三方向からの同時攻撃",
      lines: "31554",
    },
    place: "魔法の森",
    cast: ["霧雨魔理沙", "アリス", "古明地さとり"],
    text: "「そこまでだぜ！」【恋符・マスタースパーク】魔理沙のマスタースパーク。アリスの人形軍団。そして、さとりの弾幕による三方向からの同時攻撃。先制攻撃としては完璧だった。",
    lines: "31522-31525,31554-31556",
  },
  {
    no: 25,
    case: "3",
    title: {
      text: "夜の終わりだ",
      lines: "35774",
    },
    place: "博麗神社",
    cast: ["シエル"],
    text: "あれほど境内を埋め尽くしていたロードボマーやロードガンナーの軍勢は、影一つ残っていない。ドルミネンスから送り込まれた容赦なき大軍勢との死闘は、ここに完全なる結着を迎えた。",
    lines: "35834",
  },
  {
    no: 26,
    case: "3",
    title: {
      text: "それは『旧地獄』よ",
      lines: "35949",
    },
    place: "博麗神社",
    cast: ["八雲紫", "シエル"],
    by: "八雲紫",
    text: "ふふ、そんな姿になってまで、幻想郷のために動いてくれるのね\nいいわ、現在の戦況を私の『スキマ』で観測した限り、最も歪みが大きく、このままでは幻想郷の根底が覆る場所……それは『旧地獄』よ\nあそこには強大な力を持つ鬼や妖怪たちが集っているけれど、そこが潰れれば、地上への影響は計り知れない",
    lines: "35947,35949,35955",
  },
  {
    no: 27,
    case: "3",
    title: {
      text: "戦う相手を間違えたな",
      lines: "36145",
    },
    place: "旧地獄",
    cast: ["シエル", "コードワイルド"],
    segments: [
      {
        text: "コードフェリアーの実験データを基に、さらなる他世界のシステムを組み込まれて完成した最高幹部、コードワイルド――仮面ライダールシファー。",
      },
      {
        by: "シエル",
        text: "❰お前の相手は俺だ❱\n❰戦う相手を間違えたな❱",
      },
    ],
    lines: "36039,36127,36145",
  },
  {
    no: 28,
    case: "3",
    title: {
      text: "ディルクルムサーガの代償",
      lines: "39149",
    },
    place: "旧地獄",
    cast: ["シエル"],
    text: "ディルクルムサーガでいた間、六京回の演算に耐えていた脳。\n明晰夢操作で世界を上書きし続けた精神。\n拒絶の権能を通すために酷使された神経。\nその全てが、変身解除と同時に人間の身体へ戻ってきた。\n受け止められるはずがなかった。",
    lines: "39115-39119",
  },
  {
    no: 29,
    case: "3",
    title: {
      text: "生きて私の前に帰ってきた",
      lines: "39796",
    },
    place: "永遠亭",
    cast: ["博麗霊夢", "シエル"],
    by: "博麗霊夢",
    text: "あんた、約束、ちゃんと果たしたわね。ボロボロにはなったけど……生きて私の前に帰ってきた。そこだけは、褒めてあげるわ",
    lines: "39796",
  },
  {
    no: 30,
    case: "3",
    title: {
      text: "幻想郷の存亡を懸けた全面戦争",
      lines: "41045",
    },
    place: "永遠亭",
    cast: ["八雲紫", "シエル", "八雲藍"],
    by: "八雲紫",
    text: "……シエル、貴方がその悪夢の力を調整するのに7時間必要だというのなら、その時間は私たちが意地でも稼ぎ出してみせるわ\n藍、他の賢者たちや幻想郷の住人、全ての勢力へ伝令を。これは幻想郷の存亡を懸けた全面戦争よ",
    lines: "41043,41045",
  },
  {
    no: 31,
    case: "4",
    title: {
      text: "厄災を『拒絶』する力",
      lines: "42097",
    },
    place: "ベルベットルーム",
    cast: ["ヴァルトマン", "シエル"],
    by: "ヴァルトマン",
    text: "ようこそ、ベルベットルームへ……。貴方様のお越しを、お待ちしておりました。\n.......とうとう、ご自身の悪夢と向き合い、厄災を『拒絶』する力を手に入れたのですね",
    lines: "42091,42097",
  },
  {
    no: 32,
    case: "4",
    title: {
      text: "謝りに来た",
      lines: "43059",
    },
    place: "博麗神社",
    cast: ["シエル", "博麗霊夢"],
    by: "シエル",
    text: "謝りに来た\n昨日は悪かった、いや、すいませんでした\n俺はワンを止める。幻想郷も守る。誰も死なせない\n俺は死なない\nそして許して欲しい\nなんでもするから",
    lines: "43059,43066,43079,43085-43087",
  },
  {
    no: 33,
    case: "4",
    title: {
      text: "月の民",
      lines: "43840",
    },
    place: "博麗神社",
    cast: ["八雲紫", "八雲藍", "ドレミー・スイート", "シエル"],
    segments: [
      {
        text: "境界が不気味に歪み、無数の目が生えた漆黒のスキマが境内に大きく広がる。そこから姿を現したのは、八雲紫、スキマに控える八雲藍、さらには見慣れない獏の姿をした少女――ドレミー・スイートだった。",
      },
      {
        by: "八雲紫",
        text: "「プライドも過去の因縁も言っている場合ではないわ。私はこれから、大結界を維持しつつ、月の民や綿月姉妹に協力を要請しに向かうわ。」",
      },
    ],
    lines: "43802,43840",
  },
  {
    no: 34,
    case: "4",
    title: {
      text: "僕だけの『完全なる悪夢』",
      lines: "45712",
    },
    place: "夢の世界",
    cast: ["ウツロ", "八雲紫"],
    by: "仮面ライダーウツロ",
    text: "勘違いしないでよ、大妖怪。ここは獏の管理する浅い夢の世界なんかじゃない。……僕の明晰夢の力によって、最初から君たちを殺すために構築された、僕だけの『完全なる悪夢』。ここでは空間のルールも、君たちの攻撃もすべて僕の指先一つで書き換えられるんだよ",
    lines: "45712",
  },
  {
    no: 35,
    case: "4",
    title: {
      text: "旧地獄へ到達した瞬間",
      lines: "53172",
    },
    place: "旧地獄",
    cast: ["シエル", "ロードナイト"],
    text: "境界を越え、旧地獄へ到達した瞬間。金属音が響いた頃には、ヴァーテックスサーガは既にロードナイトの攻撃線上から消えていた。",
    lines: "53172,53219",
  },
  {
    no: 36,
    case: "4",
    title: {
      text: "ターゲットを確保した",
      lines: "54402",
    },
    place: "旧地獄",
    cast: ["ロードナイト", "怪作"],
    segments: [
      {
        by: "ロードナイト",
        text: "「コードナンバー : ワン、ターゲットを確保した……直ちに帰還する」",
      },
      {
        text: "溢れ出した濃密な漆黒の霧が三人と怪作の身体を覆い尽くし、次の瞬間、跡形もなくその場から姿を消した。",
      },
    ],
    lines: "54402,54519",
  },
  {
    no: 37,
    case: "5",
    title: {
      text: "重苦しい拒絶の空気",
      lines: "55842",
    },
    place: "永遠亭",
    cast: ["サヨ"],
    segments: [
      {
        text: "誰もが己の保身と喪失感に囚われ、重苦しい拒絶の空気が部屋を完全に支配した――その時。",
      },
      {
        by: "サヨ",
        text: "「黙って聞いていれば……全員、自分勝手じゃない」",
      },
      {
        text: "静かだが、刺すような冷たさを持った声が響いた。包帯を巻き終えられたサヨが、ゆっくりと立ち上がっていた。",
      },
    ],
    lines: "55842,55848,55851",
  },
  {
    no: 38,
    case: "5",
    title: {
      text: "私達の幻想郷を",
      lines: "56345",
    },
    place: "永遠亭",
    cast: ["八雲紫", "博麗霊夢", "霧雨魔理沙"],
    segments: [
      {
        text: "二人の強い闘志に、病室の空気は再び熱を帯び始める。",
      },
      {
        by: "八雲紫",
        text: "「ええ……取り戻しましょう。私達の幻想郷を」",
      },
    ],
    lines: "56312,56345",
  },
  {
    no: 39,
    case: "5",
    title: {
      text: "サードアイ",
      lines: "57518",
    },
    place: "ベルベットルーム",
    cast: ["シエル", "東風谷慶弥", "暁夕夏", "ヴァルトマン"],
    text: "ベルベットルームの青い照明が一段と深く、澄み渡るような光を放ち始めた。ヴァルトマンがゆっくりと差し出した掌から、眩いばかりの青白き光が溢れ出した。その光は三人の胸元へ、それぞれ異なる軌跡を描きながら、吸い込まれるように溶け込んでいく。視界が一瞬だけ青く染まり――直後、世界の輪郭がこれまで以上に鮮明になった。",
    lines: "57456,57465-57469",
  },
  {
    no: 40,
    case: "5",
    title: {
      text: "おはよう、良い夢は見れたかしら？",
      lines: "57633",
    },
    place: "永遠亭",
    cast: ["サヨ", "シエル"],
    segments: [
      {
        text: "パサリと音を立ててベッドのカーテンが開けられた。サヨが姿を現し、シエルを見下ろす。",
      },
      {
        by: "サヨ",
        text: "「おはよう、良い夢は見れたかしら？」",
      },
      {
        text: "その瞳はすぐさま真剣で揺るぎない眼差しへと変わり、シエルに向かって力強く手を差し伸べた。",
      },
    ],
    lines: "57627,57633,57636",
  },
] as const;

export const DREAM_ATLAS: readonly DreamAtlasPlace[] = [
  {
    name: "碧栄",
    kicker: "CASE 0",
    passages: [
      {
        text: "更地となり、一部の地面が剥き出しになったサイバーパンク都市――碧栄。かつて摩天楼が立ち並んでいたその街は、今や荒野と廃墟の境界に沈んでいた。夜空には、まるで砕けたかのように欠けた赤い月。その光は不自然に滲み、街全体を血のような色に染め上げている。",
        lines: "10-12",
      },
    ],
  },
  {
    name: "人里",
    kicker: "CASE 0–5",
    passages: [
      {
        text: "人里だって綺麗な場所じゃない。貧困も暴力も、差別もある。永守組みたいな裏の連中が必要になる程度には、泥臭い世界だ。復興途中の人里には、まだ焦げた木材の匂いと、湯気の残る炊き出しの気配が混ざっていた。",
        lines: "12896,18497",
      },
      {
        text: "窓の外では子供が走り回り、店主は何事もない顔で茶を淹れている。悪夢も、ドルミネンスも、この店の中にはまだ入り込んでいない。",
        lines: "7092-7093",
      },
    ],
  },
  {
    name: "永守邸",
    kicker: "CASE 1–2",
    passages: [
      {
        text: "焼け跡の密集地帯を抜け、人里北東部へ近付くにつれて、建物の損壊も減っていった。やがて視界の先へ、高い塀が現れる。巨大な和風屋敷だった。黒塗りの門。重厚な瓦屋根。長く伸びた白壁。門前には提灯が灯り始めている。永守邸。極道の本拠地と聞いて想像するより遥かに静かで、妙に整った空気を纏っていた。石畳の通路。丁寧に手入れされた松。池に架かる木橋。その奥には、灯りの点き始めた巨大な屋敷。まるで古い旅館みたいだった。",
        lines: "12062-12073,12090-12092",
      },
    ],
  },
  {
    name: "博麗神社",
    kicker: "CASE 2–5",
    passages: [
      {
        text: "石段は、やけに長く感じた。ようやく赤い鳥居が見えてくる。これが博麗神社か。幻想郷の均衡点。異変の中心へ必ず立つ巫女の縄張り。賽銭箱の前に落ち葉が転がり、縁側には湯呑みが一つ置かれていた。人の気配はある。だが、不思議と生活感が薄い。",
        lines: "18290,18337-18342,18349",
      },
    ],
  },
  {
    name: "守矢神社",
    kicker: "CASE 1–5",
    passages: [
      {
        text: "守矢神社の境内には夜風が吹き抜け、軒先の風鈴を小さく鳴らしている。石段の下では虫の声が細く響き、山の夜気が木々を揺らしていた。囲炉裏の火がぱちりと鳴る。",
        lines: "13833,14002",
      },
      {
        text: "守矢神社の境内は、山の空気らしく澄んでいた。遠くでは滝の音も聞こえていた。",
        lines: "21020,21257",
      },
    ],
  },
  {
    name: "妖怪の山",
    kicker: "CASE 2",
    passages: [
      {
        text: "妖怪の山、中腹。木々の影から幾つもの目が慶弥を見下ろしていた。牙を覗かせる獣妖怪。枝の上に張り付く羽虫の妖怪。ぬるりと岩陰から現れる蛇じみた影。人間が単独で妖怪の山へ来る事自体、普通ではない。",
        lines: "18462-18470",
      },
      {
        text: "岩肌を削るように作られた天然温泉が、湯気を立ち昇らせていた。岩場へ置かれた行灯の灯りが水面へ揺れ、金色の反射が静かに波打っていた。近付けば、硫黄混じりの温かな香りがふわりと鼻を擽る。",
        lines: "25907,25911-25913",
      },
    ],
  },
  {
    name: "魔法の森",
    kicker: "CASE 3–5",
    passages: [
      {
        text: "魔法の森の奥深くに佇む自宅で、霧雨魔理沙は一人デスクに向かっていた。机の上には解体されたミニ八卦炉と、無数の工具、そして魔導書が散乱している。",
        lines: "56946-56947",
      },
      {
        text: "笑い声の最中。魔法の森の空から桜の花びらが一枚、落ちた。",
        lines: "33143",
      },
    ],
  },
  {
    name: "迷いの竹林・永遠亭",
    kicker: "CASE 2–5",
    passages: [
      {
        text: "迷い竹林の奥。永遠亭では、いつもと変わらぬ静かな時間が流れていた。廊下を吹き抜ける風。薬草の匂い。遠くから聞こえる鈴虫の音。",
        lines: "17193-17199",
      },
      {
        text: "迷いの竹林。\n風が竹の葉を擦らせる音も、遠くで兎たちが跳ねる気配も、月光を受けて青白く伸びる竹の影も、普段ならばこの土地特有の静けさに包まれ、訪れた者の方角感覚だけを少しずつ奪っていくはずだったが、今夜の竹林には、その静けさの下に、戦いの余熱がまだ薄く沈んでいた。",
        lines: "41363-41364",
      },
    ],
  },
  {
    name: "白玉楼",
    kicker: "CASE 2–3",
    passages: [
      {
        text: "冥界。白玉楼。冥界の桜は今日も静かに揺れていた。死者の庭。風も音も曖昧な世界。",
        lines: "17122,17131",
      },
      {
        text: "本来なら決して咲くはずのない、死を吸って咲く大樹――『西行妖』が、不気味なほど鮮やかに満開の花を咲かせている。狂い咲く桜吹雪が、白玉楼へと続く長い階段を覆い尽くしていた。",
        lines: "31973",
      },
    ],
  },
  {
    name: "旧地獄",
    kicker: "CASE 2–4",
    passages: [
      {
        text: "地底。灼熱地獄跡のさらに奥。岩肌を赤黒く照らす溶岩の光が、巨大な空洞全体を脈動みたいに染め上げていた。酒。煙。怒号。笑い声。地上とは違う、荒っぽく熱い空気。鬼達が騒ぎ、妖怪達が肩を組み、熱気で空気すら揺れている。",
        lines: "17338-17344,17361",
      },
      {
        text: "地底深く、かつて地上を追われた凄腕の妖怪たちが割拠する『旧地獄』。",
        lines: "36022",
      },
    ],
  },
  {
    name: "地霊殿",
    kicker: "CASE 4",
    passages: [
      {
        segments: [
          {
            text: "灼熱の跡地を越え、不気味ながらもどこか厳かな佇まいを見せる地霊殿の広間に到着すると、さとりは二人を振り返り、安心させるように微かに微笑んだ。",
          },
          {
            by: "古明地さとり",
            text: "「ようこそ、地霊殿へ。ここなら、地上の騒がしい戦火もすぐには届かないはず。全面戦争の行方が決まるまで、あなたたちはここで私が責任を持って保護します」",
          },
        ],
        lines: "43429,43435",
      },
    ],
  },
  {
    name: "紅魔館",
    kicker: "CASE 4",
    passages: [
      {
        text: "正面大門では紅美鈴が、全身を毒々しいマゼンタとグリーンの装甲で固めた『ロードヴェノム』の軍勢と激突していた。\n一方、大図書館ではパチュリー・ノーレッジと小悪魔が、両肩に巨大な火器を背負った『ロードガンナー』たちを迎え撃っていた。\nそして、館内の静まり返った廊下を単身で死守するのは十六夜咲夜。彼女の前に立ちはだかるのは、青い重装甲を纏った『ロードボマー』だった。",
        lines: "44856,44867,44884",
      },
    ],
  },
  {
    name: "太陽の畑",
    kicker: "CASE 4",
    passages: [
      {
        text: "そこに佇んでいたのは、太陽の畑の主――風見幽香であった。地上で巻き起こった異変の波紋と侵略者たちの破壊工作は、彼女が何よりも愛し、丹精込めて育て上げてきたあの『太陽の花畑』をも無慈悲に踏み荒らし、一面に咲き誇っていたひまわりたちを無残に踏みにじっていたのだ。",
        lines: "48534,53325",
      },
    ],
  },
  {
    name: "ベルベットルーム",
    kicker: "CASE 0–5",
    passages: [
      {
        text: "その向こうに広がっていたのは蒼だった。そしてその蒼の只中を、無数の鎖が垂れていた。バーのような造りだった。長いカウンター。椅子は少数。照明は低い。青に溶けるような、淡い灯り。ピアノの伴奏と女性の高めのコーラスが合わさった演奏が部屋に響く",
        lines: "1126,1130,1151-1153,1156,1158-1159,1226",
      },
      {
        text: "全体として、酷く静かで、整い過ぎており、シエルの“在り方”を、そのまま写し取ったかのような空間。",
        lines: "1161",
      },
      {
        text: "視界を染める群青。その只中を、無数の鎖が垂れていた。神社だった。だが、それは現実に存在する神社のどれにも属していない。鳥居はある。朱ではない。色という概念が薄れたような、群青に溶ける曖昧な輪郭。木材でも金属でもなく、「境界」という概念がそのまま立ち上がったようにそこに在る。空は群青。沈む夕と、昇る月が同時に存在している。時間は流れていない。ただ“重なっている”。───東風谷慶弥の心の在り方、そのものが形を持った空間。",
        lines: "15048-15050,15068-15073,15083-15086,15093",
      },
    ],
  },
  {
    name: "悪夢のアクアリウム",
    kicker: "DOLMINENCE",
    passages: [
      {
        text: "場所はドルミネンス本部。夢の最深層。人々の中に眠る悪夢を水族館の魚のように捕らえ、幽閉，研究する場所。長い廊下の両脇には、巨大な培養水槽がずらりと並んでいる。青白い液体。浮かぶ泡。ゆっくり脈打つチューブ。その中に沈んでいるのは、“悪夢”。人型。獣型。肉塊。半ば仮面ライダーと融合したような異形。",
        lines: "25371,25375-25382",
      },
      {
        text: "不気味に明滅する水槽の青白い光が、冷徹なコンクリートの壁を斑に染め上げている。研究所と水族館が奇妙に融解したようなドルミネンスの本部――その最奥に位置する円卓の会議室",
        lines: "42927",
      },
    ],
  },
] as const;

export const DREAM_RELATION_CIRCLES: readonly DreamRelationCircle[] = [
  "三人",
  "幻想郷",
  "ドルミネンス",
] as const;

export const DREAM_RELATIONS: readonly DreamRelationTie[] = [
  {
    circle: "三人",
    a: "シエル",
    b: "東風谷慶弥",
    label: {
      text: "お前は独りじゃない",
      lines: "16360",
    },
    quote: {
      by: "東風谷慶弥",
      text: "それと、お前は独りじゃないからな。忘れんなよ",
      lines: "16360",
    },
  },
  {
    circle: "三人",
    a: "シエル",
    b: "怪作",
    label: {
      text: "君を信じて良かった",
      lines: "34207",
    },
    quote: {
      by: "怪作",
      text: "君を信じて良かった.......",
      lines: "34207",
    },
  },
  {
    circle: "三人",
    a: "東風谷慶弥",
    b: "怪作",
    label: {
      text: "改めて礼を言わせてくれ",
      lines: "7243",
    },
    quote: {
      by: "東風谷慶弥",
      text: "シエルと怪作だな。こんな時だからこそよろしく頼む\nさっきはこの3人の誰か1人でもいなかったら全滅してたからな、改めて礼を言わせてくれありがとうな",
      lines: "7243",
    },
  },
  {
    circle: "三人",
    a: "シエル",
    b: "マキャベル",
    label: {
      text: "主人公",
      lines: "32255",
    },
    quote: {
      by: "シエル",
      text: "主人公になりたいなら、まず覚えろ\n主人公ってのは、誰かを奪ってなるもんじゃない",
      lines: "32255,32260",
    },
  },
  {
    circle: "三人",
    a: "シエル",
    b: "ベル",
    label: {
      text: "偽物でも、ベルはベル",
      lines: "42337",
    },
    quote: {
      by: "シエル",
      text: "良いんだ。偽物でも、ベルはベルだから",
      lines: "42337",
    },
  },
  {
    circle: "三人",
    a: "シエル",
    b: "ヴァルトマン",
    label: {
      text: "“繋がり”です",
      lines: "1531",
    },
    quote: {
      by: "ヴァルトマン",
      text: "貴方に必要なのは、“力の増幅”ではありません\n“繋がり”です",
      lines: "1527,1531",
    },
  },
  {
    circle: "三人",
    a: "東風谷慶弥",
    b: "ヴァルトマン",
    label: {
      text: "トリックスター",
      lines: "16060",
    },
    quote: {
      segments: [
        {
          by: "ヴァルトマン",
          text: "「やはり貴方様もイゴール様の仰るトリックスターなのかもしれませんね.......」",
        },
        {
          by: "ヴァルトマン",
          text: "「悪夢に呑まれぬよう、お気を付けて」「トリックスター」",
        },
        {
          by: "東風谷慶弥",
          text: '「"トリックスター"ね…光栄だよ」',
        },
      ],
      lines: "16060,16113-16115,16124",
    },
  },
  {
    circle: "三人",
    a: "東風谷慶弥",
    b: "暁夕夏",
    label: {
      text: "アニキの魂の片割れ",
      lines: "40071",
    },
    quote: {
      by: "暁夕夏",
      text: "アニキの魂の片割れだからアタシだって半神半人なんだからね。",
      lines: "40071",
    },
  },
  {
    circle: "幻想郷",
    a: "シエル",
    b: "博麗霊夢",
    label: {
      text: "絶対に帰ってきなさい",
      lines: "28830",
    },
    quote: {
      by: "博麗霊夢",
      text: "勝手に消えるのは禁止、負けるのも禁止\n絶対に帰ってきなさい",
      lines: "28828,28830",
    },
  },
  {
    circle: "幻想郷",
    a: "シエル",
    b: "八雲紫",
    label: {
      text: "最高に格好いいお帰りなさい",
      lines: "33657",
    },
    quote: {
      by: "八雲紫",
      text: "ふふ、ちゃんとお約束を守るなんて粋な男じゃない。最高に格好いいお帰りなさいよ、シエル",
      lines: "33657",
    },
  },
  {
    circle: "幻想郷",
    a: "東風谷慶弥",
    b: "東風谷早苗",
    label: {
      text: "どこの世界でも早苗は早苗",
      lines: "21248",
    },
    quote: {
      by: "東風谷慶弥",
      text: "そして…やっぱり、どこの世界でも早苗は早苗なんだな…",
      lines: "21248",
    },
  },
  {
    circle: "幻想郷",
    a: "東風谷慶弥",
    b: "レミリア・スカーレット",
    label: {
      text: "私の眷属",
      lines: "54923",
    },
    quote: {
      by: "レミリア・スカーレット",
      text: "ふふっ、私の眷属になった割に随分と苦戦しているようね",
      lines: "54923",
    },
  },
  {
    circle: "幻想郷",
    a: "東風谷慶弥",
    b: "星熊勇儀",
    label: {
      text: "今度は喧嘩じゃねぇ、共闘だ",
      lines: "30984",
    },
    quote: {
      by: "星熊勇儀",
      text: "行くぞ、慶弥\n今度は喧嘩じゃねぇ、共闘だ",
      lines: "30977,30984",
    },
  },
  {
    circle: "幻想郷",
    a: "東風谷早苗",
    b: "八坂神奈子・洩矢諏訪子",
    label: {
      text: "神様命令",
      lines: "27496",
    },
    quote: {
      by: "洩矢諏訪子",
      text: "ちなみにそれ、あたし達が決めたから\n文句は受け付けませーん\nはい決定\n神様命令\nというわけでおやすみー",
      lines: "27474,27476,27494,27496,27498",
    },
  },
  {
    circle: "幻想郷",
    a: "Dyna・Mite",
    b: "狗瓦",
    label: {
      text: "今さらですよ",
      lines: "19245",
    },
    quote: {
      segments: [
        {
          by: "狗瓦",
          text: "「花火屋さん、昔からそういう厄介事ばっか背負い込むじゃないですか」",
        },
        {
          by: "狗瓦",
          text: "「なら、俺も手伝いますよ」",
        },
        {
          by: "Dyna・Mite",
          text: "「軽く言うなぁ……」",
        },
        {
          by: "狗瓦",
          text: "「軽く言ってません」",
        },
      ],
      lines: "19249,19259,19264,19268",
    },
  },
  {
    circle: "幻想郷",
    a: "Dyna・Mite",
    b: "永守荘司",
    label: {
      text: "守りてぇモンが出来た奴の顔",
      lines: "13316",
    },
    quote: {
      segments: [
        {
          by: "永守荘司",
          text: "「守りてぇモンが出来た奴の顔してる」",
        },
        {
          by: "Dyna・Mite",
          text: "「……説教臭ぇなぁ」",
        },
        {
          by: "永守荘司",
          text: "「歳食うとな」",
        },
      ],
      lines: "13316,13325,13332",
    },
  },
  {
    circle: "幻想郷",
    a: "永守荘司",
    b: "伴蔵",
    label: {
      text: "おやっさん",
      lines: "22281",
    },
    quote: {
      by: "伴蔵",
      text: "無茶言うなよ、おやっさん……",
      lines: "22281",
    },
  },
  {
    circle: "幻想郷",
    a: "永守荘司",
    b: "怪作",
    label: {
      text: "よっぽど気に入らねぇ",
      lines: "19358",
    },
    quote: {
      by: "永守荘司",
      text: "そんなお前を寄ってたかって追い回してる連中の方が、よっぽど気に入らねぇな",
      lines: "19358",
    },
  },
  {
    circle: "幻想郷",
    a: "怪作",
    b: "サヨ",
    label: {
      text: "作",
      lines: "43489",
    },
    quote: {
      segments: [
        {
          by: "サヨ",
          text: "「作！？ どうしたの、作！」",
        },
        {
          text: "元はドルミネンスの人間として怪作を狙う立場だったサヨ。しかし、彼がどれほどの恐怖と孤独を抱えていたかを知った今、犯した罪の贖罪のためにも、何があってもこの少年を守り抜くと心に誓っていた。",
        },
      ],
      lines: "43489,43720",
    },
  },
  {
    circle: "幻想郷",
    a: "狗瓦",
    b: "魂魄妖夢",
    label: {
      text: "共に行きますよ、狗瓦君",
      lines: "35421",
    },
    quote: {
      by: "魂魄妖夢",
      text: "白玉楼を、幽々子様を、これ以上汚させはしない……！ ここからは私が一人の剣士として、君をしっかり引っ張ってあげます。さあ、共に行きますよ、狗瓦君！",
      lines: "35421",
    },
  },
  {
    circle: "幻想郷",
    a: "霧雨魔理沙",
    b: "アリス",
    label: {
      text: "息を合わせるぜ、アリス",
      lines: "45953",
    },
    quote: {
      segments: [
        {
          by: "アリス",
          text: "「二つの同じ威力のエネルギーを、寸分の狂いもなく同時にぶつける……。体内のメモリの回路だけを狙い撃ちにするのね。行くわよ、魔理沙！」",
        },
        {
          by: "霧雨魔理沙",
          text: "「おう！ 息を合わせるぜ、アリス！」",
        },
        {
          by: "霧雨魔理沙",
          text: "「恋符『マスタースパーク』！！」",
        },
        {
          by: "アリス",
          text: "「槍符『キューティ大千槍』！！」",
        },
      ],
      lines: "45947,45953,45964,45970",
    },
  },
  {
    circle: "幻想郷",
    a: "博麗霊夢",
    b: "霧雨魔理沙",
    label: {
      text: "説明する気ゼロ",
      lines: "17046",
    },
    quote: {
      segments: [
        {
          by: "霧雨魔理沙",
          text: "「説明する気ゼロだなお前」",
        },
        {
          by: "霧雨魔理沙",
          text: "「なんか、ちょっとワクワクする話でもあるな」",
        },
        {
          by: "博麗霊夢",
          text: "「アンタねぇ……」",
        },
      ],
      lines: "17046,17073,17075",
    },
  },
  {
    circle: "幻想郷",
    a: "魂魄妖夢",
    b: "西行寺幽々子",
    label: {
      text: "幽々子様",
      lines: "17156",
    },
    quote: {
      segments: [
        {
          by: "魂魄妖夢",
          text: "「幽々子様、笑い事ではありません！」",
        },
        {
          by: "西行寺幽々子",
          text: "「そうみたいねぇ」",
        },
        {
          by: "魂魄妖夢",
          text: "「そうみたいねぇ、じゃなくて！」",
        },
      ],
      lines: "17156,17165,17167",
    },
  },
  {
    circle: "幻想郷",
    a: "鈴仙",
    b: "八意永琳",
    label: {
      text: "師匠",
      lines: "17268",
    },
    quote: {
      segments: [
        {
          by: "鈴仙",
          text: "「何なんですか、この“仮面ライダー”って……」",
        },
        {
          by: "鈴仙",
          text: "「師匠、何か知ってるんですか？」",
        },
      ],
      lines: "17214,17268",
    },
  },
  {
    circle: "ドルミネンス",
    a: "ネル",
    b: "テツヤ",
    label: {
      text: "無理♡",
      lines: "14266",
    },
    quote: {
      segments: [
        {
          by: "テツヤ",
          text: "「ネルさんには少しは静かにしてほしいものです……」",
        },
        {
          by: "ネル",
          text: "「無理♡」",
        },
        {
          by: "クロク",
          text: "「ははっ、最悪だねこの空気感！」「絶版極まれりだわ！！」",
        },
      ],
      lines: "14261,14266,14274-14276",
    },
  },
  {
    circle: "ドルミネンス",
    a: "セン",
    b: "セオ",
    label: {
      text: "パーフェクトな融合",
      lines: "37037",
    },
    quote: {
      segments: [
        {
          by: "セン",
          text: "「セオ.......1,000%の勝率を導き出すには、もはやこれしかありません」",
        },
        {
          by: "セオ",
          text: "「ええ、セン。我々の完璧なる演算を一つに。パーフェクトな融合を果たしましょう」",
        },
      ],
      lines: "37031,37037",
    },
  },
  {
    circle: "ドルミネンス",
    a: "サヨ",
    b: "ドルミネンス",
    label: {
      text: "裏切り者",
      lines: "55881",
    },
    quote: {
      by: "サヨ",
      text: "私はドルミネンスの裏切り者よ。憎いなら、この場で仇討ちをしなさい",
      lines: "55881",
    },
  },
  {
    circle: "ドルミネンス",
    a: "縫妖師",
    b: "ドルミネンス",
    label: {
      text: "両陣営が別の意志で動いている",
      lines: "35892",
    },
    quote: {
      text: "ドルミネンスと縫妖師。両陣営が別の意志で動いている。だが、この世界を踏み荒らすという一点においては同じだ。",
      lines: "35891-35893",
    },
  },
] as const;

export const DREAM_ARSENAL: readonly DreamArsenalGroup[] = [
  {
    group: "シエル / 仮面ライダーサーガ",
    kicker: "SAGA SYSTEM",
    entries: [
      {
        name: "マルチフォーム",
        text: "変身を完了させたのは、最も弱く、最も使い慣れた姿。マルチフォーム。声は掠れていた。けれど、震えてはいなかった。",
        lines: "30095-30097",
      },
      {
        name: "ハイブリッドフォーム",
        text: "【Rollout！】「変身！」『ハイブリッドコア』の装填により、仮面ライダーサーガ・ハイブリッドフォームへの変身を行う。【SA-GA Kamen Rider！】【Hybrid！】ハイブリッドフォームの攻撃は貫通効果を持ち、其の1発が致命打になり得る性能を持つ。許容量を超えない限り、凡ゆる攻撃はサーガには通じない。",
        lines: "2210-2218,2222,2224",
      },
      {
        name: "ハイブリッドフォーム・フルカスタム",
        text: "───変身。【Customize！SA-GA！】【Hybrid！】\n仮面ライダーサーガ ハイブリッドフォーム・フルカスタムの右腕のパンチ───40.8トンの打撃",
        lines: "7534-7538,9146",
      },
      {
        name: "インテグラルサーガ",
        text: "【INTEGRAL FORCE！】『ターミナルコア』を使用した、インテグラルサーガへの最速での変身。\n『インテグラル』による麻酔効果により痛覚を無視し、『インテグラルサーガ』は本領発揮が可能となる。",
        lines: "4088,4092,4343",
      },
      {
        name: "ヴァーテックスサーガ",
        text: "【VERTEX HERO！】\n群青と白銀の装甲が、シエルの身体を包み込む。高速演算を担う複眼が冷たく点灯し、鋭利な輪郭を持つ装甲が、残虐性を湛えた夢の空間へ一つずつ固定されていく。\n仮面ライダーヴァーテックスサーガ。\nディルクルムの神域へ至る以前、速度、演算、技術、そのすべてを極限まで研ぎ澄ませた“最強のサーガ”。",
        lines: "45545,45548-45551",
      },
      {
        name: "ターミナルコア",
        text: "“ネクストピース”。其れの結晶の進化した結末───『ターミナルコア』。管理者に匹敵する力を持ってして、簡単に蹂躙してしまおうか。",
        lines: "441-444",
      },
      {
        name: "クリスタルコア",
        text: "玉響の中、舞い散る紺碧の蝶々が形を成すは、史上最高の才能をもたらす新たな『ライズコア』\n自身の悪夢の力と、魂の奥の奥に潜在していた『ネクストピース』の追憶が混ざり合い、『ターミナルコア』に酷似した新たなるライズコア『クリスタルコア』が生成された。",
        lines: "34672-34673",
      },
      {
        name: "フェイタルエッジ",
        text: "抜くのは刃『フェイタルエッジ』。",
        lines: "252",
      },
      {
        name: "レルムスレイヤー",
        text: "『レルムスレイヤー』を構えたシエルから、2体其々に対して2発ずつ、弾丸が放たれた。",
        lines: "2042",
      },
      {
        name: "アクシスレイカー",
        text: "飛来した『アクシスレイカー( ランチャーモード )』を取り、『マルチコア』をカートリッジとして装填する。\nシエルは類稀な遠距離攻撃手段を持っており、それは変身せずとも使用可能だ。狙撃銃の様に構えた『アクシスレイカー』で狙いを定め、ダークカブトにピンポイントで当たる様に、虎視眈々と狙い続ける。",
        lines: "883,21234,21238",
      },
      {
        name: "DUO STROM",
        text: "そして、『マルチコア』と『エアロコア』を装填し、コンバーターを3回操作する。【MULTI！】【AERO！】【CHARGE】【SUPER CHARGE！】【HYPER CHARGE！】『超広範囲の超高火力の風 ( 概念的な攻撃を相手に与え、生命活動を終滅させる ) を、マルチコアによって超精細な操作、及び指向性を加え、直径500m以内から起点として発動し、スワコナイトメアに対して収縮させ、破壊する』。ターミナルコアと同じ素材で出来たアクシスレイカーは、其れを叶える。【DUO STROM！！】人的被害を抑える為に直径は500m。",
        lines: "2414-2423,2428-2430",
      },
      {
        name: "EXTROM",
        text: "【Terminal On】【INTEGRAL CHARGE！】【EXTROM！！】『ターミナルコア』を装填した『アクシスレイカー』を構える。『アクシスレイカー』の機能により、『インテグラル』の指向性を制御し、眼前の仮面ライダーベイルただ1人にのみ、圧倒的な質量の光線を放つ『エクストローム』。",
        lines: "8243-8248",
      },
      {
        name: "EXTEND",
        text: "【EXTEND】サーガの全身から蒼白い光が噴き上がる。圧縮されていた出力を、『エクステンド』により無理やり全開まで引き上げる。合法的なリミッター解除である。これにより出力は一時的に500%以上へと引き上げる。",
        lines: "8599,8602,8604-8606",
      },
      {
        name: "VERTEX",
        text: "【VERTEX！】事象に対する強制的な改変。《サーガは早苗の前へ身体を差し込んだ》。",
        lines: "2984-2988",
      },
      {
        name: "ハイブリッドストライク",
        text: "【HYBRID Strike！】追撃の『ハイブリッドストライク』が、スワコナイトメアに迫った。超至近距離での、肘の発勁として、『ハイブリッドストライク』を発動。ハイブリッドストライクの貫通は、構造も意味も関係なく“通る”",
        lines: "2656,2660,2783,2807",
      },
      {
        name: "融和",
        text: "ハイブリッドフォームの特殊能力。『融和』が発動する、それは防御ではなく“同一化による無効化”、取り込まれた侵食がそのままサーガの構成要素へと書き換わり、害という定義を失う。",
        lines: "2293",
      },
      {
        name: "明晰夢操作",
        text: "【明晰夢操作】蒼白い光が石畳の亀裂を走り、黒い液体の表面を上書きするようにして停滞させる。",
        lines: "9834-9836",
      },
    ],
  },
  {
    group: "東風谷慶弥",
    kicker: "KEIYA KOCHIYA",
    entries: [
      {
        name: "神・武王発勁",
        text: "神力。霊力。気功。全てを一点へ極限圧縮した掌打。その掌は、もはや“打撃”ではない。直撃した瞬間、存在そのものを内側から崩壊させる破滅の塊。",
        lines: "10060-10062",
      },
      {
        name: "神嵐",
        text: "両の腕に風が纏われる、ただの風ではなく術者である彼の、電車の衝突でも原型を保った上さらに再生によって強度が上がった肉体ですらも削り取る暴風",
        lines: "5042",
      },
      {
        name: "紅美流――乱坐対",
        text: "肘。肩。脇腹。膝。関節。筋肉の繋ぎ目。人体の“崩れる箇所”だけを狙い続ける連撃。\n紅美流――乱坐対。\nまるで流れる水みたいに止まらない掌打が、勇儀の巨体へ次々と叩き込まれていく。",
        lines: "22912-22918",
      },
      {
        name: "紅美流――昇華撃",
        text: "【紅美流――昇華撃】\n白金の神気が掌へ収束する。\n空気が押し潰され、神力と風圧が掌の周囲で螺旋を描く。",
        lines: "23521-23524",
      },
      {
        name: "紅美流　雷嵐頂心肘",
        text: "【紅美流　雷嵐頂心肘】\n神力を纏った一撃。それが肘から突き出される。\n嵐そのものを圧縮したような破壊がコーカサスの鳩尾へ迫る。",
        lines: "8003-8008",
      },
      {
        name: "黒虎陶心",
        text: "黒虎陶心という虎の心臓をも容易く抜き取る技",
        lines: "4109",
      },
      {
        name: "氷魔法・氷琴",
        text: "氷魔法＿＿＿＿氷琴\n薄く青白い氷膜を纏った慶弥の腕。氷魔法。しかも攻撃ではなく、防御と受け流しのためだけに使われた工夫。\n鬼の純粋な暴力へ、真正面から力比べで対抗するのではなく、“滑らせる”ことで殺し切る軌道を崩したのだ。",
        lines: "22985,23007",
      },
      {
        name: "四力解放",
        text: "＿＿＿＿四力解放\n＿＿＿＿身体強化\n＿＿＿＿霊撃護符\n＿＿＿＿気功\n身体能力を魔力で強化、護符で霊力のある攻撃の威力を底上げ、最後に気功で気を整え反動を低減させる。",
        lines: "9162-9165,9168",
      },
      {
        name: "気力解放",
        text: "気力をその身に纏い攻撃力と多少だが速度を底上げる。\n風とも妖力とも異なる、武人として極限まで練り上げられた生命力そのもの。",
        lines: "22595,22600",
      },
      {
        name: "神力解放",
        text: "白金のオーラが彼の身体より立ち昇る\n神力解放により左腕及び肋骨は回復した。\n“神”の領域へ片足を踏み込んだ存在だけが放てる力。",
        lines: "23307,23309,23320",
      },
      {
        name: "焔雷・暁天穿",
        text: "一つ言葉を紡ぐごとに空気を揺蕩う一欠片の魔力までも彼の右掌に収束してゆきバラバラな力は煩雑に見えるそれは紅から夜明けのような橙に染まり、やがて一点に収束した",
        lines: "50171",
      },
    ],
  },
  {
    group: "Dyna・Mite",
    kicker: "HANABIYA",
    entries: [
      {
        name: "爆道拳",
        text: "【爆道拳】衝撃波ではない。爆発そのものを“拳の軌道へ閉じ込めている”。圧縮された破壊が一点へ集中し、進行方向の全てを無へ叩き返す。",
        lines: "7687-7693",
      },
      {
        name: "龍閃光・華陽",
        text: "両腕へ装填された爆弾丸が空中へばら撒かれ、それらが一斉に起爆した。\n【龍閃光・華陽！】\n色鮮やかな爆炎が幾重にも咲き乱れ、赤、青、金、紫の閃光が夜を塗り潰していく。まるで巨大な花火大会そのものだった。\nだがそれは、美しさの皮を被った純粋な破壊だ。",
        lines: "21719-21727",
      },
      {
        name: "千輪勁",
        text: "【千輪勁】発勁によって生み出された破壊の衝撃は、一点に留まることなく、水面に広がる波紋のように幾重もの輪となって拡散・伝播していく。ダークゴーストの腹部に直撃した衝撃は、夜空に咲く千輪花火のように連続的な爆発音を立てて激しく震動する。",
        lines: "36584-36587",
      },
      {
        name: "冠",
        text: "狡が最小限の動きで回避することすら予測し、攻撃によって発生した火花を追尾性の弾幕へと変貌させる技『冠』を即座に連動発動させる。",
        lines: "51323",
      },
      {
        name: "菊一文字",
        segments: [
          {
            by: "Dyna・Mite",
            text: "「残響.......」",
          },
          {
            text: "刀身から傷口へと刻み込まれた『爆発の概念』が、時間差を経て内部で一斉に解放されたのだ。【菊一文字】ダークゴーストの体内から菊花火のように幾重にも広がる鮮烈な光と衝撃が炸裂し、その肉体を容赦なく破壊する。",
          },
        ],
        lines: "37487,37490-37493,37505",
      },
      {
        name: "大輪拳・徒桜",
        text: "本来、爆発とは周囲へ無秩序に破壊を撒き散らす現象だ。しかしこの技は、そのエネルギーのすべてを一点へと収束させる。拳に込められた爆発は外部へ漏れることなく完全にホールドされ、命中した対象の内部へとダイレクトに送り込まれる。ただ、制御しきれなかった僅かな余剰エネルギーだけが、淡いピンク色の美しい火花となって解き放たれ、まるで満開の桜が風に散るかのように、静かに青空へと舞い上がっていく。",
        lines: "48679,48715",
      },
      {
        name: "爆弾丸",
        text: "花火屋は懐から爆弾丸を抜き放った。指先で弾き、飛来する光弾群へ投げ込む。圧縮火薬が一気に解放され、夢想封印の一角を吹き飛ばした。",
        lines: "11090,11101",
      },
      {
        name: "錆びたナイフ",
        text: "Dyna・Miteは静かに懐へ手を入れていた。取り出されたのは。一本の、錆びたナイフ。刃こぼれだらけ。古びている。武器ですらないような代物。なのに。その瞬間だけ。空気が凍った。",
        lines: "9371-9387",
      },
      {
        name: "爆発推進",
        text: "下駄が地面を踏み砕き、爆ぜる。爆発そのものを推進力へ変える異様な機動。Dyna・Miteは自分から爆炎へ突っ込み、その爆発の流れを利用して加速していた。",
        lines: "11086,11127,11348",
      },
    ],
  },
  {
    group: "狗瓦",
    kicker: "KUGAWARA",
    entries: [
      {
        name: "稲狼／霹靂",
        text: "稲狼の刀身へ宿った霹靂が、振り下ろされたクナイガンを真正面から受け止める。雷を宿す剣士が、“加速する悪魔”の前へ立ちはだかった。\n狗瓦の刃にバチバチと激しい紫白の電撃――『霹靂』が迸る。体内や物体に宿らせることで感電や発火を引き起こすその能力は、狗瓦自身には加護によって一切の熱も衝撃も与えない。一つの物体に絞れば雷撃レベルの威力を放つ",
        lines: "20604,20654,33164",
      },
      {
        name: "居合",
        text: "それは抜刀術。\n一瞬へ全てを圧縮する、居合。\n見えないなら、読むしかない。\n速さに追い付けないなら、“戻る場所”を斬ればいい。",
        lines: "21631-21633,21637-21639",
      },
      {
        name: "雷切",
        text: "夜空を地面とするように逆さに立った彼は、G4の背後を見下ろし、鞘から少し見えている刀身を、静かにカチンと閉じた。刹那。音を置き去りにして視界に閃光が走る。紫白の雷光が一条の絶対的な線となり、G4の胴体を一文字に切り裂く。それは、雷そのものが剣と化したかのような、神速にして苛烈な、この世の理を断ち切る一閃。【雷切】",
        lines: "36543-36552",
      },
      {
        name: "タケミカヅチ",
        segments: [
          {
            text: "着地と同時に、狗瓦は左手の指でフレミングの法則の型を鋭く形作る。",
          },
          {
            by: "狗瓦",
            text: "「これで……決めるッ！！」",
          },
          {
            text: "彼の人差し指と、先ほど地面に突き刺した刀の鍔が強烈な電磁的起点となり、その直線上へとレールガンの如き超高電圧の電子の奔流が一直線に撃ち放たれた。",
          },
          {
            text: "タケミカヅチ",
          },
        ],
        lines: "47343,47349,47352,47355",
      },
      {
        name: "霹靂を宿す程度の能力",
        text: "狗瓦は『霹靂を宿す程度の能力』を全開にし、肉体のリミッターを完全に解除する。神の加護が彼の身体能力を爆発的に跳ね上げ、世界がスローモーションへと変わっていく。",
        lines: "34440",
      },
    ],
  },
  {
    group: "幻想郷",
    kicker: "GENSOKYO",
    entries: [
      {
        name: "御幣――博麗の祓棒",
        owner: "博麗霊夢",
        text: "赤白の袖が翻り、御幣――博麗の祓棒が横薙ぎに振るわれ、花火屋の目が見開かれた。人間の打撃じゃない。空気そのものが弾け、衝撃波だけで周囲の瓦礫が浮き上がる。",
        lines: "10837,11187",
      },
      {
        name: "霊符・夢想封印",
        owner: "博麗霊夢",
        text: "御幣が翻る。瞬間、数十、数百の霊符が夕暮れの空へ展開された。\n【霊符・夢想封印】\n色とりどりの光が夕闇を埋め尽くし、幻想郷特有の“弾幕”が形成される。",
        lines: "20816-20822",
      },
      {
        name: "永守のドス",
        owner: "永守荘司",
        text: "仏壇の横に無造作に置かれていた一本のドスへ手が伸びる。刃物を投げた音ではない。砲撃に近い轟音だった。能力により白銀の刃の強度を極限まで高め、漆黒の刃へと染め上げる。",
        lines: "16673,16693,16834",
      },
      {
        name: "硬度を操る程度の能力",
        owner: "永守荘司",
        text: "それを完璧に受け止めることができたのは、永守の持つ『硬度を操る程度の能力』が、自らのみならず隣立つ霊夢の身体にまで及んでいたからであった。極限にまで高められた二人の絶対的な防御力は金剛石をも遥かに凌駕し、迫るライダーキックの威力をそのまま正面へと押し返したのだ。",
        lines: "36269",
      },
      {
        name: "怪力乱神を持つ程度の能力",
        owner: "星熊勇儀",
        text: "【怪力乱神を持つ程度の能力】\n怪異。勇力。悖乱。鬼神。\nそれら全てが彼女の力として拳に込められる。",
        lines: "22504-22509",
      },
      {
        name: "恋符・ノンディレクショナルレーザー",
        owner: "霧雨魔理沙",
        text: "【恋符・ノンディレクショナルレーザー】\n予測不能の全方位レーザー",
        lines: "33788-33791",
      },
      {
        name: "魔砲・ファイナルスパーク",
        owner: "霧雨魔理沙",
        text: "【魔砲・ファイナルスパーク】夜の魔法の森を真昼のように照らし出す圧倒的な破壊の光",
        lines: "35155,35158",
      },
      {
        name: "六道剣『一念無量劫』",
        owner: "魂魄妖夢",
        text: "彼女の白楼剣と楼観剣が、迫り来る二つの絶望を強引に受け止め、火花を天高く吹き上げる。命を削り、一瞬の間に無限の斬撃を繰り出す究極の剣技――【六道剣『一念無量劫』】。",
        lines: "35398",
      },
      {
        name: "新難題「金閣寺の一枚天井」／鳳凰「夜桜天翔」",
        owner: "蓬莱山輝夜・藤原妹紅",
        text: "死の恐怖を克服した二人の魂の絆が、かつてないほど苛烈なスペルカードとなって具現化する。\n【新難題「金閣寺の一枚天井」】\n【鳳凰「夜桜天翔」】",
        lines: "35101-35105",
      },
      {
        name: "奇跡『客星の明るい夜』",
        owner: "東風谷早苗",
        by: "東風谷早苗",
        text: "これ以上、慶弥さんの邪魔はさせません！！【奇跡『客星の明るい夜』】",
        lines: "38762,38765",
      },
      {
        name: "グングニル",
        owner: "レミリア・スカーレット",
        text: "彼女の宣言と共に、その手の中に、血のように紅く、禍々しいオーラを纏った伝説の神槍――グングニルが姿を現す。\n【神槍『スピア・ザ・グングニル』】",
        lines: "37957,38165",
      },
      {
        name: "御柱／大地",
        owner: "八坂神奈子・洩矢諏訪子",
        text: "神奈子の咆哮と共に、彼女の背後から無数の巨大な御柱が召喚され、超重量の質量兵器としてマッドローグめがけて垂直に降り注ぐ。同時に、地を這うように躍り出た諏訪子がその神力を大地へと流し込んだ。大地が生き物のように脈打ち、鋭利な岩のトゲがフェリアーの足元から突き出す。",
        lines: "38005,38014",
      },
      {
        name: "万物の再生を司る程度の能力",
        owner: "暁夕夏",
        segments: [
          {
            text: "前日の勇儀襲来によって破損された境内の石畳を見た夕夏は手をかざし無機物ですらも修復できるということを打算抜きで証明してみせた。",
          },
          {
            by: "東風谷慶弥",
            text: "「無機物でも直せるんだな」",
          },
          {
            by: "暁夕夏",
            text: "「万物の再生を司る程度の能力だからね！これくらいはできるよ〜！」",
          },
        ],
        lines: "41764,41766,41768",
      },
    ],
  },
  {
    group: "縫妖師",
    kicker: "HOYOSHI",
    entries: [
      {
        name: "公平を保つ程度の能力",
        owner: "廟堂刃",
        text: "その身体から放たれる純粋な戦闘狂としてのオーラは、計り知れない絶望感を放っている。あらゆる異能や飛び道具を強制的に封殺し、ただの剣術のみの果たし合いへと引きずり込む絶対的な領域が作り出される。【公平を保つ程度の能力】",
        lines: "33236,33238-33241",
      },
      {
        name: "剣鬼・不死鳥斬り",
        owner: "廟堂刃",
        text: "【剣鬼・不死鳥斬り】。彼の持つスペルカードの一種であり剣技の一つ。それは、どれほどの再生能力を持とうが、どのような理外の加護を持とうが、決して逃れることのできない不滅殺しの刃。別名，『絶命の太刀』。",
        lines: "35344-35347,35349",
      },
    ],
  },
  {
    group: "ドルミネンス",
    kicker: "DOLMINENCE",
    entries: [
      {
        name: "レディガントレット",
        owner: "クロク",
        text: "装着されたレディガントレットの外装のメタリックブラックが妖しく輝きを放ち、クロクはゆっくりと腕を上げる。\nガントレットの装填口、そこに差し込まれるのは——黒色のカプセム。レディガントレット上部の『スピナトリガー』を押すことでロックが解除。片手でガントレット本体を360°回転させることによりカプセムを展開。【ウワッハッハッハ…】【カオスリリース】次元力発生器『メデゥースラウンダー』が装填されたカプセムの回転を利用し、仮想トーラス体による多次元的エネルギーを抽出。能力出力装置「デュアルヴェザード」へと送り込むことによりカプセムに封入された悪夢からナイトメアを具現化させる。",
        lines: "1819-1821,1842-1850",
      },
      {
        name: "ブレイカムディバイド",
        owner: "ダークドライブ",
        text: "ダークドライブは躊躇なく腕を伸ばすと、隣に控えていたロードヴェノムの手から、不気味な銃剣『ブレイカムブレイカー』を強引に奪い取った。そして、腰の悪夢のベルトから取り出した、禍々しい黄金の輝きを放つ『カオスカプセム』をそのスロットへと装填する。\nそれは、対象の魂と肉体、あるいは内包された悪夢の概念を強制的に切り離すための、無慈悲な処刑の輝き。【ブレイカムディバイド！】",
        lines: "33684,33686,33695",
      },
      {
        name: "イレイスカプセム",
        owner: "ロードフォー",
        text: "輝夜の操る永遠の結界が、ガラスのように脆く砕け散る。それどころか、妹紅の身体に宿る蓬莱の不老不死の力さえも、その領域内では急速に弱まり、完全に消滅の危機に瀕していた。",
        lines: "31821",
      },
      {
        name: "ハイパーゼクター",
        owner: "ソル",
        segments: [
          {
            text: "銀色に輝く昆虫型装置。ハイパーゼクター。かつてコーカサスが所持していた力。",
          },
          {
            by: "ソル",
            text: "「使えるモンは全部使う、それだけだ」",
          },
          {
            text: "【RIDER KICK】",
          },
          {
            text: "ハイパーゼクターの発動する『マキシマムライダーパワー』を加えた、ライダーキックの強化版。",
          },
        ],
        lines: "18081-18085,18089,21838,21841",
      },
      {
        name: "カブトクナイガン",
        owner: "ソル",
        text: "クナイガン・アックスモード。巨大な刃が唸りを上げ、空気を断ち切る。",
        lines: "20776",
      },
      {
        name: "ゲネシスドライバー",
        owner: "タイラント",
        text: "腰にはメタリックレッドと黒色のスロットが特徴的なベルト、ゲネシスドライバー。ドライバーの下部分の容器『コンセイトレイトポッド』からドラゴンフルーツエナジーロックシードの抽出されたエネルギーが淡い赤色の液体として蓄積されているのが確認出来る。【ドラゴンフルーツ\nエナジースカッシュ】",
        lines: "16460-16462,16826-16827",
      },
      {
        name: "ソニックアロー",
        owner: "タイラント",
        text: "通常の弓より遥かに巨大で、機械的なフレームと生物的な曲線が異様な融合を果たしていた。上下に備えられたクリアブルーの刃───《アークリム》は朝日を受けて硝子みたいに煌めき、ただ構えているだけで周囲の空気へ鋭利な緊張を生み出している。ソニックストリングが淡く発光した。それは単なる弦ではない。圧縮エネルギーを実体化させた疑似光条。",
        lines: "16468,16502",
      },
      {
        name: "ベイクマグナム",
        owner: "テツヤ",
        text: "そして手には巨大な回転式拳銃『ベイクマグナム』。銃というより処刑器具だった。",
        lines: "31322",
      },
      {
        name: "チューイングイーター",
        owner: "テツヤ",
        text: "下顎部分が噛み砕くように作動し、ゴチゾウを熱融合し能力を抽出する特殊機構『チューイングイーター』が起動する。",
        lines: "31333-31334",
      },
      {
        name: "サガーク／ジャコーダー",
        owner: "ネル",
        text: "青と銀のカラーリングの機械生物の装置『サガーク』。サガークへウェイクアップフエッスルが差し込まれる。ジャコーダービュートが解放され、刀身がしなやかな形状へと変化。蛇のように伸びる赤色の鞭。",
        lines: "25528,25555,25577",
      },
      {
        name: "GZ-10オロチ",
        owner: "コードレムノン",
        text: "G4が振るう黒塗りの刀型ロングソード『GZ-10オロチ』が、空気を引き裂きながら階段を駆け下りる。",
        lines: "33147",
      },
      {
        name: "オーバードライブ",
        owner: "コードレムノン",
        text: "内蔵された緊急修復プログラムが作動し、オロチのナノマシンが驚異的な速度で再起動する。ベルトのGバックルが赤く点滅する。リミッター解除【オーバードライブ】GZ-10オロチの刀身が、超高周波の超高速振動を始め、周囲の空気をキィィンと不気味に震わせる。触れるもの全てを分子レベルで焼き切る一撃。",
        lines: "33933,33942-33950",
      },
      {
        name: "リミテイトブレス",
        owner: "コードナンバー：ナイン",
        text: "リミテイトは駆け出しながら、辺りの巨木に『リミテイトブレス』が装着された右腕を強引に押し付けた。その摩擦の勢いで装填されたカプセムが高速回転し、システムが非情な電子音を告げる。【リベリオン】\n反逆心による一時的なシステム強制解放。機体の身体能力が爆発的に跳ね上がり、リミテイトは一瞬で狗瓦の懐へ潜り込むと、鋼の如き脚で強烈な前蹴りを叩き込んだ。",
        lines: "48622-48628",
      },
      {
        name: "リミットスラッシャー",
        owner: "コードナンバー：ナイン",
        text: "リミットスラッシャー。様々な武器が墓標みたいに縫い合わされた異形剣。刀身を引き摺る度、\n床へ火花が散った。",
        lines: "17695-17700",
      },
      {
        name: "ヴォイドカプセム",
        owner: "コードナンバー：ナイン",
        text: "ツギハギの戦士は右腕に装着されたブレスに装填されているカプセムを回転させる。【サプレス】空間へ巨大な亀裂が走り、右足に封印エネルギーが収束される。最終的に悪夢は一羽の紫の蝶へと還元され、彼の手に握られたヴォイドカプセム内部へ、小さなゾディアーツの紋章が刻まれる。【ゾディアーツナイトメアカプセム】",
        lines: "17767-17773,17803-17806",
      },
      {
        name: "仮面ライダーゼッツダークネス",
        owner: "セブン",
        text: "セブンは黒色の外装甲を持つドライバーを左肩に袈裟掛けで装着すると、迷いなく漆黒のカプセムを取り出し、ドライバーへと静かに装填した。ポップアップしたレバー「トリガム」を押し込むと、カプセムが認証され、重苦しく響き渡る第一待機音から、一気に空間を歪ませる変身待機音へと移行する。【メツァメロ！メツァメロ！】\n「I'm on it……」\n左手の親指で下唇をなぞるように左腕をスライドさせ、こめかみのあたりでパチンと鋭くフィンガースナップを鳴らす。\n「変身」\n瞬時に吹き出した黒いもやのような凶悪なエネルギーがセブンの全身を包み込み、漆黒の強化被膜素体を形成していく。",
        lines: "53523,53529,53535-53538,53541,53553",
      },
      {
        name: "レーザーレイズライザー",
        owner: "ウツロ",
        text: "洗練された近未来的な銃型変身アイテム『レーザーレイズライザー』\nドレミーの指先がクロスオルタネーターを無慈悲に入力し、システムが必殺の移行を告げる電子音を響かせる。",
        lines: "44409,44415",
      },
      {
        name: "マガツヒノカミ",
        owner: "コードフェリアー",
        text: "【マガツヒノカミ！】マガツヒノカミが巨大な爪を振り下ろす。",
        lines: "31837,31940",
      },
    ],
  },
] as const;

export const DREAM_VOICES: readonly DreamVoice[] = [
  {
    speaker: "シエル",
    quotes: [
      {
        text: "考えるのは勝手だ。嫌になるのも、認めたくないのも好きにしろ。けど、勝手に居なくなるな",
        lines: "3858",
      },
      {
        text: "“仮面ライダー”じゃない。シエルだ",
        lines: "25236",
      },
      {
        text: "自己犠牲も時には必要───だが必ず生きて帰る",
        lines: "29123",
      },
      {
        text: "俺は主人公、か\n俺なんかが主人公だったら、誰かは不幸になってるよ\n第一、もっと主人公らしい奴がいるしな",
        lines: "32276-32278",
      },
      {
        text: "───この夢は、奪わせない。",
        lines: "41415",
      },
    ],
  },
  {
    speaker: "東風谷慶弥",
    quotes: [
      {
        text: "改めて自己紹介でもしようか？\n俺は東風谷慶弥、半人半神の23歳。能力だが理解する程度の能力を持ってる",
        lines: "7118-7119",
      },
      {
        text: "さぁ、次はどうするよ、風か？水か？それとも土か？何でも来い、全部受け止めてやるよ",
        lines: "2382",
      },
      {
        text: "大義名分だとか、荒らしの犯人だとか…そんなもの今は気にすんな、とにかく愉しい喧嘩にしよう",
        lines: "22527",
      },
      {
        text: "今度やるんなら喧嘩じゃなくて飲み比べにしてくれ。アンタと戦うなら酒のほうがまだ勝ち目があるよ",
        lines: "23116",
      },
      {
        text: "霊夢、咲夜、勇儀、組長、俺たちに吹く風は全て追い風だ！！勝つまでの間は気張っておけよ",
        lines: "34778",
      },
      {
        text: "今日が決戦、こういう日にこそ何気ないいつもの朝飯でも用意しようじゃないか",
        lines: "57542",
      },
    ],
  },
  {
    speaker: "怪作",
    quotes: [
      {
        text: "たとえ、夢だとしても全てが終わるとは限らないと思います",
        lines: "3538",
      },
      {
        text: "無駄だったかどうかは、結果じゃない\n自分がどう在ったかで決まると思うです。",
        lines: "3906,3908",
      },
      {
        text: "逃げるのは得意かもしれないけど、前で殴り合うのは苦手だからさ",
        lines: "7273",
      },
      {
        text: "……甘いの、あるといいね",
        lines: "7034",
      },
      {
        text: "シエルや慶弥たちが命を懸けて前を向いているのに、僕だけが自分の殻に閉じこもってちゃいけないよね。……分かったよ、サヨ。みんなに真実を伝える。この世界と、自分自身の恐怖に、ちゃんと向き合うよ",
        lines: "41702",
      },
      {
        text: "……シエル！行ってらっしゃい、僕も……ちゃんと、向き合ってみせるから！",
        lines: "42682-42683",
      },
    ],
  },
  {
    speaker: "博麗霊夢",
    quotes: [
      {
        text: "それが博麗の巫女の仕事\nだから、アンタ達が幻想郷を壊す側なら退治する\n逆に、壊そうとしてる奴が別にいるなら……そっちを先に殴るだけよ",
        lines: "19016,19018,19020",
      },
      {
        text: "アンタが本当に悪意で動いてないなら、まずは生き残りなさいよ\n償うだの何だのは、その後で考えればいいでしょ",
        lines: "19943,19945",
      },
      {
        text: "勘違いしないで。アンタ達までここで野垂れ死にされたら、後片付けが余計面倒なの",
        lines: "24017",
      },
      {
        text: "……ほんと、面倒なのばっか集まるわね",
        lines: "25222",
      },
      {
        text: "あんたたちの予測演算だか何だか知らないけど、そんな機械の理屈が、博麗の力に通じると思わないことね！",
        lines: "32993",
      },
      {
        text: "ここは幻想郷よ。あんたがどれだけ一人で背負い込もうとしたって、大結界を侵されて黙っていられるほど、私はお人好しじゃないの\n異変を解決するのは博麗の巫女の役目。あんた一人の戦いじゃないんだから、少しは周りを頼りなさいよ、バカ",
        lines: "41520,41522",
      },
    ],
  },
  {
    speaker: "八雲紫",
    quotes: [
      {
        text: "原因と責任は別よ",
        lines: "28012",
      },
      {
        text: "貴方は本当に無茶ばかりするのね",
        lines: "30358",
      },
      {
        text: "ここは大人しく守られなさい\n貴方はシエルが命懸けで守ろうとしているものの一つよ",
        lines: "32746,32758",
      },
      {
        text: "くっ、ふふ……。境界を操るこの私が、世界の消滅と再生の瞬間をただ見届けることしかできないなんてね。\nこれほどの異質、幻想郷の長い歴史を見渡しても、どこにも存在しないわよ……",
        lines: "35667,35669",
      },
      {
        text: "貴女には、まだ仲間がいるでしょう？ だったら、その人たちまで遠ざけないで頂戴……貴女が守りたいと思っている人たちは、貴女に守られるだけの存在じゃないわ。貴女と一緒に戦うために、そこにいるのだから",
        lines: "57042",
      },
    ],
  },
  {
    speaker: "Dyna・Mite",
    quotes: [
      {
        text: "礼は要らない、俺は人里を荒らしていた奴を退治しただけだ",
        lines: "10595",
      },
      {
        text: "そんな大層なもんじゃないさ。俺の中に居る妖怪の力を借りてるだけよ",
        lines: "10622",
      },
      {
        text: "速いだけじゃ、俺には届かねぇよ",
        lines: "8538",
      },
      {
        text: "だったら隣は俺が貰う。冥界だろうが地獄だろうが最後まで付き合ってやるよ\n一人じゃねぇんだからな",
        lines: "28991,28993",
      },
      {
        text: "さて.......祭りの始まりと行こうか",
        lines: "36575",
      },
      {
        text: "お前には一生、分からねぇだろうな。命ってのは儚くで消えちまうからこそ、夜空に咲く花火みたいに美しく輝くんだよ",
        lines: "37580",
      },
    ],
  },
  {
    speaker: "永守荘司",
    quotes: [
      {
        text: "仁義ってモンはな、筋を通して初めて成り立つ",
        lines: "11912",
      },
      {
        text: "人間ってのはな、余裕無くなると簡単に壊れる\n腹減ってる時\n寝床が無ぇ時\n自分の居場所が無ぇ時\nそういう時、人間は簡単に道踏み外す",
        lines: "13116,13125,13127,13129,13131",
      },
      {
        text: "前向きってのは才能だ\n折れねぇ奴は、それだけで強ぇ\nだが最後まで立ってんのは、大体“折れなかった奴”だ",
        lines: "13606,13616,13633",
      },
      {
        text: "……今夜くらいは休め\nお前らみてぇなのは、大体背負い込み過ぎる\nだから壊れる時は一気だ",
        lines: "13375,13381,13383",
      },
      {
        text: "ガキ攫おうってなら\nまず俺を殺してからにしろ",
        lines: "19585,19587",
      },
      {
        text: "小僧……人の心を忘れ、外道に堕ちた以上。裏の人間の端くれであっても見過ごせんぞ",
        lines: "31946",
      },
    ],
  },
  {
    speaker: "狗瓦",
    quotes: [
      {
        text: "悪いけど女の子の前で、無様は晒せない主義なんだ",
        lines: "20633",
      },
      {
        text: "人間を余り舐めない方がいいよ......！",
        lines: "20694",
      },
      {
        text: "一回見た技って、割と覚える方なんだ",
        lines: "21015",
      },
      {
        text: "貴方が死んだら流石に後味が悪いので",
        lines: "20863",
      },
      {
        text: "……よくも妖夢をここまでやってくれたね。花火屋さん、悪いけど、俺はもう限界だ。アイツらはここで絶対に叩き斬る",
        lines: "32047",
      },
    ],
  },
  {
    speaker: "星熊勇儀",
    quotes: [
      {
        text: "護るモン抱えて、それでも前出て来る奴ァ好きだ",
        lines: "22478",
      },
      {
        text: "いいねぇ……そういう馬鹿みてぇな根性、私は大好きだ",
        lines: "22802",
      },
      {
        text: "今まで喧嘩してきた奴らで見ても最高だよ、アンタ。力だけじゃねぇ、根性だけでもねぇ。“勝つために頭を使いながら、それでも最後は拳で来る”……久しぶりに悪酔い出来たわ",
        lines: "23094",
      },
      {
        text: "次は旧地獄来いよ。酒樽ごと潰してやる",
        lines: "23168",
      },
      {
        text: "困ってるなら助ける\nそれだけだ\nそれに昨日喧嘩した仲だ\n拳交えた相手の頼みを無下にするほど、鬼は薄情じゃねぇよ",
        lines: "30772,30774,30780,30782",
      },
    ],
  },
  {
    speaker: "東風谷早苗",
    quotes: [
      {
        text: "……貴方を見たら\nちょっと、笑えなくなっちゃいました",
        lines: "21138-21139",
      },
      {
        text: "いや当然みたいに言ってますけど、普通は鬼と殴り合いしませんからね……？",
        lines: "24263",
      },
      {
        text: "思っていたよりずっと普通の人でした",
        lines: "26409",
      },
      {
        text: "はい。また入りに来てください",
        lines: "26777",
      },
      {
        text: "……だって、慶弥さんは、別の世界ではもう一人の私と、その......結ばれているんですよね？ だったら、この世界の私だって……慶弥さんのことを、放っておけるわけないじゃないですか\n不器用で、無茶ばかりして、それでも誰かのために傷つける背中を見ていたら……好きに、なるに決まってるじゃないですか",
        lines: "41430,41432",
      },
    ],
  },
  {
    speaker: "ヴァルトマン",
    quotes: [
      {
        text: "現実で言う一瞬が、此処では永遠にも等しい",
        lines: "1298",
      },
      {
        text: "希望とは、大層な奇跡ではありません\n“それでも諦めない”という意思の残火です",
        lines: "15512,15514",
      },
      {
        text: "自分の命を軽く扱うことと覚悟を決めることは似ているようで全く違いますよ",
        lines: "27143",
      },
      {
        text: "誰かを守るということは誰にも頼らないことではありません",
        lines: "27175",
      },
      {
        text: "貴方様が諦めた瞬間に終わる未来と最後まで足掻いた先に辿り着く未来は\n決して同じではありません",
        lines: "27297,27299",
      },
      {
        text: "己自身が何を見て、何を信じるのか、最後にそれを決めるのは……その人自身です",
        lines: "57382",
      },
    ],
  },
  {
    speaker: "マキャベル",
    quotes: [
      {
        text: "アナタは壊れるだけの\n主人公だから",
        lines: "14875-14876",
      },
      {
        text: "次は、\n誰を失った時に\n開くのかな",
        lines: "16324-16326",
      },
      {
        by: "拒絶の悪夢",
        text: "そんなに\nワタシを拒絶したいんだ\nかわいい\nやっぱり\n貴方は\n私の主人公だね",
        lines: "30521-30523,30535,30545,30554-30556",
      },
      {
        by: "拒絶の悪夢",
        text: "貴方が居なければ\nワタシは存在できない\nだから、ワタシは\n貴方になりたい\n主人公になりたい\nだから\n拒絶しないで\nお願いだから",
        lines: "31197-31199,31204-31206,31212,31224-31226,31236",
      },
      {
        by: "拒絶の悪夢",
        text: "ワタシは\n拒絶される為に\n生まれたのに\n主人公に\nなりたかった\nただ\n一度だけでいい\nワタシを\n見てほしかった",
        lines: "32463,32469,32475,32485,32491,32501,32507,32513,32519",
      },
      {
        by: "拒絶の悪夢",
        text: "ねえ、シエル\nワタシと、ひとつになって\n貴方の孤独も、\n痛みも、壊れた身体も\n全部ワタシが引き受けるから\nもう、どこにも行かないで\nワタシのなかで、生きて",
        lines: "33516,33519,33527-33529,33536-33537",
      },
    ],
  },
  {
    speaker: "霧雨魔理沙",
    quotes: [
      {
        text: "無理だろこんなん！外の世界の装甲戦士だぞ！？",
        lines: "24830",
      },
      {
        text: "分かったぜ。続きは明日聞く\n変身とか絶対見せろよな！",
        lines: "25096,25098",
      },
      {
        text: "見た目で判断すると痛い目見るぜ",
        lines: "27850",
      },
      {
        text: "よくやった、チルノ……！ 借りはお前の大好きな特大のド派手な一撃で返してやるぜッ！\n喰らいやがれッ！！",
        lines: "35146,35152",
      },
      {
        text: "ヘッ、最高の舞台じゃねぇか。今の私らの戦力じゃ足りねぇってんなら、その足りないピースをお前が埋めてくれるんだろ？ 頼りにしてるぜ、仮面ライダー",
        lines: "40380",
      },
    ],
  },
  {
    speaker: "サヨ",
    quotes: [
      {
        text: "……怖くないわけないじゃない\nなんでそんなのに向かって行けるのよ……\n狂ってるわ……",
        lines: "30334,30336,30342",
      },
      {
        text: "ねぇ、怪作\n彼のなら何て言うと思う？\n絶対に死ぬな、でしょ",
        lines: "32703,32709,32723",
      },
      {
        text: "信じられない……悪夢に呑まれるどころか、それすらも自分の力に変えて戻ってくるなんて。正気の沙汰じゃないわ！",
        lines: "34216",
      },
      {
        text: "……ええ、分かっているわ。殺される覚悟がなければ、わざわざ怪作を連れてあんたたちの前に姿を現したりしない\n裏切り者としての処断なら、この異変が全て片付いた後にいくらでも受けてあげる",
        lines: "40931,40933",
      },
    ],
  },
  {
    speaker: "クロク",
    quotes: [
      {
        text: "まだ終わっていないんだよ",
        lines: "4003",
      },
      {
        text: "悪夢からは決して逃げ切れませんよ？",
        lines: "4491",
      },
      {
        text: "そろそろ来るかな？",
        lines: "4824",
      },
      {
        text: "あはは！ 素晴らしい、本当に素晴らしいよ、シエル！\nまさか悪夢そのものと融合して、世界をまるごと書き換える権能を手に入れるなんてね。これから倒すのが楽しみで夜も眠れないよ",
        lines: "36003,36005",
      },
      {
        text: "私はドルミネンスのコードナンバー：ツー、クロク。以後お見知り置きを！\nあっ、知ってもどうせここで消すんだったね！ごめん！ごめん！",
        lines: "53787,53789",
      },
    ],
  },
  {
    speaker: "暁夕夏",
    quotes: [
      {
        text: "アタシはアニキについて行くよ、アタシがいないと絶対にアニキ無茶して死んじゃうし。それに噛んでもいいなら少なくとも即死以外なら皆のことも助けられるしね。",
        lines: "40808-40809",
      },
      {
        text: "思ったより凄い行列だね〜、みんな順番に噛むから首筋だけ出して心の準備もしておいてね〜チクッとするから",
        lines: "43590",
      },
      {
        text: "嫌だ…！！絶対に生きて、勝って、みんなと一緒に！！ご飯食べるんだ！！",
        lines: "54320",
      },
      {
        text: "アニキって自分を勘定に入れないよね、アタシもアニキを護るからね",
        lines: "56777",
      },
      {
        text: "この件がなかったらアタシいないし、アタシはこれで良かったと思うよ。最後までこの良かったを守るのがアタシ達の役目だって思うし",
        lines: "57416",
      },
    ],
  },
] as const;

export const DREAM_GLOSSARY_SUPPLEMENT: DreamArchiveTable<DreamArchivePassage> = {
  ナイトメア: {
    by: "ヴァルトマン",
    text: "ナイトメアが作り出す悪夢は、極めて現実に近い体感を伴います\n夢主は痛みを感じ、恐怖を感じ、死を理解する\nそして多くの場合——目覚めた後も、その記憶を保持する",
    lines: "26086,26088,26090",
  },
  夢主: {
    by: "シエル",
    text: "だが、宿主───夢主が死ねば、ナイトメアも消えるんだ",
    lines: "19805",
  },
  心の扉: {
    by: "ヴァルトマン",
    text: "夢主が抱く願望\n罪悪感\n恐怖\n憎悪\n忌避感\n……そういった感情を、強引に“悪夢”として実現することで\n扉は少しずつ開いていく",
    lines: "26144,26146,26148,26150,26152,26154,26156",
  },
  ゴアナイトメア: {
    by: "ヴァルトマン",
    text: "通常のナイトメアが“夢”へ干渉する存在であるなら\nゴアナイトメアは、“存在そのもの”へ侵食する\n精神の侵略者",
    lines: "26218,26220,26234",
  },
  超深層: {
    text: "黄昏が、垂れる。夢でもなく、現実でもなく。\nここは悪夢。シエルの超深層心理の世界。\n全部が不格好で。全部が作り物で。それでも、悪夢だけは本物だった。",
    lines: "14454-14456,14460,14471-14473",
  },
  ベルベットルーム: {
    segments: [
      {
        by: "ヴァルトマン",
        text: "「本来、ベルベットルームは“可能性”へ応じて形を変えます」「牢獄になる者も居る」「劇場になる者も」「車、エレベーター、水族館に汽車」「様々です。ですが貴方様の場合——」",
      },
      {
        by: "ヴァルトマン",
        text: "「“信仰”として成立した」",
      },
    ],
    lines: "15373-15381,15389",
  },
  破滅の魔の手: {
    text: "「悪夢を“資源”として扱う、邪悪な存在。その正体は現状、私でも特定することは不可能です」「彼らが望むモノはただ一つ。」「支配」「直接的な侵略ではなく、“内側からの侵食”」「人々が自らの意思で閉じ、縛られ、動かなくなる世界」",
    lines: "1350,1356,1362,1368-1370",
  },
  ネクストピース: {
    text: "赤い月の光が、ネクストピースに反射する。その輝きは脈打つように明滅し、やがて男の腕へ、胸へと侵食するように広がっていった。",
    lines: "39",
  },
  カオスカプセム: {
    text: "カオスカプセムにネクストピースを近づけることにより強制的に展開。",
    lines: "53",
  },
  オーロラカーテン: {
    text: "何も無かったはずの空間に、銀色の“膜”が滲み出る。光を反射するでもなく、透過するでもなく、ただ“在る”銀。オーロラカーテン。空間を裂くのではない。重ねる。この世界に、別の位相を“重ねてくる”侵入方法。",
    lines: "6171,6173,6181-6185",
  },
  仮面ライダー: {
    segments: [
      {
        by: "シエル",
        text: "「まず、『仮面ライダー』というのは複数体、複数派閥いるらしく、これは俺も初めて知った」",
      },
      {
        by: "シエル",
        text: "「『仮面ライダー』というのは所謂『パワードスーツ』の類らしい。基本的に人間が変身する」「簡単に言うと、貴方達に匹敵する力を齎す鎧だ」",
      },
    ],
    lines: "18772,18779-18780",
  },
  幻想郷: {
    by: "怪作",
    text: "人間が忘れたもの、見ないことにしたもの、昔はそこにあったのに、いつの間にか“無かったこと”にされたもの……そういうのが、ここに来る。妖怪だってそうだし、道具だってそうだし、話だって、名前だって……たぶん、人間の中で捨てられた何かも",
    lines: "6811",
  },
  博麗大結界: {
    by: "八雲紫",
    text: "その境界へ私の隙間を重ねる\nええ、戦場そのものを私が隔離する\n博麗神社へ発生させた隙間の内部、そこで貴方を戦わせるの",
    lines: "28876,28899,28901",
  },
};

export const DREAM_GLOSSARY_INDEX: readonly DreamGlossaryIndexEntry[] = [
  {
    term: "明晰夢",
    text: "夢の中だが、曖昧な要素が排斥された力。つまり明晰夢か。",
    lines: "9487",
  },
  {
    term: "融和",
    text: "『融和』により、ダメージは確定で効く。あの青白い光は夢の中であろうと現実と同等の力を発揮できる。",
    lines: "9909-9910",
  },
  {
    term: "試験体",
    text: "「先程のロストナイトメアは、その為の試験体のようなもの」「個の悪夢をどこまで拡張出来るか」「どこまで現実へ干渉させられるか」",
    lines: "1376-1380",
  },
  {
    term: "紫の蝶",
    text: "全てが、紫へと変わる。無数の蝶。一匹、また一匹と、光を失い、輪郭を失い、完全に空間へ溶けるように消滅していく。",
    lines: "2924-2926,2930",
  },
  {
    term: "境界の歪み",
    segments: [
      {
        by: "博麗霊夢",
        text: "「最近、“境界”に歪みが出てるらしいのよ」「別次元……って言えばいいのかしらね」「向こう側から侵入して来る奴が居るって」",
      },
    ],
    lines: "13915-13919",
  },
  {
    term: "文々。新聞",
    segments: [
      {
        by: "シエル",
        text: "「“ぶんぶんまる”…これは新聞？こっちにもそんな文化が…」",
      },
      {
        text: '風に巻かれて跳んできた"文々。新聞"、内容は昨日の大暴れの一件について、まぁさほど気にすることではないだろう。',
      },
    ],
    lines: "17849,17870",
  },
  {
    term: "CLOCK UP",
    text: "【CLOCK UP】\n夕暮れの光が引き延ばされる。\n舞い上がった木片が空中で停止したみたいに遅くなる。\n動いているのは、ダークカブトだけだった。",
    lines: "19468-19473,19479",
  },
  {
    term: "ROAD SYSTEM",
    text: "【ENFORCE】 【ROAD SYSTEM！】 【NIGHTMARE！】\n赤と青の装甲。異形の肉体。赤く発光する複眼。爆弾の悪夢を司る戦士『ロードボマー』\n銃の恐怖や悪夢を司る右手に大型のマシンガンを装着した緑と紫の戦士『ロードガンナー』。\nありとあらゆる毒を司る毒々しくて不気味な戦士『ロードヴェノム』。",
    lines: "32563-32567,32570,32578,32588,32606",
  },
  {
    term: "擬装",
    text: "ワンは冷徹な手つきでロードインヴォーカーのイジェクターを押し込んだ。【オンユアマーク　オンユアマーク】\n「……擬装」\nそして、感情のない掛け声と共にワンがカプセムを回転させると、彼を取り囲むように試験管状の巨大なエフェクトが展開。内部が黒い特殊ゲルで満たされ、ミッションスーツを精製していく。直後、内部で一羽の妖しく光り輝く紫の蝶がワンの身体と融合。全身に鮮烈な赤のラインがデザインされ、試験管のエフェクトが音を立てて砕け散った。【エンフォース ロードシステム】",
    lines: "52270-52282",
  },
  {
    term: "ガイアメモリ／ドーパント",
    text: "ケースの中に並んでいたのは、禍々しいオーラを放つ文字が刻まれた、未知のUSBメモリ――『ガイアメモリ』。\nカチリ、とボタンを押した妖精たちが、自らの身体にメモリを突き刺す。その瞬間、小さな身体がドロドロとした異形のエネルギーに包まれ、奇怪な姿の怪物。ドーパントへと次々と変貌を遂げていった。",
    lines: "44313,44322",
  },
  {
    term: "西行妖",
    by: "Dyna・Mite",
    text: "ああ、魂を吸い尽くして咲くっていう、伝説の妖怪桜だ。",
    lines: "31995",
  },
  {
    term: "認知",
    by: "ヴァルトマン",
    text: "簡単に言えば、人が世界を見て……『これはこういうものだ』と理解することです\n人が心の中で形作っている『世界そのもの』へ、干渉するのです\nドルミネンスは、その認知の歪みを利用している\n本来ならば味方となるはずだった夢の存在までも、認識そのものを書き換え……自らの手駒としているのです",
    lines: "57331,57337,57343,57345",
  },
  {
    term: "サードアイ",
    text: "【サードアイ】\n認知の歪みを視認できる特殊な瞳。普段見えないものが見えるようになる。",
    lines: "57518-57520",
  },
  {
    term: "赤い三日月",
    text: "不気味な赤い三日月が夜空から冷たい光を注ぐ中、幻想郷は深い静寂と夜の底へと誘われていった。",
    lines: "57174",
  },
  {
    term: "夜明け",
    text: '純白の心の扉が開き、精神の最深部から現実世界へと帰還を果たしたシエル。悪夢と融和し、その身に"夜明け"を宿した彼の存在感は、絶望に沈みかけていた境内の空気を一瞬で塗り替えた。',
    lines: "33622",
  },
] as const;

export const DREAM_ROSTER_SUPPLEMENT: DreamArchiveTable<readonly DreamArchivePassage[]> = {
  reimu: [
    {
      text: "攻防一体。御幣を受ければ札が飛び、札を捌けば蹴りが来る。距離を取れば夢想封印。近付けば武術。あまりにも完成されている。",
      lines: "11199",
    },
  ],
  yukari: [
    {
      text: "優雅な着物姿の女性が扇子を口元へ添えながらこちらを見ていた。",
      lines: "27822",
    },
  ],
  sanae: [
    {
      text: "神社で何度も無茶人間を相手してきた巫女の慣れである。",
      lines: "23833",
    },
  ],
  marisa: [
    {
      text: "魔理沙の掲げたミニ八卦炉から放たれた熱線が、幻想郷の青空を黄金色に染め上げていた。",
      lines: "33030",
    },
  ],
  youmu: [
    {
      text: "その佇まいは、数々の修羅場をくぐり抜けてきた、頼れる「お姉さん」そのものの包容力に満ちていた。",
      lines: "35409",
    },
  ],
  remilia: [
    {
      text: "紅い月光の如き威厳を纏った真紅の悪魔。手にしていた神槍『スピア・ザ・グングニル』を優雅な動作で霧散させ、威厳たっぷりに腕を組むレミリア。",
      lines: "54917,55096",
    },
  ],
  yugi: [
    {
      text: "酒より喧嘩。理屈より拳。鬼は嘘を嫌う。気に入らなければ気に入らないと言うし、認めたなら認める。",
      lines: "21556-21558,22471-22473",
    },
  ],
  aya: [
    {
      text: "風を裂きながら飛ぶ彼女の手には、大量の新聞束。幻想郷中へ向けて、文字通り“ばら撒かれて”いく。里の屋根へ。神社の石段へ。魔法の森へ。妖怪の山へ。紅魔館の窓へ。───“仮面ライダー”。",
      lines: "16898-16906,16937",
    },
  ],
  yuka: [
    {
      text: "はたから見ればただの仲睦まじい兄妹だがその実は魂を共有するほぼ同一人物、この兄妹は違うようで同じなのだ\n唯一性格だけが全く違う。慶弥はやや荒い性格かつ冷静だが激情家、夕夏は奔放で悪戯好きだがやや繊細。",
      lines: "41352,41355",
    },
  ],
  dynamite: [
    {
      text: "花火。それは一瞬だ。咲いた瞬間に消える。だからこそ、“瞬間”を極限まで圧縮する。Dyna・Miteという男は、その極致に到達していた。一瞬を永遠のように引き延ばし、永遠を刹那へ圧縮する。導火線へ火が落ちる瞬間。炸裂する寸前の火薬。夜空へ咲く一秒未満の閃光。",
      lines: "8105-8111,8115-8121",
    },
  ],
  nagamori: [
    {
      text: "巨体だった。分厚い胸板。腕に残る無数の古傷。極道の組長という肩書きが無くとも、ただ座っているだけで“場”が出来上がる類の男だ。",
      lines: "12949,12951",
    },
    {
      text: "敵意。殺気。呼吸。視線。空気の流れ。その全てを嗅ぎ分ける獣みたいな感覚だけで、正確に相手の位置を捕捉していた。",
      lines: "16639",
    },
  ],
  banzo: [
    {
      segments: [
        {
          by: "伴蔵",
          text: "「まあ……“人里を守るための組織”って言っても、腹減ってちゃ戦えねぇですからね」",
        },
      ],
      lines: "12688",
    },
  ],
  kugawara: [
    {
      text: "霹靂の加護が騒いでいる。雷神に魅入られた彼の感覚が、危険を告げていた。",
      lines: "20329-20331",
    },
    {
      text: "異変だろうが妖怪退治だろうが、死線の中へ踏み込むことには慣れている。以前の異変解決で顔見知りになっているため、魔理沙もそこまで警戒はしていない。",
      lines: "23954,24788",
    },
  ],
  waldmann: [
    {
      text: "長い年月の中で幾度となく見送ってきた者達へ向ける、静かな感情だった。この部屋の管理人らしく。",
      lines: "27132,27260",
    },
  ],
  machiavel: [
    {
      text: "ぼろぼろに裂けた外套が黄昏の風に揺れる。青とも黒ともつかない布地には、無数の文字列が滲むように刻まれていた。フードの奥。顔があるべき場所には、“穴”があった。赤黒い発光体が花弁のように幾重にも開閉し、その中心で白い“瞳”だけが瞬いている。夢が、悪夢のまま肉体を得たような異形。",
      lines: "14683-14685,14687-14689,14693,14699",
    },
  ],
};

export const DREAM_AGENT_SUPPLEMENT: DreamArchiveTable<DreamAgentSupplement> = {
  "0": {
    note: {
      text: "ムツキは笑顔で椅子へ座ったまま、足を揺らしている。その笑顔だけが、妙に無邪気だった。だがその無邪気さこそ、この場で一番恐ろしい。",
      lines: "14405",
    },
  },
  "1": {
    line: {
      by: "コードナンバー：ワン",
      text: "お前が満足ならそれでいい、すべては一つの目標を叶えるための布石にしか過ぎない",
      lines: "42944",
    },
  },
  "2": {
    note: {
      text: "悪夢を“起こした”のではない。悪夢を、手札として扱っている側。壊れる瞬間を愉しむために、わざわざ舞台を整える種類の人間。",
      lines: "4043-4045",
    },
  },
  "3": {
    rider: {
      text: "仮面ライダーウツロ",
      lines: "45659",
    },
    device: {
      text: "レーザーレイズライザー",
      lines: "44409",
    },
    note: {
      text: "中性的な顔立ちの少年は無気力に答えながらも右手で宙に円を描くようにしてマグカップをデザインして、そこにオレンジジュースを注いだ。",
      lines: "14451",
    },
    line: {
      by: "ウツロ",
      text: ".......君はまだ動けるんだ",
      lines: "45628",
    },
  },
  "4": {
    rider: {
      text: "ロードフォー",
      lines: "31735",
    },
    device: {
      text: "ロードインヴォーカー／イレイスカプセム",
      lines: "31768",
    },
    note: {
      text: "コードナンバー4。またの名を『ロードフォー』。冷徹な仮面の奥から、ヒトヨは感情の失せた声を響かせる。",
      lines: "31733-31737",
    },
    line: {
      by: "ヒトヨ（ロードフォー）",
      text: "これでおしまい、貴女にも悪夢を見せてあげる",
      lines: "34085",
    },
  },
  "5": {
    rider: {
      text: "仮面ライダーサウザー",
      lines: "31864",
    },
    device: {
      text: "サウザンドジャッカー",
      lines: "31864",
    },
    line: {
      by: "セン（サウザー）",
      text: "私の強さは、いつでも1,000%だ。旧時代の遺物が、我々の完璧な計画を邪魔できると思うな",
      lines: "31861",
    },
  },
  "6": {
    rider: {
      text: "仮面ライダーザイア",
      lines: "31864",
    },
    line: {
      by: "セオ（ザイア）",
      text: "私の戦術は常にパーフェクト。さあ、その自慢の知恵とやらで、私を攻撃してみなさい",
      lines: "31870",
    },
  },
  "8": {
    line: {
      text: "諦めるんだな、悪夢は終わらない",
      lines: "4637",
    },
  },
  "9": {
    rider: {
      text: "擬甲戦士:リミテイト",
      lines: "45431",
    },
    device: {
      text: "リミテイトブレス／リベレンジカプセム",
      lines: "45380,45401",
    },
    note: {
      text: "長いコートに黒い装甲。継ぎ接ぎだらけの異形。複眼だけが鈍く発光した存在。誰にも正体を知られず。誰にも名前を残さず。ただ、夢の奥で悪夢だけを狩る、\n“９番目のエージェント”として。",
      lines: "17685,17831-17836",
    },
    line: {
      by: "ツギハギの戦士",
      text: "勘違いするな\n俺はヒーローじゃない",
      lines: "17822-17823",
    },
  },
  "17": {
    rider: {
      text: "仮面ライダーサガ",
      lines: "25546",
    },
    device: {
      text: "サガーク",
      lines: "25528",
    },
    note: {
      text: "細い指先。艶のある銀の長髪。舞台役者みたいに整った所作。",
      lines: "25432-25433",
    },
    line: {
      text: "そろそろ始めましょうか\n誰もが恐れる支配という名の悪夢を",
      lines: "25649,25651",
    },
  },
  "18": {
    rider: {
      text: "仮面ライダーベイク",
      lines: "31308",
    },
    device: {
      text: "ベイクマグナム",
      lines: "31322",
    },
    line: {
      by: "テツヤ（ベイク）",
      text: "妖精の生態は興味深いね\nやはり環境ごと破壊するのが効率的かな",
      lines: "31328,31343",
    },
  },
  "21": {
    rider: {
      text: "仮面ライダーダークカブト",
      lines: "18070",
    },
    device: {
      text: "ハイパーゼクター／カブトクナイガン",
      lines: "19421",
    },
    note: {
      text: "漆黒の装甲。禍々しい一本角。コードナンバー21。ソル。その腰には、銀色に輝くハイパーゼクター。握り締めるはカブトクナイガン。",
      lines: "19408,19417-19421",
    },
    line: {
      by: "ソル",
      text: "負け犬の装備を再利用して何が悪い\n力は使った奴のモンだろ\nアイツが弱かっただけだ",
      lines: "18140-18141,18147",
    },
  },
  "24": {
    note: {
      text: "その瞳だけは今までのドルミネンスの者達とは違っていた。そこにあったのは狂気ではない。迷いと。後悔と。そして決意だった。",
      lines: "29840-29848",
    },
    line: {
      by: "サヨ",
      text: "敵だった\nでも今は違う\n私はドルミネンスを裏切った",
      lines: "29733,29739,29745",
    },
  },
  X: {
    rider: {
      text: "仮面ライダービターガヴ",
      lines: "31264",
    },
    note: {
      text: "赤を基調とした装甲。コーラグミを思わせるクリームホワイトからブラウンへ変化する不気味なグラデーションに紫色の複眼。",
      lines: "31270",
    },
    line: {
      by: "イネム（ビターガヴ）",
      text: "可愛い、可愛い妖精さん〜\n私の飢えを満たしてね♪",
      lines: "31278,31280",
    },
  },
  CHAOS: {
    line: {
      by: "ロードケイオス",
      text: "鬼さんこちら、手の鳴る方へ",
      lines: "49985",
    },
  },
};

export const DREAM_AGENT_ADDITIONS: readonly DreamAgentAddition[] = [
  {
    code: "7",
    name: "セブン",
    rider: {
      text: "仮面ライダーゼッツダークネス",
      lines: "53559",
    },
    note: {
      text: "サヨと同じ怪しげな装いに身を包んだ、冷徹な眼光を宿す一人の青年",
      lines: "53498",
    },
    line: {
      by: "セブン",
      text: "コードナンバー：セブン、ミッションを遂行する",
      lines: "53518",
    },
  },
  {
    code: "11",
    name: "仮面ライダーコーカサス",
    rider: {
      text: "仮面ライダーコーカサス",
      lines: "7476",
    },
    note: {
      text: "姿を現したのは、金。青い複眼が静かに光り、三本の角が朝光を受けて鈍く煌めく。",
      lines: "6203,6205",
    },
    line: {
      text: "学習しないですね",
      lines: "8051",
    },
  },
  {
    code: "12",
    name: "仮面ライダーベイル",
    rider: {
      text: "仮面ライダーベイル",
      lines: "6367",
    },
    note: {
      text: "装甲でありながら、それはまるで軍服だった。",
      lines: "6333",
    },
    line: {
      text: "嘆くことは生き残った者の義務でも、権利でもない。ただの“無駄”だ",
      lines: "6392",
    },
  },
  {
    code: "13",
    name: "仮面ライダーゲンム",
    rider: {
      text: "仮面ライダーゲンム",
      lines: "6313",
    },
    note: {
      text: "場違いなほど軽い、だが妙に耳に残る音。黒い影が、弾むように幕から飛び出す、着地と同時に膝を沈め、その反動で立ち上がる動きはどこか遊戯めいている、しかしそこにあるのは余裕ではなく、“余白”だ、何をしても成立するという歪んだ余白。",
      lines: "6307-6309",
    },
    line: {
      text: "予測不能！　理不尽！　ゲームバランスを破壊するイレギュラー！　やはり未知とはこうでなくてはな！",
      lines: "7925",
    },
  },
  {
    code: "14",
    name: "仮面ライダー4号",
    rider: {
      text: "仮面ライダー4号",
      lines: "6288",
    },
    note: {
      text: "右腕のマルチメーターが淡く光り、戦場の情報が瞬時に解析される、視線が一度だけ動く、その一瞬で状況把握は完了している、感情の介在する余地はない、ただ任務としてこの場を処理するための存在。",
      lines: "6297",
    },
    line: {
      text: "逃げるために撃ったのもあって、避けやすいな",
      lines: "6481",
    },
  },
  {
    code: "15",
    name: "仮面ライダー風魔",
    rider: {
      text: "仮面ライダー風魔",
      lines: "6271",
    },
    note: {
      text: "コードナンバー15。殲滅を目的として造られた忍。任務のためなら死地すら踏み越える男。",
      lines: "7649",
    },
    line: {
      text: "ワシらの目的はただ一つ。計画を邪魔する者の殲滅だ。余計な感情は持ち合わせるな",
      lines: "6277",
    },
  },
  {
    code: "16",
    name: "ゲッコウ",
    rider: {
      text: "仮面ライダーヘラクス",
      lines: "18168",
    },
    note: {
      text: "同じくエージェント服を着た黒髪のセンターパートが特徴的な男。元ハンドレッド。今はドルミネンス側へ流れた残党。",
      lines: "23220,23237",
    },
    line: {
      text: "……見つけたぞ\nお前が東風谷慶弥か",
      lines: "23226,23232",
    },
  },
  {
    code: "25",
    name: "仮面ライダータイラント",
    rider: {
      text: "仮面ライダータイラント",
      lines: "16470",
    },
    note: {
      text: "紅の複眼。黒いアンダースーツに淡い赤の重装甲は、まるで乾いた血を幾重にも塗り固めたような鈍い光沢を持っていた。",
      lines: "16458",
    },
    line: {
      by: "タイラント",
      text: "夢を叶える、それだけのことだァ！！",
      lines: "16814",
    },
  },
  {
    code: "LEMNON",
    name: "コードレムノン",
    rider: {
      text: "仮面ライダーG4",
      lines: "32026",
    },
    note: {
      text: "重厚な装甲に身を包み、大刀を肩に担いだドルミネンスの切り札的エージェント。――コードレムノンこと仮面ライダーG4。その構え一つに、圧倒的な戦闘技術と武闘派としての威圧感が凝縮されている。",
      lines: "32026,32041",
    },
    line: {
      by: "レムノン（G4）",
      text: "俺はレムノン。お前を殺す悪夢の名前だ",
      lines: "35376",
    },
  },
  {
    code: "UNKNOWN",
    name: "コードアンノウン",
    rider: {
      text: "仮面ライダーミラージュアギト",
      lines: "45848",
    },
    note: {
      text: "黄金の光が収束したそこに立っていたのは、アギトでありながらアギトではない、白銀の外骨格と、ボロボロのマフラーを背負った最凶の処刑者――仮面ライダーミラージュアギト。",
      lines: "45848",
    },
    line: {
      by: "仮面ライダーミラージュアギト",
      text: "やはり弱いな、人間は",
      lines: "45875",
    },
  },
  {
    code: "FERIER",
    name: "コードフェリアー",
    rider: {
      text: "仮面ライダーメタルビルド／マッドローグ",
      lines: "34654,37014",
    },
    note: {
      text: "ドルミネンスの投下した生物兵器こと『コードフェリアー』。",
      lines: "31834",
    },
    line: {
      by: "コードフェリアー",
      text: "おじさん，バカなの?そんなドスで僕を倒せる訳がないじゃん！",
      lines: "31937",
    },
  },
  {
    code: "WILD",
    name: "コードワイルド",
    rider: {
      text: "仮面ライダールシファー",
      lines: "36039",
    },
    note: {
      text: "彼はタロットカードに酷似したペルソナカードを指先で弄び、背後にすべてを貪り尽くす魔王『アバドン』の巨大な幻影を出現させていた。骸骨を模った新たな仮面ライダー。",
      lines: "36041,36116",
    },
    line: {
      by: "ルシファー（ワイルド）",
      text: "さっきまでの威勢はどうした\n諦めろ。認知の歪みを操れる以上、お前らに勝ち目はない",
      lines: "36036,36090",
    },
  },
] as const;

export const DREAM_RECORD_SUPPLEMENT: DreamArchiveTable<readonly DreamArchivePassage[]> = {
  行動: [
    {
      text: "ドルミネンスは、既に目的の為なら手段を選ばなくなり始めている。",
      lines: "18256",
    },
    {
      by: "ネル",
      text: "ドルミネンスは仲良しクラブじゃない\n命を懸けられない敗者に、価値なんて無いの",
      lines: "25519,25521",
    },
  ],
  目的: [
    {
      by: "八坂神奈子",
      text: "連中は明らかに目的を持って動いている\n人里を壊し、戦力を消耗させ、それでも止まらない\nまるで何かを探しているみたいだ",
      lines: "28636,28638,28640",
    },
  ],
};

export const DREAM_FACTION_SUPPLEMENT: DreamArchiveTable<DreamFactionSupplement> = {
  hoyoshi: {
    statements: [
      {
        text: "話を聞く限り、縫妖師に関しては第三の戦力と見て良いだろう。",
        lines: "28424",
      },
      {
        by: "如月狡",
        text: "やあ、お邪魔するよ。僕の能力に驚いたかい？ ……単刀直入に言おう。君たちの目的がこの幻想郷の支配や破壊にあるのなら、僕たちと協力し合わないかい？",
        lines: "43011",
      },
    ],
    members: [
      {
        name: "藍天",
        note: {
          text: "漢服をまとい、冷徹な青い髪を揺らす縫妖師の幹部、藍天。",
          lines: "45380",
        },
      },
      {
        name: "フェイト・スカーレット",
        note: {
          text: "縫妖師の幹部の1人――フェイト・スカーレット。\n別世界の紅魔館の当主",
          lines: "44899-44901",
        },
      },
    ],
    memberNotes: {
      如月狡: {
        text: "元は別世界の幻想郷の賢者でありながら、ただの暇つぶしで世界を裏切り、滅ぼした邪悪の化身。",
        lines: "43005",
      },
    },
  },
  "nagamori-gumi": {
    statements: [
      {
        by: "永守荘司",
        text: "ウチは極道だ\nだが、“仁義”だけは通す",
        lines: "12153,12159",
      },
      {
        by: "永守荘司",
        text: "人里に牙向ける奴ァ、結局いつも同じだ\n化け物だろうが、人間だろうがな",
        lines: "12437,12439",
      },
    ],
    paragraphs: [
      {
        text: "刀。弓矢。鉄パイプ。それぞれ武器を握り締め、壊れた部屋へ突入してくる。誰も彼も血塗れで、煤だらけで、それでも動きを止めない。",
        lines: "19669-19671,23888",
      },
      {
        text: "元は人里の住人であるが故に、彼らは一線を越えない。伴蔵は刀の『峰』を正確に返し、襲いかかるギルアギトたちの急所を峰打ちで叩き割って気絶させていく。\n他の組員たちもまた、各々の武器や極めた喧嘩技術を駆使し、ドーパントや怪物の軍勢を死なせない絶妙な加減で圧倒し、戦線を維持し始めた。",
        lines: "45779-45781",
      },
    ],
  },
};

export const DREAM_DOSSIER_SUPPLEMENT: DreamArchiveTable<
  readonly DreamArchivePassage[],
  DreamCharacter["id"] | DreamDolminence["id"]
> = {
  ciel: [
    {
      text: "反省はしているだろうが、彼は極端に淡白な人間だ。正義を振り翳す暴力装置にはなれど、誰かに寄り添うヒーローにはなれなかったし、これからもなってはいけないのだ。",
      lines: "6717-6718",
    },
    {
      text: "陰気な彼は人見知り。\n初見の相手や、面識の少ない相手に対しては失言を言ってしまう事が良くある口下手且つ不器用。",
      lines: "42282-42283",
    },
    {
      text: "普段、深い紅色の右目を覆い隠している髪",
      lines: "32271",
    },
    {
      segments: [
        {
          by: "シエル",
          text: "「……！コンビニ弁当よりも美味ぇ」",
        },
        {
          text: "誇張抜きに、今まで彼はコンビニの食事を主に摂取しており、ここまで真っ当な食事も初めて、と言うわけだ。",
        },
      ],
      lines: "12778,12780",
    },
  ],
  keiya: [
    {
      text: "彼は雷が最も得意な属性だから雷による攻撃はほとんど効いていない。彼は半神と成って以降、身体的ダメージが蓄積されるごとにそれに抵抗する様に身体が作り変わり攻撃に対する耐性が付いていく、魔法然り物理然りその全てにおいて",
      lines: "2375,2378",
    },
    {
      text: "彼の傷は時間が巻き戻るように、癒えていく。臓腑は体内に戻り筋肉が再構築される。いわば筋トレ後の超回復、彼は攻撃により怪我を負う度にその部分の硬度が上昇し受けたダメージ以下の攻撃を通さなくなる",
      lines: "5299",
    },
    {
      text: "拳で分かり合えた時こそ真の和解だ、だから彼は鬼であろうと巫女であろうと神であろうと求められれば拳で応じる、それこそが敬意だからだ",
      lines: "22807",
    },
    {
      text: "山そのものと繋がるような神気の流れ。風の質。歩き方。呼吸。どれもが異質だ。だが同時に、“人間”でもある。矛盾した存在感。",
      lines: "21298-21302",
    },
    {
      text: "この格好はそれこそ神職、神主というよりは宮司に近いだろうか",
      lines: "15208",
    },
  ],
  kaisaku: [
    {
      text: "くるくるとした天然パーマは乱れ、額には乾ききっていない汗が残っている。眼鏡の奥の目は落ち着かず、けれど視線は逸らさない。",
      lines: "3385-3386",
    },
    {
      text: "「僕の名は怪作、人里で探偵を生業としているしがない人間だけど助けてくれた分、僕も君たちの力になりたいと思ってる」「だからこそお願いだ、僕を連れて行ってくれ」",
      lines: "3571-3573",
    },
    {
      text: "「この幻想郷に訪れるまでは僕は外の世界にいた。生憎，記憶喪失の僕はそれしか覚えてないんだ」",
      lines: "6856",
    },
    {
      text: "暁慶弥を見捉える彼の瞳は真っ直ぐで眩しいほどの純粋な黄金色であった。",
      lines: "3948",
    },
  ],
  "lord-knight": [
    {
      by: "サヨ",
      text: "「『コードナンバー1』。その数字を冠する男だけは、他のエージェントと比べても完全に別格。ただそこにいるだけで周囲の空気が歪むような、文字通りの化物よ」",
      lines: "40605",
    },
  ],
  "lord-chaos": [
    {
      text: "円卓の少し離れた席では、赤髪の男――コードケイオスが不機嫌そうに鼻を鳴らした。",
      lines: "42958",
    },
    {
      text: "ロードケイオスは胸元の『ロードインヴォーカー』に金色のカオスカプセムを装填すると、ポンプ状のレバー『インヴォークイジェクター』を力強く押し込んだ。\n「……『擬装』」\n手動でカプセムを回転させると、彼を中心に透明な試験管状のエフェクトが顕現。内部を満たす赤色の特殊ゲルと紫の蝶の群れがミッションスーツを生成し、直後に走ったドローンのレーザー光が全身の金色ラインを瞬時に刻み込む。刹那。パンッ――！！と試験管のエフェクトが砕け散ると同時に、完全な戦士としての姿へと変貌を遂げたロードケイオスは、手にしたブレイカムブレイカーを構え、鬼や妖怪たちへ向けて煽るように手招きしてみせた。",
      lines: "49963,49977-49982",
    },
  ],
  dread: [
    {
      text: "黒いコート。鋭い目付き。そして腰にぶら下がった禍々しいドライバー。濡れたみたいな黒髪が影を落とし、その目だけが異様に鋭い。",
      lines: "14114-14118,14137",
    },
    {
      text: "【レプリゲキオコプター】カードを認証、装填した状態でドレッドライバーのレバーを倒し、再び起こすことにより必殺技を発動。数多のミサイルを生成し、それらをシエルと暁、両者共々に正確に追尾式弾道弾として一斉放射。",
      lines: "4478,4481-4483",
    },
    {
      text: "【バレッドバーン】レバーを倒し、引き上げる。二丁拳銃。――ブラッディーBB。一発一発が重い。だが連射は速い。吐き出される弾丸はただの弾ではない。着弾と同時に内部から焼き裂くようなエネルギーを孕み、衝突の瞬間に“爆ぜる”性質を持つ。",
      lines: "5411-5414,5422-5424,5439",
    },
  ],
  lupin: [
    {
      text: "派手な赤のアンダースーツに黄金の装飾。怪盗のような奇抜な外見をした仮面ライダー。仮面ライダールパン。コードナンバー24。彼女だけが、他三人と違い。どこか落ち着いた様子でその場を収める。",
      lines: "18207-18211,18219",
    },
    {
      text: "彼女はルパンガンナーを取り出すと、その銃口を自らの身体へと強く押し込む。\n「……変身！」\n【ルパン！】\n眩い光と共に怪盗の甲冑を纏い、仮面ライダールパンへと変身を遂げ、ブレードパーツをブレイクガンナーに装填。【チューン・ルパンブレード！】",
      lines: "50056-50068",
    },
  ],
};
