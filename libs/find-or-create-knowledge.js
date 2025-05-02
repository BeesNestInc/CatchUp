// lib/find-or-create-knowledge.js
import { v4 as uuidv4 } from 'uuid';
import { getEmbedding } from './vectorizer.js';
import { saveKnowledgeEntry } from './knowledge-file.js';

// Weaviateから近傍ベクトルを取得（類似度と共に）
const findSimilarEntries = async (vector, client, limit = 5) => {
  const result = await client.graphql.get()
    .withClassName("KnowledgeEntry")
    .withNearVector({ vector })
    .withFields("name _additional { id certainty }")
    .withLimit(limit)
    .do();
  return result.data.Get.KnowledgeEntry || [];
};

export const findOrCreateKnowledgeEntry = (client, name, { entries, articleId }) => {
  // すでに存在するか探す（name完全一致）
  const existingEntry = Object.values(entries).find(e => e.name === name);

  if (existingEntry) {
    // 参照履歴を更新
    if (!existingEntry.sourceArticles.includes(articleId)) {
      existingEntry.sourceArticles.push(articleId);
      existingEntry.referCount += 1;
      existingEntry.lastReferTime = new Date().toISOString();
    }
    return existingEntry;
  }

  // 新規作成
  const id = uuidv4();
  const now = new Date().toISOString();

  const newEntry = {
    id,
    name,
    aliases: [],
    type: 'other',
    tags: [],
    summary: '',            // ← summaryは空でもOK（あとで入れる）
    description: '',
    sourceArticles: [articleId],
    referCount: 1,
    lastReferTime: now,
    createdTime: now,
    lastUpdatedTime: now,
    relatedEntries: []
    // embedding は外で付ける
  };

  entries[id] = newEntry;
  return newEntry;
};