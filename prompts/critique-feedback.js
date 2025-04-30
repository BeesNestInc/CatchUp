// prompts/critique-feedback.js

export const buildCritiquePrompt = ({ userMessage, finalAnswer }) => {
  return `あなたは回答の評価者です。
以下の質問と回答を読み、どのような不足があるか判断し、それに基づき以下の形式で出力してください：

- "none": 十分に答えられている場合
- "knowledge": 知識の検索を追加すべき
- "article": 最近の出来事（例：事故、発表、事件、声明など）に関して、具体的な事実が不足している場合。記事検索ではこのような「最近の具体的なニュース」を補うために使われます。
- "abort": そもそも現時点では答えられない場合

また、"article"を選んだ場合は、検索に適したキーワードを2〜5個程度抽出し、"keywords"フィールドに文字列配列として含めてください。

【質問】
${userMessage}

【回答】
${finalAnswer}

【出力形式】
{
  "status": "none | knowledge | article | abort",
  "reasons": ["～が不足している", "～が曖昧"],
  "keywords": ["..."]
}`;
};
