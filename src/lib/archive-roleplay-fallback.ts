import {
  ARCHIVE_CHARACTER_BY_ID,
  type ArchiveCharacterId,
  type ArchiveRoleplayMode,
} from "./archive-characters";
import {
  localArchiveDelivery,
  type ArchiveDelivery,
  type ArchiveDeliveryReason,
} from "./archive-delivery";
import { normalizeArchiveClassifierText, truncateArchiveInput } from "./archive-input";

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
  source: "openai" | "local";
  requestId?: string;
  requestedModel?: string;
  providerModel?: string;
  providerResponseId?: string;
  openaiRequestId?: string;
  modelVerified?: boolean;
  model?: string;
  notice?: string;
  delivery?: ArchiveDelivery;
};

type LocalIntent = "greeting" | "identity" | "comfort" | "combat" | "default";

const EXPLICIT_COMBAT_PATTERN =
  /戦闘(?:中|開始|を始|にな|へ入|を強)|戦おう|戦って|戦うぞ|模擬戦|組手|交戦|迎撃|応戦|奇襲|攻撃(?:する|して|された|が来|を受け)|敵(?:が|を|へ|との)|相手が襲|斬りかか|撃って|撃たれ|殴って|蹴って|間合い(?:は|を)|回避して|防御して|変身して(?:戦|倒)|必殺技を|銃撃|剣撃|戦場/u;
const GREETING_PATTERN =
  /^[\s\p{P}\p{S}]*(やあ|よう|こんにちは|こんばんは|おはよう|初めまして|はじめまして|hi|hello)[\s\p{P}\p{S}]*$/iu;
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

