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
            conn.execute("CREATE INDEX IF NOT EXISTS idx_telegram_status ON telegram_sources(status)")

    def _ensure_column(self, conn, column: str, definition: str):
        columns = {row[1] for row in conn.execute("PRAGMA table_info(telegram_sources)").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE telegram_sources ADD COLUMN {column} {definition}")

    def already_done(self, source_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT status FROM telegram_sources WHERE source_id = ?", (source_id,)).fetchone()
        return bool(row and row[0] in {"uploaded", "skipped", "rendered"})

    def mark(self, video: TelegramVideo, status: str, **values):
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO telegram_sources (
                    source_id, channel, message_id, title, caption, source_url, local_path, status,
                    final_video_path, uploaded_video_id, uploaded_url,
                    segment_index, segment_total, segment_start, segment_duration, error,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                       final_video_path, segment_index, segment_total, segment_start, segment_duration
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
        self.download_dir = Path(config.get("telegram_download_dir", "downloads/telegram"))
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
        limit = int(self.config.get("telegram_fetch_limit", 10) or 10)
        max_downloads = int(
            self.config.get(
                "telegram_max_source_videos_per_run",
                self.config.get("telegram_max_uploads_per_run", 1),
            )
            or 1
        )
        if self.config.get("telegram_sequential_source_workflow", True):
            max_downloads = 1
        download_timeout = int(self.config.get("telegram_download_timeout_seconds", 600) or 600)
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

            for channel in channels:
                inspected_video_count = 0
                skipped_done_count = 0
                try:
                    entity = await client.get_entity(channel)
                except Exception as exc:
                    logger.warning("Telegram channel unavailable %s: %s", channel, exc)
                    continue

                username = getattr(entity, "username", None) or self._safe_channel_name(str(channel))
                async for message in client.iter_messages(entity, limit=limit):
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
                    if target.exists() and target.stat().st_size < min_download_bytes:
                        target.unlink(missing_ok=True)

                    caption = (message.message or "").strip()
                    title = self._title_from_caption(caption) or f"Telegram video {message.id}"
                    source_url = f"https://t.me/{username}/{message.id}" if getattr(entity, "username", None) else str(channel)
                    if target.exists() and target.stat().st_size >= min_download_bytes:
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
                            )
                        )
                        if len(videos) >= max_downloads:
                            logger.info("Reached Telegram source download limit for this run: %s", max_downloads)
                            return videos
                        continue

                    logger.info("Downloading Telegram video %s", source_id)
                    progress = self._progress_logger(source_id)
                    try:
                        downloaded = await asyncio.wait_for(
                            client.download_media(message, file=str(target), progress_callback=progress),
                            timeout=download_timeout,
                        )
                    except asyncio.TimeoutError:
                        target.unlink(missing_ok=True)
                        logger.warning("Telegram download timed out after %ss: %s", download_timeout, source_id)
                        continue

                    if not downloaded:
                        target.unlink(missing_ok=True)
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

        source = VideoFileClip(video.local_path)
        source_duration = float(source.duration or target_duration)
        start = min(max(float(video.segment_start or 0), 0), max(source_duration - 0.1, 0))
        duration = min(source_duration - start, float(video.segment_duration or target_duration), float(target_duration))
        duration = max(duration, 0.1)
        end = start + duration
        clip = source.subclip(start, end) if hasattr(source, "subclip") else source.subclipped(start, end)

        target_w, target_h = 1080, 1920
        scaled = clip.resize(height=target_h) if hasattr(clip, "resize") else clip.resized(height=target_h)
        if scaled.w < target_w:
            scaled = clip.resize(width=target_w) if hasattr(clip, "resize") else clip.resized(width=target_w)

        crop_kwargs = {"x_center": scaled.w / 2, "y_center": scaled.h / 2, "width": target_w, "height": target_h}
        vertical = scaled.crop(**crop_kwargs) if hasattr(scaled, "crop") else scaled.cropped(**crop_kwargs)
        final = CompositeVideoClip([vertical], size=(target_w, target_h))
        final = final.set_duration(duration) if hasattr(final, "set_duration") else final.with_duration(duration)

        audio_clip = None
        audio_uses_source = False
        if audio_path:
            try:
                audio_uses_source = Path(audio_path).resolve() == Path(video.local_path).resolve()
            except Exception:
                audio_uses_source = False

        if audio_path and not audio_uses_source:
            audio_clip = AudioFileClip(audio_path)
            audio_duration = min(float(audio_clip.duration or duration), duration)
            audio_clip = audio_clip.subclip(0, audio_duration) if hasattr(audio_clip, "subclip") else audio_clip.subclipped(0, audio_duration)
            if audio_duration < duration:
                final = final.set_duration(audio_duration) if hasattr(final, "set_duration") else final.with_duration(audio_duration)
            final = final.set_audio(audio_clip) if hasattr(final, "set_audio") else final.with_audio(audio_clip)
        elif audio_uses_source or config_bool(self.config, "telegram_preserve_source_audio", True):
            source_audio = getattr(clip, "audio", None)
            if source_audio:
                final = final.set_audio(source_audio) if hasattr(final, "set_audio") else final.with_audio(source_audio)
        elif not config_bool(self.config, "telegram_preserve_source_audio", True) and hasattr(final, "without_audio"):
            final = final.without_audio()

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
        vertical.close()
        scaled.close()
        clip.close()
        source.close()

        logger.info("Rendered Telegram Short part %s/%s: %s", video.segment_index, video.segment_total, output_path)
        return str(output_path)


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

                for segment_video, final_path, audio_path, tamil_script in rendered:
                    metadata = self._metadata(segment_video, tamil_script)
                    prediction = self._predict_metadata(metadata)
                    learning_result = self._learning_result(segment_video, final_path, metadata, prediction)
                    self._record_learning_prediction(learning_result)

                    upload_result = None
                    if self._uploads_remaining_today() > 0:
                        upload_result = await self._try_upload(segment_video, final_path, tamil_script, metadata)
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
                self.store.mark(video, "failed", error=str(exc))
        return results

    async def _render_all_segments(self, video: TelegramVideo) -> list[tuple[TelegramVideo, str, Optional[str], str]]:
        source_duration = self.renderer.source_duration(video.local_path)
        segment_seconds = int(self.config.get("telegram_short_duration", 60) or 60)
        if source_duration <= 0:
            source_duration = float(segment_seconds)
        segment_total = max(1, int((source_duration + segment_seconds - 0.001) // segment_seconds))
        tamil_script = await self.audio_factory.build_script(video)
        tamil_audio: Optional[tuple[Optional[str], str]] = None
        tamil_audio_stream = self._tamil_audio_stream_index(video.local_path)
        rendered = []

        for index in range(segment_total):
            start = index * segment_seconds
            if start >= source_duration:
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
                segment_duration=float(min(segment_seconds, source_duration - start)),
            )
            audio_path = None
            if config_bool(self.config, "telegram_force_tamil_audio", False):
                if tamil_audio_stream is not None:
                    audio_path = self._extract_tamil_audio_segment(segment_video, tamil_audio_stream)
                if not audio_path:
                    if not tamil_audio:
                        tamil_audio = await self.audio_factory.build_audio(video)
                    audio_path, tamil_script = tamil_audio

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
            rendered.append((segment_video, final_path, audio_path, tamil_script))

        logger.info("Rendered %s Telegram Shorts from %s.", len(rendered), video.source_id)
        return rendered

    def _tamil_audio_stream_index(self, video_path: str) -> Optional[int]:
        if not config_bool(self.config, "telegram_prefer_tamil_audio_track", False):
            return None
        try:
            result = subprocess.run(
                [
                    "ffprobe",
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
                check=True,
                capture_output=True,
                text=True,
            )
            streams = json.loads(result.stdout or "{}").get("streams", [])
        except Exception as exc:
            logger.warning("Could not inspect audio streams for %s: %s", video_path, exc)
            return None

        fallback = None
        for position, stream in enumerate(streams):
            tags = {str(key).lower(): str(value).lower() for key, value in (stream.get("tags") or {}).items()}
            language = tags.get("language", "").strip()
            title = tags.get("title", "").strip()
            if fallback is None:
                fallback = position
            if language in {"ta", "tam", "tamil"} or "tamil" in title:
                logger.info("Using Tamil audio stream %s for %s", position, video_path)
                return position
        if len(streams) > 1:
            logger.info("No Tamil-labelled audio stream found in %s; generated Tamil audio will be used.", video_path)
        return None

    def _extract_tamil_audio_segment(self, video: TelegramVideo, stream_index: int) -> Optional[str]:
        audio_dir = Path(self.config.get("tamil_audio_dir", "outputs/telegram_tamil_audio"))
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_path = audio_dir / f"{self._safe_id(video.source_id)}_track{stream_index}.m4a"
        try:
            subprocess.run(
                [
                    "ffmpeg",
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
    ) -> Optional[dict]:
        try:
            return await self._maybe_upload(video, final_path, tamil_script, metadata)
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
            or "unauthorized" in text and "oauth" in text
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
    ) -> Optional[dict]:
        mode = str(self.config.get("telegram_mode", self.config.get("mode", "dry_run"))).lower()
        if mode in {"dry_run", "dry-run"}:
            logger.info("DRY RUN - rendered %s but did not upload.", final_path)
            return None

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
    }
    for key, value in env_overrides.items():
        if value not in (None, ""):
            existing_value = config.get(key)
            if existing_value in (None, "", []):
                config[key] = value
    return config


async def main():
    parser = argparse.ArgumentParser(description="Download Telegram videos, replace audio with Tamil, upload as Shorts.")
    parser.add_argument("--once", action="store_true", help="Run one fetch/render/upload cycle.")
    parser.parse_args()

    await TelegramTamilShortsPipeline(load_config()).run_once()


if __name__ == "__main__":
    asyncio.run(main())
