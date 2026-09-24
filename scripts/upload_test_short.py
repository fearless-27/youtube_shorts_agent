import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from api_integrations import YouTubePublisher
from telegram_tamil_shorts_pipeline import load_config


async def main():
    config = load_config()
    outputs_dir = PROJECT_ROOT / "outputs"
    videos = sorted(outputs_dir.glob("telegram_tamil_*.mp4"))
    if not videos:
        print("No rendered video found in outputs directory.")
        return

    video_path = str(videos[0])
    print(f"Uploading target video: {video_path}")

    publisher = YouTubePublisher(
        credentials_path=config.get("youtube_credentials_path", str(PROJECT_ROOT / "youtube_credentials.json")),
        client_secrets_path=config.get("youtube_client_secrets_path", str(PROJECT_ROOT / "client_secrets.json")),
    )

    result = await publisher.upload_short(
        video_path=video_path,
        title="Shinchan Tamil Short | MEP Shorts #Shorts",
        description="Shinchan Tamil Short Clip\n\n#Shorts #ShinchanTamil #TamilShorts #AnimeTamil",
        tags=["Shinchan Tamil", "Shinchan", "Tamil Shorts", "Shorts", "Anime Tamil"],
        category_id="1",
        privacy=config.get("upload_privacy", "public"),
        made_for_kids=False,
        public_stats_viewable=True,
    )
    print("Upload Result:")
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
