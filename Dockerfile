# ── Multi-Stage / Hybrid Node.js + Python Dockerfile ───────────────
FROM node:22-bookworm-slim

# Install system dependencies: ffmpeg, python3, pip, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci

# Create Python virtualenv and install dependencies
COPY requirements.txt ./
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /app/venv/bin/pip install --no-cache-dir -r requirements.txt

ENV PATH="/app/venv/bin:$PATH"

# Copy application source code
COPY . .

# Build frontend production bundle
RUN npm run build

# Ensure runtime directories exist
RUN mkdir -p outputs downloads logs public/data/users public/data/editor_jobs

# Set environment defaults
ENV PORT=4173
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 4173

# Start the unified server
CMD ["node", "server.mjs"]
