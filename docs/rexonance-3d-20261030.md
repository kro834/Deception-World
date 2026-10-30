# REXONANCE 3D

入口は `/rexonance-3d`。共通メニュー（DOGS ARCHIVE の次）、レクソナンスサーガ特設ページ下部の「立体模型で見る」、
サイト内検索から開く。利用者提供の十面の設定画を最優先の形状資料として、Blender で造形し three.js で表示する。

## 資料と縮尺

- `design/rexonance-3d-20261030/reference/`: 十面の設定画（正面 05・06・10、背面 03・04・09、右側面 01・07、左側面 02・08）。
- 全シート共通の縮尺 `S = 2.0 m / 1510 px`（正面 10 の冠の先端 y=8 から足裏 y=1518）。足裏が Z=0。
  正面 10 が幅と高さ、右側面 07 が奥行きを決める。設定画は絵なので面どうしが数 cm 食い違う。
- Blender の座標: +Z 上、スーツは -Y を向き、スーツ自身の左手が +X。glTF では +Y 上、+Z を向く。

## 制作（Blender 5.2、bpy モジュール）

`scripts/blender/rexonance3d/`（手順と約束事は同フォルダーの README.md）。

- `rx_ref.py`: 画素と寸法の対応、目印（肩・肘・手首・腰・膝・足首・胸の渦の中心など）。
- `rx_body.py`: 黒い鱗の下地スーツ。round cone と楕円体の符号付き距離場を smooth-min で合成し、
  4 mm 格子の marching cubes で面化、150,000 三角形に間引く。面の向きは符号付き体積で揃える。
- `rx_lib.py`: 素材族、掃引（輪郭は常に反時計回りに直して外向き）、刃形の輪郭、角柱・縁・輪・宝石、
  設定画の一面に描いた輪郭を体表へ投影する密着板（制約付き Delaunay）と帯。
- `build.py` と `rx_render.py`: 設定画と画素単位で重なる正射影の比較画像（参照｜描画｜重ね）、拡大比較、斜めの 4 面。
- `export.py`: 部位と材質ごとの結合、閉じた部品の内外を符号付き体積で補正、manifest。
- `pack_release.mjs`: Draco 圧縮（既定、位置 14・法線 10・UV 12・色 8 bit）か meshopt。

部位ごとに Opus 5.5 のエージェントが並列で造形し、コーディネーターが比較画像で講評して再作業を指示した。

| 部位 | モジュール | 三角形 |
| --- | --- | ---: |
| 下地スーツ | `rx_body.py` | 150,000 |
| ヘルメット（V 字の眼、菱形の額飾り、後ろへ流れる角、側頭の羽根、首の鱗襟） | `part_helmet*.py` | 50,427 |
| 胴（胸の渦と 16 枚の羽根、鱗の板、背骨の金の山形） | `part_torso*.py` | 52,488 |
| 両肩（12 分割の金縁メダリオン、三層の羽根、背の菱形結晶、垂れ飾り） | `part_shoulders.py` | 65,660 |
| ベルト・前後の垂れ・腰の金帯と垂れ飾り | `part_waist.py` | 53,058 |
| 腰から床へ流れる結晶のリボン（左右 3 本ずつ） | `part_ribbons.py` | 18,120 |
| 両腕（金の螺旋帯、籠手、金の腕輪、拳、肘の鎌） | `part_arms*.py` | 63,180 |
| 両脚とブーツ（腿の菱形、膝当て、脛の炎、山形の足首、甲の結晶） | `part_legs*.py` | 83,696 |
| 蠍の尾（12 節、結晶の鰭、S 字の針） | `part_tail.py` | 20,364 |

材質族（runtime はこの名前で見え方を決める）: `RX_Suit`（鱗の下地）、`RX_Black`（鏡面の漆黒）、`RX_Gold`、
`RX_GoldDark`、`RX_Silver`、`RX_Crystal`（UV v が付け根 0→先端 1、COLOR_0 の r が桃色寄り・g が煌めき・b が縁の光）、
`RX_Gem`、`RX_Glow`、`RX_Visor`、`RX_Dark`。

動く部位: 尾は空ノードの鎖 `RX_Tail_Pivot00..12`（各ノードに `rx_bend_axis`・`rx_side_axis`）、胸の羽根は
`RX_Torso_CorePivot`（`rx_spin_axis_gltf`、`rx_spin_rate`）、リボンは `RX_Ribbon_*`（UV v に比例して揺れる）、
宝石の星の煌めきは `RX_Glint_*`（39 個、`rx_glint_size`・`rx_glint_hue`）。

