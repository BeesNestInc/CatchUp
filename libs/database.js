import { loadKnowledgeEntries } from "./knowledge-file.js";
import { getEmbedding } from "./vectorizer.js";

export const searchKnowledgeAndArticles = async (client, knowledgeSpec, articleSpec, descriptionMode = "brief") => {
  const results = [];

  if (knowledgeSpec?.query) {
    if (knowledgeSpec.useVector) {
      try {
        const kvec = (await getEmbedding(knowledgeSpec.query)).vector;
        const kresult = await client.graphql.get()
          .withClassName("KnowledgeEntry")
          .withNearVector({ vector: kvec, certainty: 0.7 })
          .withLimit(knowledgeSpec.desiredResults || 5)
          .withFields("name summary description")
          .do();
        const knowledgeDocs = (kresult.data.Get.KnowledgeEntry || []).map(e => `【${e.name}】\n${e.summary}\n${e.description}`);
        results.push(...knowledgeDocs);
      } catch (e) {
        console.warn("⚠️ KnowledgeEntry embedding失敗:", e.message);
      }
    } else {
      const allEntries = Object.values(loadKnowledgeEntries());
      const entryScores = new Map();
      for (const tag of knowledgeSpec.tags || []) {
        const regex = new RegExp(tag, "i");
        for (const entry of allEntries) {
          if (regex.test(entry.name)) {
            entryScores.set(entry, (entryScores.get(entry) || 0) + 1);
          }
        }
      }
      const sorted = [...entryScores.entries()]
        .filter(([entry]) => entry.summary && entry.summary.length > 20)
        .sort((a, b) => b[1] - a[1])
        .slice(0, knowledgeSpec.desiredResults || 5)
        .map(([entry]) => entry);
      const knowledgeDocs = sorted.map(e => `【${e.name}】\n${e.summary}\n${e.description}`);
      results.push(...knowledgeDocs);
    }
  }

  if (articleSpec?.query && articleSpec.useVector) {
    const avec = (await getEmbedding(articleSpec.query)).vector;
    const abuilder = client.graphql.get()
      .withClassName("Article")
      .withFields("title summary datetime url");

    const afilters = [];
    if (typeof articleSpec.dateAfter === "string" && articleSpec.dateAfter.match(/^\d{4}-\d{2}-\d{2}$/)) {
      if (descriptionMode === "digest") {
        const start = `${articleSpec.dateAfter}T00:00:00Z`;
        const endDate = new Date(new Date(articleSpec.dateAfter).getTime() + 86400000)
          .toISOString().split("T")[0] + "T00:00:00Z";
        afilters.push({ path: ["datetime"], operator: "GreaterThanEqual", valueDate: start });
        afilters.push({ path: ["datetime"], operator: "LessThan", valueDate: endDate });
      } else {
        afilters.push({
          path: ["datetime"],
          operator: "GreaterThan",
          valueDate: `${articleSpec.dateAfter}T00:00:00Z`
        });
      }
    }
    if (articleSpec.tags?.length) {
      afilters.push({
        path: ["tags"],
        operator: "ContainsAny",
        valueTextArray: articleSpec.tags
      });
    }
    console.log("📤 filters = ", JSON.stringify(afilters, null, 2));
    if (afilters.length) abuilder.withWhere({ operator: "And", operands: afilters });
    abuilder.withNearVector({ vector: avec, certainty: 0.6 });

    abuilder.withLimit(descriptionMode === "digest" ? 100 : (articleSpec.desiredResults || 5));

    const aresult = await abuilder.do();
    const articleDocs = (aresult.data.Get.Article || []).map(a => `【${a.datetime}】${a.title}\n${a.summary}\n${a.url}`);
    results.push(...articleDocs);
  }

  return results;
};

