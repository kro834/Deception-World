# Deception World

仮面ライダーサーガ Deception World

公開リポジトリ: https://github.com/kro834/Deception-World

## 起動

```bash
git clone https://github.com/kro834/Deception-World.git
cd Deception-World
npm install
cp .env.example .env
npm run dev
```

`src/` の本体ソースと `public/` の画像・動画はリポジトリに含まれます。`npm install` の postinstall で `source-parts/` からも巨大ファイルを復元します。分割対象の本体ソースを編集した場合は `npm run sync-source-parts` で分割ファイルを同期してください。画像が欠けている場合は `npm run fetch-assets` を利用できます。

スタイルは `src/styles-world.css` から `src/styles-world/01.css`–`26.css` を読み込みます。

## 環境変数

`.env.example` をコピーして `.env` を作成してください。ローカル表示だけなら空のままでも起動できます。認証を使う場合はBetter Auth関連の値と `DATABASE_URL` を設定します。

## 公開

Production公開は `main` へのpushだけを起点にします。VercelのGit連携も `main` 以外を無効化し、Production build内でlint、全テスト、型検査、buildを通過した版だけを公開します。資格情報を設定した環境では `.github/workflows/deploy-main.yml` が候補URLのスモークテストと段階的な昇格も実施します。破壊的migrationは通常のbuildでは保留され、互換コードの公開確認後に限って明示適用します。

## AIチャットの撤去

旧AIチャット機能は公開入口、画面、API、モデル依存、監視処理を含めて撤去済みです。移行時に既存端末の保留データと設定を削除し、Production migrationでAI専用のリクエスト・レート制限テーブルも削除します。
