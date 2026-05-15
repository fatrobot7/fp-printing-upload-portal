import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, PDFDocument } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3030;
const host = process.env.HOST || '0.0.0.0';
const dataRoot = process.env.DATA_DIR || __dirname;

const uploadsDir = path.join(dataRoot, 'uploads');
const jobsDir = path.join(dataRoot, 'jobs');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(jobsDir, { recursive: true });

const LEGAL_POSTCARD_RULE = {
  name: 'Legal Postcard, Double-Sided, UV Both Sides',
  trimWidth: 8.5,
  trimHeight: 14,
  bleedWidth: 8.75,
  bleedHeight: 14.25,
  expectedPages: 2,
  tolerance: 0.03,
  categoryKey: 'postcards',
  sizeValue: '8.5x14',
  requiresTwoSided: true,
};

const DEFAULT_BLEED_INCHES = 0.125;
const DEFAULT_PAGE_COUNT_MESSAGE = '1 page unless supplied as a set';
const TWO_SIDED_CATEGORY_KEYS = new Set(['postcards', 'brochures', 'business-cards']);
const DEFAULT_MIN_ACCEPTABLE_IMAGE_DPI = 300;
const MIN_IMAGE_DISPLAY_INCHES = 0.25;

const PRODUCT_CATEGORIES = {
  booklets: {
    label: 'Booklets',
    helper: 'Choose the finished booklet size you want us to preflight. Interior spreads and cover files can still be reviewed under the current backend rules.',
    sizes: [
      { value: '5.5x8.5', label: 'Half Letter · 5.5 × 8.5 in' },
      { value: '6x9', label: 'Digest · 6 × 9 in' },
      { value: '8.5x11', label: 'Letter · 8.5 × 11 in' },
      { value: '11x17', label: 'Large Format · 11 × 17 in' },
    ],
  },
  brochures: {
    label: 'Brochures',
    helper: 'Select the flat size for the brochure panel set. Common folded brochure formats are listed here for quick client routing.',
    sizes: [
      { value: '8.5x11', label: 'Letter Brochure · 8.5 × 11 in' },
      { value: '8.5x14', label: 'Legal Brochure · 8.5 × 14 in' },
      { value: '11x17', label: 'Tabloid Brochure · 11 × 17 in' },
      { value: '11x25.5', label: 'Gate Fold Brochure · 11 × 25.5 in' },
    ],
  },
  'business-cards': {
    label: 'Business Cards',
    helper: 'Pick the finished card size before upload. We can still apply the existing PDF checks while the broader product rules are expanded later.',
    sizes: [
      { value: '3.5x2', label: 'Standard Business Card · 3.5 × 2 in' },
      { value: '3.5x1.75', label: 'Slim Business Card · 3.5 × 1.75 in' },
      { value: '2.5x2.5', label: 'Square Business Card · 2.5 × 2.5 in' },
      { value: '3.375x2.125', label: 'US Rounded Corner Card · 3.375 × 2.125 in' },
    ],
  },
  postcards: {
    label: 'Postcards',
    helper: 'These flyer and postcard sizes come from the Smart Levels size reference, so staff can route the right format before upload.',
    sizes: [
      { value: '2.75x4.25', label: 'Eighth Page · 2.75 × 4.25 in' },
      { value: '2x5.5', label: 'Eighth Page Long · 2.00 × 5.50 in' },
      { value: '4.25x3.5', label: 'Sixth Page · 4.25 × 3.5 in' },
      { value: '2.75x5.5', label: 'Sixth Page Long · 2.75 × 5.5 in' },
      { value: '4.25x5.5', label: 'Quarter Page · 4.25 × 5.5 in' },
      { value: '2.75x8.5', label: 'Quarter Page Long · 2.75 × 8.5 in' },
      { value: '3.5x8.5', label: 'Third Page · 3.5 × 8.5 in' },
      { value: '4x6', label: 'Standard Postcard · 4 × 6 in' },
      { value: '5x7', label: 'Premium Postcard · 5 × 7 in' },
      { value: '4x9', label: 'Wide Postcard · 4 × 9 in' },
      { value: '5.5x8.5', label: 'Half Page · 5.5 × 8.5 in' },
      { value: '4.25x11', label: 'Half Page Long · 4.25 × 11 in' },
      { value: '6x9', label: 'Deluxe · 6 × 9 in' },
      { value: '6x11', label: 'Impact · 6 × 11 in' },
      { value: '8.5x11', label: 'Full Page · 8.50 × 11 in' },
      { value: '8.5x14', label: 'Legal Page · 8.50 × 14 in' },
      { value: '11x17', label: 'Tabloid Size · 11 × 17 in' },
    ],
  },
  notepads: {
    label: 'Notepads',
    helper: 'Choose the finished pad size. These options cover the most common desk pad and tear-away memo formats.',
    sizes: [
      { value: '4.25x5.5', label: 'Memo Pad · 4.25 × 5.5 in' },
      { value: '5.5x8.5', label: 'Half Letter Pad · 5.5 × 8.5 in' },
      { value: '8.5x11', label: 'Letter Pad · 8.5 × 11 in' },
      { value: '8.5x14', label: 'Legal Pad · 8.5 × 14 in' },
    ],
  },
  'ncr-forms': {
    label: 'NCR Forms',
    helper: 'Select the finished form size for multipart NCR jobs. Standard office and invoice formats are ready here.',
    sizes: [
      { value: '5.5x8.5', label: 'Half Sheet NCR · 5.5 × 8.5 in' },
      { value: '8.5x7', label: 'Statement NCR · 8.5 × 7 in' },
      { value: '8.5x11', label: 'Letter NCR · 8.5 × 11 in' },
      { value: '8.5x14', label: 'Legal NCR · 8.5 × 14 in' },
    ],
  },
};

const DEFAULT_CATEGORY_KEY = 'postcards';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) return cb(new Error('Only PDF files are allowed in this prototype.'));
    cb(null, true);
  },
});

app.use('/uploads', express.static(uploadsDir));
app.use('/proof-renders', express.static(path.join(uploadsDir, '.renders')));
app.use('/proof-exports', express.static(path.join(uploadsDir, '.proofs')));
app.use(express.urlencoded({ extended: true }));

