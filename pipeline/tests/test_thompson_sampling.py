"""
test_thompson_sampling.py - Verify Thompson Sampling bandit behavior in AutoLearningMemory.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "pipeline"))

from ghostpipe_v5_1_pipeline import AutoLearningMemory


class TestThompsonSamplingBandit(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_learning.sqlite3"
        self.memory = AutoLearningMemory(str(self.db_path), enabled=True)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_thompson_sampling_convergence(self):
        options = ["high_performing_hook", "poor_performing_hook"]
        category = "Telegram Tamil"

        # Record strong positive outcome for option A
        for _ in range(15):
            self.memory._update_score("hook_style", "high_performing_hook", category, score=95.0, uploaded=True)

        # Record poor outcome for option B
        for _ in range(15):
            self.memory._update_score("hook_style", "poor_performing_hook", category, score=10.0, uploaded=True)

        # Run 50 selections: high-performing arm should be selected the vast majority of the time
        selections = [self.memory.choose("hook_style", options, category) for _ in range(50)]
        high_count = selections.count("high_performing_hook")
        poor_count = selections.count("poor_performing_hook")

        self.assertGreater(high_count, poor_count)
        self.assertGreaterEqual(high_count, 35)  # At least 70% of selections favor the winning arm


if __name__ == "__main__":
    unittest.main()
