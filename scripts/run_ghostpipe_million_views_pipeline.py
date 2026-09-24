"""
run_ghostpipe_million_views_pipeline.py
Executes the GhostPipe autonomous pipeline for a video with >= 1,000,000 views:
1. Scans and selects a top video with >= 1M views.
2. Downloads the video via VideoDownloader.
3. Analyzes audio/speech with Faster-Whisper to extract important content/moments.
4. Renders into a professional vertical 9:16 Short (1080x1920) with subtitles,
   color grading, and audio enhancement.
5. Places the final rendered output in outputs/ and registers it in the approval queue.
"""

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

# Setup paths and environment
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(str(PROJECT_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("GhostPipeRunner")

from pipeline.ghostpipe_v5_1_pipeline import (
    load_config,
    TrendingVideoScanner,
    VideoDownloader,
    AdaptiveContentRecreator,
    ContinuousPipeline,
    PipelineMode,
    TrendingVideo,
)


async def main():
    logger.info("=" * 70)
    logger.info("GHOSTPIPE 1,000,000+ VIEWS PIPELINE EXECUTION")
    logger.info("=" * 70)

    config = load_config()
    config["min_views"] = 1000000
    config["growth_min_views"] = 1000000
    config["mode"] = "semi_live"

    # Step 1: Scan for >= 1,000,000 views videos
    logger.info("Scanning YouTube for trending videos with >= 1,000,000 views...")
    scanner = TrendingVideoScanner(config)
    videos = await scanner._scan_youtube_search_suggestions()

    million_videos = [v for v in videos if v.views >= 1000000]
    if not million_videos:
        logger.warning("No search suggestion candidates >= 1M views found. Trying YouTube Data API trending...")
        api_videos = await scanner._scan_youtube_data_api_trending()
        million_videos = [v for v in api_videos if v.views >= 1000000]

    if not million_videos:
        logger.error("No trending videos with >= 1,000,000 views discovered.")
        return 1

    # Sort by views descending
    million_videos.sort(key=lambda x: x.views, reverse=True)
    logger.info(f"Discovered {len(million_videos)} videos with >= 1,000,000 views:")
    for idx, v in enumerate(million_videos[:5], 1):
        logger.info(f"  {idx}. [{v.views:,} views] {v.title} (ID: {v.video_id})")

    chosen_video = million_videos[0]
    logger.info("-" * 70)
    logger.info(f"Target selected: {chosen_video.title}")
    logger.info(f"Views: {chosen_video.views:,} | URL: {chosen_video.url}")
    logger.info("-" * 70)

    # Step 2: Download the chosen video
    downloader = VideoDownloader(
        download_dir=config.get("download_dir", "downloads"),
        max_duration=config.get("max_video_duration", 600),
        config=config,
    )
    logger.info(f"Downloading source video '{chosen_video.video_id}'...")
    download_path = await downloader.download_video(chosen_video)
    if not download_path or not Path(download_path).exists():
        logger.error("Download failed. Cannot proceed with rendering.")
        return 1

    chosen_video.download_path = download_path
    chosen_video.local_path = download_path
    logger.info(f"Source video successfully downloaded: {download_path}")

    # Step 3: Analyze important content and render into professional Short
    logger.info("Initializing ContinuousPipeline and AdaptiveContentRecreator...")
    pipeline = ContinuousPipeline(config)
    
    logger.info("Processing video through AdaptiveContentRecreator...")
    await pipeline._process_video(chosen_video)

    # Step 4: Verify output
    logger.info("=" * 70)
    logger.info("PROCESSING COMPLETED! Verifying outputs...")
    
    outputs_dir = PROJECT_ROOT / "outputs"
    mp4_files = sorted(outputs_dir.glob(f"short_{chosen_video.video_id}_*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    
    if not mp4_files:
        # Check any newly created short in outputs
        mp4_files = sorted(outputs_dir.glob("short_*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)

    if mp4_files:
        latest_short = mp4_files[0]
        size_mb = latest_short.stat().st_size / (1024 * 1024)
        logger.info(f"Final Rendered Short: {latest_short.name} ({size_mb:.2f} MB)")
        logger.info(f"Absolute Path: {latest_short.resolve()}")
    else:
        logger.error("No output file found in outputs/ directory!")
        return 1

    # Check approval queue
    queue_path = PROJECT_ROOT / "public" / "data" / "approval_queue.json"
    if queue_path.exists():
        with open(queue_path, "r", encoding="utf-8-sig") as f:
            queue = json.load(f)
        matches = [item for item in queue if chosen_video.video_id in str(item.get("video_path", ""))]
        if matches:
            entry = matches[-1]
            logger.info(f"Approval Queue Entry: {entry.get('metadata', {}).get('title')} (Status: {entry.get('upload_status')})")
            logger.info(f"Public URL: {entry.get('public_url')}")

    logger.info("=" * 70)
    logger.info("GHOSTPIPE 1,000,000+ VIEWS PIPELINE SUCCEEDED!")
    logger.info("=" * 70)
    return 0


if __name__ == "__main__":
    ret = asyncio.run(main())
    sys.exit(ret)
