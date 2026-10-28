import { createSiteMode, savedArticleFallback } from './site-mode.js?v=20261027-8';
import { createNameStorage } from './name-storage.js?v=20261028-1';
import { badgeGuides } from './badge-guides.js?v=20261028-2';
const $ = (selector) => document.querySelector(selector);
const icons = {
  search: '<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7A7 7 0 0 1 18 6l2 3M4 15l2 3a7 7 0 0 0 11.9-1"/>',
  source: '<path d="m12 3 8 4v5c0 4.5-4.8 7.5-8 9-3.2-1.5-8-4.5-8-9V7z"/><path d="m8 12 3 3 5-6"/>',
  back: '<path d="M20 12H4m7-7-7 7 7 7"/>',
  book: '<path d="M3 5c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2zM12 7v15"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.book}</svg>`; }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function safeURL(value) { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
function localizeBadge(item) {
  return item.category === 'badges' && typeof item.titleZh === 'string'
    ? { ...item, originalTitle: item.originalTitle || item.title, title: item.titleZh, summary: item.summaryZh || item.summary }
    : item;
}
const site = createSiteMode({ mode: $('meta[name="daily-mode"]')?.content, base: $('meta[name="daily-base"]')?.content });
const categories = [
  { id: 'hot', name: '今日精选', short: '要闻', en: 'THE DAILY EDIT' },
  { id: 'tech', name: '科技前沿', short: '科技', en: 'TECH & TOMORROW' },
  { id: 'world', name: '看见世界', short: '世界', en: 'AROUND THE WORLD' },
  { id: 'life', name: '生活方式', short: '生活', en: 'THE ART OF LIVING' },
  { id: 'culture', name: '人文与艺术', short: '文化', en: 'ARTS & CULTURE' },
  { id: 'business', name: '商业观察', short: '商业', en: 'BUSINESS & IDEAS' },
  { id: 'nba', name: 'NBA 专栏', short: 'NBA', en: 'ON THE COURT' },
  { id: 'badges', name: '人像卡', short: '人像卡', en: 'CARDS & BADGES' },
];
const categoryInfo = (id) => categories.find((c) => c.id === id) || categories[0];
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('浏览器暂时无法保存，下次打开可能需要重新输入名字。'); return false; } }
const nameStorage = createNameStorage();
const savedLogin = nameStorage.load();
const state = { name: savedLogin.name, rememberName: savedLogin.remember, category: 'hot', query: '', items: [], data: null, saved: [], limit: 10, loading: false, loaded: false };
state.badgeSection = 'news';
const badgeSections = [{ id: 'news', name: '行业动态' }, { id: 'workflow', name: '制作流程' }, { id: 'tips', name: '实用技巧' }];
const validBadgeSection = value => badgeSections.some(section => section.id === value) ? value : 'news';
const findItem = id => badgeGuides.find(item => item.id === id) || state.items.find(item => item.id === id) || state.saved.find(item => item.id === id) || (state.article?.id === id ? state.article : null);
state.article = null;
state.carousel = { items: [], index: 0, scope: '' };
let articleRequest = 0;
let homeScroll = 0;
let toastTimer;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000); }
const savedKey = () => `daily.saved.${state.name}`;
function loadSaved() { const value = readStorage(savedKey(), []); state.saved = Array.isArray(value) ? value.filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string' && safeURL(x.url)).slice(0, 100) : []; }
function isSaved(id) { return state.saved.some((x) => x.id === id); }

function articleHref(item) { return site.articleHref(item); }
function storyLink(item, label = item.title) { return `<a href="${escapeHTML(articleHref(item))}" data-article="${escapeHTML(item.id)}">${escapeHTML(label)}</a>`; }
function categoryPhoto(category) { return site.asset(`images/${categoryInfo(category).id}.jpg`); }
function photo(item, eager = false) {
  return `<span class="photo-frame"><img src="${categoryPhoto(item.category)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-photo="${escapeHTML(item.id)}"><span class="photo-credit">栏目配图</span></span>`;
}
const photoCache = new Map();
const photoPending = new Map();
const photoQueue = [];
let activePhotos = 0;
function resolvePhoto(item) {
  if (item.kind === 'guide') return Promise.resolve({ src: categoryPhoto('badges'), kind: 'category' });
  if (site.isStatic) return Promise.resolve({ src: site.image(item.photo?.src) || categoryPhoto(item.category), kind: site.image(item.photo?.src) && item.photo?.kind === 'article' ? 'article' : 'category' });
  if (photoCache.has(item.id)) return Promise.resolve(photoCache.get(item.id));
  if (photoPending.has(item.id)) return photoPending.get(item.id);
  const job = new Promise((resolve) => photoQueue.push({ item, resolve }));
  photoPending.set(item.id, job); drainPhotos(); return job;
}
function drainPhotos() {
  while (activePhotos < 4 && photoQueue.length) {
    const { item, resolve } = photoQueue.shift(); activePhotos++;
    (async () => {
      let result = { src: categoryPhoto(item.category), kind: 'category' };
      try {
        const params = new URLSearchParams({ id: item.id, url: item.url, category: item.category || 'hot' });
        const response = await fetch(`/api/image?${params}`, { signal: AbortSignal.timeout(18000) });
        if (response.ok && response.headers.get('Content-Type')?.startsWith('image/')) {
          const kind = response.headers.get('X-Image-Kind');
          if (kind === 'article') result = { src: URL.createObjectURL(await response.blob()), kind };
        }
      } catch { /* The local photograph is already visible. */ }
      photoCache.set(item.id, result);
      if (photoCache.size > 100) { const key = photoCache.keys().next().value; const old = photoCache.get(key); if (old.src.startsWith('blob:')) URL.revokeObjectURL(old.src); photoCache.delete(key); }
      photoPending.delete(item.id); activePhotos--; resolve(result); drainPhotos();
    })();
  }
}
function hydratePhotos() {
  document.querySelectorAll('img[data-photo]').forEach((img) => {
    const item = findItem(img.dataset.photo);
    if (!item) return;
    resolvePhoto(item).then((result) => {
      if (!img.isConnected) return;
      img.onerror = () => {
        img.onerror = null; img.src = categoryPhoto(item.category);
        const credit = img.parentElement.querySelector('.photo-credit');
        if (credit) credit.hidden = false;
        const caption = img.closest('.reader-cover')?.querySelector('figcaption');
        if (caption) caption.textContent = '栏目配图 · 作者及许可见页脚“照片版权”。';
        photoCache.delete(item.id);
      };
      img.src = result.src;
      const credit = img.parentElement.querySelector('.photo-credit');
      if (credit) credit.hidden = result.kind === 'article';
      const caption = img.closest('.reader-cover')?.querySelector('figcaption');
      if (caption) caption.textContent = result.kind === 'article' ? caption.dataset.original : '栏目配图 · 作者及许可见页脚“照片版权”。';
    });
  });
}
function updateDate() {
  const date = new Date();
  const opts = { timeZone: 'Asia/Shanghai' };
  $('#edition-date').textContent = new Intl.DateTimeFormat('zh-CN', { ...opts, year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(date);
  $('#big-day').textContent = new Intl.DateTimeFormat('en', { ...opts, day: '2-digit' }).format(date);
  $('#month-label').textContent = new Intl.DateTimeFormat('zh-CN', { ...opts, year: 'numeric', month: 'long' }).format(date);
  $('#weekday-label').textContent = new Intl.DateTimeFormat('zh-CN', { ...opts, weekday: 'long' }).format(date);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { ...opts, hour: '2-digit', hour12: false }).format(date));
  const period = hour < 6 ? '夜深了，也别忘了休息' : hour < 12 ? '上午好，新的一天新的发现' : hour < 18 ? '下午好，来看看新鲜事' : '晚上好，和世界说声晚安';
  $('#greeting-period').textContent = period;
}
function updateUser() {
  $('#greeting').textContent = state.name ? `欢迎！${state.name}` : '世界很大，今天也去看看。';
  $('#user-label').textContent = state.name || '登录日常';
  $('#avatar').textContent = Array.from(state.name)[0] || '你';
  $('#menu-name').textContent = state.name ? `今天也要保持好奇，${state.name}` : '';
  if (!state.article) document.title = state.category === 'saved' ? '我的收藏 · 日常 DAILY' : `${categoryInfo(state.category).name} · 日常 DAILY`;
  $('#saved-count').textContent = state.saved.length;
  $('#saved-count').hidden = !state.saved.length;
}
function openLogin() { $('#name-input').value = state.name; $('#remember-name').checked = state.rememberName; $('#name-error').textContent = ''; if (!$('#login-dialog').open) $('#login-dialog').showModal(); setTimeout(() => $('#name-input').focus(), 100); }
$('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#name-input').value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim().replace(/\s+/g, ' ');
  if (!name) { $('#name-error').textContent = '名字还没有填好哦，写下你想用的称呼。'; $('#name-input').focus(); return; }
  state.name = Array.from(name).slice(0, 16).join('');
  const saved = nameStorage.save(state.name, $('#remember-name').checked);
  state.rememberName = saved.remember;
  if (!saved.stored) toast('浏览器暂时无法保存登录选择，下次打开可能需要重新输入名字。');
  loadSaved(); updateUser(); render(); updateReaderSave(); $('#login-dialog').close();
});
$('#login-dialog').addEventListener('cancel', (event) => { if (!state.name) event.preventDefault(); });
$('#user-button').addEventListener('click', () => { if (!state.name) return openLogin(); const menu = $('#user-menu'); menu.hidden = !menu.hidden; $('#user-button').setAttribute('aria-expanded', String(!menu.hidden)); });
document.addEventListener('click', (event) => { if (!event.target.closest('.header-actions')) { $('#user-menu').hidden = true; $('#user-button').setAttribute('aria-expanded', 'false'); } });
$('#switch-name').addEventListener('click', () => { $('#user-menu').hidden = true; $('#user-button').setAttribute('aria-expanded', 'false'); openLogin(); });
$('#logout').addEventListener('click', () => { state.name = ''; state.rememberName = false; state.saved = []; if (!nameStorage.clear()) toast('浏览器暂时无法清除登录记录，请在浏览器设置中清除本站数据。'); $('#user-menu').hidden = true; $('#user-button').setAttribute('aria-expanded', 'false'); updateUser(); render(); updateReaderSave(); openLogin(); });

