export const DREAM_POSTERS = [
  {
    src: "/dream-chapter-poster-01.jpeg",
    width: 1126,
    height: 1397,
    position: "50% 35%",
    fit: "cover",
    alt: "金と黒の装甲をまとい手を伸ばすディルクルムサーガ",
  },
  {
    src: "/dream-chapter-poster-02.jpeg",
    width: 1024,
    height: 1536,
    position: "50% 30%",
    fit: "cover",
    alt: "紅い力を掌へ集める黒銀の戦士",
  },
  {
    src: "/dream-chapter-poster-03.jpeg",
    width: 1448,
    height: 1086,
    position: "50% 50%",
    fit: "contain",
    alt: "豪雨の森で紫紺の装甲をまとい突進する戦士",
  },
  {
    src: "/dream-chapter-poster-04.jpeg",
    width: 1448,
    height: 1086,
    position: "50% 50%",
    fit: "contain",
    alt: "青白い光に包まれた森に立つ黒髪の青年",
  },
  {
    src: "/dream-chapter-poster-05.jpeg",
    width: 1448,
    height: 1086,
    position: "50% 50%",
    fit: "contain",
    alt: "竹林を望む古民家の窓辺に佇む銀髪の人物",
  },
  {
    src: "/dream-chapter-poster-06.jpeg",
    width: 1086,
    height: 1448,
    position: "50% 38%",
    fit: "cover",
    alt: "虹色の炎を胸に抱える黒髪の青年",
  },
  {
    src: "/dream-chapter-poster-07.jpeg",
    width: 1024,
    height: 1535,
    position: "50% 42%",
    fit: "cover",
    alt: "崩壊する街を踏み越える青金の仮面ライダー",
  },
  {
    src: "/dream-chapter-poster-08.jpeg",
    width: 1086,
    height: 1448,
    position: "50% 32%",
    fit: "cover",
    alt: "紅い光を宿した青紫のヴェール姿の存在",
  },
] as const;

export const DREAM_CASES = [
  { no: "0", title: "交わる", reading: "INTERSECT" },
  { no: "1", title: "開く", reading: "OPEN" },
  { no: "2", title: "開ける", reading: "UNLOCK" },
  { no: "3", title: "明ける", reading: "DAWN" },
  { no: "4", title: "来たる", reading: "ARRIVAL" },
  { no: "5", title: "叛く", reading: "REVOLT" },
] as const;

export type DossierSection = {
  title: string;
  lead?: string;
  paragraphs?: readonly string[];
  items?: readonly { name: string; body: string }[];
};

export type DreamCharacter = {
  id: "ciel" | "keiya" | "kaisaku";
  order: string;
  name: string;
  roman: string;
  role: string;
  tagline: string;
  portrait: string;
  portraitAlt: string;
  portraitPosition: string;
  secondary?: string;
  secondaryAlt?: string;
  secondaryPosition?: string;
  accent: string;
  profile: readonly { label: string; value: string }[];
  quotes?: readonly string[];
  sections: readonly DossierSection[];
};

