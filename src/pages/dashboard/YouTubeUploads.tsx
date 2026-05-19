import { ExternalLink, Trash2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useDashboardData } from '../../data/store';

export default function YouTubeUploads() {
  const { uploadRecords } = useDashboardData();
  const totalUploads = uploadRecords.length;
  const successCount = uploadRecords.filter(u => u.status === 'UPLOADED').length;
  const successRate = totalUploads > 0 ? ((successCount / totalUploads) * 100).toFixed(1) : '0';
  const cleanedCount = uploadRecords.filter(u => u.cleanupStatus === 'FILES_DELETED').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'UPLOADED':
        return { bg: 'rgba(0,255,102,0.15)', text: '#00FF66', icon: CheckCircle, label: 'UPLOADED' };
      case 'PROCESSING':
        return { bg: 'rgba(255,184,0,0.15)', text: '#FFB800', icon: AlertTriangle, label: 'PROCESSING' };
      case 'FAILED':
        return { bg: 'rgba(255,51,102,0.15)', text: '#FF3366', icon: XCircle, label: 'FAILED' };
      default:
        return { bg: '#121212', text: 'rgba(255,255,255,0.4)', icon: CheckCircle, label: status };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold uppercase tracking-[-0.01em] mb-1">YouTube Uploads</h2>
        <p className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Upload history and cleanup status
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="TOTAL UPLOADS" value={String(totalUploads)} color="#00F0FF" />
        <StatCard label="SUCCESS RATE" value={`${successRate}%`} color="#00FF66" />
        <StatCard label="FILES CLEANED" value={`${cleanedCount}`} color="#00F0FF" />
        <StatCard label="AVG PROCESS" value="~45s" color="rgba(255,255,255,0.6)" />
      </div>

      {/* Uploads Table */}
      <div style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
        {/* Table Header */}
        <div className="grid items-center px-4 py-3 font-mono text-xs uppercase tracking-wider"
          style={{ background: '#121212', color: 'rgba(255,255,255,0.4)', gridTemplateColumns: '80px 1fr 160px 100px 140px' }}>
          <span>Video ID</span>
          <span>YouTube URL</span>
          <span>Uploaded At</span>
          <span>Status</span>
          <span>Cleanup</span>
        </div>

        {uploadRecords.map(record => {
          const statusBadge = getStatusBadge(record.status);
          const StatusIcon = statusBadge.icon;
          return (
            <div key={record.videoId}
              className="grid items-center px-4 py-3 transition-colors hover:bg-white/[0.02]"
              style={{ gridTemplateColumns: '80px 1fr 160px 100px 140px', borderBottom: '1px solid #121212' }}>
              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{record.videoId}</span>
              <a href="#" className="flex items-center gap-1.5 font-mono text-xs transition-colors hover:underline"
                style={{ color: '#00F0FF' }}>
                <ExternalLink size={10} />
                {record.youtubeUrl}
              </a>
              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {new Date(record.uploadedAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs px-2 py-0.5 self-start justify-self-start"
                style={{ background: statusBadge.bg, color: statusBadge.text }}>
                <StatusIcon size={10} />
                {statusBadge.label}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs"
                style={{ color: record.cleanupStatus === 'FILES_DELETED' ? 'rgba(255,255,255,0.3)' : '#FFB800' }}>
                {record.cleanupStatus === 'FILES_DELETED' ? (
                  <>
                    <Trash2 size={10} />
                    FILES_DELETED
                  </>
                ) : (
                  <>
                    <AlertTriangle size={10} />
                    LOCAL_FILES_EXIST
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-4" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
      <div className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {label}
      </div>
      <div className="text-xl font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}
