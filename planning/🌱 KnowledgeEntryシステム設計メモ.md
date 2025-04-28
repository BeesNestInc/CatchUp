# 🌱 KnowledgeEntryシステム設計メモ

---

## 🎯 目的

- ニュース収集ついでに、脳内辞典のような**知識エントリ（KnowledgeEntry）**を構築・成長させる。
- 将来的には「kwsk（詳しく）」と聞かれた時に、**育ったエントリを参照して答えられる**ようにする。

---

## 🛠 基本方針

- **ニュース要約（summarize）タイミングでエントリ作成・更新**を行う。
- **名詞、特に固有名詞っぽいものを片っ端からエントリ化**する。
- **エントリIDはuuid**。ファイル名もuuidとする（`.json`）。
- ファイル内容から意味が分からなくても問題ない。
- 将来はDB管理に移行予定なので、uuid管理が合理的。

---

## 🗂️ KnowledgeEntryデータ構造

```json
{
  "id": "uuid形式",
  "name": "正式名称",
  "aliases": ["別表記1", "別表記2"],
  "type": "product | organization | person | event | other",
  "sourceArticles": ["記事ID1", "記事ID2"],
  "referCount": 2,
  "lastReferTime": "2025-04-27T13:00:00Z",
  "summary": "短い説明文（通常回答用）",
  "description": "Markdown形式の詳細説明（kwsk用）",
  "embedding": { "dim": 768, "vector": [...] } // optional
}
```

---
## ✏️ 運用ルール

| 項目 | ルール |
|:---|:---|
| 名詞拾い | summarize時に本文やtagsから拾う |
| 新規エントリ | uuid発行して新規作成 |
| 既存エントリ | sourceArticlesにID追加、referCount+1、lastReferTime更新 |
| alias | あれば登録。なければ無視。機械自動化は最小限 |
| description | 拾えれば追加。なければ空でもよい |
| embedding | 必須ではない。付与するならオプション |

---

## 🛤️ 今後やるべき作業

- **extractEntities()** 名詞抽出関数の作成
- **findOrCreateKnowledgeEntry()** エントリ存在チェック＋作成関数
- **updateKnowledgeEntry()** エントリ更新関数
- **summarize.jsへの組み込み**（summarizeStructured後にエントリ処理）

---

## 💡 注意事項

- 「整理」はあとでいい。今はどんどん知識を溜めることを優先する。
- alias運用は慎重に。無理にシステム化しない。
- 将来的に整理・淘汰フェーズを設けることを前提にしている。

---

# 🚀 コメント

このシステムは、  
「読むだけで自然に育つ個人用Wikipedia」  
を目指している。

最初は乱暴でもいい。後から育てればいい。  
知識の成長・淘汰のモデルも、**生物の神経形成と同じ流れ**を自然に実装できる設計である。
