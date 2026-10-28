import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { DOMParser } from 'linkedom';
import { getNews } from './feeds.mjs';

const PUBLISHERS = new Map([
  ['www.chinanews.com.cn', 'chinanews'], ['chinanews.com.cn', 'chinanews'],
  ['www.ithome.com', 'ithome'], ['ithome.com', 'ithome'],
  ['sports.cctv.com', 'cctv'],
  ['www.evolis.com', 'evolis'],
  ['www.mrkl.com.cn', 'mrkl'], ['www.cnxw.com.cn', 'cnxw'], ['hznews.hangzhou.com.cn', 'hangzhou'],
]);
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 9_000;
const MAX_CACHE_ITEMS = 240;
const MAX_IN_FLIGHT = 24;
const cache = new Map();
const inFlight = new Map();
const text = value => String(value ?? '').replace(/[\s\u3000]+/g, ' ').trim();
const hashUrl = url => createHash('sha256').update(url).digest('hex').slice(0, 16);

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function articleUrl(value, expectedPublisher) {
  let parsed;
  try { parsed = new URL(value); } catch { throw badRequest('新闻地址无效'); }
  const publisher = PUBLISHERS.get(parsed.hostname);
  if (!['http:', 'https:'].includes(parsed.protocol) || !publisher || parsed.username || parsed.password || parsed.port || parsed.hash) {
    throw badRequest('仅支持已接入新闻来源的公开文章地址');
  }
  if (expectedPublisher && publisher !== expectedPublisher) throw badRequest('来源跳转至其他网站');
  if (['cnxw', 'mrkl', 'hangzhou'].includes(publisher) && (parsed.protocol !== 'https:' || parsed.search)) throw badRequest('国内来源地址无效');
  const validPath = publisher === 'cnxw' ? /^\/system\/\d{4}\/\d{2}\/\d{2}\/\d+\.shtml$/.test(parsed.pathname) : publisher === 'mrkl' ? /^\/news\/\d+\.html$/.test(parsed.pathname)
    : publisher === 'hangzhou' ? /^\/jingji\/content\/\d{4}-\d{2}\/\d{2}\/content_\d+\.htm$/.test(parsed.pathname)
    : publisher === 'evolis'
    ? parsed.protocol === 'https:' && /^\/blog\/(?!category(?:\/|$)|tag(?:\/|$)|page(?:\/|$)|feed(?:\/|$))[a-z\d_%.-]+\/?$/i.test(parsed.pathname)
    : publisher === 'ithome'
    ? /^\/\d+\/\d{3}\/\d{3}\.htm$/.test(parsed.pathname)
    : publisher === 'cctv'
      ? /^\/\d{4}\/\d{2}\/\d{2}\/ARTI[a-z\d]{15,64}\.shtml$/i.test(parsed.pathname)
      : /^\/[a-z\d-]+\/\d{4}\/\d{2}-\d{2}\/\d+\.s?html$/i.test(parsed.pathname);
  if (!validPath) throw badRequest('该地址不是支持的新闻文章');
  return parsed;
}

function imageUrl(value, base) {
  if (!value) return null;
  try {
    const parsed = new URL(value, base);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) return null;
    const publisher = PUBLISHERS.get(new URL(base).hostname);
    const allowed = publisher === 'cnxw' ? false : publisher === 'mrkl' ? parsed.protocol === 'https:' && parsed.hostname === 'www.mrkl.com.cn' && /^\/uploads\/allimg\/\d{8}\/[^/]+\.(?:jpe?g|png)$/i.test(parsed.pathname)
      : publisher === 'hangzhou' ? parsed.protocol === 'https:' && parsed.hostname === 'hznews.hangzhou.com.cn' && /^\/jingji\/content\/\d{4}-\d{2}\/\d{2}\/[^/]+\.(?:jpe?g|png)$/i.test(parsed.pathname)
      : publisher === 'evolis'
      ? parsed.protocol === 'https:' && ['www.evolis.com', 'fr.evolis.com'].includes(parsed.hostname) && /^\/wp-content\/uploads\//.test(parsed.pathname)
      : publisher === 'ithome'
      ? parsed.hostname === 'img.ithome.com'
      : publisher === 'cctv'
        ? /^p[1-5]\.img\.cctvpic\.com$/.test(parsed.hostname)
        : /^(?:i\d*|image\d*|www)\.chinanews\.com\.cn$/.test(parsed.hostname);
    if (!allowed || /(?:^|\/)(?:ads?|advert|banners?|icons?|logos?|tracking|qrcode)(?:[\/_\-.]|$)/i.test(parsed.pathname)
      || /\/(?:t|blank|loading|spacer|pixel)\.(?:png|gif|jpe?g)$/i.test(parsed.pathname)
      || !/\.(?:jpe?g|png|webp|gif|avif)(?:$|[!_])/i.test(parsed.pathname)) return null;
    parsed.hash = '';
    return parsed.href;
  } catch { return null; }
}

