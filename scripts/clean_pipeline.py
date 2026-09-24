"""Clean all pipeline outputs, downloads, database records, and logs."""
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]

targets = [
    ROOT / "downloads" / "telegram",
    ROOT / "outputs",
    ROOT / "outputs" / "telegram_tamil_audio",
    ROOT / "pipeline" / "telegram_tamil_history.sqlite3",
    ROOT / "telegram_tamil_pipeline.log",
]

for target in targets:
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
        target.mkdir(parents=True, exist_ok=True)
        print(f"Cleared directory: {target}")
    elif target.is_file():
        target.unlink(missing_ok=True)
        print(f"Deleted file:      {target}")
    else:
        print(f"Already clean:     {target}")

print("\nAll pipeline outputs cleaned. Ready for fresh run.")
