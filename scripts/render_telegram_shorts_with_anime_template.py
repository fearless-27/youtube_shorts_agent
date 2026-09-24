"""
render_telegram_shorts_with_anime_template.py
Multi-Template Renderer for Telegram Tamil Shorts
Supports all 4 visual templates via TelegramTemplateEngine:
1. anime_multi_tier (Pro Anime Sky + Brand Bar + Clip + Character Art)
2. cinematic_ambient (Full Ambient Blur + Floating Clip + Glassmorphism Badge)
3. split_screen (Top Episode Video + Center Neon Ticker + Bottom Visualizer)
4. sleek_dark (Minimalist Studio Dark Matte + Glowing Ring + Bold Action Card)
"""

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.telegram_template_engine import TelegramTemplateEngine, TEMPLATES_META

TELEGRAM_DIR = ROOT / "downloads" / "telegram"
OUTPUTS_DIR = ROOT / "outputs"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
APPROVAL_QUEUE_PATH = ROOT / "public" / "data" / "approval_queue.json"
RECREATED_MEDIA_PATH = ROOT / "public" / "data" / "recreated_media.json"

TELEGRAM_CLIPS = [
    # Episode 934
    {"part": 1, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 105, "duration": 26, "filename": "short_telegram_shinchan_part01_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - Funny Slide Scene Part 1"},
    {"part": 2, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 235, "duration": 28, "filename": "short_telegram_shinchan_part02_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - School Trouble Part 2"},
    {"part": 3, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 365, "duration": 27, "filename": "short_telegram_shinchan_part03_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - Mom vs Shinchan Part 3"},
    {"part": 4, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 495, "duration": 26, "filename": "short_telegram_shinchan_part04_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - Action Mask Hero Part 4"},
    {"part": 5, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 625, "duration": 29, "filename": "short_telegram_shinchan_part05_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - Hilarious Lunch Part 5"},
    # Episode 942
    {"part": 6, "source": TELEGRAM_DIR / "shinchantamil_942.mkv", "start": 98, "duration": 27, "filename": "short_telegram_shinchan_part06_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S26 Episode 942 - Park Adventure Part 6"},
    {"part": 7, "source": TELEGRAM_DIR / "shinchantamil_942.mkv", "start": 225, "duration": 28, "filename": "short_telegram_shinchan_part07_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S26 Episode 942 - Shiro Dog Walk Part 7"},
    {"part": 8, "source": TELEGRAM_DIR / "shinchantamil_942.mkv", "start": 355, "duration": 26, "filename": "short_telegram_shinchan_part08_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S26 Episode 942 - Toy Store Chaos Part 8"},
    {"part": 9, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 1010, "duration": 28, "filename": "short_telegram_shinchan_part09_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - Evening Comedy Part 9"},
    {"part": 10, "source": TELEGRAM_DIR / "shinchantamil_934.mkv", "start": 1140, "duration": 27, "filename": "short_telegram_shinchan_part10_{tid}.mp4", "audio_stream": "0:2", "title": "Shinchan Tamil S25 Episode 934 - Epic Ending Scene Part 10"},
]


def load_user_config(user_id: Optional[str] = None) -> dict:
    candidates = []
    if user_id:
        candidates.append(ROOT / "public" / "data" / "users" / user_id / "config.json")
    candidates.extend([
        ROOT / "public" / "data" / "users" / "ZUXh4wwtSYNp7VZv9IYtdEWMI6q2" / "config.json",
        ROOT / "config" / "telegram_tamil_shorts.json",
    ])
    for p in candidates:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8-sig") as f:
                    return json.load(f)
            except Exception:
                pass
    return {}


def register_in_approval_queue(clip_info: dict, out_path: Path, template_meta: dict):
    """Registers the newly rendered short into approval queue and media library."""
    try:
        rel_path = f"outputs/{out_path.name}"
        pub_url = f"/outputs/{out_path.name}"

        queue = []
        if APPROVAL_QUEUE_PATH.exists():
            with open(APPROVAL_QUEUE_PATH, "r", encoding="utf-8-sig") as f:
                queue = json.load(f)

        item = {
            "title": clip_info.get("title", f"Shinchan Tamil Part {clip_info['part']}"),
            "timestamp": datetime.now().isoformat(),
            "video_path": rel_path,
            "full_video_path": str(out_path.resolve()),
            "public_url": pub_url,
            "thumbnail_path": template_meta.get("preview_image", ""),
            "thumbnail_url": template_meta.get("preview_image", ""),
            "content_type": "telegram_short",
            "approved": None,
            "upload_status": "pending_approval",
            "prediction": {"predicted_virality": 82.5},
            "metadata": {
                "title": clip_info.get("title", f"Shinchan Tamil Part {clip_info['part']}"),
                "description": f"{clip_info.get('title')}\n\n#shinchan #tamildubbed #shorts #tamil #anime",
                "tags": ["shinchan", "tamil dubbed", "shorts", "anime", "tamil anime"],
                "template": template_meta.get("id"),
                "template_name": template_meta.get("name"),
            },
        }

        # Check if already in queue
        replaced = False
        for idx, ex in enumerate(queue):
            if ex.get("video_path") == rel_path or ex.get("public_url") == pub_url:
                queue[idx] = {**ex, **item}
                replaced = True
                break
        if not replaced:
            queue.insert(0, item)

        with open(APPROVAL_QUEUE_PATH, "w", encoding="utf-8") as f:
            json.dump(queue[:250], f, indent=2)

        # Also update recreated_media.json
        if RECREATED_MEDIA_PATH.exists():
            with open(RECREATED_MEDIA_PATH, "r", encoding="utf-8-sig") as f:
                media = json.load(f)
            m_item = {
                "title": item["title"],
                "content_type": "telegram_short",
                "video_path": rel_path,
                "public_url": pub_url,
                "thumbnail_path": template_meta.get("preview_image", ""),
                "thumbnail_url": template_meta.get("preview_image", ""),
                "exists": True,
                "metadata": item["metadata"],
                "approved": None,
                "timestamp": item["timestamp"],
            }
            m_replaced = False
            for idx, ex in enumerate(media):
                if ex.get("video_path") == rel_path or ex.get("public_url") == pub_url:
                    media[idx] = {**ex, **m_item}
                    m_replaced = True
                    break
            if not m_replaced:
                media.insert(0, m_item)
            with open(RECREATED_MEDIA_PATH, "w", encoding="utf-8") as f:
                json.dump(media[:250], f, indent=2)

    except Exception as e:
        print(f"  [WARN] Could not update approval queue: {e}", file=sys.stderr)


