import os
import sys
from unittest.mock import MagicMock, patch
import pytest
import asyncio
import numpy as np

# Add pipeline directory to path so we can import audio_intelligence
pipeline_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if pipeline_dir not in sys.path:
    sys.path.insert(0, pipeline_dir)

from audio_intelligence import (
    AudioIntelligenceEngine, 
    VoiceActivityDetector, 
    LanguageDetectionEngine,
    AudioSegment,
    ContentType,
    AudioAnalysisReport
)

@pytest.fixture
def dummy_config():
    return {
        "whisper_device": "cpu",
        "audio_intelligence_cache_db": ":memory:"
    }

@pytest.mark.asyncio
async def test_quick_language_check_no_audio(dummy_config):
    """Test quick_language_check when audio extraction fails or yields no audio."""
    engine = AudioIntelligenceEngine(dummy_config)
    
    # Mock audio extraction to return None
    engine._extract_audio = MagicMock(return_value=asyncio.sleep(0, result=None))
    
    matched, lang, prob = await engine.quick_language_check("dummy.mp4", {"ta"})
    
    assert matched is False
    assert lang is None
    assert prob == 0.0

@pytest.mark.asyncio
async def test_quick_language_check_no_speech(dummy_config):
    """Test quick_language_check when no speech is detected."""
    engine = AudioIntelligenceEngine(dummy_config)
    
    # Mock extraction to return a dummy path
    async def mock_extract(*args, **kwargs):
        return "dummy.wav"
    engine._extract_audio = MagicMock(side_effect=mock_extract)
    
    # Mock VAD to return no speech regions
    engine.vad.detect = MagicMock(return_value=[])
    
    matched, lang, prob = await engine.quick_language_check("dummy.mp4", {"ta"})
    
    assert matched is False
    assert lang is None
    assert prob == 0.0

@pytest.mark.asyncio
async def test_quick_language_check_success(dummy_config):
    """Test quick_language_check successfully matching a language."""
    engine = AudioIntelligenceEngine(dummy_config)
    
    async def mock_extract(*args, **kwargs):
        return "dummy.wav"
    engine._extract_audio = MagicMock(side_effect=mock_extract)
    
    # Mock VAD
    engine.vad.detect = MagicMock(return_value=[{"start": 0.0, "end": 1.0, "speech_probability": 0.9}])
    
    # Mock Whisper
    engine.lang_detector._load_whisper = MagicMock()
    mock_model = MagicMock()
    # Return dummy probabilities
    mock_model.detect_language.return_value = (None, {"ta": 0.85, "en": 0.10, "hi": 0.05})
    engine.lang_detector._whisper_model = mock_model
    
    with patch("librosa.load", return_value=(np.zeros(16000), 16000)):
        with patch("whisper.load_audio", return_value=np.zeros(16000)):
            with patch("whisper.pad_or_trim", return_value=np.zeros(16000)):
                with patch("whisper.log_mel_spectrogram", return_value=MagicMock()):
                    matched, lang, prob = await engine.quick_language_check("dummy.mp4", {"ta"})
                    
                    assert matched is True
                    assert lang == "ta"
                    assert prob == 0.85

def test_vad_energy_fallback():
    """Test the energy-based fallback VAD."""
    vad = VoiceActivityDetector(device="cpu")
    
    # Create a dummy signal: silence then some noise
    sr = 16000
    silence = np.zeros(sr) # 1 second silence
    noise = np.random.randn(sr) * 0.5 # 1 second noise (speech)
    dummy_audio = np.concatenate([silence, noise, silence])
    
    with patch("librosa.load", return_value=(dummy_audio, sr)):
        regions = vad._detect_energy("dummy.wav", sr)
        
        # Should detect roughly from 1.0s to 2.0s
        assert len(regions) > 0
        assert regions[0]["start"] >= 0.8
        assert regions[0]["end"] <= 2.2
