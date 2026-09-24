"""video_audio_tools.py - Production-Ready Multi-Audio Track Inspector & Processor

Enhancement A: faster-whisper (CTranslate2 int8) for up to 4x faster language detection.
Enhancement B: Robust FFmpeg/FFprobe with timeout protection, error handling & loudnorm audio normalization.
Enhancement C: Audio preview generation (15s MP3) for user verification before heavy processing.
Enhancement D: Async background task queue so video remuxing never blocks chat/agent threads.
Enhancement E: Smart dialect resolution (e.g. Spanish es vs es-419).
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

PROJECT_ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".cache" / "huggingface"))
os.environ.setdefault("TORCH_HOME", str(PROJECT_ROOT / ".cache" / "torch"))
logger = logging.getLogger("video_audio_tools")

# Lazy-loaded singleton faster-whisper model
_faster_whisper_model = None


def get_ffmpeg_binary() -> str:
    """Find a functional ffmpeg binary."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg and os.path.exists(ffmpeg):
        return ffmpeg
    for path in [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"),
        os.path.expanduser(r"~\scoop\shims\ffmpeg.exe"),
    ]:
        if os.path.exists(path):
            return path
    return "ffmpeg"


def get_ffprobe_binary() -> str:
    """Find a functional ffprobe binary."""
    probe = shutil.which("ffprobe")
    if probe and os.path.exists(probe):
        return probe
    ffmpeg_bin = get_ffmpeg_binary()
    if ffmpeg_bin and ffmpeg_bin != "ffmpeg":
        probe_name = "ffprobe.exe" if os.name == "nt" else "ffprobe"
        candidate = os.path.join(os.path.dirname(ffmpeg_bin), probe_name)
        if os.path.exists(candidate):
            return candidate
    return "ffprobe"


def get_whisper_model(model_size: str = "base", device: str = "cpu", compute_type: str = "int8"):
    """Initialize and cache faster-whisper model globally to save memory and load time."""
    global _faster_whisper_model
    if _faster_whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info(f"Loading faster-whisper model ('{model_size}', device={device}, compute_type={compute_type})...")
            _faster_whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
            logger.info("faster-whisper (CTranslate2) loaded successfully.")
        except Exception as exc:
            logger.warning(f"Could not load faster-whisper: {exc}. Falling back to standard Whisper.")
            try:
                import whisper
                _faster_whisper_model = whisper.load_model(model_size)
            except Exception as e2:
                logger.error(f"Both faster-whisper and standard whisper failed to load: {e2}")
                _faster_whisper_model = None
    return _faster_whisper_model


# Comprehensive ISO-639-1 / ISO-639-2 & Dialect Map
LANGUAGE_NAMES: Dict[str, str] = {
    "ta": "Tamil",
    "tam": "Tamil",
    "en": "English",
    "eng": "English",
    "es": "Spanish (Castilian)",
    "spa": "Spanish",
    "es-419": "Spanish (Latin America)",
    "hi": "Hindi",
    "hin": "Hindi",
    "fr": "French",
    "fra": "French",
    "fre": "French",
    "de": "German",
    "deu": "German",
    "ger": "German",
    "ja": "Japanese",
    "jpn": "Japanese",
    "ko": "Korean",
    "kor": "Korean",
    "zh": "Chinese",
    "zho": "Chinese",
    "chi": "Chinese",
    "zh-hans": "Chinese (Simplified)",
    "zh-hant": "Chinese (Traditional)",
    "te": "Telugu",
    "tel": "Telugu",
    "ml": "Malayalam",
    "mal": "Malayalam",
    "kn": "Kannada",
    "kan": "Kannada",
    "pt": "Portuguese",
    "por": "Portuguese",
    "pt-br": "Portuguese (Brazil)",
    "ru": "Russian",
    "rus": "Russian",
    "it": "Italian",
    "ita": "Italian",
    "ar": "Arabic",
    "ara": "Arabic",
    "tr": "Turkish",
    "tur": "Turkish",
}


# ============================================================================
# Tool 1: Robust Video Inspector with Timeout Protection
# ============================================================================

