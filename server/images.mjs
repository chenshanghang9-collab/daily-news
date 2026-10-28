import { readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
import { getNews } from './feeds.mjs';

const categories = new Set(['hot', 'world', 'tech', 'life', 'culture', 'business', 'nba']);
const cache = new Map();
const inFlight = new Map();
const localPhotos = new Map();
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_BYTES = 40 * 1024 * 1024;
let cacheBytes = 0;

function imageType(body) {
  if (body.length >= 3 && body[0] === 255 && body[1] === 216 && body[2] === 255) return 'image/jpeg';
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(body.toString('ascii', 0, 6))) return 'image/gif';
  return null;
}

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Restrict IPv6 to global unicast, excluding documentation/transition ranges.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:(?:0:|db8:)/i.test(address) && !/^2002:/i.test(address);
}

function allowedImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase();
    const allowed = host === 'img.ithome.com' ||
      /^(?:i\d*|image\d*|www)\.chinanews\.com\.cn$/.test(host) ||
      /^p[1-5]\.img\.cctvpic\.com$/.test(host) ||
      host === 'image.cns.com.cn' || host === 'www.cnsphoto.com';
    return allowed ? url : null;
  } catch { return null; }
}

function validArticleUrl(value, id) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port &&
      ['www.chinanews.com.cn', 'www.chinanews.com', 'www.ithome.com', 'sports.cctv.com'].includes(url.hostname.toLowerCase()) &&
      createHash('sha256').update(url.href).digest('hex').slice(0, 16) === id;
  } catch { return false; }
}

async function localPhoto(category) {
  if (!localPhotos.has(category)) {
    localPhotos.set(category, readFile(new URL(`../public/images/${category}.jpg`, import.meta.url))
      .then(body => ({ body, contentType: 'image/jpeg', kind: 'category' }))
      .catch(error => {
        localPhotos.delete(category);
        if (category !== 'hot') return localPhoto('hot');
        throw error;
      }));
  }
  return localPhotos.get(category);
}

function remember(key, value) {
  if (cache.has(key)) { cacheBytes -= cache.get(key).value.body.length; cache.delete(key); }
  while (cache.size >= 48 || cacheBytes + value.body.length > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cacheBytes -= cache.get(oldest).value.body.length;
    cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + (value.kind === 'article' ? 60 * 60_000 : 30_000) });
  cacheBytes += value.body.length;
  return value;
}

async function downloadPhoto(value, deadline = Date.now() + 6000, redirects = 0) {
  const url = allowedImageUrl(value);
  if (!url || redirects > 2 || Date.now() >= deadline) throw new Error('Untrusted image');
  const remaining = () => Math.max(1, deadline - Date.now());
  let timer;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), remaining()); }),
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(({address}) => !publicAddress(address))) throw new Error('Non-public image address');
  const chosen = addresses.find(a => a.family === 4) || addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(url, {
      family: chosen.family,
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
      headers: { accept: 'image/jpeg,image/png,image/webp,image/gif', 'user-agent': 'DailyBrief/1.0 (news image reader)' },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        res.destroy();
        clearTimeout(timeout);
        if (!location) return reject(new Error('Missing redirect'));
        downloadPhoto(new URL(location, url).href, deadline, redirects + 1).then(resolve, reject);
        return;
      }
      const declared = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (res.statusCode !== 200 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(declared) || Number(res.headers['content-length']) > MAX_BYTES) {
        res.destroy(); reject(new Error('Invalid image response')); return;
      }
      const parts = []; let bytes = 0;
      res.on('data', part => {
        bytes += part.length;
        if (bytes > MAX_BYTES) { req.destroy(new Error('Image too large')); return; }
        parts.push(part);
      });
      res.on('error', reject);
      res.on('end', () => {
        const body = Buffer.concat(parts);
        const contentType = imageType(body);
        if (!contentType || contentType !== declared || body.length < 32) reject(new Error('Image signature mismatch'));
        else resolve({ body, contentType, kind: 'article' });
      });
    });
    const timeout = setTimeout(() => req.destroy(new Error('Image timeout')), remaining());
    req.once('error', reject);
    req.once('close', () => clearTimeout(timeout));
    req.end();
  });
}

/** Fetch only publisher-selected photos. User URL parameters are article URLs, never image URLs. */
export async function getNewsImage(id, { url, category = 'hot' } = {}) {
  const selected = categories.has(category) ? category : 'hot';
  if (!/^[a-f0-9]{16}$/.test(id) || (url && !validArticleUrl(url, id))) return localPhoto(selected);
  const key = `${id}:${selected}`;
  const cached = cache.get(key);
  if (cached?.expires > Date.now()) return cached.value;
  if (inFlight.has(key)) return inFlight.get(key);
  if (inFlight.size >= 16) return localPhoto(selected);
  const pending = (async () => {
    let image;
    try {
      const news = await getNews();
      const item = news.items.find(item => item.id === id);
      if (item?.image && allowedImageUrl(item.image)) image = item.image;
      if (!image) {
        const { getArticle } = await import('./articles.mjs');
        let timer;
        const article = await Promise.race([
          getArticle(id, { url: item?.url || url }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Article timeout')), 6000); }),
        ]).finally(() => clearTimeout(timer));
        image = article.image || article.cover || article.images?.[0];
      }
      if (image) return remember(key, await downloadPhoto(image));
    } catch { /* Publisher failures fall back to a clearly labelled category photo. */ }
    return remember(key, await localPhoto(selected));
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
