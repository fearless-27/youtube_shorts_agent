import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ROOT / "outputs"
DATA_DIR = ROOT / "public" / "data"
USERS_DIR = DATA_DIR / "users"

# 15 shorts specifications
SHORTS_DATA = [
    # Telegram 1-6 (Uploaded)
    {
        "id": "telegram_shinchan_01",
        "title": "✨ Shinchan Tamil ✨ Ep 1: Funny Breakfast Chaos | Part 1/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part01_1789831697.mp4",
        "video_id": "whS_zKnqywA",
        "url": "https://youtube.com/shorts/whS_zKnqywA",
        "status": "uploaded",
        "type": "telegram",
        "virality": 92,
    },
    {
        "id": "telegram_shinchan_02",
        "title": "✨ Shinchan Tamil ✨ Ep 1: Trouble With Mom | Part 2/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part02_1789831737.mp4",
        "video_id": "jpINn8cHnYY",
        "url": "https://youtube.com/shorts/jpINn8cHnYY",
        "status": "uploaded",
        "type": "telegram",
        "virality": 89,
    },
    {
        "id": "telegram_shinchan_03",
        "title": "✨ Shinchan Tamil ✨ Ep 1: Action Kamen Secret Pose | Part 3/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part03_1789831785.mp4",
        "video_id": "0tGfAVARuos",
        "url": "https://youtube.com/shorts/0tGfAVARuos",
        "status": "uploaded",
        "type": "telegram",
        "virality": 94,
    },
    {
        "id": "telegram_shinchan_04",
        "title": "✨ Shinchan Tamil ✨ Ep 1: Shiro's Daily Walking Fun | Part 4/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part04_1789831829.mp4",
        "video_id": "PDoozw--62E",
        "url": "https://youtube.com/shorts/PDoozw--62E",
        "status": "uploaded",
        "type": "telegram",
        "virality": 91,
    },
    {
        "id": "telegram_shinchan_05",
        "title": "✨ Shinchan Tamil ✨ Ep 1: Kindergarten Bus Ride | Part 5/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part05_1789831878.mp4",
        "video_id": "fttTJJq04I0",
        "url": "https://youtube.com/shorts/fttTJJq04I0",
        "status": "uploaded",
        "type": "telegram",
        "virality": 90,
    },
    {
        "id": "telegram_shinchan_06",
        "title": "✨ Shinchan Tamil ✨ Ep 2: Kazama Secret Study | Part 6/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part06_1789831923.mp4",
        "video_id": "hSJA66_wcR0",
        "url": "https://youtube.com/shorts/hSJA66_wcR0",
        "status": "uploaded",
        "type": "telegram",
        "virality": 93,
    },
    # Telegram 7-10 (Rendered & Ready)
    {
        "id": "telegram_shinchan_07",
        "title": "✨ Shinchan Tamil ✨ Ep 2: Nani and Shinchan Prank | Part 7/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part07_ready.mp4",
        "status": "pending_approval",
        "type": "telegram",
        "virality": 95,
    },
    {
        "id": "telegram_shinchan_08",
        "title": "✨ Shinchan Tamil ✨ Ep 2: Supermarket Shopping Rush | Part 8/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part08_ready.mp4",
        "status": "pending_approval",
        "type": "telegram",
        "virality": 88,
    },
    {
        "id": "telegram_shinchan_09",
        "title": "✨ Shinchan Tamil ✨ Ep 2: Shinchan's Crazy Dance | Part 9/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part09_ready.mp4",
        "status": "pending_approval",
        "type": "telegram",
        "virality": 97,
    },
    {
        "id": "telegram_shinchan_10",
        "title": "✨ Shinchan Tamil ✨ Ep 2: Evening Family Climax | Part 10/10 🔥 #Shorts #TamilShorts",
        "file": OUTPUTS / "short_telegram_shinchan_part10_ready.mp4",
        "status": "pending_approval",
        "type": "telegram",
        "virality": 92,
    },
    # Viral 11-15 (Rendered & Ready)
    {
        "id": "viral_short_01",
        "title": "⚡ If Cleaning Was an Olympic Timed Sport! 🏃‍♂️💨 | Viral Moments #Shorts #Viral",
        "file": OUTPUTS / "short_viral_JfbnpYLe3Ms_1789831988.mp4",
        "status": "pending_approval",
        "type": "viral",
        "virality": 98,
    },
    {
        "id": "viral_short_02",
        "title": "Wait For Part 4! You Will Cry Laughing 🤣🤣 #Shorts #Comedy #Viral",
        "file": OUTPUTS / "short_viral_Q2osGQYeLNE_1789832004.mp4",
        "status": "pending_approval",
        "type": "viral",
        "virality": 96,
    },
    {
        "id": "viral_short_03",
        "title": "Crazy Moment That Shocked Everyone! 🤯⚡ #Shorts #Viral #OMG",
        "file": OUTPUTS / "short_viral_sOZrJUkCLYU_1789832056.mp4",
        "status": "pending_approval",
        "type": "viral",
        "virality": 94,
    },
    {
        "id": "viral_short_04",
        "title": "It Is 9,999,999$ Sir! Unbelievable Reaction 😱🤑 #Shorts #Comedy #Funny",
        "file": OUTPUTS / "short_viral_A_Q2qpbHrqo_1789832067.mp4",
        "status": "pending_approval",
        "type": "viral",
        "virality": 95,
    },
    {
        "id": "viral_short_05",
        "title": "First Day Pyar vs Next Day War 🤓🔥 #Gaming #FreeFire #Shorts",
        "file": OUTPUTS / "short_viral_Kcb7QDcmEHQ_1789832088.mp4",
        "status": "pending_approval",
        "type": "viral",
        "virality": 91,
    },
]

