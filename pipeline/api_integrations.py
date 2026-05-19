
"""
GHOSTPIPE v5.0 - AI Service Router & API Integrations
Handles all external API calls with fallback chains, rate limiting, and error recovery
"""

import asyncio
import aiohttp
import json
import os
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
import base64
from datetime import datetime, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

class ServiceStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    RATE_LIMITED = "rate_limited"

@dataclass
class APIResponse:
    success: bool
    data: Any
    latency_ms: float
    service: str
    fallback_used: bool
    error: Optional[str] = None


class RateLimiter:
    """Token bucket rate limiter per service"""

    def __init__(self, requests_per_minute: int):
        self.capacity = requests_per_minute
        self.tokens = requests_per_minute
        self.last_update = datetime.now()
        self.lock = asyncio.Lock()

    async def acquire(self):
        async with self.lock:
            now = datetime.now()
            elapsed = (now - self.last_update).total_seconds()
            self.tokens = min(self.capacity, self.tokens + elapsed * (self.capacity / 60))
            self.last_update = now

            if self.tokens < 1:
                wait_time = (1 - self.tokens) * (60 / self.capacity)
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1


class AIServiceRouter:
    """
    Intelligent router for AI services with health monitoring and fallback chains
    """

    def __init__(self):
        self.services = {
            # LLM Services
            "claude": {
                "endpoint": "https://api.anthropic.com/v1/messages",
                "key": os.getenv("ANTHROPIC_API_KEY"),
                "rpm": 50,
                "status": ServiceStatus.HEALTHY,
                "priority": 1
            },
            "openai": {
                "endpoint": "https://api.openai.com/v1/chat/completions",
                "key": os.getenv("OPENAI_API_KEY"),
                "rpm": 60,
                "status": ServiceStatus.HEALTHY,
                "priority": 2
            },
            "gemini": {
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
                "key": os.getenv("GOOGLE_API_KEY"),
                "rpm": 60,
                "status": ServiceStatus.HEALTHY,
                "priority": 3
            },
            # Image Generation
            "flux": {
                "endpoint": "https://api.bfl.ml/v1/flux-ultra",
                "key": os.getenv("BFL_API_KEY"),
                "rpm": 10,
                "status": ServiceStatus.HEALTHY,
                "priority": 1
            },
            "midjourney": {
                "endpoint": "https://api.midjourney.com/v1/imagine",
                "key": os.getenv("MIDJOURNEY_API_KEY"),
                "rpm": 5,
                "status": ServiceStatus.HEALTHY,
                "priority": 2
            },
            # Video Generation
            "kling": {
                "endpoint": "https://api.klingai.com/v1/videos",
                "key": os.getenv("KLING_API_KEY"),
                "rpm": 3,
                "status": ServiceStatus.HEALTHY,
                "priority": 1
            },
            "luma": {
                "endpoint": "https://api.lumalabs.ai/dream-machine/v1/generations",
                "key": os.getenv("LUMA_API_KEY"),
                "rpm": 5,
                "status": ServiceStatus.HEALTHY,
                "priority": 2
            },
            "runway": {
                "endpoint": "https://api.runwayml.com/v1/generations",
                "key": os.getenv("RUNWAY_API_KEY"),
                "rpm": 5,
                "status": ServiceStatus.HEALTHY,
                "priority": 3
            },
            # Voice
            "elevenlabs": {
                "endpoint": "https://api.elevenlabs.io/v1/text-to-speech",
                "key": os.getenv("ELEVENLABS_API_KEY"),
                "rpm": 30,
                "status": ServiceStatus.HEALTHY,
                "priority": 1
            },
            # Music
            "suno": {
                "endpoint": "https://api.suno.ai/v1/generations",
                "key": os.getenv("SUNO_API_KEY"),
                "rpm": 5,
                "status": ServiceStatus.HEALTHY,
                "priority": 1
            },
            "udio": {
                "endpoint": "https://api.udio.com/v1/generations",
                "key": os.getenv("UDIO_API_KEY"),
                "rpm": 5,
                "status": ServiceStatus.HEALTHY,
                "priority": 2
            }
        }

        self.limiters = {name: RateLimiter(config["rpm"]) for name, config in self.services.items()}
        self.health_history = {name: [] for name in self.services}

    async def call_with_fallback(self, 
                                service_category: str, 
                                prompt: dict,
                                timeout: int = 120) -> APIResponse:
        """
        Call AI service with automatic fallback chain
        Categories: llm, image, video, voice, music
        """
        candidates = self._get_candidates(service_category)

        for service_name in candidates:
            if self.services[service_name]["status"] == ServiceStatus.DOWN:
                continue

            try:
                start = datetime.now()
                await self.limiters[service_name].acquire()

                result = await self._execute_call(service_name, prompt, timeout)

                latency = (datetime.now() - start).total_seconds() * 1000
                self._record_health(service_name, True, latency)

                return APIResponse(
                    success=True,
                    data=result,
                    latency_ms=latency,
                    service=service_name,
                    fallback_used=service_name != candidates[0]
                )

            except Exception as e:
                self._record_health(service_name, False, 0, str(e))
                if "rate limit" in str(e).lower():
                    self.services[service_name]["status"] = ServiceStatus.RATE_LIMITED
                    await asyncio.sleep(60)
                continue

        return APIResponse(
            success=False,
            data=None,
            latency_ms=0,
            service="none",
            fallback_used=True,
            error="All services failed"
        )

    def _get_candidates(self, category: str) -> List[str]:
        """Get prioritized list of services for category"""
        mapping = {
            "llm": ["claude", "openai", "gemini"],
            "image": ["flux", "midjourney"],
            "video": ["kling", "luma", "runway"],
            "voice": ["elevenlabs"],
            "music": ["suno", "udio"]
        }
        return mapping.get(category, [])

    async def _execute_call(self, service: str, prompt: dict, timeout: int):
        """Execute specific API call"""
        config = self.services[service]

        async with aiohttp.ClientSession() as session:
            headers = {"Authorization": f"Bearer {config['key']}", "Content-Type": "application/json"}

            if service == "claude":
                payload = {
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": prompt.get("text", "")}]
                }
            elif service == "openai":
                payload = {
                    "model": "gpt-4o",
                    "messages": [{"role": "user", "content": prompt.get("text", "")}],
                    "temperature": 0.7
                }
            elif service == "elevenlabs":
                headers = {"xi-api-key": config["key"], "Content-Type": "application/json"}
                payload = {
                    "text": prompt.get("text", ""),
                    "model_id": "eleven_turbo_v2_5",
                    "voice_settings": {
                        "stability": prompt.get("stability", 0.5),
                        "similarity_boost": prompt.get("similarity", 0.75),
                        "style": prompt.get("style", 0.3)
                    }
                }
            elif service in ["kling", "luma", "runway"]:
                payload = {
                    "prompt": prompt.get("text", ""),
                    "duration": prompt.get("duration", 5),
                    "aspect_ratio": "9:16"
                }
            elif service in ["suno", "udio"]:
                payload = {
                    "prompt": prompt.get("text", ""),
                    "duration": prompt.get("duration", 30),
                    "tags": prompt.get("tags", ["electronic", "upbeat"])
                }
            else:
                payload = prompt

            async with session.post(config["endpoint"], json=payload, headers=headers, timeout=timeout) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    text = await resp.text()
                    raise Exception(f"HTTP {resp.status}: {text}")

    def _record_health(self, service: str, success: bool, latency: float, error: str = None):
        """Record service health metrics"""
        self.health_history[service].append({
            "timestamp": datetime.now().isoformat(),
            "success": success,
            "latency": latency,
            "error": error
        })
        # Keep last 100 records
        self.health_history[service] = self.health_history[service][-100:]

        # Update status based on recent history
        recent = self.health_history[service][-10:]
        success_rate = sum(1 for r in recent if r["success"]) / len(recent) if recent else 1

        if success_rate < 0.3:
            self.services[service]["status"] = ServiceStatus.DOWN
        elif success_rate < 0.7:
            self.services[service]["status"] = ServiceStatus.DEGRADED
        else:
            self.services[service]["status"] = ServiceStatus.HEALTHY


