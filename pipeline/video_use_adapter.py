"""video_use_adapter.py - Adapter connecting video-use-main helpers into pipelines.

Provides unified, production-grade video post-processing, color grading,
audio fade, HDR tone mapping, subtitle burning, and transcription for both:
1. GhostPipe v5.1 Pipeline (ghostpipe_v5_1_pipeline.py)
2. Telegram Tamil Shorts Pipeline (telegram_tamil_shorts_pipeline.py)
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("video_use_adapter")

# Add video-use-main/helpers to sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_HELPERS_DIR = _PROJECT_ROOT / "video-use-main" / "helpers"
if str(_HELPERS_DIR) not in sys.path and _HELPERS_DIR.exists():
    sys.path.insert(0, str(_HELPERS_DIR))

# Import video-use helpers
try:
    import grade
except ImportError:
    grade = None  # type: ignore
    logger.warning("video-use grade module could not be imported")

try:
    import render
except ImportError:
    render = None  # type: ignore
    logger.warning("video-use render module could not be imported")

try:
    import transcribe
except ImportError:
    transcribe = None  # type: ignore
    logger.warning("video-use transcribe module could not be imported")

try:
    import pack_transcripts
except ImportError:
    pack_transcripts = None  # type: ignore
    logger.warning("video-use pack_transcripts module could not be imported")


# Standard Shorts Subtitle Style (libass safe-zone: MarginV=90 clears bottom UI)
SHORTS_SUBTITLE_STYLE = (
    "FontName=Helvetica,FontSize=18,Bold=1,"
    "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H00000000,"
    "BorderStyle=1,Outline=2,Shadow=0,"
    "Alignment=2,MarginV=90"
)

# Tamil Subtitle Style with suitable Tamil font fallback
TAMIL_SUBTITLE_STYLE = (
    "FontName=Noto Sans Tamil,FontSize=18,Bold=1,"
    "PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BackColour=&H00000000,"
    "BorderStyle=1,Outline=2,Shadow=0,"
    "Alignment=2,MarginV=95"
)


def get_ffmpeg_binary() -> str:
    """Find a functional ffmpeg binary."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg and os.path.exists(ffmpeg):
        return ffmpeg
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            return ffmpeg_exe
    except Exception:
        pass
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


