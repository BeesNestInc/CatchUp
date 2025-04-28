# 🧠 KnowledgeEntry強化フェーズ サマリ

## 🎯 目標
- 単なる「名詞リスト」ではなく、**育つ個人用知識ベース**を作る
- 将来、検索・クエリ・ページ出力に活かせる「百科事典的エントリ」を持つ

---

## 🔥 成果

| 項目 | 内容 |
|:---|:---|
| スキーマ設計 | KnowledgeEntry正式版（Ver.1）策定 |
| ベクトル対応 | summaryベースでembeddingを必須化 |
| type/tags運用 | 名詞分類を柔軟に管理できるように設計 |
| summarize.js修正 | 知識エントリ作成・更新フローを正式運用化 |
| embedding再生成 | 既存エントリでもsummary更新後にembeddingを必ず更新 |
| I/O設計 | batchでまとめてload/saveすることでファイルIO効率化 |

---

## 📚 決まった仕様

- `type`：大分類のみ（人/組織/製品/イベント/記述/その他）
- `tags`：補助分類（役職、カテゴリなど）
- `summary`：要点だけの要約文（200字以内、embeddingのベース）
- `description`：詳細説明（Markdown）
- `embedding`：summaryベースで取得、検索・類似発見に利用
- `sourceArticles`：関連ニュース記事IDリスト
- `createdTime` / `lastUpdatedTime`：作成・更新履歴
- `relatedEntries`：関連エントリへのリンク

---

## 🚀 次にやるべきこと（次スレ予定）

| 項目 | 内容 |
|:---|:---|
| KnowledgeEntryのDB投入設計 | Weaviate or SQL or 他DBへの登録方針 |
| クエリ設計 | KnowledgeEntryベースで意味検索できるように |
| チャット統合 | 質問時にKnowledgeEntry参照できるように |
| ペディアページ生成 | KnowledgeEntryからWikipedia的なページ出力 |

