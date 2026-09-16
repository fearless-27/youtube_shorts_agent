import { useEffect, useState } from 'react';

export interface Video {
  id: string;
  approvalId?: string;
  source: 'approval' | 'media';
  title: string;
  type: 'SHORT' | 'VIDEO';
  viralityScore: number;
  fileStatus: 'LOCAL' | 'DELETED';
  youtubeUrl?: string;
  thumbnail: string;
  previewUrl?: string;
  createdAt: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'QUEUED' | 'UPLOADED' | 'FAILED';
  privacy: 'Public' | 'Unlisted' | 'Private';
}

export interface UploadRecord {
  videoId: string;
  youtubeUrl: string;
  uploadedAt: string;
  status: 'UPLOADED' | 'PROCESSING' | 'FAILED';
  cleanupStatus: 'FILES_DELETED' | 'LOCAL_FILES_EXIST';
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface PipelineSettings {
  mode: 'live' | 'semi-live' | 'dry-run';
  maxDailyUploads: number;
  privacy: 'Public' | 'Unlisted' | 'Private';
  timezone: string;
  peakUploadTimes: string[];
  uploadWindowMinutes: number;
  uploadWindowPosition: 'before' | 'after';
  autoDelete: boolean;
  telegramChannels: string;
  activePipeline: string;
}

export interface PipelineStats {
  uploadsToday: number;
  dailyCap: number;
  createdShorts: number;
  pendingApproval: number;
  avgViralityScore: number;
  successRate: number;
  pipelineStatus: 'RUNNING' | 'IDLE';
  growthTarget: number;
  growthCurrent: number;
  growthDailyTarget: number;
  bestTopic: string;
}

interface OverviewResponse {
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
  status?: {
    running?: boolean;
    log_tail?: string[];
  };
  config?: Record<string, unknown>;
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function apiPath(path: string) {
  return `${apiBaseUrl}${path}`;
}

export const videos: Video[] = [];
export const uploadRecords: UploadRecord[] = [];
export const pipelineLogs: LogEntry[] = [];
export const defaultSettings: PipelineSettings = {
  mode: 'semi-live',
  maxDailyUploads: 5,
  privacy: 'Public',
  timezone: 'America/New_York',
  peakUploadTimes: ['07:30', '11:30', '15:30', '18:30', '21:30'],
  uploadWindowMinutes: 30,
  uploadWindowPosition: 'before',
  autoDelete: true,
  telegramChannels: '',
  activePipeline: 'telegram_tamil_shorts_pipeline.py',
};
export const pipelineStats: PipelineStats = {
  uploadsToday: 0,
  dailyCap: 5,
  createdShorts: 0,
  pendingApproval: 0,
  avgViralityScore: 0,
  successRate: 0,
  pipelineStatus: 'IDLE',
  growthTarget: 10000,
  growthCurrent: 0,
  growthDailyTarget: 667,
  bestTopic: 'Waiting for data',
};

export async function pipelineAction(action: 'start' | 'stop') {
  const response = await fetch(apiPath(`/api/pipeline/${action}`), { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Pipeline ${action} failed`);
  }
  return response.json();
}

export function useDashboardData(refreshMs = 15000) {
  const [data, setData] = useState({
    videos,
    uploadRecords,
    pipelineLogs,
    defaultSettings,
    pipelineStats,
    loading: true,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(apiPath('/api/overview'), { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`API ${response.status}`);
        }
        const overview = (await response.json()) as OverviewResponse;
        if (!cancelled) {
          setData({
            ...mapOverview(overview),
            loading: false,
            error: '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setData((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : 'Could not load dashboard data',
          }));
        }
      }
    }

    load();
    const timer = window.setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshMs]);

  return data;
}

export async function updateApproval(id: string, approved: boolean) {
  const response = await fetch(apiPath(`/api/approvals/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved }),
  });
  if (!response.ok) {
    throw new Error(`Approval update failed: ${response.status}`);
  }
  return response.json();
}

