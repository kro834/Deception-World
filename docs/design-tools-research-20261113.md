# Webサイトデザイン・演出ツール調査

調査日: 2026-11-13

対象: Deception World（React 19 / Vite 8 / Three.js 0.186）。特撮の物語演出、画像を使った変身、スクロール連動、長いモーション実装、Safari/iPhone対応、既存の品質・オーナー承認仕様を保つ前提で、公式ページを比較した。

## 推奨まとめ

- **参考サイト**は無料閲覧できる範囲で [Awwwards](https://www.awwwards.com/)、[Godly](https://godly.design/)、[The FWA](https://thefwa.com/)、[Lapa Ninja](https://www.lapa.ninja/) を使い分ける。Awwwards/FWAで大胆な実演、Godlyで最近のウェブ・アプリの表現、Lapaでページ全体と導入部の構成を見る。[Land-book](https://land-book.com/) はモーション・セクション検索が必要な時に無料枠で試す。[Mobbin](https://mobbin.com/) はiPhone UIや実サービスの遷移調査が頻繁に発生してから有料契約を判断する。
- **実装ライブラリは、まず現行のCSS/Three.jsと制作コードを使う。**スクロールと時間軸を同期させる新しいDOM演出に限定してGSAPを候補にし、小さなReact UIの状態遷移にはMotionを代替候補にする。両方を一箇所に重ねない。
- **3DはBlenderで制作し、Three.js 0.186で配信する。**React Three FiberはReact 19と互換のv9があるが、既存Three.js演出の置き換えには採用しない。Splineは非機密のスタディ用に留め、制作物をSaaSへ預ける条件と公開・セルフホストの費用を確認する。
- **本番投入前の確認には既存のローカルハーネスを使う。**既存のスクロール状態・画像・演出タイミングに対して、変更前後のスクリーンショット、Chrome/WebKit、phone/desktop、reduced-motion、実機Safari確認を分けて記録する。広告的な指標やブラウザのフレーム時間をGPU計測と見なさない。

## 参照サイト

| サイト | 向いている観察 | 無料・有料の確認（調査日現在） | Deception Worldでの使い方 |
| --- | --- | --- | --- |
| [Awwwards](https://www.awwwards.com/) | Site of the Day、スクロール、WebGL、React、GSAP別の事例を探せる。掲載サイトを実際に開き、導線とモーションの目的を見る。 | 作品閲覧は公開ページで可能。Proは年払いBasic €6/月、Professional €12.50/月の表示。Proは主に制作会社・個人の掲載やディレクトリ機能で、参考閲覧のための契約は不要。 | 大きな画面演出やタイポグラフィの「強さ」の参考に限定。点数や流行をそのまま追わず、スマホで崩れないか実サイトで確認する。公式の[トップ/コレクション](https://www.awwwards.com/)と[料金](https://www.awwwards.com/pro)を参照。 |
| [Godly](https://godly.design/) | ウェブサイト、アプリ、UI、ヒーロー、CTAなどのキュレーション。 | 公開ギャラリーを閲覧可能。商用ライセンスや有料プランの範囲は公開ページだけでは確認できず、価格は不明。掲載物の権利は各作者・ブランド側にあるものとして扱う。 | 配色・画面構成・局所的な演出の探索用。スクリーンショットや作品素材の流用はしない。公式[ギャラリー](https://godly.design/)、[About](https://godly.design/about/)。 |
| [The FWA](https://thefwa.com/) | デジタル表現の受賞作と、その作品に紐づく画像・アニメーション・短編映像。 | 受賞アーカイブは公開。投稿・審査関連の費用や機能は別途要確認。閲覧者向け有料契約は確認できず、素材再利用ライセンスは不明。 | 変身や章の切替など「演出が何を伝えているか」を分析する。過剰な動きをコピーせず、既存の演出意図と承認済みタイミングを優先する。公式[受賞作](https://thefwa.com/)、[Artwork](https://thefwa.com/artwork)。 |
| [Land-book](https://land-book.com/) | 全ページ、セクション別、色・スタイル・業界での検索。 | Freeはカテゴリ・セクション・検索・ボード数が制限。Proは月払い$9/月、年払い$6/月（年$72）の表示。Proにはモーション検索、スクリーンショット保存等がある。 | 画面間の余白、本文導入、見出し、フッターを比較する。保存画像をそのまま納品物へ貼り込まず、構造上の学びだけ利用する。公式[Pro/料金](https://land-book.com/pro)。 |
| [Lapa Ninja](https://www.lapa.ninja/) | ランディングページのフルページ画像、動画、フォント情報。 | 公式Aboutは「Free for everyone — no account needed」と説明。無料アカウントは5 Boards、1 board 20 saves。Pro価格は公式Aboutで確認できず不明。参考サイト自体の画像・素材の再利用条件は別途確認が必要。 | 導入部の情報設計、見出し階層、縦長ページの読み進め方に使う。特撮サイトの物語型スクロールにそのまま当てはめない。公式[About](https://www.lapa.ninja/about/)。 |
| [Mobbin](https://mobbin.com/) | 実サービスの画面、モバイル・ウェブの操作フロー、遷移アニメーション。 | Freeは限定アクセス。料金ページは地域設定により表示通貨が変わり、調査時はPro R$50/月（年払い）、Team R$80/人/月（年払い）と表示。日本円価格は未確認。MCPはPro/Teamに含まれる。利用条件・画面コピー権限はアカウント条件に従う。 | iPhoneのメニュー、戻る動作、ダイアログ、操作可能領域の観察に有効。既存のオーナー仕様より優先しない。定常的に使う場合だけ価格を再確認する。公式[料金](https://mobbin.com/pricing)。 |

## アニメーション・3D制作候補

| 候補 | 適合と推奨 | 費用・ライセンス | 実行負荷・外部依存 |
| --- | --- | --- | --- |
| [GSAP](https://gsap.com/) / ScrollTrigger / `@gsap/react` | **限定採用候補。**DOM・SVGの新規シーケンスで、スクロール位置と複数トラックの時間軸を組みたい時に向く。React向けcontext hookでcleanupできる。既存の特撮Canvas時間軸や独自スクロール演出を一括移植する理由にはならない。 | GSAP公式の「No Charge」ライセンスは商用のウェブサイト/アプリ使用を許諾。ただしWebflowと競合するノーコードの視覚アニメーション制作ツールへの組込みは禁止。導入前に[現行ライセンス](https://gsap.com/community/standard-license/)を再確認。 | 自前バンドルで動作し、実行時クラウド依存なし。メインスレッドで大量のDOMやlayoutを毎フレーム扱うと負荷が増す。現在のCSS/Three.jsと同じ対象を二重に制御しない。 |
| [Motion for React](https://motion.dev/docs/react) | **小さなReact UI向け代替候補。**ボタン、タブ、カード、Dialogの出入りやlayout変化など、状態と連動する短い動きに使いやすい。長い特撮シーケンスやピクセル単位の既存演出を置き換えない。GSAPと同じDOM要素に重ねない。 | Motion本体はMIT。Motion+の例・UIソース等は有料（Personal lifetimeまたはBusiness年契約）。[公式GitHub README](https://github.com/motiondivision/motion#readme)と[ライセンス](https://github.com/motiondivision/motion/blob/main/LICENSE)を参照。 | npm依存を追加してバンドルへ含める。アニメーション実行時に外部サービスは不要。長いリストやGPU負荷が高いページでは`LazyMotion`等を含むbundle/performance guidanceに従い、reduced-motionも確認。 |
| [Three.js](https://threejs.org/) + [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) | **Three.js継続を推奨。R3Fは新規React主導シーンのみ参考。**既存プロジェクトはThree.jsを既に採用し、独自の変身・Canvas・資源解放処理を持つ。React 19にはR3F v9が対応するが、置換するとReact reconcilerとフレームループの責務が増える。v10は公式docsでalpha扱いのため使わない。 | Three.jsはMIT。[R3FはMIT](https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE)。 | WebGLの描画・texture・GPUメモリは端末差が大きい。R3F導入でGPU負荷が自動的に解決するわけではない。公式の[性能ガイド](https://r3f.docs.pmnd.rs/advanced/scaling-performance)に沿い、描画密度、DPR、休止ページ、context/resource解放を別に検証する。 |
| [Blender](https://www.blender.org/) | **制作素材の本命。**特撮プロップ、装甲・メカ素材、光や煙の素材、静止画/短い連番を高品質に作り、最適化した画像やglTFをWebへ持ち込む。プロジェクトにBlender制作・asset buildの既存流れがあるため、新サービス追加が不要。 | BlenderはGPLのソフトだが、公式FAQは作成した出力を制作者の著作物として商用利用可能と説明。Blender Python APIを使うPythonスクリプトを配布する場合はGPL条件を確認。追加モデル、HDRI、フォント、音源の権利は個別。公式[FAQ](https://www.blender.org/support/faq/)。 | オフライン制作、描画コストは制作時に発生。レンダー済み画像はブラウザの3D負荷を抑えられるが、画像枚数・容量・decodeとメモリに注意。実装側で画面幅ごとの画像、遅延decode、品質モードを維持する。 |
| [Spline](https://spline.design/) | **参考/プロトタイプ限定。**素早くインタラクティブ3Dの構図・マテリアル・操作を試す用途。既存のキャラクター素材や内部演出をアップロードして本番化する候補にはしない。 | Freeは限定ファイル・Splineロゴ付きWeb export。Hobbyは年払い表示$12/seat/月でロゴなしWeb export、Proは$25/seat/月、Max $60。料金の詳細比較表ではDownload Code ExportはPro以上、Self-Hosted ExportはEnterpriseのみ。ページ上部のEnterprise要約は両者をまとめているため区別する。公式[料金](https://spline.design/pricing)、[Self-Hosted仕様](https://docs.spline.design/exporting-your-scene/web/exporting-as-self-hosted-project)。Spline Libraryのモデルは商用利用可と説明されるが、個々の第三者素材はその条件を確認。 | Public URL/ViewerはSpline配信に依存する。公式はWebGPUを既定とし未対応ブラウザでWebGLへフォールバックすると説明している。通常のCode Exportと、runtime・assetsを含むSelf-Hosted Exportは別機能。Three.js/R3F形式ではSplineのアニメーション・イベントが再現されないため、既存演出を移植する用途には不向き。公式[Code Export](https://docs.spline.design/exporting-your-scene/web/exporting-as-code)、[利用規約](https://spline.design/terms)。 |
| [Rive](https://rive.app/docs/runtimes/web/web-js) | **2D UIパーツに限定した候補。**アイコン、バッジ、小型ナビゲーションなど、状態機械で操作に反応させるベクター演出。複雑な全画面変身やThree.jsの代替には向かない。 | Freeは学習・個人プロジェクト向けで、Riveのスプラッシュ画面付きruntime exportを含む。スプラッシュなしexportのCadetは月$17/seatまたは年$108/seat、Voyagerは$49/月または$384/年。Studentは商用不可。公式[価格](https://rive.app/docs/account-admin/pricing)。Runtimeはオープンソースと説明されるが、作成/書き出しプランを別に見る。 | WASM runtimeはnpmから同梱でき、実行時のRiveクラウド不要。推奨WebGL2 rendererは新たなcanvas/graphics contextとなり得る。軽量なUIならCanvas2D variantも比較し、ページ遷移時停止・dispose・Safari実機でのメモリ/復帰を測る。 |

## 追加する価値がある候補（3件）

| 候補 | このサイトで効く箇所 | 採用条件 |
| --- | --- | --- |
| [W3C 日本語組版処理の要件（JLREQ）](https://www.w3.org/TR/jlreq/) | 320pxで長い人物名・見出し・本文を読む際の禁則、和欧文間隔、行間、見出し階層のレビュー基準。既存のNoto Sans JP等と指定された日本語原文を保ち、文字を小さくして収める前に行分割と幅を検討する。 | 無料公開の設計資料。プラグイン導入不要。CSS対応表ではないので、採用するCSSは実際のChrome/WebKitでも確認する。 |
| [Chrome DevTools CSS Overview](https://developer.chrome.com/docs/devtools/css-overview) + [Color Picker](https://developer.chrome.com/docs/devtools/css/color) | 各ページの色・書体・サイズ・行高の分布を棚卸しし、黒背景上の本文、選択状態、フォーカスの見分けやすさを改善する。キャラクターごとの固有色は残し、同じ用途のUI色や文字階層だけを整理する。 | 既存Chromeで利用できる。Color Pickerのコントラスト値は文字色と背景色の比較なので、発光や画像・動画に重なる文字の読みやすさは実画面で判断する。MCPが全パネル操作を提供するとの意味ではない。 |
| [glTF Transform](https://gltf-transform.dev/cli) | 実際にGLBを読むDogs ArchiveのGuardianが対象候補。`inspect`で形状・テクスチャ・アニメーションを把握し、重複除去等を既存Blender/Draco工程と比較する。 | 今回は未導入。GLBが転送・decodeのボトルネックと確認できた時に制作側ツールとして検討。簡略化や量子化は外観を変え得るので、輪郭・骨格・発光とdecode後のモデルを比較する。DOMやCanvas画像演出全般には効かない。 |

## 使い分けと品質の守り方

1. **まず参照を観察して仕様に落とす。**気に入った画面から、見出しの順序、タップ領域、スクロール区間、動きの開始/停止条件、静止状態を言葉にする。サイトの画像・ロゴ・コピー・独自レイアウトを複製しない。
2. **今ある実装に足りない能力だけ追加する。**新しいシーケンスの時間軸ならGSAP、小さなReact状態演出ならMotion、3Dモデル制作ならBlender。GSAPとMotionは同一演出に併用せず、導入は独立した小さな範囲にする。既存コードの資源ライフサイクルと見比べてから採用する。
3. **既存の承認済み演出・閾値を変えずに検証する。**スクロール導入と途中フレーム、画面端の粒子、reactor/eyeの段階点灯、最終装着を段階的に見る。具体的なタイミング値は対象チェックアウトのオーナー仕様・実装から採り、開始・途中・完成の比較へ結びつける。この調査表だけで過去の数値を現行の承認仕様とは認定しない。
4. **ブラウザを分ける。**Chromeの測定値はSafari/iPhoneの証拠にしない。ローカルハーネスでChrome/WebKitとphone/desktopを再現し、Safariの実機確認は別に記録する。reduced-motionと軽量品質も独立に見る。
5. **ライセンスと外部依存を成果物単位で確認する。**ライブラリのライセンスは掲載サイトの素材ライセンスを与えない。参照画像・音・3Dモデルは作者と配布元の利用条件を保持する。クラウドhost/APIを使う場合はavailability、データの扱い、費用、ロゴ/host制約を確認する。

この比較は採用の承認ではなく、調査日現在の候補選定である。価格、プラン特典、利用規約、ブラウザ対応は変わるため、インストール・課金・制作物アップロード前に各公式ページを再確認する。フレーム計測はGPU性能測定ではなく、Browser/WebKitエミュレーションも物理iPhone試験の代わりではない。
