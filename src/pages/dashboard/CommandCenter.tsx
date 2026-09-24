import { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  Square,
  RefreshCw,
  Trash2,
  Download,
  Pause,
  Volume2,
  Wand2,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Search,
  Activity,
  Sparkles,
} from 'lucide-react';
import { parseLogLine, useDashboard, type LogEntry } from '../../context/DashboardContext';
import { apiFetch, apiPath } from '../../lib/api';

interface AudioTrack {
  track_index: number;
  codec: string;
  channels: number;
  channel_layout?: string;
  sample_rate: number;
  bit_rate?: string;
  duration?: string;
  language: string;
  title: string;
}

interface VideoFileItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  url: string;
  is_output?: boolean;
}

interface TelegramPipelineStatus {
  running: boolean;
  pid: number | null;
  mode: string;
  started_at: string | null;
}

export default function CommandCenter() {
  const { account, refresh: refreshDashboard, pipelineLogs } = useDashboard();

  // ── Pipeline State ──
  const [pipelineStatus, setPipelineStatus] = useState<TelegramPipelineStatus>({
    running: false,
    pid: null,
    mode: 'idle',
    started_at: null,
  });
  const [isTriggering, setIsTriggering] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // ── File Management State ──
  const [files, setFiles] = useState<VideoFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedVideoPath, setSelectedVideoPath] = useState('');

  // ── Audio Intelligence State ──
  const [inspecting, setInspecting] = useState(false);
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [detectingTrack, setDetectingTrack] = useState<number | null>(null);
  const [aiDetections, setAiDetections] = useState<Record<number, {
    language_code: string;
    language_name: string;
    confidence: number;
  }>>({});
  const [previewingTrack, setPreviewingTrack] = useState<number | null>(null);
  const [audioPreviews, setAudioPreviews] = useState<Record<number, string>>({});
  const [selectedTrackToKeep, setSelectedTrackToKeep] = useState<number>(0);
  const [normalizeLoudness, setNormalizeLoudness] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [swappedResult, setSwappedResult] = useState<{
    video_url?: string;
    output_path?: string;
    error?: string;
  } | null>(null);

  // ── Live Logs State ──
  const [logs, setLogs] = useState<LogEntry[]>(() => (pipelineLogs && pipelineLogs.length > 0 ? pipelineLogs : []));
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // ── Fetch Status & Files ──
  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setPipelineStatus(data);
      }
    } catch {
      // offline/silent
    }
  };

  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const res = await apiFetch('/api/telegram/downloads');
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
        if (data.length > 0 && !selectedVideoPath) {
          setSelectedVideoPath(data[0].path);
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchFiles();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Initialize logs from context if empty
  useEffect(() => {
    if (pipelineLogs && pipelineLogs.length > 0 && logs.length === 0) {
      setLogs(pipelineLogs);
    }
  }, [pipelineLogs, logs.length]);

  // ── SSE Live Logs Stream ──
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = () => {
      try {
        es = new EventSource(apiPath('/api/logs/stream'));

        const handleData = (raw: string) => {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setLogs(parsed.map(parseLogLine));
            }
          } catch {
            // ignore malformed chunk
          }
        };

        es.onopen = () => {
          setIsStreamConnected(true);
        };

        es.addEventListener('logs', (event) => {
          handleData(event.data);
        });

        es.onmessage = (event) => {
          handleData(event.data);
        };

        es.onerror = () => {
          setIsStreamConnected(false);
          es?.close();
          reconnectTimeout = setTimeout(connectSSE, 2500);
        };
      } catch {
        setIsStreamConnected(false);
      }
    };

    connectSSE();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      es?.close();
    };
  }, []);

  // Auto scroll terminal
  useEffect(() => {
    if (autoScroll && logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // ── Pipeline Actions ──
  const handleRunOnce = async () => {
    if (!account.isAdmin && !account.canRun) {
      setActionMessage('Trial limit reached: Normal accounts are permitted only 1 test run. Contact administrator for full access.');
      return;
    }
    setIsTriggering(true);
    setActionMessage('Triggering single cycle run (--once)...');
    try {
      const res = await apiFetch('/api/telegram/run-once', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage(data.error || 'Trial limit reached for this account.');
        refreshDashboard();
        return;
      }
      setActionMessage(`Single cycle initiated (PID: ${data.pid || 'running'})`);
      fetchStatus();
      fetchFiles();
      refreshDashboard();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setIsTriggering(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleStartContinuous = async () => {
    if (!account.isAdmin && !account.canRun) {
      setActionMessage('Trial limit reached: Normal accounts are permitted only 1 test run. Contact administrator for full access.');
      return;
    }
    setIsTriggering(true);
    setActionMessage('Starting continuous pipeline daemon...');
    try {
      const res = await apiFetch('/api/telegram/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage(data.error || 'Trial limit reached for this account.');
        refreshDashboard();
        return;
      }
      setActionMessage(`Continuous pipeline running (PID: ${data.pid || 'running'})`);
      fetchStatus();
      refreshDashboard();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setIsTriggering(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleStop = async () => {
    setIsTriggering(true);
    setActionMessage('Sending stop signal to pipeline process...');
    try {
      const res = await apiFetch('/api/telegram/stop', { method: 'POST' });
      const data = await res.json();
      setActionMessage(`Pipeline stopped: ${data.status}`);
      fetchStatus();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setIsTriggering(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // ── Audio Intelligence Actions ──
  const handleInspect = async () => {
    if (!selectedVideoPath) return;
    setInspecting(true);
    setInspectError(null);
    setTracks([]);
    setAiDetections({});
    setAudioPreviews({});
    setSwappedResult(null);

    try {
      const res = await apiFetch('/api/audio-tools/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: selectedVideoPath }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setTracks(data.tracks || []);
      } else {
        setInspectError(data.message || 'Failed to inspect audio streams');
      }
    } catch (err: any) {
      setInspectError(err.message || 'Failed to connect to audio tools API');
    } finally {
      setInspecting(false);
    }
  };

  const handleAiDetect = async (trackIndex: number) => {
    if (!selectedVideoPath) return;
    setDetectingTrack(trackIndex);
    try {
      const res = await apiFetch('/api/audio-tools/ai-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: selectedVideoPath,
          track_index: trackIndex,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAiDetections((prev) => ({
          ...prev,
          [trackIndex]: {
            language_code: data.language_code,
            language_name: data.language_name,
            confidence: data.confidence,
          },
        }));
      } else {
        alert(`AI Detection error: ${data.message || 'Unknown failure'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setDetectingTrack(null);
    }
  };

  const handlePreviewAudio = async (trackIndex: number) => {
    if (!selectedVideoPath) return;
    setPreviewingTrack(trackIndex);
    try {
      const res = await apiFetch('/api/audio-tools/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: selectedVideoPath,
          track_index: trackIndex,
        }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.preview_url) {
        setAudioPreviews((prev) => ({
          ...prev,
          [trackIndex]: data.preview_url,
        }));
      } else {
        alert(`Preview generation failed: ${data.message || 'Error'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setPreviewingTrack(null);
    }
  };

  const handleSwapAudio = async () => {
    if (!selectedVideoPath) return;
    setSwapping(true);
    setSwappedResult(null);

    try {
      const res = await apiFetch('/api/audio-tools/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_path: selectedVideoPath,
          track_index: selectedTrackToKeep,
          loudnorm: normalizeLoudness,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSwappedResult({
          video_url: data.video_url,
          output_path: data.output_path,
        });
        fetchFiles();
      } else {
        setSwappedResult({ error: data.message || 'Audio track swap failed' });
      }
    } catch (err: any) {
      setSwappedResult({ error: err.message || 'Network error' });
    } finally {
      setSwapping(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await apiFetch('/api/logs', { method: 'DELETE' });
      setLogs([]);
    } catch {
      // ignore
    }
  };

  const handleDownloadLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-telemetry-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter logs for terminal view
  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'ALL' && log.level !== levelFilter) return false;
    if (logSearchQuery.trim()) {
      return log.message.toLowerCase().includes(logSearchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white">
            Command Center
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Low-level pipeline daemon controls, neural audio track studio, and live event telemetry.
          </p>
        </div>

        {/* Global Pipeline State Indicator */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#121424] border border-purple-500/20 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                pipelineStatus.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300 font-medium">
              Daemon: <strong className="text-white">{pipelineStatus.running ? 'RUNNING' : 'IDLE'}</strong>
            </span>
            {pipelineStatus.pid && (
              <span className="text-purple-300 font-mono text-[11px]">
                (PID: {pipelineStatus.pid})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action status message toast */}
      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-purple-900/40 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between shadow-lg animate-fade-in">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* ── Daemon Control Action Bar ── */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#14162B] to-[#1B1E38] border border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white font-display">
              Autonomous Pipeline Execution
            </h3>
            {account.isAdmin ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                👑 Admin (Unlimited Runs)
              </span>
            ) : (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                account.canRun
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}>
                {account.canRun ? '⚡ 1-Time Test Run Available' : '🔒 1-Time Test Run Used'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {account.isAdmin
              ? 'Trigger on-demand cycles or toggle the continuous background monitor daemon with full administrator privileges.'
              : account.canRun
              ? 'Normal account: You have 1 test run to verify that YouTube automation is working properly.'
              : 'Trial completed: Your 1 allowed test run has been used. Please contact administrator (gobi56529@gmail.com) for full access.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunOnce}
            disabled={isTriggering || pipelineStatus.running || (!account.isAdmin && !account.canRun)}
            className="btn-secondary text-xs !py-2 !px-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title={!account.isAdmin && !account.canRun ? "1-time trial run already used for this account" : "Execute a single crawl, convert, and review cycle"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTriggering ? 'animate-spin' : ''}`} />
            Run Single Cycle (--once)
          </button>

          {!pipelineStatus.running ? (
            <button
              onClick={handleStartContinuous}
              disabled={isTriggering || (!account.isAdmin && !account.canRun)}
              className="btn-primary text-xs !py-2 !px-4 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!account.isAdmin && !account.canRun ? "1-time trial run already used for this account" : "Start continuous pipeline daemon"}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Continuous Daemon
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={isTriggering}
              className="btn-primary !bg-rose-600 hover:!bg-rose-500 text-xs !py-2 !px-4"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Pipeline Daemon
            </button>
          )}
        </div>
      </div>

      {/* ── Audio Intelligence & Track Studio Section ── */}
      <div className="card-metric space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white font-display">
                Neural Audio Intelligence Studio
              </h3>
              <p className="text-xs text-slate-400">
                Inspect multi-language audio streams, detect Tamil vocals via Faster-Whisper, and swap tracks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchFiles}
              className="btn-secondary !py-1.5 !px-3 !text-xs"
              title="Refresh downloaded media files"
            >
              <RefreshCw className={`w-3 h-3 ${loadingFiles ? 'animate-spin' : ''}`} />
              Refresh Media
            </button>
          </div>
        </div>

        {/* Video File Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Select Video File for Audio Analysis
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedVideoPath}
                onChange={(e) => setSelectedVideoPath(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full text-xs rounded-xl bg-[#121424] border border-white/10 px-3 py-2 text-white focus:border-purple-500/40 focus:outline-none [&>option]:bg-[#121424] [&>option]:text-white"
              >
                {files.length === 0 ? (
                  <option value="" className="bg-[#121424] text-slate-300">No media files found in pipeline storage</option>
                ) : (
                  files.map((file) => (
                    <option key={file.path} value={file.path} className="bg-[#121424] text-white">
                      {file.name} ({formatFileSize(file.size)})
                    </option>
                  ))
                )}
              </select>

              <button
                onClick={handleInspect}
                disabled={inspecting || !selectedVideoPath}
                className="btn-primary !py-2 !px-4 text-xs shrink-0 disabled:opacity-50"
              >
                <Wand2 className={`w-3.5 h-3.5 ${inspecting ? 'animate-spin' : ''}`} />
                Inspect Tracks
              </button>
            </div>
          </div>

          {/* Loudnorm Option */}
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer p-2 rounded-xl bg-white/[0.02] border border-white/5">
              <input
                type="checkbox"
                checked={normalizeLoudness}
                onChange={(e) => setNormalizeLoudness(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-500"
              />
              <span>Apply EBU R128 Loudness Normalization</span>
            </label>
          </div>
        </div>

        {/* Error message */}
        {inspectError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{inspectError}</span>
          </div>
        )}

        {/* Detected Audio Tracks Table */}
        {tracks.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Discovered Audio Tracks ({tracks.length})
              </span>
              <span className="text-[11px] text-purple-400 font-mono">
                Select target track to preserve / isolate
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.01]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-slate-400 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-4 w-12">Select</th>
                    <th className="py-2.5 px-4">Track #</th>
                    <th className="py-2.5 px-4">Codec / Layout</th>
                    <th className="py-2.5 px-4">Metadata Language</th>
                    <th className="py-2.5 px-4">Whisper AI Detection</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {tracks.map((track) => {
                    const aiDet = aiDetections[track.track_index];
                    const previewUrl = audioPreviews[track.track_index];
                    const isSelected = selectedTrackToKeep === track.track_index;

                    return (
                      <tr
                        key={track.track_index}
                        className={`hover:bg-white/[0.02] transition-colors ${
                          isSelected ? 'bg-purple-500/5' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="radio"
                            name="selectedTrack"
                            checked={isSelected}
                            onChange={() => setSelectedTrackToKeep(track.track_index)}
                            className="cursor-pointer accent-purple-500"
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-white">
                          Track #{track.track_index}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {track.codec.toUpperCase()} • {track.channels}ch ({track.channel_layout || 'stereo'})
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {track.language || 'und'} {track.title ? `(${track.title})` : ''}
                        </td>
                        <td className="py-3 px-4">
                          {aiDet ? (
                            <span className="badge-stakent badge-purple !text-[10px]">
                              <Sparkles className="w-3 h-3 mr-1 text-purple-400" />
                              {aiDet.language_name} ({Math.round(aiDet.confidence * 100)}%)
                            </span>
                          ) : (
                            <span className="text-slate-600">Not analyzed</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {previewUrl ? (
                              <audio
                                src={previewUrl}
                                controls
                                className="h-7 w-36 scale-90"
                              />
                            ) : (
                              <button
                                onClick={() => handlePreviewAudio(track.track_index)}
                                disabled={previewingTrack === track.track_index}
                                className="text-[11px] text-purple-400 hover:text-purple-300 px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20"
                              >
                                {previewingTrack === track.track_index ? 'Extracting...' : '15s Preview'}
                              </button>
                            )}

                            <button
                              onClick={() => handleAiDetect(track.track_index)}
                              disabled={detectingTrack === track.track_index}
                              className="text-[11px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20"
                            >
                              {detectingTrack === track.track_index ? 'Detecting...' : 'AI Detect'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Swap Track Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div className="text-xs text-slate-400">
                Preserving Track #{selectedTrackToKeep} with {normalizeLoudness ? 'EBU R128 loudness' : 'standard gain'}
              </div>

              <button
                onClick={handleSwapAudio}
                disabled={swapping}
                className="btn-primary text-xs !py-2 !px-4"
              >
                <Cpu className={`w-3.5 h-3.5 ${swapping ? 'animate-spin' : ''}`} />
                {swapping ? 'Processing Audio Stream...' : 'Extract & Replace Audio Track'}
              </button>
            </div>
          </div>
        )}

        {/* Swapped Output Display */}
        {swappedResult && (
          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Audio Track Swapped Successfully
            </div>
            {swappedResult.output_path && (
              <div className="text-xs font-mono text-slate-400 break-all">
                Output: {swappedResult.output_path}
              </div>
            )}
            {swappedResult.video_url && (
              <video
                src={swappedResult.video_url}
                controls
                className="max-h-56 rounded-lg bg-black mx-auto"
              />
            )}
          </div>
        )}
      </div>

      {/* ── Interactive Live Console Terminal ── */}
      <div className="rounded-2xl bg-[#0B0D1A] border border-purple-500/20 overflow-hidden shadow-2xl">
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#121424] border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>

            <div className="h-4 w-px bg-white/10" />

            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-semibold text-white font-mono">
                Pipeline Telemetry Stream
              </span>
            </div>

            <span
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono border transition-colors ${
                isStreamConnected
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isStreamConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {isStreamConnected ? 'Live SSE' : 'Connecting...'}
            </span>
          </div>

          {/* Terminal Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Level Filter Pills */}
            <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/5 text-[10px]">
              {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-2 py-0.5 rounded-lg transition-colors font-mono ${
                    levelFilter === lvl
                      ? 'bg-purple-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                autoScroll
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                  : 'bg-white/5 text-slate-400'
              }`}
              title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll paused'}
            >
              {autoScroll ? <Activity className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>

            {/* Download Log */}
            <button
              onClick={handleDownloadLogs}
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
              title="Download raw log file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Clear Logs */}
            <button
              onClick={handleClearLogs}
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
              title="Clear terminal buffer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search inside terminal */}
        <div className="px-5 py-2 bg-[#0F1120] border-b border-white/5 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search terminal output..."
            value={logSearchQuery}
            onChange={(e) => setLogSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none font-mono"
          />
        </div>

        {/* Terminal Screen */}
        <div
          ref={logTerminalRef}
          className="p-5 font-mono text-xs space-y-1 h-96 overflow-y-auto bg-[#070913] text-slate-300 leading-relaxed select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 text-center py-16">
              Console output ready. Trigger a cycle to see real-time pipeline telemetry.
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const isError = log.level === 'ERROR';
              const isWarn = log.level === 'WARN';

              return (
                <div key={index} className="flex items-start gap-3 hover:bg-white/[0.02] py-0.5 px-1 rounded">
                  <span className="text-slate-600 select-none text-[11px] shrink-0">
                    {log.timestamp ? log.timestamp.slice(11, 19) : '--:--:--'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 uppercase select-none ${
                      isError
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : isWarn
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span
                    className={`flex-1 break-all ${
                      isError
                        ? 'text-rose-300'
                        : isWarn
                        ? 'text-amber-200'
                        : 'text-slate-300'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
