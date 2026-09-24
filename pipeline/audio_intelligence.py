"""
AUDIO INTELLIGENCE ENGINE v1.0
Advanced multi-layer audio analysis for the Tamil Shorts pipeline.

Capabilities:
1. Voice Activity Detection (Silero VAD / WebRTC VAD fallback)
2. Content Classification (speech / music / silence / sfx)
3. Audio Quality Assessment (SNR, clipping, bitrate, dynamic range)
4. Enhanced Language Detection Ensemble (Whisper + sliding window + confidence fusion)
5. Segment Map Builder — timeline-aligned analysis
6. Result caching in SQLite
"""

import hashlib
import json
import logging
import os
import sqlite3
import subprocess
import tempfile
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger("AudioIntelligence")


# ──────────────────────────────────────────────────────────────────────────────
# DATA MODELS
# ──────────────────────────────────────────────────────────────────────────────

class ContentType(Enum):
    SPEECH = "speech"
    MUSIC = "music"
    SILENCE = "silence"
    SFX = "sfx"
    MIXED = "mixed"


class AudioQualityGrade(Enum):
    EXCELLENT = "excellent"  # SNR > 30dB, no clipping
    GOOD = "good"            # SNR 20-30dB
    ACCEPTABLE = "acceptable" # SNR 15-20dB
    POOR = "poor"            # SNR 10-15dB
    REJECT = "reject"        # SNR < 10dB or severe clipping


@dataclass
class AudioSegment:
    """A single analyzed segment of the audio timeline."""
    start_seconds: float
    end_seconds: float
    content_type: ContentType
    language: Optional[str] = None
    language_confidence: float = 0.0
    language_alternatives: Dict[str, float] = field(default_factory=dict)
    snr_db: float = 0.0
    rms_energy: float = 0.0
    has_clipping: bool = False
    speech_probability: float = 0.0

    @property
    def duration(self) -> float:
        return self.end_seconds - self.start_seconds


@dataclass
class AudioAnalysisReport:
    """Complete analysis report for an audio file."""
    file_path: str
    file_hash: str
    duration_seconds: float
    sample_rate: int
    channels: int
    bitrate_kbps: int
    codec: str

    # Quality metrics
    overall_snr_db: float = 0.0
    overall_quality_grade: str = "unknown"
    has_clipping: bool = False
    dynamic_range_db: float = 0.0

    # Content breakdown
    speech_ratio: float = 0.0
    music_ratio: float = 0.0
    silence_ratio: float = 0.0

    # Language detection
    primary_language: Optional[str] = None
    primary_language_confidence: float = 0.0
    language_map: List[Dict] = field(default_factory=list)

    # Segment timeline
    segments: List[Dict] = field(default_factory=list)

    # Metadata
    analysis_timestamp: str = ""
    analysis_duration_ms: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


# ──────────────────────────────────────────────────────────────────────────────
# VOICE ACTIVITY DETECTION
# ──────────────────────────────────────────────────────────────────────────────

class VoiceActivityDetector:
    """
    VAD using Silero VAD (GPU-accelerated) with WebRTC fallback.
    Returns timestamped speech/non-speech regions.
    """

    def __init__(self, device: str = "auto"):
        self._model = None
        self._utils = None
        self._device = device
        self._backend = None

    def _init_silero(self):
        """Lazy-load Silero VAD model."""
        if self._model is not None:
            return True
        try:
            import torch
            device = self._device
            if device == "auto":
                device = "cuda" if torch.cuda.is_available() else "cpu"

            model, utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
                trust_repo=True,
            )
            model = model.to(device)
            self._model = model
            self._utils = utils
            self._device = device
            self._backend = "silero"
            logger.info("Silero VAD loaded on device=%s", device)
            return True
        except Exception as e:
            logger.warning("Silero VAD unavailable (%s), using energy-based fallback", e)
            self._backend = "energy"
            return False

    def detect(self, audio_path: str, sample_rate: int = 16000) -> List[Dict]:
        """
        Returns list of speech regions:
        [{"start": 0.5, "end": 3.2, "speech_probability": 0.95}, ...]
        """
        self._init_silero()

        if self._backend == "silero":
            return self._detect_silero(audio_path, sample_rate)
        return self._detect_energy(audio_path, sample_rate)

    def _detect_silero(self, audio_path: str, sample_rate: int) -> List[Dict]:
        """Speech detection using Silero VAD."""
        import torch
        try:
            (get_speech_timestamps, _, read_audio, _, _) = self._utils
            wav = read_audio(audio_path, sampling_rate=sample_rate)
            if isinstance(wav, np.ndarray):
                wav = torch.from_numpy(wav)
            wav = wav.to(self._device)

            speech_timestamps = get_speech_timestamps(
                wav,
                self._model,
                sampling_rate=sample_rate,
                threshold=0.5,
                min_speech_duration_ms=250,
                min_silence_duration_ms=100,
                return_seconds=True,
            )

            regions = []
            for ts in speech_timestamps:
                regions.append({
                    "start": float(ts["start"]),
                    "end": float(ts["end"]),
                    "speech_probability": 0.95,
                })
            logger.info("Silero VAD found %d speech regions in %s", len(regions), audio_path)
            return regions
        except Exception as e:
            logger.warning("Silero VAD failed: %s, falling back to energy-based", e)
            return self._detect_energy(audio_path, sample_rate)

    def _detect_energy(self, audio_path: str, sample_rate: int) -> List[Dict]:
        """Energy-based speech detection fallback."""
        try:
            import librosa
            y, sr = librosa.load(audio_path, sr=sample_rate, mono=True)
        except Exception as e:
            logger.error("Cannot load audio for VAD: %s", e)
            return []

        frame_length = int(0.025 * sr)  # 25ms frames
        hop_length = int(0.010 * sr)    # 10ms hop

        rms = np.array([
            np.sqrt(np.mean(y[i:i + frame_length] ** 2))
            for i in range(0, len(y) - frame_length, hop_length)
        ])

        if len(rms) == 0:
            return []

        # Dynamic threshold: mean + 0.5 * std
        threshold = np.mean(rms) + 0.5 * np.std(rms)
        threshold = max(threshold, 0.005)  # absolute floor

        is_speech = rms > threshold
        regions = []
        in_speech = False
        start_frame = 0

        for i, val in enumerate(is_speech):
            if val and not in_speech:
                in_speech = True
                start_frame = i
            elif not val and in_speech:
                in_speech = False
                start_sec = start_frame * hop_length / sr
                end_sec = i * hop_length / sr
                if end_sec - start_sec >= 0.25:  # min 250ms
                    regions.append({
                        "start": round(start_sec, 3),
                        "end": round(end_sec, 3),
                        "speech_probability": 0.7,
                    })

        if in_speech:
            end_sec = len(is_speech) * hop_length / sr
            start_sec = start_frame * hop_length / sr
            if end_sec - start_sec >= 0.25:
                regions.append({
                    "start": round(start_sec, 3),
                    "end": round(end_sec, 3),
                    "speech_probability": 0.7,
                })

        logger.info("Energy VAD found %d speech regions in %s", len(regions), audio_path)
        return regions