def probe_duration(video_path: Union[str, Path]) -> float:
    """Get duration of a media file in seconds using ffprobe."""
    probe_bin = get_ffprobe_binary()
    cmd = [
        probe_bin, "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip()
        return float(out)
    except Exception:
        return 0.0


def is_hdr_source(video_path: Union[str, Path]) -> bool:
    """Return True if source uses PQ or HLG transfer function (needs SDR tonemapping)."""
    if render and hasattr(render, "is_hdr_source"):
        try:
            return bool(render.is_hdr_source(Path(video_path)))
        except Exception:
            pass

    probe_bin = get_ffprobe_binary()
    try:
        out = subprocess.run(
            [probe_bin, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=color_transfer",
             "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip() in {"smpte2084", "arib-std-b67"}
    except Exception:
        return False


def get_hdr_tonemap_chain() -> str:
    """Return ffmpeg zscale+tonemap filter chain to convert HDR to clean Rec.709 SDR."""
    if render and hasattr(render, "TONEMAP_CHAIN"):
        return render.TONEMAP_CHAIN
    return (
        "zscale=t=linear:npl=100,"
        "format=gbrpf32le,"
        "zscale=p=bt709,"
        "tonemap=tonemap=hable:desat=0,"
        "zscale=t=bt709:m=bt709:r=tv,"
        "format=yuv420p"
    )


def get_color_grade_filter(
    video_path: Union[str, Path],
    preset: str = "auto",
    start: float = 0.0,
    duration: Optional[float] = None,
) -> Tuple[str, dict]:
    """Get color grade ffmpeg filter string.
    
    Modes:
      - 'auto': Mathematical analysis of video frame brightness/contrast/saturation (bounded ±8%)
      - 'warm_cinematic': Preset with +12% contrast, warm shadows, cool highlights
      - 'neutral_punch': Preset with light contrast boost + S-curve
      - 'subtle': Preset with barely perceptible cleanup
      - 'none' or '': No grading
    """
    preset_lower = (preset or "auto").lower().strip()
    if preset_lower in ("none", "off", "disabled", "false"):
        return "", {}

    if grade:
        if preset_lower in ("auto", "__auto__"):
            try:
                filter_str, stats = grade.auto_grade_for_clip(
                    Path(video_path),
                    start=start,
                    duration=duration,
                    verbose=False,
                )
                return filter_str, stats
            except Exception as e:
                logger.warning("auto_grade_for_clip failed: %s, falling back to subtle preset", e)
                return grade.PRESETS.get("subtle", ""), {}
        if preset_lower in grade.PRESETS:
            return grade.get_preset(preset_lower), {}

    # If raw filter string was provided
    if "=" in preset:
        return preset, {}

    return "eq=contrast=1.03:saturation=0.98", {}


def format_srt_timestamp(seconds: float) -> str:
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    seconds = max(0.0, seconds)
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        secs += 1
        millis -= 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"


def generate_srt_from_text(
    text: str,
    total_duration: float,
    max_words_per_segment: int = 4,
) -> str:
    """Generate SRT formatted captions evenly distributed over the video duration."""
    clean_text = re.sub(r"\s+", " ", text).strip()
    if not clean_text:
        return ""

    words = clean_text.split()
    if not words:
        return ""

    chunks: List[str] = []
    current: List[str] = []
    for w in words:
        current.append(w)
        if len(current) >= max_words_per_segment or w.endswith((".", "!", "?", ",", ";", ":")):
            chunks.append(" ".join(current))
            current = []
    if current:
        chunks.append(" ".join(current))

    if not chunks:
        return ""

    total_duration = max(float(total_duration), 1.0)
    chunk_dur = total_duration / len(chunks)

    srt_lines: List[str] = []
    for i, chunk in enumerate(chunks):
        st = i * chunk_dur
        et = min(total_duration, (i + 1) * chunk_dur)
        srt_lines.append(str(i + 1))
        srt_lines.append(f"{format_srt_timestamp(st)} --> {format_srt_timestamp(et)}")
        srt_lines.append(chunk)
        srt_lines.append("")

    return "\n".join(srt_lines)


def generate_srt_from_words(
    words: List[dict],
    max_words_per_segment: int = 4,
) -> str:
    """Generate SRT captions from word-level timestamps (e.g. from ElevenLabs Scribe).
    
    Each word is a dict: {'text': '...', 'start': float, 'end': float}
    """
    valid_words = [
        w for w in words
        if w.get("text") and "start" in w and "end" in w
    ]
    if not valid_words:
        return ""

    chunks: List[List[dict]] = []
    current: List[dict] = []
    for w in valid_words:
        current.append(w)
        if len(current) >= max_words_per_segment or (w.get("text") or "").endswith((".", "!", "?")):
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)

    srt_lines: List[str] = []
    for i, chunk in enumerate(chunks):
        st = float(chunk[0]["start"])
        et = float(chunk[-1]["end"])
        text = " ".join(w["text"].strip() for w in chunk)
        srt_lines.append(str(i + 1))
        srt_lines.append(f"{format_srt_timestamp(st)} --> {format_srt_timestamp(et)}")
        srt_lines.append(text)
        srt_lines.append("")

    return "\n".join(srt_lines)


def escape_ffmpeg_path(path: Union[str, Path]) -> str:
    """Escape path for ffmpeg subtitles filter on Windows/POSIX."""
    p = str(Path(path).resolve())
    # In ffmpeg filter syntax, colons and backslashes must be escaped
    # e.g., C\:/Users/...
    p = p.replace("\\", "/")
    p = p.replace(":", r"\:")
    p = p.replace("'", r"\'")
    return p


def apply_post_processing(
    video_path: Union[str, Path],
    output_path: Union[str, Path],
    grade_preset: str = "auto",
    fade_ms: int = 30,
    tonemap_hdr: bool = True,
    srt_path: Optional[Union[str, Path]] = None,
    subtitle_style: Optional[str] = None,
    quality_crf: int = 18,
) -> str:
    """Apply unified post-processing pipeline via FFmpeg:
      1. HDR -> SDR tonemapping (if detected)
      2. Color grading (auto analysis or preset)
      3. Subtitle burning (MarginV=90 safe zone)
      4. 30ms audio fade-in and fade-out to eliminate edge clicks/pops
    """
    in_p = Path(video_path)
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    if not in_p.exists():
        raise FileNotFoundError(f"Input video not found: {in_p}")

    ffmpeg_bin = get_ffmpeg_binary()
    dur = probe_duration(in_p)

    # 1. Video Filter Graph
    vf_chain: List[str] = []

    # HDR tonemapping
    if tonemap_hdr and is_hdr_source(in_p):
        logger.info("HDR source detected for %s; applying SDR tone mapping", in_p.name)
        vf_chain.append(get_hdr_tonemap_chain())

    # Color grading
    if grade_preset and grade_preset.lower() not in ("none", "off", "disabled", "false"):
        grade_filter, stats = get_color_grade_filter(in_p, preset=grade_preset, start=0.0, duration=dur)
        if grade_filter:
            logger.info("Applying color grade filter [%s] to %s", grade_filter, in_p.name)
            vf_chain.append(grade_filter)

    # Subtitles (must be LAST in the video filter chain)
    if srt_path and Path(srt_path).exists() and Path(srt_path).stat().st_size > 0:
        escaped_srt = escape_ffmpeg_path(srt_path)
        style = subtitle_style or SHORTS_SUBTITLE_STYLE
        vf_chain.append(f"subtitles='{escaped_srt}':force_style='{style}'")
        logger.info("Burning subtitles onto %s using style: %s", in_p.name, style)

    # 2. Audio Filter Graph
    af_chain: List[str] = []
    if fade_ms > 0 and dur > 0.1:
        fade_s = fade_ms / 1000.0
        fade_out_st = max(0.0, dur - fade_s)
        af_chain.append(f"afade=t=in:st=0:d={fade_s:.3f}")
        af_chain.append(f"afade=t=out:st={fade_out_st:.3f}:d={fade_s:.3f}")

    # Build FFmpeg command
    cmd: List[str] = [ffmpeg_bin, "-y", "-i", str(in_p)]

    if vf_chain:
        cmd.extend(["-vf", ",".join(vf_chain)])
        cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", str(quality_crf), "-pix_fmt", "yuv420p"])
    else:
        cmd.extend(["-c:v", "copy"])

    if af_chain:
        cmd.extend(["-af", ",".join(af_chain)])
        cmd.extend(["-c:a", "aac", "-b:a", "192k", "-ar", "48000"])
    else:
        cmd.extend(["-c:a", "copy"])

    cmd.extend(["-movflags", "+faststart", str(out_p)])

    logger.info("Running video-use post processing -> %s", out_p.name)
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        logger.warning("Post-processing failed with FFmpeg error:\n%s\nFalling back to copying original", res.stderr)
        shutil.copy2(str(in_p), str(out_p))

    return str(out_p)


def apply_audio_fades(
    video_path: Union[str, Path],
    output_path: Union[str, Path],
    fade_ms: int = 30,
) -> str:
    """Apply 30ms audio fade-in and fade-out to prevent pop/click artifacts."""
    return apply_post_processing(
        video_path=video_path,
        output_path=output_path,
        grade_preset="none",
        fade_ms=fade_ms,
        tonemap_hdr=False,
    )


def burn_subtitles(
    video_path: Union[str, Path],
    srt_path: Union[str, Path],
    output_path: Union[str, Path],
    force_style: Optional[str] = None,
) -> str:
    """Burn subtitles directly into video with Shorts-safe vertical margins."""
    return apply_post_processing(
        video_path=video_path,
        output_path=output_path,
        grade_preset="none",
        fade_ms=0,
        tonemap_hdr=False,
        srt_path=srt_path,
        subtitle_style=force_style or SHORTS_SUBTITLE_STYLE,
    )


def get_elevenlabs_key() -> str:
    """Retrieve ElevenLabs API key from env or .env file."""
    for key in ("ELEVENLABS_API_KEY", "ELEVEN_API_KEY", "XI_API_KEY"):
        if os.environ.get(key):
            return os.environ[key]

    for env_file in [
        _PROJECT_ROOT / ".env",
        _HELPERS_DIR.parent / ".env",
        Path(".env"),
    ]:
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                if k in ("ELEVENLABS_API_KEY", "ELEVEN_API_KEY", "XI_API_KEY"):
                    val = v.strip().strip('"').strip("'")
                    if val:
                        os.environ["ELEVENLABS_API_KEY"] = val
                        return val
    return ""


def transcribe_with_scribe(
    video_path: Union[str, Path],
    edit_dir: Optional[Union[str, Path]] = None,
    language: Optional[str] = None,
    num_speakers: Optional[int] = None,
) -> Optional[dict]:
    """Transcribe a video using ElevenLabs Scribe API (word-level timestamps)."""
    api_key = get_elevenlabs_key()
    if not api_key:
        logger.warning("No ElevenLabs API key found for Scribe transcription")
        return None

    in_video = Path(video_path)
    if not in_video.exists():
        return None

    target_edit_dir = Path(edit_dir) if edit_dir else in_video.parent / "edit"
    target_edit_dir.mkdir(parents=True, exist_ok=True)

    try:
        if transcribe and hasattr(transcribe, "transcribe_one"):
            res_path = transcribe.transcribe_one(
                video=in_video,
                edit_dir=target_edit_dir,
                api_key=api_key,
                language=language,
                num_speakers=num_speakers,
                verbose=False,
            )
            if res_path and res_path.exists():
                return json.loads(res_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Scribe transcription failed: %s", exc)

    return None


def pack_transcript_markdown(edit_dir: Union[str, Path]) -> str:
    """Generate phrase-level packed markdown transcript for LLM analysis."""
    p_edit = Path(edit_dir)
    transcripts_dir = p_edit / "transcripts"
    if not transcripts_dir.exists():
        return ""

    if pack_transcripts and hasattr(pack_transcripts, "group_into_phrases"):
        try:
            json_files = list(transcripts_dir.glob("*.json"))
            if not json_files:
                return ""
            all_lines: List[str] = []
            for jf in json_files:
                data = json.loads(jf.read_text(encoding="utf-8"))
                words = data.get("words", [])
                phrases = pack_transcripts.group_into_phrases(words)
                all_lines.append(f"## {jf.stem}\n")
                for p in phrases:
                    st = p.get("start", 0.0)
                    et = p.get("end", 0.0)
                    all_lines.append(f"[{st:06.2f} - {et:06.2f}] {p.get('text', '')}")
                all_lines.append("")
            content = "\n".join(all_lines)
            out_file = p_edit / "takes_packed.md"
            out_file.write_text(content, encoding="utf-8")
            return content
        except Exception as exc:
            logger.warning("Packing transcripts failed: %s", exc)

    return ""


# Re-export Multi-Audio Inspector & Language Tools
try:
    from video_audio_tools import (
        get_video_audio_info,
        identify_audio_language,
        swap_video_audio,
        inspect_and_resolve_audio_tracks,
        select_and_swap_audio,
    )
except ImportError:
    try:
        from pipeline.video_audio_tools import (
            get_video_audio_info,
            identify_audio_language,
            swap_video_audio,
            inspect_and_resolve_audio_tracks,
            select_and_swap_audio,
        )
    except ImportError:
        pass

