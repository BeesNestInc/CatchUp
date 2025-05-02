import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const MEMORY_DIR = path.join(process.env.MEMORY_FOLDER || './memory', 'catchup');

const LOG_PATH = path.join(MEMORY_DIR, 'log.json');
const PERSONA_PATH = path.join(MEMORY_DIR, 'persona.json');

// ログ追加
export const logResponse = ({ nickname, mode, response }) => {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  let log = [];
  if (fs.existsSync(LOG_PATH)) {
    log = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
  }
  log.push({
    timestamp: new Date().toISOString(),
    nickname,
    mode,
    response
  });
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf-8');
};

// ペルソナ読み書き（まだ最低限）
export const loadCatchupPersona = () => {
  if (!fs.existsSync(PERSONA_PATH)) {
    return {
      currentPersona: 'digest',
      userBiasMap: {},
      lastUpdated: new Date().toISOString()
    };
  }
  return JSON.parse(fs.readFileSync(PERSONA_PATH, 'utf-8'));
};

export const saveCatchupPersona = (persona) => {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(PERSONA_PATH, JSON.stringify(persona, null, 2), 'utf-8');
};
