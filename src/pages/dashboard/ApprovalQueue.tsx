import { useEffect, useState } from 'react';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { updateApproval, useDashboardData, type Video } from '../../data/store';

export default function ApprovalQueue() {
  const { videos } = useDashboardData();
  const [items, setItems] = useState<Video[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showApproved, setShowApproved] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setItems(videos.filter((video) => video.source === 'approval' && video.approvalId));
  }, [videos]);

  const pending = items.filter(v => v.status === 'PENDING_REVIEW');
  const approved = items.filter(v => v.status === 'APPROVED' || v.status === 'QUEUED');

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map(v => v.id)));
  };

  const approve = async (id: string) => {
    const approvalId = items.find(v => v.id === id)?.approvalId ?? id;
    await updateApproval(approvalId, true);
    setItems(prev => prev.map(v => v.id === id ? { ...v, status: 'APPROVED' as const } : v));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setMessage('Approved');
  };

  const reject = async (id: string) => {
    const approvalId = items.find(v => v.id === id)?.approvalId ?? id;
    await updateApproval(approvalId, false);
    setItems(prev => prev.map(v => v.id === id ? { ...v, status: 'REJECTED' as const } : v));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setMessage('Rejected');
  };

  const bulkApprove = async () => {
    await Promise.all(Array.from(selected).map(id => updateApproval(items.find(v => v.id === id)?.approvalId ?? id, true)));
    setItems(prev => prev.map(v => selected.has(v.id) ? { ...v, status: 'APPROVED' as const } : v));
    setSelected(new Set());
    setMessage('Selected Shorts approved');
  };

  const bulkReject = async () => {
    await Promise.all(Array.from(selected).map(id => updateApproval(items.find(v => v.id === id)?.approvalId ?? id, false)));
    setItems(prev => prev.map(v => selected.has(v.id) ? { ...v, status: 'REJECTED' as const } : v));
    setSelected(new Set());
    setMessage('Selected Shorts rejected');
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#00FF66';
    if (score >= 50) return '#FFB800';
    return '#FF3366';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold uppercase tracking-[-0.01em]">Approval Queue</h2>
          <span className="font-mono text-xs px-2 py-0.5" style={{ background: '#FFB800', color: '#050505' }}>
            {pending.length} PENDING
          </span>
          <span className="font-mono text-xs px-2 py-0.5" style={{ background: 'rgba(0,255,102,0.12)', color: '#00FF66' }}>
            AUTO APPROVAL ON
          </span>
        </div>
        {message && (
          <span className="font-mono text-xs" style={{ color: '#00FF66' }}>
            {message}
          </span>
        )}
      </div>

      {/* Pending Table */}
      <div style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
        {/* Table Header */}
        <div className="grid items-center px-4 py-3 font-mono text-xs uppercase tracking-wider"
          style={{ background: '#121212', color: 'rgba(255,255,255,0.4)', gridTemplateColumns: '40px 60px 1fr 100px 80px 100px 80px 140px' }}>
          <input 
            type="checkbox" 
            checked={selected.size === pending.length && pending.length > 0}
            onChange={toggleAll}
            className="w-4 h-4 cursor-pointer"
            style={{ accentColor: '#00F0FF' }}
          />
          <span>ID</span>
          <span>Title</span>
          <span>Type</span>
          <span>Score</span>
          <span>Privacy</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {pending.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No items pending review
            </p>
          </div>
        ) : (
          pending.map(video => (
            <div key={video.id} 
              className="grid items-center px-4 py-3 transition-colors hover:bg-white/[0.02]"
              style={{ gridTemplateColumns: '40px 60px 1fr 100px 80px 100px 80px 140px', borderBottom: '1px solid #121212' }}>
              <input 
                type="checkbox" 
                checked={selected.has(video.id)}
                onChange={() => toggleSelect(video.id)}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: '#00F0FF' }}
              />
              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{video.id}</span>
              <div className="pr-4">
                <span className="text-xs truncate block">{video.title}</span>
                {video.previewUrl && (
                  <video className="mt-2 w-40 max-w-full" style={{ border: '1px solid #121212', background: '#050505' }} src={video.previewUrl} controls preload="metadata" />
                )}
              </div>
              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.type}</span>
              <span className="font-mono text-xs font-semibold" style={{ color: getScoreColor(video.viralityScore) }}>
                {video.viralityScore}
              </span>
              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.privacy}</span>
              <span className="font-mono text-xs px-2 py-0.5" 
                style={{ background: 'rgba(255,184,0,0.1)', color: '#FFB800' }}>
                PENDING
              </span>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => approve(video.id)}
                  className="p-1.5 transition-colors hover:bg-cyan/20" style={{ color: '#00F0FF' }}>
                  <Check size={14} />
                </button>
                <button onClick={() => reject(video.id)}
                  className="p-1.5 transition-colors hover:bg-red/20" style={{ color: '#FF3366' }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between px-6 py-3"
          style={{ background: '#0A0A0C', border: '1px solid #00F0FF', boxShadow: '0 0 20px rgba(0,240,255,0.1)' }}>
          <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {selected.size} selected
          </span>
          <div className="flex items-center gap-3">
            <button onClick={bulkApprove}
              className="px-4 py-2 font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2"
              style={{ background: '#00F0FF', color: '#050505' }}>
              <Check size={12} /> Approve Selected
            </button>
            <button onClick={bulkReject}
              className="px-4 py-2 font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2"
              style={{ background: '#FF3366', color: '#fff' }}>
              <X size={12} /> Reject Selected
            </button>
          </div>
        </div>
      )}

      {/* Approved Items */}
      {approved.length > 0 && (
        <div>
          <button onClick={() => setShowApproved(!showApproved)}
            className="flex items-center gap-2 mb-4 font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            {showApproved ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Approved ({approved.length}) — Ready for Upload
          </button>
          {showApproved && (
            <div style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
              {approved.map(video => (
                <div key={video.id}
                  className="grid items-center px-4 py-3"
                  style={{ gridTemplateColumns: '40px 60px 1fr 100px 80px 100px 80px 140px', borderBottom: '1px solid #121212' }}>
                  <span />
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{video.id}</span>
                  <div className="pr-4">
                    <span className="text-xs truncate block">{video.title}</span>
                    {video.previewUrl && (
                      <video className="mt-2 w-40 max-w-full" style={{ border: '1px solid #121212', background: '#050505' }} src={video.previewUrl} controls preload="metadata" />
                    )}
                  </div>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.type}</span>
                  <span className="font-mono text-xs font-semibold" style={{ color: getScoreColor(video.viralityScore) }}>
                    {video.viralityScore}
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{video.privacy}</span>
                  <span className="font-mono text-xs px-2 py-0.5"
                    style={{ background: 'rgba(0,255,102,0.1)', color: '#00FF66' }}>
                    READY
                  </span>
                  <div className="text-right">
                    <button className="font-mono text-xs px-3 py-1 transition-colors hover:brightness-110"
                      style={{ background: '#00F0FF', color: '#050505' }}>
                      Queue Upload
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
