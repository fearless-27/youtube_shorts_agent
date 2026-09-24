import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Film,
  UploadCloud,
  Terminal,
  Settings,
  Bell,
  Search,
  X,
  AlertTriangle,
  Info,
  Play,
  LogOut,
} from 'lucide-react';
import Overview from './dashboard/Overview';
import ContentStudio from './dashboard/ContentStudio';
import SmartEditor from './dashboard/SmartEditor';
import UploadCenter from './dashboard/UploadCenter';
import CommandCenter from './dashboard/CommandCenter';
import SettingsPage from './dashboard/SettingsPage';
import CommandMenu from '../components/ui/CommandMenu';
import { DashboardProvider, useDashboard } from '../context/DashboardContext';
import { Sparkles } from 'lucide-react';

/* ── 6 Core Administrator Nav Items ── */
const navItems = [
  { path: '/dashboard',         label: 'Overview',        icon: LayoutDashboard, end: true },
  { path: '/dashboard/editor',  label: 'AI Smart Editor', icon: Sparkles },
  { path: '/dashboard/content', label: 'Content Studio',  icon: Film },
  { path: '/dashboard/uploads', label: 'Upload Center',   icon: UploadCloud },
  { path: '/dashboard/command', label: 'Command Center',  icon: Terminal },
  { path: '/dashboard/settings',label: 'Settings',        icon: Settings },
];