# ──────────────────────────────────────────────────────────────────────────────
# CONTENT CLASSIFIER (Speech / Music / Silence / SFX)
# ──────────────────────────────────────────────────────────────────────────────

class AudioContentClassifier:
    """
    Classifies audio segments into speech, music, silence, or sound effects.
    Uses spectral feature analysis with optional YAMNet backbone.
    """

    def __init__(self):
        self._yamnet_model = None
        self._yamnet_available = None

    def _try_load_yamnet(self):
        """Attempt to load YAMNet model for content classification."""
        if self._yamnet_available is not None:
            return self._yamnet_available
        try:
            import tensorflow_hub as hub
            self._yamnet_model = hub.load("https://tfhub.dev/google/yamnet/1")
            self._yamnet_available = True
            logger.info("YAMNet model loaded for audio content classification")
            return True
        except Exception as e:
            logger.info("YAMNet unavailable (%s), using spectral feature classifier", e)
            self._yamnet_available = False
            return False

    def classify_segments(
        self,
        audio_path: str,
        speech_regions: List[Dict],
        window_seconds: float = 2.0,
        sample_rate: int = 16000,
    ) -> List[AudioSegment]:
        """
        Classify audio into content-typed segments.
        Uses speech_regions from VAD as anchor points, then classifies
        non-speech regions as music, silence, or sfx.
        """
        try:
            import librosa
            y, sr = librosa.load(audio_path, sr=sample_rate, mono=True)
        except Exception as e:
            logger.error("Cannot load audio for classification: %s", e)
            return []

        total_duration = len(y) / sr
        segments = []

        # Build a binary speech mask
        speech_mask = np.zeros(len(y), dtype=bool)
        for region in speech_regions:
            s = int(region["start"] * sr)
            e = int(region["end"] * sr)
            speech_mask[s:min(e, len(y))] = True

        # Process in windows
        window_samples = int(window_seconds * sr)
        for start_sample in range(0, len(y), window_samples):
            end_sample = min(start_sample + window_samples, len(y))
            chunk = y[start_sample:end_sample]
            start_sec = start_sample / sr
            end_sec = end_sample / sr

            if len(chunk) < sr * 0.1:  # skip very short tail
                continue

            speech_fraction = np.mean(speech_mask[start_sample:end_sample])
            rms = float(np.sqrt(np.mean(chunk ** 2)))
            content_type, speech_prob = self._classify_chunk(
                chunk, sr, speech_fraction, rms
            )

            segments.append(AudioSegment(
                start_seconds=round(start_sec, 3),
                end_seconds=round(end_sec, 3),
                content_type=content_type,
                rms_energy=round(rms, 6),
                speech_probability=round(speech_prob, 3),
            ))

        # Merge adjacent segments of the same type
        segments = self._merge_adjacent(segments)
        logger.info(
            "Classified %d segments: speech=%.0f%%, music=%.0f%%, silence=%.0f%%",
            len(segments),
            sum(s.duration for s in segments if s.content_type == ContentType.SPEECH) / max(total_duration, 0.01) * 100,
            sum(s.duration for s in segments if s.content_type == ContentType.MUSIC) / max(total_duration, 0.01) * 100,
            sum(s.duration for s in segments if s.content_type == ContentType.SILENCE) / max(total_duration, 0.01) * 100,
        )
        return segments

    def _classify_chunk(
        self,
        chunk: np.ndarray,
        sr: int,
        speech_fraction: float,
        rms: float,
    ) -> Tuple[ContentType, float]:
        """Classify a single audio chunk using spectral features."""
        import librosa

        # Silence detection
        silence_threshold = 0.003
        if rms < silence_threshold:
            return ContentType.SILENCE, 0.0

        # If VAD says mostly speech, trust it
        if speech_fraction > 0.7:
            return ContentType.SPEECH, speech_fraction

        # Spectral analysis for music vs sfx
        try:
            spectral_flatness = float(np.mean(librosa.feature.spectral_flatness(y=chunk)))
            spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=chunk, sr=sr)))
            zcr = float(np.mean(librosa.feature.zero_crossing_rate(chunk)))

            # Music: lower spectral flatness (more tonal), moderate centroid
            # SFX: high spectral flatness (noise-like), high ZCR
            # Speech: moderate flatness, moderate ZCR

            if speech_fraction > 0.3:
                # Some speech detected — classify as mixed or speech
                return ContentType.SPEECH if speech_fraction > 0.5 else ContentType.MIXED, speech_fraction

            # Spectral flatness < 0.1 is very tonal (likely music)
            if spectral_flatness < 0.08 and zcr < 0.15:
                return ContentType.MUSIC, speech_fraction

            # High flatness + high ZCR = noise/SFX
            if spectral_flatness > 0.3 and zcr > 0.2:
                return ContentType.SFX, speech_fraction

            # Default to music for non-speech, non-silence
            return ContentType.MUSIC, speech_fraction

        except Exception:
            # Fallback: use speech fraction
            if speech_fraction > 0.3:
                return ContentType.SPEECH, speech_fraction
            return ContentType.MUSIC if rms > 0.01 else ContentType.SILENCE, speech_fraction

    def _merge_adjacent(self, segments: List[AudioSegment]) -> List[AudioSegment]:
        """Merge adjacent segments of the same content type."""
        if not segments:
            return segments

        merged = [segments[0]]
        for seg in segments[1:]:
            prev = merged[-1]
            if prev.content_type == seg.content_type:
                # Merge: extend the previous segment
                merged[-1] = AudioSegment(
                    start_seconds=prev.start_seconds,
                    end_seconds=seg.end_seconds,
                    content_type=prev.content_type,
                    rms_energy=max(prev.rms_energy, seg.rms_energy),
                    speech_probability=max(prev.speech_probability, seg.speech_probability),
                )
            else:
                merged.append(seg)

        return merged


