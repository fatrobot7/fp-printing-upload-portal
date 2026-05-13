# Mailing Pros Upload Portal App

Local working prototype for the Mailing Pros file intake portal.

## What it does right now
- Accepts a PDF upload
- Saves the file locally
- Runs basic PDF parsing checks
- Returns a pass, warning, or fail style result page

## Run it

### Easy way on your Mac

Double-click:

```text
products/mailing-pros-upload-portal/app/scripts/open-preview.command
```

That script will:
- install dependencies if needed
- start the local server
- open the preview in your browser

To stop it later, double-click:

```text
products/mailing-pros-upload-portal/app/scripts/stop-preview.command
```

### Manual way

```bash
cd products/mailing-pros-upload-portal/app
npm install
npm start
```

Then open:

```text
http://127.0.0.1:3030
```

## Deploy on Render

This app is now set up to run on Render.

### Recommended setup
- Create a **Web Service** from this app directory
- Keep a persistent disk mounted at `/data`
- Set `DATA_DIR=/data`

### If you use render.yaml
Point Render at this folder:

```text
products/mailing-pros-upload-portal/app
```

Render should detect:
- `buildCommand: npm install`
- `startCommand: npm start`

### Important
- The app stores uploaded PDFs, proof renders, and job JSON files on disk.
- On Render, use the mounted disk so uploads are not lost on restart.

## Current limitations
- Basic checks only
- No database yet
- Color-space validation still needs to be added
- Bleed is inferred from page size, not detected from live artwork objects

## Next upgrades
- Add page dimension checks
- Add PDF metadata inspection
- Add color and raster checks
- Add persistent job records
- Add internal review UI
