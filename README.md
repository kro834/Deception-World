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

`XAI_API_KEY` と共有Postgres用の `DATABASE_URL` を設定すると、8つの人格回線の会話応答にxAIを使用します。モデルは既定で `grok-4.6`、必要な場合だけ `XAI_CHAT_MODEL` で変更できます。キーはサーバー側だけで参照され、会話APIは保存を無効化して呼び出します。本番の外部AI接続は共有レート制限を必須とし、上限を確認できない場合は安全側でローカル人格コアへ切り替わります。全体の日次上限は `ARCHIVE_AI_GLOBAL_DAILY_LIMIT`（既定250単位、Normal=1／Pro=3）で調整できます。

キーがない場合や通信が不安定な場合も、サイト内のローカル人格コアへ自動で切り替わります。従来の公開記録検索は引き続き完全に端末内で動作します。