# ──────────────────────────────────────────────────────────────────────────────
# AUDIO QUALITY ASSESSMENT
# ──────────────────────────────────────────────────────────────────────────────

class AudioQualityAssessor:
    """
    Evaluates audio quality: SNR, clipping, dynamic range, bitrate.
    Used to reject low-quality sources that degrade Whisper accuracy.
    """

    def assess(self, audio_path: str, sample_rate: int = 22050) -> Dict[str, Any]:
        """Full quality assessment of an audio file."""
        result = {
            "snr_db": 0.0,
            "has_clipping": False,
            "clipping_ratio": 0.0,
            "dynamic_range_db": 0.0,
            "peak_db": 0.0,
            "rms_db": -60.0,
            "quality_grade": AudioQualityGrade.ACCEPTABLE.value,
            "bitrate_kbps": 0,
            "codec": "unknown",
            "sample_rate": 0,
            "channels": 0,
            "duration_seconds": 0.0,
        }

        # Get codec/bitrate info from ffprobe
        probe_info = self._probe_audio(audio_path)
        result.update(probe_info)

        # Load audio for signal analysis
        try:
            import librosa
            y, sr = librosa.load(audio_path, sr=sample_rate, mono=True)
        except Exception as e:
            logger.warning("Cannot load audio for quality assessment: %s", e)
            return result

        result["duration_seconds"] = round(len(y) / sr, 3)

        # SNR estimation via spectral subtraction
        result["snr_db"] = round(self._estimate_snr(y, sr), 2)

        # Clipping detection
        clip_ratio = self._detect_clipping(y)
        result["has_clipping"] = clip_ratio > 0.001  # > 0.1% clipped samples
        result["clipping_ratio"] = round(clip_ratio, 6)

        # Dynamic range
        result["dynamic_range_db"] = round(self._dynamic_range(y), 2)

        # Peak and RMS levels
        peak = np.max(np.abs(y)) if len(y) > 0 else 0
        rms = np.sqrt(np.mean(y ** 2)) if len(y) > 0 else 0
        result["peak_db"] = round(20 * np.log10(max(peak, 1e-10)), 2)
        result["rms_db"] = round(20 * np.log10(max(rms, 1e-10)), 2)

        # Grade
        snr = result["snr_db"]
        if snr > 30 and not result["has_clipping"]:
            result["quality_grade"] = AudioQualityGrade.EXCELLENT.value
        elif snr > 20:
            result["quality_grade"] = AudioQualityGrade.GOOD.value
        elif snr > 15:
            result["quality_grade"] = AudioQualityGrade.ACCEPTABLE.value
        elif snr > 10:
            result["quality_grade"] = AudioQualityGrade.POOR.value
        else:
            result["quality_grade"] = AudioQualityGrade.REJECT.value

        logger.info(
            "Quality assessment: SNR=%.1fdB, clipping=%.3f%%, DR=%.1fdB, grade=%s",
            result["snr_db"], result["clipping_ratio"] * 100,
            result["dynamic_range_db"], result["quality_grade"],
        )
        return result

    def _estimate_snr(self, y: np.ndarray, sr: int) -> float:
        """
        Estimate SNR using spectral subtraction method.
        Assumes the quietest 10% of frames represent noise floor.
        """
        import librosa

        # Compute short-time energy per frame
        frame_length = int(0.025 * sr)
        hop_length = int(0.010 * sr)

        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
        frame_energy = np.sum(frames ** 2, axis=0)

        if len(frame_energy) == 0:
            return 0.0

        sorted_energy = np.sort(frame_energy)
        n_noise_frames = max(int(len(sorted_energy) * 0.10), 1)

        noise_energy = np.mean(sorted_energy[:n_noise_frames])
        signal_energy = np.mean(sorted_energy[n_noise_frames:]) if len(sorted_energy) > n_noise_frames else noise_energy

        if noise_energy < 1e-15:
            return 60.0  # effectively no noise

        snr = 10 * np.log10(max(signal_energy / noise_energy, 1e-10))
        return max(snr, 0.0)

    def _detect_clipping(self, y: np.ndarray, threshold: float = 0.99) -> float:
        """Detect digital clipping — ratio of samples at or near max amplitude."""
        if len(y) == 0:
            return 0.0
        clipped = np.sum(np.abs(y) >= threshold)
        return clipped / len(y)

    def _dynamic_range(self, y: np.ndarray) -> float:
        """Estimate dynamic range in dB (difference between peak and noise floor)."""
        if len(y) == 0:
            return 0.0

        peak = np.max(np.abs(y))
        # Noise floor: 5th percentile of absolute values (excluding zeros)
        nonzero = np.abs(y[np.abs(y) > 1e-8])
        if len(nonzero) < 100:
            return 0.0
        noise_floor = np.percentile(nonzero, 5)

        if noise_floor < 1e-10:
            return 96.0  # 16-bit max

        return 20 * np.log10(max(peak / noise_floor, 1e-10))

    def _probe_audio(self, audio_path: str) -> Dict[str, Any]:
        """Extract codec, bitrate, sample rate, channels from ffprobe."""
        import shutil
        ffprobe = shutil.which("ffprobe") or "ffprobe"

        try:
            res = subprocess.run(
                [
                    ffprobe, "-v", "error",
                    "-select_streams", "a:0",
                    "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate",
                    "-show_entries", "format=bit_rate",
                    "-of", "json",
                    str(audio_path),
                ],
                capture_output=True, text=True, timeout=10,
            )
            if res.returncode == 0:
                data = json.loads(res.stdout)
                stream = (data.get("streams") or [{}])[0]
                fmt = data.get("format", {})
                bitrate = int(stream.get("bit_rate") or fmt.get("bit_rate") or 0)
                return {
                    "codec": stream.get("codec_name", "unknown"),
                    "sample_rate": int(stream.get("sample_rate") or 0),
                    "channels": int(stream.get("channels") or 0),
                    "bitrate_kbps": bitrate // 1000 if bitrate else 0,
                }
        except Exception as e:
            logger.warning("ffprobe failed: %s", e)

        return {"codec": "unknown", "sample_rate": 0, "channels": 0, "bitrate_kbps": 0}


