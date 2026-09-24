"""
Upload Approved Short & Free Up Local Disk Space
Used by Content Studio semi-live approval workflow.
When operator approves a Short:
1. Uploads to YouTube via YouTubePublisher
2. On confirmed upload, auto-deletes the local rendered .mp4 file from outputs/
3. Cleans up temp audio and .srt sidecars
4. Updates approval_queue.json, recreated_media.json, and daily_quota_state.json
"""

import sys
import os
import json
import base64
import sqlite3
import asyncio
import argparse
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from api_integrations import YouTubePublisher


def load_json(file_path: Path, fallback):
    if not file_path.exists():
        return fallback
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return fallback


def write_json(file_path: Path, data):
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_file = file_path.with_suffix(f".tmp.{int(datetime.now().timestamp())}")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_file.replace(file_path)


def delete_local_asset(video_path: Path) -> int:
    """Deletes local rendered video and associated sidecars. Returns bytes freed."""
    freed_bytes = 0
    try:
        if video_path.exists() and video_path.is_file():
            freed_bytes += video_path.stat().st_size
            video_path.unlink(missing_ok=True)
    except Exception as exc:
        print(f"[CLEANUP WARNING] Could not delete {video_path}: {exc}", file=sys.stderr)

    # Clean up associated subtitles and temp files
    try:
        stem = video_path.stem
        outputs_dir = video_path.parent
        for pattern in [f"subs_*{stem}*.srt", f"*{stem}*.wav", f"*{stem}*TEMP_MPY*.mp4"]:
            for match in outputs_dir.glob(pattern):
                try:
                    freed_bytes += match.stat().st_size
                    match.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception:
        pass

    return freed_bytes


