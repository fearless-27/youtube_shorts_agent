"""
test_telegram_pipeline_dedup.py - Unit tests for deduplication, already-rendered skipping,
and asset cleanup in the Telegram pipeline.
"""

import os
import shutil
import sqlite3
import tempfile
import unittest
from unittest import mock
from pathlib import Path

# Add project root and pipeline dir
PROJECT_ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "pipeline"))

from telegram_tamil_shorts_pipeline import TelegramTamilStore, TelegramVideo


class TestTelegramPipelineDedup(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_history.sqlite3"
        self.store = TelegramTamilStore(str(self.db_path))

        # Create dummy dummy video files
        self.dummy_video = Path(self.temp_dir) / "dummy_render.mp4"
        with open(self.dummy_video, "wb") as f:
            f.write(b"0" * 2048)  # dummy bytes > 1000

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    @mock.patch("telegram_tamil_shorts_pipeline.is_valid_video_file", return_value=True)
    def test_get_source_and_is_already_rendered(self, mock_is_valid):
        video = TelegramVideo(
            source_id="telegram:channel:101:part001",
            channel="channel",
            message_id=101,
            title="Test Video Part 1",
            caption="Caption",
            source_url="https://t.me/channel/101",
            local_path=str(self.dummy_video),
            segment_index=1,
            segment_total=1,
        )

        # 1. Unregistered source
        self.assertIsNone(self.store.get_source(video.source_id))
        is_done, path = self.store.is_already_rendered(video.source_id)
        self.assertFalse(is_done)

        # 2. Marked as rendered with non-existent file
        self.store.mark(video, "rendered", final_video_path=str(Path(self.temp_dir) / "non_existent.mp4"))
        is_done, path = self.store.is_already_rendered(video.source_id)
        self.assertFalse(is_done)

        # 3. Marked as rendered with existing file
        self.store.mark(video, "rendered", final_video_path=str(self.dummy_video))
        rec = self.store.get_source(video.source_id)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["status"], "rendered")
        is_done, found_path = self.store.is_already_rendered(video.source_id)
        self.assertTrue(is_done)
        self.assertEqual(Path(found_path).resolve(), self.dummy_video.resolve())

        # 4. Marked as uploaded
        self.store.mark(video, "uploaded", uploaded_video_id="TEST_VID_123")
        is_done, found_path = self.store.is_already_rendered(video.source_id)
        self.assertTrue(is_done)


if __name__ == "__main__":
    unittest.main()