function summaryArticle(item, reason) {
  const cover = imageUrl(item.image, item.url);
  return {
    ...item, title: item.title || '来源文章', summary: item.summary || '',
    blocks: item.summary ? [{ type: 'paragraph', text: item.summary }] : [],
    images: cover ? [cover] : [], cover, image: cover || undefined,
    byline: null, status: 'summary', reason,
  };
}

function publishedTime(document) {
  const value = text(document.querySelector('#pubtime_baidu, time[datetime]')?.getAttribute('datetime')
    || document.querySelector('#pubtime_baidu')?.textContent
    || document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
    || document.querySelector('.title_area .info')?.textContent
    || document.querySelector('.newscontent-date .te')?.textContent
    || document.querySelector('.pub_date')?.textContent?.replace(/.*?(\d{4})年(\d{2})月(\d{2})日.*/, '$1-$2-$3')
    || document.querySelector('meta[name="publishdate"]')?.getAttribute('content'));
  const local = value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : local ? `${local[1]}-${local[2].padStart(2, '0')}-${local[3].padStart(2, '0')}T${local[4]}+08:00` : value;
  const time = normalized ? Date.parse(normalized) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Parse verified publisher markup into text/image data. No source HTML is returned. */
export function parseArticleHtml(html, item) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const title = text(document.querySelector('#artibodytitle, h1.title, h1, .tit .hzwRP_lname05')?.textContent
    || document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || document.title?.replace(/\s*[-_—]\s*(?:IT之家|中新网|中国新闻网)\s*$/, ''));
  const metadata = {
    ...item, title: item.title || title || '来源文章',
    summary: item.summary || text(document.querySelector('meta[name="description"]')?.getAttribute('content')).slice(0, 300),
    publishedAt: item.publishedAt || publishedTime(document),
  };
  const publisher = PUBLISHERS.get(new URL(item.url).hostname);
  const root = publisher === 'cnxw' ? document.querySelector('#ftcg') : publisher === 'mrkl' ? document.querySelector('.newscontent-details article')
    : publisher === 'hangzhou' ? document.querySelector('.zhengwen')
    : publisher === 'evolis'
    ? document.querySelector('article .single-post__content')
      || document.querySelector('article .entry-content, article .post-content, article .content, .entry-content')
      || document.querySelector('article')
    : document.querySelector(publisher === 'ithome'
      ? '#paragraph.post_content, #paragraph, .post_content'
      : publisher === 'cctv' ? '#content_area' : '.left_zw, #content_area .content, #content_area, .content_area');
  if (!root) return summaryArticle(metadata, '来源页面暂未提供可读取的正文，当前展示来源摘要。');
  if (publisher === 'evolis') {
    for (const node of root.querySelectorAll('h1, .single-post__category, .single-post__date, .social-sharing-links, .wp-block-buttons')) node.remove();
  }
  const byline = text(document.querySelector('#author_baidu, [itemprop="author"]')?.textContent).replace(/^作者[：:]\s*/, '') || null;
  for (const node of root.querySelectorAll('script, style, noscript, iframe, form, button, nav, footer, svg, .adInContent, .adEditor, .left_name, .advertisement, .related_post, .shareto, #function_code_page, [hidden], [aria-hidden="true"]')) node.remove();
  for (const node of root.querySelectorAll('[style]')) {
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.getAttribute('style'))) node.remove();
  }
  const blocks = [];
  const seenImages = new Set();
  const captionNodes = new Set();
  const budget = { characters: 0, stopped: false };
  function addText(value, type = 'paragraph') {
    const normalized = text(value);
    if (!normalized || budget.stopped || blocks.length >= 240) return;
    if (/^(?:相关阅读|相关推荐|广告声明|责任编辑|【编辑[:：])/.test(normalized)) {
      if (/^相关阅读|^相关推荐/.test(normalized)) budget.stopped = true;
      return;
    }
    if (budget.characters + normalized.length > 80_000) { budget.stopped = true; return; }
    budget.characters += normalized.length;
    blocks.push({ type, text: normalized });
  }
  function addImage(node) {
    if (seenImages.size >= 40 || budget.stopped) return;
    const width = Number(node.getAttribute('w') || node.getAttribute('width'));
    const height = Number(node.getAttribute('h') || node.getAttribute('height'));
    if ((width > 0 && width < 80) || (height > 0 && height < 60)) return;
    const src = imageUrl(node.getAttribute('data-original') || node.getAttribute('data-lazy-src') || node.getAttribute('data-src') || node.getAttribute('src'), item.url);
    if (!src || seenImages.has(src)) return;
    const figure = node.closest('figure');
    const container = node.closest('p, figure') || node.parentElement;
    const next = container?.nextElementSibling;
    const captionNode = figure?.querySelector('figcaption')
      || (next?.matches('.pictext, .img_desc, .image-caption, figcaption, [class^="photoAlbum_title_"]') ? next : null);
    const caption = text(captionNode?.textContent || node.getAttribute('alt')).slice(0, 600);
    if (captionNode) captionNodes.add(captionNode);
    seenImages.add(src);
    blocks.push({ type: 'image', src, ...(caption ? { caption } : {}) });
  }
  function walk(node) {
    if (budget.stopped || blocks.length >= 240 || captionNodes.has(node)) return;
    if (node.nodeType === 3) { addText(node.textContent); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') { addImage(node); return; }
    if (tag === 'figcaption' || node.matches('.pictext, .img_desc, .image-caption, [class^="photoAlbum_title_"]')) return;
    if (/^h[1-6]$/.test(tag)) { addText(node.textContent, 'heading'); return; }
    if (tag === 'ul' || tag === 'ol') {
      const items = [...node.children].filter(child => child.tagName === 'LI').map(child => text(child.textContent)).filter(Boolean);
      if (items.length) blocks.push({ type: 'list', items: items.slice(0, 60) });
      for (const image of node.querySelectorAll('img')) addImage(image);
      return;
    }
    if (tag === 'p' || tag === 'blockquote' || tag === 'pre' || tag === 'td') {
      // Split at inline images, preserving their place among surrounding text.
      let pending = '';
      function inline(child) {
        if (child.nodeType === 3) { pending += child.textContent; return; }
        if (child.nodeType !== 1) return;
        if (child.tagName === 'IMG') { addText(pending); pending = ''; addImage(child); return; }
        if (child.tagName === 'BR') { addText(pending); pending = ''; return; }
        for (const descendant of child.childNodes) inline(descendant);
      }
      for (const child of node.childNodes) inline(child);
      addText(pending);
      return;
    }
    for (const child of node.childNodes) walk(child);
  }
  for (const child of root.childNodes) walk(child);
  if (budget.characters < 40 || !blocks.some(block => block.type === 'paragraph')) {
    return summaryArticle(metadata, '来源正文暂时无法完整读取，当前展示来源摘要。');
  }
  const images = [...seenImages];
  const feedImage = imageUrl(item.image, item.url);
  const cover = images[0] || feedImage || null;
  return { ...metadata, blocks, images, cover, image: cover || undefined, byline, status: 'full' };
}

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Permit global unicast only; exclude transition and documentation ranges.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:(?:0:|db8:)|^2002:|^3fff:/i.test(address);
}

