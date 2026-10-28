import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getNewsImage } from '../server/images.mjs';

const urls = ['official-cover', 'untrusted-cover', 'offpath-cover'].map(slug => `https://www.evolis.com/blog/${slug}/`);
const images = ['https://www.evolis.com/wp-content/uploads/2026/10/card.jpg', 'https://www.evolis.com.evil.example/wp-content/uploads/card.jpg', 'https://www.evolis.com/private/card.jpg'];
const idFor = url => createHash('sha256').update(url).digest('hex').slice(0, 16);
const jpeg = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(40, 1)]);

test('badge image endpoint downloads official uploads and rejects domain or path lookalikes', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(`<rss><channel>${urls.map((url, i) => `<item><title>Employee ID card printing</title><link>${url}</link><description><![CDATA[<p>Source card printing summary</p><img src="${images[i]}">]]></description></item>`).join('')}</channel></rss>`));
  t.mock.method(dns, 'lookup', async () => [{ address: '104.18.10.10', family: 4 }]);
  const requested = [];
  t.mock.method(https, 'request', (target, options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      requested.push(target.href);
      const photo = target.pathname.startsWith('/wp-content/uploads/');
      const response = Readable.from([photo ? jpeg : Buffer.from('<html><body>Source unavailable</body></html>')]);
      response.statusCode = 200;
      response.headers = { 'content-type': photo ? 'image/jpeg' : 'text/html' };
      callback(response);
      request.emit('close');
    });
    return request;
  });
  syncBuiltinESMExports();
  t.after(syncBuiltinESMExports);
  const result = await getNewsImage(idFor(urls[0]), { url: urls[0], category: 'badges' });
  assert.equal(result.kind, 'article');
  assert.deepEqual(result.body, jpeg);
  assert.ok(requested.includes(images[0]));
  const { default: handler } = await import('../api/image.mjs');
  const res = { statusCode: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value; } };
  await handler({ method: 'GET', url: `/api/image?id=${idFor(urls[0])}&category=badges&url=${encodeURIComponent(urls[0])}` }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Image-Kind'], 'article');
  assert.deepEqual(res.body, jpeg);
  const fallback = await readFile(new URL('../public/images/badges.jpg', import.meta.url));
  for (let i = 1; i < urls.length; i++) {
    const result = await getNewsImage(idFor(urls[i]), { url: urls[i], category: 'badges' });
    assert.equal(result.kind, 'category');
    assert.deepEqual(result.body, fallback);
    assert.equal(requested.includes(images[i]), false);
  }
});
