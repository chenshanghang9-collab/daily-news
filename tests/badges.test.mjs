import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as feeds from '../server/feeds.mjs';
import { parseArticleHtml, validateArticleRequest } from '../server/articles.mjs';

// Synthetic publisher-shaped fixtures exercise filtering, never provide live news.
const card = (title, slug, options = {}) => `<a class="tease-wrapper" href="${options.url || `https://www.evolis.com/blog/${slug}/`}"><h2 class="tease__title">${title}</h2><p class="tease__excerpt">${options.summary || 'Practical information for card printing professionals.'}</p>${options.date ? `<time datetime="${options.date}"></time>` : ''}</a>`;
const blog = cards => `<html><body>${cards.join('')}</body></html>`;

test('badge listing retains relevant official articles and rejects recruitment, CSR and outside paths', () => {
  const items = feeds.parseEvolisBlog(blog([
    card('Choosing a printer for employee ID cards', 'employee-id-cards', { date: '2026-10-21T09:30:00+02:00' }),
    card('证卡打印：清洁打印头的方法', 'cleaning', { summary: '清洁打印头有助于保持工牌打印质量。' }),
    card('Our community charity and CSR programme', 'csr', { summary: 'Card printer teams volunteer in their community.' }),
    card('We are hiring a card printer sales manager', 'hiring'),
    card('Company financial results', 'results', { summary: 'Annual earnings and revenue.' }),
    card('ID card guide', 'external', { url: 'https://www.evolis.com.evil.example/blog/guide/' }),
    card('ID card products', 'product', { url: 'https://www.evolis.com/products/printer/' }),
    card('ID card archive', 'archive', { url: 'https://www.evolis.com/blog/' }),
  ]));
  assert.deepEqual(items.map(item => item.title), ['Choosing a printer for employee ID cards', '证卡打印：清洁打印头的方法']);
  assert.equal(items[0].category, 'badges');
  assert.equal(items[0].source, 'Evolis 官方');
  assert.equal(items[0].publishedAt, '2026-10-21T07:30:00.000Z');
});

test('badge listing leaves missing or invalid source dates unknown', () => {
  assert.equal(feeds.parseEvolisBlog(blog([card('How to print school badges', 'school')]))[0].publishedAt, null);
  assert.equal(feeds.parseEvolisBlog(blog([card('How to print school badges', 'school', { date: 'not a date' })]))[0].publishedAt, null);
});

const badgeUrl = 'https://www.evolis.com/blog/employee-id-cards/';
const badgeItem = { id: createHash('sha256').update(badgeUrl).digest('hex').slice(0, 16), url: badgeUrl, source: 'Evolis 官方', category: 'badges', title: '', summary: 'Source excerpt', publishedAt: null };

test('official badge blog article extraction preserves real paragraphs and only official upload images', () => {
  const result = parseArticleHtml(`<html><head><meta property="article:published_time" content="2026-10-21T09:30:00+02:00"></head><body><article><h1>Employee ID card guide</h1><div class="entry-content"><p>Employee identification cards combine a photograph, a name and a clear layout that remains readable during daily use.</p><figure><img src="https://www.evolis.com/wp-content/uploads/2026/10/cards.jpg" width="800" height="500"><figcaption>Example card printing</figcaption></figure><p>Clean the printer following the manufacturer instructions before producing the next batch of cards.</p><img src="https://untrusted.example/card.jpg"><nav>Navigation text should be excluded</nav></div></article></body></html>`, badgeItem);
  assert.equal(result.status, 'full');
  assert.equal(result.title, 'Employee ID card guide');
  assert.equal(result.publishedAt, '2026-10-21T07:30:00.000Z');
  assert.equal(result.blocks.filter(block => block.type === 'paragraph').length, 2);
  assert.deepEqual(result.images, ['https://www.evolis.com/wp-content/uploads/2026/10/cards.jpg']);
  assert.equal(result.blocks.some(block => block.text?.includes('Navigation')), false);
  const summary = parseArticleHtml('<html><meta name="description" content="A source supplied card printing excerpt"><body><main>Unavailable</main></body></html>', { ...badgeItem, summary: '' });
  assert.equal(summary.status, 'summary');
  assert.equal(summary.blocks[0].text, 'A source supplied card printing excerpt');
});

test('badge deep links require matching identity and an official individual blog path', () => {
  assert.equal(validateArticleRequest(badgeItem.id, badgeUrl), badgeUrl);
  for (const url of [
    'https://www.evolis.com/blog/', 'https://www.evolis.com/products/printer/',
    'https://www.evolis.com/blog/category/cards/', 'https://www.evolis.com/blog/feed/',
    'https://www.evolis.com.evil.example/blog/cards/',
    'https://user:pass@www.evolis.com/blog/cards/',
    'https://www.evolis.com:444/blog/cards/',
  ]) {
    const id = createHash('sha256').update(url).digest('hex').slice(0, 16);
    assert.throws(() => validateArticleRequest(id, url), error => error.statusCode === 400);
  }
});

