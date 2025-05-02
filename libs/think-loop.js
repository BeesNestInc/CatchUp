// think-loop.js（三役構成 + digestモード対応 + dateAfter検証 + 無制限取得 + デスクスキップ + 昨日の範囲指定）

import { requestLLM } from "./request.js";
import { getEmbedding } from "./vectorizer.js";
import { buildAnswerPrompt } from "../prompts/generate-answer.js";
import { buildCritiquePrompt } from "../prompts/critique-feedback.js";
import { buildSearchPlan } from "../prompts/generate-search-plan.js";
import { loadKnowledgeEntries } from "./knowledge-file.js";
import { loadPersona, savePersona } from './persona-store.js';
import { logResponse } from './catchup-memory.js';

const now = () => new Date().toISOString().split("T")[0];

const searchKnowledgeAndArticles = async (client, knowledgeSpec, articleSpec, descriptionMode = "brief") => {
  const results = [];

  if (knowledgeSpec?.query) {
    if (knowledgeSpec.useVector) {
      try {
        const kvec = (await getEmbedding(knowledgeSpec.query)).vector;
        const kresult = await client.graphql.get()
          .withClassName("KnowledgeEntry")
          .withNearVector({ vector: kvec, certainty: 0.7 })
          .withLimit(knowledgeSpec.desiredResults || 5)
          .withFields("name summary description")
          .do();
        const knowledgeDocs = (kresult.data.Get.KnowledgeEntry || []).map(e => `【${e.name}】\n${e.summary}\n${e.description}`);
        results.push(...knowledgeDocs);
      } catch (e) {
        console.warn("⚠️ KnowledgeEntry embedding失敗:", e.message);
      }
    } else {
      const allEntries = Object.values(loadKnowledgeEntries());
      const entryScores = new Map();
      for (const tag of knowledgeSpec.tags || []) {
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
        .slice(0, knowledgeSpec.desiredResults || 5)
        .map(([entry]) => entry);
      const knowledgeDocs = sorted.map(e => `【${e.name}】\n${e.summary}\n${e.description}`);
      results.push(...knowledgeDocs);
    }
  }

  if (articleSpec?.query && articleSpec.useVector) {
    const avec = (await getEmbedding(articleSpec.query)).vector;
    const abuilder = client.graphql.get()
      .withClassName("Article")
      .withFields("title summary datetime url");

    const afilters = [];
    if (typeof articleSpec.dateAfter === "string" && articleSpec.dateAfter.match(/^\d{4}-\d{2}-\d{2}$/)) {
      if (descriptionMode === "digest") {
        const start = `${articleSpec.dateAfter}T00:00:00Z`;
        const endDate = new Date(new Date(articleSpec.dateAfter).getTime() + 86400000)
          .toISOString().split("T")[0] + "T00:00:00Z";
        afilters.push({ path: ["datetime"], operator: "GreaterThanEqual", valueDate: start });
        afilters.push({ path: ["datetime"], operator: "LessThan", valueDate: endDate });
      } else {
        afilters.push({
          path: ["datetime"],
          operator: "GreaterThan",
          valueDate: `${articleSpec.dateAfter}T00:00:00Z`
        });
      }
    }
    if (articleSpec.tags?.length) {
      afilters.push({
        path: ["tags"],
        operator: "ContainsAny",
        valueTextArray: articleSpec.tags
      });
    }
    console.log("📤 filters = ", JSON.stringify(afilters, null, 2));
    if (afilters.length) abuilder.withWhere({ operator: "And", operands: afilters });
    abuilder.withNearVector({ vector: avec, certainty: 0.6 });

    abuilder.withLimit(descriptionMode === "digest" ? 100 : (articleSpec.desiredResults || 5));

    const aresult = await abuilder.do();
    const articleDocs = (aresult.data.Get.Article || []).map(a => `【${a.datetime}】${a.title}\n${a.summary}\n${a.url}`);
    results.push(...articleDocs);
  }

  return results;
};

export const thinkLoop = async ({ userMessage, prevUser = "", prevAssistant = "", session, client }) => {
  const today = now();
  let nickname = session?.catchUp?.nickname || "匿名さん";
  let persona = loadPersona(nickname);
  
  // 発言ログ追加・更新は初期状態で仮登録
  persona.log.push({
    date: today,
    text: userMessage
  });
  
  const prevDescriptionMode = session?.catchUp?.prevDescriptionMode || null;
  
  // 先に buildSearchPlan を呼び出す（nickname, persona を渡す）
  const initialPlan = await buildSearchPlan({
    userMessage,
    prevUser,
    prevAssistant,
    now: today,
    nickname,
    persona,
    prevDescriptionMode
  });
  
  // 🔁 nickname 自動リセットロジック（初回登録または関係性切れ）
  const lastSeen = new Date(persona.lastSeen);
  const nowTime = new Date();
  const diffMinutes = (nowTime - lastSeen) / 60000;
  
  if (diffMinutes > 30 || initialPlan.meta?.status === "new_session") {
    nickname = "匿名さん";
    session.catchUp = session.catchUp || {};           // ← これを追加
    session.catchUp.nickname = nickname;
    persona.nickname = nickname;
  }
    
  // 最終的な lastSeen の更新
  persona.lastSeen = new Date().toISOString();
  savePersona(persona);
  
  const { descriptionMode = "brief" } = initialPlan;
  const skipFeedback = descriptionMode === "digest";
  // 👇 summaryMode を記憶しておく（smalltalkなどを除外したければ分岐してもOK）
  if (initialPlan.descriptionMode) {
    session.catchUp = session.catchUp || {};
    session.catchUp.prevSummaryMode = initialPlan.descriptionMode;
  }

  let knowledgeEntry = initialPlan.knowledgeEntry;
  let article = initialPlan.article;

  if (descriptionMode === "digest") {
    article.desiredResults = 999;
    knowledgeEntry.desiredResults = Math.max(knowledgeEntry.desiredResults || 0, 10);
  }

  let finalAnswer = "";
  let feedback = null;
  let loopCount = 0;
  const maxLoop = 3;

  while (loopCount < maxLoop) {
    const docs = await searchKnowledgeAndArticles(client, knowledgeEntry, article, descriptionMode);
    const combined = docs.join("\n\n");

    const systemPrompt = buildAnswerPrompt({
      userMessage,
      prevUser,
      prevAssistant,
      descriptionMode,
      strategy: initialPlan.meta?.strategy || {}
    });
    finalAnswer = await requestLLM(systemPrompt, "ユーザー", `${combined}\n\n質問:\n${userMessage}`);
    console.log({finalAnswer});
    if (skipFeedback) break;

    const critiquePrompt = buildCritiquePrompt({ userMessage, finalAnswer, now: today });
    const feedbackRaw = await requestLLM("自己評価", "ユーザー", critiquePrompt);
    console.log({feedbackRaw})
    try {
      feedback = JSON.parse(feedbackRaw.replace(/^```yaml/, '').replace(/^```json/, '').replace(/```$/, ''));
    } catch (e) {
      feedback = { status: "none", reasons: [], keywords: [], article: {}, knowledgeEntry: {} };
    }

    if (feedback.status === "none") break;
    if (feedback.status === "abort") {
      finalAnswer = "この件については現在正確な回答が困難です。";
      break;
    }

    if (feedback.article?.query || feedback.knowledgeEntry?.query) {
      article = feedback.article;
      knowledgeEntry = feedback.knowledgeEntry;
    }

    loopCount++;
  }
  logResponse({
    nickname,
    mode: initialPlan.descriptionMode || "unknown",
    response: finalAnswer
  });
  return { response: finalAnswer, feedback, descriptionMode };
};
