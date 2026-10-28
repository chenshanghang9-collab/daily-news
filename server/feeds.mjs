import { createHash } from 'node:crypto';
import { DOMParser } from 'linkedom';

/** Public publisher feeds. No API keys, scraping service, or generated stories. */
const FEEDS = [
  { id: 'mrkl-badges', name: '麦瑞科林', url: 'https://www.mrkl.com.cn/dynamic/', category: 'badges', format: 'mrkl-list' },
  { id: 'cnxw-badges', name: '苍南新闻网', url: 'https://www.cnxw.com.cn/cnxw/xzbm/index.shtml', category: 'badges', format: 'cnxw-list' },
  { id: 'hangzhou-badges', name: '潮新闻（杭州网转载）', url: 'https://hznews.hangzhou.com.cn/jingji/content/2023-09/25/content_8622596.htm', category: 'badges', format: 'domestic-selection' },
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

// Source selections independently verified from saved publisher HTML on 2026-10-28.
// Old publication dates are retained; technical references are never labelled breaking news.
const DOMESTIC_BADGE_SELECTIONS = [
  {
    "title": "从接单代工到自创网红文创IP 金乡徽章厂全新转型精彩蝶变",
    "url": "https://www.cnxw.com.cn/system/2026/09/28/015595326.shtml",
    "source": "苍南新闻网",
    "summary": "报道徽章厂从代工转向原创设计，介绍设计、研发、打样和生产协作及个性化打印探索。",
    "image": null,
    "publishedAt": "2026-09-28T00:00:00+08:00",
    "contentType": "industry_news",
    "originalLanguage": "zh",
    "sourceNote": "页面发布日期为2026年9月28日，正文消息日期为2026年9月22日，均按来源保留。"
  },
  {
    "title": "从北京到杭州：时隔33年，为什么亚运会徽章还是浙江这家乡镇企业造？",
    "url": "https://hznews.hangzhou.com.cn/jingji/content/2023-09/25/content_8622596.htm",
    "source": "潮新闻（杭州网转载）",
    "summary": "报道金乡徽章厂生产亚运徽章的历史、材料和工艺，采访介绍冲压、成型、电镀和点漆等环节的变化。",
    "image": "https://hznews.hangzhou.com.cn/jingji/content/2023-09/25/426b8879-82a5-48f5-b3ee-f79b719af387.jpg",
    "publishedAt": "2023-09-25T00:00:00+08:00",
    "contentType": "industry_news",
    "originalLanguage": "zh",
    "sourceNote": "国内历史行业报道，保留2023年9月25日的页面发布日期。"
  },
  {
    "title": "Fagoo P360e证卡打印机清洁方法",
    "url": "https://www.mrkl.com.cn/news/818.html",
    "source": "证卡打印机之家（麦瑞科林转载）",
    "summary": "介绍指定型号进入清洁模式、移除卡片与色带、插入清洁卡和清洁滚轴的步骤。",
    "image": "https://www.mrkl.com.cn/uploads/allimg/20240415/1-240415162JNR.jpg",
    "publishedAt": "2024-04-15T00:00:00+08:00",
    "contentType": "technique",
    "originalLanguage": "zh",
    "sourceNote": "国内中文来源，保留原始发布日期；技术资料请以设备说明书为准。"
  },
  {
    "title": "证卡打印机如何选择清洁卡",
    "url": "https://www.mrkl.com.cn/news/817.html",
    "source": "麦瑞科林",
    "summary": "讨论证卡打印机清洁卡的型号兼容性、清洁卡类型、尺寸、包装及价格。",
    "image": "https://www.mrkl.com.cn/uploads/allimg/20240412/1-2404121G41T04.jpg",
    "publishedAt": "2024-04-12T00:00:00+08:00",
    "contentType": "technique",
    "originalLanguage": "zh",
    "sourceNote": "国内中文来源，保留原始发布日期；技术资料请以设备说明书为准。"
  },
  {
    "title": "Datacard证卡打印机常见故障及解决方法",
    "url": "https://www.mrkl.com.cn/news/840.html",
    "source": "办公设备故障查询解疑（麦瑞科林转载）",
    "summary": "整理证卡打印机色带消耗及其他常见故障排查方法；需针对实际型号核对。",
    "image": "https://www.mrkl.com.cn/uploads/allimg/20240617/1-24061G55521202.jpg",
    "publishedAt": "2024-06-17T00:00:00+08:00",
    "contentType": "technique",
    "originalLanguage": "zh",
    "sourceNote": "国内中文来源，保留原始发布日期；技术资料请以设备说明书为准。"
  }
];
function domesticSelections(feed) {
  return DOMESTIC_BADGE_SELECTIONS
    .filter(item => new URL(item.url).hostname === new URL(feed.url).hostname)
    .map(item => ({ ...item, id: createHash('sha256').update(item.url).digest('hex').slice(0, 16),
      sourceId: feed.id, category: 'badges', selection: 'curated' }));
}

// A date-only source is represented at midnight in China, never at fetch time.
// Reject impossible calendar dates instead of accepting Date.parse rollover.
function chinaDate(value) {
  const normalized = value.replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$1-$2-$3');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${normalized}T00:00:00+08:00`;
}

function domesticListItem(feed, title, url, publishedAt) {
  const verified = DOMESTIC_BADGE_SELECTIONS.find(item => item.url === url);
  return {
    ...verified, title, url, publishedAt,
    id: createHash('sha256').update(url).digest('hex').slice(0, 16),
    source: verified?.source || feed.name, summary: verified?.summary || '',
    sourceId: feed.id, category: 'badges', originalLanguage: 'zh',
    contentType: feed.id === 'mrkl-badges' && /清洁|故障|方法|如何|维护|技术/.test(title)
      ? 'technique' : 'industry_news',
  };
}

function domesticListUrl(value, feed, pathPattern) {
  const url = httpUrl(value || '', feed.url);
  if (!url) return null;
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && parsed.hostname === new URL(feed.url).hostname
    && !parsed.username && !parsed.password && !parsed.port && !parsed.search
    && pathPattern.test(parsed.pathname) ? url : null;
}

export function parseMrklList(html, feed = FEEDS.find(source => source.id === 'mrkl-badges')) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const items = [], seen = new Set();
  for (const card of document.querySelectorAll('.info')) {
    const anchor = card.querySelector('a.title');
    const title = plainText(anchor?.textContent);
    const url = domesticListUrl(anchor?.getAttribute('href'), feed, /^\/news\/\d+\.html$/);
    if (!url || seen.has(url) || !/证卡|制卡|人像卡|工牌|校牌|胸牌|徽章/.test(title)) continue;
    seen.add(url);
    const publishedAt = chinaDate(plainText(card.querySelector('.time')?.textContent));
    items.push(domesticListItem(feed, title, url, publishedAt));
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  if (!items.length) throw new Error('国内来源暂未提供可读取的证卡文章');
  return items;
}

export function parseCnxwList(html, feed = FEEDS.find(source => source.id === 'cnxw-badges')) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const items = [], seen = new Set();
  for (const row of document.querySelectorAll('.list_e > ul > li')) {
    const anchor = row.querySelector('a[href]');
    const title = plainText(anchor?.textContent);
    const url = domesticListUrl(anchor?.getAttribute('href'), feed, /^\/system\/\d{4}\/\d{2}\/\d{2}\/\d+\.shtml$/);
    if (!url || seen.has(url) || !/工牌|校牌|胸牌|证卡|制卡|徽章/.test(title)) continue;
    seen.add(url);
    const publishedAt = chinaDate(plainText(row.querySelector('em')?.textContent));
    items.push(domesticListItem(feed, title, url, publishedAt));
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  if (!items.length) throw new Error('国内来源暂未提供徽章文章');
  return items;
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
  if (feed.format === 'domestic-selection') {
    sourceCache.set(feed.id, { items: domesticSelections(feed), fetchedAt: new Date().toISOString(), error: null, selection: 'curated' });
    return true;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      ...(feed.category === 'badges' ? { redirect: 'error' } : {}),
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
    const charset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
      || buffer.subarray(0, 1500).toString().match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
      || 'utf-8';
    const payload = new TextDecoder(charset).decode(buffer);
    const items = feed.format === 'cctv-nba' ? parseCctvNbaFeed(payload, feed)
      : feed.format === 'mrkl-list' ? parseMrklList(payload, feed)
      : feed.format === 'cnxw-list' ? parseCnxwList(payload, feed) : parseFeed(payload, feed);
    sourceCache.set(feed.id, { items, fetchedAt: new Date().toISOString(), error: null });
    return true;
  } catch (error) {
    const previous = sourceCache.get(feed.id);
    const useCurated = ['mrkl-list','cnxw-list'].includes(feed.format) && (!previous?.items.length || previous.selection === 'curated' || Date.now() - Date.parse(previous.fetchedAt) > MAX_STALE_MS);
    sourceCache.set(feed.id, {
      items: useCurated ? domesticSelections(feed) : previous?.items ?? [],
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
 * Aggregate verified public publisher feeds and domestic card/badge sources.
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
      ...(cached?.selection === 'curated' ? { selection: 'curated', note: '展示 2026-10-28 已核实的国内中文资料选读，保留原发布日期；技术资料不作为最新新闻。' } : {}),
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
