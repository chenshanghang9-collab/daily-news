import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseMrklList, parseCnxwList } from '../server/feeds.mjs';
import { parseArticleHtml, validateArticleRequest } from '../server/articles.mjs';

// Minimal synthetic publisher-shaped markup; these fixtures are not news content.
const hash = url => createHash('sha256').update(url).digest('hex').slice(0, 16);
const mrklRow = (title, date, url = '/news/900.html') => `<div class="info"><span class="time">${date}</span><a class="title" href="${url}">${title}</a></div>`;
const cnxwRow = (title, date = '2026/10/28', url = '/system/2026/10/28/015595999.shtml') => `<li><em>${date}</em><a href="${url}">${title}</a></li>`;

test('domestic vendor list filters unrelated industrial titles and unsafe URLs', () => {
  const items = parseMrklList([
    mrklRow('证卡打印机清洁方法', '2026-10-28'),
    mrklRow('工业棉签市场趋势', '2026-10-28', '/news/901.html'),
    mrklRow('银行卡清洁产品', '2026-10-28', '/news/902.html'),
    mrklRow('证卡打印技术', '2026-10-28', 'https://www.mrkl.com.cn.evil.test/news/903.html'),
  ].join(''));
  assert.equal(items.length, 1);
  assert.equal(items[0].publishedAt, '2026-10-28T00:00:00+08:00');
  assert.equal(items[0].originalLanguage, 'zh');
  assert.equal(items[0].contentType, 'technique');
});

test('domestic list dates reject impossible calendar days and preserve missing dates', () => {
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', '2026/02/30', '2026/13/01', '2026/00/10', '2026/02/29', 'unknown', '']) {
    assert.equal(parseMrklList(mrklRow('证卡打印技术', date))[0].publishedAt, null);
    const html = `<div class="list_e"><ul>${cnxwRow('徽章产业发展', date)}</ul></div>`;
    assert.equal(parseCnxwList(html)[0].publishedAt, null);
  }
  assert.equal(parseMrklList(mrklRow('证卡打印技术', '2024-02-29'))[0].publishedAt, '2024-02-29T00:00:00+08:00');
  assert.equal(parseCnxwList(`<div class="list_e"><ul>${cnxwRow('徽章设计', '2024/02/29')}</ul></div>`)[0].publishedAt, '2024-02-29T00:00:00+08:00');
});

test('local industry list reads dates from actual em markup for previously unknown articles', () => {
  const html = `<a href="/system/2026/10/28/015595999.shtml">徽章导航</a><div class="list_e"><ul>${
    cnxwRow('徽章工厂转向原创设计') + cnxwRow('地方交通新闻', '2026/10/28', '/system/2026/10/28/015595998.shtml')
  }</ul></div>`;
  const items = parseCnxwList(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '徽章工厂转向原创设计');
  assert.equal(items[0].publishedAt, '2026-10-28T00:00:00+08:00');
  assert.equal(items[0].contentType, 'industry_news');
});

const paragraph = '这是用于验证正文提取的合成中文段落，说明证卡设计、照片核对和生产检查等步骤。此文字仅供测试，不是实际来源文章。';
const publishers = [
  { url: 'https://www.mrkl.com.cn/news/900.html', html: `<h1 class="title">证卡维护测试</h1><div class="newscontent-date"><span class="te">2026-10-28</span></div><div class="newscontent-details"><article><p>${paragraph}</p></article></div>`, title: '证卡维护测试' },
  { url: 'https://hznews.hangzhou.com.cn/jingji/content/2026-10/28/content_9999999.htm', html: `<meta name="publishdate" content="2026-10-28"><div class="tit"><span class="hzwRP_lname05">徽章行业测试</span></div><div class="zhengwen"><p>${paragraph}</p></div>`, title: '徽章行业测试' },
  { url: 'https://www.cnxw.com.cn/system/2026/10/28/015595999.shtml', html: `<h1 id="artibodytitle">徽章设计测试</h1><span class="pub_date">发布时间：2026年10月28日</span><div id="ftcg"><p>${paragraph}</p></div>`, title: '徽章设计测试' },
];

test('domestic publisher readers preserve Chinese titles dates and complete body blocks', () => {
  for (const { url, html, title } of publishers) {
    const result = parseArticleHtml(`${html}<footer>友情链接 关注我们</footer>`, { url, title: '', publishedAt: null });
    assert.equal(result.status, 'full');
    assert.equal(result.title, title);
    assert.equal(result.publishedAt, '2026-10-27T16:00:00.000Z');
    assert.deepEqual(result.blocks, [{ type: 'paragraph', text: paragraph }]);
    assert.equal(validateArticleRequest(hash(url), url), url);
  }
});

test('domestic deep links reject host/path lookalikes and identity mismatch', () => {
  for (const url of [
    'https://www.mrkl.com.cn/admin/900.html',
    'https://www.mrkl.com.cn.evil.test/news/900.html',
    'https://user@www.mrkl.com.cn/news/900.html',
    'https://www.cnxw.com.cn/system/2026/10/28/015595999.shtml?url=http://127.0.0.1',
    'https://hznews.hangzhou.com.cn/jingji/content/2026-10/28/content_9999999.htm?url=http://127.0.0.1',
  ]) assert.throws(() => validateArticleRequest(hash(url), url));
  assert.throws(() => validateArticleRequest('0000000000000000', publishers[0].url));
});

test('active badges feeds and outage selections contain only domestic Chinese sources', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const isolated = await import('../server/feeds.mjs?domestic-outage');
  const result = await isolated.getNews({ category: 'badges', force: true });
  assert.equal(result.items.length, 5);
  assert.ok(result.items.every(item => !item.url.includes('evolis') && item.originalLanguage === 'zh' && item.selection === 'curated'));
  assert.ok(result.sources.filter(source => source.category === 'badges').every(source => !source.url.includes('evolis')));
});
