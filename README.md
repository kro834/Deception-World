# Deception World

仮面ライダーサーガ Deception World

公開リポジトリ: https://github.com/kro834/Deception-World

## 起動

```bash
git clone https://github.com/kro834/Deception-World.git
cd Deception-World
npm install
npm run assemble-source   # source-parts から巨大ソースを復元
cp .env.example .env      # ローカル再生だけなら空のままで可
npm run dev
```

巨大ファイル（`world-home.tsx` / `rider-page.tsx` / `boot.js` / `p2p.ts` など）は `source-parts/` に分割してあります。`npm run assemble-source` が結合して本来のパスへ書き出します。

スタイルは `src/styles-world.css` （barrel）が `src/styles-world/01.css`–19.css を `@import` します。

`public/` の画像・動画が未取得なら `npm run fetch-assets` を試してください（公開プレビューから取り込み）。

## 必要な環境変数

`.env.example` をコピーして `.env` を作ってください。ローカル再生だけなら空のままで構いません。
