import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDashboard, type Video } from '../../context/DashboardContext';
import {
  IconFilm, IconPlay, IconExternalLink, IconFilter,
  IconSparkles, IconClock,
} from '../../components/icons/StreamlineIcons';

export default function CreatedVideos() {
  const { videos, loading } = useDashboard();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'UPLOADED' | 'REJECTED'>('ALL');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const createdVideos = videos.filter((v) => v.source === 'approval' || v.source === 'media');

  const filtered = filter === 'ALL'
    ? createdVideos
    : createdVideos.filter((v) => {
        if (filter === 'PENDING') return v.status === 'PENDING_REVIEW';
        if (filter === 'APPROVED') return v.status === 'APPROVED' || v.status === 'QUEUED';
        if (filter === 'UPLOADED') return v.status === 'UPLOADED';
        if (filter === 'REJECTED') return v.status === 'REJECTED';
        return true;
      });

  return (
    <div className="space-y-5">
      {/* Top control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 hud-panel p-4">
        <div className="flex items-center gap-2">
          <IconFilm size={16} color="#00F0FF" />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] font-bold" style={{ color: '#00F0FF' }}>
            Created Shorts Registry
          </span>
          <span className="font-mono text-[9px] px-2 py-0.5" style={{ background: 'rgba(0,240,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
            {filtered.length} clips
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <IconFilter size={12} color="rgba(255,255,255,0.3)" className="mr-1" />
          {(['ALL', 'PENDING', 'APPROVED', 'UPLOADED', 'REJECTED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1 transition-all cursor-pointer"
              style={{
                background: filter === f ? 'rgba(0,240,255,0.15)' : 'transparent',
                color: filter === f ? '#00F0FF' : 'rgba(255,255,255,0.4)',
                border: filter === f ? '1px solid rgba(0,240,255,0.3)' : '1px solid transparent',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of video cards */}
      {loading && createdVideos.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="hud-panel p-4 h-48 animate-pulse flex flex-col justify-between">
              <div className="h-4 bg-white/5 w-2/3" />
              <div className="h-20 bg-white/5" />
              <div className="h-4 bg-white/5 w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="hud-panel p-12 text-center">
          <IconFilm size={32} color="rgba(0,240,255,0.2)" className="mx-auto mb-3" />
          <div className="font-mono text-xs uppercase tracking-widest text-white/40">No matching videos found</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((video) => {
            const isApproved = video.status === 'APPROVED' || video.status === 'QUEUED';
            const isUploaded = video.status === 'UPLOADED';
            const isRejected = video.status === 'REJECTED';
            const badgeColor = isUploaded ? '#00FF66' : isApproved ? '#00F0FF' : isRejected ? '#FF3366' : '#FFB800';

            return (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="hud-panel p-4 flex flex-col justify-between group hover:border-[rgba(0,240,255,0.3)] transition-all"
              >
                <div>
                  {/* Status header */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="font-mono text-[8px] uppercase tracking-[0.2em] px-2 py-0.5 font-bold"
                      style={{ background: `${badgeColor}15`, color: badgeColor, border: `1px solid ${badgeColor}30` }}
                    >
                      {video.status}
                    </span>
                    {video.viralityScore > 0 && (
                      <div className="flex items-center gap-1 font-mono text-[9px]" style={{ color: '#00F0FF' }}>
                        <IconSparkles size={10} />
                        <span>{video.viralityScore}/10</span>
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-mono text-xs font-bold text-white/90 line-clamp-2 mb-2 group-hover:text-[#00F0FF] transition-colors">
                    {video.title}
                  </h3>

                  {/* Metadata */}
                  <div className="space-y-1 font-mono text-[9px] text-white/40 mb-4">
                    <div className="flex items-center gap-1.5">
                      <IconClock size={10} />
                      <span>{video.createdAt ? video.createdAt.slice(0, 10) : 'Recent'}</span>
                    </div>
                    <div>Type: <span className="text-white/60">{video.type}</span></div>
                  </div>
                </div>

                {/* Card actions */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                  <button
                    onClick={() => setSelectedVideo(video)}
                    className="font-mono text-[9px] uppercase tracking-wider text-[#00F0FF] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <IconPlay size={10} /> Inspector
                  </button>

                  {video.youtubeUrl && (
                    <a
                      href={video.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[9px] uppercase tracking-wider text-white/40 flex items-center gap-1 hover:text-white transition-colors"
                    >
                      <IconExternalLink size={10} /> YouTube
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Video Modal Preview */}
      <AnimatePresence>
        {selectedVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hud-panel p-6 max-w-lg w-full relative"
            >
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                <span className="font-mono text-xs uppercase tracking-widest text-[#00F0FF] font-bold">
                  Video Inspector
                </span>
                <button
                  onClick={() => setSelectedVideo(null)}
                  className="text-white/40 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 font-mono text-xs text-white/80">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Title</div>
                  <div className="font-bold text-white">{selectedVideo.title}</div>
                </div>

                {selectedVideo.previewUrl && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-white/40">Clip Playback</div>
                    <div className="bg-black rounded border border-white/10 overflow-hidden flex items-center justify-center">
                      <video
                        src={selectedVideo.previewUrl}
                        controls
                        autoPlay
                        playsInline
                        className="w-full max-h-64 object-contain"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-white/5 p-2.5">
                    <div className="text-[8px] uppercase text-white/40">Status</div>
                    <div className="font-bold text-[#00FF66]">{selectedVideo.status}</div>
                  </div>
                  <div className="bg-white/5 p-2.5">
                    <div className="text-[8px] uppercase text-white/40">Virality Score</div>
                    <div className="font-bold text-[#00F0FF]">{selectedVideo.viralityScore || 'N/A'}/10</div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedVideo(null)}
                className="btn-primary w-full mt-6 py-2.5 text-center"
              >
                Close Inspector
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