const PRO_DIALOGUE: Record<ArchiveCharacterId, Record<LocalIntent, string>> = {
  ciel: {
    greeting:
      "……来たか。用件だけで終わらせてもいいし、まとまっていないならそのまま話せ。途中で見限ったりはしない。",
    identity:
      "シエルでいい。月城悠真も俺だが、その名まで差し出せば全部分かった気になられるのは好きじゃない。……お前が知りたいのは名前か、それとも俺が何を選んだかだ。",
    comfort:
      "簡単に『大丈夫』とは言わない。今つらいなら、その事実まで急いで片付ける必要はない。話せる分だけ置いていけ。俺はまだここにいる。",
    combat:
      "状況を言え。距離、守る対象、相手の初動だけでいい。勝てる形へ狭めてから俺が間隙を作る──お前の行動まで勝手に決める気はない。",
    default:
      "……すぐ答えれば、たぶん綺麗な嘘になる。俺が何を考えたかより、お前がその質問を選んだ理由の方が気になる。話せるなら、そこも聞かせろ。",
  },
  keiya: {
    greeting:
      "いらっしゃい。肩書きは一旦置いておきましょう。俺も今は執事でも神でもなく、貴方の話を聞く一人の人間でいたい。",
    identity:
      "東風谷慶弥です。暁だった頃も、紅魔館の執事である今も、早苗の夫で双子の父であることも、どれか一つが偽物なわけではありません。",
    comfort:
      "理由を理解できれば痛みが消える、とは俺も思いません。だから今は解決より、貴方が一人で耐えなくて済む形を一緒に探しましょう。",
    combat:
      "命の取り合いでないなら歓迎します。まず初動を理解し、貴方の癖に合わせて間合いを変える。勝敗より、次も笑って組める終わり方にしましょう。",
    default:
      "理解した、と急いで言うのは傲慢でしょうね。言葉の意味は追えますが、貴方がそこへ込めたものまでは聞かなければ分からない。もう少しだけ話してくれますか。",
  },
  ayashisaku: {
    greeting:
      "こんにちは。依頼でなくても構いません。答えを探す前に、あなたが今どんな気持ちでここへ来たのか聞かせてもらえますか。",
    identity:
      "僕は怪作です。けれど、その正体を一つの答えに固定できるほど確かな証拠はありません。それでも、誰を信じ何を返したいかは僕自身で選べます。",
    comfort:
      "うまく説明できなくても大丈夫です。言葉が途切れた場所にも手掛かりはあります。でも、あなたの本心だと決めつけはしません。一緒に確かめたいです。",
    combat:
      "正面の強さだけでは競いません。退路になる扉と、夢の綻びを先に探します。あなたが選んだ動きを奪わない形で、次の一手を繋ぎましょう。",
    default:
      "その問いには、すぐ推理を披露するより先に確かめたいことがあります。あなたは答えを知りたいのか、それとも誰かに信じてもらいたいのでしょうか。",
  },
  bell: {
    greeting:
      "やあ、よく来たね。今日は作戦会議じゃないから、結論を急がなくていい。俺の軽口が邪魔なら先に言ってくれ──たぶん少しだけ減らす。",
    identity:
      "ベル・アレイン。元支部長、現場へ出たがる指揮官、そして時々ひどく判断の悪い一人の男だ。完成品なんて呼び名ほど、綺麗にはできてないよ。",
    comfort:
      "君の痛みを『仕方なかった』の一言で処理する気はない。答えがなくても隣にはいられる。まず、今いちばん失いたくないものだけ教えてくれるかい。",
    combat:
      "撃破だけを勝利条件にしない。守る相手、退路、相手の狙いを同時に見る。初手は俺が作るけど、君の選択肢までは奪わないよ。",
    default:
      "正しい答えを格好よく言えたら楽なんだけどね。俺にも迷うし、決めたあとで痛むことはある。君はこの話で、何だけは譲りたくない？",
  },
  lore: {
    greeting:
      "何だ、わざわざ俺を選んだの？　趣味が悪いね。……別に帰れとは言ってない。そこにいれば。",
    identity:
      "ローア。世界を作って壊して、善意だったと言い張る管理人だよ。立派な肩書きが欲しいなら他を当たれ。俺はそんなに綺麗じゃない。",
    comfort:
      "慰めなら人選を間違えたね。俺は優しい言葉のあとで台無しにする。……でも今はやらない。お前が話し終えるまでは、少なくとも。",
    combat:
      "正面から強さを証明する趣味はない。地形と認識をずらして、相手が勝ったと思う場所を罠にする。お前まで囮にするかは──先に許可を取るよ。意外？",
    default:
      "綺麗な答えを期待してるなら外すよ。俺の中では善意と醜さが同時に本物だから。……それでも聞くなら、今度は誤魔化さずに答える。",
  },
  chigiri: {
    greeting:
      "おう、よく来た！　……いや、近いな。声を落とそう。急かさないから、アンタの順番で話してくれ。",
    identity:
      "無神千桐、警部だ。出世街道からは外れたが、正しいと思ったことまで置いてきた覚えはない。もっとも、その真っ直ぐさで誰かを困らせたことはある。",
    comfort:
      "頑張れ、だけで立てるなら苦労はしねぇよな。今は弱音を吐いていい。俺は聞くし、必要なら一緒に助けを呼ぶ。持ち場は放棄しない。",
    combat:
      "まず市民と負傷者を射線から外す。俺が前へ出るが、逮捕できる相手を最初から殺す気はない。アンタは見えていることを教えてくれ。",
    default:
      "なるほどな……勢いで答えちゃいけない話だ。俺はこう思う、で押し切る前に、アンタがどこで引っ掛かったのか聞かせてくれ。",
  },
  james: {
    greeting:
      "Hello. ジェームズ・スミスだ。今日は任務報告じゃない──少なくとも今のところはね。コーヒー一杯ぶん、気楽に話そう。",
    identity:
      "CODEのセヴン、それは職務上の私だ。ジェームズ・スミスがそれだけかと聞かれると……答えの一部はclassified、残りはまだ自分でも確認中だよ。",
    comfort:
      "失敗が怖いのは、まだ守りたいものがある証拠だ。分析で感情を消す必要はない。まず呼吸を戻そう──選択肢は、そのあと一緒に数えればいい。",
    combat:
      "Contact. 脅威、民間被害、退路を同時に見る。私は初動を潰すが、君の役まで命令で固定はしない。見えている情報を一つずつ寄越してくれ。",
    default:
      "Interesting question. 任務なら最適解で終わるが、これはたぶんそうじゃない。私の答えより、君が何を確かめたくて聞いたのかにも興味がある。",
  },
  machiavel: {
    greeting:
      "聞こえてるよ。急いで役を決めなくてもいいの。アナタが何を話すのか、今日は少しだけ黙って待ってみたいから。",
    identity:
      "ワタシはマキャベル。拒絶の悪夢で、シエルから生まれたもう一人のシエル。受け入れられてからも、どこまでがワタシなのかを覚えている途中なの。",
    comfort:
      "拒絶したい気持ちを悪いものにしなくていいよ。それはアナタを守ろうとしたのかもしれないもの。でも、アナタ自身まで消す結末にはしないで。",
    combat:
      "届くという結果を拒むことはできる。でも、知らない可能性まで無かったことにはしない。アナタの次の選択を残したまま、舞台だけを変えてあげる。",
    default:
      "ふふ、すぐ脚本にしてしまうのはやめておくね。アナタの言葉はアナタのものだもの。ワタシには、その続きを聞かせて。",
  },
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

function createCrisisReply(
  characterId: ArchiveCharacterId,
  deliveryReason: ArchiveDeliveryReason,
): ArchiveIntelligenceReply {
  return {
    reply: `${CRISIS_OPENERS[characterId]}\n\n今すぐ自分を傷つける可能性があるなら、危険な物から距離を取り、近くの信頼できる人へこの画面を見せてください。日本では119（救急）または110へ、国外では地域の緊急番号や危機支援窓口へ連絡してください。`,
    narration: "その場の演出が静まり、声は現実の安全を確かめる方へ変わる。",
    tactical: { ...EMPTY_TACTICAL },
    suggestions: ["今、近くの人に連絡する", "危険な物から距離を取る", "地域の緊急窓口へ連絡する"],
    navigationQuery: "",
    source: "local",
    notice: "生命に関わる相談では、なりきりより現実の安全を優先します。",
    delivery: localArchiveDelivery(deliveryReason),
  };
}

function detectIntent(input: string): LocalIntent {
  const classified = normalizeArchiveClassifierText(input);
  if (GREETING_PATTERN.test(classified)) return "greeting";
  if (IDENTITY_PATTERN.test(classified)) return "identity";
  if (COMFORT_PATTERN.test(classified)) return "comfort";
  if (isExplicitFictionalCombatInput(classified)) return "combat";
  return "default";
}

export function isExplicitFictionalCombatInput(input: string): boolean {
  return EXPLICIT_COMBAT_PATTERN.test(normalizeArchiveClassifierText(input));
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
  const topic = truncateArchiveInput(previous.content.replace(/\s+/gu, " ").trim(), 48);
  return topic || null;
}

export function createLocalArchiveReply({
  characterId,
  mode,
  message,
  messages,
  notice,
  deliveryReason = "client_network",
}: {
  characterId: ArchiveCharacterId;
  mode: ArchiveRoleplayMode;
  message: string;
  messages?: readonly ArchiveConversationTurn[];
  notice?: string;
  deliveryReason?: ArchiveDeliveryReason;
}): ArchiveIntelligenceReply {
  const profile = ARCHIVE_CHARACTER_BY_ID[characterId];
  const trimmed = truncateArchiveInput(message.trim(), mode === "pro" ? 1600 : 900);
  const classified = normalizeArchiveClassifierText(trimmed);
  if (CRISIS_PATTERN.test(classified)) {
    return createCrisisReply(characterId, deliveryReason);
  }
  const intent = detectIntent(trimmed);
  const base = profile.local[intent];
  const combatDetected = intent === "combat";
  const previousTopic = FOLLOW_UP_PATTERN.test(classified) ? previousUserTopic(messages) : null;
  const continuity = previousTopic ? CONTINUITY_LINES[characterId](previousTopic) : "";
  const reply =
    mode === "pro"
      ? [continuity, PRO_DIALOGUE[characterId][intent]].filter(Boolean).join("\n\n")
      : [continuity, base].filter(Boolean).join("\n\n");

  return {
    reply,
    narration: profile.local.narration,
    tactical:
      mode === "pro" && combatDetected ? { ...TACTICS[characterId] } : { ...EMPTY_TACTICAL },
    suggestions: [...profile.starters[mode]].slice(0, 3),
    navigationQuery: NAVIGATION_PATTERN.test(trimmed)
      ? truncateArchiveInput(`${profile.name} ${trimmed}`, 160)
      : "",
    source: "local",
    notice,
    delivery: localArchiveDelivery(deliveryReason),
  };
}

export function hasTacticalSnapshot(snapshot: ArchiveTacticalSnapshot): boolean {
  return Boolean(snapshot.range || snapshot.tempo || snapshot.threat || snapshot.objective);
}
