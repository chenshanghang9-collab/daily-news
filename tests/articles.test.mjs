import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const articles = await import('../server/articles.mjs').catch(() => ({}));
const url = 'https://www.chinanews.com.cn/cj/2026/10-27/10721541.shtml';
const item = { id: '26c85c0367bc6a2d', title: '原始新闻标题', summary: '原始 RSS 摘要', url, source: '中国新闻网', category: 'business', publishedAt: '2026-10-27T03:32:23.000Z' };

test('ChinaNews extracts article text, caption and photo without page chrome or executable markup', () => {
  assert.equal(typeof articles.parseArticleHtml, 'function');
  const result = articles.parseArticleHtml(`<html><head><title>网页标题</title></head><body><nav>侧栏推广</nav>
    <span id="author_baidu">作者：记者王明</span><div class="left_zw">
    <p>这是新闻的真实第一段，描述今天发布的财经消息，以及读者关心的详细情况。</p>
    <div><img src="//i2.chinanews.com.cn/simg/ypt/2026/photo.jpg" onerror="alert(1)"></div>
    <div class="pictext">海关关员进行入库检查。高文杰 摄</div>
    <h2>具体进展</h2><p>这是第二段新闻内容，完整保留原报道的段落与报道事实，并且不包含网页其他区域。</p>
    <div class="adInContent"><p>广告促销</p><img src="https://i2.chinanews.com.cn/ad/banner.jpg"></div>
    <script>badCode()</script><div class="adEditor">编辑姓名</div></div></body></html>`, item);
  assert.equal(result.status, 'full');
  assert.equal(result.byline, '记者王明');
  assert.equal(result.cover, 'https://i2.chinanews.com.cn/simg/ypt/2026/photo.jpg');
  assert.deepEqual(result.blocks.find(block => block.type === 'image'), {
    type: 'image', src: 'https://i2.chinanews.com.cn/simg/ypt/2026/photo.jpg', caption: '海关关员进行入库检查。高文杰 摄',
  });
  assert.ok(result.blocks.some(block => block.type === 'heading' && block.text === '具体进展'));
  assert.ok(!JSON.stringify(result).match(/badCode|广告促销|侧栏推广|onerror|编辑姓名/));
});

test('IT Home reads lazy original images and real lists instead of transparent placeholders', () => {
  assert.equal(typeof articles.parseArticleHtml, 'function');
  const result = articles.parseArticleHtml(`<html><body><h1>技术进展</h1><div id="paragraph" class="post_content">
    <p>这是一篇来自 IT之家的技术报道，介绍一项正式发布的新技术，以及该技术的实际使用情况。</p>
    <p><img src="//img.ithome.com/images/v2/t.png" data-original="https://img.ithome.com/newsuploadfiles/2026/10/actual.jpg" width="1200" height="700"></p>
    <ul><li>第一项真实特性</li><li>第二项真实特性</li></ul>
    <p><img src="http://127.0.0.1/private.jpg"><img src="https://evil.example/a.jpg"><img src="https://img.ithome.com/icon/logo.png"></p>
    </div></body></html>`, { ...item, url: 'https://www.ithome.com/1/018/301.htm', source: 'IT之家' });
  assert.equal(result.status, 'full');
  assert.deepEqual(result.images, ['https://img.ithome.com/newsuploadfiles/2026/10/actual.jpg']);
  assert.deepEqual(result.blocks.find(block => block.type === 'list')?.items, ['第一项真实特性', '第二项真实特性']);
});

test('missing verified article content stays an honest feed summary', () => {
  assert.equal(typeof articles.parseArticleHtml, 'function');
  const result = articles.parseArticleHtml('<html><body><nav>登录后看新闻</nav><main>网页维护中</main></body></html>', item);
  assert.equal(result.status, 'summary');
  assert.deepEqual(result.blocks, [{ type: 'paragraph', text: '原始 RSS 摘要' }]);
  assert.ok(result.reason);
});

test('summary responses never retain an unsafe feed image URL', () => {
  const result = articles.parseArticleHtml('<html><body>暂无正文</body></html>', { ...item, image: 'http://127.0.0.1/private.jpg' });
  assert.equal(result.image, undefined);
  assert.equal(result.cover, null);
  assert.deepEqual(result.images, []);
});

