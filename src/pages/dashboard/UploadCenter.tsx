import { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Search,
  Calendar,
  ShieldCheck,
  HardDrive,
  RotateCcw,
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { resetLiveQuota } from '../../data/store';
import MetricCard from '../../components/ui/MetricCard';

export default function UploadCenter() {
  const { uploadRecords, pipelineStats, defaultSettings, loading, refresh } = useDashboard();
  const [filter, setFilter] = useState<'ALL' | 'UPLOADED' | 'FAILED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resettingQuota, setResettingQuota] = useState(false);
  const [quotaToast, setQuotaToast] = useState<string | null>(null);

  const uploadsToday = pipelineStats.uploadsToday ?? 0;
  const dailyCap = pipelineStats.dailyCap ?? 50;
  const remainingQuota = Math.max(0, dailyCap - uploadsToday);
  const quotaUsedPct = Math.min(100, Math.round((uploadsToday / dailyCap) * 100));

  const quotaDonutData = [
    { name: 'Used Quota', value: uploadsToday, color: '#8B5CF6' },
    { name: 'Remaining', value: remainingQuota, color: '#1E2238' },
  ];

  const filteredRecords = uploadRecords.filter((record) => {
    if (searchQuery.trim()) {
      const match = record.videoId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (record.youtubeUrl && record.youtubeUrl.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!match) return false;
    }
    if (filter === 'UPLOADED') return record.status === 'UPLOADED';
    if (filter === 'FAILED') return record.status === 'FAILED';
    return true;
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLiveResetQuota = async () => {
    try {
      setResettingQuota(true);
      await resetLiveQuota(false);
      setQuotaToast('Daily upload quota has been reset to 0.');
      setTimeout(() => setQuotaToast(null), 3500);
      refresh();
    } catch (err: any) {
      setQuotaToast(err?.message || 'Failed to reset quota');
      setTimeout(() => setQuotaToast(null), 3500);
    } finally {
      setResettingQuota(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Toast Feedback */}
      {quotaToast && (
        <div className="p-3.5 rounded-xl bg-purple-900/40 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between shadow-lg">
          <span>{quotaToast}</span>
          <button onClick={() => setQuotaToast(null)} className="text-slate-400 hover:text-white ml-3">
            ✕
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white">
            Upload Center
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            YouTube API quota tracking, distribution schedule, and delivery telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge-stakent badge-green">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            OAuth Token Valid
          </span>
          <span className="text-xs text-slate-400 font-mono px-3 py-1 rounded-xl bg-white/[0.04] border border-white/10">
            Channel: Tamil Shorts Official
          </span>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        <MetricCard
          title="Daily Quota Consumption"
          value={`${uploadsToday} / ${dailyCap}`}
          subtitle={`${quotaUsedPct}% capacity exhausted`}
          change={{ value: `${remainingQuota} slots left`, positive: remainingQuota > 5 }}
          color="purple"
          badge="YouTube API"
          icon={<UploadCloud className="w-5 h-5" />}
        />

        <MetricCard
          title="Pipeline Delivery Success"
          value={`${pipelineStats.successRate ?? 98}%`}
          subtitle="Zero dropped payloads"
          change={{ value: '+1.2%', positive: true }}
          color="emerald"
          badge="Reliability"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />

        <MetricCard
          title="Scheduled Dispatch Windows"
          value={defaultSettings.peakUploadTimes?.length || 4}
          subtitle="Peak engagement slots"
          change={{ value: 'IST Timezone', positive: true }}
          color="indigo"
          badge="Automation"
          icon={<Calendar className="w-5 h-5" />}
        />
      </div>

      {/* ── Quota Donut & Distribution Windows Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Recharts Quota Donut */}
        <div className="card-metric flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                API Quota Utilization
              </h3>
              <p className="text-[11px] text-slate-400">Resets daily at 00:00 midnight</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleLiveResetQuota}
                disabled={resettingQuota}
                className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Reset quota to 0 immediately"
              >
                <RotateCcw className={`w-3 h-3 text-purple-400 ${resettingQuota ? 'animate-spin' : ''}`} />
                <span>{resettingQuota ? 'Resetting...' : 'Live Reset'}</span>
              </button>
            </div>
          </div>

          <div className="relative h-44 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={quotaDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={68}
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {quotaDonutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1D30',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderRadius: '12px',
                    color: '#FFF',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Inner Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold font-display text-white">
                {quotaUsedPct}%
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Quota Used
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>Used: <strong className="text-white font-semibold">{uploadsToday}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1E2238]" />
                <span>Cap: <strong className="text-white font-semibold">{dailyCap}</strong></span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>✓ Auto-reset: Daily</span>
              <span>Remaining: <strong className="text-emerald-400">{remainingQuota}</strong></span>
            </div>
          </div>
        </div>

        {/* Right: Peak Upload Schedule & Auto-Purge Rules (Span 2) */}
        <div className="lg:col-span-2 card-metric flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white font-display">
                  Algorithmic Peak Windows & Storage Policy
                </h3>
                <p className="text-xs text-slate-400">
                  Automated upload timing based on Tamil audience viewership telemetry
                </p>
              </div>
              <span className="badge-stakent badge-purple text-[10px]">
                <Clock className="w-3 h-3 mr-1" />
                Active Automation
              </span>
            </div>

            {/* Peak Times Pill Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 mb-5">
              {(defaultSettings.peakUploadTimes && defaultSettings.peakUploadTimes.length > 0
                ? defaultSettings.peakUploadTimes
                : [
                    '07:00', '08:00', '09:15', '10:30', '11:45',
                    '13:00', '14:15', '15:30', '16:45', '18:00',
                    '19:00', '20:00', '21:00', '22:00', '22:45'
                  ]
              ).map((time: string, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-white/[0.03] border border-purple-500/15 text-center group hover:border-purple-500/40 transition-colors"
                >
                  <span className="text-[10px] font-mono text-purple-400 block mb-0.5">
                    SLOT #{idx + 1}
                  </span>
                  <span className="text-sm font-bold font-display text-white group-hover:text-purple-300">
                    {time} IST
                  </span>
                </div>
              ))}
            </div>

            {/* Storage Policy Callout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3">
                <HardDrive className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Auto-Purge Policy</span>
                  <span className="text-slate-400 text-[11px] leading-relaxed">
                    Source footage automatically scrubbed 48 hours post-upload to conserve NVMe storage.
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">Duplicate Detection</span>
                  <span className="text-slate-400 text-[11px] leading-relaxed">
                    SHA-256 audio hash prevents re-uploading identical clips across pipeline cycles.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Timezone: Asia/Kolkata (+05:30)</span>
            <span className="text-purple-400 font-medium">Privacy: Public</span>
          </div>
        </div>
      </div>

      {/* ── Upload History Table & Filter Bar ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 rounded-2xl bg-[#121424] border border-purple-500/15">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-1 px-1">
            <button
              onClick={() => setFilter('ALL')}
              className={`pill-tab ${filter === 'ALL' ? 'pill-tab-active' : ''}`}
            >
              All Records
              <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/10 font-mono">
                {uploadRecords.length}
              </span>
            </button>

            <button
              onClick={() => setFilter('UPLOADED')}
              className={`pill-tab ${filter === 'UPLOADED' ? 'pill-tab-active' : ''}`}
            >
              Successfully Uploaded
            </button>

            <button
              onClick={() => setFilter('FAILED')}
              className={`pill-tab ${filter === 'FAILED' ? 'pill-tab-active' : ''}`}
            >
              Failed / Retried
            </button>
          </div>

          {/* Search Box */}
          <div className="relative sm:w-72 px-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Video ID or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/10 focus:border-purple-500/40 text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Records Table */}
        <div className="rounded-2xl bg-[#121424] border border-purple-500/15 overflow-hidden">
          {loading && uploadRecords.length === 0 ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No upload records match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-slate-400 font-mono uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Video Identifier</th>
                    <th className="py-3 px-4">Uploaded At</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Local Files</th>
                    <th className="py-3 px-4 text-right">Destination</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredRecords.map((record) => {
                    const isSuccess = record.status === 'UPLOADED';
                    return (
                      <tr
                        key={record.videoId}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3.5 px-4 font-mono font-medium text-white">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[240px]" title={record.videoId}>
                              {record.videoId}
                            </span>
                            <button
                              onClick={() => handleCopy(record.videoId, record.videoId)}
                              className="text-slate-500 hover:text-purple-400 p-1 rounded transition-colors"
                              title="Copy ID"
                            >
                              {copiedId === record.videoId ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-slate-400 font-mono">
                          {record.uploadedAt
                            ? new Date(record.uploadedAt).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Recent'}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`badge-stakent ${
                              isSuccess ? 'badge-green' : 'badge-amber'
                            }`}
                          >
                            {record.status}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full border ${
                              record.cleanupStatus === 'FILES_DELETED'
                                ? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                            }`}
                          >
                            {record.cleanupStatus || 'LOCAL_FILES_EXIST'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {record.youtubeUrl ? (
                            <a
                              href={record.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-white border border-purple-500/20 transition-all"
                            >
                              Watch Short
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-600 font-mono">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
