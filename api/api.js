// 改良版 api.js（thinkLoop対応 + クエリ解析削除）

import dotenv from "dotenv";
import weaviate from "weaviate-ts-client";
import { ChatSession } from "../libs/chat-session.js";
import { thinkLoop } from "../libs/think-loop.js";

dotenv.config();

const WEAVIATE_HOST = process.env.WEAVIATE_HOST || "localhost:8080";
const client = weaviate.client({ scheme: 'http', host: WEAVIATE_HOST });
const chatSession = new ChatSession();

export default {
  post: async (req, res) => {
    const userMessage = req.body.message;
    const longthink = req.body.longthink || "off";
    if (!userMessage) return res.status(400).json({ error: "Message is required" });
    const prevUser = chatSession.latestUserMessage();
    const prevAssistant = chatSession.latestAssistantMessage();

    try {
      const maxLoop = longthink === "off" ? 0 : parseInt(longthink.split(":")[1] || "2", 10);

      const { response: finalAnswer, feedback } = await thinkLoop({
        userMessage,
        client,
        desiredResults: 5,
        summaryMode: "brief",
        longthink,
        maxLoop
      });

      chatSession.save(userMessage, finalAnswer);
      return res.json({ response: finalAnswer, feedback });
    } catch (err) {
      console.error("🔥 エラー", err.message);
      res.status(500).json({ error: "サーバーエラー" });
    }
  },
  reset: (req, res) => {
    try {
      chatSession.clear();
      res.json({ success: true, message: "Chat session reset." });
    } catch (err) {
      console.error("❌ セッションリセット失敗:", err.message);
      res.status(500).json({ error: "リセット失敗" });
    }
  }
};