def render_single_clip(engine: TelegramTemplateEngine, template_id: str, overlay_path: Path, clip_info: dict, part_idx: int, total_parts: int) -> bool:
    filename = clip_info["filename"].format(tid=template_id)
    out_path = OUTPUTS_DIR / filename
    src_path = clip_info["source"]
    start = clip_info["start"]
    dur = clip_info["duration"]
    audio_stream = clip_info.get("audio_stream", "0:2")

    filter_complex = engine.build_ffmpeg_filter(template_id, overlay_path)

    progress_event = {
        "type": "progress",
        "part": part_idx,
        "total": total_parts,
        "percent": int(((part_idx - 1) / total_parts) * 100),
        "status": f"Rendering Part {clip_info['part']} with {TEMPLATES_META.get(template_id, {}).get('name', template_id)}...",
        "filename": filename,
    }
    print(json.dumps(progress_event), flush=True)

    if not src_path.exists():
        print(json.dumps({"type": "error", "part": clip_info["part"], "message": f"Source video not found: {src_path}"}), flush=True)
        return False

    cmd = [
        "ffmpeg",
        "-ss", str(start),
        "-t", str(dur),
        "-i", str(src_path),
        "-i", str(overlay_path),
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-map", str(audio_stream),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        str(out_path),
    ]

    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if res.returncode == 0:
        size_mb = out_path.stat().st_size / (1024 * 1024)
        register_in_approval_queue(clip_info, out_path, TEMPLATES_META.get(template_id, {}))
        done_event = {
            "type": "part_done",
            "part": clip_info["part"],
            "total": total_parts,
            "percent": int((part_idx / total_parts) * 100),
            "status": f"Part {clip_info['part']} rendered ({size_mb:.2f} MB)",
            "output_file": str(out_path),
            "public_url": f"/outputs/{filename}",
        }
        print(json.dumps(done_event), flush=True)
        return True
    else:
        err_event = {
            "type": "error",
            "part": clip_info["part"],
            "message": f"FFmpeg failed: {res.stderr[:200]}",
        }
        print(json.dumps(err_event), flush=True)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=str, default=None, help="Template ID (anime_multi_tier, cinematic_ambient, split_screen, sleek_dark)")
    parser.add_argument("--clip", type=int, default=None, help="Specific clip part (1-10) to render, or all if omitted")
    parser.add_argument("--user-id", type=str, default=None, help="User ID for configuration loading")
    args = parser.parse_args()

    cfg = load_user_config(args.user_id)
    if args.template:
        cfg["telegram_render_template"] = args.template

    engine = TelegramTemplateEngine(cfg)
    template_id = args.template or engine.get_template_id()
    if template_id not in TEMPLATES_META:
        template_id = "anime_multi_tier"

    template_meta = TEMPLATES_META[template_id]
    print(json.dumps({
        "type": "start",
        "template": template_meta,
        "message": f"Starting render using template: {template_meta['name']}",
    }), flush=True)

    # 1. Build Overlay for chosen template
    overlay_path = engine.build_overlay(template_id)

    # 2. Filter clips
    if args.clip:
        clips = [c for c in TELEGRAM_CLIPS if c["part"] == args.clip]
        if not clips:
            print(json.dumps({"type": "error", "message": f"Clip part {args.clip} not found"}), flush=True)
            sys.exit(1)
    else:
        clips = TELEGRAM_CLIPS

    # 3. Render
    success = 0
    total = len(clips)
    for idx, clip in enumerate(clips, 1):
        if render_single_clip(engine, template_id, overlay_path, clip, idx, total):
            success += 1

    print(json.dumps({
        "type": "complete",
        "template": template_meta,
        "success_count": success,
        "total": total,
        "message": f"Successfully rendered {success}/{total} Telegram Shorts with {template_meta['name']} template!",
    }), flush=True)


if __name__ == "__main__":
    main()