export const DREAM_CHARACTERS: readonly DreamCharacter[] = [
  {
    id: "ciel",
    order: "01",
    name: "シエル",
    roman: "CIEL",
    role: "仮面ライダーディルクルムサーガ",
    tagline: "究極のサーガ",
    portrait: "/dream-chapter-ciel.jpeg",
    portraitAlt: "黒いフーディーをまとったシエル",
    portraitPosition: "50% 15%",
    secondary: "/dream-chapter-diluculum.jpeg",
    secondaryAlt: "仮面ライダーディルクルムサーガ",
    secondaryPosition: "50% 22%",
    accent: "#ffae2b",
    profile: [
      { label: "FORM", value: "仮面ライダーディルクルムサーガ" },
      { label: "HEIGHT", value: "225.8cm（est.）" },
      { label: "WEIGHT", value: "8888.8t（est.）" },
      { label: "PUNCH", value: "100.5t（est.）" },
      { label: "KICK", value: "178.8t（est.）" },
      { label: "GIGANTIM", value: "50000Kt（est.）" },
      { label: "JUMP", value: "151.0m（est.）" },
      { label: "RUN", value: "0.4s / 100m（est.）" },
      { label: "FLIGHT", value: "マッハ88（est.）" },
      { label: "EMP", value: "無制限" },
    ],
    sections: [
      {
        title: "変身シークエンス",
        lead: "DILUCULUM！！ / Arise…Arise…！ / Rollout（Ascendance…）！ / MAXIMIZE！RIDER！ / DILUCULUM！！ / SA-GA…！SA-GA…！SA-GA……！",
        paragraphs: [
          "演算：3000TOPS / 200Core『URANUS X』、アクセラレータ『TAMAYURA X』。第二演算系は60000TOPS / 300Core『URANUS Z Extreme』、アクセラレータ『TAMAYURA Z Extreme』及び『Paranormal Realizer』を搭載する。",
        ],
      },
      {
        title: "概要",
        paragraphs: [
          "『マキャベルゴアナイトメア』と融合したシエルが『サーガドライバー』と二基の『クリスタルコア』で変身した、仮面ライダーサーガの究極フォーム。ドライバーのリベレーター操作に連動して多重クリフォードトーラスを発生させ、超多次元的エネルギーを取り出す。回転機構『ビスタラム』は内部にあり、従来と同じ操作で変身できる。",
          "シエルが夢に想い描いたΛ-CDMモデルを基礎とする真空エネルギー論、量子場理論、形而的超宇宙開発理論を統合した超位相工学体系が、明晰夢とマキャベルゴアナイトメアの究極の創造によって実体化した。『拒絶の究極の悪夢』と『暁闇の究極の悪夢』という二つの同源の力を保持し、同源存在へ圧倒的な強制力を持つ。",
          "多重クリフォードトーラスは力の発生源ではなく、本来なら現実へ降ろすことさえ不可能な究極悪夢を、肉体と装甲が扱える形へ整流する緩衝輪である。その深層には、始点と終点、内側と外側、夢と現実、夜と暁を固定せず変形し続ける非可換夢界多様体『ディルクルム・アビサルフレーム』が形成される。",
          "この構造における『拒絶』は、外部干渉を弾く防御ではなく、存在・概念・能力・現象が現実へ出力される直前の許可層へ作用する根源処理である。『暁闇』は夜が終わる直前と光が生じる直前を同時に含み、悪夢が悪夢として成立する最後の瞬間を捕捉する。",
          "クリスタルコア内部では夢エネルギーとダークマターエネルギーを量子コヒーレント状態として保持し、『ビスタラム』が夢界粒子、暗黒物質由来の重力的揺らぎ、真空零点エネルギーを同一位相面へ同期させる。変身者の肉体と装甲はマクロ量子コヒーレント状態へ遷移し、崩壊やデコヒーレンスを回避しながら超多次元的エネルギーを戦闘出力へ変換する。",
          "量子もつれ状態にある夢界情報をリアルタイムで参照し、神経伝達、筋収縮、装甲応答、ギガンティムの砲撃制御を同期するため、意思決定から行動までの遅延は極限まで軽減される。攻撃、防御、回避、砲撃、分離処理がほぼ同時に成立する。",
        ],
      },
      {
        title: "戦闘力と装甲",
        paragraphs: [
          "ディルクルムサーガは、従来の最強到達点であったヴァーテックスを総合性能、継戦能力、耐久性、干渉範囲の全てで上回る。インテグラルの一撃到達型の決定力と、ヴァーテックスの高速制圧型の継戦性能を、悪夢の力と夢界干渉によって別次元へ押し上げた形態である。",
          "『DILUCULUM』による拒絶、『ギガンティム』による超高出力砲撃、ダークマターエネルギーによる増幅、クリスタルコアによる夢と現実の識別により、防御、再生、現実改変、精神干渉、概念防御へ同時に作用する。命中した対象には肉体損傷と同時に夢界粒子、精神構造、位相情報への干渉が発生し、再生対象そのものを分離・拒絶する。",
          "基礎スペックは通常出力時の推定値に過ぎず、実戦では『DARK MATTER CHARGING』と位相増幅によって瞬間出力が大きく超過する。物理攻撃には観測位相偽装が適用され、敵の認識上では必殺技級の一撃さえ『ただのパンチ』として処理される場合がある。",
          "『ディルクルムクリスタル』と『エンハンスドグドメアナイト』の多重層装甲は、鋼鉄の1300倍以上の耐久性を持ち、超新星爆発級の負荷、夢界干渉、光学攻撃、精神侵食へ高い耐性を示す。現実側で観測される8888.8t級の重量は素材質量ではなく、夢界深層との接続で生じる位相質量であり、微小浮遊場によって地形への破壊を抑制する。",
          "装甲表層の位相固定層は、概念改変、性質上書き、存在定義の変更を検知し、『クリスタルコア』と『Paranormal Realizer』で本来の装甲として再定義する。貫通判定が成立した場合も損傷経路と攻撃概念を分離し、再結合機能で損傷位相を閉塞する。ただし相手の規模や権限階層が大きく上回る場合、解析と再固定に一瞬の遅延が生じ得る。",
          "ナイトメアとの融合により稼働時間の制限は大幅に緩和されたが、完全な無制限運用ではない。長時間の過剰使用後には覚醒と睡眠の境界が不安定化し、変身解除後に疑似ナルコレプシー様の反跳現象が発生する可能性がある。",
        ],
      },
      {
        title: "能力",
        items: [
          {
            name: "通常攻撃",
            body: "パンチを例に、蹴撃や斬撃を含む砲撃以外の近接物理攻撃全般は『フィナーレパニッシュ』を遥かに上回る出力を持つ。ダークマターエネルギーによる観測位相偽装で、敵の認識上では単純な通常攻撃として処理され、防御演算や回避予測を遅延させる。",
          },
          {
            name: "DARK MATTER CHARGING",
            body: "宇宙や夢に混在するダークマターエネルギーを吸収・集積し、負荷を掛けず全機能を高性能化する。臨界状態では夢界粒子とダークマターエネルギーが同一位相で励起され、通常攻撃にも『DILUCULUM』の拒絶作用が付与される。",
          },
          {
            name: "拒絶",
            body: "より強力な『拒絶の究極の悪夢』。同格以下の相手が行動する前であれば、成立に必要な前提条件へ干渉し、攻撃、回避、再生、現実改変を『行われなかったもの』として剥離する。損傷時には侵入した攻撃概念や夢界汚染を分離してから本来の装甲だけを再固定する。",
          },
          {
            name: "CRYSTAL",
            body: "明晰夢を介して他者の夢へ侵入し、無制限に改変する。『Paranormal Realizer』によって競合対象より優先的に実行され、悪夢と夢の性質を見抜き、変身者が望む未来に近い結果へ潜在意識をリライトする。",
          },
          {
            name: "ギガンティム",
            body: "両肩に存在する二基の大型砲撃ユニット。次元格納技術によりショートバレル相当の外形にロングバレル級の内部空間を持ち、有効射程は8光年。最大100次元まで対応し、夢の概念防御や現実改変を越えてダメージを与える。最大温度は約10兆度、最大連射速度は毎分5800発。",
          },
          {
            name: "DILUCULUM",
            body: "『暁闇の究極の悪夢』。悪夢を浄化し、夢と存在を正しく分離する。侵食対象からナイトメアを抽出して本来の精神へ修復し、ブラックケースでは地球を一時的に4〜200次元上へベクタライズし、物理的な夜の概念を消失させる。再使用時には相手を自身の超深層心理へ強制的に誘い込む。",
          },
        ],
      },
      {
        title: "追加武装",
        lead: "フェイタルエッジ / レルムスレイヤー / アクシスレイカー",
      },
      {
        title: "必殺技",
        items: [
          {
            name: "ハイグリーム",
            body: "『CHARGE 1・2・3！』『SHINING！』。ユナイトエッジへ指向性と数十倍の出力を与える強斬撃。脳幹へ作用する特殊粒子をまとい、初撃を耐えられた場合は次元削減によって相手へ最適化した一撃を続ける。",
          },
          {
            name: "トリニティバン",
            body: "『Trinity Crystal！』『CHARGE 1・2・3！』『Trinity Bang！』。任意の三つのコアを三重共鳴させ、夢・現実・深層心理の境界を一時的に崩壊させる三重融合型超必殺斬撃。",
          },
          {
            name: "ディルクルムバン",
            body: "『Diluculum Crystal SET！』『CHARGE 1・2・3！』『Diluculum Bang！』。夢エネルギー、ダークマターエネルギー、『DILUCULUM』を一点へ収束し、対象の位相情報、精神構造、存在基盤を崩壊させる。最期には美しい暁闇の塵へ変える。",
          },
          {
            name: "ディルクルム・フィニッシャー",
            body: "『DARK MATTER CHARGING…』『Diluculum Finisher！』。ギガンティムの出力を最低50000Mt（est.）まで上げ、熱、夢、四つの『8』を破壊光線として放つ。悪夢を根本から拒絶し、理論上は超大型ブラックホールを超越する疑似質量を伴い、応用によって宇宙生成も可能。",
          },
          {
            name: "プライドエスター",
            body: "『DARK MATTER CHARGING…』『Pride Ester！』。夜明けと黄昏の力を白銀の陽光として脚部へ収束し、ギガンティムを足先へ再構成する。空間を湾曲させ距離を消失させるライダーキックで、ナイトメアには確定的な即死効果を持つ。",
          },
          {
            name: "クリスタルディバインストライク",
            body: "『ULTIMATTER CHARGING…』『Crystal Divine Strike！』。二つの究極の悪夢を白銀の神性光として集約し、肉体、装甲、精神、夢界接続、再生機構、概念防御へ同時干渉する最高位のライダーキック。",
          },
        ],
      },
    ],
  },
  {
    id: "keiya",
    order: "02",
    name: "東風谷 慶弥",
    roman: "KEIYA KOCHIYA",
    role: "紅魔の執事 / 夜明守護命",
    tagline: "理解し、護り、やがて忘れる神",
    portrait: "/dream-chapter-keiya.jpeg",
    portraitAlt: "白いシャツと黒いジャケットをまとった東風谷慶弥",
    portraitPosition: "50% 16%",
    secondary: "/dream-chapter-keiya-awakened.jpeg",
    secondaryAlt: "青白い神力を解放した東風谷慶弥",
    secondaryPosition: "50% 18%",
    accent: "#77a9ff",
    profile: [
      { label: "NAME", value: "東風谷 慶弥（暁慶弥）" },
      { label: "READING", value: "こちや けいや" },
      { label: "AGE", value: "23歳" },
      { label: "RACE", value: "半人半神" },
      { label: "HEIGHT", value: "186.4cm" },
      { label: "WEIGHT", value: "78.7kg" },
      { label: "ABILITY", value: "理解する程度の能力" },
      { label: "TITLE", value: "紅魔の執事" },
      { label: "FIRST PERSON", value: "俺 / 私" },
      { label: "SECOND PERSON", value: "お前 / 貴方" },
    ],
    sections: [
      {
        title: "人物",
        paragraphs: [
          "冷静で物腰が柔らかく、闘うこと自体を好む。命のやり取りではなく、組手のように互いの技を確かめる戦いを特に好む。楽に美味しく作れる料理と甘味を好み、ピーマンやゴーヤなどの苦いものを苦手とする。",
          "元は捨て子で、二歳の頃に紅魔館へ拾われた。四歳からレミリアに仕え、執事兼メイド統括として働く。統率の実務は咲夜へ任せているが、紅魔館への忠誠心は高い。紅美鈴、パチュリー・ノーレッジ、茨木華扇の三人へ順に師事した。",
          "今までに食べたパンの枚数は3867枚。全属性の魔法適性を持ち、雷を最も得意とする。夜には極端に弱く、日が落ちると死んだように眠り、朝を待つか頭へ強い衝撃を与えなければ起きない。",
          "ある事件の後に東風谷早苗と結婚し、東風谷姓を名乗る。結婚後は年々感性が豊かになり、笑顔が増えた。早苗へ深く惚れ込み、生後半年の双子を育てる二児の父でもある。東西南北をまったく把握できないほどの方向音痴。",
        ],
      },
      {
        title: "理解する程度の能力",
        paragraphs: [
          "物事の詳細、構造、道具の使用方法を含む全ての事柄を理解する能力。応用すれば相手の能力をコピーすることもできる。能力行使の代償については、現在の資料では未記録。",
          "戦闘では素手と投げナイフを主軸とし、状況に応じて複数のバトルスタイルを切り替える。",
        ],
      },
      {
        title: "バトルスタイル",
        items: [
          {
            name: "吸血鬼の懐刀",
            body: "紅魔館で見て盗んだ戦い方。咲夜の投げナイフ、レミリアの槍術などを組み合わせ、近距離から中距離まで対応する。火力不足が慢性的な弱点で、三つの力のいずれかを解放すると紅いオーラをまとう。",
          },
          {
            name: "拳闘士",
            body: "美鈴直伝の中国拳法。手数、速度、破壊力を兼ね、青龍刀、三節棍、棒術など長物も扱う。攻撃後の隙がやや大きく、気力解放時には緑がかった黄色のオーラをまとう。",
          },
          {
            name: "ウィザード",
            body: "パチュリーから学んだ全属性魔法を操り、得意な雷を主軸に戦う。固有魔法の詠唱中には必ず隙が生じ、魔力解放時は青いオーラをまとう。",
          },
          {
            name: "複合スタイル",
            body: "二つ以上のスタイルを同時に扱い、それぞれの利点を重ねて戦う。本人以外では紅魔館の者たちと華扇だけが存在を知り、彼らも全ての組み合わせを把握してはいない。",
          },
          {
            name: "紅魔の拳闘者",
            body: "吸血鬼の懐刀と拳闘士を複合。蹴りの予備動作からナイフを放ち、投擲姿勢から蹴撃へ繋ぐなど、相手の予測を崩す。気力または魔力を解放するとオレンジのオーラをまとう。",
          },
          {
            name: "深紅の魔術師",
            body: "吸血鬼の懐刀の構えを基礎に、武器や手へ属性を付与し、身体強化を重ねる。紅紫色のオーラをまとう。",
          },
          {
            name: "魔闘士",
            body: "拳闘士とウィザードを複合。魔法による身体強化、連打終端への魔法射撃など応用力が高く、深緑色のオーラをまとう。",
          },
          {
            name: "紅魔の執事",
            body: "三つの基本スタイル全てを統合。懐刀の対応力、拳闘士の破壊力と手数、ウィザードの火力補助を隙なく併せ持つ完全なスタイル。紅黒いオーラをまとう。",
          },
        ],
      },
      {
        title: "固有魔法・焔雷",
        lead: "雷鳴轟き黒雲を断つ / 焔嗟犇めき地を穿つ / さらば地上の楽園",
        paragraphs: [
          "火属性と雷属性を重ねる固有魔法。設置型の地雷として使うほか、拳へまとわせ、殴打と同時に爆発させることができる。",
        ],
      },
      {
        title: "力のねじれ",
        items: [
          {
            name: "魔力ねじれ",
            body: "意図的には発動できない魔力暴走。見た目を変えず性質の異なる魔法へ変換し、火球が電雷へ変わる、火球が火炎放射級へ増幅されるなど、性質と威力が変化する。",
          },
          {
            name: "霊力ねじれ",
            body: "意図的には発動できない霊力暴走。生命力を直接変換し、術の効果を底上げする。",
          },
          {
            name: "気力ねじれ",
            body: "意図的に発動可能。精神力と心肺機能を増強し、身体能力を上昇させる。",
          },
          {
            name: "神力ねじれ",
            body: "他世界の神を肉体へ強制顕現させ、調伏して力を奪う。記憶力に応じた数をストックできるが、本人が好まないため現在のストック数は0。",
          },
          {
            name: "神力解放・紅",
            body: "レミリア・スカーレットの血を取り入れた結果、真祖の吸血鬼の魔力と神力を同時に扱う。白金色が紅へ染め上げられたオーラを放つ。",
          },
        ],
      },
      {
        title: "完全神化・夜明守護命",
        paragraphs: [
          "半人半神の枠を超え、八百万の一柱として完全顕現した姿。神名は『夜明守護命（ヨアケマモリノミコト）』。指定した相手が受けた痛みと身体損傷、仮面ライダーへの変身負荷、技の自傷効果まで肩代わりでき、その損傷によって死ぬことはない。",
          "四肢を失っても即座に再生し、傷を受けた回数xに対して強度上昇割合y=2^xで強化される。同一手段による攻撃が七回を超えると完全耐性を獲得する。神力で強化された『焔雷・暁天穿』は設置、拳への付与、時限、射出へ切り替えられ、射出は単発と秒間六発の連射を使い分ける。",
          "神の血によって苦手属性だった風を克服し、魂が二つになったことで実質的な不死を得た。輸血時にはどの血液型とも合致し、進化した理解の能力により、武、風、理解の神として八百万へ名を連ねる。",
          "代償として、完全神化を行うたび『人として生きた事実』が慶弥の中から消えていく。大切な場所、思い出、他人に例外はない。神としての彼は記憶の消失へ何も感じられず、護る者のための姿でありながら、護るべきものは本人の認識から姿を消す。護られる側だけが忘れずに残される。",
        ],
      },
    ],
  },
  {
    id: "kaisaku",
    order: "03",
    name: "怪作",
    roman: "KAISAKU",
    role: "幻想郷の夢 / 夢主",
    tagline: "アルフィクトのなり損ない",
    portrait: "/dream-chapter-kaisaku.jpeg",
    portraitAlt: "眼鏡をかけ黒いスーツをまとった怪作",
    portraitPosition: "50% 34%",
    accent: "#bcc8c9",
    profile: [
      { label: "NAME", value: "怪作" },
      { label: "ROLE", value: "『幻想郷の夢』の夢主" },
      { label: "STATUS", value: "アルフィクトのなり損ない" },
    ],
    sections: [
      {
        title: "人物記録",
        paragraphs: [
          "物語の舞台となる『幻想郷の夢』の夢主。アルフィクトへ至ることのできなかった『アルフィクトのなり損ない』でもある。所属、年齢、能力を含むそれ以外の詳細は、現時点の資料では未記録である。",
        ],
      },
    ],
  },
] as const;

