import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import newsHandler from '../api/news.mjs';
import articleHandler from '../api/article.mjs';
import imageHandler from '../api/image.mjs';

const root = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') { res.writeHead(200, { 'Content-Type': mime['.json'] }); return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, service: 'daily', time: new Date().toISOString() })); }
    if (url.pathname === '/api/news') return await newsHandler(req, res);
    if (url.pathname === '/api/article') return await articleHandler(req, res);
    if (url.pathname === '/api/image') return await imageHandler(req, res);
    const pathname = decodeURIComponent(url.pathname);
    const articlePath = /^\/article\/[a-f\d]{16}\/?$/.test(pathname);
    const target = path.resolve(root, '.' + (pathname === '/' || articlePath ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep) || pathname.includes('\0')) { res.writeHead(403); return res.end('Forbidden'); }
    if (!(await stat(target)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': path.extname(target) === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500;
    res.writeHead(status, { 'Content-Type': mime['.json'] });
    res.end(JSON.stringify({ error: status === 500 ? '内容暂时没有送达，请稍后重试。' : '页面不存在' }));
    if (status === 500) console.error(error.message);
  }
});
server.requestTimeout = 20000;
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`日常 DAILY ready at http://127.0.0.1:${port}`));
