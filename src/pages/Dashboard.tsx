import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Overview from './dashboard/Overview';
import CreatedVideos from './dashboard/CreatedVideos';
import ApprovalQueue from './dashboard/ApprovalQueue';
import YouTubeUploads from './dashboard/YouTubeUploads';
import PipelineLogs from './dashboard/PipelineLogs';
import SettingsPage from './dashboard/SettingsPage';
import AudioTracker from './dashboard/AudioTracker';
import { pipelineAction } from '../data/store';
import { DashboardProvider, useDashboard } from '../context/DashboardContext';
import {
  IconDashboard, IconFilm, IconQueue, IconUpload, IconTerminal,
  IconSettings, IconBell, IconPlay, IconGhost,
  IconAlertTriangle, IconInfo, IconActivity,
  IconChevronRight, IconX, IconRadar,
} from '../components/icons/StreamlineIcons';

/* ── nav items ─────────────────────────────────────────── */
const navItems = [
  { path: '/dashboard',          label: 'Overview',           icon: IconDashboard, end: true },
  { path: '/dashboard/videos',   label: 'Created Videos',     icon: IconFilm },
  { path: '/dashboard/approval', label: 'Approval Queue',     icon: IconQueue },
  { path: '/dashboard/audio',    label: 'Audio Intelligence', icon: IconRadar },
  { path: '/dashboard/uploads',  label: 'YT Uploads',         icon: IconUpload },
  { path: '/dashboard/logs',     label: 'Pipeline Logs',      icon: IconTerminal },
  { path: '/dashboard/settings', label: 'Settings',           icon: IconSettings },
];

const MODE_STYLES: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  live:      { bg: 'rgba(0,255,102,0.08)',  color: '#00FF66', label: 'LIVE',      dot: '#00FF66' },
  semi_live: { bg: 'rgba(0,240,255,0.08)',  color: '#00F0FF', label: 'SEMI-LIVE', dot: '#00F0FF' },
  semi:      { bg: 'rgba(0,240,255,0.08)',  color: '#00F0FF', label: 'SEMI-LIVE', dot: '#00F0FF' },
  dry_run:   { bg: 'rgba(255,184,0,0.08)',  color: '#FFB800', label: 'DRY-RUN',   dot: '#FFB800' },
};
function getModeStyle(mode?: string) {
  const key = String(mode ?? 'live').toLowerCase().replace(/-/g, '_');
  return MODE_STYLES[key] ?? MODE_STYLES.live;
}



