// think-loop.js（三役構成 + digestモード対応 + dateAfter検証 + 無制限取得 + デスクスキップ + 昨日の範囲指定）

import { requestLLM } from "./request.js";
import { buildAnswerPrompt } from "../prompts/generate-answer.js";
import { buildCritiquePrompt } from "../prompts/critique-feedback.js";
import { buildSearchPlan } from "../prompts/generate-search-plan.js";
import { loadPersona, savePersona } from './persona-store.js';
import { logResponse } from './catchup-memory.js';
import {searchKnowledgeAndArticles} from './database.js';
import { parseLLMOutput } from "./parse-output.js";

const now = () => new Date().toISOString().split("T")[0];

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
  
  if ( initialPlan.meta.nickname )  {
    nickname = initialPlan.meta.nickname;
    session.catchUp = session.catchUp || {};
    persona = loadPersona(nickname);
    session.catchUp.nickname = nickname;
  }
  // 🔁 nickname 自動リセットロジック（初回登録または関係性切れ）
  const lastSeen = new Date(persona.lastSeen);
  const nowTime = new Date();
  const diffMinutes = (nowTime - lastSeen) / 60000;
  if (diffMinutes > 30 || initialPlan.meta?.status === "new_session") {
    nickname = "匿名さん";
    session.catchUp = session.catchUp || {};
    session.catchUp.nickname = nickname;
    persona.nickname = nickname;
  }
  console.log({nickname});
  // 最終的な lastSeen の更新
  persona.lastSeen = new Date().toISOString();
  savePersona(persona);
  
  const { descriptionMode = "brief" } = initialPlan;
  // 👇 descriptionMode を記憶しておく
  if (initialPlan.descriptionMode) {
    session.catchUp = session.catchUp || {};
    session.catchUp.prevSummaryMode = initialPlan.descriptionMode;
  }
  session.save();

  let knowledgeEntry = initialPlan.knowledgeEntry;
  let article = initialPlan.article;

  if (descriptionMode === "digest") {
    article.desiredResults = 999;
    knowledgeEntry.desiredResults = Math.max(knowledgeEntry.desiredResults || 0, 10);
  }

  let finalAnswer = "";
  let feedback = null;
  const maxLoop = 3;

  for ( let loopCount = 0 ; loopCount < maxLoop; loopCount += 1) {
    console.log(`${loopCount+1}回目`);
    console.log({knowledgeEntry});
    console.log({article});
    console.log({descriptionMode});
    const docs = await searchKnowledgeAndArticles(
      client,
      knowledgeEntry,
      article,
      descriptionMode);
    const combined = docs.join("\n\n");

    const systemPrompt = buildAnswerPrompt({
      userMessage,
      prevUser,
      prevAssistant,
      descriptionMode,
      nickname,
      strategy: initialPlan.meta?.strategy || {}
    });
    finalAnswer = await requestLLM(systemPrompt, "ユーザー", `${combined}\n\n質問:\n${userMessage}`);
    console.log({finalAnswer});
    if  ( descriptionMode === 'digest' )  break;  //  digestの時はつっこまない
    const critiquePrompt = buildCritiquePrompt({
      userMessage,
      descriptionMode,
      nickname,
      finalAnswer
    });
    const feedbackRaw = await requestLLM("自己評価", "ユーザー", critiquePrompt);
    console.log({feedbackRaw})
    try {
      feedback = parseLLMOutput(feedbackRaw);
    } catch (e) {
      feedback = { status: "none", reasons: [], keywords: [], article: {}, knowledgeEntry: {} };
    }

    if (feedback.status === "none") break;
    if (feedback.status === "abort") {
      console.log("abort");
      finalAnswer = feedback.reasons.join("\n");
      break;
    }

    if (feedback.article?.query || feedback.knowledgeEntry?.query) {
      article = feedback.article;
      knowledgeEntry = feedback.knowledgeEntry;
    }
  }
  logResponse({
    nickname,
    mode: initialPlan.descriptionMode || "unknown",
    response: finalAnswer
  });
  console.log({finalAnswer});
  return { response: finalAnswer, feedback, descriptionMode };
};
