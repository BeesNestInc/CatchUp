import yaml from 'js-yaml';

export const parseLLMOutput = (raw, format = 'yaml') => {
  const cleaned = raw
    .replace(/^.*?```[a-z]*\n?/i, '')   // 最初のコードブロックまで全部消す
    .replace(/```$/, '')                // 終端 ```
    .replace(/<\/think>/gi, '')         // 思考タグも除去（任意）
    .trim();

  try {
    if (format === 'json') {
      return JSON.parse(cleaned);
    } else if (format === 'yaml') {
      return yaml.load(cleaned);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  } catch (err) {
    console.error(`❌ parseLLMOutput失敗 (${format}):`, err.message);
    console.error('入力内容:', cleaned);
    throw err;
  }
};
