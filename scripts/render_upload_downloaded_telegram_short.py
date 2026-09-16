import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from telegram_tamil_shorts_pipeline import (  # noqa: E402
    ShortsRenderer,
    TamilAudioFactory,
    TelegramVideo,
    load_config,
)


TAMIL_SCRIPT = (
    "\u0b87\u0ba8\u0bcd\u0ba4 \u0b95\u0bbe\u0b9f\u0bcd\u0b9a\u0bbf "
    "\u0bae\u0bbf\u0b95\u0bb5\u0bc1\u0bae\u0bcd \u0b9a\u0bc1\u0bb5\u0bbe\u0bb0\u0bb8\u0bcd\u0baf\u0bae\u0bbe\u0ba9\u0ba4\u0bc1. "
    "\u0b92\u0bb5\u0bcd\u0bb5\u0bca\u0bb0\u0bc1 \u0ba8\u0bca\u0b9f\u0bbf\u0baf\u0bc1\u0bae\u0bcd "
    "\u0bb5\u0bc7\u0b95\u0bae\u0bbe\u0b95 \u0ba8\u0b95\u0bb0\u0bcd\u0b95\u0bbf\u0bb1\u0ba4\u0bc1. "
    "\u0b87\u0ba4\u0bc1 \u0baa\u0bbf\u0b9f\u0bbf\u0ba4\u0bcd\u0ba4\u0bbf\u0bb0\u0bc1\u0ba8\u0bcd\u0ba4\u0bbe\u0bb2\u0bcd, "
    "\u0bae\u0bc7\u0bb2\u0bc1\u0bae\u0bcd \u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u0bb7\u0bbe\u0bb0\u0bcd\u0b9f\u0bcd\u0bb8\u0bcd\u0b95\u0bb3\u0bc1\u0b95\u0bcd\u0b95\u0bc1 "
    "\u0b9a\u0baa\u0bcd\u0bb8\u0bcd\u0b95\u0bbf\u0bb0\u0bc8\u0baa\u0bcd \u0b9a\u0bc6\u0baf\u0bcd\u0baf\u0bc1\u0b99\u0bcd\u0b95\u0bb3\u0bcd."
)


async def main():
    parser = argparse.ArgumentParser(description="Render and upload a completed Telegram download as a Tamil Short.")
    parser.add_argument("video_path", help="Path to a completed Telegram video download.")
    parser.add_argument("--channel", default="Dragon_ball_tamil_jh")
    parser.add_argument("--message-id", type=int, default=907)
    parser.add_argument("--title", default="Dragon Ball Tamil Short")
    parser.add_argument("--audio-source", choices=["source", "tts"], default="source")
    parser.add_argument("--upload", action="store_true", help="Upload to YouTube after rendering.")
    args = parser.parse_args()

    video_path = Path(args.video_path)
    if not video_path.is_absolute():
        video_path = PROJECT_ROOT / video_path
    if not video_path.exists():
        raise FileNotFoundError(video_path)

    config = load_config()
    config.update(
        {
            "telegram_mode": "live" if args.upload else "dry_run",
            "telegram_transcribe_source": False,
            "telegram_translate_to_tamil": False,
            "tamil_voiceover_script": TAMIL_SCRIPT,
            "telegram_preserve_source_audio": True,
            "telegram_generate_tamil_voiceover": False,
            "telegram_short_duration": 25,
            "telegram_allow_audio_replacement": False,
            "telegram_output_dir": str(PROJECT_ROOT / "outputs"),
            "upload_privacy": config.get("upload_privacy", "public"),
            "telegram_delete_local_files_after_upload": False,
        }
    )

    skip_intro = float(config.get("telegram_skip_intro_seconds", 90.0))

    video = TelegramVideo(
        source_id=f"telegram:{args.channel}:{args.message_id}",
        channel=args.channel,
        message_id=args.message_id,
        title=args.title,
        caption=args.title,
        source_url=f"https://t.me/{args.channel}/{args.message_id}",
        local_path=str(video_path),
        posted_at=datetime.now(timezone.utc),
        segment_start=skip_intro,
    )

    audio_path, script = await TamilAudioFactory(config).build_audio(video)
    final_path = await ShortsRenderer(config).render(video, audio_path, script)

    print(f"FINAL_VIDEO={final_path}")

    if args.upload:
        from api_integrations import YouTubePublisher

        publisher = YouTubePublisher(
            credentials_path=config.get("youtube_credentials_path", str(PROJECT_ROOT / "youtube_credentials.json")),
            client_secrets_path=config.get("youtube_client_secrets_path", str(PROJECT_ROOT / "client_secrets.json")),
        )
        result = await publisher.upload_short(
            video_path=final_path,
            title=f"Tamil Shorts: {args.title}",
            description=f"{script[:900]}\n\nSource: {video.source_url}\n\n#Shorts #TamilShorts #Tamil",
            tags=config.get("telegram_upload_tags", ["Tamil Shorts", "Shorts", "Tamil"]),
            category_id=str(config.get("telegram_youtube_category_id", "1")),
            privacy=str(config.get("upload_privacy", "public")),
            made_for_kids=bool(config.get("upload_made_for_kids", False)),
            public_stats_viewable=bool(config.get("upload_public_stats_viewable", True)),
        )
        print(f"UPLOAD_URL={result.get('url')}")
        print(f"VIDEO_ID={result.get('video_id')}")


if __name__ == "__main__":
    asyncio.run(main())
