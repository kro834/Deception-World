(function () {
  "use strict";

  var FORM_IDS = ["rexonance", "rexonance-max", "rexonance-ultra"];
  var FORM_META = {
    rexonance: {
      title: "レクソナンスサーガ",
      subtitle: "超究極｜無限出力を実効攻撃へ完成させた通常運用形態",
      badge: "統合設定更新",
      comparison: "エクスプリーム・ウルトラ以上の実効性能を、高い安定性と継戦能力を伴って維持する。",
      stats: [
        ["身長・体重", "244.9cm / 190.8kg"],
        ["パンチ・キック", "592.6t / 1026.8t"],
        ["ジャンプ・100m", "6000m / 0.00021秒"],
        ["飛行速度", "測定不能"],
        ["演算", "50000YOPS / ∞Core（KHAOS DeuX）"],
        ["演算2", "9000TOPS / 300Core（KOSMOS DeuX / Paranormal Realizer Ultra / Neural Resonancer Ultra / P14 / Exception World）"],
        ["EMP", "無制限"],
        ["運用", "HIGH / 高安定・高継戦"],
      ],
    },
    "rexonance-max": {
      title: "レクソナンスサーガ・マックス",
      subtitle: "超究極・攻撃限界拡張｜P14完全加速・全神飾連続実装",
      badge: "MAX設定更新",
      comparison: "攻撃動作の途中で全身出力を必要部位へ再配分し、不要な仮説を破棄した資源をREXONANCE DRIVEへ還元する。",
      stats: [
        ["段階", "レクソナンスの攻撃限界拡張状態"],
        ["中核", "P14完全加速 / 全神飾連続実装"],
        ["出力制御", "一動作中に必要部位へ連続再配分"],
        ["作用領域", "エフェクティブ・エリアを縮小"],
        ["伝達領域", "トランスミッション・エリアを短縮"],
        ["演算", "REXONANCE SCALER《MAX》"],
        ["資源運用", "不要仮説を破棄しDRIVEへ還元"],
        ["時間制限", "明示なし"],
      ],
    },
    "rexonance-ultra": {
      title: "レクソナンスサーガ・ウルトラ",
      subtitle: "超究極・最上位｜60秒間の単一実在収束",
      badge: "ULTRA / 60秒",
      comparison: "身体・武装・リアクター・極小主権宇宙を一つの攻撃機関へ統合し、現在動作へ全資源を集中する。",
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
    "本形態を成立させる根源は一柱の神ではない。《秩序》と《破壊》を司り、管理体系における実質的な主権を握るレックス・ロワ。最高位の神格として生まれた五代目のゼウス。そしてゼウスから『神として不要な悪性』として切り離されながら、独立した人間・月城悠真として生きる悠真自身。この三者を吸収・融合せず、独立した存在のまま共鳴させ、戦闘出力だけを一人の月城悠真へ集約する《共鳴》によって成立する。『レクソナンス』のアビリティの本質は『超共鳴』である。",
    "エクスプリームの無制限出力増幅機構を内包した上で、『REXONANCE DRIVE』『REXONANCE DEUS』『KHAOS DeuX』『KOSMOS DeuX』を統合。踏み込み、加速、姿勢維持、装甲突破、位相貫通、権限干渉、存在構造への伝達という攻撃成立までの全工程へ、発生した出力をリアルタイムで再配分する。",
    "対象へ作用する『エフェクティブ・エリア』を極限まで圧縮し、装甲内部の『トランスミッション・エリア』を最短化することで、反射・散逸・位相ずれ・余剰熱による損失を抑制する。同じ無限出力領域でも、対象へ実際に届く《実効攻撃性能》に明確な差を生む。",
    "『ユナイトエッジ・ランサーモード』による適切な距離からの攻撃は、理論上『ヴィンクルム・マジック』を上回る貫通性能とダメージ値を記録。攻撃の周波数・位相・権限署名もリアルタイムで変化し、デアヴァンダールやダンテの《無効化》へも、その処理が成立しにくい攻撃構成へ逐次遷移する。副次的にエクスプリームよりスリムで、より身軽に動ける。",
  ];

  var CORE = [
    "『デュアルエクスコア』は、互いに矛盾する実行結果・因果分岐・神属権限を即座に一方へ固定せず、複数の可能性として並列保持する。レックス由来の《秩序・分離・破壊》は肉体、装甲、再生機構、管理権限、外部接続、存在中枢を分離解析し、ゼウス由来の最高位神格は、悠真の攻撃と敵の無効化・防御・転嫁・再構築が競合した際の《実行優先度》を演算する。",
    "『レクソナンスコア』は、レックス由来の『スペシャルコア』を基礎に、全時空の管理支配への拒否・抵抗・自己決定の記録と、悠真に残された五代目ゼウスの《根源署名》が共鳴して変質した神格共振コア。根源署名は現在のゼウスの権限のコピーではなく、悠真がゼウスから生じたという《起源情報》であり、神格や管理権限が奪われても消失しない。奪えるのは力であって、既に成立した起源や関係ではない。",
    "胸部中央の群青色の内部核『レクソナンスリアクター』は全形態で不変。マックスおよびウルトラでは、ゼウス由来の翠緑色神性層が表面へ重畳される。",
  ];

  var SCALER = [
    "『KHAOS DeuX』『KOSMOS DeuX』『P14』の推論深度、探索幅、並列仮説数、枝刈り閾値、再演算頻度を段階調整し、演算に使うEMP・熱容量・現実変換帯域と、攻撃へ投入する資源の比率を最適化する統合推論制御機構。",
    "通常のレクソナンスでは、既知の敵や観測済みの攻撃への推論を簡略化し、必要以上の演算を行わず安定性と継戦能力を維持する。マックスでは推論深度と探索幅を拡大し、防御・回避・無効化・転嫁・再生を並列解析しながら、戦闘結果へ寄与しない推論枝を高速破棄。節約したEMP、演算帯域、放熱余力を『REXONANCE DRIVE』へ還元し、同一供給量から得られる実効攻撃出力を極大化する。",
    "ウルトラでは対象モデルが一定精度へ収束した時点で不要な仮説保持と再推論を停止し、解放した演算帯域・EMP・放熱余力・現実変換帯域を身体駆動、武装出力、神属権限へ直接再配分する。推論結果そのものが即座に攻撃出力配置へ変換される。",
  ];

  var ABILITIES = [
    ["REXONANCE DRIVE", "KHAOS DeuXが成立可能な最高攻撃状態を多数生成し、KOSMOS DeuXが破綻なく実行できる案だけを選択。脚部、推進、前面装甲、拳・脚・刀身、命中後の対象内部へ、一動作中に出力を連続再配分する。"],
    ["ラーニング", "一撃を重心、意図、能力条件、夢界接続、精神状態、因果揺らぎへ分解。KHAOS DeuXが対抗案を生成し、KOSMOS DeuXが実行可能性を型検査する。観測済みの攻撃へ即応できるが、未使用能力や条件の異なる派生技には追加観測を要する。"],
    ["拒絶", "成立前否決能力が進化。同格以下の現象について、対象全体ではなく悪夢・侵食・偽の役割・不要な可能性・能力と対象の不正接続だけを切り離す。固定済みの結果を消すのではなく、損傷拡大・残留・転嫁・再発へ続く経路を拒絶する。"],
    ["REXONANCE DEUS", "レックスの《管理主権・秩序・破壊》とゼウスの《最高位神格・第一性》を悠真の意思へ従わせる。攻撃対象だけを《破壊可能な構造》へ落とし、承認した攻撃へ一時的な《第一実行権》を付与する。周囲の極小主権宇宙では外部管理人の命令を《権限要求》として監査し、要求元・対象・範囲・目的・同意・失効条件を満たさない命令を拒絶・隔離・限定実行する。何を破壊し何を残すかを決めるのは悠真自身。"],
    ["Exception World", "同時成立しない能力・法則・結果を隔離された例外領域内で一時成立させる。異なる体系を世界全体へ混合せず局所領域へ封入し、終了後に整合性検査を実施。未解決矛盾は位相熱と因果負荷として回収される。"],
    ["パラレム・ウルトラ", "視覚、構造走査、因果観測、夢界情報、神格権限発生点を統合する認識補助バイザー。欠損情報は仮説補完し、整合性検査を通った情報だけを表示する。緊急身体制御も悠真の明確な意思へ反して戦闘を続けない。"],
  ];

  var FINISHERS = [
    ["ハイグリーム・エッジ", "『CHARGE 1・2・3・4！』『More SHINING！』ユナイトエッジへ全身出力を集中する強斬撃。軌道・出力・作用領域をリアルタイム最適化し、回避されても動作を維持して追撃へ移る。"],
    ["レクソナンスレイド", "『REXONANCE SET！』『REXONANCE RAID！』拳・蹴り・斬撃・射撃を高速連結し、一撃ごとの反動や運動エネルギーまで次の攻撃へ再利用する。"],
    ["スクワッドビッグバン", "『SQUAD Crystal！』『CHARGE 1・2・3・4！』『SQUAD BIGBANG！』任意の4種コアを、KOSMOS DeuXが破綻しない順序へ整理して連続発動する超必殺斬撃。"],
    ["レクソナンス・エクスラッシュ", "『REXONANCE SET！』『CHARGE 1・2・3・4！』『REXONANCE EXSLASH！』対象の防御だけでなく、外部から能力や管理権限を与える接続そのものまで切断する最高位斬撃。"],
    ["エクスプロージョン", "『REXONANCE LOAD！』『AXIS CHARGE…！』『EX PLOSION！！』実体弾内部へ量子光線を封入する七段収束射撃。貫通後に内部で出力を解放する。"],
    ["レクソナンスプロージョン", "『REXONANCE LOAD！』『AXIS CHARGE…！』『REXONANCE PLOSION！！』アクシスレイカー・マークⅦの九秒間の連続稼働限界を一工程として使用。Exception Worldで射線を複数の局所例外領域へ屈折・分岐させ、回避・防御・転嫁経路を順に閉鎖し、最後の一発を対象内部へ解放する。"],
    ["ゴッドメテオ", "『GOD METEOR！』悪夢・侵食・支配・偽の役割を分離し、その処理を敵性中枢の抵抗より先へ置く分離浄化型ライダーキック。人格・記憶・生命を残し、支配された味方の救出にも使える。"],
    ["ゴッドリボルト", "『GOD REVOLT！』攻撃を権限要求として解析し、正当な物理成分と不正な支配・改変・転嫁を分離。後者だけを反転衝撃として返すカウンターで、攻撃全量の無条件反射ではない。"],
    ["レクソナンスストライク", "『REXONANCE STRIKE！』光と闇、紅紫と翠緑の神性を脚部へ集中。表層装甲、内部構造、再生中枢、管理接続へ位相衝撃を順に通し、一度の蹴撃を異なる存在階層へ連続命中させる。"],
    ["デウスシフト・レクソナンスパーク", "『LOW！MEDIUM！HIGH！XHIGH！MAX！ULTRA！』『DEUS SHIFT！！』『REXONANCE PERK！！』身体を正面側へ捻り、脚を前方から大きく旋回して足先を先頭に命中させる特殊な逆回し蹴り。出力段階を連続上昇させ、作用領域と伝達領域を縮小し、レックスの《破壊可能化》、ゼウスの《第一実行権》、悠真の《攻撃出力と最終意思》を足先一点へ同期する。『必要なだけ力を生み、それを一切無駄にせず、一点へ通す』設計思想を蹴撃へ落とし込んだ、サーガ史上最強の必殺技に相応しい究極の技。"],
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
      '<section class="rexonance-setting-hero"><small>REXONANCE // ' + active.badge + '</small><h4>《 仮面ライダーレクソナンスサーガ 》</h4>' +
      '<div class="rexonance-call-grid"><span>EXCONVERT！！</span><span>REXONANCE！</span><span>Ultra DEUS</span><span>MARIAGE！！</span><span>GODSIDE！RIDER！</span><span>SA-GA！DEUS！ ×3</span><span>REXONANCE！ ×3</span></div></section>' +
      '<section class="rexonance-setting-block"><small>STANDARD SPEC</small><h4>標準運用値</h4><dl class="rexonance-stat-grid">' + dossierStatMarkup(FORM_META.rexonance.stats) + '</dl></section>' +
      '<section class="rexonance-setting-block"><small>OVERVIEW</small><h4>概要</h4>' + paragraphs(OVERVIEW) + '<div class="rexonance-order">エクスプリーム ＜ エクスプリーム・ウルトラ ＜ レクソナンス ＜ レクソナンス・マックス ＜ レクソナンス・ウルトラ</div><p>レクソナンスは《無限出力》を捨てた形態ではなく、その無限出力を、無限の攻撃として完成させた形態である。</p></section>' +
      '<section class="rexonance-setting-block"><small>CORE STRUCTURE</small><h4>中核構造</h4>' + paragraphs(CORE) + '</section>' +
      '<section class="rexonance-setting-block"><small>INFERENCE CONTROL</small><h4>REXONANCE SCALER</h4>' + paragraphs(SCALER) + '</section>' +
      '<section class="rexonance-setting-block"><small>FORM STAGES</small><h4>形態段階</h4><p><strong>レクソナンス／HIGH：</strong>通常運用形態。表示される592.6t、1026.8t等は標準運用値であり、無制限出力増幅と瞬間集中の最大値ではない。</p><p><strong>レクソナンス・マックス：</strong>コアを強く押し込む攻撃限界拡張状態。P14を完全加速し、全神飾を攻撃用機構へ連続実装。SCALERを《MAX》へ移行し、不要仮説を破棄した資源をDRIVEへ還元する。</p><p><strong>レクソナンス・ウルトラ：</strong>マックスから移行する60秒間の最上位状態。総供給可能量は無制限だが単位時間の供給速度には上限がある。身体・武装・リアクター・極小主権宇宙を一つの巨大な《攻撃機関》へ統合し、《単一実在収束》を行う。拳なら極小宇宙そのものが拳撃への伝達機構となり、剣なら領域全体が一振りを成立させる巨大な砲身となる。</p><p>ウルトラでは、レクソナンスリアクター、二柱由来の神格接続、悠真自身の人格固定点が同時に不安定化した場合、全機能へ共通障害が波及する。</p></section>' +
      '<section class="rexonance-setting-block"><small>ABILITIES</small><h4>能力</h4>' + cards(ABILITIES, "rexonance-ability-grid") + '</section>' +
      '<section class="rexonance-setting-block"><small>ARSENAL</small><h4>追加武装</h4><ul><li>フェイタルエッジ</li><li>レルムスレイヤー</li><li>メビウスネイバー</li><li>アクシスレイカー・マークⅦ</li><li>ユナイトエッジ・ランサーモード</li></ul><p>全武装はREXONANCE DRIVEと直結し、対象へ応じて出力・周波数・位相・エフェクティブ・エリアをリアルタイム最適化する。</p></section>' +
      '<section class="rexonance-setting-block"><small>FINISHERS</small><h4>必殺技</h4>' + cards(FINISHERS, "rexonance-finisher-grid") + '</section>' +
      '</div>';
  }

  function compactMarkup(meta) {
    return '<div class="rexonance-compare-revision"><strong>' + meta.badge + '</strong><p>' + meta.comparison + '</p><p>レックス・ゼウス・悠真を独立したまま共鳴させ、無制限出力を攻撃成立までの全工程へ最適配分する。</p></div>';
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
      if (name !== "レクソナンス") {
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