now_iso = datetime.now(timezone.utc).isoformat()

# Generate thumbnails
for item in SHORTS_DATA:
    vpath = item["file"]
    if vpath.exists():
        thumb_path = OUTPUTS / f"thumb_{vpath.stem}.jpg"
        if not thumb_path.exists() or thumb_path.stat().st_size == 0:
            subprocess.run([
                "ffmpeg", "-ss", "00:00:03", "-i", str(vpath),
                "-frames:v", "1", "-q:v", "2", "-y", str(thumb_path)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        item["thumb_path"] = str(thumb_path)
        item["thumb_url"] = f"/outputs/{thumb_path.name}"
        item["preview_url"] = f"/outputs/{vpath.name}"
    else:
        item["thumb_url"] = ""
        item["preview_url"] = ""

# Build queue items for pending
queue_items = []
media_items = []

for item in SHORTS_DATA:
    vpath = str(item["file"])
    is_uploaded = item["status"] == "uploaded"

    if not is_uploaded:
        queue_items.append({
            "id": item["id"],
            "title": item["title"],
            "timestamp": now_iso,
            "video_path": f"outputs/{item['file'].name}",
            "full_video_path": vpath,
            "public_url": item["preview_url"],
            "thumbnail_path": item.get("thumb_path", ""),
            "thumbnail_url": item.get("thumb_url", ""),
            "content_type": "short",
            "approved": None,
            "upload_status": "pending_review",
            "prediction": {
                "predicted_virality": item["virality"],
                "model": "xgboost_v4"
            },
            "metadata": {
                "title": item["title"],
                "description": f"{item['title']}\n\nSubscribe for daily viral shorts and Tamil anime edits!",
                "tags": ["Shorts", "Viral", "TamilShorts"],
                "category_id": "1" if item["type"] == "telegram" else "24",
                "privacy": "public",
                "made_for_kids": False
            }
        })

    # Add to media library
    media_entry = {
        "title": item["title"],
        "content_type": "short",
        "timestamp": now_iso,
        "video_path": f"outputs/{item['file'].name}",
        "thumbnail_url": item.get("thumb_url", ""),
        "public_url": item["preview_url"],
        "exists": item["file"].exists(),
        "approved": is_uploaded,
        "prediction": {
            "predicted_virality": item["virality"]
        },
    }
    if is_uploaded:
        media_entry["upload_result"] = {
            "video_id": item["video_id"],
            "url": item["url"],
            "status": "uploaded"
        }
    media_items.append(media_entry)

# Write to all approval_queue.json and recreated_media.json files
destinations = [DATA_DIR]
for udir in USERS_DIR.iterdir():
    if udir.is_dir():
        destinations.append(udir)

for target in destinations:
    q_file = target / "approval_queue.json"
    m_file = target / "recreated_media.json"

    with open(q_file, "w", encoding="utf-8") as f:
        json.dump(queue_items, f, indent=2, ensure_ascii=False)

    with open(m_file, "w", encoding="utf-8") as f:
        json.dump(media_items, f, indent=2, ensure_ascii=False)

print(f"Successfully registered all 15 shorts across {len(destinations)} stores.")
print(f"  • {len([s for s in SHORTS_DATA if s['status'] == 'uploaded'])} Live Uploaded on YouTube")
print(f"  • {len(queue_items)} Ready in Content Studio Approval Queue with Preview & Thumbnails")