function renderPage(content, options = {}) {
  const categoryDataJson = JSON.stringify(PRODUCT_CATEGORIES);
  const defaultCategoryKey = options.defaultCategoryKey || DEFAULT_CATEGORY_KEY;

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FP Printing Upload Portal</title>
    <script>
      (() => {
        const savedTheme = localStorage.getItem('fp-printing-theme');
        const theme = savedTheme || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>
    <style>
      :root {
        --bg: #050816;
        --bg-soft: #091122;
        --panel: rgba(8, 14, 28, 0.74);
        --panel-strong: rgba(10, 17, 32, 0.9);
        --panel-soft: rgba(255, 255, 255, 0.05);
        --ink: #f7f9ff;
        --muted: #9aa9c9;
        --line: rgba(160, 190, 255, 0.16);
        --line-strong: rgba(160, 190, 255, 0.28);
        --brand: #86a8ff;
        --brand-dark: #5d7df0;
        --accent: #8cf0cf;
        --warn: #ffd37c;
        --danger: #ff8aa2;
        --lowres: #67e8f9;
        --lowres-deep: #0891b2;
        --proof-bg: #f0f0f0;
        --proof-line: #c8d0e4;
        --trim: #ffffff;
        --bleed: rgba(255, 0, 170, 0.6);
        --bleed-line: #ff4dc1;
        --proof-stage-base: linear-gradient(180deg, #040814 0%, #060c1a 40%, #08101d 100%);
        --proof-stage-grid: rgba(255,255,255,.02);
        --shadow: 0 30px 90px rgba(0,0,0,.42);
        --page-bg:
          radial-gradient(circle at 12% 0%, rgba(134,168,255,.18), transparent 28%),
          radial-gradient(circle at 88% 10%, rgba(140,240,207,.10), transparent 20%),
          linear-gradient(180deg, #040814 0%, #060c1a 40%, #08101d 100%);
        --page-grid: linear-gradient(180deg, rgba(255,255,255,.05), transparent 18%), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px);
        --card-bg: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.025));
        --card-border: var(--line);
        --badge-bg: rgba(255,255,255,.04);
        --badge-border: rgba(255,255,255,.08);
        --field-bg: rgba(255,255,255,.035);
        --field-label: #d9e4ff;
        --link: #d5e1ff;
      }
      html[data-theme="light"] {
        --bg: #eef3fb;
        --bg-soft: #f7faff;
        --panel: rgba(255, 255, 255, 0.82);
        --panel-strong: rgba(255, 255, 255, 0.94);
        --panel-soft: rgba(43, 82, 148, 0.05);
        --ink: #15233d;
        --muted: #5d6d8b;
        --line: rgba(68, 101, 158, 0.14);
        --line-strong: rgba(68, 101, 158, 0.28);
        --brand: #537ef7;
        --brand-dark: #365fd4;
        --accent: #099b74;
        --warn: #b87400;
        --danger: #d84f70;
        --lowres: #06b6d4;
        --lowres-deep: #0f766e;
        --proof-bg: #f5f5f5;
        --proof-line: #bec7d8;
        --trim: #ffffff;
        --bleed: rgba(255, 0, 170, 0.5);
        --bleed-line: #ff4dc1;
        --proof-stage-base: linear-gradient(180deg, #eef3fb 0%, #edf3fa 40%, #e8eef8 100%);
        --proof-stage-grid: rgba(31,57,108,.04);
        --shadow: 0 24px 70px rgba(39,67,120,.12);
        --page-bg:
          radial-gradient(circle at 12% 0%, rgba(83,126,247,.14), transparent 28%),
          radial-gradient(circle at 88% 10%, rgba(9,155,116,.08), transparent 20%),
          linear-gradient(180deg, #f7faff 0%, #eff4fb 46%, #e8eef8 100%);
        --page-grid: linear-gradient(180deg, rgba(255,255,255,.42), transparent 18%), linear-gradient(90deg, rgba(62,91,148,.035) 1px, transparent 1px), linear-gradient(rgba(62,91,148,.03) 1px, transparent 1px);
        --card-bg: linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.78));
        --card-border: rgba(72, 106, 168, 0.14);
        --badge-bg: rgba(83,126,247,.08);
        --badge-border: rgba(72,106,168,.12);
        --field-bg: rgba(255,255,255,.9);
        --field-label: #28406f;
        --link: #365fd4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Instrument Sans", "Avenir Next", "Segoe UI", sans-serif;
        background: var(--page-bg);
        color: var(--ink);
        transition: background 220ms ease, color 220ms ease;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background: var(--page-grid);
        background-size: auto, 40px 40px, 40px 40px;
        mask-image: linear-gradient(180deg, rgba(0,0,0,.95), transparent 86%);
        pointer-events: none;
      }
      .wrap { max-width: 1340px; margin: 0 auto; padding: 28px 18px 56px; }
      .page-topbar {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 14px;
      }
      .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--badge-border);
        background: var(--badge-bg);
        color: var(--ink);
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 12px 28px rgba(0,0,0,.08);
      }
      .theme-toggle span {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.6));
        color: #334a78;
      }
      html[data-theme="light"] .theme-toggle span {
        background: linear-gradient(180deg, rgba(83,126,247,.16), rgba(83,126,247,.08));
        color: #365fd4;
      }
      .card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 30px;
        padding: 24px;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        box-shadow: var(--shadow);
      }
      h1,h2,h3,p,ul { margin-top: 0; }
      h1,h2,h3,label,.eyebrow,.stat-value,.proof-legend strong,.btn,.proof-tab,.pill,.section-kicker { letter-spacing: -.02em; }
      h1 { font-size: clamp(2.8rem, 5vw, 5.4rem); line-height: .92; margin-bottom: 18px; max-width: 12ch; }
      h2 { font-size: 1.25rem; margin-bottom: 12px; }
      h3 { font-size: 1rem; margin-bottom: 6px; }
      .muted { color: var(--muted); }
      .eyebrow, .section-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid var(--badge-border);
        background: var(--badge-bg);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--field-label);
      }
      .eyebrow-link {
        text-decoration: none;
        color: inherit;
      }
      .eyebrow-link:hover {
        background: rgba(255,255,255,.08);
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr);
        gap: 18px;
        align-items: stretch;
      }
      .hero-panel {
        position: relative;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02)),
          radial-gradient(circle at top left, rgba(134,168,255,.18), transparent 36%);
      }
      .hero-panel::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,.07), transparent 30%, transparent 70%, rgba(255,255,255,.04));
        pointer-events: none;
      }
      .hero-panel::after {
        content: "";
        position: absolute;
        inset: auto -30px -70px auto;
        width: 280px;
        height: 280px;
        border-radius: 50%;
        background: radial-gradient(circle, var(--hero-burst, rgba(93,125,240,.26)), transparent 64%);
        filter: blur(2px);
        pointer-events: none;
      }
      .hero-copy { position: relative; z-index: 1; max-width: 760px; }
      .hero-copy p { font-size: 1.03rem; line-height: 1.65; max-width: 62ch; }
      .hero-stats, .highlight-grid, .info-grid, .proof-meta { display:grid; gap:12px; }
      .hero-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24px; }
      .stat {
        border: 1px solid var(--badge-border);
        border-radius: 20px;
        padding: 16px;
        background: var(--badge-bg);
      }
      .stat-value { font-size: 1.35rem; font-weight: 700; margin-bottom: 4px; }
      .highlight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .highlight {
        padding: 16px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      }
      .grid { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:16px; }
      .field { display:grid; gap:8px; }
      .field.full { grid-column: 1 / -1; }
      label { font-size: 13px; font-weight: 700; color: var(--field-label); }
      input, select, textarea {
        width: 100%; border: 1px solid var(--line); border-radius: 18px; padding: 15px 16px;
        font: inherit; color: var(--ink); background: var(--field-bg);
        outline: none;
      }
      input:focus, select:focus, textarea:focus { border-color: var(--line-strong); box-shadow: 0 0 0 4px rgba(134,168,255,.12); }
      input[type="file"] { padding: 12px; background: var(--field-bg); }
      textarea { min-height: 100px; resize: vertical; }
      .btn {
        border: 0; border-radius: 999px; padding: 15px 24px;
        background: linear-gradient(180deg, var(--brand), var(--brand-dark));
        color: #fff; font-weight: 800; cursor: pointer;
        box-shadow: 0 14px 32px rgba(95,125,240,.34);
      }
      .btn:hover { transform: translateY(-1px); }
      .stack { display:grid; gap:14px; }
      .pill { display:inline-block; padding:8px 12px; border-radius:999px; font-size:12px; font-weight:800; }
      .result-pill {
        padding: 11px 16px;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: .03em;
      }
      .pass { background: rgba(126,226,168,.14); color: var(--accent); }
      .warning { background: rgba(255,209,102,.14); color: var(--warn); }
      .fail { background: rgba(255,126,145,.14); color: var(--danger); }
      .finding { padding: 16px; border: 1px solid var(--line); border-radius: 20px; background: var(--badge-bg); }
      .finding.finding-attention {
        border-color: rgba(103, 232, 249, .6);
        background: linear-gradient(180deg, rgba(103, 232, 249, .16), rgba(255,255,255,.04));
        box-shadow: 0 0 0 1px rgba(103, 232, 249, .14), 0 18px 38px rgba(103, 232, 249, .14);
      }
      .finding-action-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
      }
      .finding-action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid rgba(103, 232, 249, .72);
        border-radius: 999px;
        padding: 10px 14px;
        background: linear-gradient(180deg, rgba(165, 243, 252, .96), rgba(34, 211, 238, .92));
        color: #04131a;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 14px 32px rgba(34, 211, 238, .22);
      }
      .finding-action-btn:hover,
      .finding-action-btn.active,
      .proof-action-btn.active {
        transform: translateY(-1px);
        box-shadow: 0 18px 36px rgba(34, 211, 238, .3);
      }
      .finding-action-meta {
        font-size: 12px;
        color: var(--muted);
      }
      .proof-action-btn[data-lowres-toggle] {
        border-color: rgba(103, 232, 249, .72);
        background: linear-gradient(180deg, rgba(165, 243, 252, .96), rgba(34, 211, 238, .92));
        color: #04131a;
        box-shadow: 0 14px 28px rgba(34, 211, 238, .24);
      }
      .proof-action-btn[data-lowres-toggle]:hover,
      .proof-action-btn[data-lowres-toggle].active {
        border-color: rgba(165, 243, 252, .96);
        box-shadow: 0 18px 34px rgba(34, 211, 238, .3);
      }
      .spec-list { margin: 0; padding-left: 18px; color: var(--muted); }
      .spec-list li { margin-bottom: 8px; }
      .two-col { display:grid; gap:16px; grid-template-columns: 1fr; }
      .details-grid { display:grid; gap:16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .proof-card {
        background: var(--card-bg);
        border: 1px solid var(--card-border);
        border-radius: 26px;
        padding: 18px;
      }
      .proof-toolbar {
        display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start; justify-content:space-between;
        margin-bottom: 14px;
      }
      .proof-tabs, .proof-modes, .proof-angle-presets, .proof-actions { display:flex; gap:10px; flex-wrap:wrap; }
      .proof-tab, .proof-mode, .proof-angle-btn, .proof-tool-btn, .proof-action-btn {
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 94, 132, 0.42);
        background: linear-gradient(180deg, rgba(255, 93, 132, 0.22), rgba(116, 20, 43, 0.52));
        color: #fff4f7;
        font-weight: 800;
        cursor: pointer;
        text-decoration: none;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.12),
          0 0 0 1px rgba(255, 90, 126, 0.05),
          0 10px 30px rgba(255, 58, 102, 0.18);
        transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease;
      }
      .proof-tab:hover, .proof-mode:hover, .proof-angle-btn:hover, .proof-tool-btn:hover, .proof-action-btn:hover,
      .proof-tab.active, .proof-mode.active, .proof-tool-btn.active {
        background: linear-gradient(180deg, rgba(255, 116, 150, 0.42), rgba(170, 24, 63, 0.74));
        border-color: rgba(255, 126, 158, 0.7);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.16),
          0 0 22px rgba(255, 72, 117, 0.24),
          0 16px 34px rgba(255, 52, 95, 0.24);
        transform: translateY(-1px);
      }
      .proof-controls-callout {
        position: relative;
        margin: 0 0 18px;
        padding: 18px;
        border-radius: 26px;
        overflow: hidden;
        border: 1px solid rgba(255, 84, 124, 0.38);
        background:
          radial-gradient(circle at 12% 30%, rgba(255, 84, 124, 0.32), transparent 28%),
          radial-gradient(circle at 88% 18%, rgba(255, 128, 86, 0.20), transparent 24%),
          linear-gradient(135deg, rgba(44, 8, 18, 0.92), rgba(18, 8, 20, 0.9));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 0 0 1px rgba(255, 86, 126, 0.08),
          0 24px 80px rgba(255, 58, 93, 0.18);
      }
      .proof-controls-callout::before {
        content: "";
        position: absolute;
        inset: -25% auto auto 62%;
        width: 240px;
        height: 240px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 86, 126, 0.42), transparent 68%);
        filter: blur(16px);
        pointer-events: none;
      }
      .proof-controls-callout::after {
        content: "PROOF TOOLS";
        position: absolute;
        right: 18px;
        bottom: 14px;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .28em;
        color: rgba(255,255,255,.22);
      }
      .proof-controls-grid {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 16px;
        align-items: center;
        justify-items: center;
      }
      .proof-controls-copy {
        display: grid;
        gap: 8px;
        justify-items: center;
        text-align: center;
      }
      .proof-controls-copy h3 {
        font-size: 1.1rem;
        margin-bottom: 0;
      }
      .proof-controls-copy p {
        margin-bottom: 0;
        color: rgba(236, 227, 235, 0.82);
        max-width: 64ch;
      }
      .proof-controls-badges {
        display: flex;
        flex-wrap: nowrap;
        gap: 10px;
        justify-content: center;
        align-items: center;
        width: 100%;
      }
      .proof-controls-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.06);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        color: #fff4f7;
        font-size: 13px;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
        min-width: 120px;
      }
      .proof-controls-badge:hover,
      .proof-controls-badge.active {
        background: linear-gradient(180deg, rgba(255, 116, 150, 0.34), rgba(170, 24, 63, 0.68));
        border-color: rgba(255, 126, 158, 0.7);
        box-shadow: 0 0 22px rgba(255, 72, 117, 0.22), 0 16px 34px rgba(255, 52, 95, 0.2);
      }
      .proof-controls-badge span {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: linear-gradient(180deg, rgba(255,110,140,.9), rgba(255,60,110,.78));
        box-shadow: 0 8px 20px rgba(255, 76, 121, 0.28);
        font-size: 13px;
      }
      .visually-hidden {
        position: absolute !important;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .proof-stage {
        position: relative;
        display:flex; align-items:center; justify-content:center;
        min-height: 760px; border-radius: 24px; padding: 24px;
        background:
          radial-gradient(circle at 12% 0%, rgba(165, 183, 255, .16), transparent 26%),
          radial-gradient(circle at 88% 12%, rgba(255, 196, 214, .16), transparent 18%),
          linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.38) 18%),
          linear-gradient(90deg, rgba(121,139,184,.035) 1px, transparent 1px),
          linear-gradient(rgba(121,139,184,.03) 1px, transparent 1px),
          linear-gradient(180deg, #fbfcff 0%, #f4f6fb 48%, #eef2f8 100%);
        background-size: auto, auto, auto, 44px 44px, 44px 44px, auto;
        background-position: 0 0, 0 0, 0 0, 0 0, 0 0, 0 0;
        overflow: auto;
      }
      .proof-sheet {
        position: relative;
        background: var(--proof-bg);
        border: 1px solid var(--proof-line);
        box-shadow: 0 20px 60px rgba(0,0,0,.28);
      }
      .proof-sheet.is-magnify-active, .proof-print-piece.is-magnify-active {
        cursor: zoom-in;
      }
      .proof-print-piece {
        position: relative;
        overflow: hidden;
        background: var(--proof-bg);
        border: 1px solid var(--proof-line);
        box-shadow: 0 20px 60px rgba(0,0,0,.28);
      }
      .proof-print-piece::after {
        content: "PRINT / TRIMMED VIEW";
        position: absolute;
        top: 12px;
        left: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(7,17,27,.86);
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
      }
      .proof-safe {
        position: absolute;
        pointer-events: none;
      }
      .proof-safe.trim {
        background: transparent;
        border: 3px solid var(--trim);
        box-shadow: 0 0 0 1px rgba(255,255,255,.22);
      }
      .proof-safe.trim::after {
        content: "UNCUT SIZE";
        position: absolute;
        top: -34px;
        left: 0;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(7,17,27,.86);
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
      }
      .proof-safe.bleed-guide {
        border: 2px dashed rgba(255,255,255,.42);
      }
      .proof-bleed-band {
        position: absolute;
        background: var(--bleed);
        pointer-events: none;
      }
      .proof-image {
        display:block;
        width: 100%;
        height: 100%;
        object-fit: fill;
      }
      .proof-print-image {
        position: absolute;
        display:block;
        object-fit: fill;
      }
      .crop-mark {
        position: absolute;
        background: var(--trim);
        pointer-events: none;
      }
      .proof-lowres-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease;
      }
      .proof-stage[data-lowres-visible="true"] .proof-lowres-layer {
        opacity: 1;
        pointer-events: auto;
      }
      .proof-lowres-box {
        position: absolute;
        display: block;
        border: 2px solid rgba(103, 232, 249, .98);
        background: rgba(34, 211, 238, .28);
        box-shadow: 0 0 0 9999px rgba(34, 211, 238, .1) inset, 0 0 0 1px rgba(255,255,255,.18), 0 0 24px rgba(34, 211, 238, .34);
        pointer-events: auto;
        cursor: help;
        overflow: visible;
      }
      .proof-lowres-box span {
        position: absolute;
        top: -28px;
        left: 0;
        padding: 5px 8px;
        border-radius: 999px;
        background: rgba(8, 145, 178, .94);
        color: #eaffff;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .08em;
        white-space: nowrap;
      }
      .proof-lowres-layer--print .proof-lowres-box span {
        top: 8px;
        left: 8px;
      }
      .proof-lowres-banner {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(103, 232, 249, .44);
        background: linear-gradient(180deg, rgba(34, 211, 238, .14), rgba(255,255,255,.03));
      }
      .crop-mark.h { height: 2px; }
      .crop-mark.v { width: 2px; }
      .proof-3d-view {
        display: none;
        width: 100%;
        max-width: min(100%, 780px);
        align-self: stretch;
      }
      .proof-3d-stack {
        display: grid;
        gap: 18px;
        width: 100%;
        justify-items: center;
      }
      .proof-3d-scene {
        width: min(100%, 560px);
        perspective: 1800px;
        display: grid;
        place-items: center;
        padding: 18px;
      }
      .proof-3d-card {
        position: relative;
        transform-style: preserve-3d;
        transform: rotateX(var(--proof-rotation-x, 0deg)) rotateY(var(--proof-rotation-y, 0deg));
        transition: transform 240ms ease;
      }
      .proof-face {
        position: absolute;
        inset: 0;
        overflow: hidden;
        backface-visibility: hidden;
        border: 1px solid var(--proof-line);
        background: var(--proof-bg);
        box-shadow: 0 20px 60px rgba(0,0,0,.28);
      }
      .proof-face img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: fill;
      }
      .proof-face.back-x { transform: rotateX(180deg); }
      .proof-face.back-x img,
      .proof-face.back-x .proof-face-placeholder {
        transform: rotate(180deg);
        transform-origin: center;
      }
      .proof-face.back-y { transform: rotateY(180deg); }
      .proof-face-label {
        position: absolute;
        top: 12px;
        left: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(7,17,27,.86);
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
      }
      .proof-face-placeholder {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        padding: 24px;
        text-align: center;
        color: #24324f;
        background: linear-gradient(180deg, rgba(134,168,255,.18), rgba(255,255,255,.86));
      }
      .proof-3d-controls {
        width: min(100%, 620px);
        display: grid;
        gap: 14px;
        padding: 18px;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(5, 12, 24, 0.58);
      }
      .proof-3d-slider-row {
        display: grid;
        gap: 8px;
      }
      .proof-3d-slider-row input[type="range"] {
        padding: 0;
        accent-color: var(--brand);
      }
      .proof-angle-readout {
        font-size: 13px;
        color: #dce5fb;
      }
      .proof-confirm {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 12px 14px;
        margin-top: 6px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(255, 207, 84, .45);
        background: linear-gradient(180deg, rgba(255, 207, 84, .18), rgba(255, 255, 255, .06));
        color: #fff4c2;
        font-size: 15px;
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 14px 32px rgba(0,0,0,.16);
      }
      .proof-confirm::before {
        content: "REQUIRED";
        align-self: start;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255, 207, 84, .2);
        border: 1px solid rgba(255, 207, 84, .45);
        color: #ffe48b;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .08em;
      }
      .proof-confirm small {
        display: block;
        margin-top: 4px;
        color: rgba(255,255,255,.78);
        font-size: 12px;
        font-weight: 500;
      }
      .proof-confirm input {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: #ffd54a;
      }
      .proof-sheet-view, .proof-print-view { display: none; }
      .proof-stage[data-view="bleed"] .proof-sheet-view { display: block; }
      .proof-stage[data-view="print"] .proof-print-view { display: block; }
      .proof-stage[data-view="magnify"] .proof-sheet-view { display: block; }
      .proof-stage[data-view="3d"] .proof-3d-view { display: grid; }
      .proof-magnifier {
        position: fixed;
        width: 300px;
        height: 300px;
        border-radius: 24px;
        border: 1px solid rgba(255,255,255,.18);
        background-color: #fff;
        background-repeat: no-repeat;
        box-shadow: 0 24px 70px rgba(0,0,0,.4);
        pointer-events: none;
        z-index: 20;
        display: none;
        overflow: hidden;
      }
      .proof-magnifier::before {
        content: "ZOOM";
        position: absolute;
        top: 12px;
        left: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(7,17,27,.86);
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
      }
      .proof-export-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 16px;
      }
      .proof-export-card {
        padding: 16px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.035);
      }
      .proof-export-card a {
        display: inline-flex;
        margin-top: 10px;
      }
      .proof-status-note {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.035);
      }
      .staff-shell { display:grid; gap:18px; }
      .staff-summary { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; }
      .staff-queue { display:grid; gap:14px; }
      .staff-job {
        display:grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
        gap:16px;
        padding: 18px;
        border-radius: 24px;
        border: 1px solid rgba(255,255,255,.08);
        background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.025));
      }
      .staff-job-main, .staff-job-side, .staff-mini-grid { display:grid; gap:12px; }
      .staff-mini-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .staff-kicker {
        display:inline-flex;
        gap:8px;
        align-items:center;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: #dce5fb;
      }
      .staff-actions { display:flex; flex-wrap:wrap; gap:10px; }
      .staff-action-link {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,.04);
        color: var(--ink);
        font-weight: 700;
        text-decoration: none;
      }
      .staff-action-link:hover { background: rgba(123,156,255,.2); border-color: rgba(123,156,255,.45); }
      .staff-findings { display:grid; gap:10px; }
      .staff-empty {
        padding: 32px;
        border-radius: 26px;
        border: 1px dashed rgba(255,255,255,.12);
        text-align:center;
        color: var(--muted);
      }
      .proof-legend {
        display:flex;
        flex-wrap:wrap;
        gap:12px;
        margin-top: 14px;
        color: var(--muted);
        font-size: 13px;
      }
      .legend-key {
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.03);
      }
      .legend-swatch {
        width: 18px;
        height: 12px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,.18);
      }
      .proof-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .meta-chip {
        border: 1px solid var(--line); border-radius: 20px; padding: 14px 15px;
        background: rgba(255,255,255,.03);
      }
      .info-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .upload-hint {
        padding: 14px 16px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.03);
      }
      .selection-shell {
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.025));
      }
      .selection-grid { display:grid; gap:16px; grid-template-columns: 1fr 1fr; }
      .helper-card {
        margin-top: 16px;
        padding: 16px 18px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(6, 12, 24, 0.62);
      }
      .helper-card strong { display:block; margin-bottom:6px; }
      .spec-panel {
        margin-top: 14px;
        display: none;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .spec-panel.is-visible { display: grid; }
      .spec-chip {
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 18px;
        padding: 12px 14px;
        background: rgba(255,255,255,.035);
      }
      .spec-chip strong {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: #dce5fb;
        margin-bottom: 4px;
      }
      .spec-chip span { color: var(--muted); }
      a { color: var(--link); }
      @media (max-width: 1100px) {
        .hero { grid-template-columns: 1fr; }
      }
      @media (max-width: 980px) {
        .proof-stage { min-height: 520px; }
        .details-grid { grid-template-columns: 1fr; }
        .staff-job { grid-template-columns: 1fr; }
      }
      @media (max-width: 800px) {
        .grid, .proof-meta, .info-grid, .highlight-grid, .hero-stats, .details-grid, .staff-summary, .staff-mini-grid, .proof-controls-grid { grid-template-columns: 1fr; }
        .proof-controls-badges {
          flex-wrap: wrap;
          justify-content: center;
        }
      }
    </style>
  </head>
  <body><div class="wrap"><div class="page-topbar"><button type="button" class="theme-toggle" data-theme-toggle><span data-theme-icon>🌙</span><strong data-theme-label>Dark mode</strong></button></div>${content}</div>
  <script>
    const productCategories = ${categoryDataJson};
    const defaultCategoryKey = ${JSON.stringify(defaultCategoryKey)};
    const themeToggle = document.querySelector('[data-theme-toggle]');
    const themeLabel = document.querySelector('[data-theme-label]');
    const themeIcon = document.querySelector('[data-theme-icon]');
    const categorySelect = document.querySelector('[data-category-select]');
    const sizeSelect = document.querySelector('[data-size-select]');
    const helperHeading = document.querySelector('[data-category-heading]');
    const helperText = document.querySelector('[data-category-helper]');
    const specPanel = document.querySelector('[data-spec-panel]');
    const specTrim = document.querySelector('[data-spec-trim]');
    const specBleed = document.querySelector('[data-spec-bleed]');
    const specPages = document.querySelector('[data-spec-pages]');
    const specResolution = document.querySelector('[data-spec-resolution]');
    const specNote = document.querySelector('[data-spec-note]');

    function syncThemeUi(theme) {
      if (!themeLabel || !themeIcon) return;
      themeLabel.textContent = theme === 'light' ? 'Light mode' : 'Dark mode';
      themeIcon.textContent = theme === 'light' ? '☀️' : '🌙';
    }

    if (themeToggle) {
      syncThemeUi(document.documentElement.getAttribute('data-theme') || 'dark');
      themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('fp-printing-theme', nextTheme);
        syncThemeUi(nextTheme);
      });
    }

    function parseSizeValue(value) {
      const parts = String(value || '').split('x').map(Number);
      if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
      return { width: parts[0], height: parts[1] };
    }

    function formatDimension(value) {
      return Number(value).toFixed(2).replace(/\.00$/, '');
    }

    function buildSpecData(categoryKey, sizeValue) {
      const dims = parseSizeValue(sizeValue);
      if (!dims) return null;
      const bleedWidth = dims.width + 0.25;
      const bleedHeight = dims.height + 0.25;
      const twoSidedCategories = new Set(['postcards', 'brochures', 'business-cards']);
      const expectedPages = twoSidedCategories.has(categoryKey) ? '2 pages / 2 sides' : '1 page unless supplied as a set';
      const categoryNotes = {
        postcards: 'Use postcard specs when the job is a front/back mail piece. Legal Page postcard remains the current deepest backend rule.',
        brochures: 'Supply flat artwork at final open size with bleed beyond every outside edge.',
        'business-cards': 'Keep logos and type safely inside the trim to avoid edge crowding after cutting.',
        booklets: 'Booklet interiors and covers may arrive as separate PDFs, but finished trim and bleed still need to match.',
        notepads: 'Notepad files should be built at finished pad size with bleed if art touches the edge.',
        'ncr-forms': 'NCR forms should preserve clean margins for numbering, perf marks, and writing areas.',
      };
      return {
        trim: formatDimension(dims.width) + ' × ' + formatDimension(dims.height) + ' in',
        bleed: formatDimension(bleedWidth) + ' × ' + formatDimension(bleedHeight) + ' in',
        pages: expectedPages,
        resolution: '300 DPI minimum for placed raster artwork',
        note: categoryNotes[categoryKey] || 'Build the PDF at final trim size plus 0.125 inch bleed on each side.',
      };
    }

    function clearSelectionUi() {
      if (categorySelect) categorySelect.value = '';
      if (sizeSelect) {
        sizeSelect.innerHTML = '<option value="" selected>Choose a category first</option>';
        sizeSelect.disabled = true;
        sizeSelect.value = '';
      }
      if (helperHeading) helperHeading.textContent = 'Choose a category to begin';
      if (helperText) helperText.textContent = 'Product specs will appear after you choose a category and finished size.';
      if (specPanel) specPanel.classList.remove('is-visible');
    }

    function updateSpecPanel(categoryKey, sizeValue) {
      if (!specPanel) return;
      const specData = buildSpecData(categoryKey, sizeValue);
      if (!specData) {
        specPanel.classList.remove('is-visible');
        return;
      }
      if (specTrim) specTrim.textContent = specData.trim;
      if (specBleed) specBleed.textContent = specData.bleed;
      if (specPages) specPages.textContent = specData.pages;
      if (specResolution) specResolution.textContent = specData.resolution;
      if (specNote) specNote.textContent = specData.note;
      specPanel.classList.add('is-visible');
    }

    function updateSizeOptions(categoryKey) {
      if (!categorySelect || !sizeSelect) return;
      if (!categoryKey || !productCategories[categoryKey]) {
        clearSelectionUi();
        return;
      }
      const selectedCategory = productCategories[categoryKey];
      sizeSelect.disabled = false;
      sizeSelect.innerHTML = '<option value="" selected>Choose a size</option>';
      selectedCategory.sizes.forEach((size) => {
        const option = document.createElement('option');
        option.value = size.value;
        option.textContent = size.label;
        sizeSelect.appendChild(option);
      });
      if (helperHeading) helperHeading.textContent = selectedCategory.label + ' size guidance';
      if (helperText) helperText.textContent = selectedCategory.helper;
      updateSpecPanel(categoryKey, '');
    }

    if (categorySelect && sizeSelect) {
      categorySelect.addEventListener('change', (event) => updateSizeOptions(event.target.value));
      sizeSelect.addEventListener('change', (event) => updateSpecPanel(categorySelect.value, event.target.value));
      clearSelectionUi();
    }

    const tabs = document.querySelectorAll('[data-proof-tab]');
    const panels = document.querySelectorAll('[data-proof-panel]');
    const modeButtons = document.querySelectorAll('[data-proof-mode]');
    const calloutButtons = document.querySelectorAll('[data-proof-callout-mode]');
    const rotationInputsX = document.querySelectorAll('[data-proof-rotation-x]');
    const rotationOutputsX = document.querySelectorAll('[data-proof-rotation-output-x]');
    const rotationInputsY = document.querySelectorAll('[data-proof-rotation-y]');
    const rotationOutputsY = document.querySelectorAll('[data-proof-rotation-output-y]');
    const angleButtons = document.querySelectorAll('[data-proof-angle]');
    const magnifyButtons = document.querySelectorAll('[data-proof-magnify-toggle]');
    const magnifyTargets = document.querySelectorAll('[data-magnify-target]');
    const magnifiers = document.querySelectorAll('[data-proof-magnifier]');
    const orientationChecks = document.querySelectorAll('[data-proof-orientation-confirm]');
    const proofLinks = document.querySelectorAll('[data-proof-export-link]');
    const orientationStatuses = document.querySelectorAll('[data-orientation-status]');
    const lowResFocusButtons = document.querySelectorAll('[data-lowres-focus]:not([data-lowres-toggle])');
    const lowResToggleButtons = document.querySelectorAll('[data-lowres-toggle]');
    const proofCard = document.querySelector('.proof-card');
    let magnifyEnabled = false;
    let currentProofMode = 'bleed';
    let lowResVisible = false;

    function syncOrientationConfirmation() {
      const isConfirmed = Array.from(orientationChecks).some((input) => input.checked);
      proofLinks.forEach((link) => {
        const url = new URL(link.href, window.location.origin);
        url.searchParams.set('orientationConfirmed', isConfirmed ? 'yes' : 'no');
        link.href = url.pathname + url.search;
      });
      orientationStatuses.forEach((status) => {
        status.textContent = isConfirmed ? 'Client marked orientation as correct' : 'Waiting on client orientation confirmation';
      });
    }

    function hideMagnifiers() {
      magnifiers.forEach((magnifier) => {
        magnifier.style.display = 'none';
      });
    }

    function activateProofTab(target) {
      if (!target) return;
      tabs.forEach((item) => item.classList.toggle('active', item.getAttribute('data-proof-tab') === target));
      panels.forEach((panel) => {
        panel.style.display = panel.getAttribute('data-proof-panel') === target ? 'flex' : 'none';
      });
    }

    function syncLowResUi() {
      panels.forEach((panel) => panel.setAttribute('data-lowres-visible', lowResVisible ? 'true' : 'false'));
      [...lowResToggleButtons, ...lowResFocusButtons].forEach((button) => {
        button.classList.toggle('active', lowResVisible);
        const offLabel = button.getAttribute('data-lowres-label-off') || 'See problems';
        const onLabel = button.getAttribute('data-lowres-label-on') || 'Hide problems';
        button.textContent = lowResVisible ? onLabel : offLabel;
      });
    }

    function focusLowResolutionAreas(target) {
      if (target) activateProofTab(target);
      setProofMode('bleed');
      setMagnifyEnabled(false);
      lowResVisible = true;
      syncLowResUi();
      if (proofCard) proofCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function setMagnifyEnabled(nextValue) {
      magnifyEnabled = Boolean(nextValue);
      magnifyButtons.forEach((button) => button.classList.toggle('active', magnifyEnabled));
      calloutButtons.forEach((button) => {
        if (button.getAttribute('data-proof-callout-mode') === 'magnify') {
          button.classList.toggle('active', magnifyEnabled);
        }
      });
      magnifyTargets.forEach((target) => target.classList.toggle('is-magnify-active', magnifyEnabled));
      if (!magnifyEnabled) hideMagnifiers();
    }

    function syncProofRotationX(value) {
      const degrees = Number(value) || 0;
      panels.forEach((panel) => panel.style.setProperty('--proof-rotation-x', degrees + 'deg'));
      rotationInputsX.forEach((input) => {
        if (input.value !== String(degrees)) input.value = String(degrees);
      });
      rotationOutputsX.forEach((output) => {
        output.textContent = degrees + '° on the X axis';
      });
    }

    function syncProofRotationY(value) {
      const degrees = Number(value) || 0;
      panels.forEach((panel) => panel.style.setProperty('--proof-rotation-y', degrees + 'deg'));
      rotationInputsY.forEach((input) => {
        if (input.value !== String(degrees)) input.value = String(degrees);
      });
      rotationOutputsY.forEach((output) => {
        output.textContent = degrees + '° on the Y axis';
      });
    }
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        activateProofTab(tab.getAttribute('data-proof-tab'));
      });
    });
    function setProofMode(mode) {
      currentProofMode = mode;
      modeButtons.forEach((item) => item.classList.toggle('active', item.getAttribute('data-proof-mode') === mode));
      calloutButtons.forEach((item) => item.classList.toggle('active', item.getAttribute('data-proof-callout-mode') === mode));
      panels.forEach((panel) => {
        panel.setAttribute('data-view', mode);
      });
      if (mode !== 'magnify' && magnifyEnabled) setMagnifyEnabled(false);
    }

    modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setProofMode(button.getAttribute('data-proof-mode'));
      });
    });
    calloutButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-proof-callout-mode');
        if (mode === 'magnify') {
          const shouldDisableMagnify = magnifyEnabled || currentProofMode === 'magnify';
          if (shouldDisableMagnify) {
            setMagnifyEnabled(false);
            setProofMode('bleed');
          } else {
            setProofMode('magnify');
            setMagnifyEnabled(true);
          }
          return;
        }
        if (mode === 'proof') {
          const link = document.querySelector('[data-proof-export-link]');
          if (link) window.location.href = link.href;
          return;
        }
        setProofMode(mode);
      });
    });
    magnifyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (magnifyEnabled || currentProofMode === 'magnify') {
          setMagnifyEnabled(false);
          setProofMode('bleed');
          return;
        }
        setProofMode('magnify');
        setMagnifyEnabled(true);
      });
    });
    lowResFocusButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-lowres-focus');
        if (!lowResVisible) {
          focusLowResolutionAreas(target);
          return;
        }
        lowResVisible = false;
        syncLowResUi();
      });
    });
    lowResToggleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-lowres-focus');
        if (!lowResVisible) {
          focusLowResolutionAreas(target);
          return;
        }
        lowResVisible = false;
        syncLowResUi();
      });
    });
    magnifyTargets.forEach((target) => {
      target.addEventListener('mousemove', (event) => {
        if (!magnifyEnabled) return;
        const magnifierId = target.getAttribute('data-magnifier-id');
        const magnifier = document.querySelector('[data-proof-magnifier-id="' + magnifierId + '"]');
        if (!magnifier) return;
        if (magnifier.parentElement !== document.body) document.body.appendChild(magnifier);
        const rect = target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const imgWidth = Number(target.getAttribute('data-img-width')) || rect.width;
        const imgHeight = Number(target.getAttribute('data-img-height')) || rect.height;
        const imgLeft = Number(target.getAttribute('data-img-left')) || 0;
        const imgTop = Number(target.getAttribute('data-img-top')) || 0;
        const zoom = Number(target.getAttribute('data-zoom')) || 2.4;
        const imageX = x - imgLeft;
        const imageY = y - imgTop;
        const lensWidth = magnifier.offsetWidth || 300;
        const lensHeight = magnifier.offsetHeight || 300;

        const margin = 12;
        const cursorOffset = 14;
        const viewportRight = window.innerWidth - lensWidth - margin;
        const viewportBottom = window.innerHeight - lensHeight - margin;

        let resolvedLeft = event.clientX + cursorOffset;
        if (resolvedLeft > viewportRight) {
          resolvedLeft = event.clientX - lensWidth - cursorOffset;
        }
        resolvedLeft = Math.min(Math.max(margin, resolvedLeft), Math.max(margin, viewportRight));

        let resolvedTop = event.clientY + cursorOffset;
        if (resolvedTop > viewportBottom) {
          resolvedTop = event.clientY - lensHeight - cursorOffset;
        }
        resolvedTop = Math.min(Math.max(margin, resolvedTop), Math.max(margin, viewportBottom));

        magnifier.style.display = 'block';
        magnifier.style.left = resolvedLeft + 'px';
        magnifier.style.top = resolvedTop + 'px';
        magnifier.style.backgroundImage = 'url(' + target.getAttribute('data-magnify-src') + ')';
        magnifier.style.backgroundSize = (imgWidth * zoom) + 'px ' + (imgHeight * zoom) + 'px';
        magnifier.style.backgroundPosition = (-(imageX * zoom) + (lensWidth / 2)) + 'px ' + (-(imageY * zoom) + (lensHeight / 2)) + 'px';
      });
      target.addEventListener('mouseleave', hideMagnifiers);
    });
    rotationInputsX.forEach((input) => {
      input.addEventListener('input', (event) => syncProofRotationX(event.target.value));
    });
    rotationInputsY.forEach((input) => {
      input.addEventListener('input', (event) => syncProofRotationY(event.target.value));
    });
    angleButtons.forEach((button) => {
      button.addEventListener('click', () => syncProofRotationX(button.getAttribute('data-proof-angle')));
    });
    orientationChecks.forEach((input) => {
      input.addEventListener('change', syncOrientationConfirmation);
    });
    if (rotationInputsX.length) syncProofRotationX(rotationInputsX[0].value);
    if (rotationInputsY.length) syncProofRotationY(rotationInputsY[0].value);
    if (orientationChecks.length) syncOrientationConfirmation();
    syncLowResUi();
  </script>
  </body></html>`;
}

function inchesFromPdfPoints(points) {
  return Number((points / 72).toFixed(2));
}

function isClose(actual, expected, tolerance = LEGAL_POSTCARD_RULE.tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

function parseSizeValue(value) {
  const parts = String(value || '').split('x').map(Number);
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return { width: parts[0], height: parts[1] };
}

function formatDimension(value) {
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function formatSizeLabel(value) {
  const dims = parseSizeValue(value);
  if (!dims) return 'Unknown size';
  return `${formatDimension(dims.width)} × ${formatDimension(dims.height)} in`;
}

function getCategoryLabel(categoryKey) {
  return PRODUCT_CATEGORIES[categoryKey]?.label || 'Unknown category';
}

function getSizeLabel(categoryKey, sizeValue) {
  const size = PRODUCT_CATEGORIES[categoryKey]?.sizes.find((entry) => entry.value === sizeValue);
  return size?.label || formatSizeLabel(sizeValue);
}

function buildProductRule(categoryKey, sizeValue) {
  const parsed = parseSizeValue(sizeValue);
  if (!parsed) return null;

  const requiresTwoSided = categoryKey === LEGAL_POSTCARD_RULE.categoryKey && sizeValue === LEGAL_POSTCARD_RULE.sizeValue
    ? LEGAL_POSTCARD_RULE.requiresTwoSided
    : TWO_SIDED_CATEGORY_KEYS.has(categoryKey);
  const expectedPages = requiresTwoSided ? 2 : 1;
  const bleedWidth = parsed.width + (DEFAULT_BLEED_INCHES * 2);
  const bleedHeight = parsed.height + (DEFAULT_BLEED_INCHES * 2);

  return {
    name: `${getCategoryLabel(categoryKey)} · ${formatSizeLabel(sizeValue)}`,
    categoryKey,
    sizeValue,
    categoryLabel: getCategoryLabel(categoryKey),
    sizeLabel: getSizeLabel(categoryKey, sizeValue),
    trimWidth: parsed.width,
    trimHeight: parsed.height,
    bleedWidth,
    bleedHeight,
    bleedInset: DEFAULT_BLEED_INCHES,
    expectedPages,
    expectedPageMessage: requiresTwoSided ? '2 pages / 2 sides' : DEFAULT_PAGE_COUNT_MESSAGE,
    requiresTwoSided,
    tolerance: LEGAL_POSTCARD_RULE.tolerance,
    minImageDpi: DEFAULT_MIN_ACCEPTABLE_IMAGE_DPI,
    helperNote: requiresTwoSided
      ? 'Provide one page per printed side unless the job is intentionally split across separate files.'
      : 'Provide a single page at final size unless this job is intentionally supplied as a multi-file set.',
  };
}

function matchesEitherOrientation(width, height, expectedWidth, expectedHeight, tolerance = LEGAL_POSTCARD_RULE.tolerance) {
  const portraitMatch = isClose(width, expectedWidth, tolerance) && isClose(height, expectedHeight, tolerance);
  const landscapeMatch = isClose(width, expectedHeight, tolerance) && isClose(height, expectedWidth, tolerance);
  return { portraitMatch, landscapeMatch, matches: portraitMatch || landscapeMatch };
}

async function getPageDimensions(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const pages = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      pageNum,
      widthIn: inchesFromPdfPoints(viewport.width),
      heightIn: inchesFromPdfPoints(viewport.height),
    });
  }

  return pages;
}

function roundDpi(value) {
  return Number(value.toFixed(1));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageLabelFromIndex(index, pageNum) {
  if (index === 0) return 'front';
  if (index === 1) return 'back';
  return `page-${pageNum}`;
}

function pageTitleFromIndex(index, pageNum) {
  if (index === 0) return 'Front';
  if (index === 1) return 'Back';
  return `Page ${pageNum}`;
}

async function analyzeImageResolution(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await loadingTask.promise;
  const images = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const pageWidthPts = viewport.width;
    const pageHeightPts = viewport.height;
    const operatorList = await page.getOperatorList();
    const transformStack = [];
    let currentTransform = [1, 0, 0, 1, 0, 0];

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const fn = operatorList.fnArray[index];
      const args = operatorList.argsArray[index];

      if (fn === pdfjsLib.OPS.save) {
        transformStack.push(currentTransform.slice());
        continue;
      }

      if (fn === pdfjsLib.OPS.restore) {
        currentTransform = transformStack.pop() || [1, 0, 0, 1, 0, 0];
        continue;
      }

      if (fn === pdfjsLib.OPS.transform) {
        currentTransform = pdfjsLib.Util.transform(currentTransform, args);
        continue;
      }

      if (fn !== pdfjsLib.OPS.paintImageXObject && fn !== pdfjsLib.OPS.paintInlineImageXObject) {
        continue;
      }

      let imageName = 'inline-image';
      let widthPx;
      let heightPx;

      if (fn === pdfjsLib.OPS.paintImageXObject) {
        [imageName, widthPx, heightPx] = args;
      } else {
        const inlineImage = args?.[0] || {};
        widthPx = inlineImage.width;
        heightPx = inlineImage.height;
      }

      if (!widthPx || !heightPx) continue;

      const displayWidthPts = Math.hypot(currentTransform[0], currentTransform[1]);
      const displayHeightPts = Math.hypot(currentTransform[2], currentTransform[3]);
      const displayWidthIn = displayWidthPts / 72;
      const displayHeightIn = displayHeightPts / 72;

      if (displayWidthIn < MIN_IMAGE_DISPLAY_INCHES || displayHeightIn < MIN_IMAGE_DISPLAY_INCHES) {
        continue;
      }

      const dpiX = widthPx / displayWidthIn;
      const dpiY = heightPx / displayHeightIn;
      const effectiveDpi = Math.min(dpiX, dpiY);
      const corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map((point) => {
        const transformedPoint = [...point];
        pdfjsLib.Util.applyTransform(transformedPoint, currentTransform);
        return transformedPoint;
      });
      const xValues = corners.map(([x]) => x);
      const yValues = corners.map(([, y]) => y);
      const leftPts = Math.min(...xValues);
      const rightPts = Math.max(...xValues);
      const bottomPts = Math.min(...yValues);
      const topPts = Math.max(...yValues);

      images.push({
        pageNum,
        imageName,
        widthPx,
        heightPx,
        displayWidthIn: Number(displayWidthIn.toFixed(2)),
        displayHeightIn: Number(displayHeightIn.toFixed(2)),
        dpiX: roundDpi(dpiX),
        dpiY: roundDpi(dpiY),
        effectiveDpi: roundDpi(effectiveDpi),
        pageWidthIn: roundDpi(pageWidthPts / 72),
        pageHeightIn: roundDpi(pageHeightPts / 72),
        leftIn: roundDpi(leftPts / 72),
        topIn: roundDpi((pageHeightPts - topPts) / 72),
        widthIn: roundDpi((rightPts - leftPts) / 72),
        heightIn: roundDpi((topPts - bottomPts) / 72),
      });
    }
  }

  const lowResolutionImages = images.filter((image) => image.effectiveDpi < DEFAULT_MIN_ACCEPTABLE_IMAGE_DPI);
  const worstImage = images.reduce((lowest, image) => {
    if (!lowest || image.effectiveDpi < lowest.effectiveDpi) return image;
    return lowest;
  }, null);

  return {
    images,
    lowResolutionImages,
    worstImage,
  };
}

function getRenderDir(filePath) {
  return path.join(uploadsDir, '.renders', path.basename(filePath, path.extname(filePath)));
}

function getProofExportDir(filePath) {
  return path.join(uploadsDir, '.proofs', path.basename(filePath, path.extname(filePath)));
}

function buildLowResolutionOverlayHtml(images, pageCheck, sheetW, sheetH, options = {}) {
  if (!Array.isArray(images) || !images.length || !pageCheck) return '';

  const offsetLeft = Number(options.offsetLeft || 0);
  const offsetTop = Number(options.offsetTop || 0);
  const pageWidthIn = Number(pageCheck.widthIn) || images[0]?.pageWidthIn || 1;
  const pageHeightIn = Number(pageCheck.heightIn) || images[0]?.pageHeightIn || 1;
  const layerClass = options.printView ? 'proof-lowres-layer proof-lowres-layer--print' : 'proof-lowres-layer';

  const boxes = images.map((image, index) => {
    const left = (Number(image.leftIn || 0) / pageWidthIn) * sheetW + offsetLeft;
    const top = (Number(image.topIn || 0) / pageHeightIn) * sheetH + offsetTop;
    const width = Math.max((Number(image.widthIn || 0) / pageWidthIn) * sheetW, 10);
    const height = Math.max((Number(image.heightIn || 0) / pageHeightIn) * sheetH, 10);
    const label = `${image.effectiveDpi} DPI`;
    return `<div class="proof-lowres-box" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${width.toFixed(2)}px;height:${height.toFixed(2)}px;" data-lowres-box title="Low-resolution image ${index + 1}: ${escapeHtml(label)}"><span>${escapeHtml(label)}</span></div>`;
  }).join('');

  return `<div class="${layerClass}" aria-hidden="true">${boxes}</div>`;
}

