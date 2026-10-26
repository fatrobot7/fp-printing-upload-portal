import fs from 'node:fs';
process.env.STAMP_SKIP_LISTEN = '1';
const { analyzeImageResolution, renderProofImages } = await import('../server.js');
try {
  const [stage, file] = process.argv.slice(2);
  const result = stage === 'images'
    ? await analyzeImageResolution(fs.readFileSync(file))
    : await renderProofImages(file);
  process.send({ result, peakMB: process.resourceUsage().maxRSS / 1024 });
} catch (error) {
  process.send({ error: error.message });
  process.exitCode = 1;
}
process.disconnect();
