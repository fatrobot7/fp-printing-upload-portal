# Deploy FP Printing Upload Portal to Render

## 1) Create a GitHub repo
Create a new empty repo on GitHub, for example:

`fp-printing-upload-portal`

Do not initialize it with a README.

## 2) Push this app folder only
From this folder (`products/mailing-pros-upload-portal/app`):

```bash
git init
git add .
git commit -m "Initial Render-ready upload portal"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

Example remote URL:

```bash
git remote add origin git@github.com:YOUR-USERNAME/fp-printing-upload-portal.git
```

## 3) Create the Render service
In Render:
- New → Blueprint
- Connect the GitHub repo
- Select the repo you just pushed

Render should read `render.yaml` automatically.

## 4) Confirm settings
Render service:
- runtime: Node
- build command: `npm install`
- start command: `npm start`
- persistent disk mounted at `/data`
- env var: `DATA_DIR=/data`

## 5) Test the Render URL
After deploy, test the generated `onrender.com` URL first.

## 6) Add custom domain
In Render → service → Settings → Custom Domains:
- add `upload.fp-printing.com`

## 7) Add DNS in Cloudflare
In Cloudflare DNS, add the CNAME record Render asks for.

Typical shape:
- Type: `CNAME`
- Name: `upload`
- Target: `<your-render-service>.onrender.com`

## 8) Wait for SSL
Once Render verifies DNS, `https://upload.fp-printing.com` should go live.
