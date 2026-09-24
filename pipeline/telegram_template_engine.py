"""
telegram_template_engine.py - Multi-Template Engine for Telegram Tamil Shorts
Builds dynamic 1080x1920 overlays and FFmpeg filter chains for 4 distinct templates:
1. anime_multi_tier (Pro Anime Sky + Brand Bar + Clip + Character Art)
2. cinematic_ambient (Full Ambient Blur + Floating Clip + Glassmorphism Badge)
3. split_screen (Top Episode Video + Center Neon Ticker + Bottom Visualizer)
4. sleek_dark (Minimalist Studio Dark Matte + Glowing Ring + Bold Action Card)
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from PIL import Image, ImageDraw, ImageFont, ImageFilter

logger = logging.getLogger("TelegramTemplateEngine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-7s | %(message)s")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = PROJECT_ROOT / "assets" / "templates" / "anime_shorts"
PUBLIC_TEMPLATES_DIR = PROJECT_ROOT / "public" / "images" / "templates"
PUBLIC_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

TEMPLATES_META = {
    "anime_multi_tier": {
        "id": "anime_multi_tier",
        "name": "Pro Anime Multi-Tier",
        "badge": "Viral Anime",
        "description": "Top anime sky banner, center black branding bar with glowing avatar, and bottom anime character art.",
        "best_for": "Shinchan, Doraemon, Naruto & anime series",
        "preview_image": "/images/templates/preview_anime_multi_tier.png",
    },
    "cinematic_ambient": {
        "id": "cinematic_ambient",
        "name": "Cinematic Ambient Glow",
        "badge": "Premium Glow",
        "description": "Full-bleed ambient blurred video backdrop, floating center clip with glassmorphic channel pill and neon glow.",
        "best_for": "Cinematic scenes, fight sequences & dramatic moments",
        "preview_image": "/images/templates/preview_cinematic_ambient.png",
    },
    "split_screen": {
        "id": "split_screen",
        "name": "Split-Screen Action",
        "badge": "High Retention",
        "description": "Top episode video clip with a vibrant neon ticker divider bar and bottom manga/visual art panel.",
        "best_for": "Fast-paced comedy, gaming & high-retention Shorts",
        "preview_image": "/images/templates/preview_split_screen.png",
    },
    "sleek_dark": {
        "id": "sleek_dark",
        "name": "Sleek Dark Creator",
        "badge": "Minimalist Studio",
        "description": "Ultra-clean dark matte aesthetic with large glowing avatar ring, verified badge, and bold pulse CTA button.",
        "best_for": "Dubbed movies, informative clips & creator series",
        "preview_image": "/images/templates/preview_sleek_dark.png",
    },
}


class TelegramTemplateEngine:
    """Generates dynamic overlays and FFmpeg composition chains for Telegram Shorts templates."""

    def __init__(self, config: Optional[dict] = None):
        self.config = config or self._load_default_config()

    def _load_default_config(self) -> dict:
        cfg_paths = [
            PROJECT_ROOT / "public" / "data" / "users" / "ZUXh4wwtSYNp7VZv9IYtdEWMI6q2" / "config.json",
            PROJECT_ROOT / "config" / "telegram_tamil_shorts.json",
            PROJECT_ROOT / "config" / "ghostpipe.json",
        ]
        for p in cfg_paths:
            if p.exists():
                try:
                    with open(p, "r", encoding="utf-8-sig") as f:
                        return json.load(f)
                except Exception:
                    pass
        return {}

    def get_template_id(self) -> str:
        tid = self.config.get("telegram_render_template") or self.config.get("telegram_template") or "anime_multi_tier"
        if tid not in TEMPLATES_META:
            tid = "anime_multi_tier"
        return tid

    def get_branding(self) -> Tuple[str, str, str, str, Tuple[int, int, int]]:
        channel_name = str(self.config.get("telegram_channel_name") or "NEMO SHORTS").strip()
        channel_handle = str(self.config.get("telegram_channel_handle") or "@nemoshorts").strip()
        if not channel_handle.startswith("@"):
            channel_handle = f"@{channel_handle}"
        header_text = str(self.config.get("telegram_header_text") or "🔔 SUBSCRIBE FOR MORE ANIME CONTENT 🤩").strip()
        footer_text = str(self.config.get("telegram_footer_text") or "🔔 SUBSCRIBE FOR MORE ANIME CONTENT 🤩").strip()

        brand_hex = str(self.config.get("telegram_brand_color") or "#00D2FF").strip()
        try:
            brand_rgb = tuple(int(brand_hex.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
        except Exception:
            brand_rgb = (0, 210, 255)

        return channel_name, channel_handle, header_text, footer_text, brand_rgb

    def get_fonts(self, title_size: int = 54, handle_size: int = 36) -> Tuple[Optional[ImageFont.FreeTypeFont], Optional[ImageFont.FreeTypeFont]]:
        font_candidates = [
            "C:/Windows/Fonts/impact.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
        ]
        title_font, handle_font = None, None
        for fc in font_candidates:
            if os.path.exists(fc):
                try:
                    title_font = ImageFont.truetype(fc, title_size)
                    handle_font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf" if os.path.exists("C:/Windows/Fonts/arialbd.ttf") else fc, handle_size)
                    break
                except Exception:
                    pass
        return title_font, handle_font

    def get_avatar_image(self, size: int = 180) -> Optional[Image.Image]:
        candidates = [
            PROJECT_ROOT / "public" / "images" / "logo.png",
            PROJECT_ROOT / "public" / "images" / "fav.png",
            ASSETS_DIR / "ref_black_bar.png",
        ]
        for p in candidates:
            if p.exists():
                try:
                    img = Image.open(p).convert("RGBA")
                    if p.name == "logo.png":
                        side = min(img.width, int(img.height * 0.8))
                        cx, cy = img.width // 2, int(img.height * 0.42)
                        left = max(0, cx - side // 2)
                        top = max(0, cy - side // 2)
                        img = img.crop((left, top, left + side, top + side))
                    else:
                        side = min(img.width, img.height)
                        img = img.crop((0, 0, side, side))
                    return img.resize((size, size), Image.Resampling.LANCZOS)
                except Exception:
                    pass
        return None

    def build_overlay(self, template_id: Optional[str] = None, output_png_path: Optional[Path] = None) -> Path:
        tid = template_id or self.get_template_id()
        if output_png_path is None:
            output_png_path = ASSETS_DIR / f"overlay_{tid}.png"
        output_png_path.parent.mkdir(parents=True, exist_ok=True)

        if tid == "cinematic_ambient":
            img = self._build_cinematic_ambient_overlay()
        elif tid == "split_screen":
            img = self._build_split_screen_overlay()
        elif tid == "sleek_dark":
            img = self._build_sleek_dark_overlay()
        else:
            img = self._build_anime_multi_tier_overlay()

        img.save(output_png_path, "PNG")
        logger.info(f"Generated overlay for '{tid}' -> {output_png_path.name}")
        return output_png_path

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Pro Anime Multi-Tier
    # ──────────────────────────────────────────────────────────────────────────
    def _build_anime_multi_tier_overlay(self) -> Image.Image:
        w, h = 1080, 1920
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        name, handle, header_txt, footer_txt, brand_rgb = self.get_branding()

        # Top Sky (480px)
        top_sky_path = ASSETS_DIR / "ref_top_sky.png"
        if top_sky_path.exists():
            top_sky = Image.open(top_sky_path).convert("RGB").resize((w, 480), Image.Resampling.LANCZOS)
            overlay.paste(top_sky, (0, 0))

        # Brand Bar (y=480 to 720)
        bar_h = 240
        bar = Image.new("RGBA", (w, bar_h), (10, 12, 20, 255))
        draw_bar = ImageDraw.Draw(bar)

        avatar_size = 180
        ring_x, ring_y = 40, (bar_h - avatar_size) // 2
        avatar = self.get_avatar_image(avatar_size)
        if avatar:
            mask = Image.new("L", (avatar_size, avatar_size), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, avatar_size, avatar_size], fill=255)
            # Glow ring
            ring_w = 4
            draw_bar.ellipse(
                [ring_x - ring_w, ring_y - ring_w, ring_x + avatar_size + ring_w, ring_y + avatar_size + ring_w],
                outline=brand_rgb,
                width=ring_w,
            )
            bar.paste(avatar, (ring_x, ring_y), mask)

        f_title, f_handle = self.get_fonts(52, 34)
        text_x = ring_x + avatar_size + 32
        name_y = ring_y + 18
        handle_y = name_y + 65
        if f_title:
            draw_bar.text((text_x, name_y), name, font=f_title, fill=(255, 255, 255))
            draw_bar.text((text_x, handle_y), handle, font=f_handle, fill=(180, 215, 250))
        else:
            draw_bar.text((text_x, name_y), name, fill=(255, 255, 255))
            draw_bar.text((text_x, handle_y), handle, fill=(180, 215, 250))

        overlay.paste(bar, (0, 480), bar)

        # Bottom Anime Art (y=1328 to 1920)
        bottom_art_path = ASSETS_DIR / "ref_bottom_art.png"
        if bottom_art_path.exists():
            bottom_art = Image.open(bottom_art_path).convert("RGB").resize((w, 592), Image.Resampling.LANCZOS)
            overlay.paste(bottom_art, (0, 1328))

        # Accent Dividers
        draw = ImageDraw.Draw(overlay)
        draw.line([(0, 480), (w, 480)], fill=(*brand_rgb, 190), width=3)
        draw.line([(0, 720), (w, 720)], fill=(20, 20, 20, 255), width=3)
        draw.line([(0, 1328), (w, 1328)], fill=(*brand_rgb, 190), width=3)

        return overlay

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Cinematic Ambient Glow
    # ──────────────────────────────────────────────────────────────────────────
    def _build_cinematic_ambient_overlay(self) -> Image.Image:
        w, h = 1080, 1920
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        name, handle, header_txt, footer_txt, brand_rgb = self.get_branding()
        draw = ImageDraw.Draw(overlay)

        # Top Floating Pill Badge (y=140 to 280)
        pill_w, pill_h = 760, 130
        pill_x = (w - pill_w) // 2
        pill_y = 150
        draw.rounded_rectangle(
            [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
            radius=65,
            fill=(12, 16, 28, 230),
            outline=(*brand_rgb, 180),
            width=3,
        )

        # Avatar inside pill
        av_size = 96
        av_x = pill_x + 20
        av_y = pill_y + (pill_h - av_size) // 2
        avatar = self.get_avatar_image(av_size)
        if avatar:
            mask = Image.new("L", (av_size, av_size), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, av_size, av_size], fill=255)
            draw.ellipse([av_x - 3, av_y - 3, av_x + av_size + 3, av_y + av_size + 3], outline=brand_rgb, width=3)
            overlay.paste(avatar, (av_x, av_y), mask)

        f_title, f_handle = self.get_fonts(40, 28)
        tx = av_x + av_size + 24
        ty = av_y + 10
        if f_title:
            draw.text((tx, ty), name, font=f_title, fill=(255, 255, 255))
            draw.text((tx, ty + 46), handle, font=f_handle, fill=brand_rgb)
        else:
            draw.text((tx, ty), name, fill=(255, 255, 255))
            draw.text((tx, ty + 46), handle, fill=brand_rgb)

        # Video Frame Border Outline (Video is placed at y=600 to 1208)
        vy1, vy2 = 598, 1210
        draw.rounded_rectangle([20, vy1, w - 20, vy2], radius=16, outline=(*brand_rgb, 200), width=4)

        # Bottom Glowing CTA Pill (y=1640 to 1760)
        bot_w, bot_h = 840, 110
        bx = (w - bot_w) // 2
        by = 1650
        draw.rounded_rectangle([bx, by, bx + bot_w, by + bot_h], radius=55, fill=(8, 10, 18, 240), outline=(*brand_rgb, 150), width=2)
        cta_text = footer_txt or "🔔 SUBSCRIBE FOR DAILY CLIPS"
        f_cta, _ = self.get_fonts(34, 26)
        if f_cta:
            bbox = draw.textbbox((0, 0), cta_text, font=f_cta)
            tw = bbox[2] - bbox[0]
            draw.text((bx + (bot_w - tw) // 2, by + 32), cta_text, font=f_cta, fill=(255, 255, 255))
        else:
            draw.text((bx + 40, by + 32), cta_text, fill=(255, 255, 255))

        return overlay

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Split-Screen Action / Focus
    # ──────────────────────────────────────────────────────────────────────────
    def _build_split_screen_overlay(self) -> Image.Image:
        w, h = 1080, 1920
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        name, handle, header_txt, footer_txt, brand_rgb = self.get_branding()
        draw = ImageDraw.Draw(overlay)

        # Top Header Bar (0 to 100)
        draw.rectangle([0, 0, w, 100], fill=(12, 14, 22, 255))
        f_top, _ = self.get_fonts(38, 26)
        top_banner = header_txt or "⭐ TOP TRENDING SHORTS ⭐"
        if f_top:
            bbox = draw.textbbox((0, 0), top_banner, font=f_top)
            tw = bbox[2] - bbox[0]
            draw.text(((w - tw) // 2, 28), top_banner, font=f_top, fill=(255, 230, 80))
        else:
            draw.text((100, 28), top_banner, fill=(255, 230, 80))

        # Center Divider Neon Ticker Bar (y=1000 to 1160)
        bar_y1, bar_y2 = 1000, 1160
        draw.rectangle([0, bar_y1, w, bar_y2], fill=(8, 10, 18, 255))
        draw.line([(0, bar_y1), (w, bar_y1)], fill=brand_rgb, width=4)
        draw.line([(0, bar_y2), (w, bar_y2)], fill=brand_rgb, width=4)

        # Avatar in center ticker
        av_size = 110
        av_x = 40
        av_y = bar_y1 + (bar_y2 - bar_y1 - av_size) // 2
        avatar = self.get_avatar_image(av_size)
        if avatar:
            mask = Image.new("L", (av_size, av_size), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, av_size, av_size], fill=255)
            draw.ellipse([av_x - 3, av_y - 3, av_x + av_size + 3, av_y + av_size + 3], outline=brand_rgb, width=3)
            overlay.paste(avatar, (av_x, av_y), mask)

        f_title, f_handle = self.get_fonts(44, 30)
        tx = av_x + av_size + 25
        if f_title:
            draw.text((tx, bar_y1 + 25), name, font=f_title, fill=(255, 255, 255))
            draw.text((tx, bar_y1 + 82), handle, font=f_handle, fill=brand_rgb)
        else:
            draw.text((tx, bar_y1 + 25), name, fill=(255, 255, 255))
            draw.text((tx, bar_y1 + 82), handle, fill=brand_rgb)

        # Bottom Manga/Art Panel (y=1160 to 1920)
        bottom_art_path = ASSETS_DIR / "ref_bottom_art.png"
        if bottom_art_path.exists():
            art = Image.open(bottom_art_path).convert("RGB").resize((w, 760), Image.Resampling.LANCZOS)
            overlay.paste(art, (0, 1160))

        # Bottom Subscribe Banner overlay
        sub_y = 1790
        draw.rectangle([0, sub_y, w, 1920], fill=(0, 0, 0, 210))
        draw.line([(0, sub_y), (w, sub_y)], fill=(*brand_rgb, 200), width=3)
        sub_text = footer_txt or "🔔 SUBSCRIBE FOR MORE CLIPS"
        if f_title:
            bbox = draw.textbbox((0, 0), sub_text, font=f_handle)
            tw = bbox[2] - bbox[0]
            draw.text(((w - tw) // 2, sub_y + 35), sub_text, font=f_handle, fill=(255, 255, 255))

        return overlay

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Sleek Dark Creator
    # ──────────────────────────────────────────────────────────────────────────
    def _build_sleek_dark_overlay(self) -> Image.Image:
        w, h = 1080, 1920
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        name, handle, header_txt, footer_txt, brand_rgb = self.get_branding()
        draw = ImageDraw.Draw(overlay)

        # Top Dark Matte Header (0 to 520)
        draw.rectangle([0, 0, w, 520], fill=(10, 12, 18, 255))

        # Large Centered Glowing Avatar Ring
        av_size = 170
        av_x = (w - av_size) // 2
        av_y = 90
        avatar = self.get_avatar_image(av_size)
        if avatar:
            mask = Image.new("L", (av_size, av_size), 0)
            ImageDraw.Draw(mask).ellipse([0, 0, av_size, av_size], fill=255)
            # Glowing rings
            for rw, alpha in [(8, 90), (4, 255)]:
                draw.ellipse(
                    [av_x - rw, av_y - rw, av_x + av_size + rw, av_y + av_size + rw],
                    outline=(*brand_rgb, alpha),
                    width=rw,
                )
            overlay.paste(avatar, (av_x, av_y), mask)

        f_title, f_handle = self.get_fonts(50, 32)
        if f_title:
            bbox1 = draw.textbbox((0, 0), name, font=f_title)
            tw1 = bbox1[2] - bbox1[0]
            draw.text(((w - tw1) // 2, av_y + av_size + 24), name, font=f_title, fill=(255, 255, 255))

            bbox2 = draw.textbbox((0, 0), handle, font=f_handle)
            tw2 = bbox2[2] - bbox2[0]
            draw.text(((w - tw2) // 2, av_y + av_size + 88), handle, font=f_handle, fill=brand_rgb)

        # Video Top & Bottom Accent Lines (Video at y=520 to 1220)
        draw.line([(0, 520), (w, 520)], fill=(*brand_rgb, 220), width=4)
        draw.line([(0, 1220), (w, 1220)], fill=(*brand_rgb, 220), width=4)

        # Bottom Matte Studio Footer (1220 to 1920)
        draw.rectangle([0, 1220, w, 1920], fill=(8, 10, 15, 255))

        # Sleek Pulse CTA Button (y=1550 to 1690)
        btn_w, btn_h = 720, 120
        btn_x = (w - btn_w) // 2
        btn_y = 1560
        draw.rounded_rectangle([btn_x, btn_y, btn_x + btn_w, btn_y + btn_h], radius=30, fill=brand_rgb)
        cta_text = footer_txt or "🔔 SUBSCRIBE NOW"
        f_btn, _ = self.get_fonts(42, 28)
        if f_btn:
            bbox = draw.textbbox((0, 0), cta_text, font=f_btn)
            tw = bbox[2] - bbox[0]
            draw.text((btn_x + (btn_w - tw) // 2, btn_y + 36), cta_text, font=f_btn, fill=(0, 0, 0))

        return overlay

    # ──────────────────────────────────────────────────────────────────────────
    # FFmpeg Composition Command Builder
    # ──────────────────────────────────────────────────────────────────────────
    def build_ffmpeg_filter(self, template_id: str, overlay_path: Path) -> str:
        escaped_overlay = str(overlay_path).replace("\\", "/")
        if template_id == "cinematic_ambient":
            # Scale video to 1080x720 centered, background is 9:16 blurred video
            return (
                f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:6[bg];"
                f"[0:v]scale=1040:608:force_original_aspect_ratio=increase,crop=1040:608[vid];"
                f"[bg][vid]overlay=20:600[comp];"
                f"[comp][1:v]overlay=0:0[outv]"
            )
        elif template_id == "split_screen":
            # Video placed from y=100 to y=1000
            return (
                f"[0:v]scale=1080:900:force_original_aspect_ratio=increase,crop=1080:900[vid];"
                f"[vid]pad=1080:1920:0:100:black[base];"
                f"[base][1:v]overlay=0:0[outv]"
            )
        elif template_id == "sleek_dark":
            # Video placed from y=520 to y=1220 (700px height)
            return (
                f"[0:v]scale=1080:700:force_original_aspect_ratio=increase,crop=1080:700[vid];"
                f"[vid]pad=1080:1920:0:520:black[base];"
                f"[base][1:v]overlay=0:0[outv]"
            )
        else:
            # Default anime_multi_tier (video placed from y=720 to 1328)
            return (
                f"[0:v]scale=1080:608:force_original_aspect_ratio=increase,crop=1080:608[vid];"
                f"[vid]pad=1080:1920:0:720:black[base];"
                f"[base][1:v]overlay=0:0[outv]"
            )

    def generate_all_previews(self):
        """Generates visual previews of all 4 templates and saves to public/images/templates."""
        sample_clip_candidates = [
            PROJECT_ROOT / "outputs" / "clean_sample_16_9.jpg",
            PROJECT_ROOT / "public" / "images" / "templates" / "sample_anime_center_frame.jpg",
            PROJECT_ROOT / "downloads" / "telegram" / "shinchantamil_934.mkv",
        ]
        sample_frame = None
        for sc in sample_clip_candidates:
            if sc.exists():
                try:
                    if sc.suffix.lower() in [".jpg", ".png", ".webp"]:
                        sample_frame = Image.open(sc).convert("RGB")
                        break
                    import cv2
                    cap = cv2.VideoCapture(str(sc))
                    cap.set(cv2.CAP_PROP_POS_MSEC, 150000)
                    ret, frame = cap.read()
                    if ret:
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        sample_frame = Image.fromarray(frame_rgb)
                    cap.release()
                    if sample_frame:
                        break
                except Exception:
                    pass

        if not sample_frame:
            sample_frame = Image.new("RGB", (1080, 608), (25, 45, 80))
            ImageDraw.Draw(sample_frame).text((400, 280), "EPISODE VIDEO", fill=(255, 255, 255))

        for tid in TEMPLATES_META.keys():
            logger.info(f"Generating preview for template: {tid}...")
            overlay = self.build_overlay(tid)
            over_img = Image.open(overlay).convert("RGBA")

            comp = Image.new("RGBA", (1080, 1920), (5, 8, 14, 255))
            if tid == "cinematic_ambient":
                bg = sample_frame.resize((1080, 1920), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(28))
                comp.paste(bg, (0, 0))
                scaled_vid = sample_frame.resize((1040, 608), Image.Resampling.LANCZOS)
                comp.paste(scaled_vid, (20, 600))
            elif tid == "split_screen":
                scaled_vid = sample_frame.resize((1080, 900), Image.Resampling.LANCZOS)
                comp.paste(scaled_vid, (0, 100))
            elif tid == "sleek_dark":
                scaled_vid = sample_frame.resize((1080, 700), Image.Resampling.LANCZOS)
                comp.paste(scaled_vid, (0, 520))
            else:
                scaled_vid = sample_frame.resize((1080, 608), Image.Resampling.LANCZOS)
                comp.paste(scaled_vid, (0, 720))

            comp.paste(over_img, (0, 0), over_img)

            # Resize to web preview (360x640)
            preview = comp.resize((360, 640), Image.Resampling.LANCZOS)
            out_preview = PUBLIC_TEMPLATES_DIR / f"preview_{tid}.png"
            preview.save(out_preview, "PNG")
            logger.info(f"  [OK] Saved preview -> {out_preview.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-all", action="store_true", help="Generate all overlays and previews")
    parser.add_argument("--template", type=str, default="anime_multi_tier", help="Template ID")
    args = parser.parse_args()

    engine = TelegramTemplateEngine()
    if args.test_all:
        engine.generate_all_previews()
    else:
        out = engine.build_overlay(args.template)
        print(f"Generated overlay: {out}")