/* ── Notification Panel ── */
function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { pipelineLogs } = useDashboard();
  const errors = pipelineLogs.filter((l) => l.level === 'ERROR').slice(-5).reverse();
  const warnings = pipelineLogs.filter((l) => l.level === 'WARN').slice(-3).reverse();
  const notes = [...errors, ...warnings].slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 top-full mt-2 w-84 z-50 rounded-2xl bg-[#121424] border border-purple-500/30 shadow-2xl p-3 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-semibold text-white font-display">
          System Alerts & Telemetry
        </span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-slate-500">
          No active system alerts. All services operating normally.
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1.5 p-1">
          {notes.map((n, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white/[0.02] transition-colors text-xs"
            >
              {n.level === 'ERROR' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      n.level === 'ERROR' ? 'text-rose-400' : 'text-amber-300'
                    }`}
                  >
                    {n.level}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {n.timestamp ? n.timestamp.slice(11, 19) : ''}
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                  {n.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Dashboard Shell ── */
function DashboardShell() {
  const location = useLocation();
  const { pipelineLogs, pipelineStats, defaultSettings, isLive, account, youtubeChannel } = useDashboard();
  const [bellOpen, setBellOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const bellRef = useRef<HTMLDivElement>(null);

  const errorCount = pipelineLogs.filter((l) => l.level === 'ERROR').slice(-24).length;
  const pendingCount = pipelineStats.pendingApproval ?? 0;

  // Ensure user is authenticated, otherwise redirect to login
  useEffect(() => {
    try {
      const raw = localStorage.getItem('nemo_user');
      if (!raw) {
        window.location.href = '/landing/login.html';
      }
    } catch {
      window.location.href = '/landing/login.html';
    }
  }, []);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);

  const currentNav = navItems.find((n) =>
    n.end ? location.pathname === n.path : location.pathname.startsWith(n.path)
  );
  const pageTitle = currentNav?.label ?? 'Administrator Dashboard';

  const uploadsToday = pipelineStats.uploadsToday ?? 0;
  const dailyCap = pipelineStats.dailyCap ?? 50;
  const quotaPct = Math.min(100, Math.round((uploadsToday / dailyCap) * 100));

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0D1A] text-slate-200">
      {/* Global Command Menu */}
      <CommandMenu isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* ═══ SIDEBAR ═══ */}
      <aside className="flex flex-col w-64 shrink-0 bg-[#0F1120] border-r border-purple-500/15 relative z-20">
        {/* Brand Header */}
        <div className="px-6 py-5 border-b border-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/25 border border-purple-500/30 bg-black/60 flex items-center justify-center shrink-0 group">
              <img
                src="/images/pc_logo.svg"
                alt="NEMO AI Studio"
                className="w-5 h-5 object-contain transform group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white font-display">
                NEMO AI
              </div>
              <div className="text-[11px] text-purple-300/80 font-medium">
                Shorts Agent Studio
              </div>
            </div>
          </div>
        </div>

        {/* 5 Core Nav Items */}
        <div className="px-4 py-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 block mb-2 font-mono">
            Navigation Menu
          </span>
          <nav className="space-y-1">
            {navItems.map(({ path, label, icon: Icon, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group cursor-pointer ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/35 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-purple-400'}`} />
                      <span>{label}</span>
                    </div>

                    {/* Notification badges */}
                    {path === '/dashboard/content' && pendingCount > 0 && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {pendingCount}
                      </span>
                    )}

                    {path === '/dashboard/command' && errorCount > 0 && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {errorCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Stakent-style Channel Stats Card at bottom of sidebar ── */}
        <div className="p-4 mx-3 mb-4 rounded-2xl bg-gradient-to-b from-[#181B2E] to-[#121424] border border-purple-500/20 shadow-md space-y-3 glow-aura">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 radar-pulse-green" />
              <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                {youtubeChannel.connected && youtubeChannel.channel?.title
                  ? youtubeChannel.channel.title
                  : (() => {
                      try {
                        const u = JSON.parse(localStorage.getItem('nemo_user') || '{}');
                        const name = u.displayName || u.email?.split('@')[0];
                        return name ? `${name}'s Channel` : 'Tamil Shorts Daily';
                      } catch {
                        return 'Tamil Shorts Daily';
                      }
                    })()}
              </span>
            </div>
            <span className="text-[10px] font-mono text-purple-300 font-semibold">
              LIVE
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Daily Quota</span>
              <span className="text-white font-mono font-medium tabular-nums">
                {uploadsToday} / {dailyCap}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${quotaPct}%` }}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
            <span>Score: <strong className="text-purple-300">{pipelineStats.avgViralityScore ? `${pipelineStats.avgViralityScore}/10` : '0/10'}</strong></span>
            <span>Success: <strong className="text-emerald-400">{pipelineStats.successRate ? `${pipelineStats.successRate}%` : '0%'}</strong></span>
          </div>
        </div>

        {/* Operator Profile Pill + Logout */}
        <div className="px-4 py-3 border-t border-purple-500/10 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full ${account.isAdmin ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-purple-500/20 border-purple-500/40 text-purple-300'} border flex items-center justify-center font-bold text-xs`}>
              {account.isAdmin ? '👑' : (() => {
                try {
                  const u = JSON.parse(localStorage.getItem('nemo_user') || '{}');
                  const name = u.displayName || u.email || 'OP';
                  return name.slice(0, 2).toUpperCase();
                } catch { return 'OP'; }
              })()}
            </div>
            <div>
              <div className="text-xs font-semibold text-white truncate max-w-[105px]">
                {(() => {
                  try {
                    const u = JSON.parse(localStorage.getItem('nemo_user') || '{}');
                    return u.displayName || u.email?.split('@')[0] || (account.isAdmin ? 'Administrator' : 'Creator');
                  } catch { return 'Operator'; }
                })()}
              </div>
              <div className="text-[10px]">
                {account.isAdmin ? (
                  <span className="font-semibold text-amber-400">👑 Administrator</span>
                ) : (
                  <span className={account.canRun ? 'text-cyan-400' : 'text-rose-400'}>
                    {account.canRun ? 'Normal (1 Test Run)' : 'Test Run Used'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem('nemo_user');
              window.location.href = '/landing/';
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer"
            title="Sign out and return to landing page"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
        </div>
      </aside>

      {/* ═══ MAIN VIEW AREA ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0B0D1A]">
        {/* Topbar */}
        <header className="h-16 px-6 border-b border-purple-500/15 bg-[#0D0F1E]/80 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
          {/* Left Title / Breadcrumb */}
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-white font-display">
              {pageTitle}
            </h2>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              YouTube Shorts Automation Suite
            </span>
          </div>

          {/* Center Search / Command Launcher Trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-purple-500/35 text-xs text-slate-400 transition-all cursor-pointer shadow-sm w-64 justify-between"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-purple-400" />
              <span>Search or type command...</span>
            </div>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-slate-300">
              ⌘K
            </kbd>
          </button>

          {/* Right Utilities */}
          <div className="flex items-center gap-3">
            {/* Account Tier Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border shadow-sm ${
              account.isAdmin
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : account.canRun
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {account.isAdmin ? (
                <>
                  <span>👑</span>
                  <span>Admin (Unlimited)</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>{account.canRun ? 'Trial: 1 Test Run Available' : '1-Time Test Run Used'}</span>
                </>
              )}
            </div>

            {/* Channel Telemetry Chip */}
            <div className="hidden lg:flex items-center gap-2.5 px-3 py-1 rounded-full bg-gradient-to-r from-red-950/30 via-purple-950/20 to-indigo-950/30 border border-red-500/20 text-xs">
              <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
              </div>
              <span className="font-semibold text-white">
                {youtubeChannel.connected && youtubeChannel.channel?.title
                  ? youtubeChannel.channel.title
                  : (() => {
                      try {
                        const u = JSON.parse(localStorage.getItem('nemo_user') || '{}');
                        const name = u.displayName || u.email?.split('@')[0];
                        return name ? `${name}'s Channel` : 'Tamil Shorts Daily';
                      } catch {
                        return 'Tamil Shorts Daily';
                      }
                    })()}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 font-mono font-medium">
                {youtubeChannel.connected && youtubeChannel.channel?.subscriberCount
                  ? `${Number(youtubeChannel.channel.subscriberCount).toLocaleString()} subs`
                  : (pipelineStats.growthCurrent > 0 ? `+${pipelineStats.growthCurrent}` : '+0')}
              </span>
            </div>

            {/* Real-time SSE Live Indicator */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border transition-all ${
              isLive 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]' 
                : 'bg-amber-950/30 border-amber-500/20 text-amber-300'
            }`}>
              <span className="relative flex h-2 w-2">
                {isLive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </span>
              <span className="font-semibold text-[10px] sm:text-[11px] tracking-wide">
                {isLive ? 'LIVE REAL-TIME' : 'SYNCING'}
              </span>
            </div>

            {/* Pipeline Mode Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 radar-pulse-green" />
              <span className="text-purple-200 font-medium capitalize">
                Mode: {defaultSettings.mode || 'Semi-Live'}
              </span>
            </div>

            {/* Time Badge */}
            <div className="text-xs font-mono text-slate-400 hidden xl:block tabular-nums">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>

            {/* Notification Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors relative"
                title="System alerts"
              >
                <Bell className="w-4 h-4" />
                {errorCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
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

        {/* Dynamic Route Content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/editor" element={<SmartEditor />} />
            <Route path="/content" element={<ContentStudio />} />
            <Route path="/uploads" element={<UploadCenter />} />
            <Route path="/command" element={<CommandCenter />} />
            <Route path="/settings" element={<SettingsPage />} />

            {/* Backwards-compatibility redirects for old 8-page URLs */}
            <Route path="/videos" element={<Navigate to="/dashboard/content" replace />} />
            <Route path="/approval" element={<Navigate to="/dashboard/content" replace />} />
            <Route path="/telegram" element={<Navigate to="/dashboard/command" replace />} />
            <Route path="/audio" element={<Navigate to="/dashboard/command" replace />} />
            <Route path="/logs" element={<Navigate to="/dashboard/command" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ── Root Export Wrapped in Context ── */
export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardShell />
    </DashboardProvider>
  );
}
