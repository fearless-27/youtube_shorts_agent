
"""
GHOSTPIPE v5.1 - 24/7 Autonomous Shorts Pipeline
Complete system with:
- Continuous trending video detection & download
- Adaptive content recreation
- Dry-run tuning mode
- 24/7 scheduler with health monitoring
"""

import asyncio
import json
import os
import sys
import time
import logging
import schedule
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path
import hashlib
import random
import threading
from concurrent.futures import ThreadPoolExecutor
import re
import sqlite3
from zoneinfo import ZoneInfo
from datetime import timezone as datetime_timezone, timedelta as datetime_timedelta
import msvcrt
import ctypes

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except Exception:
    pass

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

log_handlers = []
try:
    log_handlers.append(logging.FileHandler(PROJECT_ROOT / 'ghostpipe.log', encoding="utf-8"))
except OSError:
    try:
        log_handlers.append(logging.FileHandler(PROJECT_ROOT / f'ghostpipe_{os.getpid()}.log', encoding="utf-8"))
    except OSError:
        pass
log_handlers.append(logging.StreamHandler(sys.stdout))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s',
    handlers=log_handlers
)
logger = logging.getLogger('GhostPipe')


class PipelineMode(Enum):
    DRY_RUN = "dry_run"      # No uploads, log only, tune parameters
    LIVE = "live"            # Full operation with uploads
    SEMI_LIVE = "semi_live"  # Upload but manual approval


class PipelineState(Enum):
    IDLE = "idle"
    SCANNING_TRENDS = "scanning_trends"
    DOWNLOADING = "downloading"
    DECONSTRUCTING = "deconstructing"
    GENERATING = "generating"
    EDITING = "editing"
    OPTIMIZING = "optimizing"
    UPLOADING = "uploading"
    ANALYZING = "analyzing"
    ERROR = "error"
    COOLDOWN = "cooldown"


@dataclass
class TrendingVideo:
    video_id: str
    title: str
    channel: str
    views: int
    upload_time: datetime
    duration: int
    category: str
    thumbnail_url: str
    url: str
    engagement_rate: float
    velocity_score: float  # Views per hour
    niche_relevance: float
    description: str = ""
    already_processed: bool = False
    download_path: Optional[str] = None
    local_path: Optional[str] = None

    def __hash__(self):
        return hash(self.video_id)


@dataclass
class PipelineMetrics:
    cycle_count: int = 0
    videos_downloaded: int = 0
    shorts_created: int = 0
    uploads_attempted: int = 0
    uploads_successful: int = 0
    errors_count: int = 0
    avg_generation_time: float = 0.0
    avg_virality_score: float = 0.0
    last_cycle_time: Optional[datetime] = None
    total_runtime_hours: float = 0.0
    current_state: str = "idle"
    queue_size: int = 0


@dataclass
class DryRunReport:
    timestamp: str
    action: str
    video_id: str
    title: str
    predicted_ctr: float
    predicted_avd: float
    predicted_virality: float
    copyright_risk: str
    suggested_title: str
    suggested_tags: List[str]
    would_upload: bool
    tuning_recommendation: str