async function pinnedAddress(hostname, signal) {
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('来源连接超时'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const addresses = await Promise.race([dns.lookup(hostname, { all: true, verbatim: true }), aborted]);
    if (!addresses.length || addresses.some(result => !publicAddress(result.address))) throw new Error('来源未解析到公开网络地址');
    return addresses[0];
  } finally { signal.removeEventListener('abort', onAbort); }
}

function requestPage(url, address, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      signal, agent: false, family: address.family, autoSelectFamily: false,
      // Pin the connection to the address already checked above, preventing
      // a second DNS resolution from reaching a private address.
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9', 'accept-encoding': 'identity', 'user-agent': 'DailyBrief/1.0 (Public news reader)' },
    }, response => {
      const status = response.statusCode;
      if ([301, 302, 303, 307, 308].includes(status)) {
        // Redirect bodies are unnecessary; close immediately instead of
        // draining an unbounded stream in the background.
        response.destroy();
        resolve({ location: response.headers.location });
        return;
      }
      if (status < 200 || status >= 300) { response.destroy(); reject(new Error(`来源响应 HTTP ${status}`)); return; }
      const type = String(response.headers['content-type'] || '');
      if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) { response.destroy(); reject(new Error('来源未返回新闻网页')); return; }
      if (Number(response.headers['content-length']) > MAX_BYTES) { response.destroy(); reject(new Error('来源正文超过读取上限')); return; }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy(); reject(new Error('来源返回了暂不支持的压缩格式')); return;
      }
      let length = 0;
      const chunks = [];
      response.on('data', chunk => {
        length += chunk.length;
        if (length > MAX_BYTES) { response.destroy(); reject(new Error('来源正文超过读取上限')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const charset = type.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
          || buffer.subarray(0, 1500).toString().match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
        try { resolve({ html: new TextDecoder(charset).decode(buffer) }); }
        catch { resolve({ html: buffer.toString('utf8') }); }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function fetchArticleHtml(initialUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let url = articleUrl(initialUrl);
  const publisher = PUBLISHERS.get(url.hostname);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const address = await pinnedAddress(url.hostname, controller.signal);
      const page = await requestPage(url, address, controller.signal);
      if (page.html !== undefined) return page.html;
      if (!page.location) throw new Error('来源跳转地址无效');
      url = articleUrl(new URL(page.location, url).href, publisher);
    }
    throw new Error('来源跳转次数超过上限');
  } finally { clearTimeout(timeout); }
}

function fallbackItem(id, url) {
  const publisher = PUBLISHERS.get(new URL(url).hostname);
  const section = new URL(url).pathname.split('/')[1];
  const category = ['cnxw', 'mrkl', 'hangzhou', 'evolis'].includes(publisher) ? 'badges' : publisher === 'cctv' ? 'nba' : publisher === 'ithome' ? 'tech'
    : ['cj', 'stock', 'auto', 'house'].includes(section) ? 'business'
      : ['gj', 'hr'].includes(section) ? 'world'
        : ['cul', 'yl', 'shuhu'].includes(section) ? 'culture'
          : ['ty', 'sh', 'jk', 'life', 'travel', 'edu', 'health'].includes(section) ? 'life' : 'hot';
  return { id, title: '', summary: '', url, source: publisher === 'cnxw' ? '苍南新闻网' : publisher === 'mrkl' ? '麦瑞科林' : publisher === 'hangzhou' ? '杭州网' : publisher === 'evolis' ? 'Evolis 官方' : publisher === 'cctv' ? '央视网' : publisher === 'ithome' ? 'IT之家' : '中国新闻网', sourceId: publisher, category, publishedAt: null };
}

/** Validate identity before either article or image endpoints do network work. */
export function validateArticleRequest(id, suppliedUrl) {
  if (typeof id !== 'string' || !/^[a-f\d]{16}$/.test(id)) throw badRequest('新闻编号无效');
  let verifiedUrl;
  if (suppliedUrl !== undefined) {
    if (typeof suppliedUrl !== 'string' || suppliedUrl.length > 2048) throw badRequest('新闻地址无效');
    verifiedUrl = articleUrl(suppliedUrl).href;
    if (hashUrl(verifiedUrl) !== id) throw badRequest('新闻编号与来源地址不匹配');
  }
  return verifiedUrl;
}

/** Resolve a feed ID, or an older same-publisher link with an exact URL hash. */
export async function getArticle(id, { url: suppliedUrl } = {}) {
  const verifiedUrl = validateArticleRequest(id, suppliedUrl);
  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(id); cache.set(id, cached);
    return cached.article;
  }
  if (cached) cache.delete(id);
  if (inFlight.has(id)) return inFlight.get(id);
  // Bound concurrent network work even when callers provide many valid-looking
  // deep links. A later request can retry after existing reads finish.
  if (inFlight.size >= MAX_IN_FLIGHT) throw Object.assign(new Error('新闻正在加载，请稍后重试'), { statusCode: 503 });
  const work = (async () => {
    const news = await getNews();
    const item = news.items.find(candidate => candidate.id === id)
      || (verifiedUrl ? fallbackItem(id, verifiedUrl) : null);
    if (!item) return null;
    articleUrl(item.url);
    let article;
    try { article = parseArticleHtml(await fetchArticleHtml(item.url), item); }
    catch (error) { article = summaryArticle(item, error.name === 'AbortError' ? '来源连接超时，当前展示来源摘要。' : text(error.message)); }
    cache.set(id, { article, expiresAt: Date.now() + (article.status === 'full' ? 30 * 60_000 : 60_000) });
    while (cache.size > MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value);
    return article;
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, work);
  return work;
}

export async function getArticleCover(id, options) {
  return (await getArticle(id, options))?.cover || null;
}
