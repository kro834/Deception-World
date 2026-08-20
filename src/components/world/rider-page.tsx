import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useWorldMode } from "./use-world-mode";
import { DossierNav, RIDER_NAV, NameText } from "./dossier-nav";
import { FormPickup } from "./manager-stub";
import { SlideOpenControl } from "./slide-open-control";
import { UiVectorIcon } from "./ui-vector-icon";

type RiderDossier = {
  id: string;
  no: string;
  name: string;
  ja: string;
  person: string;
  enPerson: string;
  epithet: string;
  tone: string;
  img: string;
  pos: string;
  civilianImg: string;
  civilianPos: string;
  title: string;
  quotes: string[];
  facts: { dt: string; dd: string }[];
  sections: { no: string; kicker: string; title: string; body: string[] }[];
  forms: {
    img: string;
    pos: string;
    system: string;
    name: string;
    displayName?: string;
    sub?: string;
    calls: string[];
    stats?: { dt: string; dd: string }[];
    abilities?: { name: string; body: string }[];
    arsenal?: { name: string; body: string }[];
    finishers?: { name: string; body: string }[];
  }[];
  civilian: { name: string; kicker: string; body: string; cv?: string };
  nightmare?: {
    name: string;
    kicker: string;
    quote: string;
    img: string;
    pos: string;
    facts: { dt: string; dd: string }[];
    sections: { no: string; kicker: string; title: string; body: string[] }[];
  };
};