# ──────────────────────────────────────────────────────────────────────────────
# ENHANCED LANGUAGE DETECTION (Sliding Window + Ensemble)
# ──────────────────────────────────────────────────────────────────────────────

class LanguageDetectionEngine:
    """
    Multi-model language detection with sliding window analysis.
    Runs Whisper on speech-only segments identified by VAD, producing
    a per-segment language map with confidence scores.
    """

    def __init__(self, config: dict):
        self.config = config
        self._whisper_model = None
        self._whisper_device = None

    def _load_whisper(self):
        """Lazy-load Whisper model."""
        if self._whisper_model is not None:
            return

        import torch
        import whisper

        device = str(self.config.get("whisper_device", "auto"))
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"

        model_name = str(self.config.get("whisper_model", "small"))
        try:
            self._whisper_model = whisper.load_model(model_name, device=device)
            self._whisper_device = device
            logger.info("Whisper model '%s' loaded on %s", model_name, device)
        except Exception as e:
            logger.error("Failed to load Whisper model '%s': %s", model_name, e)
            raise

    def detect_language_map(
        self,
        audio_path: str,
        speech_segments: List[AudioSegment],
        accepted_languages: set,
        window_seconds: float = 15.0,
        confidence_threshold: float = 0.10,
        top_n: int = 5,
    ) -> Tuple[List[Dict], Optional[str], float]:
        """
        Sliding-window language detection on speech segments only.

        Returns:
            (language_map, primary_language, primary_confidence)

        language_map is a list of:
            {"start": 0.5, "end": 15.5, "language": "ta", "confidence": 0.82, "alternatives": {...}}
        """
        self._load_whisper()
        import whisper

        language_map = []
        language_votes: Dict[str, List[float]] = {}

        # Build speech windows from speech segments
        windows = self._build_speech_windows(speech_segments, window_seconds)

        if not windows:
            logger.info("No speech windows to analyze for language detection")
            return [], None, 0.0

        logger.info(
            "Language detection: %d windows of %.0fs each, top-%d, threshold=%.0f%%, accepted=%s",
            len(windows), window_seconds, top_n, confidence_threshold * 100, sorted(accepted_languages),
        )

        for window_start, window_end in windows:
            try:
                # Extract window audio to temp file
                temp_wav = self._extract_audio_segment(
                    audio_path, window_start, window_end - window_start
                )
                if not temp_wav:
                    continue

                try:
                    audio = whisper.load_audio(temp_wav)
                    audio = whisper.pad_or_trim(audio)
                    mel = whisper.log_mel_spectrogram(audio).to(self._whisper_model.device)
                    _, probs = self._whisper_model.detect_language(mel)

                    # Get top-N
                    sorted_langs = sorted(probs.items(), key=lambda x: x[1], reverse=True)[:top_n]
                    top_str = ", ".join(f"{l}={p:.1%}" for l, p in sorted_langs)
                    logger.debug("Window %.1f-%.1fs: [%s]", window_start, window_end, top_str)

                    # Build language map entry
                    best_lang = sorted_langs[0][0] if sorted_langs else None
                    best_conf = sorted_langs[0][1] if sorted_langs else 0.0
                    alternatives = {l: round(p, 4) for l, p in sorted_langs[1:] if p >= 0.01}

                    language_map.append({
                        "start": round(window_start, 2),
                        "end": round(window_end, 2),
                        "language": best_lang,
                        "confidence": round(best_conf, 4),
                        "alternatives": alternatives,
                    })

                    # Accumulate votes for accepted languages
                    for lang, prob in sorted_langs:
                        if prob >= confidence_threshold and lang.lower() in accepted_languages:
                            language_votes.setdefault(lang.lower(), []).append(prob)

                finally:
                    try:
                        os.unlink(temp_wav)
                    except Exception:
                        pass

            except Exception as e:
                logger.warning("Language detection failed for window %.1f-%.1fs: %s", window_start, window_end, e)

        # Determine primary language via majority voting with confidence weighting
        primary_language = None
        primary_confidence = 0.0

        if language_votes:
            # Weighted average confidence per language
            lang_scores = {}
            for lang, probs in language_votes.items():
                lang_scores[lang] = sum(probs) / len(probs) * len(probs)  # avg * count = weighted score

            primary_language = max(lang_scores, key=lang_scores.get)
            primary_confidence = sum(language_votes[primary_language]) / len(language_votes[primary_language])

            logger.info(
                "Primary language: %s (%.1f%% avg confidence, %d/%d windows)",
                primary_language, primary_confidence * 100,
                len(language_votes[primary_language]), len(windows),
            )
        else:
            logger.info("No accepted language detected with sufficient confidence")

        return language_map, primary_language, round(primary_confidence, 4)

    def _build_speech_windows(
        self, speech_segments: List[AudioSegment], window_seconds: float
    ) -> List[Tuple[float, float]]:
        """Build overlapping analysis windows from speech segments."""
        windows = []
        for seg in speech_segments:
            if seg.content_type not in (ContentType.SPEECH, ContentType.MIXED):
                continue
            if seg.duration < 1.0:  # skip very short speech
                continue

            # Create windows within this speech segment
            start = seg.start_seconds
            while start < seg.end_seconds - 1.0:
                end = min(start + window_seconds, seg.end_seconds)
                if end - start >= 2.0:  # at least 2s of audio
                    windows.append((start, end))
                start += window_seconds * 0.5  # 50% overlap

        return windows

    def _extract_audio_segment(
        self, audio_path: str, start: float, duration: float
    ) -> Optional[str]:
        """Extract a segment of audio to a temporary WAV file."""
        import shutil
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_path = tmp.name

        try:
            res = subprocess.run(
                [
                    ffmpeg, "-y",
                    "-ss", str(start),
                    "-i", str(audio_path),
                    "-t", str(duration),
                    "-ac", "1",
                    "-ar", "16000",
                    "-loglevel", "error",
                    temp_path,
                ],
                capture_output=True, timeout=30,
            )
            if res.returncode == 0 and os.path.exists(temp_path):
                return temp_path
            logger.warning("Audio extraction failed at %.1fs: %s", start, res.stderr[:200] if res.stderr else "")
        except Exception as e:
            logger.warning("Audio extraction error at %.1fs: %s", start, e)

        try:
            os.unlink(temp_path)
        except Exception:
            pass
        return None


