from pathlib import Path
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from googleapiclient.discovery import build
from api_integrations import YouTubePublisher


publisher = YouTubePublisher(
    credentials_path=str(PROJECT_ROOT / "youtube_credentials.json"),
    client_secrets_path=str(PROJECT_ROOT / "client_secrets.json"),
)
creds = publisher._load_credentials()
youtube = build("youtube", "v3", credentials=creds)

response = youtube.search().list(
    part="snippet",
    forMine=True,
    type="video",
    order="date",
    maxResults=5,
).execute()

for item in response.get("items", []):
    video_id = item["id"]["videoId"]
    snippet = item.get("snippet", {})
    print(f"{snippet.get('publishedAt')} | {video_id} | {snippet.get('title')}")
    print(f"https://youtube.com/shorts/{video_id}")
