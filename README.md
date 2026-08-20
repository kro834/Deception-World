# Deception World

仮面ライダーサーガ Deception World

公開リポジトリ: https://github.com/kro834/Deception-World

## 起動

```bash
git clone https://github.com/kro834/Deception-World.git
cd Deception-World
npm install
cp .env.example .env        # ローカル再生だけなら空のままで可
npm run dev
```

`src/` の本体ソースと `public/` の画像・動画はリポジトリに入っています。`npm install` の postinstall で `source-parts/` からも巨大ファイルを復元します。画像が欠けている場合は `npm run fetch-assets` を使えます。

スタイルは `src/styles-world.css`（barrel）が `src/styles-world/01.css`–`19.css` を `@import` します。

## 必要な環境変数

`.env.example` をコピーして `.env` を作ってください。ローカル再生だけなら空のままで構いません。
