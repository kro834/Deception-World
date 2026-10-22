import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const input=await readFile("docs/handoff-rexonance-20261022.md","utf8");
const findings=[...input.matchAll(/^- (F\d+) \[([^\]]+)\] (.+)$/gm)].map(([,id,category,claim])=>({id,category,claim}));
assert.equal(findings.length,94);assert.equal(new Set(findings.map(x=>x.id)).size,94);
const notes={};
const add=(status,items)=>{for(const [id,note] of Object.entries(items))notes[id]={status,note};};
add("fixed-verified",{
F14:"1024×768のH1下端が875pxから721pxへ。横向きタブレットの舞台だけを縮め、最初の画面へ収めた。",
F16:"通常・強制配色の各CTAで実際にキーボードフォーカス。2pxの輪郭をoffset -4pxへ移し、切り欠きの内側に保持。",
F17:"ブランド名REXONANCEとセレクトの可視ラベル『比較する相手』をaccessible nameへ含めた。",
F56:"P14・性能比較の実操作前後でlive regionのDOM同一性がfalse→true。行の再演出キーは子に残した。",
F57:"比較カードでMAXを選択。選択タブとレンズのx・幅差が1px未満へ復旧。共通railの既存liquidrelayout APIを利用。",
F58:"390×844→844×390で、以前は変身45%からcompleteへ飛んだ。章・runwayの相対位置を保存し、再測定は44.9907%。",
F59:"390幅のSECTIONS見出しが画面外-210pxから118pxへ。Rexonanceだけ章グループをSPECIAL重複行より優先し、他の人物一覧規約を保持。",
F61:"共有SPECIAL_SITE_SECTIONSへassemblyを追加。メニューの5章を実際のリンクで確認し、検索のアンカー検査も実コンポーネントへ拡張。",
F62:"P14=900・P2=180から900÷180×100=500%。650%／6.5倍／+550%を500%／5.0倍／+400%へ訂正。",
F63:"Extreme側にもP14が存在するため比較の構成一覧にP14（Extreme tuning）を追加。レンダーを検査。",
F103:"原因はRexonance用CSSではなく共通body::beforeのSVG背景。ルートを限定して強制配色時に消し、通常のピンク装飾は維持。",
F107:"stage tabpanelから重複したaria-liveを除去。選択tabのaria-selectedとpanelのaria-labelledbyは保持。",
F108:"P1/P2ボタンを実フォーカスし、輪郭をoverflow:hiddenの内側へ。通常・強制配色とも2px／-4px。",
F109:"棒グラフのaria-labelにrole=img、比較コンソールと形態ボタン集合にはgroupを付け、名前を持てる要素へ。",
F110:"選択後も『マックスを表示中』として形態名を保持。単一選択のgroup内toggle buttonという既存操作は維持。aria-pressed自体を誤りとはしない。",
F111:"既存の配置を壊さず明示的banner/contentinfoを付与。実ブラウザーで各1ランドマークを確認。",
F112:"カードで選択した後に、選択レールと結果パネルの先頭を固定ヘッダー下へ即時表示。キーボード操作では選択タブへフォーカスを戻す。",
F115:"動き削減・省エネでは『変身の資料を見る』へ変更し、再演出を案内する段落を隠す。メディア設定変更・root属性監視は解除処理を対にした。",
F127:"P14つまみのleftアニメーションをtranslateへ。端点のleftは23pxのまま、実際のxだけが移動することを確認。軌道のfillは現行では既に静的。",
});
add("fixed-recheck-pending",{
F51:"h3と選択操作のほかに重複していた枠付きoutputを除去。P14/P1比という見出しと実際の選択操作・読み上げは維持。再描画確認待ち。",
F15:"768幅で237.922px×3列を実測。701–1099pxのSystem三面を一枚の板の縦組みに変更。最終レイアウト再測定待ち。",
F47:"CUT 01/02のラベルが板の左端と同じ位置で、inline paddingが0なのを確認。16–28pxの内側余白を追加。最終測定待ち。",
F64:"i-2の本文がplate03の同期・共鳴の仕事を重ねていた。既存のオーナー原稿rexonance-profile.tsの製造定義をそのまま引用し、検索抜粋も同期。",
F67:"フレーム測定で舞台のtopが62→77px、電話58→65pxへ変化。既存の最終ナビ寸法をCSSで初期予約し、JS計測は文字拡大等の補正として保持。再フレーム測定待ち。",
F69:"1440で実表示574pxなのに960wを選択。現行3形態だけのsizesを実測に寄せ、preload・warmup・visible imageが同じ関数を使う関係は維持。再通信測定待ち。",
F74:"3幅でカウンターの字が本体36/26.624/26pxに対して19/16/16px。generic bの書式を上書きしfont:inheritへ、本体の待機/カウント中の金属塗りも消して二重描画を防ぐ。再測定待ち。",
F75:"実フレームで000系のゼロ埋めを確認。ホストの最終文字列で幅を確保し、absoluteのカウンターは0から表示。最終フレームと幅不変の測定待ち。",
F99:"Systemの見出し折り返しで読み始めがずれる。1100px以上をsubgridの共有3行へ変更。原文とカードの順序は無変更、再測定待ち。",
F105:"320pxのCTA幅差を確認。400px以下だけ同じ幅の縦組みへ変更。再測定待ち。",
F113:"assemblyのscroll-marginだけreserve+12px。他章と同じreserve+24pxへ統一。アンカー実操作の再測定待ち。",
F124:"共通htmlのsmooth-scrollで長距離も連続スクラブされる。Rexonance滞在中だけnative anchorを即時にし、hash/historyは維持。再測定待ち。",
});
add("partial",{
F19:"FormMorphだけ原本URLを別読みしていた。表示・先読みと同じsrcset/sizesでdecodeするよう修正。低速画像8秒の切替回帰は完走したが、旧→新の全フレームでフラッシュがないという判定は未完。",
F55:"主要な英語見出し、ブランド、形態コード、章コードへlang=enを追加。音声読み上げ実機と全Latin runの網羅検査は未完。",
});
add("not-reproduced-current",{
F08:"ローカルMinchoを実描画し、同一文字列64pxの幅がpalt OFF 768px→ON 618.625px。『フォントにpaltがない』は現行に該当しない。",
F09:"装着章H2は他章と同じMincho・palt、1440で64.32px／1024で52.672px／390で40px。旧48/26px規則の単独支配ではない。",
F18:"Worldからの本物の遷移を毎フレーム採取。3幅で40.5–52.6ms時点にload gateとcoverを伴うcallが現れた。『数秒間の無防備なWorld』は再現しない。",
F31:"指摘された220 tonguesのdrawFlameHeatは現行では明示的no-op。オーナー2026-10-21のbody fireへ置換済みであり、その旧パスによる停止時再抽選は成立しない。炎全体の新しい見栄えの監査とは区別。",
F35:"章H2は1440で64.32px、1920で68px。stage H3は1440で51.44px、章見出しより小さい。終幕H2の拡大は意図した最終タイトル階層。",
F36:"採取した可視UIは全幅で12px以上。旧10–11pxの章/状態ラベルはTYPE版の役割指定へ置換されている。",
F38:"320pxでもサブコードは保持され、11個のkickerがハイフン分断する状態は観測しない。外部Michroma成功時の再組版は通信制約により別途必要。",
F46:"現行の選択タブは近黒文字ではなく白系のfill。追加でsystem Highlight/HighlightTextと子のcurrentColorを明示し、非選択タブの固定fillも解除。",
F48:"現行レイアウトは96px/132pxの固定値列、電話では2行。採取した行で旧auto-auto配置ではない。",
F49:"強制配色のP14ラベルは12px・15.59px高のボックスで、半分の高さへクリップされる規則は再現しない。外部書体成功時の字面差は未確認。",
F53:"縦タブレットは最新layout版で4:5。lazy sizes=autoも現行で有効。旧21:8の全面letterbox説明はそのまま当てはまらない。",
F54:"768幅のFORM COMPARISONは3列。実スクリーンショットでも横並びであり、旧縦積みは再現しない。電話の縦積みとは区別。",
F66:"1440のghostは上側、scroll cueは下側で離れている。320も画像下の別行。旧8pxのcue接触は観測しない。",
F68:"同条件を完全に再現した性能認定ではないが、初期1440サンプルのlong taskは164ms×1（50ms超過分114ms）、LCPはIMG 740ms。旧1.7sのTBTはこの試行では再現しない。",
F71:"現行stage panelは写真・装飾・別カラムの説明であり、旧callout本文を写真の繁雑部へ重ねるDOMは存在しない。",
F76:"Rexonanceのside panelで開閉中ともimg要素は0。旧ライダーカード画像を消して空カードが滑る状態はこのルートには再現しない。他ルート全般の修正とはしない。",
F77:"hero/assembly/coda/比較barにscale160ms・translate220ms等の共通transitionを実測。『hover/press/transitionがない』は現行に該当しない。",
F79:"初回1440のLCPはIMG 740msで採取、旧lede text 2.4–6.5sという固定的な説明は再現しない。ただし外部フォント成功時・低速回線のLCP保証ではない。",
F94:"320スクリーンショットでOF SA-GAは語内分断なしの2行目。現在はkicker-tailのまとまりを保持。",
F95:"320のULTRA 60sコードの実ボックスは一行。タブ全体の日本語/英語二段組をコードの不規則折り返しとは扱わない。",
F100:"1100px以上の章mapは承認済みの1列5行。05だけ二列跨ぎで矢印が約1000px離れる旧配置ではない。",
F101:"現行の形態比較は閉じたnative disclosure barとして段落の後に置かれる。旧450px固定余白の規則は最新layoutで置換。個々の絵/説明の高さが異なること自体は残る。",
F102:"終幕の立像はfooter内のtop50%/translate -50%、最大720pxへ最新layoutで置換。旧bottom0貼り付けではない。",
F106:"現在の電話の説明は『スライダー、両端のタップ、矢印キー』という複数の操作方法。タッチを使えないと案内しているものではなく、キーボード代替も残す。",
F122:"P1選択中に実pointer downを採取。背景は押下前後とも同じ135deg gradientで、旧solid whiteへの反転は再現しない。",
F123:"終幕3CTAともscale160ms/translate220ms/background/border/shadow/color220msを実測。古いtransition上書きの説明は現行に該当しない。",
F125:"World→Rexonanceの毎フレーム記録ではcallがなくなった時点でH1 opacity=1。3幅で旧handover後0.4–1.3sの無表示は観測しない。",
});
add("owner-retained",{
F10:"現行TYPE版が6書体の役割・scale/tokenを明記。computed sizeの数だけを理由に、オーナー承認の役割分担を単一書式へ潰さない。",
F11:"03の大きな数字を省く旨がeditorialに明記され、最新layoutも承認済み。章番号はmap/ナビで維持。別の章配置案は提案事項。",
F12:"DESIGN_AUDIT.mdが1300px以上46:54の持続split stageを明記。『映画キービジュアルでない』という評価だけで承認構図を撤去しない。",
F13:"同じ舞台を性能・P14の読み物と並べて保持することが最新layoutの決定。長さ・再利用の美的提案として残す。",
F20:"支給P14画像を明るい/疑似文字という理由だけで別のAI画像へ置換しない。画像原本への変更は別途オーナー判断。",
F37:"本文とdisplayが異なるscaleであることは現行TYPEの役割分担。1920専用の本文再設計は提案に留める。",
F39:"説明の原文と比較plate幅は現行設計を維持。現行文字色はTYPEの高コントラストtierへ変更済みだが、行長の読み心地の再設計は承認待ち。",
F42:"英字4書体の混在という集計ではなく、Forge=数値/名称、Etch=計器、他=操作/本文という明示役割を優先。",
F43:"Mincho displayが加わった現行で『distinct display voiceがない』は旧前提。Noto/Zenの用途を保ち、全サイト共有フォントをここだけ削らない。",
F50:"主CTA・補助操作・終幕plateの階層差は最新layoutで承認済み。インタラクションの共通transitionは既に実測できる。",
F52:"最新layoutが04を画像比率の560px枠として積むと明記。portraitとlandscapeを同じ一列で保つ設計は維持し、heroの見出し欠落F14とは分ける。",
F60:"DESIGN.mdのライダーレール以外は接触直後からレールがgestureを所有する規約を保持。全レールpan-yへ戻す修正はしない。",
F72:"長いカタログの後に変身を置く現行chapter順序とpersistent舞台を維持。削る/並べ替えると承認済み構成を変えるため提案事項。",
F73:"終幕は3CTA一列＋右端立像という最新承認構図を保持。hero lockupの再掲や新絵の追加は別案。",
F80:"タイトルの高速な整列と長い変身を分ける現行choreography。『rushed』という好みだけで所有者の演出全体を遅らせない。",
F96:"数値Forge、計器Etch、操作Zen、HUDの機能別役割を維持。全カウンターを同じfaceにするという美的統一は提案事項。",
F98:"共通DWモノグラムの変更はブランドと他ルートにも関係。ページ固有の不具合と断定せず提案に残す。",
F104:"最新DESIGN_AUDIT.mdは44pxの操作面を明示的に保持。3幅で実高44pxであり、旧一般文書の48pxへ一律拡大しない。",
F114:"常体/敬体の統一は原文の書き換えになるため行わない。F64は役割の誤りの訂正として既存原稿を引用する。",
F117:"6000m等は支給スペックの表記。誤値ではないため数値の桁区切りを理由に原文を変更しない。",
F118:"最新DESIGN_AUDIT.mdがスレート『01 STANDARD / HIGH · KEY VISUAL』を明記。監査を理由に勝手に別名へしない。",
F119:"最新layoutのstage/section seamを保持。溶け合う境界への改変は別の見た目案として残す。",
F120:"現在のstageはobject-fit:containで支給画を表示。元絵の端を生成拡張せず、枠・portraitのowner artを保持。",
F121:"containで元画像を全体表示しているため、crestに新しい画素を足す/絵を描き直す判断はしない。画像差し替え案として残す。",
F126:"装着・カウント・hover・場面転換は異なる目的。duration/curve数の集計だけでownerの場面ごとの時計を一律化しない。",
});
add("needs-owner-decision",{F65:"2026-10-22にオーナーがKHAOSのCore数は∞Coreと確定。レクソナンス・エクスプリーム両特設の比較と回帰テストを訂正。ジャンプ力は特設2ページの5000.0m（est.）とForm Archive・rider資料の188.8mが競合したままなので、推測せず変更を保留。"});
add("reproduced-open",{F78:"native details開閉のレイアウト変化は残る。表示位置を保つF112とは別問題。初期画像遅延・動き削減・閉鎖時アンマウントを維持した開閉アニメーションの実装と実測が未完。"});
add("unverified",{
F40:"ローカルMincho800/500とForgeは確認できたが、Google提供Zen/Michromaの成功ダウンロード時の実フォント照合はネットワーク障害で未完。",
F41:"特定の『犬と／して』『終焉／へ』の全幅・全フォントでの行分割をRange単位で確認できていない。原文は未変更。",
F44:"Google FontsのCSS自体が12秒curl/30秒browserで応答しない。観測7local files/109,708 bytesを全オンラインpayloadとは扱わない。95files/1.3MBの真偽は未確定。",
F45:"Google fonts遅延成功→swapという条件を作れていない。abortでfallbackは確認できるが成功時reflowの代用にはならない。",
F70:"リングのgrid absolute containing blockと数字の中心の位置をフレームで照合する測定が未完。CSSのleft:50%だけで断定しない。",
F97:"external face成功時のglyph fallbackの特定が未完。Computed font-familyの文字列だけで実使用glyph faceを断定しない。",
});
add("fixed-verified",{F116:"rangeとiOS selectを『比較基準』へ統一。可視『基準にする世代』をselect名にも含め、100%基準というvalue textを保持。"});
// Only upgrade a correction after its real browser assertion has passed.
try {
  const results=JSON.parse(await readFile('output/playwright/rexonance-audit94/verified-fixes-final/results.json','utf8'));
  assert.equal(results.length,3);
  const checked=new Set(results.flatMap(x=>x.checks));
  for(const id of checked)if(notes[id]?.status==='fixed-recheck-pending')notes[id]={...notes[id],status:'fixed-verified',note:notes[id].note.replace(/再測定待ち。|最終レイアウト再測定待ち。|最終測定待ち。|再描画確認待ち。|アンカー実操作の再測定待ち。|再通信測定待ち。/g,'')+' 最終候補の3幅ブラウザーassertionに記録。'};
  if(checked.has('F70'))notes.F70={status:'fixed-verified',note:'CDPで疑似要素の四隅を取得。1440で番号中心160.508px、旧リング719.984px。実際の数字幅を既存のレイアウト計測に統合し、新リング160.500px（差0.008px）へ。scrollごとの計測は追加しない。'};
  if(checked.has('F78'))notes.F78={status:'fixed-verified',note:'native detailsと初回画像遅延・即時closeを維持。Chromiumのintrinsic-size対応時だけ有限280msで開く。3幅で23フレームを採取し、2→233→399→506→711pxなどの段階的な展開を確認。reduced/economy/forced coloursでは適用しない。非対応engineはnative動作。'};
}catch(error){console.warn('Browser verification upgrades withheld:',error.message);}
try {
  const portrait=JSON.parse(await readFile('output/playwright/rexonance-audit94/final-font-outage/tablet-portrait.json','utf8'));
  const grid=portrait.normal.nodes.find(x=>x.class==='rxs-system-grid');
  assert.equal(grid.css.gridTemplateColumns.trim().split(/\s+/).length,1);
  notes.F15={status:'fixed-verified',note:`旧768幅は237.922px×3列。701–1099pxのSystemを一枚の板の縦組みへ変更し、最終768幅で${grid.css.gridTemplateColumns}の1列を実測。`};
}catch(error){console.warn('Portrait upgrade withheld:',error.message);}
try {
  for(const width of [1440,1024,390]) {
    const frames=JSON.parse(await readFile(`output/playwright/rexonance-audit94/motion-final/${width}.json`,'utf8'));
    assert.equal(new Set(frames.arrival.filter(x=>x.y>0).map(x=>x.y)).size,1);
    const counting=frames.counts.filter(x=>['count','lock'].includes(x.state));assert.ok(counting.length>0);
    assert.ok(counting.every(x=>x.hostSize===x.overlaySize&&x.hostBackground==='none'));
    assert.ok(frames.counts.every(x=>!/^0{2,}/.test(x.text)));
  }
  notes.F67={status:'fixed-verified',note:'初期フレームの舞台topが62→77px（電話58→65px）と変わる問題をCSSの初期reserveで修正。最終3幅はCSS適用後のtopが77/77/65pxで一定。文字拡大・safe-area用の実測補正は保持。'};
  notes.F74={status:'fixed-verified',note:'実フレームで19/16/16pxの重ね字を確認。本体36/26.624/26pxへfont:inheritで統一し、count/lock中のhost backgroundはnone。最終3幅のフレームで確認。'};
  notes.F75={status:'fixed-verified',note:'ゼロ埋めを廃止し0／0.0%から表示。最終3幅のフレームとformatCount全ケースで確認。レイアウト幅は元の最終文字列を保持するhostが確保。'};
}catch(error){console.warn('Frame verification upgrades withheld:',error.message);}
for(const item of findings)assert.ok(notes[item.id],`unaccounted ${item.id}`);
const counts={};for(const item of findings){const status=notes[item.id].status;counts[status]=(counts[status]||0)+1;}
const report={
  title:"Rexonance 94件 再検証（作業中・全件合格ではない）",baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  candidate:"baseline + isolated working-tree patch; not integrated or published",
  gates:{tests:'2772 total, 2767 passed, 0 failed, 5 skipped',typecheck:'passed',lint:'0 errors / 12 warnings',productionBuild:'npm run prebuild + vite build; database migration intentionally not invoked',sourceGroups:'15 verified',operability:'8 Chromium profiles passed under explicitly labelled external-font outage',callReturn:'desktop + phone, 3 real SPA entries each passed',interactionEdges:'5 profiles + slow image/artwork checks passed under explicitly labelled external-font outage'},
  profiles:["Chromium 1440×900","Chromium 1024×768 touch","Chromium 390×844 touch","supplemental 768×1024 / 320×740 / 1920×1080"],
  limitations:["Google fonts/grok extension unavailable; controlled outage runs are explicitly labelled, not normal-online certification","No physical iPhone/iPad verification","Some older finding descriptions supplied by the user end mid-sentence; original wording retained","No publication or main integration yet"],
  evidenceRoot:process.env.AUDIT_EVIDENCE_ROOT||"output/playwright/rexonance-audit94",counts,
  findings:findings.map(item=>({...item,...notes[item.id]})),
};
await writeFile('docs/rexonance-audit94-20261022.json',JSON.stringify(report,null,2)+'\n');
const md=[`# ${report.title}`,"",`基点は \`${report.baseline}\`。この報告は現在の候補差分の監査であり、94件すべての完了、通常通信時の保証、main統合、本番公開を意味しません。`,"",`証跡: \`${report.evidenceRoot}\`。通常3幅と補助3幅の画面・DOM・画像候補を採取し、再現確認した操作は実入力とフレーム記録で調べています。外部フォントの応答不良があるため、障害を明示的に再現した試験と、通信を変更しない初期試験を区別しています。`,"","## 件数","",...Object.entries(counts).map(([status,count])=>`- ${status}: ${count}`),"","## ID別の判定","","| ID | 判定 | 根拠・対応・残件 |","| --- | --- | --- |",...report.findings.map(x=>`| ${x.id} | ${x.status} | ${x.note.replaceAll('|','／')} |`),"","## 再実行","","`scripts/audit-rexonance-94.mjs`、`scripts/probe-rexonance-audit94.mjs`、`scripts/detail-rexonance-audit94.mjs`、`scripts/sample-rexonance-audit94-motion.mjs`、`scripts/verify-rexonance-audit94-fixes.mjs`。`BASE_URL`を本番ビルドのプレビューへ指定します。`AUDIT_OFFLINE_FONTS=1`は障害条件を明示するためのオプションで、通常オンラインの計測値として使いません。","","既存コード・他チャットの未保存変更を保全するため、別の一時worktreeで実装しました。公開ゲートの記録と未確認項目は、完了後ではなく実測の都度更新します。",""];
await writeFile('docs/rexonance-audit94-20261022.md',md.join('\n'));
console.log(JSON.stringify(counts));
