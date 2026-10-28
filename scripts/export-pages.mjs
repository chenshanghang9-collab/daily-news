import { cp, mkdir, readFile, writeFile, rename, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getNews } from '../server/feeds.mjs';
import { getArticle } from '../server/articles.mjs';
import { getNewsImage } from '../server/images.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CATEGORIES = new Set(['hot', 'world', 'tech', 'life', 'culture', 'business', 'nba']);
const ID = /^[a-f0-9]{16}$/;
const MAX_ITEMS = 300;
const MAX_PHOTO_BYTES = 60 * 1024 * 1024;
export function normalizeBase(value = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value)) throw new Error('Base path must be / or /project-name/');
  return value;
}
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = (file, value) => writeFile(file, JSON.stringify(value));
async function rewriteHtmlAssets(directory, base) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewriteHtmlAssets(file, base);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      await writeFile(file, html.replace(/\b(href|src)=(['"])\/(?!\/)/g, (_, attr, quote) => `${attr}=${quote}${base}`));
    }
  }
}
function validNews(news) {
  return Array.isArray(news?.items) && news.items.length > 0 && news.items.every(item =>
    ID.test(item.id) && typeof item.title === 'string' && typeof item.url === 'string' && /^https?:\/\//.test(item.url));
}
function summary(item) {
  return { ...item, blocks: item.summary ? [{ type: 'paragraph', text: item.summary }] : [],
    images: [], cover: null, byline: null, status: 'summary', reason: '来源正文暂不可读取，当前展示来源摘要。' };
}
async function pool(items, concurrency, work) {
  let cursor = 0;
  return Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; await work(items[index], index); }
  }));
}
function localPhotoPath(value) {
  return typeof value === 'string' && /^images\/(?:[a-f0-9]{16}\.(?:jpg|png|webp|gif)|(?:hot|world|tech|life|culture|business|nba)\.jpg)$/.test(value);
}

