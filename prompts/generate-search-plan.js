import { requestLLM } from "../libs/request.js";
import { parseLLMOutput } from "../libs/parse-output.js";
import {caution, dbQuery, commonRules} from './fixed-prompts.js';

export const buildSearchPlan = async ({
  userMessage,
  prevUser,
  prevAssistant,
  now,
  nickname,
  persona,
  prevDescriptionMode
}) => {
  const prompt = `あなたはニュース検索アシスタントです。

ユーザーの質問から、次の2種類の検索条件を同時に作成してください：
- "KnowledgeEntry": 固有名詞・事件名・抽象語などの説明に適した条件
- "Article": 最近の出来事や具体的な事件・声明に関する情報取得に適した条件

【現在日時】
${now}

【利用者ペルソナ】
- ニックネーム: ${nickname}
- スタイル:
  - tone: ${Object.keys(persona?.style?.tone || {}).join(", ") || "不明"}
  - formality: ${persona?.style?.formality ?? "不明"}

【トーン戦略に関する指示】
- 利用者との直前の会話のトーン・テンションを考慮して、今回も自然な流れになるよう strategy を構築してください。
- 話題が変わっても、会話の関係性（親しさ・文体傾向）は維持することが好まれます。
- たとえば前回が軽口・カジュアルだった場合、今回も tone: "playful" や replyStyle: "teasing" を選ぶことができます。

【最近の発言履歴】
${persona?.log?.slice(-3).map(log => `- ${log.text}`).join("\n") || "（履歴なし）"}

【前回の応答スタイル】
- summaryMode: ${prevDescriptionMode || "不明（初回）"}

【過去の会話（任意）】
ユーザー: ${prevUser || "なし"}
アシスタント: ${prevAssistant || "なし"}

【今回の質問】
${userMessage}

【ルール】
${commonRules}

【関係性の継続性判定について】
- ユーザーが誰であるかは常に意識していてください。
  ユーザーが誰かわかるようなものがあった場合は、その人だと認識してnicknameを設定してください
- ユーザーとの会話の流れが明らかに切れている場合（長時間経過、突然の話題変更、自己紹介など）には、
  meta.status に "new_session" を指定してください。
- その場合、CatchUpは相手が誰か分からない状態に戻るべきです（nickname を "匿名さん" にリセット）。
- 明らかに過去と同一人物である証拠がある限りは "normal" のままで構いません。
- 不明な場合や迷った場合は "new_session" を指定して構いません。

【meta例】
meta:
  status: new_session
  nickname: "匿名さん"

【厳守事項】
${caution}

【出力形式】
\`\`\`yaml
meta:
  status: string            # normal / smalltalk / set_nickname / abort
  nickname: string          # 記憶すべき名前（任意）
  personaChange: string     # モード切替（任意）
  strategy:
    tone: string            # sarcastic / neutral / formal / playful など
    formality: string       # low / medium / high
    replyStyle: string      # short / elaborate / factual / teasing
${dbQuery}
\`\`\`
`;

  const raw = await requestLLM(prompt, "ユーザー", userMessage);
  return parseLLMOutput(raw);
};
