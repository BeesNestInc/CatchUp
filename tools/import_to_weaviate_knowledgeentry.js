// import_to_weaviate_knowledgeentry.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import weaviate from 'weaviate-ts-client';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_FOLDER || './knowledge';

const client = weaviate.client({
  scheme: 'http',
  host: process.env.WEAVIATE_HOST || 'localhost:8080'
});

const findExistingEntry = async (knowledgeId) => {
  try {
    const res = await client.graphql.get()
      .withClassName('KnowledgeEntry')
      .withFields('knowledgeId lastUpdatedTime _additional { id }')
      .withWhere({
        path: ['knowledgeId'],
        operator: 'Equal',
        valueString: knowledgeId
      })
      .do();

    return res.data.Get.KnowledgeEntry[0];
  } catch (err) {
    console.error(`❓ 存在チェック失敗 (${knowledgeId}):`, err.message);
    return null;
  }
};

const insertOrUpdateEntry = async (data, vector) => {
  const existing = await findExistingEntry(data.knowledgeId);

  if (existing) {
    if (new Date(data.lastUpdatedTime) > new Date(existing.lastUpdatedTime)) {
      console.log(`🔄 更新: ${data.name}`);
      try {
        await client.data.updater()
          .withClassName('KnowledgeEntry')
          .withId(existing._additional.id)
          .withProperties(data)
          .withVector(vector)
          .do();
      } catch (err) {
        console.error(`❌ 更新失敗: ${data.name} →`, err.message);
      }
    } else {
      console.log(`⏭ スキップ（更新不要）: ${data.name}`);
    }
  } else {
    console.log(`➕ 新規登録: ${data.name}`);
    try {
      await client.data.creator()
        .withClassName('KnowledgeEntry')
        .withId(uuidv4())
        .withProperties(data)
        .withVector(vector)
        .do();
    } catch (err) {
      console.error(`❌ 作成失敗: ${data.name} →`, err.message);
    }
  }
};

const main = async () => {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const properties = {
      knowledgeId: fileData.id,
      name: fileData.name,
      aliases: fileData.aliases,
      type: fileData.type,
      tags: fileData.tags,
      summary: fileData.summary,
      description: fileData.description,
      sourceArticles: fileData.sourceArticles,
      referCount: fileData.referCount,
      lastReferTime: fileData.lastReferTime,
      createdTime: fileData.createdTime,
      lastUpdatedTime: fileData.lastUpdatedTime,
      relatedEntries: fileData.relatedEntries
    };

    const vector = fileData.embedding?.openai?.vector;

    if (!vector) {
      console.warn(`⚠️ ベクトルなしスキップ: ${fileData.name}`);
      continue;
    }

    await insertOrUpdateEntry(properties, vector);
    await new Promise(r => setTimeout(r, 500)); // ちょっと間隔開ける
  }
};

main();
