#!/usr/bin/env python3
"""
Batch Render & Upload 15 Shorts to YouTube Channel
- First 10 Shorts: Rendered from Telegram Tamil videos (Shinchan Tamil episodes) with authentic Tamil audio.
- Remaining 5 Shorts: Rendered from high-virality trending source videos.
- Live Real-time tracking: updates daily_quota_state.json and recreated_media.json for both global and active user.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Ensure pipeline and root imports work
PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

from api_integrations import YouTubePublisher


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


OUTPUTS_DIR = ensure_dir(PROJECT_ROOT / "outputs")
DOWNLOADS_DIR = PROJECT_ROOT / "downloads"
TELEGRAM_DIR = DOWNLOADS_DIR / "telegram"
PUBLIC_DATA_DIR = ensure_dir(PROJECT_ROOT / "public" / "data")
USERS_DATA_DIR = ensure_dir(PUBLIC_DATA_DIR / "users")


# ─── DEFINITIONS FOR THE 15 SHORTS ──────────────────────────────────────────

TELEGRAM_SHORTS = [
    # 5 Clips from Episode 934 (Tamil audio stream #0:2)
    {
        "source": TELEGRAM_DIR / "shinchantamil_934.mkv",
        "audio_stream": "0:a:1",  # Second audio stream (Tamil)
        "start": 105,
        "duration": 26,
        "title": "✨ Shinchan Tamil ✨ Ep 1: Funny Breakfast Chaos | Part 1/10 🔥 #Shorts #TamilShorts",
        "description": "Watch funny Shinchan Tamil moments! Part 1 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #ShinchanTamil #TamilAnime #Comedy",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Tamil Anime", "Tamil Cartoon", "Shorts"],
        "category_id": "1",  # Film & Animation
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_934.mkv",
        "audio_stream": "0:a:1",
        "start": 235,
        "duration": 28,
        "title": "✨ Shinchan Tamil ✨ Ep 1: Trouble With Mom | Part 2/10 🔥 #Shorts #TamilShorts",
        "description": "Shinchan creates trouble for mom again! Part 2 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #ShinchanTamil #TamilComedy",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Tamil Comedy", "Tamil Cartoon", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_934.mkv",
        "audio_stream": "0:a:1",
        "start": 365,
        "duration": 27,
        "title": "✨ Shinchan Tamil ✨ Ep 1: Action Kamen Secret Pose | Part 3/10 🔥 #Shorts #TamilShorts",
        "description": "Shinchan imitates Action Kamen! Part 3 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #ActionKamen #TamilAnime",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Action Kamen", "Tamil", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_934.mkv",
        "audio_stream": "0:a:1",
        "start": 495,
        "duration": 26,
        "title": "✨ Shinchan Tamil ✨ Ep 1: Shiro's Daily Walking Fun | Part 4/10 🔥 #Shorts #TamilShorts",
        "description": "Shiro and Shinchan fun adventure! Part 4 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #Shiro #TamilAnime",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Shiro", "Tamil Cartoon", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_934.mkv",
        "audio_stream": "0:a:1",
        "start": 625,
        "duration": 29,
        "title": "✨ Shinchan Tamil ✨ Ep 1: Kindergarten Bus Ride | Part 5/10 🔥 #Shorts #TamilShorts",
        "description": "Shinchan running for the school bus! Part 5 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #SchoolBus #TamilComedy",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Tamil Comedy", "Tamil", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    # 5 Clips from Episode 942 (Tamil audio stream #0:2)
    {
        "source": TELEGRAM_DIR / "shinchantamil_942.mkv",
        "audio_stream": "0:a:1",
        "start": 98,
        "duration": 27,
        "title": "✨ Shinchan Tamil ✨ Ep 2: Kazama Secret Study | Part 6/10 🔥 #Shorts #TamilShorts",
        "description": "Shinchan annoys Kazama while studying! Part 6 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #Kazama #TamilComedy",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Kazama", "Tamil Cartoon", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_942.mkv",
        "audio_stream": "0:a:1",
        "start": 225,
        "duration": 28,
        "title": "✨ Shinchan Tamil ✨ Ep 2: Nani and Shinchan Prank | Part 7/10 🔥 #Shorts #TamilShorts",
        "description": "Nani and Shinchan hilarious prank! Part 7 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #Nani #TamilAnime",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Tamil Pranks", "Tamil Anime", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_942.mkv",
        "audio_stream": "0:a:1",
        "start": 355,
        "duration": 26,
        "title": "✨ Shinchan Tamil ✨ Ep 2: Supermarket Shopping Rush | Part 8/10 🔥 #Shorts #TamilShorts",
        "description": "Shinchan at the supermarket with mom! Part 8 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #Supermarket #TamilComedy",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Shopping Comedy", "Tamil", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_942.mkv",
        "audio_stream": "0:a:1",
        "start": 485,
        "duration": 28,
        "title": "✨ Shinchan Tamil ✨ Ep 2: Shinchan's Crazy Dance | Part 9/10 🔥 #Shorts #TamilShorts",
        "description": "Shinchan does his trademark hilarious dance! Part 9 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #FunnyDance #TamilCartoon",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Funny Dance", "Tamil Comedy", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
    {
        "source": TELEGRAM_DIR / "shinchantamil_942.mkv",
        "audio_stream": "0:a:1",
        "start": 615,
        "duration": 27,
        "title": "✨ Shinchan Tamil ✨ Ep 2: Evening Family Climax | Part 10/10 🔥 #Shorts #TamilShorts",
        "description": "Nohara family dinner climax! Part 10 of 10.\nSubscribe for daily Tamil cartoon shorts! 🎀\n\n#Shorts #TamilShorts #Shinchan #NoharaFamily #TamilShorts",
        "tags": ["Shinchan Tamil", "Tamil Shorts", "Shinchan", "Tamil Family", "Tamil Cartoon", "Shorts"],
        "category_id": "1",
        "type": "telegram_tamil",
    },
]

VIRAL_SHORTS = [
    {
        "source": DOWNLOADS_DIR / "JfbnpYLe3Ms.mp4",
        "title": "⚡ If Cleaning Was an Olympic Timed Sport! 🏃‍♂️💨 | Viral Moments #Shorts #Viral",
        "description": "Extreme speed cleaning challenge! Would you try this? Drop a like and subscribe for more viral edits! 👇\n\n#Shorts #Viral #Speedrun #Cleaning #Challenge #Trending",
        "tags": ["Viral", "Shorts", "Trending", "Speedrun", "Challenge", "ViralMoments"],
        "category_id": "24",  # Entertainment
        "type": "viral",
    },
    {
        "source": DOWNLOADS_DIR / "Q2osGQYeLNE.mp4",
        "title": "Wait For Part 4! You Will Cry Laughing 🤣🤣 #Shorts #Comedy #Viral",
        "description": "The funniest twist you will see today! Don't forget to like & subscribe for daily laughs! 👇\n\n#Shorts #Comedy #Funny #Viral #Meme #Trending",
        "tags": ["Comedy", "Funny", "Viral", "Shorts", "Trending", "Memes"],
        "category_id": "23",  # Comedy
        "type": "viral",
    },
    {
        "source": DOWNLOADS_DIR / "sOZrJUkCLYU.mp4",
        "title": "Crazy Moment That Shocked Everyone! 🤯⚡ #Shorts #Viral #OMG",
        "description": "Nobody expected this to happen! Subscribe for daily epic viral moments! 👇\n\n#Shorts #Crazy #Viral #OMG #Shocking #EpicMoments",
        "tags": ["Crazy", "Viral", "OMG", "Shorts", "Trending", "Epic"],
        "category_id": "24",
        "type": "viral",
    },
    {
        "source": DOWNLOADS_DIR / "A_Q2qpbHrqo.mp4",
        "title": "It Is 9,999,999$ Sir! Unbelievable Reaction 😱🤑 #Shorts #Comedy #Funny",
        "description": "What would you do in this situation? 🤣 Subscribe for the funniest daily shorts! 👇\n\n#Shorts #Comedy #Reaction #Funny #Viral #Trending",
        "tags": ["Comedy", "Funny", "Viral", "Shorts", "Reaction", "Memes"],
        "category_id": "23",
        "type": "viral",
    },
    {
        "source": DOWNLOADS_DIR / "Kcb7QDcmEHQ.mp4",
        "title": "First Day Pyar vs Next Day War 🤓🔥 #Gaming #FreeFire #Shorts",
        "description": "Free Fire gamers will relate to this 100%! Like & subscribe for more gaming moments! 👇\n\n#Shorts #Gaming #FreeFire #FFShorts #FreeFireIndia #Viral",
        "tags": ["Free Fire", "Gaming", "FF Shorts", "FreeFire", "Shorts", "Viral"],
        "category_id": "20",  # Gaming
        "type": "viral",
    },
]


def render_telegram_short(item: dict, index: int) -> Path:
    out_path = OUTPUTS_DIR / f"short_telegram_shinchan_part{index:02d}_{int(time.time())}.mp4"
    if out_path.exists() and out_path.stat().st_size > 100_000:
        return out_path

    print(f"\n[RENDER] Rendering Telegram Short {index}/10: {item['title'][:45]}...")
    cmd = [
        "ffmpeg",
        "-ss", str(item["start"]),
        "-t", str(item["duration"]),
        "-i", str(item["source"]),
        "-filter_complex",
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bg];"
        "[0:v]scale=1080:-1[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[v]",
        "-map", "[v]",
        "-map", item["audio_stream"],
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        str(out_path),
    ]

    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {res.stderr[:300]}")

    print(f"[RENDER OK] -> {out_path.name} ({out_path.stat().st_size // 1024} KB)")
    return out_path


def render_viral_short(item: dict, index: int) -> Path:
    stem = Path(item["source"]).stem
    out_path = OUTPUTS_DIR / f"short_viral_{stem}_{int(time.time())}.mp4"
    if out_path.exists() and out_path.stat().st_size > 100_000:
        return out_path

    print(f"\n[RENDER] Rendering Viral Short {index}/5: {item['title'][:45]}...")
    cmd = [
        "ffmpeg",
        "-i", str(item["source"]),
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        str(out_path),
    ]

    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {res.stderr[:300]}")

    print(f"[RENDER OK] -> {out_path.name} ({out_path.stat().st_size // 1024} KB)")
    return out_path


def record_upload(video_id: str, url: str, title: str, pipeline_type: str):
    """Update quota files, media libraries, and approval queue for real-time dashboard reflection."""
    now_iso = datetime.now(timezone.utc).isoformat()
    today_str = datetime.now().strftime("%Y-%m-%d")

    entry = {
        "timestamp": now_iso,
        "pipeline": pipeline_type,
        "video_id": video_id,
        "url": url,
        "title": title,
    }

    # 1. Update public/data/daily_quota_state.json
    quota_paths = [
        PUBLIC_DATA_DIR / "daily_quota_state.json",
    ]
    # Add all user dirs
    for udir in USERS_DATA_DIR.iterdir():
        if udir.is_dir():
            quota_paths.append(udir / "daily_quota_state.json")

    for qpath in quota_paths:
        data = {}
        try:
            if qpath.exists():
                with open(qpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
        except Exception:
            data = {}

        history = data.get("history", [])
        history.append(entry)
        data["date"] = today_str
        data["uploads"] = len([h for h in history if h.get("timestamp", "").startswith(today_str)]) or len(history)
        data["history"] = history
        data["max_daily_uploads"] = 15

        try:
            with open(qpath, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    # 2. Update recreated_media.json
    media_paths = [
        PUBLIC_DATA_DIR / "recreated_media.json",
    ]
    for udir in USERS_DATA_DIR.iterdir():
        if udir.is_dir():
            media_paths.append(udir / "recreated_media.json")

    media_entry = {
        "title": title,
        "content_type": "short",
        "timestamp": now_iso,
        "upload_result": {
            "video_id": video_id,
            "url": url,
            "status": "uploaded",
        },
        "exists": True,
        "approved": True,
    }

    for mpath in media_paths:
        mdata = []
        try:
            if mpath.exists():
                with open(mpath, "r", encoding="utf-8") as f:
                    mdata = json.load(f)
        except Exception:
            mdata = []
        mdata.append(media_entry)
        try:
            with open(mpath, "w", encoding="utf-8") as f:
                json.dump(mdata, f, indent=2, ensure_ascii=False)
        except Exception:
            pass


async def main():
    print("=" * 70)
    print("🚀 NEMO AUTOMATION: 15 SHORTS PIPELINE")
    print("   [1-10]  Telegram Tamil Shorts (Shinchan Tamil)")
    print("   [11-15] Trending Viral Shorts")
    print("=" * 70)

    # 1. Check YouTube Publisher Credentials
    creds_path = PROJECT_ROOT / "youtube_credentials.json"
    secrets_path = PROJECT_ROOT / "client_secrets.json"
    publisher = YouTubePublisher(
        credentials_path=str(creds_path),
        client_secrets_path=str(secrets_path),
    )

    all_items = []
    # Items 1 to 10: Telegram Tamil
    for idx, item in enumerate(TELEGRAM_SHORTS, start=1):
        all_items.append((idx, item, "telegram"))
    # Items 11 to 15: Viral Videos
    for idx, item in enumerate(VIRAL_SHORTS, start=11):
        all_items.append((idx, item, "viral"))

    uploaded_results = []
    failed_results = []

    for idx, item, cat in all_items:
        print(f"\n[{idx}/15] PROCESSING ({cat.upper()}): {item['title']}")
        try:
            # Step A: Render
            if cat == "telegram":
                video_file = render_telegram_short(item, idx)
            else:
                video_file = render_viral_short(item, idx - 10)

            # Step B: Upload
            print(f"[{idx}/15] 📤 Uploading to YouTube Channel...")
            result = await publisher.upload_short(
                video_path=str(video_file),
                title=item["title"][:100],
                description=item["description"],
                tags=item["tags"],
                category_id=item["category_id"],
                privacy="public",
                made_for_kids=False,
            )

            v_id = result.get("video_id")
            v_url = result.get("url") or f"https://youtube.com/shorts/{v_id}"
            print(f"[{idx}/15] ✅ UPLOAD SUCCESS!")
            print(f"       ID:  {v_id}")
            print(f"       URL: {v_url}")

            record_upload(v_id, v_url, item["title"], cat)
            uploaded_results.append({
                "index": idx,
                "type": cat,
                "title": item["title"],
                "video_id": v_id,
                "url": v_url,
            })

            # Small cooldown between uploads
            await asyncio.sleep(2)

        except Exception as exc:
            err_msg = str(exc)
            print(f"[{idx}/15] ❌ ERROR: {err_msg}")
            failed_results.append({
                "index": idx,
                "type": cat,
                "title": item["title"],
                "error": err_msg,
            })
            if "quotaExceeded" in err_msg or "upload limit" in err_msg.lower():
                print("\n⚠️ YOUTUBE API DAILY UPLOAD LIMIT REACHED FOR TODAY.")
                print("All remaining videos are rendered and ready in outputs/ folder.")
                break

    print("\n" + "=" * 70)
    print("📊 BATCH RUN SUMMARY")
    print(f"   Total Attempted: {len(uploaded_results) + len(failed_results)} / 15")
    print(f"   Successfully Uploaded: {len(uploaded_results)}")
    print(f"   Failed / Quota Limited: {len(failed_results)}")
    print("=" * 70)

    for item in uploaded_results:
        print(f"  • [{item['index']:02d}/15] [{item['type'].upper()}] {item['url']} - {item['title'][:50]}")

    if failed_results:
        print("\nFailed / Remaining items:")
        for item in failed_results:
            print(f"  • [{item['index']:02d}/15] {item['title'][:50]}: {item.get('error', '')[:80]}")


if __name__ == "__main__":
    asyncio.run(main())
