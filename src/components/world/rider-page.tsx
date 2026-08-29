import { useEffect, useRef } from "react";
import { GuardedLink } from "@/components/load-gate";
import { useWorldMode } from "./use-world-mode";
import { DossierNav, RIDER_NAV, NameText } from "./dossier-nav";
import { FormPickup } from "./manager-stub";
import { SlideOpenControl } from "./slide-open-control";
import { UiVectorIcon } from "./ui-vector-icon";
import { LiquidPointerGlow } from "./liquid-rail";
import { resetPickupScroll, settlePickupScroll } from "./pickup-scroll-reset";
import { rememberRiderReturn } from "./rider-return-state";

type RiderDossierForm = {
  img: string;
  pos: string;
  system: string;
  name: string;
  displayName?: string;
  sub?: string;
  calls: string[];
  quote?: string;
  overview?: string[];
  featuredPickup?: boolean;
  theme?: "rexonance";
  stats?: { dt: string; dd: string }[];
  abilities?: { name: string; body: string }[];
  arsenal?: { name: string; body: string }[];
  finishers?: { name: string; body: string }[];
  weaponGallery?: { img: string; pos?: string; name: string; label: string }[];
};

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
  forms: RiderDossierForm[];
  civilian: { name: string; kicker: string; body: string; cv?: string };
  partner?: {
    name: string;
    enName: string;
    image: string;
    pos: string;
    kicker: string;
    tag: string;
    call: string;
    body: string[];
    facts: { dt: string; dd: string }[];
    forms: RiderDossierForm[];
  };
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
    civilianImg: "/civilian-yuma-20260826.jpeg",
    civilianPos: "50% 12%",
    title: "最も弱い地点から、結末へ踏み込む第一のライダー。",
    quotes: ["俺たちが夢を叶えるんだ。", "世界を変える", "俺達の世界を返せ…！"],
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
        featuredPickup: true,
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
      {
        img: "/rider-rexonance-saga-pickup.jpeg",
        pos: "50% 7%",
        system: "エクスサーガドライバー × デュアルエクスコア／レクソナンスコア",
        name: "レクソナンスサーガ",
        displayName: "レクソナンスサーガ",
        sub: "TRINITY RESONANCE / FINAL ARRIVAL",
        featuredPickup: true,
        theme: "rexonance",
        quote: "無限出力を、無限の攻撃として完成させる。",
        calls: [
          "EXCONVERT！",
          "Ultra DEUS！",
          "REXONANCE！",
          "GODSIDE！RIDER！",
          "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
          "REXONANCE！",
        ],
        stats: [
          { dt: "HEIGHT", dd: "244.9cm" },
          { dt: "WEIGHT", dd: "190.8kg" },
          { dt: "PUNCH", dd: "332.2t" },
          { dt: "KICK", dd: "480.5t" },
          { dt: "JUMP", dd: "6000m" },
          { dt: "100m", dd: "0.00021sec" },
          { dt: "FLIGHT", dd: "測定不能" },
          { dt: "KHAOS DeuX", dd: "50000YOPS／∞Core" },
          { dt: "KOSMOS DeuX", dd: "9000TOPS／300Core" },
          { dt: "EMP", dd: "無制限" },
        ],
        overview: [
          "月城悠真がエクスサーガドライバーへデュアルエクスコアとレクソナンスコアを装填して変身する、サーガシステムの最終到達形態。秩序と破壊を司るレックス・ロワ、最高位神格を持つ五代目ゼウス、そして神から切り離されながら一人の人間として生きた悠真。三者を融合して個を消すのではなく、それぞれを独立したまま超共鳴させ、戦闘出力だけを月城悠真へ集約することで成立する。",
          "エクスプリームサーガが開いた無制限出力の設計思想を継承し、REXONANCE DRIVE、REXONANCE DEUS、KHAOS DeuX、KOSMOS DeuXを統合。生成した力を踏み込み、加速、姿勢維持、装甲突破、位相貫通、権限干渉、存在構造への伝達まで連続的に再配分する。作用域であるエフェクティブ・エリアを極小化し、装甲内部のトランスミッション・エリアを最短化することで、反射や散逸を抑え、同じ出力をより鋭く、確実に対象へ到達させる。",
          "攻撃の周波数、位相、権限署名は戦闘中にも更新され、一般的な無効化処理の成立条件から外れる構成へ逐次遷移する。さらに超高位管理権限は反管理権限さえ外部権限要求として捕捉し、レックスの主権で作用範囲を整理し、ゼウスの第一性で悠真の処理を先行させる。最大出力だけでなく、実際に届く実効攻撃性能においてエクスプリーム・ウルトラを上回る、無限出力を無限の攻撃へ完成させた形態である。",
          "ゼウス由来の超自己進化は、現在の装甲、演算、出力、攻撃形式を次世代状態へ更新し続ける。レックス由来の絶対秩序は、その進化結果へ境界と役割を与え、破綻のない一つの戦闘体系へ即座に固定する。進化によって秩序を失わず、秩序によって進化を止めない循環こそがレクソナンスの核であり、スリムな外形に反して、全身は一つの巨大な攻撃機関として機能する。",
        ],
        abilities: [
          { name: "SA-GA OS 5.5", body: "KHAOS DeuX、KOSMOS DeuX、Paranormal Realizer Ultra、Neural Resonancer Ultraの解析を悠真の知覚、判断、運動制御へ統合する戦闘OS。自動操縦ではなく、本人の意思と経験を残したまま反応速度と実行精度を拡張する。高負荷で生じた神経同期の遅れや無駄も学習し、次回の補正へ反映する。" },
          { name: "超自己進化 × 絶対秩序", body: "観測した敵能力と戦況から次世代の装甲・演算・権限構造を生成し、整合性と生体適合を検査した上で実装する。絶対秩序が進化した要素を即座に体系化するため、過剰進化による自己崩壊を避けながら更新を継続できる。" },
          { name: "REXONANCE NANO ARMOR", body: "膨大なナノマシン群が硬度、密度、熱伝導、位相特性、権限署名をリアルタイムで再構成する可変装甲。接触直前には攻撃部位へ構造材と伝達機能を集中し、生成エネルギーの散逸を最小化する。" },
          { name: "REXONANCE DRIVE", body: "身体、武装、敵構造、戦場環境から成立可能な攻撃状態を多数生成し、現実に破綻なく実行できる解だけを選択。一つの攻撃動作の途中で脚部、推進、前面装甲、拳や刀身、対象内部へ出力を移し替え、全身を一つの攻撃機構として運用する。" },
          { name: "REXONANCE DEUS", body: "レックスの管理主権・秩序・破壊と、ゼウスの最高位神格・第一性を、悠真自身の最終意思へ従わせる神属権限統合機構。何を破壊し何を残すかは常に悠真が決め、反管理権限を含む外部干渉も主権宇宙の内部へ取り込んで監査・限定・拒絶する。" },
          { name: "ラーニング／拒絶／Exception World", body: "攻撃を重心、意図、能力条件、因果へ分解して対抗案を更新し、悪夢や侵食、不正な接続だけを成立前に切り離す。両立しない能力や法則は隔離した例外領域で一時成立させ、終了後に整合性を検査する。" },
        ],
        arsenal: [
          { name: "レルムスレイヤー・マークⅥ", body: "秩序解析と出力再配分へ直結した高機動型の対管理武装。" },
          { name: "レルムスレイヤー・マークXIV", body: "より高い権限干渉と構造切断へ対応する次世代仕様。" },
          { name: "アクシスレイカー・マークⅦ", body: "アークスモードとランチャーモードを切り替え、収束射撃から全方位砲撃まで担う。" },
          { name: "ユナイトエッジ・ランサーモード", body: "実効作用域を一点へ圧縮し、ヴィンクルムマジックを上回る理論貫通値を記録する決戦武装。" },
          { name: "共鳴武装群", body: "フェイタルエッジ、レルムスレイヤー、メビウスネイバー、レジェンズエッジを含む全武装がREXONANCE DRIVEへ同期する。" },
        ],
        finishers: [
          { name: "ハイグリーム・エッジ／レクソナンスレイド", body: "全身出力を最適な軌道へ収束する強斬撃と、反動まで次の一撃へ再利用して拳・蹴り・斬撃・射撃を連結する連続攻撃。" },
          { name: "スクワッドビッグバン／レクソナンス・エクスラッシュ", body: "複数コアの能力を破綻しない順序へ整列させ、対象の防御だけでなく外部能力や管理権限の接続まで切断する。" },
          { name: "レクソナンスプロージョン", body: "Exception Worldで一挺の射線を複数経路へ展開し、回避、防御、転嫁経路を順番に閉鎖した後、最後の一撃を対象内部で解放する。" },
          { name: "レクソナンスメテオ", body: "悪夢、侵食、支配だけを対象から分離し、残すべき人格と生命を悠真が選択してから敵性要素へ蹴撃を叩き込む分離浄化技。" },
          { name: "レクソナンスリボルト", body: "攻撃に付与された支配、改変、無効化、転嫁を分離し、敵性干渉だけを奪い取って発生元へ返送する権限迎撃型カウンター。" },
          { name: "レクソナンスストライク", body: "紅紫と翠緑の神性を脚部へ集中し、表層装甲、内部構造、再生中枢、管理接続へ位相衝撃を連続命中させる。" },
          { name: "デウスシフト・レクソナンスパーク", body: "LOWからULTRAまで出力を段階上昇させ、エフェクティブ・エリアを足先一点へ圧縮。肉体、装甲、位相、再生、管理権限を解析し、最も破壊効率の高い深度へ全攻撃力を通す最終必殺技。" },
        ],
        weaponGallery: [
          { img: "/weapon-realm-slayer-mark-vi.jpeg", pos: "50% 50%", name: "レルムスレイヤー・マークⅥ", label: "ORDER BREAKER / MARK VI" },
          { img: "/weapon-realm-slayer-mark-xiv.jpeg", pos: "50% 50%", name: "レルムスレイヤー・マークXIV", label: "ORDER BREAKER / MARK XIV" },
          { img: "/weapon-axis-raker-mark-vii-arcs.jpeg", pos: "50% 50%", name: "アクシスレイカー・マークⅦ　アークスモード", label: "AXIS RAKER / ARCS MODE" },
          { img: "/weapon-axis-raker-mark-vii-launcher.jpeg", pos: "50% 50%", name: "アクシスレイカー・マークⅦ　ランチャーモード", label: "AXIS RAKER / LAUNCHER MODE" },
          { img: "/weapon-unite-edge-lancer.jpeg", pos: "50% 50%", name: "ユナイトエッジ　ランサーモード", label: "UNITE EDGE / LANCER MODE" },
        ],
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
    civilianImg: "/civilian-bell-20260826.jpeg",
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
    img: "/rider-vandal-20260826.jpeg",
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
        img: "/rider-vandal-20260826.jpeg",
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
        ],
        arsenal: [
          { name: "草薙刀", body: "全長150cm、緑色の柄の両端に約25cmずつの刃を備えた薙刀。危険だからという理由で折り、二刀流として扱う。" },
        ],
        finishers: [
          { name: "SUPPORT To GRASS", body: "支援、妨害、拘束、回復を一つの戦闘へ混在させ、豪快な近接戦闘と同居させる。" },
        ],
      },
      {
        img: "/rider-leddic-ishihen.jpeg",
        pos: "50% 8%",
        system: "四八式腕時計型偏装甲装置 × レディックウォッチ",
        name: "レディック",
        sub: "石偏フォーム",
        calls: ["石偏！！！！", "GUARD By ROCK！！"],
        quote: "他者を護る盾として、圧倒的な頑強さを。",
        overview: [
          "在原華火が変身する第二形態。草かんむりフォームと同じタイミングで与えられていたが、華火が存在ごと忘れていたため、登場は少し遅れる。",
          "後に登場するフォームを含めても頭3つほど抜き出た圧倒的な頑強さを誇り、他者を護る盾として存分に力を発揮する。武器の岩山盾は『重い』と言いながら、華火がすぐに放り投げてしまう。",
        ],
        stats: [
          { dt: "HEIGHT", dd: "230cm" },
          { dt: "WEIGHT", dd: "308kg" },
          { dt: "PUNCH", dd: "10.6t" },
          { dt: "KICK", dd: "30.4t" },
          { dt: "JUMP", dd: "0.5m" },
          { dt: "100m", dd: "15秒" },
        ],
        abilities: [
          { name: "堅", body: "『堅』の文字を書き出し、防御力をさらに数倍へ高める。" },
          { name: "壊", body: "自身や護りたい対象へ飛来する危険物を空中でばらばらに破壊する。気体の場合は原子同士の結合を無理矢理破壊し、無毒化する。" },
        ],
        arsenal: [
          { name: "岩山盾", body: "読みは『がんざんじゅん』。高さ約150cm、重量約480kgの大盾。" },
        ],
      },
    ],
    civilian: {
      name: "在原華火",
      kicker: "BEFORE TRANSFORMATION / CAST",
      body: "変身前ビジュアル // CONFIRMED。捜査一課・警部補。",
      cv: "悠木碧",
    },
    partner: {
      name: "無神 千桐",
      enName: "CHIGIRI NAIKAMI",
      image: "/civilian-naikami-chigiri.jpeg",
      pos: "50% 16%",
      kicker: "SKILLED DUO / POLICE INSPECTOR",
      tag: "#敏腕コンビ",
      call: "レディック！！！ LETS GO！！！！！！！",
      body: [
        "熱血でやかましい一方、物事の本質を捉え、自分の中へきちんと落とし込んでから発言する警部。非常にまっすぐな性格で、その実直さゆえに損をすることも少なくない。",
        "幹部候補生だったが、まっすぐ過ぎる姿勢から上司と衝突し、出世街道から早々に外された。本人はほとんど気にしておらず、元幹部候補として培った高水準の頭脳と、ボクシングで鍛えた体術を現場で発揮する。在原華火以外には一度も負けたことがない。",
      ],
      facts: [
        { dt: "READING", dd: "ないかみ ちぎり" },
        { dt: "AGE", dd: "28歳" },
        { dt: "GENDER", dd: "男性" },
        { dt: "HEIGHT", dd: "198cm" },
        { dt: "WEIGHT", dd: "98kg" },
        { dt: "OCCUPATION", dd: "警察官（警部）" },
        { dt: "CV", dd: "谷山紀章" },
        { dt: "PRONOUN", dd: "俺／自分　君／アンタ／お前" },
      ],
      forms: [
        {
          img: "/rider-leddic-hoko-pending.svg",
          pos: "50% 50%",
          system: "レディックウォッチ × 戈フォーム",
          name: "レディック",
          sub: "戈フォーム",
          calls: ["戈フォーム！！！", "BREAK & Destroy！！！"],
          quote: "火力を突き詰め、華火の支援を突破力へ変える。",
          overview: [
            "無神千桐が変身する第一形態。在原華火とコンビを組むため、支援系を名目とする彼女と対になるよう、火力を突き詰めたフォームとなっている。",
          ],
          stats: [
            { dt: "HEIGHT", dd: "209.6cm" },
            { dt: "WEIGHT", dd: "99.8kg" },
            { dt: "PUNCH", dd: "2t" },
            { dt: "KICK", dd: "15t" },
            { dt: "JUMP", dd: "58.3m" },
            { dt: "100m", dd: "4.7秒" },
          ],
          abilities: [
            { name: "戦", body: "『戦』の文字を書き出し、変身状態のスペックを1.35倍へ引き上げる。円龍幻月刀の使用中に限り、必殺技ヴァルキリーを放てる。" },
            { name: "戒", body: "敵の攻撃へ備え、カウンターを当てる。一度以上見た、または受けた技に限って実行できる。" },
          ],
          arsenal: [
            { name: "円龍幻月刀", body: "関雲長が用いた青龍刀に酷似する大型武器。読みは『えんりゅうげんげつとう』。" },
          ],
          finishers: [
            { name: "ヴァルキリー", body: "『戦』による強化中、円龍幻月刀から放つ戈フォームの必殺技。" },
          ],
        },
        {
          img: "/rider-leddic-rekka.jpeg",
          pos: "50% 8%",
          system: "レディックウォッチ × 灬フォーム",
          name: "レディック",
          sub: "灬フォーム",
          calls: ["灬フォーム！！！！", "Frame To BURST！！！！"],
          quote: "炎と脚力を、一瞬の突破へ。",
          overview: [
            "無神千桐が変身する第二形態。『れっか』の名どおり脚の速さを突き詰め、灬が火を表す字であることから炎系の部首も扱う。二つのフォームでありながら、実質的には三つのフォームに相当する運用幅を持つ。",
          ],
          stats: [
            { dt: "HEIGHT", dd: "199cm" },
            { dt: "WEIGHT", dd: "72kg" },
            { dt: "PUNCH", dd: "0.2t" },
            { dt: "KICK", dd: "68.2t" },
            { dt: "JUMP", dd: "88m" },
            { dt: "100m", dd: "0.5秒" },
          ],
          abilities: [
            { name: "無", body: "一度の変身につき一度だけ、どのような攻撃も受けない。" },
            { name: "烈", body: "炎爪の炎をさらに熱くし、勢いを数倍へ引き上げる。脚部の噴出口からガスとして放ち、移動速度を高めることもできる。" },
          ],
          arsenal: [
            { name: "炎爪", body: "読みは『えんそう』。握り込むと爪が飛び出す紅い鉤爪で、刃同士を擦り合わせて炎を起こす。" },
          ],
        },
      ],
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
  {
    id: "cipher",
    no: "08",
    name: "CIPHER",
    ja: "サイファー",
    person: "リュシアン・ヴァレール",
    enPerson: "LUCIEN VALÈRE",
    epithet: "最期の死者",
    tone: "#f05bcf",
    img: "/rider-cipher.jpeg",
    pos: "50% 8%",
    civilianImg: "/civilian-cipher.jpeg",
    civilianPos: "50% 20%",
    title: "最期の死者",
    quotes: [
      "信用なんて要らねえよ。俺が仕事を終わらせるまで、敵だと思ってろ",
      "俺は媚びねぇ…俺に踏み込んで来んな",
      "そうやって俺達は、延々と滅亡の未来を辿る運命か…！",
    ],
    facts: [
      { dt: "NAME", dd: "リュシアン・ヴァレール" },
      { dt: "AGE", dd: "30歳" },
      { dt: "GENDER", dd: "男性" },
      { dt: "NATIONALITY", dd: "フランス" },
      { dt: "HEIGHT", dd: "186.2cm" },
      { dt: "WEIGHT", dd: "78.4kg" },
      { dt: "AFFILIATION", dd: "SCARS" },
      { dt: "ROLE", dd: "特務情報官" },
      { dt: "CV", dd: "内山昂輝" },
    ],
    sections: [
      {
        no: "01",
        kicker: "DOUBLE IDENTITY / ISOLATED LINE",
        title: "味方である事実さえ、潜入を守るための機密になる。",
        body: [
          "REALMSフランス本部に所属する特務情報官でありながら、表向きはSCARSの構成員として行動する潜入要員。ベルは『Deception World』開始以前から彼の正体を知る数少ない人物だが、二人の情報共有はREALMSの正規通信網からさえ隔離されている。記録へ残る連絡経路そのものが潜入の痕跡になるため、味方へ身分を証明することすら任務上の危険となる。",
          "その結果、悠真を含む日本支部側の大半は、リュシアンを純粋なSCARS構成員として認識している。彼は誤解を解こうとはせず、むしろ敵として警戒される立場を維持する。協力者の名簿へ載ることより、敵組織が抱く人物像から一度も逸脱しないことを優先し、自分が疑われ続ける状況そのものを防壁として利用する。",
        ],
      },
      {
        no: "02",
        kicker: "PROFESSIONAL / CONTROLLED PERCEPTION",
        title: "信用ではなく、相手の認識を制御する。",
        body: [
          "徹底したプロフェッショナル。目的、必要情報、成功条件、撤退条件を常に切り分け、感情的な好悪を任務判断へ混ぜることを嫌う。愛想を振り撒かず、信用を獲得すること自体にも興味を示さない。潜入で重要なのは好かれることではなく、《相手が自分をどういう人物だと思っているかを把握し、その認識から逸脱しないこと》だと考えているからだ。",
          "必要なら敵を助け、味方を攻撃し、故意に任務を失敗させる。潜入役としての整合性を守るため、本当に仲間へ損害を与える判断すら行うが、それは残酷さの誇示ではない。どこまで失えば潜入を継続でき、どの地点を越えれば任務そのものが無意味になるのかを、冷静に計算した結果である。彼にとって演技とは表情や口調だけではなく、周囲が観測する結果まで含めて完成させるものだ。",
          "一方で、計画が崩れた際には撤退条件へ即座に切り替える。正体を守ることへ固執して目的を失うのではなく、情報の回収、対象の排除、味方の生存のうち何を残せるかを選び直す。『俺は媚びねぇ…俺に踏み込んで来んな』という拒絶は、孤立を恐れない強さであると同時に、任務が終わるまで誰にも本心を渡さない危うさでもある。",
        ],
      },
      {
        no: "03",
        kicker: "ETHICS / NECESSARY LOSS",
        title: "犠牲を必要という一語で閉じる者を、決して許さない。",
        body: [
          "無関係な人間を使い捨てることを極端に嫌う。任務上どうしても避けられなかった犠牲と、自分たちの無能や準備不足が生んだ犠牲を同じ言葉で処理する者へは、露骨な嫌悪を向ける。「必要な犠牲だった、で報告書を閉じる奴は大体ただの馬鹿だ」という言葉には、損失を数字へ変換して責任から逃げる態度への拒絶が表れている。",
          "彼自身も味方へ損害を与え得る立場だからこそ、発生した代価の責任を曖昧にしない。誰を危険へ置いたのか、ほかに選択肢はなかったのか、次に同じ損失を防ぐには何を変えるべきかを記録する。冷淡に見える判断の内側には、犠牲を美化せず、失われたものを任務成功の陰へ隠さない厳格な倫理がある。",
        ],
      },
      {
        no: "04",
        kicker: "RELATIONS / HOSTILE MASK",
        title: "悪態の奥で、必要な情報だけは一度も取りこぼさない。",
        body: [
          "口調は冷静だが、育ちの良いフランス人らしい言葉遣いからは少し遠く、親しい相手ほど口が悪い。旧知のベルには特に容赦がなく、ベルもその態度へ慣れているため、互いに悪態を交わしながら必要な情報だけを正確に交換する。余計な情緒を通信へ残さない二人の会話は、冷たさではなく長い信頼によって成立した実務の形でもある。",
          "悠真には潜入任務の都合から、長期間にわたって明確な敵意を演じる。ただし、悠真が自分を削って他者を守ろうとする危うい自己犠牲性への苛立ちだけは演技ではない。世界が延々と滅亡の未来を辿る運命そのものへ怒りを抱きながら、味方だと明かせないまま本気で批判し続け、やがて彼自身が悠真を庇って死亡する。その結末は、感情を任務へ持ち込まないと決めた男が、最後には自分の命を判断へ組み込んだという皮肉を残す。",
        ],
      },
      {
        no: "05",
        kicker: "CIPHER / INFORMATIONAL UNCERTAINTY",
        title: "正体が消えても、取得した情報だけは生還させる。",
        body: [
          "サイファーシステムは、直接的な戦闘や異常存在対処を主目的とする通常のREALMS SYSTEMとは異なり、潜入、偽装、情報収集、対組織工作へ特化している。認証や権限そのものを奪うのではなく、敵側から何者として認識されるかを揺らし、位置、敵対判定、発信点へ複数の偽情報を混ぜることで、《本人を示す情報》を不確定にする。",
          "取得した情報は『DEAD DROP』によって周囲へ微細な暗号として分散保存される。捕縛されても、死亡しても、後からREALMSが回収できる。正体が露見して潜入を継続できなくなれば、ブラックサイトへ移行し、偽装へ割いていた資源を身体駆動、武装、敵解析へ転用する。自分が生還できない局面でも、仕事と記録だけは終わらせる。それが、最期の死者と呼ばれるリュシアンの戦い方である。",
        ],
      },
    ],
    forms: [
      {
        img: "/rider-cipher.jpeg",
        pos: "50% 8%",
        system: "サイファードライバー × プロキシコア",
        name: "サイファー",
        calls: ["CIPHER IN!", "NO TRACE!", "ROLLOUT!", "CIPHER!", "ON EARTH!?"],
        overview: [
          "リュシアンがREALMSフランス本部で極秘開発された『サイファードライバー』と『プロキシコア』を使用して変身する仮面ライダー。通常のREALMS SYSTEMが直接戦闘と異常存在対処を目的とするのに対し、潜入、偽装、情報収集、対組織工作を主目的に設計された。",
          "純粋な性能だけでもインテグラルサーガやヴァーテックスサーガにも迫る戦闘力を持つが、本領は数値ではなく《情報的不確定性》を利用した戦闘にある。",
        ],
        stats: [
          { dt: "HEIGHT", dd: "211.8cm" },
          { dt: "WEIGHT", dd: "88.6kg" },
          { dt: "PUNCH", dd: "68.8t" },
          { dt: "KICK", dd: "118.6t" },
          { dt: "JUMP", dd: "128.8m" },
          { dt: "100m", dd: "0.18秒" },
          { dt: "CALCULATION", dd: "7200TOPS / 96Core" },
          { dt: "AI", dd: "SPECTRE" },
          { dt: "EMP", dd: "2400E" },
        ],
        abilities: [
          { name: "SPOOF", body: "対象の認証信号、通信形式、権限署名を解析し、限定的な偽装信号を生成する。管理権限そのものをコピーせず、《敵側システムから何者として認識されるか》だけを偽装する。" },
          { name: "TRACE", body: "敵が能力や命令を行使した際、処理の発生源と対象までの経路を追跡する。通信、エネルギー、管理権限、戦闘命令を流れとして捉え、攻撃すべき中継点や情報源を特定する。" },
          { name: "PROXY", body: "自身の位置情報、敵対判定、通信発信点へ複数の偽信号を混入する。分身ではなく、《どの情報が本人を示すのか》を曖昧化し、高度な解析能力を持つ敵ほど判断負荷を増大させる。" },
          { name: "DEAD DROP", body: "戦闘中に取得した情報を周囲へ微細な暗号情報として分散保存する。リュシアン本人が捕縛・死亡した場合でもREALMS側が後から回収でき、SCARS内部で得た情報の多くをベルへ届けている。" },
        ],
        finishers: [
          { name: "サイファーエンター", body: "『TRACE』で対象の視線、照準、攻撃予測を解析した後、『PROXY』によって複数方向へ偽の突入情報を生成して発動。敵の認識上では複数のライダーキックが同時に接近する中、本体は側方を通過するように跳躍し、空中で身体を反転させながら背後方向へ蹴撃を放つ。接触直前に『NO TRACE』で偽信号を一斉消去し、本物の位置を再認識される前に命中させる。" },
        ],
      },
      {
        img: "/rider-cipher-blacksite.jpeg",
        pos: "50% 7%",
        system: "サイファードライバー × プライムコア",
        name: "サイファー・ブラックサイト",
        sub: "BLACKSITE",
        calls: ["CIPHER IN!", "BLACKSITE!", "ROLLOUT!", "ERASE THE TRACE!", "CIPHER BLACK!", "FOCUS ON!"],
        overview: [
          "リュシアンがREALMSフランス本部で極秘開発された『サイファードライバー』と『プライムコア』を使用して変身する仮面ライダー。潜入継続が不可能となった場合、または対象を確実に排除しなければ任務を達成できない場合に移行する強襲戦闘形態である。",
          "通常サイファーが《正体を隠しながら仕事を終える》形態なら、ブラックサイトは《正体が露見した後でも仕事だけは終わらせる》ための形態である。",
          "SPOOFやPROXYへ割り当てていた演算資源とEMPの大部分を身体駆動、武装、敵解析へ転用し、戦闘能力を飛躍的に向上させる。短時間ならヴィンクルムサーガやレルムレジェンズ級とも正面から交戦可能だが、純粋な総合戦闘性能ではレルムレジェンズを下回る。",
        ],
        stats: [
          { dt: "HEIGHT", dd: "217.8cm" },
          { dt: "WEIGHT", dd: "108.8kg" },
          { dt: "PUNCH", dd: "176.8t" },
          { dt: "KICK", dd: "248.8t" },
          { dt: "JUMP", dd: "188.8m" },
          { dt: "100m", dd: "0.045秒" },
          { dt: "CALCULATION", dd: "18000TOPS / 144Core" },
          { dt: "AI", dd: "SPECTRE BLACK" },
          { dt: "EMP", dd: "5200E" },
        ],
        abilities: [
          { name: "BLACKOUT", body: "敵の視覚、通信、照準、能力発動補助へ流入する情報を一時的に分断する。完全な能力封印ではなく、情報入力と出力の間へ僅かな遅延を生じさせ、数瞬だけで致命的な間合いへ侵入する。" },
          { name: "BURN NOTICE", body: "潜入任務中に取得した対象の戦闘情報を一括解放し、現在の敵へ特化した戦闘プロファイルを構築する。長期間観測した相手ほど攻略精度が高い一方、未観測の敵への恩恵は少なく、未知への適応力はレルムレジェンズなどに劣る。" },
        ],
        finishers: [
          { name: "サイファーコンカー", body: "『BURN NOTICE』で対象の攻撃認識条件を解析し、『BLACKOUT』によって自身の加速、敵対信号、必殺技反応を通常動作として誤認させて発動。真正面から高速接近した後、間合い寸前で垂直に跳躍し、対象の頭上を越えながら身体を前方へ反転する。逆さの姿勢から斜め下へ高出力の回転蹴りを叩き込み、接触直前まで防御及び回避判断を遅延させた状態で命中させる。" },
        ],
      },
    ],
    civilian: {
      name: "リュシアン・ヴァレール",
      kicker: "BEFORE TRANSFORMATION / SCARS",
      body: "変身前ビジュアル // CONFIRMED。REALMSフランス本部からSCARSへ潜入した特務情報官。",
      cv: "内山昂輝",
    },
  },
];

