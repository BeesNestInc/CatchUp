import dotenv from "dotenv";
import weaviate from "weaviate-ts-client";
import { requestLLM } from "../libs/request.js";
import { getEmbedding } from "../process/vectorizer.js";

dotenv.config();

const WEAVIATE_HOST = process.env.WEAVIATE_HOST || "localhost:8080";

// Weaviateクライアント初期化
const client = weaviate.client({
  scheme: 'http',
  host: WEAVIATE_HOST
});

const formatDate = (d) => d?.match(/^\d{4}-\d{2}-\d{2}$/)
  ? `${d}T00:00:00Z`
  : d;

export default {
  post: async (req, res, next) => {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: "Message is required" });
    
    try {
      // 🔍 Step 1: LLMでクエリ解釈（検索条件抽出）
      const systemPrompt = `あなたはユーザーの質問から、検索に使えるキーワードやタグ、日付範囲などを抽出するアシスタントです。
以下の形式でJSONとして出力してください。
    
{
  "query": "検索の主なキーワード",
  "tags": ["関連する分類タグ"],
  "dateAfter": "YYYY-MM-DD",
  "dateBefore": "YYYY-MM-DD"
}
    
説明は不要です。必ず有効なJSONとして返してください。`;
    
      const parsedRaw = await requestLLM(systemPrompt, "ユーザー", userMessage);
      let searchParams;
      try {
        searchParams = JSON.parse(parsedRaw.replace(/^```json\n?|```$/g, "").trim());
      } catch (e) {
        console.warn("🔍 クエリ解析失敗。fallback使用");
        searchParams = { query: userMessage };
      }
console.log(JSON.stringify(searchParams, ' ', 2));
      const { query, tags = [], dateAfter, dateBefore } = searchParams;
      const { vector } = await getEmbedding(query || userMessage);
      const formattedAfter = formatDate(dateAfter);
      const formattedBefore = formatDate(dateBefore);
    
      // 🔍 Step 2: Weaviate検索クエリ組み立て
      const filters = [];
    
      if (tags.length > 0) {
        filters.push({
          path: ["searchTags"],  // ←ここを変更
          operator: "ContainsAny",
          valueTextArray: tags
        });
      }
      if (formattedAfter) {
        filters.push({
          path: ["datetime"],
          operator: "GreaterThan",
          valueDate: formattedAfter
        });
      }
      if (formattedBefore) {
        filters.push({
          path: ["datetime"],
          operator: "LessThan",
          valueDate: formattedBefore
        });
      }
    
      let whereFilter = undefined;
      if (filters.length > 0) {
        whereFilter = {
          operator: "And",
          operands: filters
        };
      }
    
      // 🔍 Step 3: Weaviateへ検索実行
      const result = await client.graphql.get()
        .withClassName("Article")
        .withNearVector({
          vector: vector,
          certainty: 0.5
        })
        .withWhere(whereFilter)
        .withFields("title summary datetime url")
        .withLimit(5)
        .do();
    
      const articles = result.data.Get.Article || [];
    
      if (!articles.length) {
        return res.json({ response: "該当するニュースが見つかりませんでした。" });
      }
    
      // 🧠 Step 4: LLMで返答を生成
      const prompt = articles.map(a => `【${a.datetime}】${a.title}\n${a.summary}\n${a.url}`).join("\n\n");
      const system = "あなたはニュースに基づいてユーザーの質問に答えるAIアシスタントです。";
      const reply = await requestLLM(system, "ユーザー", `以下のニュースを参考に、質問「${userMessage}」に答えてください：\n\n${prompt}`);
    
      res.json({ response: reply });
    } catch (err) {
      console.log(err);
      console.error("🔥 エラー:", err.message);
      res.status(500).json({ error: "サーバーエラー" });
    }
  }
}