$('#nav-tabs').innerHTML = categories.map((category) => `<button class="nav-tab${category.id === 'hot' ? ' active' : ''}" data-category="${category.id}" aria-pressed="${category.id === 'hot'}">${category.name}</button>`).join('');
function revealSelectedTab() {
  const selectedTab = document.querySelector('.nav-tab.active');
  if (selectedTab) {
    const tabs = $('#nav-tabs');
    const tabBounds = selectedTab.getBoundingClientRect();
    const listBounds = tabs.getBoundingClientRect();
    if (tabBounds.left < listBounds.left || tabBounds.right > listBounds.right) {
      tabs.scrollLeft += tabBounds.left - listBounds.left - (listBounds.width - tabBounds.width) / 2;
    }
  }
}
window.addEventListener('resize', revealSelectedTab);
function selectCategory(category, { push = true, scroll = false, limit = 10, query = state.query, badgeSection = state.badgeSection } = {}) {
  articleRequest++; state.article = null;
  $('#reader-view').hidden = true; $('#home-view').hidden = false; $('.skip-link').href = '#news-heading';
  state.badgeSection = validBadgeSection(badgeSection);
  if (push) history.pushState({}, '', category === 'hot' ? site.home : `${site.home}?category=${encodeURIComponent(category)}${category === 'badges' && state.badgeSection !== 'news' ? `&section=${state.badgeSection}` : ''}`);
  state.category = category; state.limit = limit; state.query = query; $('#search-input').value = query;
  document.querySelectorAll('.nav-tab').forEach((el) => { el.classList.toggle('active', el.dataset.category === category); el.setAttribute('aria-pressed', String(el.dataset.category === category)); });
  revealSelectedTab();
  $('#saved-nav').classList.toggle('active', category === 'saved');
  $('#saved-nav').setAttribute('aria-pressed', String(category === 'saved'));
  updateUser(); render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
}
$('#nav-tabs').addEventListener('click', (event) => { const tab = event.target.closest('[data-category]'); if (tab) selectCategory(tab.dataset.category); });
$('#badge-sections').addEventListener('click', event => {
  const button = event.target.closest('[data-badge-section]');
  if (button) selectCategory('badges', { badgeSection: button.dataset.badgeSection });
});
$('#saved-nav').addEventListener('click', () => selectCategory('saved'));
$('#surprise-button').addEventListener('click', () => { const available = categories.filter((c) => c.id !== state.category && c.id !== 'hot' && state.items.some((x) => x.category === c.id)); const category = available[Math.floor(Math.random() * available.length)] || categories[1]; state.query = ''; $('#search-input').value = ''; selectCategory(category.id); $('#news-heading').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#search-toggle').addEventListener('click', () => { $('#search-panel').hidden = !$('#search-panel').hidden; if (!$('#search-panel').hidden) $('#search-input').focus(); });
$('#close-search').addEventListener('click', closeSearch);
function closeSearch() { $('#search-panel').hidden = true; $('#search-input').value = ''; state.query = ''; state.limit = 10; render(); $('#search-toggle').focus(); }
$('#search-input').addEventListener('input', (event) => { if (state.article) selectCategory(state.category); state.query = event.target.value.trim(); state.limit = 10; render(); });
$('#search-input').addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSearch(); });
$('#load-more').addEventListener('click', () => { state.limit += 10; render(); });

