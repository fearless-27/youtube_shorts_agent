import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch, apiPath } from '../lib/api';
import {
  type LogEntry,
  type PipelineSettings,
  type PipelineStats,
  type UploadRecord,
  type Video,
  defaultSettings,
  pipelineLogs as emptyLogs,
  pipelineStats as defaultStats,
  uploadRecords as emptyUploads,
  videos as emptyVideos,
} from '../data/store';

export interface UserAccount {
  role: 'admin' | 'normal';
  isAdmin: boolean;
  email: string;
  automationRuns: number;
  maxRuns: number | null;
  runsRemaining: number;
  canRun: boolean;
}

export interface ConnectedYouTubeChannel {
  connected: boolean;
  channel: {
    id: string;
    title: string;
    handle: string;
    avatar: string;
    subscriberCount: number;
    videoCount: number;
    connectedAt?: string;
  } | null;
  credentials_exist?: boolean;
}

const defaultAccount: UserAccount = {
  role: 'normal',
  isAdmin: false,
  email: '',
  automationRuns: 0,
  maxRuns: 1,
  runsRemaining: 1,
  canRun: true,
};

const defaultYouTubeChannel: ConnectedYouTubeChannel = {
  connected: false,
  channel: null,
  credentials_exist: false,
};

// ─── Context shape ───────────────────────────────────────────────────────────

interface DashboardContextValue {
  account: UserAccount;
  youtubeChannel: ConnectedYouTubeChannel;
  videos: Video[];
  uploadRecords: UploadRecord[];
  pipelineLogs: LogEntry[];
  pipelineStats: PipelineStats;
  defaultSettings: PipelineSettings;
  /** Raw config object from server for advanced fields */
  rawConfig: Record<string, unknown>;
  /** Whether auto_approve_pending is enabled */
  autoApproveEnabled: boolean;
  loading: boolean;
  error: string;
  isLive: boolean;
  lastUpdated: Date | null;
  /** Manually trigger a data refresh */
  refresh: () => void;
}