class UploadHistoryStore:
    """SQLite store for source videos that have entered the pipeline."""

    RETRYABLE_STATUSES = {"queued", "downloaded", "processed", "download_failed", "processing_failed"}

    def __init__(self, db_path: str = "pipeline/upload_history.sqlite3"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS source_videos (
                    video_id TEXT PRIMARY KEY,
                    title TEXT,
                    channel TEXT,
                    source_url TEXT,
                    first_seen_at TEXT NOT NULL,
                    last_status TEXT NOT NULL,
                    uploaded_video_id TEXT,
                    uploaded_url TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_source_status ON source_videos(last_status)"
            )

    def has_source(self, video_id: str) -> bool:
        if not video_id:
            return True
        with self._connect() as conn:
            row = conn.execute(
                "SELECT last_status FROM source_videos WHERE video_id = ? LIMIT 1",
                (video_id,)
            ).fetchone()
        if row is None:
            return False
        return row[0] not in self.RETRYABLE_STATUSES

    def mark_source(self, video: TrendingVideo, status: str):
        now = datetime.now().isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO source_videos (
                    video_id, title, channel, source_url, first_seen_at, last_status, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(video_id) DO UPDATE SET
                    title = excluded.title,
                    channel = excluded.channel,
                    source_url = excluded.source_url,
                    last_status = excluded.last_status,
                    updated_at = excluded.updated_at
                """,
                (video.video_id, video.title, video.channel, video.url, now, status, now)
            )

    def mark_result(self, result: dict, status: str, upload_result: Optional[dict] = None):
        original = result.get("original_video", {})
        video_id = original.get("video_id")
        if not video_id:
            return

        now = datetime.now().isoformat()
        upload_result = upload_result or {}
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO source_videos (
                    video_id, title, channel, source_url, first_seen_at, last_status,
                    uploaded_video_id, uploaded_url, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(video_id) DO UPDATE SET
                    title = excluded.title,
                    channel = excluded.channel,
                    source_url = excluded.source_url,
                    last_status = excluded.last_status,
                    uploaded_video_id = COALESCE(excluded.uploaded_video_id, uploaded_video_id),
                    uploaded_url = COALESCE(excluded.uploaded_url, uploaded_url),
                    updated_at = excluded.updated_at
                """,
                (
                    video_id,
                    original.get("title", ""),
                    original.get("channel", ""),
                    original.get("url", ""),
                    now,
                    status,
                    upload_result.get("video_id"),
                    upload_result.get("url"),
                    now,
                )
            )


class AutoLearningMemory:
    """Persistent feedback memory for hook, title, structure, and upload-time choices."""

    def __init__(self, db_path: str = "pipeline/learning_memory.sqlite3", enabled: bool = True):
        self.enabled = enabled
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.model_name = "outcome_ridge_v1"
        self._model_cache = None
        if self.enabled:
            self._init_db()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_experiments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_video_id TEXT,
                    uploaded_video_id TEXT,
                    category TEXT,
                    hook_style TEXT,
                    structure TEXT,
                    title_template TEXT,
                    upload_hour INTEGER,
                    title TEXT,
                    predicted_ctr REAL,
                    predicted_avd REAL,
                    predicted_virality REAL,
                    uploaded INTEGER DEFAULT 0,
                    views INTEGER DEFAULT 0,
                    likes INTEGER DEFAULT 0,
                    comments INTEGER DEFAULT 0,
                    shares INTEGER DEFAULT 0,
                    subscribers_gained INTEGER DEFAULT 0,
                    watch_time_minutes REAL DEFAULT 0,
                    average_view_duration REAL DEFAULT 0,
                    average_view_percentage REAL DEFAULT 0,
                    source_views INTEGER DEFAULT 0,
                    source_velocity REAL DEFAULT 0,
                    source_engagement_rate REAL DEFAULT 0,
                    source_duration INTEGER DEFAULT 0,
                    title_length INTEGER DEFAULT 0,
                    title_has_emoji INTEGER DEFAULT 0,
                    day_of_week INTEGER DEFAULT 0,
                    copyright_risk_score REAL DEFAULT 0.5,
                    engagement_score REAL DEFAULT 0,
                    outcome_score REAL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_scores (
                    dimension TEXT NOT NULL,
                    key TEXT NOT NULL,
                    category TEXT NOT NULL,
                    attempts INTEGER DEFAULT 0,
                    uploads INTEGER DEFAULT 0,
                    avg_predicted_virality REAL DEFAULT 50,
                    avg_outcome_score REAL DEFAULT 50,
                    last_used_at TEXT,
                    PRIMARY KEY (dimension, key, category)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_learning_uploaded ON learning_experiments(uploaded_video_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_learning_source ON learning_experiments(source_video_id)")
            self._ensure_columns(conn, "learning_experiments", {
                "shares": "INTEGER DEFAULT 0",
                "subscribers_gained": "INTEGER DEFAULT 0",
                "watch_time_minutes": "REAL DEFAULT 0",
                "average_view_duration": "REAL DEFAULT 0",
                "average_view_percentage": "REAL DEFAULT 0",
                "source_views": "INTEGER DEFAULT 0",
                "source_velocity": "REAL DEFAULT 0",
                "source_engagement_rate": "REAL DEFAULT 0",
                "source_duration": "INTEGER DEFAULT 0",
                "title_length": "INTEGER DEFAULT 0",
                "title_has_emoji": "INTEGER DEFAULT 0",
                "day_of_week": "INTEGER DEFAULT 0",
                "copyright_risk_score": "REAL DEFAULT 0.5",
            })
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ml_model_state (
                    name TEXT PRIMARY KEY,
                    feature_names TEXT NOT NULL,
                    weights TEXT NOT NULL,
                    trained_samples INTEGER NOT NULL,
                    mae REAL NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _ensure_columns(self, conn, table: str, columns: Dict[str, str]):
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for name, definition in columns.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    def choose(self, dimension: str, options: List[str], category: str, exploration_rate: float = 0.18) -> str:
        """Choose a learned option while keeping some exploration."""
        if not options:
            return ""
        if not self.enabled or random.random() < exploration_rate:
            return random.choice(options)

        ml_choice = self._choose_with_model(dimension, options, category)
        if ml_choice:
            return ml_choice

        category_key = self._category_key(category)
        weights = []
        with self._connect() as conn:
            for option in options:
                row = conn.execute(
                    """
                    SELECT attempts, uploads, avg_predicted_virality, avg_outcome_score
                    FROM learning_scores
                    WHERE dimension = ? AND key = ? AND category IN (?, 'global')
                    ORDER BY CASE WHEN category = ? THEN 0 ELSE 1 END
                    LIMIT 1
                    """,
                    (dimension, option, category_key, category_key)
                ).fetchone()
                if row:
                    attempts, uploads, predicted, outcome = row
                    confidence = min(max(attempts, 1) / 8, 1)
                    upload_bonus = min(uploads, 5) * 2
                    weight = max(0.1, ((predicted * 0.35 + outcome * 0.65) / 100) * (0.4 + confidence) + upload_bonus / 100)
                else:
                    weight = 0.55
                weights.append(weight)
        return random.choices(options, weights=weights, k=1)[0]

    def train_model(self, min_samples: int = 12) -> bool:
        """Train a local ridge-regression outcome predictor from memory."""
        if not self.enabled:
            return False

        rows = self._training_rows()
        if len(rows) < min_samples:
            return False

        feature_names = self._build_feature_names(rows)
        x = np.array([self._features_from_row(row, feature_names) for row in rows], dtype=float)
        y = np.array([float(row["outcome_score"] or 0) for row in rows], dtype=float)

        split = max(int(len(rows) * 0.8), 1)
        x_train, y_train = x[:split], y[:split]
        x_eval, y_eval = x[split:], y[split:]

        alpha = 0.75
        identity = np.eye(x_train.shape[1])
        identity[0, 0] = 0
        try:
            weights = np.linalg.solve(x_train.T @ x_train + alpha * identity, x_train.T @ y_train)
        except np.linalg.LinAlgError:
            weights = np.linalg.pinv(x_train.T @ x_train + alpha * identity) @ x_train.T @ y_train

        predictions = x_eval @ weights if len(x_eval) else x_train @ weights
        actual = y_eval if len(y_eval) else y_train
        mae = float(np.mean(np.abs(predictions - actual))) if len(actual) else 0.0
        now = datetime.now().isoformat()

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ml_model_state (name, feature_names, weights, trained_samples, mae, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    feature_names = excluded.feature_names,
                    weights = excluded.weights,
                    trained_samples = excluded.trained_samples,
                    mae = excluded.mae,
                    updated_at = excluded.updated_at
                """,
                (
                    self.model_name,
                    json.dumps(feature_names),
                    json.dumps([float(w) for w in weights]),
                    len(rows),
                    mae,
                    now,
                )
            )
        self._model_cache = {"feature_names": feature_names, "weights": weights, "mae": mae, "trained_samples": len(rows)}
        logger.info(f"Auto-learning ML model trained on {len(rows)} samples, MAE {mae:.2f}")
        return True

    def predict_outcome(self, candidate: dict) -> Optional[float]:
        """Predict expected outcome score for a candidate plan."""
        model = self._load_model()
        if not model:
            return None
        feature_names = model["feature_names"]
        weights = model["weights"]
        row = {
            "category": self._category_key(candidate.get("category")),
            "hook_style": candidate.get("hook_style") or "source_clip",
            "structure": candidate.get("structure") or "informational",
            "title_template": candidate.get("title_template") or "source_title",
            "upload_hour": int(candidate.get("upload_hour", datetime.now().hour) or 0),
            "day_of_week": int(candidate.get("day_of_week", datetime.now().weekday()) or 0),
            "predicted_ctr": float(candidate.get("predicted_ctr", 55) or 55),
            "predicted_avd": float(candidate.get("predicted_avd", 55) or 55),
            "predicted_virality": float(candidate.get("predicted_virality", 55) or 55),
            "source_views": float(candidate.get("source_views", 0) or 0),
            "source_velocity": float(candidate.get("source_velocity", 0) or 0),
            "source_engagement_rate": float(candidate.get("source_engagement_rate", 0) or 0),
            "source_duration": float(candidate.get("source_duration", 60) or 60),
            "title_length": float(candidate.get("title_length", 50) or 50),
            "title_has_emoji": float(candidate.get("title_has_emoji", 1) or 0),
            "copyright_risk_score": float(candidate.get("copyright_risk_score", 0.5) or 0.5),
            "uploaded": int(candidate.get("uploaded", 0) or 0),
        }
        vector = np.array(self._features_from_row(row, feature_names), dtype=float)
        return float(np.clip(vector @ weights, 0, 100))

    def record_prediction(self, result: dict):
        if not self.enabled:
            return
        original = result.get("original_video", {})
        metadata = result.get("metadata", {})
        script = result.get("new_script", {})
        prediction = result.get("prediction", {})
        learning = result.get("learning", {})
        safety = result.get("copyright_report", {})
        now = datetime.now().isoformat()
        category = self._category_key(metadata.get("category") or original.get("category"))
        predicted_virality = float(prediction.get("predicted_virality", 0) or 0)
        title = metadata.get("title", "")

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO learning_experiments (
                    source_video_id, category, hook_style, structure, title_template,
                    title, predicted_ctr, predicted_avd, predicted_virality,
                    source_views, source_velocity, source_engagement_rate, source_duration,
                    title_length, title_has_emoji, day_of_week, copyright_risk_score,
                    outcome_score, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    original.get("video_id"),
                    category,
                    script.get("style", "source_clip"),
                    script.get("structure", ""),
                    learning.get("title_template", "source_title"),
                    metadata.get("title", ""),
                    float(prediction.get("predicted_ctr", 0) or 0),
                    float(prediction.get("predicted_avd", 0) or 0),
                    predicted_virality,
                    int(original.get("views", 0) or 0),
                    float(original.get("velocity_score", 0) or 0),
                    float(original.get("engagement_rate", 0) or 0),
                    int(original.get("duration", 0) or 0),
                    len(title),
                    int(self._has_emoji(title)),
                    datetime.now().weekday(),
                    float(safety.get("overall_risk_score", 0.5) or 0.5),
                    predicted_virality,
                    now,
                    now,
                )
            )

        self._update_score("hook_style", script.get("style", "source_clip"), category, predicted_virality, uploaded=False)
        self._update_score("structure", script.get("structure", ""), category, predicted_virality, uploaded=False)
        self._update_score("title_template", learning.get("title_template", "source_title"), category, predicted_virality, uploaded=False)
        self.train_model()

    def record_upload(self, result: dict, upload_result: dict):
        if not self.enabled:
            return
        original = result.get("original_video", {})
        metadata = result.get("metadata", {})
        script = result.get("new_script", {})
        learning = result.get("learning", {})
        prediction = result.get("prediction", {})
        category = self._category_key(metadata.get("category") or original.get("category"))
        upload_hour = datetime.now().hour
        outcome = max(float(prediction.get("predicted_virality", 0) or 0), 65)
        now = datetime.now().isoformat()

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE learning_experiments
                SET uploaded = 1,
                    uploaded_video_id = ?,
                    upload_hour = ?,
                    outcome_score = ?,
                    updated_at = ?
                WHERE id = (
                    SELECT id FROM learning_experiments
                    WHERE source_video_id = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                )
                """,
                (upload_result.get("video_id"), upload_hour, outcome, now, original.get("video_id"))
            )

        self._update_score("hook_style", script.get("style", "source_clip"), category, outcome, uploaded=True)
        self._update_score("structure", script.get("structure", ""), category, outcome, uploaded=True)
        self._update_score("title_template", learning.get("title_template", "source_title"), category, outcome, uploaded=True)
        self._update_score("upload_hour", str(upload_hour), category, outcome, uploaded=True)
        self.train_model()

    def update_observed_metrics(self, video_id: str, metrics: dict):
        if not self.enabled or not video_id:
            return
        views = int(metrics.get("views", 0) or 0)
        likes = int(metrics.get("likes", 0) or 0)
        comments = int(metrics.get("comments", 0) or 0)
        shares = int(metrics.get("shares", 0) or 0)
        subscribers = int(metrics.get("subscribers_gained", 0) or 0)
        watch_time = float(metrics.get("watch_time_minutes", 0) or 0)
        avg_duration = float(metrics.get("average_view_duration", 0) or 0)
        avg_percentage = float(metrics.get("average_view_percentage", 0) or 0)
        analytics_views = int(metrics.get("analytics_views", 0) or 0)
        if analytics_views > views:
            views = analytics_views
        likes = max(likes, int(metrics.get("analytics_likes", 0) or 0))
        comments = max(comments, int(metrics.get("analytics_comments", 0) or 0))
        engagement = ((likes * 2 + comments * 4 + shares * 6 + subscribers * 10) / max(views, 1)) * 100
        retention = min(avg_percentage, 100) * 0.45 + min(avg_duration / 60, 1) * 20
        watch_weight = min(watch_time / 500, 1) * 15
        outcome = min(100, (min(views, 100000) / 1200) + engagement + retention + watch_weight)
        now = datetime.now().isoformat()

        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT category, hook_style, structure, title_template, upload_hour
                FROM learning_experiments
                WHERE uploaded_video_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (video_id,)
            ).fetchone()
            conn.execute(
                """
                UPDATE learning_experiments
                SET views = ?, likes = ?, comments = ?, shares = ?, subscribers_gained = ?,
                    watch_time_minutes = ?, average_view_duration = ?, average_view_percentage = ?,
                    engagement_score = ?, outcome_score = ?, updated_at = ?
                WHERE uploaded_video_id = ?
                """,
                (
                    views, likes, comments, shares, subscribers,
                    watch_time, avg_duration, avg_percentage,
                    engagement, outcome, now, video_id
                )
            )

        if row:
            category, hook_style, structure, title_template, upload_hour = row
            self._update_score("hook_style", hook_style, category, outcome, uploaded=True)
            self._update_score("structure", structure, category, outcome, uploaded=True)
            self._update_score("title_template", title_template, category, outcome, uploaded=True)
            self._update_score("upload_hour", str(upload_hour), category, outcome, uploaded=True)
            self.train_model()

    def _choose_with_model(self, dimension: str, options: List[str], category: str) -> Optional[str]:
        model = self._load_model()
        if not model:
            return None

        scored = []
        for option in options:
            candidate = {
                "category": category,
                "hook_style": option if dimension == "hook_style" else "source_clip",
                "structure": option if dimension == "structure" else "informational",
                "title_template": option if dimension == "title_template" else "source_title",
                "upload_hour": int(option) if dimension == "upload_hour" and str(option).isdigit() else datetime.now().hour,
            }
            score = self.predict_outcome(candidate)
            if score is not None:
                scored.append((option, score))
        if not scored:
            return None
        scored.sort(key=lambda item: item[1], reverse=True)
        top = scored[: max(1, min(3, len(scored)))]
        weights = [max(score, 1) for _, score in top]
        return random.choices([option for option, _ in top], weights=weights, k=1)[0]

    def _load_model(self):
        if self._model_cache:
            return self._model_cache
        try:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT feature_names, weights, trained_samples, mae FROM ml_model_state WHERE name = ?",
                    (self.model_name,)
                ).fetchone()
            if not row:
                return None
            feature_names = json.loads(row[0])
            weights = np.array(json.loads(row[1]), dtype=float)
            self._model_cache = {
                "feature_names": feature_names,
                "weights": weights,
                "trained_samples": row[2],
                "mae": row[3],
            }
            return self._model_cache
        except Exception as e:
            logger.warning(f"Could not load ML learning model: {e}")
            return None

    def _training_rows(self) -> List[dict]:
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT category, hook_style, structure, title_template, upload_hour,
                       predicted_ctr, predicted_avd, predicted_virality, uploaded,
                       views, likes, comments, shares, subscribers_gained,
                       watch_time_minutes, average_view_duration, average_view_percentage,
                       source_views, source_velocity, source_engagement_rate, source_duration,
                       title_length, title_has_emoji, day_of_week, copyright_risk_score,
                       outcome_score
                FROM learning_experiments
                WHERE outcome_score IS NOT NULL AND outcome_score > 0
                ORDER BY created_at ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def _build_feature_names(self, rows: List[dict]) -> List[str]:
        features = [
            "bias",
            "predicted_ctr",
            "predicted_avd",
            "predicted_virality",
            "upload_hour_sin",
            "upload_hour_cos",
            "day_of_week_sin",
            "day_of_week_cos",
            "source_views_log",
            "source_velocity_log",
            "source_engagement_rate",
            "source_duration",
            "title_length",
            "title_has_emoji",
            "copyright_risk_score",
            "views_log",
            "engagement_score_raw",
            "watch_time_log",
            "average_view_duration",
            "average_view_percentage",
            "uploaded",
        ]
        for field in ["category", "hook_style", "structure", "title_template"]:
            values = sorted({str(row.get(field) or "unknown") for row in rows})
            features.extend([f"{field}={value}" for value in values[:60]])
        return features

    def _features_from_row(self, row: dict, feature_names: List[str]) -> List[float]:
        hour = int(row.get("upload_hour") or 0) % 24
        day = int(row.get("day_of_week") or 0) % 7
        views = float(row.get("views") or 0)
        likes = float(row.get("likes") or 0)
        comments = float(row.get("comments") or 0)
        shares = float(row.get("shares") or 0)
        subscribers = float(row.get("subscribers_gained") or 0)
        engagement_raw = ((likes * 2 + comments * 4 + shares * 6 + subscribers * 10) / max(views, 1)) * 100
        base = {
            "bias": 1.0,
            "predicted_ctr": float(row.get("predicted_ctr") or 0) / 100,
            "predicted_avd": float(row.get("predicted_avd") or 0) / 100,
            "predicted_virality": float(row.get("predicted_virality") or 0) / 100,
            "upload_hour_sin": float(np.sin((hour / 24) * 2 * np.pi)),
            "upload_hour_cos": float(np.cos((hour / 24) * 2 * np.pi)),
            "day_of_week_sin": float(np.sin((day / 7) * 2 * np.pi)),
            "day_of_week_cos": float(np.cos((day / 7) * 2 * np.pi)),
            "source_views_log": float(np.log1p(float(row.get("source_views") or 0)) / 14),
            "source_velocity_log": float(np.log1p(float(row.get("source_velocity") or 0)) / 12),
            "source_engagement_rate": float(row.get("source_engagement_rate") or 0),
            "source_duration": min(float(row.get("source_duration") or 0) / 600, 1),
            "title_length": min(float(row.get("title_length") or 0) / 100, 1),
            "title_has_emoji": float(row.get("title_has_emoji") or 0),
            "copyright_risk_score": float(row.get("copyright_risk_score") or 0.5),
            "views_log": float(np.log1p(views) / 14),
            "engagement_score_raw": float(engagement_raw / 100),
            "watch_time_log": float(np.log1p(float(row.get("watch_time_minutes") or 0)) / 10),
            "average_view_duration": min(float(row.get("average_view_duration") or 0) / 120, 1),
            "average_view_percentage": min(float(row.get("average_view_percentage") or 0) / 100, 1),
            "uploaded": float(row.get("uploaded") or 0),
        }
        vector = []
        for name in feature_names:
            if name in base:
                vector.append(base[name])
            elif "=" in name:
                field, expected = name.split("=", 1)
                vector.append(1.0 if str(row.get(field) or "unknown") == expected else 0.0)
            else:
                vector.append(0.0)
        return vector

    def _update_score(self, dimension: str, key: Optional[str], category: str, score: float, uploaded: bool):
        if not key:
            return
        now = datetime.now().isoformat()
        category_key = self._category_key(category)
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT attempts, uploads, avg_predicted_virality, avg_outcome_score
                FROM learning_scores
                WHERE dimension = ? AND key = ? AND category = ?
                """,
                (dimension, key, category_key)
            ).fetchone()
            if existing:
                attempts, uploads, avg_predicted, avg_outcome = existing
                attempts += 1
                uploads += 1 if uploaded else 0
                avg_predicted = ((avg_predicted * (attempts - 1)) + score) / attempts
                avg_outcome = ((avg_outcome * (attempts - 1)) + score) / attempts
                conn.execute(
                    """
                    UPDATE learning_scores
                    SET attempts = ?, uploads = ?, avg_predicted_virality = ?,
                        avg_outcome_score = ?, last_used_at = ?
                    WHERE dimension = ? AND key = ? AND category = ?
                    """,
                    (attempts, uploads, avg_predicted, avg_outcome, now, dimension, key, category_key)
                )
            else:
                conn.execute(
                    """
                    INSERT INTO learning_scores (
                        dimension, key, category, attempts, uploads,
                        avg_predicted_virality, avg_outcome_score, last_used_at
                    )
                    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
                    """,
                    (dimension, key, category_key, 1 if uploaded else 0, score, score, now)
                )

    def _category_key(self, category: Optional[str]) -> str:
        return re.sub(r"\s+", "_", str(category or "global").strip().lower()) or "global"

    def _has_emoji(self, text: str) -> bool:
        return any(ord(char) > 10000 for char in text or "")


class TrendingVideoScanner:
    """Continuously scans YouTube for trending viral videos"""

    def __init__(self, config: dict, history: Optional[UploadHistoryStore] = None):
        self.config = config
        self.history = history
        self.processed_ids = set()
        self.trending_cache = []
        self.last_scan = None
        self.scan_interval = config.get("scan_interval_minutes", 30)
        self.min_views_threshold = config.get("min_views", 50000)
        self.max_age_hours = config.get("max_video_age_hours", 48)
        self.max_duration = config.get("max_video_duration", 600)
        self.target_categories = config.get("categories", ["Entertainment", "Education", "Science", "Technology"])
        self.growth_keywords = [
            str(keyword).lower()
            for keyword in config.get("growth_audience_keywords", [])
            if str(keyword).strip()
        ]

    async def continuous_scan(self, queue: asyncio.Queue):
        """Run continuous background scanning"""
        while True:
            try:
                logger.info("Starting trend scan cycle...")
                new_videos = await self._scan_all_sources()

                for video in new_videos:
                    if self.history and self.history.has_source(video.video_id):
                        continue
                    if video.video_id not in self.processed_ids:
                        await queue.put(video)
                        self.processed_ids.add(video.video_id)
                        if self.history:
                            self.history.mark_source(video, "queued")
                        logger.info(f"Queued new trending video: {video.title[:50]}...")

                self.last_scan = datetime.now()
                logger.info(f"Scan complete. Queue size: {queue.qsize()}")

                await asyncio.sleep(self.scan_interval * 60)

            except Exception as e:
                logger.error(f"Scan error: {e}")
                await asyncio.sleep(300)  # Wait 5 min on error

    async def _scan_all_sources(self) -> List[TrendingVideo]:
        """Aggregate trending videos from multiple sources"""
        tasks = []
        if self.config.get("use_youtube_data_api_trends", True):
            tasks.append(self._scan_youtube_data_api_trending())
        if self.config.get("use_yt_dlp_trending_fallback", False):
            tasks.append(self._scan_youtube_trending())
        tasks.extend([
            self._scan_youtube_shorts_shelf(),
            self._scan_youtube_search_suggestions(),
            self._scan_reddit_viral(),
            self._scan_tiktok_trending()
        ])

        results = await asyncio.gather(*tasks, return_exceptions=True)
        all_videos = []

        for result in results:
            if isinstance(result, list):
                all_videos.extend(result)

        # Deduplicate and score
        unique_videos = self._deduplicate_and_score(all_videos)
        if self.history:
            unique_videos = [
                video for video in unique_videos
                if not self.history.has_source(video.video_id)
            ]

        # Filter by criteria. Growth mode allows promising early trends through
        # before they are already saturated.
        filtered = [v for v in unique_videos if self._passes_trend_filter(v)]

        return sorted(filtered, key=lambda x: x.velocity_score, reverse=True)[:20]

    def _passes_trend_filter(self, video: TrendingVideo) -> bool:
        if not (0 < video.duration <= self.max_duration):
            return False
        if (datetime.now() - video.upload_time).total_seconds() >= self.max_age_hours * 3600:
            return False

        if self.config.get("subscriber_growth_goal_enabled", False):
            min_views = int(self.config.get("growth_min_views", 10000) or 10000)
            min_engagement = float(self.config.get("growth_min_engagement_rate", 0.015) or 0.015)
            if self._audience_growth_score(video.title, video.category) >= 0.25:
                return video.views >= min_views and video.engagement_rate >= min_engagement

        return video.views >= self.min_views_threshold and video.engagement_rate > 0.03

    async def _scan_youtube_data_api_trending(self) -> List[TrendingVideo]:
        """Fetch US most-popular videos from the official YouTube Data API."""
        api_key = os.getenv("YOUTUBE_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            logger.warning("YouTube Data API trend fetch skipped - set YOUTUBE_API_KEY or GOOGLE_API_KEY")
            return []

        try:
            from googleapiclient.discovery import build

            youtube = build("youtube", "v3", developerKey=api_key, cache_discovery=False)
            params = {
                "part": "snippet,statistics,contentDetails",
                "chart": "mostPopular",
                "regionCode": self.config.get("youtube_region_code", "US"),
                "maxResults": int(self.config.get("youtube_api_max_results", 50)),
            }
            if self.config.get("youtube_video_category_id"):
                params["videoCategoryId"] = self.config["youtube_video_category_id"]

            response = youtube.videos().list(**params).execute()

            videos = []
            for item in response.get("items", []):
                video = self._video_from_youtube_api_item(item)
                if video:
                    videos.append(video)

            logger.info(f"YouTube Data API fetched {len(videos)} trend candidates")
            return videos
        except Exception as e:
            logger.warning(f"YouTube Data API trend fetch failed: {e}")
            return []

    def _video_from_youtube_api_item(self, item: dict) -> Optional[TrendingVideo]:
        video_id = item.get("id")
        snippet = item.get("snippet", {})
        statistics = item.get("statistics", {})
        content_details = item.get("contentDetails", {})
        if not video_id or not snippet:
            return None

        published_at = snippet.get("publishedAt")
        try:
            upload_time = datetime.fromisoformat(published_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            upload_time = datetime.now()

        views = self._safe_int(statistics.get("viewCount"), 0)
        likes = self._safe_int(statistics.get("likeCount"), 0)
        comments = self._safe_int(statistics.get("commentCount"), 0)
        duration = self._parse_iso8601_duration(content_details.get("duration", "PT0S"))
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (
            thumbnails.get("maxres")
            or thumbnails.get("standard")
            or thumbnails.get("high")
            or thumbnails.get("default")
            or {}
        ).get("url", "")

        if views <= 0:
            engagement_rate = 0.0
        elif likes == 0 and comments == 0:
            engagement_rate = float(self.config.get("youtube_api_default_engagement_rate", 0.05))
        else:
            engagement_rate = (likes * 2 + comments * 5) / views
        hours_since = max((datetime.now() - upload_time).total_seconds() / 3600, 1)

        return TrendingVideo(
            video_id=video_id,
            title=snippet.get("title", ""),
            channel=snippet.get("channelTitle", ""),
            views=views,
            upload_time=upload_time,
            duration=duration,
            category=snippet.get("categoryId", "Unknown"),
            thumbnail_url=thumbnail,
            url=f"https://youtube.com/watch?v={video_id}",
            engagement_rate=engagement_rate,
            velocity_score=views / hours_since,
            niche_relevance=random.uniform(0.6, 1.0),
            description=snippet.get("description", "")
        )

    def _parse_iso8601_duration(self, value: str) -> int:
        match = re.fullmatch(
            r"P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?",
            value or ""
        )
        if not match:
            return 0
        days = self._safe_int(match.group("days"), 0)
        hours = self._safe_int(match.group("hours"), 0)
        minutes = self._safe_int(match.group("minutes"), 0)
        seconds = self._safe_int(match.group("seconds"), 0)
        return days * 86400 + hours * 3600 + minutes * 60 + seconds

    async def _scan_youtube_trending(self) -> List[TrendingVideo]:
        """Scan YouTube trending page"""
        import yt_dlp

        ydl_opts = {
            'quiet': True,
            'extract_flat': False,
            'playlistend': 50,
            'ignoreerrors': True,
        }

        videos = []
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Get trending feed
                trending_url = self.config.get("youtube_trending_url", "https://www.youtube.com/feed/trending")
                try:
                    info = ydl.extract_info(trending_url, download=False)
                    entries = info.get('entries', []) if info else []
                except Exception as e:
                    logger.warning(f"YouTube trending page unavailable, using search fallback: {e}")
                    entries = []

                if not entries:
                    entries = []
                    search_terms = self.config.get(
                        "trend_search_terms",
                        ["trending today", "viral video today", "breaking viral", "new technology explained"]
                    )
                    for term in search_terms:
                        try:
                            search_info = ydl.extract_info(f"ytsearch10:{term}", download=False)
                            if search_info:
                                entries.extend(search_info.get("entries", []))
                        except Exception as e:
                            logger.warning(f"YouTube search fallback failed for '{term}': {e}")

                for entry in entries:
                    if not entry:
                        continue
                    views = self._safe_int(entry.get('view_count'), 0)
                    if views < self.min_views_threshold:
                        continue

                    video = TrendingVideo(
                        video_id=entry.get('id', ''),
                        title=entry.get('title', ''),
                        channel=entry.get('channel', ''),
                        views=views,
                        upload_time=self._entry_upload_time(entry),
                        duration=self._safe_int(entry.get('duration'), 0),
                        category=entry.get('categories', ['Unknown'])[0] if entry.get('categories') else 'Unknown',
                        thumbnail_url=entry.get('thumbnail', ''),
                        url=f"https://youtube.com/watch?v={entry.get('id', '')}",
                        engagement_rate=self._estimate_engagement(entry),
                        velocity_score=self._calculate_velocity(entry),
                        niche_relevance=random.uniform(0.6, 1.0),
                        description=entry.get('description', '')
                    )
                    videos.append(video)

        except Exception as e:
            logger.warning(f"YouTube trending scan error: {e}")

        return videos

    def _safe_int(self, value, default: int = 0) -> int:
        """Convert yt-dlp optional numeric metadata into a safe integer."""
        try:
            if value is None:
                return default
            return int(value)
        except (TypeError, ValueError):
            return default

    def _entry_upload_time(self, entry: dict) -> datetime:
        """Get a best-effort upload date from yt-dlp metadata."""
        if entry.get("timestamp"):
            return datetime.fromtimestamp(entry["timestamp"])
        upload_date = entry.get("upload_date")
        if upload_date:
            try:
                return datetime.strptime(upload_date, "%Y%m%d")
            except ValueError:
                pass
        return datetime.now()

    async def _scan_youtube_shorts_shelf(self) -> List[TrendingVideo]:
        """Scan YouTube Shorts trending shelf"""
        # Use yt-dlp with Shorts-specific extraction
        # or browser automation for Shorts shelf
        return []

    async def _scan_youtube_search_suggestions(self) -> List[TrendingVideo]:
        """Find growth-oriented videos from configured YouTube search terms."""
        api_key = os.getenv("YOUTUBE_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return []

        terms = self.config.get("growth_discovery_terms") or self.config.get("trend_search_terms", [])
        terms = [str(term).strip() for term in terms if str(term).strip()]
        if not terms:
            return []

        try:
            from googleapiclient.discovery import build

            youtube = build("youtube", "v3", developerKey=api_key, cache_discovery=False)
            video_ids = []
            max_per_term = int(self.config.get("growth_search_results_per_term", 5) or 5)
            discovery_groups = self.config.get("growth_discovery_groups") or []

            if discovery_groups:
                for group in discovery_groups[:12]:
                    group_terms = [
                        str(term).strip()
                        for term in group.get("terms", [])
                        if str(term).strip()
                    ]
                    if not group_terms:
                        continue
                    group_limit = int(group.get("max_results", max_per_term) or max_per_term)
                    group_ids = []

                    for term in group_terms:
                        params = {
                            "part": "snippet",
                            "q": term,
                            "type": "video",
                            "order": "relevance",
                            "publishedAfter": (datetime.utcnow() - timedelta(hours=self.max_age_hours)).isoformat("T") + "Z",
                            "maxResults": max(min(max_per_term, group_limit), 1),
                            "regionCode": self.config.get("youtube_region_code", "US"),
                            "safeSearch": "none",
                        }
                        if self.config.get("content_language"):
                            params["relevanceLanguage"] = self.config.get("content_language")
                        response = youtube.search().list(**params).execute()
                        for item in response.get("items", []):
                            video_id = item.get("id", {}).get("videoId")
                            if video_id and video_id not in group_ids:
                                group_ids.append(video_id)
                            if len(group_ids) >= group_limit:
                                break
                        if len(group_ids) >= group_limit:
                            break

                    video_ids.extend(group_ids[:group_limit])
            else:
                for term in terms[:12]:
                    params = {
                        "part": "snippet",
                        "q": term,
                        "type": "video",
                        "order": "relevance",
                        "publishedAfter": (datetime.utcnow() - timedelta(hours=self.max_age_hours)).isoformat("T") + "Z",
                        "maxResults": max_per_term,
                        "regionCode": self.config.get("youtube_region_code", "US"),
                        "safeSearch": "none",
                    }
                    if self.config.get("content_language"):
                        params["relevanceLanguage"] = self.config.get("content_language")
                    response = youtube.search().list(**params).execute()
                    for item in response.get("items", []):
                        video_id = item.get("id", {}).get("videoId")
                        if video_id:
                            video_ids.append(video_id)

            unique_ids = list(dict.fromkeys(video_ids))
            videos = []
            for index in range(0, len(unique_ids), 50):
                chunk = unique_ids[index:index + 50]
                response = youtube.videos().list(
                    part="snippet,statistics,contentDetails",
                    id=",".join(chunk),
                    maxResults=len(chunk),
                ).execute()
                for item in response.get("items", []):
                    video = self._video_from_youtube_api_item(item)
                    if video:
                        videos.append(video)

            logger.info(f"YouTube growth search fetched {len(videos)} candidates")
            return videos
        except Exception as e:
            logger.warning(f"YouTube growth search failed: {e}")
            return []

    async def _scan_reddit_viral(self) -> List[TrendingVideo]:
        """Scan Reddit for viral video discussions"""
        # Use PRAW to scan r/videos, r/YouTube, etc.
        return []

    async def _scan_tiktok_trending(self) -> List[TrendingVideo]:
        """Cross-reference TikTok trends"""
        # Use TikTok Creative Center API
        return []

    def _estimate_engagement(self, entry: dict) -> float:
        """Estimate engagement rate from available data"""
        views = self._safe_int(entry.get('view_count'), 1)
        likes = self._safe_int(entry.get('like_count'), 0)
        comments = self._safe_int(entry.get('comment_count'), 0)

        if views == 0:
            return 0.0

        # Weighted engagement estimate
        return (likes * 2 + comments * 5) / views

    def _calculate_velocity(self, entry: dict) -> float:
        """Calculate view velocity (views per hour since upload)"""
        views = self._safe_int(entry.get('view_count'), 0)
        timestamp = self._safe_int(entry.get('timestamp'), int(time.time()))
        upload_time = datetime.fromtimestamp(timestamp)
        hours_since = (datetime.now() - upload_time).total_seconds() / 3600

        if hours_since < 1:
            hours_since = 1

        return views / hours_since

    def _deduplicate_and_score(self, videos: List[TrendingVideo]) -> List[TrendingVideo]:
        """Remove duplicates and calculate composite scores"""
        seen = set()
        unique = []

        for v in videos:
            if v.video_id not in seen:
                seen.add(v.video_id)
                # Calculate composite opportunity score
                v.velocity_score = v.velocity_score * 0.4 + v.engagement_rate * v.views * 0.6
                if self.config.get("subscriber_growth_goal_enabled", False):
                    v.velocity_score *= 1 + (self._audience_growth_score(v.title, v.category) * 0.35)
                unique.append(v)

        return unique

    def _audience_growth_score(self, title: str, category: str) -> float:
        """Score whether a trend can pull broad, subscriber-friendly attention."""
        text = f"{title} {category}".lower()
        if not self.growth_keywords:
            return 0.0
        matches = sum(1 for keyword in self.growth_keywords if keyword in text)
        return min(matches / 4, 1.0)


class VideoDownloader:
    """Handles video downloading with metadata extraction"""

    def __init__(self, download_dir: str = "downloads", max_duration: int = 600, config: Optional[dict] = None):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(exist_ok=True)
        self.max_duration = max_duration  # Max 10 minutes
        self.config = config or {}

    def _cookie_attempts(self) -> List[Tuple[str, Optional[str]]]:
        cookie_file = self.config.get("yt_dlp_cookie_file")
        if cookie_file:
            return [("file", cookie_file)]

        configured = str(self.config.get("yt_dlp_cookies_from_browser", "") or "").strip()
        if not configured:
            return [("none", None)]

        attempts = []
        for raw in configured.split(","):
            browser = raw.strip()
            if browser:
                attempts.append(("browser", browser))
        attempts.append(("none", None))
        return attempts

    async def download_video(self, video: TrendingVideo) -> Optional[str]:
        """Download video and extract all metadata"""
        import yt_dlp

        output_path = self.download_dir / f"{video.video_id}.mp4"

        ydl_opts = {
            'format': 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]',
            'outtmpl': str(self.download_dir / f"{video.video_id}.%(ext)s"),
            'writeinfojson': True,
            'writesubtitles': bool(self.config.get("yt_dlp_write_subtitles", False)),
            'writeautomaticsub': bool(self.config.get("yt_dlp_write_subtitles", False)),
            'subtitleslangs': ['en'],
            'quiet': True,
            'no_warnings': True,
            'max_filesize': 500 * 1024 * 1024,  # 500MB max
            'merge_output_format': 'mp4',
        }

        logger.info(f"Downloading: {video.title[:60]}...")
        last_error = None

        for cookie_kind, cookie_value in self._cookie_attempts():
            attempt_opts = dict(ydl_opts)
            if cookie_kind == "file" and cookie_value:
                attempt_opts["cookiefile"] = cookie_value
                logger.info(f"Using yt-dlp cookie file: {cookie_value}")
            elif cookie_kind == "browser" and cookie_value:
                attempt_opts["cookiesfrombrowser"] = (cookie_value,)
                logger.info(f"Trying yt-dlp browser cookies from: {cookie_value}")

            try:
                with yt_dlp.YoutubeDL(attempt_opts) as ydl:
                    info = ydl.extract_info(video.url, download=True)

                    # Check duration
                    if info.get('duration', 0) > self.max_duration:
                        logger.warning(f"Video too long ({info['duration']}s), skipping")
                        output_path.unlink(missing_ok=True)
                        return None

                    actual_path = Path(ydl.prepare_filename(info)).with_suffix(".mp4")
                    if not actual_path.exists() and output_path.exists():
                        actual_path = output_path
                    if not actual_path.exists():
                        candidates = sorted(self.download_dir.glob(f"{video.video_id}.*"))
                        media_candidates = [
                            p for p in candidates
                            if p.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}
                        ]
                        if media_candidates:
                            actual_path = media_candidates[0]

                    video.local_path = str(actual_path)
                    video.download_path = str(actual_path)

                    logger.info(f"Downloaded: {actual_path.name}")
                    return str(actual_path)

            except Exception as e:
                last_error = e
                message = str(e)
                if "Could not copy Chrome cookie database" in message:
                    logger.warning("Chrome cookie database is locked. Close Chrome or use Edge/Firefox cookies.")
                    continue
                if "Sign in to confirm" in message and cookie_kind == "none":
                    break
                logger.warning(f"yt-dlp attempt failed ({cookie_value or 'no cookies'}): {e}")

        logger.error(f"Download failed for {video.video_id}: {last_error}")
        return None

    async def extract_metadata(self, video_path: str) -> dict:
        """Extract comprehensive metadata from downloaded video"""
        import ffmpeg

        try:
            probe = ffmpeg.probe(video_path)
            video_stream = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            audio_stream = next(s for s in probe['streams'] if s['codec_type'] == 'audio')

            return {
                'duration': float(probe['format']['duration']),
                'width': int(video_stream['width']),
                'height': int(video_stream['height']),
                'fps': self._safe_parse_frame_rate(video_stream.get('r_frame_rate', '30/1')),
                'bitrate': int(probe['format']['bit_rate']),
                'audio_codec': audio_stream['codec_name'],
                'video_codec': video_stream['codec_name'],
            }
        except Exception as e:
            logger.error(f"Metadata extraction error: {e}")
            return {}

    @staticmethod
    def _safe_parse_frame_rate(value: str) -> float:
        """Safely parse ffprobe frame rate strings like '30/1' without eval()."""
        try:
            if '/' in str(value):
                num, den = str(value).split('/', 1)
                denominator = float(den)
                return float(num) / denominator if denominator != 0 else 30.0
            return float(value)
        except (ValueError, TypeError, ZeroDivisionError):
            return 30.0


class AdaptiveContentRecreator:
    """Intelligently recreates content based on trend analysis"""

    def __init__(self, config: dict, learning_memory: Optional[AutoLearningMemory] = None):
        self.config = config
        self.learning_memory = learning_memory or AutoLearningMemory(enabled=False)
        self.hook_templates = self._load_hook_templates()

    def _format_upload_title(self, title: str, max_length: int) -> str:
        """Apply the configured title emoji while preserving title length limits."""
        emoji_options = self.config.get("upload_title_emojis") or [self.config.get("upload_title_emoji", "")]
        emoji_options = [str(emoji).strip() for emoji in emoji_options if str(emoji).strip()]
        emoji = random.choice(emoji_options) if emoji_options else ""
        title = title.strip()
        if not emoji or any(title.startswith(option) for option in emoji_options):
            return title

        titled = f"{emoji} {title}"
        if len(titled) > max_length:
            titled = titled[: max_length - 3].rstrip() + "..."
        return titled

    def _attractive_title_variant(self, title: str, topic: str, max_length: int) -> tuple[str, str]:
        """Add a compact curiosity word/phrase while keeping Shorts title limits."""
        clean = re.sub(r"\s+", " ", title).strip()
        topic = re.sub(r"\s+", " ", topic).strip() or clean
        lower = clean.lower()
        if self._is_french_content():
            variants = {
                "pourquoi_cartonne": f"Pourquoi {topic} cartonne",
                "a_voir": f"A voir: {topic}",
                "moment_fou": f"Moment fou: {topic}",
                "explique_vite": f"{topic} explique vite",
            }
            attractive_words = ["pourquoi", "cartonne", "fou", "incroyable", "secret", "verite", "explique"]
        else:
            variants = {
                "why_trending": f"Why {topic} Is Trending",
                "must_watch": f"Must Watch: {topic}",
                "wild_moment": f"Wild Moment: {topic}",
                "explained_fast": f"{topic} Explained Fast",
            }
            attractive_words = ["why", "must watch", "wild", "shocking", "secret", "truth", "explained", "trending"]

        if any(word in lower for word in attractive_words):
            return self._format_upload_title(clean[:max_length].rstrip(), max_length), "already_attractive"

        template_key = self.learning_memory.choose(
            "title_template",
            list(variants.keys()),
            topic,
            exploration_rate=float(self.config.get("learning_exploration_rate", 0.18))
        )
        candidate = variants.get(template_key, clean)
        if len(candidate) > max_length - 4:
            candidate = candidate[: max_length - 7].rstrip() + "..."
        return self._format_upload_title(candidate, max_length), template_key

    def _growth_goal_enabled(self) -> bool:
        return bool(self.config.get("subscriber_growth_goal_enabled", False))

    def _growth_daily_target(self) -> int:
        target = int(self.config.get("subscriber_growth_target", 10000) or 10000)
        current = int(self.config.get("subscriber_growth_current", 0) or 0)
        days = max(int(self.config.get("subscriber_growth_days", 15) or 15), 1)
        return max((target - current + days - 1) // days, 0)

    def _growth_keywords(self) -> List[str]:
        return [
            str(keyword).lower()
            for keyword in self.config.get("growth_audience_keywords", [])
            if str(keyword).strip()
        ]

    def _content_language(self) -> str:
        return str(self.config.get("content_language", "en")).lower()

    def _is_french_content(self) -> bool:
        return self._content_language().startswith("fr")

    def _audience_growth_score(self, metadata: dict) -> float:
        text = " ".join([
            str(metadata.get("title", "")),
            str(metadata.get("description", "")),
            str(metadata.get("category", "")),
        ]).lower()
        keywords = self._growth_keywords()
        if not keywords:
            return 0.0
        matches = sum(1 for keyword in keywords if keyword in text)
        return min(matches / 4, 1.0)

    def _subscriber_conversion_score(self, metadata: dict) -> float:
        text = f"{metadata.get('title', '')} {metadata.get('description', '')}".lower()
        score = 0.25
        if "subscribe" in text or "abonne" in text:
            score += 0.3
        if "daily" in text or "next" in text or "chaque jour" in text or "prochaine" in text:
            score += 0.15
        if "explained" in text or "why" in text or "how" in text or "explique" in text or "pourquoi" in text or "comment" in text:
            score += 0.15
        score += self._audience_growth_score(metadata) * 0.15
        return min(score, 1.0)

    def _apply_subscriber_growth_metadata(self, metadata: dict, video: TrendingVideo) -> dict:
        if not self._growth_goal_enabled():
            return metadata

        cta = str(self.config.get("subscriber_cta", "")).strip()
        promise = str(self.config.get("subscriber_value_promise", "")).strip()
        daily_target = self._growth_daily_target()
        if self._is_french_content():
            growth_tags = [
                "abonne toi",
                "shorts quotidien",
                "viral explique",
                "tendance france",
                "a voir",
                "actualite virale",
            ]
        else:
            growth_tags = [
                "subscribe",
                "daily shorts",
                "viral explained",
                "trending explained",
                "must watch",
                "creator growth",
            ]

        description_parts = [metadata.get("description", "").rstrip()]
        if cta:
            description_parts.extend(["", cta])
        if promise:
            prefix = "Sur cette chaine" if self._is_french_content() else "On this channel"
            description_parts.append(f"{prefix}: {promise}.")
        if daily_target:
            if self._is_french_content():
                description_parts.append(f"Objectif sprint 15 jours: {daily_target} nouveaux abonnes par jour.")
            else:
                description_parts.append(f"15-day sprint pace: {daily_target} new subscribers per day.")

        tags = list(dict.fromkeys([*metadata.get("tags", []), *growth_tags]))
        growth_title = self._growth_title_variant(metadata.get("title", ""), video)
        metadata.update({
            "title": growth_title,
            "description": "\n".join(part for part in description_parts if part is not None),
            "tags": tags[:20],
            "title_features": self._title_features(growth_title),
            "subscriber_growth_goal": {
                "enabled": True,
                "target": int(self.config.get("subscriber_growth_target", 10000) or 10000),
                "days": int(self.config.get("subscriber_growth_days", 15) or 15),
                "daily_target": daily_target,
                "strategy": self.config.get("subscriber_growth_strategy", "broad_audience"),
                "source_video_id": video.video_id,
            },
        })
        return metadata

    def _growth_title_variant(self, title: str, video: TrendingVideo) -> str:
        """Add a broad-audience curiosity angle when the source title is plain."""
        clean = re.sub(r"\s+", " ", title).strip()
        lower = clean.lower()
        markers = ["why", "how", "explained", "truth", "what happened"]
        if self._is_french_content():
            markers.extend(["pourquoi", "comment", "explique", "verite", "ce qui s'est passe"])
        if any(marker in lower for marker in markers):
            return clean[:74].rstrip()

        topic = re.sub(r"^[^\w]+", "", video.title).split("|")[0].split("-")[0].strip()
        topic = re.sub(r"\s+", " ", topic)[:46].rstrip()
        if not topic:
            return clean[:74].rstrip()

        candidate = f"Pourquoi {topic} cartonne" if self._is_french_content() else f"Why {topic} Is Trending"
        if len(candidate) <= 74:
            return self._format_upload_title(candidate, 74)
        return clean[:71].rstrip() + "..."

    def _load_hook_templates(self) -> Dict[str, List[str]]:
        """Load proven hook templates by category"""
        return {
            "shocking": [
                "I can't believe {topic} just did this...",
                "Nobody is talking about {topic} and it's terrifying",
                "This changes everything about {topic}",
            ],
            "curiosity": [
                "The real reason {topic} is trending",
                "What {topic} doesn't want you to know",
                "I spent 100 hours researching {topic} - here's what I found",
            ],
            "contrarian": [
                "Why {topic} is actually overrated",
                "The unpopular truth about {topic}",
                "Everyone is wrong about {topic}",
            ],
            "story": [
                "This {topic} story will blow your mind",
                "How {topic} went from zero to viral in 24 hours",
                "The untold story behind {topic}",
            ]
        }

    async def recreate_content(self, video: TrendingVideo, mode: PipelineMode) -> dict:
        """
        Main recreation pipeline:
        1. Deconstruct original
        2. Extract viral patterns
        3. Generate transformative content
        4. Apply learned optimizations
        """
        if self.config.get("short_creation_mode", "source_clip") == "source_clip":
            return await self._create_source_clip_short(video, mode)

        logger.info(f"Starting content recreation for: {video.title[:50]}...")

        # Step 1: Deep deconstruction
        deconstruction = await self._deconstruct_video(video)

        # Step 2: Copyright safety check
        safety_report = await self._copyright_check(video, deconstruction)

        if safety_report['overall_risk_level'] in ['HIGH', 'CRITICAL']:
            logger.warning("High copyright risk - applying maximum transformation")
            transformation_level = "maximum"
        else:
            transformation_level = "standard"

        # Step 3: Generate new content
        new_script = await self._generate_script(video, deconstruction, transformation_level)
        new_visuals = await self._generate_visuals(video, deconstruction, transformation_level)
        new_audio = await self._generate_audio(video, deconstruction, transformation_level)

        # Step 4: Assemble and optimize
        final_video = await self._assemble_short(
            video, new_script, new_visuals, new_audio, 
            target_duration=random.choice([45, 50, 55, 60])
        )

        # Step 5: Generate metadata
        metadata = await self._generate_metadata(video, new_script)
        metadata["thumbnail_path"] = await self._generate_custom_thumbnail(final_video, metadata, video)

        # Step 6: Predict performance
        prediction = await self._predict_performance(final_video, metadata)

        result = {
            'original_video': asdict(video),
            'deconstruction': deconstruction,
            'copyright_report': safety_report,
            'new_script': new_script,
            'final_video_path': final_video,
            'metadata': metadata,
            'prediction': prediction,
            'learning': {
                'hook_style': new_script.get('style'),
                'structure': new_script.get('structure'),
                'title_template': metadata.get('title_template', 'unknown')
            },
            'mode': mode.value,
            'timestamp': datetime.now().isoformat()
        }
        self.learning_memory.record_prediction(result)

        # Step 7: Log dry-run report if applicable
        if mode == PipelineMode.DRY_RUN:
            self._log_dry_run(result)

        return result

    async def _create_source_clip_short(self, video: TrendingVideo, mode: PipelineMode) -> dict:
        """Create a Short by trimming/cropping only the downloaded source video."""
        logger.info(f"Starting source clip short creation for: {video.title[:50]}...")

        deconstruction = {
            'transcript': video.title,
            'key_moments': [],
            'visual_style': {},
            'audio_profile': {},
            'pacing': {},
            'structure_template': 'source_clip'
        }
        safety_report = await self._copyright_check(video, deconstruction)
        source_clip_script = {
            'hook': video.title[:80],
            'body': getattr(video, "description", "")[:300] or video.title,
            'cta': self.config.get("subscriber_cta", "") if self._growth_goal_enabled() else '',
            'word_count': len(video.title.split()),
            'estimated_duration': 60,
            'style': 'source_clip',
            'structure': 'cut_and_crop',
            'transformation_level': 'source_clip'
        }

        final_video = await self._assemble_short(
            video,
            source_clip_script,
            [],
            {},
            target_duration=int(self.config.get("source_clip_short_duration", 60))
        )
        metadata = await self._generate_source_clip_metadata(video)
        metadata["thumbnail_path"] = await self._generate_custom_thumbnail(final_video, metadata, video)
        prediction = await self._predict_performance(final_video, metadata)

        result = {
            'original_video': asdict(video),
            'deconstruction': deconstruction,
            'copyright_report': safety_report,
            'new_script': source_clip_script,
            'final_video_path': final_video,
            'metadata': metadata,
            'prediction': prediction,
            'learning': {
                'hook_style': source_clip_script.get('style'),
                'structure': source_clip_script.get('structure'),
                'title_template': metadata.get('title_template', 'source_title')
            },
            'mode': mode.value,
            'timestamp': datetime.now().isoformat()
        }
        self.learning_memory.record_prediction(result)

        if mode == PipelineMode.DRY_RUN:
            self._log_dry_run(result)

        return result

    async def _deconstruct_video(self, video: TrendingVideo) -> dict:
        """Deep analysis of viral video structure"""
        import cv2

        deconstruction = {
            'hook_pattern': '',
            'pacing_analysis': {},
            'key_moments': [],
            'transcript': '',
            'visual_style': {},
            'audio_fingerprint': '',
            'structure_template': '',
            'engagement_peaks': []
        }

        try:
            # Extract transcript
            try:
                import whisper
                import torch

                whisper_device = self.config.get("whisper_device", "auto")
                if whisper_device == "auto":
                    whisper_device = "cuda" if torch.cuda.is_available() else "cpu"
                use_fp16 = whisper_device == "cuda"

                model = whisper.load_model(
                    self.config.get("whisper_model", "base"),
                    device=whisper_device
                )
                logger.info(f"Whisper using {whisper_device.upper()} for transcription")
                result = model.transcribe(video.local_path, fp16=use_fp16)
                deconstruction['transcript'] = result['text']

                # Analyze segments
                segments = result.get('segments', [])
                if segments:
                    # Find hook (first 3 seconds)
                    hook_text = ' '.join([s['text'] for s in segments if s['start'] < 3])
                    deconstruction['hook_pattern'] = hook_text

                    # Find key moments (high confidence segments)
                    deconstruction['key_moments'] = [
                        {'time': s['start'], 'text': s['text']}
                        for s in segments if s.get('avg_logprob', -1) > -0.3
                    ]
            except Exception as e:
                logger.warning(f"Transcript extraction skipped: {e}")
                deconstruction['transcript'] = video.title
                deconstruction['hook_pattern'] = video.title[:120]

            # Video analysis
            cap = cv2.VideoCapture(video.local_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # Sample frames for style analysis
            frame_samples = []
            for i in range(0, total_frames, int(fps * 2)):  # Every 2 seconds
                cap.set(cv2.CAP_PROP_POS_FRAMES, i)
                ret, frame = cap.read()
                if ret:
                    # Analyze brightness, color dominance
                    avg_color = frame.mean(axis=(0, 1))
                    frame_samples.append(avg_color)

            cap.release()

            if frame_samples:
                deconstruction['visual_style'] = {
                    'avg_brightness': float(np.mean([f[0] for f in frame_samples])),
                    'color_temperature': 'warm' if np.mean([f[2] for f in frame_samples]) > np.mean([f[0] for f in frame_samples]) else 'cool',
                    'dominant_hue': self._get_dominant_hue(frame_samples)
                }

            # Extract structure template
            deconstruction['structure_template'] = self._extract_structure_template(
                deconstruction['transcript'], 
                deconstruction['key_moments']
            )

        except Exception as e:
            logger.error(f"Deconstruction error: {e}")

        return deconstruction

    def _get_dominant_hue(self, frame_samples: List) -> str:
        """Determine dominant color hue from frame samples"""
        import colorsys

        hues = []
        for sample in frame_samples:
            r, g, b = sample[2]/255, sample[1]/255, sample[0]/255
            h, _, _ = colorsys.rgb_to_hsv(r, g, b)
            hues.append(h * 360)

        avg_hue = np.mean(hues)

        if 0 <= avg_hue < 30 or 330 <= avg_hue <= 360:
            return "red"
        elif 30 <= avg_hue < 90:
            return "yellow/green"
        elif 90 <= avg_hue < 150:
            return "green"
        elif 150 <= avg_hue < 210:
            return "cyan"
        elif 210 <= avg_hue < 270:
            return "blue"
        elif 270 <= avg_hue < 330:
            return "purple"

        return "neutral"

    def _extract_structure_template(self, transcript: str, moments: List[dict]) -> str:
        """Extract reusable structure template"""
        # Analyze transcript for common viral structures
        words = transcript.split()

        if len(words) < 50:
            return "short_punchy"
        elif any(w in transcript.lower() for w in ['step 1', 'first', 'number one']):
            return "listicle"
        elif '?' in transcript[:100]:
            return "question_hook"
        elif any(w in transcript.lower() for w in ['story', 'when i', 'one day']):
            return "story_driven"
        else:
            return "informational"

    async def _copyright_check(self, video: TrendingVideo, deconstruction: dict) -> dict:
        """Run copyright safety analysis"""
        # Import from copyright_shield module
        try:
            from copyright_shield_v2 import CopyrightShield
            shield = CopyrightShield()

            report = await shield.full_scan(
                video_path=video.local_path,
                script_text=deconstruction.get('transcript', '')
            )
            return report
        except Exception as e:
            logger.error(f"Copyright check error: {e}")
            return {
                'overall_risk_level': 'UNKNOWN',
                'overall_risk_score': 0.5,
                'safe_to_upload': False
            }

    async def _generate_script(self, video: TrendingVideo, deconstruction: dict, level: str) -> dict:
        """Generate transformative script"""

        # Select hook template based on category and learned performance
        category = video.category.lower()
        hook_style = self.learning_memory.choose(
            "hook_style",
            ['shocking', 'curiosity', 'contrarian', 'story'],
            category,
            exploration_rate=float(self.config.get("learning_exploration_rate", 0.18))
        )

        templates = self.hook_templates[hook_style]
        hook_template = random.choice(templates)

        # Generate hook
        topic = video.title.split('|')[0].split('-')[0].strip()
        hook = hook_template.format(topic=topic)

        # Generate body based on structure template
        structure = deconstruction.get('structure_template', 'informational')
        structure = self.learning_memory.choose(
            "structure",
            [structure, "informational", "story_driven", "listicle"],
            category,
            exploration_rate=float(self.config.get("learning_exploration_rate", 0.18))
        )

        if structure == 'listicle':
            body = self._generate_listicle_body(topic, deconstruction)
        elif structure == 'story_driven':
            body = self._generate_story_body(topic, deconstruction)
        else:
            body = self._generate_informational_body(topic, deconstruction)

        # Generate CTA
        if self._is_french_content():
            ctas = [
                f"Abonne-toi pour plus de decryptages {category}",
                "Garde ca pour plus tard",
                "Dis-moi ce que tu en penses en commentaire",
                "Partage a quelqu'un qui doit voir ca",
                "Partie 2 ? Dis-le en commentaire",
            ]
        else:
            ctas = [
                f"Follow for more {category} insights",
                "Save this for later - you'll need it",
                "Comment your thoughts below",
                "Share with someone who needs to see this",
                "Part 2? Let me know in the comments"
            ]
        if self._growth_goal_enabled():
            if self._is_french_content():
                ctas = [
                    self.config.get("subscriber_cta", "Abonne-toi pour le prochain decryptage viral."),
                    "Abonne-toi et commente la prochaine tendance a decrypter.",
                    "Pour voir l'histoire virale de demain avant les autres, abonne-toi.",
                    "Abonne-toi pour des tendances virales expliquees vite.",
                    "Suis la serie - la prochaine tendance arrive aujourd'hui.",
                ]
            else:
                ctas = [
                    self.config.get("subscriber_cta", "Subscribe for the next viral breakdown."),
                    "Subscribe and comment the next trend I should break down.",
                    "If you want tomorrow's viral story early, subscribe now.",
                    "Subscribe for daily viral trends explained fast.",
                    "Follow the series - the next trend drops today.",
                ]

        script = {
            'hook': hook,
            'body': body,
            'cta': random.choice(ctas),
            'word_count': len(hook.split()) + len(body.split()) + len(ctas[0].split()),
            'estimated_duration': 0,  # Calculate later
            'style': hook_style,
            'structure': structure,
            'transformation_level': level
        }

        script['estimated_duration'] = script['word_count'] * 0.45  # ~0.45s per word

        return script

    def _generate_listicle_body(self, topic: str, deconstruction: dict) -> str:
        """Generate listicle format body"""
        key_points = deconstruction.get('key_moments', [])[:5]

        body_parts = []
        for i, point in enumerate(key_points, 1):
            if i == 1:
                body_parts.append(f"First, {point['text'][:100]}...")
            elif i == len(key_points):
                body_parts.append(f"And finally, {point['text'][:100]}...")
            else:
                body_parts.append(f"Next, {point['text'][:100]}...")

        return ' '.join(body_parts)

    def _generate_story_body(self, topic: str, deconstruction: dict) -> str:
        """Generate story-driven body"""
        transcript = deconstruction.get('transcript', '')

        # Extract key narrative elements
        return f"Here's what happened with {topic}. " + transcript[:300] + "..."

    def _generate_informational_body(self, topic: str, deconstruction: dict) -> str:
        """Generate informational body"""
        transcript = deconstruction.get('transcript', '')

        # Rewrite with new angle
        return f"The truth about {topic} that changes everything. " + transcript[:400] + "..."

    async def _generate_visuals(self, video: TrendingVideo, deconstruction: dict, level: str) -> List[dict]:
        """Generate or source visual assets"""

        visuals = []
        style = deconstruction.get('visual_style', {})

        # Strategy based on transformation level
        if level == "maximum":
            # 100% AI-generated
            visuals.append({
                'type': 'ai_video',
                'prompt': f"Cinematic shot of {video.title}, dramatic lighting, {style.get('color_temperature', 'neutral')} tones",
                'source': 'ai',
                'duration': 5
            })
        else:
            # Mix of AI and stock
            visuals.append({
                'type': 'stock_footage',
                'query': video.category,
                'source': 'pexels',
                'duration': 5
            })
            visuals.append({
                'type': 'ai_image',
                'prompt': f"Abstract representation of {video.title}",
                'source': 'flux',
                'duration': 3
            })

        return visuals

    async def _generate_audio(self, video: TrendingVideo, deconstruction: dict, level: str) -> dict:
        """Use the downloaded source video's audio in the assembled Short."""

        return {
            'source': 'original_video',
            'mode': 'preserve_source_audio',
            'path': video.local_path,
            'start': 0,
        }

    async def _assemble_short(self, video: TrendingVideo, script: dict, visuals: List[dict], 
                               audio: dict, target_duration: int = 60) -> str:
        """Assemble final short video"""

        output_dir = Path(self.config.get("output_dir", "outputs"))
        output_dir.mkdir(exist_ok=True)

        output_path = output_dir / f"short_{video.video_id}_{int(time.time())}.mp4"

        try:
            try:
                from moviepy.editor import CompositeVideoClip, ImageClip, VideoFileClip
            except ModuleNotFoundError:
                from moviepy import CompositeVideoClip, ImageClip, VideoFileClip

            source = VideoFileClip(video.local_path)
            duration = min(float(source.duration or target_duration), float(target_duration))
            clip = source.subclip(0, duration) if hasattr(source, "subclip") else source.subclipped(0, duration)

            target_w, target_h = 1080, 1920
            scaled = clip.resize(height=target_h) if hasattr(clip, "resize") else clip.resized(height=target_h)
            if scaled.w < target_w:
                scaled = clip.resize(width=target_w) if hasattr(clip, "resize") else clip.resized(width=target_w)

            crop_kwargs = {
                "x_center": scaled.w / 2,
                "y_center": scaled.h / 2,
                "width": target_w,
                "height": target_h
            }
            vertical = scaled.crop(**crop_kwargs) if hasattr(scaled, "crop") else scaled.cropped(**crop_kwargs)

            final = CompositeVideoClip([vertical], size=(target_w, target_h))
            if hasattr(final, "set_duration"):
                final = final.set_duration(duration)
            elif hasattr(final, "with_duration"):
                final = final.with_duration(duration)

            if clip.audio:
                source_audio = clip.audio
                if hasattr(source_audio, "set_duration"):
                    source_audio = source_audio.set_duration(duration)
                elif hasattr(source_audio, "with_duration"):
                    source_audio = source_audio.with_duration(duration)
                final = final.set_audio(source_audio) if hasattr(final, "set_audio") else final.with_audio(source_audio)
            else:
                logger.warning(f"Source video has no audio track: {video.video_id}")
            write_kwargs = {
                "codec": "libx264",
                "audio_codec": "aac",
                "fps": min(int(clip.fps or 30), 30),
                "preset": "medium",
                "threads": max(os.cpu_count() or 2, 2),
                "logger": None
            }
            if "verbose" in final.write_videofile.__code__.co_varnames:
                write_kwargs["verbose"] = False
            final.write_videofile(str(output_path), **write_kwargs)

            final.close()
            vertical.close()
            scaled.close()
            clip.close()
            source.close()
        except Exception as e:
            logger.error(f"Short assembly failed: {e}")
            raise

        logger.info(f"Assembled short: {output_path.name}")

        return str(output_path)

    def _make_text_overlay(self, text: str, width: int, height: int):
        """Create a transparent text overlay without requiring ImageMagick."""
        from PIL import Image, ImageDraw, ImageFont

        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)

        try:
            font = ImageFont.truetype("arialbd.ttf", 58)
        except Exception:
            font = ImageFont.load_default()

        clean_text = re.sub(r"\s+", " ", text).strip()
        words = clean_text.split()
        lines = []
        current = ""
        max_line_width = width - 140

        for word in words:
            candidate = f"{current} {word}".strip()
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if bbox[2] - bbox[0] <= max_line_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
            if len(lines) >= 4:
                break
        if current and len(lines) < 5:
            lines.append(current)

        line_height = 72
        block_height = len(lines) * line_height + 56
        box_y = height - block_height
        draw.rounded_rectangle(
            (48, box_y, width - 48, height - 20),
            radius=36,
            fill=(0, 0, 0, 178)
        )

        y = box_y + 28
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            x = (width - (bbox[2] - bbox[0])) / 2
            draw.text((x + 3, y + 3), line, font=font, fill=(0, 0, 0, 210))
            draw.text((x, y), line, font=font, fill=(255, 255, 255, 255))
            y += line_height

        return image

    async def _generate_custom_thumbnail(self, video_path: str, metadata: dict, video: TrendingVideo) -> Optional[str]:
        """Create a custom YouTube thumbnail from the rendered Short."""
        if not self.config.get("custom_thumbnails_enabled", True):
            return None

        path = Path(video_path)
        if not path.exists():
            return None

        try:
            import cv2
            from PIL import Image, ImageDraw, ImageFont, ImageFilter

            cap = cv2.VideoCapture(str(path))
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            frame_index = max(int(total_frames * float(self.config.get("custom_thumbnail_frame_ratio", 0.2))), 0)
            if frame_index:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = cap.read()
            cap.release()
            if not ok or frame is None:
                return None

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = Image.fromarray(frame_rgb)
            target_w, target_h = 1280, 720
            cover = image.resize((target_w, int(image.height * target_w / image.width)))
            if cover.height < target_h:
                cover = image.resize((int(image.width * target_h / image.height), target_h))
            left = max((cover.width - target_w) // 2, 0)
            top = max((cover.height - target_h) // 2, 0)
            base = cover.crop((left, top, left + target_w, top + target_h)).filter(ImageFilter.SHARPEN)

            draw = ImageDraw.Draw(base, "RGBA")
            draw.rectangle((0, 0, target_w, target_h), fill=(0, 0, 0, 72))
            draw.rectangle((0, target_h - 250, target_w, target_h), fill=(0, 0, 0, 176))
            accent = str(self.config.get("custom_thumbnail_accent", "#00F0FF")).strip() or "#00F0FF"
            draw.rectangle((0, target_h - 250, 22, target_h), fill=accent)

            try:
                title_font = ImageFont.truetype("arialbd.ttf", 76)
                label_font = ImageFont.truetype("arialbd.ttf", 34)
            except Exception:
                title_font = ImageFont.load_default()
                label_font = ImageFont.load_default()

            label = str(self.config.get("custom_thumbnail_label", "SHORTS")).upper()[:18]
            title = re.sub(r"\s+", " ", metadata.get("title") or video.title).strip()
            title = re.sub(r"^[^\w]+", "", title)
            lines = self._wrap_thumbnail_text(draw, title, title_font, target_w - 120, max_lines=2)

            draw.rounded_rectangle((54, 54, 250, 112), radius=16, fill=accent)
            draw.text((78, 66), label, font=label_font, fill=(5, 8, 12, 255))

            y = target_h - 210
            for line in lines:
                draw.text((66, y), line, font=title_font, fill=(0, 0, 0, 230), stroke_width=7, stroke_fill=(0, 0, 0, 230))
                draw.text((66, y), line, font=title_font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
                y += 86

            output_dir = Path(self.config.get("output_dir", "outputs"))
            output_dir.mkdir(exist_ok=True)
            thumbnail_path = output_dir / f"thumbnail_{video.video_id}_{int(time.time())}.jpg"
            base.convert("RGB").save(thumbnail_path, "JPEG", quality=88, optimize=True)
            logger.info(f"Generated custom thumbnail: {thumbnail_path.name}")
            return str(thumbnail_path)
        except Exception as e:
            logger.warning(f"Custom thumbnail generation failed: {e}")
            return None

    def _wrap_thumbnail_text(self, draw, text: str, font, max_width: int, max_lines: int = 2) -> List[str]:
        words = text.split()
        lines = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if bbox[2] - bbox[0] <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
            current = word
            if len(lines) >= max_lines:
                break
        if current and len(lines) < max_lines:
            lines.append(current)
        if lines and len(lines) == max_lines and len(" ".join(words)) > len(" ".join(lines)):
            lines[-1] = lines[-1].rstrip(".")[:26].rstrip() + "..."
        return lines or [text[:26]]

    async def _generate_metadata(self, video: TrendingVideo, script: dict) -> dict:
        """Generate SEO-optimized metadata"""

        # Title optimization
        if self._is_french_content():
            title_templates = {
                "part_one": "{hook} (Partie 1)",
                "heres_why": "{hook} - Voici pourquoi",
                "found_out": "J'ai compris {hook}",
                "truth_about": "La verite sur {topic}",
                "sixty_seconds": "{hook} explique en 60 secondes",
            }
        else:
            title_templates = {
                "part_one": "{hook} (Part 1)",
                "heres_why": "{hook} - Here's Why",
                "found_out": "I Found Out {hook}",
                "truth_about": "The Truth About {topic}",
                "sixty_seconds": "{hook} Explained in 60 Seconds",
            }
        title_template_key = self.learning_memory.choose(
            "title_template",
            list(title_templates.keys()),
            video.category,
            exploration_rate=float(self.config.get("learning_exploration_rate", 0.18))
        )

        topic = video.title[:40]
        title = title_templates[title_template_key].format(hook=script['hook'][:30], topic=topic)

        # Ensure under 60 chars for Shorts
        if len(title) > 58:
            title = title[:55] + "..."
        title, attractive_template = self._attractive_title_variant(title, topic, 60)
        title_template_key = attractive_template if attractive_template != "already_attractive" else title_template_key

        # Tags
        if self._is_french_content():
            tags = [
                video.category.lower(),
                "shorts",
                "viral",
                "tendance",
                script['style'],
                "fyp",
                "pourtoi",
                "explique",
                "histoire",
                "faits"
            ]
        else:
            tags = [
                video.category.lower(),
                "shorts",
                "viral",
                "trending",
                script['style'],
                "fyp",
                "foryou",
                "explained",
                "story",
                "facts"
            ]

        # Description
        description = f"\"{script['hook']}\"\n\n"
        description += f"{script['body'][:200]}...\n\n"
        base_hashtags = "#shorts #viral #tendance" if self._is_french_content() else "#shorts #viral #trending"
        description += base_hashtags + " " + " ".join([f"#{t}" for t in tags[:5]])

        metadata = {
            'title': title,
            'description': description,
            'tags': tags,
            'category': video.category,
            'title_template': title_template_key,
            'hook_style': script.get('style'),
            'structure': script.get('structure'),
            'title_features': self._title_features(title),
            'privacy': 'public',
            'made_for_kids': False
        }
        return self._apply_subscriber_growth_metadata(metadata, video)

    async def _generate_source_clip_metadata(self, video: TrendingVideo) -> dict:
        """Generate upload metadata for a direct source clip Short."""
        clean_title = re.sub(r"\s+", " ", video.title).strip()
        title, title_template_key = self._attractive_title_variant(clean_title, clean_title[:42], 74)

        if self._is_french_content():
            tags = [
                video.category.lower(),
                "shorts",
                "viral",
                "tendance",
                "clip",
                "youtube shorts",
            ]
        else:
            tags = [
                video.category.lower(),
                "shorts",
                "viral",
                "trending",
                "clip",
                "youtube shorts",
            ]

        description_parts = [
            clean_title,
            "",
            "Clip source coupe et formate en Short." if self._is_french_content() else "Source clip trimmed and formatted as a Short.",
            "",
            "#shorts #viral #tendance" if self._is_french_content() else "#shorts #viral #trending"
        ]

        metadata = {
            'title': title,
            'description': "\n".join(description_parts),
            'tags': tags,
            'category': video.category,
            'title_template': title_template_key,
            'hook_style': 'source_clip',
            'structure': 'cut_and_crop',
            'title_features': self._title_features(title),
            'privacy': self.config.get('upload_privacy', 'public'),
            'made_for_kids': False
        }
        return self._apply_subscriber_growth_metadata(metadata, video)

    async def _predict_performance(self, video_path: str, metadata: dict) -> dict:
        """Predict video performance before upload"""

        # Simulated prediction model
        # In production: Use historical data + ML model

        title_score = self._score_title(metadata['title'])
        hook_score = random.uniform(0.6, 0.95)
        pacing_score = random.uniform(0.5, 0.9)

        ctr = (title_score * 0.3 + hook_score * 0.4 + random.uniform(0.05, 0.15)) * 100
        avd = (pacing_score * 0.5 + hook_score * 0.3 + random.uniform(0.1, 0.2)) * 100
        virality = (ctr * 0.4 + avd * 0.4 + random.uniform(0, 20))
        subscriber_score = self._subscriber_conversion_score(metadata) if self._growth_goal_enabled() else 0.0
        if self._growth_goal_enabled():
            virality += subscriber_score * 12
            ctr += subscriber_score * 4
        ml_prediction = self.learning_memory.predict_outcome({
            "category": metadata.get("category"),
            "hook_style": metadata.get("hook_style"),
            "structure": metadata.get("structure"),
            "title_template": metadata.get("title_template"),
            "predicted_ctr": ctr,
            "predicted_avd": avd,
            "predicted_virality": virality,
            "title_length": len(metadata.get("title", "")),
            "title_has_emoji": int(self.learning_memory._has_emoji(metadata.get("title", ""))) if hasattr(self.learning_memory, "_has_emoji") else 0,
        })
        if ml_prediction is not None:
            virality = (virality * 0.55) + (ml_prediction * 0.45)

        return {
            'predicted_ctr': round(ctr, 2),
            'predicted_avd': round(avd, 2),
            'predicted_virality': round(min(virality, 100), 2),
            'ml_outcome_prediction': round(ml_prediction, 2) if ml_prediction is not None else None,
            'ml_feature_set': 'analytics_v2',
            'title_score': round(title_score, 2),
            'hook_score': round(hook_score, 2),
            'pacing_score': round(pacing_score, 2),
            'subscriber_conversion_score': round(subscriber_score * 100, 2),
            'growth_goal_daily_subscriber_target': self._growth_daily_target() if self._growth_goal_enabled() else 0,
            'recommendation': 'upload' if virality > 50 else 'refine'
        }

    def _score_title(self, title: str) -> float:
        """Score title quality"""
        score = 0.5

        # Length check
        if 30 <= len(title) <= 58:
            score += 0.15

        # Emotional words
        emotional_words = [
            'shocking', 'unbelievable', 'secret', 'truth', 'hidden', 'revealed',
            'trending', 'explained', 'why', 'how', 'new', 'breaking', 'official',
            'must watch', 'wild', 'viral', 'cartonne', 'incroyable', 'pourquoi',
            'explique', 'verite', 'fou'
        ]
        if any(w in title.lower() for w in emotional_words):
            score += 0.15

        if self._growth_goal_enabled() and any(
            phrase in title.lower()
            for phrase in ["why", "explained", "is trending", "what happened"]
        ):
            score += 0.1

        # Numbers
        if any(c.isdigit() for c in title):
            score += 0.1

        # Question mark
        if '?' in title:
            score += 0.1

        if self.learning_memory._has_emoji(title):
            score += 0.08

        return min(score, 1.0)

    def _title_features(self, title: str) -> dict:
        lower = title.lower()
        attractive_words = [
            "why", "must watch", "wild", "shocking", "secret", "truth", "explained",
            "trending", "viral", "pourquoi", "cartonne", "incroyable", "explique", "fou"
        ]
        return {
            "length": len(title),
            "has_emoji": self.learning_memory._has_emoji(title),
            "has_number": any(char.isdigit() for char in title),
            "has_question": "?" in title,
            "attractive_words": [word for word in attractive_words if word in lower],
        }

    def _log_dry_run(self, result: dict):
        """Log dry-run report for tuning"""

        report = DryRunReport(
            timestamp=datetime.now().isoformat(),
            action="would_generate_and_upload" if result['prediction']['recommendation'] == 'upload' else "would_refine",
            video_id=result['original_video']['video_id'],
            title=result['original_video']['title'][:60],
            predicted_ctr=result['prediction']['predicted_ctr'],
            predicted_avd=result['prediction']['predicted_avd'],
            predicted_virality=result['prediction']['predicted_virality'],
            copyright_risk=result['copyright_report']['overall_risk_level'],
            suggested_title=result['metadata']['title'],
            suggested_tags=result['metadata']['tags'][:5],
            would_upload=result['prediction']['recommendation'] == 'upload',
            tuning_recommendation=self._generate_tuning_recommendation(result)
        )

        # Save to dry-run log
        log_file = Path("dry_run_reports.jsonl")
        with open(log_file, 'a') as f:
            f.write(json.dumps(asdict(report)) + '\n')

        logger.info(f"Dry-run logged: {report.video_id} | Virality: {report.predicted_virality}% | Would upload: {report.would_upload}")

    def _generate_tuning_recommendation(self, result: dict) -> str:
        """Generate parameter tuning recommendation"""

        recommendations = []

        if result['prediction']['predicted_ctr'] < 5:
            recommendations.append("Improve hook strength - use more pattern interrupts")

        if result['prediction']['predicted_avd'] < 40:
            recommendations.append("Increase pacing - more cuts per minute")

        if result['copyright_report']['overall_risk_score'] > 0.3:
            recommendations.append("Increase transformation level - more AI generation")

        if not recommendations:
            recommendations.append("Parameters optimal - maintain current settings")

        return " | ".join(recommendations)


class ContinuousPipeline:
    """24/7 autonomous pipeline with health monitoring"""

    def __init__(self, config: dict):
        self.config = config
        self.mode = PipelineMode(config.get("mode", "dry_run"))
        self.state = PipelineState.IDLE
        self.metrics = PipelineMetrics()
        self.video_queue = asyncio.Queue(maxsize=100)
        self.processing_queue = asyncio.Queue(maxsize=25)
        self.processed_results = []
        self.history = UploadHistoryStore(config.get("upload_history_db_path", "pipeline/upload_history.sqlite3"))
        self.learning_memory = AutoLearningMemory(
            config.get("learning_memory_db_path", "pipeline/learning_memory.sqlite3"),
            enabled=bool(config.get("auto_learning_enabled", True))
        )

        # Components
        self.scanner = TrendingVideoScanner(config, history=self.history)
        self.downloader = VideoDownloader(
            download_dir=config.get("download_dir", "downloads"),
            max_duration=config.get("max_video_duration", 600),
            config=config
        )
        self.recreator = AdaptiveContentRecreator(config, learning_memory=self.learning_memory)
        self.youtube_publisher = None
        if self.mode in {PipelineMode.LIVE, PipelineMode.SEMI_LIVE}:
            try:
                from api_integrations import YouTubePublisher
                self.youtube_publisher = YouTubePublisher(
                    credentials_path=config.get("youtube_credentials_path", "youtube_credentials.json"),
                    client_secrets_path=config.get("youtube_client_secrets_path", "client_secrets.json")
                )
            except Exception as e:
                logger.warning(f"YouTube publisher unavailable: {e}")

        # Control flags
        self.running = False
        self.pause_event = asyncio.Event()
        self.pause_event.set()  # Not paused initially

        # Health monitoring
        self.health_checks = []
        self.last_heartbeat = datetime.now()

    async def start(self):
        """Start the 24/7 pipeline"""
        logger.info(f"Starting GhostPipe v5.1 in {self.mode.value.upper()} mode")
        logger.info("=" * 60)

        self.running = True

        # Start all worker tasks
        tasks = [
            asyncio.create_task(self._heartbeat_monitor()),
            asyncio.create_task(self._scanner_worker()),
            asyncio.create_task(self._downloader_worker()),
            asyncio.create_task(self._processor_worker()),
            asyncio.create_task(self._uploader_worker()),
            asyncio.create_task(self._learning_worker()),
            asyncio.create_task(self._metrics_reporter()),
            asyncio.create_task(self._health_monitor())
        ]

        # Run until stopped
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            logger.info("Pipeline shutdown requested")
        finally:
            self.running = False

    async def stop(self):
        """Graceful shutdown"""
        logger.info("Initiating graceful shutdown...")
        self.running = False
        self.pause_event.set()

    async def pause(self):
        """Pause processing (keep scanning)"""
        logger.info("Pipeline paused")
        self.pause_event.clear()

    async def resume(self):
        """Resume processing"""
        logger.info("Pipeline resumed")
        self.pause_event.set()

    async def _heartbeat_monitor(self):
        """Send periodic heartbeat signals"""
        while self.running:
            self.last_heartbeat = datetime.now()
            await asyncio.sleep(30)

    async def _scanner_worker(self):
        """Continuous trend scanning"""
        while self.running:
            try:
                self.state = PipelineState.SCANNING_TRENDS
                await self.scanner.continuous_scan(self.video_queue)
            except Exception as e:
                logger.error(f"Scanner error: {e}")
                await asyncio.sleep(300)

    async def _downloader_worker(self):
        """Download videos from queue"""
        while self.running:
            try:
                # Wait if paused
                await self.pause_event.wait()

                video = await self.video_queue.get()
                self.state = PipelineState.DOWNLOADING

                download_path = await self.downloader.download_video(video)

                if download_path:
                    self.metrics.videos_downloaded += 1
                    video.download_path = download_path
                    self.history.mark_source(video, "downloaded")

                    await self.processing_queue.put(video)
                else:
                    self.history.mark_source(video, "download_failed")

                self.video_queue.task_done()

            except Exception as e:
                logger.error(f"Downloader error: {e}")
                await asyncio.sleep(60)

    async def _processor_worker(self):
        """Process and recreate content"""
        while self.running:
            try:
                await self.pause_event.wait()
                video = await self.processing_queue.get()
                try:
                    await self._process_video(video)
                finally:
                    self.processing_queue.task_done()
            except Exception as e:
                logger.error(f"Processor error: {e}")
                await asyncio.sleep(60)

    async def _process_video(self, video: TrendingVideo):
        """Process a single video through the pipeline"""
        start_time = time.time()

        try:
            # Step 1: Deconstruct and recreate
            self.state = PipelineState.DECONSTRUCTING
            result = await self.recreator.recreate_content(video, self.mode)
            self.history.mark_result(result, "processed")
            self._record_media_result(result)

            # Step 2: Handle based on mode
            if self.mode == PipelineMode.DRY_RUN:
                self._handle_dry_run(result)
            elif self.mode == PipelineMode.LIVE:
                await self._handle_live_upload(result)
            elif self.mode == PipelineMode.SEMI_LIVE:
                await self._handle_semi_live(result)

            # Update metrics
            generation_time = time.time() - start_time
            self.metrics.avg_generation_time = (
                (self.metrics.avg_generation_time * self.metrics.shorts_created + generation_time)
                / (self.metrics.shorts_created + 1)
            )
            self.metrics.shorts_created += 1
            self.metrics.avg_virality_score = (
                (self.metrics.avg_virality_score * (self.metrics.shorts_created - 1) + 
                 result['prediction']['predicted_virality'])
                / self.metrics.shorts_created
            )

            self.processed_results.append(result)

        except Exception as e:
            logger.error(f"Processing error for {video.video_id}: {e}")
            self.history.mark_source(video, "processing_failed")
            self.metrics.errors_count += 1
            self.state = PipelineState.ERROR
            # Clean up orphaned downloads to prevent disk bloat
            self._cleanup_failed_download(video)

    def _handle_dry_run(self, result: dict):
        """Handle dry-run mode - log and tune only"""
        logger.info("DRY RUN - Would upload:")
        logger.info(f"   Title: {result['metadata']['title']}")
        logger.info(f"   Predicted Virality: {result['prediction']['predicted_virality']}%")
        logger.info(f"   Copyright Risk: {result['copyright_report']['overall_risk_level']}")
        logger.info(f"   Tuning: {result.get('tuning_recommendation', 'N/A')}")

        # Save result for analysis
        self._save_dry_run_analysis(result)
        self.history.mark_result(result, "dry_run")

    async def _handle_live_upload(self, result: dict):
        """Handle live mode - upload to YouTube"""
        if result['prediction']['predicted_virality'] < self.config.get('min_virality_threshold', 40):
            logger.info(f"Skipping upload - virality too low ({result['prediction']['predicted_virality']}%)")
            self.history.mark_result(result, "skipped_low_virality")
            return

        if self.config.get("require_safe_to_upload", True):
            safety = result.get("copyright_report", {})
            if safety.get("safe_to_upload") is False or safety.get("overall_risk_level") in {"HIGH", "CRITICAL"}:
                logger.warning("Upload skipped - copyright safety gate did not approve this video")
                self.history.mark_result(result, "skipped_copyright")
                return

        if not Path(result['final_video_path']).exists():
            logger.error(f"Upload skipped - rendered file missing: {result['final_video_path']}")
            self.history.mark_result(result, "skipped_missing_render")
            return

        if not self.youtube_publisher:
            logger.error("Upload skipped - YouTube publisher is not configured")
            self.history.mark_result(result, "skipped_no_uploader")
            return

        schedule_time = self._next_peak_schedule_time() if self.config.get("schedule_uploads_ahead", False) else None
        if not schedule_time:
            await self._wait_for_upload_slot()

        self.state = PipelineState.UPLOADING
        self.metrics.uploads_attempted += 1

        try:
            if schedule_time:
                logger.info(f"Uploading to channel and scheduling for peak slot: {schedule_time.isoformat()}")
            logger.info(f"Uploading: {result['metadata']['title']}")
            upload_result = await self.youtube_publisher.upload_short(
                video_path=result['final_video_path'],
                title=result['metadata']['title'],
                description=result['metadata']['description'],
                tags=result['metadata']['tags'],
                category_id=str(result['metadata'].get('category_id', '22')),
                privacy=result['metadata'].get('privacy', self.config.get('upload_privacy', 'private')),
                made_for_kids=bool(result['metadata'].get('made_for_kids', False)),
                public_stats_viewable=bool(self.config.get('upload_public_stats_viewable', True)),
                schedule_time=schedule_time
            )
            result['upload_result'] = upload_result
            await self._upload_custom_thumbnail(result, upload_result)
            self.metrics.uploads_successful += 1
            if not upload_result.get("scheduled"):
                await self._post_growth_first_comment(upload_result)
            self._record_upload_success(upload_result)
            self.history.mark_result(result, "uploaded", upload_result)
            self.learning_memory.record_upload(result, upload_result)
            self._cleanup_uploaded_assets(result)
            self._record_media_result(result, approved=True)
            logger.info(f"Upload complete: {upload_result.get('url')}")

        except Exception as e:
            logger.error(f"Upload error: {e}")
            self.history.mark_result(result, "upload_failed")

    async def _upload_custom_thumbnail(self, result: dict, upload_result: dict):
        """Best-effort custom thumbnail upload after the video exists on YouTube."""
        if not self.config.get("custom_thumbnails_enabled", True):
            return
        if not self.youtube_publisher or not hasattr(self.youtube_publisher, "update_thumbnail"):
            return

        video_id = upload_result.get("video_id")
        thumbnail_path = result.get("metadata", {}).get("thumbnail_path") or result.get("thumbnail_path")
        if not video_id or not thumbnail_path:
            return

        path = Path(thumbnail_path)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        if not path.exists():
            logger.warning(f"Custom thumbnail missing, skipping upload: {path}")
            return

        try:
            thumbnail_result = await self.youtube_publisher.update_thumbnail(video_id, str(path))
            upload_result["thumbnail"] = thumbnail_result
            logger.info(f"Custom thumbnail uploaded for {video_id}: {path.name}")
        except Exception as e:
            upload_result["thumbnail"] = {"status": "thumbnail_failed", "error": str(e), "thumbnail_path": str(path)}
            logger.warning(f"Custom thumbnail upload failed for {video_id}: {e}")

    async def _post_growth_first_comment(self, upload_result: dict):
        """Post a growth-focused first comment when the uploader supports it."""
        if not self.config.get("growth_first_comment_enabled", False):
            return
        if not self.youtube_publisher or not hasattr(self.youtube_publisher, "post_comment"):
            return
        video_id = upload_result.get("video_id")
        if not video_id:
            return
        comment = str(self.config.get("growth_first_comment", "")).strip()
        if not comment:
            return
        try:
            result = await self.youtube_publisher.post_comment(video_id, comment)
            upload_result["first_comment"] = result
            logger.info(f"Posted growth first comment on {video_id}")
        except Exception as e:
            logger.warning(f"Could not post growth first comment on {video_id}: {e}")

    def _upload_timezone(self) -> ZoneInfo:
        """Timezone used for US audience upload windows."""
        timezone_name = str(self.config.get("upload_timezone", "America/New_York")).strip()
        if not timezone_name:
            return ZoneInfo("America/New_York")

        try:
            if timezone_name.upper().startswith("UTC") and len(timezone_name) > 3:
                offset_text = timezone_name[3:]
                sign = 1 if offset_text.startswith("+") else -1
                hours_text = offset_text[1:] if offset_text[:1] in "+-" else offset_text
                hours = float(hours_text)
                offset = datetime_timedelta(hours=sign * hours)
                return datetime_timezone(offset)
            return ZoneInfo(timezone_name)
        except Exception:
            logger.warning(f"Invalid upload timezone '{timezone_name}', falling back to America/New_York")
            return ZoneInfo("America/New_York")

    def _quota_state_path(self) -> Path:
        path = Path(self.config.get("daily_quota_state_path", "public/data/daily_quota_state.json"))
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _load_quota_state(self) -> dict:
        path = self._quota_state_path()
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8-sig") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Could not read daily quota state: {e}")
        return {"date": "", "uploads": 0, "history": []}

    def _save_quota_state(self, state: dict):
        with open(self._quota_state_path(), "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    def _media_library_path(self) -> Path:
        path = Path(self.config.get("media_library_path", "public/data/recreated_media.json"))
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _read_json_list(self, path: Path) -> list:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8-sig") as f:
                    data = json.load(f)
                return data if isinstance(data, list) else []
            except Exception as e:
                logger.warning(f"Could not read JSON list {path}: {e}")
        return []

    def _write_json(self, path: Path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _relative_project_path(self, raw_path: str) -> str:
        path = Path(raw_path)
        try:
            if path.is_absolute():
                return str(path.relative_to(PROJECT_ROOT))
        except ValueError:
            pass
        return str(path)

    def _public_media_url(self, raw_path: str) -> Optional[str]:
        if not raw_path:
            return None
        rel_path = self._relative_project_path(raw_path).replace("\\", "/")
        if rel_path.startswith(("outputs/", "downloads/")):
            return f"/{rel_path}"
        return None

    def _content_type_for_result(self, result: dict) -> str:
        metadata = result.get("metadata", {})
        if metadata.get("content_type"):
            return metadata["content_type"]
        final_path = str(result.get("final_video_path", "")).replace("\\", "/").lower()
        return "video" if "/video_" in final_path else "short"

    def _record_media_result(self, result: dict, approved=None):
        final_path = result.get("final_video_path")
        if not final_path:
            return

        media_path = self._media_library_path()
        media = self._read_json_list(media_path)
        rel_path = self._relative_project_path(final_path)
        item = {
            "title": result.get("metadata", {}).get("title", "Untitled"),
            "content_type": self._content_type_for_result(result),
            "video_path": rel_path,
            "public_url": self._public_media_url(final_path),
            "thumbnail_path": result.get("metadata", {}).get("thumbnail_path"),
            "thumbnail_url": self._public_media_url(result.get("metadata", {}).get("thumbnail_path")),
            "exists": Path(final_path).exists(),
            "prediction": result.get("prediction", {}),
            "title_features": result.get("metadata", {}).get("title_features", {}),
            "learning": result.get("learning", {}),
            "metadata": result.get("metadata", {}),
            "schedule_time": result.get("schedule_time"),
            "approved": approved,
            "timestamp": result.get("timestamp", datetime.now().isoformat()),
        }
        if result.get("upload_result"):
            item["upload_result"] = result["upload_result"]

        for index, existing in enumerate(media):
            if existing.get("video_path") == rel_path:
                media[index] = {**existing, **item}
                break
        else:
            media.insert(0, item)

        self._write_json(media_path, media[:200])

    def _today_upload_key(self) -> str:
        return datetime.now(self._upload_timezone()).strftime("%Y-%m-%d")

    def _uploads_remaining_today(self) -> int:
        state = self._load_quota_state()
        today = self._today_upload_key()
        if state.get("date") != today:
            state = {"date": today, "uploads": 0, "history": state.get("history", [])}
            self._save_quota_state(state)
        return max(int(self.config.get("max_daily_uploads", 3)) - int(state.get("uploads", 0)), 0)

    def _scheduled_upload_count_for_date(self, publish_date) -> int:
        state = self._load_quota_state()
        publish_key = publish_date.strftime("%Y-%m-%d")
        count = 0
        for item in state.get("history", []):
            timestamp = item.get("scheduled_publish_at") or item.get("publish_at") or item.get("timestamp")
            if str(timestamp).startswith(publish_key):
                count += 1
        if state.get("date") == publish_key:
            count = max(count, int(state.get("uploads", 0) or 0))
        return count

    def _parse_upload_datetime(self, timestamp: Optional[str]) -> Optional[datetime]:
        if not timestamp:
            return None
        try:
            parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=self._upload_timezone())
            return parsed.astimezone(self._upload_timezone())
        except Exception:
            return None

    def _peak_datetime(self, publish_date, slot: str) -> datetime:
        tz = self._upload_timezone()
        hour, minute = [int(part) for part in slot.split(":", 1)]
        return datetime.combine(publish_date, datetime.min.time(), tzinfo=tz).replace(hour=hour, minute=minute)

    def _upload_window_for_peak(self, peak: datetime) -> Tuple[datetime, datetime]:
        upload_window_minutes = int(self.config.get("upload_window_minutes", 60))
        upload_window_position = str(self.config.get("upload_window_position", "after")).lower()
        if upload_window_position == "before":
            return peak - timedelta(minutes=upload_window_minutes), peak
        return peak, peak + timedelta(minutes=upload_window_minutes)

    def _upload_window_key(self, peak: datetime) -> str:
        return peak.astimezone(self._upload_timezone()).strftime("%Y-%m-%dT%H:%M")

    def _window_key_for_upload_time(self, upload_time: datetime) -> Optional[str]:
        tz = self._upload_timezone()
        upload_time = upload_time.astimezone(tz)
        peak_times = self.config.get("upload_peak_times", ["07:30", "12:00", "18:00"])
        for day_offset in range(-1, 2):
            day = (upload_time + timedelta(days=day_offset)).date()
            for slot in peak_times:
                peak = self._peak_datetime(day, slot)
                start, end = self._upload_window_for_peak(peak)
                if start <= upload_time <= end:
                    return self._upload_window_key(peak)
        return None

    def _used_upload_window_keys_for_date(self, publish_date) -> set:
        state = self._load_quota_state()
        publish_key = publish_date.strftime("%Y-%m-%d")
        used = set()
        for item in state.get("history", []):
            timestamp = item.get("scheduled_publish_at") or item.get("publish_at") or item.get("timestamp")
            upload_time = self._parse_upload_datetime(timestamp)
            if not upload_time or upload_time.strftime("%Y-%m-%d") != publish_key:
                continue
            window_key = item.get("upload_window_key") or self._window_key_for_upload_time(upload_time)
            if window_key:
                used.add(window_key)
        return used

    def _current_upload_window_is_used(self) -> bool:
        window_key = self._window_key_for_upload_time(datetime.now(self._upload_timezone()))
        if not window_key:
            return False
        return window_key in self._used_upload_window_keys_for_date(datetime.now(self._upload_timezone()).date())

    def _next_peak_schedule_time(self) -> Optional[datetime]:
        tz = self._upload_timezone()
        now = datetime.now(tz)
        peak_times = self.config.get("upload_peak_times", ["07:30", "12:00", "18:00"])
        days_ahead = max(int(self.config.get("schedule_upload_days_ahead", 1) or 1), 0)
        max_daily_uploads = int(self.config.get("max_daily_uploads", 5) or 5)

        for day_offset in range(days_ahead, days_ahead + 14):
            publish_date = (now + timedelta(days=day_offset)).date()
            used = self._scheduled_upload_count_for_date(publish_date)
            if used >= max_daily_uploads:
                continue

            used_windows = self._used_upload_window_keys_for_date(publish_date)
            slots = [self._peak_datetime(publish_date, slot) for slot in peak_times]

            future_slots = [slot for slot in sorted(slots) if slot > now + timedelta(minutes=15)]
            for slot in future_slots:
                if self._upload_window_key(slot) not in used_windows:
                    return slot

        return None

    async def _wait_for_upload_slot(self):
        """Wait until a configured upload slot is available and daily quota remains."""
        while self.running:
            remaining = self._uploads_remaining_today()
            if remaining <= 0:
                seconds = self._seconds_until_next_upload_day()
                logger.info(f"Daily upload limit reached. Waiting {seconds // 3600:.1f} hours for next upload day.")
                self.state = PipelineState.COOLDOWN
                await asyncio.sleep(min(seconds, 1800))
                continue

            seconds = self._seconds_until_next_peak_slot()
            if seconds <= 0:
                if not self._current_upload_window_is_used():
                    return
                seconds = self._seconds_until_next_peak_slot(skip_used=True)

            logger.info(f"Waiting {seconds // 60:.1f} minutes for next upload slot")
            self.state = PipelineState.COOLDOWN
            await asyncio.sleep(min(seconds, 900))

    def _seconds_until_next_upload_day(self) -> int:
        tz = self._upload_timezone()
        now = datetime.now(tz)
        tomorrow = (now + timedelta(days=1)).date()
        reset = datetime.combine(tomorrow, datetime.min.time(), tzinfo=tz)
        return max(int((reset - now).total_seconds()), 60)

    def _seconds_until_next_peak_slot(self, skip_used: bool = False) -> int:
        tz = self._upload_timezone()
        now = datetime.now(tz)
        peak_times = self.config.get("upload_peak_times", ["07:30", "12:00", "18:00"])
        windows = []

        for day_offset in range(2):
            day = (now + timedelta(days=day_offset)).date()
            used_windows = self._used_upload_window_keys_for_date(day) if skip_used else set()
            for slot in peak_times:
                peak = self._peak_datetime(day, slot)
                if self._upload_window_key(peak) in used_windows:
                    continue
                start, end = self._upload_window_for_peak(peak)
                windows.append((start, end))

        future = sorted(window for window in windows if window[1] >= now)
        if not future:
            return 60

        next_start, next_end = future[0]
        if next_start <= now <= next_end:
            return 0
        return max(int((next_start - now).total_seconds()), 0)

    def _record_upload_success(self, upload_result: dict):
        state = self._load_quota_state()
        today = self._today_upload_key()
        if state.get("date") != today:
            state = {"date": today, "uploads": 0, "history": state.get("history", [])}

        state["uploads"] = int(state.get("uploads", 0)) + 1
        history = state.setdefault("history", [])
        scheduled_publish_at = upload_result.get("scheduled_publish_at")
        publish_timestamp = scheduled_publish_at or datetime.now(self._upload_timezone()).isoformat()
        publish_time = self._parse_upload_datetime(publish_timestamp) or datetime.now(self._upload_timezone())
        publish_date = publish_time.strftime("%Y-%m-%d")
        upload_window_key = self._window_key_for_upload_time(publish_time)
        history.append({
            "timestamp": datetime.now(self._upload_timezone()).isoformat(),
            "scheduled_publish_at": scheduled_publish_at,
            "upload_window_key": upload_window_key,
            "video_id": upload_result.get("video_id"),
            "url": upload_result.get("url")
        })
        state["history"] = history[-100:]
        state["date"] = publish_date
        state["uploads"] = self._scheduled_upload_count_for_date(publish_time.date()) + 1
        self._save_quota_state(state)

    def _cleanup_uploaded_assets(self, result: dict):
        if not self.config.get("delete_local_files_after_upload", True):
            return

        original = result.get("original_video", {})
        paths = self._uploaded_asset_cleanup_paths(result)

        for path in sorted(paths):
            try:
                if path.exists() and path.is_file():
                    path.unlink()
                    logger.info(f"Deleted local uploaded asset: {path}")
            except Exception as e:
                logger.warning(f"Could not delete local file {path}: {e}")

    def _uploaded_asset_cleanup_paths(self, result: dict) -> set[Path]:
        """Collect generated/downloaded files tied to a successfully uploaded video."""
        original = result.get("original_video", {})
        metadata = result.get("metadata", {})
        video_id = str(original.get("video_id") or "").strip()
        raw_paths = {
            result.get("final_video_path"),
            metadata.get("thumbnail_path"),
            result.get("thumbnail_path"),
            original.get("download_path"),
            original.get("local_path"),
        }

        safe_roots = [
            Path(self.config.get("download_dir", PROJECT_ROOT / "downloads")),
            Path(self.config.get("output_dir", PROJECT_ROOT / "outputs")),
            PROJECT_ROOT / "pipeline",
        ]
        safe_roots = [root.resolve() for root in safe_roots]

        cleanup_paths: set[Path] = set()
        for raw_path in raw_paths:
            if raw_path:
                self._add_cleanup_path(cleanup_paths, Path(raw_path), safe_roots)

        if video_id:
            patterns = [
                f"{video_id}.*",
                f"short_{video_id}_*.*",
                f"thumbnail_{video_id}_*.*",
                f"short_{video_id}_*TEMP_MPY_*.*",
            ]
            for root in safe_roots:
                if root.exists():
                    for pattern in patterns:
                        for path in root.glob(pattern):
                            self._add_cleanup_path(cleanup_paths, path, safe_roots)

        return cleanup_paths

    def _add_cleanup_path(self, cleanup_paths: set[Path], path: Path, safe_roots: List[Path]):
        try:
            resolved = path.resolve()
        except OSError:
            return
        if not any(resolved == root or root in resolved.parents for root in safe_roots):
            logger.warning(f"Skipping cleanup outside project runtime folders: {resolved}")
            return
        cleanup_paths.add(resolved)

    async def _handle_semi_live(self, result: dict):
        """Handle semi-live mode - queue for manual approval"""
        approval_queue_file = Path(self.config.get("approval_queue_path", "public/data/approval_queue.json"))
        approval_queue_file.parent.mkdir(parents=True, exist_ok=True)

        queue_data = self._read_json_list(approval_queue_file)

        queue_data.append({
            'timestamp': datetime.now().isoformat(),
            'video_path': self._relative_project_path(result['final_video_path']),
            'content_type': self._content_type_for_result(result),
            'thumbnail_path': result['metadata'].get('thumbnail_path'),
            'thumbnail_url': self._public_media_url(result['metadata'].get('thumbnail_path')),
            'metadata': result['metadata'],
            'prediction': result['prediction'],
            'schedule_time': None,
            'upload_status': 'pending_approval',
            'approved': None
        })

        self._write_json(approval_queue_file, queue_data)

        self.history.mark_result(result, "queued_for_approval")
        self._record_media_result(result, approved=None)
        logger.info(f"Queued for approval: {result['metadata']['title']}")

    async def _uploader_worker(self):
        """Handle approved semi-live uploads and post-upload actions."""
        while self.running:
            try:
                if self.mode == PipelineMode.SEMI_LIVE:
                    await self._process_approved_uploads()
                await asyncio.sleep(60)
            except Exception as e:
                logger.error(f"Uploader worker error: {e}")
                await asyncio.sleep(60)

    async def _process_approved_uploads(self):
        approval_queue_file = Path(self.config.get("approval_queue_path", "public/data/approval_queue.json"))
        queue_data = self._read_json_list(approval_queue_file)
        if not queue_data:
            return

        changed = False
        for item in queue_data:
            if item.get("approved") is False and item.get("upload_status") != "rejected":
                item["upload_status"] = "rejected"
                changed = True
                continue

            if item.get("approved") is not True:
                continue
            upload_status = item.get("upload_status")
            if upload_status in {"uploading", "uploaded", "rejected"}:
                continue
            if upload_status != "approved":
                continue

            video_path = Path(item.get("video_path", ""))
            if not video_path.is_absolute():
                video_path = PROJECT_ROOT / video_path
            if not video_path.exists():
                item["upload_status"] = "missing_render"
                changed = True
                continue
            if not self.youtube_publisher:
                item["upload_status"] = "missing_uploader"
                changed = True
                continue

            schedule_time = self._next_peak_schedule_time() if self.config.get("schedule_uploads_ahead", False) else None
            if not schedule_time:
                await self._wait_for_upload_slot()
            item["upload_status"] = "uploading"
            self._write_json(approval_queue_file, queue_data)

            metadata = item.get("metadata", {})
            try:
                self.state = PipelineState.UPLOADING
                self.metrics.uploads_attempted += 1
                upload_result = await self.youtube_publisher.upload_short(
                    video_path=str(video_path),
                    title=metadata.get("title", "Untitled Short"),
                    description=metadata.get("description", ""),
                    tags=metadata.get("tags", []),
                    category_id=str(metadata.get("category_id", "22")),
                    privacy=metadata.get("privacy", self.config.get("upload_privacy", "private")),
                    made_for_kids=bool(metadata.get("made_for_kids", False)),
                    public_stats_viewable=bool(self.config.get("upload_public_stats_viewable", True)),
                    schedule_time=schedule_time
                )
                await self._upload_custom_thumbnail({
                    "final_video_path": str(video_path),
                    "metadata": metadata,
                }, upload_result)
                item["upload_status"] = "uploaded"
                item["upload_result"] = upload_result
                item["uploaded_at"] = datetime.now().isoformat()
                self.metrics.uploads_successful += 1
                if not upload_result.get("scheduled"):
                    await self._post_growth_first_comment(upload_result)
                self._record_upload_success(upload_result)
                self.learning_memory.record_upload({
                    "original_video": {"video_id": metadata.get("source_video_id", item.get("video_path")), "category": metadata.get("category")},
                    "metadata": metadata,
                    "new_script": {
                        "style": metadata.get("hook_style", "source_clip"),
                        "structure": metadata.get("structure", "approved_upload"),
                    },
                    "prediction": item.get("prediction", {}),
                    "learning": {"title_template": metadata.get("title_template", "approved_upload")},
                }, upload_result)
                if self.config.get("delete_local_files_after_upload", True):
                    self._cleanup_uploaded_assets({
                        "final_video_path": str(video_path),
                        "original_video": {
                            "video_id": metadata.get("source_video_id", ""),
                            "download_path": metadata.get("source_download_path"),
                            "local_path": metadata.get("source_local_path"),
                        },
                    })
                self._record_media_result({
                    "final_video_path": str(video_path),
                    "metadata": metadata,
                    "prediction": item.get("prediction", {}),
                    "timestamp": item.get("timestamp"),
                    "schedule_time": item.get("schedule_time"),
                    "upload_result": upload_result,
                }, approved=True)
                logger.info(f"Approved upload complete: {upload_result.get('url')}")
            except Exception as e:
                item["upload_status"] = "upload_failed"
                item["upload_error"] = str(e)
                logger.error(f"Approved upload failed: {e}")
            changed = True

        if changed:
            self._write_json(approval_queue_file, queue_data)

    async def _learning_worker(self):
        """Refresh uploaded video metrics so future generation choices improve."""
        while self.running:
            try:
                if self.config.get("auto_learning_enabled", True) and self.youtube_publisher:
                    await self._refresh_learning_metrics()
                self.learning_memory.train_model(int(self.config.get("learning_model_min_samples", 12)))
                await asyncio.sleep(int(self.config.get("learning_refresh_minutes", 180)) * 60)
            except Exception as e:
                logger.warning(f"Learning refresh failed: {e}")
                await asyncio.sleep(1800)

    async def _refresh_learning_metrics(self):
        state = self._load_quota_state()
        history = state.get("history", [])[-25:]
        for item in history:
            video_id = item.get("video_id")
            if not video_id or not hasattr(self.youtube_publisher, "get_video_metrics"):
                continue
            try:
                metrics = await self.youtube_publisher.get_video_metrics(
                    video_id,
                    analytics_days=int(self.config.get("youtube_analytics_lookback_days", 28)),
                    include_analytics=bool(self.config.get("youtube_analytics_enabled", False)),
                )
                self.learning_memory.update_observed_metrics(video_id, metrics)
                if metrics.get("analytics_available"):
                    logger.info(
                        f"Learning memory updated for {video_id}: "
                        f"{metrics.get('views', 0)} views, "
                        f"{metrics.get('average_view_percentage', 0)}% avg viewed"
                    )
                else:
                    logger.info(
                        f"Learning memory updated for {video_id}: "
                        f"{metrics.get('views', 0)} views (analytics unavailable)"
                    )
            except Exception as e:
                logger.warning(f"Could not refresh learning metrics for {video_id}: {e}")

    async def _metrics_reporter(self):
        """Report metrics periodically"""
        while self.running:
            await asyncio.sleep(3600)  # Every hour

            logger.info("=" * 60)
            logger.info("HOURLY METRICS REPORT")
            logger.info("=" * 60)
            logger.info(f"Cycles completed: {self.metrics.cycle_count}")
            logger.info(f"Videos downloaded: {self.metrics.videos_downloaded}")
            logger.info(f"Shorts created: {self.metrics.shorts_created}")
            logger.info(f"Uploads attempted: {self.metrics.uploads_attempted}")
            logger.info(f"Uploads successful: {self.metrics.uploads_successful}")
            logger.info(f"Errors: {self.metrics.errors_count}")
            logger.info(f"Avg generation time: {self.metrics.avg_generation_time:.1f}s")
            logger.info(f"Avg predicted virality: {self.metrics.avg_virality_score:.1f}%")
            logger.info(f"Queue size: {self.video_queue.qsize()}")
            logger.info(f"Current state: {self.state.value}")
            logger.info("=" * 60)

    def _cleanup_failed_download(self, video: TrendingVideo):
        """Remove orphaned download files when processing fails."""
        for raw_path in (video.download_path, video.local_path):
            if not raw_path:
                continue
            try:
                path = Path(raw_path)
                if path.exists() and path.is_file():
                    path.unlink()
                    logger.info(f"Cleaned up failed download: {path.name}")
            except Exception as e:
                logger.warning(f"Could not clean up {raw_path}: {e}")
        # Also remove any related sidecar files (info json, subtitles)
        if video.video_id:
            download_dir = Path(self.config.get("download_dir", "downloads"))
            if download_dir.exists():
                for sidecar in download_dir.glob(f"{video.video_id}.*"):
                    try:
                        sidecar.unlink()
                        logger.info(f"Cleaned up sidecar: {sidecar.name}")
                    except Exception:
                        pass

    async def _health_monitor(self):
        """Monitor system health and recover from failures"""
        while self.running:
            await asyncio.sleep(60)

            # Check heartbeat
            if (datetime.now() - self.last_heartbeat).total_seconds() > 120:
                logger.error("Heartbeat failed - initiating recovery")
                self.state = PipelineState.ERROR
                # Reset heartbeat and attempt recovery by clearing error state
                self.last_heartbeat = datetime.now()
                self.state = PipelineState.IDLE
                logger.info("Heartbeat recovery: reset state to IDLE")

            # Check queue health
            if self.video_queue.qsize() > 90:
                logger.warning("Queue near capacity - draining oldest entries")
                drained = 0
                while self.video_queue.qsize() > 70:
                    try:
                        self.video_queue.get_nowait()
                        self.video_queue.task_done()
                        drained += 1
                    except asyncio.QueueEmpty:
                        break
                if drained:
                    logger.info(f"Drained {drained} oldest queue entries")

            # Check error rate
            if self.metrics.errors_count > 10:
                logger.warning("High error rate - entering cooldown")
                self.state = PipelineState.COOLDOWN
                await asyncio.sleep(600)
                self.metrics.errors_count = 0
                self.state = PipelineState.IDLE
                logger.info("Cooldown complete - resuming normal operation")

    def _save_dry_run_analysis(self, result: dict):
        """Save dry-run results for weekly analysis"""
        analysis_dir = Path("dry_run_analysis")
        analysis_dir.mkdir(exist_ok=True)

        # Daily aggregation
        date_str = datetime.now().strftime("%Y-%m-%d")
        daily_file = analysis_dir / f"{date_str}.jsonl"

        with open(daily_file, 'a') as f:
            f.write(json.dumps({
                'timestamp': datetime.now().isoformat(),
                'video_id': result['original_video']['video_id'],
                'predicted_virality': result['prediction']['predicted_virality'],
                'predicted_ctr': result['prediction']['predicted_ctr'],
                'predicted_avd': result['prediction']['predicted_avd'],
                'copyright_risk': result['copyright_report']['overall_risk_level'],
                'hook_style': result['new_script']['style'],
                'structure': result['new_script']['structure'],
                'transformation_level': result['new_script']['transformation_level']
            }) + '\n')

    def generate_weekly_tuning_report(self) -> dict:
        """Generate weekly tuning report from dry-run data"""

        analysis_dir = Path("dry_run_analysis")
        if not analysis_dir.exists():
            return {"error": "No dry-run data available"}

        # Collect last 7 days of data
        all_data = []
        for i in range(7):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            file_path = analysis_dir / f"{date}.jsonl"
            if file_path.exists():
                with open(file_path) as f:
                    for line in f:
                        all_data.append(json.loads(line))

        if not all_data:
            return {"error": "No data found for analysis"}

        # Analyze patterns
        virality_by_hook = {}
        virality_by_structure = {}
        virality_by_transform = {}

        for entry in all_data:
            hook = entry['hook_style']
            structure = entry['structure']
            transform = entry['transformation_level']
            virality = entry['predicted_virality']

            virality_by_hook.setdefault(hook, []).append(virality)
            virality_by_structure.setdefault(structure, []).append(virality)
            virality_by_transform.setdefault(transform, []).append(virality)

        # Calculate averages
        report = {
            'period': f"{(datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')} to {datetime.now().strftime('%Y-%m-%d')}",
            'total_videos_analyzed': len(all_data),
            'avg_predicted_virality': np.mean([e['predicted_virality'] for e in all_data]),
            'avg_predicted_ctr': np.mean([e['predicted_ctr'] for e in all_data]),
            'avg_predicted_avd': np.mean([e['predicted_avd'] for e in all_data]),
            'best_hook_style': max(virality_by_hook, key=lambda k: np.mean(virality_by_hook[k])),
            'best_structure': max(virality_by_structure, key=lambda k: np.mean(virality_by_structure[k])),
            'optimal_transform_level': max(virality_by_transform, key=lambda k: np.mean(virality_by_transform[k])),
            'hook_performance': {k: round(np.mean(v), 2) for k, v in virality_by_hook.items()},
            'structure_performance': {k: round(np.mean(v), 2) for k, v in virality_by_structure.items()},
            'transform_performance': {k: round(np.mean(v), 2) for k, v in virality_by_transform.items()},
            'copyright_risk_distribution': self._calculate_risk_distribution(all_data),
            'recommended_tuning': self._generate_tuning_suggestions(all_data)
        }

        # Save report
        report_file = Path("weekly_tuning_report.json")
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)

        return report

    def _calculate_risk_distribution(self, data: List[dict]) -> dict:
        """Calculate copyright risk distribution"""
        risks = {}
        for entry in data:
            risk = entry['copyright_risk']
            risks[risk] = risks.get(risk, 0) + 1
        return risks

    def _generate_tuning_suggestions(self, data: List[dict]) -> List[str]:
        """Generate specific tuning suggestions"""
        suggestions = []

        avg_virality = np.mean([e['predicted_virality'] for e in data])

        if avg_virality < 50:
            suggestions.append("CRITICAL: Overall virality below 50%. Increase hook strength and reduce intro length.")

        avg_ctr = np.mean([e['predicted_ctr'] for e in data])
        if avg_ctr < 5:
            suggestions.append("Titles need work - test more emotional triggers and curiosity gaps")

        avg_avd = np.mean([e['predicted_avd'] for e in data])
        if avg_avd < 40:
            suggestions.append("Pacing too slow - increase cut frequency and add pattern interrupts")

        if not suggestions:
            suggestions.append("Parameters performing well - maintain current settings")

        return suggestions


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def _resolve_project_path(value: str) -> str:
    if not value:
        return value
    path = Path(value)
    if path.is_absolute():
        return str(path)
    return str(PROJECT_ROOT / path)


def _resolve_config_paths(config: dict) -> dict:
    path_keys = [
        "download_dir",
        "output_dir",
        "approval_queue_path",
        "daily_quota_state_path",
        "media_library_path",
        "upload_history_db_path",
        "learning_memory_db_path",
        "lock_file_path",
        "youtube_credentials_path",
        "youtube_client_secrets_path",
        "yt_dlp_cookie_file",
    ]
    for key in path_keys:
        if config.get(key):
            config[key] = _resolve_project_path(config[key])
    return config


def load_config() -> dict:
    """Load config from config/ghostpipe.json, then apply environment overrides."""
    config = {
        # Pipeline mode: dry_run | live | semi_live
        "mode": "dry_run",

        # Scanning
        "scan_interval_minutes": 30,
        "min_views": 1000000,
        "max_video_age_hours": 168,
        "categories": ["Entertainment", "Film & Animation", "Comedy"],
        "content_language": "fr",
        "youtube_region_code": "FR",
        "youtube_api_max_results": 50,
        "youtube_video_category_id": "",
        "youtube_api_default_engagement_rate": 0.05,
        "use_youtube_data_api_trends": True,
        "use_yt_dlp_trending_fallback": False,

        # Download
        "download_dir": "downloads",
        "max_video_duration": 600,  # 10 minutes
        "yt_dlp_cookie_file": "",
        "yt_dlp_cookies_from_browser": "",
        "yt_dlp_write_subtitles": False,

        # Content
        "short_creation_mode": "source_clip",
        "source_clip_short_duration": 60,
        "upload_title_emoji": "🔥",
        "upload_title_emojis": ["🔥", "⚡", "🎬", "🚀", "👀", "✨", "💥", "📌"],
        "subscriber_growth_goal_enabled": True,
        "subscriber_growth_target": 10000,
        "subscriber_growth_days": 15,
        "subscriber_growth_current": 0,
        "subscriber_growth_strategy": "broad_audience",
        "subscriber_cta": "Abonne-toi pour comprendre les tendances virales avant tout le monde.",
        "subscriber_value_promise": "des tendances virales quotidiennes, des explications simples et des Shorts a ne pas manquer",
        "growth_first_comment_enabled": True,
        "growth_first_comment": "Abonne-toi pour des tendances virales expliquees chaque jour. Commente la prochaine tendance a decrypter.",
        "growth_audience_keywords": [
            "bande annonce", "officiel", "musique", "jeu", "gaming", "film",
            "technologie", "ai", "science", "sports", "celebrite", "viral",
            "actualite", "explique", "comment", "pourquoi",
        ],
        "growth_discovery_terms": [
            "shorts tendance france millions de vues",
            "shorts anime tendance millions de vues",
            "shorts humour france viral",
        ],
        "growth_discovery_groups": [
            {
                "name": "trending",
                "max_results": 2,
                "terms": ["shorts tendance france millions de vues", "video virale france aujourd'hui shorts"],
            },
            {
                "name": "anime",
                "max_results": 2,
                "terms": ["shorts anime tendance millions de vues", "edit anime viral shorts france"],
            },
            {
                "name": "comedy",
                "max_results": 2,
                "terms": ["shorts humour france viral", "video drole virale shorts france"],
            },
        ],
        "growth_min_views": 1000000,
        "growth_min_engagement_rate": 0.015,
        "growth_search_results_per_term": 2,
        "min_virality_threshold": 45,  # Growth sprint uploads more promising candidates.
        "max_daily_uploads": 5,
        "upload_public_stats_viewable": False,
        "custom_thumbnails_enabled": True,
        "custom_thumbnail_frame_ratio": 0.2,
        "custom_thumbnail_label": "TENDANCE",
        "custom_thumbnail_accent": "#00F0FF",
        "auto_learning_enabled": True,
        "learning_memory_db_path": "pipeline/learning_memory.sqlite3",
        "learning_exploration_rate": 0.18,
        "learning_refresh_minutes": 180,
        "learning_model_min_samples": 12,
        "youtube_analytics_lookback_days": 28,
        "whisper_model": "base",
        "whisper_device": "auto",

        # Safety
        "copyright_safety_level": "maximum",
        "require_safe_to_upload": True,

        # Output
        "output_dir": "outputs",
        "approval_queue_path": "public/data/approval_queue.json",
        "daily_quota_state_path": "public/data/daily_quota_state.json",
        "media_library_path": "public/data/recreated_media.json",
        "upload_history_db_path": "pipeline/upload_history.sqlite3",
        "youtube_credentials_path": "youtube_credentials.json",
        "youtube_client_secrets_path": "client_secrets.json",
        "upload_privacy": "private",
        "upload_timezone": "Europe/Paris",
        "upload_peak_times": ["07:30", "11:30", "15:30", "18:30", "21:30"],
        "schedule_uploads_ahead": True,
        "schedule_upload_days_ahead": 1,
        "upload_window_minutes": 30,
        "delete_local_files_after_upload": True
    }

    config_path = PROJECT_ROOT / "config" / "ghostpipe.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config.update(json.load(f))

    env_overrides = {
        "mode": os.getenv("GHOSTPIPE_MODE"),
        "max_daily_uploads": os.getenv("DAILY_UPLOAD_LIMIT"),
        "copyright_safety_level": os.getenv("COPYRIGHT_SAFETY_LEVEL"),
        "youtube_credentials_path": os.getenv("YOUTUBE_CREDENTIALS_PATH"),
        "youtube_client_secrets_path": os.getenv("YOUTUBE_CLIENT_SECRETS_PATH"),
        "yt_dlp_cookie_file": os.getenv("YT_DLP_COOKIE_FILE"),
        "yt_dlp_cookies_from_browser": os.getenv("YT_DLP_COOKIES_FROM_BROWSER"),
        "upload_privacy": os.getenv("YOUTUBE_UPLOAD_PRIVACY"),
        "upload_timezone": os.getenv("UPLOAD_TIMEZONE"),
    }
    for key, value in env_overrides.items():
        if value not in (None, ""):
            config[key] = int(value) if key == "max_daily_uploads" else value

    return _resolve_config_paths(config)


async def main():
    """Main entry point with configuration"""

    config = load_config()
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "Global\\GhostPipeV51Singleton")
    if ctypes.windll.kernel32.GetLastError() == 183:
        logger.warning("Another GhostPipe instance is already running. Exiting this duplicate process.")
        return

    lock_file = open(config.get("lock_file_path", "ghostpipe.lock"), "w", encoding="utf-8")
    try:
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        logger.warning("Another GhostPipe instance is already running. Exiting this duplicate process.")
        return
    lock_file.write(str(os.getpid()))
    lock_file.flush()

    # Create pipeline
    pipeline = ContinuousPipeline(config)

    # Handle graceful shutdown
    def signal_handler():
        asyncio.create_task(pipeline.stop())

    # Start pipeline
    try:
        await pipeline.start()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
        await pipeline.stop()

    # Generate final report if in dry-run mode
    if config["mode"] == "dry_run":
        report = pipeline.generate_weekly_tuning_report()
        logger.info("Weekly Tuning Report Generated:")
        logger.info(json.dumps(report, indent=2))

    try:
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        lock_file.close()
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())
