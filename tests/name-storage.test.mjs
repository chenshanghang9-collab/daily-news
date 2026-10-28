import assert from 'node:assert/strict';
import { test } from 'node:test';

const module = await import('../public/name-storage.js').catch(() => ({}));
const KEY = 'daily.name';
const START = 1793145600000;
const THIRTY_DAYS = 2592000000;

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function fixture({ local = storage(), session = storage(), time = START } = {}) {
  assert.equal(typeof module.createNameStorage, 'function', 'name storage helper is available');
  const clock = { time };
  const names = module.createNameStorage({ local: () => local, session: () => session, now: () => clock.time });
  return { names, local, session, clock };
}

test('remembered name survives a fresh session until the exact 30 day boundary', () => {
  const { names, local, session, clock } = fixture();
  assert.deepEqual(names.save('  小陈  ', true), { name: '小陈', remember: true, stored: true });
  assert.deepEqual(JSON.parse(local.getItem(KEY)), { name: '小陈', expiresAt: 1795737600000 });
  assert.equal(session.getItem(KEY), null);
  const freshSession = module.createNameStorage({ local: () => local, session: () => storage(), now: () => clock.time });
  clock.time = START + THIRTY_DAYS - 1;
  assert.deepEqual(freshSession.load(), { name: '小陈', remember: true });
  clock.time += 1;
  assert.deepEqual(freshSession.load(), { name: '', remember: false });
  assert.equal(local.getItem(KEY), null);
});

test('loading a remembered name never renews its original expiration', () => {
  const { names, local, clock } = fixture();
  names.save('小林', true);
  const original = local.getItem(KEY);
  clock.time += 86400000;
  assert.deepEqual(names.load(), { name: '小林', remember: true });
  assert.equal(local.getItem(KEY), original);
  clock.time = START + THIRTY_DAYS;
  assert.deepEqual(names.load(), { name: '', remember: false });
});

test('an unchecked name survives a same-tab refresh and is absent in a new session', () => {
  const { names, local, session } = fixture();
  assert.deepEqual(names.save('访客', false), { name: '访客', remember: false, stored: true });
  assert.equal(local.getItem(KEY), null);
  assert.deepEqual(JSON.parse(session.getItem(KEY)), { name: '访客' });
  assert.deepEqual(fixture({ local, session }).names.load(), { name: '访客', remember: false });
  assert.deepEqual(fixture({ local }).names.load(), { name: '', remember: false });
});

test('unchecking remember deletes the previous persistent name without touching saved articles', () => {
  const local = storage({ 'daily.saved.旧名': '[{"id":"a"}]' });
  const { names, session } = fixture({ local });
  names.save('旧名', true);
  assert.deepEqual(names.save('新名', false), { name: '新名', remember: false, stored: true });
  assert.equal(local.getItem(KEY), null);
  assert.deepEqual(JSON.parse(session.getItem(KEY)), { name: '新名' });
  assert.equal(local.getItem('daily.saved.旧名'), '[{"id":"a"}]');
});

test('checking remember replaces the session name with one persistent record', () => {
  const { names, local, session } = fixture();
  names.save('旧名', false);
  assert.deepEqual(names.save('新名', true), { name: '新名', remember: true, stored: true });
  assert.equal(session.getItem(KEY), null);
  assert.deepEqual(JSON.parse(local.getItem(KEY)), { name: '新名', expiresAt: START + THIRTY_DAYS });
});

test('logout clears names in both stores and preserves all per-name saved articles', () => {
  const { names, local, session } = fixture({
    local: storage({ [KEY]: '{"name":"小陈","expiresAt":1795737600000}', 'daily.saved.小陈': '[1]' }),
    session: storage({ [KEY]: '{"name":"小林"}', 'daily.saved.小林': '[2]' }),
  });
  assert.equal(names.clear(), true);
  assert.equal(local.getItem(KEY), null);
  assert.equal(session.getItem(KEY), null);
  assert.equal(local.getItem('daily.saved.小陈'), '[1]');
  assert.equal(session.getItem('daily.saved.小林'), '[2]');
  assert.deepEqual(names.load(), { name: '', remember: false });
});

test('legacy JSON string is migrated to this session without granting another 30 days', () => {
  const local = storage({ [KEY]: '"  旧用户  "', 'daily.saved.旧用户': '[1]' });
  const { names, session } = fixture({ local });
  assert.deepEqual(names.load(), { name: '旧用户', remember: false });
  assert.equal(local.getItem(KEY), null);
  assert.deepEqual(JSON.parse(session.getItem(KEY)), { name: '旧用户' });
  assert.equal(local.getItem('daily.saved.旧用户'), '[1]');
  assert.deepEqual(fixture({ local, session }).names.load(), { name: '旧用户', remember: false });
  assert.deepEqual(fixture({ local }).names.load(), { name: '', remember: false });
});

test('a valid session choice takes precedence over another tab persistent name', () => {
  const { names, local } = fixture({
    local: storage({ [KEY]: '{"name":"另一标签页","expiresAt":1795737600000}' }),
    session: storage({ [KEY]: '{"name":"本次会话"}' }),
  });
  assert.deepEqual(names.load(), { name: '本次会话', remember: false });
  assert.equal(JSON.parse(local.getItem(KEY)).name, '另一标签页');
});

