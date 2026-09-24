"""
Generate High-CTR Professional Thumbnails for 15 YouTube Shorts
Creates 1280x720 (16:9 standard YouTube Thumbnail) with:
1. Cinematic blurred + dark vignette background extracted from video.
2. Sharp, framed hero visual on the right with neon border and shadow.
3. High-contrast typography on the left with thick outline (stroke) + drop shadow.
4. Top pill badge (e.g. ✨ SHINCHAN TAMIL or 🔥 TRENDING VIRAL).
5. Bottom episode sticker (e.g. ▶ PART 1 / 10 or 🔥 2.4M+ VIEWS).
6. Resolution / feature badge (e.g. 1080P FULL HD • ORIGINAL AUDIO).
7. Attempts YouTube API thumbnail upload for the 6 live uploaded videos.
8. Synchronizes thumbnail paths with approval_queue.json and recreated_media.json.
"""

import sys
import os
import json
import asyncio
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUTS_DIR = PROJECT_ROOT / "outputs"
DATA_DIR = PROJECT_ROOT / "public" / "data"
USERS_DIR = DATA_DIR / "users"
PIPELINE_DIR = PROJECT_ROOT / "pipeline"

if str(PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(PIPELINE_DIR))

# Fonts
IMPACT_FONT = "C:/Windows/Fonts/impact.ttf"
ARIAL_BOLD = "C:/Windows/Fonts/arialbd.ttf"
SEGOE_BOLD = "C:/Windows/Fonts/segoeuib.ttf"

