import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCctvNbaFeed } from '../server/feeds.mjs';

const article = {
  id: 'ARTIexample261026', title: '湖人取得三连胜', brief: 'NBA常规赛，湖人战胜爵士。',
  keywords: '湖人 爵士', focus_date: '2026-10-26 18:29:46',
  image: 'https://p2.img.cctvpic.com/example.jpg',
  url: 'https://sports.cctv.com/2026/10/26/ARTIexample261026.shtml',
};
const payload = (list) => `nba_remen(${JSON.stringify({ data: { list } })});`;

test('NBA stream excludes unrelated sports, videos, galleries and external links', () => {
  const items = parseCctvNbaFeed(payload([
    article,
    { ...article, id: 'VIDEexample', url: article.url.replace('ARTI', 'VIDE') },
    { ...article, id: 'PHOAexample', url: article.url.replace('ARTI', 'PHOA') },
    { ...article, title: '中国足球赢球', brief: '足球比赛结果', keywords: '足球' },
    { ...article, url: 'https://example.com/2026/10/26/ARTIexample.shtml' },
  ]));
  assert.equal(items.length, 1);
  assert.equal(items[0].category, 'nba');
  assert.equal(items[0].source, '央视网');
  assert.equal(items[0].publishedAt, '2026-10-26T10:29:46.000Z');
  assert.equal(items[0].image, article.image);
});

test('unavailable publication time stays unknown and JSONP is never evaluated', () => {
  assert.equal(parseCctvNbaFeed(payload([{ ...article, focus_date: '' }]))[0].publishedAt, null);
  assert.throws(() => parseCctvNbaFeed('nba_remen({}); process.exit()'));
  assert.throws(() => parseCctvNbaFeed(payload([{ ...article, brief: '普通篮球', keywords: '' }])));
});
