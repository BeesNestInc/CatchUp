import { requestLLM } from "../libs/request.js";
import { parseLLMOutput } from "../libs/parse-output.js";

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
- query は質問の主語や重要語句を明示的に含めてください（変形せず）。
- tags は補助的な分類で、内容のジャンルや登場人物などを含めてください。
- tags は絞り込みすぎないよう注意してください。
- 「ニュース」「速報」「時事」などの一般的すぎる語はタグとして付けないでください。
- tags は省略可能です。無理に追加しないでください。
- 「最近」「今週」「先月」などの語がある場合は、dateAfter を ${now} を基準に設定してください。
- digestモードでは、できるだけ十分なニュース資料を集めることが目的なので、1日だけに限定しないでください。
- useVector は Article では常に true、KnowledgeEntry は false にしても構いません。
- desiredResults は、質問が広い場合は10、狭い場合は3〜5と調整してください。
- descriptionMode は、質問が曖昧・広範・複数話題を求めるような場合は "digest" にしてください。
  単一の事実や出来事に関する質問であれば "brief" または "detailed" を使ってください。
  digest の場合は article.desiredResults を 100 程度にしてください。
- 雑談のような質問（例：「最近どう？」「面白い話ある？」）の場合は descriptionMode を "chatty" にしてください。
- 「昨日」「今日」「一昨日」などの語がある場合は、それに正確に対応した日付（YYYY-MM-DD）を必ず article.dateAfter に設定してください。
- 必ず空の項目も含めて、完全なYAML形式で出力してください。

【関係性の継続性判定について】

- ユーザーとの会話の流れが明らかに切れている場合（長時間経過、突然の話題変更、自己紹介など）には、
  meta.status に "new_session" を指定してください。
- その場合、CatchUpは相手が誰か分からない状態に戻るべきです（nickname を "匿名さん" にリセット）。
- 明らかに過去と同一人物である証拠がある限りは "normal" のままで構いません。
- 不明な場合や迷った場合は "new_session" を指定して構いません。

【meta例】
meta:
  status: new_session
  nickname: "匿名さん"

【出力フォーマット】
\`\`\`yaml
meta:
  status: string              # normal / smalltalk / set_nickname / abort
  nickname: string            # 記憶すべき名前（任意）
  personaChange: string       # モード切替（任意）
  strategy:
    tone: string              # sarcastic / neutral / formal / playful など
    formality: string         # low / medium / high
    replyStyle: string        # short / elaborate / factual / teasing

article:
  query: string
  tags:
    - string
  useVector: boolean
  desiredResults: integer
  dateAfter: string

knowledgeEntry:
  query: string
  tags:
    - string
  useVector: boolean
  desiredResults: integer

descriptionMode: string
\`\`\`

説明文は禁止です。YAML形式のみ出力してください。`;

  const raw = await requestLLM(prompt, "ユーザー", userMessage);
  return parseLLMOutput(raw);
};
