# Deception World

仮面ライダーサーガ Deception World

公開リポジトリ: https://github.com/kro834/Deception-World
公開プレビュー: https://sand-zenith-meadow-dune.grok.me/

## 起動

```bash
npm install
npm run fetch-source   # 残りの巨大ソース（CSS / ホーム / ライダー等）をソースZIPから展開
npm run fetch-assets   # public/ の画像・動画を取得
npm run dev
```

http://localhost:8080 を開いてください。

`npm run fetch-source` は公開プレビューの `Deception-World-source.zip` から、本リポにまだ入っていない／途中で切れているソースを補完します。
`npm run fetch-assets` は同じプレビューから `public/` 配下の画像を取り込みます。

## ソースZIP

プレビューの `/download` からも全ソースZIP（画像なし・約247KB）を保存できます。

## 必要な環境変数

`.env.example` をコピーして `.env` を作ってください。ローカル再生だけなら空のままで構いません。
