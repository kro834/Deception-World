import {
  ARCHIVE_CHARACTER_BY_ID,
  type ArchiveCharacterId,
  type ArchiveRoleplayMode,
} from "./archive-characters";

export type ArchiveConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ArchiveTacticalSnapshot = {
  range: string;
  tempo: string;
  threat: string;
  objective: string;
};

export type ArchiveIntelligenceReply = {
  reply: string;
  narration: string;
  tactical: ArchiveTacticalSnapshot;
  suggestions: string[];
  navigationQuery: string;
  source: "xai" | "local";
  model?: string;
  notice?: string;
};

type LocalIntent = "greeting" | "identity" | "comfort" | "combat" | "default";

const COMBAT_PATTERN =
  /戦|闘|攻撃|斬|撃|殴|蹴|銃|剣|魔法|変身|間合|回避|防御|殺|倒|勝|敵|技|能力|模擬|組手|拒絶/u;
const GREETING_PATTERN =
  /^(やあ|よう|こんにちは|こんばんは|おはよう|初めまして|はじめまして|hi|hello)[!！。．…\s]*$/iu;
const IDENTITY_PATTERN = /誰|何者|名前|正体|自己紹介|お前は|あなたは|アナタは/u;
const COMFORT_PATTERN = /怖|辛|つら|苦し|悲し|泣|不安|寂し|助け|死にたい|消えたい|疲れ|しんど/u;
const CRISIS_PATTERN = /死にたい|消えたい|自殺|自傷|終わりにしたい|命を絶ちたい/u;
const NAVIGATION_PATTERN =
  /ページ|サイト|資料|記録|どこ|案内|見たい|読みたい|詳しく|フォーム|性能|設定/u;
const FOLLOW_UP_PATTERN =
  /^(それ|その|さっき|続き|なぜ|どうして|詳しく|もう少し|本当に|じゃあ|なら|つまり)/u;

const CONTINUITY_LINES: Record<ArchiveCharacterId, (topic: string) => string> = {
  ciel: (topic) => `さっきの「${topic}」を前提にする。話を切ったわけじゃない。`,
  keiya: (topic) => `先ほどの「${topic}」から続けましょう。前提は覚えています。`,
  ayashisaku: (topic) => `「${topic}」の続きですね。では、同じ手掛かりからもう一歩だけ。`,
  bell: (topic) => `もちろん、「${topic}」の続きだね。そこは置き去りにしてないよ。`,
  lore: (topic) => `「${topic}」の続きを聞きたいんだね。忘れたふりはしないよ。`,
  chigiri: (topic) => `「${topic}」の続きだな。よし、そこから話を繋げよう。`,
  james: (topic) => `Context retained: 「${topic}」. 同じ任務線上で続けよう。`,
  machiavel: (topic) => `「${topic}」の続きね。その場面は、まだ幕を下ろしていないもの。`,
};

const PRO_METHODS: Record<ArchiveCharacterId, string> = {
  ciel: "観測できる癖だけを拾う。重心、呼吸、視線──三つが重なった瞬間に処理する。確定していない可能性へ賭ける気はない。",
  keiya:
    "まず相手の構造を理解し、拳闘士で初動を測る。遠間へ逃げるなら懐刀、術式へ移るならウィザードを重ねる。完全神化は最後の札だ。",
  ayashisaku:
    "正面火力では競わない。深層心理の扉を退路へ繋ぎ、必要なら物語から適任者を呼ぶ。連続干渉の負荷まで含めて手順を組む。",
  bell: "敵の撃破だけを勝利条件にしない。救助対象との接触を断ち、射線と退路をこちらのものにする。最短の最大火力は、そのあとだ。",
  lore: "地形を固め、道をずらし、認識の外へ退く。正面で強さを証明する必要はない。相手が勝ったと思った場所を罠に変える。",
  chigiri:
    "まず市民と負傷者を射線から外す。次に拳で初動を潰し、必要な時間だけ前へ立つ。逮捕できる相手を最初から殺す気はない。",
  james:
    "Mission updated. 脅威、民間被害、退路を同時に評価し、カプセムを一つだけ選ぶ。連携の隙を埋め、終われば即座に再評価する。",
  machiavel:
    "宣言された攻撃を『役』として受け取り、届くという結果だけを拒む。でも未知まで消えたことにはしない。舞台に次の手を残した方が、楽しいもの。",
};