/** Providers are injectable so all publication invariants can be tested offline. */
export async function exportPages({ outDir = 'dist', basePath = '/', previousDir,
  publicDir = path.join(ROOT, 'public'), providers = {}, now = new Date(), concurrency = 12 } = {}) {
  const base = normalizeBase(basePath);
  const output = path.resolve(outDir);
  if (output === path.resolve(ROOT) || output === path.resolve(publicDir) || ROOT.startsWith(`${output}${path.sep}`) || ['server', 'scripts', 'tests', 'docs', 'node_modules', '.git'].some(dir => output === path.join(ROOT, dir))) throw new Error('Unsafe output directory');
  const api = { getNews, getArticle, getNewsImage, ...providers };
  let news;
  try { news = await api.getNews({ force: true }); } catch { /* Prior snapshot may recover a source outage. */ }
  let previous;
  if (previousDir) {
    try {
      const candidate = await json(path.join(previousDir, 'data/news.json'));
      const age = +now - Date.parse(candidate.fetchedAt || candidate.generatedAt);
      if (validNews(candidate) && age >= 0 && age <= 48 * 3600_000) previous = candidate;
    } catch { /* Missing/invalid snapshots must never authorize an empty publication. */ }
  }
  const recovered = !validNews(news) || (news.sources?.length && news.sources.every(source => source.status !== 'ok'));
  if (recovered) {
    if (!previous) throw new Error('No valid fresh news or recent previous snapshot; output preserved');
    news = { ...previous, stale: true, status: 'partial', snapshotFallback: true, lastAttemptAt: now.toISOString() };
  }
  const items = news.items.slice(0, MAX_ITEMS).map(item => ({ ...item }));
  const stage = `${output}.staging-${process.pid}-${Date.now()}`;
  const backup = `${stage}.backup`;
  let photoBytes = 0;
  try {
    await cp(publicDir, stage, { recursive: true, filter: source =>
      !path.relative(publicDir, source).split(path.sep).some(part => part.startsWith('.')) });
    await rewriteHtmlAssets(stage, base);
    await mkdir(path.join(stage, 'data/articles'), { recursive: true });
    let html = await readFile(path.join(stage, 'index.html'), 'utf8');
    html = html.replace(/\s*<meta\s+name=["']daily-(?:mode|base)["'][^>]*>/g, '');
    html = html.replace('</head>', `  <meta name="daily-mode" content="static">\n  <meta name="daily-base" content="${base}">\n</head>`);
    await writeFile(path.join(stage, 'index.html'), html);
    // Fail early if category assets are missing, including categories absent from today's feeds.
    for (const category of CATEGORIES) await stat(path.join(stage, `images/${category}.jpg`));
    await pool(items, Math.max(1, Math.min(16, Number(concurrency) || 12)), async item => {
      let article;
      if (recovered) {
        try { article = await json(path.join(previousDir, `data/articles/${item.id}.json`)); } catch { /* Summary remains readable. */ }
      } else {
        try { article = await api.getArticle(item.id, { url: item.url }); } catch { /* Per-story failures are truthful summaries. */ }
      }
      if (!article || article.id !== item.id || article.url !== item.url || !Array.isArray(article.blocks)) article = summary(item);
      const sourceImages = [...new Set([item.image, article.image, article.cover, ...(article.images || []), ...(article.provenance?.sourceImages || []),
        ...article.blocks.filter(block => block.type === 'image').map(block => block.src)].filter(value => typeof value === 'string' && /^https?:\/\//.test(value)))];
      const category = CATEGORIES.has(item.category) ? item.category : 'hot';
      let photo = { src: `images/${category}.jpg`, kind: 'category' };
      try {
        let image;
        if (recovered && article.photo?.kind === 'article' && localPhotoPath(article.photo.src)) {
          image = { body: await readFile(path.join(previousDir, article.photo.src)), kind: 'article',
            contentType: ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' })[article.photo.src.split('.').pop()] };
        } else if (!recovered) image = await api.getNewsImage(item.id, { url: item.url, category });
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[image?.contentType];
        if (image?.kind === 'article' && Buffer.isBuffer(image.body) && image.body.length > 0 && image.body.length <= 5 * 1024 * 1024 && ext && photoBytes + image.body.length <= MAX_PHOTO_BYTES) {
          photoBytes += image.body.length;
          photo = { src: `images/${item.id}.${ext}`, kind: 'article' };
          await writeFile(path.join(stage, photo.src), image.body);
        }
      } catch { /* Local category photograph remains available. */ }
      item.photo = photo;
      // Keep source text intact; omit remote body photos rather than hotlink or misrepresent local fallback as source imagery.
      const exported = { ...article, blocks: article.blocks.filter(block => block.type !== 'image'),
        image: photo.src, cover: photo.kind === 'article' ? photo.src : null,
        images: photo.kind === 'article' ? [photo.src] : [], photo,
        provenance: { ...article.provenance, sourceUrl: item.url, sourceImages,
          bodyImagesOmitted: article.blocks.some(block => block.type === 'image') || Boolean(article.provenance?.bodyImagesOmitted) } };
      await writeJson(path.join(stage, `data/articles/${item.id}.json`), exported);
    });
    const result = { ...news, items, total: items.length, mode: 'static', generatedAt: now.toISOString(),
      exportLimits: { maxItems: MAX_ITEMS, maxPhotoBytes: MAX_PHOTO_BYTES, bodyImages: 'omitted-with-provenance' } };
    await writeJson(path.join(stage, 'data/news.json'), result);
    let exists = false;
    try { await stat(output); exists = true; } catch {}
    if (exists) await rename(output, backup);
    try { await rename(stage, output); } catch (error) { if (exists) await rename(backup, output); throw error; }
    await rm(backup, { recursive: true, force: true });
    return result;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2); const options = {};
  const keys = { '--out-dir': 'outDir', '--base-path': 'basePath', '--previous-dir': 'previousDir' };
  try {
    for (let i = 0; i < args.length; i++) {
      if (!keys[args[i]] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid argument: ${args[i]}`);
      options[keys[args[i]]] = args[++i];
    }
    const result = await exportPages(options);
    console.log(`Exported ${result.items.length} stories (${result.status}) to ${options.outDir || 'dist'}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
