import fs from 'fs';
import path from 'path';
import {ensureDirectory} from './utils.js';
import dotenv from 'dotenv';

dotenv.config();

const MEMORY_DIR = process.env.MEMORY_FOLDER || './memory';
const PERSONA_DIR = path.join(MEMORY_DIR, 'persona-store');

// ペルソナ読み込み
export const loadPersona = (nickname) => {
  const filename = path.join(PERSONA_DIR, `${nickname}.json`);
  if (!fs.existsSync(filename)) {
    const now = new Date().toISOString();
    return {
      nickname,
      style: {
        tone: {},
        formality: 0.5
      },
      log: [],
      created: now,
      lastSeen: now
    };
  }
  return JSON.parse(fs.readFileSync(filename, 'utf-8'));
};

// ペルソナ保存
export const savePersona = (persona) => {
  ensureDirectory(PERSONA_DIR);
  const filename = path.join(PERSONA_DIR, `${persona.nickname}.json`);
  fs.writeFileSync(filename, JSON.stringify(persona, null, 2), 'utf-8');
};