def inspect_video_tracks(video_path: Union[str, Path], timeout_seconds: int = 30) -> dict:
    """Robustly extracts audio track metadata with timeout protection.
    
    Prevents agent from hanging on corrupted or slow files.
    """
    vpath = str(video_path)
    if not os.path.exists(vpath):
        return {"status": "error", "message": f"File not found: {vpath}"}

    probe_bin = get_ffprobe_binary()
    command = [
        probe_bin, '-v', 'quiet', '-print_format', 'json', 
        '-show_streams', '-select_streams', 'a', vpath
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout_seconds)
        result.check_returncode()
        
        streams = json.loads(result.stdout).get('streams', [])
        tracks = []
        for i, stream in enumerate(streams):
            tags = stream.get('tags', {}) or {}
            raw_lang = tags.get('language', 'und')
            title = tags.get('title', f'Track {i+1}')
            
            clean_lang = raw_lang.lower().strip()
            friendly_name = LANGUAGE_NAMES.get(clean_lang, clean_lang.capitalize() if clean_lang != 'und' else 'Undefined')

            tracks.append({
                "index": i,
                "stream_index": stream.get('index', i),
                "codec": stream.get('codec_name', 'unknown'),
                "channels": stream.get('channels', 0),
                "sample_rate": stream.get('sample_rate', 'unknown'),
                "language": clean_lang,
                "language_name": friendly_name,
                "title": title
            })
        return {
            "status": "success",
            "video_path": vpath,
            "track_count": len(tracks),
            "tracks": tracks
        }
    except subprocess.TimeoutExpired:
        logger.error(f"FFprobe timed out after {timeout_seconds}s for {vpath}")
        return {"status": "error", "message": f"FFprobe timed out after {timeout_seconds}s. File may be corrupted."}
    except subprocess.CalledProcessError as exc:
        return {"status": "error", "message": f"FFprobe error: {exc.stderr or str(exc)}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Backward compatibility alias
def get_video_audio_info(video_path: str) -> dict:
    """Agent tool to find all audio tracks and their metadata."""
    res = inspect_video_tracks(video_path)
    if res.get("status") == "success":
        return {"audio_tracks": res.get("tracks", [])}
    return {"audio_tracks": []}


# ============================================================================
# Tool 2: Fast AI Language Identification (faster-whisper CTranslate2)
# ============================================================================

def ai_detect_language(
    video_path: Union[str, Path],
    track_index: int,
    snippet_duration: int = 15,
    timeout_seconds: int = 30
) -> dict:
    """Extracts 15s of audio and detects language using faster-whisper.
    
    Returns structured status, language code, friendly name, and confidence percentage.
    """
    vpath = str(video_path)
    if not os.path.exists(vpath):
        return {"status": "error", "message": f"File not found: {vpath}"}

    with tempfile.NamedTemporaryFile(suffix=f"_track{track_index}.wav", delete=False) as tmp:
        temp_wav = tmp.name

    ffmpeg_bin = get_ffmpeg_binary()
    try:
        # Extract just 15 seconds to dramatically speed up AI detection (skip 5s intro)
        cmd = [
            ffmpeg_bin, '-y',
            '-ss', '5',
            '-i', vpath,
            '-map', f'0:a:{track_index}',
            '-t', str(snippet_duration),
            '-ar', '16000', '-ac', '1',
            '-loglevel', 'error',
            temp_wav
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
        if res.returncode != 0:
            # Fall back to starting from 0s if file is shorter than 5 seconds
            cmd[3] = '0'
            subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)

        if not os.path.exists(temp_wav) or os.path.getsize(temp_wav) < 1000:
            return {"status": "error", "message": f"Failed to extract audio track {track_index} or track is silent."}

        # Detect language with faster-whisper (or fallback)
        model = get_whisper_model()
        if model is None:
            return {"status": "error", "message": "No Whisper model available."}

        # faster-whisper API check
        if hasattr(model, "transcribe"):
            try:
                # faster-whisper
                segments, info = model.transcribe(temp_wav, language=None)
                detected_lang = info.language
                confidence = info.language_probability
            except (TypeError, ValueError):
                # standard OpenAI whisper
                audio = model.load_audio(temp_wav) if hasattr(model, "load_audio") else None
                import whisper
                audio = whisper.load_audio(temp_wav)
                audio = whisper.pad_or_trim(audio)
                mel = whisper.log_mel_spectrogram(audio).to(model.device)
                _, probs = model.detect_language(mel)
                detected_lang = max(probs, key=probs.get)
                confidence = probs[detected_lang]
        else:
            return {"status": "error", "message": "Incompatible whisper model interface."}

        friendly = LANGUAGE_NAMES.get(detected_lang.lower(), detected_lang.capitalize())

        return {
            "status": "success",
            "track_index": track_index,
            "language_code": detected_lang,
            "language_name": friendly,
            "confidence": round(float(confidence) * 100, 2)
        }
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": f"FFmpeg extraction timed out ({timeout_seconds}s)."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except Exception:
                pass


# Backward compatibility alias
def identify_audio_language(video_path: str, track_index: int = 0) -> str:
    """Agent tool to identify language code of an audio track."""
    res = ai_detect_language(video_path, track_index)
    if res.get("status") == "success":
        return res.get("language_code", "unknown")
    return "unknown"


# ============================================================================
# Tool 3: Audio Preview Generator (15-Second Audio Sample)
# ============================================================================

def extract_audio_preview(
    video_path: Union[str, Path],
    track_index: int,
    duration: int = 15,
    output_dir: Union[str, Path] = "outputs/previews",
    timeout_seconds: int = 30
) -> dict:
    """Extracts a 15-second normalized MP3 snippet for the user to listen to before committing.
    
    Applies mild normalization so commentary or quiet tracks are easily audible.
    """
    vpath = str(video_path)
    if not os.path.exists(vpath):
        return {"status": "error", "message": f"File not found: {vpath}"}

    out_d = Path(output_dir)
    out_d.mkdir(parents=True, exist_ok=True)
    
    preview_file = out_d / f"{Path(vpath).stem}_preview_track{track_index}.mp3"
    ffmpeg_bin = get_ffmpeg_binary()

    cmd = [
        ffmpeg_bin, '-y',
        '-ss', '10', # Skip silent intro
        '-i', vpath,
        '-map', f'0:a:{track_index}',
        '-t', str(duration),
        '-c:a', 'libmp3lame', '-b:a', '128k',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        str(preview_file)
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
        if res.returncode != 0:
            # Retry from start if video is short
            cmd[3] = '0'
            subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)

        if preview_file.exists() and preview_file.stat().st_size > 0:
            return {
                "status": "success",
                "preview_path": str(preview_file),
                "track_index": track_index,
                "duration_seconds": duration,
                "size_bytes": preview_file.stat().st_size
            }
        return {"status": "error", "message": "Failed to create audio preview"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "Preview extraction timed out."}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


# ============================================================================
# Tool 4: Fast Video Audio Swapper with Optional Broadcast Loudnorm
# ============================================================================

def swap_video_audio(
    video_path: Union[str, Path],
    target_track_index: int,
    output_path: Union[str, Path],
    normalize_audio: bool = False,
    timeout_seconds: int = 3600
) -> dict:
    """Agent tool to create a new video with the selected audio track.
    
    Modes:
      - normalize_audio=False (DEFAULT): Ultra-fast lossless stream copy (-c copy). No re-encoding.
      - normalize_audio=True: Re-encodes audio to AAC with -af loudnorm=I=-16:TP=-1.5:LRA=11
        for standard broadcast volume levels.
    """
    vpath = str(video_path)
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin = get_ffmpeg_binary()

    if normalize_audio:
        # Re-encode audio with EBU R128 / ITU-R BS.1770 broadcast normalization
        command = [
            ffmpeg_bin, '-y', '-i', vpath,
            '-map', '0:v:0',
            '-map', f'0:a:{target_track_index}',
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '192k',
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
            '-movflags', '+faststart',
            str(out_p)
        ]
    else:
        # Lossless stream copy (incredibly fast)
        command = [
            ffmpeg_bin, '-y', '-i', vpath,
            '-map', '0:v:0',
            '-map', f'0:a:{target_track_index}',
            '-c', 'copy',
            '-movflags', '+faststart',
            str(out_p)
        ]

    try:
        res = subprocess.run(command, capture_output=True, text=True, timeout=timeout_seconds)
        if res.returncode != 0:
            logger.error(f"FFmpeg swap error: {res.stderr}")
            return {"status": "error", "message": f"FFmpeg error: {res.stderr[:300]}"}

        if out_p.exists() and out_p.stat().st_size > 0:
            return {
                "status": "success",
                "output_path": str(out_p),
                "target_track_index": target_track_index,
                "normalized": normalize_audio,
                "size_bytes": out_p.stat().st_size
            }
        return {"status": "error", "message": "Output file not created"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": f"FFmpeg swap process timed out ({timeout_seconds}s)"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


# ============================================================================
# Dialect Resolution & Fuzzy Matching
# ============================================================================

DIALECT_CLUSTERS = {
    "spanish": ["es", "spa", "es-419", "es-es", "es-mx"],
    "english": ["en", "eng", "en-us", "en-gb", "en-au"],
    "chinese": ["zh", "zho", "chi", "zh-hans", "zh-hant", "zh-cn", "zh-tw"],
    "portuguese": ["pt", "por", "pt-br", "pt-pt"],
    "tamil": ["ta", "tam"],
    "hindi": ["hi", "hin"],
    "french": ["fr", "fra", "fre", "fr-ca"],
}


def resolve_matching_tracks(tracks: List[dict], user_query: str) -> List[dict]:
    """Finds matching tracks and checks if multiple dialects exist."""
    q = user_query.lower().strip()
    matches = []

    # 1. Direct code or name match
    for t in tracks:
        code = t.get("language", "").lower()
        name = t.get("language_name", "").lower()
        title = t.get("title", "").lower()
        if q == code or q in name.lower() or q in title.lower():
            matches.append(t)

    # 2. Cluster check if no direct match
    if not matches:
        for family, codes in DIALECT_CLUSTERS.items():
            if q == family or q in family:
                for t in tracks:
                    if t.get("language", "").lower() in codes:
                        matches.append(t)

    return matches


# ============================================================================
# Enhancement C: Asynchronous Task Queue (Non-Blocking Worker)
# ============================================================================

class VideoTaskQueue:
    """In-memory async background worker queue for heavy video remuxing jobs.
    
    Prevents long FFmpeg renders from blocking interactive agent chats or UI servers.
    """
    def __init__(self, max_workers: int = 2):
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        self.tasks: Dict[str, dict] = {}

    def submit_swap_task(
        self,
        video_path: str,
        target_track_index: int,
        output_path: str,
        normalize_audio: bool = False
    ) -> str:
        task_id = str(uuid.uuid4())[:8]
        self.tasks[task_id] = {
            "task_id": task_id,
            "status": "queued",
            "video_path": video_path,
            "target_track": target_track_index,
            "output_path": output_path,
            "created_at": time.time(),
            "completed_at": None,
            "error": None,
        }

        def _worker():
            self.tasks[task_id]["status"] = "processing"
            try:
                res = swap_video_audio(
                    video_path=video_path,
                    target_track_index=target_track_index,
                    output_path=output_path,
                    normalize_audio=normalize_audio
                )
                if res.get("status") == "success":
                    self.tasks[task_id]["status"] = "completed"
                    self.tasks[task_id]["result"] = res
                else:
                    self.tasks[task_id]["status"] = "failed"
                    self.tasks[task_id]["error"] = res.get("message")
            except Exception as e:
                self.tasks[task_id]["status"] = "failed"
                self.tasks[task_id]["error"] = str(e)
            finally:
                self.tasks[task_id]["completed_at"] = time.time()

        self.executor.submit(_worker)
        return task_id

    def get_status(self, task_id: str) -> Optional[dict]:
        return self.tasks.get(task_id)


# Global instance of task queue
global_video_queue = VideoTaskQueue()


# ============================================================================
# CLI Commands
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description="Production-Ready Video Audio Track Inspector & Swapper")
    subparsers = parser.add_subparsers(dest="action", help="Action to perform")

    # inspect
    p_inspect = subparsers.add_parser("inspect", help="Inspect all audio tracks with timeout protection")
    p_inspect.add_argument("video", help="Video file path")

    # ai-detect
    p_detect = subparsers.add_parser("ai-detect", help="AI language detection with faster-whisper")
    p_detect.add_argument("video", help="Video file path")
    p_detect.add_argument("--track", type=int, default=0, help="Track index")

    # preview
    p_preview = subparsers.add_parser("preview", help="Generate 15s MP3 preview for listening")
    p_preview.add_argument("video", help="Video file path")
    p_preview.add_argument("--track", type=int, default=0, help="Track index")

    # swap
    p_swap = subparsers.add_parser("swap", help="Swap audio track")
    p_swap.add_argument("video", help="Video file path")
    p_swap.add_argument("track", type=int, help="Track index to keep")
    p_swap.add_argument("-o", "--output", required=True, help="Output file path")
    p_swap.add_argument("--loudnorm", action="store_true", help="Apply broadcast loudnorm normalization (-16 LUFS)")

    args = parser.parse_args()

    if args.action == "inspect":
        info = inspect_video_tracks(args.video)
        print(json.dumps(info, indent=2))
    elif args.action == "ai-detect":
        res = ai_detect_language(args.video, args.track)
        print(json.dumps(res, indent=2))
    elif args.action == "preview":
        res = extract_audio_preview(args.video, args.track)
        print(json.dumps(res, indent=2))
    elif args.action == "swap":
        res = swap_video_audio(args.video, args.track, args.output, normalize_audio=args.loudnorm)
        print(json.dumps(res, indent=2))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