function getJobRecordPath(jobId) {
  return path.join(jobsDir, `${jobId}.json`);
}

function createJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveUploadPath(fileName) {
  const safeName = path.basename(String(fileName || ''));
  if (!safeName) return null;
  const resolved = path.join(uploadsDir, safeName);
  return fs.existsSync(resolved) ? resolved : null;
}

function loadJobRecord(jobId) {
  const safeJobId = String(jobId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeJobId) return null;
  const recordPath = getJobRecordPath(safeJobId);
  if (!fs.existsSync(recordPath)) return null;
  return JSON.parse(fs.readFileSync(recordPath, 'utf8'));
}

function saveJobRecord(record) {
  fs.writeFileSync(getJobRecordPath(record.jobId), JSON.stringify(record, null, 2));
  return record;
}

function updateJobRecord(jobId, updater) {
  const existing = loadJobRecord(jobId);
  if (!existing) return null;
  const next = updater(existing) || existing;
  saveJobRecord(next);
  return next;
}

function listJobRecords() {
  return fs.readdirSync(jobsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(jobsDir, file), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

async function renderProofImages(filePath) {
  const renderDir = getRenderDir(filePath);
  fs.mkdirSync(renderDir, { recursive: true });
  const pdfData = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const renders = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const png = await canvas.encode('png');
    const fileName = `page-${pageNum}.png`;
    const outputPath = path.join(renderDir, fileName);
    fs.writeFileSync(outputPath, png);
    renders.push({
      pageNum,
      url: `/proof-renders/${path.basename(renderDir)}/${fileName}`,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
    });
  }

  return renders;
}

function applyProofWatermark(ctx, width, height) {
  const diagonalAngle = Math.atan2(height, width);
  const fontSize = Math.max(42, Math.round(Math.min(width, height) * 0.18));
  const stepX = Math.max(fontSize * 2.15, 220);
  const stepY = Math.max(fontSize * 1.5, 160);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-diagonalAngle);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(20, 30, 45, 0.15)';
  ctx.font = `900 ${fontSize}px Arial Black, Helvetica, sans-serif`;

  for (let y = -height * 1.1; y <= height * 1.1; y += stepY) {
    for (let x = -width * 1.2; x <= width * 1.2; x += stepX) {
      ctx.fillText('PROOF', x, y);
    }
  }

  ctx.restore();
}

