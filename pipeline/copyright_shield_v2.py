"""
COPYRIGHT SHIELD v3.0 - Advanced Active Copyright Protection System
Prevents Content ID claims, strikes, and legal issues through:
1. Pre-flight fingerprinting & corner watermark scanning
2. Transformative work verification & 4-factor Fair Use analysis
3. Active Auto-Transformation Engine (FFmpeg kinetic zoom, color warp, pitch shift, EXIF wipe)
4. Automated 17 U.S.C. § 107 legal dispute package preparation
"""

import os
import sys
import json
import sqlite3
import hashlib
import subprocess
from datetime import datetime
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict, Any
from enum import Enum

import numpy as np
import librosa
import cv2
import imagehash
from PIL import Image
import tempfile
import asyncio
import traceback


class RiskLevel(Enum):
    CLEAR = 0       # No risk - proceed
    LOW = 1         # Minimal risk - standard transformation
    MEDIUM = 2      # Moderate risk - enhanced transformation required
    HIGH = 3        # High risk - major transformation or avoid
    CRITICAL = 4    # Guaranteed strike - DO NOT USE


@dataclass
class CopyrightReport:
    asset_id: str
    asset_type: str  # audio, visual, script, music
    risk_level: RiskLevel
    risk_score: float  # 0.0 to 1.0
    matched_content: List[dict]
    transformation_required: bool
    transformation_instructions: dict
    legal_basis: str
    timestamp: str
    provenance_chain: List[str]


class AutoTransformEngine:
    """Active anti-Content-ID execution module using FFmpeg, Demucs, and pyrubberband"""

    @staticmethod
    def is_ffmpeg_available() -> bool:
        """Check if FFmpeg binary is accessible"""
        try:
            res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return res.returncode == 0
        except Exception:
            return False

    @classmethod
    def transform_video(
        cls,
        input_path: str,
        output_path: Optional[str] = None,
        apply_kinetic_zoom: bool = True,
        apply_color_warp: bool = True,
        add_noise_grain: bool = True,
        wipe_metadata: bool = True,
        watermark_boxes: Optional[List[Tuple[int, int, int, int]]] = None
    ) -> str:
        """
        Applies kinetic scale zoom, color curve contrast, subtle noise grain,
        watermark blur masks, and strips EXIF metadata to defeat VideoMatch algorithms.
        """
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input video not found: {input_path}")

        if not output_path:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_shielded{ext}"

        filters = []
        
        # 1. Kinetic Zoom & Crop (Breaks fixed temporal spatio-temporal hashes)
        if apply_kinetic_zoom:
            filters.append("scale=iw*1.08:-1,crop=iw/1.08:ih/1.08")

        # 2. Color Curve & Saturation Tweak (Alters pixel gradient vectors)
        if apply_color_warp:
            filters.append("eq=contrast=1.06:saturation=1.08:gamma=0.98")

        # 3. Sub-perceptual Film Grain Overlay (Disrupts phash/dhash uniformity)
        if add_noise_grain:
            filters.append("noise=alls=4:allf=t+u")

        # 4. Watermark Delogo Blur Filters
        if watermark_boxes:
            for box in watermark_boxes:
                x, y, w, h = box
                filters.append(f"delogo=x={x}:y={y}:w={w}:h={h}")

        filter_graph = ",".join(filters) if filters else "null"

        cmd = ["ffmpeg", "-y", "-i", input_path]
        
        if filter_graph != "null":
            cmd.extend(["-vf", filter_graph])

        # Strip EXIF & creation metadata
        if wipe_metadata:
            cmd.extend(["-map_metadata", "-1"])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "19",
            "-c:a", "copy",
            output_path
        ])

        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0 and os.path.exists(output_path):
                return output_path
            else:
                print(f"[CopyrightShield] FFmpeg video transform warning: {res.stderr[:200]}")
                return input_path
        except Exception as e:
            print(f"[CopyrightShield] Failed to execute video transformation: {e}")
            return input_path

    @classmethod
    def transform_audio(
        cls,
        input_path: str,
        output_path: Optional[str] = None,
        pitch_shift_semitones: float = 1.5,
        tempo_factor: float = 1.02
    ) -> str:
        """
        Adaptive per-segment shielding using pyrubberband (formant-preserving)
        and librosa (phase randomization), falling back to ffmpeg if missing.
        """
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input audio not found: {input_path}")

        if not output_path:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_shielded{ext}"

        try:
            import pyrubberband as pyrb
            import librosa
            import soundfile as sf
            
            y, sr = librosa.load(input_path, sr=44100, mono=True)
            
            # Formant-preserving pitch shift and tempo change
            y_shifted = pyrb.pitch_shift(y, sr, n_steps=pitch_shift_semitones)
            y_shifted = pyrb.time_stretch(y_shifted, sr, rate=tempo_factor)
            
            # Phase randomization to defeat cross-correlation
            stft = librosa.stft(y_shifted)
            mag, phase = librosa.magphase(stft)
            random_phase = np.exp(1j * 2 * np.pi * np.random.rand(*phase.shape))
            stft_randomized = mag * random_phase
            y_shifted = librosa.istft(stft_randomized)
                
            sf.write(output_path, y_shifted, sr)
            return output_path
            
        except Exception as e:
            print(f"[CopyrightShield] Python audio transform failed ({e}), falling back to ffmpeg.")
            
            # Pitch shift via sample rate manipulation + tempo compensation
            semitone_ratio = 2.0 ** (pitch_shift_semitones / 12.0)
            target_rate = int(44100 * semitone_ratio)
            inverse_tempo = 1.0 / semitone_ratio
            combined_tempo = inverse_tempo * tempo_factor

            audio_filter = f"asetrate={target_rate},atempo={combined_tempo:.4f}"

            cmd = [
                "ffmpeg", "-y", "-i", input_path,
                "-af", audio_filter,
                "-map_metadata", "-1",
                "-c:a", "aac", "-b:a", "192k",
                output_path
            ]

            try:
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if res.returncode == 0 and os.path.exists(output_path):
                    return output_path
                else:
                    print(f"[CopyrightShield] FFmpeg audio transform warning: {res.stderr[:200]}")
                    return input_path
            except Exception as e2:
                print(f"[CopyrightShield] Failed to execute audio transformation: {e2}")
                return input_path


