import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv';
import { summarizeStructured } from './summarize-via.js';
import { getEmbedding } from '../libs/vectorizer.js';
import { loadKnowledgeEntries, saveKnowledgeEntry } from '../libs/knowledge-file.js';
import { findOrCreateKnowledgeEntry } from '../libs/find-or-create-knowledge.js';
import {
  extractEntities,
} from './knowledge.js';

dotenv.config();

const BASE_DIR = process.env.DOWNLOAD_FOLDER || './downloads';
const OUT_DIR = process.env.PROCESSED_FOLDER || './processed';

const client = weaviate.client({
  scheme: 'http',
  host: process.env.WEAVIATE_HOST || 'localhost:8080'
});

const processFile = async (filePath, relativePath, knowledgeEntries) => {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const { id, title, source, datetime, url, summary: rssSummary, rawHtml } = data;

  const $ = load(rawHtml);
  const bodyHtml = $('body').html() || rawHtml;

  const result = await summarizeStructured(bodyHtml, process.env.LLM_PROVIDER || 'openai');
  if (!result || !result.summary) {
    console.log(`⚠️ 要約失敗: ${id}`);
    return;
  }

  const { summary, body, tags, classifiedTags } = result;

  const entities = extractEntities(body, tags);
  for (const entity of entities) {
    const entry = await findOrCreateKnowledgeEntry(client, entity, {
      entries: knowledgeEntries,
      articleId: id
    });
    try {
      const provider = process.env.EMBEDDING_PROVIDER || 'openai';
      entry.embedding = {
        [provider]: await getEmbedding(entry.summary, provider)
      };
    } catch (err) {
      console.warn(`⚠️ embedding更新失敗: ${err.message}`);
    }
  }

  const embedding = {};
  for (const provider of ['openai']) {
    try {
      embedding[provider] = await getEmbedding(body, provider);
    } catch (err) {
      console.warn(`⚠️ ${provider} embedding 失敗: ${err.message}`);
    }
  }

  const outData = {
    id,
    title,
    source,
    datetime,
    url,
    summary,
    body,
    tags,
    classifiedTags,
    embedding
  };

  const outPath = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(outData, null, 2), 'utf-8');
  console.log(`✅ 保存: ${outPath}`);
};

const main = async () => {
  const knowledgeEntries = loadKnowledgeEntries();

  const dates = fs.readdirSync(BASE_DIR);
  for (const date of dates) {
    const dateDir = path.join(BASE_DIR, date);
    const sources = fs.readdirSync(dateDir);
    for (const source of sources) {
      const sourceDir = path.join(dateDir, source);
      const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const relativePath = path.join(date, source, file);
        const outPath = path.join(OUT_DIR, relativePath);
        if (fs.existsSync(outPath)) {
          console.log(`⏭ スキップ（既に要約あり）: ${relativePath}`);
          continue;
        }
        await processFile(path.join(sourceDir, file), relativePath, knowledgeEntries);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // 全KnowledgeEntryをまとめて保存
  for (const entry of Object.values(knowledgeEntries)) {
    saveKnowledgeEntry(entry);
  }
};

main();
