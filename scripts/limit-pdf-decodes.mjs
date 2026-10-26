import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const file = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
let source = fs.readFileSync(file, 'utf8');
// PDF.js starts all raster decoders concurrently. On small servers their
// temporary CMYK / transparency buffers can exceed the entire memory budget.
const before = '    PDFImage.buildImage({';
const after = '    await PDFImage.buildImage({';
if (!source.includes(after)) {
  if (source.split(before).length !== 2) throw new Error('PDF.js decoder changed; review memory patch before release.');
  source = source.replace(before, after);
}
const anchor = '    let optionalContent;\n    if (dict.has("OC")) {';
const metadata = `    // PressCheck metadata-only subprocess: retain placement operators without decoding pixels.
    if (typeof process !== "undefined" && process.env.PRESSCHECK_METADATA_ONLY === "1") {
      if (!dict.get("IM", "ImageMask")) {
        operatorList.addImageOps(OPS.paintImageXObject, ["metadata_" + this.idFactory.createObjId(), w, h]);
      }
      return;
    }
`;
if (!source.includes('// PressCheck metadata-only subprocess:')) {
  if (source.split(anchor).length !== 2) throw new Error('PDF.js image metadata hook changed.');
  source = source.replace(anchor, metadata + anchor);
}
fs.writeFileSync(file, source);
