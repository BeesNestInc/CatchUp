import dotenv from 'dotenv';
import { requestLLM } from '../libs/request.js';
import {parseLLMOutput} from '../libs/parse-output.js';

dotenv.config();

/**
 * rawHtml（記事HTML全体）を受け取り、本文抽出＋要約＋分類タグを生成。
 * 出力形式：
 * {
 *   summary: "200字以内の要約",
 *   body: "抽出された本文全文",
 *   tags: [...],
 *   classifiedTags: {
 *     eventType: [...],
 *     location: [...],
 *     who: [...],
 *     other: [...]
 *   }
 * }
 */
export const summarizeStructured = async (text, provider = 'openai') => {
  let raw, cleaned, intermediateText, bodyText;

  const isSLM = provider.startsWith('slm:');  // ← ここでSLM判定（slm:tinyswallow みたいに）

  if (isSLM) {
    // 🔥 Step1: 本文を抽出
    const pickupPrompt = `
以下のテキストから本文だけの文字列に変換してください。

【元テキスト】
`;
    // 🔥 Step2: 本文を日本語に翻訳
    const translationPrompt = `
以下の本文を日本語に翻訳してください。
できるだけ正確に内容を保って、日本語らしい自然な文にしてください。
英語で出力したり、余分な情報を付加せず、日本語でのみ返してください。

【本文】
`;
    try {
      bodyText = await requestLLM(pickupPrompt, '', text, provider);
console.log({bodyText});
      intermediateText = await requestLLM(translationPrompt, '', bodyText, provider);
console.log({intermediateText});
    } catch (err) {
      console.error(`[${provider}] 翻訳失敗:`, err.message);
      return null;
    }
  } else {
    // 通常モデルならそのまま
    intermediateText = text;
  }

  // 🔥 Step2: 要約・分類
  const system = `
あなたはプロのニュース要約者かつ分類者です。
以下の記事本文を読み、指定されたフォーマットに正確に従って、YAML形式で出力してください。

---
【出力フォーマット】
summary: string # ニュース全体を200文字以内で要約したもの（日本語）
body: string    # ニュース本文の要点を整理し、簡潔な形で再構成したもの（日本語）
tags:           # 記事内容に関連するキーワードや重要語句（日本語）
  - string
classifiedTags:
  eventType:    # 事件・事故・災害など、記事に関連する分類（日本語）
    - string
  location:     # 地名、国名、都市名など（日本語）
    - string
  other:        # その他の重要なキーワード（日本語）
    - string
---

【制約事項】
- YAML形式を厳格に守ってください（余計な文章や注釈を付けないこと）
- summaryはニュース全体の概要を簡潔にまとめてください
- bodyは本文の重要な内容を整理し、自然な日本語で記述してください
- tagsとclassifiedTagsは、本文の内容に即して適切に選んでください
- 出力は必ず日本語で行ってください

【記事本文】
`;

  try {
    const raw = await requestLLM(system, '', intermediateText, provider);
    return parseLLMOutput(raw);
  } catch (err) {
    console.error(`[${provider}] parse error:`, err.message);
    console.error('Response:', raw);
    return null;
  }
};

