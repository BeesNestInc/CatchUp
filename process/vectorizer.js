import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_DIR = process.env.DOWNLOAD_FOLDER || './downloads';

export const getEmbedding = async (text, provider = 'openai') => {
    console.log(provider);
  if (provider === 'openai') {
    const res = await axios.post('https://api.openai.com/v1/embeddings', {
      model: 'text-embedding-3-small',
      input: text
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return {
      dim: res.data.data[0].embedding.length,
      vector: res.data.data[0].embedding
    };
  } else if (provider === 'plamo') {
    const res = await axios.post('http://localhost:8000/embed', { text });
    return {
      dim: res.data.embedding.length,
      vector: res.data.embedding
    };
  }
};

const processFile = async (filePath, providers = ['openai']) => {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  //console.log(JSON.stringify(data, ' ', 2));
  const body = data.body.trim(); // fallback if body not saved
  //if (!body || body.length < 20) return;
    //console.log(body, body.length);
  data.embedding = data.embedding || {};
  for (const provider of providers) {
    if (data.embedding[provider]) continue;
    try {
      const { dim, vector } = await getEmbedding(body, provider);
      console.log(dim);
      data.embedding[provider] = { dim, vector };
      console.log(`✅ ${provider} embedding 追加: ${path.basename(filePath)}`);
    } catch (err) {
      console.warn(`⚠️ ${provider} embedding 失敗: ${err.message}`);
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const main = async () => {
  const dates = fs.readdirSync(BASE_DIR);
  for (const date of dates) {
    const bssPath = path.join(BASE_DIR, date, 'bss');
    if (!fs.existsSync(bssPath)) continue;

    const files = fs.readdirSync(bssPath).filter(f => f.endsWith('.structured.json'));
    for (const file of files) {
        console.log(file);
      const filePath = path.join(bssPath, file);
      await processFile(filePath);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

//main();
