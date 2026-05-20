import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const outputDir = path.join(appDir, 'public', 'templates', 'postcards');
fs.mkdirSync(outputDir, { recursive: true });

const BLEED = 0.125;
const SAFE = 0.125;
const postcardSizes = [
  { value: '2.75x4.25', label: 'Eighth Page' },
  { value: '2x5.5', label: 'Eighth Page Long' },
  { value: '4.25x3.5', label: 'Sixth Page' },
  { value: '2.75x5.5', label: 'Sixth Page Long' },
  { value: '4.25x5.5', label: 'Quarter Page' },
  { value: '2.75x8.5', label: 'Quarter Page Long' },
  { value: '3.5x8.5', label: 'Third Page' },
  { value: '4x6', label: 'Standard Postcard' },
  { value: '5x7', label: 'Premium Postcard' },
  { value: '4x9', label: 'Wide Postcard' },
  { value: '5.5x8.5', label: 'Half Page' },
  { value: '4.25x11', label: 'Half Page Long' },
  { value: '6x9', label: 'Deluxe' },
  { value: '6x11', label: 'Impact' },
  { value: '8.5x11', label: 'Full Page' },
  { value: '8.5x14', label: 'Legal Page' },
  { value: '11x17', label: 'Tabloid Size' },
];

function parseSize(value) {
  const [w, h] = value.split('x').map(Number);
  return { width: w, height: h };
}

function inchesToPoints(inches) {
  return inches * 72;
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function drawCropMarks(ctx, trimX, trimY, trimW, trimH, mark = 18) {
  ctx.save();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;

  const segments = [
    [trimX - mark, trimY, trimX - 4, trimY],
    [trimX + trimW + 4, trimY, trimX + trimW + mark, trimY],
    [trimX - mark, trimY + trimH, trimX - 4, trimY + trimH],
    [trimX + trimW + 4, trimY + trimH, trimX + trimW + mark, trimY + trimH],
    [trimX, trimY - mark, trimX, trimY - 4],
    [trimX, trimY + trimH + 4, trimX, trimY + trimH + mark],
    [trimX + trimW, trimY - mark, trimX + trimW, trimY - 4],
    [trimX + trimW, trimY + trimH + 4, trimX + trimW, trimY + trimH + mark],
  ];

  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segments) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.restore();
}

for (const size of postcardSizes) {
  const trim = parseSize(size.value);
  const bleedWidth = trim.width + (BLEED * 2);
  const bleedHeight = trim.height + (BLEED * 2);
  const pageW = inchesToPoints(bleedWidth);
  const pageH = inchesToPoints(bleedHeight);
  const trimInset = inchesToPoints(BLEED);
  const safeInset = inchesToPoints(BLEED + SAFE);

  const pdf = new PDFDocument({
    title: `FP Printing Template — ${size.label}`,
    producer: 'FP Printing Upload Portal',
    author: 'Skeeter',
    subject: `Blank postcard template for ${size.label}`,
  });

  const ctx = pdf.beginPage(pageW, pageH);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageW, pageH);

  ctx.fillStyle = 'rgba(255, 0, 170, 0.08)';
  ctx.fillRect(0, 0, pageW, pageH);

  ctx.clearRect(trimInset, trimInset, pageW - (trimInset * 2), pageH - (trimInset * 2));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(trimInset, trimInset, pageW - (trimInset * 2), pageH - (trimInset * 2));

  ctx.strokeStyle = '#ff00aa';
  ctx.lineWidth = 1.25;
  ctx.strokeRect(trimInset / 2, trimInset / 2, pageW - trimInset, pageH - trimInset);

  ctx.strokeStyle = '#00a3ff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(trimInset, trimInset, pageW - (trimInset * 2), pageH - (trimInset * 2));

  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(safeInset, safeInset, pageW - (safeInset * 2), pageH - (safeInset * 2));
  ctx.setLineDash([]);

  drawCropMarks(ctx, trimInset, trimInset, pageW - (trimInset * 2), pageH - (trimInset * 2));

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px Helvetica';
  ctx.fillText(`FP Printing Template — ${size.label}`, 18, 26);
  ctx.font = '12px Helvetica';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Trim: ${trim.width} × ${trim.height} in`, 18, 44);
  ctx.fillText(`File size with bleed: ${bleedWidth.toFixed(2)} × ${bleedHeight.toFixed(2)} in`, 18, 60);
  ctx.fillText('Magenta = bleed area • Blue = trim line • Dashed gray = safe area', 18, 76);

  ctx.save();
  ctx.translate(pageW - 14, pageH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font = '10px Helvetica';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Build at final size. Keep backgrounds/images extending through bleed.', 0, 0);
  ctx.restore();

  pdf.endPage();

  const fileName = `${slugify(size.label)}-${size.value.replace(/\./g, '_')}-template.pdf`;
  fs.writeFileSync(path.join(outputDir, fileName), pdf.close());
  console.log(`Created ${fileName}`);
}
