import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Check,
  X,
  Play,
  ExternalLink,
  Sparkles,
  Clock,
  CheckCheck,
  Eye,
  Search,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useDashboard, type Video } from '../../context/DashboardContext';
import { updateApproval, pipelineAction, clearContentData, deleteContentVideo } from '../../data/store';

export default function ContentStudio() {
  const { videos, loading, refresh, account } = useDashboard();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'UPLOADED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewingVideo, setPreviewingVideo] = useState<Video | null>(null);
  const [inspectingVideo, setInspectingVideo] = useState<Video | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [triggeringCycle, setTriggeringCycle] = useState(false);

  // Clear Data Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearScope, setClearScope] = useState<'all' | 'pending' | 'rejected' | 'uploaded'>('all');
  const [deleteFilesOnDisk, setDeleteFilesOnDisk] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  // Memoized filter video clips
  const filteredVideos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return videos.filter((video) => {
      if (q) {
        const match = video.title.toLowerCase().includes(q) ||
                      video.id.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (filter === 'PENDING') return video.status === 'PENDING_REVIEW';
      if (filter === 'APPROVED') return video.status === 'APPROVED' || video.status === 'QUEUED';
      if (filter === 'UPLOADED') return video.status === 'UPLOADED';
      if (filter === 'REJECTED') return video.status === 'REJECTED';
      return true;
    });
  }, [videos, searchQuery, filter]);

  const pendingVideos = useMemo(() => videos.filter((v) => v.status === 'PENDING_REVIEW'), [videos]);
  const rejectedVideos = useMemo(() => videos.filter((v) => v.status === 'REJECTED'), [videos]);
  const uploadedVideos = useMemo(() => videos.filter((v) => v.status === 'UPLOADED'), [videos]);

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAllPending = () => {
    if (selectedIds.size === pendingVideos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingVideos.map((v) => v.id)));
    }
  };

  const handleApprove = async (video: Video) => {
    try {
      setProcessingId(video.id);
      const approvalId = video.approvalId ?? video.id;
      await updateApproval(approvalId, true);
      showToast(`Approved "${video.title.slice(0, 30)}..." for YouTube upload`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
      refresh();
    } catch (err) {
      console.error(err);
      showToast('Failed to approve video.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (video: Video) => {
    try {
      setProcessingId(video.id);
      const approvalId = video.approvalId ?? video.id;
      await updateApproval(approvalId, false);
      showToast(`Rejected "${video.title.slice(0, 30)}..."`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
      refresh();
    } catch (err) {
      console.error(err);
      showToast('Failed to reject video.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const vid = videos.find((v) => v.id === id);
      if (vid) {
        const approvalId = vid.approvalId ?? vid.id;
        try {
          await updateApproval(approvalId, true);
        } catch (e) {
          console.error(e);
        }
      }
    }
    setSelectedIds(new Set());
    showToast(`Batch approved ${ids.length} videos!`);
    refresh();
  };

  const handleBatchDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      setClearingData(true);
      const res = await clearContentData({
        scope: 'selected',
        ids,
        deleteFiles: deleteFilesOnDisk,
      });
      showToast(`Deleted ${res.removedCount ?? ids.length} selected video records`);
      setSelectedIds(new Set());
      refresh();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to delete selected items');
    } finally {
      setClearingData(false);
    }
  };

  const handleConfirmClear = async () => {
    try {
      setClearingData(true);
      const res = await clearContentData({
        scope: clearScope,
        deleteFiles: deleteFilesOnDisk,
      });
      showToast(`Successfully cleared ${res.removedCount ?? ''} video records from Content Studio`);
      setShowClearModal(false);
      setSelectedIds(new Set());
      refresh();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to clear content data');
    } finally {
      setClearingData(false);
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, video: Video) => {
    e.stopPropagation();
    try {
      setDeletingId(video.id);
      await deleteContentVideo(video.approvalId ?? video.id, false);
      showToast(`Removed "${video.title.slice(0, 30)}..." from Studio`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(video.id);
        return next;
      });
      refresh();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to remove video record');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTriggerCycle = async () => {
    if (!account.isAdmin && !account.canRun) {
      showToast('Trial limit reached: Normal accounts can only run YouTube automation once to test functionality.');
      return;
    }
    setTriggeringCycle(true);
    try {
      await pipelineAction('start');
      showToast('Triggered pipeline cycle. Scanning Telegram channels for new content...');
      setTimeout(() => refresh(), 2000);
    } catch (err: any) {
      showToast(err?.message || 'Could not reach pipeline service');
      refresh();
    } finally {
      setTriggeringCycle(false);
    }
  };

  const getStatusBadge = (status: Video['status']) => {
    switch (status) {
      case 'UPLOADED':
        return <span className="badge-stakent badge-green">Uploaded</span>;
      case 'APPROVED':
      case 'QUEUED':
        return <span className="badge-stakent badge-purple">Approved</span>;
      case 'PENDING_REVIEW':
        return <span className="badge-stakent badge-amber">Pending Review</span>;
      case 'REJECTED':
        return <span className="badge-stakent badge-red">Rejected</span>;
      default:
        return <span className="badge-stakent badge-purple">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white">
            Content Studio
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Review AI generated vertical Shorts, verify audio translation, and approve for dispatch.
          </p>
        </div>

        {/* Actions on Top Right */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleBatchApprove}
                disabled={clearingData}
                className="btn-primary !bg-emerald-600 hover:!bg-emerald-500 !py-2 !px-4 text-xs font-semibold"
              >
                <CheckCheck className="w-4 h-4 mr-1" />
                Approve ({selectedIds.size})
              </button>
              <button
                onClick={handleBatchDeleteSelected}
                disabled={clearingData}
                className="btn-primary !bg-red-600/80 hover:!bg-red-600 !py-2 !px-3 text-xs font-semibold flex items-center gap-1 border border-red-500/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selectedIds.size})
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="btn-secondary !py-2 !px-3 text-xs"
              >
                Cancel
              </button>
            </>
          )}

          <button
            onClick={() => setShowClearModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 hover:text-red-200 text-xs font-semibold transition-all shadow-sm"
            title="Purge or clear studio video records"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Clear Data</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-purple-900/40 border border-purple-500/30 text-xs text-purple-200 flex items-center justify-between shadow-lg">
          <span>{actionFeedback}</span>
          <button onClick={() => setActionFeedback(null)} className="text-slate-400 hover:text-white ml-3">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Filter Tabs & Search Bar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 rounded-2xl bg-[#121424] border border-purple-500/15">
        {/* Pill Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 px-1">
          <button
            onClick={() => setFilter('ALL')}
            className={`pill-tab ${filter === 'ALL' ? 'pill-tab-active' : ''}`}
          >
            All Videos
            <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/10 font-mono tabular-nums">
              {videos.length}
            </span>
          </button>

          <button
            onClick={() => setFilter('PENDING')}
            className={`pill-tab ${filter === 'PENDING' ? 'pill-tab-active' : ''}`}
          >
            Pending Review
            <span className="text-xs px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono tabular-nums">
              {pendingVideos.length}
            </span>
          </button>

          <button
            onClick={() => setFilter('APPROVED')}
            className={`pill-tab ${filter === 'APPROVED' ? 'pill-tab-active' : ''}`}
          >
            Approved
          </button>

          <button
            onClick={() => setFilter('UPLOADED')}
            className={`pill-tab ${filter === 'UPLOADED' ? 'pill-tab-active' : ''}`}
          >
            Uploaded
          </button>

          <button
            onClick={() => setFilter('REJECTED')}
            className={`pill-tab ${filter === 'REJECTED' ? 'pill-tab-active' : ''}`}
          >
            Rejected
          </button>
        </div>

        {/* Right Search Input & Quick Select */}
        <div className="flex items-center gap-2 px-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white/[0.04] border border-white/10 focus:border-purple-500/40 text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {filter === 'PENDING' && pendingVideos.length > 0 && (
            <button
              onClick={toggleSelectAllPending}
              className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap font-medium px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
            >
              {selectedIds.size === pendingVideos.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>
      </div>

      {/* ── Video Card Grid ── */}
      {loading && videos.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-metric h-72 animate-pulse flex flex-col justify-between">
              <div className="h-4 bg-white/5 w-1/3 rounded" />
              <div className="h-28 bg-white/5 rounded-xl" />
              <div className="h-4 bg-white/5 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="p-16 rounded-2xl bg-[#121424] border border-purple-500/15 text-center glow-aura">
          <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 mx-auto mb-4">
            <Film className="w-8 h-8 opacity-80" />
          </div>
          <h3 className="text-base font-semibold text-white font-display">
            {filter === 'PENDING' ? 'Approval Queue Cleared' : 'No matching videos found'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {filter === 'PENDING'
              ? 'All incoming generated clips have been reviewed and approved.'
              : 'Try clearing your search query or run a pipeline cycle to fetch new Telegram media.'}
          </p>
          <div className="mt-5">
            <button
              onClick={handleTriggerCycle}
              disabled={triggeringCycle || (!account.isAdmin && !account.canRun)}
              className="btn-primary text-xs !py-2.5 !px-5 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!account.isAdmin && !account.canRun ? '1-time test run already completed for this account' : 'Run Pipeline Scrape Cycle'}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${triggeringCycle ? 'animate-spin' : ''}`} />
              Run Pipeline Scrape Cycle
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredVideos.map((video) => {
            const isPending = video.status === 'PENDING_REVIEW';
            const isSelected = selectedIds.has(video.id);

            return (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`card-metric flex flex-col justify-between overflow-hidden relative group transition-all duration-200 ${
                  isSelected ? 'border-purple-500 ring-2 ring-purple-500/20' : ''
                }`}
              >
                {/* Checkbox for batch approval if pending */}
                {isPending && (
                  <div className="absolute top-4 left-4 z-20">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(video.id)}
                      className="w-4 h-4 rounded border-purple-500/40 text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-500"
                    />
                  </div>
                )}

                <div>
                  {/* Top Badges */}
                  <div className={`flex items-center justify-between gap-2 mb-3.5 ${isPending ? 'pl-7' : ''}`}>
                    {getStatusBadge(video.status)}

                    {video.viralityScore > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full tabular-nums">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        {video.viralityScore}/10
                      </span>
                    )}
                  </div>

                  {/* Video Thumbnail Box with Overlay Badges */}
                  <div
                    onClick={() => setPreviewingVideo(video)}
                    className="relative aspect-video rounded-xl bg-black/60 border border-white/5 overflow-hidden mb-3.5 cursor-pointer group-hover:border-purple-500/35 transition-all flex items-center justify-center"
                  >
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-slate-500">
                        <Film className="w-8 h-8 text-purple-400/40" />
                        <span className="text-[10px] uppercase font-mono tracking-wider">Vertical 9:16</span>
                      </div>
                    )}

                    {/* Thumbnail Corner Tags */}
                    <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md text-white border border-white/10 font-mono">
                        9:16
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-600/80 backdrop-blur-md text-white border border-purple-400/30 font-mono">
                        TAMIL
                      </span>
                    </div>

                    <div className="absolute bottom-2 right-2 z-10">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-slate-300 font-mono tabular-nums">
                        0:58
                      </span>
                    </div>

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Video Title */}
                  <h3
                    title={video.title}
                    className="font-semibold text-sm text-white line-clamp-2 mb-2 leading-snug group-hover:text-purple-300 transition-colors"
                  >
                    {video.title}
                  </h3>

                  {/* Video Metadata info */}
                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mb-4 tabular-nums">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {video.createdAt ? video.createdAt.slice(0, 10) : 'Recent'}
                    </span>
                    <span>•</span>
                    <span className="truncate">{video.type || 'Short'}</span>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPreviewingVideo(video)}
                      className="text-xs text-purple-400 hover:text-purple-300 font-medium px-2 py-1 rounded hover:bg-purple-500/10 flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" /> Preview
                    </button>
                    <button
                      onClick={() => setInspectingVideo(video)}
                      className="text-xs text-slate-400 hover:text-white font-medium px-2 py-1 rounded hover:bg-white/5 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> Details
                    </button>
                    <button
                      onClick={(e) => handleDeleteSingle(e, video)}
                      disabled={deletingId === video.id}
                      className="text-xs text-slate-500 hover:text-red-400 font-medium px-1.5 py-1 rounded hover:bg-red-500/10 flex items-center gap-1 transition-colors"
                      title="Remove from Content Studio"
                    >
                      <Trash2 className="w-3 h-3 text-slate-500 hover:text-red-400" />
                    </button>
                  </div>

                  {/* If Pending, Show Inline Approve & Reject */}
                  {isPending ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleReject(video)}
                        disabled={processingId === video.id}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                        title="Reject video"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleApprove(video)}
                        disabled={processingId === video.id}
                        className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition-colors flex items-center gap-1 text-xs font-semibold px-2.5"
                        title="Approve for upload"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    </div>
                  ) : video.youtubeUrl ? (
                    <a
                      href={video.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 px-2 py-1"
                    >
                      YouTube
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Video Player Preview Modal ── */}
      <AnimatePresence>
        {previewingVideo && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:pt-10 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl bg-[#121424] border border-purple-500/30 shadow-2xl p-5 relative overflow-hidden glow-aura my-auto sm:my-0"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white font-display">
                      Shorts Player & Verification
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {previewingVideo.id}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setPreviewingVideo(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Video Player */}
              <div className="aspect-[9/14] max-h-[50vh] mx-auto rounded-xl bg-black border border-white/10 overflow-hidden flex items-center justify-center mb-4">
                {previewingVideo.previewUrl ? (
                  <video
                    src={previewingVideo.previewUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-8">
                    <Film className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No media preview stream available.</p>
                  </div>
                )}
              </div>

              {/* Video Details */}
              <div className="space-y-2 mb-5">
                <h4 className="text-sm font-bold text-white leading-snug">
                  {previewingVideo.title}
                </h4>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                  <span>Virality: <strong className="text-purple-300">{previewingVideo.viralityScore || '8.5'}/10</strong></span>
                  <span>•</span>
                  <span>Type: <strong className="text-white">{previewingVideo.type}</strong></span>
                  <span>•</span>
                  <span>Status: <strong className="text-amber-400">{previewingVideo.status}</strong></span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                {previewingVideo.status === 'PENDING_REVIEW' && (
                  <>
                    <button
                      onClick={() => {
                        handleReject(previewingVideo);
                        setPreviewingVideo(null);
                      }}
                      className="btn-secondary !text-rose-400 hover:!border-rose-500/40 text-xs !py-2 !px-4"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        handleApprove(previewingVideo);
                        setPreviewingVideo(null);
                      }}
                      className="btn-primary !bg-emerald-600 hover:!bg-emerald-500 text-xs !py-2 !px-5"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve for Upload
                    </button>
                  </>
                )}
                {previewingVideo.status !== 'PENDING_REVIEW' && (
                  <button
                    onClick={() => setPreviewingVideo(null)}
                    className="btn-secondary text-xs !py-2 !px-4"
                  >
                    Close
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Metadata Inspection Drawer / Modal ── */}
      <AnimatePresence>
        {inspectingVideo && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:pt-10 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl bg-[#121424] border border-purple-500/30 shadow-2xl p-6 glow-aura my-auto sm:my-0"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <h3 className="text-base font-semibold text-white font-display">
                  Clip Technical Telemetry
                </h3>
                <button
                  onClick={() => setInspectingVideo(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs text-slate-300 tabular-nums">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                  <div className="text-slate-500 text-[10px]">VIDEO TITLE</div>
                  <div className="font-sans font-semibold text-white">{inspectingVideo.title}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-slate-500 text-[10px]">CLIP ID</div>
                    <div className="truncate text-purple-300">{inspectingVideo.id}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-slate-500 text-[10px]">STATUS</div>
                    <div>{getStatusBadge(inspectingVideo.status)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-slate-500 text-[10px]">EST. VIRALITY</div>
                    <div className="text-emerald-400 font-bold">{inspectingVideo.viralityScore || 'N/A'}/10</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-slate-500 text-[10px]">PRIVACY</div>
                    <div className="text-white">{inspectingVideo.privacy || 'public'}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                  <div className="text-slate-500 text-[10px]">SOURCE PIPELINE</div>
                  <div className="text-white">{inspectingVideo.source || 'telegram_scraper'}</div>
                </div>
              </div>

              <div className="flex justify-end pt-4 mt-4 border-t border-white/10">
                <button
                  onClick={() => setInspectingVideo(null)}
                  className="btn-secondary text-xs !py-2 !px-4"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Clear Content Studio Data Modal ── */}
        {showClearModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-2xl bg-[#121424] border border-red-500/30 shadow-2xl p-6 glow-aura relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white font-display">
                      Clear Studio Content
                    </h3>
                    <p className="text-xs text-slate-400">
                      Purge video records from Content Studio
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowClearModal(false)}
                  disabled={clearingData}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scope Selection */}
              <div className="space-y-2.5 mb-5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Select Purge Scope
                </label>

                {/* Option: All */}
                <label
                  onClick={() => setClearScope('all')}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                    clearScope === 'all'
                      ? 'bg-red-500/10 border-red-500/40 text-white'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === 'all'}
                      onChange={() => setClearScope('all')}
                      className="accent-red-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">All Studio Videos</div>
                      <div className="text-[11px] text-slate-400">Wipes all queues and created records</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10 text-slate-200">
                    {videos.length} clips
                  </span>
                </label>

                {/* Option: Pending only */}
                <label
                  onClick={() => setClearScope('pending')}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                    clearScope === 'pending'
                      ? 'bg-amber-500/10 border-amber-500/40 text-white'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === 'pending'}
                      onChange={() => setClearScope('pending')}
                      className="accent-amber-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">Pending Review Queue</div>
                      <div className="text-[11px] text-slate-400">Only removes clips awaiting approval</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    {pendingVideos.length} clips
                  </span>
                </label>

                {/* Option: Rejected only */}
                <label
                  onClick={() => setClearScope('rejected')}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                    clearScope === 'rejected'
                      ? 'bg-rose-500/10 border-rose-500/40 text-white'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === 'rejected'}
                      onChange={() => setClearScope('rejected')}
                      className="accent-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">Rejected Videos Only</div>
                      <div className="text-[11px] text-slate-400">Removes discarded clips</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                    {rejectedVideos.length} clips
                  </span>
                </label>

                {/* Option: Uploaded history only */}
                <label
                  onClick={() => setClearScope('uploaded')}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                    clearScope === 'uploaded'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                      : 'bg-white/[0.02] border-white/10 text-slate-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="clearScope"
                      checked={clearScope === 'uploaded'}
                      onChange={() => setClearScope('uploaded')}
                      className="accent-emerald-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-medium text-white">Uploaded Records Only</div>
                      <div className="text-[11px] text-slate-400">Cleans published history from Studio</div>
                    </div>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    {uploadedVideos.length} clips
                  </span>
                </label>
              </div>

              {/* Option to also delete disk files */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 mb-5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteFilesOnDisk}
                    onChange={(e) => setDeleteFilesOnDisk(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-white/5 text-red-500 accent-red-500 cursor-pointer"
                  />
                  <div className="text-xs text-slate-300">
                    Also delete local video/thumbnail files from disk (<span className="font-mono text-slate-400">outputs/</span>)
                  </div>
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => setShowClearModal(false)}
                  disabled={clearingData}
                  className="btn-secondary text-xs !py-2 !px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClear}
                  disabled={clearingData}
                  className="btn-primary !bg-red-600 hover:!bg-red-500 text-xs !py-2 !px-4 font-semibold flex items-center gap-1.5"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${clearingData ? 'animate-spin' : ''}`} />
                  {clearingData ? 'Clearing Data...' : 'Confirm Clear'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