function drawProofCropMarks(ctx, layout) {
  const { sheetX, trimLeft, trimTop, trimWidth, trimHeight, trimInset } = layout;
  const mark = Math.max(16, Math.round(trimInset * 1.6));
  const stroke = Math.max(1, Math.round(trimInset * 0.12));

  ctx.save();
  ctx.strokeStyle = 'rgba(12, 18, 32, 0.88)';
  ctx.lineWidth = stroke;
  ctx.lineCap = 'square';

  const left = sheetX + trimLeft;
  const right = left + trimWidth;
  const top = layout.sheetY + trimTop;
  const bottom = top + trimHeight;

  ctx.beginPath();
  ctx.moveTo(left - mark, top); ctx.lineTo(left - 4, top);
  ctx.moveTo(right + 4, top); ctx.lineTo(right + mark, top);
  ctx.moveTo(left - mark, bottom); ctx.lineTo(left - 4, bottom);
  ctx.moveTo(right + 4, bottom); ctx.lineTo(right + mark, bottom);
  ctx.moveTo(left, top - mark); ctx.lineTo(left, top - 4);
  ctx.moveTo(left, bottom + 4); ctx.lineTo(left, bottom + mark);
  ctx.moveTo(right, top - mark); ctx.lineTo(right, top - 4);
  ctx.moveTo(right, bottom + 4); ctx.lineTo(right, bottom + mark);
  ctx.stroke();
  ctx.restore();
}