# ──────────────────────────────────────────────────────────────────────────────
# ANALYSIS RESULT CACHE
# ──────────────────────────────────────────────────────────────────────────────

class AnalysisCache:
    """SQLite-backed cache for audio analysis results."""

    def __init__(self, db_path: str = "pipeline/audio_analysis_cache.sqlite3"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audio_analysis (
                file_hash TEXT PRIMARY KEY,
                file_path TEXT,
                analysis_json TEXT,
                created_at TEXT,
                expires_at TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_audio_analysis_path
            ON audio_analysis(file_path)
        """)
        conn.commit()
        conn.close()

    def get(self, file_hash: str) -> Optional[AudioAnalysisReport]:
        """Retrieve cached analysis result."""
        try:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute(
                "SELECT analysis_json FROM audio_analysis WHERE file_hash = ?",
                (file_hash,),
            ).fetchone()
            conn.close()

            if row:
                data = json.loads(row[0])
                logger.debug("Cache hit for hash %s", file_hash[:12])
                return self._dict_to_report(data)
        except Exception as e:
            logger.warning("Cache lookup failed: %s", e)
        return None

    def put(self, report: AudioAnalysisReport):
        """Store analysis result in cache."""
        try:
            from datetime import datetime, timedelta
            conn = sqlite3.connect(self.db_path)
            conn.execute(
                """INSERT OR REPLACE INTO audio_analysis
                   (file_hash, file_path, analysis_json, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    report.file_hash,
                    report.file_path,
                    json.dumps(report.to_dict(), default=str),
                    datetime.now().isoformat(),
                    (datetime.now() + timedelta(days=30)).isoformat(),
                ),
            )
            conn.commit()
            conn.close()
            logger.debug("Cached analysis for hash %s", report.file_hash[:12])
        except Exception as e:
            logger.warning("Cache write failed: %s", e)

    def _dict_to_report(self, data: dict) -> AudioAnalysisReport:
        """Convert dict back to AudioAnalysisReport."""
        return AudioAnalysisReport(
            file_path=data.get("file_path", ""),
            file_hash=data.get("file_hash", ""),
            duration_seconds=data.get("duration_seconds", 0),
            sample_rate=data.get("sample_rate", 0),
            channels=data.get("channels", 0),
            bitrate_kbps=data.get("bitrate_kbps", 0),
            codec=data.get("codec", "unknown"),
            overall_snr_db=data.get("overall_snr_db", 0),
            overall_quality_grade=data.get("overall_quality_grade", "unknown"),
            has_clipping=data.get("has_clipping", False),
            dynamic_range_db=data.get("dynamic_range_db", 0),
            speech_ratio=data.get("speech_ratio", 0),
            music_ratio=data.get("music_ratio", 0),
            silence_ratio=data.get("silence_ratio", 0),
            primary_language=data.get("primary_language"),
            primary_language_confidence=data.get("primary_language_confidence", 0),
            language_map=data.get("language_map", []),
            segments=data.get("segments", []),
            analysis_timestamp=data.get("analysis_timestamp", ""),
            analysis_duration_ms=data.get("analysis_duration_ms", 0),
        )


# ──────────────────────────────────────────────────────────────────────────────
# MAIN ENGINE — ORCHESTRATOR
# ──────────────────────────────────────────────────────────────────────────────

class AudioIntelligenceEngine:
    """
    Main orchestrator for advanced audio analysis.
    Chains: Audio Extraction → VAD → Content Classification →
            Quality Assessment → Language Detection → Report Generation.
    """

    def __init__(self, config: dict):
        self.config = config
        self.vad = VoiceActivityDetector(
            device=str(config.get("whisper_device", "auto"))
        )
        self.classifier = AudioContentClassifier()
        self.quality = AudioQualityAssessor()
        self.lang_detector = LanguageDetectionEngine(config)

        cache_db = str(config.get(
            "audio_intelligence_cache_db",
            "pipeline/audio_analysis_cache.sqlite3",
        ))
        self.cache = AnalysisCache(db_path=cache_db)

    def compute_file_hash(self, file_path: str) -> str:
        """SHA-256 hash of the file for cache keying."""
        h = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    h.update(chunk)
        except Exception:
            h.update(file_path.encode())
        return h.hexdigest()

    async def analyze(
        self,
        video_path: str,
        audio_stream_index: int = 0,
        accepted_languages: Optional[set] = None,
        skip_cache: bool = False,
    ) -> AudioAnalysisReport:
        """
        Full audio analysis pipeline.

        Args:
            video_path: Path to video file
            audio_stream_index: Which audio stream to analyze (default: 0)
            accepted_languages: Set of language codes to accept (e.g., {"ta", "hi"})
            skip_cache: If True, bypass the analysis cache

        Returns:
            AudioAnalysisReport with full analysis results
        """
        start_time = time.time()
        base_hash = self.compute_file_hash(video_path)
        cache_key = f"{base_hash}_stream{audio_stream_index}"

        # Check cache
        if not skip_cache:
            cached = self.cache.get(cache_key)
            if cached:
                logger.info("Using cached audio analysis for %s (stream %d)", Path(video_path).name, audio_stream_index)
                return cached

        logger.info("Starting full audio analysis for %s (stream %d)", Path(video_path).name, audio_stream_index)

        # Step 1: Extract audio to WAV
        audio_wav = await self._extract_audio(video_path, audio_stream_index)
        if not audio_wav:
            return self._empty_report(video_path, cache_key, "Audio extraction failed")

        try:
            # Step 2: Quality Assessment
            quality = self.quality.assess(audio_wav)

            # Step 3: Voice Activity Detection
            speech_regions = self.vad.detect(audio_wav)

            # Step 4: Content Classification
            segments = self.classifier.classify_segments(
                audio_wav, speech_regions,
                window_seconds=float(self.config.get("audio_classification_window_seconds", 2.0)),
            )

            # Step 5: Language Detection (on speech segments only)
            if accepted_languages is None:
                accepted_languages = {"ta"}  # default to Tamil

            window_secs = float(self.config.get("audio_language_sliding_window_seconds", 15.0))
            confidence_threshold = float(self.config.get("telegram_whisper_confidence_threshold", 0.10))
            top_n = int(self.config.get("telegram_whisper_top_n_languages", 5))

            language_map, primary_lang, primary_conf = self.lang_detector.detect_language_map(
                audio_wav,
                segments,
                accepted_languages=accepted_languages,
                window_seconds=window_secs,
                confidence_threshold=confidence_threshold,
                top_n=top_n,
            )

            # Annotate segments with language info
            for seg in segments:
                if seg.content_type in (ContentType.SPEECH, ContentType.MIXED):
                    # Find matching language map entry
                    for lm in language_map:
                        if lm["start"] <= seg.start_seconds < lm["end"]:
                            seg.language = lm["language"]
                            seg.language_confidence = lm["confidence"]
                            seg.language_alternatives = lm.get("alternatives", {})
                            break

            # Build report
            total_duration = quality.get("duration_seconds", 0) or 1.0
            speech_dur = sum(s.duration for s in segments if s.content_type == ContentType.SPEECH)
            music_dur = sum(s.duration for s in segments if s.content_type == ContentType.MUSIC)
            silence_dur = sum(s.duration for s in segments if s.content_type == ContentType.SILENCE)

            elapsed_ms = int((time.time() - start_time) * 1000)

            report = AudioAnalysisReport(
                file_path=video_path,
                file_hash=cache_key,
                duration_seconds=quality.get("duration_seconds", 0),
                sample_rate=quality.get("sample_rate", 0),
                channels=quality.get("channels", 0),
                bitrate_kbps=quality.get("bitrate_kbps", 0),
                codec=quality.get("codec", "unknown"),
                overall_snr_db=quality.get("snr_db", 0),
                overall_quality_grade=quality.get("quality_grade", "unknown"),
                has_clipping=quality.get("has_clipping", False),
                dynamic_range_db=quality.get("dynamic_range_db", 0),
                speech_ratio=round(speech_dur / total_duration, 4),
                music_ratio=round(music_dur / total_duration, 4),
                silence_ratio=round(silence_dur / total_duration, 4),
                primary_language=primary_lang,
                primary_language_confidence=primary_conf,
                language_map=language_map,
                segments=[asdict(s) for s in segments],
                analysis_timestamp=time.strftime("%Y-%m-%dT%H:%M:%S"),
                analysis_duration_ms=elapsed_ms,
            )

            # Cache the result
            self.cache.put(report)

            logger.info(
                "Audio analysis complete in %dms: quality=%s, SNR=%.1fdB, "
                "speech=%.0f%%, music=%.0f%%, lang=%s(%.0f%%)",
                elapsed_ms, report.overall_quality_grade, report.overall_snr_db,
                report.speech_ratio * 100, report.music_ratio * 100,
                report.primary_language or "none",
                report.primary_language_confidence * 100,
            )
            return report

        finally:
            # Clean up extracted audio
            try:
                if audio_wav and os.path.exists(audio_wav):
                    os.unlink(audio_wav)
            except Exception:
                pass

    async def quick_language_check(
        self,
        video_path: str,
        accepted_languages: set,
        audio_stream_index: int = 0,
        max_seconds: float = 600.0,
    ) -> Tuple[bool, Optional[str], float]:
        """
        Lightweight language check for early abort.
        Extracts up to 10 minutes of audio, finds speech, and samples up to 3 distinct regions
        (spaced 60 seconds apart) to bypass long intros like theme songs.
        """
        audio_wav = await self._extract_audio(
            video_path, audio_stream_index, max_duration=max_seconds
        )
        if not audio_wav:
            return False, None, 0.0

        try:
            speech_regions = self.vad.detect(audio_wav)
            if not speech_regions:
                logger.info("Quick check: no speech found in stream %d", audio_stream_index)
                return False, None, 0.0

            # Pick up to 3 speech regions, at least 60s apart to skip intros
            samples = []
            last_end = -60.0
            for region in speech_regions:
                start = region["start"]
                end = region["end"]
                if start - last_end >= 60.0:
                    samples.append((start, min(start + 30.0, end)))
                    last_end = start
                if len(samples) >= 3:
                    break
            
            # If we couldn't find spaced out samples, just take the first few
            if not samples:
                samples = [(r["start"], r["end"]) for r in speech_regions[:3]]

            import whisper
            import librosa
            self.lang_detector._load_whisper()
            model = self.lang_detector._whisper_model
            
            best_lang = None
            best_prob = 0.0

            for i, (start, end) in enumerate(samples):
                # Load just that chunk using librosa
                try:
                    y, sr = librosa.load(audio_wav, sr=16000, offset=start, duration=end - start)
                    audio = whisper.pad_or_trim(y)
                    mel = whisper.log_mel_spectrogram(audio).to(model.device)
                    _, probs = model.detect_language(mel)
                    
                    sorted_langs = sorted(probs.items(), key=lambda x: x[1], reverse=True)[:5]
                    top_str = ", ".join(f"{l}={p:.1%}" for l, p in sorted_langs)
                    logger.info("Quick check sample %d (%.1fs): [%s]", i+1, start, top_str)

                    threshold = float(self.config.get("telegram_whisper_confidence_threshold", 0.40))
                    for lang, prob in sorted_langs:
                        if lang.lower() in accepted_languages and prob >= threshold:
                            return True, lang, prob
                            
                    if sorted_langs and sorted_langs[0][1] > best_prob:
                        best_prob = sorted_langs[0][1]
                        best_lang = sorted_langs[0][0]
                except Exception as e:
                    logger.warning("Error processing quick check sample %d: %s", i+1, e)

            return False, best_lang, best_prob

        finally:
            try:
                os.unlink(audio_wav)
            except Exception:
                pass

    async def _extract_audio(
        self,
        video_path: str,
        stream_index: int = 0,
        max_duration: Optional[float] = None,
    ) -> Optional[str]:
        """Extract audio stream from video to a temporary WAV file."""
        import shutil
        import os
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            try:
                import imageio_ffmpeg
                ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            except ImportError:
                pass
        if not ffmpeg:
            try:
                import static_ffmpeg
                static_ffmpeg.add_paths()
                ffmpeg = shutil.which("ffmpeg")
            except ImportError:
                pass
        
        ffmpeg = ffmpeg or "ffmpeg"

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_path = tmp.name

        cmd = [
            ffmpeg, "-y",
            "-i", str(video_path),
            "-map", f"0:a:{stream_index}",
            "-ac", "1",
            "-ar", "16000",
            "-loglevel", "error",
        ]
        if max_duration:
            cmd.extend(["-t", str(max_duration)])
        cmd.append(temp_path)

        try:
            res = subprocess.run(cmd, capture_output=True, timeout=60)
            if res.returncode == 0 and os.path.exists(temp_path):
                return temp_path
            logger.warning("Audio extraction failed: %s", res.stderr[:200] if res.stderr else "unknown")
        except Exception as e:
            logger.warning("Audio extraction error: %s", e)

        try:
            os.unlink(temp_path)
        except Exception:
            pass
        return None

    def _empty_report(self, file_path: str, file_hash: str, error: str) -> AudioAnalysisReport:
        """Return an empty report when analysis fails."""
        logger.warning("Empty analysis report for %s: %s", Path(file_path).name, error)
        return AudioAnalysisReport(
            file_path=file_path,
            file_hash=file_hash,
            duration_seconds=0,
            sample_rate=0,
            channels=0,
            bitrate_kbps=0,
            codec="unknown",
            overall_quality_grade="unknown",
            analysis_timestamp=time.strftime("%Y-%m-%dT%H:%M:%S"),
        )

    # ──────────────────────────────────────────────────────────────────────────
    # CONVENIENCE: Check if audio matches accepted languages
    # (Drop-in replacement for the old _check_audio_language method)
    # ──────────────────────────────────────────────────────────────────────────

    async def check_audio_language(
        self,
        video_path: str,
        required_lang: str,
        accepted_languages: Optional[set] = None,
        audio_stream_index: int = 0,
    ) -> Tuple[bool, int]:
        """
        Drop-in replacement for TelegramTamilShortsPipeline._check_audio_language.

        Returns (language_matched, best_stream_index).
        """
        if accepted_languages is None:
            accepted_languages = {required_lang.lower()}

        # Get number of audio streams
        import shutil
        ffprobe = shutil.which("ffprobe") or "ffprobe"
        num_streams = 1

        try:
            res = subprocess.run(
                [
                    ffprobe, "-v", "error",
                    "-select_streams", "a",
                    "-show_entries", "stream=index",
                    "-of", "json",
                    str(video_path),
                ],
                capture_output=True, text=True, timeout=10,
            )
            if res.returncode == 0:
                data = json.loads(res.stdout)
                num_streams = len(data.get("streams", []))
        except Exception:
            pass

        if num_streams == 0:
            logger.info("No audio streams found in video")
            return False, 0

        # Try each stream
        for stream_idx in range(num_streams):
            report = await self.analyze(
                video_path,
                audio_stream_index=stream_idx,
                accepted_languages=accepted_languages,
            )

            if report.primary_language and report.primary_language.lower() in accepted_languages:
                min_speech = float(self.config.get("audio_language_min_speech_ratio", 0.2))
                if report.speech_ratio >= min_speech:
                    logger.info(
                        "Stream %d matched: lang=%s (%.1f%%), speech=%.0f%%",
                        stream_idx, report.primary_language,
                        report.primary_language_confidence * 100,
                        report.speech_ratio * 100,
                    )
                    return True, stream_idx
                else:
                    logger.info(
                        "Stream %d language matched (%s) but speech ratio too low (%.0f%% < %.0f%%)",
                        stream_idx, report.primary_language,
                        report.speech_ratio * 100, min_speech * 100,
                    )

        logger.info("No audio stream matched accepted languages %s", sorted(accepted_languages))
        return False, 0
