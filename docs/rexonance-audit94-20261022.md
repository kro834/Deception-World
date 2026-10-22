# Rexonance 94件 再検証（作業中・全件合格ではない）

基点は `ac87c4b9636d88bf3db5641adad52287b8b06bb1`。この報告は現在の候補差分の監査であり、94件すべての完了、通常通信時の保証、main統合、本番公開を意味しません。

証跡: `/Users/hosicommon/.codex/.chatgpt-projects/g-p-6a5ab42df960819195f67565fcb59822/audit-artifacts/rexonance94-20261022/evidence`。通常3幅と補助3幅の画面・DOM・画像候補を採取し、再現確認した操作は実入力とフレーム記録で調べています。外部フォントの応答不良があるため、障害を明示的に再現した試験と、通信を変更しない初期試験を区別しています。

## 件数

- not-reproduced-current: 27
- owner-retained: 25
- fixed-verified: 34
- partial: 2
- unverified: 5
- needs-owner-decision: 1

## ID別の判定

| ID | 判定 | 根拠・対応・残件 |
| --- | --- | --- |
| F08 | not-reproduced-current | ローカルMinchoを実描画し、同一文字列64pxの幅がpalt OFF 768px→ON 618.625px。『フォントにpaltがない』は現行に該当しない。 |
| F09 | not-reproduced-current | 装着章H2は他章と同じMincho・palt、1440で64.32px／1024で52.672px／390で40px。旧48/26px規則の単独支配ではない。 |
| F10 | owner-retained | 現行TYPE版が6書体の役割・scale/tokenを明記。computed sizeの数だけを理由に、オーナー承認の役割分担を単一書式へ潰さない。 |
| F11 | owner-retained | 03の大きな数字を省く旨がeditorialに明記され、最新layoutも承認済み。章番号はmap/ナビで維持。別の章配置案は提案事項。 |
| F12 | owner-retained | DESIGN_AUDIT.mdが1300px以上46:54の持続split stageを明記。『映画キービジュアルでない』という評価だけで承認構図を撤去しない。 |
| F13 | owner-retained | 同じ舞台を性能・P14の読み物と並べて保持することが最新layoutの決定。長さ・再利用の美的提案として残す。 |
| F14 | fixed-verified | 1024×768のH1下端が875pxから721pxへ。横向きタブレットの舞台だけを縮め、最初の画面へ収めた。 |
| F15 | fixed-verified | 旧768幅は237.922px×3列。701–1099pxのSystemを一枚の板の縦組みへ変更し、最終768幅で713.781pxの1列を実測。 |
| F16 | fixed-verified | 通常・強制配色の各CTAで実際にキーボードフォーカス。2pxの輪郭をoffset -4pxへ移し、切り欠きの内側に保持。 |
| F17 | fixed-verified | ブランド名REXONANCEとセレクトの可視ラベル『比較する相手』をaccessible nameへ含めた。 |
| F18 | not-reproduced-current | Worldからの本物の遷移を毎フレーム採取。3幅で40.5–52.6ms時点にload gateとcoverを伴うcallが現れた。『数秒間の無防備なWorld』は再現しない。 |
| F19 | partial | FormMorphだけ原本URLを別読みしていた。表示・先読みと同じsrcset/sizesでdecodeするよう修正。低速画像8秒の切替回帰は完走したが、旧→新の全フレームでフラッシュがないという判定は未完。 |
| F20 | owner-retained | 支給P14画像を明るい/疑似文字という理由だけで別のAI画像へ置換しない。画像原本への変更は別途オーナー判断。 |
| F31 | not-reproduced-current | 指摘された220 tonguesのdrawFlameHeatは現行では明示的no-op。オーナー2026-10-21のbody fireへ置換済みであり、その旧パスによる停止時再抽選は成立しない。炎全体の新しい見栄えの監査とは区別。 |
| F35 | not-reproduced-current | 章H2は1440で64.32px、1920で68px。stage H3は1440で51.44px、章見出しより小さい。終幕H2の拡大は意図した最終タイトル階層。 |
| F36 | not-reproduced-current | 採取した可視UIは全幅で12px以上。旧10–11pxの章/状態ラベルはTYPE版の役割指定へ置換されている。 |
| F37 | owner-retained | 本文とdisplayが異なるscaleであることは現行TYPEの役割分担。1920専用の本文再設計は提案に留める。 |
| F38 | not-reproduced-current | 320pxでもサブコードは保持され、11個のkickerがハイフン分断する状態は観測しない。外部Michroma成功時の再組版は通信制約により別途必要。 |
| F39 | owner-retained | 説明の原文と比較plate幅は現行設計を維持。現行文字色はTYPEの高コントラストtierへ変更済みだが、行長の読み心地の再設計は承認待ち。 |
| F40 | unverified | ローカルMincho800/500とForgeは確認できたが、Google提供Zen/Michromaの成功ダウンロード時の実フォント照合はネットワーク障害で未完。 |
| F41 | unverified | 特定の『犬と／して』『終焉／へ』の全幅・全フォントでの行分割をRange単位で確認できていない。原文は未変更。 |
| F42 | owner-retained | 英字4書体の混在という集計ではなく、Forge=数値/名称、Etch=計器、他=操作/本文という明示役割を優先。 |
| F43 | owner-retained | Mincho displayが加わった現行で『distinct display voiceがない』は旧前提。Noto/Zenの用途を保ち、全サイト共有フォントをここだけ削らない。 |
| F44 | unverified | Google FontsのCSS自体が12秒curl/30秒browserで応答しない。観測7local files/109,708 bytesを全オンラインpayloadとは扱わない。95files/1.3MBの真偽は未確定。 |
| F45 | unverified | Google fonts遅延成功→swapという条件を作れていない。abortでfallbackは確認できるが成功時reflowの代用にはならない。 |
| F46 | not-reproduced-current | 現行の選択タブは近黒文字ではなく白系のfill。追加でsystem Highlight/HighlightTextと子のcurrentColorを明示し、非選択タブの固定fillも解除。 |
| F47 | fixed-verified | CUT 01/02のラベルが板の左端と同じ位置で、inline paddingが0なのを確認。16–28pxの内側余白を追加。 最終候補の3幅ブラウザーassertionに記録。 |
| F48 | not-reproduced-current | 現行レイアウトは96px/132pxの固定値列、電話では2行。採取した行で旧auto-auto配置ではない。 |
| F49 | not-reproduced-current | 強制配色のP14ラベルは12px・15.59px高のボックスで、半分の高さへクリップされる規則は再現しない。外部書体成功時の字面差は未確認。 |
| F50 | owner-retained | 主CTA・補助操作・終幕plateの階層差は最新layoutで承認済み。インタラクションの共通transitionは既に実測できる。 |
| F51 | fixed-verified | h3と選択操作のほかに重複していた枠付きoutputを除去。P14/P1比という見出しと実際の選択操作・読み上げは維持。 最終候補の3幅ブラウザーassertionに記録。 |
| F52 | owner-retained | 最新layoutが04を画像比率の560px枠として積むと明記。portraitとlandscapeを同じ一列で保つ設計は維持し、heroの見出し欠落F14とは分ける。 |
| F53 | not-reproduced-current | 縦タブレットは最新layout版で4:5。lazy sizes=autoも現行で有効。旧21:8の全面letterbox説明はそのまま当てはまらない。 |
| F54 | not-reproduced-current | 768幅のFORM COMPARISONは3列。実スクリーンショットでも横並びであり、旧縦積みは再現しない。電話の縦積みとは区別。 |
| F55 | partial | 主要な英語見出し、ブランド、形態コード、章コードへlang=enを追加。音声読み上げ実機と全Latin runの網羅検査は未完。 |
| F56 | fixed-verified | P14・性能比較の実操作前後でlive regionのDOM同一性がfalse→true。行の再演出キーは子に残した。 |
| F57 | fixed-verified | 比較カードでMAXを選択。選択タブとレンズのx・幅差が1px未満へ復旧。共通railの既存liquidrelayout APIを利用。 |
| F58 | fixed-verified | 390×844→844×390で、以前は変身45%からcompleteへ飛んだ。章・runwayの相対位置を保存し、再測定は44.9907%。 |
| F59 | fixed-verified | 390幅のSECTIONS見出しが画面外-210pxから118pxへ。Rexonanceだけ章グループをSPECIAL重複行より優先し、他の人物一覧規約を保持。 |
| F60 | owner-retained | DESIGN.mdのライダーレール以外は接触直後からレールがgestureを所有する規約を保持。全レールpan-yへ戻す修正はしない。 |
| F61 | fixed-verified | 共有SPECIAL_SITE_SECTIONSへassemblyを追加。メニューの5章を実際のリンクで確認し、検索のアンカー検査も実コンポーネントへ拡張。 |
| F62 | fixed-verified | P14=900・P2=180から900÷180×100=500%。650%／6.5倍／+550%を500%／5.0倍／+400%へ訂正。 |
| F63 | fixed-verified | Extreme側にもP14が存在するため比較の構成一覧にP14（Extreme tuning）を追加。レンダーを検査。 |
| F64 | fixed-verified | i-2の本文がplate03の同期・共鳴の仕事を重ねていた。既存のオーナー原稿rexonance-profile.tsの製造定義をそのまま引用し、検索抜粋も同期。 最終候補の3幅ブラウザーassertionに記録。 |
| F65 | needs-owner-decision | 実際に矛盾を確認。特設2ページはヴィンクルム5000.0m（est.）/500Core、公開Form Archiveとrider資料は188.8m/∞Core。どちらも現行なので、質問を送り正しい設定値を確認中。 |
| F66 | not-reproduced-current | 1440のghostは上側、scroll cueは下側で離れている。320も画像下の別行。旧8pxのcue接触は観測しない。 |
| F67 | fixed-verified | 初期フレームの舞台topが62→77px（電話58→65px）と変わる問題をCSSの初期reserveで修正。最終3幅はCSS適用後のtopが77/77/65pxで一定。文字拡大・safe-area用の実測補正は保持。 |
| F68 | not-reproduced-current | 同条件を完全に再現した性能認定ではないが、初期1440サンプルのlong taskは164ms×1（50ms超過分114ms）、LCPはIMG 740ms。旧1.7sのTBTはこの試行では再現しない。 |
| F69 | fixed-verified | 1440で実表示574pxなのに960wを選択。現行3形態だけのsizesを実測に寄せ、preload・warmup・visible imageが同じ関数を使う関係は維持。 最終候補の3幅ブラウザーassertionに記録。 |
| F70 | fixed-verified | CDPで疑似要素の四隅を取得。1440で番号中心160.508px、旧リング719.984px。実際の数字幅を既存のレイアウト計測に統合し、新リング160.500px（差0.008px）へ。scrollごとの計測は追加しない。 |
| F71 | not-reproduced-current | 現行stage panelは写真・装飾・別カラムの説明であり、旧callout本文を写真の繁雑部へ重ねるDOMは存在しない。 |
| F72 | owner-retained | 長いカタログの後に変身を置く現行chapter順序とpersistent舞台を維持。削る/並べ替えると承認済み構成を変えるため提案事項。 |
| F73 | owner-retained | 終幕は3CTA一列＋右端立像という最新承認構図を保持。hero lockupの再掲や新絵の追加は別案。 |
| F74 | fixed-verified | 実フレームで19/16/16pxの重ね字を確認。本体36/26.624/26pxへfont:inheritで統一し、count/lock中のhost backgroundはnone。最終3幅のフレームで確認。 |
| F75 | fixed-verified | ゼロ埋めを廃止し0／0.0%から表示。最終3幅のフレームとformatCount全ケースで確認。レイアウト幅は元の最終文字列を保持するhostが確保。 |
| F76 | not-reproduced-current | Rexonanceのside panelで開閉中ともimg要素は0。旧ライダーカード画像を消して空カードが滑る状態はこのルートには再現しない。他ルート全般の修正とはしない。 |
| F77 | not-reproduced-current | hero/assembly/coda/比較barにscale160ms・translate220ms等の共通transitionを実測。『hover/press/transitionがない』は現行に該当しない。 |
| F78 | fixed-verified | native detailsと初回画像遅延・即時closeを維持。Chromiumのintrinsic-size対応時だけ有限280msで開く。3幅で23フレームを採取し、2→233→399→506→711pxなどの段階的な展開を確認。reduced/economy/forced coloursでは適用しない。非対応engineはnative動作。 |
| F79 | not-reproduced-current | 初回1440のLCPはIMG 740msで採取、旧lede text 2.4–6.5sという固定的な説明は再現しない。ただし外部フォント成功時・低速回線のLCP保証ではない。 |
| F80 | owner-retained | タイトルの高速な整列と長い変身を分ける現行choreography。『rushed』という好みだけで所有者の演出全体を遅らせない。 |
| F94 | not-reproduced-current | 320スクリーンショットでOF SA-GAは語内分断なしの2行目。現在はkicker-tailのまとまりを保持。 |
| F95 | not-reproduced-current | 320のULTRA 60sコードの実ボックスは一行。タブ全体の日本語/英語二段組をコードの不規則折り返しとは扱わない。 |
| F96 | owner-retained | 数値Forge、計器Etch、操作Zen、HUDの機能別役割を維持。全カウンターを同じfaceにするという美的統一は提案事項。 |
| F97 | unverified | external face成功時のglyph fallbackの特定が未完。Computed font-familyの文字列だけで実使用glyph faceを断定しない。 |
| F98 | owner-retained | 共通DWモノグラムの変更はブランドと他ルートにも関係。ページ固有の不具合と断定せず提案に残す。 |
| F99 | fixed-verified | Systemの見出し折り返しで読み始めがずれる。1100px以上をsubgridの共有3行へ変更。原文とカードの順序は無変更、 最終候補の3幅ブラウザーassertionに記録。 |
| F100 | not-reproduced-current | 1100px以上の章mapは承認済みの1列5行。05だけ二列跨ぎで矢印が約1000px離れる旧配置ではない。 |
| F101 | not-reproduced-current | 現行の形態比較は閉じたnative disclosure barとして段落の後に置かれる。旧450px固定余白の規則は最新layoutで置換。個々の絵/説明の高さが異なること自体は残る。 |
| F102 | not-reproduced-current | 終幕の立像はfooter内のtop50%/translate -50%、最大720pxへ最新layoutで置換。旧bottom0貼り付けではない。 |
| F103 | fixed-verified | 原因はRexonance用CSSではなく共通body::beforeのSVG背景。ルートを限定して強制配色時に消し、通常のピンク装飾は維持。 |
| F104 | owner-retained | 最新DESIGN_AUDIT.mdは44pxの操作面を明示的に保持。3幅で実高44pxであり、旧一般文書の48pxへ一律拡大しない。 |
| F105 | fixed-verified | 320pxのCTA幅差を確認。400px以下だけ同じ幅の縦組みへ変更。 最終候補の3幅ブラウザーassertionに記録。 |
| F106 | not-reproduced-current | 現在の電話の説明は『スライダー、両端のタップ、矢印キー』という複数の操作方法。タッチを使えないと案内しているものではなく、キーボード代替も残す。 |
| F107 | fixed-verified | stage tabpanelから重複したaria-liveを除去。選択tabのaria-selectedとpanelのaria-labelledbyは保持。 |
| F108 | fixed-verified | P1/P2ボタンを実フォーカスし、輪郭をoverflow:hiddenの内側へ。通常・強制配色とも2px／-4px。 |
| F109 | fixed-verified | 棒グラフのaria-labelにrole=img、比較コンソールと形態ボタン集合にはgroupを付け、名前を持てる要素へ。 |
| F110 | fixed-verified | 選択後も『マックスを表示中』として形態名を保持。単一選択のgroup内toggle buttonという既存操作は維持。aria-pressed自体を誤りとはしない。 |
| F111 | fixed-verified | 既存の配置を壊さず明示的banner/contentinfoを付与。実ブラウザーで各1ランドマークを確認。 |
| F112 | fixed-verified | カードで選択した後に、選択レールと結果パネルの先頭を固定ヘッダー下へ即時表示。キーボード操作では選択タブへフォーカスを戻す。 |
| F113 | fixed-verified | assemblyのscroll-marginだけreserve+12px。他章と同じreserve+24pxへ統一。 最終候補の3幅ブラウザーassertionに記録。 |
| F114 | owner-retained | 常体/敬体の統一は原文の書き換えになるため行わない。F64は役割の誤りの訂正として既存原稿を引用する。 |
| F115 | fixed-verified | 動き削減・省エネでは『変身の資料を見る』へ変更し、再演出を案内する段落を隠す。メディア設定変更・root属性監視は解除処理を対にした。 |
| F116 | fixed-verified | rangeとiOS selectを『比較基準』へ統一。可視『基準にする世代』をselect名にも含め、100%基準というvalue textを保持。 |
| F117 | owner-retained | 6000m等は支給スペックの表記。誤値ではないため数値の桁区切りを理由に原文を変更しない。 |
| F118 | owner-retained | 最新DESIGN_AUDIT.mdがスレート『01 STANDARD / HIGH · KEY VISUAL』を明記。監査を理由に勝手に別名へしない。 |
| F119 | owner-retained | 最新layoutのstage/section seamを保持。溶け合う境界への改変は別の見た目案として残す。 |
| F120 | owner-retained | 現在のstageはobject-fit:containで支給画を表示。元絵の端を生成拡張せず、枠・portraitのowner artを保持。 |
| F121 | owner-retained | containで元画像を全体表示しているため、crestに新しい画素を足す/絵を描き直す判断はしない。画像差し替え案として残す。 |
| F122 | not-reproduced-current | P1選択中に実pointer downを採取。背景は押下前後とも同じ135deg gradientで、旧solid whiteへの反転は再現しない。 |
| F123 | not-reproduced-current | 終幕3CTAともscale160ms/translate220ms/background/border/shadow/color220msを実測。古いtransition上書きの説明は現行に該当しない。 |
| F124 | fixed-verified | 共通htmlのsmooth-scrollで長距離も連続スクラブされる。Rexonance滞在中だけnative anchorを即時にし、hash/historyは維持。 最終候補の3幅ブラウザーassertionに記録。 |
| F125 | not-reproduced-current | World→Rexonanceの毎フレーム記録ではcallがなくなった時点でH1 opacity=1。3幅で旧handover後0.4–1.3sの無表示は観測しない。 |
| F126 | owner-retained | 装着・カウント・hover・場面転換は異なる目的。duration/curve数の集計だけでownerの場面ごとの時計を一律化しない。 |
| F127 | fixed-verified | P14つまみのleftアニメーションをtranslateへ。端点のleftは23pxのまま、実際のxだけが移動することを確認。軌道のfillは現行では既に静的。 |

## 再実行

`scripts/audit-rexonance-94.mjs`、`scripts/probe-rexonance-audit94.mjs`、`scripts/detail-rexonance-audit94.mjs`、`scripts/sample-rexonance-audit94-motion.mjs`、`scripts/verify-rexonance-audit94-fixes.mjs`。`BASE_URL`を本番ビルドのプレビューへ指定します。`AUDIT_OFFLINE_FONTS=1`は障害条件を明示するためのオプションで、通常オンラインの計測値として使いません。

既存コード・他チャットの未保存変更を保全するため、別の一時worktreeで実装しました。公開ゲートの記録と未確認項目は、完了後ではなく実測の都度更新します。
