# GhostPipe Control

GhostPipe is a mixed project with a Vite/React dashboard and a Python video pipeline. The repository is arranged so source code, configuration, deployment files, scripts, and docs each live in their own place.

## Project Layout

```text
.
├── config/                 # Environment template and pipeline config
├── deploy/
│   ├── docker/             # Dockerfile and docker-compose.yml
│   └── systemd/            # Linux service unit
├── docs/                   # Architecture diagrams and supporting docs
├── downloads/              # Runtime input/download folder
├── outputs/                # Runtime generated media folder
├── pipeline/               # Python GhostPipe pipeline modules
├── public/                 # Dashboard static data and media
├── scripts/                # Setup and runner scripts
├── src/                    # React dashboard source
├── tests/                  # Playwright tests
├── package.json            # Dashboard scripts and dependencies
└── vite.config.ts          # Vite dashboard config
```

## Dashboard

```bash
npm install
npm run dev
npm run build
npx playwright test
```

## Pipeline

```bash
python -m venv venv
source venv/bin/activate
pip install -r pipeline/requirements.txt
cp config/.env.template .env
python pipeline/ghostpipe_v5_1_pipeline.py
```

On Windows PowerShell, use:

```powershell
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r pipeline\requirements.txt
Copy-Item config\.env.template .env
python pipeline\ghostpipe_v5_1_pipeline.py
```

Do not run `python pipeline/requirements.txt`; that file is only for `pip install -r`.

## Docker

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
docker compose -f deploy/docker/docker-compose.yml logs -f ghostpipe
```

## Vercel

Vercel is a good fit for the React dashboard only. The Python pipeline and Node server should stay on a separate host or container.

```bash
npm run build
```

Set `VITE_API_BASE_URL` to the URL of your hosted API before deploying so the dashboard can reach `/api` endpoints.

The repository includes [.env.example](.env.example) with the Vercel frontend variable.

`vercel.json` is already configured for SPA route fallback.

## Systemd

```bash
sudo mkdir -p /opt/ghostpipe
sudo cp -r config deploy downloads outputs pipeline scripts public /opt/ghostpipe/
sudo cp deploy/systemd/ghostpipe.service /etc/systemd/system/
sudo pip3 install -r /opt/ghostpipe/pipeline/requirements.txt
sudo systemctl daemon-reload
sudo systemctl enable ghostpipe
sudo systemctl start ghostpipe
```

## Notes

- Keep Vite, TypeScript, Tailwind, Playwright, and package files at the repo root because their tools expect that convention.
- Runtime folders such as `downloads/` and `outputs/` are kept separate from source code.
- Generated folders such as `dist/`, `test-results/`, and `__pycache__/` can be recreated and do not need to be committed.
