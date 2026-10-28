import { getNews } from '../server/feeds.mjs';

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
    const url = new URL(req.url, 'http://localhost');
    const category = url.searchParams.get('category') || 'hot';
    if (!['hot', 'tech', 'world', 'life', 'culture', 'business', 'nba', 'badges'].includes(category)) {
      return send(400, { error: '未知栏目' });
    }
    const data = await getNews({ category, force: url.searchParams.get('refresh') === '1' });
    return send(200, data);
  } catch {
    return send(503, { error: '内容暂时没有送达，请稍后重试。' });
  }
}
