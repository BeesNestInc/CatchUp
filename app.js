// app.js - ライブラリ版 ニュース検索付きチャットアシスタント

import express from "express";
import cors from "cors";
import chat from './api/api.js';
import session from 'express-session';
import fileStore from 'session-file-store';
const FileStore = fileStore(session);

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
    secret: 'CatchUp',
    resave: true,
    saveUninitialized: false,
    name: 'CatchUp',					//	ここの名前は起動するnode.js毎にユニークにする
    store: new FileStore({
      ttl: 3600 * 24 * 7,
      reapInterval: 3600 * 24 * 7,
      path: `./sessions`
    }),
  
    cookie: {
      httpOnly: true,
      secure: false,
      maxage: null
    }
  }));
  

// チャットAPIエンドポイント
app.post("/chat", chat.post);
app.post("/reset", chat.reset);

app.listen(3030, () => console.log("🧠 Chat + Weaviate API running on http://localhost:3030"));
