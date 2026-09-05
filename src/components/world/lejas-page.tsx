import { useState } from "react";
import { useWorldMode } from "./use-world-mode";
import { DossierNav, RIKUEI_NAV } from "./dossier-nav";
import { FormPickup } from "./manager-stub";
import { DossierTopbar } from "./world-chrome";

export function LejasPage() {
  useWorldMode();
  const [closeUp, setCloseUp] = useState(false);

  return (
    <main
      className="manager-page"
      style={{
        ["--manager-accent" as string]: "#78b69b",
        ["--manager-accent-soft" as string]: "#d7ab51",
        ["--future-hud-primary" as string]: "#78b69b",
      }}
    >
      <div className="manager-ambient" aria-hidden="true">
        <div className="manager-grid" />
        <div className="manager-glow" />
      </div>
      <DossierTopbar
        fileLabel="MANAGER ARCHIVE / IV"
        returnHash="manager-archive"
        returnLabel="六詠一覧へ戻る"
      />

      <section className="manager-hero" id="top">
        <div className="manager-portrait-column">
          <button
            type="button"
            className={closeUp ? "manager-portrait-frame is-closeup" : "manager-portrait-frame"}
            onClick={() => setCloseUp((v) => !v)}
            aria-pressed={closeUp}
            aria-label={closeUp ? "全身ショットに戻す" : "顔アップを表示"}
          >
            <img
              className="lejas-wide"
              src="/manager-lejas.jpeg"
              srcSet="/manager-lejas.webp"
              sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1120px) 42vw, 520px"
              alt=""
              width={1122}
              height={1402}
              style={{ objectFit: "cover", objectPosition: "50% 8%" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <img
              className="lejas-face"
              src="/manager-lejas-portrait.jpeg"
              srcSet="/manager-lejas-portrait.webp"
              sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1120px) 42vw, 520px"
              alt=""
              width={1500}
              height={1872}
              style={{ objectFit: "cover", objectPosition: "50% 8%" }}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
            <div className="manager-portrait-shade" aria-hidden="true" />
            <span className="manager-numeral" aria-hidden="true">
              IV
            </span>
            <div className="manager-portrait-meta">
              <span>{closeUp ? "FACE CLOSE-UP" : "VISUAL CONFIRMED"}</span>
              <b>RIKUEI / IV</b>
            </div>
            <i className="manager-scanline" aria-hidden="true" />
            <span className="lejas-tap-hint">
              {closeUp ? "タップで引きショット" : "タップで顔アップ"}
            </span>
          </button>
        </div>
        <div className="manager-introduction">
          <p className="manager-eyebrow">
            <span>TOP-LEVEL MANAGER / BOARD / CHOICE</span>
            <i />
          </p>
          <p className="manager-file-number">ARCHIVE ACCESS // IV</p>
          <h1>
            <small>RIKUEI IV</small>
            <span className="manager-display-name">レジャス</span>
          </h1>
          <p className="manager-title"># 真実だけで破滅を組み上げる盤面の管理人</p>
          <div className="manager-quotes" aria-label="レジャスの台詞">
            <q>私は一度も嘘を吐いていない</q>
            <q>選んだのは君だ。私が並べた選択肢の中から</q>
            <q>希望は本物だったよ。君の望んだ結末へ続いていなかっただけで</q>
          </div>
          <dl className="manager-facts">
            <div>
              <dt>NAME</dt>
              <dd>レジャス</dd>
            </div>
            <div>
              <dt>AGE</dt>
              <dd>不明</dd>
            </div>
            <div>
              <dt>GENDER</dt>
              <dd>男性</dd>
            </div>
            <div>
              <dt>HEIGHT</dt>
              <dd>186.4cm</dd>
            </div>
            <div>
              <dt>WEIGHT</dt>
              <dd>76.4kg</dd>
            </div>
            <div>
              <dt>RANK</dt>
              <dd>六詠・第四位</dd>
            </div>
          </dl>
          <div className="manager-scroll-cue">
            <span>SCROLL / DOSSIER CONTINUES</span>
            <i />
          </div>
        </div>
      </section>

      <section className="manager-dossier" aria-label="レジャスの人物資料">
        <div className="manager-section-index">
          <span>IV</span>
          <small>CHARACTER DOSSIER</small>
        </div>
        <nav className="manager-section-nav" aria-label="人物資料の章">
          <a href="#character-section-01">
            <span>01</span>
            <b>AUTHORITY / BOARD</b>
          </a>
          <a href="#character-section-02">
            <span>02</span>
            <b>PERSONALITY / TRUE DECEPTION</b>
          </a>
          <a href="#character-section-03">
            <span>03</span>
            <b>BATTLE / USED OPTIONS</b>
          </a>
        </nav>
        <div className="manager-sections">
          <article className="manager-copy-section" id="character-section-01">
            <div className="manager-copy-heading">
              <span>01</span>
              <p>AUTHORITY / BOARD</p>
              <h2>対立する目的が生まれた瞬間、世界は盤面になる。</h2>
            </div>
            <div className="manager-copy-body">
              <p>
                『盤面』『役割』『選択肢』『勝敗条件』を管轄する六詠第四位の管理人。一位とレックスには明確な隔たりがあるが、残る四名の中では戦闘能力、管理権限、策略の全てにおいて最強であり、同時に最も悪趣味とされる。
              </p>
              <p>
                他者の意志や感情を直接操らず、命令もせず、存在しない事実も示さない。真実の一部だけを適切な順序で見せ、選択可能な行動を配置し、相手自身に望ましい一手を選ばせる。
              </p>
            </div>
          </article>
          <article className="manager-copy-section" id="character-section-02">
            <div className="manager-copy-heading">
              <span>02</span>
              <p>PERSONALITY / TRUE DECEPTION</p>
              <h2>正しい情報だけで、相手自身に間違わせる。</h2>
            </div>
            <div className="manager-copy-body">
              <p>
                常に穏やかで、冗談を交えて話す紳士的な人物。侮辱されても笑顔を崩さず、明確な嘘をほとんど口にしない。情報の順番、主語、前提、時系列を調整し、正しい情報だけを受け取った相手が自分の思考で誤るよう導く。
              </p>
            </div>
          </article>
          <article className="manager-copy-section" id="character-section-03">
            <div className="manager-copy-heading">
              <span>03</span>
              <p>BATTLE / USED OPTIONS</p>
              <h2>最善手を選び続けた先に、敗北だけを残す。</h2>
            </div>
            <div className="manager-copy-body">
              <p>
                策略だけに依存した存在ではない。純粋な戦闘力も数多の管理人の中で頭一つ以上抜け、シュザに肉薄する。相手の攻撃を技ではなく選択として観察し、局所的な攻防では敗北しているように見せながら、戦闘全体では逃走経路、必殺技、連携を順番に使用済みへ変えていく。
              </p>
            </div>
          </article>
        </div>
      </section>

      <FormPickup
        rider={{
          img: "/manager-lejas-rider.jpeg",
          pos: "50% 8%",
          system: "ゲーマドライバー × グランドマスターガシャット／ゲームマスターガシャット",
          name: "ファラリス",
          calls: [
            "GAME MASTER SYSTEM!",
            "ガシャット!",
            "ガッチャーン!",
            "レベルアップ!!",
            "TRUE! FALSE! CHECKMATE!",
            "KAMEN RIDER FALS!",
          ],
          quote: "選んだのは君だ。私が並べた選択肢の中から",
          stats: [
            { dt: "HEIGHT", dd: "214.4cm" },
            { dt: "WEIGHT", dd: "104.4kg" },
            { dt: "PUNCH", dd: "244.4t" },
            { dt: "KICK", dd: "444.4t" },
            { dt: "JUMP", dd: "1444.4m" },
            { dt: "100m", dd: "0.0014sec" },
          ],
          abilities: [
            {
              name: "FALSE BOARD",
              body: "異なる目的を持つ二名以上がいる時だけ盤面を成立させ、人物、武器、建造物、能力、関係性までを駒や地形として登録する。",
            },
            {
              name: "RULE INSTALL",
              body: "敵味方と自身へ適用されるルールを最大四つ設定する。完全に解読した者はそのルールを逆用できる。",
            },
            {
              name: "ROLE ASSIGN",
              body: "現実の能力、立場、関係性を基に、キング、クイーン、ルーク、ビショップ、ナイト、ポーンなどの役割を与える。",
            },
            {
              name: "TRUE DISPLAY",
              body: "虚偽を含まない盤面情報を提示する一方、順番、範囲、主語、時間軸を選び、その先に生じる別の結果を伏せる。",
            },
            {
              name: "SAVE / RETRY",
              body: "配置、損傷、能力使用状況を一度だけ保存・復元する。全員の記憶は維持される。",
            },
            {
              name: "CHECKMATE PROCESS",
              body: "重要な選択を四手記録し、勝利へ至る合法手を閉鎖する。",
            },
          ],
          arsenal: [
            {
              name: "ノー・リーガムーブ",
              body: "大剣。対象の合法手を斬り、直前に選んだ回避、防御、反撃、能力発動を一時的に再使用不能とする。",
            },
            {
              name: "チェックメイト・バスティオン",
              body: "盾。受けた攻撃を一手として記録し、同系統を自動減衰する。",
            },
          ],
          finishers: [
            {
              name: "FALS CRITICAL STRIKE",
              body: "白黒区画を跳躍して連続蹴撃を放ち、最も損害の大きい一撃だけを現実へ確定する。",
            },
            {
              name: "CHECKMATE CRITICAL END",
              body: "盤面を一枚の白黒区画へ圧縮し、一点へ収束したライダーキックで終局へ導く。",
            },
          ],
        }}
      />
      <DossierNav items={RIKUEI_NAV} currentHref="/managers/lejas" indexLabel="RIKUEI" />
    </main>
  );
}
