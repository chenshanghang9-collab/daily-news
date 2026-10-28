import { createHash } from 'node:crypto';
import { DOMParser } from 'linkedom';

/** Public publisher feeds. No API keys, scraping service, or generated stories. */
const FEEDS = [
  // Evolis disables its public RSS endpoint. Read the publisher's actual blog
  // listing instead, keeping source dates unknown unless verified in detail.
  { id: 'evolis-badges', name: 'Evolis 官方', url: 'https://www.evolis.com/blog/', category: 'badges', format: 'evolis-blog' },
  { id: 'chinanews-hot', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/scroll-news.xml', category: 'hot' },
  { id: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', category: 'tech' },
  { id: 'chinanews-world', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/world.xml', category: 'world' },
  { id: 'chinanews-business', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/finance.xml', category: 'business' },
  { id: 'chinanews-culture', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/culture.xml', category: 'culture' },
  { id: 'chinanews-life', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/life.xml', category: 'life' },
  { id: 'chinanews-society', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/society.xml', category: 'life' },
  // This public JSONP endpoint powers CCTV's own NBA page. Parse its JSON only;
  // never execute the callback supplied by the publisher.
  { id: 'cctv-nba', name: '央视网', url: 'https://sports.cctv.com/2019/07/gaiban/cmsdatainterface/page/nba_remen_1.jsonp', category: 'nba', format: 'cctv-nba' },
];

// Verified against official detail metadata on 2026-10-28. These are source
// selections for an outage, with original dates; they are never new live news.
const VERIFIED_BADGE_ARTICLES = [
  {"slug": "evolis-reaches-the-historic-one-million-printer-milestone", "title": "Evolis Reaches the Historic One-Million-Printer Milestone", "titleZh": "Evolis 证卡打印机累计产量突破一百万台", "publishedAt": "2026-10-13T07:25:30.000Z", "summary": "Evolis 宣布其法国 Beaucouzé 工厂累计生产的证卡打印机超过一百万台。厂商介绍其设备覆盖学生卡、工作证、医疗识别卡和活动证件等场景，并披露了生产、研发及合作伙伴网络情况。"},
  {"slug": "evolis-dna-one-family-comprehensive-solutions-for-your-printing-projects", "title": "The Evolis DNA, One Family, Comprehensive Solutions for Your Printing Projects", "titleZh": "Evolis 产品线：为不同制卡需求选择打印方案", "publishedAt": "2026-04-23T08:04:50.000Z", "summary": "Evolis 介绍证卡打印机产品线：Zenius 2 面向简单小批量作业，Primacy 2 面向更高打印量，Agilia 使用再转印技术，面向高画质和要求较高的应用。文章也提到耗材及制卡软件。"},
  {"slug": "zenius-2-evolis-announces-the-arrival-of-the-little-genius-of-the-family", "title": "Zenius 2: Evolis announces the arrival of the “little genius of the family”", "titleZh": "Evolis 发布 Zenius 2 证卡打印机", "publishedAt": "2025-09-09T07:00:26.000Z", "summary": "Evolis 发布 Zenius 2 证卡打印机，介绍其彩色及单色打印速度、可擦写卡支持、收卡容量和打印后数字数据擦除功能。厂商将其定位为面向基础制卡需求的紧凑型设备。"},
];
// Chinese introductions are editorial summaries of these six verified sources;
// article bodies and source titles remain in their original language.
const VERIFIED_BADGE_DETAILS = new Map([
  ...VERIFIED_BADGE_ARTICLES.map(item => [`https://www.evolis.com/blog/${item.slug}/`, { publishedAt: item.publishedAt, titleZh: item.titleZh, summaryZh: item.summary }]),
  ["https://www.evolis.com/blog/we-tested-id-all-for-you-the-new-id-card-creation-software/", {"publishedAt": "2025-06-11T09:47:10.000Z", "titleZh": "ID-ALL 制卡软件实测：版式、数据与批量打印", "summaryZh": "Evolis 评测 CARDPRESSO 的 ID-ALL 制卡软件，介绍证卡版式、动态字段、图片处理、数据库连接、批量及条件打印等功能，并对不同版本的适用场景作出说明。文章测试使用 Expert 版本。"}],
  ["https://www.evolis.com/blog/everything-need-to-know-about-direct-to-card-printing-technology/", {"publishedAt": "2025-04-23T07:38:00.000Z", "titleZh": "直接证卡打印技术：原理、适用场景与限制", "summaryZh": "文章介绍直接证卡打印的基本过程、工牌和学生卡等用途，并比较其与再转印在边缘留白、卡片表面、耐磨性和成本上的差异，适合为制卡订单选择打印工艺时参考。"}],
  ["https://www.evolis.com/blog/what-is-a-retransfer-card-printer/", {"publishedAt": "2025-01-31T14:14:24.000Z", "titleZh": "再转印制卡技术：流程、优势与成本取舍", "summaryZh": "Evolis 解释再转印先将图案打印在透明膜上，再通过热压转移到卡片的流程，并介绍其满版、材料适应性、耐用性与设备和耗材成本之间的取舍。"}],
]);
function curatedBadges(feed) {
  return VERIFIED_BADGE_ARTICLES.map(({ slug, ...item }) => {
    const url = `https://www.evolis.com/blog/${slug}/`;
    return { ...item, summaryZh: item.summary, originalTitle: item.title, originalLanguage: 'en', url, id: createHash('sha256').update(url).digest('hex').slice(0, 16),
      category: 'badges', source: feed.name, sourceId: feed.id, selection: 'curated' };
  });
}

const CATEGORIES = ['hot', 'tech', 'world', 'life', 'culture', 'business', 'nba', 'badges'];
const CACHE_TTL_MS = 7 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_FEED_BYTES = 2_000_000;
const MAX_ITEMS_PER_FEED = 60;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;

// Cache each source independently, so one unavailable publisher does not erase
// good results from the other publishers or its own previous successful fetch.
const sourceCache = new Map();
let lastAttemptAt = 0;
let lastFetchedAt = null;
let inFlight = null;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…',
  mdash: '—', ndash: '–', middot: '·', copy: '©', bull: '•',
};

function decodeEntities(value = '') {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#')) {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : '';
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function unwrapCdata(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function plainText(value = '') {
  return decodeEntities(unwrapCdata(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();
}

// Deliberately limited to the RSS 2.0 item elements used by the verified feeds.
// We never evaluate XML, expand DTDs, or request external entities.
function tagValue(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i'))?.[1] ?? '';
}

function httpUrl(value, base) {
  try {
    const url = new URL(decodeEntities(unwrapCdata(value)).trim(), base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return null;
  }
}

function categoryForUrl(url, fallback) {
  if (fallback !== 'hot') return fallback;
  const section = new URL(url).pathname.split('/')[1];
  if (['gj', 'world', 'hr'].includes(section)) return 'world';
  if (['cj', 'stock', 'fortune', 'auto', 'house'].includes(section)) return 'business';
  if (['cul', 'culture', 'yl', 'shuhu', 'wenhua'].includes(section)) return 'culture';
  if (['it', 'business-tech', 'ny'].includes(section)) return 'tech';
  if (['sh', 'jk', 'life', 'travel', 'ty', 'edu', 'health', 'm'].includes(section)) return 'life';
  return 'hot';
}

function isNbaContent(value) {
  return /\bNBA\b|美职篮|美国职业篮球/i.test(value);
}

/** Only text articles from CCTV's NBA stream, excluding video/gallery entries. */
export function parseCctvNbaFeed(payload, feed = FEEDS.find((source) => source.id === 'cctv-nba')) {
  const wrapper = payload.trim().match(/^nba_remen\(\s*([\s\S]*)\s*\);?$/);
  if (!wrapper) throw new Error('NBA 来源未返回支持的公开数据');
  const data = JSON.parse(wrapper[1]);
  if (!Array.isArray(data?.data?.list)) throw new Error('NBA 来源缺少新闻列表');
  const items = [];
  for (const entry of data.data.list) {
    const title = plainText(entry.title);
    const fullSummary = plainText(entry.brief);
    const url = httpUrl(entry.url, feed.url);
    if (!title || !url || !String(entry.id ?? '').startsWith('ARTI')) continue;
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== 'sports.cctv.com' || !/^\/\d{4}\/\d{2}\/\d{2}\/ARTI[^/]+\.shtml$/.test(parsedUrl.pathname)) continue;
    if (!isNbaContent(`${title} ${fullSummary} ${plainText(entry.keywords)}`)) continue;
    // CCTV publishes local China time without a timezone. Make it explicit so
    // server location cannot change the displayed publication instant.
    const localDate = typeof entry.focus_date === 'string' ? entry.focus_date.trim() : '';
    const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(localDate)
      ? Date.parse(`${localDate.replace(' ', 'T')}+08:00`) : Number.NaN;
    const publishedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    const summary = fullSummary.length > 180 ? `${fullSummary.slice(0, 177).trimEnd()}…` : fullSummary;
    const image = entry.image ? httpUrl(entry.image, url) : null;
    items.push({
      id: createHash('sha256').update(url).digest('hex').slice(0, 16),
      title, summary, url, source: feed.name, sourceId: feed.id,
      category: 'nba', publishedAt,
      ...(image ? { image } : {}),
    });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  if (!items.length) throw new Error('NBA 来源暂未提供可读取的文字新闻');
  return items;
}

function isBadgeArticleUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname === 'www.evolis.com'
      && /^\/blog\/(?!category(?:\/|$)|tag(?:\/|$)|page(?:\/|$)|feed(?:\/|$))[a-z\d_%.-]+\/?$/i.test(url.pathname);
  } catch { return false; }
}

function isBadgeContent(title, summary, categories) {
  // A vendor feed also contains corporate/CSR and recruitment announcements.
  // Their product keywords do not make those useful industry articles.
  if (/\b(?:csr|charit\w*|philanthrop\w*|recruit\w*|hiring|careers?|vacanc\w*|financial results|earnings|volunteer\w*)\b|招聘|公益|慈善|社会责任/i.test(title)) return false;
  return /\b(?:cards?|badges?|ribbons?|laminat\w*|retransfer|sublimation|printers?|printing|personalization|personalisation|identification)\b|证卡|制卡|工牌|校牌|徽章|卡片|色带|热转印|打印头|胸牌/i.test(`${title} ${summary} ${categories}`);
}

/** Parse the exact article-card structure of the verified official blog listing. */
export function parseEvolisBlog(html, feed = FEEDS.find(source => source.id === 'evolis-badges')) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const items = [];
  const seen = new Set();
  for (const card of document.querySelectorAll('a.tease-wrapper')) {
    const title = plainText(card.querySelector('h2.tease__title')?.textContent);
    const fullSummary = plainText(card.querySelector('p.tease__excerpt')?.textContent);
    const categories = plainText(card.querySelector('.tease__category')?.textContent);
    const url = httpUrl(card.getAttribute('href'), feed.url);
    if (!title || !url || seen.has(url) || !isBadgeArticleUrl(url) || !isBadgeContent(title, fullSummary, categories)) continue;
    seen.add(url);
    const verified = VERIFIED_BADGE_DETAILS.get(url);
    const rawDate = card.querySelector('time[datetime]')?.getAttribute('datetime');
    const timestamp = rawDate ? Date.parse(rawDate) : NaN;
    const publishedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : verified?.publishedAt || null;
    const imageNode = card.querySelector('img');
    const rawImage = imageNode?.getAttribute('data-lazy-src') || imageNode?.getAttribute('data-src') || imageNode?.getAttribute('src');
    const image = rawImage ? httpUrl(rawImage, url) : null;
    const summary = fullSummary.length > 180 ? `${fullSummary.slice(0, 177).trimEnd()}…` : fullSummary;
    items.push({ id: createHash('sha256').update(url).digest('hex').slice(0, 16), title, summary, url,
      source: feed.name, sourceId: feed.id, category: 'badges', publishedAt, originalTitle: title, originalLanguage: 'en',
      ...(verified ? { titleZh: verified.titleZh, summaryZh: verified.summaryZh } : {}), ...(image ? { image } : {}) });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  if (!items.length) throw new Error('官方博客暂未提供可读取的证卡行业文章');
  return items;
}

function parseFeed(xml, feed) {
  if (!/<rss\b/i.test(xml) || /<!DOCTYPE/i.test(xml)) {
    throw new Error('来源未返回支持的 RSS 内容');
  }
  const items = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi)) {
    const item = match[1];
    const title = plainText(tagValue(item, 'title'));
    const link = tagValue(item, 'link') || tagValue(item, 'guid');
    const url = httpUrl(link, feed.url);
    // Missing/invalid publication times remain null; fetch time is never used
    // as a substitute for an article's publication time.
    const rawDate = plainText(tagValue(item, 'pubDate') || tagValue(item, 'dc:date'));
    const timestamp = rawDate ? Date.parse(rawDate) : Number.NaN;
    const publishedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    if (!title || !url || !link.trim()) continue;

    const description = tagValue(item, 'description') || tagValue(item, 'content:encoded');
    const fullSummary = plainText(description);
    const summary = fullSummary.length > 180 ? `${fullSummary.slice(0, 177).trimEnd()}…` : fullSummary;
    const html = decodeEntities(unwrapCdata(description));
    const imageMatch = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
      || item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl\s*=\s*["']([^"']+)["']/i);
    const image = imageMatch ? httpUrl(imageMatch[1], url) : null;
    items.push({
      id: createHash('sha256').update(url).digest('hex').slice(0, 16),
      title, summary, url, source: feed.name, sourceId: feed.id,
      category: new URL(url).pathname.startsWith('/ty/') && isNbaContent(`${title} ${fullSummary}`)
        ? 'nba' : categoryForUrl(url, feed.category), publishedAt,
      ...(image ? { image } : {}),
    });
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  if (!items.length) throw new Error('来源暂未提供可读取的新闻条目');
  return items;
}

async function fetchSource(feed) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html, application/rss+xml, application/xml, application/json, text/javascript, text/xml;q=0.9',
        'user-agent': 'DailyBrief/1.0 (Public RSS reader)',
      },
    });
    if (!response.ok) throw new Error(`来源响应 HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_FEED_BYTES) {
      throw new Error('来源内容超过读取上限');
    }
    // Enforce the cap while reading, including chunked responses.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('来源响应为空');
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_FEED_BYTES) {
        await reader.cancel();
        throw new Error('来源内容超过读取上限');
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    const payload = buffer.toString('utf8');
    const items = feed.format === 'cctv-nba' ? parseCctvNbaFeed(payload, feed)
      : feed.format === 'evolis-blog' ? parseEvolisBlog(payload, feed) : parseFeed(payload, feed);
    sourceCache.set(feed.id, { items, fetchedAt: new Date().toISOString(), error: null });
    return true;
  } catch (error) {
    const previous = sourceCache.get(feed.id);
    const useCurated = feed.format === 'evolis-blog' && (!previous?.items.length || previous.selection === 'curated' || Date.now() - Date.parse(previous.fetchedAt) > MAX_STALE_MS);
    sourceCache.set(feed.id, {
      items: useCurated ? curatedBadges(feed) : previous?.items ?? [],
      fetchedAt: useCurated ? new Date().toISOString() : previous?.fetchedAt ?? null,
      ...(useCurated ? { selection: 'curated' } : {}),
      error: error.name === 'AbortError' || controller.signal.aborted
        ? '来源连接超时' : error.message,
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function refresh() {
  lastAttemptAt = Date.now();
  const results = await Promise.all(FEEDS.map(fetchSource));
  if (results.some(Boolean)) lastFetchedAt = new Date().toISOString();
}

/**
 * Aggregate verified public publisher feeds and the official card-industry blog.
 *
 * category: hot | tech | world | life | culture | business | nba | badges (hot includes all).
 * force: refresh upstream feeds even inside the normal seven-minute cache TTL.
 * The function always returns a result, including on total upstream failure.
 * An absent publishedAt is intentional and must not be displayed as "just now".
 */
export async function getNews({ category = 'hot', force = false } = {}) {
  const selectedCategory = CATEGORIES.includes(category) ? category : 'hot';
  if (inFlight) {
    await inFlight;
  } else if (force || !lastAttemptAt || Date.now() - lastAttemptAt >= CACHE_TTL_MS) {
    inFlight = refresh().finally(() => { inFlight = null; });
    await inFlight;
  }

  const now = Date.now();
  const sources = FEEDS.map((feed) => {
    const cached = sourceCache.get(feed.id);
    const usable = cached?.fetchedAt && now - Date.parse(cached.fetchedAt) <= MAX_STALE_MS;
    return {
      ...feed,
      status: !usable ? 'error' : cached.error ? 'stale' : 'ok',
      itemCount: usable ? cached.items.length : 0,
      fetchedAt: cached?.fetchedAt ?? null,
      ...(cached?.error ? { error: cached.error } : {}),
      ...(cached?.selection === 'curated' ? { selection: 'curated', note: '来源暂不可用，展示 2026-10-28 已核实的官方文章选读，保留原发布日期。' } : {}),
    };
  });

  const unique = new Map();
  for (const source of sources) {
    if (source.status === 'error') continue;
    for (const item of sourceCache.get(source.id).items) {
      const previous = unique.get(item.url);
      // Prefer the dedicated category feed when it overlaps the general feed.
      if (!previous || (previous.sourceId === 'chinanews-hot' && item.sourceId !== 'chinanews-hot')) {
        unique.set(item.url, item);
      }
    }
  }
  const allItems = [...unique.values()].sort((a, b) =>
    (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  const items = selectedCategory === 'hot'
    ? allItems
    : allItems.filter((item) => item.category === selectedCategory);
  const degraded = sources.some((source) => source.status !== 'ok');

  return {
    items,
    fetchedAt: lastFetchedAt,
    lastAttemptAt: lastAttemptAt ? new Date(lastAttemptAt).toISOString() : null,
    stale: degraded,
    status: !allItems.length ? 'unavailable' : degraded ? 'partial' : 'ok',
    sources,
    category: selectedCategory,
    total: items.length,
    availableCategories: CATEGORIES,
    cacheTtlSeconds: CACHE_TTL_MS / 1000,
    nextRefreshAt: lastAttemptAt ? new Date(lastAttemptAt + CACHE_TTL_MS).toISOString() : null,
  };
}