test('badges category is accepted by the dynamic API and advertised by the feed aggregator', async t => {
  t.mock.method(globalThis, 'fetch', async url => new Response(url === 'https://www.evolis.com/blog/' ? listing : '<rss><channel><item><title>Existing story</title><link>https://www.chinanews.com.cn/cj/2026/10-28/10721540.shtml</link></item></channel></rss>'));
  const { default: handler } = await import('../api/news.mjs');
  const res = { statusCode: null, setHeader() {}, end(value) { this.body = value; } };
  await handler({ method: 'GET', url: '/api/news?category=badges' }, res);
  assert.equal(res.statusCode, 200);
  const result = JSON.parse(res.body);
  assert.equal(result.category, 'badges');
  assert.ok(result.availableCategories.includes('badges'));
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every(item => item.sourceId === 'evolis-badges'));
});

const listing = `<html><body><a class="tease-wrapper" href="https://www.evolis.com/blog/evolis-reaches-the-historic-one-million-printer-milestone/"><span class="tease__category">News</span><h2 class="tease__title">Evolis Reaches the Historic One-Million-Printer Milestone</h2><p class="tease__excerpt">After more than 25 years of innovation, Evolis has just passed the symbolic milestone of one million card printers produced at its site.</p><img data-lazy-src="https://www.evolis.com/wp-content/uploads/2026/09/card.png"></a><a class="tease-wrapper" href="/blog/campus-card-trends/"><span class="tease__category">Advices</span><h2 class="tease__title">Campus card trends in higher education</h2><p class="tease__excerpt">How school ID cards are evolving.</p></a><a class="tease-wrapper" href="/blog/charity/"><h2 class="tease__title">Our charity programme</h2><p class="tease__excerpt">Card printer employees volunteered.</p></a><a class="tease-wrapper" href="https://evil.example/blog/id-cards/"><h2 class="tease__title">ID cards</h2></a></body></html>`;

test('official blog listing uses publisher cards, real detail dates where verified, and unknown dates otherwise', () => {
  assert.equal(typeof feeds.parseEvolisBlog, 'function');
  const items = feeds.parseEvolisBlog(listing);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://www.evolis.com/blog/evolis-reaches-the-historic-one-million-printer-milestone/');
  assert.equal(items[0].publishedAt, '2026-10-13T07:25:30.000Z');
  assert.equal(items[0].image, 'https://www.evolis.com/wp-content/uploads/2026/09/card.png');
  assert.equal(items[1].publishedAt, null);
  assert.equal(items[1].category, 'badges');
  assert.throws(() => feeds.parseEvolisBlog('<html><body>No article cards</body></html>'));
});

test('source outages retain verified badge selections with explicit provenance while other news remains usable', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url === 'https://www.evolis.com/blog/') throw Error('Source offline');
    return new Response('<rss><channel><item><title>Existing publisher story</title><link>https://www.chinanews.com.cn/cj/2026/10-28/10721541.shtml</link><description>Original story summary</description></item></channel></rss>');
  });
  const isolated = await import('../server/feeds.mjs?badge-outage');
  const result = await isolated.getNews({ category: 'badges', force: true });
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].publishedAt, '2026-10-13T07:25:30.000Z');
  assert.ok(result.items.every(item => item.selection === 'curated'));
  const source = result.sources.find(source => source.id === 'evolis-badges');
  assert.equal(source.selection, 'curated');
  assert.match(source.note, /已核实/);
  const all = await isolated.getNews();
  assert.ok(all.items.some(item => item.title === 'Existing publisher story'));
});

test('official WordPress detail keeps lazy source photos and excludes page sharing controls', () => {
  const result = parseArticleHtml('<html><body><article><div class="single-post__content"><div class="single-post__category">News</div><h1>Card printing guide</h1><div class="single-post__date">09 Sep 2025</div><div class="social-sharing-links">Share</div><p>Prepare the employee card design and verify the photograph and name before sending a batch to the printer.</p><figure><img src="data:image/svg+xml,placeholder" data-lazy-src="https://fr.evolis.com/wp-content/uploads/2025/09/cards.png" width="810" height="384"></figure><div class="wp-block-buttons">Download the brochure</div></div></article></body></html>', badgeItem);
  assert.equal(result.status, 'full');
  assert.deepEqual(result.images, ['https://fr.evolis.com/wp-content/uploads/2025/09/cards.png']);
  assert.equal(result.blocks.filter(block => block.type === 'paragraph').length, 1);
  assert.equal(result.blocks.some(block => ['Share', 'News', '09 Sep 2025', 'Download the brochure'].includes(block.text)), false);
  assert.equal(result.blocks.some(block => block.type === 'heading' && block.text === result.title), false);
});