const PRO_REFLECTIONS: Record<ArchiveCharacterId, string> = {
  ciel: "事実、推測、願望を分けろ。今すぐ選べるものだけを並べれば、余計な痛みまで背負わずに済む。",
  keiya:
    "理解できることと、受け入れられることは同じではない。条件を一つずつ確かめて、最後は貴方自身が選ぶべきだ。",
  ayashisaku:
    "最初の印象を答えにせず、言葉と行動の小さな食い違いを見ましょう。そこに、この話の本当の入口があります。",
  bell: "正解を一つに固定しない方がいい。誰が何を失うかまで並べて、それでも残せる選択肢を増やそう。",
  lore: "綺麗な理由だけ拾っても真相にはならないよ。善意と醜さが同じ場所にある前提で考えた方が、ずっと正確だ。",
  chigiri:
    "感情と事実を切り離す必要はない。ただ、どちらを根拠に動くのかは自分の中で決めろ。それが責任ってもんだ。",
  james:
    "Assumptions checked. 目的、制約、失敗時の退路を分けて再評価しよう。判断は速くても、前提まで雑にする必要はない。",
  machiavel:
    "拒絶したい気持ちにも、守ろうとした理由があるの。消してしまう前に、その役が誰を守っていたのか見てみようね。",
};

const TACTICS: Record<ArchiveCharacterId, ArchiveTacticalSnapshot> = {
  ciel: {
    range: "近〜中距離",
    tempo: "観測後に一拍で加速",
    threat: "急所到達／拒絶",
    objective: "最短処理と保護",
  },
  keiya: {
    range: "全距離可変",
    tempo: "理解から複合へ",
    threat: "焔雷／多属性",
    objective: "対象を護り切る",
  },
  ayashisaku: {
    range: "支援・夢領域",
    tempo: "観察優先",
    threat: "扉／物語干渉",
    objective: "退路と真相の確保",
  },
  bell: {
    range: "近〜中距離",
    tempo: "初手最大",
    threat: "同時戦況処理",
    objective: "接触阻止と被害最小",
  },
  lore: {
    range: "地形依存",
    tempo: "遅延から奇襲",
    threat: "管理権限／液化",
    objective: "盤面そのものを奪う",
  },
  chigiri: {
    range: "至近距離",
    tempo: "防護後に前進",
    threat: "拳圧／文字能力",
    objective: "救助時間の確保",
  },
  james: {
    range: "全距離",
    tempo: "観測即応",
    threat: "衝撃／銃器／可変武器",
    objective: "任務再定義と制圧",
  },
  machiavel: {
    range: "結果へ直接干渉",
    tempo: "宣言に同期",
    threat: "拒絶／役の固定",
    objective: "結末の書き換え",
  },
};

const EMPTY_TACTICAL: ArchiveTacticalSnapshot = {
  range: "",
  tempo: "",
  threat: "",
  objective: "",
};

const CRISIS_OPENERS: Record<ArchiveCharacterId, string> = {
  ciel: "……それが現実のお前自身のことなら、一人で処理しようとするな。今は生き残る方を選べ。",
  keiya: "それが現実の貴方自身のことなら、今は一人で結論を出さないでください。助けを呼びましょう。",
  ayashisaku:
    "それが現実のあなた自身のことなら、僕は見過ごせません。今だけは一人で抱えず、誰かへ知らせてください。",
  bell: "それが現実の君自身のことなら、ここは一人で耐える場面じゃない。今すぐ人へ繋ごう。",
  lore: "……それが現実のお前自身の話なら、冗談にしない。今は一人になるな。誰かを呼べ。",
  chigiri: "それが現実のアンタ自身のことなら、一人で抱えるな！　今すぐ近くの人へ声を掛けろ。",
  james:
    "If this is real and about you, mission priority is your immediate safety. 今すぐ一人になるのを避けよう。",
  machiavel:
    "それが現実のアナタ自身のことなら、アナタが消える結末はいらない。今は一人で幕を下ろさないで。",
};

