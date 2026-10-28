import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { netlifyHandler } from '../netlify/lib/adapter.mjs';
import { handler as health } from '../netlify/functions/health.mjs';
import { handler as news } from '../netlify/functions/news.mjs';
import { handler as article } from '../netlify/functions/article.mjs';
import { handler as image } from '../netlify/functions/image.mjs';

test('Netlify passes raw and legacy query strings without changing nested article URLs', async () => {
  const source = 'https://www.ithome.com/1/018/301.htm';
  const handler = netlifyHandler((req, res) => {
    const url = new URL(req.url);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ source: url.searchParams.get('url'), category: url.searchParams.get('category') }));
  });
  for (const event of [
    { rawUrl: `https://daily.netlify.app/api/article?url=${encodeURIComponent(source)}&category=nba` },
    { path: '/api/article', queryStringParameters: { url: source, category: 'nba' } },
    { path: '/api/article', rawQuery: `url=${encodeURIComponent(source)}&category=nba` },
  ]) {
    const result = await handler({ httpMethod: 'GET', ...event });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(JSON.parse(result.body), { source, category: 'nba' });
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
  }
});

test('Netlify preserves statuses, method restrictions and empty HEAD bodies for shared API handlers', async () => {
  assert.equal(JSON.parse((await health({ httpMethod: 'GET' })).body).ok, true);
  assert.equal((await health({ httpMethod: 'HEAD' })).body, '');
  assert.equal((await news({ httpMethod: 'GET', rawUrl: 'https://daily.netlify.app/api/news?category=unknown' })).statusCode, 400);
  assert.equal((await article({ httpMethod: 'GET', rawUrl: 'https://daily.netlify.app/api/article?id=invalid' })).statusCode, 400);
  const invalidImage = await image({ httpMethod: 'HEAD', rawUrl: 'https://daily.netlify.app/api/image?id=invalid&url=http://127.0.0.1/private' });
  assert.equal(invalidImage.statusCode, 400);
  assert.equal(invalidImage.body, '');
  const rejected = await image({ httpMethod: 'POST' });
  assert.equal(rejected.statusCode, 405);
  assert.equal(rejected.headers.allow, 'GET, HEAD');
});

test('Netlify encodes real category JPEG fallback losslessly and retains image headers on HEAD', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Publisher offline for deterministic fallback test'); };
  try {
    const event = { rawUrl: 'https://daily.netlify.app/api/image?id=0123456789abcdef&category=nba' };
    const response = await image({ ...event, httpMethod: 'GET' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.isBase64Encoded, true);
    assert.equal(response.headers['content-type'], 'image/jpeg');
    assert.equal(response.headers['x-image-kind'], 'category');
    assert.deepEqual(Buffer.from(response.body, 'base64'), await readFile(new URL('../public/images/nba.jpg', import.meta.url)));
    const head = await image({ ...event, httpMethod: 'HEAD' });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], response.headers['content-length']);
  } finally { globalThis.fetch = originalFetch; }
});

test('Netlify safely reports unexpected API errors without exposing internals', async () => {
  const handler = netlifyHandler(() => { throw new Error('private infrastructure detail'); });
  const result = await handler({ httpMethod: 'GET' });
  assert.equal(result.statusCode, 503);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.doesNotMatch(result.body, /private infrastructure/);
});
