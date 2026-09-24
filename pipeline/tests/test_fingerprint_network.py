import os
import sys
from unittest.mock import MagicMock, patch, AsyncMock
import pytest
import asyncio
import numpy as np

# Add pipeline directory to path so we can import copyright_shield_v2
pipeline_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if pipeline_dir not in sys.path:
    sys.path.insert(0, pipeline_dir)

from copyright_shield_v2 import AudioFingerprintEngine, RiskLevel

@pytest.fixture
def engine():
    return AudioFingerprintEngine()

def test_extract_fingerprint(engine):
    """Test local fingerprint extraction combining MFCC and Chroma."""
    # Create dummy MFCC and Chroma data
    dummy_mfcc = np.random.rand(20, 100)
    dummy_chroma = np.random.rand(12, 100)
    
    with patch("librosa.load", return_value=(np.zeros(22050), 22050)):
        with patch("librosa.feature.mfcc", return_value=dummy_mfcc):
            with patch("librosa.feature.chroma_stft", return_value=dummy_chroma):
                fp = engine.extract_fingerprint("dummy.wav")
                
                # Fingerprint should be 1D array combining mean of MFCC (20) and Chroma (12) = 32 elements
                assert isinstance(fp, np.ndarray)
                assert fp.shape == (32,)

def test_compare_fingerprints(engine):
    """Test cosine similarity between fingerprints."""
    fp1 = np.ones(32)
    fp2 = np.ones(32)
    similarity = engine.compare_fingerprints(fp1, fp2)
    assert np.isclose(similarity, 1.0)
    
    fp3 = np.zeros(32)
    # Cosine similarity with zero vector will fail/divide by zero in basic math, our func handles it?
    # Our function: if len(fp1) == 0 ... return 0.0
    # Let's test different vectors
    fp4 = np.array([1, 0, 0, 0] * 8)
    fp5 = np.array([0, 1, 0, 0] * 8)
    similarity2 = engine.compare_fingerprints(fp4, fp5)
    assert np.isclose(similarity2, 0.0)

@pytest.mark.asyncio
async def test_acoustid_lookup(engine):
    """Test AcoustID lookup integration."""
    mock_acoustid = MagicMock()
    mock_acoustid.match.return_value = [
        (0.95, "rec123", "Test Song", "Test Artist")
    ]
    with patch.dict("sys.modules", {"acoustid": mock_acoustid}):
        results = await engine._acoustid_lookup("dummy.wav")
        assert len(results) == 1
        assert results[0]["category"] == "acoustid"
        assert results[0]["similarity"] == 0.95
        assert results[0]["title"] == "Test Song"
        assert results[0]["artist"] == "Test Artist"

@pytest.mark.asyncio
async def test_shazam_lookup(engine):
    """Test Shazam lookup integration."""
    mock_shazam_instance = AsyncMock()
    mock_shazam_instance.recognize_song.return_value = {
        "track": {
            "title": "Shazam Song",
            "subtitle": "Shazam Artist"
        }
    }
    
    mock_shazam_module = MagicMock()
    mock_shazam_module.Shazam.return_value = mock_shazam_instance
    
    with patch.dict("sys.modules", {"shazamio": mock_shazam_module}):
        results = await engine._shazam_lookup("dummy.wav")
        assert len(results) == 1
        assert results[0]["category"] == "shazam"
        assert results[0]["similarity"] == 0.95
        assert results[0]["title"] == "Shazam Song"

@pytest.mark.asyncio
async def test_scan_audio_async_critical_risk(engine):
    """Test full async scan flow resulting in CRITICAL risk."""
    engine._separate_stems = MagicMock(return_value="dummy_no_vocals.wav")
    engine._acoustid_lookup = AsyncMock(return_value=[{"category": "acoustid", "similarity": 0.85, "title": "AcoustID Match"}])
    engine._shazam_lookup = AsyncMock(return_value=[{"category": "shazam", "similarity": 0.95, "title": "Shazam Match"}])
    
    report = await engine.scan_audio_async("dummy.mp4", use_stem_separation=True)
    
    assert report.risk_level == RiskLevel.CRITICAL
    assert report.risk_score == 0.95
    assert len(report.matched_content) == 2
    assert report.transformation_required is True

@pytest.mark.asyncio
async def test_scan_audio_async_clear_risk(engine):
    """Test full async scan flow resulting in CLEAR risk."""
    engine._separate_stems = MagicMock(return_value="dummy_no_vocals.wav")
    engine._acoustid_lookup = AsyncMock(return_value=[])
    engine._shazam_lookup = AsyncMock(return_value=[])
    engine.extract_fingerprint = MagicMock(return_value=np.array([1,2,3]))
    engine.compare_fingerprints = MagicMock(return_value=0.0)
    
    report = await engine.scan_audio_async("dummy.mp4", use_stem_separation=True)
    
    assert report.risk_level == RiskLevel.CLEAR
    assert report.risk_score == 0.0
    assert len(report.matched_content) == 0
    assert report.transformation_required is False
