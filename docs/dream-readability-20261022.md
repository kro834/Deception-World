# Dreamの可読性と章表示の修正 — 2026-10-22

原画、物語本文、章の順序、読書設定の保存形式は変更していない。背景を明るく作り直すのではなく、漆色の面に残っていた旧紙面用の文字色を修正し、既存の明朝体と文字の階層を整えた。新しいフォントや画像の取得は追加していない。

## 修正内容

冒頭の序文と開いた章の見出しは、後から適用された暗い背景に対して旧版の暗い文字色が残っていた。背景を定義するkarakuri側で文字色も組にし、見出し、本文、署名、章の英字、開閉記号を読み分けられる色にした。人物ファイルの小さな赤・紫のラベルは固有のアクセントを残したまま明度を上げた。

章案内の紙札は既存のShippori系の明朝体に揃え、あらすじを16px、適切な行間と行長にした。章番号の朱印はハイライトを抑えて数字の明暗差を確保した。

長い章を開くと、親の`ts-rise`が画面への進入途中の不透明度に留まり、本文まで薄くなることがあった。開いた章だけ親のフェードを止め、閉じた章の登場演出は維持した。子の章番号は名前付きスクロールタイムラインを残し、`kn-case-press`で拡大率だけを動かす。reduced-motion、economy、メニュー・ダイアログ・読み込み中の既存ゲートは変えていない。

同時進行のmain `e1e94473`を統合し、`8d36cd3b`以降の用語集の夜色、金色の見出し、iPad向け配置、舞台のWebKit対策は保持した。重複する用語集の色指定は追加していない。高コントラスト表示では金色のtext-fillが残らないよう、用語集見出しをシステム文字色に戻す。

## 確認方法と結果

新しい`verify-dream-legibility.mjs`は実際にビルドされたページの最終computed styleを読む。通常の文字は4.5:1以上、24px以上と確認できる金色の大見出しだけ3:1以上を要求する。文字・背景のグラデーションの各停止点を合成した保守的な下限であり、画像上の全画素やサイト全体のアクセシビリティ適合を証明するものではない。

Chrome 155.0.8059.40とPlaywright WebKit 26.5で、320、390、768、1024、1194、1440pxの各幅を確認した。各画面46箇所、両エンジン計552件が成功し、対象の通常文字の最低コントラストは5.12:1だった。ページの横はみ出しはなく、通常動作時の章番号は`kn-case-press` / `--ts-rise` / opacity 1であることも検査した。

| 対象 | 確認値 |
| --- | --- |
| 冒頭見出し | 旧3a1785f0の1.74:1 → 9.92:1 |
| 冒頭本文 | 13.06:1 |
| 人物ファイルの小ラベル | 最低5.68:1 |
| 朱印内の章番号 | 3.52:1 → 5.12:1 |
| 用語集の大きな金色見出し | 最低3.67:1、24px以上 |

検証コマンドは次の通り。`preview-production.mjs`で本番ビルドを4262番に出し、通常検証では外部フォントを遮断していない。フォント取得失敗の検査は別の390pxコンテキストで明示的に行い、46項目すべて成功した。

最終の公開前ゲートは2,838件成功、失敗0件、既存の条件付きskipが5件。型検査・本番ビルド・15組のsource-parts整合性も成功した。lintはエラー0件で、既存の12警告は変更していない。高コントラスト表示の320pxでも46項目が成功した。Chromeが強制色で描くリンクは、computed text-fillに変換前の色が残る場合があるため、UAが強制色を適用する要素では実際のシステムcolorを検査する。実画像でも青いリンク文字が読めることを確認した。

```sh
npm run release:build
node scripts/sync-source-parts.mjs --check
BASE_URL=http://127.0.0.1:4262 BROWSER=chrome PW_WIDTHS=320,390,768,1024,1194,1440 node scripts/verify-dream-legibility.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=webkit PW_WIDTHS=320,390,768,1024,1194,1440 node scripts/verify-dream-legibility.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=chrome PW_WIDTHS=390 OFFLINE_FONTS=1 AUDIT_OUT=output/playwright/dream-legibility/fallback-fonts node scripts/verify-dream-legibility.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=chrome PW_WIDTHS=320 FORCED_COLORS=1 AUDIT_OUT=output/playwright/dream-legibility/forced-colors node scripts/verify-dream-legibility.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=chrome node scripts/verify-dream-major.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=webkit node scripts/verify-dream-major.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=chrome node scripts/verify-dream-karakuri.mjs
BASE_URL=http://127.0.0.1:4262 BROWSER=webkit node scripts/verify-dream-karakuri.mjs
BASE_URL=http://127.0.0.1:4262 node scripts/verify-dream-reader-navigation.mjs
BASE_URL=http://127.0.0.1:4262 PW_ENGINE=webkit node scripts/verify-dream-reader-navigation.mjs
```

ブラウザーのJSONと画像は`output/playwright/dream-legibility/`、`dream-major/`、`dream-karakuri/`以下に保存される。書棚のキーボード操作、非選択ページのinert、紙送り、提灯、章到着、記録検索、読書設定・復帰・履歴も既存の検証を使用した。WebKitが未対応のviewportキー`interactive-widget`を無視する既存警告は残るが、検査した操作に未処理JavaScript例外はない。

iPad相当のサイズとWebKitによる確認であり、iPadOS 27.2の物理端末・ホーム画面起動を実測したものではない。公開は既存の検証付きmainワークフローを使い、ローカル成功と公開URLへの反映は分けて確認する。