function buildProofExportLayout(rule, pageCheck, sourceWidth, sourceHeight) {
  if (!rule) {
    const margin = 28;
    return {
      canvasWidth: sourceWidth + (margin * 2),
      canvasHeight: sourceHeight + (margin * 2),
      sheetX: margin,
      sheetY: margin,
      sheetWidth: sourceWidth,
      sheetHeight: sourceHeight,
      trimLeft: 0,
      trimTop: 0,
      trimWidth: sourceWidth,
      trimHeight: sourceHeight,
      trimInset: 9,
    };
  }

  const useLandscape = Boolean(pageCheck && pageCheck.landscapeMatch);
  const bleedW = useLandscape ? rule.bleedHeight : rule.bleedWidth;
  const bleedH = useLandscape ? rule.bleedWidth : rule.bleedHeight;
  const trimW = useLandscape ? rule.trimHeight : rule.trimWidth;
  const trimH = useLandscape ? rule.trimWidth : rule.trimHeight;
  const pointsPerInch = 72;
  const sheetWidth = Math.round(bleedW * pointsPerInch);
  const sheetHeight = Math.round(bleedH * pointsPerInch);
  const trimInset = Math.round(rule.bleedInset * pointsPerInch);
  const trimWidth = Math.round(trimW * pointsPerInch);
  const trimHeight = Math.round(trimH * pointsPerInch);
  const trimLeft = Math.round((sheetWidth - trimWidth) / 2);
  const trimTop = Math.round((sheetHeight - trimHeight) / 2);
  const margin = Math.max(28, trimInset + 22);

  return {
    canvasWidth: sheetWidth + (margin * 2),
    canvasHeight: sheetHeight + (margin * 2),
    sheetX: margin,
    sheetY: margin,
    sheetWidth,
    sheetHeight,
    trimLeft,
    trimTop,
    trimWidth,
    trimHeight,
    trimInset,
  };
}

async function generateProofExports(filePath, jobRecord = null) {
  const exportDir = getProofExportDir(filePath);
  fs.mkdirSync(exportDir, { recursive: true });
  const pdfData = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const exports = [];
  const pdfDoc = new PDFDocument({ title: 'FP Printing Proof', producer: 'FP Printing Upload Portal' });
  const activeRule = jobRecord?.productCategory && jobRecord?.productSize
    ? buildProductRule(jobRecord.productCategory, jobRecord.productSize)
    : null;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const pageCheck = jobRecord?.pageChecks?.[pageNum - 1] || null;
    const layout = buildProofExportLayout(activeRule, pageCheck, width, height);

    const sheetCanvas = createCanvas(layout.sheetWidth, layout.sheetHeight);
    const sheetCtx = sheetCanvas.getContext('2d');
    await page.render({ canvasContext: sheetCtx, viewport }).promise;

    const pngCanvas = createCanvas(layout.canvasWidth, layout.canvasHeight);
    const pngCtx = pngCanvas.getContext('2d');
    pngCtx.fillStyle = '#ffffff';
    pngCtx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
    pngCtx.drawImage(sheetCanvas, layout.sheetX, layout.sheetY, layout.sheetWidth, layout.sheetHeight);
    drawProofCropMarks(pngCtx, layout);
    applyProofWatermark(pngCtx, layout.canvasWidth, layout.canvasHeight);

    const pdfCtx = pdfDoc.beginPage(layout.canvasWidth, layout.canvasHeight);
    pdfCtx.fillStyle = '#ffffff';
    pdfCtx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);
    pdfCtx.drawImage(sheetCanvas, layout.sheetX, layout.sheetY, layout.sheetWidth, layout.sheetHeight);
    drawProofCropMarks(pdfCtx, layout);
    applyProofWatermark(pdfCtx, layout.canvasWidth, layout.canvasHeight);
    pdfDoc.endPage();

    const buffer = await pngCanvas.encode('png');
    const fileName = `proof-page-${pageNum}.png`;
    fs.writeFileSync(path.join(exportDir, fileName), buffer);
    exports.push({
      pageNum,
      fileName,
      url: `/proof-exports/${path.basename(exportDir)}/${fileName}`,
      width: layout.canvasWidth,
      height: layout.canvasHeight,
    });
  }

  const pdfFileName = 'proof-set.pdf';
  fs.writeFileSync(path.join(exportDir, pdfFileName), pdfDoc.close());

  return {
    pages: exports,
    pdf: {
      fileName: pdfFileName,
      url: `/proof-exports/${path.basename(exportDir)}/${pdfFileName}`,
    },
  };
}