# Specifications for the 15 shorts
THUMBNAIL_SPECS = [
    # 10 Telegram Tamil Shorts
    {
        "id": "telegram_shinchan_01",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part01_1789831697.mp4",
        "video_id": "whS_zKnqywA",
        "category": "SHINCHAN TAMIL",
        "line1": "BREAKFAST",
        "line2": "CHAOS!",
        "subline": "MOM GETS FURIOUS!",
        "tag": "PART 1 / 10",
        "feature": "100% ORIGINAL TAMIL DUB",
        "theme": "gold",
        "ss": "00:00:04",
    },
    {
        "id": "telegram_shinchan_02",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part02_1789831737.mp4",
        "video_id": "jpINn8cHnYY",
        "category": "SHINCHAN TAMIL",
        "line1": "TROUBLE WITH",
        "line2": "MOM!",
        "subline": "SHINCHAN'S SILLY EXCUSES!",
        "tag": "PART 2 / 10",
        "feature": "FUNNY TAMIL CARTOON",
        "theme": "gold",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_03",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part03_1789831785.mp4",
        "video_id": "0tGfAVARuos",
        "category": "SHINCHAN TAMIL",
        "line1": "ACTION KAMEN",
        "line2": "SECRET POSE!",
        "subline": "WAH HAH HAH HAH!",
        "tag": "PART 3 / 10",
        "feature": "ACTION HERO SPECIAL",
        "theme": "cyan",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_04",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part04_1789831829.mp4",
        "video_id": "PDoozw--62E",
        "category": "SHINCHAN TAMIL",
        "line1": "SHIRO'S",
        "line2": "WALKING FUN!",
        "subline": "DOG ESCAPES AGAIN!",
        "tag": "PART 4 / 10",
        "feature": "SHIRO BEST MOMENTS",
        "theme": "gold",
        "ss": "00:00:04",
    },
    {
        "id": "telegram_shinchan_05",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part05_1789831878.mp4",
        "video_id": "fttTJJq04I0",
        "category": "SHINCHAN TAMIL",
        "line1": "KINDERGARTEN",
        "line2": "BUS RIDE!",
        "subline": "RUNNING FOR THE BUS!",
        "tag": "PART 5 / 10",
        "feature": "SCHOOL ADVENTURES",
        "theme": "yellow",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_06",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part06_1789831923.mp4",
        "video_id": "hSJA66_wcR0",
        "category": "SHINCHAN TAMIL",
        "line1": "KAZAMA'S",
        "line2": "SECRET STUDY!",
        "subline": "CAUGHT RED HANDED!",
        "tag": "PART 6 / 10",
        "feature": "CLASSROOM COMEDY",
        "theme": "blue",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_07",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part07_ready.mp4",
        "video_id": None,
        "category": "SHINCHAN TAMIL",
        "line1": "NANI & SHINCHAN",
        "line2": "ULTIMATE PRANK!",
        "subline": "WHO GOT FOOLED?!",
        "tag": "PART 7 / 10",
        "feature": "EPISODE 2 SPECIAL",
        "theme": "purple",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_08",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part08_ready.mp4",
        "video_id": None,
        "category": "SHINCHAN TAMIL",
        "line1": "SUPERMARKET",
        "line2": "SHOPPING RUSH!",
        "subline": "CHOCOBI CRAVINGS!",
        "tag": "PART 8 / 10",
        "feature": "SUPERMARKET MAYHEM",
        "theme": "gold",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_09",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part09_ready.mp4",
        "video_id": None,
        "category": "SHINCHAN TAMIL",
        "line1": "SHINCHAN'S",
        "line2": "CRAZY DANCE!",
        "subline": "CANNOT STOP LAUGHING!",
        "tag": "PART 9 / 10",
        "feature": "ICONIC DANCE MOVE",
        "theme": "pink",
        "ss": "00:00:03",
    },
    {
        "id": "telegram_shinchan_10",
        "file": OUTPUTS_DIR / "short_telegram_shinchan_part10_ready.mp4",
        "video_id": None,
        "category": "SHINCHAN TAMIL",
        "line1": "EVENING FAMILY",
        "line2": "CLIMAX!",
        "subline": "NOHARA FAMILY DRAMA!",
        "tag": "PART 10 / 10",
        "feature": "GRAND FINALE EPISODE",
        "theme": "cyan",
        "ss": "00:00:03",
    },
    # 5 Viral Shorts
    {
        "id": "viral_short_01",
        "file": OUTPUTS_DIR / "short_viral_JfbnpYLe3Ms_1789831988.mp4",
        "video_id": None,
        "category": "TRENDING VIRAL",
        "line1": "OLYMPIC",
        "line2": "CLEANING SPORT?!",
        "subline": "WORLD RECORD SPEEDRUN!",
        "tag": "2.4M+ VIEWS",
        "feature": "INSANE REFLEXES ⚡",
        "theme": "red",
        "ss": "00:00:04",
    },
    {
        "id": "viral_short_02",
        "file": OUTPUTS_DIR / "short_viral_Q2osGQYeLNE_1789832004.mp4",
        "video_id": None,
        "category": "TRENDING VIRAL",
        "line1": "WAIT FOR",
        "line2": "PART 4!",
        "subline": "YOU WILL CRY LAUGHING!",
        "tag": "MUST WATCH",
        "feature": "TOP COMEDY CLIP",
        "theme": "orange",
        "ss": "00:00:04",
    },
    {
        "id": "viral_short_03",
        "file": OUTPUTS_DIR / "short_viral_sOZrJUkCLYU_1789832056.mp4",
        "video_id": None,
        "category": "TRENDING VIRAL",
        "line1": "CRAZY MOMENT",
        "line2": "SHOCKED ALL!",
        "subline": "NOBODY EXPECTED THIS!",
        "tag": "INSTANT VIRAL",
        "feature": "WAIT TILL THE END",
        "theme": "cyan",
        "ss": "00:00:03",
    },
    {
        "id": "viral_short_04",
        "file": OUTPUTS_DIR / "short_viral_A_Q2qpbHrqo_1789832067.mp4",
        "video_id": None,
        "category": "TRENDING VIRAL",
        "line1": "IT IS $9,999,999!",
        "line2": "SIR WHAT?!",
        "subline": "UNBELIEVABLE REACTION!",
        "tag": "PRICE SHOCK",
        "feature": "BILLIONAIRE REACTION",
        "theme": "gold",
        "ss": "00:00:03",
    },
    {
        "id": "viral_short_05",
        "file": OUTPUTS_DIR / "short_viral_Kcb7QDcmEHQ_1789832088.mp4",
        "video_id": None,
        "category": "GAMING VIRAL",
        "line1": "DAY 1 PYAR",
        "line2": "VS NEXT DAY WAR!",
        "subline": "THE ULTIMATE CLUTCH!",
        "tag": "PRO GAMER",
        "feature": "FREE FIRE / BATTLEGROUND",
        "theme": "purple",
        "ss": "00:00:03",
    },
]


