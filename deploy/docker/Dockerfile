FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    libgl1-mesa-glx \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY pipeline/requirements.txt ./pipeline/requirements.txt
RUN pip install --no-cache-dir -r pipeline/requirements.txt

# Copy application
COPY pipeline ./pipeline
COPY config ./config

# Create directories
RUN mkdir -p downloads outputs logs dry_run_analysis

# Environment
ENV PYTHONUNBUFFERED=1
ENV GHOSTPIPE_MODE=dry_run

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8080/health')" || exit 1

# Run pipeline
CMD ["python", "pipeline/ghostpipe_v5_1_pipeline.py"]
