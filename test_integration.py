"""test_integration.py - Quick smoke test for video-use-main integration.

Creates a short test video with audio, runs the post-processing pipeline
(color grading + 30ms audio fades + subtitle burning), and confirms the output.

Usage:
    python test_integration.py
"""

import sys
from pathlib import Path

# Add pipeline directory
sys.path.insert(0, str(Path(__file__).parent / "pipeline"))

import video_use_adapter as vua


def run_test():
    print("=" * 60)
    print("1. Checking Environment & Dependencies")
    print("=" * 60)
    ffmpeg = vua.get_ffmpeg_binary()
    ffprobe = vua.get_ffprobe_binary()
    print(f"  FFmpeg:  {ffmpeg}")
    print(f"  FFprobe: {ffprobe}")
    has_key = bool(vua.get_elevenlabs_key())
    print(f"  ElevenLabs Key Detected: {has_key}")

    print("\n" + "=" * 60)
    print("2. Generating Test Source Video")
    print("=" * 60)
    out_dir = Path("outputs")
    out_dir.mkdir(exist_ok=True)
    test_src = out_dir / "test_smoke_input.mp4"

    import subprocess
    cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=25:duration=3",
        "-f", "lavfi", "-i", "sine=frequency=800:duration=3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        str(test_src)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  Created synthetic video: {test_src} ({test_src.stat().st_size} bytes)")

    print("\n" + "=" * 60)
    print("3. Testing Mathematical Color Grading")
    print("=" * 60)
    grade_filter, stats = vua.get_color_grade_filter(test_src, preset="auto")
    print(f"  Auto-Grade Filter: {grade_filter or '(neutral)'}")
    print(f"  Stats: {stats}")

    print("\n" + "=" * 60)
    print("4. Generating Captions & Testing Full Post-Processing")
    print("=" * 60)
    test_srt = out_dir / "test_smoke.srt"
    sample_text = "This is a test of the video-use integration for YouTube Shorts."
    srt_content = vua.generate_srt_from_text(sample_text, total_duration=3.0)
    test_srt.write_text(srt_content, encoding="utf-8")
    print("  Generated test SRT:")
    for line in srt_content.strip().splitlines()[:6]:
        print(f"    {line}")
    print("    ...")

    test_out = out_dir / "test_smoke_output.mp4"
    print("\n  Applying post-processing (Color Grade + Subtitles + 30ms Audio Fades)...")
    vua.apply_post_processing(
        video_path=test_src,
        output_path=test_out,
        grade_preset="auto",
        fade_ms=30,
        srt_path=test_srt,
    )

    if test_out.exists() and test_out.stat().st_size > 0:
        print(f"\n[PASS] Output rendered successfully: {test_out.resolve()}")
        print(f"       File size: {test_out.stat().st_size} bytes")
    else:
        print("\n[FAIL] Output file was not created.")
        return 1

    # Cleanup temp smoke test files
    for p in [test_src, test_srt]:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass

    print("\n" + "=" * 60)
    print("ALL INTEGRATION TESTS PASSED!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(run_test())
