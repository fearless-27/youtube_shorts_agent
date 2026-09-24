import { useEffect, useState, useRef } from 'react';
import {
  SlidersHorizontal,
  Save,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Sparkles,
  Youtube,
  Unlink,
  RefreshCw,
  Play,
  Check,
  Layers,
  ExternalLink,
  Loader2,
  Eye,
  X,
  Cookie,
  Upload,
  FileCode,
  HardDrive,
  Trash2,
  Database,
  Download,
  FileVideo,
} from 'lucide-react';
import { useDashboard, type PipelineSettings } from '../../context/DashboardContext';
import {
  saveSettings,
  getCookieStatus,
  uploadCookieFile,
  fetchStorageStats,
  cleanStorage,
  type StorageStats,
  type StorageCleanOptions,
} from '../../data/store';
import { apiFetch } from '../../lib/api';

const TELEGRAM_TEMPLATES = [
  {
    id: 'anime_multi_tier',
    name: 'Pro Anime Multi-Tier',
    badge: 'Viral Anime',
    tag: 'Classic Multi-Tier',
    features: ['Top Sky Banner', 'Center Branding Bar', '16:9 Anime Clip', 'Bottom Character Art'],
    description: 'Top anime sky banner, center black branding bar with glowing avatar, and bottom anime character art frame.',
    preview_image: '/images/templates/preview_anime_multi_tier.png?v=v2_action_4k',
  },
  {
    id: 'cinematic_ambient',
    name: 'Cinematic Ambient Glow',
    badge: 'Premium Glow',
    tag: 'Ambient Video Backdrop',
    features: ['9:16 Ambient Blur', 'Floating 16:9 Clip', 'Glassmorphism Pill', 'Cyan-Purple Ring'],
    description: 'Full-bleed 9:16 blurred video glow with floating 16:9 clip, sleek glassmorphic channel pill and neon ring.',
    preview_image: '/images/templates/preview_cinematic_ambient.png?v=v2_action_4k',
  },
  {
    id: 'split_screen',
    name: 'Split-Screen Action',
    badge: 'High Retention',
    tag: 'Top Clip + Ticker Bar',
    features: ['Top 16:9 Action Clip', 'Neon Ticker Divider', 'Bottom Manga Panel', 'Dual Viewport'],
    description: 'High-retention top video clip with vibrant neon branding divider bar and bottom manga/visual art panel.',
    preview_image: '/images/templates/preview_split_screen.png?v=v2_action_4k',
  },
  {
    id: 'sleek_dark',
    name: 'Sleek Dark Creator',
    badge: 'Minimalist Studio',
    tag: 'Studio Matte + Pulse CTA',
    features: ['Obsidian Matte Studio', 'Top Glowing Avatar', 'Verified Badge', 'Pulse CTA Button'],
    description: 'Ultra-clean dark matte aesthetic with large glowing avatar ring, verified badge, and bold pulse CTA button.',
    preview_image: '/images/templates/preview_sleek_dark.png?v=v2_action_4k',
  },
];

