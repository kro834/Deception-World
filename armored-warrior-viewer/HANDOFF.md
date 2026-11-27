# 装甲戦士 3D ビューア — 引き継ぎメモ

クラウド上の作業セッション（2026-11-27）から、ローカルで続きをするために持ち出した一式です。
このフォルダは Deception-World 本体のサイトとは独立しています（`src/` や `source-parts/` とは無関係）。

## 何があるか

| フォルダ | 中身 |
|---|---|
| `work/` | サイト本体（開発用の状態）。`index.html` `viewer.css` `ui.js` `viewer.js` `diag.js` `look/`（描画）`vendor/`（three.js r180）`model-v10/`（元のモデル）`model-v15/`（塗り・補助マップ・`manifest.json`）`previews-v15/` `previews-v15p/` `thumbs/` |
| `handover/` | 公開用 zip（`armored-warrior-viewer-v3.zip`）と ChatGPT Sites に貼る指示文 |
| `tools/` | `shot.cjs`（スクリーンショット）、`posters.cjs`（静止画）、`turntable.cjs`、`pack/`（軽量化・組み立て・zip）、`deploy/`（Vercel 用、未使用） |
| `pipeline/` | 制作スクリプト（コードのみ）。`bake/`（AO・法線・色ちがい修復）、`cel/`（塗りのならし・背面の描き起こし）、`lookdev/`（描画の検証 `robust.cjs` ほか）、`safari/`（Safari 対応パッチと強制失敗テスト）、`ui/` `ui2-a/`（UI の状態テスト）、`mock/` |
| `docs/` | `CONTRACT.md`（全体の取り決め）、`UI2-BRIEF.md`（UI の仕様）、`safari-review.md`（Safari レビュー） |
| `refs/` | 設定画（正面・背面）と計測した配色 |
| `original-site/` | 元サイト（chatgpt.site）の取得時点のコピー。参照用 |

持ち出していないもの：途中経過の画像（約3GB）、計算キャッシュ（約3GB）、Python / Node の環境。必要なら作り直せます。

## 動かし方

```
cd armored-warrior-viewer
python3 -m http.server 8765        # このフォルダをルートに配信
# ブラウザで http://localhost:8765/work/ を開く
```

- 診断パネル：`?diag=1`
- 開発用：`?plain=1`（塗りだけ）、`?set=path:value`（`look/tunables.js` の値を一時変更）、`?debug=N`、`?tier=`、`?capture=720`（静止画撮影用）

スクリプト類は、クラウド側の作業フォルダの絶対パス（`/tmp/claude-0/.../scratchpad`、文中の `SP`）を前提に書かれているものが多くあります。ローカルではこのフォルダを `SP` と読み替え、スクリプト内のパスを直してから使ってください。Playwright（Chromium）、Python（numpy / scipy / opencv / pillow、焼き込みには bpy）、Node（`@gltf-transform/cli`）が必要です。

## 公開物の作り方

```
# 静止画とサムネイル（最終の見た目で撮り直す）
node tools/posters.cjs --out work/previews-v15  --capture 720
node tools/posters.cjs --out work/previews-v15p --capture 450x720
python pipeline/ui2-a/thumbs.py work/previews-v15 work/thumbs
# 軽量化 → 組み立て → zip
python tools/pack/mapping_from_manifest.py
python tools/pack/pack_models.py --src work/model-v10 --out pack-out/model-v15 --mapping tools/pack/mapping.from-manifest.json --emissive-webp lossless
python tools/pack/assemble.py --keep 'diag.js' --keep 'previews-v15/*' --keep 'previews-v15p/*' --keep 'thumbs/*'
python tools/pack/make_zip.py --verify     # 「unrequested files: diag.js」は想定どおり（?diag=1 のときだけ読む）
```

公開先は ChatGPT Sites（zip と `handover/` の指示文を ChatGPT に渡す）。Vercel 用のスクリプトもありますが使っていません。

## 現在の状態（2026-11-27）

- **3D の見た目**：審査（設定画に対する採点、合格 85 点）で 10 回目に 85 点で合格。その後、オーナーの「精細さに欠ける」という指摘（iPhone 実機・全身表示）を受けて、仕上げのぼかし処理を外し、スマホの描画解像度を 3 倍相当に戻し、輪郭強調を 0.45 に上げた（`handover/` の v3）。**v3 は審査を受け直していない。実機での速度も未確認。**
- **UI**：全画面ステージ＋サムネイルの視点切替（A 案）。審査 90 点で合格。モデル切替の設計は入っているが、モデルが 1 体のあいだは表示されない。
- **Safari 対応**：import map を使わない読み込み、読み込み監視、未使用テクスチャの読み込み停止、失敗検出、`?diag=1` などを適用済み。PC の Chromium で検証。iPhone 実機では「3D が表示された」ことだけオーナーが確認。
- **読み込み量**（公開物、PC で実測）：初回表示まで約 14.2MB、高精細への切替で追加約 17.6MB。

## 残っていること

1. 追加の 3D モデル 2 体（Tripo。オーナーがファイルを用意する）。届いたら同じ手順（色ちがい修復 → ならし → 補助マップ → 軽量化 → 静止画）を通し、ビューアにモデル切替を実装する。UI 側の取り決めは `docs/UI2-BRIEF.md` と UI 担当の報告のとおり（`#models > button[data-model]`、`html[data-current-model]`、`#model-name`）。ビューア側は未実装。
2. 実機（iPhone）での速度確認。重ければ `look/tunables.js` の `pixels.mobile`（現在 2.1e6）を下げる、影の計算を静止時だけにする、など。
3. まだ精細さが足りない場合：ならす前の塗りの細部を寄りのときだけ戻す（`paintUnflattened` スイッチで上限を確認済み、本実装は未着手）。
4. 見た目の粗：背面から見た肩の羽根に金と青の小片が混ざる／右の垂れ布の先端が紫寄りで小さな黒い欠けがある／胸の影の境界が渦の縁でわずかに折れる。
5. 新しい文言の承認：「自由視点」「モデル」、ページの説明文。

## 主な設定の場所

- 見た目の調整値：`work/look/tunables.js`（影、装甲、金、クリスタル、線、発光、解像度）
- 塗りの差し替え：`work/model-v15/manifest.json` の `paint`（現在 body は `paintcel5_body_*`、helmet は `paintcel2_helmet_*`、chest は `paintcel_chest_*`）
- モデルのファイル名：`work/viewer.js` の `MODELS`（公開物では `tools/pack/assemble.py` が v15 に書き換える）
