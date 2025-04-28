import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {ensureDirectory} from './utils.js';

dotenv.config();

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_FOLDER || './knowledge';

const generateFileName = (name) => {
  return crypto.createHash('sha1').update(name).digest('hex').slice(0, 16) + '.json'; 
    // 16文字(64bit)くらいあればまず衝突しない
  };
  
export const loadKnowledgeEntries = () => {
  ensureDirectory(KNOWLEDGE_DIR);
  const entries = {};
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const entry = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_DIR, file)));
    entries[entry.name] = { ...entry };
  }
  return entries;
};
  
export const saveKnowledgeEntry = (entry) => {
  ensureDirectory(KNOWLEDGE_DIR);
  const fileName = generateFileName(entry.name);
  const filePath = path.join(KNOWLEDGE_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
};
  
  