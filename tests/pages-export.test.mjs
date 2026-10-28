import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportPages, normalizeBase } from '../scripts/export-pages.mjs';

const item = { id: '0123456789abcdef', title: '来源标题', summary: '来源摘要', url: 'https://www.ithome.com/0/123/456.htm', category: 'tech', publishedAt: '2026-10-27T01:00:00Z' };
const now = new Date('2026-10-27T02:00:00Z');
const news = { items: [item], fetchedAt: now.toISOString(), sources: [{ status: 'ok' }], status: 'ok', total: 1 };
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'daily-pages-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { dir, outDir: path.join(dir, 'site'), now };
}
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

test('static output preserves source blocks, local covers, provenance and project base', async t => {
  const options = await fixture(t);
  await exportPages({ ...options, basePath: '/daily-news/', providers: {
    getNews: async () => news,
    getArticle: async () => ({ ...item, status: 'full', blocks: [{ type: 'paragraph', text: '真实正文' }, { type: 'image', src: 'https://img.ithome.com/photo.jpg' }], images: [] }),
    getNewsImage: async () => ({ kind: 'article', contentType: 'image/jpeg', body: Buffer.from('fixture photograph bytes') }),
  } });
  const html = await readFile(path.join(options.outDir, 'index.html'), 'utf8');
  assert.match(html, /name="daily-mode" content="static"/);
  assert.match(html, /name="daily-base" content="\/daily-news\/"/);
  assert.doesNotMatch(html, /(?:src|href)=["']\/(?!daily-news\/|\/)/);
  const credits = await readFile(path.join(options.outDir, 'images/credits.html'), 'utf8');
  assert.match(credits, /href="\/daily-news\/images\/credits\.css"/);
  assert.match(credits, /href="\/daily-news\/"/);
  assert.doesNotMatch(credits, /(?:src|href)=["']\/(?!daily-news\/|\/)/);
  const article = await readJson(path.join(options.outDir, `data/articles/${item.id}.json`));
  assert.deepEqual(article.blocks, [{ type: 'paragraph', text: '真实正文' }]);
  assert.deepEqual(article.provenance.sourceImages, ['https://img.ithome.com/photo.jpg']);
  assert.equal(article.provenance.bodyImagesOmitted, true);
  assert.equal(article.photo.kind, 'article');
  assert.equal((await readFile(path.join(options.outDir, article.photo.src))).toString(), 'fixture photograph bytes');
  const output = await readJson(path.join(options.outDir, 'data/news.json'));
  assert.deepEqual(output.items[0].photo, article.photo);
  assert.equal(output.mode, 'static');
  assert.equal(output.items[0].publishedAt, item.publishedAt);
  assert.equal((await readdir(options.outDir)).includes('server'), false);
  assert.equal((await readdir(options.outDir)).includes('.hallmark'), false);
});

test('failed article and image resolve to honest internal summary and actual category photo', async t => {
  const options = await fixture(t);
  await exportPages({ ...options, providers: { getNews: async () => news, getArticle: async () => { throw Error('offline'); }, getNewsImage: async () => { throw Error('offline'); } } });
  const article = await readJson(path.join(options.outDir, `data/articles/${item.id}.json`));
  assert.equal(article.status, 'summary');
  assert.equal(article.blocks[0].text, item.summary);
  assert.deepEqual(article.photo, { src: 'images/tech.jpg', kind: 'category' });
  assert.ok((await readFile(path.join(options.outDir, article.photo.src))).length > 1000);
  assert.equal(article.cover, null);
});

test('empty fresh snapshot fails without replacing existing output', async t => {
  const options = await fixture(t);
  await mkdir(options.outDir); await writeFile(path.join(options.outDir, 'sentinel'), 'live');
  await assert.rejects(exportPages({ ...options, providers: { getNews: async () => ({ items: [] }) } }), /output preserved/);
  assert.equal(await readFile(path.join(options.outDir, 'sentinel'), 'utf8'), 'live');
});

test('recent previous snapshot restores stories and photographs on complete feed outage', async t => {
  const options = await fixture(t);
  await exportPages({ ...options, providers: { getNews: async () => news, getArticle: async () => ({ ...item, blocks: [{ type: 'paragraph', text: '此前来源正文' }], status: 'full' }), getNewsImage: async () => ({ kind: 'article', contentType: 'image/png', body: Buffer.from('previous picture') }) } });
  const destination = path.join(options.dir, 'recovered');
  const result = await exportPages({ ...options, outDir: destination, previousDir: options.outDir, providers: { getNews: async () => { throw Error('offline'); }, getArticle: () => assert.fail('no live article request'), getNewsImage: () => assert.fail('no live photo request') } });
  assert.equal(result.snapshotFallback, true);
  assert.equal(result.stale, true);
  const article = await readJson(path.join(destination, `data/articles/${item.id}.json`));
  assert.equal(article.blocks[0].text, '此前来源正文');
  assert.equal(await readFile(path.join(destination, article.photo.src), 'utf8'), 'previous picture');
});

test('article extraction concurrency is bounded even when requested above server limit', async t => {
  const options = await fixture(t); let active = 0; let peak = 0;
  const items = Array.from({ length: 40 }, (_, i) => ({ ...item, id: i.toString(16).padStart(16, '0') }));
  await exportPages({ ...options, concurrency: 200, providers: { getNews: async () => ({ ...news, items }), getArticle: async id => {
    active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return { ...items.find(item => item.id === id), blocks: [], status: 'summary' };
  }, getNewsImage: async () => ({ kind: 'category' }) } });
  assert.ok(peak <= 16); assert.ok(peak > 1);
});

test('base paths reject injection and ambiguous relative roots', () => {
  assert.equal(normalizeBase('/'), '/'); assert.equal(normalizeBase('/a/b/'), '/a/b/');
  for (const invalid of ['relative/', '/foo', '//host/', '/a/../', '/x"/']) assert.throws(() => normalizeBase(invalid));
});
