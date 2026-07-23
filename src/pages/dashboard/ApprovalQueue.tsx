import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { updateApproval } from '../../data/store';
import { useDashboard, type Video } from '../../context/DashboardContext';
import {
  IconQueue, IconCheck, IconX, IconSparkles,
  IconShieldCheck,
} from '../../components/icons/StreamlineIcons';

export default function ApprovalQueue() {
  const { videos, autoApproveEnabled, refresh } = useDashboard();
  const [items, setItems] = useState<Video[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showApproved, setShowApproved] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setItems(videos.filter((video) => video.source === 'approval' && video.approvalId));
  }, [videos]);

  const pending = items.filter((v) => v.status === 'PENDING_REVIEW');
  const approved = items.filter((v) => v.status === 'APPROVED' || v.status === 'QUEUED');
  const rejected = items.filter((v) => v.status === 'REJECTED');

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((v) => v.id)));
  };

  const handleApprove = async (id: string) => {
    try {
      const approvalId = items.find((v) => v.id === id)?.approvalId ?? id;
      await updateApproval(approvalId, true);
      setItems((prev) => prev.map((v) => v.id === id ? { ...v, status: 'APPROVED' as const } : v));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      showMsg('Short Approved ✓');
      refresh();
    } catch {
      showMsg('Approval action failed');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const approvalId = items.find((v) => v.id === id)?.approvalId ?? id;
      await updateApproval(approvalId, false);
      setItems((prev) => prev.map((v) => v.id === id ? { ...v, status: 'REJECTED' as const } : v));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      showMsg('Short Rejected ✗');
      refresh();
    } catch {
      showMsg('Rejection action failed');
    }
  };

  const handleBatchApprove = async () => {
    for (const id of selected) {
      await handleApprove(id);
    }
  };

  return (
    <div className="space-y-5">
      {/* Control bar */}
      <div className="hud-panel p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconQueue size={18} color="#00F0FF" />
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] font-bold" style={{ color: '#00F0FF' }}>
              Operator Approval Control
            </div>
            <div className="font-mono text-[9px] text-white/40">
              {pending.length} clip(s) awaiting sign-off • Mode: {autoApproveEnabled ? 'AUTO-APPROVE' : 'MANUAL'}
            </div>
          </div>
        </div>

        {/* Batch actions */}
        {pending.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAll}
              className="btn-secondary py-1.5 px-3 text-[9px]"
            >
              {selected.size === pending.length ? 'Deselect All' : 'Select All'}
            </button>
            {selected.size > 0 && (
              <button
                onClick={handleBatchApprove}
                className="btn-primary py-1.5 px-3 text-[9px] bg-[#00FF66]"
              >
                Approve ({selected.size})
              </button>
            )}
          </div>
        )}
      </div>

      {message && (
        <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/30 font-mono text-xs text-[#00F0FF] animate-fade-in">
          {message}
        </div>
      )}

      {/* Main pending list */}
      <div className="space-y-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">
          Pending Queue ({pending.length})
        </div>

        {pending.length === 0 ? (
          <div className="hud-panel p-10 text-center">
            <IconShieldCheck size={28} color="#00FF66" className="mx-auto mb-2" />
            <div className="font-mono text-xs uppercase tracking-widest text-white/50">Approval queue clear</div>
            <div className="font-mono text-[9px] text-white/30 mt-1">All processed clips have been acted upon</div>
          </div>
        ) : (
          pending.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="hud-panel p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="mt-1 accent-[#00F0FF] cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[8px] uppercase tracking-wider px-2 py-0.5 bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/30">
                      PENDING REVIEW
                    </span>
                    {item.viralityScore && (
                      <span className="font-mono text-[9px] text-[#00F0FF] flex items-center gap-1">
                        <IconSparkles size={10} /> {item.viralityScore}/10
                      </span>
                    )}
                  </div>
                  <h4 className="font-mono text-xs font-bold text-white truncate">{item.title}</h4>
                  <div className="font-mono text-[9px] text-white/40 mt-1 flex items-center gap-3">
                    <span>Type: {item.type}</span>
                    <span>Created: {item.createdAt ? item.createdAt.slice(0, 10) : 'Recent'}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleReject(item.id)}
                  className="btn-secondary py-1.5 px-3 text-[9px] hover:border-red-500 hover:text-red-400 flex items-center gap-1"
                >
                  <IconX size={12} /> Reject
                </button>
                <button
                  onClick={() => handleApprove(item.id)}
                  className="btn-primary py-1.5 px-4 text-[9px] bg-[#00FF66] text-black font-bold flex items-center gap-1"
                >
                  <IconCheck size={12} /> Approve
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* History Toggle */}
      <div className="pt-4">
        <button
          onClick={() => setShowApproved(!showApproved)}
          className="font-mono text-[9px] uppercase tracking-widest text-[#00F0FF] hover:underline flex items-center gap-1 cursor-pointer"
        >
          {showApproved ? 'Hide Decided History ▲' : 'Show Decided History (Approved / Rejected) ▼'}
        </button>

        {showApproved && (
          <div className="mt-3 space-y-2">
            {[...approved, ...rejected].map((item) => (
              <div key={item.id} className="hud-panel p-3 flex items-center justify-between text-xs font-mono">
                <div className="truncate flex-1 mr-4">
                  <span className="text-white/80">{item.title}</span>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 ${item.status === 'REJECTED' ? 'text-red-400 bg-red-400/10' : 'text-[#00FF66] bg-[#00FF66]/10'}`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
