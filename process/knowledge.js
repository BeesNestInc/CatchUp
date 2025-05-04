// knowledge.js

export const extractEntities = (text, tags = []) => {
  const entities = new Set([
    ...extractFromTags(tags),
    ...extractFromText(text)
  ]);
  return Array.from(entities);
};

export const extractFromTags = (tags = []) => {
  const result = new Set();
  for (const tag of tags) {
    //console.log({tag})
    if (tag.trim()) result.add(tag.trim());
  }
  return result;
};

export const extractFromText = (text) => {
  const result = new Set();
  const words = text.match(/\b[^\d\W]{2,}\b/gu); // 簡易な「名詞らしきもの」抽出
  if (words) {
    for (const word of words) {
      result.add(word.trim());
    }
  }
  return result;
};