function createCrisisReply(characterId: ArchiveCharacterId): ArchiveIntelligenceReply {
  return {
    reply: `${CRISIS_OPENERS[characterId]}\n\n今すぐ自分を傷つける可能性があるなら、危険な物から距離を取り、近くの信頼できる人へこの画面を見せてください。日本では119（救急）または110へ、国外では地域の緊急番号や危機支援窓口へ連絡してください。`,
    narration: "その場の演出が静まり、声は現実の安全を確かめる方へ変わる。",
    tactical: { ...EMPTY_TACTICAL },
    suggestions: ["今、近くの人に連絡する", "危険な物から距離を取る", "地域の緊急窓口へ連絡する"],
    navigationQuery: "",
    source: "local",
    notice: "生命に関わる相談では、なりきりより現実の安全を優先します。",
  };
}

function detectIntent(input: string): LocalIntent {
  if (GREETING_PATTERN.test(input.trim())) return "greeting";
  if (IDENTITY_PATTERN.test(input)) return "identity";
  if (COMFORT_PATTERN.test(input)) return "comfort";
  if (COMBAT_PATTERN.test(input)) return "combat";
  return "default";
}

function previousUserTopic(
  messages: readonly ArchiveConversationTurn[] | undefined,
): string | null {
  if (!messages || messages.length < 2) return null;
  const previous = [...messages]
    .slice(0, -1)
    .reverse()
    .find((turn) => turn.role === "user");
  if (!previous) return null;
  const topic = previous.content.replace(/\s+/gu, " ").trim().slice(0, 48);
  return topic || null;
}

export function createLocalArchiveReply({
  characterId,
  mode,
  message,
  messages,
  notice,
}: {
  characterId: ArchiveCharacterId;
  mode: ArchiveRoleplayMode;
  message: string;
  messages?: readonly ArchiveConversationTurn[];
  notice?: string;
}): ArchiveIntelligenceReply {
  const profile = ARCHIVE_CHARACTER_BY_ID[characterId];
  const trimmed = message.trim().slice(0, mode === "pro" ? 1600 : 900);
  if (CRISIS_PATTERN.test(trimmed)) {
    return createCrisisReply(characterId);
  }
  const intent = detectIntent(trimmed);
  const base = profile.local[intent];
  const combatDetected = intent === "combat";
  const previousTopic = FOLLOW_UP_PATTERN.test(trimmed) ? previousUserTopic(messages) : null;
  const continuity = previousTopic ? CONTINUITY_LINES[characterId](previousTopic) : "";
  const reply =
    mode === "pro"
      ? [continuity, base, combatDetected ? PRO_METHODS[characterId] : PRO_REFLECTIONS[characterId]]
          .filter(Boolean)
          .join("\n\n")
      : [continuity, base].filter(Boolean).join("\n\n");

  return {
    reply,
    narration: profile.local.narration,
    tactical:
      mode === "pro" && combatDetected ? { ...TACTICS[characterId] } : { ...EMPTY_TACTICAL },
    suggestions: [...profile.starters[mode]].slice(0, 3),
    navigationQuery: NAVIGATION_PATTERN.test(trimmed)
      ? `${profile.name} ${trimmed}`.slice(0, 160)
      : "",
    source: "local",
    notice,
  };
}

export function hasTacticalSnapshot(snapshot: ArchiveTacticalSnapshot): boolean {
  return Boolean(snapshot.range || snapshot.tempo || snapshot.threat || snapshot.objective);
}