test('CCTV NBA preserves actual report, article photo and photo caption', () => {
  const result = articles.parseArticleHtml(`<html><body><h1>NBA 比赛报道</h1>
    <div class="title_area"><div class="info">来源：央视网 | 2026-10-26 10:27:23</div></div>
    <div id="text_area"></div><div id="content_area">
    <p>央视网消息：北京时间10月26日，NBA常规赛的比赛结束，报道介绍双方球员表现及比赛结果。</p>
    <p class="photoAlbum_img_20190808"><a><img src="//p3.img.cctvpic.com/photoAlbum/photo/2026/10/26/actual_920x700.jpg"></a></p>
    <p class="photoAlbum_title_20190808">[图]本场比赛现场照片</p>
    <p>这是第二段来自原报道的真实正文，提供比赛的详细信息与球队的具体表现。</p>
    </div></body></html>`, { ...item, title: '', publishedAt: null, url: 'https://sports.cctv.com/2026/10/26/ARTIMHdXyWmhhyi61kCDctuR261026.shtml', source: '央视网', category: 'nba' });
  assert.equal(result.status, 'full');
  assert.equal(result.cover, 'https://p3.img.cctvpic.com/photoAlbum/photo/2026/10/26/actual_920x700.jpg');
  assert.equal(result.publishedAt, '2026-10-26T02:27:23.000Z');
  assert.equal(result.blocks.find(block => block.type === 'image')?.caption, '[图]本场比赛现场照片');
  assert.equal(result.blocks.filter(block => block.type === 'paragraph').length, 2);
});

test('untrusted, local, credentialed and mismatched deep links are rejected before network use', async () => {
  assert.equal(typeof articles.getArticle, 'function');
  for (const candidate of [
    'http://127.0.0.1/secret.shtml', 'http://[::1]/secret.shtml',
    'https://www.chinanews.com.cn.evil.example/a.shtml',
    'https://user:password@www.chinanews.com.cn/cj/2026/10-27/10721541.shtml',
    'https://www.chinanews.com.cn:444/cj/2026/10-27/10721541.shtml',
    'https://www.ithome.com/rss/', 'file:///etc/passwd',
  ]) {
    const id = createHash('sha256').update(candidate).digest('hex').slice(0, 16);
    await assert.rejects(articles.getArticle(id, { url: candidate }), error => error.statusCode === 400);
  }
  await assert.rejects(articles.getArticle('0000000000000000', { url }), error => error.statusCode === 400);
});

const fixtureUrls = [601, 602, 603, 604].map(suffix => `https://www.chinanews.com.cn/cj/2026/10-27/10721${suffix}.shtml`);
const idFor = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const body = '<html><body><div class="left_zw"><p>这是从真实来源结构提取的测试新闻正文，具有足够的长度，供网络边界测试验证完整文章解析。</p></div></body></html>';

function fakeRequests(t, responder) {
  const requests = [];
  t.mock.method(https, 'request', (target, options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      requests.push(target.href);
      const spec = responder(target, options);
      const response = Readable.from([Buffer.from(spec.body || '')]);
      response.statusCode = spec.status || 200;
      response.headers = { 'content-type': 'text/html', ...spec.headers };
      callback(response);
    });
    return request;
  });
  return requests;
}

test('publisher DNS resolving to private networks returns only source summary without a connection', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(`<rss><channel>${fixtureUrls.map(link => `<item><title>来源标题</title><link>${link}</link><description>可信来源的原始摘要</description></item>`).join('')}</channel></rss>`));
  t.mock.method(dns, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }]);
  const requests = fakeRequests(t, () => ({ body }));
  const result = await articles.getArticle(idFor(fixtureUrls[0]), { url: fixtureUrls[0] });
  assert.equal(result.status, 'summary');
  assert.equal(result.summary, '可信来源的原始摘要');
  assert.match(result.reason, /公开网络/);
  assert.deepEqual(requests, []);
});

test('redirect to localhost is refused before a second connection', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '104.18.10.10', family: 4 }]);
  const requests = fakeRequests(t, () => ({ status: 302, headers: { location: 'http://127.0.0.1/secret.shtml' } }));
  const result = await articles.getArticle(idFor(fixtureUrls[1]), { url: fixtureUrls[1] });
  assert.equal(result.status, 'summary');
  assert.deepEqual(requests, [fixtureUrls[1]]);
});

test('concurrent callers share one pinned request and subsequent callers use cached parsed content', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '104.18.10.10', family: 4 }]);
  const requests = fakeRequests(t, (_target, options) => {
    options.lookup('www.chinanews.com.cn', {}, (error, address) => {
      assert.equal(error, null);
      assert.equal(address, '104.18.10.10');
    });
    return { body };
  });
  const id = idFor(fixtureUrls[2]);
  const results = await Promise.all([articles.getArticle(id), articles.getArticle(id)]);
  assert.equal(results[0].status, 'full');
  assert.deepEqual(results[0], results[1]);
  assert.equal((await articles.getArticle(id)).status, 'full');
  assert.deepEqual(requests, [fixtureUrls[2]]);
});

test('oversized chunked responses are capped and fall back to source summary', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '104.18.10.10', family: 4 }]);
  fakeRequests(t, () => ({ body: 'x'.repeat(2_000_001) }));
  const result = await articles.getArticle(idFor(fixtureUrls[3]), { url: fixtureUrls[3] });
  assert.equal(result.status, 'summary');
  assert.equal(result.summary, '可信来源的原始摘要');
  assert.match(result.reason, /上限/);
});