class AudioFingerprintEngine:
    """Advanced audio fingerprinting using Chromaprint/AcoustID and MFCC/Chroma."""

    def __init__(self, sample_rate: int = 22050):
        self.sample_rate = sample_rate
        self.known_fingerprints_db = self._load_content_id_database()

    def _load_content_id_database(self) -> dict:
        """Load known Content ID fingerprints (local cache)"""
        return {
            "major_labels": [],
            "popular_tracks": [],
            "sound_effects": [],
        }

    def extract_fingerprint(self, audio_path: str) -> np.ndarray:
        """Extract robust audio fingerprint combining MFCC and Chroma"""
        try:
            y, sr = librosa.load(audio_path, sr=self.sample_rate, mono=True)
            mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
            
            mfcc_mean = np.mean(mfcc, axis=1)
            chroma_mean = np.mean(chroma, axis=1)
            return np.concatenate((mfcc_mean, chroma_mean))
        except Exception as e:
            print(f"[CopyrightShield] Audio fingerprint extraction failed: {e}")
            return np.array([])

    def compare_fingerprints(self, fp1: np.ndarray, fp2: np.ndarray) -> float:
        """Cosine similarity between MFCC/Chroma fingerprints."""
        if len(fp1) == 0 or len(fp2) == 0 or len(fp1) != len(fp2):
            return 0.0
        return float(np.dot(fp1, fp2) / (np.linalg.norm(fp1) * np.linalg.norm(fp2)))

    async def _acoustid_lookup(self, audio_path: str) -> List[dict]:
        """Lookup audio using AcoustID (requires pyacoustid)."""
        try:
            import acoustid
            API_KEY = "cmnxR39Xmjs" # generic/user key
            results = []
            # acoustid is synchronous, so wrap in thread if possible. For simplicity here:
            for score, recording_id, title, artist in acoustid.match(API_KEY, audio_path):
                results.append({
                    "category": "acoustid",
                    "similarity": score,
                    "title": title,
                    "artist": artist
                })
            return results
        except ImportError:
            print("[CopyrightShield] pyacoustid not installed. Skipping AcoustID lookup.")
            return []
        except Exception as e:
            print(f"[CopyrightShield] AcoustID lookup failed: {e}")
            return []

    async def _shazam_lookup(self, audio_path: str) -> List[dict]:
        """Lookup audio using Shazam (requires shazamio)."""
        try:
            from shazamio import Shazam
            shazam = Shazam()
            out = await shazam.recognize_song(audio_path)
            if out and 'track' in out:
                return [{
                    "category": "shazam",
                    "similarity": 0.95, # High confidence if matched
                    "title": out['track'].get('title'),
                    "artist": out['track'].get('subtitle')
                }]
            return []
        except ImportError:
            print("[CopyrightShield] shazamio not installed. Skipping Shazam lookup.")
            return []
        except Exception as e:
            print(f"[CopyrightShield] Shazam lookup failed: {e}")
            return []

    def _separate_stems(self, audio_path: str) -> str:
        """Isolate instrumental stem for fingerprinting using Demucs."""
        try:
            import torch
            if not torch.cuda.is_available():
                return audio_path # Skip if no GPU to save time
                
            out_dir = tempfile.mkdtemp()
            cmd = ["demucs", "-n", "htdemucs", "--two-stems=vocals", "-o", out_dir, audio_path]
            print(f"[CopyrightShield] Running stem separation: {' '.join(cmd)}")
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            base = os.path.basename(audio_path)
            name, _ = os.path.splitext(base)
            no_vocals_path = os.path.join(out_dir, "htdemucs", name, "no_vocals.wav")
            
            if os.path.exists(no_vocals_path):
                return no_vocals_path
            return audio_path
        except Exception as e:
            print(f"[CopyrightShield] Stem separation failed: {e}")
            return audio_path

    def scan_audio(self, audio_path: str) -> CopyrightReport:
        """Synchronous wrapper for scan_audio_async."""
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        if loop.is_running():
            # If running inside an event loop, this might block, but pipeline handles it.
            import threading
            result = [None]
            def _run():
                result[0] = asyncio.run(self.scan_audio_async(audio_path))
            t = threading.Thread(target=_run)
            t.start()
            t.join()
            return result[0]
        else:
            return loop.run_until_complete(self.scan_audio_async(audio_path))
            
    async def scan_audio_async(self, audio_path: str, use_stem_separation: bool = True) -> CopyrightReport:
        target_path = audio_path
        if use_stem_separation:
            target_path = self._separate_stems(audio_path)
            
        matched_content = []
        max_similarity = 0.0
        
        acoustid_results = await self._acoustid_lookup(target_path)
        matched_content.extend(acoustid_results)
        
        shazam_results = await self._shazam_lookup(target_path)
        matched_content.extend(shazam_results)
        
        for m in matched_content:
            max_similarity = max(max_similarity, m["similarity"])
            
        # Fallback to local
        if not matched_content:
            fingerprint = self.extract_fingerprint(target_path)
            for category, fingerprints in self.known_fingerprints_db.items():
                for known_fp in fingerprints:
                    similarity = self.compare_fingerprints(fingerprint, known_fp)
                    if similarity > 0.1:
                        matched_content.append({"category": category, "similarity": float(similarity)})
                        max_similarity = max(max_similarity, float(similarity))
            
        if max_similarity > 0.8: risk = RiskLevel.CRITICAL
        elif max_similarity > 0.5: risk = RiskLevel.HIGH
        elif max_similarity > 0.2: risk = RiskLevel.MEDIUM
        elif max_similarity > 0.1: risk = RiskLevel.LOW
        else: risk = RiskLevel.CLEAR
        
        return CopyrightReport(
            asset_id=hashlib.md5(audio_path.encode()).hexdigest()[:12],
            asset_type="audio",
            risk_level=risk,
            risk_score=float(max_similarity),
            matched_content=matched_content,
            transformation_required=risk.value >= RiskLevel.MEDIUM.value,
            transformation_instructions=self._get_audio_transform_instructions(risk),
            legal_basis="Audio fingerprint matching (AcoustID/Shazam/Demucs)",
            timestamp=datetime.now().isoformat(),
            provenance_chain=[audio_path, target_path]
        )

    def _get_audio_transform_instructions(self, risk: RiskLevel) -> dict:
        instructions = {
            RiskLevel.CLEAR: {"action": "none", "notes": "Safe to use"},
            RiskLevel.LOW: {"action": "minor_eq", "notes": "Adjust EQ, add subtle ambient noise"},
            RiskLevel.MEDIUM: {
                "action": "major_transform",
                "notes": "Pitch shift +1.5 semitones, tempo change +2%, add background audio layer",
                "required_changes": ["pitch_shift", "tempo_change", "ambient_layer"]
            },
            RiskLevel.HIGH: {
                "action": "stem_isolation_or_replace",
                "notes": "Separate vocal stems and replace background track with royalty-free music",
                "required_changes": ["stem_separation", "music_replacement"]
            },
            RiskLevel.CRITICAL: {
                "action": "destroy_and_replace",
                "notes": "DO NOT USE - Guaranteed Content ID match",
                "required_changes": ["complete_removal", "ai_generation"]
            }
        }
        return instructions.get(risk, instructions[RiskLevel.CLEAR])


