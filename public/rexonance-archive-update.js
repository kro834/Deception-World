(function () {
  "use strict";

  var FORM_IDS = ["rexonance", "rexonance-max", "rexonance-ultra"];
  var FORM_META = {
    rexonance: {
      title: "レクソナンスサーガ",
      subtitle: "超究極｜無限出力を実効攻撃へ完成させた通常運用形態",
      badge: "統合設定更新",
      comparison: "超自己進化と絶対秩序をSA-GA OS 5.5で統合し、無限出力を実効攻撃へ完成させた通常運用形態。",
      stats: [
        ["身長・体重", "244.9cm / 190.8kg"],
        ["パンチ・キック", "332.2t / 480.5t"],
        ["ジャンプ・100m", "6000m / 0.00021秒"],
        ["飛行速度", "測定不能"],
        ["演算", "50000YOPS / ∞Core（KHAOS DeuX）"],
        ["演算2", "9000TOPS / 300Core（KOSMOS DeuX / Paranormal Realizer Ultra / Neural Resonancer Ultra / P14）"],
        ["EMP", "無制限"],
        ["運用", "HIGH / 高安定・高継戦"],
      ],
    },
    "rexonance-max": {
      title: "レクソナンスサーガ・マックス",
      subtitle: "超究極・攻撃限界拡張｜P14完全加速・全神飾連続実装",
      badge: "MAX設定更新",
      comparison: "攻撃動作の途中で全身出力を必要部位へ再配分し、SA-GA OS 5.5が生体負荷まで監視して不要な仮説を破棄した資源をREXONANCE DRIVEへ還元する。",
      stats: [
        ["段階", "レクソナンスの攻撃限界拡張状態"],
        ["中核", "P14完全加速 / 全神飾連続実装"],
        ["出力制御", "一動作中に必要部位へ連続再配分"],
        ["作用領域", "エフェクティブ・エリアを縮小"],
        ["伝達領域", "トランスミッション・エリアを短縮"],
        ["統合制御", "SA-GA OS 5.5 / REXONANCE SCALER《MAX》"],
        ["資源運用", "不要仮説を破棄しDRIVEへ還元"],
        ["時間制限", "明示なし"],
      ],
    },
    "rexonance-ultra": {
      title: "レクソナンスサーガ・ウルトラ",
      subtitle: "超究極・最上位｜60秒間の単一実在収束",
      badge: "ULTRA / 60秒",
      comparison: "身体・武装・リアクター・極小主権宇宙を一つの攻撃機関へ統合し、超自己進化と絶対秩序で現在動作へ全資源を集中する。",
      stats: [
        ["段階", "マックスから移行する最上位状態"],
        ["持続時間", "60秒"],
        ["総供給可能量", "無制限"],
        ["単位時間供給", "供給速度に上限あり"],
        ["領域", "極小主権宇宙"],
        ["収束", "単一実在収束"],
        ["演算", "REXONANCE SCALER《ULTRA》"],
        ["共通障害", "三つの固定点が同時不安定化した場合に波及"],
      ],
    },
  };

  function paragraphs(items) {
    return items.map(function (item) { return "<p>" + item + "</p>"; }).join("");
  }

  function cards(items, className) {
    return '<div class="' + className + '">' + items.map(function (item) {
      return "<article><h5>" + item[0] + "</h5><p>" + item[1] + "</p></article>";
    }).join("") + "</div>";
  }

  var OVERVIEW = [
    "月城悠真が『エクスサーガドライバー』へ『デュアルエクスコア』と『レクソナンスコア』を使用して変身する、攻撃性能へ超特化した仮面ライダーサーガの超究極フォーム。『エクスプリームサーガ』の設計思想を継承・完成させた正統後継機であり、サーガシステムそのものの最終到達形態である。",
    "本形態を成立させる根源は一柱の神ではない。《秩序》と《破壊》を司り、管理体系における実質的な主権を握るレックス・ロワ。最高位の神格として生まれた五代目のゼウス。そして、そのゼウスから『神として不要な悪性』として切り離されながら、既に独立した人間として生き、月城悠真という人格を獲得した悠真自身。この三者を吸収・融合して一つへ戻すのではなく、互いを独立した存在のまま共鳴させ、一人の月城悠真へ戦闘出力だけを集約する《共鳴》によって成立する。『レクソナンス』のアビリティも本質は『超共鳴』である。",
    "『エクスプリームサーガ』は、対象の強度、規模、存在階層へ応じ、戦闘中に必要となる攻撃出力の上限を事実上撤廃することを目的として設計されていた。その最高出力状態『エクスプリームサーガ・ウルトラ』は、従来のサーガシステムにおける純粋攻撃性能の頂点である。",
    "レクソナンスサーガは、その無制限出力増幅機構を基礎技術として内包した上で、『REXONANCE DRIVE』『REXONANCE DEUS』『KHAOS DeuX』『KOSMOS DeuX』を統合。発生した攻撃出力を、踏み込み、加速、姿勢維持、装甲突破、位相貫通、権限干渉、存在構造への伝達という攻撃成立までの全工程へリアルタイムで再配分し、対象へ最も効率良く到達する形へ変換し続ける。",
    "対象へ実際に作用する領域『エフェクティブ・エリア』を極限まで圧縮し、同一出力をより狭い範囲へ集中することで、単位面積当たりのエネルギー密度を飛躍的に増大させる。装甲内部では『トランスミッション・エリア』を最短化し、反射、散逸、位相ずれ、余剰熱などとして失われる出力を最低限へ抑える。つまり同じ無限出力領域を扱った場合にも、実際に対象へ到達する《実効攻撃性能》に明確な差が生じる。",
    "『ユナイトエッジ・ランサーモード』による適切な距離からの攻撃は、理論上『ヴィンクルム・マジック』を上回る貫通性能及びダメージ値を記録。攻撃を構成する周波数、位相、権限署名自体もリアルタイムで変化するため、一般的な《無効化》系統に対しては、その成立条件から外れる攻撃構成へ逐次遷移する。加えて『REXONANCE DEUS』の超高位管理権限は、《反管理権限》すら権限競合によって正面から圧倒し、その拒否処理を押し退けた上で攻撃を成立させる。",
    "通常状態の時点で『エクスプリームサーガ・ウルトラ』以上の実効戦闘性能を持ち、『マックス』『ウルトラ』ではその差が更に拡大する。レクソナンスサーガとは、エクスプリームによって開かれた《無限出力》という回答を捨てた形態ではない。その無限出力を、無限の攻撃として完成させた形態である。副次的効果としてエクスプリームよりもスリムなフォルムとなり、より身軽な動きができる。",
    "ゼウス由来の《超自己進化》によって現在の自身を絶えず次世代状態へ更新し、レックス由来の《絶対秩序》によって、その進化結果を即座に破綻のない戦闘体系として成立させる。そのため本形態は、進化によって秩序を失わず、秩序によって進化を停止しない。",
  ];

  var SAGA_OS = [
    "レクソナンスサーガに搭載された、変身者の戦闘能力を根本から拡張する統合戦闘OS。『Paranormal Realizer Ultra』『Neural Resonancer Ultra』『KHAOS DeuX』『KOSMOS DeuX』から得られる情報を変身者本人の知覚・判断・運動制御へ直接反映し、通常なら長期間の実戦経験によって獲得する間合い感覚、重心把握、予備動作の識別、攻防切替、武器操作、状況判断などを極めて高い水準まで引き上げる。",
    "『パラレム』のような単純な自動操縦ではなく、月城悠真自身の意思決定を基礎として、その判断速度と実行精度をシステム側から拡張する機構である。悠真本人の戦闘経験や直感も失われず、SA-GA OS 5.5による予測情報と統合されることで、通常時とは比較にならない戦闘センスを発揮する。",
    "本来の変身者が持つ情報処理能力や肉体性能を遥かに超えた戦闘動作を成立させるため、使用者へ非常に大きな負荷を与える。高速化された認識と判断へ脳が追従し続けることで強い処理負荷が発生し、神経系も通常ではあり得ない頻度で運動命令と感覚情報を往復させる。最適動作を肉体へ反映する際には、筋力、関節可動、反応速度、細胞活動にも本来の身体能力を上回る要求が掛かり、長時間の高負荷運用では全身へ強いストレスが蓄積する。",
    "ただしOS自体も《超自己進化》の対象となる。一度発生した神経同期の遅延、運動制御上の無駄、肉体への過剰要求などは『KHAOS DeuX』によって解析され、『KOSMOS DeuX』と《絶対秩序》による検証を経て次回以降の補正機構へ反映される。",
    "補助は単なる予測表示に留まらず、悠真自身の直感、経験、反射判断と演算結果を一体化することで、本来の肉体では到達不能な戦闘技量を疑似的に成立させる。そのため同一性能の肉体を別の変身者が使用した場合でも、レクソナンスサーガと同等の戦闘能力を発揮できるとは限らない。",
  ];

  var FORM_STAGES = [
    ["レクソナンス／HIGH", "通常運用形態。エクスプリーム・ウルトラ以上の実効性能を、極めて高い安定性と継戦能力を伴って維持する。表記されるパンチ力やキック力等は標準運用時の数値であり、無制限出力増幅及びREXONANCE DRIVEによる瞬間集中状態の最大値を意味しない。"],
    ["レクソナンス・マックス", "レクソナンスコアを強く押し込むことで移行する攻撃限界拡張状態。P14を完全加速し、全神飾を攻撃用機構へ連続実装。踏み込み、加速、防御圏侵入、武装駆動、命中という一動作の途中で全身の戦闘出力を必要部位へ何度も移し替える。エフェクティブ・エリアとトランスミッション・エリアを縮小し、SA-GA OS 5.5を介して生体負荷まで監視。REXONANCE SCALERを《MAX》へ移行して不要な仮説を高速破棄し、節約したEMP、演算帯域、放熱余力をREXONANCE DRIVEへ還元する。"],
    ["レクソナンス・ウルトラ", "マックス状態から更なる固有操作によって移行する60秒間の最上位状態。エーテルの総供給可能量は無制限だが、単位時間当たりの供給速度には上限がある。月城悠真の肉体、使用武装、レクソナンスリアクター、周囲の極小主権宇宙を一つの巨大な《攻撃機関》として統合し、全演算・神属権限・出力を現在動作へ集中する《単一実在収束》を行う。対象モデルが収束するとSCALERを《ULTRA》へ移行し、不要な再推論を停止して解放資源を身体駆動、武装出力、神属権限へ直結する。単一実在収束中は《超自己進化》が一動作専用の最適状態へ更新し、《絶対秩序》がそれらを一つの攻撃体系として固定する。リアクター、二柱由来の神格接続、悠真の人格固定点が同時に不安定化した場合は全機能へ共通障害が波及する。"],
  ];

  var ABILITIES = [
    ["超自己進化", "ゼウスより継承された最高位神格の性質。生成された進化候補はKOSMOS DeuXによる整合性検査、絶対秩序による構造監査、SA-GA OS 5.5による生体適合判定を経て実装される。現行の肉体、神格、人格固定点と両立不能な進化のみを事前に除外し、進化速度を低下させず過剰進化による自己崩壊を防止する。"],
    ["絶対秩序", "レックスより継承された秩序の神性。複雑に絡み合った物質、能力、権限、因果、存在構造へ境界と役割を与え、戦闘に必要な形へ再整理する。超自己進化によって発生した状態も即座に体系化し、出力の暴走や権限同士の衝突を抑えながら、一つの実行可能な攻撃構造として成立させる。"],
    ["REXONANCE NANO ARMOR", "全身を構成する超高密度ナノテクノロジー装甲。膨大なナノマシン群がKHAOS DeuX、KOSMOS DeuX、REXONANCE DRIVEの演算結果に従って常時再配置され、硬度、密度、熱伝導、エネルギー伝達経路、位相特性、権限署名をリアルタイムで変更する。超自己進化の結果を物理構造へ反映し、絶対秩序が全ナノマシンの配置と役割を再定義する。攻撃時は必要部位へ構造材と伝達機能を集中し、接触直前にナノ構造を出力伝達方向へ整列させてトランスミッション・エリアを極限まで短縮する。ウルトラでは全身を悠真が選択した一動作専用の構造へ一時再編成する。"],
    ["REXONANCE DRIVE", "KHAOS DeuXが成立可能な最高攻撃状態を多数生成し、KOSMOS DeuXが破綻なく実行できる案だけを選択。脚部、推進、前面装甲、拳・脚・刀身、命中後の対象内部へ、一動作中に出力を連続再配分する。"],
    ["ラーニング", "一撃を重心、意図、能力条件、夢界接続、精神状態、因果揺らぎへ分解。KHAOS DeuXが対抗案を生成し、KOSMOS DeuXが実行可能性を型検査する。観測済みの攻撃へ即応できるが、未使用能力や条件の異なる派生技には追加観測を要する。"],
    ["拒絶", "成立前否決能力が進化。同格以下の現象について、対象全体ではなく悪夢・侵食・偽の役割・不要な可能性・能力と対象の不正接続だけを切り離す。固定済みの結果を消すのではなく、損傷拡大・残留・転嫁・再発へ続く経路を拒絶する。"],
    ["REXONANCE DEUS", "レックス由来の《管理主権・秩序・破壊》とゼウス由来の《最高位神格・第一性》を月城悠真自身の意思へ従わせて運用する神属権限統合機構。レックス側は敵の装甲、再生、支配、管理接続を解析し、攻撃すべき部分だけを《破壊可能な構造》へ落とし込む。ゼウス側は悠真が承認した攻撃へ一時的な《第一実行権》を与え、無効化、防御、転嫁、再構築と競合した際に攻撃側を先に評価させる。周囲の極小主権宇宙では外部管理人の命令を《権限要求》として監査し、条件を満たさない命令を拒絶、隔離、限定実行する。OSを除く形態自体の負荷は極めて小さいが、世界、生命、因果、存在構造へ大規模な管理権限を行使した場合、その処理負荷は悠真へ集中する。複数の死亡者の修復などでは変身解除後に行動不能へ陥る場合がある。《反管理権限》も外部権限要求として捕捉して管理体系へ組み込み、レックスの管理主権で作用範囲を限定し、ゼウスの第一性で悠真側の処理を上位へ配置することで拒否を押し退ける。超自己進化が新たな拒否形式へ権限構造を逐次更新し、絶対秩序が更新体系を安定化する。何を破壊し、何を保存し、どこまで権限を使うかという最終決定権は常に悠真へ固定され、二柱の意思が人格を上書きすることはない。"],
    ["Exception World", "同時成立しない能力・法則・結果を隔離された例外領域内で一時成立させる。異なる体系を世界全体へ混合せず局所領域へ封入し、終了後に整合性検査を実施。未解決矛盾は位相熱と因果負荷として回収される。"],
  ];

  var ARSENAL = [
    "フェイタルエッジ",
    "レルムスレイヤー",
    "レルムスレイヤー・マークⅥ",
    "レルムスレイヤー・マークⅩⅣ",
    "メビウスネイバー",
    "レジェンズエッジ",
    "アクシスレイカー・マークⅦ",
    "ユナイトエッジ",
  ];

  var FINISHERS = [
    ["ハイグリーム・エッジ", "『CHARGE 1・2・3・4！』『More SHINING！』ユナイトエッジへ全身出力を集中する強斬撃。軌道・出力・作用領域をリアルタイム最適化し、回避されても動作を維持して追撃へ移る。"],
    ["レクソナンスレイド", "『REXONANCE SET！』『REXONANCE RAID！』拳・蹴り・斬撃・射撃を高速連結し、一撃ごとの反動や運動エネルギーまで次の攻撃へ再利用する。"],
    ["スクワッドビッグバン", "『SQUAD Crystal！』『CHARGE 1・2・3・4！』『SQUAD BIGBANG！』任意の4種コアを、KOSMOS DeuXが破綻しない順序へ整理して連続発動する超必殺斬撃。"],
    ["レクソナンス・エクスラッシュ", "『REXONANCE SET！』『CHARGE 1・2・3・4！』『REXONANCE EXSLASH！』デュアルエクスコアの装填により発動する斬撃。対象の防御だけでなく、外部から能力や管理権限を与える接続そのものまで切断する。"],
    ["エクスプロージョン", "『REXONANCE LOAD！』『AXIS CHARGE…！』『EX PLOSION！！』実体弾内部へ量子光線を封入する七段収束射撃。貫通後に内部で出力を解放する。"],
    ["レクソナンスプロージョン", "『REXONANCE LOAD！』『AXIS CHARGE…！』『REXONANCE PLOSION！！』デュアルエクスコアの装填で発動する破壊光線。アクシスレイカー・マークⅦの高出力連続稼働限界である九秒間を一度の攻撃工程として使用する最高位砲撃。Exception Worldで射線を複数の局所例外領域へ屈折・分岐させ、一挺から全方位への連続射撃を成立させる。各弾が回避、防御、転嫁経路を順番に閉鎖し、最後の一発へ集中したエネルギーを対象内部で解放する。"],
    ["レクソナンスメテオ", "『REXONANCE METEOR！』リベレーターを一度操作して発動する分離浄化型ライダーキック。レックス由来の権限で悪夢、侵食、支配、偽の役割などを分離する《ディルクルムフィニッシャー》のような効果と、ゼウス由来の第一性で敵性中枢の抵抗を上書きする《ヴィンクルムマジック》の特性を併せ持つ。悠真が残すべき人格、記憶、生命を選択した後、分離された敵性要素へ超高出力蹴撃を叩き込む。支配された味方の救出にも使用可能。"],
    ["レクソナンスリボルト", "『REXONANCE REVOLT！』リベレーターを二度操作して発動する権限迎撃型カウンター必殺技。攻撃を極小主権宇宙へ一時的に取り込み、物理成分と支配、改変、無効化、転嫁、権限干渉などの付加作用を分離解析する。絶対秩序が境界を設定し、敵性干渉だけを管理対象として捕捉。レックスの管理主権で作用方向を反転し、ゼウスの第一実行権で対象側の再制御や無効化より先に返送する。攻撃全体の無条件反射ではなく、複雑な敵性作用ほど強烈な反撃となる。"],
    ["レクソナンスストライク", "『REXONANCE STRIKE！』光と闇、紅紫と翠緑の神性を脚部へ集中。表層装甲、内部構造、再生中枢、管理接続へ位相衝撃を順に通し、一度の蹴撃を異なる存在階層へ連続命中させる。"],
    ["デウスシフト・レクソナンスパーク", "『LOW！MEDIUM！HIGH！XHIGH！MAX！ULTRA！』『DEUS SHIFT！！』『REXONANCE PERK！！』リベレーターを三度操作し、デュアルエクスコアへ追加操作を行って発動する最高位ライダーキック。身体を正面側へ捻り込み、脚を前方から大きく旋回して足先を先頭に命中させる。踏み切りと同時にREXONANCE DRIVEが始動し、腰部の回転、軸足の反力、上体の捻転、脚部の遠心力を統合しながらLOW→MEDIUM→HIGH→XHIGH→MAX→ULTRAと出力を連続上昇させる。接触へ近付くほどエフェクティブ・エリアとトランスミッション・エリアを縮小し、莫大な出力を足先一点へ集中。反対方向からの進入で既存の防御、回避、カウンターの角度を外し、対象の肉体、装甲、位相、再生機構、管理権限、存在構造を解析して最も破壊効率の高い深度まで衝撃を通す。設計思想を蹴撃動作へ落とし込んだサーガ史上最強の必殺技に相応しい究極の技であり、『ULTRA』選択時は一時的にレクソナンス・ウルトラへ移行する。"],
  ];

  function statMarkup(stats) {
    return stats.map(function (entry) {
      return '<div class="spec-item"><span class="text-small text-muted">' + entry[0] + '</span><span class="spec-value">' + entry[1] + "</span></div>";
    }).join("");
  }

  function dossierStatMarkup(stats) {
    return stats.map(function (entry) {
      return "<div><dt>" + entry[0] + "</dt><dd>" + entry[1] + "</dd></div>";
    }).join("");
  }

  function dossierMarkup(activeId) {
    var active = FORM_META[activeId];
    return '<div class="rexonance-setting-dossier">' +
      '<section class="rexonance-setting-hero"><small>REXONANCE // ' + active.badge + '</small><h4>《 仮面ライダーレクソナンスサーガ 》</h4><p>《 仮面ライダーレクソナンスサーガ・マックス 》</p><p>《 仮面ライダーレクソナンスサーガ・ウルトラ 》</p>' +
      '<div class="rexonance-call-grid"><span>EXCONVERT！</span><span>Ultra DEUS！</span><span>REXONANCE！</span><span>GODSIDE！RIDER！</span><span>SA-GA！DEUS！ SA-GA！DEUS！ SA-GA！DEUS！</span><span>REXONANCE！</span></div></section>' +
      '<section class="rexonance-setting-block"><small>STANDARD SPEC</small><h4>標準運用値</h4><dl class="rexonance-stat-grid">' + dossierStatMarkup(FORM_META.rexonance.stats) + '</dl></section>' +
      '<section class="rexonance-setting-block"><small>OVERVIEW</small><h4>概要</h4>' + paragraphs(OVERVIEW) + '<div class="rexonance-order">エクスプリーム ＜ エクスプリーム・ウルトラ ＜ レクソナンス ＜ レクソナンス・マックス ＜ レクソナンス・ウルトラ</div><p>レクソナンスは《無限出力》を捨てた形態ではなく、その無限出力を、無限の攻撃として完成させた形態である。</p></section>' +
      '<section class="rexonance-setting-block"><small>COMBAT OS</small><h4>SA-GA OS 5.5</h4>' + paragraphs(SAGA_OS) + '</section>' +
      '<section class="rexonance-setting-block"><small>FORM STAGES</small><h4>形態段階</h4>' + cards(FORM_STAGES, "rexonance-ability-grid") + '</section>' +
      '<section class="rexonance-setting-block"><small>ABILITIES</small><h4>能力</h4>' + cards(ABILITIES, "rexonance-ability-grid") + '</section>' +
      '<section class="rexonance-setting-block"><small>ARSENAL</small><h4>追加武装</h4><ul>' + ARSENAL.map(function (item) { return "<li>" + item + "</li>"; }).join("") + '</ul><p>全武装はREXONANCE DRIVEと直結し、従来形態時とは比較にならない出力を発揮する。攻撃対象へ応じて出力、周波数、位相、エフェクティブ・エリアがリアルタイムで最適化される。</p></section>' +
      '<section class="rexonance-setting-block"><small>FINISHERS</small><h4>必殺技</h4>' + cards(FINISHERS, "rexonance-finisher-grid") + '</section>' +
      '</div>';
  }

  function compactMarkup(meta) {
    return '<div class="rexonance-compare-revision"><strong>' + meta.badge + '</strong><p>' + meta.comparison + '</p><p>レックス・ゼウス・悠真を独立したまま共鳴させ、超自己進化・絶対秩序・SA-GA OS 5.5によって無制限出力を攻撃成立までの全工程へ最適配分する。</p></div>';
  }

  function updateCard(card, formId, full) {
    var meta = FORM_META[formId];
    if (!card || !meta) return;
    card.dataset.coverage = "confirmed";
    var title = card.querySelector(".detail-head h3");
    var subtitle = card.querySelector(".detail-head p");
    var badge = card.querySelector(".detail-head .data-badge, .detail-head .viz-badge");
    var grid = card.querySelector(".viz-grid");
    var image = card.querySelector("img.form-art");
    var layout = card.querySelector(".ability-layout");
    if (title) title.textContent = meta.title;
    if (subtitle) subtitle.textContent = meta.subtitle;
    if (badge) {
      badge.textContent = meta.badge;
      badge.classList.remove("is-partial");
      badge.classList.add("is-confirmed");
    }
    if (grid) grid.innerHTML = statMarkup(meta.stats);
    if (image && formId === "rexonance-max") {
      image.src = "/rider-rexonance-max.webp";
      image.alt = "仮面ライダーレクソナンスサーガ・マックスの外観資料。";
      image.width = 1086;
      image.height = 1448;
    }
    if (image && formId === "rexonance-ultra") {
      image.src = "/rider-rexonance-ultra.webp";
      image.alt = "仮面ライダーレクソナンスサーガ・ウルトラの外観資料。";
      image.width = 1200;
      image.height = 1600;
    }
    if (layout) layout.outerHTML = full ? dossierMarkup(formId) : compactMarkup(meta);
  }

  function findRow(bodySelector, name) {
    var rows = document.querySelectorAll(bodySelector + " tr");
    for (var index = 0; index < rows.length; index += 1) {
      var heading = rows[index].querySelector("th");
      if (heading && heading.textContent.trim() === name) return rows[index];
    }
    return null;
  }

  function updatePerformanceRows() {
    var descriptions = {
      "レクソナンス": ["超究極・通常運用", "無限出力の実効攻撃化"],
      "レクソナンス・マックス": ["超究極・攻撃限界拡張", "SCALER MAX / 出力再配分"],
      "レクソナンス・ウルトラ": ["超究極・最上位", "単一実在収束 / 60秒"],
    };
    Object.keys(descriptions).forEach(function (name) {
      var row = findRow("#saga-ratio-body-v5", name);
      if (!row) return;
      var description = row.children[1];
      if (description) description.innerHTML = '<span class="text-nowrap">' + descriptions[name][0] + '</span><br><span class="text-small text-muted">' + descriptions[name][1] + "</span>";
      if (name === "レクソナンス") {
        var baseValues = [
          ["30.5×", "100%", "metric-punch"],
          ["23.9×", "100%", "metric-kick"],
          ["38,095×", "100%", "metric-speed"],
          ["60.0× + YOPS", "68.58%", "metric-compute has-yops"],
        ];
        for (var baseIndex = 2; baseIndex < row.children.length; baseIndex += 1) {
          var baseValue = baseValues[baseIndex - 2];
          row.children[baseIndex].setAttribute("aria-label", name + "、" + baseValue[0]);
          row.children[baseIndex].innerHTML = '<span class="ratio-value">' + baseValue[0] + '</span><div class="ratio-track" aria-hidden="true"><div class="ratio-fill ' + baseValue[2] + '" style="width:' + baseValue[1] + '"></div></div>';
        }
      } else {
        var values = name.indexOf("ウルトラ") >= 0
          ? ["単一収束", "単一収束", "領域統合", "SCALER ULTRA"]
          : ["動的再配分", "動的再配分", "動的再配分", "SCALER MAX"];
        for (var cellIndex = 2; cellIndex < row.children.length; cellIndex += 1) {
          var value = values[cellIndex - 2];
          row.children[cellIndex].setAttribute("aria-label", name + "、" + value);
          row.children[cellIndex].innerHTML = '<span class="ratio-value text-muted">' + value + "</span>";
        }
      }
    });

    ["レクソナンス・マックス", "レクソナンス・ウルトラ"].forEach(function (name) {
      var row = findRow("#saga-ability-body-v5", name);
      if (!row) return;
      var phase = name.indexOf("ウルトラ") >= 0 ? "単一実在収束・SCALER ULTRA" : "攻撃限界拡張・SCALER MAX";
      for (var index = 1; index < row.children.length; index += 1) {
        var cell = row.children[index];
        var label = cell.getAttribute("aria-label") || name;
        cell.setAttribute("aria-label", label.replace(/能力性能2倍(?:・範囲攻撃特化|・一時高性能化)?/g, phase));
      }
    });

    var ratioSection = document.querySelector("#saga-ratio-body-v5")?.closest("section");
    if (ratioSection) {
      var walker = document.createTreeWalker(ratioSection, NodeFilter.SHOW_TEXT);
      var textNode;
      while ((textNode = walker.nextNode())) {
        textNode.nodeValue = textNode.nodeValue
          .replace(/パンチ比54\.4×/g, "パンチ比30.5×")
          .replace(/キック比51\.1×/g, "キック比23.9×")
          .replace(/592\.6t、1026\.8t/g, "332.2t、480.5t")
          .replace(/能力性能は基底形態比2倍/g, "実効攻撃性能は形態段階に応じて最適化")
          .replace(/能力性能2倍/g, "REXONANCE SCALERによる攻撃最適化");
      }
    }
  }

  function updateTelemetry() {
    ["rexonance-max", "rexonance-ultra"].forEach(function (formId) {
      var state = document.querySelector('.telemetry-state[data-form-id="' + formId + '"]');
      var status = state && state.querySelector(".telemetry-status");
      if (!status) return;
      status.dataset.state = "confirmed";
      status.textContent = formId === "rexonance-max" ? "MAX設定" : "60秒 / ULTRA";
    });
  }

  function stabilizeSwap() {
    var compare = document.getElementById("saga-form-compare-ios");
    var button = document.getElementById("saga-compare-swap-button");
    var swapState = document.getElementById("saga-compare-swap-state");
    if (!compare || !button || !swapState) return;
    var busy = false;
    var flipped = false;
    var frame = 0;
    var cleanupTimer = 0;

    function cleanup() {
      if (frame) window.cancelAnimationFrame(frame);
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
      frame = 0;
      cleanupTimer = 0;
      busy = false;
      compare.classList.remove("is-swapping");
      button.classList.remove("is-swapping");
      button.removeAttribute("aria-busy");
    }

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy) return;
      var left = compare.querySelector('input[name="saga-compare-a"]:checked');
      var right = compare.querySelector('input[name="saga-compare-b"]:checked');
      if (!left || !right) return;
      var nextLeft = document.getElementById("saga-compare-a-" + right.value);
      var nextRight = document.getElementById("saga-compare-b-" + left.value);
      if (!nextLeft || !nextRight) return;

      busy = true;
      button.setAttribute("aria-busy", "true");
      nextLeft.checked = true;
      nextRight.checked = true;
      nextLeft.dispatchEvent(new Event("change", { bubbles: true }));
      nextRight.dispatchEvent(new Event("change", { bubbles: true }));
      swapState.checked = false;
      flipped = !flipped;
      button.classList.toggle("is-flipped", flipped);
      button.classList.remove("is-swapping");
      frame = window.requestAnimationFrame(function () {
        frame = 0;
        button.classList.add("is-swapping");
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          compare.querySelectorAll(".compare-side").forEach(function (panel, index) {
            if (typeof panel.animate !== "function") return;
            panel.animate([
              { opacity: 0.92, transform: "translate3d(" + (index ? -10 : 10) + "px,0,0) scale(.995)" },
              { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
            ], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
          });
        }
        cleanupTimer = window.setTimeout(cleanup, 520);
      });
    }, true);

    compare.querySelectorAll(".compare-native-select").forEach(function (select) {
      select.addEventListener("change", function () {
        select.dispatchEvent(new Event("input", { bubbles: false }));
      }, false);
    });

    window.addEventListener("pageshow", function () {
      cleanup();
      flipped = false;
      button.classList.remove("is-flipped");
    }, false);
  }

  function closeTransientUi() {
    document.querySelectorAll("dialog[open]").forEach(function (dialog) {
      if (typeof dialog.close === "function") dialog.close("zeus-navigation");
    });
    document.documentElement.classList.remove("saga-selector-open", "saga-lightbox-open");
  }

  function applyUpdates() {
    FORM_IDS.forEach(function (formId) {
      updateCard(document.getElementById("saga-detail-" + formId), formId, true);
      document.querySelectorAll('.compare-form-card[data-form-id="' + formId + '"]').forEach(function (card) {
        updateCard(card, formId, false);
      });
    });
    updateTelemetry();
    updatePerformanceRows();
    stabilizeSwap();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyUpdates, { once: true });
  else applyUpdates();

  window.addEventListener("message", function (event) {
    if (event.data && event.data.type === "saga-archive:close-transients") closeTransientUi();
  });
}());
