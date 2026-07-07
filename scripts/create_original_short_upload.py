import asyncio
import math
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

from api_integrations import YouTubePublisher

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")


WIDTH = 1080
HEIGHT = 1920
FPS = 24
SLIDE_SECONDS = 4.5


def font(size: int, bold: bool = False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.ImageFont, max_width: int) -> list[str]:
    lines = []
    current = ""
    for word in text.split():
        test = f"{current} {word}".strip()
        if draw.textbbox((0, 0), test, font=face)[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def make_slide(index: int, headline: str, body: str, accent: tuple[int, int, int]) -> np.ndarray:
    image = Image.new("RGB", (WIDTH, HEIGHT), (14, 18, 24))
    draw = ImageDraw.Draw(image)

    for y in range(HEIGHT):
        blend = y / HEIGHT
        r = int(14 + blend * 14 + accent[0] * 0.08)
        g = int(18 + blend * 18 + accent[1] * 0.07)
        b = int(24 + blend * 28 + accent[2] * 0.05)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))

    draw.rounded_rectangle((70, 90, 250, 150), radius=24, fill=accent)
    draw.text((105, 110), f"0{index}", font=font(30, True), fill=(8, 12, 16))

    title_font = font(88, True)
    body_font = font(48)
    small_font = font(34, True)

    y = 330
    for line in wrap(draw, headline, title_font, 900):
        draw.text((70, y), line, font=title_font, fill=(248, 250, 252))
        y += 106

    y += 55
    for line in wrap(draw, body, body_font, 900):
        draw.text((72, y), line, font=body_font, fill=(216, 226, 238))
        y += 66

    draw.line((70, 1650, 1010, 1650), fill=accent, width=8)
    draw.text((70, 1690), "Save this for your next upload.", font=small_font, fill=(248, 250, 252))
    return np.array(image)


def make_video(output_path: Path):
    from moviepy.audio.AudioClip import AudioArrayClip
    from moviepy.editor import ImageClip, concatenate_videoclips

    slides = [
        ("Your next Short needs one clear promise", "Say what the viewer gets in the first two seconds.", (82, 211, 255)),
        ("Cut anything that explains too slowly", "Shorts reward momentum. One idea, one punch, one payoff.", (255, 204, 102)),
        ("End with a reason to come back", "A useful pattern beats a loud ending every time.", (126, 231, 135)),
        ("Tiny upload checklist", "Hook. Pace. Payoff. Title. Thumbnail. Then publish.", (255, 129, 173)),
    ]

    clips = []
    for idx, (headline, body, accent) in enumerate(slides, start=1):
        clips.append(ImageClip(make_slide(idx, headline, body, accent)).set_duration(SLIDE_SECONDS))
    video = concatenate_videoclips(clips, method="compose")

    duration = video.duration
    sample_rate = 44100
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    beat = np.zeros_like(t)
    for start in np.arange(0, duration, 0.75):
        envelope = np.exp(-38 * np.maximum(t - start, 0)) * (t >= start)
        beat += 0.18 * np.sin(2 * math.pi * 118 * t) * envelope
    pad = 0.035 * np.sin(2 * math.pi * 220 * t) + 0.025 * np.sin(2 * math.pi * 330 * t)
    audio = np.clip(beat + pad, -0.35, 0.35)
    stereo = np.column_stack([audio, audio])
    video = video.set_audio(AudioArrayClip(stereo, fps=sample_rate))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    video.write_videofile(
        str(output_path),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        preset="medium",
        threads=4,
        logger=None,
    )
    video.close()


async def main():
    stamp = int(time.time())
    video_path = PROJECT_ROOT / "outputs" / f"original_short_upload_checklist_{stamp}.mp4"
    make_video(video_path)

    publisher = YouTubePublisher(
        credentials_path=str(PROJECT_ROOT / "youtube_credentials.json"),
        client_secrets_path=str(PROJECT_ROOT / "client_secrets.json"),
    )
    result = await publisher.upload_short(
        video_path=str(video_path),
        title="Tiny Upload Checklist for Better Shorts",
        description=(
            "A quick original checklist for making stronger Shorts: hook, pace, payoff, title, thumbnail, publish.\n\n"
            "#Shorts #CreatorTips #YouTubeTips"
        ),
        tags=["Shorts", "Creator Tips", "YouTube Tips", "Content Creation", "Upload Checklist"],
        category_id="27",
        privacy="public",
        made_for_kids=False,
        public_stats_viewable=True,
    )
    print(f"VIDEO_PATH={video_path}")
    print(f"UPLOAD_URL={result.get('url')}")
    print(f"VIDEO_ID={result.get('video_id')}")


if __name__ == "__main__":
    asyncio.run(main())