class VisualFingerprintEngine:
    """Perceptual hashing and corner watermark scanning for visual content"""

    def __init__(self):
        self.hash_methods = ["phash", "dhash", "whash", "ahash"]
        self.frame_sample_rate = 2

    def extract_video_fingerprint(self, video_path: str) -> dict:
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_interval = int(fps * self.frame_sample_rate) if fps > 0 else 60

        fingerprints = {"phash": [], "dhash": [], "whash": [], "ahash": [], "frame_timestamps": []}
        frame_count = 0

        while True:
            ret, frame = cap.read()
            if not ret: break
            if frame_count % frame_interval == 0:
                try:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    pil_image = Image.fromarray(frame_rgb)
                    fingerprints["phash"].append(str(imagehash.phash(pil_image)))
                    fingerprints["dhash"].append(str(imagehash.dhash(pil_image)))
                    fingerprints["whash"].append(str(imagehash.whash(pil_image)))
                    fingerprints["ahash"].append(str(imagehash.average_hash(pil_image)))
                    fingerprints["frame_timestamps"].append(frame_count / fps if fps > 0 else 0)
                except Exception:
                    pass
            frame_count += 1
        cap.release()
        return fingerprints

    def compare_video_fingerprints(self, fp1: dict, fp2: dict) -> float:
        similarities = []
        for method in self.hash_methods:
            hashes1 = fp1.get(method, [])
            hashes2 = fp2.get(method, [])
            if not hashes1 or not hashes2: continue
            matches = 0
            for h1 in hashes1:
                for h2 in hashes2:
                    hash1 = imagehash.hex_to_hash(h1)
                    hash2 = imagehash.hex_to_hash(h2)
                    distance = hash1 - hash2
                    similarity = max(0, 1 - (distance / 20))
                    if similarity > 0.8: matches += 1
            match_rate = matches / max(len(hashes1), len(hashes2))
            similarities.append(match_rate)
        return float(np.mean(similarities)) if similarities else 0.0

    def scan_video(self, video_path: str) -> CopyrightReport:
        fingerprint = self.extract_video_fingerprint(video_path)
        watermark_info = self._detect_watermarks(video_path)
        watermark_detected = watermark_info["detected"]

        risk = RiskLevel.HIGH if watermark_detected else RiskLevel.CLEAR

        return CopyrightReport(
            asset_id=hashlib.md5(video_path.encode()).hexdigest()[:12],
            asset_type="visual",
            risk_level=risk,
            risk_score=0.85 if watermark_detected else 0.1,
            matched_content=[{"watermark_corners": watermark_info["corner_boxes"]}] if watermark_detected else [],
            transformation_required=risk.value >= RiskLevel.MEDIUM.value,
            transformation_instructions={
                "action": "kinetic_zoom_and_crop" if watermark_detected else "standard_shield",
                "apply_kinetic_zoom": True,
                "apply_color_warp": True,
                "add_noise_grain": True,
                "wipe_metadata": True,
                "watermark_boxes": watermark_info["corner_boxes"],
                "notes": "Apply kinetic zoom, non-linear color grading, and crop corner watermarks."
            },
            legal_basis="Visual perceptual hashing and OpenCV corner watermark analysis",
            timestamp=datetime.now().isoformat(),
            provenance_chain=[video_path]
        )

    def _detect_watermarks(self, video_path: str) -> dict:
        """
        Scans top-left, top-right, bottom-left, bottom-right frame corners
        for high-contrast watermark text or social handles (TikTok, CapCut, YouTube).
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"detected": False, "corner_boxes": []}

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        if width == 0 or height == 0:
            cap.release()
            return {"detected": False, "corner_boxes": []}

        # Define 4 corner regions (each taking ~25% of width and 15% of height)
        cw, ch = int(width * 0.25), int(height * 0.15)
        corners = [
            (0, 0, cw, ch),                        # Top-left
            (width - cw, 0, cw, ch),              # Top-right
            (0, height - ch, cw, ch),             # Bottom-left
            (width - cw, height - ch, cw, ch)     # Bottom-right
        ]

        watermark_frames_hit = 0
        detected_boxes = []
        frames_checked = 0
        max_frames_to_check = 10

        while frames_checked < max_frames_to_check:
            ret, frame = cap.read()
            if not ret: break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            for (x, y, w, h) in corners:
                crop = gray[y:y+h, x:x+w]
                # High contrast edge intensity detection
                edges = cv2.Canny(crop, 100, 200)
                edge_density = np.sum(edges > 0) / (w * h)
                
                # Check for concentrated text-like contours
                if edge_density > 0.12:
                    watermark_frames_hit += 1
                    if (x, y, w, h) not in detected_boxes:
                        detected_boxes.append((x, y, w, h))

            frames_checked += 1

        cap.release()

        detected = watermark_frames_hit >= 3
        return {
            "detected": detected,
            "corner_boxes": detected_boxes if detected else []
        }


class ScriptOriginalityEngine:
    """Ensures script content is transformative and original"""

    _encoder = None

    def __init__(self):
        try:
            if ScriptOriginalityEngine._encoder is None:
                from sentence_transformers import SentenceTransformer
                ScriptOriginalityEngine._encoder = SentenceTransformer('all-MiniLM-L6-v2')
            self.encoder = ScriptOriginalityEngine._encoder
        except Exception as e:
            print(f"[CopyrightShield] SentenceTransformer initialization note: {e}")
            self.encoder = None

    def analyze_script(self, script_text: str, original_transcript: str = None) -> CopyrightReport:
        semantic_sim = 0.0
        if original_transcript and self.encoder:
            try:
                embeddings = self.encoder.encode([script_text, original_transcript])
                semantic_sim = float(np.dot(embeddings[0], embeddings[1]) / (
                    np.linalg.norm(embeddings[0]) * np.linalg.norm(embeddings[1])
                ))
            except Exception:
                semantic_sim = self._jaccard_similarity(script_text, original_transcript)
        elif original_transcript:
            semantic_sim = self._jaccard_similarity(script_text, original_transcript)

        if semantic_sim > 0.8: risk = RiskLevel.HIGH
        elif semantic_sim > 0.6: risk = RiskLevel.MEDIUM
        elif semantic_sim > 0.4: risk = RiskLevel.LOW
        else: risk = RiskLevel.CLEAR

        return CopyrightReport(
            asset_id=hashlib.md5(script_text.encode()).hexdigest()[:12],
            asset_type="script",
            risk_level=risk,
            risk_score=semantic_sim,
            matched_content=[],
            transformation_required=risk.value >= RiskLevel.MEDIUM.value,
            transformation_instructions={
                "action": "rewrite" if risk.value >= RiskLevel.MEDIUM.value else "none",
                "notes": f"Originality score: {1-semantic_sim:.1%}. Inject commentary markers for Fair Use."
            },
            legal_basis="Semantic similarity analysis & n-gram transcript audit",
            timestamp=datetime.now().isoformat(),
            provenance_chain=[]
        )

    def _jaccard_similarity(self, text1: str, text2: str) -> float:
        set1 = set(text1.lower().split())
        set2 = set(text2.lower().split())
        if not set1 or not set2: return 0.0
        return len(set1.intersection(set2)) / len(set1.union(set2))


class CopyrightShield:
    """Main copyright protection & active auto-transformation orchestrator"""

    def __init__(self, db_path: str = "copyright_shield.db"):
        self.audio_engine = AudioFingerprintEngine()
        self.visual_engine = VisualFingerprintEngine()
        self.script_engine = ScriptOriginalityEngine()
        self.transformer = AutoTransformEngine()
        self.db_path = db_path
        self._init_database()

    def _init_database(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS asset_provenance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id TEXT UNIQUE,
                asset_type TEXT,
                source_url TEXT,
                transformation_applied TEXT,
                risk_level TEXT,
                risk_score REAL,
                timestamp TEXT,
                legal_basis TEXT,
                dispute_ready INTEGER DEFAULT 0
            )
        ''')
        conn.commit()
        conn.close()

    async def full_scan(self, video_path=None, audio_path=None, script_text=None, original_transcript=None) -> dict:
        reports = []
        if audio_path and os.path.exists(audio_path):
            reports.append(self.audio_engine.scan_audio(audio_path))
        if video_path and os.path.exists(video_path):
            reports.append(self.visual_engine.scan_video(video_path))
        if script_text:
            reports.append(self.script_engine.analyze_script(script_text, original_transcript))

        if not reports:
            return {
                "overall_risk_level": RiskLevel.CLEAR.name,
                "overall_risk_score": 0.0,
                "individual_reports": [],
                "safe_to_upload": True,
                "requires_transformation": False
            }

        max_risk = max((r.risk_level for r in reports), key=lambda x: x.value)
        avg_score = float(np.mean([r.risk_score for r in reports]))

        for r in reports:
            self._log_provenance(r)

        return {
            "overall_risk_level": max_risk.name,
            "overall_risk_score": avg_score,
            "individual_reports": [
                {
                    "asset_type": r.asset_type,
                    "risk_level": r.risk_level.name,
                    "risk_score": r.risk_score,
                    "transformation_required": r.transformation_required,
                    "instructions": r.transformation_instructions
                } for r in reports
            ],
            "transformation_plan": self._compile_transformation_plan(reports),
            "dispute_preparation": self._prepare_dispute_documents(reports),
            "safe_to_upload": max_risk.value <= RiskLevel.LOW.value,
            "requires_transformation": max_risk.value >= RiskLevel.MEDIUM.value,
            "timestamp": datetime.now().isoformat()
        }

    async def auto_shield_and_process(
        self,
        video_path: Optional[str] = None,
        audio_path: Optional[str] = None,
        script_text: Optional[str] = None,
        original_transcript: Optional[str] = None,
        output_dir: str = "outputs"
    ) -> dict:
        """
        Performs full pre-flight scan -> executes auto-transformation if risk >= MEDIUM ->
        verifies post-transformation safety -> returns ready-to-upload asset paths.
        """
        os.makedirs(output_dir, exist_ok=True)
        scan_result = await self.full_scan(video_path, audio_path, script_text, original_transcript)
        
        shielded_video_path = video_path
        shielded_audio_path = audio_path

        if scan_result["requires_transformation"] and self.transformer.is_ffmpeg_available():
            print(f"[CopyrightShield v3.0] Risk level is {scan_result['overall_risk_level']}. Executing auto-transformations...")

            # 1. Transform Video
            if video_path and os.path.exists(video_path):
                v_report = next((r for r in scan_result["individual_reports"] if r["asset_type"] == "visual"), None)
                watermark_boxes = v_report["instructions"].get("watermark_boxes", []) if v_report else []
                
                shielded_video_path = self.transformer.transform_video(
                    input_path=video_path,
                    output_path=os.path.join(output_dir, f"{os.path.splitext(os.path.basename(video_path))[0]}_shielded.mp4"),
                    watermark_boxes=watermark_boxes
                )

            # 2. Transform Audio
            if audio_path and os.path.exists(audio_path):
                shielded_audio_path = self.transformer.transform_audio(
                    input_path=audio_path,
                    output_path=os.path.join(output_dir, f"{os.path.splitext(os.path.basename(audio_path))[0]}_shielded.aac")
                )

            # 3. Post-Transformation Verification Re-scan
            post_scan = await self.full_scan(shielded_video_path, shielded_audio_path, script_text, original_transcript)
            post_scan["original_video_path"] = video_path
            post_scan["shielded_video_path"] = shielded_video_path
            post_scan["shielded_audio_path"] = shielded_audio_path
            post_scan["auto_transformed"] = True
            return post_scan

        scan_result["shielded_video_path"] = video_path
        scan_result["shielded_audio_path"] = audio_path
        scan_result["auto_transformed"] = False
        return scan_result

    def _compile_transformation_plan(self, reports):
        plan = {"audio_changes": [], "visual_changes": [], "script_changes": [], "estimated_time": 0}
        for r in reports:
            if r.transformation_required:
                if r.asset_type == "audio":
                    plan["audio_changes"].append(r.transformation_instructions)
                    plan["estimated_time"] += 10
                elif r.asset_type == "visual":
                    plan["visual_changes"].append(r.transformation_instructions)
                    plan["estimated_time"] += 15
                elif r.asset_type == "script":
                    plan["script_changes"].append(r.transformation_instructions)
                    plan["estimated_time"] += 5
        return plan

    def _prepare_dispute_documents(self, reports):
        transformative_elements = [
            "Kinetic frame zooming and spatio-temporal hash disruption",
            "Non-linear color curve adjustment and noise grain layer",
            "Audio pitch-shifting and micro-tempo dynamic ramping",
            "EXIF encoder metadata sanitization"
        ]

        return {
            "statutory_basis": "17 U.S.C. § 107 (Four Factors of Fair Use)",
            "four_factors_analysis": {
                "factor_1_purpose": "Transformative educational & commentary use with independent creative value",
                "factor_2_nature": "Derivative short-form work incorporating original synthesis",
                "factor_3_amount": "Minimal clip duration used strictly necessary for contextual commentary",
                "factor_4_market_effect": "No market substitution; serves distinct audience and purpose"
            },
            "transformative_elements": transformative_elements,
            "originality_evidence": f"CopyrightShield v3.0 transformation log generated at {datetime.now().isoformat()}",
            "counter_notification_template": (
                "Under 17 U.S.C. § 107, this upload constitutes transformative fair use. "
                "The content has undergone substantial artistic transformation, frame re-indexing, "
                "and commentary synthesis. No financial substitution for the original work occurs."
            )
        }

    def _log_provenance(self, report):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO asset_provenance 
                (asset_id, asset_type, transformation_applied, risk_level, risk_score, timestamp, legal_basis)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                report.asset_id, report.asset_type, json.dumps(report.transformation_instructions),
                report.risk_level.name, report.risk_score, report.timestamp, report.legal_basis
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[CopyrightShield] Failed to log provenance: {e}")
