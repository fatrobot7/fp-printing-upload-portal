import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from '@napi-rs/canvas';

test('file-only inspection keeps review tools without creating an approval job', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-checker-test-'));
  process.env.DATA_DIR = dataDir;
  process.env.STAMP_SKIP_LISTEN = '1';
  const { app } = await import('../server.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const entry = await (await fetch(`${base}/preflight`)).text();
    assert.match(entry, /<h1>PressCheck<\/h1>/);
    assert.match(entry, /mailing readiness is not certified/);
    const doc = new PDFDocument();
    for (let n = 1; n <= 2; n++) {
      const ctx = doc.beginPage(450, 306);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 450, 306);
      ctx.fillStyle = '#000000'; ctx.font = '24px sans-serif';
      ctx.fillText(`Test side ${n}`, 30, 60);
      doc.endPage();
    }
    const body = new FormData();
    body.set('preflightMode', 'quick');
    body.set('productCategory', 'postcards');
    body.set('productSize', '4x6');
    body.set('artwork', new Blob([doc.close()], { type: 'application/pdf' }), 'test.pdf');
    const response = await fetch(`${base}/upload`, { method: 'POST', body });
    const html = await response.text();
    assert.equal(response.status, 200, html.slice(-1200));
    assert.match(html, /data-proof-tab="front"/);
    assert.match(html, /data-proof-tab="back"/);
    assert.match(html, /data-proof-callout-mode="magnify"/);
    assert.match(html, /data-proof-callout-mode="3d"/);
    assert.doesNotMatch(html, /<input[^>]*data-proof-orientation-confirm/);
    assert.doesNotMatch(html, /<a[^>]*data-proof-export-link/);
    assert.doesNotMatch(html, /<button[^>]*data-proof-callout-mode="proof"/);
    assert.deepEqual(fs.readdirSync(path.join(dataDir, 'jobs')), []);
    const images = [...html.matchAll(/src="(\/proof-renders\/[^\"]+)"/g)];
    assert.ok(images.length >= 2);
    const image = await fetch(base + images[0][1]);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/png/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