## 配信

- `public/rexonance-3d-20261030/rexonance.glb`: Draco、1,923,872 bytes、556,963 三角形、ノード 105（meshopt 版は 4,391,108 bytes）。
- `model-manifest.json`（GLB 自体から生成）、`textures/scale-normal.webp`（重なる鱗の法線）、
  `reference/*.webp`（比較パネル用 640×960）、`rexonance-3d-480.webp`（ポスター）。
- Draco の復号器は DOGS ARCHIVE と共用の `/dogs-archive-20261028/decoders/draco/`。WebAssembly をコンパイルできない
  ページでは同じフォルダーの純 JS 版で復号する。meshopt の復号器は meshopt の GLB を読むときだけ読み込む。

## 表示（three.js r186）

`src/lib/rexonance-3d/`（scene, materials, studio, glints, motion, views, quality, contract, standalone）、
`src/components/rexonance-3d/rexonance-viewer.tsx`、`src/routes/rexonance-3d.tsx`、`src/styles-rexonance-3d.css`。

- 見え方は設定画の「漆黒と金、青い結晶、先端だけ桃色」に合わせた。結晶は群青から紺、細い斜めの破片と小さな煌めき、
  桃色は先端（uv.y 0.74 以上）と細い縁だけ。金は画面上の中央値 (200,145,91) を正面 10 の金 (192,136,87) に合わせた。
  漆黒は帯状の光源の映り込み、鱗は 1 枚ずつ上縁が光る。ブルームは発光体（胸と腰の核、眼、宝石の中心）だけ。
  トーンマッピングは Neutral（ACES は青を藤色へ寄せた）。
- 正面・右側面・背面・左側面・斜めの視点、自動回転、一時停止、参照画像の比較パネル。prefers-reduced-motion では
  動きを止め、画面外では描画しない。端末に応じて画素比と品質（Draco の worker 数を含む）を変える。

## 単体ページ

`node scripts/build-rexonance-3d-standalone.mjs` で `output/rexonance-3d/standalone/` に、サイト外で共有できる
1 枚のページを書き出す。`index.html` に viewer と three.js と GLB を内包し、`decoders/`・`textures/`・`reference/` を同梱する。
厳しい Content-Security-Policy（WebAssembly 不可）でも純 JS の Draco で表示できることを確認した。

## 再生成

```sh
python -m venv .bpy && .bpy/bin/pip install bpy==5.2.3 pillow scipy scikit-image
.bpy/bin/python scripts/blender/rexonance3d/build.py --parts all --release --out output/rexonance-3d/release
# RX_GLTF_DEPS は別の作業フォルダー（@gltf-transform/core・extensions・functions 4.x、meshoptimizer、draco3dgltf）
RX_GLTF_DEPS=/path/to/node_modules node scripts/blender/rexonance3d/pack_release.mjs \
  --input output/rexonance-3d/release/rexonance-raw-release.glb \
  --output public/rexonance-3d-20261030/rexonance.glb
RX_RAW_MANIFEST=output/rexonance-3d/release/model-manifest.raw.json node scripts/rexonance-3d-assets.mjs manifest
BASE_URL=http://127.0.0.1:<port> node scripts/capture-rexonance-3d.mjs page views poster
node --test scripts/rexonance-3d-model.test.mjs scripts/rexonance-3d-navigation.test.mjs
```

比較画像・作業ファイルは `output/rexonance-3d/`（Git 管理外）。

## 確認

- lint（エラー 0、既存の警告 32）、全テスト 3,526 件（3,520 pass、0 fail、6 skipped）、typecheck、production build。
- Chromium（SwiftShader）で 1440×900 と 390×844 とも ready。メッシュ 91、三角形 556,963、煌めき 39、尾の関節 13。

## 設定画との残差

- 尾の結晶の鰭は真正面・真後ろからは横向きに見え、絵ほど結晶が連続して見えない。針の鉤は絵より緩い。
- 肩のメダリオンは正面図と側面図の両方で円く見えるよう外前方へ向けた折衷（絵は両面とも正円に描く）。
- 膝当ては下地の膝の位置のため側面図で約 3 cm 前、冠の前縁は側面図で約 1 cm 後ろ。
- 肩の扇の結晶刃と腰のリボンは絵より細く、まばら。
