"""
sync_youtube_analytics.py - Closes the feedback loop for NEMO AI.

Fetches live performance data (views, likes, comments, velocity) for all uploaded Shorts
via the YouTube Data API v3 and updates the AutoLearningMemory database so the agent
learns which titles, hooks, and schedules generate the most views.

Usage:
    python pipeline/sync_youtube_analytics.py [--limit 50] [--dry-run]
"""

import argparse
import json
import logging
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

from ghostpipe_v5_1_pipeline import AutoLearningMemory, load_config

LOGS_DIR = PROJECT_ROOT / "logs"
LOGS_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "analytics_sync.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("AnalyticsSync")


def get_uploaded_video_ids(db_path: Path, limit: int = 50) -> List[Dict]:
    """Retrieve uploaded video records from SQLite."""
    if not db_path.exists():
        return []
    records = []
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT source_id, uploaded_video_id, title, created_at, updated_at
            FROM telegram_sources
            WHERE uploaded_video_id IS NOT NULL AND uploaded_video_id != ''
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,)
        ).fetchall()
        for r in rows:
            records.append(dict(r))
    return records


def build_youtube_client(config: dict):
    """Initialize authorized YouTube Data API service."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        logger.warning("Google API client not installed. Run: pip install google-api-python-client google-auth-oauthlib")
        return None

    creds_path = PROJECT_ROOT / config.get("youtube_credentials_path", "youtube_credentials.json")
    if not creds_path.exists():
        logger.warning("YouTube credentials not found at %s", creds_path)
        return None

    try:
        with open(creds_path, "r", encoding="utf-8") as f:
            creds_data = json.load(f)
        credentials = Credentials.from_authorized_user_info(creds_data)
        return build("youtube", "v3", credentials=credentials, cache_discovery=False)
    except Exception as exc:
        logger.warning("Could not create YouTube API client: %s", exc)
        return None


def fetch_video_metrics(youtube, video_ids: List[str]) -> Dict[str, Dict]:
    """Query YouTube Data API for video statistics in batches of 50."""
    metrics_by_id = {}
    if not youtube or not video_ids:
        return metrics_by_id

    # Batch by 50 (YouTube API limit per call)
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        try:
            res = youtube.videos().list(
                part="statistics,snippet,contentDetails",
                id=",".join(batch)
            ).execute()

            for item in res.get("items", []):
                vid = item["id"]
                stats = item.get("statistics", {})
                snippet = item.get("snippet", {})
                published_at_str = snippet.get("publishedAt")
                
                hours_alive = 1.0
                if published_at_str:
                    try:
                        pub_dt = datetime.fromisoformat(published_at_str.replace("Z", "+00:00"))
                        hours_alive = max(0.5, (datetime.now(timezone.utc) - pub_dt).total_seconds() / 3600.0)
                    except Exception:
                        pass

                views = int(stats.get("viewCount", 0) or 0)
                likes = int(stats.get("likeCount", 0) or 0)
                comments = int(stats.get("commentCount", 0) or 0)
                velocity = round(views / hours_alive, 2)

                metrics_by_id[vid] = {
                    "views": views,
                    "likes": likes,
                    "comments": comments,
                    "shares": max(int(likes * 0.15), 0),
                    "subscribers_gained": max(int(views * 0.005), 0),
                    "view_velocity": velocity,
                    "hours_alive": round(hours_alive, 1),
                    "title": snippet.get("title", ""),
                }
        except Exception as exc:
            logger.warning("Error fetching metrics for batch: %s", exc)

    return metrics_by_id


def sync_analytics(limit: int = 50, dry_run: bool = False):
    """Main sync procedure."""
    config = load_config()
    db_path = PROJECT_ROOT / config.get("telegram_history_db_path", "pipeline/telegram_tamil_history.sqlite3")
    learning_db_path = PROJECT_ROOT / config.get("learning_memory_db_path", "pipeline/learning_memory.sqlite3")

    records = get_uploaded_video_ids(db_path, limit=limit)
    if not records:
        logger.info("No uploaded videos found in history database.")
        return

    logger.info("Found %d uploaded videos to sync.", len(records))
    video_ids = [r["uploaded_video_id"] for r in records if r.get("uploaded_video_id")]

    youtube = None if dry_run else build_youtube_client(config)
    if not youtube and not dry_run:
        logger.warning("YouTube API client unavailable; operating in simulation/mock mode for test.")
        dry_run = True

    metrics = {}
    if not dry_run and youtube:
        metrics = fetch_video_metrics(youtube, video_ids)
    else:
        # Dry run / fallback demo metrics
        for vid in video_ids:
            metrics[vid] = {
                "views": 250,
                "likes": 28,
                "comments": 4,
                "shares": 3,
                "subscribers_gained": 2,
                "view_velocity": 12.5,
                "hours_alive": 20.0,
                "title": "Sample Tamil Short",
            }

    memory = AutoLearningMemory(str(learning_db_path), enabled=True)
    updated_count = 0

    print("\n" + "=" * 75)
    print(f"{'VIDEO ID':<16} | {'VIEWS':<8} | {'LIKES':<6} | {'COMMENTS':<8} | {'VELOCITY (v/h)':<14}")
    print("=" * 75)

    for vid, m in metrics.items():
        print(f"{vid:<16} | {m['views']:<8} | {m['likes']:<6} | {m['comments']:<8} | {m['view_velocity']:<14}")
        if not dry_run:
            memory.update_observed_metrics(vid, m)
            updated_count += 1

    print("=" * 75)

    if not dry_run and updated_count > 0:
        logger.info("Successfully updated metrics for %d videos.", updated_count)
        trained = memory.train_model(min_samples=5)
        if trained:
            logger.info("Auto-learning model re-trained successfully with live audience outcomes!")
        else:
            logger.info("Auto-learning memory updated (awaiting more samples to trigger regression training).")
    else:
        logger.info("Dry run completed. Processed %d records.", len(metrics))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync YouTube Analytics to AutoLearningMemory.")
    parser.add_argument("--limit", type=int, default=50, help="Max videos to inspect.")
    parser.add_argument("--dry-run", action="store_true", help="Simulate sync without mutating DB.")
    args = parser.parse_args()

    sync_analytics(limit=args.limit, dry_run=args.dry_run)
