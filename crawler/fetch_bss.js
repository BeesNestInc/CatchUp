import axios from 'axios';
import { load } from 'cheerio';
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import {ensureDirectory} from '../libs/utils.js';

const saveFolder = process.env.DOWNLOAD_FOLDER || './downloads';

const MAX_PAGES = parseInt(process.env.MAX_PAGES || '3', 10);

async function fetchAndSaveNews() {
  const baseURL = 'https://newsdig.tbs.co.jp';
  const articles = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${baseURL}/list/bss/latest?page=${page}`;
    //console.log(`📄 ページ ${page} を取得中...`);
    try {
      const { data } = await axios.get(url);
      const $ = load(data);
      $('article.m-article-row').each((_, elem) => {
        const title = $(elem).find('h3.m-article-content__title').text().trim();
        const relativeLink = $(elem).find('a.m-article-inner').attr('href');
        if (!relativeLink) return;
        const detailURL = new URL(relativeLink, baseURL).href;
        const datetime = $(elem).find('time.c-date').attr('datetime') || new Date().toISOString();
        articles.push({ title, detailURL, datetime });
      });
    } catch (error) {
      console.error(`ページ ${page} の取得失敗:`, error.message);
    }
  }

  for (const article of articles) {
    const date = dayjs(article.datetime).format('YYYY-MM-DD');
    const id = article.detailURL.match(/\/(\d+)/)?.[1] || Math.random().toString(36).slice(2, 10);
    const folderPath = path.join(saveFolder, date, 'bss');
    ensureDirectory(folderPath);

    const filePath = path.join(folderPath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      //console.log(`⏭ スキップ: ${id}（既に存在）`);
      continue;
    }

    const rawHtml = await axios.get(article.detailURL).then(res => res.data);

    const json = {
      id: `${dayjs(article.datetime).format('YYYYMMDD')}-bss-${id}`,
      title: article.title,
      source: 'BSS山陰放送',
      datetime: article.datetime,
      url: article.detailURL,
      summary: '',
      rawHtml
    };

    fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
    console.log(`✅ 保存: ${filePath}`);
  }
}

fetchAndSaveNews();
