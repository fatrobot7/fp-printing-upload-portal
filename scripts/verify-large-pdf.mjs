// Local-only regression runner. Supply your own PDF; never commit customer files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const source = process.argv[2];
if (!source) throw new Error('Supply a PDF path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'presscheck-regression-'));
process.env.STAMP_SKIP_LISTEN = '1';
const { app } = await import('../server.js');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (let run = 1; run <= 2; run++) {
    const body = new FormData();
    body.set('preflightMode', 'quick');
    body.set('productCategory', 'postcards');
    body.set('productSize', '6x9');
    body.set('artwork', new Blob([fs.readFileSync(source)], { type: 'application/pdf' }), 'regression.pdf');
    const pending = fetch(base + '/upload', { method: 'POST', body });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal((await fetch(base + '/preflight')).status, 200);
    const busy = await fetch(base + '/upload', { method: 'POST' });
    assert.equal(busy.status, 503);
    const response = await pending;
    const html = await response.text();
    assert.equal(response.status, 200, html.match(/Something went wrong[\s\S]{0,500}/)?.[0]);
    const paths = [...new Set([...html.matchAll(/src="(\/proof-renders\/[^\"]+)"/g)].map(m => m[1]))];
    assert.equal(paths.length, 2);
    for (const image of paths) assert.equal((await fetch(base + image)).status, 200);
    console.log(JSON.stringify({ run, status: response.status, sides: paths.length, serverResponsive: true, concurrentUploadBlocked: true, parentPeakMB: process.resourceUsage().maxRSS / 1024 }));
  }
  assert.deepEqual(fs.readdirSync(path.join(process.env.DATA_DIR, 'jobs')), []);
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}
