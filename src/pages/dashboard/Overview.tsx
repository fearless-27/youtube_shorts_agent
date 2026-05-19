import { useEffect, useRef } from 'react';
import { Activity, ClipboardCheck, Film, TrendingUp, Upload } from 'lucide-react';
import { useDashboardData } from '../../data/store';

function MiniSpark({ data, color }: { data: number[]; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * w;
      const y = h - ((v - min) / range) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, color]);
  return <canvas ref={canvasRef} width={80} height={30} />;
}

export default function Overview() {
  const { pipelineStats, videos, pipelineLogs, error } = useDashboardData();
  const quotaPercent = Math.min((pipelineStats.uploadsToday / Math.max(pipelineStats.dailyCap, 1)) * 100, 100);
  const pendingVideos = videos.filter(v => v.status === 'PENDING_REVIEW');
  const recentActivity = pipelineLogs.slice(-10).reverse().map((log) => ({
    time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    event: log.message,
    status: log.level === 'ERROR' ? 'ERROR' as const : log.level === 'WARN' ? 'WARNING' as const : 'SUCCESS' as const,
  }));

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 font-mono text-xs" style={{ background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.35)', color: '#FF3366' }}>
          Backend connection issue: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Upload} label="UPLOADS TODAY" value={String(pipelineStats.uploadsToday)} sub={`of ${pipelineStats.dailyCap} daily cap`} sparkline={[0, 1, 2, 3, pipelineStats.uploadsToday]} color="#00F0FF" />
        <MetricCard icon={Film} label="CREATED SHORTS" value={String(pipelineStats.createdShorts)} sub="library items" sparkline={[0, 1, 2, 3, pipelineStats.createdShorts]} color="#00FF66" />
        <MetricCard icon={ClipboardCheck} label="PENDING APPROVAL" value={String(pipelineStats.pendingApproval)} sub="items need review" sparkline={[0, 1, pipelineStats.pendingApproval]} color="#FFB800" />
        <MetricCard icon={TrendingUp} label="AVG VIRALITY SCORE" value={String(pipelineStats.avgViralityScore)} sub={`${pipelineStats.successRate}% upload success`} sparkline={[40, 55, 65, pipelineStats.avgViralityScore]} color="#00FF66" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GrowthCard label="SUBSCRIBER TARGET" value={pipelineStats.growthTarget.toLocaleString()} sub="15-day sprint goal" />
        <GrowthCard label="CURRENT SUBSCRIBERS" value={pipelineStats.growthCurrent.toLocaleString()} sub="set in config" />
        <GrowthCard label="DAILY PACE NEEDED" value={pipelineStats.growthDailyTarget.toLocaleString()} sub="subs per day" />
        <GrowthCard label="BEST TOPIC SIGNAL" value={pipelineStats.bestTopic} sub="highest virality item" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="p-6" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
          <div className="flex items-center gap-2 mb-6">
            <Activity size={14} style={{ color: '#00F0FF' }} />
            <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Pipeline Status</span>
          </div>
          <div className="relative flex items-center justify-between">
            <div className="absolute top-5 left-[12%] right-[12%] h-px" style={{ borderTop: '1px dashed #121212' }} />
            {['INGEST', 'RENDER', 'REVIEW', 'DEPLOY'].map((label) => (
              <div key={label} className="relative z-10 text-center">
                <div className="w-10 h-10 mx-auto mb-2 flex items-center justify-center font-mono text-xs font-bold" style={{ background: label === 'REVIEW' && pendingVideos.length ? '#FFB800' : '#00F0FF', color: '#050505' }}>
                  {label[0]}
                </div>
                <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Daily Quota Progress</span>
            <span className="font-mono text-xs" style={{ color: '#00F0FF' }}>{quotaPercent.toFixed(0)}%</span>
          </div>
          <div className="w-full h-4 mb-3" style={{ background: '#121212' }}>
            <div className="h-full transition-all duration-700" style={{ width: `${quotaPercent}%`, background: 'linear-gradient(90deg, #00F0FF, #00FF66)' }} />
          </div>
          <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {pipelineStats.uploadsToday} of {pipelineStats.dailyCap} uploads consumed
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="p-6" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Recent Activity</span>
            <span className="font-mono text-xs" style={{ color: pipelineStats.pipelineStatus === 'RUNNING' ? '#00FF66' : '#FFB800' }}>{pipelineStats.pipelineStatus}</span>
          </div>
          <div className="space-y-0 max-h-80 overflow-y-auto">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid #121212' }}>
                <span className="font-mono text-xs shrink-0 w-20" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.time}</span>
                <span className="text-xs flex-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{item.event}</span>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="p-6" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Pending Approval ({pendingVideos.length})</span>
          </div>
          <div className="space-y-3">
            {pendingVideos.slice(0, 5).map((video) => (
              <div key={video.id} className="flex items-center justify-between p-3" style={{ background: '#050505', border: '1px solid #121212' }}>
                <div>
                  <div className="text-xs font-medium mb-1">{video.title}</div>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{video.id}</span>
                </div>
                <div className="font-mono text-sm font-semibold" style={{ color: video.viralityScore >= 80 ? '#00FF66' : video.viralityScore >= 50 ? '#FFB800' : '#FF3366' }}>{video.viralityScore}</div>
              </div>
            ))}
            {!pendingVideos.length && <p className="font-mono text-xs text-center py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>All clear - nothing pending</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, sparkline, color }: {
  icon: typeof Upload; label: string; value: string; sub: string; sparkline: number[]; color: string;
}) {
  return (
    <div className="p-5" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color }} />
        <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold mb-1" style={{ color }}>{value}</div>
          <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</div>
        </div>
        <MiniSpark data={sparkline} color={color} />
      </div>
    </div>
  );
}

function GrowthCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
      <div className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      <div className="text-lg font-semibold truncate" title={value} style={{ color: '#00F0FF' }}>{value}</div>
      <div className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'SUCCESS' | 'WARNING' | 'ERROR' }) {
  const colors = {
    SUCCESS: { bg: 'rgba(0,255,102,0.15)', text: '#00FF66' },
    WARNING: { bg: 'rgba(255,184,0,0.15)', text: '#FFB800' },
    ERROR: { bg: 'rgba(255,51,102,0.15)', text: '#FF3366' },
  };
  const c = colors[status];
  return <span className="font-mono text-xs px-2 py-0.5 shrink-0" style={{ background: c.bg, color: c.text }}>{status}</span>;
}
