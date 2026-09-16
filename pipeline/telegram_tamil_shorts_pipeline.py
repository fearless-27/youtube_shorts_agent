"""
Telegram -> Tamil Shorts pipeline.

Downloads recent videos from a Telegram channel, renders 9:16 Shorts, checks
copyright risk, then optionally uploads safe videos to YouTube.
"""

import argparse
import asyncio
import hashlib
import json
import logging
import os
import random
import re
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = Path(__file__).resolve().parent
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-24s | %(message)s",
    handlers=[
        logging.FileHandler(PROJECT_ROOT / "telegram_tamil_pipeline.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("TelegramTamilShorts")


def config_bool(config: dict, key: str, default: bool = False) -> bool:
    value = config.get(key, default)
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


import shutil


def get_ffmpeg_binary() -> str:
    """Find a functional ffmpeg binary."""
    # 1. Check PATH
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg and os.path.exists(ffmpeg):
        return ffmpeg
    # 2. Check imageio_ffmpeg bundled binary
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            return ffmpeg_exe
    except Exception:
        pass
    # 3. Check common Windows locations (including winget default install path)
    if os.name == "nt":
        for candidate in [
            os.path.expanduser(r"~\scoop\shims\ffmpeg.exe"),
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"),
        ]:
            if os.path.exists(candidate):
                return candidate
    logger.warning("ffmpeg not found on PATH or common locations. Audio processing will fail.")
    return "ffmpeg"


def get_ffprobe_binary() -> str:
    """Find a functional ffprobe binary."""
    # 1. Check PATH
    ffprobe = shutil.which("ffprobe")
    if ffprobe and os.path.exists(ffprobe):
        return ffprobe
    # 2. Derive from ffmpeg location (ffprobe lives alongside ffmpeg)
    ffmpeg_bin = get_ffmpeg_binary()
    if ffmpeg_bin and ffmpeg_bin != "ffmpeg":
        ffmpeg_dir = os.path.dirname(ffmpeg_bin)
        probe_name = "ffprobe.exe" if os.name == "nt" else "ffprobe"
        ffprobe_candidate = os.path.join(ffmpeg_dir, probe_name)
        if os.path.exists(ffprobe_candidate):
            return ffprobe_candidate
    # 3. Try imageio_ffmpeg directly
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe:
            ffmpeg_path = Path(ffmpeg_exe)
            possible_ffprobe = ffmpeg_path.parent / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
            if possible_ffprobe.exists():
                return str(possible_ffprobe)
    except Exception:
        pass
    # 4. Try static_ffmpeg package (pip install static-ffmpeg)
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
        ffprobe_static = shutil.which("ffprobe")
        if ffprobe_static and os.path.exists(ffprobe_static):
            return ffprobe_static
    except Exception:
        pass
    # 5. Check common Windows locations (including winget default install path)
    if os.name == "nt":
        for candidate in [
            os.path.expanduser(r"~\scoop\shims\ffprobe.exe"),
            r"C:\ffmpeg\bin\ffprobe.exe",
            r"C:\ProgramData\chocolatey\bin\ffprobe.exe",
            # winget installs Gyan.FFmpeg here by default
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffprobe.exe"),
        ]:
            if os.path.exists(candidate):
                return candidate
        # Also scan Program Files for ffprobe
        for prog_dir in [os.environ.get("ProgramFiles", r"C:\Program Files"),
                         os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")]:
            ffprobe_glob = Path(prog_dir).glob("**/ffprobe.exe")
            try:
                first_match = next(ffprobe_glob, None)
                if first_match and first_match.exists():
                    return str(first_match)
            except Exception:
                pass
    logger.warning("ffprobe not found on PATH or common locations. Audio stream detection will fail.")
    return "ffprobe"


def is_valid_video_file(video_path: str) -> bool:
    """Check if video file exists, is non-empty, and readable by ffprobe or ffmpeg."""
    path = Path(video_path)
    if not path.exists() or path.stat().st_size < 1000:
        return False

    # 1. Try ffprobe first if available
    ffprobe_bin = get_ffprobe_binary()
    try:
        res = subprocess.run(
            [
                ffprobe_bin,
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "json",
                str(path)
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode == 0 and res.stdout.strip():
            data = json.loads(res.stdout)
            streams = data.get("streams", [])
            if streams and int(streams[0].get("width", 0)) > 0:
                return True
    except Exception:
        pass

    # 2. Fallback: duration-aware deep frame probe via ffmpeg.
    #    Get the container-reported duration, then try decoding a frame at 75% of it.
    #    Catches truncated files that have valid headers but are corrupt mid-stream.
    ffmpeg_bin = get_ffmpeg_binary()

    # Step A: extract container-reported duration from ffmpeg stderr
    reported_duration = None
    try:
        res = subprocess.run(
            [ffmpeg_bin, "-i", str(path)],
            capture_output=True, text=True, timeout=10,
        )
        for line in (res.stderr or "").splitlines():
            if "Duration:" in line:
                match = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", line)
                if match:
                    reported_duration = (
                        float(match.group(1)) * 3600
                        + float(match.group(2)) * 60
                        + float(match.group(3))
                    )
                break
    except Exception:
        pass

    # Step B: try decoding a frame at 75% of reported duration (or at 30s if unknown)
    probe_offset = max(1.0, reported_duration * 0.75) if reported_duration and reported_duration > 2 else 30.0
    try:
        res = subprocess.run(
            [ffmpeg_bin, "-v", "error", "-ss", f"{probe_offset:.1f}", "-i", str(path),
             "-t", "1", "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if res.returncode != 0:
            logger.warning(
                "FFmpeg deep probe at %.1fs FAILED for %s (exit %s): %s",
                probe_offset, video_path, res.returncode, (res.stderr or "")[:300],
            )
            return False
        return True
    except subprocess.TimeoutExpired:
        logger.warning("FFmpeg deep probe timed out for %s — treating as valid", video_path)
        return True
    except Exception as exc:
        logger.warning("FFmpeg video probing failed for %s: %s", video_path, exc)
        return False


@dataclass
class TelegramVideo:
    source_id: str
    channel: str
    message_id: int
    title: str
    caption: str
    source_url: str
    local_path: str
    posted_at: Optional[datetime] = None
    segment_index: int = 1
    segment_total: int = 1
    segment_start: float = 0.0
    segment_duration: float = 60.0
    audio_stream_index: int = 0


class TelegramTamilStore:
    """Keeps Telegram message ids from being uploaded repeatedly."""

    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telegram_sources (
                    source_id TEXT PRIMARY KEY,
                    channel TEXT NOT NULL,
                    message_id INTEGER NOT NULL,
                    title TEXT,
                    caption TEXT,
                    source_url TEXT,
                    local_path TEXT,
                    status TEXT NOT NULL,
                    final_video_path TEXT,
                    uploaded_video_id TEXT,
                    uploaded_url TEXT,
                    segment_index INTEGER DEFAULT 1,
                    segment_total INTEGER DEFAULT 1,
                    segment_start REAL DEFAULT 0,
                    segment_duration REAL DEFAULT 60,
                    audio_stream_index INTEGER DEFAULT 0,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            self._ensure_column(conn, "title", "TEXT")
            self._ensure_column(conn, "caption", "TEXT")
            self._ensure_column(conn, "local_path", "TEXT")
            self._ensure_column(conn, "segment_index", "INTEGER DEFAULT 1")
            self._ensure_column(conn, "segment_total", "INTEGER DEFAULT 1")
            self._ensure_column(conn, "segment_start", "REAL DEFAULT 0")
            self._ensure_column(conn, "segment_duration", "REAL DEFAULT 60")
            self._ensure_column(conn, "audio_stream_index", "INTEGER DEFAULT 0")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_telegram_status ON telegram_sources(status)")

    def _ensure_column(self, conn, column: str, definition: str):
        columns = {row[1] for row in conn.execute("PRAGMA table_info(telegram_sources)").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE telegram_sources ADD COLUMN {column} {definition}")

    def already_done(self, source_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT status FROM telegram_sources WHERE source_id = ?", (source_id,)).fetchone()
        return bool(row and row[0] in {"uploaded", "skipped", "rendered"})

    def remove_source(self, source_id: str):
        with self._connect() as conn:
            conn.execute("DELETE FROM telegram_sources WHERE source_id = ? OR source_id LIKE ?", (source_id, f"{source_id}:part%"))


    def mark(self, video: TelegramVideo, status: str, **values):
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO telegram_sources (
                    source_id, channel, message_id, title, caption, source_url, local_path, status,
                    final_video_path, uploaded_video_id, uploaded_url,
                    segment_index, segment_total, segment_start, segment_duration, audio_stream_index, error,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_id) DO UPDATE SET
                    title = excluded.title,
                    caption = excluded.caption,
                    local_path = COALESCE(excluded.local_path, local_path),
                    status = excluded.status,
                    final_video_path = COALESCE(excluded.final_video_path, final_video_path),
                    uploaded_video_id = COALESCE(excluded.uploaded_video_id, uploaded_video_id),
                    uploaded_url = COALESCE(excluded.uploaded_url, uploaded_url),
                    segment_index = excluded.segment_index,
                    segment_total = excluded.segment_total,
                    segment_start = excluded.segment_start,
                    segment_duration = excluded.segment_duration,
                    audio_stream_index = excluded.audio_stream_index,
                    error = excluded.error,
                    updated_at = excluded.updated_at
                """,
                (
                    video.source_id,
                    video.channel,
                    video.message_id,
                    video.title,
                    video.caption,
                    video.source_url,
                    video.local_path,
                    status,
                    values.get("final_video_path"),
                    values.get("uploaded_video_id"),
                    values.get("uploaded_url"),
                    video.segment_index,
                    video.segment_total,
                    video.segment_start,
                    video.segment_duration,
                    video.audio_stream_index,
                    values.get("error"),
                    now,
                    now,
                ),
            )

    def pending_rendered(self, limit: int) -> list[tuple[TelegramVideo, str]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT source_id, channel, message_id, title, caption, source_url, local_path,
                       final_video_path, segment_index, segment_total, segment_start, segment_duration, audio_stream_index
                FROM telegram_sources
                WHERE status = 'rendered' AND final_video_path IS NOT NULL
                ORDER BY created_at ASC, segment_index ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        pending = []
        for row in rows:
            video = TelegramVideo(
                source_id=row[0],
                channel=row[1],
                message_id=int(row[2]),
                title=row[3] or f"Telegram video {row[2]}",
                caption=row[4] or "",
                source_url=row[5] or "",
                local_path=row[6] or "",
                segment_index=int(row[8] or 1),
                segment_total=int(row[9] or 1),
                segment_start=float(row[10] or 0),
                segment_duration=float(row[11] or 60),
                audio_stream_index=int(row[12] or 0),
            )
            pending.append((video, row[7]))
        return pending

    def pending_rendered_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*)
                FROM telegram_sources
                WHERE status = 'rendered' AND final_video_path IS NOT NULL
                """
            ).fetchone()
        return int(row[0] or 0) if row else 0

    def mark_missing_rendered_failed(self) -> int:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT source_id, final_video_path
                FROM telegram_sources
                WHERE status = 'rendered' AND final_video_path IS NOT NULL
                """
            ).fetchall()

            missing_source_ids = []
            for source_id, final_video_path in rows:
                path = Path(final_video_path or "")
                if not path.is_absolute():
                    path = PROJECT_ROOT / path
                if not path.exists():
                    missing_source_ids.append(source_id)

            if not missing_source_ids:
                return 0

            now = datetime.now(timezone.utc).isoformat()
            conn.executemany(
                """
                UPDATE telegram_sources
                SET status = 'failed', error = 'Rendered file missing', updated_at = ?
                WHERE source_id = ?
                """,
                [(now, source_id) for source_id in missing_source_ids],
            )
            return len(missing_source_ids)

    def source_segments_uploaded(self, source_id_prefix: str) -> bool:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT status FROM telegram_sources
                WHERE source_id LIKE ? AND source_id != ?
                """,
                (f"{source_id_prefix}:part%", source_id_prefix),
            ).fetchall()
        return bool(rows) and all(row[0] == "uploaded" for row in rows)


class TelegramVideoDownloader:
    def __init__(self, config: dict, store: TelegramTamilStore):
        self.config = config
        self.store = store
        self.download_dir = PROJECT_ROOT / Path(config.get("telegram_download_dir", "downloads/telegram"))
        self.download_dir.mkdir(parents=True, exist_ok=True)

    async def fetch_latest(self) -> list[TelegramVideo]:
        try:
            from telethon import TelegramClient
        except ModuleNotFoundError as exc:
            raise RuntimeError("Install Telegram support with `pip install -r pipeline/requirements.txt`.") from exc

        api_id = self.config.get("telegram_api_id") or os.getenv("TELEGRAM_API_ID")
        api_hash = self.config.get("telegram_api_hash") or os.getenv("TELEGRAM_API_HASH")
        phone = self.config.get("telegram_phone") or os.getenv("TELEGRAM_PHONE")
        channels = self._configured_channels()
        session_name = self.config.get("telegram_session_name", "ghostpipe_telegram")
        limit = int(self.config.get("telegram_fetch_limit", 50) or 50)
        max_downloads = int(
            self.config.get(
                "telegram_max_source_videos_per_run",
                self.config.get("telegram_max_uploads_per_run", 1),
            )
            or 1
        )
        if self.config.get("telegram_sequential_source_workflow", True):
            max_downloads = 1
        download_timeout = int(self.config.get("telegram_download_timeout_seconds", 1200) or 1200)
        min_download_bytes = int(self.config.get("telegram_min_download_bytes", 1024 * 1024) or 0)

        if not api_id or not api_hash or not channels:
            raise ValueError("Set TELEGRAM_CHANNELS plus TELEGRAM_API_ID and TELEGRAM_API_HASH in .env.")

        client = TelegramClient(str(PROJECT_ROOT / session_name), int(api_id), str(api_hash))
        videos: list[TelegramVideo] = []

        if phone:
            await client.start(phone=str(phone))
        else:
            await client.start(phone=lambda: input("Please enter your Telegram phone number, not a bot token: "))

        try:
            me = await client.get_me()
            if getattr(me, "bot", False):
                raise RuntimeError(
                    "This Telegram session is logged in as a bot. Bots cannot read channel history. "
                    f"Delete {PROJECT_ROOT / (str(session_name) + '.session')} and rerun with your Telegram phone number."
                )

            required_lang = str(self.config.get("telegram_required_audio_language", "") or "").strip().lower()

            for channel in channels:
                inspected_video_count = 0
                skipped_done_count = 0
                try:
                    entity = await client.get_entity(channel)
                except Exception as exc:
                    logger.warning("Telegram channel unavailable %s: %s", channel, exc)
                    continue

                username = getattr(entity, "username", None) or self._safe_channel_name(str(channel))
                fetch_limit = limit
                # Deep scan: if initial limit was 10, try scanning up to 100 messages deep
                if fetch_limit < 100:
                    fetch_limit = 100

                async for message in client.iter_messages(entity, limit=fetch_limit):
                    if not message or not message.media:
                        continue
                    mime = getattr(getattr(message, "file", None), "mime_type", "") or ""
                    if not mime.startswith("video/"):
                        continue
                    inspected_video_count += 1

                    source_id = f"telegram:{username}:{message.id}"
                    if self.store.already_done(source_id):
                        skipped_done_count += 1
                        continue

                    suffix = Path(getattr(message.file, "name", "") or "").suffix or ".mp4"
                    target = self.download_dir / f"{self._safe_channel_name(username)}_{message.id}{suffix}"
                    if target.exists() and (target.stat().st_size < min_download_bytes or not is_valid_video_file(str(target))):
                        logger.warning("Target video file exists but is invalid or corrupted. Removing: %s", target)
                        target.unlink(missing_ok=True)
                        self.store.remove_source(source_id)

                    caption = (message.message or "").strip()
                    title = self._title_from_caption(caption) or f"Telegram video {message.id}"
                    source_url = f"https://t.me/{username}/{message.id}" if getattr(entity, "username", None) else str(channel)

                    if target.exists() and target.stat().st_size >= min_download_bytes and is_valid_video_file(str(target)):
                        audio_stream_idx = 0
                        if required_lang:
                            logger.info("Checking audio language for cached video %s", source_id)
                            lang_matched, idx = await self._check_audio_language(str(target), required_lang)
                            if not lang_matched:
                                logger.info("Cached video %s doesn't match required language '%s', removing", source_id, required_lang)
                                target.unlink(missing_ok=True)
                                self.store.remove_source(source_id)
                                continue
                            audio_stream_idx = idx

                        logger.info("Reusing completed Telegram download %s: %s", source_id, target)
                        videos.append(
                            TelegramVideo(
                                source_id=source_id,
                                channel=username,
                                message_id=message.id,
                                title=title,
                                caption=caption,
                                source_url=source_url,
                                local_path=str(target),
                                posted_at=message.date,
                                audio_stream_index=audio_stream_idx,
                            )
                        )
                        if len(videos) >= max_downloads:
                            logger.info("Reached Telegram source download limit for this run: %s", max_downloads)
                            return videos
                        continue

                    logger.info("Downloading Telegram video %s", source_id)
                    progress = self._progress_logger(source_id)
                    try:
                        downloaded = None
                        for attempt in range(3):
                            try:
                                downloaded = await asyncio.wait_for(
                                    client.download_media(message, file=str(target), progress_callback=progress),
                                    timeout=download_timeout,
                                )
                                break
                            except asyncio.TimeoutError:
                                logger.warning("Telegram download timed out after %ss (attempt %d/3): %s", download_timeout, attempt+1, source_id)
                            except Exception as e:
                                logger.warning("Telegram download error (attempt %d/3) for %s: %s", attempt+1, source_id, e)
                            if attempt < 2:
                                await asyncio.sleep(5)

                        if not downloaded:
                            target.unlink(missing_ok=True)
                            logger.warning("Telegram download failed completely after 3 attempts: %s", source_id)
                            continue
                    except Exception as exc:
                        target.unlink(missing_ok=True)
                        logger.warning("Unexpected error during download: %s", exc)
                        continue
                    downloaded_path = Path(downloaded)
                    if downloaded_path.exists() and downloaded_path.stat().st_size < min_download_bytes:
                        logger.warning(
                            "Telegram download too small, treating as failed: %s (%s bytes)",
                            source_id,
                            downloaded_path.stat().st_size,
                        )
                        downloaded_path.unlink(missing_ok=True)
                        continue

                    audio_stream_idx = 0
                    if required_lang:
                        logger.info("Detecting audio language for %s", source_id)
                        lang_matched, idx = await self._check_audio_language(str(downloaded_path), required_lang)
                        if not lang_matched:
                            logger.info("Skipping video %s: audio language did not match required '%s'", source_id, required_lang)
                            downloaded_path.unlink(missing_ok=True)
                            continue
                        audio_stream_idx = idx

                    videos.append(
                        TelegramVideo(
                            source_id=source_id,
                            channel=username,
                            message_id=message.id,
                            title=title,
                            caption=caption,
                            source_url=source_url,
                            local_path=str(downloaded),
                            posted_at=message.date,
                            audio_stream_index=audio_stream_idx,
                        )
                    )
                    if len(videos) >= max_downloads:
                        logger.info("Reached Telegram source download limit for this run: %s", max_downloads)
                        return videos
                if inspected_video_count and inspected_video_count == skipped_done_count:
                    logger.info(
                        "Telegram link %s has no new videos in the latest %s inspected video posts. Moving to the next link.",
                        channel,
                        inspected_video_count,
                    )
                elif inspected_video_count == 0:
                    logger.info("Telegram link %s has no video posts in the fetch window. Moving to the next link.", channel)
        finally:
            await client.disconnect()

        if not videos:
            logger.info("All configured Telegram links have no new videos in the current fetch window.")
        return videos

    async def _check_audio_language(self, video_path: str, required_lang: str) -> tuple[bool, int]:
        """Check all audio streams to see if any matches required_lang using AudioIntelligenceEngine."""
        ffprobe_bin = get_ffprobe_binary()
        num_streams = 0
        probe_tool_available = True

        try:
            res = subprocess.run(
                [
                    ffprobe_bin,
                    "-v", "error",
                    "-select_streams", "a",
                    "-show_entries", "stream=index",
                    "-of", "json",
                    str(video_path)
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if res.returncode == 0:
                data = json.loads(res.stdout)
                num_streams = len(data.get("streams", []))
        except FileNotFoundError:
            probe_tool_available = False
            logger.warning(
                "ffprobe binary not found on this system. "
                "Install FFmpeg (winget install Gyan.FFmpeg) for proper audio detection. "
                "Attempting ffmpeg fallback..."
            )
        except Exception as e:
            logger.warning("Error reading audio streams via ffprobe: %s", e)

        # Fallback: use ffmpeg to detect audio streams when ffprobe is missing or found 0
        if num_streams == 0:
            ffmpeg_bin = get_ffmpeg_binary()
            if ffmpeg_bin and ffmpeg_bin != "ffmpeg":
                try:
                    res2 = subprocess.run(
                        [ffmpeg_bin, "-i", str(video_path), "-hide_banner"],
                        capture_output=True,
                        text=True,
                        timeout=15,
                    )
                    stderr_text = (res2.stderr or "") + (res2.stdout or "")
                    audio_lines = re.findall(r"Stream\s+#\d+:\d+.*Audio:", stderr_text)
                    if audio_lines:
                        num_streams = len(audio_lines)
                        logger.info("ffmpeg fallback detected %d audio stream(s) in %s", num_streams, Path(video_path).name)
                except Exception as e2:
                    logger.warning("ffmpeg audio stream detection fallback also failed: %s", e2)

        # If neither ffprobe nor ffmpeg could detect streams, ACCEPT the video by default
        # rather than rejecting it. The rendering pipeline has _tamil_audio_stream_index()
        # which will attempt its own detection later.
        if num_streams == 0 and not probe_tool_available:
            logger.warning(
                "Cannot detect audio streams (no ffprobe/ffmpeg). "
                "ACCEPTING video by default to avoid data loss. "
                "The rendering phase will attempt audio detection independently."
            )
            return True, 0

        if num_streams == 0:
            logger.info("No audio streams found in video.")
            return False, 0

        # Accepted languages setup
        accepted_langs = self.config.get("telegram_accepted_audio_languages")
        if isinstance(accepted_langs, list):
            accepted_langs = {str(lang).strip().lower() for lang in accepted_langs if str(lang).strip()}
        else:
            accepted_langs = {required_lang.lower()}
        accepted_langs.add(required_lang.lower())
        accepted_langs.add("ta")

        # Fallback to audio_intelligence
        from audio_intelligence import AudioIntelligenceEngine
        engine = AudioIntelligenceEngine(self.config)

        for stream_idx in range(num_streams):
            try:
                matched, lang, prob = await engine.quick_language_check(
                    video_path,
                    accepted_langs,
                    audio_stream_index=stream_idx,
                    max_seconds=600.0  # Check up to 10 mins of audio to bypass long intros
                )
                if matched:
                    logger.info("Stream %d ACCEPTED: %s (%.1f%% confidence)", stream_idx, lang, prob * 100)
                    return True, stream_idx
            except Exception as e:
                logger.warning("Error detecting language on stream %d: %s", stream_idx, e)

        logger.info("No audio stream matched accepted languages %s", sorted(accepted_langs))
        return False, 0

    def _configured_channels(self) -> list[str]:
        channels = self.config.get("telegram_channels") or os.getenv("TELEGRAM_CHANNELS")
        if isinstance(channels, str):
            parsed = [channel.strip() for channel in channels.split(",") if channel.strip()]
        elif isinstance(channels, list):
            parsed = [str(channel).strip() for channel in channels if str(channel).strip()]
        else:
            parsed = []

        fallback = self.config.get("telegram_channel") or os.getenv("TELEGRAM_CHANNEL")
        if fallback:
            parsed.append(str(fallback).strip())
        return list(dict.fromkeys(parsed))

    @staticmethod
    def _progress_logger(source_id: str):
        last_logged = {"bucket": -1}

        def callback(received: int, total: int):
            if total <= 0:
                bucket = received // (10 * 1024 * 1024)
            else:
                bucket = int((received / total) * 10)
            if bucket != last_logged["bucket"]:
                last_logged["bucket"] = bucket
                if total > 0:
                    logger.info(
                        "Telegram download progress %s: %.1f%% (%s/%s MB)",
                        source_id,
                        (received / total) * 100,
                        received // (1024 * 1024),
                        total // (1024 * 1024),
                    )
                else:
                    logger.info("Telegram download progress %s: %s MB", source_id, received // (1024 * 1024))

        return callback

    @staticmethod
    def _title_from_caption(caption: str) -> str:
        clean = re.sub(r"\s+", " ", caption).strip()
        clean = re.sub(r"https?://\S+", "", clean).strip()
        return clean[:90].rstrip()

    @staticmethod
    def _safe_channel_name(channel: str) -> str:
        return re.sub(r"[^A-Za-z0-9_-]+", "_", channel.strip().strip("@")).strip("_") or "telegram"


class TamilAudioFactory:
    def __init__(self, config: dict):
        self.config = config
        self.audio_dir = Path(config.get("tamil_audio_dir", "outputs/telegram_tamil_audio"))
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    async def build_audio(self, video: TelegramVideo) -> tuple[Optional[str], str]:
        configured_audio = str(self.config.get("tamil_audio_file", "") or "").strip()
        generate_voiceover = config_bool(self.config, "telegram_generate_tamil_voiceover", False)
        if configured_audio:
            audio_path = Path(configured_audio)
            if not audio_path.is_absolute():
                audio_path = PROJECT_ROOT / audio_path
            if audio_path.exists():
                return str(audio_path), video.caption or video.title
            if generate_voiceover:
                raise FileNotFoundError(f"Configured tamil_audio_file does not exist: {audio_path}")
            logger.warning(
                "Configured tamil_audio_file does not exist and generated voiceover is disabled; "
                "preserving source video audio instead: %s",
                audio_path,
            )

        script = await self._build_tamil_script(video)
        if not generate_voiceover:
            logger.info(
                "Generated Tamil voiceover is disabled; preserving source video audio for %s.",
                video.source_id,
            )
            return None, script

        audio_path = self.audio_dir / f"{self._safe_id(video.source_id)}.mp3"
        await self._edge_tts(script, audio_path)
        return str(audio_path), script

    async def build_script(self, video: TelegramVideo) -> str:
        return await self._build_tamil_script(video)

    async def _build_tamil_script(self, video: TelegramVideo) -> str:
        if self.config.get("tamil_voiceover_script"):
            return str(self.config["tamil_voiceover_script"]).strip()

        source_text = await self._transcribe(video.local_path)
        if not source_text:
            source_text = video.caption or video.title

        translated = await self._translate_to_tamil(source_text)
        cta = str(self.config.get("tamil_voiceover_cta", "") or "").strip()
        if cta and cta not in translated:
            translated = f"{translated}\n{cta}"
        return translated.strip() or "இந்த வீடியோவை பாருங்கள். மேலும் வீடியோக்களுக்கு சேனலை சப்ஸ்கிரைப் செய்யுங்கள்."

    async def _transcribe(self, path: str) -> str:
        if not self.config.get("telegram_transcribe_source", True):
            return ""
        try:
            import torch
            import whisper

            device = str(self.config.get("whisper_device", "auto"))
            if device == "auto":
                device = "cuda" if torch.cuda.is_available() else "cpu"
            model = whisper.load_model(str(self.config.get("whisper_model", "base")), device=device)
            result = model.transcribe(path, fp16=device == "cuda")
            return str(result.get("text", "")).strip()
        except Exception as exc:
            logger.warning("Source transcription skipped: %s", exc)
            return ""

    async def _translate_to_tamil(self, text: str) -> str:
        if not self.config.get("telegram_translate_to_tamil", True):
            return text
        try:
            from api_integrations import AIServiceRouter

            prompt = (
                "Translate this into natural spoken Tamil for a YouTube Short voiceover. "
                "Keep it concise, energetic, and under 110 words. Return only Tamil text.\n\n"
                f"{text[:3000]}"
            )
            response = await AIServiceRouter().call_with_fallback("llm", {"text": prompt}, timeout=60)
            if response.success:
                translated = self._extract_llm_text(response.data)
                if translated:
                    return translated
            logger.warning("Tamil translation fallback used: %s", response.error)
        except Exception as exc:
            logger.warning("Tamil translation skipped: %s", exc)
        return text

    @staticmethod
    def _extract_llm_text(data) -> str:
        if isinstance(data, dict):
            if "choices" in data and data["choices"]:
                return str(data["choices"][0].get("message", {}).get("content", "")).strip()
            if "content" in data and data["content"]:
                content = data["content"]
                if isinstance(content, list):
                    return " ".join(str(item.get("text", "")) for item in content if isinstance(item, dict)).strip()
                return str(content).strip()
            candidates = data.get("candidates")
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                return " ".join(str(part.get("text", "")) for part in parts).strip()
        return ""

    async def _edge_tts(self, script: str, output_path: Path):
        try:
            import edge_tts
        except ModuleNotFoundError as exc:
            raise RuntimeError("Install edge-tts with `pip install -r pipeline/requirements.txt`.") from exc

        voice = str(self.config.get("tamil_tts_voice", "ta-IN-PallaviNeural"))
        rate = str(self.config.get("tamil_tts_rate", "+4%"))
        await edge_tts.Communicate(script, voice=voice, rate=rate).save(str(output_path))

    @staticmethod
    def _safe_id(value: str) -> str:
        return hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]


class ShortsRenderer:
    def __init__(self, config: dict):
        self.config = config
        self.output_dir = Path(config.get("telegram_output_dir", config.get("output_dir", "outputs")))
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def source_duration(self, video_path: str) -> float:
        try:
            from moviepy.editor import VideoFileClip
        except ModuleNotFoundError:
            from moviepy import VideoFileClip

        source = VideoFileClip(video_path)
        try:
            return float(source.duration or 0)
        finally:
            source.close()

    async def render(self, video: TelegramVideo, audio_path: Optional[str], script: str) -> str:
        try:
            from moviepy.editor import AudioFileClip, CompositeVideoClip, VideoFileClip
        except ModuleNotFoundError:
            from moviepy import AudioFileClip, CompositeVideoClip, VideoFileClip

        output_path = self.output_dir / (
            f"telegram_tamil_{video.channel}_{video.message_id}_part"
            f"{video.segment_index:03d}_{int(time.time())}.mp4"
        )
        target_duration = int(self.config.get("telegram_short_duration", 60) or 60)

        try:
            source = VideoFileClip(video.local_path)
            source_duration = float(source.duration or target_duration)
            start = min(max(float(video.segment_start or 0), 0), max(source_duration - 0.1, 0))
            duration = min(source_duration - start, float(video.segment_duration or target_duration), float(target_duration))
            duration = max(duration, 0.1)
            end = start + duration
            clip = source.subclip(start, end) if hasattr(source, "subclip") else source.subclipped(start, end)
        except Exception as err:
            logger.error("Corrupted or unreadable video file detected: %s. Removing file. Error: %s", video.local_path, err)
            if os.path.exists(video.local_path):
                try:
                    os.remove(video.local_path)
                except Exception:
                    pass
            raise RuntimeError(f"Video file corrupted or unreadable: {video.local_path} ({err})")


        target_w, target_h = 1080, 1920
        layout = self.config.get("telegram_video_layout", "crop")

        if layout == "blur_background":
            from PIL import Image, ImageFilter
            import numpy as np
            from moviepy.editor import ImageClip

            # 1. Scale main video to fit width
            main_vid = clip.resize(width=target_w) if hasattr(clip, "resize") else clip.resized(width=target_w)
            if main_vid.h > target_h:
                main_vid = main_vid.resize(height=target_h) if hasattr(main_vid, "resize") else main_vid.resized(height=target_h)
            
            # Crop margins to bypass visual hashing algorithms
            crop_margin = float(self.config.get("visual_crop_margin", 0.0))
            if crop_margin > 0:
                try:
                    from moviepy.video.fx.all import crop
                    cx = int(main_vid.w * crop_margin)
                    cy = int(main_vid.h * crop_margin)
                    main_vid = main_vid.fx(crop, x1=cx, y1=cy, x2=main_vid.w - cx, y2=main_vid.h - cy) if hasattr(main_vid, "fx") else crop(main_vid, x1=cx, y1=cy, x2=main_vid.w - cx, y2=main_vid.h - cy)
                    main_vid = main_vid.resize(width=target_w) if hasattr(main_vid, "resize") else main_vid.resized(width=target_w)
                except Exception as e:
                    logger.warning(f"Failed to apply crop: {e}")
            
            # 1.5 Apply visual transformation for copyright bypass
            if config_bool(self.config, "visual_mirror_segments", True):
                try:
                    from moviepy.video.fx.all import mirror_x
                    main_vid = main_vid.fx(mirror_x) if hasattr(main_vid, "fx") else mirror_x(main_vid)
                except Exception as e:
                    logger.warning(f"Failed to apply mirror_x: {e}")
            
            if config_bool(self.config, "visual_color_grade", True):
                try:
                    # Apply a slight color shift (warm tint) to disrupt visual hashing
                    def color_shift(image):
                        img = image.copy().astype(float)
                        img[:,:,0] = np.clip(img[:,:,0] * 1.05, 0, 255) # Red
                        img[:,:,2] = np.clip(img[:,:,2] * 0.95, 0, 255) # Blue
                        return img.astype(np.uint8)
                    main_vid = main_vid.fl_image(color_shift)
                except Exception as e:
                    logger.warning(f"Failed to apply color shift: {e}")

            # 2. Blurred Background
            bg_vid = clip.resize(height=target_h) if hasattr(clip, "resize") else clip.resized(height=target_h)
            if bg_vid.w < target_w:
                bg_vid = bg_vid.resize(width=target_w) if hasattr(bg_vid, "resize") else bg_vid.resized(width=target_w)
            
            crop_kwargs = {"x_center": bg_vid.w / 2, "y_center": bg_vid.h / 2, "width": target_w, "height": target_h}
            bg_vid = bg_vid.crop(**crop_kwargs) if hasattr(bg_vid, "crop") else bg_vid.cropped(**crop_kwargs)

            def blur_frame(frame):
                img = Image.fromarray(frame)
                blurred = img.filter(ImageFilter.GaussianBlur(radius=25))
                return np.array(blurred)

            bg_vid = bg_vid.fl_image(blur_frame)

            # 3. Branded Header & Footer (matching channel template)
            header_h, footer_h = 250, 150
            header_array = self._create_branded_header(target_w, header_h)
            footer_array = self._create_branded_footer(target_w, footer_h)

            header_clip = ImageClip(header_array).set_duration(duration) if hasattr(ImageClip, "set_duration") else ImageClip(header_array).with_duration(duration)
            header_clip = header_clip.set_position(("center", 0)) if hasattr(header_clip, "set_position") else header_clip.with_position(("center", 0))

            footer_clip = ImageClip(footer_array).set_duration(duration) if hasattr(ImageClip, "set_duration") else ImageClip(footer_array).with_duration(duration)
            footer_clip = footer_clip.set_position(("center", target_h - footer_h)) if hasattr(footer_clip, "set_position") else footer_clip.with_position(("center", target_h - footer_h))

            # 4. Center watermark overlay
            wm_h = 50
            watermark_array = self._create_watermark(target_w, wm_h)
            watermark_clip = ImageClip(watermark_array).set_duration(duration) if hasattr(ImageClip, "set_duration") else ImageClip(watermark_array).with_duration(duration)
            wm_y = int(target_h * 0.48)
            watermark_clip = watermark_clip.set_position(("center", wm_y)) if hasattr(watermark_clip, "set_position") else watermark_clip.with_position(("center", wm_y))
            # Make watermark semi-transparent via per-pixel alpha mask
            wm_mask_arr = (watermark_array.max(axis=2) * 0.35).astype(np.uint8)
            try:
                wm_mask_clip = ImageClip(wm_mask_arr, ismask=True)
                wm_mask_clip = wm_mask_clip.set_duration(duration) if hasattr(wm_mask_clip, "set_duration") else wm_mask_clip.with_duration(duration)
                watermark_clip = watermark_clip.set_mask(wm_mask_clip) if hasattr(watermark_clip, "set_mask") else watermark_clip.with_mask(wm_mask_clip)
            except Exception:
                pass

            main_vid = main_vid.set_position("center") if hasattr(main_vid, "set_position") else main_vid.with_position("center")

            clips_to_composite = [bg_vid, main_vid, watermark_clip, header_clip, footer_clip]
            final = CompositeVideoClip(clips_to_composite, size=(target_w, target_h))
            final = final.set_duration(duration) if hasattr(final, "set_duration") else final.with_duration(duration)
        else:
            scaled = clip.resize(height=target_h) if hasattr(clip, "resize") else clip.resized(height=target_h)
            if scaled.w < target_w:
                scaled = clip.resize(width=target_w) if hasattr(clip, "resize") else clip.resized(width=target_w)

            crop_kwargs = {"x_center": scaled.w / 2, "y_center": scaled.h / 2, "width": target_w, "height": target_h}
            vertical = scaled.crop(**crop_kwargs) if hasattr(scaled, "crop") else scaled.cropped(**crop_kwargs)
            final = CompositeVideoClip([vertical], size=(target_w, target_h))
            final = final.set_duration(duration) if hasattr(final, "set_duration") else final.with_duration(duration)

        audio_clip = None
        source_audio = getattr(clip, "audio", None)
        
        temp_extracted_audio = None
        if getattr(video, "audio_stream_index", 0) > 0:
            import tempfile
            import subprocess
            temp_extracted_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
            ffmpeg_bin = get_ffmpeg_binary()
            try:
                res = subprocess.run(
                    [
                        ffmpeg_bin, "-y",
                        "-ss", str(start),
                        "-t", str(duration),
                        "-i", str(video.local_path),
                        "-map", f"0:a:{video.audio_stream_index}",
                        temp_extracted_audio
                    ],
                    capture_output=True,
                    timeout=60
                )
                if res.returncode == 0:
                    try:
                        from moviepy.editor import AudioFileClip
                    except ModuleNotFoundError:
                        from moviepy import AudioFileClip
                    if source_audio:
                        try:
                            source_audio.close()
                        except Exception:
                            pass
                    source_audio = AudioFileClip(temp_extracted_audio)
                    logger.info("Using specific audio stream %d for video %s", video.audio_stream_index, video.source_id)
                else:
                    logger.warning("Failed to extract specific audio stream %d: %s", video.audio_stream_index, res.stderr)
            except Exception as e:
                logger.warning("Error extracting specific audio stream %d: %s", video.audio_stream_index, e)

        ducked_source_audio = None
        final_audio_clips = []
        audio_uses_source = False

        if audio_path:
            try:
                audio_uses_source = Path(audio_path).resolve() == Path(video.local_path).resolve()
            except Exception:
                audio_uses_source = False

            if not audio_uses_source:
                audio_clip = AudioFileClip(audio_path)
                audio_duration = min(float(audio_clip.duration or duration), duration)
                audio_clip = audio_clip.subclip(0, audio_duration) if hasattr(audio_clip, "subclip") else audio_clip.subclipped(0, audio_duration)
                final_audio_clips.append(audio_clip)

                if source_audio and not config_bool(self.config, "telegram_preserve_source_audio", False):
                    # We are replacing audio, but we want to duck the original to bypass copyright
                    duck_volume = float(self.config.get("audio_duck_source_volume", 0.12))
                    if duck_volume > 0:
                        try:
                            from moviepy.audio.fx.all import volumex
                            ducked_source_audio = source_audio.fx(volumex, duck_volume) if hasattr(source_audio, "fx") else volumex(source_audio, duck_volume)
                            ducked_source_audio = ducked_source_audio.set_duration(audio_duration) if hasattr(ducked_source_audio, "set_duration") else ducked_source_audio.with_duration(audio_duration)
                            final_audio_clips.append(ducked_source_audio)
                        except Exception as e:
                            logger.warning(f"Failed to apply volumex: {e}")

        if not final_audio_clips and (audio_uses_source or config_bool(self.config, "telegram_preserve_source_audio", False)):
            if source_audio:
                final = final.set_audio(source_audio) if hasattr(final, "set_audio") else final.with_audio(source_audio)
        elif final_audio_clips:
            if len(final_audio_clips) > 1:
                try:
                    from moviepy.editor import CompositeAudioClip
                except ModuleNotFoundError:
                    from moviepy import CompositeAudioClip
                composite_audio = CompositeAudioClip(final_audio_clips)
                final = final.set_audio(composite_audio) if hasattr(final, "set_audio") else final.with_audio(composite_audio)
            else:
                final = final.set_audio(final_audio_clips[0]) if hasattr(final, "set_audio") else final.with_audio(final_audio_clips[0])
            
            if final_audio_clips[0].duration < duration:
                final = final.set_duration(final_audio_clips[0].duration) if hasattr(final, "set_duration") else final.with_duration(final_audio_clips[0].duration)
        elif not config_bool(self.config, "telegram_preserve_source_audio", False) and hasattr(final, "without_audio"):
            final = final.without_audio()

        speed_factor = float(self.config.get("audio_distortion_speed_factor", 1.0))
        if speed_factor != 1.0:
            try:
                from moviepy.video.fx.all import speedx
                final = final.fx(speedx, speed_factor) if hasattr(final, "fx") else speedx(final, speed_factor)
            except ImportError:
                pass

        write_kwargs = {
            "codec": "libx264",
            "audio_codec": "aac",
            "fps": min(int(clip.fps or 30), 30),
            "preset": "medium",
            "threads": max(os.cpu_count() or 2, 2),
            "logger": None,
        }
        if "verbose" in final.write_videofile.__code__.co_varnames:
            write_kwargs["verbose"] = False
        final.write_videofile(str(output_path), **write_kwargs)

        if audio_clip:
            audio_clip.close()
        final.close()
        if layout == "blur_background":
            bg_vid.close()
            main_vid.close()
            header_clip.close()
            footer_clip.close()
            try:
                watermark_clip.close()
            except Exception:
                pass
        else:
            vertical.close()
            scaled.close()
        clip.close()
        source.close()

        if temp_extracted_audio:
            if source_audio:
                try:
                    source_audio.close()
                except Exception:
                    pass
            if os.path.exists(temp_extracted_audio):
                try:
                    os.unlink(temp_extracted_audio)
                except Exception:
                    pass

        logger.info("Rendered Telegram Short part %s/%s: %s", video.segment_index, video.segment_total, output_path)
        return str(output_path)

    def _create_text_overlay(self, text: str, width: int, height: int, bg_color: tuple, text_color: tuple, font_size: int = 40):
        try:
            from PIL import Image, ImageDraw, ImageFont
            import numpy as np
        except ImportError:
            import numpy as np
            return np.zeros((height, width, 3), dtype=np.uint8)

        img = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(img)
        
        font = None
        font_paths = ["arialbd.ttf", "arial.ttf", "impact.ttf"]
        for path in font_paths:
            try:
                font = ImageFont.truetype(path, size=font_size)
                break
            except Exception:
                continue
                
        if not font:
            font = ImageFont.load_default()
            
        try:
            text_bbox = draw.multiline_textbbox((0, 0), text, font=font, align="center")
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]
            x = (width - text_w) / 2
            y = (height - text_h) / 2
            draw.multiline_text((x, y), text, font=font, fill=text_color, align="center")
        except Exception:
            draw.text((50, height//3), text, font=font, fill=text_color)
            
        return np.array(img)

    def _create_branded_header(self, width: int, height: int):
        """Create branded header: black bar with channel logo image + channel name + handle.

        Loads the actual logo.png file (configured via telegram_channel_logo_path)
        and places it on the left side, with bold channel name and handle on the right.
        """
        try:
            from PIL import Image, ImageDraw, ImageFont
            import numpy as np
        except ImportError:
            import numpy as np
            return np.zeros((height, width, 3), dtype=np.uint8)

        img = Image.new("RGB", (width, height), (0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Parse config
        header_parts = str(
            self.config.get("telegram_header_text", "MEP SHORTS\n@mepshorts")
        ).split("\n")
        channel_name = header_parts[0].strip() if header_parts else "MEP SHORTS"
        channel_handle = header_parts[1].strip() if len(header_parts) > 1 else ""

        # ── Logo image ──
        logo_size = int(height * 0.85)
        pad_left = int(width * 0.03)
        logo_y = (height - logo_size) // 2
        logo_loaded = False

        logo_path_raw = str(self.config.get("telegram_channel_logo_path", "logo.png")).strip()
        if logo_path_raw:
            logo_path = Path(logo_path_raw)
            if not logo_path.is_absolute():
                logo_path = PROJECT_ROOT / logo_path
            if logo_path.exists():
                try:
                    logo_img = Image.open(str(logo_path)).convert("RGBA")
                    # Crop to square (center crop)
                    side = min(logo_img.width, logo_img.height)
                    left = (logo_img.width - side) // 2
                    top = (logo_img.height - side) // 2
                    logo_img = logo_img.crop((left, top, left + side, top + side))
                    # Resize to target
                    logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
                    # Create circular mask
                    circle_mask = Image.new("L", (logo_size, logo_size), 0)
                    mask_draw = ImageDraw.Draw(circle_mask)
                    mask_draw.ellipse([0, 0, logo_size, logo_size], fill=255)
                    # Draw glow ring behind logo
                    brand_hex = str(self.config.get("telegram_brand_color", "#00AAFF")).strip()
                    try:
                        ring_rgb = tuple(int(brand_hex.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
                    except Exception:
                        ring_rgb = (0, 170, 255)
                    ring_w = 4
                    draw.ellipse(
                        [pad_left - ring_w, logo_y - ring_w,
                         pad_left + logo_size + ring_w, logo_y + logo_size + ring_w],
                        outline=ring_rgb, width=ring_w
                    )
                    # Paste circular-cropped logo
                    lx = pad_left
                    ly = logo_y
                    logo_rgb = logo_img.convert("RGB")
                    img.paste(logo_rgb, (lx, ly), circle_mask)
                    logo_loaded = True
                except Exception as exc:
                    logger.warning("Could not load channel logo %s: %s", logo_path, exc)

        if not logo_loaded:
            # Fallback: draw a simple circle with channel initials
            circle_d = int(height * 0.52)
            cy = (height - circle_d) // 2
            draw.ellipse([pad_left, cy, pad_left + circle_d, cy + circle_d], fill=(255, 255, 255))
            initials = "".join(w[0] for w in channel_name.split()[:3]).upper() or "M"
            logo_font = self._load_font(["impact.ttf", "arialbd.ttf", "arial.ttf"], int(circle_d * 0.42))
            bbox = draw.textbbox((0, 0), initials, font=logo_font)
            lx = pad_left + (circle_d - (bbox[2] - bbox[0])) // 2
            ly = cy + (circle_d - (bbox[3] - bbox[1])) // 2 - bbox[1]
            draw.text((lx, ly), initials, font=logo_font, fill=(0, 170, 255))

        # ── Channel name (large, bold, white with dark stroke) ──
        text_x = pad_left + logo_size + int(width * 0.03)
        name_font = self._load_font(["impact.ttf", "arialbd.ttf", "arial.ttf"], int(height * 0.28))
        name_y = int(height * 0.18)
        # Stroke for visibility
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                if dx or dy:
                    draw.text((text_x + dx, name_y + dy), channel_name, font=name_font, fill=(30, 30, 30))
        draw.text((text_x, name_y), channel_name, font=name_font, fill=(255, 255, 255))

        # ── Handle text ──
        if channel_handle:
            handle_font = self._load_font(["arial.ttf", "arialbd.ttf"], int(height * 0.19))
            handle_y = name_y + int(height * 0.35)
            draw.text((text_x, handle_y), channel_handle, font=handle_font, fill=(220, 220, 220))

        return np.array(img)

    def _create_branded_footer(self, width: int, height: int):
        """Create branded footer: subscribe CTA on solid black bar."""
        try:
            from PIL import Image, ImageDraw, ImageFont
            import numpy as np
        except ImportError:
            import numpy as np
            return np.zeros((height, width, 3), dtype=np.uint8)

        img = Image.new("RGB", (width, height), (0, 0, 0))
        draw = ImageDraw.Draw(img)

        footer_text = str(
            self.config.get("telegram_footer_text", "\U0001f514SUBSCRIBE FOR MORE ANIME CONTENT \U0001f929")
        ).strip()
        # NOTE: footer default is fine — channel-agnostic CTA
        font = self._load_font(["impact.ttf", "arialbd.ttf", "arial.ttf"], int(height * 0.35))

        try:
            bbox = draw.textbbox((0, 0), footer_text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = (width - tw) / 2
            y = (height - th) / 2 - bbox[1]
            # Subtle stroke
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    if dx or dy:
                        draw.text((x + dx, y + dy), footer_text, font=font, fill=(40, 40, 40))
            draw.text((x, y), footer_text, font=font, fill=(255, 255, 255))
        except Exception:
            draw.text((50, height // 3), footer_text, font=font, fill=(255, 255, 255))

        return np.array(img)

    def _create_watermark(self, width: int, height: int):
        """Create center watermark strip (white text on black, applied with alpha mask)."""
        try:
            from PIL import Image, ImageDraw, ImageFont
            import numpy as np
        except ImportError:
            import numpy as np
            return np.zeros((height, width, 3), dtype=np.uint8)

        header_parts = str(
            self.config.get("telegram_header_text", "MEP SHORTS")
        ).split("\n")
        watermark_text = str(
            self.config.get("telegram_watermark_text", header_parts[0].strip())
        ).strip()

        img = Image.new("RGB", (width, height), (0, 0, 0))
        draw = ImageDraw.Draw(img)
        font = self._load_font(["arialbd.ttf", "arial.ttf", "impact.ttf"], int(height * 0.55))

        try:
            bbox = draw.textbbox((0, 0), watermark_text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = (width - tw) / 2
            y = (height - th) / 2 - bbox[1]
            draw.text((x, y), watermark_text, font=font, fill=(255, 255, 255))
        except Exception:
            draw.text((width // 4, height // 4), watermark_text, font=font, fill=(255, 255, 255))

        return np.array(img)

    @staticmethod
    def _load_font(paths: list, size: int):
        """Try loading fonts in order, fall back to PIL default."""
        from PIL import ImageFont

        for path in paths:
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
        return ImageFont.load_default()


class TelegramTamilShortsPipeline:
    def __init__(self, config: dict):
        self.config = config
        self.store = TelegramTamilStore(config.get("telegram_history_db_path", "pipeline/telegram_tamil_history.sqlite3"))
        self.downloader = TelegramVideoDownloader(config, self.store)
        self.audio_factory = TamilAudioFactory(config)
        self.renderer = ShortsRenderer(config)
        self.upload_blocked_for_run = False
        try:
            from ghostpipe_v5_1_pipeline import AutoLearningMemory

            self.learning_memory = AutoLearningMemory(
                config.get("learning_memory_db_path", "pipeline/learning_memory.sqlite3"),
                enabled=bool(config.get("auto_learning_enabled", True)),
            )
        except Exception as exc:
            logger.warning("Telegram learning memory disabled: %s", exc)
            self.learning_memory = None

    async def run_once(self):
        results = []
        # Clean up any corrupt files in download directory automatically
        download_dir = PROJECT_ROOT / Path(self.config.get("telegram_download_dir", "downloads/telegram"))
        if download_dir.exists():
            for f in download_dir.glob("*.mp4"):
                if not is_valid_video_file(str(f)):
                    logger.warning("Found corrupted video download on startup. Deleting: %s", f)
                    f.unlink(missing_ok=True)

        upload_budget = self._uploads_remaining_today()
        if upload_budget <= 0:
            logger.info("Telegram daily upload limit reached. No Shorts will be uploaded today.")
            return results

        missing_count = self.store.mark_missing_rendered_failed()
        if missing_count:
            logger.warning("Cleared %s missing rendered Telegram Shorts from retry queue.", missing_count)

        pending_results = await self._upload_pending_rendered(upload_budget)
        results.extend(pending_results)
        if self.upload_blocked_for_run:
            return results
        upload_budget = self._uploads_remaining_today()
        if upload_budget <= 0:
            return results
        pending_count = self.store.pending_rendered_count()
        if pending_count > 0:
            logger.info(
                "Waiting to finish %s rendered Telegram Shorts before downloading another source video.",
                pending_count,
            )
            return results

        videos = await self.downloader.fetch_latest()
        if not videos:
            logger.info("No new Telegram videos found.")
            return results

        max_sources = int(self.config.get("telegram_max_source_videos_per_run", self.config.get("telegram_max_uploads_per_run", 1)) or 1)
        for video in videos[:max_sources]:
            try:
                self.store.mark(video, "downloaded")
                rendered = await self._render_all_segments(video)
                self._cleanup_source_after_render(video)

                for item in rendered:
                    if len(item) == 5:
                        segment_video, final_path, audio_path, tamil_script, safety_report = item
                    else:
                        segment_video, final_path, audio_path, tamil_script = item
                        safety_report = None
                    metadata = self._metadata(segment_video, tamil_script)
                    prediction = self._predict_metadata(metadata)
                    learning_result = self._learning_result(segment_video, final_path, metadata, prediction)
                    self._record_learning_prediction(learning_result)

                    upload_result = None
                    if self._uploads_remaining_today() > 0:
                        upload_result = await self._try_upload(segment_video, final_path, tamil_script, metadata, safety_report)
                    if self.upload_blocked_for_run:
                        break
                    if upload_result:
                        learning_result["upload_result"] = upload_result
                        self._record_learning_upload(learning_result, upload_result)
                        self.store.mark(
                            segment_video,
                            "uploaded",
                            final_video_path=final_path,
                            uploaded_video_id=upload_result.get("video_id"),
                            uploaded_url=upload_result.get("url"),
                        )
                        self._record_upload_success(upload_result)
                        self._cleanup_uploaded_assets(segment_video, final_path, audio_path)
                        self._mark_parent_source_uploaded_if_complete(segment_video)
                    results.append({
                        "video": segment_video,
                        "final_video_path": final_path,
                        "metadata": metadata,
                        "prediction": prediction,
                        "upload": upload_result,
                    })
                    if self._uploads_remaining_today() <= 0:
                        logger.info("Telegram daily upload limit reached after %s.", segment_video.source_id)
                        break

                self.store.mark(video, "uploaded" if self._source_segments_uploaded(video) else "rendered")
                if self._uploads_remaining_today() <= 0:
                    logger.info("Telegram daily upload limit reached. Remaining fetched source videos will wait.")
                    break
                pending_count = self.store.pending_rendered_count()
                if pending_count > 0:
                    logger.info(
                        "Waiting to finish %s rendered Telegram Shorts before rendering another source video.",
                        pending_count,
                    )
                    break
            except Exception as exc:
                logger.exception("Telegram Tamil pipeline failed for %s", video.source_id)
                self.store.remove_source(video.source_id)
                if os.path.exists(video.local_path):
                    try:
                        os.remove(video.local_path)
                        logger.info("Removed failed or corrupted source video: %s", video.local_path)
                    except Exception:
                        pass
        return results

    def _get_video_content_range(self, video_path: str, total_duration: float) -> tuple[float, float]:
        """Determine the usable range of the video, skipping intro/outro."""
        skip_intro = float(self.config.get("telegram_skip_intro_seconds", 0.0))
        skip_outro = float(self.config.get("telegram_skip_outro_seconds", 0.0))
        
        if skip_intro == 0.0 and skip_outro == 0.0 and total_duration >= 300.0:
            if config_bool(self.config, "telegram_auto_skip_anime_intro_outro", True):
                skip_intro = float(self.config.get("telegram_default_anime_intro_seconds", 90.0))
                skip_outro = float(self.config.get("telegram_default_anime_outro_seconds", 90.0))
                logger.info("Auto-applied anime intro/outro skip: %ss intro, %ss outro for %ss video", skip_intro, skip_outro, total_duration)

        if total_duration <= (skip_intro + skip_outro + 10.0):
            usable_start = 0.0
            usable_end = total_duration
        else:
            usable_start = min(skip_intro, max(0.0, total_duration - 10.0))
            usable_end = max(usable_start + 5.0, total_duration - skip_outro)

        if not config_bool(self.config, "telegram_use_chapters_if_available", True):
            return usable_start, usable_end

        try:
            ffprobe_bin = get_ffprobe_binary()
            result = subprocess.run(
                [ffprobe_bin, "-v", "quiet", "-print_format", "json", "-show_chapters", video_path],
                check=True, capture_output=True, text=True
            )

            data = json.loads(result.stdout)
            chapters = data.get("chapters", [])
            if chapters and len(chapters) >= 3:
                # Find the first and last "long" chapter (> 120 seconds)
                # Anime usually has: OP (~90s), Part A (~10m), Part B (~10m), ED (~90s), Preview (~30s)
                long_chapters = []
                for chap in chapters:
                    start_t = float(chap.get("start_time", 0))
                    end_t = float(chap.get("end_time", total_duration))
                    if end_t - start_t >= 120:
                        long_chapters.append((start_t, end_t))
                
                if long_chapters:
                    auto_start = max(usable_start, long_chapters[0][0])
                    auto_end = min(usable_end, long_chapters[-1][1])
                    logger.info("Auto-detected video content range from chapters: %ss to %ss", auto_start, auto_end)
                    return auto_start, auto_end
        except Exception as exc:
            logger.warning("Could not read chapters for auto-skip: %s", exc)

        logger.info("Enforcing configured video content range: %ss to %ss (intro: %ss, outro: %ss)", usable_start, usable_end, skip_intro, skip_outro)
        return usable_start, usable_end

    async def _render_all_segments(self, video: TelegramVideo) -> list[tuple[TelegramVideo, str, Optional[str], str]]:
        source_duration = self.renderer.source_duration(video.local_path)
        segment_seconds = int(self.config.get("telegram_short_duration", 60) or 60)
        
        if source_duration <= 0:
            source_duration = float(segment_seconds)
            
        usable_start, usable_end = self._get_video_content_range(video.local_path, source_duration)
        usable_duration = usable_end - usable_start
        
        if usable_duration <= 0:
            usable_start = 0
            usable_end = source_duration
            usable_duration = source_duration
            
        segment_total = max(1, int((usable_duration + segment_seconds - 0.001) // segment_seconds))
        
        max_segments = int(self.config.get("telegram_max_segments_per_video", 0))
        if max_segments > 0:
            segment_total = min(segment_total, max_segments)

        tamil_script = await self.audio_factory.build_script(video)
        tamil_audio: Optional[tuple[Optional[str], str]] = None
        # Prefer Whisper-detected audio stream from download phase; fall back to metadata-based detection
        if getattr(video, "audio_stream_index", 0) > 0:
            tamil_audio_stream = video.audio_stream_index
            logger.info("Using Whisper-detected audio stream index %d for %s", tamil_audio_stream, video.source_id)
        else:
            tamil_audio_stream = self._tamil_audio_stream_index(video.local_path)

        # ── Audio Changer: auto-replace non-Tamil audio with Tamil TTS ──
        auto_replace = config_bool(self.config, "telegram_auto_replace_non_tamil_audio", False)
        needs_audio_replacement = False
        if auto_replace and tamil_audio_stream is None:
            logger.info(
                "AUDIO CHANGER: No Tamil audio stream detected for %s. "
                "Will auto-generate Tamil TTS voiceover to replace source audio.",
                video.source_id,
            )
            needs_audio_replacement = True
        elif auto_replace and tamil_audio_stream is not None:
            logger.info(
                "AUDIO CHANGER: Tamil audio stream found at index %s for %s. "
                "Keeping original Tamil audio.",
                tamil_audio_stream, video.source_id,
            )

        rendered = []

        for index in range(segment_total):
            start = usable_start + (index * segment_seconds)
            if start >= usable_end:
                break
            segment_video = TelegramVideo(
                source_id=f"{video.source_id}:part{index + 1:03d}",
                channel=video.channel,
                message_id=video.message_id,
                title=f"{video.title} Part {index + 1}/{segment_total}",
                caption=video.caption,
                source_url=video.source_url,
                local_path=video.local_path,
                posted_at=video.posted_at,
                segment_index=index + 1,
                segment_total=segment_total,
                segment_start=float(start),
                segment_duration=float(min(segment_seconds, usable_end - start)),
                audio_stream_index=getattr(video, "audio_stream_index", 0),
            )
            audio_path = None

            # Priority 1: Force Tamil audio from detected stream or TTS
            if config_bool(self.config, "telegram_force_tamil_audio", False):
                if tamil_audio_stream is not None:
                    audio_path = self._extract_tamil_audio_segment(segment_video, tamil_audio_stream)
                if not audio_path:
                    if not tamil_audio:
                        tamil_audio = await self.audio_factory.build_audio(video)
                    audio_path, tamil_script = tamil_audio

            # Priority 2: Audio Changer - auto-replace when no Tamil stream exists
            elif needs_audio_replacement:
                if not tamil_audio:
                    tamil_audio = await self.audio_factory.build_audio(video)
                audio_path, tamil_script = tamil_audio
                if audio_path:
                    logger.info(
                        "AUDIO CHANGER: Replacing audio for segment %s with Tamil TTS: %s",
                        segment_video.source_id, audio_path,
                    )
                else:
                    logger.warning(
                        "AUDIO CHANGER: Tamil TTS generation returned no audio for %s. "
                        "Keeping original source audio.",
                        segment_video.source_id,
                    )

            final_path = await self.renderer.render(segment_video, audio_path, tamil_script)
            safety_report = await self._copyright_scan(final_path, final_path, tamil_script)

            if (
                not audio_path
                and config_bool(self.config, "telegram_allow_audio_replacement", False)
                and self._requires_audio_replacement(safety_report)
            ):
                logger.warning(
                    "Copyright risk found with original audio for %s. Re-rendering with Tamil audio.",
                    segment_video.source_id,
                )
                if not tamil_audio:
                    tamil_audio = await self.audio_factory.build_audio(video)
                audio_path, tamil_script = tamil_audio
                if audio_path:
                    final_path = await self.renderer.render(segment_video, audio_path, tamil_script)
                    safety_report = await self._copyright_scan(final_path, audio_path, tamil_script)
                else:
                    logger.warning(
                        "Audio replacement requested for %s, but generated voiceover is disabled.",
                        segment_video.source_id,
                    )

            if not self._safe_to_upload(safety_report):
                logger.warning(
                    "Skipping Telegram Short %s after copyright scan: %s",
                    segment_video.source_id,
                    safety_report.get("overall_risk_level", "UNKNOWN"),
                )
                self.store.mark(
                    segment_video,
                    "skipped",
                    final_video_path=final_path,
                    error=f"copyright:{safety_report.get('overall_risk_level', 'UNKNOWN')}",
                )
                self._delete_file(final_path)
                continue

            self.store.mark(segment_video, "rendered", final_video_path=final_path)
            rendered.append((segment_video, final_path, audio_path, tamil_script, safety_report))

        logger.info("Rendered %s Telegram Shorts from %s.", len(rendered), video.source_id)
        return rendered

    def _tamil_audio_stream_index(self, video_path: str) -> Optional[int]:
        """Find the Tamil audio stream index.

        Detection order:
        1. Configured telegram_audio_track_index (if set)
        2. ffprobe metadata tags (language=ta/tam/tamil)
        3. Whisper-based language detection on each stream (NEW - fallback)
        4. Default multi-audio track index (last resort)
        """
        if not config_bool(self.config, "telegram_prefer_tamil_audio_track", True):
            return None

        configured_idx = self.config.get("telegram_audio_track_index")
        if configured_idx is not None:
            try:
                return int(configured_idx)
            except Exception:
                pass

        ffprobe_bin = get_ffprobe_binary()
        streams = []
        try:
            result = subprocess.run(
                [
                    ffprobe_bin,
                    "-v",
                    "error",
                    "-select_streams",
                    "a",
                    "-show_entries",
                    "stream=index:stream_tags=language,title",
                    "-of",
                    "json",
                    video_path,
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                streams = json.loads(result.stdout or "{}").get("streams", [])
        except FileNotFoundError:
            logger.warning("ffprobe binary not found. Attempting ffmpeg fallback for stream count.")
        except Exception as exc:
            logger.warning("Could not inspect audio streams for %s: %s", video_path, exc)

        # Fallback to ffmpeg for stream counting if ffprobe fails
        if not streams:
            ffmpeg_bin = get_ffmpeg_binary()
            if ffmpeg_bin and ffmpeg_bin != "ffmpeg":
                try:
                    res2 = subprocess.run(
                        [ffmpeg_bin, "-i", str(video_path), "-hide_banner"],
                        capture_output=True,
                        text=True,
                        timeout=15,
                    )
                    stderr_text = (res2.stderr or "") + (res2.stdout or "")
                    audio_lines = re.findall(r"Stream\s+#\d+:\d+.*Audio:", stderr_text)
                    if audio_lines:
                        # Construct a dummy streams list so it can proceed to Whisper fallback
                        streams = [{"index": i, "tags": {}} for i in range(len(audio_lines))]
                        logger.info("ffmpeg fallback detected %d audio stream(s) for %s", len(streams), video_path)
                except Exception as e2:
                    logger.warning("ffmpeg fallback also failed: %s", e2)

        if not streams:
            return None

        # Step 1: Check ffprobe metadata tags
        for position, stream in enumerate(streams):
            tags = {str(key).lower(): str(value).lower() for key, value in (stream.get("tags") or {}).items()}
            language = tags.get("language", "").strip()
            title = tags.get("title", "").strip()
            if language in {"ta", "tam", "tamil", "tamizh"} or "tamil" in title or "tamizh" in title:
                logger.info("Found Tamil audio stream at index %s via metadata tag for %s", position, video_path)
                return position

        # Step 2: Whisper-based fallback for multi-stream videos without tags
        if len(streams) > 1:
            logger.info(
                "No Tamil metadata tags found in %d streams. Running Whisper detection on each stream for %s",
                len(streams), video_path,
            )
            whisper_result = self._whisper_detect_tamil_stream(video_path, len(streams))
            if whisper_result is not None:
                logger.info("Whisper detected Tamil audio on stream index %d for %s", whisper_result, video_path)
                return whisper_result

            # Whisper didn't find Tamil either; fall back to configured default
            default_multi_index = int(self.config.get("default_multi_audio_track_index", 1))
            chosen_index = min(default_multi_index, len(streams) - 1)
            logger.info(
                "Whisper found no Tamil stream. Falling back to default track index %s for %s.",
                chosen_index, video_path,
            )
            return chosen_index

        return 0

    def _whisper_detect_tamil_stream(self, video_path: str, num_streams: int) -> Optional[int]:
        """Use Whisper to detect which audio stream is Tamil. Returns stream index or None."""
        import tempfile

        try:
            import torch
            import whisper
        except ImportError:
            logger.warning("Whisper not available for Tamil stream detection fallback.")
            return None

        device = str(self.config.get("whisper_device", "auto"))
        if device == "auto":
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

        whisper_model_name = str(self.config.get("whisper_model", "small"))
        try:
            model = whisper.load_model(whisper_model_name, device=device)
        except Exception as e:
            logger.warning("Could not load Whisper model for stream detection: %s", e)
            return None

        ffmpeg_bin = get_ffmpeg_binary()
        accepted_langs = self.config.get("telegram_accepted_audio_languages")
        if isinstance(accepted_langs, list):
            accepted_langs = {str(lang).strip().lower() for lang in accepted_langs if str(lang).strip()}
        else:
            accepted_langs = {"ta"}
        accepted_langs.add("ta")
        confidence_threshold = float(self.config.get("telegram_whisper_confidence_threshold", 0.10))

        best_stream = None
        best_confidence = 0.0

        for stream_idx in range(num_streams):
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio:
                temp_audio_path = temp_audio.name

            try:
                # Sample from middle of video for better accuracy
                res = subprocess.run(
                    [
                        ffmpeg_bin, "-y",
                        "-ss", "60",  # skip first 60s (intro)
                        "-i", str(video_path),
                        "-map", f"0:a:{stream_idx}",
                        "-t", "30",
                        "-ac", "1",
                        "-ar", "16000",
                        temp_audio_path,
                    ],
                    capture_output=True,
                    timeout=30,
                )
                if res.returncode != 0:
                    continue

                audio = whisper.load_audio(temp_audio_path)
                audio = whisper.pad_or_trim(audio)
                mel = whisper.log_mel_spectrogram(audio).to(model.device)
                _, probs = model.detect_language(mel)

                sorted_langs = sorted(probs.items(), key=lambda x: x[1], reverse=True)[:5]
                top_str = ", ".join(f"{l}={p:.1%}" for l, p in sorted_langs)
                logger.info("Whisper stream %d: [%s]", stream_idx, top_str)

                for lang, prob in sorted_langs:
                    if lang.lower() in accepted_langs and prob >= confidence_threshold:
                        if prob > best_confidence:
                            best_confidence = prob
                            best_stream = stream_idx
                        break

            except Exception as e:
                logger.warning("Whisper stream detection error on stream %d: %s", stream_idx, e)
            finally:
                if os.path.exists(temp_audio_path):
                    try:
                        os.unlink(temp_audio_path)
                    except Exception:
                        pass

        return best_stream

    def _extract_tamil_audio_segment(self, video: TelegramVideo, stream_index: int) -> Optional[str]:
        audio_dir = PROJECT_ROOT / Path(self.config.get("tamil_audio_dir", "outputs/telegram_tamil_audio"))
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{self._safe_id(video.source_id)}_track{stream_index}.m4a"
        ffmpeg_bin = get_ffmpeg_binary()

        try:
            subprocess.run(
                [
                    ffmpeg_bin,
                    "-y",
                    "-v",
                    "error",
                    "-ss",
                    f"{float(video.segment_start or 0):.3f}",
                    "-t",
                    f"{float(video.segment_duration or self.config.get('telegram_short_duration', 60)):.3f}",
                    "-i",
                    video.local_path,
                    "-map",
                    f"0:a:{stream_index}",
                    "-vn",
                    "-c:a",
                    "aac",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            return str(output_path)
        except Exception as exc:
            logger.warning("Could not extract Tamil audio stream for %s: %s", video.source_id, exc)
            return None

    @staticmethod
    def _safe_id(source_id: str) -> str:
        return re.sub(r"[^A-Za-z0-9_-]+", "_", source_id).strip("_") or "telegram"

    async def _upload_pending_rendered(self, upload_budget: int) -> list[dict]:
        results = []
        if upload_budget <= 0:
            return results

        for video, final_path in self.store.pending_rendered(upload_budget):
            if not Path(final_path).exists():
                logger.warning("Skipping missing rendered Telegram Short: %s", final_path)
                self.store.mark(video, "failed", final_video_path=final_path, error="Rendered file missing")
                continue

            tamil_script = video.caption or video.title
            metadata = self._metadata(video, tamil_script)
            prediction = self._predict_metadata(metadata)
            upload_result = await self._try_upload(video, final_path, tamil_script, metadata)
            if self.upload_blocked_for_run:
                break
            if upload_result:
                learning_result = self._learning_result(video, final_path, metadata, prediction)
                learning_result["upload_result"] = upload_result
                self._record_learning_upload(learning_result, upload_result)
                self.store.mark(
                    video,
                    "uploaded",
                    final_video_path=final_path,
                    uploaded_video_id=upload_result.get("video_id"),
                    uploaded_url=upload_result.get("url"),
                )
                self._record_upload_success(upload_result)
                self._cleanup_uploaded_assets(video, final_path, None)
                self._mark_parent_source_uploaded_if_complete(video)
            results.append({
                "video": video,
                "final_video_path": final_path,
                "metadata": metadata,
                "prediction": prediction,
                "upload": upload_result,
            })
            if self._uploads_remaining_today() <= 0:
                break
            if self.upload_blocked_for_run:
                break
        return results

    async def _try_upload(
        self,
        video: TelegramVideo,
        final_path: str,
        tamil_script: str,
        metadata: Optional[dict] = None,
        safety_report: Optional[dict] = None,
    ) -> Optional[dict]:
        try:
            return await self._maybe_upload(video, final_path, tamil_script, metadata, safety_report)
        except Exception as exc:
            if self._is_youtube_upload_quota_error(exc):
                self.upload_blocked_for_run = True
                self._record_youtube_upload_quota_block(exc)
                logger.warning(
                    "Telegram Short upload stopped for %s because YouTube upload quota is exhausted. "
                    "Keeping it rendered for retry after quota reset.",
                    video.source_id,
                )
            elif self._is_youtube_network_block_error(exc):
                self.upload_blocked_for_run = True
                logger.warning("YouTube upload network is blocked. Stopping Telegram uploads for this run.")
                logger.warning(
                    "Telegram Short upload failed for %s due to network access. Keeping it rendered for retry: %s",
                    video.source_id,
                    exc,
                )
            elif self._is_youtube_auth_error(exc):
                self.upload_blocked_for_run = True
                self._record_youtube_auth_block(exc)
                logger.warning(
                    "YouTube OAuth credentials are invalid or revoked for %s. "
                    "Run `python scripts/youtube_oauth_setup.py` to refresh `youtube_credentials.json`, "
                    "then retry the Telegram pipeline. Uploads are stopped for this run.",
                    video.source_id,
                )
            else:
                logger.exception(
                    "Telegram Short upload failed for %s. Keeping it rendered for retry: %s",
                    video.source_id,
                    exc,
                )
            self.store.mark(video, "rendered", final_video_path=final_path, error=f"upload_failed:{exc}")
            return None

    @staticmethod
    def _is_youtube_upload_quota_error(exc: Exception) -> bool:
        text = str(exc).lower()
        return "quota exceeded" in text or "ratelimitexceeded" in text or "rate limit exceeded" in text

    @staticmethod
    def _is_youtube_auth_error(exc: Exception) -> bool:
        text = str(exc).lower()
        return (
            "invalid_grant" in text
            or "expired or revoked" in text
            or "refresherror" in text
            or "invalid_client" in text
            or "only supported with oauth" in text
            or ("oauth2" in text and "required" in text)
            or ("unauthorized" in text and "oauth" in text)
        )

    @staticmethod
    def _is_youtube_network_block_error(exc: Exception) -> bool:
        text = str(exc).lower()
        return (
            "winerror 10013" in text
            or "unable to find the server" in text
            or "getaddrinfo failed" in text
            or "transporterror" in text
            or "permission denied" in text
        )

    async def _copyright_scan(self, video_path: str, audio_path: Optional[str], script_text: str) -> dict:
        if not self.config.get("telegram_copyright_check_enabled", self.config.get("require_safe_to_upload", True)):
            return {"overall_risk_level": "CLEAR", "overall_risk_score": 0.0, "safe_to_upload": True}

        try:
            import numpy as np
            from copyright_shield_v2 import AudioFingerprintEngine, RiskLevel, VisualFingerprintEngine

            audio_engine = AudioFingerprintEngine()
            reports = []
            individual_reports = []
            has_audio_fingerprints = any(audio_engine.known_fingerprints_db.values())
            if has_audio_fingerprints:
                reports.append(audio_engine.scan_audio(audio_path or video_path))
            else:
                individual_reports.append({
                    "asset_type": "audio",
                    "risk_level": RiskLevel.CLEAR.name,
                    "risk_score": 0.0,
                    "transformation_required": False,
                    "instructions": {"action": "none", "notes": "No local audio fingerprint database configured"},
                })
            reports.append(VisualFingerprintEngine().scan_video(video_path))
            max_risk = max((report.risk_level for report in reports), key=lambda risk: risk.value)
            avg_score = float(np.mean([report.risk_score for report in reports]))
            individual_reports.extend(
                {
                    "asset_type": report.asset_type,
                    "risk_level": report.risk_level.name,
                    "risk_score": report.risk_score,
                    "transformation_required": report.transformation_required,
                    "instructions": report.transformation_instructions,
                }
                for report in reports
            )
            return {
                "overall_risk_level": max_risk.name,
                "overall_risk_score": avg_score,
                "individual_reports": individual_reports,
                "safe_to_upload": max_risk.value <= RiskLevel.LOW.value,
                "requires_transformation": max_risk.value >= RiskLevel.MEDIUM.value,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as exc:
            logger.warning("Copyright scan failed for %s: %s", video_path, exc)
            return {
                "overall_risk_level": "UNKNOWN",
                "overall_risk_score": 1.0,
                "safe_to_upload": False,
                "error": str(exc),
            }

    @staticmethod
    def _requires_audio_replacement(safety_report: dict) -> bool:
        if safety_report.get("requires_transformation"):
            return True
        reports = safety_report.get("individual_reports", safety_report.get("reports", []))
        for report in reports:
            if report.get("asset_type") == "audio" and report.get("risk_level") in {"MEDIUM", "HIGH", "CRITICAL"}:
                return True
        return False

    def _safe_to_upload(self, safety_report: dict) -> bool:
        if not self.config.get("require_safe_to_upload", True):
            return True
        risk = str(safety_report.get("overall_risk_level", "UNKNOWN")).upper()
        return safety_report.get("safe_to_upload") is True and risk not in {"MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"}

    @staticmethod
    def _delete_file(raw_path: str):
        try:
            path = Path(raw_path)
            if path.exists() and path.is_file():
                path.unlink()
        except Exception as exc:
            logger.warning("Could not delete unsafe rendered file %s: %s", raw_path, exc)

    def _source_segments_uploaded(self, video: TelegramVideo) -> bool:
        return self.store.source_segments_uploaded(video.source_id)

    def _mark_parent_source_uploaded_if_complete(self, video: TelegramVideo):
        match = re.match(r"(.+):part\d+$", video.source_id)
        if not match:
            return
        parent_id = match.group(1)
        if not self.store.source_segments_uploaded(parent_id):
            return
        parent = TelegramVideo(
            source_id=parent_id,
            channel=video.channel,
            message_id=video.message_id,
            title=re.sub(r"\s+Part\s+\d+/\d+$", "", video.title).strip() or video.title,
            caption=video.caption,
            source_url=video.source_url,
            local_path=video.local_path,
            segment_total=video.segment_total,
        )
        self.store.mark(parent, "uploaded")

    def _quota_state_path(self) -> Path:
        path = Path(self.config.get("daily_quota_state_path", "public/data/daily_quota_state.json"))
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _upload_timezone(self):
        timezone_name = str(self.config.get("upload_timezone", "Asia/Kolkata") or "Asia/Kolkata")
        try:
            return ZoneInfo(timezone_name)
        except Exception:
            logger.warning("Invalid upload timezone '%s', falling back to Asia/Kolkata", timezone_name)
            return ZoneInfo("Asia/Kolkata")

    def _today_upload_key(self) -> str:
        return datetime.now(self._upload_timezone()).strftime("%Y-%m-%d")

    def _telegram_daily_upload_limit(self) -> int:
        return int(self.config.get("telegram_max_daily_uploads", self.config.get("max_daily_uploads", 5)) or 5)

    def _load_quota_state(self) -> dict:
        path = self._quota_state_path()
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8-sig") as handle:
                    data = json.load(handle)
                return data if isinstance(data, dict) else {}
            except Exception as exc:
                logger.warning("Could not read Telegram daily quota state: %s", exc)
        return {"date": "", "uploads": 0, "history": []}

    def _save_quota_state(self, state: dict):
        with open(self._quota_state_path(), "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2)

    def _uploads_remaining_today(self) -> int:
        state = self._load_quota_state()
        today = self._today_upload_key()
        if state.get("date") != today:
            state = {"date": today, "uploads": 0, "history": state.get("history", [])}
            self._save_quota_state(state)
        if state.get("youtube_upload_quota_blocked_date") == today:
            logger.info("YouTube upload quota is blocked for today: %s", state.get("youtube_upload_quota_block_reason", "quota exceeded"))
            return 0
        used = max(int(state.get("uploads", 0) or 0), self._actual_upload_count_for_date(datetime.now(self._upload_timezone()).date()))
        return max(self._telegram_daily_upload_limit() - used, 0)

    def _actual_upload_count_for_date(self, upload_date) -> int:
        state = self._load_quota_state()
        count = 0
        for item in state.get("history", []):
            upload_time = self._parse_upload_datetime(item.get("timestamp"))
            if upload_time and upload_time.date() == upload_date:
                count += 1
        return count

    def _record_youtube_upload_quota_block(self, exc: Exception):
        state = self._load_quota_state()
        today = self._today_upload_key()
        state["date"] = today
        state["youtube_upload_quota_blocked_date"] = today
        state["youtube_upload_quota_block_reason"] = str(exc)[:500]
        state["max_daily_uploads"] = self._telegram_daily_upload_limit()
        self._save_quota_state(state)
        logger.warning("YouTube upload quota exceeded. Stopping Telegram uploads until the quota resets.")

    def _record_youtube_auth_block(self, exc: Exception):
        state = self._load_quota_state()
        today = self._today_upload_key()
        state["date"] = today
        state["youtube_auth_blocked_date"] = today
        state["youtube_auth_block_reason"] = str(exc)[:500]
        self._save_quota_state(state)
        logger.warning("YouTube OAuth session is no longer valid. Re-run the OAuth setup to refresh credentials.")

    def _record_upload_success(self, upload_result: dict):
        state = self._load_quota_state()
        today = self._today_upload_key()
        if state.get("date") != today:
            state = {"date": today, "uploads": 0, "history": state.get("history", [])}

        history = state.setdefault("history", [])
        scheduled_publish_at = upload_result.get("scheduled_publish_at")
        publish_timestamp = scheduled_publish_at or datetime.now(self._upload_timezone()).isoformat()
        publish_time = self._parse_upload_datetime(publish_timestamp) or datetime.now(self._upload_timezone())
        upload_window_key = self._window_key_for_upload_time(publish_time)
        history.append({
            "timestamp": datetime.now(self._upload_timezone()).isoformat(),
            "pipeline": "telegram_tamil_shorts",
            "scheduled_publish_at": scheduled_publish_at,
            "upload_window_key": upload_window_key,
            "video_id": upload_result.get("video_id"),
            "url": upload_result.get("url"),
        })
        state["history"] = history[-100:]
        state["date"] = self._today_upload_key()
        state["uploads"] = self._actual_upload_count_for_date(datetime.now(self._upload_timezone()).date())
        state["max_daily_uploads"] = self._telegram_daily_upload_limit()
        self._save_quota_state(state)

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

    def _upload_window_key(self, peak: datetime) -> str:
        return peak.astimezone(self._upload_timezone()).strftime("%Y-%m-%dT%H:%M")

    def _window_key_for_upload_time(self, upload_time: datetime) -> Optional[str]:
        tz = self._upload_timezone()
        upload_time = upload_time.astimezone(tz)
        peak_times = self.config.get("upload_peak_times", ["07:30", "11:30", "15:30", "18:30", "21:30"])
        for day_offset in range(-1, 2):
            day = (upload_time + timedelta(days=day_offset)).date()
            for slot in peak_times:
                peak = self._peak_datetime(day, slot)
                if abs((upload_time - peak).total_seconds()) <= 60:
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

    def _next_peak_schedule_time(self) -> Optional[datetime]:
        if not self.config.get("schedule_uploads_ahead", True):
            return None

        tz = self._upload_timezone()
        now = datetime.now(tz)
        peak_times = self.config.get("upload_peak_times", ["07:30", "11:30", "15:30", "18:30", "21:30"])
        days_ahead = max(int(self.config.get("schedule_upload_days_ahead", 0) or 0), 0)

        for day_offset in range(days_ahead, days_ahead + 14):
            publish_date = (now + timedelta(days=day_offset)).date()
            if self._scheduled_upload_count_for_date(publish_date) >= self._telegram_daily_upload_limit():
                continue

            used_windows = self._used_upload_window_keys_for_date(publish_date)
            slots = [self._peak_datetime(publish_date, slot) for slot in peak_times]
            for slot in sorted(slots):
                if slot <= now + timedelta(minutes=15):
                    continue
                if self._upload_window_key(slot) not in used_windows:
                    return slot

        return None

    def _cleanup_source_after_render(self, video: TelegramVideo):
        if not self.config.get("telegram_delete_source_after_render", True):
            return
        try:
            path = Path(video.local_path)
            if path.exists() and path.is_file():
                path.unlink()
                logger.info("Deleted downloaded Telegram source after rendering all segments: %s", path)
        except Exception as exc:
            logger.warning("Could not delete downloaded Telegram source %s: %s", video.local_path, exc)

    async def _maybe_upload(
        self,
        video: TelegramVideo,
        final_path: str,
        tamil_script: str,
        metadata: Optional[dict] = None,
        safety_report: Optional[dict] = None,
    ) -> Optional[dict]:
        mode = str(self.config.get("telegram_mode", self.config.get("mode", "dry_run"))).lower()
        if mode in {"dry_run", "dry-run"}:
            logger.info("DRY RUN - rendered %s but did not upload.", final_path)
            return None

        if not safety_report:
            safety_report = await self._copyright_scan(final_path, final_path, tamil_script)
        if not self._safe_to_upload(safety_report):
            logger.warning(
                "Upload skipped for %s - copyright safety gate did not approve this Short: %s",
                final_path,
                safety_report.get("overall_risk_level", "UNKNOWN"),
            )
            self.store.mark(
                video,
                "skipped",
                final_video_path=final_path,
                error=f"copyright:{safety_report.get('overall_risk_level', 'UNKNOWN')}",
            )
            return None

        from api_integrations import YouTubePublisher

        publisher = YouTubePublisher(
            credentials_path=self.config.get("youtube_credentials_path", "youtube_credentials.json"),
            client_secrets_path=self.config.get("youtube_client_secrets_path", "client_secrets.json"),
        )
        metadata = metadata or self._metadata(video, tamil_script)
        schedule_time = self._next_peak_schedule_time()
        if schedule_time:
            logger.info("Uploading to channel and scheduling Telegram Short for peak slot: %s", schedule_time.isoformat())
        return await publisher.upload_short(
            video_path=final_path,
            title=metadata["title"],
            description=metadata["description"],
            tags=metadata["tags"],
            category_id=str(self.config.get("telegram_youtube_category_id", "1")),
            privacy=str(self.config.get("upload_privacy", "private")),
            made_for_kids=bool(self.config.get("upload_made_for_kids", False)),
            public_stats_viewable=bool(self.config.get("upload_public_stats_viewable", True)),
            schedule_time=schedule_time,
        )

    def _metadata(self, video: TelegramVideo, tamil_script: str) -> dict:
        title_prefix = str(self.config.get("telegram_upload_title_prefix", "Tamil Shorts")).strip()
        title_base = video.title or "Telegram Short"
        title, title_template = self._attractive_title(title_base, title_prefix)
        description = (
            f"{tamil_script[:900]}\n\n"
            f"Source: {video.source_url}\n\n"
            "#Shorts #TamilShorts #Tamil #ViralShorts"
        )
        tags = self.config.get("telegram_upload_tags") or ["Tamil Shorts", "Shorts", "Tamil", "Telegram"]
        tags = list(dict.fromkeys([*tags, "Tamil viral", "anime Tamil", "must watch", "trending shorts"]))
        return {
            "title": title,
            "description": description,
            "tags": tags[:20],
            "category": "Telegram Tamil",
            "title_template": title_template,
            "hook_style": "telegram_tamil_clip",
            "structure": "download_render_upload",
            "title_features": self._title_features(title),
        }

    def _attractive_title(self, raw_title: str, prefix: str) -> tuple[str, str]:
        clean = re.sub(r"\s+", " ", raw_title).strip(" -:|") or "Tamil Short"
        clean = re.sub(r"https?://\S+", "", clean).strip() or "Tamil Short"
        part_match = re.search(r"\s+Part\s+(\d+)/(\d+)$", clean, flags=re.IGNORECASE)
        part_number = ""
        total_parts = ""
        if part_match:
            part_number = part_match.group(1)
            total_parts = part_match.group(2)
            clean = clean[:part_match.start()].strip(" -:|") or "Tamil Short"
        topic = clean[:48].rstrip()
        emoji_options = self.config.get("telegram_upload_title_emojis") or [
            "\U0001f3ac", "\U0001f4fa", "\U0001f3a5", "\u2728", "\U0001f539", "\U0001f4cc"
        ]
        emoji = random.choice([str(item).strip() for item in emoji_options if str(item).strip()] or [""])
        if part_number:
            episode_label = f"Ep {part_number}: Part {part_number}"
            if total_parts:
                episode_label = f"{episode_label}/{total_parts}"
            title = f"{emoji} {episode_label} | {topic}"
            if prefix and prefix.lower() not in title.lower():
                title = f"{title} | {prefix}"
            template = "episode_part"
        else:
            templates = {
                "feature_clip": "{emoji} Featured Tamil Short | {topic}",
                "cinematic_moment": "{emoji} Tamil Moment | {topic}",
                "shorts_episode": "{emoji} Tamil Shorts Episode | {topic}",
                "watch_now": "{emoji} Watch in Tamil | {topic}",
            }
            template = self._choose_title_template(list(templates.keys()), "Telegram Tamil")
            title = templates[template].format(emoji=emoji, topic=topic).strip()
            if prefix and prefix.lower() not in title.lower():
                title = f"{title} | {prefix}"
        title = re.sub(r"\s+", " ", title).strip()
        if len(title) > 95:
            title = title[:92].rstrip() + "..."
        return title, template

    def _choose_title_template(self, options: list[str], category: str) -> str:
        if self.learning_memory and hasattr(self.learning_memory, "choose"):
            try:
                return self.learning_memory.choose(
                    "title_template",
                    options,
                    category,
                    exploration_rate=float(self.config.get("learning_exploration_rate", 0.18)),
                )
            except Exception as exc:
                logger.warning("Telegram title learning fallback used: %s", exc)
        return random.choice(options)

    @staticmethod
    def _has_emoji(text: str) -> bool:
        return bool(re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", text))

    def _title_features(self, title: str) -> dict:
        lower = title.lower()
        attractive_words = ["must watch", "viral", "trending", "don't miss", "tamil", "shorts"]
        return {
            "length": len(title),
            "has_emoji": self._has_emoji(title),
            "has_number": any(char.isdigit() for char in title),
            "has_question": "?" in title,
            "attractive_words": [word for word in attractive_words if word in lower],
        }

    def _predict_metadata(self, metadata: dict) -> dict:
        features = metadata.get("title_features", {})
        title_score = 0.55
        if 35 <= int(features.get("length", 0) or 0) <= 95:
            title_score += 0.15
        if features.get("has_emoji"):
            title_score += 0.1
        if features.get("attractive_words"):
            title_score += 0.15
        title_score = min(title_score, 1.0)
        predicted_ctr = round((title_score * 0.45 + 0.34) * 100, 2)
        predicted_avd = round(random.uniform(62, 82), 2)
        predicted_virality = round(min((predicted_ctr * 0.45) + (predicted_avd * 0.4) + 12, 100), 2)
        return {
            "predicted_ctr": predicted_ctr,
            "predicted_avd": predicted_avd,
            "predicted_virality": predicted_virality,
            "title_score": round(title_score, 2),
            "ml_feature_set": "telegram_title_v1",
            "recommendation": "upload" if predicted_virality >= 55 else "refine",
        }

    def _learning_result(self, video: TelegramVideo, final_path: str, metadata: dict, prediction: dict) -> dict:
        return {
            "original_video": {
                "video_id": video.source_id,
                "title": video.title,
                "category": "Telegram Tamil",
                "url": video.source_url,
                "download_path": video.local_path,
                "duration": self.config.get("telegram_short_duration", 60),
            },
            "final_video_path": final_path,
            "metadata": metadata,
            "new_script": {
                "style": metadata.get("hook_style", "telegram_tamil_clip"),
                "structure": metadata.get("structure", "download_render_upload"),
            },
            "prediction": prediction,
            "learning": {"title_template": metadata.get("title_template", "telegram_tamil")},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _record_learning_prediction(self, result: dict):
        if not self.learning_memory:
            return
        try:
            self.learning_memory.record_prediction(result)
        except Exception as exc:
            logger.warning("Telegram learning prediction skipped: %s", exc)

    def _record_learning_upload(self, result: dict, upload_result: dict):
        if not self.learning_memory:
            return
        try:
            self.learning_memory.record_upload(result, upload_result)
        except Exception as exc:
            logger.warning("Telegram learning upload skipped: %s", exc)

    def _cleanup_uploaded_assets(self, video: TelegramVideo, final_path: str, audio_path: Optional[str]):
        if not self.config.get("telegram_delete_local_files_after_upload", True):
            return

        configured_audio = str(self.config.get("tamil_audio_file", "") or "").strip()
        paths = [video.local_path, final_path]
        if audio_path and not configured_audio:
            paths.append(audio_path)

        for raw_path in paths:
            try:
                path = Path(raw_path)
                if path.exists() and path.is_file():
                    path.unlink()
                    logger.info("Deleted uploaded Telegram pipeline asset: %s", path)
            except Exception as exc:
                logger.warning("Could not delete uploaded Telegram pipeline asset %s: %s", raw_path, exc)


def load_config() -> dict:
    from ghostpipe_v5_1_pipeline import load_config as load_ghostpipe_config

    config = load_ghostpipe_config()
    telegram_config_path = PROJECT_ROOT / "config" / "telegram_tamil_shorts.json"
    if telegram_config_path.exists():
        with open(telegram_config_path, "r", encoding="utf-8") as handle:
            config.update(json.load(handle))

    env_overrides = {
        "telegram_channel": os.getenv("TELEGRAM_CHANNEL"),
        "telegram_channels": os.getenv("TELEGRAM_CHANNELS"),
        "telegram_phone": os.getenv("TELEGRAM_PHONE"),
        "telegram_api_id": os.getenv("TELEGRAM_API_ID"),
        "telegram_api_hash": os.getenv("TELEGRAM_API_HASH"),
        "telegram_mode": os.getenv("TELEGRAM_TAMIL_MODE"),
        "tamil_audio_file": os.getenv("TAMIL_AUDIO_FILE"),
        "tamil_tts_voice": os.getenv("TAMIL_TTS_VOICE"),
        "telegram_force_tamil_audio": os.getenv("TELEGRAM_FORCE_TAMIL_AUDIO"),
        "telegram_prefer_tamil_audio_track": os.getenv("TELEGRAM_PREFER_TAMIL_AUDIO_TRACK"),
        "telegram_generate_tamil_voiceover": os.getenv("TELEGRAM_GENERATE_TAMIL_VOICEOVER"),
        "telegram_allow_audio_replacement": os.getenv("TELEGRAM_ALLOW_AUDIO_REPLACEMENT"),
        "telegram_preserve_source_audio": os.getenv("TELEGRAM_PRESERVE_SOURCE_AUDIO"),
        "telegram_required_audio_language": os.getenv("TELEGRAM_REQUIRED_AUDIO_LANGUAGE"),
    }
    for key, value in env_overrides.items():
        if value not in (None, ""):
            config[key] = value
    return config


async def main():
    parser = argparse.ArgumentParser(description="Download Telegram videos, replace audio with Tamil, upload as Shorts.")
    parser.add_argument("--once", action="store_true", help="Run one fetch/render/upload cycle.")
    parser.parse_args()

    await TelegramTamilShortsPipeline(load_config()).run_once()


if __name__ == "__main__":
    asyncio.run(main())
