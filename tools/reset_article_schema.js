import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv';

dotenv.config();

// Weaviateクライアント初期化
const client = weaviate.client({
  scheme: 'http',
  host: process.env.WEAVIATE_HOST || 'localhost:8080'
});

const schemaDefinition = {
  class: 'Article',
  vectorizer: 'none',
  invertedIndexConfig: {
    stopwords: {
      preset: 'none'  // ← ここが重要
    }
  },
  properties: [
    { name: 'originalId', dataType: ['text'] },
    { name: 'title', dataType: ['text'] },
    { name: 'summary', dataType: ['text'] },
    { name: 'tags', dataType: ['text[]'] },
    { name: 'classifiedTags', dataType: ['text[]'] },
    { name: 'searchTags', dataType: ['text[]'] },
    { name: 'datetime', dataType: ['date'] },
    { name: 'url', dataType: ['text'] },
    { name: 'source', dataType: ['text'] }
  ]
};

const resetSchema = async () => {
  try {
    console.log('🧹 Article クラスを削除中...');
    await client.schema.classDeleter()
      .withClassName('Article')
      .do();
    console.log('✅ 削除完了');
  } catch (err) {
    if (err.message.includes('status code 422') || err.message.includes('status code 404')) {
      console.log('ℹ️ Article クラスは存在していません。スキップします。');
    } else {
      console.error('❌ 削除失敗:', err.message);
      return;
    }
  }

  try {
    console.log('🛠 Article クラスを再定義中...');
    await client.schema.classCreator()
      .withClass(schemaDefinition)
      .do();
    console.log('✅ スキーマ再定義完了');
  } catch (err) {
    console.error('❌ スキーマ定義失敗:', err.message);
  }
};

resetSchema();
