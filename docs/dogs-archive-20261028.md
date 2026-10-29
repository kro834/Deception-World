# DOGS ARCHIVE

入口は共通メニュー、資料室、サイト内検索。`/dogs-archive?dog=5` で第五の“犬”を開く。
5つのタブは矢印キー・Home・Endでも選択でき、選択は現在のURLに反映する。
第一・第三・第四の未提供の個体設定は補完していない。第二は既存の
ダンテ／ヴァルグ資料へ接続し、第五に今回の立体模型を配置する。

## 四面図を基準とした再制作

利用者が初期候補の品質不足を指摘し、正面・背面・左右の四面図を追加指定した。
`reference/guardian-turnaround.png` を最優先の形状資料とし、
`scripts/blender/dogs_guardian_v2.py` と `output/dogs-archive/rebuild-v2/` で再制作する。
旧候補は比較・復元用に保全した。配信用は `junction-09` のスキン付きモデル。
再制作途中のクレイや、接続が不自然だった旧候補を配信用に混在させない。

追加の立体資料は利用者指定の[最初のMeshy共有モデル](https://www.meshy.ai/s/TYSiYp)
（Meshy上の表題: Emerald Abyss Leviathan）。公開viewerを四方向から確認した。
骨膜の重なり・孔縁・表皮の筋・細突起を参照する。GLBの直接流用はしていない。
同モデルの大きな平板や途切れは、四面図の形状へ取り込まない。

その後、利用者が[別の対象モデル](https://www.meshy.ai/s/e4k9Ga)を明示した。
最新の形状確認では、こちらを優先する。顔の発光線だけが浮いて見えないことも
追加の要件。線幅・輝度と周囲の骨緑を揃え、通常時と吐炎中の両方で確認する。

顔と胴体の接続には、追加の拡大原画 `reference/guardian-head-junction.jpg` を使う。
小渦から流れる幅広い黒緑の膜が頭部の上半分と側面へ連続する形が基準。
細い棒で吊られた三角板や、長い首を追加した形へ置き換えない。頭の可動中も
付け根が途切れないよう、正面・背面・側面と吐炎途中で確認する。

輪郭の補助比較は `scripts/compare-dogs-silhouette.mjs`。正面・背面の透明クレイを
同じ全高へ揃え、比率や各高さの横幅を比較する。入力画像のSHAを記録し、古い
クレイの比較結果を新しい形状へ転用しない。IoUを品質合格の基準にはしない。

`guardian_cavity_ao.py` は実形状への半球rayで陰影を作る任意のBlender helper。
`lighting.ts` は孔内壁と厚みを読むための限定自己影・PBR保持を備えた照明。
立体の孔内壁・後頭部・角根を前後左右で確認し、正式な表示へ接続する。

## 制作物

- `scripts/blender/build_guardian_v2.py`: Blender 4.5 LTSで造形、材質、頭皮の接続、
  配信用への軽量化を順に実行する生成入口。
- `scripts/blender/dogs_guardian_v2*.py`: 四面図、接続の拡大図、Meshyの回転画像を
  参考にした実体造形。旧 `dogs_guardian.py` は比較履歴として残す。
- `public/dogs-archive-20261028/guardian-v.glb`: 背面を含むメッシュ、焼き込んだ法線、
  Rest／Exhaleの姿勢、可動する頭皮・額網を内包する。約4.53 MBのDraco圧縮。
  頭皮の上端は胴側、鼻・頬・角は頭側に追従し、その間も連続して変形する。
- `public/dogs-archive-20261028/reference/`: 原画2枚、四面図、接続の拡大図。
  モデル表面への写真投影や板状の代用品には使用しない。画面の「原画」では最初の2枚を確認できる。
- `src/lib/dogs-archive/scene.ts` と `fire.ts`: three.jsの視点操作、浮遊、姿勢遷移、
  口に追従する吐炎と身体の周囲の炎。炎は立体ノイズを使うボリュームとして描画する。

再生成:

```sh
python3 scripts/blender/build_guardian_v2.py --blender /path/to/blender
node scripts/blender/validate_guardian_skin.mjs
```

生成先は `output/dogs-archive/rebuild-v2/`。編集用の高密度モデルは
`finish-study/guardian-v2-junction-sculpt.blend`、配信用は同フォルダーの
`guardian-v2-browser-draco.glb`。前・斜め・後・左右・上・吐炎の確認画像も残す。
空の作業ディレクトリで全工程を再実行し、通常・圧縮モデルともSHAの完全一致を確認した。
大きい作業ファイルやブラウザー検証用画像はGitへの登録対象にしない。

### 2026-10-29 材質の仕上げ

主渦の240枚の葉面だけ、暗い緑の膜と淡緑の骨縁を区別する頂点色へ調整した。
全身表示での変化は局所的であり、原画と同等の造形を達成したという扱いにはしない。
細かな巻き、顔の発光、頭皮のskin、吐炎姿勢、法線・ORM画像は維持する。
配信モデルは4,534,944 bytes（旧版より310,480 bytes削減）。Bone以外の圧縮データを
保持し、Boneの再圧縮は元頂点IDと向き付き三角形を復号して照合した。
描画用geometryバッファの量は従来と同じ。これは実機の最大メモリ量の測定ではない。

再現は上記生成工程のcanonical Blendと通常GLBを入力にする。
`recolor_guardian_r9_role.py` は研究用Blendに依存せず、COLOR以外のbytesを維持し、
通常GLBのSHA `5115a77e…e350` を検査する。続いて固定版DracoでBoneのみ圧縮する。

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/recolor_guardian_r9_role.py -- \
  --canonical-blend /path/to/guardian-v2-junction-sculpt.blend \
  --input-glb /path/to/original-raw-r9.glb --output-glb /tmp/guardian-role.glb
git show 62d81b98:public/dogs-archive-20261028/guardian-v.glb > /tmp/guardian-baseline.glb
# draco3dgltf@1.5.7を別の作業フォルダーへインストールして指定する。
DOGS_DRACO_DEPS=/path/to/node_modules/draco3dgltf \
  node scripts/blender/compress_guardian_bone_release.mjs \
  --baseline-glb /tmp/guardian-baseline.glb --input-glb /tmp/guardian-role.glb \
  --output-dir /tmp/guardian-release
node scripts/blender/verify_guardian_release_decoder.mjs \
  --baseline-glb /tmp/guardian-baseline.glb --input-glb /tmp/guardian-release/candidate.draco.glb \
  --output-dir /tmp/guardian-release
```

最終SHAは `d6fd72c481157bd586383adca1b6dff799f524423e5002fd6e6901993e467272`。
生成物と比較画像、5段階のskin検証は公開用ソースと分けてhandoffに保存する。

## 2026-10-29 v3 器官再構築（配信: `public/dogs-archive-20261029/`）

原画の語彙（骨の格子と暗い膜、小さな巻きの連鎖、扇状の平たい触手、埋まった顔、棘の尾）を
器官ごとに作り直した。rig（GuardianV_Root／BodyPivot／HeadPivot／JawPivot／MouthSocket／MouthAim／
TentaclePivot_00–10／NeckRig の 2 関節）、Rest／Exhale、頭の skin 彫刻は v2 のまま維持する。

- 生成: `scripts/blender/guardian_v3_lib.py`（回転最小フレームの管・帯・crosier・対数螺旋・パッチ・頂点色）、
  `scripts/blender/dogs_guardian_v3.py`（器官ごとの構築、`--organs` で部分再生成、`--export 1` で書き出し）、
  `scripts/blender/dogs_guardian_v3_export.py`（v2 と同じ Rest／Exhale 注入と Draco 書き出し、manifest）、
  `scripts/blender/deliver_guardian_v3.mjs`（配信フォルダーへ複製し manifest の識別子を書く）。
  入力は前任の配信用 blend（`handoff/goal/ciel3d/model/source/guardian-v2-browser.blend`）。
- 触手 11 本: 平たい墨色の帯、先端は対数螺旋のカール、内縁に crosier（シダの若芽型の小さな巻き）の連鎖。貫通穴は廃止。
- 渦 3 つ: 隙間を埋める暗い膜の管を螺旋に巻き、外縁と両面に骨の弧（内側の溝へ向かって細く暗く）、
  外縁に crosier の連鎖、中心に発光球（`Rune | v3 whorl core`、strength 0.7）。
- 外殻: S 字面に一次肋（平たい骨の帯、前後の背骨で高く脇で低いシダ状の傾き）＋二次脈＋背面・側面の支柱と
  斜材、くぼんだ膜セル（一部は本当の穴）、背面は穴の開いた淡い骨板、個体の左脇（+x）で各肋が巻いて終わる
  稜、内部に暗い芯（透けない）。尾は節のある墨の管と太い棘。
- 顔: 頭の表面に密着させた発光格子の葉（`face-lattice` テクスチャ、BLEND）。Head から skin の重みを転写し、
  Exhale 中も頭に追従する。4 本の触角に珠の列（HeadPivot の子）。
- 色: 役割ごとの頂点色（骨＝淡、墨＝黒緑、膜＝深緑）に実形状の半球 AO を 1 回乗算。ORM テクスチャは廃止し
  粗さはスカラー（前任は ORM の青で金属度が入り、墨が環境を映して灰色だった）。
- 配信: `guardian-v3.glb` 4,439,628 bytes（Draco、21 メッシュ、337,932 頂点、417,492 三角形、
  埋め込み画像 3 枚＝顔格子 1、微細法線 2）。
  復号器は `dogs-archive-20261028/decoders/` のまま。読込側の既定 URL と release identity、
  verify-public-deployment の許可パス、model テストの既定フォルダーを v3 へ切り替えた。
- 確認画像と原画比較: `handoff/goal/ciel3d/model/renders/`、`handoff/goal/ciel3d/model/compare/`。
  差分の記録は `handoff/goal/ciel3d/model/gaps.md`、材質チャンネルは同 `delivery.md`。
  原画と同等の造形に達したとは言わない。残差は gaps.md の末尾に記す。

## 2026-10-29 v5 蛇体と骨格（配信: 同フォルダー `guardian-v3.glb`、manifest revision `v5`）

利用者の指示「胴体は細長くヘビの様です。顔の部分と、右隣の胴体らしきものは1繋ぎで、蛇の尻尾が二股に分かれ、
顔の横から手が生えた様な形です。今の様に巨大な胴体ではありません。」「様々なポーズができる様に」に従い、
v3／v4 の大きな外殻を捨てて体のつくりを読み直した（`handoff/goal/ciel3d/model/anatomy-v4.md`）。

- 形: 細い肋付きの胴が一本。上端は右上で太く密なとぐろ（原画の大渦、中心が発光）、顔の右隣を下り、
  腰で二股の棘付きの尾（長い左下、短い右下）に分かれる。顔は短い首で胴につながる。頭の左横から腕が出て
  頭上で二度巻き（原画の小渦・中渦）、掌から五本の指（扇の触手）が開く。頭の左下と首の右から太い腕。
  肋は胴の前面を横切る骨の弧、背側に小さな巻きの稜、腹側に櫛状の棘、尾に長い棘。材質系と顔の発光は v3 のまま。
- 骨格 `SerpentRig`（94 関節、skin 1 つ）: SpineRoot → SpineUp_00–15（とぐろへ）／SpineDown_00–09（分岐点へ）→
  TailA_00–07／TailB_00–04、NeckBaseJoint → NeckHeadJoint → HeadPivot → JawPivot（＋MouthSocket／MouthAim）、
  ArmL_00–09、ArmR_00–04、TentaclePivot_00–10 と各指 2 節。重みは生成経路の弧長で隣接 2 骨に滑らかに配分、
  頭の sculpt は従来の重みを首末端骨と HeadPivot に付け替えた。頭の回転軸は v2 と同じ。
- クリップ: `Rest`／`Exhale`（首・頭・顎の 4 骨のみ。Rest に対する additive として重ねればどのポーズからでも吐炎）／
  `Coil`／`Rear`／`Swim`（4 秒ループ）。契約は `handoff/goal/ciel3d/model/delivery.md` と manifest（`poseClips`, `breath`, `nodes`）。
- 生成: `scripts/blender/dogs_guardian_v5.py`（`guardian_v3_lib.py` に重み付きの管・帯・patch を追加）。
  配信 4,509,824 bytes（Draco、19 メッシュ、Blender 194,999 頂点／386,404 三角形、埋め込み画像 3 枚）。
  現行ページは変更なしで動作（Rest/Exhale の crossfade、MouthSocket／MouthAim は骨ノード）。
- 比較: `handoff/goal/ciel3d/model/compare/32-v5-serpent-turnaround.jpg`（原画／r9／v5 の 4 面＋¾）、
  `33-v5-poses.jpg`（5 ポーズ × 正面・左）、`34-v5-page.jpg`（実ページ）。原画同等とは言わない。
- `dogs_guardian_v4.py` は r9 形状＋v3 材質の中間案（コーディネーター講評用）。記録として残す。

### 2026-10-29 v6 細部パス（同じ骨格・契約、配信 5,813,968 bytes）
講評「表面が滑らかな粘土の玩具に見える」に対し、v5 の体のつくりと rig はそのままで表面だけを詰めた。
とぐろは細い肋＋三列の三日月状の鉤（面に伏せた小さな巻き、中心へ向かって発光へ混色）、胴は細い肋＋二列の
鉤＋腹側の櫛棘、背の稜の巻きを大きく密に。腕（触手）の縁の巻きは大きく密に（間隔 0.30 幅、長さ最大 1.45 幅）。
色は墨をほぼ黒緑（0.012–0.04）、骨縁を淡く（0.56）、発光を 1.0 に上げて対比を強めた。管の膜には生成した
タイル法線 `serpent-comb-normal`（細かな三日月の櫛と膜の皺）を胴方向の UV（AuthoredUV）で貼る
（材質 `Skin | v6 ink comb`）。Coil ポーズはとぐろ（SpineUp）を曲げず下半身・尾・腕を巻くよう修正。
Blender 221,431 頂点／436,648 三角形。比較: `compare/40-v6-vs-v5-turnaround.jpg`、`41-v6-closeups.jpg`、
`42-v6-poses.jpg`、`43-v6-page.jpg`。

### 2026-10-29 v7 四面図の投影彩色（同じ骨格・契約、配信 7,643,604 bytes）
コーディネーターの提案で、v6 の蛇体に四面図の 4 枚（`reference/guardian-turnaround.png`）を投影して
アトラスに焼いた（`scripts/blender/dogs_guardian_v7_paint.py`）。器官を 2 つの skinned オブジェクトに結合し、
smart UV で 2048²（胴・腕・尾）と 1024²（頭）のアトラスを作り、位置・法線・v6 の手続き的アルベドを焼く。
各テクセルを、各ビューのモデル外接矩形を原画の外接矩形に合わせた正射影で原画へ写し（双一次）、
法線·視線^1.5 の重み（側面 ×0.8）、カメラへ向かうレイの可視判定（最初に当たる面だけが塗られる）、
紙の白を除いた墨マスクで合成。見えない面は v6 の色のまま。合成は「明るくするだけ」（手続き的な淡い骨縁は、
位置の合わない原画の暗部で潰さない）。UV の隙間は島の色で埋める（ミップで黒が滲まないため）。
シルエット IoU（胴、可視判定なし）: 正面 0.563・背面 0.570・左 0.564・右 0.577。
結果: 二重像（顔・巻きの重複）は無い。ただし原画は約 90 px/m で、モデルの巻き 1 つが 2 px ほどにしかならず、
原画の密な細部は移らない。四面図角度では v6 とほぼ同じで、膜と渦の面にわずかな原画の斑が乗る程度
（`compare/50-v7-vs-v6-turnaround.jpg`、`51-v7-inbetween-angles.jpg`、`52-v7-closeups.jpg`）。
格子変形による厳密なシルエット合わせは行っていない（外接矩形合わせのみ）。原画同等とは言わない。
公開物はコーディネーターの判断で v6（5,813,968 bytes、GPU テクスチャが軽い）に戻した。v7 の投影パイプラインは、
高解像度の原画が届いたときに同じ手順で再実行する。

### 2026-10-29 v8 手描き風ディテールタイル（同じ骨格・契約、配信 7,802,436 bytes）
原画の語彙をタイルとして手続き的に作り（`scripts/blender/guardian_v8_tiles.py`、numpy、1024² アルベド WebP＋
512² 法線 PNG、継ぎ目なし）、`dogs_guardian_v5.py --tiles 1` で器官ごとに AuthoredUV へ貼る。
- `tile-crescent`: 不揃いで多段階の三日月の列（淡い骨の稜と暗い膜）→ とぐろと胴。
- `tile-curl`: 対数螺旋の細い巻きに小さな巻きが付く連鎖 → 腕と触手の帯。
- `tile-membrane`: 斑のある暗い膜に細く分岐する淡い脈と皺 → 首と二股の尾。
- 頭の仮面: `face-mask-albedo`（葉型の墨地、中央と両脇の稜、葉脈、尖った先端、黒い縁取り、alpha＝葉の形）、
  `face-lattice`（発光の格子、emissive）、`face-mask-normal`（稜の法線）。材質 `Rune | v8 face mask`（BLEND）。
- UV: u は器官に沿って 0.40 m を 1 周期、v は周長から周期数を決めて往復（閉じた管に継ぎ目が出ない）。
  管の頂点色は AO と発光の乗数（ほぼ白）に変え、色はタイルが持つ（glTF は baseColorTexture × COLOR_0）。
  骨の弧・巻き・棘・発光球・口は従来の材質のまま。
- 配信: 7,802,436 bytes、三角形数は v6 と同じ、実ページ 60 fps、契約テスト 39 件 pass。
- 比較: `handoff/goal/ciel3d/model/compare/60-v8-vs-v6-turnaround.jpg`、`61-v8-closeups.jpg`。
  とぐろ・胴は原画の三日月の鱗に近づき、腕は細い巻きが乗るがまだ疎。Blender に再読込した近景では顔の仮面が
  淡く描画されるが、配信 GLB の材質は暗い仮面（平均 sRGB 38/53/42、alpha で葉型）が baseColor に入っており、
  実ページの描画が正。原画同等とは言わない。

### 2026-10-30 v9 連続する巻きの連鎖と 1024² 法線（同じ骨格・契約、配信 7,973,760 bytes）
講評「巻きが散らばったシール（?）に見える」への対応。`tile-curl` を、u 方向に走る稜線から巻きが次々に立ち上がり、
大きな巻きの外側から小さな巻きが生える**連続した連鎖**（2 段階）に作り直した。往復する v の 0.05／0.95 の列が
帯の両縁に、0.5 の列が面に乗る。三日月の列は大きさ・位置・傾きを散らし、2 層を重ねた。
法線は三日月・巻きを 1024²、膜を 512² とし、**可逆 WebP**（`EXT_texture_webp`、three.js r186 が対応）で収める。
アルベドは非可逆 WebP、仮面は PNG。比較: `compare/70-v9-vs-v8-turnaround.jpg`、`71-v9-closeups.jpg`（頭・腕の縁・とぐろ）。
四面図角度では v8 とほぼ同じで、近景で腕の縁に連鎖が読める。原画同等とは言わない。

### 2026-10-30 v10 全身スケールのシルエット（触手）（配信 6,880,904 bytes）
ページでは個体が 400–700 px なので、タイルより輪郭が効く。原画 02／04 の触手に合わせて作り直した:
- 触手 12 本（上左の扇は 6 本。`TentaclePivot_11` と指の骨 `Frond11_1`／`Frond11_2` を追加、関節 97）。
- 各触手: 広い根元から細い先端へ強く絞り、2:1 の平たい帯の断面に淡い稜線の管、先端は 1.35 回転の螺旋
  （Rest に焼込み）。**内側（凹）の縁に実体の鉤歯の櫛**（局所幅の約 0.48 倍、先端へ向かって小さく、先端側へ
  傾いて曲がる平たい鉤。帯と同じ骨に重み付け）。珠に見えた管状の巻きは廃止。
- 顔の右の胴の肋を太く淡く規則的に（rib_scale 1.45、幅 0.28）、背の棘を大きく、顔の葉の縁に暗い花弁の鉤 12 本（`FacePetals`、頭に追従）。
- 予算: 三日月・巻きの法線を非可逆 WebP q90 に（−0.9 MB）。三角形 441,964。
- 比較: `compare/80-v10-page-scale.jpg`（原画 02／04 と v9／v10 を約 700 px で並置）、`81-v10-poses.jpg`（5 ポーズ）。
  触手の輪郭（絞り・螺旋・鋸歯）は原画の読みに近づいた。同等とは言わない。

### 2026-10-30 v11 全身スケールの残り（渦・頭の輪・大腕・房・肋）（配信 7,321,076 bytes）
- **大渦**: 「穴の開いた輪＋球」をやめ、対数螺旋（k 0.115、3.5 回転）で中心まで巻く**詰まった渦**に。
  管の半径は各周の隙間の半分（外周 0.27 → 中心 0.02）で周同士が接し、穴は無い。発光球は削除し、
  内側の周（面内半径 0.34 以内）の管と肋・鱗を `Rune | v3 whorl core`（材質名は不変）に切り替えて「光る芯の巻き」にした。
- **頭上の輪**（左腕のとぐろ 2 つ）: 2.2／2.4 回転で中心まで巻き、中心へ向かって細く（×0.22）、球を削除、内周は発光。
- **大腕 2 本**（Frond_05／06）: 絞りを強く（根元 1.0 幅、指数 1.6、先端 0.22）、歯は幅の 0.55 倍（上限 0.30）、
  先端の螺旋を 1.5 回転・長さ 1.7／1.6 に。
- **房の付け根**: 下左右の小巻き（Frond_07/10、08/09）を親の大腕の先端（螺旋の末端）に根付かせた。
  Coil 左でも浮く部位は無い。
- **肋**: 顔の右の胴は輪をやめ、前面の暗い背骨（細い管）から左右に対で外へ曲がり尾側へ流れる、先細りの骨の肋に。
- 比較: `compare/90-v11-page-scale.jpg`、`91-v11-poses.jpg`（5 ポーズ × 正面・左）。
  渦は詰まった螺旋として、大腕は螺旋に終わる絞りとして読める。頭上の輪は螺旋になったがまだ管で、面に伏せてはいない。

## 操作と読み込み

ドラッグで回転、ピンチまたはホイールで拡大縮小。キャンバスにフォーカスすると
矢印キー・`+`・`-`・Homeも使える。「炎を吐く」は滑らかに頭と顎を開き、
吐炎後に静止姿勢へ戻る。操作で選んだ視点は吐炎開始時に変更しない。

第五の表示中かつ遷移幕が閉じてから3Dを読み込む。メニュー・原画ダイアログ・
バックグラウンド中は時刻を停止し、閉じた後は同じモデルと視点から再開する。
他の個体やページへ移動するとリクエスト・描画・イベント・GPU用データを破棄する。
復号器は同じ配信元に置き、workerを1つに制限する。読み込み成功・中断のどちらでも
workerを解放し、中断後に遅れて完成したデータも破棄する。モデルだけでなく復号器の
配信SHAも、本番への切替前に照合する。
WebGL読み込みに失敗した場合は原画と再試行ボタンを表示する。
動きを減らす設定では自動的な浮遊を止め、利用者が選んだ吐炎のみ再生する。

このページの左右32pxから始まる単指タッチは、最初のtouchstartから非passiveで
キャンセルする。中央のタッチと複数指操作は維持し、ページを離れたら解除する。
履歴へのダミー項目やpopstateトラップは追加していない。DOMでの合成入力の確認と、
iOSが管理する実機の戻るスワイプの確認は区別する。

## 検証

```sh
node --test scripts/dogs-archive-navigation.test.mjs scripts/dogs-archive-model.test.mjs
npm run typecheck
npm test
npm run build
PORT=8873 node scripts/preview-production.mjs
```

3D構造テストはGLBの実バイナリ、全軸の厚み、頭に付随する口の座標、頭と顎の
異なるアニメーション、skinのbind行列とtrack、内包テクスチャを検査する。
書出し済みの通常GLBでも、5段階の頭・胴への実頂点追従を検査する。
形や材質が原画と同等かどうかは、
この構造テストの合格やポリゴン数では判断せず、原画と実表示の比較で別に確認する。

ブラウザー確認画像は `output/playwright/dogs-archive/`。320・390・834・1194pxの
画面、5タブ、原画、メニュー、回転・ズーム、姿勢、休止・再開、コンテキスト復帰、
ページを離れた後の解除を対象とする。iPhone／iPad実機でのOSジェスチャー抑止は
デスクトップ上のエミュレーションのみでは確認できない。
