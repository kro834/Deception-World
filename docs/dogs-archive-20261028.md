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
