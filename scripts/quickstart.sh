#!/bin/bash
# GhostPipe v5.1 - Quick Start Script
# Run this after cloning the repo

echo "👻 GHOSTPIPE v5.1 - Quick Start"
echo "================================"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.11+"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Python version: $PYTHON_VERSION"

# Create virtual environment
echo "📦 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r pipeline/requirements.txt

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg not found. Please install:"
    echo "   Ubuntu/Debian: sudo apt install ffmpeg"
    echo "   MacOS: brew install ffmpeg"
    echo "   Windows: download from ffmpeg.org"
fi

# Setup environment
echo "🔧 Setting up environment..."
if [ ! -f .env ]; then
    cp config/.env.template .env
    echo "✅ Created .env file. Please edit it with your API keys."
fi

# Create directories
mkdir -p downloads outputs logs dry_run_analysis

# First run - dry mode
echo ""
echo "🚀 Ready to run!"
echo ""
echo "1. EDIT .env with your API keys"
echo "2. Run dry-run mode:"
echo "   python pipeline/ghostpipe_v5_1_pipeline.py"
echo ""
echo "3. After 7 days, check tuning report:"
echo "   cat weekly_tuning_report.json"
echo ""
echo "4. Switch to LIVE mode by editing config/ghostpipe.json"
echo ""
echo "📚 Full docs: README.md"
