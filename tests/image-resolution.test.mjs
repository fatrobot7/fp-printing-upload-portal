import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'presscheck-resolution-'));
process.env.DATA_DIR = dataDir;
process.env.STAMP_SKIP_LISTEN = '1';
const { analyzeImageResolution } = await import('../server.js');
test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

// Small in-memory PDF fixture, not customer artwork. A 200-DPI mask, a
// 300-DPI photo with alpha, and a 100-DPI photo outside the mask group.
function fixture(useMask = true) {
  const stream = (dict, content) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return Buffer.concat([Buffer.from(`<< ${dict} /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from('\nendstream')]);
  };
  const img = (pixels, extra = '') => stream(`/Type /XObject /Subtype /Image /Width ${pixels} /Height ${pixels} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ${extra}`, deflateSync(Buffer.alloc(pixels * pixels, 128)));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /ExtGState << /GS 5 0 R >> /XObject << /MaskForm 6 0 R /Photo 8 0 R /Low 10 0 R >> >> /Contents 4 0 R >>',
    stream('', `q ${useMask ? '/GS gs' : '/MaskForm Do'} 72 0 0 72 0 0 cm /Photo Do Q q 72 0 0 72 100 0 cm /Low Do Q`),
    '<< /Type /ExtGState /SMask << /S /Luminosity /G 6 0 R >> >>',
    stream('/Type /XObject /Subtype /Form /BBox [0 0 72 72] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /XObject << /Mask 7 0 R >> >>', 'q 72 0 0 72 0 0 cm /Mask Do Q'),
    img(200),
    img(300, '/SMask 9 0 R'),
    img(300),
    img(100),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  let length = chunks[0].length;
  objects.forEach((obj, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.from(obj), Buffer.from('\nendobj\n')]);
    chunks.push(chunk); length += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
  return Buffer.concat(chunks);
}

test('soft-mask content is separate; alpha photos and low-resolution artwork remain checked', async () => {
  const report = await analyzeImageResolution(fixture());
  assert.equal(report.transparencyMasks.length, 1);
  assert.equal(report.transparencyMasks[0].effectiveDpi, 200);
  assert.deepEqual(report.images.map(i => i.effectiveDpi).sort((a,b) => a-b), [100, 300]);
  assert.equal(report.lowResolutionImages.length, 1);
  assert.equal(report.worstImage.effectiveDpi, 100);
});

test('ordinary transparency groups are artwork, not excluded as shadows', async () => {
  const report = await analyzeImageResolution(fixture(false));
  assert.equal(report.transparencyMasks.length, 0);
  assert.deepEqual(report.images.map(i => i.effectiveDpi).sort((a,b) => a-b), [100, 200, 300]);
  assert.equal(report.lowResolutionImages.length, 2);
});
