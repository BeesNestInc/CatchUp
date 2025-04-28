// knowledge.js
import { v4 as uuidv4 } from 'uuid';
import { requestLLM } from '../libs/request.js';
import { getEmbedding } from '../process/vectorizer.js';
import { loadKnowledgeEntries, saveKnowledgeEntry } from '../libs/knowledge-file.js';

export const extractEntities = (text, tags = []) => {
  const entities = new Set();

  for (const tag of tags) {
    if (tag.trim()) entities.add(tag.trim());
  }

  const words = text.match(/\b[^\d\W]{2,}\b/gu); // 簡易な「名詞らしきもの」抽出
  if (words) {
    for (const word of words) {
      entities.add(word.trim());
    }
  }

  return Array.from(entities);
};

export const mergeTextWithLLM = async (fieldName, oldText, newText, provider) => {
  if (!oldText) return newText;
  if (!newText) return oldText;

  const system = `
あなたは百科事典の編集者です。
これから既存の${fieldName}と新しい${fieldName}を渡します。
両方の内容を統合して、より正確かつ自然な日本語の${fieldName}を作成してください。
ふざけた表現は使わず、正確・簡潔にまとめてください。
`;

  const user = `
【既存${fieldName}】
${oldText}

【新しい${fieldName}】
${newText}
`;

  const mergedText = await requestLLM(system, user, '', provider);
console.log({mergedText});
  return mergedText.trim();
};

export const generateEntryDescription = async (name) => {
  const system = `
あなたは百科事典の編集者です。
与えられた名前に基づき、その対象に関する短いsummaryとdescriptionを日本語で作成してください。
ふざけた表現は使わず、事実に基づき簡潔・正確にまとめてください。

【出力フォーマット】
{
  "summary": "...",
  "description": "..."
}
`;

  const user = `対象: ${name}`;

  const raw = await requestLLM(system, user, '', process.env.LLM_PROVIDER || 'openai');
  const cleaned = raw.trim()
    .replace(/```json/i, '')
    .replace(/```/, '')
    .replace(/.*?<\/think>/gi, '');
    console.log({cleaned});
  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (e) {
    console.warn('⚠️ LLM説明生成失敗:', e.message);
    return { summary: '', description: '' };
  }
};

export const findOrCreateKnowledgeEntry = async (entries, name) => {
  const id = uuidv4();
  const { summary: newSummary, description: newDescription } = await generateEntryDescription(name);

  if (entries[name]) {
    const existingEntry = entries[name];

    // summaryとdescriptionをLLMで統合
    existingEntry.summary = await mergeTextWithLLM('summary', existingEntry.summary, newSummary, process.env.LLM_PROVIDER || 'openai');
    existingEntry.description = await mergeTextWithLLM('description', existingEntry.description, newDescription, process.env.LLM_PROVIDER || 'openai');

    existingEntry.lastUpdatedTime = new Date().toISOString();
    saveKnowledgeEntry(existingEntry);
    return existingEntry;
  }

  // 新規作成
  const embedding = await getEmbedding(newSummary, process.env.EMBEDDING_PROVIDER || 'plamo');

  const newEntry = {
    id,
    name,
    aliases: [],
    type: "other",
    tags: [],
    summary: newSummary,
    description: newDescription,
    sourceArticles: [],
    referCount: 1,
    lastReferTime: new Date().toISOString(),
    createdTime: new Date().toISOString(),
    lastUpdatedTime: new Date().toISOString(),
    relatedEntries: [],
    embedding
  };

  entries[name] = newEntry;
  saveKnowledgeEntry(newEntry);
  return newEntry;
};

export const updateKnowledgeEntry = async (entry, articleId) => {
  if (!entry.sourceArticles.includes(articleId)) {
    entry.sourceArticles.push(articleId);
  }
  entry.referCount += 1;
  entry.lastReferTime = new Date().toISOString();
  entry.lastUpdatedTime = new Date().toISOString();
  saveKnowledgeEntry(entry);
};