# ============================================================================
# YOUTUBE API INTEGRATION
# ============================================================================

class YouTubePublisher:
    """YouTube Data API v3 integration with OAuth2 automation"""

    def __init__(
        self,
        credentials_path: str = "youtube_credentials.json",
        client_secrets_path: str = "client_secrets.json"
    ):
        self.credentials_path = credentials_path
        self.client_secrets_path = client_secrets_path
        self.base_scopes = [
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/youtube.force-ssl"
        ]
        self.analytics_scope = "https://www.googleapis.com/auth/yt-analytics.readonly"
        self.scopes = [*self.base_scopes, self.analytics_scope]

    def _load_credentials(self, include_analytics: bool = False):
        """Load OAuth credentials from a JSON file or YOUTUBE_* environment vars."""
        from google.oauth2.credentials import Credentials
        scopes = self.scopes if include_analytics else self.base_scopes

        if Path(self.credentials_path).exists():
            credentials = Credentials.from_authorized_user_file(self.credentials_path, scopes)
            if include_analytics and self.analytics_scope not in set(credentials.scopes or []):
                raise PermissionError(
                    "YouTube Analytics scope is missing. Re-run `python scripts/youtube_oauth_setup.py` "
                    "to grant yt-analytics.readonly."
                )
            return credentials

        client_id = os.getenv("YOUTUBE_CLIENT_ID")
        client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
        refresh_token = os.getenv("YOUTUBE_REFRESH_TOKEN")
        if client_id and client_secret and refresh_token:
            return Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=scopes,
            )

        raise FileNotFoundError(
            f"YouTube OAuth is not configured. Run `python scripts/youtube_oauth_setup.py` "
            f"to create {self.credentials_path} from {self.client_secrets_path}, or set "
            "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env."
        )

    async def upload_short(self, 
                          video_path: str,
                          title: str,
                          description: str,
                          tags: List[str],
                          category_id: str = "22",  # People & Blogs
                          privacy: str = "public",
                          made_for_kids: bool = False,
                          schedule_time: Optional[datetime] = None) -> dict:
        """
        Upload video to YouTube as Short
        Returns: {video_id, url, status}
        """
        # Implementation using google-api-python-client
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        creds = self._load_credentials()
        youtube = build("youtube", "v3", credentials=creds)

        body = {
            "snippet": {
                "title": title,
                "description": description,
                "tags": tags,
                "categoryId": category_id
            },
            "status": {
                "privacyStatus": "private" if schedule_time else privacy,
                "madeForKids": made_for_kids,
                "selfDeclaredMadeForKids": made_for_kids
            }
        }

        if schedule_time:
            body["status"]["publishAt"] = schedule_time.isoformat() + "Z"

        media = MediaFileUpload(video_path, 
                               chunksize=-1, 
                               resumable=True,
                               mimetype="video/mp4")

        request = youtube.videos().insert(
            part=",".join(body.keys()),
            body=body,
            media_body=media
        )

        response = request.execute()

        return {
            "video_id": response["id"],
            "url": f"https://youtube.com/shorts/{response['id']}",
            "status": "uploaded",
            "scheduled": schedule_time is not None
        }

    async def update_thumbnail(self, video_id: str, thumbnail_path: str):
        """Upload custom thumbnail"""
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        creds = self._load_credentials()
        youtube = build("youtube", "v3", credentials=creds)

        media = MediaFileUpload(thumbnail_path, mimetype="image/png")
        youtube.thumbnails().set(videoId=video_id, media_body=media).execute()

    async def add_to_playlist(self, video_id: str, playlist_id: str):
        """Add video to playlist"""
        from googleapiclient.discovery import build
        creds = self._load_credentials()
        youtube = build("youtube", "v3", credentials=creds)

        response = youtube.playlistItems().insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {
                        "kind": "youtube#video",
                        "videoId": video_id,
                    },
                }
            },
        ).execute()
        return {"status": "added", "playlist_id": playlist_id, "item_id": response.get("id")}

    async def post_comment(self, video_id: str, text: str) -> dict:
        """Post a first/top-level comment to encourage discussion."""
        if not text.strip():
            return {"status": "skipped", "reason": "empty comment"}

        from googleapiclient.discovery import build
        creds = self._load_credentials()
        youtube = build("youtube", "v3", credentials=creds)

        response = youtube.commentThreads().insert(
            part="snippet",
            body={
                "snippet": {
                    "videoId": video_id,
                    "topLevelComment": {
                        "snippet": {
                            "textOriginal": text[:10000],
                        }
                    },
                }
            },
        ).execute()
        return {"status": "commented", "comment_id": response.get("id")}

    async def get_video_metrics(self, video_id: str, analytics_days: int = 28, include_analytics: bool = True) -> dict:
        """Fetch YouTube Data + Analytics performance metrics for learning memory."""
        from googleapiclient.discovery import build
        creds = self._load_credentials()
        youtube = build("youtube", "v3", credentials=creds)

        response = youtube.videos().list(
            part="statistics,snippet",
            id=video_id,
        ).execute()
        items = response.get("items", [])
        if not items:
            return {"video_id": video_id, "views": 0, "likes": 0, "comments": 0}

        stats = items[0].get("statistics", {})
        metrics = {
            "video_id": video_id,
            "title": items[0].get("snippet", {}).get("title", ""),
            "views": int(stats.get("viewCount", 0) or 0),
            "likes": int(stats.get("likeCount", 0) or 0),
            "comments": int(stats.get("commentCount", 0) or 0),
        }
        if include_analytics:
            metrics.update(await self.get_video_analytics(video_id, days=analytics_days))
        else:
            metrics["analytics_available"] = False
        return metrics

    async def get_video_analytics(self, video_id: str, days: int = 28) -> dict:
        """Fetch retention/watch analytics for one uploaded video.

        Uses YouTube Analytics reports.query with video as a filter and the
        channel owner id `channel==MINE`.
        """
        from googleapiclient.discovery import build
        end = datetime.utcnow().date() - timedelta(days=1)
        start = end - timedelta(days=days)
        metrics = [
            "views",
            "estimatedMinutesWatched",
            "averageViewDuration",
            "averageViewPercentage",
            "likes",
            "comments",
            "shares",
            "subscribersGained",
        ]

        try:
            creds = self._load_credentials(include_analytics=True)
            analytics = build("youtubeAnalytics", "v2", credentials=creds, cache_discovery=False)
            response = analytics.reports().query(
                ids="channel==MINE",
                startDate=start.isoformat(),
                endDate=end.isoformat(),
                metrics=",".join(metrics),
                filters=f"video=={video_id}",
            ).execute()
            rows = response.get("rows", [])
            if not rows:
                return {
                    "analytics_available": False,
                    "analytics_start_date": start.isoformat(),
                    "analytics_end_date": end.isoformat(),
                }
            values = rows[0]
            data = dict(zip(metrics, values))
            return {
                "analytics_available": True,
                "analytics_start_date": start.isoformat(),
                "analytics_end_date": end.isoformat(),
                "watch_time_minutes": float(data.get("estimatedMinutesWatched", 0) or 0),
                "average_view_duration": float(data.get("averageViewDuration", 0) or 0),
                "average_view_percentage": float(data.get("averageViewPercentage", 0) or 0),
                "shares": int(data.get("shares", 0) or 0),
                "subscribers_gained": int(data.get("subscribersGained", 0) or 0),
                "analytics_views": int(data.get("views", 0) or 0),
                "analytics_likes": int(data.get("likes", 0) or 0),
                "analytics_comments": int(data.get("comments", 0) or 0),
            }
        except Exception as e:
            message = str(e)
            if "accessNotConfigured" in message or "has not been used" in message:
                message = "YouTube Analytics API is not enabled for this Google Cloud project."
            return {
                "analytics_available": False,
                "analytics_error": message,
                "analytics_start_date": start.isoformat(),
                "analytics_end_date": end.isoformat(),
            }

    async def post_community(self, text: str, image_path: Optional[str] = None):
        """Post to Community tab"""
        return {
            "status": "unsupported",
            "reason": "YouTube Data API does not expose Community post publishing.",
            "text": text,
            "image_path": image_path,
        }


