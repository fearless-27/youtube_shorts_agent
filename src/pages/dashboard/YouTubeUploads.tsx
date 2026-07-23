import { useState } from 'react';
import { motion } from 'framer-motion';
import { useDashboard } from '../../context/DashboardContext';
import {
  IconYouTube, IconCheckCircle,
  IconClock, IconExternalLink, IconFilter,
} from '../../components/icons/StreamlineIcons';

export default function YouTubeUploads() {
  const { uploadRecords, pipelineStats, loading } = useDashboard();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPLOADED' | 'LOCAL_FILES_EXIST'>('ALL');

  const filtered = statusFilter === 'ALL'
    ? uploadRecords
    : uploadRecords.filter((r) => r.status === statusFilter || r.cleanupStatus === statusFilter);

  return (
    <div className="space-y-5">
      {/* Overview header stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="hud-panel p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40 mb-1">Uploads Today</div>
          <div className="font-mono text-2xl font-bold text-[#00FF66]">
            {pipelineStats.uploadsToday ?? 0} <span className="text-xs text-white/30">/ {pipelineStats.dailyCap ?? 50}</span>
          </div>
        </div>
        <div className="hud-panel p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40 mb-1">Total Shorts Created</div>
          <div className="font-mono text-2xl font-bold text-[#00F0FF]">
            {pipelineStats.createdShorts ?? 0}
          </div>
        </div>
        <div className="hud-panel p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40 mb-1">Success Rate</div>
          <div className="font-mono text-2xl font-bold text-[#A855F7]">
            {pipelineStats.successRate ?? 0}%
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="hud-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconYouTube size={18} color="#FF0000" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] font-bold text-white">
            YouTube Delivery Logs
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5">
          <IconFilter size={12} color="rgba(255,255,255,0.3)" className="mr-1" />
          {(['ALL', 'UPLOADED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1 transition-all cursor-pointer"
              style={{
                background: statusFilter === s ? 'rgba(0,240,255,0.15)' : 'transparent',
                color: statusFilter === s ? '#00F0FF' : 'rgba(255,255,255,0.4)',
                border: statusFilter === s ? '1px solid rgba(0,240,255,0.3)' : '1px solid transparent',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Record list */}
      {loading && uploadRecords.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="hud-panel p-4 h-16 animate-pulse bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="hud-panel p-10 text-center font-mono text-xs text-white/40 uppercase tracking-widest">
          No YouTube upload records found
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((record) => {
            const isSuccess = record.status === 'UPLOADED';
            const color = isSuccess ? '#00FF66' : '#FFB800';

            return (
              <motion.div
                key={record.videoId}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="hud-panel p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {isSuccess ? (
                    <IconCheckCircle size={16} color="#00FF66" className="shrink-0" />
                  ) : (
                    <IconClock size={16} color="#FFB800" className="shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <h4 className="font-mono text-xs font-bold text-white truncate">Short ID: {record.videoId}</h4>
                    <div className="font-mono text-[9px] text-white/40 mt-0.5 flex flex-wrap items-center gap-3">
                      <span>Uploaded: {record.uploadedAt ? record.uploadedAt.slice(0, 10) : 'Recent'}</span>
                      <span>Cleanup: <span className="text-[#00F0FF]">{record.cleanupStatus}</span></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="font-mono text-[9px] font-bold uppercase tracking-wider px-2.5 py-1"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                  >
                    {record.status}
                  </span>

                  {record.youtubeUrl && (
                    <a
                      href={record.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary py-1 px-2.5 text-[9px] flex items-center gap-1 hover:text-[#00F0FF]"
                    >
                      <IconExternalLink size={10} /> View on YT
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
