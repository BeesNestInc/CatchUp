import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const providerOpenAI = async (modelName, system, user, text) => {
  const prompt = `${user}:\n\n${text}`;

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
  });
  const res = await openai.chat.completions.create({
  model: modelName || 'gpt-4o',
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
    ],
  });
  return res.choices[0].message.content.trim();
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const providerGemini = async (modelName, system, user, text) => {
  const prompt = `${user}:\n\n${text}`;

  const model = genAI.getGenerativeModel({
    model: modelName || "gemini-1.5-flash"
  });
  const result = await model.generateContent(`${system}\n\n${prompt}`);
  const response = result.response;
  await sleep(1000);
  return response.text();
}

const providerLlama = async (modelName, system, user, text) => {
  const openaiRequest = {
    model: modelName || 'default',
    messages: [
      { role: "system", content: system || "あなたは優秀なアシスタントです。" },
      { role: "user", content: text }
    ],
    temperature: 0.7,
    stream: false
  };

  const res = await axios.post(
    (process.env.LLAMA_SERVER_URL || 'http://localhost:11434') + '/v1/chat/completions',
    openaiRequest,
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  return res.data.choices[0].message.content.trim();
};


const providers = {
  'openai': providerOpenAI,
  'gemini': providerGemini,
  'llama': providerLlama,
  'slm': providerLlama,
};

export const requestLLM = async (system, user, text, _provider = 'openai:gpt-4o') => {
  console.log({system});
  console.log({user});
  try {
    let provider = _provider.split(':')
    return  (providers[provider[0]](provider[1], system, user, text));
  } catch (err) {
    console.error(`[${provider}] エラー:`, err.message);
    return;
  }
}
