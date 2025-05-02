// prompts/generate-search-plan.js（targetなし・スキーマ別条件 + 精度向上 + 厳守事項 + 日付強化）

import { requestLLM } from "../libs/request.js";
import {parseLLMOutput} from "../libs/parse-output.js";

export const buildSearchPlan = async ({ userMessage, prevUser, prevAssistant, now }) => {
  const prompt = `あなたはニュース検索アシスタントです。

ユーザーの質問から、次の2種類の検索条件を同時に作成してください：
- "KnowledgeEntry": 固有名詞・事件名・抽象語などの説明に適した条件
- "Article": 最近の出来事や具体的な事件・声明に関する情報取得に適した条件

【現在日時】
${now}

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
- useVector は Article では常に true、KnowledgeEntry は false にしても構いません（情報が埋まっていないことがあるため）。
- desiredResults は、質問が広い場合は10、狭い場合は3〜5と調整してください。
- descriptionMode は、質問が曖昧・広範・複数話題を求めるような場合は "digest" にしてください。
  単一の事実や出来事に関する質問であれば "brief" または "detailed" を使ってください。
  digest の場合は article.desiredResults を 100 程度にしてください（大量の資料を使ってダイジェストを生成するため）。
- 質問文が「最新」「今日」「昨日」などの語を含む場合は、必ず descriptionMode を "digest" にしてください。
- 「昨日」「今日」「一昨日」などの語がある場合は、それに正確に対応した日付（YYYY-MM-DD）を必ず article.dateAfter に設定してください。
- 必ず空の項目も含めて、完全なやYAML形式で出力してください。

【厳守事項】
- このシステムでは、常に最新のニュースデータが保存されています。
  あなたはリアルタイムに近い情報を提供できる前提で考えてください。
- 最新の情報がないという前提は禁止です。
- query を生成する際は、ユーザーの質問文に含まれている語句（例: "DRM", "Ryzen AI Max" など）を必ず含めてください。
  検索対象となる語句を削除したり、他の言葉に言い換えたりしないでください。

【出力フォーマット】
\u0060\u0060\u0060yaml
article:                    # Articleクラス用の再検索条件
  query: string             # 検索語句（原文の単語を使うこと）
  tags:                     # 分類タグ（関連人物・ジャンルなど）
    - string
  useVector: boolean        # ベクトル検索を使うか（基本 true）
  desiredResults: integer   # 取得件数（例: 5）
  dateAfter: string         # 検索範囲の開始日（YYYY-MM-DD形式）
knowledgeEntry:             # KnowledgeEntryクラス用の再検索条件
  query: string
  tags:
    - string
  useVector: boolean        # 通常は false だが、必要なら true でも可
  desiredResults: integer
descriptionMode: string     # 記述の方針
                            # - brief: 概要
                            # - detailed: 詳細解説
                            # - digest: 要約
\u0060\u0060\u0060

説明文は禁止です。YAML形式のみ出力してください。`;

  const raw = await requestLLM(prompt, "ユーザー", userMessage);
  return parseLLMOutput(raw);
};
