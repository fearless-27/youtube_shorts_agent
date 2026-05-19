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
# GhostPipe Control

GhostPipe is an AI-assisted YouTube Shorts automation platform for scanning trends, generating shorts, reviewing approvals, and managing publishing workflows from a single dashboard. It combines a modern React control panel with a Python pipeline that handles the operational work behind the scenes.

If you are evaluating the product, start with the overview, deployment options, and environment variables. If you are setting it up or extending it, the frontend, pipeline, and deployment sections below provide the implementation details.

## Repository Structure

```text
.
├── config/                 # Environment template and pipeline configuration
├── deploy/                 # Docker and systemd deployment assets
├── docs/                   # Supporting documentation and diagrams
├── downloads/              # Runtime input and downloaded assets
├── outputs/                # Generated media and exported artifacts
├── pipeline/               # Python pipeline modules and dependencies
├── public/                 # Static dashboard data
├── scripts/                # Setup and utility scripts
├── src/                    # React dashboard source code
├── tests/                  # End-to-end test assets
├── package.json            # Frontend scripts and dependencies
└── vite.config.ts          # Vite configuration
```

## Prerequisites

- Node.js 20 or later
- Python 3.11 or later
- npm
- ffmpeg

## Frontend Dashboard

The dashboard is the operator experience for GhostPipe. It exposes pipeline status, approvals, uploads, logs, and settings through a browser-based interface.

Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

Run the test suite with:

```bash
npx playwright test
```

## Python Pipeline

The pipeline is the automation layer. It uses local assets, media processing tools, and API credentials to generate and manage shorts.

### macOS / Linux

```bash
python -m venv venv
source venv/bin/activate
pip install -r pipeline/requirements.txt
cp config/.env.template .env
python pipeline/ghostpipe_v5_1_pipeline.py
```

### Windows PowerShell

```powershell
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r pipeline\requirements.txt
Copy-Item config\.env.template .env
python pipeline\ghostpipe_v5_1_pipeline.py
```

Do not run `python pipeline/requirements.txt`; that file is intended only for `pip install -r`.

## Deployment Options

### Docker

Use Docker Compose when you want to run the dashboard and pipeline on a single host:

```bash
docker compose -f deploy/docker/docker-compose.yml up -d
docker compose -f deploy/docker/docker-compose.yml logs -f ghostpipe
```

### Vercel

Vercel is suitable for the React dashboard only. The Python pipeline and Node API server should be hosted separately on a VM or container platform.

Set the dashboard API endpoint with `VITE_API_BASE_URL` before deployment. A root-level `vercel.json` is already configured for single-page app routing.

For a product deployment, Vercel is the right host for the dashboard only. Pair it with a separate backend host for the API and pipeline runtime.

### systemd

For a dedicated Linux server, the repository includes a systemd service unit:

```bash
sudo mkdir -p /opt/ghostpipe
sudo cp -r config deploy downloads outputs pipeline scripts public /opt/ghostpipe/
sudo cp deploy/systemd/ghostpipe.service /etc/systemd/system/
sudo pip3 install -r /opt/ghostpipe/pipeline/requirements.txt
sudo systemctl daemon-reload
sudo systemctl enable ghostpipe
sudo systemctl start ghostpipe
```

## Environment Variables

These are the main values that control how GhostPipe runs in production and how the dashboard connects to its backend.

The repository includes `.env.example` for frontend deployment and `config/.env.template` for pipeline configuration.

Key variables:

- `VITE_API_BASE_URL`: Base URL for the hosted API when deploying the dashboard separately
- `ANTHROPIC_API_KEY`: Pipeline integration key
- `OPENAI_API_KEY`: Pipeline integration key
- `ELEVENLABS_API_KEY`: Pipeline integration key
- `YOUTUBE_REFRESH_TOKEN`: YouTube upload authorization

## Notes

- Keep Vite, TypeScript, Tailwind, Playwright, and package files at the repository root so the tooling continues to work as expected.
- Runtime folders such as `downloads/` and `outputs/` are intentionally separated from source code.
- Generated artifacts such as `dist/`, `test-results/`, and `__pycache__/` should not be committed.
