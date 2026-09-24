import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "downloads" / "telegram" / "shinchantamil_934.mkv"
overlay_png = root / "assets" / "templates" / "anime_shorts" / "anime_shorts_overlay.png"
out_dir = root / "outputs"

clips = [
    (8, 880, 26, "short_telegram_shinchan_part08_ready.mp4"),
    (9, 1010, 28, "short_telegram_shinchan_part09_ready.mp4"),
    (10, 1140, 27, "short_telegram_shinchan_part10_ready.mp4"),
]

for idx, start, dur, name in clips:
    out_path = out_dir / name
    print(f"Rendering Part {idx} with Anime Shorts Template: start={start}, dur={dur} -> {name}...")
    cmd = [
        "ffmpeg",
        "-ss", str(start),
        "-t", str(dur),
        "-i", str(src),
        "-i", str(overlay_png),
        "-filter_complex",
        "[0:v]scale=1080:608:force_original_aspect_ratio=increase,crop=1080:608[vid];"
        "[vid]pad=1080:1920:0:720:black[base];"
        "[base][1:v]overlay=0:0[outv]",
        "-map", "[outv]",
        "-map", "0:2",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        str(out_path),
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if res.returncode == 0:
        print(f"Part {idx} OK! ({out_path.stat().st_size // 1024} KB)")
    else:
        print(f"Part {idx} FAILED: {res.stderr[:200]}")
