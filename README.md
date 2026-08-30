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

`OPENAI_API_KEY` を設定すると、8つの人格回線と汎用会話に対応したサーチにOpenAI Responses APIを使用します。サーチは挨拶・相談・文章作成・一般質問へそのまま答え、Deception World固有の質問だけを公開記録で根拠付けして参照ページを表示します。専用画面から `gpt-5.5` または `gpt-5.6-terra`（reasoning effort Low／Medium／High／XHigh）を選べ、Search ProはTerra XHighのPro modeを使用します。なりきりProは `gpt-5.6-sol` のInstant／Max／Pro、Normal人格は `gpt-5.6-luna` Lowへ固定しています。

送信ごとに論理request IDを発行し、Postgres上の暗号化リクエスト台帳へ一度だけ登録します。OpenAI Responses APIは `background: true`、`store: false`、ツール無効で開始し、Response ID確定後は同じResponseだけを回収します。ブラウザは本文を保存せず、待機中IDだけをIndexedDBへ24時間保持します。iPhoneのバックグラウンド化、再読込、Wi-Fi／モバイル回線切替後も、同じIDで状態を再取得するため二重生成・二重利用枠消費を防げます。ブラウザの一時的なfetch失敗だけではローカル回答へ切り替えません。

ProductionではPostgresを必須とし、共有DBが利用できなければOpenAIを呼ばずfail closedします。プロセス内レート制限への縮退はローカル開発だけです。利用者bucketはブラウザが任意生成するheaderではなく、サーバー発行・HMAC署名済みのHttpOnly／Secure／SameSite=Lax cookieから導出します。headerのsession IDは既存台帳の所有権・再取得互換にだけ使用し、raw IPは保存・ログしません。台帳作成と利用者分／日次／全体の3 bucket更新は単一トランザクションで処理し、同じrequest IDは再消費しません。いずれかのbucketが上限を超えた場合は3 bucketの更新をまとめてrollbackし、拒否済みIDだけを記録します。上限は `ARCHIVE_AI_CLIENT_MINUTE_LIMIT`（既定12単位/分）、`ARCHIVE_AI_CLIENT_DAILY_LIMIT`（既定120単位/UTC日）、`ARCHIVE_AI_GLOBAL_DAILY_LIMIT`（既定250単位/UTC日）です。

完了回答はAES-256-GCMで暗号化して24時間保持し、期限後に削除します。ログへプロンプト、回答本文、API key、raw IPは出しません。要求モデルをそのまま自己申告せず、OpenAIの生レスポンスに含まれるmodel、Response ID、request IDを照合します。不一致は `provider_model_mismatch` としてオンライン成功扱いにしません。

公開候補の検証は `npm run verify:archive-ai -- --base-url https://candidate.example --expected-sha COMMIT_SHA --monitor-token "$ARCHIVE_MONITOR_TOKEN"` で行います。未昇格コードからProduction台帳のmaintenanceは実行せず、GPT-5.5／TerraそれぞれのLow・Medium・High・XHigh、Terra Search Pro、Luna Normal、Sol Instant・Max・Proという選択可能な全13経路が、オンライン応答・実モデル一致・provider IDs・commit SHA一致を満たした場合だけ終了コード0です。`--base-url` と `--expected-sha` は省略できません。秘密鍵と回答本文は検証ログへ出しません。

### AI配備ランブック

Vercel Productionへ次を登録します。Previewでは実キーを要求せず、Productionだけがこの組を使用します。

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `ARCHIVE_AI_REQUIRED=1`
- `ARCHIVE_RATE_LIMIT_SECRET`（32 bytes以上）
- `ARCHIVE_RESULT_ENCRYPTION_KEY`（正確に32 bytes）
- `ARCHIVE_MONITOR_TOKEN`（32 bytes以上）

GitHub Actionsには `VERCEL_TOKEN`、`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`、`ARCHIVE_MONITOR_TOKEN`、必要な場合だけ `VERCEL_PROTECTION_BYPASS` をsecretとして登録し、`PUBLIC_BASE_URL` をvariableへ登録します。OpenAI key、DB URL、暗号化鍵、レート制限鍵はGitHubへ渡しません。Vercel側の自動Production domain割当は停止し、`.github/workflows/deploy-main.yml` だけがmainのcommitからstaged Production候補を作成します。

