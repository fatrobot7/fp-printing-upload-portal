import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Small vector-only fixture with explicit PDF page rotation and a valid xref.
function fixture(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  for (const [width, height, rotation] of pages) {
    const stream = '0.8 0.2 0.1 rg 20 30 100 60 re f\n';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotation} /Resources << >> /Contents ${objects.length + 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  const id = createHash('md5').update(pdf).digest('hex');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R /ID [<${id}><${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('PressCheck accepts rotation without modifying uploads or hiding real size errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'presscheck-rotation-'));
  process.env.DATA_DIR = dir;
  process.env.STAMP_SKIP_LISTEN = '1';
  const { app } = await import('../server.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [name, pages, wrongSize] of [
      ['portrait', [[306, 450, 0], [306, 450, 0]]],
      ['landscape', [[450, 306, 0], [450, 306, 0]]],
      ['rotated-90', [[306, 450, 90], [306, 450, 90]]],
      ['rotated-180', [[306, 450, 180], [306, 450, 180]]],
      ['rotated-270', [[306, 450, 270], [306, 450, 270]]],
      ['mixed', [[306, 450, 0], [306, 450, 90]]],
      ['wrong-size', [[600, 800, 90], [600, 800, 0]], true],
    ]) {
      const source = fixture(pages);
      const body = new FormData();
      body.set('preflightMode', 'quick');
      body.set('productCategory', 'postcards');
      body.set('productSize', '4x6');
      body.set('artwork', new Blob([source], { type: 'application/pdf' }), `${name}.pdf`);
      const response = await fetch(`${base}/upload`, { method: 'POST', body });
      const html = await response.text();
      assert.equal(response.status, 200, `${name}: ${html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ').slice(-4000)}`);
      assert.match(html, /PDF accepted/, name);
      if (wrongSize) assert.match(html, /Wrong page dimensions for this product/);
      else assert.doesNotMatch(html, /Wrong page dimensions for this product/);
      assert.doesNotMatch(html, /Front and back orientation may not match/);
      if (name === 'mixed') assert.match(html, /Mixed page orientations accepted/);
      const images = [...html.matchAll(/src="(\/proof-renders\/[^\"]+)"/g)];
      assert.ok(images.length >= 2, name);
      for (const url of new Set(images.map(m => m[1]))) {
        const png = Buffer.from(await (await fetch(base + url)).arrayBuffer());
        assert.equal(png.toString('ascii', 1, 4), 'PNG');
      }
      const stored = fs.readdirSync(path.join(dir, 'uploads')).filter(f => f.endsWith(`${name}.pdf`));
      assert.equal(stored.length, 1);
      assert.deepEqual(fs.readFileSync(path.join(dir, 'uploads', stored[0])), source);
    }
    assert.deepEqual(fs.readdirSync(path.join(dir, 'jobs')), []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
