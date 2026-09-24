"""Create youtube_credentials.json for GhostPipe uploads.

Run from the project root:
    python scripts/youtube_oauth_setup.py
"""

from pathlib import Path
import sys

from google_auth_oauthlib.flow import InstalledAppFlow


SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    project_root = Path(__file__).resolve().parents[1]
    client_secrets_path = project_root / "client_secrets.json"
    credentials_path = project_root / "youtube_credentials.json"

    if not client_secrets_path.exists():
        raise FileNotFoundError(
            f"Missing {client_secrets_path}. Download an OAuth Desktop client JSON "
            "from Google Cloud Console and save it with this name."
        )

    flow = InstalledAppFlow.from_client_secrets_file(str(client_secrets_path), SCOPES)
    # prompt='consent' + access_type='offline' ensures a permanent refresh_token is returned
    credentials = flow.run_local_server(port=0, prompt="consent", access_type="offline")

    credentials_json = credentials.to_json()
    credentials_path.write_text(credentials_json, encoding="utf-8")
    
    print("\n" + "=" * 60)
    print("SUCCESS: Saved YouTube upload credentials to youtube_credentials.json")
    if credentials.refresh_token:
        print("✓ Refresh Token acquired: SUCCESS (Permanent lifetime refresh enabled)")
    else:
        print("⚠ WARNING: No refresh token returned. Re-run with prompt='consent'")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
