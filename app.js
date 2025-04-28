// app.js - ライブラリ版 ニュース検索付きチャットアシスタント

import express from "express";
import cors from "cors";
import chat from './api/api.js';


const app = express();
app.use(cors());
app.use(express.json());


// チャットAPIエンドポイント
app.post("/chat", chat.post);
app.post("/reset", chat.reset);

app.listen(3030, () => console.log("🧠 Chat + Weaviate API running on http://localhost:3030"));