export default function SettingsPage() {
  const { defaultSettings, refresh, youtubeChannel } = useDashboard();
  const [form, setForm] = useState<PipelineSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [connectingYt, setConnectingYt] = useState(false);
  const [disconnectingYt, setDisconnectingYt] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderJob, setRenderJob] = useState<{
    running: boolean;
    percent: number;
    status: string;
    completedClips?: Array<{ part: number; public_url: string; status: string }>;
  } | null>(null);
  const [previewModalTmpl, setPreviewModalTmpl] = useState<string | null>(null);
  const [cookieStatus, setCookieStatus] = useState<{
    browser: string;
    cookieFile: string;
    fileExists: boolean;
    fileSize: number;
    lastModified: string | null;
  } | null>(null);
  const [uploadingCookie, setUploadingCookie] = useState(false);
  const [cookieMsg, setCookieMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [storageMsg, setStorageMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [cleanOptions, setCleanOptions] = useState<StorageCleanOptions>({
    cleanTemp: true,
    cleanUploadedLocal: true,
    cleanRejected: true,
    cleanOrphans: true,
    cleanDownloads: false,
    vacuumDb: true,
  });
  const initializedRef = useRef(false);

  const loadStorage = async () => {
    try {
      const stats = await fetchStorageStats();
      setStorageStats(stats);
    } catch (err) {
      console.warn('Failed to load storage telemetry:', err);
    }
  };

  useEffect(() => {
    getCookieStatus().then(setCookieStatus).catch(() => {});
    loadStorage();
  }, []);

  const handleExecuteClean = async (customOpts?: StorageCleanOptions) => {
    setCleaningStorage(true);
    setStorageMsg(null);
    try {
      const opts = customOpts || cleanOptions;
      const res = await cleanStorage(opts);
      if (res.ok) {
        setStorageMsg({
          text: `✓ Cleaned ${res.deletedFilesCount} files! Reclaimed ${res.freedMB} MB disk space.${res.vacuumSuccess ? ' Database compacted.' : ''}`,
          ok: true,
        });
        await loadStorage();
        refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Storage clean error';
      setStorageMsg({ text: `Failed to clean storage: ${msg}`, ok: false });
    } finally {
      setCleaningStorage(false);
    }
  };

  const handleCookieFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCookie(true);
    setCookieMsg(null);
    try {
      const text = await file.text();
      const res = await uploadCookieFile(text);
      if (res.ok) {
        setCookieMsg({ text: `✓ Successfully loaded cookies.txt (${Math.round(res.fileSize / 1024)} KB)`, ok: true });
        setCookieStatus((prev) => prev ? { ...prev, fileExists: true, fileSize: res.fileSize, cookieFile: res.cookieFile } : null);
        setForm((prev) => ({ ...prev, ytDlpCookieFile: res.cookieFile }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown upload error';
      setCookieMsg({ text: `Failed to upload: ${msg}`, ok: false });
    } finally {
      setUploadingCookie(false);
    }
  };

  useEffect(() => {
    if (!initializedRef.current && defaultSettings) {
      setForm(defaultSettings);
      initializedRef.current = true;
    }
  }, [defaultSettings]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube') === 'connected') {
      const channel = params.get('channel') || 'your channel';
      setMsg({ text: `🎉 Successfully connected YouTube channel: ${channel}! Ready for automated uploads.`, type: 'ok' });
      refresh();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('youtube_error')) {
      const err = params.get('youtube_error');
      setMsg({ text: `Failed to link YouTube channel: ${err}`, type: 'err' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refresh]);

  const handleConnectYouTube = async () => {
    setConnectingYt(true);
    try {
      const res = await apiFetch('/api/youtube/auth-url');
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setMsg({ text: data.error || 'Could not generate Google authorization link', type: 'err' });
        setConnectingYt(false);
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Failed to start YouTube authentication', type: 'err' });
      setConnectingYt(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    if (!confirm('Are you sure you want to disconnect this YouTube channel?')) return;
    setDisconnectingYt(true);
    try {
      const res = await apiFetch('/api/youtube/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setMsg({ text: 'YouTube channel disconnected successfully.', type: 'ok' });
        refresh();
      }
    } catch (err: any) {
      setMsg({ text: err?.message || 'Failed to disconnect YouTube channel', type: 'err' });
    } finally {
      setDisconnectingYt(false);
    }
  };

  const handleTriggerRender = async () => {
    setRendering(true);
    setMsg(null);
    try {
      await saveSettings(form);
      const res = await apiFetch('/api/telegram/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: form.telegramRenderTemplate || 'anime_multi_tier' }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg({ text: data.error || 'Failed to trigger render', type: 'err' });
        setRendering(false);
        return;
      }
      setMsg({ text: `🎬 Started rendering Shorts with template: "${form.telegramRenderTemplate || 'anime_multi_tier'}"!`, type: 'ok' });
      setRenderJob(data.job || { running: true, percent: 0, status: 'Rendering started...' });

      const pollInterval = setInterval(async () => {
        try {
          const sRes = await apiFetch('/api/telegram/render-status');
          const sData = await sRes.json();
          if (sData.job) {
            setRenderJob(sData.job);
            if (!sData.job.running) {
              clearInterval(pollInterval);
              setRendering(false);
              refresh();
              if (sData.job.error) {
                setMsg({ text: `Render error: ${sData.job.error}`, type: 'err' });
              } else {
                setMsg({ text: `🎉 Rendering finished! Shorts generated with ${form.telegramRenderTemplate || 'anime_multi_tier'} template.`, type: 'ok' });
              }
            }
          }
        } catch {
          clearInterval(pollInterval);
          setRendering(false);
        }
      }, 2000);
    } catch (err: any) {
      setMsg({ text: err?.message || 'Error communicating with render API', type: 'err' });
      setRendering(false);
    }
  };

  const handleChange = <K extends keyof PipelineSettings>(field: K, value: PipelineSettings[K]) => {
    setForm((prev: PipelineSettings) => ({ ...prev, [field]: value }));
  };

  const handleSelectTemplate = async (tmplId: string) => {
    handleChange('telegramRenderTemplate', tmplId);
    try {
      await apiFetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_render_template: tmplId,
          telegram_template: tmplId,
        }),
      });
      refresh();
    } catch (err) {
      console.warn('Could not auto-save template preference:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const ok = await saveSettings(form);
      if (ok) {
        setMsg({ text: 'Pipeline parameters updated successfully!', type: 'ok' });
        refresh();
      } else {
        setMsg({ text: 'Failed to update pipeline settings', type: 'err' });
      }
    } catch {
      setMsg({ text: 'Error communicating with backend service', type: 'err' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white">
            System Settings
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure autonomous pipeline behavior, YouTube quota caps, and storage cleanup policies.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary !py-2.5 !px-5 text-xs font-semibold shrink-0"
        >
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Alert banner */}
      {msg && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-medium border ${
            msg.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
          }`}
        >
          {msg.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* ── YouTube Channel Connection Card ── */}
      <div className="card-metric border-red-500/25 bg-gradient-to-br from-[#1c131d]/70 via-[#16182a]/80 to-[#121424] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 shadow-md">
              <Youtube className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-white font-display">
                  YouTube Channel Link
                </h3>
                {youtubeChannel.connected ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected & Ready
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Not Linked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Connect your personal or brand YouTube channel to publish automated Shorts directly.
              </p>
            </div>
          </div>

          <div>
            {youtubeChannel.connected ? (
              <button
                type="button"
                onClick={handleDisconnectYouTube}
                disabled={disconnectingYt}
                className="btn-secondary !text-rose-300 hover:!text-white hover:!bg-rose-600/20 !border-rose-500/30 text-xs !py-2 !px-3.5 flex items-center gap-1.5 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                {disconnectingYt ? 'Disconnecting...' : 'Disconnect Channel'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectYouTube}
                disabled={connectingYt}
                className="btn-primary !bg-red-600 hover:!bg-red-500 text-xs !py-2.5 !px-5 font-semibold flex items-center gap-2 shadow-lg shadow-red-600/20 cursor-pointer"
              >
                <Youtube className="w-4 h-4 fill-current" />
                {connectingYt ? 'Redirecting to Google...' : 'Connect YouTube Channel'}
              </button>
            )}
          </div>
        </div>

        {/* Channel Details Display */}
        {youtubeChannel.connected && youtubeChannel.channel ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs">
            <div className="flex items-center gap-3.5">
              {youtubeChannel.channel.avatar ? (
                <img
                  src={youtubeChannel.channel.avatar}
                  alt={youtubeChannel.channel.title}
                  className="w-11 h-11 rounded-full border border-purple-500/30 shadow-sm object-cover"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center font-bold text-red-300 text-sm">
                  {youtubeChannel.channel.title.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{youtubeChannel.channel.title}</span>
                  {youtubeChannel.channel.handle && (
                    <span className="text-xs font-normal text-slate-400 font-mono">
                      {youtubeChannel.channel.handle}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                  <span>
                    Subscribers: <strong className="text-white tabular-nums font-mono">{Number(youtubeChannel.channel.subscriberCount || 0).toLocaleString()}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Uploads: <strong className="text-white tabular-nums font-mono">{Number(youtubeChannel.channel.videoCount || 0).toLocaleString()}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConnectYouTube}
                disabled={connectingYt}
                className="btn-secondary !text-[11px] !py-1.5 !px-3 text-slate-300 hover:text-white flex items-center gap-1.5"
                title="Switch or re-authorize with a different channel"
              >
                <RefreshCw className={`w-3 h-3 ${connectingYt ? 'animate-spin' : ''}`} />
                Switch Channel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-slate-300 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-white">How YouTube Linking Works:</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Clicking <strong>Connect YouTube Channel</strong> will open Google's secure authorization page. Once you grant permissions, NEMO will save your private channel credentials so all generated Tamil Shorts can automatically be scheduled and uploaded to your channel.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── YouTube Automation & Cookie Session Vault ── */}
      <div className="card-metric border-purple-500/25 bg-gradient-to-br from-[#121424] via-[#15182e] to-[#0e1022] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-md">
              <Cookie className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-white font-display">
                  YouTube Automation & Cookie Vault
                </h3>
                {cookieStatus?.fileExists ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    cookies.txt Active ({Math.round((cookieStatus.fileSize || 0) / 1024)} KB)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    Browser Extraction: {(form.ytDlpCookiesFromBrowser || 'chrome').toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Bypasses YouTube 403 sign-in blocks, age restrictions, and bot verification during autonomous Shorts ingestion.
              </p>
            </div>
          </div>
        </div>

        {cookieMsg && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
            cookieMsg.ok
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
          }`}>
            {cookieMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
            <span>{cookieMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Option 1: Browser Cookie Auto-Extraction */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-purple-400" />
                Browser Cookie Auto-Extractor
              </span>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                RECOMMENDED
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              yt-dlp will automatically pull authenticated YouTube sessions directly from your local browser profile.
            </p>
            <div>
              <label className="text-[10px] font-medium text-slate-400 block mb-1.5 uppercase font-mono">
                Select Source Browser
              </label>
              <select
                value={form.ytDlpCookiesFromBrowser || 'chrome'}
                onChange={(e) => setForm({ ...form, ytDlpCookiesFromBrowser: e.target.value })}
                className="w-full bg-[#0B0D1A] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
              >
                <option value="chrome">Google Chrome (Default)</option>
                <option value="edge">Microsoft Edge</option>
                <option value="firefox">Mozilla Firefox</option>
                <option value="brave">Brave Browser</option>
                <option value="chrome,edge,firefox">All Installed (Auto-fallback)</option>
                <option value="">Disabled / Use File Only</option>
              </select>
            </div>
          </div>

          {/* Option 2: Upload Dedicated Netscape cookies.txt */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                Netscape cookies.txt Vault
              </span>
              {cookieStatus?.fileExists && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  INSTALLED
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Exported from extensions like <em>Get cookies.txt LOCALLY</em>. Ideal if running on headless VPS or locked browser databases.
            </p>

            <div className="flex items-center gap-3 pt-1">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleCookieFileUpload}
                  disabled={uploadingCookie}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 text-xs font-semibold transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingCookie ? 'Uploading...' : 'Upload cookies.txt'}</span>
                </div>
              </label>

              {form.ytDlpCookieFile && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, ytDlpCookieFile: '' });
                    setCookieMsg({ text: 'Cookie file decoupled. Reverted to browser extraction.', ok: true });
                  }}
                  className="btn-secondary !text-xs !py-2 !px-3 text-slate-400 hover:text-rose-300"
                  title="Remove cookie file reference"
                >
                  Clear File
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── One-Click Storage & Database Janitor Card ── */}
      <div className="card-metric border-cyan-500/25 bg-gradient-to-br from-[#121424] via-[#101428] to-[#0d1020] space-y-5">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-md">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-white font-display">
                  Database & Storage Janitor
                </h3>
                {storageStats ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                    {storageStats.totalUsed.mb > 1024
                      ? `${storageStats.totalUsed.gb} GB DISK USED`
                      : `${storageStats.totalUsed.mb} MB DISK USED`}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/20 text-slate-400">
                    Calculating...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time disk breakdown, orphaned video cleaner, and SQLite database vacuum compactor.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadStorage}
              disabled={cleaningStorage}
              className="btn-secondary !text-xs !py-2 !px-3 text-slate-300 hover:text-white flex items-center gap-1.5"
              title="Refresh Storage Metrics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cleaningStorage ? 'animate-spin' : ''}`} />
              <span>Refresh Stats</span>
            </button>

            <button
              type="button"
              onClick={() => handleExecuteClean()}
              disabled={cleaningStorage}
              className="btn-primary !bg-gradient-to-r !from-cyan-600 !to-purple-600 hover:!from-cyan-500 hover:!to-purple-500 !text-white text-xs !py-2 !px-4 font-semibold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              {cleaningStorage ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Purging...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>One-Click Clean</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {storageMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              storageMsg.ok
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
            }`}
          >
            {storageMsg.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{storageMsg.text}</span>
          </div>
        )}

        {/* 4 Metric Chips */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Outputs */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5">
                <FileVideo className="w-3.5 h-3.5 text-purple-400" />
                Rendered Outputs
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {storageStats?.outputs.count ?? 0} files
              </span>
            </div>
            <div className="text-lg font-bold text-white font-mono tabular-nums">
              {storageStats?.outputs.mb ?? 0} <span className="text-xs font-normal text-slate-400">MB</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Final 9:16 vertical shorts & preview clips
            </div>
          </div>

          {/* Downloads */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Downloads Cache
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {storageStats?.downloads.count ?? 0} files
              </span>
            </div>
            <div className="text-lg font-bold text-white font-mono tabular-nums">
              {storageStats?.downloads.mb ?? 0} <span className="text-xs font-normal text-slate-400">MB</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Raw source videos & downloaded assets
            </div>
          </div>

          {/* Temp Files */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Temp Artifacts
              </span>
              <span className="font-mono text-[10px] text-amber-400/80">
                {storageStats?.tempArtifacts.count ?? 0} files
              </span>
            </div>
            <div className="text-lg font-bold text-white font-mono tabular-nums">
              {storageStats?.tempArtifacts.mb ?? 0} <span className="text-xs font-normal text-slate-400">MB</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Temporary .wav audio, .srt, & MoviePy chunks
            </div>
          </div>

          {/* Database */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                Database & Jobs
              </span>
              <span className="font-mono text-[10px] text-emerald-400/80">SQLite</span>
            </div>
            <div className="text-lg font-bold text-white font-mono tabular-nums">
              {storageStats?.database.mb ?? 0} <span className="text-xs font-normal text-slate-400">MB</span>
            </div>
            <div className="text-[10px] text-slate-400 leading-tight">
              Copyright index, queue state, & job logs
            </div>
          </div>
        </div>

        {/* Granular Cleaning Toggles & Quick Purge Presets */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Granular Purge Options:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleExecuteClean({
                    cleanTemp: true,
                    cleanUploadedLocal: true,
                    cleanRejected: true,
                    cleanOrphans: true,
                    cleanDownloads: false,
                    vacuumDb: true,
                  })
                }
                disabled={cleaningStorage}
                className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
              >
                Safe Cleanup
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={() =>
                  handleExecuteClean({
                    cleanTemp: true,
                    cleanUploadedLocal: true,
                    cleanRejected: true,
                    cleanOrphans: true,
                    cleanDownloads: true,
                    vacuumDb: true,
                  })
                }
                disabled={cleaningStorage}
                className="text-[11px] font-medium text-purple-300 hover:text-purple-200 underline cursor-pointer"
              >
                Deep Clean (+Downloads Cache)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 text-xs">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.cleanTemp}
                onChange={(e) => setCleanOptions({ ...cleanOptions, cleanTemp: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              <span>Stray temp files (*.wav, *.srt, *TEMP_MPY*)</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.cleanUploadedLocal}
                onChange={(e) => setCleanOptions({ ...cleanOptions, cleanUploadedLocal: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              <span>Delete local video once uploaded to YouTube</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.cleanRejected}
                onChange={(e) => setCleanOptions({ ...cleanOptions, cleanRejected: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              <span>Delete rejected videos & clear from queue</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.cleanOrphans}
                onChange={(e) => setCleanOptions({ ...cleanOptions, cleanOrphans: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              <span>Purge unlinked/orphaned videos in outputs</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.cleanDownloads}
                onChange={(e) => setCleanOptions({ ...cleanOptions, cleanDownloads: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              <span>Clear raw downloaded source clips (&gt;12h old)</span>
            </label>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanOptions.vacuumDb}
                onChange={(e) => setCleanOptions({ ...cleanOptions, vacuumDb: e.target.checked })}
                className="rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-0"
              />
              <span>Compact SQLite database (VACUUM)</span>
            </label>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ── Execution Mode & Automation Card ── */}
        <div className="card-metric space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                Execution Mode & Automation
              </h3>
              <p className="text-[11px] text-slate-400">
                Choose the operational autonomy level for content publication
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {[
              {
                id: 'live',
                name: 'Live Mode',
                badge: 'Full Auto',
                desc: 'Continuous autonomous scrapers, speech translation, and instant YouTube delivery.',
              },
              {
                id: 'semi-live',
                name: 'Semi-Live',
                badge: 'Recommended',
                desc: 'Assembles vertical Shorts but holds for operator approval before publishing.',
              },
              {
                id: 'dry-run',
                name: 'Dry Run',
                badge: 'Test Only',
                desc: 'Simulates extraction and rendering without publishing to YouTube channels.',
              },
            ].map((mode) => {
              const isActive = form.mode === mode.id;
              return (
                <div
                  key={mode.id}
                  onClick={() => handleChange('mode', mode.id as PipelineSettings['mode'])}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                    isActive
                      ? 'bg-purple-900/30 border-purple-500/60 shadow-lg shadow-purple-500/10'
                      : 'bg-white/[0.02] border-white/5 hover:border-purple-500/25'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-white">{mode.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isActive
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-white/5 text-slate-400 border-white/10'
                      }`}
                    >
                      {mode.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{mode.desc}</p>
                </div>
              );
            })}
          </div>

          {/* ── Active Pipeline Engine Layer (High-Visibility) ── */}
          <div className="pt-3 space-y-2.5 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-white tracking-wide">
                Active Pipeline Engine
              </label>
              <span className="text-[11px] font-mono text-purple-300 bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded-md">
                Active: {form.activePipeline}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {[
                {
                  id: 'telegram_tamil_shorts_pipeline.py',
                  title: 'Telegram Tamil Shorts',
                  badge: 'Tamil Anime',
                  desc: 'Auto-downloads from Telegram channels, detects Tamil audio, and renders 9:16 Shorts with branded overlays.',
                  badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                },
                {
                  id: 'ghostpipe_v5_1_pipeline.py',
                  title: 'NEMO v5.1 Autonomous',
                  badge: 'Viral Trends (1M+)',
                  desc: 'Unified 24/7 trend engine targeting 1M+ views in trending music, comedy, Free Fire, and anime. Built-in video-use-main editing & color grading.',
                  badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
                },
              ].map((pipe) => {
                const isActive = form.activePipeline === pipe.id;
                return (
                  <div
                    key={pipe.id}
                    onClick={() => handleChange('activePipeline', pipe.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-200 flex items-start justify-between gap-3 ${
                      isActive
                        ? 'bg-[#181635] border-purple-500 shadow-[0_0_20px_rgba(139,92,246,0.3)] ring-1 ring-purple-500/50'
                        : 'bg-[#111322] border-white/10 hover:border-purple-500/30 hover:bg-[#15182a]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-white tracking-wide">{pipe.title}</span>
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${pipe.badgeClass}`}>
                          {pipe.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed mb-1.5 font-normal">{pipe.desc}</p>
                      <code className="text-xs text-purple-300 font-mono font-medium">{pipe.id}</code>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        isActive
                          ? 'border-purple-400 bg-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.7)]'
                          : 'border-slate-500 bg-black/30'
                      }`}
                    >
                      {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Quotas & Scheduling Card ── */}
        <div className="card-metric space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                Upload Quotas & Distribution
              </h3>
              <p className="text-[11px] text-slate-400">
                Rate limiting and schedule cadence parameters
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Total Daily YouTube Upload Quota</span>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  15 / day (10 Telegram + 5 Viral)
                </span>
              </label>
              <input
                type="number"
                value={form.maxDailyUploads ?? 15}
                onChange={(e) => handleChange('maxDailyUploads', parseInt(e.target.value) || 0)}
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Allocation: 10 Telegram Tamil Shorts render & upload + 5 Trending Viral Shorts (Total: 15 daily quota).
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Upload Cadence Window (Minutes)
              </label>
              <input
                type="number"
                value={form.uploadWindowMinutes ?? 30}
                onChange={(e) => handleChange('uploadWindowMinutes', parseInt(e.target.value) || 0)}
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Minimum space between automatic channel uploads.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Operating Timezone
              </label>
              <input
                type="text"
                value={form.timezone || 'Asia/Kolkata'}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Peak Upload Schedule Slots (HH:MM, 24h)
              </label>
              <input
                type="text"
                value={Array.isArray(form.peakUploadTimes) ? form.peakUploadTimes.join(', ') : '07:00, 08:00, 09:15, 10:30, 11:45, 13:00, 14:15, 15:30, 16:45, 18:00, 19:00, 20:00, 21:00, 22:00, 22:45'}
                onChange={(e) => handleChange('peakUploadTimes', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                placeholder="07:00, 08:00, 09:15, 10:30, 11:45, 13:00, 14:15, 15:30, 16:45, 18:00, 19:00, 20:00, 21:00, 22:00, 22:45"
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Target high-traffic windows for publishing scheduled vertical Shorts.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Telegram Source Channels
              </label>
              <input
                type="text"
                value={form.telegramChannels || ''}
                onChange={(e) => handleChange('telegramChannels', e.target.value)}
                placeholder="@channel1, @channel2"
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* ── Audio Track & Language Processing Card ── */}
        <div className="card-metric space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                Audio Track & Language Processing
              </h3>
              <p className="text-[11px] text-slate-400">
                User-selected audio language matching, automatic non-matching deletion, and replacement mode
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Required Audio Language */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Select Required Audio Language</span>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  {form.requiredAudioLanguage?.toUpperCase() || 'TA'}
                </span>
              </label>
              <select
                value={form.requiredAudioLanguage || 'ta'}
                onChange={(e) => handleChange('requiredAudioLanguage', e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full text-xs rounded-xl bg-[#121424] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none [&>option]:bg-[#121424] [&>option]:text-white font-medium"
              >
                <option value="ta" className="bg-[#121424] text-white">🇮🇳 Tamil (ta) — Default for Tamil Shorts</option>
                <option value="hi" className="bg-[#121424] text-white">🇮🇳 Hindi (hi)</option>
                <option value="en" className="bg-[#121424] text-white">🌐 English (en)</option>
                <option value="te" className="bg-[#121424] text-white">🇮🇳 Telugu (te)</option>
                <option value="any" className="bg-[#121424] text-white">🎵 Any Language / Original Audio (No filter)</option>
              </select>
              <span className="text-[11px] text-slate-400 mt-1 block">
                The pipeline checks multi-track audio streams & AI speech recognition for this exact language.
              </span>
            </div>

            {/* Audio Processing Mode */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Audio Processing / Replacement Mode
              </label>
              <select
                value={form.audioReplacementMode || 'source'}
                onChange={(e) => handleChange('audioReplacementMode', e.target.value as PipelineSettings['audioReplacementMode'])}
                style={{ colorScheme: 'dark' }}
                className="w-full text-xs rounded-xl bg-[#121424] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none [&>option]:bg-[#121424] [&>option]:text-white font-medium"
              >
                <option value="source" className="bg-[#121424] text-white">Preserve Selected Source Audio Track</option>
                <option value="tts" className="bg-[#121424] text-white">Replace with AI Tamil Voiceover (TTS)</option>
                <option value="bgm" className="bg-[#121424] text-white">Replace / Mix with Background Music (BGM)</option>
              </select>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Choose to preserve the authentic language soundtrack or generate voiceover / music.
              </span>
            </div>
          </div>

          {/* Strict Language Enforcement Box */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/25 via-[#141628] to-purple-950/15 border border-purple-500/20 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white block">
                  Automatic Deletion on Language Mismatch
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Strict Filter
                </span>
              </div>
              <span className="text-[11px] text-slate-300 block leading-relaxed max-w-xl">
                If the downloaded video contains the selected audio language, <strong>render and upload it</strong>. If the audio is not found, <strong>immediately delete the video file</strong> to save storage and automatically move to the next video.
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={form.skipOnAudioMismatch ?? true}
                onChange={(e) => handleChange('skipOnAudioMismatch', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-sm"></div>
            </label>
          </div>
        </div>

        {/* ── Telegram Shorts Template & Channel Branding ── */}
        <div className="card-metric space-y-5 border-purple-500/30 shadow-[0_0_30px_rgba(139,92,246,0.15)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/5 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white font-display flex items-center gap-2">
                  <span>Telegram Render Templates & Visual Layout</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                    {TELEGRAM_TEMPLATES.find((t) => t.id === (form.telegramRenderTemplate || 'anime_multi_tier'))?.badge || 'Multi-Template'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Select a viral video layout template, preview your custom branding, and render 1080×1920 Shorts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTriggerRender}
                disabled={rendering}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white text-xs font-semibold shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50 cursor-pointer"
              >
                {rendering ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Render Shorts with Selected Template</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Render Progress Bar (if active) */}
          {renderJob && (renderJob.running || renderJob.percent > 0) && (
            <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  {renderJob.running ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  {renderJob.status}
                </span>
                <span className="font-mono text-cyan-400 font-bold">{renderJob.percent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300 rounded-full"
                  style={{ width: `${renderJob.percent}%` }}
                />
              </div>
              {renderJob.completedClips && renderJob.completedClips.length > 0 && (
                <div className="text-[11px] text-slate-300 flex items-center justify-between pt-1">
                  <span>{renderJob.completedClips.length} Shorts ready in outputs/</span>
                  <a
                    href="/dashboard/studio"
                    className="text-cyan-400 hover:text-cyan-300 font-mono inline-flex items-center gap-1"
                  >
                    <span>View in Content Studio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 4 Template Selection Cards */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200">
                  Select Visual Layout Template (All 4 Templates Available)
                </label>
                <p className="text-[11px] text-slate-400">
                  Click to choose your preferred layout. Every template renders in ultra-high resolution 1080×1920 with crisp branding.
                </p>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shrink-0 self-start sm:self-auto">
                1080 × 1920 (9:16 Vertical)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TELEGRAM_TEMPLATES.map((tmpl) => {
                const isSelected = (form.telegramRenderTemplate || 'anime_multi_tier') === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() => handleSelectTemplate(tmpl.id)}
                    className={`relative rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-cyan-950/30 border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.3)] ring-2 ring-cyan-400/80'
                        : 'bg-white/[0.02] border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Full 9:16 Smartphone Preview Box */}
                      <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-black border border-white/10 shadow-lg flex items-center justify-center group-hover:border-cyan-500/40 transition-colors">
                        <img
                          src={tmpl.preview_image}
                          alt={tmpl.name}
                          className="w-full h-full object-contain bg-black group-hover:scale-[1.02] transition-transform duration-300"
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur text-[10px] font-mono text-cyan-300 border border-cyan-500/40">
                          {tmpl.badge}
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 flex items-center gap-1 shadow-lg font-bold text-[10px] font-mono">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>ACTIVE</span>
                          </div>
                        )}

                        {/* Enlarge Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewModalTmpl(tmpl.id);
                          }}
                          className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/85 hover:bg-cyan-500 hover:text-black text-slate-200 text-[10px] font-mono border border-white/20 transition-all flex items-center gap-1 backdrop-blur shadow-md"
                          title="Enlarge full-screen preview"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Enlarge</span>
                        </button>
                      </div>

                      {/* Info & Badges */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-white font-display">
                            {tmpl.name}
                          </h4>
                          <span className="text-[10px] font-mono text-cyan-400/90">{tmpl.tag}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {tmpl.description}
                        </p>

                        {/* Feature Badges */}
                        <div className="flex flex-wrap gap-1 pt-1">
                          {tmpl.features.map((feat, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5"
                            >
                              {feat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">Layout Tier</span>
                      <span className={isSelected ? 'text-cyan-400 font-bold flex items-center gap-1' : 'text-slate-500'}>
                        {isSelected ? '✓ Selected' : 'Click to Apply'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-4 rounded-xl bg-black/60 border border-white/10 flex flex-col sm:flex-row items-center gap-4">
            <div
              className="relative w-16 h-16 rounded-full overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.4)] shrink-0 bg-slate-900 flex items-center justify-center"
              style={{
                border: `2px solid ${form.telegramBrandColor || '#00D2FF'}`,
              }}
            >
              <img
                src="/images/logo.png"
                alt="Channel Avatar"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1 min-w-0">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
                <span>Render Header Preview</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-cyan-300">
                  {TELEGRAM_TEMPLATES.find((t) => t.id === (form.telegramRenderTemplate || 'anime_multi_tier'))?.name}
                </span>
              </div>
              <div className="text-base font-bold text-white font-display tracking-wide truncate">
                {form.telegramChannelName || 'NEMO SHORTS'}
              </div>
              <div className="text-xs font-mono truncate" style={{ color: form.telegramBrandColor || '#00D2FF' }}>
                {form.telegramChannelHandle || '@nemoshorts'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {form.telegramFooterText || '🔔 SUBSCRIBE FOR MORE ANIME CONTENT 🤩'}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-slate-300 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Live Sync
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Channel Name (Bold Header Title)
              </label>
              <input
                type="text"
                value={form.telegramChannelName ?? 'NEMO SHORTS'}
                onChange={(e) => handleChange('telegramChannelName', e.target.value)}
                placeholder="e.g. NEMO SHORTS"
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-cyan-500/40 focus:outline-none font-medium"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Rendered on the branding tier above or inside the video overlay.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Channel Handle (@Handle)
              </label>
              <input
                type="text"
                value={form.telegramChannelHandle ?? '@nemoshorts'}
                onChange={(e) => handleChange('telegramChannelHandle', e.target.value)}
                placeholder="e.g. @nemoshorts"
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-cyan-500/40 focus:outline-none font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                YouTube handle or Telegram channel username.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Bottom Call-To-Action (Footer Text)
              </label>
              <input
                type="text"
                value={form.telegramFooterText ?? '🔔 SUBSCRIBE FOR MORE ANIME CONTENT 🤩'}
                onChange={(e) => handleChange('telegramFooterText', e.target.value)}
                placeholder="🔔 SUBSCRIBE FOR MORE ANIME CONTENT 🤩"
                className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white focus:border-cyan-500/40 focus:outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Avatar Glow Ring Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.telegramBrandColor ?? '#00D2FF'}
                  onChange={(e) => handleChange('telegramBrandColor', e.target.value)}
                  className="w-10 h-10 rounded-xl bg-transparent border border-white/20 cursor-pointer"
                />
                <input
                  type="text"
                  value={form.telegramBrandColor ?? '#00D2FF'}
                  onChange={(e) => handleChange('telegramBrandColor', e.target.value)}
                  className="w-full text-xs rounded-xl bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-white font-mono focus:border-cyan-500/40 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Content Privacy & Storage Hygiene ── */}
        <div className="card-metric space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                Privacy & Storage Hygiene
              </h3>
              <p className="text-[11px] text-slate-400">
                Default YouTube video visibility and local disk purge behavior
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Default YouTube Visibility
              </label>
              <select
                value={form.privacy || 'Public'}
                onChange={(e) => handleChange('privacy', e.target.value as PipelineSettings['privacy'])}
                style={{ colorScheme: 'dark' }}
                className="w-full text-xs rounded-xl bg-[#121424] border border-white/10 px-3.5 py-2.5 text-white focus:border-purple-500/40 focus:outline-none [&>option]:bg-[#121424] [&>option]:text-white"
              >
                <option value="Public" className="bg-[#121424] text-white">Public (Publish to subscriber feed immediately)</option>
                <option value="Unlisted" className="bg-[#121424] text-white">Unlisted (Inspect on YouTube before publicizing)</option>
                <option value="Private" className="bg-[#121424] text-white">Private (Draft state only)</option>
              </select>
            </div>

            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white block">
                  Auto-Purge Raw Files
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Delete intermediate downloads after YouTube upload
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoDelete ?? true}
                  onChange={(e) => handleChange('autoDelete', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* ── Database & Storage Janitor ── */}
        <div className="card-metric space-y-5 border border-cyan-500/20 bg-gradient-to-b from-[#111422] to-[#0b0d17] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-32 bg-cyan-500/5 blur-3xl pointer-events-none rounded-full" />
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white font-display">
                    Database & Storage Janitor
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold uppercase tracking-wider">
                    One-Click Clean
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Real-time disk consumption telemetry, unreferenced media purge & SQLite database compaction
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadStorage}
              disabled={cleaningStorage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-medium text-slate-300 hover:text-white transition-colors border border-white/10 self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Refresh Telemetry</span>
            </button>
          </div>

          {/* Telemetry Metric Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <FileVideo className="w-3 h-3 text-emerald-400" />
                  Rendered Outputs
                </span>
                <span className="font-mono text-[10px] text-slate-500">{storageStats?.outputs.count ?? 0} files</span>
              </div>
              <div className="text-base font-bold font-mono text-white">
                {storageStats?.outputs.mb !== undefined ? `${storageStats.outputs.mb} MB` : '...'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3 text-sky-400" />
                  Raw Downloads
                </span>
                <span className="font-mono text-[10px] text-slate-500">{storageStats?.downloads.count ?? 0} files</span>
              </div>
              <div className="text-base font-bold font-mono text-white">
                {storageStats?.downloads.mb !== undefined ? `${storageStats.downloads.mb} MB` : '...'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <Trash2 className="w-3 h-3 text-amber-400" />
                  Temp Artifacts
                </span>
                <span className="font-mono text-[10px] text-slate-500">{storageStats?.tempArtifacts.count ?? 0} files</span>
              </div>
              <div className="text-base font-bold font-mono text-amber-400">
                {storageStats?.tempArtifacts.mb !== undefined ? `${storageStats.tempArtifacts.mb} MB` : '...'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3 text-purple-400" />
                  DB & State
                </span>
                <span className="font-mono text-[10px] text-slate-500">SQLite + JSON</span>
              </div>
              <div className="text-base font-bold font-mono text-purple-300">
                {storageStats?.database.mb !== undefined ? `${storageStats.database.mb} MB` : '...'}
              </div>
            </div>
          </div>

          {/* Purge Granular Options */}
          <div className="space-y-2 pt-1">
            <div className="text-xs font-semibold text-slate-300">Target Cleanup Policies:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanOptions.cleanTemp}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, cleanTemp: e.target.checked })}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300">Clean temporary audio/subtitles (.wav, .srt, .tmp, TEMP_MPY)</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanOptions.cleanUploadedLocal}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, cleanUploadedLocal: e.target.checked })}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300">Purge local MP4 of uploaded videos (preserves YouTube URL)</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanOptions.cleanRejected}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, cleanRejected: e.target.checked })}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300">Purge rejected & deleted draft videos and thumbnails</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanOptions.cleanOrphans}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, cleanOrphans: e.target.checked })}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300">Purge orphaned output files not referenced in approval queue</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanOptions.cleanDownloads}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, cleanDownloads: e.target.checked })}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300">Purge raw downloaded videos older than 12 hours</span>
              </label>

              <label className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanOptions.vacuumDb}
                  onChange={(e) => setCleanOptions({ ...cleanOptions, vacuumDb: e.target.checked })}
                  className="rounded border-white/20 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300">Compact SQLite database via VACUUM</span>
              </label>
            </div>
          </div>

          {/* Feedback banner */}
          {storageMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                storageMsg.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {storageMsg.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{storageMsg.text}</span>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={cleaningStorage}
                onClick={() =>
                  handleExecuteClean({
                    cleanTemp: true,
                    cleanUploadedLocal: true,
                    cleanRejected: true,
                    cleanOrphans: true,
                    cleanDownloads: false,
                    vacuumDb: true,
                  })
                }
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
              >
                Safe Cleanup
              </button>
              <button
                type="button"
                disabled={cleaningStorage}
                onClick={() =>
                  handleExecuteClean({
                    cleanTemp: true,
                    cleanUploadedLocal: true,
                    cleanRejected: true,
                    cleanOrphans: true,
                    cleanDownloads: true,
                    vacuumDb: true,
                  })
                }
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
              >
                Deep Clean All
              </button>
            </div>

            <button
              type="button"
              disabled={cleaningStorage}
              onClick={() => handleExecuteClean()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-[0_0_25px_rgba(6,182,212,0.35)] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {cleaningStorage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Purging & Compacting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>One-Click Clean Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ── Fullscreen Template Inspection Modal ── */}
      {previewModalTmpl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewModalTmpl(null)}
        >
          <div
            className="relative w-full max-w-lg bg-[#0F1222] border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)] overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            {(() => {
              const tmpl = TELEGRAM_TEMPLATES.find((t) => t.id === previewModalTmpl);
              if (!tmpl) return null;
              const isSelected = (form.telegramRenderTemplate || 'anime_multi_tier') === tmpl.id;
              return (
                <>
                  <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
                        9:16
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                          <span>{tmpl.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                            {tmpl.badge}
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-400">{tmpl.tag}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewModalTmpl(null)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Modal Body: Large Pristine 9:16 Preview */}
                  <div className="p-5 overflow-y-auto flex flex-col items-center gap-4 bg-slate-950/80">
                    <div className="relative w-64 aspect-[9/16] rounded-2xl overflow-hidden bg-black border-2 border-white/20 shadow-2xl flex items-center justify-center">
                      <img
                        src={tmpl.preview_image}
                        alt={tmpl.name}
                        className="w-full h-full object-contain bg-black"
                      />
                    </div>

                    <div className="w-full max-w-sm space-y-2 text-center sm:text-left bg-white/[0.03] p-3 rounded-xl border border-white/10">
                      <div className="text-xs font-semibold text-slate-200">Template Specifications:</div>
                      <p className="text-xs text-slate-400 leading-relaxed">{tmpl.description}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tmpl.features.map((f, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                          >
                            ✓ {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="px-5 py-3.5 border-t border-white/10 flex items-center justify-between bg-black/50">
                    <button
                      type="button"
                      onClick={() => setPreviewModalTmpl(null)}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectTemplate(tmpl.id);
                        setPreviewModalTmpl(null);
                      }}
                      className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Currently Selected</span>
                        </>
                      ) : (
                        <span>Use This Template</span>
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