async def process_approval(approval_id: str, approve: bool, user_id: str = None):
    if user_id and user_id != "default":
        data_dir = PROJECT_ROOT / "public" / "data" / "users" / user_id
    else:
        data_dir = PROJECT_ROOT / "public" / "data"

    data_dir.mkdir(parents=True, exist_ok=True)
    queue_path = data_dir / "approval_queue.json"
    recreated_path = data_dir / "recreated_media.json"
    quota_path = data_dir / "daily_quota_state.json"

    queue = load_json(queue_path, [])
    item = None
    item_idx = -1

    # Try decoding base64url ID
    decoded_vpath = None
    try:
        padded = approval_id + "=" * (-len(approval_id) % 4)
        decoded_bytes = base64.urlsafe_b64decode(padded.encode())
        decoded_str = decoded_bytes.decode("utf-8", errors="ignore")
        if "|" in decoded_str:
            decoded_vpath, _ = decoded_str.split("|", 1)
    except Exception:
        pass

    # Match by ID, video_path, or base64 decoded path
    for idx, q in enumerate(queue):
        q_id = str(q.get("id") or "")
        q_vpath = str(q.get("video_path") or "")
        q_fpath = str(q.get("full_video_path") or "")

        if q_id and q_id == str(approval_id):
            item = q
            item_idx = idx
            break
        if q_vpath == str(approval_id) or q_fpath == str(approval_id):
            item = q
            item_idx = idx
            break
        if decoded_vpath and (q_vpath == decoded_vpath or Path(q_vpath).name == Path(decoded_vpath).name):
            item = q
            item_idx = idx
            break
        if Path(approval_id).name and Path(approval_id).name == Path(q_vpath).name:
            item = q
            item_idx = idx
            break

    if not item:
        res = {"ok": False, "error": f"Approval item not found for ID: {approval_id}"}
        print(json.dumps(res))
        return

    raw_path = item.get("full_video_path") or item.get("video_path") or ""
    video_path = Path(raw_path)
    if not video_path.is_absolute():
        video_path = PROJECT_ROOT / video_path

    # Sync telegram_sources sqlite if present
    def sync_sqlite(status_val, v_id=None, u_url=None):
        db_path = PROJECT_ROOT / "pipeline" / "telegram_tamil_history.sqlite3"
        if db_path.exists():
            try:
                with sqlite3.connect(db_path) as conn:
                    conn.execute(
                        """
                        UPDATE telegram_sources
                        SET status = ?, uploaded_video_id = ?, uploaded_url = ?, updated_at = ?
                        WHERE source_id = ? OR final_video_path LIKE ?
                        """,
                        (status_val, v_id, u_url, datetime.now().isoformat(), approval_id, f"%{video_path.name}%")
                    )
            except Exception:
                pass

    # If rejected, clean up video file directly and record rejection
    if not approve:
        freed = delete_local_asset(video_path)
        item["approved"] = False
        item["upload_status"] = "rejected"
        item["reviewed_at"] = datetime.now().isoformat()
        queue[item_idx] = item
        write_json(queue_path, queue)
        sync_sqlite("rejected")
        res = {
            "ok": True,
            "status": "rejected",
            "freed_bytes": freed,
            "message": f"Rejected and deleted local video to free up disk space ({freed // 1024} KB freed)."
        }
        print(json.dumps(res))
        return

    # Operator APPROVED: Proceed with YouTube upload
    if not video_path.exists():
        res = {"ok": False, "error": f"Rendered video file does not exist on disk: {video_path}"}
        print(json.dumps(res))
        return

    metadata = item.get("metadata", {})
    title = metadata.get("title") or item.get("title") or "Tamil Short"
    description = metadata.get("description") or "Tamil Short Clip\n\n#Shorts #TamilShorts"
    tags = metadata.get("tags") or ["Shorts", "Tamil", "TamilShorts"]
    category_id = str(metadata.get("category_id") or "1")
    privacy = str(metadata.get("privacy") or "public")
    made_for_kids = bool(metadata.get("made_for_kids") or False)

    # Check mock upload flag
    is_mock = os.getenv("YOUTUBE_MOCK_UPLOAD", "0").lower() in {"1", "true", "yes"}

    # Initialize YouTube Publisher with user-scoped credentials fallback
    user_creds = data_dir / "youtube_credentials.json"
    root_creds = PROJECT_ROOT / "youtube_credentials.json"
    if user_creds.exists():
        creds_path = user_creds
        print(f"[UPLOADER] Using user-specific YouTube credentials from {user_creds}", file=sys.stderr)
    elif root_creds.exists():
        creds_path = root_creds
        print(f"[UPLOADER] Using root YouTube credentials from {root_creds}", file=sys.stderr)
    else:
        creds_path = root_creds
    secrets_path = PROJECT_ROOT / "client_secrets.json"

    publisher = YouTubePublisher(
        credentials_path=str(creds_path),
        client_secrets_path=str(secrets_path),
    )

    try:
        item["upload_status"] = "uploading"
        queue[item_idx] = item
        write_json(queue_path, queue)

        if is_mock:
            mock_id = f"mock_{int(datetime.now().timestamp())}"
            upload_result = {
                "video_id": mock_id,
                "url": f"https://youtube.com/shorts/{mock_id}",
                "status": "uploaded",
            }
            print(f"[MOCK UPLOADER] Simulating upload for {video_path.name}", file=sys.stderr)
        else:
            print(f"[UPLOADER] Uploading approved short to YouTube: {video_path.name}", file=sys.stderr)
            upload_result = await publisher.upload_short(
                video_path=str(video_path),
                title=title,
                description=description,
                tags=tags,
                category_id=category_id,
                privacy=privacy,
                made_for_kids=made_for_kids,
                public_stats_viewable=True,
            )

        # Confirmed upload successful
        item["upload_status"] = "uploaded"
        item["approved"] = True
        item["upload_result"] = upload_result
        item["uploaded_at"] = datetime.now().isoformat()
        item["reviewed_at"] = datetime.now().isoformat()
        queue[item_idx] = item
        write_json(queue_path, queue)
        sync_sqlite("uploaded", upload_result.get("video_id"), upload_result.get("url"))

        # Record in recreated_media.json
        recreated = load_json(recreated_path, [])
        recreated_item = {
            "id": item.get("id"),
            "video_path": str(video_path),
            "upload_result": upload_result,
            "metadata": metadata,
            "prediction": item.get("prediction", {}),
            "timestamp": datetime.now().isoformat(),
            "status": "UPLOADED",
        }
        recreated.append(recreated_item)
        write_json(recreated_path, recreated)

        # Update daily quota state
        quota = load_json(quota_path, {"uploads": 0, "short": 0, "history": []})
        quota["uploads"] = int(quota.get("uploads", 0)) + 1
        quota["short"] = int(quota.get("short", 0)) + 1
        quota.setdefault("history", []).append({
            "timestamp": datetime.now().isoformat(),
            "video_id": upload_result.get("video_id"),
            "url": upload_result.get("url"),
            "title": title,
        })
        write_json(quota_path, quota)

        # Post-upload cleanup: Delete local rendered video to free disk space!
        freed = delete_local_asset(video_path)
        print(f"[CLEANUP] Deleted rendered video file {video_path.name}. Freed {freed // 1024} KB.", file=sys.stderr)

        res = {
            "ok": True,
            "status": "uploaded",
            "video_id": upload_result.get("video_id"),
            "url": upload_result.get("url"),
            "freed_bytes": freed,
            "message": f"Uploaded successfully to YouTube ({upload_result.get('url')}) and deleted local file to free up space."
        }
        print(json.dumps(res))

    except Exception as exc:
        item["approved"] = True
        item["upload_status"] = "upload_failed"
        item["upload_error"] = str(exc)
        item["reviewed_at"] = datetime.now().isoformat()
        queue[item_idx] = item
        write_json(queue_path, queue)
        sync_sqlite("upload_failed")
        res = {
            "ok": True,
            "status": "approved",
            "upload_status": "upload_failed",
            "warning": f"Approved, but upload encountered an issue: {exc}",
        }
        print(json.dumps(res))


def main():
    parser = argparse.ArgumentParser(description="Upload approved short and free disk space.")
    parser.add_argument("id", help="Approval ID or video path")
    parser.add_argument("--reject", action="store_true", help="Reject and delete local video")
    parser.add_argument("--user", default=None, help="User ID for per-user data isolation")
    args = parser.parse_args()

    asyncio.run(process_approval(args.id, approve=not args.reject, user_id=args.user))


if __name__ == "__main__":
    main()