# ============================================================================
# TREND DATA SOURCES
# ============================================================================

class TrendDataSources:
    """Unified interface for all trend data sources"""

    def __init__(self):
        self.router = AIServiceRouter()
        self.cache = {}
        self.cache_ttl = 300  # 5 minutes

    async def get_youtube_trending(self, region: str = "US") -> List[dict]:
        """Get YouTube trending topics"""
        api_key = os.getenv("YOUTUBE_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return []

        from googleapiclient.discovery import build

        youtube = build("youtube", "v3", developerKey=api_key, cache_discovery=False)
        response = youtube.videos().list(
            part="snippet,statistics,contentDetails",
            chart="mostPopular",
            regionCode=region,
            maxResults=25,
        ).execute()

        videos = []
        for item in response.get("items", []):
            stats = item.get("statistics", {})
            snippet = item.get("snippet", {})
            views = int(stats.get("viewCount", 0) or 0)
            published_at = snippet.get("publishedAt")
            velocity = views
            if published_at:
                published = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                age_hours = max((datetime.now(published.tzinfo) - published).total_seconds() / 3600, 1)
                velocity = views / age_hours
            videos.append({
                "video_id": item.get("id"),
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "views": views,
                "category": snippet.get("categoryId", ""),
                "velocity": velocity,
                "url": f"https://youtube.com/watch?v={item.get('id')}",
            })
        return videos

    async def get_tiktok_trends(self) -> List[dict]:
        """Get TikTok trending sounds/hashtags"""
        return []

    async def get_reddit_rising(self, subreddits: List[str] = None) -> List[dict]:
        """Get rising posts from Reddit"""
        import asyncpraw
        reddit = asyncpraw.Reddit(
            client_id=os.getenv("REDDIT_CLIENT_ID"),
            client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
            user_agent="GhostPipe/5.0"
        )

        posts = []
        subreddits = subreddits or ["all", "popular", "trending"]

        for sub_name in subreddits:
            subreddit = await reddit.subreddit(sub_name)
            async for post in subreddit.rising(limit=10):
                posts.append({
                    "title": post.title,
                    "subreddit": post.subreddit.display_name,
                    "upvotes": post.ups,
                    "comments": post.num_comments,
                    "upvote_ratio": post.upvote_ratio,
                    "url": post.url,
                    "created": post.created_utc
                })

        await reddit.close()
        return posts

    async def get_google_trends(self, keywords: List[str] = None) -> List[dict]:
        """Get Google Trends data"""
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=360)

        if keywords:
            pytrends.build_payload(keywords, cat=0, timeframe="now 1-d", geo="US")
            data = pytrends.interest_over_time()
            return data.to_dict("records")
        else:
            # Get trending searches
            trending = pytrends.trending_searches(pn="united_states")
            return [{"topic": row[0]} for _, row in trending.iterrows()]

    async def get_news_headlines(self, category: str = "technology") -> List[dict]:
        """Get breaking news headlines"""
        api_key = os.getenv("NEWSAPI_KEY")
        url = f"https://newsapi.org/v2/top-headlines?category={category}&apiKey={api_key}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                data = await resp.json()
                return [
                    {
                        "title": article["title"],
                        "source": article["source"]["name"],
                        "description": article["description"],
                        "url": article["url"],
                        "published": article["publishedAt"]
                    }
                    for article in data.get("articles", [])
                ]


