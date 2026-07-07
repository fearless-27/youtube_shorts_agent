import { useState } from 'react';
import { Play, ExternalLink, Filter } from 'lucide-react';
import { useDashboardData } from '../../data/store';

type FilterType = 'All' | 'Shorts' | 'Videos';

export default function CreatedVideos() {
  const [filter, setFilter] = useState<FilterType>('All');
  const { videos } = useDashboardData();

  const filtered = videos.filter(v => {
    if (filter === 'Shorts') return v.type === 'SHORT';
    if (filter === 'Videos') return v.type === 'VIDEO';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold uppercase tracking-[-0.01em] mb-1">Created Videos</h2>
          <p className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {filtered.length} videos in library
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
          {(['All', 'Shorts', 'Videos'] as FilterType[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-all"
              style={{
                background: filter === f ? '#00F0FF' : 'transparent',
                color: filter === f ? '#050505' : 'rgba(255,255,255,0.5)',
                border: filter === f ? 'none' : '1px solid #121212',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Video Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
          <p className="font-mono text-xs uppercase mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
            No videos match this filter
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(video => (
            <div key={video.id} className="group" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
              <div className="relative aspect-video flex items-center justify-center overflow-hidden"
                style={{ background: '#121212' }}>
                {video.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <div className="w-10 h-10 flex items-center justify-center" style={{ background: '#00F0FF' }}>
                    <Play size={18} style={{ color: '#050505' }} />
                  </div>
                </div>
                {!video.thumbnail && (
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>
                    {video.id}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-xs font-medium mb-3 truncate" title={video.title}>{video.title}</h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs px-2 py-0.5" 
                    style={{ background: '#121212', color: 'rgba(255,255,255,0.5)' }}>
                    {video.type}
                  </span>
                  <span className="font-mono text-xs" 
                    style={{ color: video.viralityScore >= 80 ? '#00FF66' : video.viralityScore >= 50 ? '#FFB800' : '#FF3366' }}>
                    {video.viralityScore}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {video.fileStatus === 'LOCAL' ? 'LOCAL FILE' : 'DELETED'}
                  </span>
                  {video.youtubeUrl && (
                    <a href="#" className="flex items-center gap-1 font-mono text-xs transition-colors hover:underline"
                      style={{ color: '#00F0FF' }}>
                      {video.youtubeUrl}
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