/* ── Notification panel ─────────────────────────────────── */
function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { pipelineLogs } = useDashboard();
  const errors   = pipelineLogs.filter((l) => l.level === 'ERROR').slice(-5).reverse();
  const warnings = pipelineLogs.filter((l) => l.level === 'WARN').slice(-3).reverse();
  const notes    = [...errors, ...warnings].slice(0, 6);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="absolute right-0 top-full mt-2 w-80 z-50"
      style={{ background: '#060d1a', border: '1px solid rgba(0,240,255,0.12)', boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 40px rgba(0,240,255,0.04)' }}
    >
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(0,240,255,0.06)' }}>
        <span className="font-mono text-[9px] uppercase tracking-[0.25em]"
          style={{ color: 'rgba(255,255,255,0.4)' }}>System Alerts</span>
        <button onClick={onClose} className="transition-opacity hover:opacity-60 cursor-pointer">
          <IconX size={13} color="rgba(255,255,255,0.4)" />
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.2)' }}>— No alerts —</div>
      ) : (
        <div className="max-h-60 overflow-y-auto">
          {notes.map((n, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              {n.level === 'ERROR'
                ? <IconAlertTriangle size={11} color="#FF3366" className="shrink-0 mt-0.5" />
                : <IconInfo size={11} color="#FFB800" className="shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <div className="font-mono text-[9px] mb-0.5 uppercase tracking-wider"
                  style={{ color: n.level === 'ERROR' ? '#FF3366' : '#FFB800' }}>{n.level}</div>
                <div className="font-mono text-[10px] leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {n.message.slice(0, 100)}{n.message.length > 100 ? '…' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Inner Dashboard shell ─────────────────────────────── */
function DashboardShell() {
  const location       = useLocation();
  const { pipelineLogs, pipelineStats, defaultSettings, loading, refresh } = useDashboard();
  const [bellOpen, setBellOpen]     = useState(false);
  const [time, setTime]             = useState(new Date());
  const [pipeRunning, setPipeRunning] = useState(false);
  const [actionMsg, setActionMsg]   = useState('');
  const bellRef = useRef<HTMLDivElement>(null);

  const errorCount   = pipelineLogs.filter((l) => l.level === 'ERROR').slice(-24).length;
  const pendingCount = pipelineStats.pendingApproval ?? 0;
  const modeStyle    = getModeStyle(defaultSettings.mode);

  /* clock */
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* close bell on outside click */
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);


  const handlePipeline = async (action: 'start' | 'stop') => {
    setPipeRunning(action === 'start');
    setActionMsg(action === 'start' ? 'PIPELINE STARTING...' : 'PIPELINE STOPPING...');
    await pipelineAction(action);
    setTimeout(() => { setActionMsg(''); refresh(); }, 2000);
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;

  /* page title from path */
  const currentNav = navItems.find((n) => n.end ? location.pathname === n.path : location.pathname.startsWith(n.path));
  const pageTitle  = currentNav?.label ?? 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#020617' }}>

      {/* ═══ SIDEBAR ═══ */}
      <aside className="flex flex-col w-56 shrink-0 relative"
        style={{ background: 'rgba(2,8,28,0.95)', borderRight: '1px solid rgba(0,240,255,0.08)' }}>

        {/* Sidebar scanline */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,240,255,0.015) 3px, rgba(0,240,255,0.015) 4px)',
          }} />

        {/* Logo */}
        <div className="relative px-5 py-5" style={{ borderBottom: '1px solid rgba(0,240,255,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{ boxShadow: ['0 0 8px rgba(0,240,255,0.3)', '0 0 20px rgba(0,240,255,0.6)', '0 0 8px rgba(0,240,255,0.3)'] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="w-7 h-7 flex items-center justify-center shrink-0"
              style={{ border: '1px solid rgba(0,240,255,0.4)', background: 'rgba(0,240,255,0.06)' }}
            >
              <IconGhost size={14} color="#00F0FF" />
            </motion.div>
            <div>
              <div className="font-mono text-[10px] font-bold tracking-[0.25em] uppercase" style={{ color: '#00F0FF' }}>
                GhostPipe
              </div>
              <div className="font-mono text-[7px] tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                AI Shorts Engine
              </div>
            </div>
          </div>
        </div>

        {/* Mode pill */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(0,240,255,0.05)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5"
            style={{ background: modeStyle.bg, border: `1px solid ${modeStyle.color}28` }}>
            <motion.div className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: modeStyle.dot }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }} />
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase font-bold"
              style={{ color: modeStyle.color }}>
              {modeStyle.label}
            </span>
            <span className="font-mono text-[8px] ml-auto" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {timeStr}
            </span>
          </div>
        </div>

        {/* Pipeline controls */}
        <div className="px-4 py-3 flex gap-2" style={{ borderBottom: '1px solid rgba(0,240,255,0.05)' }}>
          <button
            onClick={() => handlePipeline('start')}
            disabled={pipeRunning}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
            style={{ background: 'rgba(0,255,102,0.08)', border: '1px solid rgba(0,255,102,0.2)', color: '#00FF66' }}
          >
            <IconPlay size={10} /> Start
          </button>
          <button
            onClick={() => handlePipeline('stop')}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer hover:bg-red/10"
            style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.15)', color: '#FF3366' }}
          >
            <IconX size={10} /> Stop
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 transition-all duration-150 group relative cursor-pointer ${isActive ? 'active-nav' : ''}`
              }
              style={({ isActive }) => ({
                background:   isActive ? 'rgba(0,240,255,0.07)' : 'transparent',
                borderLeft:   isActive ? '2px solid #00F0FF' : '2px solid transparent',
                color:        isActive ? '#00F0FF' : 'rgba(255,255,255,0.45)',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon size={14} color={isActive ? '#00F0FF' : undefined} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{ color: isActive ? '#00F0FF' : undefined }}>
                    {label}
                  </span>
                  {/* Pending badge on approval */}
                  {path === '/dashboard/approval' && pendingCount > 0 && (
                    <span className="ml-auto font-mono text-[8px] px-1.5 py-0.5"
                      style={{ background: 'rgba(0,240,255,0.15)', color: '#00F0FF', border: '1px solid rgba(0,240,255,0.2)' }}>
                      {pendingCount}
                    </span>
                  )}
                  {/* Error badge on logs */}
                  {path === '/dashboard/logs' && errorCount > 0 && (
                    <span className="ml-auto font-mono text-[8px] px-1.5 py-0.5"
                      style={{ background: 'rgba(255,51,102,0.15)', color: '#FF3366', border: '1px solid rgba(255,51,102,0.2)' }}>
                      {errorCount}
                    </span>
                  )}
                  {/* Hover right indicator */}
                  {!isActive && (
                    <IconChevronRight size={10}
                      className="ml-auto opacity-0 group-hover:opacity-40 transition-opacity" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: quota bar */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(0,240,255,0.05)' }}>
          {(() => {
            const cap   = pipelineStats.dailyCap ?? 50;
            const today = pipelineStats.uploadsToday ?? 0;
            const pct   = Math.min((today / cap) * 100, 100);
            const color = pct >= 90 ? '#FF3366' : pct >= 70 ? '#FFB800' : '#00FF66';
            return (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[8px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Daily Quota
                  </span>
                  <span className="font-mono text-[8px]" style={{ color }}>
                    {today}/{cap}
                  </span>
                </div>
                <div className="hud-progress">
                  <motion.div
                    className="hud-progress-fill"
                    style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)`, boxShadow: `0 0 8px ${color}66` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })()}
        </div>

      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Topbar ── */}
        <header className="flex items-center justify-between px-6 h-14 shrink-0"
          style={{ borderBottom: '1px solid rgba(0,240,255,0.07)', background: 'rgba(2,6,23,0.8)', backdropFilter: 'blur(12px)' }}>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
              GhostPipe
            </span>
            <IconChevronRight size={10} color="rgba(255,255,255,0.15)" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: '#00F0FF' }}>
              {pageTitle}
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Action message */}
            <AnimatePresence>
              {actionMsg && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="font-mono text-[9px] uppercase tracking-wider"
                  style={{ color: '#FFB800' }}
                >
                  {actionMsg}
                </motion.span>
              )}
            </AnimatePresence>

            {/* Pipeline indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5"
              style={{ border: '1px solid rgba(0,240,255,0.08)', background: 'rgba(0,240,255,0.03)' }}>
              <IconActivity size={11} color={loading ? '#00F0FF' : '#00FF66'} />
              <span className="font-mono text-[9px] uppercase tracking-wider"
                style={{ color: loading ? '#00F0FF' : '#00FF66' }}>
                {loading ? 'SYNCING' : 'LIVE'}
              </span>
            </div>

            {/* Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative p-2 transition-colors hover:bg-white/5 cursor-pointer"
                style={{ border: '1px solid rgba(0,240,255,0.08)' }}
              >
                <IconBell size={14} color="rgba(255,255,255,0.5)" />
                {errorCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center font-mono text-[7px] font-bold"
                    style={{ background: '#FF3366', color: '#fff' }}>
                    {Math.min(errorCount, 9)}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {bellOpen && <NotificationPanel onClose={() => setBellOpen(false)} />}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto p-6" style={{ background: '#020617' }}>
          {/* Background grid overlay */}
          <div className="fixed inset-0 pointer-events-none" style={{
            backgroundImage: `
              linear-gradient(rgba(0,240,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,240,255,0.02) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
          }} />

          <div className="relative">
            <Routes>
              <Route path="/"         element={<Overview />} />
              <Route path="/videos"   element={<CreatedVideos />} />
              <Route path="/approval" element={<ApprovalQueue />} />
              <Route path="/audio"    element={<AudioTracker />} />
              <Route path="/uploads"  element={<YouTubeUploads />} />
              <Route path="/logs"     element={<PipelineLogs />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Root export ─────────────────────────────────────────── */
export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardShell />
    </DashboardProvider>
  );
}