workflowはlint、全テスト、型検査、Production build、候補上の全13経路実モデル照合を通した後だけProduction aliasを昇格します。通信基盤・モデル・マイグレーション変更時は、直前Productionから今回のmainまでの全commit差分を基準に候補を3周連続検証します。昇格前に現在のProductionの不変URLとcommit SHAを保存し、候補検証後にもaliasが同じURL／SHAを指していることを再確認します。途中で別のProductionが昇格していれば候補を昇格せず停止します。promoteの結果が曖昧、または設定・SHA・モデル契約違反が出た場合は、その正確なURLへrollbackして同じSHAへ戻ったことまで検証します。429、5xx、timeoutなど上流共通障害の可能性がある場合は直前版も同じ13経路で比較し、直前版が通る時だけrollback、両方が同じように失敗する時は公開版を維持してworkflow失敗通知を送ります。main以外のbranchやPRはProductionを昇格できません。

`GET /api/internal/archive-ai-health` は `Authorization: Bearer $ARCHIVE_MONITOR_TOKEN` で、必須値の形式、共有DB接続、台帳・rate charge・circuit breakerの3テーブル、AES-256-GCM roundtrip、deployment SHAを確認し、モデル呼び出しは行いません。`POST /api/internal/archive-ai-maintenance` は同じtokenと安定版v1契約で、期限内のpendingをlease付きで最大24件ずつ再巡回し、24時間を過ぎた台帳を削除します。provider response ID確定済みの行は同一IDだけを回収し、ID未確定のunknownは台帳の最大1回だけの再作成規則を維持します。Vercel Observabilityの1分livenessをhealth endpointへ設定してください。`.github/workflows/archive-ai-monitor.yml` は5分ごとにVercel APIから現在のProduction aliasを不変URLとcommit SHAへ解決し、そのSHAがmain履歴に属することと、公開aliasが同じSHAを配信することをhealth／maintenanceで検証します。正常なmain祖先がProductionに残っている場合も、v1 maintenanceを継続し、旧版を自動rollback対象にせずcontrol planeを確認し、6時間ごとに選択可能な全13経路を照合します。SHA・設定・レスポンス契約などデプロイ起因と確定できる失敗だけで、監視開始時と同じdeploymentがまだProductionであることを再確認してから直前Productionへ自動rollbackします。429、5xx、timeout、network error、provider共通障害の可能性だけではrollbackせず、workflowを失敗させて通知します。rollback後はaliasを再解決し、不変URLとSHAの両方が変わり、復旧先SHAがmain履歴に属しcontrol planeと全モデル経路が正常であることまで確認します。GitHub Actionsのworkflow失敗メール通知をVercelプロジェクト所有者／運用担当者で有効化してください。

キー交換は「新キーをProductionへ追加→候補を全13経路検証→昇格→15分の安定確認→旧キー失効」の順で行います。

失敗時はスモーク検証に表示されたreasonで切り分けます。

- `unconfigured`: Production必須6変数と、設定後の再デプロイを確認します。
- `provider_authentication` / `provider_permission`: Production Project、Service Account、API keyの権限を確認します。
- `provider_model_unavailable` / `provider_quota`: 対象Projectのモデル利用権限、利用上限、請求状態を確認します。
- `provider_rate_limited`: `Retry-After` と利用量を確認し、対象時間枠の回復を待ちます。
- `provider_model_mismatch`: providerModelと固定allow-listを確認し、公開候補を昇格させません。
- `shared_state_unavailable`: `DATABASE_URL`、migration、共有DBの接続状態を確認します。ProductionではOpenAIを呼びません。
- `provider_timeout` / `provider_unavailable` / `provider_invalid_response`: OpenAI側の状態、モデル利用権限、サーバーログを確認してから再検証します。
- `client_network`: 端末回線、VPN・コンテンツブロッカー、公開APIへの到達性を確認します。
- `client_http_4xx` / `client_http_5xx` / `client_invalid_payload`: 公開フロントとAPIが同じmainデプロイか、Origin・プロキシ・レスポンス契約を確認します。
