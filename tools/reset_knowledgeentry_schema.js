// reset_knowledgeentry_schema.js
import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv';

dotenv.config();

const client = weaviate.client({
  scheme: 'http',
  host: process.env.WEAVIATE_HOST || 'localhost:8080'
});

const schemaDefinition = {
    class: 'KnowledgeEntry',
    vectorizer: 'none',
    properties: [
      { name: 'knowledgeId', dataType: ['text'] }, // ← idじゃなくknowledgeIdに変更
      { name: 'name', dataType: ['text'] },
      { name: 'aliases', dataType: ['text[]'] },
      { name: 'type', dataType: ['text'] },
      { name: 'tags', dataType: ['text[]'] },
      { name: 'summary', dataType: ['text'] },
      { name: 'description', dataType: ['text'] },
      { name: 'sourceArticles', dataType: ['text[]'] },
      { name: 'referCount', dataType: ['int'] },
      { name: 'lastReferTime', dataType: ['date'] },
      { name: 'createdTime', dataType: ['date'] },
      { name: 'lastUpdatedTime', dataType: ['date'] },
      { name: 'relatedEntries', dataType: ['text[]'] }
    ]
  };
  

const resetSchema = async () => {
  try {
    console.log('🧹 KnowledgeEntry クラスを削除中...');
    await client.schema.classDeleter()
      .withClassName('KnowledgeEntry')
      .do();
    console.log('✅ 削除完了');
  } catch (err) {
    if (err.message.includes('status code 422') || err.message.includes('status code 404')) {
      console.log('ℹ️ KnowledgeEntry クラスは存在していません。スキップします。');
    } else {
      console.error('❌ 削除失敗:', err.message);
      return;
    }
  }

  try {
    console.log('🛠 KnowledgeEntry クラスを再定義中...');
    await client.schema.classCreator()
      .withClass(schemaDefinition)
      .do();
    console.log('✅ スキーマ再定義完了');
  } catch (err) {
    console.error('❌ スキーマ定義失敗:', err.message);
  }
};

resetSchema();
