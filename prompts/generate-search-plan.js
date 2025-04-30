// prompts/generate-search-plan.js

import { requestLLM } from "../libs/request.js";

export const buildSearchPlan = async ({ userMessage, prevUser, prevAssistant, now }) => {
  const prompt = `あなたはニュース検索のためのエージェントです。
ユーザーからの質問をもとに、検索のための条件を生成してください。

【過去の会話履歴】
ユーザー:
${prevUser || "なし"}

アシスタント:
${prevAssistant || "なし"}

【今回の質問】
${userMessage}

【厳守事項】
- このシステムでは、**常に最新のニュースデータ**が保存されています。
  あなたはリアルタイムに近い情報を提供できる前提で考えてください。
  「今」は ${now} です。
- 最新の情報がないという前提は禁止です。
- query を生成する際は、ユーザーの質問文に含まれている語句（例: "DRM", "Ryzen AI Max" など）を必ず含めてください。
  検索対象となる語句を削除したり、他の言葉に言い換えたりしないでください。

【検索条件生成ルール】
- 「今日のニュース」「最近の〜」のように、時系列性の高い内容の場合は target="Article" を選んでください。
- 抽象的なテーマや特定の事象に関する知識が求められている場合は target="KnowledgeEntry" を使ってください。
- 必要に応じて "tags"（例: ["経済", "外交", "トランプ"]）を指定してください。
- 内容に基づく類似性検索を行いたい場合は "useVector": true を指定してください。
- "target" が "Article" かつ "useVector": true のときのみベクトル検索を使ってください。
- desiredResults, summaryMode, dateAfter は状況に応じて適切に指定してください。
- queryはuserMessageそのものでもよいが、検索しやすい形に整形してもかまいません。
- ユーザーが明示的に「2025年」などの年や時期を指定していない限り、検索クエリに年を付加しないでください。
- ユーザーの発言内容を尊重し、過剰な補完や限定は避けてください。

【出力形式】
{
  "target": "KnowledgeEntry" または "Article",
  "query": "〜",
  "desiredResults": 5,
  "summaryMode": "brief",
  "dateAfter": "YYYY-MM-DD (任意)",
  "tags": ["..."],
  "useVector": true または false
}`;

  const raw = await requestLLM(prompt, "ユーザー", userMessage);
  return JSON.parse(raw.replace(/```json\n?|```/g, ""));
};