function proofSheetHtml(render, pageCheck, label, rule, frontRender, backRender, lowResolutionImages = []) {
  const useLandscape = Boolean(pageCheck && pageCheck.landscapeMatch);
  const bleedW = useLandscape ? rule.bleedHeight : rule.bleedWidth;
  const bleedH = useLandscape ? rule.bleedWidth : rule.bleedHeight;
  const trimW = useLandscape ? rule.trimHeight : rule.trimWidth;
  const trimH = useLandscape ? rule.trimWidth : rule.trimHeight;
  const scale = 67.5;
  const sheetW = bleedW * scale;
  const sheetH = bleedH * scale;
  const trimLeft = ((bleedW - trimW) / 2) * scale;
  const trimTop = ((bleedH - trimH) / 2) * scale;
  const trimWidth = trimW * scale;
  const trimHeight = trimH * scale;
  const bleedInset = rule.bleedInset * scale;
  const innerTrimLeft = trimLeft + bleedInset;
  const innerTrimTop = trimTop + bleedInset;
  const innerTrimWidth = trimWidth - (bleedInset * 2);
  const innerTrimHeight = trimHeight - (bleedInset * 2);
  const mark = 18;
  const lowResSheetOverlay = buildLowResolutionOverlayHtml(lowResolutionImages, pageCheck, sheetW, sheetH);
  const lowResPrintOverlay = buildLowResolutionOverlayHtml(lowResolutionImages, pageCheck, sheetW, sheetH, {
    printView: true,
    offsetLeft: -trimLeft,
    offsetTop: -trimTop,
  });
  const backFace = backRender
    ? `<img src="${backRender.url}" alt="Back side proof page ${backRender.pageNum}"><span class="proof-face-label">BACK</span>`
    : `<div class="proof-face-placeholder"><div><strong>Back side not supplied</strong><p style="margin:8px 0 0;">Upload page 2 if you want the 3D orientation check to compare both sides.</p></div></div><span class="proof-face-label">BACK</span>`;

  return `
    <div class="proof-stage" data-proof-panel="${label}" data-view="bleed" style="display:${label === 'front' ? 'flex' : 'none'};">
      <div class="proof-sheet proof-sheet-view" style="width:${sheetW}px;height:${sheetH}px;" data-magnify-target data-magnifier-id="${label}" data-magnify-src="${render.url}" data-img-width="${sheetW}" data-img-height="${sheetH}" data-img-left="0" data-img-top="0" data-zoom="2.6">
        <img class="proof-image" src="${render.url}" alt="Proof page ${render.pageNum}">
        ${lowResSheetOverlay}
        <div class="proof-bleed-band" style="left:0;top:0;width:${sheetW}px;height:${bleedInset}px;"></div>
        <div class="proof-bleed-band" style="left:0;top:${sheetH - bleedInset}px;width:${sheetW}px;height:${bleedInset}px;"></div>
        <div class="proof-bleed-band" style="left:0;top:${bleedInset}px;width:${bleedInset}px;height:${sheetH - (bleedInset * 2)}px;"></div>
        <div class="proof-bleed-band" style="left:${sheetW - bleedInset}px;top:${bleedInset}px;width:${bleedInset}px;height:${sheetH - (bleedInset * 2)}px;"></div>
        <div class="proof-safe trim" style="left:${trimLeft}px;top:${trimTop}px;width:${trimWidth}px;height:${trimHeight}px;"></div>
        <div class="proof-safe bleed-guide" style="left:${innerTrimLeft}px;top:${innerTrimTop}px;width:${innerTrimWidth}px;height:${innerTrimHeight}px;"></div>

        <div class="crop-mark h" style="left:${trimLeft - mark}px;top:${trimTop}px;width:${mark}px;"></div>
        <div class="crop-mark h" style="left:${trimLeft + trimWidth}px;top:${trimTop}px;width:${mark}px;"></div>
        <div class="crop-mark h" style="left:${trimLeft - mark}px;top:${trimTop + trimHeight}px;width:${mark}px;"></div>
        <div class="crop-mark h" style="left:${trimLeft + trimWidth}px;top:${trimTop + trimHeight}px;width:${mark}px;"></div>

        <div class="crop-mark v" style="left:${trimLeft}px;top:${trimTop - mark}px;height:${mark}px;"></div>
        <div class="crop-mark v" style="left:${trimLeft}px;top:${trimTop + trimHeight}px;height:${mark}px;"></div>
        <div class="crop-mark v" style="left:${trimLeft + trimWidth}px;top:${trimTop - mark}px;height:${mark}px;"></div>
        <div class="crop-mark v" style="left:${trimLeft + trimWidth}px;top:${trimTop + trimHeight}px;height:${mark}px;"></div>
      </div>
      <div class="proof-print-piece proof-print-view" style="width:${trimWidth}px;height:${trimHeight}px;" data-magnify-target data-magnifier-id="${label}" data-magnify-src="${render.url}" data-img-width="${sheetW}" data-img-height="${sheetH}" data-img-left="-${trimLeft}" data-img-top="-${trimTop}" data-zoom="2.6">
        <img class="proof-print-image" src="${render.url}" alt="Trimmed proof page ${render.pageNum}" style="left:-${trimLeft}px;top:-${trimTop}px;width:${sheetW}px;height:${sheetH}px;">
        ${lowResPrintOverlay}
      </div>
      <div class="proof-magnifier" data-proof-magnifier data-proof-magnifier-id="${label}"></div>
      <div class="proof-3d-view">
        <div class="proof-3d-stack">
          <div class="proof-3d-scene">
            <div class="proof-3d-card" style="width:${trimWidth}px;height:${trimHeight}px;">
              <div class="proof-face front">
                <img src="${frontRender.url}" alt="Front side proof page ${frontRender.pageNum}">
                <span class="proof-face-label">FRONT</span>
              </div>
              <div class="proof-face back-x">
                ${backFace}
              </div>
              <div class="proof-face back-y">
                ${backFace}
              </div>
            </div>
          </div>
          <div class="proof-3d-controls">
            <div class="proof-3d-slider-row">
              <label for="proof-rotation-x-${label}">Rotate on the X axis</label>
              <input id="proof-rotation-x-${label}" type="range" min="0" max="360" step="5" value="0" data-proof-rotation-x>
              <div class="proof-angle-readout" data-proof-rotation-output-x>0° on the X axis</div>
            </div>
            <div class="proof-3d-slider-row">
              <label for="proof-rotation-y-${label}">Rotate on the Y axis</label>
              <input id="proof-rotation-y-${label}" type="range" min="0" max="360" step="5" value="0" data-proof-rotation-y>
              <div class="proof-angle-readout" data-proof-rotation-output-y>0° on the Y axis</div>
            </div>
            <div class="proof-angle-presets">
              <button type="button" class="proof-angle-btn" data-proof-angle="0">0°</button>
              <button type="button" class="proof-angle-btn" data-proof-angle="90">90°</button>
              <button type="button" class="proof-angle-btn" data-proof-angle="180">180°</button>
              <button type="button" class="proof-angle-btn" data-proof-angle="270">270°</button>
              <button type="button" class="proof-angle-btn" data-proof-angle="360">360°</button>
            </div>
            <label class="proof-confirm"><input type="checkbox" data-proof-orientation-confirm><span>Orientation looks correct for production<small>Check this before final proof approval so the front/back reading direction is confirmed.</small></span></label>
          </div>
        </div>
      </div>
    </div>`;
}

app.get('/', (_req, res) => {
  const categoryOptions = Object.entries(PRODUCT_CATEGORIES)
    .map(([value, category]) => `<option value="${value}" ${value === DEFAULT_CATEGORY_KEY ? 'selected' : ''}>${category.label}</option>`)
    .join('');
  const defaultCategory = PRODUCT_CATEGORIES[DEFAULT_CATEGORY_KEY];

  res.send(renderPage(`
    <div class="stack">
      <div class="hero">
        <div class="card hero-panel">
          <div class="hero-copy">
            <a class="eyebrow eyebrow-link" href="/">📬 FP Printing print preflight</a>
            <h1>Select a product &amp; size. Upload the file and see the proof. Approve job.</h1>
            <p><a class="staff-action-link" href="/staff">Open staff review queue</a></p>
            <p class="muted">This portal stays focused on preflight, but the homepage now helps clients choose a product category first, then a size that matches the job they are uploading.</p>
            <div class="hero-stats">
              <div class="stat"><div class="stat-value">6 categories</div><div class="muted">ready on the upload form</div></div>
              <div class="stat"><div class="stat-value">Dynamic sizes</div><div class="muted">matched to each product type</div></div>
              <div class="stat"><div class="stat-value">Live guidance</div><div class="muted">helper text updates instantly</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <p class="section-kicker">What gets checked</p>
          <h2>Fast preflight, framed like a premium review surface</h2>
          <div class="highlight-grid">
            <div class="highlight"><strong>Document specs</strong><p class="muted">Page count, file weight, and page dimensions are checked immediately.</p></div>
            <div class="highlight"><strong>Category-first routing</strong><p class="muted">Clients choose the product family first so the size menu feels intentional instead of generic.</p></div>
            <div class="highlight"><strong>Trim awareness</strong><p class="muted">The proof preview still shows the finished size and the 0.125-inch bleed that gets cut away.</p></div>
            <div class="highlight"><strong>Human-ready review</strong><p class="muted">Results are phrased for clients and staff, so approval conversations move faster.</p></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Submit file for preflight review</h2>
        <p class="muted">Choose the product category first, then confirm the finished size before uploading a press-ready PDF.</p>
        <div class="info-grid" style="margin-bottom:18px;">
          <div class="upload-hint"><strong>Before you upload</strong><p class="muted">Confirm artwork includes bleed on every edge and that all pages share the same intended reading orientation.</p></div>
          <div class="upload-hint"><strong>What the proof means</strong><p class="muted">Magenta shading marks the outer 0.125-inch bleed zone. The bright boundary shows the final trimmed piece.</p></div>
        </div>
        <form action="/upload" method="post" enctype="multipart/form-data">
          <div class="grid">
            <div class="field"><label>Client name</label><input name="clientName" required></div>
            <div class="field"><label>Email</label><input name="email" type="email" required></div>
            <div class="field"><label>Job name</label><input name="jobName" required></div>
            <div class="field"><label>Mail piece type</label><input name="mailPieceType" value="Custom print upload"></div>
            <div class="field full">
              <div class="selection-shell">
                <div class="selection-grid">
                  <div class="field">
                    <label for="productCategory">Product category</label>
                    <select id="productCategory" name="productCategory" data-category-select required>
                      <option value="" selected>Choose a category</option>
                      ${categoryOptions}
                    </select>
                  </div>
                  <div class="field">
                    <label for="productSize">Finished size</label>
                    <select id="productSize" name="productSize" data-size-select required disabled>
                      <option value="" selected>Choose a category first</option>
                    </select>
                  </div>
                </div>
                <div class="helper-card">
                  <strong data-category-heading>Choose a category to begin</strong>
                  <p class="muted" data-category-helper style="margin-bottom:0;">Product specs will appear after you choose a category and finished size.</p>
                  <div class="spec-panel" data-spec-panel>
                    <div class="spec-chip"><strong>Required bleed size</strong><span data-spec-bleed></span></div>
                    <div class="spec-chip"><strong>Finished trim size</strong><span data-spec-trim></span></div>
                    <div class="spec-chip"><strong>Expected pages</strong><span data-spec-pages></span></div>
                    <div class="spec-chip"><strong>Resolution</strong><span data-spec-resolution></span></div>
                    <div class="spec-chip"><strong>Preflight note</strong><span data-spec-note></span></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="field full"><label>Special instructions</label><textarea name="instructions"></textarea></div>
            <div class="field full"><label>PDF file</label><input name="artwork" type="file" accept="application/pdf,.pdf" required></div>
          </div>
          <div style="margin-top:20px;"><button class="btn" type="submit">Inspect PDF and Build Proof</button></div>
        </form>
      </div>
      <div class="card">
        <h2>Preflight note</h2>
        <ul class="spec-list">
          <li>The homepage no longer assumes the legal postcard product by default.</li>
          <li>Specs now appear after category and size are chosen, so the upload flow stays focused.</li>
          <li>The current backend proofing rule can still enforce the existing legal postcard inspection until broader product logic is added.</li>
        </ul>
      </div>
    </div>
  `));
});