export type DreamDolminence = {
  id: "lord-knight" | "lord-chaos" | "dread" | "lupin";
  order: string;
  name: string;
  roman: string;
  agent: string;
  image: string;
  imageAlt: string;
  imagePosition: string;
  imageWidth: number;
  imageHeight: number;
  secondary?: string;
  secondaryAlt?: string;
  secondaryPosition?: string;
  secondaryWidth?: number;
  secondaryHeight?: number;
  accent: string;
  profile: readonly { label: string; value: string }[];
  paragraphs: readonly string[];
  items: readonly { name: string; body: string }[];
};

export const DREAM_DOLMINENCE: readonly DreamDolminence[] = [
  {
    id: "lord-knight",
    order: "01",
    name: "ロードナイト",
    roman: "LOAD KNIGHT",
    agent: "コードナンバー：ワン",
    image: "/dream-chapter-lord-knight.jpeg",
    imageAlt: "黒と深紅の装甲と漆黒のケープをまとったロードナイト",
    imagePosition: "50% 28%",
    imageWidth: 1024,
    imageHeight: 1280,
    accent: "#df243f",
    profile: [
      { label: "HEIGHT", value: "203.0cm（est.）" },
      { label: "WEIGHT", value: "78.8kg（est.）" },
      { label: "PUNCH", value: "130.0t（est.）" },
      { label: "KICK", value: "166.6t（est.）" },
      { label: "JUMP", value: "計測不能" },
      { label: "RUN", value: "0.3秒（100m est.）" },
      {
        label: "FINISHER",
        value: "ダークネスエクスキューション / バーディクトダークネスエクスキューション",
      },
    ],
    paragraphs: [
      "『ドルミネンス』のエージェント、コードナンバー：ワンが、ロードインヴォーカーへロードダークネスカプセムを装填して擬装した姿。ナイトシステムを遥かに凌駕する身体性能と、夢と現実の双方へ適応する諜報能力を併せ持つ。",
      "装着者の素性と行動記録を徹底して秘匿しながら、周辺環境、通信、夢界情報を収集し、任務遂行に必要な判断と戦闘へ即座に反映する。擬装に伴う精神・肉体への負荷が限界へ達した場合は、装着者を保護するため強制解除が実行される。",
    ],
    items: [
      {
        name: "ロードヘッド",
        body: "ロードナイトの頭部。諜報、視覚、記録、呼吸保護を担う各装置を統合し、擬装者の任務遂行を支える。",
      },
      {
        name: "ハイエンドシギントリンカー",
        body: "通信、電磁波、各種信号を傍受して諜報活動と周辺環境の情報収集を行う。インヴォークロードシステムにより夢と現実の双方で情報を共有し、要望に応じて量子世界から次元の先まで見通す、夢へ最適化された視覚野を得る。",
      },
      {
        name: "ロードオプチカル",
        body: "装着者の眼を保護し、複数のフィルタリングで可視光を調整する視覚装置。悪夢との融合で特殊な波動を発生させ、対象への反応速度を異常な領域まで高め、夢や悪夢の本質を瞬時に見極める。",
      },
      {
        name: "ロードミッションログ",
        body: "作戦行動の詳細ログを随時記録する機能をあえて廃止し、情報攻撃に対する秘匿性を向上させた記録装置。装着者の精神的・肉体的ダメージを監視し、一定値を超えると擬装を強制解除する。",
      },
      {
        name: "ロードジョーガード",
        body: "装着者の素性を隠すボイスチェンジ機能を備える。特殊多重フィルターによる濃酸素吸入で疲労回復、集中力、判断力、睡眠の質を向上させ、悪夢環境の異質物に対する抗体を瞬時に生成して心身への重大な影響を抑える。",
      },
      {
        name: "ロードインヴォーカー",
        body: "インヴォークロードシステムの発動器。装填したロードダークネスカプセムの力を利用し、ロードナイトへの擬装を可能にする。",
      },
      {
        name: "ロードアーム",
        body: "装着者の身体能力を限界値以上へ引き出す腕部。付帯可変武器『ブレイカムブレイカー』の全モードと相乗効果を発揮する。",
      },
      {
        name: "ロードレッグ",
        body: "装着者の身体能力を限界値以上へ引き出し、特に近接格闘術で高い性能を発揮する脚部。ダークネスカプセム固有の特殊攻撃も発動できる。",
      },
      {
        name: "ロードゲルダンパー",
        body: "内部の特殊ゲルが擬装時に生じる精神と肉体への激しい負荷を緩和し、装着者の負担を軽減する。これによりナイトシステムを遥かに凌駕する性能を引き出す。",
      },
      {
        name: "アンノウンケープ",
        body: "ロードナイトのカスタム装備。カプセムの固有能力を波及させるエネルギーフィールドを周囲へ展開し、一定領域への支配力を高める。",
      },
      {
        name: "ロードガウム",
        body: "装着者を包んで素性を秘匿するミッションスーツ。ロードインヴォーカーからのエネルギーで身体機能と明晰夢の力を限界値以上へ増強し、あらゆる局面での任務遂行を揺るぎないものとする。",
      },
    ],
  },
  {
    id: "lord-chaos",
    order: "02",
    name: "ロードケイオス",
    roman: "LORD CHAOS",
    agent: "コード：ケイオス",
    image: "/dream-chapter-lord-chaos.jpeg",
    imageAlt: "赤金の装甲をまとった擬似ライダー、ロードケイオス",
    imagePosition: "50% 26%",
    imageWidth: 960,
    imageHeight: 1280,
    secondary: "/dream-chapter-lord-chaos-spec.jpeg",
    secondaryAlt: "ロードケイオスの全身図と装備資料",
    secondaryPosition: "50% 18%",
    secondaryWidth: 960,
    secondaryHeight: 1280,
    accent: "#ef482e",
    profile: [
      { label: "DEVICE", value: "ロードインヴォーカー" },
      { label: "CAPSEM", value: "金のカオスカプセム" },
      { label: "HEIGHT", value: "199.5cm（est.）" },
      { label: "WEIGHT", value: "83.2kg（est.）" },
      { label: "PUNCH", value: "19.6t（est.）" },
      { label: "KICK", value: "44.4t（est.）" },
      { label: "JUMP", value: "26.4m（ひと跳び est.）" },
      { label: "RUN", value: "1.5秒（100m est.）" },
      { label: "FINISHER", value: "ナイトメアエクスキューション" },
    ],
    paragraphs: [
      "コード：ケイオスが『ロードインヴォーカー』へ金の『カオスカプセム』を装填して擬装した姿。赤き混沌の死神として世界の秩序を壊し、混沌へ導く。その存在は夢の外側に潜む『異物』である。",
      "夢を精神エネルギーへ変換して刃にまとわせる必殺技『ナイトメアエクスキューション』は、対象を一撃で斬り裂く。秩序へ干渉する専用武器と混沌の力を秘めたカプセムを組み合わせ、現実と夢の境界へ侵入する。",
    ],
    items: [
      {
        name: "ブレイカムゼッツァー",
        body: "倒されたVISION ZETZの物を回収し、ネクストピースの力によって変化させた専用武器。一振りで空間を断ち、秩序すら切り裂く。",
      },
      {
        name: "ロードインヴォーカー",
        body: "コード：ケイオスがロードケイオスへ擬装する際に、金のカオスカプセムを装填する発動器。",
      },
      {
        name: "金のカオスカプセム",
        body: "混沌の力を秘めた金色のカプセム。ロードインヴォーカーへ装填することでロードケイオスへ擬装する。",
      },
      {
        name: "ナイトメアエクスキューション",
        body: "夢を精神エネルギーへ変換して刃にまとわせ、対象を斬り裂く必殺技。",
      },
    ],
  },
  {
    id: "dread",
    order: "03",
    name: "仮面ライダードレッド",
    roman: "KAMEN RIDER DREAD",
    agent: "コードナンバー：エイト / シンソウ",
    image: "/dream-chapter-dread.jpeg",
    imageAlt: "紫紺の結晶装甲と翼を備えた仮面ライダードレッド",
    imagePosition: "50% 24%",
    imageWidth: 1024,
    imageHeight: 1280,
    accent: "#9c61ff",
    profile: [
      { label: "HEIGHT", value: "213.4cm" },
      { label: "WEIGHT", value: "150.0kg" },
      { label: "PUNCH", value: "136.4t" },
      { label: "KICK", value: "144.6t" },
      { label: "JUMP", value: "∞（ひと跳び）" },
      { label: "RUN", value: "0.4秒（100m）" },
      { label: "FINISHER", value: "ドレッドブレイキング" },
    ],
    paragraphs: [
      "『ドルミネンス』のコードナンバー：エイトであるシンソウが、『ドレッドライバー』と『レプリドラゴナロスケミーカード』を使用して変身した姿。紫紺の結晶装甲と巨大な翼を展開し、規格外の跳躍性能を発揮する。",
      "必殺技は『ドレッドブレイキング』。本資料に記録された変身者、変身装置、使用カード、基礎スペック以外の詳細は未記録である。",
    ],
    items: [
      {
        name: "ドレッドライバー",
        body: "シンソウが仮面ライダードレッドへ変身するために使用するドライバー。",
      },
      {
        name: "レプリドラゴナロスケミーカード",
        body: "ドレッドライバーと組み合わせて変身に使用されるケミーカード。",
      },
      {
        name: "ドレッドブレイキング",
        body: "仮面ライダードレッドの必殺技。",
      },
    ],
  },
  {
    id: "lupin",
    order: "04",
    name: "仮面ライダールパン",
    roman: "KAMEN RIDER LUPIN",
    agent: "元コードナンバー：トゥエンティーフォー / サヨ",
    image: "/dream-chapter-lupin.jpeg",
    imageAlt: "深紅と黒金の装甲をまといルパンガンナーを構える仮面ライダールパン",
    imagePosition: "50% 20%",
    imageWidth: 1254,
    imageHeight: 1254,
    accent: "#d5a846",
    profile: [
      { label: "TRANSFORMER", value: "サヨ" },
      { label: "FORMER CODE", value: "トゥエンティーフォー" },
      { label: "DEVICE", value: "ルパンガンナー" },
    ],
    paragraphs: [
      "元コードナンバー：トゥエンティーフォーであるサヨが、『ルパンガンナー』を使用して変身した姿。",
      "変身者がサヨであることを除き、基本仕様は史実の『仮面ライダールパン』から変わらない。本資料で新たな数値や能力は設定されていない。",
    ],
    items: [
      {
        name: "ルパンガンナー",
        body: "サヨが仮面ライダールパンへの変身に使用する装置。",
      },
      {
        name: "基本仕様",
        body: "史実の『仮面ライダールパン』に準拠する。未提示のカタログスペックや能力は本資料では補完しない。",
      },
    ],
  },
] as const;
