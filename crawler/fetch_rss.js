// fetch_rss.js（rawHtml保存、summary保持、body/htmlは後処理）
import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'crypto';
import {rssFeeds} from '../config/rss_feeds.js';
import dotenv from 'dotenv';
import {ensureDirectory} from '../libs/utils.js';

dotenv.config();

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const saveFolder = process.env.DOWNLOAD_FOLDER || './downloads';

const makeEntryId = ($el, date, feedId) => {
  const guid = $el.find('guid').text().trim();
  const atomId = $el.find('id').text().trim();
  const link = $el.find('link').attr('href') || $el.find('link').text().trim();
  const base = guid || atomId || link;
  const hash = crypto.createHash('md5').update(base).digest('hex').slice(0, 8);
  return `${date.replace(/-/g, '')}-${feedId}-${hash}`;
};

async function fetchAndSaveRSS() {
  for (const feed of rssFeeds) {
    const { id: feedId, URL } = feed;
    console.log(`📡 取得中: ${feedId} (${URL})`);
    try {
      const xml = await axios.get(URL).then(res => res.data);
      const $ = load(xml, { xmlMode: true });
      const items = $('item').length ? $('item') : $('entry');
      items.each(async (_, el) => {
        const $el = $(el);
        const title = $el.find('title').first().text().trim() || '無題';
        const link = $el.find('link').attr('href') || $el.find('link').text().trim();
        const rawDate = $el.find('pubDate').text() || $el.find('updated').text() || new Date().toISOString();
        const description = $el.find('description').text().trim() || $el.find('content').text().trim() || '';

        const datetime = dayjs(rawDate).toISOString();
        const date = dayjs(datetime).format('YYYY-MM-DD');
        const id = makeEntryId($el, date, feedId);
        const folderPath = path.join(saveFolder, date, feedId);
        ensureDirectory(folderPath);

        const fileName = `${id}.json`;
        const filePath = path.join(folderPath, fileName);
        if (fs.existsSync(filePath)) {
          console.log(`⏭ スキップ: ${fileName}（既に存在）`);
          return;
        }

        let rawHtml = '';
        try {
          rawHtml = await axios.get(link).then(res => res.data);
        } catch (err) {
          console.warn(`⚠️ rawHtml取得失敗 (${link}): ${err.message}`);
          rawHtml = '(取得失敗)';
        }

        const json = {
          id,
          title,
          source: feedId,
          datetime,
          url: link,
          summary: description,
          rawHtml
        };

        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
        console.log(`✅ 保存: ${filePath}`);
      });
    } catch (err) {
      console.error(`⚠️ ${feedId} 取得失敗: ${err.message}`);
    }
  }
}

fetchAndSaveRSS();
