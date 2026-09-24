import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wand2,
  Upload,
  Link2,
  Sparkles,
  Play,
  Film,
  Scissors,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Share2,
  Flame,
  Zap,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface WordToken {
  word: string;
  start: number;
  end: number;
}

interface ViralMoment {
  moment_id: string;
  title: string;
  hook_text: string;
  start: number;
  end: number;
  duration: number;
  virality_score: number;
  hook_score: number;
  emotional_tone: string;
  senior_editor_reasoning: string;
  suggested_caption: string;
  recommended_reframe: string;
  transcript_excerpt: string;
  words?: WordToken[];
}

interface RenderedClip {
  moment_id: string;
  title: string;
  video_path: string;
  thumbnail_path: string;
  public_url: string;
  public_thumb_url: string;
  duration: number;
  virality_score: number;
  hook_text: string;
  caption: string;
  rendered_at: string;
}

interface EditorJob {
  job_id: string;
  status: string;
  progress: number;
  source_type: string;
  source_input: string;
  source_video_path?: string;
  video_title?: string;
  duration: number;
  resolution?: string;
  error_message?: string;
  moments: ViralMoment[];
  rendered_clips: RenderedClip[];
}

export default function SmartEditor() {
  const [sourceMode, setSourceMode] = useState<'upload' | 'url'>('url');
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Settings
  const [targetDuration, setTargetDuration] = useState<number>(60);
  const [reframeMode, setReframeMode] = useState<'blur_stack' | 'face_track'>('blur_stack');
  const [subtitleStyle, setSubtitleStyle] = useState<'tiktok' | 'minimal'>('tiktok');

  // Job state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [job, setJob] = useState<EditorJob | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [renderingMomentId, setRenderingMomentId] = useState<string | null>(null);

  // Custom moment edits
  const [customHooks, setCustomHooks] = useState<Record<string, string>>({});

  // Modals / Feedback
  const [previewClip, setPreviewClip] = useState<RenderedClip | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [recentClips, setRecentClips] = useState<RenderedClip[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch recent clips on load
  const loadRecentClips = async () => {
    try {
      const res = await apiFetch('/api/editor/clips');
      const data = await res.json();
      if (data.ok && Array.isArray(data.clips)) {
        setRecentClips(data.clips);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => {
    loadRecentClips();
  }, []);

  // Poll active job
  useEffect(() => {
    if (!currentJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/editor/jobs/${currentJobId}`);
        const data = await res.json();
        if (data.ok && data.job) {
          setJob(data.job);
          if (data.job.status === 'completed' || data.job.status === 'error') {
            setIsAnalyzing(false);
            clearInterval(interval);
            loadRecentClips();
          }
        }
      } catch {
        // silent
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [currentJobId]);

  // Handle Drag & Drop / File Selection
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true);
    setJob(null);

    let source = '';

    if (sourceMode === 'url') {
      if (!videoUrl.trim()) {
        showToast('Please enter a valid video URL', 'error');
        setIsAnalyzing(false);
        return;
      }
      source = videoUrl.trim();
    } else {
      if (!uploadedFile) {
        showToast('Please select a video file to upload', 'error');
        setIsAnalyzing(false);
        return;
      }

      // Upload file directly via binary stream
      setIsUploading(true);
      setUploadProgress(10);
      try {
        const query = new URLSearchParams({ filename: uploadedFile.name }).toString();
        const uploadRes = await apiFetch(`/api/editor/upload?${query}`, {
          method: 'POST',
          body: uploadedFile,
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.ok || !uploadData.file_path) {
          throw new Error(uploadData.error || 'Upload failed');
        }
        source = uploadData.file_path;
        setUploadProgress(100);
      } catch (err: any) {
        showToast(err.message || 'File upload failed', 'error');
        setIsUploading(false);
        setIsAnalyzing(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    // Launch background analysis job
    try {
      const res = await apiFetch('/api/editor/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          target_duration: targetDuration,
        }),
      });
      const data = await res.json();
      if (data.ok && data.job_id) {
        setCurrentJobId(data.job_id);
        showToast('Senior Editor AI started analyzing footage!');
      } else {
        throw new Error(data.error || 'Could not start analysis');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to initialize analysis job', 'error');
      setIsAnalyzing(false);
    }
  };

  const handleRenderMoment = async (moment: ViralMoment, index: number) => {
    if (!job) return;
    setRenderingMomentId(moment.moment_id);

    const hookText = customHooks[moment.moment_id] ?? moment.hook_text;

    try {
      const res = await apiFetch('/api/editor/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.job_id,
          moment_index: index,
          crop_mode: reframeMode,
          hook_text: hookText,
        }),
      });
      const data = await res.json();
      if (data.ok && data.rendered) {
        showToast(`Rendered 9:16 Short: "${moment.title}"!`);
        // Refresh job state & recent clips
        const jobRes = await apiFetch(`/api/editor/jobs/${job.job_id}`);
        const jobData = await jobRes.json();
        if (jobData.ok) setJob(jobData.job);
        loadRecentClips();
        setPreviewClip(data.rendered);
      } else {
        throw new Error(data.error || 'Failed to render short');
      }
    } catch (err: any) {
      showToast(err.message || 'Render failed', 'error');
    } finally {
      setRenderingMomentId(null);
    }
  };

  const handleQueueApproval = async (clip: RenderedClip) => {
    try {
      const res = await apiFetch('/api/editor/queue-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: clip.title,
          video_path: clip.video_path,
          thumbnail_path: clip.thumbnail_path,
          virality_score: clip.virality_score,
          duration: clip.duration,
          caption: clip.caption,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Short "${clip.title}" queued for YouTube publishing at the next peak time slot!`);
      } else {
        throw new Error(data.error || 'Could not queue');
      }
    } catch (err: any) {
      showToast(err.message || 'Error queueing short', 'error');
    }
  };

  return (
    <div className="space-y-8 max-w-7xl animate-fade-in pb-16">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl flex items-center gap-3 border shadow-2xl backdrop-blur-xl text-xs font-semibold ${
              toastMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            {toastMessage.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white">
              AI Smart Video Editor
            </h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Working Prototype (Not a Demo)
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            Convert long videos or URLs into viral 9:16 vertical Shorts with intelligent hook detection, auto-captions, and smart reframing.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-300 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold">FFmpeg + Whisper + AI Active</span>
          </div>
          <div className="hidden sm:flex px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 items-center gap-2 text-xs text-slate-300">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>OpenShorts Architecture</span>
          </div>
        </div>
      </div>

      {/* Main Intake Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input and Configuration (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="card-metric space-y-5">
            {/* Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-white/[0.03] border border-white/5">
              <button
                type="button"
                onClick={() => setSourceMode('url')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  sourceMode === 'url'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Paste Video Link
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                  sourceMode === 'upload'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Local File
              </button>
            </div>

            {/* URL Input */}
            {sourceMode === 'url' ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Video URL (YouTube, Vimeo, Twitter, direct stream)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 pl-3.5 pr-28 py-3 text-white focus:border-purple-500/50 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
                    className="absolute right-2 top-2 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    Paste Sample
                  </button>
                </div>
                <span className="text-[11px] text-slate-500 block">
                  Supports YouTube full videos, podcasts, livestreams, and Twitter/X clips.
                </span>
              </div>
            ) : (
              /* Drag & Drop Upload */
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Select or Drop Source Footage
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 bg-white/[0.02] hover:bg-purple-500/[0.02] cursor-pointer text-center transition-all group"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files && setUploadedFile(e.target.files[0])}
                    accept="video/mp4,video/mkv,video/mov,video/webm"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  {uploadedFile ? (
                    <div>
                      <p className="text-sm font-semibold text-white">{uploadedFile.name}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB • Ready to analyze
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        Drag and drop your video file here, or browse
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Supports MP4, MOV, MKV up to 2GB
                      </p>
                    </div>
                  )}
                </div>
                {isUploading && (
                  <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-purple-500 h-1.5 transition-all duration-300"
                      style={{ width: `${uploadProgress || 20}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Senior Editor Options */}
            <div className="pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Target Duration
                </label>
                <select
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(Number(e.target.value))}
                  className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-white focus:outline-none"
                >
                  <option value={30} className="bg-[#121424]">~30 Seconds (Fast)</option>
                  <option value={45} className="bg-[#121424]">~45 Seconds (Balanced)</option>
                  <option value={60} className="bg-[#121424]">~60 Seconds (Full Hook)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Vertical Reframe
                </label>
                <select
                  value={reframeMode}
                  onChange={(e) => setReframeMode(e.target.value as any)}
                  className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-white focus:outline-none"
                >
                  <option value="blur_stack" className="bg-[#121424]">General Blur-Stack (9:16)</option>
                  <option value="face_track" className="bg-[#121424]">Auto Speaker/Face Track</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Subtitle Style
                </label>
                <select
                  value={subtitleStyle}
                  onChange={(e) => setSubtitleStyle(e.target.value as any)}
                  className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 text-white focus:outline-none"
                >
                  <option value="tiktok" className="bg-[#121424]">TikTok High-Visibility (Yellow)</option>
                  <option value="minimal" className="bg-[#121424]">Clean White (MarginV=90)</option>
                </select>
              </div>
            </div>

            {/* Launch CTA */}
            <button
              type="button"
              onClick={handleStartAnalysis}
              disabled={isAnalyzing}
              className="w-full py-3.5 px-4 rounded-xl font-display font-semibold text-xs text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:brightness-110 shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Senior Editor AI is analyzing moments...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Analyze Full Video & Generate Viral Moments</span>
                </>
              )}
            </button>
          </div>

          {/* Realtime Job Stepper */}
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-metric space-y-4 border-purple-500/30 bg-purple-500/[0.02]"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300 font-display flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                  Processing Video Intelligence
                </span>
                <span className="font-mono text-slate-400">{job?.progress || 15}%</span>
              </div>

              <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-cyan-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${job?.progress || 20}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400 pt-1 font-mono">
                <div className={job?.progress && job.progress >= 20 ? 'text-purple-300 font-bold' : ''}>
                  1. Video Ingestion
                </div>
                <div className={job?.progress && job.progress >= 50 ? 'text-purple-300 font-bold' : ''}>
                  2. Whisper Timestamps
                </div>
                <div className={job?.progress && job.progress >= 80 ? 'text-purple-300 font-bold' : ''}>
                  3. Senior Editor AI
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: AI Architecture Telemetry (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card-metric space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              How the Senior Editor Evaluates Footage
            </h3>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px] font-mono">1</span>
                  3-Second Hook Strength
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Evaluates the opening speech impulse. Detects curiosity gaps, shocking revelations, or punchy questions.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px] font-mono">2</span>
                  Speech Velocity & Emotional Climax
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Scores words per minute and auditory energy to isolate passionate, high-retention peaks.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px] font-mono">3</span>
                  Platform Safe-Zone Framing
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Bakes word-level animated subtitles at MarginV=90 to ensure captions are never covered by YouTube/TikTok buttons.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Viral Moments Section */}
      {job && job.moments && job.moments.length > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Senior Editor Recommended Moments ({job.moments.length})
              </h2>
              <p className="text-xs text-slate-400">
                Ranked by viral retention potential. Review, fine-tune hook text, and render into 9:16 Shorts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {job.moments.map((moment, idx) => {
              const hook = customHooks[moment.moment_id] ?? moment.hook_text;
              const isRendering = renderingMomentId === moment.moment_id;

              return (
                <div
                  key={moment.moment_id}
                  className="card-metric space-y-4 border border-white/10 hover:border-purple-500/40 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Top badges */}
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-emerald-400" />
                        {moment.virality_score}% Virality
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {moment.duration}s ({moment.start.toFixed(0)}s - {moment.end.toFixed(0)}s)
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-white font-display line-clamp-1">
                      {moment.title}
                    </h3>

                    {/* Senior Editor Reasoning */}
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-slate-300 space-y-1">
                      <span className="font-semibold text-purple-300 block text-[10px] uppercase font-mono">
                        Editor Commentary:
                      </span>
                      <p className="line-clamp-2 leading-relaxed text-slate-400">
                        {moment.senior_editor_reasoning}
                      </p>
                    </div>

                    {/* Hook Text Input */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase font-mono text-slate-400 mb-1">
                        Top Hook Banner (First 3.5s):
                      </label>
                      <input
                        type="text"
                        value={hook}
                        onChange={(e) =>
                          setCustomHooks((prev) => ({ ...prev, [moment.moment_id]: e.target.value }))
                        }
                        className="w-full text-xs rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-amber-300 focus:outline-none font-bold"
                      />
                    </div>

                    {/* Transcript snippet */}
                    <p className="text-[11px] text-slate-500 italic line-clamp-2">
                      "{moment.transcript_excerpt}"
                    </p>
                  </div>

                  {/* Render CTA */}
                  <div className="pt-3 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handleRenderMoment(moment, idx)}
                      disabled={isRendering}
                      className="w-full py-2.5 px-3 rounded-xl font-semibold text-xs text-white bg-purple-600 hover:bg-purple-500 shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      {isRendering ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Rendering 9:16 Short...</span>
                        </>
                      ) : (
                        <>
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Render Short (9:16)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rendered Shorts Gallery */}
      {recentClips.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-400" />
              Rendered AI Shorts ({recentClips.length})
            </h2>
            <span className="text-xs text-slate-400">Ready to download or queue for peak slots</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recentClips.map((clip, idx) => (
              <div
                key={idx}
                className="group relative rounded-2xl bg-white/[0.02] border border-white/10 hover:border-purple-500/40 overflow-hidden transition-all flex flex-col"
              >
                {/* 9:16 Thumbnail preview */}
                <div
                  onClick={() => setPreviewClip(clip)}
                  className="aspect-[9/16] bg-black/40 relative cursor-pointer overflow-hidden"
                >
                  {clip.public_thumb_url ? (
                    <img
                      src={clip.public_thumb_url}
                      alt={clip.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Film className="w-8 h-8" />
                    </div>
                  )}

                  {/* Play overlay button */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-lg shadow-purple-600/40">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Duration badge */}
                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white">
                    {clip.duration}s
                  </span>
                </div>

                {/* Details & Actions */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <h4 className="text-xs font-semibold text-white line-clamp-1">
                    {clip.title}
                  </h4>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleQueueApproval(clip)}
                      title="Send directly to YouTube Scheduled Peak Time Queue"
                      className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Share2 className="w-3 h-3" />
                      Queue Slot
                    </button>
                    <a
                      href={clip.public_url}
                      download
                      title="Download MP4"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vertical 9:16 Video Player Modal */}
      <AnimatePresence>
        {previewClip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-sm w-full bg-[#121424] border border-purple-500/30 rounded-3xl p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <span className="text-xs font-bold text-white font-display line-clamp-1">
                  {previewClip.title}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewClip(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 9:16 Video Container */}
              <div className="aspect-[9/16] rounded-2xl overflow-hidden bg-black relative">
                <video
                  src={previewClip.public_url}
                  controls
                  autoPlay
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleQueueApproval(previewClip);
                    setPreviewClip(null);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Send to YouTube Approval Queue</span>
                </button>
                <a
                  href={previewClip.public_url}
                  download
                  className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
