import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

let child;
let origin;
before(async () => {
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 5000);
    child.stdout.on('data', (data) => { if (data.toString().includes('ready at')) { clearTimeout(timer); resolve(); } });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Test server exited ${code}`)); });
    child.stderr.on('data', () => {});
  });
});
after(() => child?.kill());

test('a direct article URL returns the site reader instead of a missing page', async () => {
  const response = await fetch(`${origin}/article/0123456789abcdef`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="reader-view"/);
});
test('article API rejects invalid identities before requesting a publisher', async () => {
  assert.equal((await fetch(`${origin}/api/article?id=invalid`)).status, 400);
});
test('image API rejects invalid identities instead of acting as an open image proxy', async () => {
  assert.equal((await fetch(`${origin}/api/image?id=invalid&url=http://127.0.0.1/private`)).status, 400);
});