export const RIDER_DOSSIERS: RiderDossier[] = [
  {
    id: "saga",
    no: "01",
    name: "SAGA",
    ja: "サーガ",
    person: "シエル ／ 月城悠真",
    enPerson: "YUMA TSUKISHIRO",
    epithet: "夢見る者",
    tone: "#248cff",
    img: "/rider-profile-saga.jpeg",
    pos: "50% 10%",
    civilianImg: "/civilian-saga.jpeg",
    civilianPos: "50% 12%",
    title: "最も弱い地点から、結末へ踏み込む第一のライダー。",
    quotes: ["俺たちが夢を叶えるんだ。", "世界を変える", "俺たちの世界を返せ!"],
    facts: [
      { dt: "NAME", dd: "月城 悠真（つきしろ ゆうま）" },
      { dt: "AGE", dd: "19歳" },
      { dt: "SPECIES", dd: "人間" },
      { dt: "HEIGHT", dd: "179cm" },
      { dt: "WEIGHT", dd: "70kg" },
      { dt: "ROLE", dd: "仮面ライダーサーガ" },
    ],
    sections: [
      {
        no: "01",
        kicker: "DESTINY / LIBERATION",
        title: "人類を滅ぼす運命から、世界を取り戻す戦いへ。",
        body: [
          "元は何の変哲もない十九歳の青年。『サーガの世界』で物語の主人公シエルに選ばれてしまった。管理人から人類殲滅を強要され、仮面ライダーサーガとして世界を滅ぼす運命を背負ううち、精神は退廃していった。",
          "しかし怪作の夢へ潜ったことで呪縛から解放され、新たな力を獲得。仲間と夢を叶え、奪われた世界を取り戻すため、味方陣営のダークホースとして戦う。",
        ],
      },
      {
        no: "02",
        kicker: "BATTLE / DISTANCE",
        title: "生身を避け、能力と射程で戦場を制する。",
        body: [
          "生身の身体能力は低く、変身前の交戦を徹底して避ける。本領は能力を多用する遠距離戦。万物を拒絶する半汎用式ライダーシステムが、サーガの核になる。",
        ],
      },
      {
        no: "03",
        kicker: "POWER / SAGA SYSTEM",
        title: "万物を拒絶する、半汎用式ライダーシステム。",
        body: [
          "『拒絶』は他者から拒まれる恐怖、喪失、受け入れ難い事実、希死念慮までを含む。融合から生まれたクリスタルコアは、後の究極形態を成立させる中核となる。",
        ],
      },
    ],
    forms: [
      {
        img: "/saga-extreme-middle.jpeg",
        pos: "50% 8%",
        system: "エクスサーガドライバー × デュアルエクスコア",
        name: "エクスプリームサーガ",
        displayName: "エクスプリームサーガ",
        sub: "MIDDLE",
        calls: ["EXCONVERT!!", "HIGH SUPREME!!", "Rollout!", "GENOCIDE! RIDER! SA-GA!"],
        stats: [
          { dt: "HEIGHT", dd: "249.9cm" },
          { dt: "WEIGHT", dd: "255.3kg" },
          { dt: "PUNCH", dd: "205.6t／測定不能" },
          { dt: "KICK", dd: "308.9t／測定不能" },
          { dt: "JUMP", dd: "1033.5m" },
          { dt: "100m", dd: "0.002sec" },
        ],
        abilities: [
          { name: "LEARNING", body: "一撃から重心、意図、発動条件、夢界接続、精神状態、因果の揺らぎを解析する。" },
          { name: "DARK MATTER CHARGING", body: "宇宙と夢に混在するダークマターを負荷なく集積し、分離、接続、構造解析、矛盾結果の保持能力を高める。" },
          { name: "HIGH SUPREME", body: "MIDDLEで生んだ可能性をULTRAの裁定へ繋ぎ、史上最高の戦闘力を発揮する。" },
        ],
        arsenal: [
          { name: "フェイタルエッジ／レルムスレイヤー／アクシスレイカー", body: "悠真が継続して使用する三種の追加武装。デュアルエクスコアは外部武装へ実在・非実在の定義を供給する。" },
          { name: "ユナイトエッジ", body: "分離した二刀を一点貫通と結果固定へ特化。最大8888次元の結果を保持し、悪夢だけを剥離する。" },
        ],
        finishers: [
          { name: "ハイグリーム・エッジ", body: "四段階チャージで放つ強斬撃。初撃を避けられても回避後へ最適化した二撃目を固定する。" },
          { name: "エクスプリームビッグバン", body: "対象を残すべきものと終わらせるべきものへ分岐し、完全な悪夢は存在可能性ごと消す。" },
        ],
      },
      {
        img: "/saga-extreme-ultra.jpeg",
        pos: "50% 8%",
        system: "エクスサーガドライバー × デュアルエクスコア",
        name: "エクスプリームサーガ・ウルトラ",
        sub: "ULTRA",
        calls: ["HIGH SUPREME!", "ULTRA CORE!", "EXSUPREME SAGA ULTRA!"],
      },
    ],
    civilian: {
      name: "月城 悠真",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。シエル／月城悠真。夢見る者。",
      cv: "坂田将吾",
    },
    nightmare: {
      name: "マキャベル ゴアナイトメア",
      kicker: "NIGHTMARE PICKUP 01 / MACHIAVEL GORE NIGHTMARE",
      quote: "アナタは、ワタシの主人公でしょ？",
      img: "/nightmare-machiavel-gore.jpeg",
      pos: "48% 8%",
      facts: [
        { dt: "FORM", dd: "マキャベル ゴアナイトメア" },
        { dt: "HOST", dd: "シエル（月城悠真）" },
        { dt: "HEIGHT", dd: "219.8cm（est.）" },
        { dt: "WEIGHT", dd: "75.8kg（est.）" },
        { dt: "NIGHTMARE", dd: "拒絶" },
        { dt: "CV", dd: "上田麗奈" },
      ],
      sections: [
        {
          no: "01",
          kicker: "ORIGIN / ANOTHER CIEL",
          title: "シエルの魂から生まれた、もう一人のシエル。",
          body: [
            "『仮面ライダーサーガ ドリームチャプター』Case 1では声のみで現れ、Case 2で姿と正体を明かした特別なナイトメア。通常のナイトメアが夢主の深層心理へ侵入して悪夢を生むのに対し、彼女はシエルの魂に引き寄せられて誕生した。",
          ],
        },
        {
          no: "02",
          kicker: "APPEARANCE / PERSONA",
          title: "慈愛と嘲笑を、同じ穏やかさで語る脚本家。",
          body: [
            "青い巨大な衣装を纏う女性型の大柄なナイトメア。ドレス、喪服、花嫁衣装、舞台衣装のいずれにも見える装いには、白銀のレース、赤と青の薔薇が刻まれる。フードの内側に人の顔はなく、花弁のように開閉する赤黒い発光体の中心へ白い瞳が一つだけ浮かぶ。",
          ],
        },
        {
          no: "03",
          kicker: "NIGHTMARE / REJECTION",
          title: "現象ではなく、届いたという結果を拒絶する。",
          body: [
            "『それ、いらない』の一言で、攻撃の威力ではなく『攻撃が届く』という結果を成立させない。視線は常にシエルだけへ注がれる。一人称は『ワタシ』、二人称は『アナタ』。",
          ],
        },
      ],
    },
  },
  {
    id: "realm",
    no: "02",
    name: "REALM",
    ja: "レルム",
    person: "ベル・アレイン",
    enPerson: "BELL ALAIN",
    epithet: "完成品",
    tone: "#f14a60",
    img: "/rider-profile-realm.jpeg",
    pos: "50% 8%",
    civilianImg: "/civilian-realm.jpeg",
    civilianPos: "50% 10%",
    title: "失われた信号が、名前を持って帰還する。",
    quotes: ["ああ…処理しといて", "良い人だった事は間違い無い！", "いや、仕留める"],
    facts: [
      { dt: "NAME", dd: "ベル・アレイン" },
      { dt: "AGE", dd: "26歳" },
      { dt: "GENDER", dd: "男性" },
      { dt: "NATIONALITY", dd: "フランス" },
      { dt: "HEIGHT", dd: "183cm" },
      { dt: "WEIGHT", dd: "76kg" },
    ],
    sections: [
      {
        no: "01",
        kicker: "REALMS / COMMANDER",
        title: "一人で作戦本部として機能する帰還者。",
        body: [
          "ベル・アレインは、検体災害と高危険度異常存在へ対抗するREALMSの元日本支部リーダー。創設者ソル・アレインと英国人の母の息子で、レルムズドライバー唯一の完全適合者である。",
          "自ら前線へ出ながら戦況、人員、被害予測、敵の進路を同時管理する。出生や来歴の全貌は組織内でも不明。",
        ],
      },
      {
        no: "02",
        kicker: "PERSONALITY / DECISION",
        title: "誰かが前を向くため、決断の後にも笑う。",
        body: [
          "明るく親しみやすく、冗談や軽口で場を動かす。意思と理性を不可逆的に失った災害は、過去の善性にかかわらず排除する。基準は外見や出自ではなく共存可能性である。",
        ],
      },
      {
        no: "03",
        kicker: "BODY / COMBAT",
        title: "生身でも、この世界で最強とされる。",
        body: [
          "黒く染めた髪、淡い蒼の瞳、長い耳を持ち、白いコートを好む。反射神経、空間認識、情報処理に秀で、初手の必殺技と欺瞞を織り交ぜる。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-profile-realm.jpeg",
        pos: "50% 8%",
        system: "レルムズドライバー × レジェンズルーレット",
        name: "レルム",
        displayName: "レルムレジェンズ",
        sub: "レジェンズ",
        calls: ["ROULETTE ON!", "JARAMM… LEGENDS! HIT!", "Rollout!", "JACKPOT!!", "RIDER! REALM! LEGENDS!!"],
        stats: [
          { dt: "HEIGHT", dd: "218.8cm" },
          { dt: "WEIGHT", dd: "103.6kg" },
          { dt: "PUNCH", dd: "198.6t" },
          { dt: "KICK", dd: "268.8t" },
          { dt: "JUMP", dd: "188.8m" },
          { dt: "100m", dd: "0.06sec" },
        ],
        abilities: [
          { name: "レジェンズルーレット", body: "敵、戦場、目的、許容損害から方策を抽出する混合戦略生成器。勝率、EMP、被害、ベルの倫理で重み付けする。" },
          { name: "LEGENDS", body: "伝説から人物の力ではなく、勝利の開始条件、方策、終了条件を抽出する。" },
          { name: "JACKPOT", body: "IDENTIFY、REACH、SAFE、CLOSEの四証明で、全経路を同じ勝利条件へ収束させる。" },
        ],
        arsenal: [
          { name: "メビウスネイバー", body: "矢で装甲処理、損傷転嫁、再生、権限経路を観測する弩。" },
          { name: "レルムスレイヤー", body: "防御と回避を観測しながら逃走、転嫁、再生、時間回帰、分身交換を順に閉じる銃。" },
          { name: "レジェンズエッジ", body: "一撃の刃長、角度、位相、軌道を更新し、斬撃を刺突、柄打ち、追撃へ組み替える長剣。" },
        ],
        finishers: [
          { name: "レジェンズモディフィカーレ", body: "敵本体、管理構造、再生中枢へ攻撃可能だと実証する高速キック。" },
          { name: "ジャックポット・レジェンズフィナーレ", body: "四証明の完了後、観測楔、敗北回避経路の封鎖、最終行動へ最適化したキックを順に実行する。" },
        ],
      },
    ],
    civilian: {
      name: "ベル・アレイン",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。REALMS元日本支部リーダー。",
    },
  },
  {
    id: "lore",
    no: "03",
    name: "LORE",
    ja: "ローア",
    person: "ローア",
    enPerson: "LORE",
    epithet: "卑怯者",
    tone: "#67d8ff",
    img: "/rider-profile-lore.jpeg",
    pos: "50% 10%",
    civilianImg: "/civilian-lore.jpeg",
    civilianPos: "50% 8%",
    title: "管理人の側から、世界へ踏み込む第三のライダー。",
    quotes: ["命の終わり際に向けられる最後の眼差しが好きだった", "私を生かすためだけに削られた人生が、静かに幕を下ろす瞬間が好きだった"],
    facts: [
      { dt: "NAME", dd: "ローア" },
      { dt: "AGE", dd: "不明" },
      { dt: "GENDER", dd: "男性" },
      { dt: "BIRTHDAY", dd: "9月2日" },
      { dt: "HEIGHT", dd: "179.0cm" },
      { dt: "WEIGHT", dd: "71.2kg" },
      { dt: "CV", dd: "内山昂輝" },
    ],
    sections: [
      {
        no: "01",
        kicker: "POSITION / PRESENT",
        title: "世界を弄んだ管理人は、かつての敵と並び立つ。",
        body: [
          "サーガ世界の管理人であり、かつてシエルを殺害した経験を持つ。現在は諸事情によって弱体化し、過去に敵対した者たちとの共闘へ臨んでいる。",
        ],
      },
      {
        no: "02",
        kicker: "PERSONALITY / COWARDICE",
        title: "善意も悪意も、自分で踏みにじる。",
        body: [
          "自己肯定感は低いが、プライドは高い。口論で大敗した際の憂さ晴らしとしてサーガ世界を創造し、そこで偶然行った人助けを感謝されて舞い上がった結果、『仮面ライダーサーガ』の結末をバッドエンドへ導いた。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-profile-lore.jpeg",
        pos: "50% 10%",
        system: "ローアドライバー × ローアライズコア",
        name: "ローア",
        sub: "リキッド",
        calls: ["LIQUID On!", "Roll Out…", "FLOWING Lore System", "Liquid PHASE…!"],
        stats: [
          { dt: "HEIGHT", dd: "可変" },
          { dt: "WEIGHT", dd: "可変" },
          { dt: "PUNCH", dd: "66.8t" },
          { dt: "KICK", dd: "176.9t" },
          { dt: "JUMP", dd: "488.8m" },
          { dt: "100m", dd: "0.05sec" },
        ],
        abilities: [
          { name: "LIQUID", body: "肉体と装甲を流動位相へ変換し、物理攻撃の衝撃を一点で受け止めず全身へ分散する。" },
          { name: "REPAIR", body: "破損した空間、精神、夢界接続を流動的に補修する。崩壊を一時的に止める応急処置を得意とする。" },
          { name: "SOLID", body: "対象の位置、動作、能力発動、位相変動を一時的に固定する。高速移動、空間転移、夢界潜行を大幅に制限する。" },
        ],
        arsenal: [
          { name: "ローアライズコア", body: "リキッドとソリッドの位相を切り替える中核。EMPは無制限。" },
        ],
        finishers: [
          { name: "FLOW ENDER", body: "対象周囲の空間を流動化し、流動位相エネルギーを収束した蹴撃で内部構造を液状情報へ分解する。" },
          { name: "PRESS ENDER", body: "対象周囲の空間を固定し、高密度位相エネルギーを収束したライダーキックを叩き込む。" },
        ],
      },
    ],
    civilian: {
      name: "ローア",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。サーガ世界の管理人。",
      cv: "内山昂輝",
    },
  },
  {
    id: "vandal",
    no: "04",
    name: "VANDAL",
    ja: "ヴァンダール",
    person: "レックス・ロワ",
    enPerson: "VANDAL",
    epithet: "秩序の大口と裁定者の仮面",
    tone: "#e71a9c",
    img: "/rider-profile-vandal.jpeg",
    pos: "50% 8%",
    civilianImg: "/civilian-vandal.jpeg",
    civilianPos: "50% 10%",
    title: "六詠第二位が、肉弾戦へ権限を変換する。",
    quotes: ["世界は、今日も選択を許されて居ます", "生者には生を。死者には静寂を", "今日も又、道を閉ざす物だけを壊しましょう"],
    facts: [
      { dt: "NAME", dd: "レックス・ロワ" },
      { dt: "AGE", dd: "不明" },
      { dt: "GENDER", dd: "両性具有／性自認は女性" },
      { dt: "HEIGHT", dd: "185.0cm" },
      { dt: "WEIGHT", dd: "80.1kg" },
      { dt: "DIVINITY", dd: "秩序の神" },
    ],
    sections: [
      {
        no: "01",
        kicker: "POSITION / IDEAL",
        title: "世界を残し、支配だけを終わらせる。",
        body: [
          "『六詠』の管理人の一人。特定の領域ではなく、単独で中央官制の全役割を背負う。世界は残し、支配だけを終わらせる。",
        ],
      },
      {
        no: "02",
        kicker: "PERSONALITY / VERDICT",
        title: "他者の選択を奪わない、完全なる良心。",
        body: [
          "力有る者には責任を。私の力が、私の欲によって振るわれぬ様に。道を閉ざす物だけを壊す。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-profile-vandal.jpeg",
        pos: "50% 8%",
        system: "ヴァンダールドライバー × スペシャルコア",
        name: "ヴァンダール",
        calls: ["RIDE IN!", "SPECIAL!", "ROLLOUT!", "NONE SHALL TRANSCEND IT!", "VANDAL!"],
        stats: [
          { dt: "HEIGHT", dd: "203.6cm" },
          { dt: "WEIGHT", dd: "113.2kg" },
          { dt: "PUNCH", dd: "262.9t" },
          { dt: "KICK", dd: "372.2t" },
          { dt: "JUMP", dd: "5000m" },
          { dt: "100m", dd: "0.01sec" },
        ],
        abilities: [
          { name: "SCANNING", body: "一撃を見た時点で学習を完了し、重心移動、意図、能力発動条件、癖、精神状態、さらに相手の未来までを読み取り、より適切な戦法を提示する。" },
          { name: "SPECIAL", body: "最高位の管理権限をさらに強化し、管理人殺しの力すら干渉できない規模の攻撃と防御へ転用する。" },
        ],
        arsenal: [
          { name: "サーパスアタノール", body: "胸部変換炉。光と闇の神性を均衡循環させ、終焉の炎『ヒネモス』を生む。" },
          { name: "デアグローブ／デアブーツ", body: "対象を破壊に適した組成へ変え、飛行・潜航を含む推進機能を錬成する。" },
        ],
        finishers: [
          { name: "DEAD END", body: "光で対象の全構造を可視化・固定し、闇で外部供給、再生、逃走、能力継承を遮断する。ヒネモスを纏った拳撃または蹴撃を中枢へ叩き込む。" },
        ],
      },
    ],
    civilian: {
      name: "レックス・ロワ",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。六詠の管理人。",
      cv: "斎賀みつき",
    },
  },
  {
    id: "leddic",
    no: "05",
    name: "LEDDIC",
    ja: "レディック",
    person: "在原華火",
    enPerson: "HANAKA ARIHARA",
    epithet: "規格外の幸運",
    tone: "#69df74",
    img: "/rider-profile-leddic.jpeg",
    pos: "50% 10%",
    civilianImg: "/civilian-leddic.jpeg",
    civilianPos: "50% 12%",
    title: "規格外の幸運で、核心へ辿り着く警部補。",
    quotes: ["偶然だよ。たぶん", "事件は、私が追う前に私の前へ来る"],
    facts: [
      { dt: "NAME", dd: "在原華火（ありはら はなか）" },
      { dt: "AGE", dd: "24歳" },
      { dt: "GENDER", dd: "女性" },
      { dt: "HEIGHT", dd: "176cm" },
      { dt: "WEIGHT", dd: "71kg" },
      { dt: "OCCUPATION", dd: "捜査一課・警部補" },
    ],
    sections: [
      {
        no: "01",
        kicker: "INVESTIGATION / LUCK",
        title: "本人が気付かぬまま、核心へ立つ。",
        body: [
          "現場叩き上げで捜査一課へ進んだ警部補。無口で冷静に見えるが、実際は口下手で深く考えていないことが多い。何気なく口にした言葉が事件の核心を突き、遭遇した人物がたまたま犯人だったという規格外の強運を持つ。",
        ],
      },
      {
        no: "02",
        kicker: "ADAPTER / FILE",
        title: "運が先行し、拳がそれを確定する。",
        body: [
          "柔道、空手、剣道、捕縛術で性別を問わず一度も敗れたことがない。腕時計型の変身装置『レディックウォッチ』を用い、与えられた能力を設計通りに扱わず、悪知恵と幸運で転用する。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-profile-leddic.jpeg",
        pos: "50% 10%",
        system: "四八式腕時計型偏装甲装置 × レディックウォッチ",
        name: "レディック",
        sub: "草かんむりフォーム",
        calls: ["草かんむり！！", "SUPPORT To GRASS！！！！！"],
        stats: [
          { dt: "HEIGHT", dd: "204.6cm" },
          { dt: "WEIGHT", dd: "90.8kg" },
          { dt: "PUNCH", dd: "3t" },
          { dt: "KICK", dd: "10.6t" },
          { dt: "JUMP", dd: "45.6m" },
          { dt: "100m", dd: "5.4秒" },
        ],
        abilities: [
          { name: "草", body: "文字を書き出すことで生えている草を操作し、成長させて足止め用の罠を作る。引き抜いて鞭として振るい、対象へ括り付けて拘束する。" },
          { name: "薬", body: "患者や負傷者の状態に適した回復用の薬を生み出す。怪我の度合いが大きいほど、精製に必要な時間も延びる。" },
          { name: "堅／壊", body: "土偏フォームでは防御力を数倍へ高め、飛来する危険物を空中でばらばらに破壊する。" },
        ],
        arsenal: [
          { name: "草薙刀", body: "全長150cm、緑色の柄の両端に約25cmずつの刃を備えた薙刀。危険だからという理由で折り、二刀流として扱う。" },
          { name: "岩山盾", body: "高さ約150cm、重量約480kgの大盾。華火は重いと言って、すぐに放り投げてしまう。" },
        ],
        finishers: [
          { name: "SUPPORT To GRASS", body: "支援、妨害、拘束、回復を一つの戦闘へ混在させ、豪快な近接戦闘と同居させる。" },
        ],
      },
    ],
    civilian: {
      name: "在原華火",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。捜査一課・警部補。",
      cv: "悠木碧",
    },
  },
  {
    id: "argenome",
    no: "06",
    name: "ARGENOME",
    ja: "アルゲノム",
    person: "紅城真守",
    enPerson: "ARGENOME",
    epithet: "義賊",
    tone: "#d71920",
    img: "/rider-profile-argenome.jpeg",
    pos: "50% 8%",
    civilianImg: "/civilian-argenome.jpeg",
    civilianPos: "50% 10%",
    title: "病を頂戴する、高速の義賊。",
    quotes: ["今宵、貴様の病を頂戴する"],
    facts: [
      { dt: "NAME", dd: "紅城真守" },
      { dt: "AGE", dd: "不明" },
      { dt: "GENDER", dd: "男性" },
      { dt: "OCCUPATION", dd: "紅魔館の執事" },
      { dt: "DRIVER", dd: "ゲーマドライバー" },
      { dt: "WEAPON", dd: "ガシャコンエッジ" },
    ],
    sections: [
      {
        no: "01",
        kicker: "PROFILE",
        title: "病を頂戴する、高速の義賊。",
        body: [
          "紅城真守は、幻想郷で活躍し、幻想郷を救った紅魔館の執事である。ゲーマドライバーへライダーガシャットを装填することで仮面ライダーアルゲノムへ変身する。",
        ],
      },
      {
        no: "02",
        kicker: "BATTLE STYLE",
        title: "高速機動と無音の接近。",
        body: [
          "ファントムローブは布が風に揺れる音まで消し、ブーツも足音を発生させない。索敵、無音接近、駆除プログラムを一つの流れへ組み込む。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-profile-argenome.jpeg",
        pos: "50% 8%",
        system: "ゲーマドライバー × ライダーガシャット",
        name: "アルゲノム",
        sub: "Xゲーマー",
        calls: ["ゲーマオン!", "X GAMER!", "CRITICAL STRIKE!"],
        stats: [
          { dt: "HEIGHT", dd: "205.0cm" },
          { dt: "WEIGHT", dd: "95.5kg" },
          { dt: "PUNCH", dd: "5.5t" },
          { dt: "KICK", dd: "10.0t" },
          { dt: "JUMP", dd: "40.5m" },
          { dt: "100m", dd: "1.0秒" },
        ],
        abilities: [
          { name: "Xギアスーツ", body: "真守の動作を補助・強化し、装着者の技量を戦闘力へ反映する。" },
          { name: "メックライフガード", body: "急所への損傷を全身へ分散し、残存体力が少ないほど防御力を上昇させる。" },
          { name: "クイックファイト", body: "グローブがガシャコンウェポンと通信して攻撃を最適化し、攻撃と同時に駆除プログラムを流し込む。" },
        ],
        arsenal: [
          { name: "ガシャコンエッジ", body: "高速戦闘に適したナイフ型ガシャコンウェポン。分離パルス発生装置『パルスプリッター』により、バグスターと感染者を分離する。" },
          { name: "ファントムローブ", body: "防弾加工された首元のマント。防火、耐水、絶縁性に優れ、風による揺らぎの音まで消す。" },
        ],
        finishers: [
          { name: "クリティカルストライク", body: "仮面ライダーアルゲノムの必殺技。" },
        ],
      },
    ],
    civilian: {
      name: "紅城真守",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。紅魔館の執事。",
      cv: "石川界人",
    },
  },
  {
    id: "over-zeztz",
    no: "07",
    name: "OVER ZEZTZ",
    ja: "オーバーゼッツ",
    person: "ジェームズ・スミス",
    enPerson: "JAMES SMITH",
    epithet: "もう一人のセヴン",
    tone: "#32e1d0",
    img: "/rider-profile-over-zeztz.jpeg",
    pos: "50% 8%",
    civilianImg: "/civilian-over-zeztz.jpeg",
    civilianPos: "50% 8%",
    title: "英国支部から派遣された、最強のエージェント。",
    quotes: ["My name is Code Number Seven.", "Nice to meet you… but I’m about to erase you.", "So, goodbye. I'm on it."],
    facts: [
      { dt: "NAME", dd: "James Smith" },
      { dt: "CODE", dd: "セヴン" },
      { dt: "AGE", dd: "28歳" },
      { dt: "SEX", dd: "男性" },
      { dt: "HEIGHT", dd: "185cm" },
      { dt: "AFFILIATION", dd: "CODE英国支部" },
      { dt: "OCCUPATION", dd: "エージェント" },
    ],
    sections: [
      {
        no: "01",
        kicker: "AGENT PROFILE",
        title: "陽気な顔と、任務の最適解。",
        body: [
          "コードナンバー：セヴン。CODE英国支部のエージェント。陽気な軽口の奥で最適解を選び、改良型ゼッツシステムを駆る。近接、銃器、潜入、解析、情報回収を一人でこなす。",
        ],
      },
      {
        no: "02",
        kicker: "MISSION SUPPORT",
        title: "戦闘・潜入・解析を支えるCODE装備。",
        body: [
          "ゼッツフォン、ゼッツカメラ、ゼッツセンサー、ゼッツライセンス。任務の道具は身分ごと世界の境界をまたぐ。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-profile-over-zeztz.jpeg",
        pos: "50% 8%",
        system: "ゼッツドライバー × フィジカムインパクトカプセム",
        name: "オーバーゼッツ",
        sub: "フィジカムインパクト",
        calls: ["グッドモーニング！ ライダー！", "ゼ・ゼ・ゼッツ！", "インパクト！"],
        stats: [
          { dt: "HEIGHT", dd: "200.5cm" },
          { dt: "WEIGHT", dd: "97.7kg" },
          { dt: "PUNCH", dd: "17.7t" },
          { dt: "KICK", dd: "37.7t" },
          { dt: "JUMP", dd: "27.7m" },
          { dt: "100m", dd: "1.7秒" },
        ],
        abilities: [
          { name: "フィジカムマスク", body: "オブザームロッドで環境観測、レッドオプチカムで視力強化、レッドシグナムで生体測定を行う。" },
          { name: "クラッシャム", body: "濃酸素吸入で疲労回復、集中力、判断力、睡眠を向上させる。" },
          { name: "インパクトレムアーム／レッグ", body: "腕で強力パンチ、脚で衝撃波を伝播させ崩壊攻撃を行う。" },
        ],
        arsenal: [
          { name: "ブレイカムゼッツァー", body: "可変武器。さまざまな形態に切り替える。" },
          { name: "ワルサーP38", body: "1938年ドイツ陸軍採用の自動式拳銃。ジェームズの愛用品。" },
        ],
        finishers: [
          { name: "インパクトバニッシュ", body: "フィジカムインパクトの必殺技。" },
          { name: "インパクトオーバーバニッシュ", body: "フィジカムインパクトの超必殺技。" },
        ],
      },
    ],
    civilian: {
      name: "ジェームズ・スミス",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。CODE Number Seven。",
    },
  },
];

export function RiderPage({ id }: { id: string }) {
  useWorldMode();
  const rider = RIDER_DOSSIERS.find((r) => r.id === id) ?? RIDER_DOSSIERS[0];
  const nightmareRef = useRef<HTMLDialogElement>(null);
  const openNightmare = () => {
    const dlg = nightmareRef.current;
    if (!dlg) return;
    try {
      dlg.showModal();
    } catch {
      /* already open */
    }
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const closeNightmare = () => {
    nightmareRef.current?.close();
  };
  const primaryForm = rider.forms[0];
  useEffect(() => {
    const href = primaryForm?.img ?? rider.img;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = "high";
    img.src = href;
    void img.decode?.().catch(() => undefined);
    return () => link.remove();
  }, [primaryForm?.img, rider.img]);
  return (
    <main
      className="manager-page rider-dossier-page"
      style={{ ["--manager-accent" as string]: rider.tone, ["--rider-tone" as string]: rider.tone, ["--archive-accent" as string]: rider.tone, ["--archive-accent-soft" as string]: rider.tone }}
    >
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <header className="manager-topbar">
        <Link to="/world" hash="riders" className="brand">
          <span className="brand-sigil">
            <i>DW</i>
          </span>
          <span>
            <b>DECEPTION WORLD</b>
            <small>CHARACTER FILE // {rider.no}</small>
          </span>
        </Link>
        <Link to="/world" hash="riders" className="manager-back">
          <span>ライダー一覧へ戻る</span>
          <i aria-hidden="true">
            <UiVectorIcon kind="arrow-down-left" size={14} />
          </i>
        </Link>
      </header>
      <section className="manager-hero">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img src={rider.civilianImg} alt={`${rider.civilian.name}の変身前ビジュアル`} style={{ objectPosition: rider.civilianPos, objectFit: "cover" }} decoding="async" fetchPriority="high" />
            <span className="manager-numeral">{rider.no}</span>
          </div>
        </div>
        <div className="manager-introduction">
          <p className="manager-file-number">CHARACTER FILE // {rider.no}</p>
          <h1>
            <small>{rider.enPerson}</small>
            <span className="manager-display-name">
              <NameText value={rider.civilian.name} />
            </span>
          </h1>
          <p className="manager-title"># {rider.epithet}</p>
          <div className="manager-quotes">
            {rider.quotes.map((q) => (
              <q key={q}>{q}</q>
            ))}
          </div>
          <dl className="manager-facts">
            {rider.facts.map((f) => (
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
      <section className={rider.nightmare ? "rider-archive-identity-records has-nightmare" : "rider-archive-identity-records"} aria-label="変身前記録">
        <figure className="rider-archive-civilian">
          <div className="rider-archive-civilian-visual">
            <img src={rider.civilianImg} alt="" style={{ objectPosition: rider.civilianPos }} />
            <span>BEFORE</span>
            <i className="rider-archive-civilian-shade" />
          </div>
          <figcaption>
            <p>{rider.civilian.kicker}</p>
            <small>変身前ビジュアル // CONFIRMED</small>
            <h2>{rider.civilian.name}</h2>
            <p>{rider.civilian.body}</p>
            {rider.civilian.cv ? <p>CV {rider.civilian.cv}</p> : null}
          </figcaption>
        </figure>
        {rider.nightmare ? (
          <article className="rider-nightmare-card">
            <div className="rider-nightmare-card-visual">
              <img src={rider.nightmare.img} alt={`${rider.nightmare.name}のビジュアル`} style={{ objectPosition: rider.nightmare.pos }} />
              <span>NIGHTMARE</span>
              <i className="rider-nightmare-card-shade" />
              <SlideOpenControl
                className="rider-nightmare-pickup-button"
                ariaLabel={`${rider.nightmare.name}をピックアップ`}
                label="記録を開く"
                onOpen={openNightmare}
              />
            </div>
            <div className="rider-nightmare-card-copy">
              <p>{rider.nightmare.kicker}</p>
              <small>PICKUP</small>
              <h2>
                <span>{rider.nightmare.name}</span>
              </h2>
              <q>{rider.nightmare.quote}</q>
            </div>
          </article>
        ) : null}
      </section>
      <section className="manager-dossier">
        <div className="manager-section-index">
          <span>{rider.no}</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <div className="manager-sections">
          {rider.sections.map((s) => (
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
      {primaryForm ? (
        <FormPickup
          rider={{
            img: primaryForm.img,
            pos: primaryForm.pos,
            system: primaryForm.system,
            name: primaryForm.displayName ?? rider.ja,
            sub: primaryForm.sub ?? (primaryForm.name !== rider.ja ? primaryForm.name : undefined),
            calls: primaryForm.calls,
            stats: primaryForm.stats,
            abilities: primaryForm.abilities,
            arsenal: primaryForm.arsenal,
            finishers: primaryForm.finishers,
            extraForms: rider.forms,
          }}
        />
      ) : null}
      <DossierNav items={RIDER_NAV} currentHref={`/riders/${rider.id}`} indexLabel="SEVEN RIDERS" />
      {rider.nightmare ? (
        <dialog
          ref={nightmareRef}
          className="rider-nightmare-dialog"
          tabIndex={-1}
          aria-label={rider.nightmare.name}
          onCancel={(e) => {
            e.preventDefault();
            closeNightmare();
          }}
          onClick={(e) => {
            if (e.target === nightmareRef.current) closeNightmare();
          }}
        >
          <div className="rider-nightmare-dialog-panel">
            <button type="button" className="rider-nightmare-dialog-close" onClick={closeNightmare} aria-label="閉じる">
              <span>CLOSE</span>
              <i aria-hidden="true">
                <UiVectorIcon kind="close" size={16} />
              </i>
            </button>
            <div className="rider-nightmare-dialog-heading">
              <p>
                <span>NIGHTMARE PICKUP</span>
              </p>
              <small>{rider.nightmare.kicker}</small>
              <h2>
                <span>{rider.nightmare.name}</span>
              </h2>
              <q>{rider.nightmare.quote}</q>
            </div>
            <div className="rider-nightmare-dialog-layout">
              <figure>
                <img src={rider.nightmare.img} alt="" style={{ objectPosition: rider.nightmare.pos }} />
                <figcaption>
                  <span>FORM VISUAL</span>
                  <b>MACHIAVEL GORE NIGHTMARE</b>
                </figcaption>
              </figure>
              <div className="rider-nightmare-dialog-record">
                <dl>
                  {rider.nightmare.facts.map((f) => (
                    <div key={f.dt}>
                      <dt>{f.dt}</dt>
                      <dd>{f.dd}</dd>
                    </div>
                  ))}
                </dl>
                <div className="rider-nightmare-dialog-sections">
                  {rider.nightmare.sections.map((s) => (
                    <section key={s.no}>
                      <header>
                        <span>{s.no}</span>
                        <p>{s.kicker}</p>
                      </header>
                      <h3>{s.title}</h3>
                      <div>
                        {s.body.map((p) => (
                          <p key={p.slice(0, 20)}>{p}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </dialog>
      ) : null}
    </main>
  );
}