# ============================================================================
# STOCK ASSET APIs
# ============================================================================

class StockAssetManager:
    """CC0 and royalty-free asset sourcing"""

    async def search_pexels(self, query: str, per_page: int = 10) -> List[dict]:
        """Search Pexels for CC0 videos/images"""
        api_key = os.getenv("PEXELS_API_KEY")
        url = f"https://api.pexels.com/videos/search?query={query}&per_page={per_page}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers={"Authorization": api_key}) as resp:
                data = await resp.json()
                return [
                    {
                        "id": video["id"],
                        "url": video["video_files"][0]["link"],
                        "duration": video["duration"],
                        "quality": video["video_files"][0]["quality"]
                    }
                    for video in data.get("videos", [])
                ]

    async def search_pixabay(self, query: str, per_page: int = 10) -> List[dict]:
        """Search Pixabay for CC0 content"""
        api_key = os.getenv("PIXABAY_API_KEY")
        url = f"https://pixabay.com/api/videos/?key={api_key}&q={query}&per_page={per_page}"

        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                data = await resp.json()
                return [
                    {
                        "id": hit["id"],
                        "url": hit["videos"]["medium"]["url"],
                        "duration": hit["duration"],
                        "tags": hit["tags"]
                    }
                    for hit in data.get("hits", [])
                ]

    async def get_epidemic_sound(self, mood: str, genre: str, tempo: int) -> dict:
        """Get royalty-free music from Epidemic Sound"""
        return {
            "status": "unconfigured",
            "reason": "Epidemic Sound API access is not configured for this project.",
            "mood": mood,
            "genre": genre,
            "tempo": tempo,
        }
