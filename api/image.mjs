import { validateArticleRequest } from '../server/articles.mjs';
import { getNewsImage } from '../server/images.mjs';

const categories = new Set(['hot', 'tech', 'world', 'life', 'culture', 'business', 'nba']);

export default async function handler(req, res) {
  const sendError = (status, message) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: message }));
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendError(405, '请求方式不支持');
  }
  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const id = params.get('id');
    const url = params.has('url') ? params.get('url') : undefined;
    const category = params.get('category') || 'hot';
    validateArticleRequest(id, url);
    if (!categories.has(category)) return sendError(400, '未知栏目');
    const image = await getNewsImage(id, { url, category });
    res.statusCode = 200;
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', String(image.body.length));
    res.setHeader('X-Image-Kind', image.kind);
    res.setHeader('Cache-Control', image.kind === 'article' ? 'public, max-age=3600' : 'public, max-age=30');
    return res.end(req.method === 'HEAD' ? undefined : image.body);
  } catch (error) {
    return sendError(error.statusCode === 400 ? 400 : 503,
      error.statusCode === 400 ? '新闻编号或来源地址无效。' : '图片暂时没有送达，请稍后重试。');
  }
}