const DashboardContext = createContext<DashboardContextValue>({
  account: defaultAccount,
  youtubeChannel: defaultYouTubeChannel,
  videos: emptyVideos,
  uploadRecords: emptyUploads,
  pipelineLogs: emptyLogs,
  pipelineStats: defaultStats,
  defaultSettings,
  rawConfig: {},
  autoApproveEnabled: false,
  loading: true,
  error: '',
  isLive: false,
  lastUpdated: null,
  refresh: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

const REFRESH_MS = 15_000;

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<DashboardContextValue, 'refresh'>>({
    account: defaultAccount,
    youtubeChannel: defaultYouTubeChannel,
    videos: emptyVideos,
    uploadRecords: emptyUploads,
    pipelineLogs: emptyLogs,
    pipelineStats: defaultStats,
    defaultSettings,
    rawConfig: {},
    autoApproveEnabled: false,
    loading: true,
    error: '',
    isLive: false,
    lastUpdated: null,
  });

  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch('/api/overview', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 401) {
          // Session expired — the auth guard in Dashboard.tsx will redirect
          return;
        }
        throw new Error(`API ${response.status}`);
      }
      const overview = await response.json();
      if (!cancelledRef.current) {
        const mapped = mapOverview(overview);
        setState((current) => ({
          ...current,
          ...mapped,
          rawConfig: (overview.config as Record<string, unknown>) ?? {},
          autoApproveEnabled: Boolean((overview.config as Record<string, unknown>)?.auto_approve_pending),
          loading: false,
          error: '',
          lastUpdated: new Date(),
        }));
      }
    } catch (error) {
      if (!cancelledRef.current) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'Could not load dashboard data',
        }));
      }
    }
  }, []);

  const refresh = useCallback(() => { load(); }, [load]);

  useEffect(() => {
    cancelledRef.current = false;
    load();

    let eventSource: EventSource | null = null;
    let reconnectTimeout: number | undefined;

    let lastData = '';

    function connectSSE() {
      if (cancelledRef.current) return;
      try {
        const streamUrl = apiPath('/api/overview/stream');
        eventSource = new EventSource(streamUrl);

        eventSource.onopen = () => {
          if (!cancelledRef.current) {
            setState((current) => ({ ...current, isLive: true }));
          }
        };

        eventSource.addEventListener('overview', (e: MessageEvent) => {
          if (cancelledRef.current) return;
          if (e.data === lastData) return;
          lastData = e.data;
          try {
            const overview = JSON.parse(e.data);
            const mapped = mapOverview(overview);
            setState((current) => ({
              ...current,
              ...mapped,
              rawConfig: (overview.config as Record<string, unknown>) ?? {},
              autoApproveEnabled: Boolean((overview.config as Record<string, unknown>)?.auto_approve_pending),
              loading: false,
              error: '',
              isLive: true,
              lastUpdated: new Date(),
            }));
          } catch (parseError) {
            console.error('Failed to parse SSE overview packet:', parseError);
          }
        });

        eventSource.onerror = () => {
          if (!cancelledRef.current) {
            setState((current) => ({ ...current, isLive: false }));
          }
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!cancelledRef.current) {
            reconnectTimeout = window.setTimeout(connectSSE, 4000);
          }
        };
      } catch {
        if (!cancelledRef.current) {
          setState((current) => ({ ...current, isLive: false }));
        }
      }
    }

    connectSSE();

    // Fallback polling every 15s if EventSource drops or is unsupported
    const pollTimer = window.setInterval(() => {
      if (!eventSource || eventSource.readyState !== EventSource.OPEN) {
        load();
      }
    }, REFRESH_MS);

    return () => {
      cancelledRef.current = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      window.clearInterval(pollTimer);
    };
  }, [load]);

  return (
    <DashboardContext.Provider value={{ ...state, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDashboard() {
  return useContext(DashboardContext);
}

// ─── Data mapping (mirrors store.ts logic) ───────────────────────────────────

interface OverviewResponse {
  account?: {
    role?: 'admin' | 'normal';
    isAdmin?: boolean;
    email?: string;
    automation_runs?: number;
    max_runs?: number | null;
    runs_remaining?: number;
    can_run?: boolean;
  };
  youtube_channel?: ConnectedYouTubeChannel;
  quota?: {
    uploads?: number;
    short?: number;
    video?: number;
    max_daily_uploads?: number;
    history?: Array<{ timestamp?: string; video_id?: string; url?: string }>;
  };
  approvals?: Array<Record<string, unknown>>;
  report?: Record<string, unknown>;
  media?: Array<Record<string, unknown>>;
  status?: { running?: boolean; log_tail?: string[] };
  config?: Record<string, unknown>;
}

function mapOverview(overview: OverviewResponse) {
  const rawAcc = overview.account;
  const adminEmail = 'gobi56529@gmail.com';
  const email = (rawAcc?.email || '').toLowerCase();
  const isAdmin = rawAcc?.isAdmin === true || email === adminEmail;
  const role: 'admin' | 'normal' = isAdmin ? 'admin' : (rawAcc?.role || 'normal');
  const automationRuns = Number(rawAcc?.automation_runs ?? 0);
  const maxRuns = isAdmin ? null : 1;
  const runsRemaining = isAdmin ? 999999 : Number(rawAcc?.runs_remaining ?? Math.max(0, 1 - automationRuns));
  const canRun = isAdmin || (rawAcc?.can_run !== undefined ? Boolean(rawAcc.can_run) : automationRuns < 1);

  const account: UserAccount = {
    role,
    isAdmin,
    email: rawAcc?.email || '',
    automationRuns,
    maxRuns,
    runsRemaining,
    canRun,
  };

  const youtubeChannel: ConnectedYouTubeChannel = overview.youtube_channel || defaultYouTubeChannel;

  const approvalVideos = (overview.approvals ?? []).map(mapApprovalVideo);
  const mediaVideos = (overview.media ?? []).map(mapMediaVideo);
  const allVideos = dedupeVideos([...approvalVideos, ...mediaVideos]);
  const uploads = (overview.media ?? [])
    .filter((item) => Boolean((item.upload_result as Record<string, unknown> | undefined)?.url))
    .map(mapUploadRecord);
  const logs = (overview.status?.log_tail ?? []).map(parseLogLine);
  const quota = overview.quota ?? {};
  const config = overview.config ?? {};
  const dailyCap = numberValue(quota.max_daily_uploads ?? config.max_daily_uploads, 5);
  const uploadsToday = numberValue(quota.uploads, 0);
  const avgVirality = average(allVideos.map((v) => v.viralityScore).filter((s) => s > 0));
  const successRate = uploads.length
    ? (uploads.filter((u) => u.status === 'UPLOADED').length / uploads.length) * 100
    : 0;
  const growthTarget = numberValue(config.subscriber_growth_target, 10000);
  const growthCurrent = numberValue(config.subscriber_growth_current, 0);
  const growthDays = Math.max(numberValue(config.subscriber_growth_days, 15), 1);
  const best = [...allVideos].sort((a, b) => b.viralityScore - a.viralityScore)[0];

  return {
    account,
    youtubeChannel,
    videos: allVideos,
    uploadRecords: uploads,
    pipelineLogs: logs,
    defaultSettings: mapSettings(config, dailyCap),
    pipelineStats: {
      uploadsToday,
      dailyCap,
      createdShorts: allVideos.length,
      pendingApproval: allVideos.filter((v) => v.status === 'PENDING_REVIEW').length,
      avgViralityScore: round(avgVirality),
      successRate: round(successRate),
      pipelineStatus: overview.status?.running ? ('RUNNING' as const) : ('IDLE' as const),
      growthTarget,
      growthCurrent,
      growthDailyTarget: Math.max(Math.ceil((growthTarget - growthCurrent) / growthDays), 0),
      bestTopic: best?.title ?? 'Waiting for data',
    },
  };
}

function mapApprovalVideo(item: Record<string, unknown>): Video {
  const prediction = (item.prediction as Record<string, unknown> | undefined) ?? {};
  const metadata = (item.metadata as Record<string, unknown> | undefined) ?? {};
  const uploadResult = (item.upload_result as Record<string, unknown> | undefined) ?? {};
  const approved = item.approved;
  const uploadStatus = String(item.upload_status ?? '');

  return {
    id: String(item.id ?? item.video_path ?? crypto.randomUUID()),
    approvalId: String(item.id ?? item.video_path ?? ''),
    source: 'approval',
    title: String(metadata.title ?? item.title ?? 'Untitled Short'),
    type: String(item.content_type ?? 'short').toLowerCase() === 'video' ? 'VIDEO' : 'SHORT',
    viralityScore: numberValue(prediction.predicted_virality, 0),
    fileStatus: 'LOCAL',
    youtubeUrl: stringValue(uploadResult.url),
    thumbnail: stringValue(item.thumbnail_url) || publicUrlFromPath(item.thumbnail_path) || '',
    previewUrl: stringValue(item.public_url) || publicUrlFromPath(item.video_path),
    createdAt: String(item.timestamp ?? new Date().toISOString()),
    status:
      uploadStatus === 'uploaded'
        ? 'UPLOADED'
        : approved === true
        ? 'APPROVED'
        : approved === false
        ? 'REJECTED'
        : 'PENDING_REVIEW',
    privacy: privacyLabel(metadata.privacy),
  };
}

function mapMediaVideo(item: Record<string, unknown>): Video {
  const prediction = (item.prediction as Record<string, unknown> | undefined) ?? {};
  const uploadResult = (item.upload_result as Record<string, unknown> | undefined) ?? {};
  const uploaded = Boolean(uploadResult.url);

  return {
    id: String((uploadResult.video_id as string | undefined) ?? item.video_path ?? crypto.randomUUID()),
    source: 'media',
    title: String(item.title ?? 'Untitled Short'),
    type: String(item.content_type ?? 'short').toLowerCase() === 'video' ? 'VIDEO' : 'SHORT',
    viralityScore: numberValue(prediction.predicted_virality, 0),
    fileStatus: item.exists === false ? 'DELETED' : 'LOCAL',
    youtubeUrl: stringValue(uploadResult.url),
    thumbnail: stringValue(item.thumbnail_url) || publicUrlFromPath(item.thumbnail_path) || '',
    previewUrl: stringValue(item.public_url) || publicUrlFromPath(item.video_path),
    createdAt: String(item.timestamp ?? new Date().toISOString()),
    status: uploaded ? 'UPLOADED' : item.approved === true ? 'APPROVED' : 'PENDING_REVIEW',
    privacy: 'Public',
  };
}

function mapUploadRecord(item: Record<string, unknown>): UploadRecord {
  const uploadResult = (item.upload_result as Record<string, unknown> | undefined) ?? {};
  return {
    videoId: String(uploadResult.video_id ?? item.video_path ?? ''),
    youtubeUrl: String(uploadResult.url ?? ''),
    uploadedAt: String(item.timestamp ?? new Date().toISOString()),
    status: 'UPLOADED',
    cleanupStatus: item.exists === false ? 'FILES_DELETED' : 'LOCAL_FILES_EXIST',
  };
}

export function parseLogLine(line: string): LogEntry {
  const parts = line.split('|').map((p) => p.trim());
  const rawLevel = (parts[1] || 'INFO').toUpperCase();
  const level: LogEntry['level'] = rawLevel.includes('ERROR')
    ? 'ERROR'
    : rawLevel.includes('WARN')
    ? 'WARN'
    : 'INFO';
  return {
    timestamp: parts[0] || new Date().toISOString(),
    level,
    message: parts.slice(3).join(' | ') || parts.slice(1).join(' | ') || line,
  };
}

function mapSettings(config: Record<string, unknown>, dailyCap: number): PipelineSettings {
  const mode = String(config.mode ?? 'semi_live');
  const peakTimes = Array.isArray(config.upload_peak_times)
    ? (config.upload_peak_times as unknown[]).map(String)
    : [];
  const uploadWindowPosition =
    String(config.upload_window_position ?? 'before') === 'after' ? 'after' : 'before';
  return {
    mode: mode === 'dry_run' ? 'dry-run' : mode === 'semi_live' ? 'semi-live' : 'live',
    maxDailyUploads: numberValue(config.max_daily_uploads, dailyCap),
    privacy: privacyLabel(config.upload_privacy),
    timezone: String(config.upload_timezone ?? 'America/New_York'),
    peakUploadTimes: normalizePeakTimes(peakTimes),
    uploadWindowMinutes: numberValue(config.upload_window_minutes, 30),
    uploadWindowPosition,
    autoDelete: config.delete_local_files_after_upload !== false,
    telegramChannels: String(config.telegram_channels ?? config.telegram_channel ?? ''),
    activePipeline: String(config.active_pipeline ?? 'telegram_tamil_shorts_pipeline.py'),
    requiredAudioLanguage: String(config.required_audio_language ?? config.telegram_required_audio_language ?? 'ta'),
    skipOnAudioMismatch: config.skip_on_audio_mismatch !== false,
    audioReplacementMode: (config.audio_replacement_mode as PipelineSettings['audioReplacementMode']) ?? 'source',
    preferredTrackIndex: numberValue(config.telegram_audio_track_index ?? config.default_multi_audio_track_index, 1),
    telegramChannelName: String(config.telegram_channel_name ?? (config.telegram_header_text ? String(config.telegram_header_text).split('\n')[0] : 'NEMO SHORTS')),
    telegramChannelHandle: String(config.telegram_channel_handle ?? (config.telegram_header_text ? String(config.telegram_header_text).split('\n')[1] ?? '@nemoshorts' : '@nemoshorts')),
    telegramFooterText: String(config.telegram_footer_text ?? '🔔 SUBSCRIBE FOR MORE ANIME CONTENT 🤩'),
    telegramBrandColor: String(config.telegram_brand_color ?? '#00D2FF'),
  };
}

function normalizePeakTimes(values: string[]) {
  const times = values.map((v) => v.trim()).filter((v) => /^\d{2}:\d{2}$/.test(v));
  return times.length ? Array.from(new Set(times)).sort() : ['07:30', '11:30', '15:30', '18:30', '21:30'];
}

function dedupeVideos(items: Video[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.youtubeUrl || item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicUrlFromPath(value: unknown) {
  const path = (stringValue(value) ?? '').replaceAll('\\', '/');
  if (!path) return undefined;
  if (path.startsWith('outputs/')) return `/${path}`;
  if (path.startsWith('downloads/')) return `/${path}`;
  return undefined;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}
function round(value: number) { return Math.round(value * 10) / 10; }
function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}
function privacyLabel(value: unknown): PipelineSettings['privacy'] {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'private') return 'Private';
  if (raw === 'unlisted') return 'Unlisted';
  return 'Public';
}

// Re-export types for convenience
export type { Video, UploadRecord, LogEntry, PipelineSettings, PipelineStats };