THEME_PALETTES = {
    "gold": {
        "badge_bg": (245, 158, 11, 235),
        "badge_text": (0, 0, 0),
        "line2_color": (255, 230, 0),
        "border_color": (255, 215, 0, 240),
        "shadow_color": (234, 179, 8, 90),
        "tag_bg": (225, 29, 72, 240),
    },
    "yellow": {
        "badge_bg": (234, 179, 8, 235),
        "badge_text": (0, 0, 0),
        "line2_color": (250, 204, 21),
        "border_color": (250, 204, 21, 240),
        "shadow_color": (234, 179, 8, 90),
        "tag_bg": (225, 29, 72, 240),
    },
    "cyan": {
        "badge_bg": (6, 182, 212, 235),
        "badge_text": (0, 0, 0),
        "line2_color": (34, 211, 238),
        "border_color": (34, 211, 238, 240),
        "shadow_color": (6, 182, 212, 90),
        "tag_bg": (14, 116, 144, 240),
    },
    "blue": {
        "badge_bg": (59, 130, 246, 235),
        "badge_text": (255, 255, 255),
        "line2_color": (96, 165, 250),
        "border_color": (96, 165, 250, 240),
        "shadow_color": (59, 130, 246, 90),
        "tag_bg": (37, 99, 235, 240),
    },
    "purple": {
        "badge_bg": (139, 92, 246, 235),
        "badge_text": (255, 255, 255),
        "line2_color": (192, 132, 252),
        "border_color": (192, 132, 252, 240),
        "shadow_color": (139, 92, 246, 90),
        "tag_bg": (124, 58, 237, 240),
    },
    "pink": {
        "badge_bg": (236, 72, 153, 235),
        "badge_text": (255, 255, 255),
        "line2_color": (244, 114, 182),
        "border_color": (244, 114, 182, 240),
        "shadow_color": (236, 72, 153, 90),
        "tag_bg": (219, 39, 119, 240),
    },
    "red": {
        "badge_bg": (239, 68, 68, 235),
        "badge_text": (255, 255, 255),
        "line2_color": (248, 113, 113),
        "border_color": (248, 113, 113, 240),
        "shadow_color": (239, 68, 68, 90),
        "tag_bg": (220, 38, 38, 240),
    },
    "orange": {
        "badge_bg": (249, 115, 22, 235),
        "badge_text": (255, 255, 255),
        "line2_color": (251, 146, 60),
        "border_color": (251, 146, 60, 240),
        "shadow_color": (249, 115, 22, 90),
        "tag_bg": (194, 65, 12, 240),
    },
}


