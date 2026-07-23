import { motion } from 'framer-motion';
import { useDashboard } from '../../context/DashboardContext';
import AnimatedCounter from '../../components/animations/AnimatedCounter';
import {
  IconActivity, IconFilm, IconUpload, IconQueue,
  IconTrendingUp, IconBarChart, IconZap, IconRefresh,
  IconCheckCircle, IconAlertTriangle, IconXCircle, IconInfo,
} from '../../components/icons/StreamlineIcons';

/* ── Skeleton loader ─────────────────────────── */
function Skeleton({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return (
    <div className={`${w} ${h} relative overflow-hidden`}
      style={{ background: 'rgba(0,240,255,0.04)' }}>
      <div className="absolute inset-0 shimmer" />
    </div>
  );
}

/* ── Stat card ───────────────────────────────── */
function StatCard({
  label, value, suffix = '', color = '#00F0FF',
  icon: Icon, sub, loading,
}: {
  label: string; value: number; suffix?: string;
  color?: string; icon?: React.ComponentType<{ size?: number; color?: string; className?: string }>;
  sub?: string; loading?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="hud-panel p-5 relative overflow-hidden"
    >
      {/* Top glow line */}
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />

      {loading ? (
        <div className="space-y-3">
          <Skeleton w="w-1/2" h="h-2" />
          <Skeleton w="w-2/3" h="h-7" />
          <Skeleton w="w-1/3" h="h-2" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
            {Icon && <Icon size={14} color={`${color}90`} />}
          </div>
          <div className="font-mono text-3xl font-bold mb-1.5" style={{ color, textShadow: `0 0 20px ${color}50` }}>
            <AnimatedCounter end={value} suffix={suffix} duration={2} />
          </div>
          {sub && (
            <div className="font-mono text-[9px] uppercase tracking-wider"
              style={{ color: 'rgba(255,255,255,0.25)' }}>{sub}</div>
          )}
        </>
      )}
    </motion.div>
  );
}

/* ── Mini chart bar ──────────────────────────── */
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(4, (value / (max || 1)) * 100);
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-full flex flex-col justify-end" style={{ height: 48 }}>
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            background: `linear-gradient(to top, ${color}cc, ${color}44)`,
            boxShadow: `0 0 6px ${color}66`,
            minHeight: 2,
          }}
        />
      </div>
    </div>
  );
}