test('expired persistent name is removed even when this tab has an independent session choice', () => {
  const { names, local } = fixture({
    local: storage({ [KEY]: '{"name":"已过期","expiresAt":1793145600000}' }),
    session: storage({ [KEY]: '{"name":"本次会话"}' }),
  });
  assert.deepEqual(names.load(), { name: '本次会话', remember: false });
  assert.equal(local.getItem(KEY), null);
});

test('a valid session choice is preserved when an old persistent string is removed', () => {
  const { names, local, session } = fixture({
    local: storage({ [KEY]: '"旧版名字"' }), session: storage({ [KEY]: '{"name":"当前名字"}' }),
  });
  assert.deepEqual(names.load(), { name: '当前名字', remember: false });
  assert.equal(local.getItem(KEY), null);
  assert.deepEqual(JSON.parse(session.getItem(KEY)), { name: '当前名字' });
});

test('invalid saved names are rejected instead of truncating a Unicode code point', () => {
  const { names, local, session } = fixture();
  for (const value of ['', '  ', null, undefined, 12, {}, '😀'.repeat(17)]) {
    assert.deepEqual(names.save(value, true), { name: '', remember: false, stored: false });
    assert.equal(local.getItem(KEY), null);
    assert.equal(session.getItem(KEY), null);
  }
  assert.deepEqual(names.save('  ' + '😀'.repeat(16) + '  ', true), { name: '😀'.repeat(16), remember: true, stored: true });
});

test('malformed records and invalid names or timestamps are removed from persistent storage', () => {
  for (const raw of ['{', 'null', '[]', '12', 'true', '""', '"😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀"',
    '{"name":"" ,"expiresAt":1795737600000}', '{"name":12,"expiresAt":1795737600000}',
    '{"name":"小陈"}', '{"name":"小陈","expiresAt":"1795737600000"}',
    '{"name":"小陈","expiresAt":null}', '{"name":"小陈","expiresAt":-1}',
    '{"name":"小陈","expiresAt":8640000000000001}']) {
    const { names, local } = fixture({ local: storage({ [KEY]: raw, 'daily.saved.小陈': '[1]' }) });
    assert.deepEqual(names.load(), { name: '', remember: false }, raw);
    assert.equal(local.getItem(KEY), null, raw);
    assert.equal(local.getItem('daily.saved.小陈'), '[1]');
  }
});

test('invalid session records are removed and cannot act as an unexpiring remembered mirror', () => {
  for (const raw of ['{', 'null', '[]', '"小陈"', '{"name":42}', '{"name":"  "}',
    '{"name":"😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀"}', '{"name":"旧镜像","expiresAt":1793145600000}']) {
    const { names, session } = fixture({ session: storage({ [KEY]: raw }) });
    assert.deepEqual(names.load(), { name: '', remember: false }, raw);
    assert.equal(session.getItem(KEY), null, raw);
  }
});

test('persistent write failure falls back to session and reports remember was not saved', () => {
  const local = storage();
  local.setItem = () => { throw new Error('quota'); };
  const { names, session } = fixture({ local });
  assert.deepEqual(names.save('小陈', true), { name: '小陈', remember: false, stored: false });
  assert.deepEqual(JSON.parse(session.getItem(KEY)), { name: '小陈' });
  assert.deepEqual(names.load(), { name: '小陈', remember: false });
});

test('unavailable storage methods do not crash save, load or logout', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const { names } = fixture({ local: broken, session: broken });
  assert.deepEqual(names.load(), { name: '', remember: false });
  assert.deepEqual(names.save('小陈', true), { name: '小陈', remember: false, stored: false });
  assert.deepEqual(names.save('小陈', false), { name: '小陈', remember: false, stored: false });
  assert.equal(names.clear(), false);
});

test('storage getter failures are caught lazily and a working session remains usable', () => {
  assert.equal(typeof module.createNameStorage, 'function');
  const session = storage();
  const names = module.createNameStorage({ local: () => { throw new Error('SecurityError'); }, session: () => session, now: () => START });
  assert.deepEqual(names.load(), { name: '', remember: false });
  assert.deepEqual(names.save('小陈', true), { name: '小陈', remember: false, stored: false });
  assert.deepEqual(names.load(), { name: '小陈', remember: false });
  assert.equal(names.clear(), false);
  assert.equal(session.getItem(KEY), null);
});

test('a failed logout still attempts the other store and reports failure', () => {
  const local = storage({ [KEY]: '"旧名"' });
  local.removeItem = () => { throw new Error('blocked'); };
  const { names, session } = fixture({ local, session: storage({ [KEY]: '{"name":"会话名"}' }) });
  assert.equal(names.clear(), false);
  assert.equal(session.getItem(KEY), null);
});

test('invalid clock values never create an invalid persistent expiration', () => {
  for (const time of [NaN, Infinity, -1, 8640000000000000]) {
    const { names, local } = fixture({ time });
    assert.deepEqual(names.save('小陈', true), { name: '小陈', remember: false, stored: false });
    assert.equal(local.getItem(KEY), null);
  }
});