export function RiderPage({ id }: { id: string }) {
  useWorldMode();
  const rider = RIDER_DOSSIERS.find((r) => r.id === id) ?? RIDER_DOSSIERS[0];
  const nightmareRef = useRef<HTMLDialogElement>(null);
  const cancelNightmareScrollReset = useRef<(() => void) | null>(null);
  useEffect(() => {
    rememberRiderReturn(rider.id);
  }, [rider.id]);
  const resetNightmareScroll = () => {
    const dialog = nightmareRef.current;
    if (dialog) resetPickupScroll(dialog, [".rider-nightmare-dialog-panel"]);
  };
  const openNightmare = () => {
    const dlg = nightmareRef.current;
    if (!dlg) return;
    cancelNightmareScrollReset.current?.();
    try {
      dlg.showModal();
    } catch {
      /* already open */
    }
    cancelNightmareScrollReset.current = settlePickupScroll(dlg, [".rider-nightmare-dialog-panel"], () => {
      dlg.focus({ preventScroll: true });
    });
  };
  const closeNightmare = () => {
    cancelNightmareScrollReset.current?.();
    cancelNightmareScrollReset.current = null;
    nightmareRef.current?.close();
  };
  const primaryForm = rider.forms[0];
  const partnerForms = rider.partner?.forms ?? [];
  const pickupForms =
    rider.id === "saga"
      ? rider.forms.filter((form) => form.featuredPickup)
      : rider.id === "cipher" ? rider.forms
        : rider.id === "leddic" ? rider.forms
          : primaryForm
            ? [primaryForm]
            : [];
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
        <GuardedLink to="/world" hash="riders-return" assets={[]} className="brand">
          <span className="brand-sigil">
            <i>DW</i>
          </span>
          <span>
            <b>DECEPTION WORLD</b>
            <small>CHARACTER FILE // {rider.no}</small>
          </span>
        </GuardedLink>
        <GuardedLink to="/world" hash="riders-return" assets={[]} className="manager-back" aria-label="ライダー一覧へ戻る">
          <span>ライダー一覧へ戻る</span>
          <i aria-hidden="true">
            <UiVectorIcon kind="arrow-down-left" size={14} />
          </i>
        </GuardedLink>
      </header>
      <section className="manager-hero">
        <div className="manager-portrait-column">
          <div className="manager-portrait-frame">
            <img src={rider.civilianImg} alt={`${rider.civilian.name}の変身前ビジュアル`} style={{ objectPosition: rider.civilianPos, objectFit: "cover" }} loading="eager" decoding="async" fetchPriority="high" />
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
      <section
        className={`rider-archive-identity-records${rider.nightmare ? " has-nightmare" : ""}${rider.partner ? " has-partner" : ""}`}
        aria-label={rider.partner ? "変身前記録と相棒記録" : "変身前記録"}
      >
        <figure className="rider-archive-civilian">
          <div className="rider-archive-civilian-visual">
            <img src={rider.civilianImg} alt="" style={{ objectPosition: rider.civilianPos }} loading="lazy" decoding="async" fetchPriority="low" />
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
        {rider.partner ? (
          <figure className="rider-archive-civilian rider-partner-card">
            <div className="rider-archive-civilian-visual">
              <img
                src={rider.partner.image}
                alt={`${rider.partner.name}の人物ビジュアル`}
                style={{ objectPosition: rider.partner.pos }}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
              <span>PARTNER</span>
              <i className="rider-archive-civilian-shade" />
            </div>
            <figcaption>
              <p>{rider.partner.kicker}</p>
              <small>{rider.partner.tag}</small>
              <h2>
                <NameText value={rider.partner.name} />
              </h2>
              <p className="rider-partner-en-name">{rider.partner.enName}</p>
              <q className="rider-partner-call">{rider.partner.call}</q>
              <div className="rider-partner-copy">
                {rider.partner.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                ))}
              </div>
              <dl>
                {rider.partner.facts.map((fact) => (
                  <div key={fact.dt}>
                    <dt>{fact.dt}</dt>
                    <dd>{fact.dd}</dd>
                  </div>
                ))}
              </dl>
            </figcaption>
          </figure>
        ) : null}
        {rider.nightmare ? (
          <article className="rider-nightmare-card">
            <div className="rider-nightmare-card-visual">
              <img src={rider.nightmare.img} alt={`${rider.nightmare.name}のビジュアル`} style={{ objectPosition: rider.nightmare.pos }} loading="lazy" decoding="async" fetchPriority="low" />
              <span>NIGHTMARE</span>
              <i className="rider-nightmare-card-shade" />
            </div>
            <div className="rider-nightmare-card-copy">
              <p>{rider.nightmare.kicker}</p>
              <small>PICKUP</small>
              <h2>
                <span>{rider.nightmare.name}</span>
              </h2>
              <q>{rider.nightmare.quote}</q>
              <SlideOpenControl
                className="rider-nightmare-pickup-button"
                ariaLabel={`${rider.nightmare.name}をピックアップ`}
                label="記録を開く"
                onOpen={openNightmare}
              />
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
      {pickupForms.length ? (
        <div className="rider-form-pickup-stack">
          {pickupForms.map((form, index) => (
            <FormPickup
              key={`${form.name}-${form.sub ?? "base"}`}
              rider={{
                img: form.img,
                pos: form.pos,
                system: form.system,
                name: form.displayName ?? (index === 0 ? rider.ja : form.name),
                sub: form.sub ?? (index === 0 && form.name !== rider.ja ? form.name : undefined),
                calls: form.calls,
                quote: form.quote,
                overview: form.overview,
                theme: form.theme,
                stats: form.stats,
                abilities: form.abilities,
                arsenal: form.arsenal,
                finishers: form.finishers,
                weaponGallery: form.weaponGallery,
                extraForms:
                  rider.id === "saga"
                    ? form.theme === "rexonance"
                      ? undefined
                      : rider.forms.filter((candidate) => !candidate.featuredPickup || candidate === form)
                    : index === 0
                      ? rider.forms
                      : undefined,
              }}
            />
          ))}
        </div>
      ) : null}
      {rider.partner && partnerForms.length ? (
        <section className="rider-partner-forms" aria-labelledby="rider-partner-forms-title">
          <header>
            <p>SKILLED DUO / SECOND RIDER RECORD</p>
            <h2 id="rider-partner-forms-title">
              <NameText value={rider.partner.name} />の変身記録
            </h2>
          </header>
          <div className="rider-form-pickup-stack">
            {partnerForms.map((form) => (
              <FormPickup
                key={`${form.name}-${form.sub ?? "base"}`}
                rider={{
                  img: form.img,
                  pos: form.pos,
                  system: form.system,
                  name: form.name,
                  sub: form.sub,
                  calls: form.calls,
                  quote: form.quote,
                  overview: form.overview,
                  stats: form.stats,
                  abilities: form.abilities,
                  arsenal: form.arsenal,
                  finishers: form.finishers,
                }}
              />
            ))}
          </div>
        </section>
      ) : null}
      <DossierNav items={RIDER_NAV} currentHref={`/riders/${rider.id}`} indexLabel="EIGHT RIDERS" />
      {rider.nightmare ? (
        <dialog
          ref={nightmareRef}
          className="rider-nightmare-dialog"
          tabIndex={-1}
          aria-label={rider.nightmare.name}
          onClose={resetNightmareScroll}
          onCancel={(e) => {
            e.preventDefault();
            closeNightmare();
          }}
          onClick={(e) => {
            if (e.target === nightmareRef.current) closeNightmare();
          }}
        >
          <div className="rider-nightmare-dialog-panel">
            <button type="button" className="rider-nightmare-dialog-close" data-liquid-pointer="true" onClick={closeNightmare} aria-label="閉じる">
              <LiquidPointerGlow />
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
                <img src={rider.nightmare.img} alt="" style={{ objectPosition: rider.nightmare.pos }} loading="lazy" decoding="async" fetchPriority="low" />
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
