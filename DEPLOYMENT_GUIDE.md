# NEMO — Deployment Guide

This guide explains how to deploy the NEMO AI YouTube Shorts Automation platform to production.

---

## 1. Quick Start: Docker Deployment (Recommended)

Because NEMO integrates Node.js (for the frontend & API) with Python and **FFmpeg** (for video processing, subtitling, and rendering), Docker provides the most reliable environment.

### Prerequisites
- Docker & Docker Compose installed on your server (VPS, AWS EC2, DigitalOcean droplet, etc.)

### Steps
1. **Clone the repository**:
   ```bash
   git clone https://github.com/fearless-27/youtube_shorts_agent.git
   cd youtube_shorts_agent
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Fill in your `ADMIN_EMAIL`, `JWT_SECRET`, and optional API keys.

3. **Start the service**:
   ```bash
   docker compose up -d --build
   ```

4. **Verify running status**:
   ```bash
   docker compose ps
   curl http://localhost:4173/api/storage/stats
   ```

---

## 2. Deploying on Cloud Platforms (Railway / Render)

### Render (via Blueprint)
1. Push this repository to GitHub.
2. In the Render Dashboard, click **New +** -> **Blueprint**.
3. Connect your repository. Render will automatically detect [`render.yaml`](file:///d:/youtube%20Agent/render.yaml) and build the Docker container.
4. Add any secret environment variables (e.g. `JWT_SECRET`) in the Render environment settings.

### Railway
1. In Railway, click **New Project** -> **Deploy from GitHub repo**.
2. Select this repository.
3. Railway will automatically detect the [`Dockerfile`](file:///d:/youtube%20Agent/Dockerfile).
4. Set the `PORT` variable to `4173` (or leave default `$PORT`) and add variables from `.env.example`.

---

## 3. Traditional VPS Deployment (Ubuntu 22.04 / 24.04 LTS)

### 1. Install System Dependencies
```bash
sudo apt update && sudo apt install -y nodejs npm python3 python3-pip python3-venv ffmpeg git
```

### 2. Setup Application
```bash
git clone https://github.com/fearless-27/youtube_shorts_agent.git
cd youtube_shorts_agent
npm install
npm run build

python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env
```

### 3. Setup PM2 Process Manager
```bash
sudo npm install -g pm2
pm2 start server.mjs --name nemo-backend
pm2 save
pm2 startup
```

### 4. Setup Nginx Reverse Proxy (Optional SSL)
```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Secure with Certbot:
```bash
sudo certbot --nginx -d your-domain.com
```

---

## 4. Maintenance & Storage Management
- Use the built-in **Database & Storage Janitor** on the Settings page (`/dashboard/settings`) to monitor disk usage and run one-click automated cleanup.
- Endpoint: `POST /api/storage/clean`
- Live stats: `GET /api/storage/stats`
