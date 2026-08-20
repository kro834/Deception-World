# Deception World

仮面ライダーサーガ Deception World

公開プレビュー: https://sand-zenith-meadow-dune.grok.me/

## 起動

```bash
npm install
npm run fetch-assets   # public/ の画像・動画を取得
npm run dev
```

http://localhost:8080 を開いてください。

`npm run fetch-assets` は公開プレビューから `public/` 配下の画像を取り込みます。プレビューが残っている間はこれで完全再現できます。

## 必要な環境変数

`.env.example` をコピーして `.env` を作ってください。ローカル再生だけなら空のままで構いません。
