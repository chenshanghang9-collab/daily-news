import { getArticle, validateArticleRequest } from '../server/articles.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => {
    res.statusCode = status;
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(405, { error: '请求方式不支持' });
  }
  try {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const id = params.get('id');
    const url = params.has('url') ? params.get('url') : undefined;
    validateArticleRequest(id, url);
    const article = await getArticle(id, { url });
    return article ? send(200, article) : send(404, { error: '这篇文章暂时无法找到，请从首页重新选择。' });
  } catch (error) {
    const status = error.statusCode === 400 ? 400 : 503;
    return send(status, { error: status === 400 ? '新闻编号或来源地址无效。' : '文章暂时没有送达，请稍后重试。' });
  }
}
