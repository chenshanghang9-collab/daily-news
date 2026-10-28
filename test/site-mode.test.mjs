import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteMode, savedArticleFallback } from '../public/site-mode.js';

test('Pages snapshot routes and data stay under its project base', () => {
  const site = createSiteMode({ mode: 'static', base: '/daily-news/' });
  assert.equal(site.home, '/daily-news/');
  assert.equal(site.newsURL(true), '/daily-news/data/news.json');
  assert.equal(site.articleURL('0123456789abcdef'), '/daily-news/data/articles/0123456789abcdef.json');
  assert.equal(site.articleHref({ id: '0123456789abcdef' }), '/daily-news/?article=0123456789abcdef');
  assert.equal(site.articleId(new URL('https://example.test/daily-news/?article=0123456789abcdef')), '0123456789abcdef');
  assert.equal(site.articleId(new URL('https://example.test/?article=0123456789abcdef')), null);
  assert.equal(site.articleId(new URL('https://example.test/daily-news/?article=bad')), null);
  assert.equal(createSiteMode({ mode: 'static' }).home, '/');
});

test('localized photos resolve safely and remote originals retain their URL', () => {
  const site = createSiteMode({ mode: 'static', base: '/daily-news/' });
  assert.equal(site.image('images/article-cover.jpg'), '/daily-news/images/article-cover.jpg');
  assert.equal(site.image('https://example.test/photo.jpg'), 'https://example.test/photo.jpg');
  for (const src of ['images/../data/a.json', '//example.test/a.jpg', 'javascript:alert(1)', 'data:image/png,hi', '/images/a.jpg']) assert.equal(site.image(src), '');
});

test('Node mode retains existing root routes and API endpoints', () => {
  const site = createSiteMode();
  assert.equal(site.asset('images/hot.jpg'), '/images/hot.jpg');
  assert.equal(site.newsURL(true), '/api/news?refresh=1');
  assert.equal(site.articleURL('0123456789abcdef', 'id=0123456789abcdef'), '/api/article?id=0123456789abcdef');
  assert.equal(site.articleHref({ id: '0123456789abcdef', url: 'https://example.test/story' }), '/article/0123456789abcdef?url=https%3A%2F%2Fexample.test%2Fstory');
  assert.equal(site.articleId(new URL('https://example.test/article/0123456789abcdef')), '0123456789abcdef');
});


test('expired bookmarks preserve saved body only when it actually exists', () => {
  const metadata = { id: '0123456789abcdef', title: 'Saved title', summary: 'Source summary', source: 'Source', category: 'tech', url: 'https://example.test/story', publishedAt: '2026-10-26T00:00:00Z', photo: { src: 'images/old.jpg', kind: 'article' } };
  const summary = savedArticleFallback(metadata);
  assert.equal(summary.status, 'summary');
  assert.deepEqual(summary.blocks, [{ type: 'paragraph', text: 'Source summary' }]);
  assert.equal(summary.url, metadata.url);
  assert.equal(summary.publishedAt, metadata.publishedAt);
  assert.deepEqual(summary.photo, metadata.photo);
  assert.match(summary.savedSnapshotNotice, /未保存完整正文/);
  const blocks = [{ type: 'paragraph', text: 'Previously saved source body' }];
  const full = savedArticleFallback({ ...metadata, blocks, status: 'full' });
  assert.deepEqual(full.blocks, blocks);
  assert.equal(full.status, 'full');
  assert.match(full.savedSnapshotNotice, /未重新获取来源正文/);
  assert.deepEqual(savedArticleFallback({ ...metadata, summary: '' }).blocks, []);
  assert.equal(savedArticleFallback(null), null);
});