app.get('/staff', (_req, res) => {
  const jobs = listJobRecords();
  const counts = jobs.reduce((acc, job) => {
    acc.total += 1;
    acc[job.status] = (acc[job.status] || 0) + 1;
    if (job.orientationConfirmed) acc.confirmed += 1;
    if (job.proofExports?.pdf) acc.proofs += 1;
    return acc;
  }, { total: 0, pass: 0, warning: 0, fail: 0, confirmed: 0, proofs: 0 });

  res.send(renderPage(`
    <div class="staff-shell">
      <div class="hero">
        <div class="card hero-panel" style="--hero-burst:rgba(134,168,255,.26);">
          <div class="hero-copy">
            <a class="eyebrow eyebrow-link" href="/">📬 FP Printing print preflight</a>
            <h1>Staff review queue</h1>
            <p class="muted">A live intake board for uploaded jobs, proof status, and orientation signoff.</p>
          </div>
        </div>
        <div class="card">
          <p class="section-kicker">Queue snapshot</p>
          <div class="staff-summary">
            <div class="stat"><div class="stat-value">${counts.total}</div><div class="muted">jobs saved</div></div>
            <div class="stat"><div class="stat-value">${counts.fail}</div><div class="muted">need intervention</div></div>
            <div class="stat"><div class="stat-value">${counts.proofs}</div><div class="muted">proof exports made</div></div>
            <div class="stat"><div class="stat-value">${counts.confirmed}</div><div class="muted">orientation confirmed</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
          <div>
            <p class="section-kicker">Review list</p>
            <h2 style="margin-bottom:6px;">Recent jobs</h2>
            <p class="muted" style="margin-bottom:0;">Newest updates float to the top so staff can spot unresolved issues fast.</p>
          </div>
          <div class="staff-actions">
            <a class="staff-action-link" href="/">New upload</a>
          </div>
        </div>
        <div class="staff-queue" style="margin-top:18px;">
          ${jobs.length ? jobs.map((job) => {
            const badgeClass = job.status === 'fail' ? 'fail' : job.status === 'warning' ? 'warning' : 'pass';
            const proofHref = job.proofExports?.pdf?.url || `/proof-export?file=${encodeURIComponent(job.file.storedName)}&jobName=${encodeURIComponent(job.jobName)}&jobId=${encodeURIComponent(job.jobId)}&orientationConfirmed=${job.orientationConfirmed ? 'yes' : 'no'}`;
            const topFindings = (job.findings || []).slice(0, 3).map((finding) => `
              <div class="finding">
                <p><span class="pill ${finding.severity === 'fail' ? 'fail' : finding.severity === 'warning' ? 'warning' : 'pass'}">${finding.severity.toUpperCase()}</span></p>
                <h3>${finding.message}</h3>
                <p class="muted">${finding.detail}</p>
              </div>
            `).join('');
            return `
              <div class="staff-job">
                <div class="staff-job-main">
                  <div class="staff-kicker">${job.jobId} · ${job.productCategoryLabel}</div>
                  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                    <h2 style="margin-bottom:0;">${job.jobName}</h2>
                    <span class="pill ${badgeClass}">${job.status.toUpperCase()}</span>
                  </div>
                  <p class="muted" style="margin-bottom:0;">${job.clientName} · ${job.email || 'No email'} · ${job.mailPieceType}</p>
                  <div class="staff-mini-grid">
                    <div class="meta-chip"><strong>File</strong><br><span class="muted">${job.file.originalName}</span></div>
                    <div class="meta-chip"><strong>Size</strong><br><span class="muted">${job.productSizeLabel}</span></div>
                    <div class="meta-chip"><strong>Pages</strong><br><span class="muted">${job.file.pageCount} page(s)</span></div>
                    <div class="meta-chip"><strong>Resolution</strong><br><span class="muted">${job.file.lowestDetectedResolutionDpi ? `${job.file.lowestDetectedResolutionDpi} DPI lowest / ${job.file.minimumResolutionDpi} DPI min` : `Unmeasured automatically / ${job.file.minimumResolutionDpi} DPI target`}</span></div>
                    <div class="meta-chip"><strong>Orientation</strong><br><span class="muted">${job.orientationConfirmed ? 'Client confirmed' : 'Awaiting signoff'}</span></div>
                  </div>
                  <div class="staff-findings">${topFindings}</div>
                </div>
                <div class="staff-job-side">
                  <div class="meta-chip"><strong>Last updated</strong><br><span class="muted">${new Date(job.updatedAt || job.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                  <div class="meta-chip"><strong>Proof package</strong><br><span class="muted">${job.proofExports?.pdf ? 'PDF generated' : 'Not exported yet'}</span></div>
                  <div class="meta-chip"><strong>Instructions</strong><br><span class="muted">${job.instructions || 'No special instructions.'}</span></div>
                  <div class="staff-actions">
                    <a class="staff-action-link" href="/uploads/${encodeURIComponent(job.file.storedName)}" target="_blank" rel="noreferrer">Open PDF</a>
                    <a class="staff-action-link" href="${proofHref}">${job.proofExports?.pdf ? 'Open proof PDF' : 'Generate proof'}</a>
                  </div>
                </div>
              </div>
            `;
          }).join('') : '<div class="staff-empty"><strong>No jobs yet.</strong><p style="margin:8px 0 0;">Once clients upload files, the staff queue will appear here.</p></div>'}
        </div>
      </div>
    </div>
  `));
});

app.get('/proof-export', async (req, res) => {
  try {
    const filePath = resolveUploadPath(req.query.file);
    if (!filePath) throw new Error('Proof source file could not be found. Please upload it again.');

    const jobName = req.query.jobName || path.basename(filePath, path.extname(filePath));
    const orientationConfirmed = req.query.orientationConfirmed === 'yes';
    const jobId = String(req.query.jobId || '');
    const linkedJob = jobId ? loadJobRecord(jobId) : null;
    const proofExports = await generateProofExports(filePath, linkedJob);
    const savedJob = jobId
      ? updateJobRecord(jobId, (record) => ({
          ...record,
          updatedAt: new Date().toISOString(),
          orientationConfirmed,
          proofExportedAt: new Date().toISOString(),
          proofExports: {
            pdf: proofExports.pdf,
            pages: proofExports.pages,
          },
        }))
      : null;

    res.send(renderPage(`
      <div class="stack">
        <div class="card hero-panel" style="--hero-burst:rgba(134,168,255,.26);">
          <div class="hero-copy">
            <a class="eyebrow eyebrow-link" href="/">📬 FP Printing print preflight</a>
            <h1>Proof export ready</h1>
            <p class="muted">${jobName}</p>
            <p class="muted">This proof set was exported at 72 DPI with a repeated diagonal PROOF watermark for safe client review.</p>
            <p class="muted">Orientation confirmation: ${orientationConfirmed ? 'Client confirmed the piece reads correctly.' : 'Client has not confirmed orientation yet.'}</p>
            <p class="muted">Job record: ${savedJob ? savedJob.jobId : 'No job record linked to this proof export.'}</p>
            <p><a class="staff-action-link" href="/staff">Back to staff review queue</a></p>
          </div>
        </div>
        <div class="card">
          <h2>Download proof package</h2>
          <div class="proof-actions" style="margin-bottom:16px;">
            <a class="proof-action-btn" href="${proofExports.pdf.url}" download>Download proof PDF</a>
          </div>
          <div class="proof-export-grid">
            ${proofExports.pages.map((item) => `
              <div class="proof-export-card">
                <strong>Page ${item.pageNum}</strong>
                <p class="muted" style="margin:8px 0 0;">${item.width} × ${item.height} px · 72 DPI proof export</p>
                <a class="proof-action-btn" href="${item.url}" download>Download proof PNG</a>
              </div>
            `).join('')}
          </div>
          <div class="proof-status-note">
            <strong>Orientation review</strong>
            <p class="muted" style="margin:8px 0 0;">${orientationConfirmed ? 'Saved with this proof: client marked the front/back orientation as correct.' : 'Saved with this proof: orientation still needs client or staff confirmation.'}</p>
          </div>
          <p class="muted" style="margin-top:16px;">Need to re-check the live preview first? <a href="javascript:history.back()">Go back to the proof viewer</a>.</p>
        </div>
      </div>
    `));
  } catch (error) {
    res.status(400).send(renderPage(`
      <div class="card">
        <p class="muted">Proof export failed</p>
        <h1>Something went wrong</h1>
        <p>${error.message}</p>
        <p><a href="/">Go back</a></p>
      </div>
    `));
  }
});

app.post('/upload', upload.single('artwork'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded.');

    const selectedCategoryKey = req.body.productCategory || DEFAULT_CATEGORY_KEY;
    const fallbackSizeValue = PRODUCT_CATEGORIES[selectedCategoryKey]?.sizes?.[0]?.value || LEGAL_POSTCARD_RULE.sizeValue;
    const selectedSizeValue = req.body.productSize || fallbackSizeValue;
    const activeRule = buildProductRule(selectedCategoryKey, selectedSizeValue);

    if (!activeRule) {
      throw new Error('Please choose a valid product category and finished size before uploading.');
    }

    const buffer = fs.readFileSync(req.file.path);
    const data = await pdf(buffer);
    const pageDimensions = await getPageDimensions(buffer);
    const imageResolution = await analyzeImageResolution(buffer);
    const renders = await renderProofImages(req.file.path);
    const stats = fs.statSync(req.file.path);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    const pageCount = data.numpages || 0;
    const textLength = (data.text || '').trim().length;

    const findings = [];
    let overall = 'pass';
    const lowResolutionImages = imageResolution.lowResolutionImages.filter((image) => image.effectiveDpi < activeRule.minImageDpi);

    findings.push({
      severity: 'pass',
      message: 'PDF accepted',
      detail: `Uploaded file parsed successfully. ${pageCount} page(s), ${sizeMb} MB.`,
    });

    if (stats.size > 25 * 1024 * 1024) {
      findings.push({
        severity: 'warning',
        message: 'Large file size',
        detail: `This PDF is ${sizeMb} MB. Large files may take longer to process.`,
      });
      overall = 'warning';
    }

    if (pageCount === 0) {
      findings.push({ severity: 'fail', message: 'Unable to determine page count', detail: 'This PDF may be malformed or protected.' });
      overall = 'fail';
    } else if (pageCount !== activeRule.expectedPages && overall !== 'fail') {
      findings.push({
        severity: 'warning',
        message: 'Unexpected page count',
        detail: `Expected ${activeRule.expectedPageMessage} for ${activeRule.categoryLabel} at ${formatSizeLabel(activeRule.sizeValue)}, detected ${pageCount} page(s).`,
      });
      overall = 'warning';
    }

    const pageChecks = pageDimensions.map((page) => ({
      ...page,
      ...matchesEitherOrientation(page.widthIn, page.heightIn, activeRule.bleedWidth, activeRule.bleedHeight, activeRule.tolerance),
    }));

    const wrongSizePages = pageChecks.filter((page) => !page.matches);

    if (wrongSizePages.length > 0) {
      findings.push({
        severity: 'fail',
        message: 'Wrong page dimensions for this product',
        detail: `Expected ${formatDimension(activeRule.bleedWidth)} x ${formatDimension(activeRule.bleedHeight)} inches with bleed in either portrait or landscape for ${activeRule.categoryLabel} (${activeRule.sizeLabel}). Detected ${wrongSizePages.map((page) => `page ${page.pageNum}: ${page.widthIn} x ${page.heightIn}`).join('; ')}.`,
      });
      overall = 'fail';
    } else {
      findings.push({
        severity: 'pass',
        message: 'Page dimensions match the selected product rule',
        detail: `Each page matches the expected bleed size of ${formatDimension(activeRule.bleedWidth)} x ${formatDimension(activeRule.bleedHeight)} inches for ${activeRule.categoryLabel} (${activeRule.sizeLabel}) in portrait or landscape orientation.`,
      });
    }

    const orientationKinds = pageChecks.map((page) => (page.portraitMatch ? 'portrait' : page.landscapeMatch ? 'landscape' : 'unknown'));
    const mixedOrientation = new Set(orientationKinds.filter((kind) => kind !== 'unknown')).size > 1;

    if (mixedOrientation && overall !== 'fail') {
      findings.push({
        severity: 'warning',
        message: 'Front and back orientation may not match',
        detail: `Detected mixed page orientation across the file (${orientationKinds.join(', ')}). Staff should confirm the job will not print with one side upside down.`,
      });
      overall = 'warning';
    } else if (!mixedOrientation && orientationKinds.every((kind) => kind !== 'unknown')) {
      findings.push({
        severity: 'pass',
        message: 'Page orientation is consistent',
        detail: `Detected ${orientationKinds[0]} orientation across all pages, which reduces the risk of one side being upside down.`,
      });
    }

    const minimumResolutionDpi = activeRule.minImageDpi;

    if (imageResolution.images.length === 0) {
      findings.push({
        severity: 'warning',
        message: 'Resolution could not be measured automatically',
        detail: `This PDF may be vector artwork, flattened raster artwork, or an export where embedded image DPI could not be measured reliably. It is not an automatic failure, but staff should review print quality manually against the ${minimumResolutionDpi} DPI target.`,
      });
      if (overall !== 'fail') overall = 'warning';
    } else if (lowResolutionImages.length) {
      const sampleImages = lowResolutionImages.slice(0, 3)
        .map((image) => `page ${image.pageNum} (${image.effectiveDpi} DPI at ${image.displayWidthIn} x ${image.displayHeightIn} in)`)
        .join('; ');
      findings.push({
        code: 'low-resolution-artwork',
        severity: 'fail',
        message: 'Low-resolution raster artwork detected',
        detail: `Raster images must be at least ${minimumResolutionDpi} DPI at placed size. Found ${lowResolutionImages.length} image(s) below spec; worst case ${imageResolution.worstImage?.effectiveDpi || 'n/a'} DPI. Examples: ${sampleImages}.`,
      });
      overall = 'fail';
    } else {
      findings.push({
        severity: 'pass',
        message: 'Raster image resolution passes preflight',
        detail: `Measured ${imageResolution.images.length} placed raster image(s). Lowest effective resolution was ${imageResolution.worstImage?.effectiveDpi || minimumResolutionDpi} DPI, meeting the ${minimumResolutionDpi} DPI minimum.`,
      });
    }

    if (textLength === 0 && overall !== 'fail') {
      findings.push({
        severity: 'warning',
        message: 'No extractable text detected',
        detail: 'This may be image-only artwork. That can be fine, but staff should review image quality manually.',
      });
      overall = 'warning';
    }

    const badgeClass = overall === 'fail' ? 'fail' : overall === 'warning' ? 'warning' : 'pass';
    const pretty = overall.charAt(0).toUpperCase() + overall.slice(1);
    const lowResPages = [...new Set(lowResolutionImages.map((image) => image.pageNum))];
    const lowResPrimaryPageNum = lowResPages[0] || null;
    const proofTabs = renders.map((render, index) => {
      const label = pageLabelFromIndex(index, render.pageNum);
      const title = pageTitleFromIndex(index, render.pageNum);
      return `<button type="button" class="proof-tab ${index === 0 ? 'active' : ''}" data-proof-tab="${label}">${title}</button>`;
    }).join('');
    const frontRender = renders[0];
    const backRender = renders[1] || null;
    const proofPanels = renders.map((render, index) => {
      const label = pageLabelFromIndex(index, render.pageNum);
      return proofSheetHtml(
        render,
        pageChecks[index],
        label,
        activeRule,
        frontRender,
        backRender,
        lowResolutionImages.filter((image) => image.pageNum === render.pageNum),
      );
    }).join('');

    const heroBurst = overall === 'fail'
      ? 'rgba(255, 78, 124, .34)'
      : overall === 'warning'
        ? 'rgba(255, 211, 124, .28)'
        : 'rgba(126, 226, 168, .30)';

    const jobId = createJobId();
    saveJobRecord({
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: overall,
      orientationConfirmed: false,
      clientName: req.body.clientName || 'Unknown',
      email: req.body.email || '',
      jobName: req.body.jobName || 'Untitled job',
      mailPieceType: req.body.mailPieceType || 'Unknown type',
      instructions: req.body.instructions || '',
      productCategory: activeRule.categoryKey,
      productCategoryLabel: activeRule.categoryLabel,
      productSize: activeRule.sizeValue,
      productSizeLabel: activeRule.sizeLabel,
      file: {
        originalName: req.file.originalname,
        storedName: path.basename(req.file.path),
        path: req.file.path,
        sizeBytes: stats.size,
        sizeMb,
        pageCount,
        minimumResolutionDpi,
        lowestDetectedResolutionDpi: imageResolution.worstImage?.effectiveDpi || null,
      },
      findings,
      pageChecks,
      mixedOrientation,
      imageResolution,
      proofExports: null,
    });

    res.send(renderPage(`
      <div class="stack">
        <div class="card hero-panel" style="--hero-burst:${heroBurst};">
          <div class="hero-copy">
            <a class="eyebrow eyebrow-link" href="/">📬 FP Printing print preflight</a>
            <h1>${req.body.jobName || 'Untitled job'}</h1>
            <p><span class="pill result-pill ${badgeClass}">${pretty}</span></p>
            <p class="muted">Client: ${req.body.clientName || 'Unknown'} · ${req.body.email || 'No email'} · ${req.body.mailPieceType || 'Unknown type'}</p>
            <p class="muted">Selected product: ${activeRule.categoryLabel} · ${activeRule.sizeLabel}</p>
            <p class="muted">File: <a href="/uploads/${path.basename(req.file.path)}">${req.file.originalname}</a></p>
            <p class="muted">Job record: ${jobId}</p>
            <p><a class="staff-action-link" href="/staff">View staff review queue</a></p>
            <div class="hero-stats">
              <div class="stat"><div class="stat-value">${pageCount}</div><div class="muted">page(s) detected</div></div>
              <div class="stat"><div class="stat-value">${sizeMb} MB</div><div class="muted">uploaded PDF size</div></div>
              <div class="stat"><div class="stat-value">${mixedOrientation ? 'Review' : 'Aligned'}</div><div class="muted">orientation status</div></div>
              <div class="stat"><div class="stat-value">${imageResolution.worstImage?.effectiveDpi || 'Review'}</div><div class="muted">lowest DPI detected</div></div>
            </div>
          </div>
        </div>
        <div class="two-col">
          <div class="card proof-card">
            <div class="proof-controls-callout">
              <div class="proof-controls-grid">
                <div class="proof-controls-copy">
                  <p class="section-kicker" style="margin-bottom:10px; border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.05);">Proofing controls</p>
                  <h3>Use these review tools before anyone signs off.</h3>
                  <p>Flip between bleed, print, 3D, magnify, and proof export so orientation mistakes or edge issues jump out before production.</p>
                </div>
                <div class="proof-controls-badges">
                  <button type="button" class="proof-controls-badge active" data-proof-callout-mode="bleed"><span>✂</span>Bleed</button>
                  <button type="button" class="proof-controls-badge" data-proof-callout-mode="print"><span>🖨</span>Print</button>
                  <button type="button" class="proof-controls-badge" data-proof-callout-mode="3d"><span>◧</span>3D</button>
                  <button type="button" class="proof-controls-badge" data-proof-callout-mode="magnify"><span>🔍</span>Magnify</button>
                  <button type="button" class="proof-controls-badge" data-proof-callout-mode="proof"><span>✓</span>Proof</button>
                </div>
              </div>
            </div>
            <div class="proof-toolbar">
              <div>
                <h2 style="margin-bottom:6px;">Visual print proof</h2>
                <p class="muted" style="margin-bottom:0;">Bleed view shows the ${formatDimension(activeRule.bleedInset)}-inch trim-off band. Print view shows only the finished ${activeRule.sizeLabel} piece after trim.</p>
              </div>
              <div style="display:grid; gap:10px; justify-items:end;">
                <div class="proof-tabs">${proofTabs}</div>
                ${lowResolutionImages.length ? `<button type="button" class="proof-action-btn" data-lowres-toggle data-lowres-focus="${pageLabelFromIndex(Math.max(0, lowResPrimaryPageNum - 1), lowResPrimaryPageNum)}" data-lowres-label-off="See problems" data-lowres-label-on="Hide problems">See problems</button>` : ''}
                <a class="proof-action-btn visually-hidden" data-proof-export-link href="/proof-export?file=${encodeURIComponent(path.basename(req.file.path))}&jobName=${encodeURIComponent(req.body.jobName || 'Untitled job')}&jobId=${encodeURIComponent(jobId)}&orientationConfirmed=no">Proof</a>
              </div>
            </div>
            ${proofPanels}
            <div class="proof-status-note"><strong>Orientation confirmation</strong><p class="muted" data-orientation-status style="margin:8px 0 0;">Waiting on client orientation confirmation</p></div>
            ${lowResolutionImages.length ? `<div class="proof-lowres-banner"><strong>${lowResolutionImages.length} low-resolution image${lowResolutionImages.length === 1 ? '' : 's'} flagged</strong><p class="muted" style="margin:8px 0 0;">Turn on the low-res highlight to wash the affected placed images in magenta directly on the proof.</p></div>` : ''}
            <div class="proof-legend">
              <div class="legend-key"><span class="legend-swatch" style="background: var(--bleed);"></span><strong>Bleed zone</strong><span>trimmed off in production</span></div>
              <div class="legend-key"><span class="legend-swatch" style="background: transparent; border: 2px solid #fff;"></span><strong>Finished size</strong><span>visible after trim</span></div>
              <div class="legend-key"><span class="legend-swatch" style="background: rgba(255,255,255,.12);"></span><strong>Print view</strong><span>shows the trimmed piece only</span></div>
              ${lowResolutionImages.length ? '<div class="legend-key"><span class="legend-swatch" style="background: rgba(34, 211, 238, .28); border-color: rgba(103, 232, 249, .98);"></span><strong>Low-res image</strong><span>cyan overlay marks artwork below DPI spec</span></div>' : ''}
              <div class="legend-key"><span class="legend-swatch" style="background: rgba(20,30,45,.15);"></span><strong>Proof export</strong><span>72 DPI PDF/PNG with repeated diagonal PROOF watermark</span></div>
            </div>
          </div>
        </div>
        <div class="details-grid">
          <div class="card">
            <h2>Detected document size</h2>
            <p class="muted">Expecting ${activeRule.expectedPageMessage} at ${formatDimension(activeRule.bleedWidth)} × ${formatDimension(activeRule.bleedHeight)} in with bleed.</p>
            <div class="stack">
              ${pageChecks.map((page) => `<div class="finding"><h3>Page ${page.pageNum}</h3><p class="muted">${page.widthIn} x ${page.heightIn} inches · ${page.portraitMatch ? 'portrait' : page.landscapeMatch ? 'landscape' : 'unknown orientation'}</p></div>`).join('')}
            </div>
          </div>
          <div class="card">
            <h2>Preflight details</h2>
            <div class="proof-meta">
              <div class="meta-chip"><strong>Category</strong><br><span class="muted">${activeRule.categoryLabel}</span></div>
              <div class="meta-chip"><strong>Chosen size</strong><br><span class="muted">${activeRule.sizeLabel}</span></div>
              <div class="meta-chip"><strong>Trim</strong><br><span class="muted">${formatDimension(activeRule.trimWidth)} x ${formatDimension(activeRule.trimHeight)} in</span></div>
              <div class="meta-chip"><strong>Bleed</strong><br><span class="muted">${formatDimension(activeRule.bleedWidth)} x ${formatDimension(activeRule.bleedHeight)} in</span></div>
              <div class="meta-chip"><strong>Expected pages</strong><br><span class="muted">${activeRule.expectedPageMessage}</span></div>
              <div class="meta-chip"><strong>Resolution rule</strong><br><span class="muted">${minimumResolutionDpi} DPI minimum</span></div>
              <div class="meta-chip"><strong>Orientation check</strong><br><span class="muted">${mixedOrientation ? 'Mixed, review carefully' : 'Consistent'}</span></div>
              <div class="meta-chip"><strong>Client orientation signoff</strong><br><span class="muted" data-orientation-status>Waiting on client orientation confirmation</span></div>
            </div>
          </div>
        </div>
        <div class="card">
          <h2>Inspection findings</h2>
          <div class="stack">
            ${findings.map((f) => {
              const isLowResFinding = f.code === 'low-resolution-artwork' && lowResolutionImages.length;
              return `<div class="finding ${isLowResFinding ? 'finding-attention' : ''}"><p><span class="pill ${f.severity === 'fail' ? 'fail' : f.severity === 'warning' ? 'warning' : 'pass'}">${f.severity.toUpperCase()}</span></p><h3>${f.message}</h3><p class="muted">${f.detail}</p>${isLowResFinding ? `<div class="finding-action-row"><button type="button" class="finding-action-btn" data-lowres-focus="${pageLabelFromIndex(Math.max(0, lowResPrimaryPageNum - 1), lowResPrimaryPageNum)}" data-lowres-label-off="See problems" data-lowres-label-on="Hide problems">See problems</button><span class="finding-action-meta">${lowResolutionImages.length} image${lowResolutionImages.length === 1 ? '' : 's'} below ${minimumResolutionDpi} DPI</span></div>` : ''}</div>`;
            }).join('')}
          </div>
        </div>
        <div class="card">
          <h2>How to read this proof</h2>
          <p class="muted">This preview preserves the PDF inspection checks and builds the proof around the selected product rule. Everything under the magenta edge overlay is outside the finished piece and is expected to trim off. Keep critical copy and logos inside the finished-size boundary.</p>
          <p><a href="/">Upload another file</a></p>
        </div>
      </div>
    `));
  } catch (error) {
    res.status(400).send(renderPage(`
      <div class="card">
        <p class="muted">Upload failed</p>
        <h1>Something went wrong</h1>
        <p>${error.message}</p>
        <p><a href="/">Go back</a></p>
      </div>
    `));
  }
});

app.listen(port, host, () => {
  console.log(`FP Printing upload portal running on http://${host}:${port}`);
  console.log(`Using data directory: ${dataRoot}`);
});
