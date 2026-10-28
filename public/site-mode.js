// Paths and routes shared by the live Node app and generated Pages snapshot.
export function createSiteMode({ mode = '', base = '/' } = {}) {
  const isStatic = mode === 'static';
  const basePath = '/' + String(base).split('/').filter(Boolean).join('/') + '/';
  const home = isStatic && basePath !== '//' ? basePath : '/';
  const asset = (path) => home + String(path).replace(/^\/+/, '');
  const articleId = (url) => {
    const id = isStatic ? (url.pathname === home || url.pathname === home + 'index.html' ? url.searchParams.get('article') : null) : /^\/article\/([a-f0-9]{16})\/?$/.exec(url.pathname)?.[1];
    return /^[a-f0-9]{16}$/.test(id || '') ? id : null;
  };
  const image = (value) => {
    if (typeof value !== 'string') return '';
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { /* Local snapshot image. */ }
    return isStatic && /^images\/[a-zA-Z0-9_./-]+$/.test(value) && !value.split('/').includes('..') ? asset(value) : '';
  };
  return { isStatic, home, asset, articleId, image,
    articleHref: (item) => isStatic ? `${home}?article=${encodeURIComponent(item.id)}` : `/article/${encodeURIComponent(item.id)}?url=${encodeURIComponent(item.url)}`,
    newsURL: (force) => isStatic ? asset('data/news.json') : `/api/news${force ? '?refresh=1' : ''}`,
    articleURL: (id, params) => isStatic ? asset(`data/articles/${id}.json`) : `/api/article?${params}`,
  };
}

// A 404 snapshot may have aged out of the publication while remaining bookmarked.
// Only actual saved blocks can restore body content; feed metadata supplies a summary.
export function savedArticleFallback(saved) {
  if (!saved || typeof saved.title !== 'string') return null;
  const hasBlocks = Array.isArray(saved.blocks) && saved.blocks.length > 0;
  return {
    ...saved,
    blocks: hasBlocks ? saved.blocks : saved.summary ? [{ type: 'paragraph', text: saved.summary }] : [],
    status: hasBlocks ? saved.status : 'summary',
    savedSnapshotNotice: hasBlocks
      ? '这篇文章已不在当前发布快照中。正在显示此浏览器收藏时保存的内容，未重新获取来源正文。'
      : '这篇文章已不在当前发布快照中。此浏览器仅保存了收藏信息与来源摘要，未保存完整正文。',
  };
}