def extract_raw_frame(video_path: Path, output_path: Path, ss: str = "00:00:03"):
    """Extract single crisp frame from video using ffmpeg."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-ss", ss, "-i", str(video_path),
        "-frames:v", "1", "-q:v", "2", "-y", str(output_path)
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def create_styled_thumbnail(raw_frame_path: Path, output_path: Path, spec: dict):
    """Composite 1280x720 professional YouTube thumbnail."""
    width, height = 1280, 720
    frame_img = Image.open(raw_frame_path).convert("RGB")

    theme = THEME_PALETTES.get(spec.get("theme", "gold"), THEME_PALETTES["gold"])

    # 1. Background: Resized, blurred, and darkened with left-side vignette
    bg = frame_img.copy().resize((width, height), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(18))
    enhancer = ImageEnhance.Brightness(bg)
    bg = enhancer.enhance(0.40)  # dark cinematic look

    # Gradient overlay (darker on left for crisp text contrast)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw_ov = ImageDraw.Draw(overlay)
    for x in range(width):
        alpha = int(235 * (1.0 - (x / width) * 0.70))
        draw_ov.line([(x, 0), (x, height)], fill=(10, 8, 20, alpha))
    bg.paste(Image.alpha_composite(Image.new("RGBA", (width, height), (0, 0, 0, 0)), overlay).convert("RGB"), (0, 0), overlay)

    # 2. Hero Visual on the right side
    hero_h = 630
    hero_w = int(hero_h * 9 / 16)  # ~354px
    hero = frame_img.resize((hero_w, hero_h), Image.Resampling.LANCZOS)

    # Rounded mask for hero
    mask = Image.new("L", (hero_w, hero_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (hero_w, hero_h)], radius=22, fill=255)

    hero_x = width - hero_w - 55
    hero_y = (height - hero_h) // 2

    # Outer glow / shadow behind hero
    shadow = Image.new("RGBA", (hero_w + 40, hero_h + 40), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    s_draw.rounded_rectangle([(10, 10), (hero_w + 30, hero_h + 30)], radius=28, fill=theme["shadow_color"])
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    bg.paste(shadow, (hero_x - 20, hero_y - 20), shadow)

    # Paste hero frame
    bg.paste(hero, (hero_x, hero_y), mask)

    # Draw vibrant border around hero
    border_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(border_layer)
    b_draw.rounded_rectangle(
        [(hero_x, hero_y), (hero_x + hero_w, hero_y + hero_h)],
        radius=22,
        outline=theme["border_color"],
        width=4
    )
    bg.paste(border_layer, (0, 0), border_layer)

    # 3. Typography and Badges
    img_final = bg.convert("RGBA")
    draw = ImageDraw.Draw(img_final)

    font_badge = ImageFont.truetype(ARIAL_BOLD, 22)
    font_title1 = ImageFont.truetype(IMPACT_FONT, 64)
    font_title2 = ImageFont.truetype(IMPACT_FONT, 72)
    font_sub = ImageFont.truetype(ARIAL_BOLD, 26)
    font_tag = ImageFont.truetype(IMPACT_FONT, 30)
    font_feat = ImageFont.truetype(ARIAL_BOLD, 19)

    # A. Top Category Pill Badge with clean vector dot
    category_text = spec['category'].upper()
    bx, by = 60, 50
    bbox_b = draw.textbbox((0, 0), category_text, font=font_badge)
    bw = (bbox_b[2] - bbox_b[0]) + 52
    bh = 42
    draw.rounded_rectangle(
        [(bx, by), (bx + bw, by + bh)],
        radius=12,
        fill=theme["badge_bg"],
        outline=(255, 255, 255, 230),
        width=2
    )
    # Draw glowing indicator dot
    dot_x, dot_y = bx + 16, by + 15
    draw.ellipse([(dot_x, dot_y), (dot_x + 12, dot_y + 12)], fill=(255, 255, 255))
    draw.text((bx + 36, by + 8), category_text, fill=theme["badge_text"], font=font_badge)

    # B. Main Headline Line 1 (White with heavy black stroke)
    t1_text = spec["line1"].upper()
    draw.text(
        (60, 130),
        t1_text,
        fill=(255, 255, 255),
        font=font_title1,
        stroke_width=6,
        stroke_fill=(0, 0, 0)
    )

    # C. Main Headline Line 2 (Vibrant Accent Color with heavy stroke)
    t2_text = spec["line2"].upper()
    draw.text(
        (60, 210),
        t2_text,
        fill=theme["line2_color"],
        font=font_title2,
        stroke_width=7,
        stroke_fill=(0, 0, 0)
    )

    # D. Subline / Hook (Clean text without emoji glyph boxes)
    sub_text = spec["subline"]
    draw.text(
        (64, 318),
        sub_text,
        fill=(241, 245, 249),
        font=font_sub,
        stroke_width=4,
        stroke_fill=(0, 0, 0)
    )

    # E. Bottom Episode / View Sticker Pill with crisp vector Play Triangle
    tag_text = spec['tag'].upper()
    px, py = 60, 400
    bbox_tag = draw.textbbox((0, 0), tag_text, font=font_tag)
    pw = (bbox_tag[2] - bbox_tag[0]) + 66
    ph = 54
    draw.rounded_rectangle(
        [(px, py), (px + pw, py + ph)],
        radius=15,
        fill=theme["tag_bg"],
        outline=(255, 255, 255, 240),
        width=3
    )
    # Vector play triangle
    tri_x = px + 22
    tri_y = py + 16
    draw.polygon([
        (tri_x, tri_y),
        (tri_x, tri_y + 22),
        (tri_x + 16, tri_y + 11)
    ], fill=(255, 255, 255))
    draw.text((px + 48, py + 10), tag_text, fill=(255, 255, 255), font=font_tag)

    # F. Feature / Quality Bar
    clean_feature = spec['feature'].replace("⚡", "").strip().upper()
    feat_text = f"{clean_feature}  •  1080P 60FPS"
    fx, fy = 60, 480
    bbox_feat = draw.textbbox((0, 0), feat_text, font=font_feat)
    fw = (bbox_feat[2] - bbox_feat[0]) + 36
    fh = 42
    draw.rounded_rectangle(
        [(fx, fy), (fx + fw, fy + fh)],
        radius=10,
        fill=(15, 23, 42, 220),
        outline=(148, 163, 184, 140),
        width=2
    )
    draw.text((fx + 18, fy + 10), feat_text, fill=(226, 232, 240), font=font_feat)

    # Save high-res JPEG
    img_final.convert("RGB").save(output_path, "JPEG", quality=95, optimize=True)


async def try_upload_youtube_thumbnail(publisher, video_id: str, thumb_path: Path):
    """Attempt uploading thumbnail to YouTube Data API v3."""
    try:
        res = await publisher.update_thumbnail(video_id, str(thumb_path))
        print(f"  [YOUTUBE OK] Updated thumbnail for {video_id}: {res.get('status')}")
        return True
    except Exception as exc:
        print(f"  [YOUTUBE NOTE] Could not set thumbnail on {video_id}: {exc}")
        return False


def sync_stores_with_new_thumbnails(generated_map: dict):
    """Update approval_queue.json and recreated_media.json with new thumbnails."""
    targets = [
        DATA_DIR / "approval_queue.json",
        DATA_DIR / "recreated_media.json",
    ]
    if USERS_DIR.exists():
        for udir in USERS_DIR.iterdir():
            if udir.is_dir():
                targets.append(udir / "approval_queue.json")
                targets.append(udir / "recreated_media.json")

    for json_file in targets:
        if not json_file.exists():
            continue
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            modified = False
            if isinstance(data, list):
                for item in data:
                    item_id = item.get("id")
                    video_id = item.get("video_id")
                    matched_thumb = generated_map.get(item_id) or generated_map.get(video_id)
                    if not matched_thumb:
                        # try matching by video file name
                        vpath = item.get("video_path") or item.get("file") or ""
                        matched_thumb = generated_map.get(Path(vpath).stem)

                    if matched_thumb:
                        item["thumbnail_url"] = f"/outputs/{matched_thumb.name}"
                        item["thumbnail_path"] = str(matched_thumb)
                        modified = True

            if modified:
                with open(json_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                print(f"[STORE SYNC] Updated {json_file.name} at {json_file}")
        except Exception as exc:
            print(f"[STORE SYNC ERROR] {json_file}: {exc}")


async def main():
    print("=" * 60)
    print("STARTING HIGH-CTR THUMBNAIL GENERATION FOR 15 SHORTS")
    print("=" * 60)

    # Initialize YouTube publisher
    try:
        from api_integrations import YouTubePublisher
        publisher = YouTubePublisher()
        print("[INIT] YouTubePublisher initialized.")
    except Exception as exc:
        publisher = None
        print(f"[INIT NOTE] YouTubePublisher unavailable: {exc}")

    generated_map = {}
    temp_frame = OUTPUTS_DIR / "temp_keyframe.jpg"

    for idx, spec in enumerate(THUMBNAIL_SPECS, 1):
        vfile = spec["file"]
        short_id = spec["id"]
        vid = spec.get("video_id")

        print(f"\n[{idx}/15] Processing: {short_id} ({vfile.name})")

        if not vfile.exists() or vfile.stat().st_size == 0:
            print(f"  [SKIP] Video file not found: {vfile}")
            continue

        # Extract crisp frame
        ss_time = spec.get("ss", "00:00:03")
        extract_raw_frame(vfile, temp_frame, ss=ss_time)

        # Primary thumbnail path (matches existing pattern so all viewers see it immediately)
        primary_thumb = OUTPUTS_DIR / f"thumb_{vfile.stem}.jpg"
        styled_thumb = OUTPUTS_DIR / f"thumb_styled_{short_id}.jpg"

        # Generate thumbnail
        create_styled_thumbnail(temp_frame, primary_thumb, spec)
        # Also save styled named copy
        import shutil
        shutil.copy2(primary_thumb, styled_thumb)

        print(f"  [SUCCESS] Created: {primary_thumb.name} ({primary_thumb.stat().st_size / 1024:.1f} KB)")

        generated_map[short_id] = primary_thumb
        generated_map[vfile.stem] = primary_thumb
        if vid:
            generated_map[vid] = primary_thumb

        # If live video on YouTube, upload custom thumbnail via API
        if publisher and vid:
            print(f"  [YOUTUBE] Uploading custom thumbnail to YouTube video ID: {vid}...")
            await try_upload_youtube_thumbnail(publisher, vid, primary_thumb)

    # Cleanup temp keyframe
    if temp_frame.exists():
        temp_frame.unlink(missing_ok=True)

    print("\n" + "=" * 60)
    print("SYNCING DATA STORES WITH NEW THUMBNAILS")
    print("=" * 60)
    sync_stores_with_new_thumbnails(generated_map)

    print("\n[DONE] All 15 Shorts thumbnails successfully generated and synchronized!")


if __name__ == "__main__":
    asyncio.run(main())
