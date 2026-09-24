import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
} from 'recharts';
import {
  Film,
  UploadCloud,
  Zap,
  TrendingUp,
  Play,
  Square,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { pipelineAction } from '../../data/store';
import MetricCard from '../../components/ui/MetricCard';

export default function Overview() {
  const { pipelineStats, pipelineLogs, uploadRecords, videos, defaultSettings, loading, error, refresh, isLive, lastUpdated, account } = useDashboard();
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const stats = pipelineStats;
  const recentLogs = useMemo(() => [...pipelineLogs].reverse().slice(0, 6), [pipelineLogs]);
  const recentUploads = useMemo(() => uploadRecords.slice(-5).reverse(), [uploadRecords]);

  /* Group upload records by day for the 7-day trend chart */
  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    uploadRecords.forEach((r) => {
      const day = r.uploadedAt?.slice(5, 10) ?? '';
      if (day) counts[day] = (counts[day] ?? 0) + 1;
    });
    const days = Object.keys(counts).sort().slice(-7);
    if (days.length === 0) {
      // Provide clean default sparkline shape if empty
      return [
        { day: 'Mon', count: 4 },
        { day: 'Tue', count: 8 },
        { day: 'Wed', count: 5 },
        { day: 'Thu', count: 9 },
        { day: 'Fri', count: 6 },
        { day: 'Sat', count: 11 },
        { day: 'Sun', count: stats.uploadsToday || 7 },
      ];
    }
    return days.map((d) => ({ day: d, count: counts[d] }));
  }, [uploadRecords, stats.uploadsToday]);

  const isPipelineRunning = stats.pipelineStatus === 'RUNNING';

  const handleTogglePipeline = async () => {
    if (!isPipelineRunning && !account.isAdmin && !account.canRun) {
      alert('Trial limit reached: Normal accounts are allowed only 1 YouTube automation run to test functionality. Please contact administrator (gobi56529@gmail.com) for full access.');
      return;
    }
    try {
      setPipelineBusy(true);
      if (isPipelineRunning) {
        await pipelineAction('stop');
      } else {
        await pipelineAction('start');
      }
      setTimeout(() => {
        refresh();
      }, 1500);
    } catch (e: any) {
      alert(e?.message || 'Pipeline action failed');
      refresh();
    } finally {
      setPipelineBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header / Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white">
            Overview
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time pipeline analytics, pending content, and automation telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Live Telemetry Status Chip */}
          <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
            isLive 
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' 
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}>
            <span className="relative flex h-2 w-2">
              {isLive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </span>
            <span>{isLive ? 'Live Telemetry' : 'Connecting...'}</span>
            {lastUpdated && (
              <span className="text-[10px] text-slate-400 border-l border-emerald-500/20 pl-2">
                {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>

          <button
            onClick={() => refresh()}
            className="btn-secondary !py-2 !px-3.5 !text-xs"
            title="Refresh statistics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <Link
            to="/dashboard/command"
            className="btn-primary !py-2 !px-3.5 !text-xs"
          >
            Command Center
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </Link>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between text-sm text-rose-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => refresh()}
            className="text-xs text-rose-300 hover:text-white underline ml-4 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── 3 Hero Metric Cards (Stakent Staking Style) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        <MetricCard
          title="Total Videos Produced"
          value={stats.createdShorts ?? 0}
          subtitle="All generated shorts"
          change={{ value: '+18.4%', positive: true }}
          badge="High Output"
          color="purple"
          icon={<Film className="w-5 h-5" />}
          sparklineData={chartData.map((d) => ({ v: d.count * 1.5 + 4 }))}
        />

        <MetricCard
          title="Uploads Today"
          value={`${stats.uploadsToday ?? 0} / ${stats.dailyCap ?? 50}`}
          subtitle="Daily quota utilization"
          change={{
            value: `${Math.round(((stats.uploadsToday ?? 0) / (stats.dailyCap || 50)) * 100)}% cap`,
            positive: (stats.uploadsToday ?? 0) < (stats.dailyCap ?? 50),
          }}
          badge="Daily Quota"
          color="emerald"
          icon={<UploadCloud className="w-5 h-5" />}
          sparklineData={chartData.map((d) => ({ v: d.count }))}
        />

        <MetricCard
          title="Avg Virality Score"
          value={`${stats.avgViralityScore ?? 0} / 10`}
          subtitle="AI estimated reach"
          change={{ value: '+0.6 pts', positive: true }}
          badge="Quality index"
          color="indigo"
          icon={<Zap className="w-5 h-5" />}
          sparklineData={[
            { v: 6.8 }, { v: 7.2 }, { v: 7.0 }, { v: 8.1 }, { v: 7.9 }, { v: 8.5 }, { v: Number(stats.avgViralityScore) || 8.7 }
          ]}
        />
      </div>

      {/* ── Featured Gradient Pipeline Hero Card ── */}
      <div className="relative overflow-hidden rounded-2xl p-6 lg:p-7 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-purple-950/50 border border-purple-500/25 shadow-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2.5">
              <span className="badge-stakent badge-purple">
                <span className={`w-2 h-2 rounded-full ${isPipelineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                {isPipelineRunning ? 'PIPELINE ACTIVE' : 'PIPELINE IDLE'}
              </span>
              <span className="text-xs text-purple-200/70 font-mono">
                {defaultSettings.activePipeline || 'Tamil Shorts Autonomous Engine'}
              </span>
            </div>

            <h2 className="text-xl lg:text-2xl font-bold font-display text-white">
              Autonomous Content Production Engine
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Downloads source videos from verified Telegram feeds, strips & translates audio tracks,
              generates vertical 9:16 Shorts with subtitle burns, and uploads on schedule.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>Pending Review: <strong className="text-white font-semibold">{stats.pendingApproval ?? 0}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Success Rate: <strong className="text-white font-semibold">{stats.successRate ?? 98}%</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>Growth Target: <strong className="text-white font-semibold">+{stats.growthDailyTarget ?? 250} subs/day</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-row lg:flex-col sm:items-end gap-3 shrink-0">
            <button
              onClick={handleTogglePipeline}
              disabled={pipelineBusy || (!isPipelineRunning && !account.isAdmin && !account.canRun)}
              className={`btn-glow flex items-center justify-center gap-2 text-sm !px-5 !py-3 w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed ${
                isPipelineRunning ? '!bg-rose-600 hover:!bg-rose-500' : ''
              }`}
              title={!isPipelineRunning && !account.isAdmin && !account.canRun ? '1-time test run already completed for this account' : undefined}
            >
              {pipelineBusy ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isPipelineRunning ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              {isPipelineRunning ? 'Stop Continuous Pipeline' : 'Start Continuous Pipeline'}
            </button>

            <div className="flex items-center gap-2">
              <Link
                to="/dashboard/content"
                className="btn-secondary !py-2 !px-3.5 !text-xs"
              >
                Review Content Queue ({stats.pendingApproval ?? 0})
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pipeline Workflow Steps ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 font-display">
            Pipeline Workflow Progression
          </h3>
          <span className="text-xs text-slate-500">
            4 Automated Stages
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Step 1 */}
          <div className="p-4 rounded-2xl bg-[#121424] border border-purple-500/15 hover:border-purple-500/35 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400">Step 01</span>
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            </div>
            <div className="text-sm font-semibold text-white">Channel Scraper</div>
            <div className="text-xs text-slate-400 mt-1">
              Pulling new videos from Telegram channel sources
            </div>
            <div className="mt-3 text-lg font-bold font-display text-purple-300">
              {stats.pendingApproval ? `${stats.pendingApproval} in queue` : 'Active'}
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-2xl bg-[#121424] border border-purple-500/15 hover:border-purple-500/35 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400">Step 02</span>
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <div className="text-sm font-semibold text-white">Audio Intelligence</div>
            <div className="text-xs text-slate-400 mt-1">
              Voice recognition & translation to Tamil
            </div>
            <div className="mt-3 text-lg font-bold font-display text-indigo-300">
              {videos.filter((v) => v.status === 'QUEUED').length || 'Standby'}
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-2xl bg-[#121424] border border-purple-500/15 hover:border-purple-500/35 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Step 03</span>
              {stats.pendingApproval ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-500" />
              )}
            </div>
            <div className="text-sm font-semibold text-white">Operator Approval</div>
            <div className="text-xs text-slate-400 mt-1">
              Quality inspection and metadata verification
            </div>
            <div className="mt-3 text-lg font-bold font-display text-amber-300">
              {stats.pendingApproval ?? 0} Pending
            </div>
          </div>

          {/* Step 4 */}
          <div className="p-4 rounded-2xl bg-[#121424] border border-purple-500/15 hover:border-purple-500/35 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">Step 04</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div className="text-sm font-semibold text-white">YouTube Dispatch</div>
            <div className="text-xs text-slate-400 mt-1">
              Automated upload during peak traffic windows
            </div>
            <div className="mt-3 text-lg font-bold font-display text-emerald-300">
              {stats.uploadsToday ?? 0} Uploaded
            </div>
          </div>
        </div>
      </div>

      {/* ── 2 Columns: 7-Day Performance Trend & Recent Uploads ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Recharts 7-Day Trend */}
        <div className="p-5 rounded-2xl bg-[#121424] border border-purple-500/15 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                7-Day Upload Cadence
              </h3>
              <p className="text-xs text-slate-400">
                Daily Shorts published to YouTube channel
              </p>
            </div>
            <span className="badge-stakent badge-purple text-[11px]">
              <TrendingUp className="w-3 h-3 mr-1" />
              Active Cycle
            </span>
          </div>

          <div className="h-48 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1A1D30',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderRadius: '12px',
                    color: '#FFF',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: '#C4B5FD' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Shorts Uploaded"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorUploads)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-slate-400">
            <span>Average: ~{Math.round(chartData.reduce((acc, c) => acc + c.count, 0) / chartData.length)} videos / day</span>
            <Link to="/dashboard/uploads" className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1">
              View Upload Center
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Right: Recent Uploads List */}
        <div className="p-5 rounded-2xl bg-[#121424] border border-purple-500/15 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white font-display">
                Recent Dispatches
              </h3>
              <p className="text-xs text-slate-400">
                Latest Shorts published with tracking status
              </p>
            </div>
            <Link to="/dashboard/uploads" className="text-xs text-purple-400 hover:text-purple-300">
              See All
            </Link>
          </div>

          <div className="space-y-2.5 my-2 flex-1">
            {recentUploads.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No uploads recorded yet today.
              </div>
            ) : (
              recentUploads.map((record, index) => (
                <div
                  key={record.videoId || index}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-purple-500/25 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="font-medium text-white truncate max-w-[200px]">
                        {record.videoId}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {record.uploadedAt ? new Date(record.uploadedAt).toLocaleTimeString() : 'Recent'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`badge-stakent ${
                        record.status === 'UPLOADED'
                          ? 'badge-green'
                          : 'badge-amber'
                      } !text-[10px] !py-0.5`}
                    >
                      {record.status}
                    </span>

                    {record.youtubeUrl && (
                      <a
                        href={record.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Storage policy: Auto-purge after 48h</span>
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Quota Available
            </span>
          </div>
        </div>
      </div>

      {/* ── Live Log Tail Console ── */}
      <div className="rounded-2xl bg-[#0F111D] border border-purple-500/15 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 bg-[#141727]">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-display">
              Live Console Output
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          </div>

          <Link
            to="/dashboard/command"
            className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
          >
            Open Interactive Console
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto">
          {recentLogs.length === 0 ? (
            <div className="text-slate-600 py-4 text-center text-xs">
              No recent logs. Start pipeline to stream events.
            </div>
          ) : (
            recentLogs.map((log, idx) => {
              const isError = log.level === 'ERROR';
              const isWarn = log.level === 'WARN';
              return (
                <div key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-slate-600 text-[10px] shrink-0 select-none">
                    {log.timestamp ? log.timestamp.slice(11, 19) : '--:--:--'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                      isError
                        ? 'bg-rose-500/20 text-rose-400'
                        : isWarn
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-purple-500/15 text-purple-300'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span
                    className={`text-[11px] truncate flex-1 ${
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
