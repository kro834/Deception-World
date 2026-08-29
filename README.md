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

`src/` の本体ソースと `public/` の画像・動画はリポジトリに入っています。`npm install` の postinstall で `source-parts/` からも巨大ファイルを復元します。分割対象の本体ソースを編集した場合は `npm run sync-source-parts` で分割ファイルを同期してください。画像が欠けている場合は `npm run fetch-assets` を使えます。

スタイルは `src/styles-world.css`（barrel）が `src/styles-world/01.css`–`27.css` を `@import` します。

## 必要な環境変数

`.env.example` をコピーして `.env` を作ってください。ローカル再生だけなら空のままで構いません。

### 「AIに聞く」の会話機能

`OPENAI_API_KEY` と共有Postgres用の `DATABASE_URL` を設定すると、8つの人格回線と汎用会話に対応したサーチにOpenAI Responses APIを使用します。サーチは挨拶・相談・文章作成・一般質問へそのまま答え、Deception World固有の質問だけを公開記録で根拠付けして参照ページを表示します。専用画面から `gpt-5.5` または `gpt-5.6-terra`（reasoning effort Low／Medium／High／XHigh）を選べ、Search ProはTerra XHighのPro modeを使用します。なりきりProは `gpt-5.6-sol` のInstant（effort none）／Max（effort max）／Pro（effort max + Pro mode）を選択できます。Normal人格は表示と実際の送信先が一致するよう `gpt-5.6-luna` に固定しています。

キーと実モデルの対応はサーバー側だけで参照され、ブラウザからの選択値は固定allow-listで再検証します。Responses APIは `store: false` かつツール無効で呼び出します。本番の外部AI接続は共有レート制限を必須とし、上限を確認できない場合はローカル人格コア／ローカルサーチへ切り替わります。上限は `ARCHIVE_AI_CLIENT_MINUTE_LIMIT`（利用者ごと・既定12単位/分）、`ARCHIVE_AI_CLIENT_DAILY_LIMIT`（利用者ごと・既定120単位/UTC日）、`ARCHIVE_AI_GLOBAL_DAILY_LIMIT`（全体・既定250単位/UTC日）で調整できます。1回の消費はstandard=1、advanced=2、pro=3単位です。

キーがない場合や通信が不安定な場合も、挨拶などの軽い会話はローカル応答し、作品検索は決定論的なローカルサーチへ自動で切り替わります。一般知識を生成できない状況では推測せず接続状態を伝えます。ページ遷移は常にサイト内の許可済み記録だけへ限定されます。