/* ── Pipeline stage box ──────────────────────── */
function StageBox({
  step, label, status, count,
}: {
  step: string; label: string; status: 'active' | 'pending' | 'warning' | 'uploading';
  count?: number;
}) {
  const colors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    active:    { bg: 'rgba(0,255,102,0.06)',  border: 'rgba(0,255,102,0.25)',  text: '#00FF66', glow: '#00FF66' },
    uploading: { bg: 'rgba(0,240,255,0.06)',  border: 'rgba(0,240,255,0.25)',  text: '#00F0FF', glow: '#00F0FF' },
    warning:   { bg: 'rgba(255,184,0,0.06)',  border: 'rgba(255,184,0,0.25)',  text: '#FFB800', glow: '#FFB800' },
    pending:   { bg: 'rgba(255,255,255,0.02)',border: 'rgba(255,255,255,0.08)',text: 'rgba(255,255,255,0.3)', glow: 'transparent' },
  };
  const c = colors[status];
  return (
    <div className="flex-1 p-4 relative" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="font-mono text-[8px] tracking-[0.2em] uppercase mb-2"
        style={{ color: 'rgba(255,255,255,0.3)' }}>STEP {step}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider mb-3" style={{ color: c.text }}>{label}</div>
      {count !== undefined && (
        <div className="font-mono text-xl font-bold" style={{ color: c.text, textShadow: `0 0 12px ${c.glow}60` }}>
          {count}
        </div>
      )}
      {(status === 'active' || status === 'uploading') && (
        <motion.div
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
          style={{ background: c.text }}
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
    </div>
  );
}

/* ── Recent log row ──────────────────────────── */
function LogRow({ level, message, time }: { level: string; message: string; time: string }) {
  const colors: Record<string, string> = { ERROR: '#FF3366', WARN: '#FFB800', INFO: 'rgba(255,255,255,0.5)' };
  const icons: Record<string, React.FC<{ size?: number; color?: string; className?: string }>> = {
    ERROR: IconXCircle, WARN: IconAlertTriangle, INFO: IconInfo,
  };
  const Icon = icons[level] ?? IconInfo;
  return (
    <div className="flex items-start gap-3 py-2.5 px-4 hover:bg-white/[0.02] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
      <Icon size={11} color={colors[level]} className="shrink-0 mt-0.5" />
      <span className="font-mono text-[10px] uppercase tracking-wider shrink-0 w-10"
        style={{ color: colors[level] }}>{level}</span>
      <span className="font-mono text-[10px] flex-1 leading-relaxed"
        style={{ color: 'rgba(255,255,255,0.55)' }}>
        {message.slice(0, 80)}{message.length > 80 ? '…' : ''}
      </span>
      <span className="font-mono text-[9px] shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>
        {time.slice(11, 19)}
      </span>
    </div>
  );
}

/* ═══ OVERVIEW PAGE ═══════════════════════════ */
export default function Overview() {
  const { pipelineStats, pipelineLogs, uploadRecords, videos, loading, error, refresh } = useDashboard();

  const stats = pipelineStats;
  const recentLogs  = [...pipelineLogs].reverse().slice(0, 8);
  const recentUploads = uploadRecords.slice(-7).reverse();

  /* build chart data from upload records grouped by day */
  const chartData = (() => {
    const counts: Record<string, number> = {};
    uploadRecords.forEach((r) => {
      const day = r.uploadedAt?.slice(0, 10) ?? '';
      if (day) counts[day] = (counts[day] ?? 0) + 1;
    });
    const days = Object.keys(counts).sort().slice(-7);
    return days.map((d) => ({ day: d.slice(5), count: counts[d] }));
  })();
  const chartMax = Math.max(...chartData.map((d) => d.count), 1);

  const statCards = [
    { label: 'Videos Created',  value: stats.createdShorts ?? 0,   suffix: '',   color: '#00F0FF', icon: IconFilm,       sub: 'Total pipeline output' },
    { label: 'Uploads Today',   value: stats.uploadsToday ?? 0,    suffix: '',   color: '#00FF66', icon: IconUpload,     sub: `of ${stats.dailyCap ?? 50} daily cap` },
    { label: 'Pending Review',  value: stats.pendingApproval ?? 0, suffix: '',   color: '#FFB800', icon: IconQueue,      sub: 'Awaiting operator approval' },
    { label: 'Success Rate',    value: stats.successRate ?? 0,     suffix: '%',  color: '#A855F7', icon: IconTrendingUp, sub: 'Upload success ratio' },
    { label: 'Avg Virality',    value: stats.avgViralityScore ?? 0,suffix: '/10',color: '#00F0FF', icon: IconZap,        sub: 'Content score avg' },
    { label: 'Daily Target',    value: stats.growthDailyTarget ?? 0,suffix: '',  color: '#00FF66', icon: IconBarChart,   sub: 'Daily subscriber goal' },
  ];

  return (
    <div className="space-y-5">

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center justify-between p-4"
          style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.2)' }}>
          <div className="flex items-center gap-2.5">
            <IconAlertTriangle size={13} color="#FF3366" />
            <span className="font-mono text-xs" style={{ color: '#FF3366' }}>{error}</span>
          </div>
          <button onClick={refresh}
            className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider cursor-pointer"
            style={{ color: '#00F0FF' }}>
            <IconRefresh size={11} /> Retry
          </button>
        </div>
      )}

      {/* ── Section label ── */}
      <div className="flex items-center gap-3">
        <div className="hud-divider flex-1" />
        <span className="font-mono text-[9px] uppercase tracking-[0.25em]"
          style={{ color: 'rgba(0,240,255,0.5)' }}>
          SYSTEM METRICS
        </span>
        <div className="hud-divider flex-1" />
      </div>

      {/* ── Stat cards grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {statCards.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}>
            <StatCard {...s} loading={loading} />
          </motion.div>
        ))}
      </div>

      {/* ── Pipeline stages ── */}
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.25em] mb-3"
          style={{ color: 'rgba(255,255,255,0.3)' }}>Pipeline Stages</div>
        <div className="flex gap-2">
          <StageBox step="01" label="Scanning"  status="active"    count={stats.pendingApproval ?? 0} />
          <StageBox step="02" label="Assembly"  status="active"    count={videos.filter((v) => v.status === 'PENDING_REVIEW').length} />
          <StageBox step="03" label="Review"    status="warning"   count={stats.pendingApproval ?? 0} />
          <StageBox step="04" label="Uploading" status="uploading" count={stats.uploadsToday ?? 0} />
        </div>
      </div>

      {/* ── Two-col: Chart + Logs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Upload chart */}
        <div className="hud-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Upload History (7d)</span>
            <IconBarChart size={13} color="rgba(0,240,255,0.5)" />
          </div>
          {loading ? (
            <div className="flex items-end gap-1 h-12">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 animate-pulse"
                  style={{ background: 'rgba(0,240,255,0.06)', height: `${30 + Math.random() * 70}%` }} />
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-12 flex items-center justify-center font-mono text-[10px]"
              style={{ color: 'rgba(255,255,255,0.2)' }}>No upload data yet</div>
          ) : (
            <div className="flex items-end gap-1" style={{ height: 48 }}>
              {chartData.map((d) => (
                <MiniBar key={d.day} value={d.count} max={chartMax} color="#00F0FF" />
              ))}
            </div>
          )}
          <div className="flex justify-between mt-2">
            {chartData.map((d) => (
              <span key={d.day} className="font-mono text-[7px]"
                style={{ color: 'rgba(255,255,255,0.2)' }}>{d.day}</span>
            ))}
          </div>
        </div>

        {/* Recent upload status */}
        <div className="hud-panel overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: '1px solid rgba(0,240,255,0.07)' }}>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Recent Uploads</span>
            <IconUpload size={13} color="rgba(0,240,255,0.5)" />
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-6" />)}
            </div>
          ) : recentUploads.length === 0 ? (
            <div className="py-8 text-center font-mono text-[10px]"
              style={{ color: 'rgba(255,255,255,0.2)' }}>No uploads yet</div>
          ) : (
            <div>
              {recentUploads.map((r, i) => {
                const color = r.status === 'UPLOADED' ? '#00FF66' : '#FFB800';
                return (
                  <div key={r.videoId || i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.02] transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                    <IconCheckCircle size={11} color="#00FF66" />
                    <span className="font-mono text-[9px] flex-1 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {r.videoId.slice(0, 16)}…
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider shrink-0"
                      style={{ color }}>{r.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Live log tail ── */}
      <div className="hud-panel overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid rgba(0,240,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <IconActivity size={13} color="#00F0FF" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]"
              style={{ color: 'rgba(255,255,255,0.4)' }}>Live Log Tail</span>
            <motion.div className="w-1.5 h-1.5 rounded-full"
              style={{ background: '#00FF66' }}
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }} />
          </div>
          <span className="font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {recentLogs.length} lines
          </span>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-5" />)}
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="py-8 text-center font-mono text-[10px]"
            style={{ color: 'rgba(255,255,255,0.2)' }}>No log entries</div>
        ) : (
          <div>
            {recentLogs.map((l, i) => (
              <LogRow key={i} level={l.level} message={l.message} time={l.timestamp} />
            ))}
          </div>
        )}
        {/* Terminal cursor */}
        <div className="flex items-center gap-2 px-4 py-2">
          <span style={{ color: '#00F0FF' }} className="font-mono text-[10px]">$</span>
          <span className="inline-block w-2 h-3 animate-hud-blink" style={{ background: '#00F0FF' }} />
        </div>
      </div>

    </div>
  );
}
