// libs/chat-session.js

import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";

dotenv.config();

const LOG_DIR = process.env.CHAT_LOG_FOLDER || "./data/chat_log";
const DEFAULT_LOG_FILE = `${LOG_DIR}/chat_log.json`;

export class ChatSession {
  constructor(logFile = DEFAULT_LOG_FILE) {
    this.logFile = logFile;
    this.chatHistory = [];
    this.load();
  }

  load() {
    if (fs.existsSync(this.logFile)) {
      this.chatHistory = JSON.parse(fs.readFileSync(this.logFile, "utf-8"));
    } else {
      this.chatHistory = [];
    }
  }

  save(user, assistant) {
    this.chatHistory.push({ role: "user", text: user });
    this.chatHistory.push({ role: "assistant", text: assistant });
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    fs.writeFileSync(this.logFile, JSON.stringify(this.chatHistory, null, 2));
  }

  latestUserMessage() {
    for (let i = this.chatHistory.length - 1; i >= 0; i--) {
      if (this.chatHistory[i].role === "user") {
        return this.chatHistory[i].text;
      }
    }
    return null;
  }

  latestAssistantMessage() {
    for (let i = this.chatHistory.length - 1; i >= 0; i--) {
      if (this.chatHistory[i].role === "assistant") {
        return this.chatHistory[i].text;
      }
    }
    return null;
  }

  getAll() {
    return this.chatHistory;
  }

  clear() {
    this.chatHistory = [];
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    fs.writeFileSync(this.logFile, JSON.stringify([], null, 2));
  }
}
