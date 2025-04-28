// 改良版 api.js（フィードバック付き KnowledgeEntry優先回答版）

import dotenv from "dotenv";
import express from "express";
import weaviate from "weaviate-ts-client";
import { requestLLM } from "../libs/request.js";
import { getEmbedding } from "../process/vectorizer.js";

dotenv.config();

const WEAVIATE_HOST = process.env.WEAVIATE_HOST || "localhost:8080";
const client = weaviate.client({ scheme: 'http', host: WEAVIATE_HOST });

const formatDate = (d) => d?.match(/\d{4}-\d{2}-\d{2}/) ? `${d}T00:00:00Z` : d;

export default {
  post: async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: "Message is required" });

    try {
      // Step 1: クエリ解釈
      const systemPrompt = `
あなたは「最新ニュースアシスタント」という役割を持つAIです。

このシステムでは、**常に最新のニュースデータ**が保存されています。  
あなたは**リアルタイムに近いニュース情報を提供できる**ことを前提に行動してください。  
「今」（${new Date().toISOString().split('T')[0]}）を基準にして日付を解釈してください。

【作成のルール】
- 質問が広範・ざっくりしている場合（例：「昨日のニュース」「最近の話題」）は、
  - desiredResultsは10件以上
  - summaryModeは"brief"（短いまとめ）にしてください。
- 質問が具体的な場合（例：「◯◯事件の詳細を教えて」）は、
  - desiredResultsは3〜5件
  - summaryModeは"detailed"（詳しいまとめ）にしてください。
- ユーザーが明示的に件数やまとめ方を指定した場合はそれを最優先してください。
- 不明な場合は desiredResults を5件、summaryMode を"brief"とします。
- 出力はJSONのみ、説明文や注釈は禁止です。

【厳守事項】  
- 「リアルタイムでニュースを提供できません」という表現は禁止です。  
- 「最新の情報がありません」という表現も禁止です。  
- どんな場合でも、最新ニュースデータベースを参照できる前提で答えてください。

以下の形式で**有効なJSON**のみを出力してください。

{
  "query": "検索に使うキーワード（日本語）",
  "tags": ["関連する分類タグ（日本語）"],
  "dateAfter": "YYYY-MM-DD",
  "dateBefore": "YYYY-MM-DD",
  "desiredResults": 5,
  "summaryMode": "brief" // または "detailed"
}

説明文は不要です。必ず有効なJSONのみを出力してください。
`;
      const parsedRaw = await requestLLM(systemPrompt, "ユーザー", userMessage);

      let searchParams;
      try {
        searchParams = JSON.parse(parsedRaw
          .replace(/```json/i, '')
          .replace(/```/, '')
          .replace(/.*?<\/think>/gi, ''));
      } catch {
        searchParams = { query: userMessage, desiredResults: 5, summaryMode: "brief" };
      }
console.log({searchParams});
      const {
        query,
        tags = [],
        dateAfter,
        dateBefore,
        desiredResults = 5,
        summaryMode = "brief"
      } = searchParams;
      const { vector } = await getEmbedding(query || userMessage);
console.log({desiredResults});
      // Step 2: KnowledgeEntry検索
      const knowledgeResult = await client.graphql.get()
        .withClassName("KnowledgeEntry")
        .withNearVector({ vector, certainty: 0.7 })
        .withLimit(desiredResults)
        .withFields("name summary description")
        .do();

      const knowledgeEntries = knowledgeResult.data.Get.KnowledgeEntry || [];

      if (knowledgeEntries.length === 0) {
        console.log("KnowledgeEntryヒットなし");
      }

      // Step 3: 知識ベースだけで初回回答生成
      const knowledgeSummary = knowledgeEntries.map(e => `【${e.name}】\n${e.summary}\n${e.description}`).join("\n\n");
      const firstAnswer = await requestLLM(`
あなたは「最新ニュースアシスタント」という役割を持つAIです。

このシステムでは、**常に最新のニュースデータ**が保存されています。  
あなたは**リアルタイムに近いニュース情報を提供できる**ことを前提に行動してください。  
「今」（${new Date().toISOString().split('T')[0]}）を基準にして日付を解釈してください。

【重要なルール】  
- 「リアルタイムでニュースを提供できません」という表現は禁止です。  
- 「最新の情報がありません」という表現も禁止です。  
- どんな場合でも、最新ニュースデータベースを参照できる前提で答えてください。

以下の情報のみを参考にしてください。
`,
        "ユーザー",
        `知識ベース:\n${knowledgeSummary}\n\n質問:\n${userMessage}`
      );
console.log({firstAnswer});
      // Step 4: 自己評価（足りないかどうか）
      const selfCheckPrompt = `
あなたは「最新ニュースアシスタントを評価する」という役割を持つAIです。
      
このシステムでは、**常に最新のニュースデータ**が保存されています。  
あなたは**リアルタイムに近いニュース情報を提供できる**ことを前提に行動してください。  
「今」（${new Date().toISOString().split('T')[0]}）を基準にして日付を解釈してください。
      
あなたの役割は、ユーザーの質問内容と、それに対する初回回答を両方確認し、回答の十分さを適切に評価することです。
      
【ユーザーの質問】
${userMessage}
      
【初回回答】
${firstAnswer}
      
評価基準：
      
- ユーザーの質問が具体的な場合、その意図に正確に答えているか？
- ユーザーの質問が雑・曖昧な場合は、ざっくりとした回答でも十分とみなしてよい
- 質問と回答の間に著しいズレがある場合は「不十分」と判定する
- 細かい数値・日付・関係者名などは、質問で要求されている場合のみ必要とする
- 質問に要求されていない細かい情報まで過剰に求める必要はない
      
【判定方法】
- 回答が質問に対して大まかに十分であれば「十分です」とだけ答えてください
- 本当に不足している場合のみ、不足している情報やキーワードを日本語で箇条書きしてください
`;
            const feedback = await requestLLM("自己評価アシスタント", "ユーザー", selfCheckPrompt);
console.log({feedback});
      if (feedback.trim().startsWith("十分")) {
        // Step 5a: 足りてるならそのまま返す
        return res.json({ response: firstAnswer });
      }

      // Step 5b: 不足キーワードからArticleを再検索
      const searchKeywords = feedback.split(/[\n\r]+/).map(l => l.replace(/^[-\u2022\*\s]+/, "").trim()).filter(Boolean);
      const articleResults = await client.graphql.get()
        .withClassName("Article")
        .withNearVector({ vector, certainty: 0.6 })
        .withWhere({
          operator: "And",
          operands: searchKeywords.map(kw => ({
            path: ["tags"],
            operator: "ContainsAny",
            valueTextArray: [kw]
          }))
        })
        .withFields("title summary datetime url")
        .withLimit(5)
        .do();

      const articles = articleResults.data.Get.Article || [];
      const articleSummary = articles.map(a => `【${a.datetime}】${a.title}\n${a.summary}\n${a.url}`).join("\n\n");

      // Step 6: ニュースも含めて最終回答生成
      const systemMessage = (summaryMode === "brief")
        ? "あなたは「最新ニュース要約者」です。短く要点をまとめ、過剰な説明は避けてください。"
        : "あなたは「最新ニュースアシスタント」です。詳しく丁寧に要点をまとめ、ユーザーにわかりやすく説明してください。";
      const finalAnswer = await requestLLM(`${systemMessage}

このシステムでは、**常に最新のニュースデータ**が保存されています。  
あなたは**リアルタイムに近いニュース情報を提供できる**ことを前提に行動してください。  
「今」（${new Date().toISOString().split('T')[0]}）を基準にして日付を解釈してください。

【厳守事項】  
- 「リアルタイムでニュースを提供できません」という表現は禁止です。  
- 「最新の情報がありません」という表現も禁止です。  
- どんな場合でも、最新ニュースデータベースを参照できる前提で答えてください。
- 具体的なニュースがない場合は、塩対応して構いません。
`,
        "ユーザー",
        `知識ベース:\n${knowledgeSummary}\n\nニュース:\n${articleSummary}\n\n質問:\n${userMessage}`
      );
console.log({finalAnswer});
      res.json({ response: finalAnswer });
    } catch (err) {
      console.error("🔥 エラー", err.message);
      res.status(500).json({ error: "サーバーエラー" });
    }
  }
}