function timeLabel(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '发布时间未提供';
  const date = new Date(value); const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes >= 0 && minutes < 1) return '刚刚';
  if (minutes >= 1 && minutes < 60) return `${minutes}分钟前`;
  if (minutes >= 60 && minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function metadata(item) {
  if (item.kind === 'guide') return `<div class="story-meta"><span>${escapeHTML(item.source)}</span><span>${item.section === 'workflow' ? '制作流程' : '实用技巧'} · 本站整理</span></div>`;
  const label = item.category === 'badges' && item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }) : timeLabel(item.publishedAt);
  return `<div class="story-meta"><span>${escapeHTML(item.source)}</span>${item.selection === 'curated' ? '<span>已核实选读</span>' : ''}<time${item.publishedAt ? ` datetime="${escapeHTML(item.publishedAt)}"` : ''} title="${escapeHTML(item.publishedAt ? new Date(item.publishedAt).toLocaleString('zh-CN') : '来源未提供发布时间')}">${escapeHTML(label)}</time></div>`;
}
function bookmarkButton(item) { const saved = isSaved(item.id); return `<button class="bookmark${saved ? ' is-saved' : ''}" data-save="${escapeHTML(item.id)}" aria-label="${saved ? '取消收藏' : '收藏'}：${escapeHTML(item.title)}" aria-pressed="${saved}" title="${saved ? '取消收藏' : '收藏文章'}">${icon('bookmark')}</button>`; }
function feedExcerpt(text, limit = 64) {
  const characters = Array.from(text || '');
  return characters.length > limit ? characters.slice(0, limit).join('') + '…' : characters.join('');
}
function featureSlide(item) {
  const info = categoryInfo(item.category);
  return `<a class="featured-photo" href="${escapeHTML(articleHref(item))}" data-article="${escapeHTML(item.id)}" aria-label="阅读：${escapeHTML(item.title)}">${photo(item, true)}</a><div class="featured-copy"><h3>${storyLink(item)}</h3>${item.summary ? `<p class="featured-summary">${escapeHTML(feedExcerpt(item.summary))}</p>` : ''}<div class="featured-category">${escapeHTML(info.name)}</div><div class="featured-bottom">${metadata(item)}${bookmarkButton(item)}</div></div>`;
}
function renderFeature(items) {
  const previousId = state.carousel.items[state.carousel.index]?.id;
  state.carousel.items = items;
  const preserved = items.findIndex((item) => item.id === previousId);
  state.carousel.index = preserved >= 0 ? preserved : Math.min(state.carousel.index, items.length - 1);
  const current = state.carousel.index;
  const item = items[current];
  const featured = $('#featured');
  featured.setAttribute('role', 'region');
  featured.setAttribute('aria-roledescription', '轮播图');
  featured.setAttribute('aria-label', `${categoryInfo(state.category).name}新闻轮播`);
  featured.innerHTML = `<div class="featured-carousel"><div class="featured-slide" id="featured-slide" role="group" aria-roledescription="新闻" aria-label="第 ${current + 1} 条，共 ${items.length} 条">${featureSlide(item)}</div><div class="carousel-controls"><button class="carousel-prev" type="button" data-carousel-step="-1" aria-label="上一条新闻" aria-controls="featured-slide"${items.length < 2 ? ' disabled' : ''}>上一条</button><span class="carousel-position" aria-live="polite" aria-atomic="true">第 ${current + 1} / ${items.length} 条</span><div class="carousel-pages" aria-label="选择头条新闻">${items.map((story, index) => `<button class="carousel-page${index === current ? ' active' : ''}" type="button" data-carousel-index="${index}" aria-label="显示第 ${index + 1} 条：${escapeHTML(story.title)}" aria-current="${index === current}" aria-controls="featured-slide">${index + 1}</button>`).join('')}</div><button class="carousel-next" type="button" data-carousel-step="1" aria-label="下一条新闻" aria-controls="featured-slide"${items.length < 2 ? ' disabled' : ''}>下一条</button></div></div>`;
}
function showCarouselSlide(index) {
  const items = state.carousel.items;
  if (!items.length || $('#home-view').hidden) return;
  const current = (index % items.length + items.length) % items.length;
  if (current === state.carousel.index) return;
  state.carousel.index = current;
  const slide = $('#featured .featured-slide');
  if (!slide) return;
  slide.innerHTML = featureSlide(items[current]);
  slide.setAttribute('aria-label', `第 ${current + 1} 条，共 ${items.length} 条`);
  $('#featured .carousel-position').textContent = `第 ${current + 1} / ${items.length} 条`;
  document.querySelectorAll('#featured .carousel-page').forEach((button, number) => {
    button.classList.toggle('active', number === current);
    button.setAttribute('aria-current', String(number === current));
  });
  hydratePhotos();
}
$('#featured').addEventListener('click', (event) => {
  const step = event.target.closest('[data-carousel-step]');
  if (step) return showCarouselSlide(state.carousel.index + Number(step.dataset.carouselStep));
  const page = event.target.closest('[data-carousel-index]');
  if (page) showCarouselSlide(Number(page.dataset.carouselIndex));
});
$('#featured').addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (state.carousel.items.length < 2) return;
  event.preventDefault();
  showCarouselSlide(state.carousel.index + (event.key === 'ArrowRight' ? 1 : -1));
});
function renderCard(item) {
  const info = categoryInfo(item.category);
  return `<article class="news-card"><a class="news-thumb art-${info.id}" href="${escapeHTML(articleHref(item))}" data-article="${escapeHTML(item.id)}" aria-label="阅读：${escapeHTML(item.title)}">${photo(item)}</a><div class="news-card-body"><h3>${storyLink(item)}</h3>${item.summary ? `<p class="card-summary">${escapeHTML(feedExcerpt(item.summary, 54))}</p>` : ''}<div class="news-card-bottom"><div class="card-meta"><span class="category-label">${escapeHTML(info.short)}</span>${metadata(item)}</div>${bookmarkButton(item)}</div></div></article>`;
}
function renderTrending() {
  const mixed = []; const seen = new Set();
  for (const item of state.items) { if (!seen.has(item.category)) { mixed.push(item); seen.add(item.category); } if (mixed.length === 5) break; }
  for (const item of state.items) { if (mixed.length >= 5) break; if (!mixed.some((x) => x.id === item.id)) mixed.push(item); }
  $('#trending-list').innerHTML = mixed.map((item, i) => `<div class="trending-item"><span class="trend-number">${String(i + 1).padStart(2, '0')}</span><div class="trend-info">${storyLink(item)}<p><span>${escapeHTML(categoryInfo(item.category).short)}</span><span>${escapeHTML(item.source)}</span></p></div></div>`).join('') || '<p class="story-meta">正在等新消息送达。</p>';
}
function emptyState(title, description, action = '') { $('#empty-state').hidden = false; $('#empty-state').innerHTML = `${icon(state.category === 'saved' ? 'bookmark' : 'search')}<h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${action}`; }
function render() {
  if (state.loading && !state.loaded) return;
  const saved = state.category === 'saved';
  const badgeMode = state.category === 'badges';
  const carouselScope = JSON.stringify([state.category, state.query, badgeMode ? state.badgeSection : '']);
  if (state.carousel.scope !== carouselScope) {
    state.carousel = { items: [], index: 0, scope: carouselScope };
  }
  let items = saved ? [...state.saved] : state.items.filter((item) => state.category === 'hot' || item.category === state.category);
  if (badgeMode && state.badgeSection !== 'news') items = badgeGuides.filter(item => item.section === state.badgeSection);
  const query = state.query.toLocaleLowerCase();
  if (query) items = items.filter((item) => `${item.title} ${item.summary || ''} ${item.source || ''}`.toLocaleLowerCase().includes(query));
  $('#news-heading').textContent = saved ? '我的收藏' : categoryInfo(state.category).name;
  $('#section-subtitle').textContent = state.query ? `找到 ${items.length} 篇相关内容` : saved ? '好内容，留着慢慢看' : state.category === 'hot' ? '值得你留意的新鲜事' : state.category === 'nba' ? '赛场动态、球队与球星，每天看一点' : badgeMode ? '工牌、校牌、胸牌与徽章制作' : '让好奇心，多走一步';
  $('#badge-hub').hidden = !badgeMode;
  if (badgeMode) {
    $('#badge-sections').innerHTML = badgeSections.map(section => `<button type="button" data-badge-section="${section.id}" aria-pressed="${state.badgeSection === section.id}">${section.name}<span>${section.id === 'news' ? state.items.filter(item => item.category === 'badges').length : badgeGuides.filter(item => item.section === section.id).length}</span></button>`).join('');
  }
  $('#greeting-description').textContent = saved ? '把喜欢的内容留下，随时回来读一读。' : '把纷繁的信息，变成刚刚好的日常。';
  $('#featured').innerHTML = ''; $('#feed-list').innerHTML = ''; $('#empty-state').hidden = true;
  $('#feed-end').hidden = true; $('#load-more').hidden = true;
  if (!items.length) {
    if (query) emptyState('还没有找到相关内容', '试试更短的关键词，或换一个栏目看看。', '<button class="primary-action" data-action="reset-search">清除搜索</button>');
    else if (saved) emptyState('把喜欢的内容，留给以后的自己', '点击文章旁的收藏图标，它就会出现在这里。', '<button class="primary-action" data-action="go-home">去看看今日精选</button>');
    else emptyState('新消息正在路上', '这个栏目的新闻暂时没有送达。稍后刷新，或换一个栏目看看。', '<button class="primary-action" data-action="retry">再试一次</button>');
  } else {
    const showFeature = !saved && !query && !(badgeMode && state.badgeSection !== 'news');
    const featuredCount = showFeature ? Math.min(5, items.length) : 0;
    if (showFeature) renderFeature(items.slice(0, featuredCount));
    const visible = items.slice(featuredCount, state.limit);
    $('#feed-list').innerHTML = visible.map(renderCard).join('');
    $('#load-more').hidden = items.length <= state.limit; $('#feed-end').hidden = items.length > state.limit;
  }
  $('#saved-count').textContent = state.saved.length; $('#saved-count').hidden = !state.saved.length;
  updateStatus();
  hydratePhotos();
}
function updateStatus() {
  const el = $('#feed-status');
  el.classList.remove('warning');
  if (state.category === 'saved') { el.textContent = '收藏保存在当前浏览器中，换个名字会切换收藏夹。'; return; }
  if (state.category === 'badges' && state.badgeSection !== 'news') { el.textContent = '本站整理的中文工作指南，参考资料列在文末。具体工艺以实际设备、材料和打样结果为准。'; return; }
  if (!state.data) { el.textContent = state.loaded ? '新闻源暂时无法连接，可稍后刷新。' : ''; return; }
  const sourceTime = site.isStatic ? state.data.generatedAt || state.data.fetchedAt : state.data.fetchedAt;
  const time = sourceTime ? new Date(sourceTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  const sources = Array.isArray(state.data.sources) ? new Set(state.data.sources.filter((s) => s.ok || s.status === 'ok' || s.itemCount > 0 || s.count > 0).map((s) => s.name || s.source)).size : 0;
  el.textContent = `${time ? `${time} 更新` : '公开新闻源'}，按发布时间排序${state.query ? `，搜索“${state.query}”` : ''}`;
  if (site.isStatic) el.textContent = `${sourceTime ? new Date(sourceTime).toLocaleString('zh-CN') + ' 快照' : '已发布快照'}，按发布时间排序${state.query ? `，搜索“${state.query}”` : ''}。约每小时自动更新，可能延迟；刷新仅重新读取已发布内容`;
  if (state.data.stale || state.data.status === 'partial') { el.classList.add('warning'); el.textContent += '。部分来源暂未更新，已保留最近内容'; }
  if (state.data.status === 'unavailable') { el.classList.add('warning'); el.textContent = '新闻源暂时无法连接，稍后再来看看。'; }
  if (state.category === 'badges') {
    const source = state.data.sources?.find(source => source.category === 'badges');
    el.textContent += `。${source?.note || '行业动态来自 Evolis 官方博客，产品信息为厂商介绍；旧文保留原始日期，来源未提供的日期不补写。'}`;
  }
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-article]');
  if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); openArticle(link.href); return; }
  const brand = event.target.closest('a.brand, a.footer-brand');
  if (brand && event.button === 0 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); selectCategory('hot', { scroll: true }); return; }
  const save = event.target.closest('[data-save]');
  if (save) {
    if (!state.name) return openLogin();
    const id = save.dataset.save; const existing = isSaved(id);
    const item = findItem(id);
    if (!item) return;
    if (existing) state.saved = state.saved.filter((x) => x.id !== id);
    else { if (state.saved.length >= 100) return toast('收藏夹已经有 100 篇了，整理一些再收藏吧。'); state.saved.unshift(item); }
    writeStorage(savedKey(), state.saved); render(); updateReaderSave();
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'reset-search') { state.query = ''; $('#search-input').value = ''; render(); }
  if (action === 'go-home') selectCategory('hot');
  if (action === 'retry') loadNews(true);
  if (action === 'reader-back') returnToList();
  if (action === 'reader-retry') openArticle(location.href, false);
});
function updateReaderSave() {
  if (!state.article) return;
  const holder = $('#reader-save');
  if (holder) holder.innerHTML = bookmarkButton(state.article) + `<span>${isSaved(state.article.id) ? '已收藏' : '收藏文章'}</span>`;
}
function returnToList() {
  if (history.state?.listDepth > 0) history.go(-history.state.listDepth);
  else { selectCategory(state.article?.category || 'hot', { scroll: true, badgeSection: state.article?.section || 'news' }); }
}
async function openArticle(href, push = true) {
  const url = new URL(href, location.origin);
  const id = site.articleId(url);
  if (!id) return selectCategory('hot', { push: false });
  if (push) {
    const depth = !state.article ? 1 : history.state?.listDepth > 0 ? history.state.listDepth + 1 : 0;
    if (!state.article) { homeScroll = window.scrollY; history.replaceState({ ...history.state, listSnapshot: { category: state.category, limit: state.limit, query: state.query, badgeSection: state.badgeSection, scroll: homeScroll } }, ''); }
    history.pushState({ dailyArticle: true, listDepth: depth }, '', url.pathname + url.search);
  }
  const request = ++articleRequest;
  const item = findItem(id);
  state.article = item || { id: id };
  $('#home-view').hidden = true; $('#reader-view').hidden = false; $('.skip-link').href = '#reader-title';
  $('#search-panel').hidden = true;
  document.title = `${item?.title || '文章阅读'} · 日常 DAILY`;
  $('#reader-view').innerHTML = `<button class="reader-back" data-action="reader-back">${icon('back')}<span>返回资讯列表</span></button><div class="reader-loading" role="status"><div class="skeleton skeleton-row"></div><p>正在打开文章…</p><div class="skeleton skeleton-feature"></div></div>`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (item?.kind === 'guide') { state.article = item; renderReader(item); return; }
  try {
    const params = new URLSearchParams({ id: id });
    const source = url.searchParams.get('url') || item?.url;
    if (source) params.set('url', source);
    const response = await fetch(site.articleURL(id, params), { ...(site.isStatic ? { cache: 'no-cache' } : {}), signal: AbortSignal.timeout(22000) });
    if (site.isStatic && response.status === 404) {
      const saved = savedArticleFallback(state.saved.find((entry) => entry.id === id));
      if (saved) {
        if (request !== articleRequest) return;
        state.article = saved; renderReader(saved); return;
      }
    }
    if (!response.ok) throw new Error(response.status === 404 ? '这篇文章暂时找不到了，请返回列表选择其他内容。' : '文章暂时没有送达，请稍后重试。');
    const article = localizeBadge(await response.json());
    if (request !== articleRequest) return;
    if (!article || typeof article.title !== 'string' || !Array.isArray(article.blocks)) throw new Error('文章暂时没有送达，请稍后重试。');
    state.article = article; renderReader(article);
  } catch (error) {
    if (request !== articleRequest) return;
    $('#reader-view').innerHTML = `<button class="reader-back" data-action="reader-back">${icon('back')}<span>返回资讯列表</span></button><div class="reader-error"><h1 id="reader-title" tabindex="-1">暂时无法打开这篇文章</h1><p>${escapeHTML(error.name === 'TimeoutError' ? '内容加载超时，请稍后重试。' : error.message)}</p><button class="reader-retry primary-action" data-action="reader-retry">重新加载</button></div>`;
    $('#reader-title').focus({ preventScroll: true });
  }
}
function renderReader(article) {
  const info = categoryInfo(article.category);
  document.querySelectorAll('.nav-tab').forEach((el) => { const active = el.dataset.category === article.category; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
  $('#saved-nav').classList.remove('active'); $('#saved-nav').setAttribute('aria-pressed', 'false');
  const coverCaption = article.blocks.find((block) => block.type === 'image' && block.src === article.cover)?.caption;
  const coverCredit = `${coverCaption ? coverCaption + ' · ' : ''}图片来源：${article.source}`;
  document.title = `${article.title} · 日常 DAILY`;
  const blocks = article.blocks.filter((block) => block.type !== 'image' || block.src !== article.cover);
  const content = blocks.map((block) => {
    if (block.type === 'paragraph') return `<p>${escapeHTML(block.text)}</p>`;
    if (block.type === 'heading') return `<h2>${escapeHTML(block.text)}</h2>`;
    if (block.type === 'list') return `<ul>${(Array.isArray(block.items) ? block.items : []).map((text) => `<li>${escapeHTML(text)}</li>`).join('')}</ul>`;
    if (block.type === 'image' && site.image(block.src)) return `<figure class="body-photo"><img src="${escapeHTML(site.image(block.src))}" alt="${escapeHTML(block.caption || '')}" loading="lazy" referrerpolicy="no-referrer" data-body-photo><figcaption>${escapeHTML(block.caption || '图片来源：' + article.source)}</figcaption></figure>`;
    return '';
  }).join('');
  const bodyHasIntro = article.blocks.some(block => block.type === 'paragraph' && block.text === article.summaryZh);
  const related = (article.kind === 'guide' ? badgeGuides : state.items).filter((x) => x.id !== article.id && x.category === article.category).slice(0, 3);
  const attribution = article.kind === 'guide'
    ? `日常整理的中文工作建议，参考以下资料：<br>${(article.references || []).map(ref => `${escapeHTML(ref.source)}《${escapeHTML(ref.title)}》 · ${escapeHTML(ref.publishedAt || '来源未注明日期')}`).join('<br>')}<br>指南内容由本站整理，技术与产品信息来自上述官方资料。`
    : `内容来源：${escapeHTML(article.source)}${article.byline ? ' · ' + escapeHTML(article.byline) : ''}。文章与图片版权归原作者及原发布方所有。<br>由日常整理展示，保留来源标注与发布时间。`;
  $('#reader-view').innerHTML = `<div class="reader-topline"><button class="reader-back" data-action="reader-back">${icon('back')}<span>返回资讯列表</span></button><span>日常 / ${escapeHTML(info.name)}</span></div><article class="reader-article"><header class="reader-header"><h1 id="reader-title" tabindex="-1">${escapeHTML(article.title)}</h1><div class="reader-meta-row">${metadata(article)}<div class="reader-save" id="reader-save"></div></div></header><figure class="reader-cover">${photo(article, true)}<figcaption data-original="${escapeHTML(coverCredit)}">栏目配图 · 作者及许可见页脚“照片版权”。</figcaption></figure>${article.savedSnapshotNotice ? `<div class="reader-notice"><strong>正在阅读本地收藏</strong><p>${escapeHTML(article.savedSnapshotNotice)}</p></div>` : ''}${article.status === 'summary' && !article.savedSnapshotNotice ? `<div class="reader-notice"><strong>当前可读内容为来源摘要</strong><p>完整正文暂时无法获取，我们先保留已发布的摘要。${site.isStatic ? '重新读取仅加载已发布快照，不会即时获取来源正文。' : '你可以稍后重新加载。'}</p><button data-action="reader-retry">${site.isStatic ? '重新读取快照' : '重新加载正文'}</button></div>` : ''}${article.titleZh && article.summaryZh ? `<div class="reader-notice"><strong>中文导读</strong>${bodyHasIntro ? '' : `<p>${escapeHTML(article.summary)}</p>`}<p>${article.status === 'full' ? '下方正文保留来源原文。' : '下方为当前保留的摘要内容。'}</p><p>原标题：${escapeHTML(article.originalTitle)}</p></div>` : ''}<div class="reader-body">${content || (article.savedSnapshotNotice ? '<p>此浏览器未保存这篇文章的摘要或正文。</p>' : '<p>来源暂未提供可读正文，请稍后再试。</p>')}</div><div class="reader-attribution"><span>${icon('source')}</span><p>${attribution}</p></div><button class="reader-bottom-back" data-action="reader-back">${icon('back')}<span>返回资讯列表</span></button></article>${related.length ? `<section class="reader-related"><div class="section-title"><h2>继续读一读</h2></div><div class="related-grid">${related.map((item) => `<article><a class="related-photo" href="${escapeHTML(articleHref(item))}" data-article="${escapeHTML(item.id)}">${photo(item)}</a><h3>${storyLink(item)}</h3>${metadata(item)}</article>`).join('')}</div></section>` : ''}`;
  updateReaderSave(); hydratePhotos();
  document.querySelectorAll('[data-body-photo]').forEach((img) => img.addEventListener('error', () => { img.src = categoryPhoto(article.category); img.removeAttribute('data-body-photo'); img.closest('figure').querySelector('figcaption').textContent = '栏目配图'; }, { once: true }));
  $('#reader-title').focus({ preventScroll: true });
  document.querySelector('.nav-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
window.addEventListener('popstate', () => {
  if (site.articleId(new URL(location.href))) openArticle(location.href, false);
  else { const snapshot = history.state?.listSnapshot; const category = new URLSearchParams(location.search).get('category') || 'hot'; selectCategory(categories.some((c) => c.id === category) || category === 'saved' ? category : 'hot', { push: false, limit: snapshot?.limit || 10, query: snapshot?.query || '', badgeSection: snapshot?.badgeSection || new URLSearchParams(location.search).get('section') }); window.scrollTo({ top: snapshot?.scroll || 0, behavior: 'instant' }); }
});
async function loadNews(force = false) {
  if (state.loading) return;
  if (force) for (const [id, image] of photoCache) if (image.kind === 'category') photoCache.delete(id);
  state.loading = true; $('#refresh').disabled = true; $('#refresh').classList.add('busy');
  if (!state.loaded) { $('#featured').innerHTML = ''; $('#featured').style.display = 'none'; $('#feed-list').innerHTML = '<div class="skeleton skeleton-feature" aria-label="正在加载新闻"></div><div class="skeleton skeleton-row"></div><div class="skeleton skeleton-row"></div>'; $('#feed-status').textContent = '正在收集新鲜事，请稍等片刻…'; }
  try {
    const response = await fetch(site.newsURL(force), { ...(site.isStatic ? { cache: 'no-cache' } : {}), signal: AbortSignal.timeout(18000) });
    if (!response.ok) throw new Error('news unavailable');
    const data = await response.json();
    if (!Array.isArray(data.items)) throw new Error('invalid response');
    state.items = data.items.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && safeURL(item.url)).map(localizeBadge); state.data = data;
    renderTrending();
    if (force && !state.items.length) toast('新闻源暂时没送达，稍后再试试。');
  } catch {
    if (state.data) { state.data.stale = true; toast('暂时连接不上新闻源，先看看最近的内容。'); }
    else { state.data = { items: [], status: 'unavailable' }; renderTrending(); if (force) toast('连接暂时中断，稍后再试试。'); }
  } finally { state.loading = false; state.loaded = true; $('#refresh').disabled = false; $('#refresh').classList.remove('busy'); $('#featured').style.removeProperty('display'); render(); }
}
$('#refresh').addEventListener('click', () => loadNews(true));
$('#search-toggle').innerHTML = icon('search'); $('#search-input-icon').innerHTML = icon('search'); $('#saved-nav-icon').innerHTML = icon('bookmark'); $('#refresh-icon').innerHTML = icon('refresh'); $('#source-icon').innerHTML = icon('source');
// Without actual popularity data, this panel is a source-backed cross-category digest.
$('.aside-heading h2').textContent = '新鲜事速览'; $('.aside-heading>span').textContent = '换个栏目读一读';
if (site.isStatic) {
  $('#refresh').lastElementChild.textContent = '读取最新快照';
  $('.source-note p').textContent = '汇集公开新闻源，点击标题在日常阅读。约每小时自动发布，可能延迟；刷新仅读取已发布快照。每篇保留来源与发布时间。';
}
loadSaved(); updateDate();
const initialCategory = new URLSearchParams(location.search).get('category');
if (categories.some((c) => c.id === initialCategory) || initialCategory === 'saved') selectCategory(initialCategory, { push: false, badgeSection: new URLSearchParams(location.search).get('section') });
updateUser(); renderTrending(); loadNews();
if (site.articleId(new URL(location.href))) openArticle(location.href, false);
if (!state.name) openLogin();
setInterval(updateDate, 60000);
setInterval(() => { if (!document.hidden) loadNews(); }, 7 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.data?.fetchedAt && Date.now() - Date.parse(state.data.fetchedAt) > 7 * 60 * 1000) loadNews(); });
