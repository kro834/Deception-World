# 優先SoCと検証境界（2026-09-17）

対象は Tensor G4、Apple A18、A20 Pro、M4、M5。公開仕様の比較でWeb表示の速度倍率は算出しない。ブラウザーの合成・画像転送・デコード・JS実行の各待ち時間を削減する。ネイティブMetalやAIのベンチマークをCSSの性能と混同しない。

| 対象      | 一次資料で確認した特性                                                                                                                 | Web最適化への反映                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Tensor G4 | Pixel 9系搭載、Pixel 9は12GB、9 Pro系は16GB RAM。GoogleはWeb閲覧と効率改善を説明。GPU演算値・Appleとの同条件比較は資料から確定できない | Chromeの高DPRを考慮した画像配信、寸法測定削減、すりガラスのCSS描画を維持          |
| A18       | 6コアCPU、5コアGPU。対A16のGPU最大40%高速化はメーカーの特定条件値                                                                      | 高DPRでも元画像以上に拡大生成しない。Safariの合成に適したtransformとopacityを優先 |
| A20 Pro   | 6コアCPU、7コアGPU、対A19 ProでGPU最大40%高速化・メモリ帯域50%増とAppleが発表                                                          | 高性能を理由に常時描画を増やさない。実機計測前に120fps・発熱改善を保証しない      |
| M4        | iPad Proの10コアGPU、120GB/sメモリ帯域                                                                                                 | 横向き大画面の描画面積・レイヤー増大を抑える                                      |
| M5        | iPad Proの10コアGPU、153GB/sメモリ帯域                                                                                                 | M4と共通の効率的な経路。GPUのAI性能向上を通常描画の倍率として扱わない             |

一次資料:

- https://blog.google/products-and-platforms/devices/pixel/google-pixel-9-pro-xl/
- https://www.apple.com/newsroom/2024/09/apple-introduces-iphone-16-and-iphone-16-plus/
- https://www.apple.com/newsroom/2026/09/apple-debuts-iphone-18-pro-and-iphone-18-pro-max/
- https://support.apple.com/ja-jp/119891
- https://support.apple.com/ja-jp/125407
- https://webkit.org/blog/17862/webkit-features-for-safari-26-4/

## 実装

### 人物・エピソード画像の追加軽量化

2026-09-17: 人物7点とEP1〜5の計12点を、元の解像度のまま品質84のWebPへ変換。合計4,444,684 bytesから1,941,720 bytesへ56.31%削減した。元JPEGは保持し、画像要素のsrcsetで軽量版を選択する。遷移時の先読みも同じ選択関数を使い、管理人の先読みにも既存WebPを指定してJPEGとの二重転送を防ぐ。削減率は転送容量であり、読込時間の短縮率ではない。

再生成はSHARP_MODULEを必要に応じ指定して `node scripts/build-dossier-images.mjs`。検証は `node scripts/verify-dossier-delivery.mjs`（PW_ENGINE=webkit対応）。390px/1280pxで人物・エピソードの軽量版表示、元JPEGの重複要求なし、実行時エラーなしを確認する。

主要4画像を各3サイズのWebPに変換し、元データは保管。最大解像度版の合計は2,069,355 bytesから1,447,480 bytesへ30.05%減。これは転送容量の削減率であり表示速度の向上率ではない。srcset/sizesはHTML preload、ナビゲーション先読み、表示で共有し重複取得を防ぐ。

共通スライダーは接触開始時の寸法を使用し、ドラッグ中の反復測定を削除。接触先が変わらない間の属性更新、同じ幅・高さの再書き込みを抑制。リサイズ・回転時の既存解除処理と長押し拡大を維持。

形態画像は選択欄が近づいてから1枚ずつ低優先度で取得・デコード。データセーバーと低速回線では先読みしない。非表示タブでは次の先読みを開始せず、画面離脱時にタイマー・監視・画像要求を解除する。

## 検証と未確認

### iOS / iPadOS 18.7.7互換描画

iOS 18系の人物・トップ・特設ページでは装飾だけを軽量CSS描画にする。液体レンズのWebGL初期化・背景テクスチャ作成とポインター追従光を省き、固定ヘッダー・メニュー・ガラスボタンのbackdrop-filterを不透明寄りの背景色へ置き換える。大きな装飾のぼかしも省く。タッチ判定、長押し拡大、切り替え時間、スクロールロックの仕様は変更しない。先に追加したWebP配信も引き続き使用する。

iPhone/iPadのOS 18 UAを判定し、デスクトップ表示のiPadはMacintosh UA＋複数タッチ対応＋Safari 18の組み合わせで選ぶ。OSのパッチ番号がUAに現れない場合があるため18.7.7だけへ限定しない。通常のmacOS SafariやiOS 26/27へは適用しない。未知のUAには既存方針を維持する。

