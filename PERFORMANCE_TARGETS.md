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

主要4画像を各3サイズのWebPに変換し、元データは保管。最大解像度版の合計は2,069,355 bytesから1,447,480 bytesへ30.05%減。これは転送容量の削減率であり表示速度の向上率ではない。srcset/sizesはHTML preload、ナビゲーション先読み、表示で共有し重複取得を防ぐ。

共通スライダーは接触開始時の寸法を使用し、ドラッグ中の反復測定を削除。接触先が変わらない間の属性更新、同じ幅・高さの再書き込みを抑制。リサイズ・回転時の既存解除処理と長押し拡大を維持。

形態画像は選択欄が近づいてから1枚ずつ低優先度で取得・デコード。データセーバーと低速回線では先読みしない。非表示タブでは次の先読みを開始せず、画面離脱時にタイマー・監視・画像要求を解除する。

## 検証と未確認

ユーザー指定OS: Tensor G4搭載PixelはAndroid 16、iPhone 16（A18）はiOS 26、iPhone 18 Pro Max（A20 Pro）およびM4/M5端末はOS 27（iPadではiPadOS）。iOS 26のマイナーバージョンは未確認。Safari 26.4のスクロール連動描画改善を26系全体に適用済みと見なさない。

ChromeのCDPタッチおよびWebKitのマウス/ホイール検証は実機SoC測定ではない。対象5SoCでのLCP、操作応答、描画フレーム時間、5分以上の連続操作後の性能は未測定。実機とOS情報が必要。目標は初回表示・操作応答の改善、枠サイズ・画像品質・スクロール操作の維持。ディスプレイや省電力制約を超えるfpsを強制しない。

### レクソナンス配信のブラウザー検証

`scripts/verify-rexonance-motion.mjs` はChromeとWebKitの両方に対応。390×844・DPR 3と1280×800・DPR 2で、軽量画像の選択、元JPEGの重複取得0件、トップ表示時の別形態画像取得0件、3形態の表示、横はみ出しなし、実行時エラーなし、動きを減らす設定の動的変更を確認した。ChromeはCDPタッチ、WebKitはデスクトップモードのホイールでスクロールを検証（モバイルWebKitのホイールはPlaywright未対応）。この結果を端末のGPU処理速度・発熱測定の代用にはしない。

再実行: `PW_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/deception-playwright-browsers node scripts/verify-rexonance-motion.mjs`。ローカルproduction preview（8082）が必要。ブラウザーの配置先は環境に合わせる。

ユーザーが公開分担を明示: Codexは検証済み変更をmainへpushし、Grokの操作による公開はユーザー側で行う。push完了と公開サイト反映済みは区別する。既存Vercel用GitHub Actionsの資格情報不足はGrokの公開経路とは別であり、今回のmain反映を止める条件にはしない。