export async function saveSettings(settings: PipelineSettings) {
  const peakUploadTimes = normalizePeakTimes(settings.peakUploadTimes);
  const response = await fetch(apiPath('/api/config'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: settings.mode === 'dry-run' ? 'dry_run' : settings.mode === 'semi-live' ? 'semi_live' : 'live',
      max_daily_uploads: settings.maxDailyUploads,
      upload_privacy: settings.privacy.toLowerCase(),
      upload_timezone: settings.timezone,
      upload_peak_times: peakUploadTimes,
      upload_window_minutes: settings.uploadWindowMinutes,
      upload_window_position: settings.uploadWindowPosition,
      delete_local_files_after_upload: settings.autoDelete,
      telegram_channels: settings.telegramChannels,
      active_pipeline: settings.activePipeline,
    }),
  });
  if (!response.ok) {
    throw new Error(`Settings save failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchAnalytics() {
  const response = await fetch(apiPath('/api/analytics'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Analytics fetch failed: ${response.status}`);
  return response.json();
}

export async function resetPipelineQueue() {
  const response = await fetch(apiPath('/api/pipeline/reset'), { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Pipeline reset failed: ${response.status}`);
  }
  return response.json();
}

function mapOverview(overview: OverviewResponse) {
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
  const avgVirality = average(allVideos.map((video) => video.viralityScore).filter((score) => score > 0));
  const successRate = uploads.length
    ? (uploads.filter((upload) => upload.status === 'UPLOADED').length / uploads.length) * 100
    : 0;
  const growthTarget = numberValue(config.subscriber_growth_target, 10000);
  const growthCurrent = numberValue(config.subscriber_growth_current, 0);
  const growthDays = Math.max(numberValue(config.subscriber_growth_days, 15), 1);
  const best = [...allVideos].sort((a, b) => b.viralityScore - a.viralityScore)[0];

  return {
    videos: allVideos,
    uploadRecords: uploads,
    pipelineLogs: logs,
    defaultSettings: mapSettings(config, dailyCap),
    pipelineStats: {
      uploadsToday,
      dailyCap,
      createdShorts: allVideos.length,
      pendingApproval: allVideos.filter((video) => video.status === 'PENDING_REVIEW').length,
      avgViralityScore: round(avgVirality),
      successRate: round(successRate),
      pipelineStatus: overview.status?.running ? 'RUNNING' as const : 'IDLE' as const,
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
    status: uploadStatus === 'uploaded'
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
  const parts = line.split('|').map((part) => part.trim());
  const timestamp = parts[0] || new Date().toISOString();
  const rawLevel = (parts[1] || 'INFO').toUpperCase();
  const level: LogEntry['level'] = rawLevel.includes('ERROR') ? 'ERROR' : rawLevel.includes('WARN') ? 'WARN' : 'INFO';
  return {
    timestamp,
    level,
    message: parts.slice(3).join(' | ') || parts.slice(1).join(' | ') || line,
  };
}

function mapSettings(config: Record<string, unknown>, dailyCap: number): PipelineSettings {
  const mode = String(config.mode ?? 'semi_live');
  const peakTimes = Array.isArray(config.upload_peak_times) ? config.upload_peak_times.map(String) : [];
  const uploadWindowPosition = String(config.upload_window_position ?? 'before') === 'after' ? 'after' : 'before';
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
  };
}

function normalizePeakTimes(values: string[]) {
  const times = values
    .map((value) => value.trim())
    .filter((value) => /^\d{2}:\d{2}$/.test(value));
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
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

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

export const pricingTiers = [
  { name: 'STARTER', price: 49, uploads: 10, channels: 1, features: ['10 uploads/day', '1 channel', 'Basic trend scanning', 'Email support'] },
  { name: 'OPERATOR', price: 149, uploads: 50, channels: 5, features: ['50 uploads/day', '5 channels', 'Virality AI access', 'Priority support', 'API access'], popular: true },
  { name: 'ENTERPRISE', price: 499, uploads: -1, channels: -1, features: ['Unlimited uploads', 'Unlimited channels', 'White-label option', 'Dedicated support', 'Custom integrations'] },
];

export const testimonials = [
  { quote: 'GhostPipe handles our entire Shorts operation. We went from 2 uploads a day to 40 without hiring an editor.', author: '@crypto_sarah' },
  { quote: 'The virality prediction is scary accurate. It flagged a clip that hit 3M views in 48 hours.', author: '@dev_marcus' },
  { quote: 'Finally, a tool that respects YouTube quotas. No more API bans.', author: '@content_labs' },
];
