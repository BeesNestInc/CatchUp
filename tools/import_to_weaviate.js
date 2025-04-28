import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import weaviate from 'weaviate-ts-client';
import { v4 as uuidv4 } from 'uuid';  // ←追加！

dotenv.config();

const BASE_DIR = process.env.PROCESSED_FOLDER || './processed';

// Weaviateクライアント初期化
const client = weaviate.client({
  scheme: 'http',
  host: 'localhost:8080'
});

const alreadyExists = async (originalId) => {
  try {
    const res = await client.graphql.get()
      .withClassName('Article')
      .withFields('_additional { id }')
      .withWhere({
        path: ['originalId'],
        operator: 'Equal',
        valueString: originalId
      })
      .do();

    return res.data.Get.Article.length > 0;
  } catch (err) {
    console.error(`❓ 存在チェック失敗 (${originalId}):`, err.message);
    return false;
  }
};

const insertToWeaviate = async (data) => {
  try {
    await client.data.creator()
      .withClassName('Article')
      .withId(uuidv4()) // ★ UUID自動生成してIDにする！
      .withProperties(data.properties)
      .withVector(data.vector || undefined)
      .do();
    console.log(`✅ アップロード: ${data.properties.originalId}`);
  } catch (err) {
    console.error(`❌ エラー: ${data.properties.originalId} →`, err.message);
  }
};

const main = async () => {
  const dates = fs.readdirSync(BASE_DIR);

  for (const date of dates) {
    const datePath = path.join(BASE_DIR, date);
    if (!fs.statSync(datePath).isDirectory()) continue;

    const sources = fs.readdirSync(datePath);
    for (const source of sources) {
      const sourcePath = path.join(datePath, source);
      if (!fs.statSync(sourcePath).isDirectory()) continue;

      const files = fs.readdirSync(sourcePath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(sourcePath, file);
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const originalId = fileData.id;

        if (await alreadyExists(originalId)) {
          console.log(`⏭ スキップ（既存）: ${originalId}`);
          continue;
        }

        const obj = {
          properties: {
            originalId,
            title: fileData.title,
            summary: fileData.summary,
            tags: fileData.tags,
            classifiedTags: Object.values(fileData.classifiedTags || {}).flat(),
            searchTags: fileData.searchTags || [],
            datetime: fileData.datetime,
            url: fileData.url,
            source: fileData.source
          },
          vector: fileData.embedding?.openai?.vector
        };
        
        await insertToWeaviate(obj);
      }
    }
  }
};

main();