Appleの18.7.7資料は対応端末とWebKit更新の確認に用い、全端末で描画不具合があることを示す資料とは扱わない。背景ぼかしを軽量化するのは本サイトの重ね合わせ描画を減らす設計判断。

- https://support.apple.com/en-us/126793
- https://webkit.org/blog/15865/webkit-features-in-safari-18-0/

`PW_IOS18=1 PW_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/deception-playwright-browsers BASE_URL=http://127.0.0.1:8082 node scripts/verify-hero-touch.mjs` で互換分岐・背景フィルター解除・3画面サイズのスクロールと8人の切り替え・長押し寸法を検証できる。これは現在のWebKitでiOS 18用分岐を通すテストであり、iOS 18.7.7実機・当該版Safariの再現ではない。実機fps・発熱は未測定。328単体テスト・型チェック・ビルド成功、lintエラー0件（既存警告11件）。

ユーザー指定OS: Tensor G4搭載PixelはAndroid 16、iPhone 16（A18）はiOS 26、iPhone 18 Pro Max（A20 Pro）およびM4/M5端末はOS 27（iPadではiPadOS）。iOS 26のマイナーバージョンは未確認。Safari 26.4のスクロール連動描画改善を26系全体に適用済みと見なさない。

ChromeのCDPタッチおよびWebKitのマウス/ホイール検証は実機SoC測定ではない。対象5SoCでのLCP、操作応答、描画フレーム時間、5分以上の連続操作後の性能は未測定。実機とOS情報が必要。目標は初回表示・操作応答の改善、枠サイズ・画像品質・スクロール操作の維持。ディスプレイや省電力制約を超えるfpsを強制しない。

### レクソナンス配信のブラウザー検証

`scripts/verify-rexonance-motion.mjs` はChromeとWebKitの両方に対応。390×844・DPR 3と1280×800・DPR 2で、軽量画像の選択、元JPEGの重複取得0件、トップ表示時の別形態画像取得0件、3形態の表示、横はみ出しなし、実行時エラーなし、動きを減らす設定の動的変更を確認した。ChromeはCDPタッチ、WebKitはデスクトップモードのホイールでスクロールを検証（モバイルWebKitのホイールはPlaywright未対応）。この結果を端末のGPU処理速度・発熱測定の代用にはしない。

再実行: `PW_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/deception-playwright-browsers node scripts/verify-rexonance-motion.mjs`。ローカルproduction preview（8082）が必要。ブラウザーの配置先は環境に合わせる。

ユーザーが公開分担を明示: Codexは検証済み変更をmainへpushし、Grokの操作による公開はユーザー側で行う。push完了と公開サイト反映済みは区別する。既存Vercel用GitHub Actionsの資格情報不足はGrokの公開経路とは別であり、今回のmain反映を止める条件にはしない。

### Tensor G4向けの最終調整（2026-09-17）

ユーザーから実機上の問題は「ほぼない」と報告され、今回を最終調整とする。Googleの仕様ではTensor G4搭載Pixel 9系は最大120Hz表示に対応する。ただし表示上限はWebページの持続描画性能を保証しないため、GPU利用率を上げること自体を目的にせず、不要なCPU処理を除く。

AndroidかつCSSスクロールタイムライン対応環境では、ヘッダーの進捗バーをブラウザーのスクロール連動transformへ移行した。スクロールごとのscrollHeight読み取りとCSS変数更新を省き、ヘッダー状態も閾値をまたいだ場合だけ更新する。ChromeのUA縮小では機種名が省略され得るためTensor G4を推測で検出せず、Androidの機能対応で選択する。Apple系、未対応環境、動きを減らす設定では従来のJavaScript処理を維持する。設定変更時と画面離脱時には保留フレームと監視を解除する。

`node scripts/verify-android-progress.mjs`でAndroid縮小UA、未対応機能、iPhone UAを検証。Android経路のスクロール後CSS変数書き込みは0回、進捗比率0.495582と描画scaleX 0.495582が一致した。代替処理、動きを減らす設定の動的切り替え、実行時エラー0件も確認。これはブラウザーでの処理削減の検証であり、Tensor G4実機のfps・消費電力測定ではない。最終リリースゲートは324テスト成功、型チェック・ビルド成功、lintエラー0件（既存警告11件）。

一次資料:

- Google Pixel仕様: https://support.google.com/pixelphone/answer/7158570?hl=en
- Chromium UA縮小: https://www.chromium.org/updates/ua-reduction/
- Chromeスクロールアニメーションの処理経路: https://developer.chrome.com/blog/scroll-animation-performance-case-study/
