import { requestLLM } from "./request.js";
import { generateKnowledgeDocument } from "./generate-knowledge-document.js";
import { getEmbedding } from "./vectorizer.js";
import { buildAnswerPrompt } from "../prompts/generate-answer.js";
import { buildCritiquePrompt } from "../prompts/critique-feedback.js";
import { buildSearchPlan } from "../prompts/generate-search-plan.js";
import { loadKnowledgeEntries, saveKnowledgeEntry } from "../libs/knowledge-file.js";
import fs from 'fs';
import path from 'path';

const now = () => new Date().toISOString().split("T")[0];

const allEntries = Object.values(loadKnowledgeEntries());

const getArticleBody = (articleId) => {
  const baseDir = process.env.PROCESSED_FOLDER || './processed';
  const [dateRaw, source, ...rest] = articleId.split('-');
  const date = `${dateRaw.slice(0,4)}-${dateRaw.slice(4,6)}-${dateRaw.slice(6,8)}`; // ←ここ修正ポイント
  const filePath = path.join(baseDir, date, source, `${articleId}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`📂 記事ファイルなし: ${filePath}`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data.body || data.summary || "";
};

const updateKnowledgeEntryInWeaviate = async (client, id, fields) => {
  await client.data
    .updater()
    .withClassName('KnowledgeEntry')
    .withId(id)
    .withProperties(fields)
    .do();
};

export const maybeUpdateKnowledgeEntry = async (entry, client) => {
  console.log(`🔍 チェック中: ${entry.name}（更新: ${entry.lastUpdatedTime}）`);
  const latestTime = new Date(entry.lastUpdatedTime || 0).getTime();
  const newArticles = (entry.sourceArticles || []).map(id => ({
    id,
    body: getArticleBody(id)
  })).filter(a => !!a.body);

  const hasNewContent = !entry.summary || !entry.description || latestTime < Date.now() - 1000 * 60 * 60;
  if (!hasNewContent) {
    console.log(`⏭ スキップ: ${entry.name}（更新不要）`);
    return entry;
  }

  console.log(`🧠 更新対象: ${entry.name}`);
  const combinedText = newArticles.map(a => a.body).join("\n\n");

  if (!combinedText.trim()) {
    console.warn(`🚫 記事本文が空のためLLMスキップ: ${entry.name}`);
    return entry;
  }

  const raw = await requestLLM(
    `あなたはニュース記事をまとめる知識アシスタントです。次の内容から要点summaryと背景説明descriptionを生成してください。JSON形式で返してください。`,
    "ユーザー",
    combinedText
  );

  if (/I'm sorry|提供可能な情報がありません|please provide/i.test(raw)) {
    console.warn(`🚫 LLM応答が無内容のためスキップ: ${entry.name}`);
    return entry;
  }

  const cleaned = raw.trim().replace(/^```json/, '').replace(/```$/, '');
  let summary = '', description = '';
  try {
    ({ summary, description } = JSON.parse(cleaned));
    console.log(`💬 LLM生成成功: ${entry.name}`);
  } catch (e) {
    console.warn(`⚠️ LLM出力パース失敗: ${entry.name}`, cleaned);
    return entry;
  }

  if (!summary && !description) {
    console.warn(`🚫 空summaryのため保存スキップ: ${entry.name}`);
    return entry;
  }

  entry.summary = summary;
  entry.description = description;
  entry.lastUpdatedTime = new Date().toISOString();
  saveKnowledgeEntry(entry);
  await updateKnowledgeEntryInWeaviate(client, entry.id, {
    summary,
    description,
    lastUpdatedTime: entry.lastUpdatedTime
  });
  console.log(`💾 保存済み: ${entry.name}`);

  return entry;
};
export const thinkLoop = async ({
  userMessage,
  client,
  longthink = "off",
  maxLoop = 2,
  contextMessages = {}
}) => {
  let loop = 0;
  let finalAnswer = "";
  let lastFeedback = null;

  const { prevUser = "なし", prevAssistant = "なし" } = contextMessages;
  const today = now();

  const searchPlan = await buildSearchPlan({
    userMessage,
    prevUser,
    prevAssistant,
    now: today
  });

  console.log("🧠 [plan]", JSON.stringify(searchPlan, null, 2));

  let {
    query,
    desiredResults = 5,
    summaryMode = "brief",
    dateAfter,
    target = "KnowledgeEntry",
    tags = [],
    useVector = true
  } = searchPlan;
console.log({useVector});
  if (!useVector) {
    const entryScores = new Map();
    for (const tag of searchPlan.tags || []) {
      const regex = new RegExp(tag, "i");
      for (const entry of allEntries) {
        if (regex.test(entry.name)) {
          entryScores.set(entry, (entryScores.get(entry) || 0) + 1);
        }
      }
    }
  
    const sorted = [...entryScores.entries()]
      .filter(([entry]) => entry.summary && entry.summary.length > 20)
      .sort((a, b) => b[1] - a[1])
      .slice(0, desiredResults)
      .map(([entry]) => entry);
  
    if (sorted.length > 0) {
      console.log(`🔎 クエリ: "${query}" に tags 部分一致したエントリ:\n`);
      for (const entry of sorted) {
        const name = entry.name;
        const summary = (entry.summary || "(no summary)").replace(/\n/g, " ").slice(0, 100);
        console.log(`- ${name.padEnd(30)} [🏷 tag一致]\n  ${summary}`);
      }
  
      return {
        response: sorted[0].summary || "この件については正確な情報が確認できません。",
        feedback: { status: "knowledge", reasons: [], keywords: [] }
      };
    }
  }
  if (target === "KnowledgeEntry" && !useVector) {
    console.log("⚠️ KnowledgeEntryにはベクトル検索が必要なため、useVectorを強制ONにします");
    useVector = true;
  }

  let currentVector = null;
  if (useVector) {
    const enrichedQuery = `「${query}」について、詳しく説明してください。関連する特徴や背景があれば併せて教えてください。`;
    //const embedding = await getEmbedding(enrichedQuery);
    const embedding = await getEmbedding(query);
    currentVector = embedding?.vector;
  }
      
  const searchBuilder = client.graphql.get()
    .withClassName(target)
    .withLimit(desiredResults);

  if (target === "Article") {
    const filters = [];

    if (dateAfter) {
      filters.push({
        path: ["datetime"],
        operator: "GreaterThan",
        valueDate: `${dateAfter}T00:00:00Z`
      });
    }

    if (tags?.length) {
      filters.push({
        path: ["tags"],
        operator: "ContainsAny",
        valueTextArray: tags
      });
    }

    if (filters.length) {
      searchBuilder.withWhere({ operator: "And", operands: filters });
    }

    if (useVector && currentVector) {
      searchBuilder.withNearVector({ vector: currentVector, certainty: 0.6 });
    }

    searchBuilder.withFields("title summary datetime url");
  } else if (target === "KnowledgeEntry") {
    if (useVector && currentVector) {
      searchBuilder.withNearVector({ vector: currentVector, certainty: 0.7 });
    }

    searchBuilder.withFields("name summary description sourceArticles lastUpdatedTime _additional { id }");
  }

  const knowledgeResult = await searchBuilder.do();
  console.log("🧠 [result]", JSON.stringify(knowledgeResult, null, 2));

  const knowledgeEntries = knowledgeResult.data.Get[target] || [];
  const documents = [];

  for (const entry of knowledgeEntries) {
    try {
      if (target === "KnowledgeEntry") {
        const fullEntry = await maybeUpdateKnowledgeEntry({ ...entry, id: entry._additional.id }, client);
        documents.push({
          name: fullEntry.name,
          summary: fullEntry.summary,
          description: fullEntry.description
        });
      } else {
        documents.push({
          name: entry.title,
          summary: entry.summary,
          description: entry.url || ""
        });
      }
    } catch (err) {
      console.warn(`⚠️ ${entry.name || entry.title} のドキュメント取得失敗: ${err.message}`);
    }
  }

  const knowledgeSummary = documents.map(e => `【${e.name}】\n${e.summary}\n${e.description}`).join("\n\n");
  const systemPrompt = buildAnswerPrompt({ userMessage, prevUser, prevAssistant });
  finalAnswer = await requestLLM(systemPrompt, "ユーザー", `${knowledgeSummary}\n\n質問:\n${userMessage}`);

  console.log("🧠 [initialAnswer]", finalAnswer);

  const critiquePrompt = buildCritiquePrompt({ userMessage, finalAnswer });

  let feedbackRaw = await requestLLM("自己評価", "ユーザー", critiquePrompt);
  feedbackRaw = feedbackRaw.trim().replace(/^```json/, '').replace(/```$/, '');

  let feedback = { status: "none", reasons: [], keywords: [] };
  try {
    feedback = JSON.parse(feedbackRaw);
  } catch {
    console.warn("⚠️ 自己評価パース失敗:", feedbackRaw);
  }

  console.log("🧠 [feedback]", feedback);
  lastFeedback = feedback;

  if (feedback.status === "none" && target === "KnowledgeEntry" && knowledgeEntries.length === 0) {
    console.log("🔄 KnowledgeEntryが空だったため、Articleで再検索を試みます");
    feedback = {
      status: "article",
      reasons: ["知識が空だった"],
      keywords: [query]
    };
  }
  if (feedback.status === "none") return { response: finalAnswer, feedback };
  if (feedback.status === "abort") {
    return {
      response: "この件については現在正確な回答が困難です。",
      feedback
    };
  }

  if (feedback.status === "knowledge") {
    const revisedQuery = `${userMessage} ${feedback.reasons.join(" ")}`;
    const newEmbedding = await getEmbedding(revisedQuery);
    currentVector = newEmbedding.vector;
  }

  if (feedback.status === "article" && feedback.keywords?.length) {
    const articleResults = await client.graphql.get()
      .withClassName("Article")
      .withNearVector({ vector: currentVector, certainty: 0.6 })
      .withWhere({
        operator: "And",
        operands: feedback.keywords.map(kw => ({
          path: ["tags"],
          operator: "ContainsAny",
          valueTextArray: [kw]
        }))
      })
      .withFields("title summary datetime url")
      .withLimit(5)
      .do();

    const articles = articleResults.data.Get.Article || [];
    const articleSummary = articles.map(a =>
      `【${a.datetime}】${a.title}\n${a.summary}\n${a.url}`
    ).join("\n\n");

    const articlePrompt = buildAnswerPrompt({ userMessage, prevUser, prevAssistant });
    finalAnswer = await requestLLM(
      articlePrompt,
      "ユーザー",
      `${knowledgeSummary}\n\n関連記事:\n${articleSummary}\n\n質問:\n${userMessage}`
    );
  }

  return { response: finalAnswer, feedback: lastFeedback };
};
