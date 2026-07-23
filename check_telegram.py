"""Quick Telegram pipeline health check."""
import asyncio
import sqlite3
import os
import sys
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent

# 1. Check database status
print("=" * 60)
print("TELEGRAM PIPELINE HEALTH CHECK")
print("=" * 60)

db_path = PROJECT_ROOT / "pipeline" / "telegram_tamil_history.sqlite3"
if not db_path.exists():
    print(f"\n❌ Database not found: {db_path}")
    sys.exit(1)

conn = sqlite3.connect(str(db_path))

print("\n📊 Status Summary:")
rows = conn.execute("SELECT status, COUNT(*) FROM telegram_sources GROUP BY status").fetchall()
for status, count in rows:
    print(f"  {status}: {count}")

print("\n📋 Last 15 entries:")
rows2 = conn.execute(
    "SELECT source_id, status, segment_index, segment_total, updated_at "
    "FROM telegram_sources ORDER BY updated_at DESC LIMIT 15"
).fetchall()
for r in rows2:
    print(f"  {r[0]} | {r[1]} | seg {r[2]}/{r[3]} | {r[4]}")

pending = conn.execute(
    "SELECT COUNT(*) FROM telegram_sources WHERE status='rendered' AND final_video_path IS NOT NULL"
).fetchone()
print(f"\n⏳ Pending rendered (waiting for upload): {pending[0]}")

# Check recent uploads
uploads = conn.execute(
    "SELECT source_id, uploaded_url, updated_at FROM telegram_sources "
    "WHERE status='uploaded' ORDER BY updated_at DESC LIMIT 5"
).fetchall()
if uploads:
    print("\n✅ Recent uploads:")
    for u in uploads:
        print(f"  {u[0]} | {u[1] or 'N/A'} | {u[2]}")
else:
    print("\n⚠️ No uploads found in database.")

conn.close()

# 2. Check Telegram connection
print("\n" + "=" * 60)
print("🔌 TELEGRAM CONNECTION TEST")
print("=" * 60)

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except:
    pass

api_id = os.getenv("TELEGRAM_API_ID")
api_hash = os.getenv("TELEGRAM_API_HASH")
phone = os.getenv("TELEGRAM_PHONE")
channels_str = os.getenv("TELEGRAM_CHANNELS", "")

print(f"\n  API ID: {api_id}")
print(f"  API Hash: {api_hash[:8]}..." if api_hash else "  API Hash: NOT SET")
print(f"  Phone: {phone}")
print(f"  Channels: {channels_str}")

session_file = PROJECT_ROOT / "ghostpipe_telegram.session"
print(f"  Session file exists: {session_file.exists()}")

if not api_id or not api_hash:
    print("\n❌ Telegram API credentials missing!")
    sys.exit(1)

async def test_connection():
    try:
        from telethon import TelegramClient
    except ImportError:
        print("\n❌ telethon not installed!")
        return

    client = TelegramClient(
        str(PROJECT_ROOT / "ghostpipe_telegram"),
        int(api_id),
        str(api_hash)
    )

    try:
        await client.start(phone=str(phone))
        me = await client.get_me()
        print(f"\n  ✅ Connected as: {me.first_name} {me.last_name or ''}")
        print(f"  Is bot: {me.bot}")

        channels = [c.strip() for c in channels_str.split(",") if c.strip()]
        for ch in channels:
            try:
                entity = await client.get_entity(ch)
                name = getattr(entity, "title", "?")
                video_count = 0
                async for msg in client.iter_messages(entity, limit=5):
                    if msg and msg.media:
                        mime = getattr(getattr(msg, "file", None), "mime_type", "") or ""
                        if mime.startswith("video/"):
                            video_count += 1
                print(f"  ✅ Channel '{name}' - {video_count} videos in last 5 msgs")
            except Exception as e:
                print(f"  ❌ Channel {ch}: {e}")
    except Exception as e:
        print(f"\n❌ Connection failed: {e}")
    finally:
        await client.disconnect()

asyncio.run(test_connection())

# 3. Check outputs directory
print("\n" + "=" * 60)
print("📁 OUTPUT FILES CHECK")
print("=" * 60)

outputs_dir = PROJECT_ROOT / "outputs"
if outputs_dir.exists():
    telegram_files = list(outputs_dir.glob("telegram_tamil_*"))
    print(f"\n  Telegram output files: {len(telegram_files)}")
    for f in sorted(telegram_files)[-5:]:
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"    {f.name} ({size_mb:.1f} MB)")
else:
    print("\n  ⚠️ Outputs directory not found")

# 4. Check downloads directory
downloads_dir = PROJECT_ROOT / "downloads" / "telegram"
if downloads_dir.exists():
    dl_files = list(downloads_dir.glob("*"))
    print(f"\n  Downloaded source files: {len(dl_files)}")
    for f in sorted(dl_files)[-5:]:
        size_mb = f.stat().st_size / (1024 * 1024) if f.is_file() else 0
        print(f"    {f.name} ({size_mb:.1f} MB)")
else:
    print(f"\n  Downloads directory: {downloads_dir} (not found)")

print("\n" + "=" * 60)
print("CHECK COMPLETE")
print("=" * 60)
