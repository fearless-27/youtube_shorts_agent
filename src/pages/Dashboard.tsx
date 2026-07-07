import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Film, ClipboardCheck, Upload, Terminal, Settings,
  Bell, LogOut, Play, Square
} from 'lucide-react';
import Overview from './dashboard/Overview';
import CreatedVideos from './dashboard/CreatedVideos';
import ApprovalQueue from './dashboard/ApprovalQueue';
import YouTubeUploads from './dashboard/YouTubeUploads';
import PipelineLogs from './dashboard/PipelineLogs';
import SettingsPage from './dashboard/SettingsPage';
import { logout, pipelineAction, useDashboardData } from '../data/store';

const navItems = [
  { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { path: '/dashboard/videos', label: 'Created Videos', icon: Film },
  { path: '/dashboard/approval', label: 'Approval Queue', icon: ClipboardCheck },
  { path: '/dashboard/uploads', label: 'YouTube Uploads', icon: Upload },
  { path: '/dashboard/logs', label: 'Pipeline Logs', icon: Terminal },
  { path: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState('Overview');
  const { pipelineStats } = useDashboardData();
  const [actionMessage, setActionMessage] = useState('');
  const [isActionPending, setIsActionPending] = useState(false);

  useEffect(() => {
    const item = navItems.find(n => n.path === location.pathname);
    setPageTitle(item ? item.label : 'Overview');
  }, [location.pathname]);

  const quotaPercent = (pipelineStats.uploadsToday / pipelineStats.dailyCap) * 100;

  const runPipelineAction = async () => {
    const action = pipelineStats.pipelineStatus === 'RUNNING' ? 'stop' : 'start';
    setIsActionPending(true);
    try {
      const result = await pipelineAction(action);
      setActionMessage(result.status ?? `${action} requested`);
      window.setTimeout(() => setActionMessage(''), 3000);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : `Pipeline ${action} failed`);
      window.setTimeout(() => setActionMessage(''), 4000);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#050505' }}>
      {/* ─── SIDEBAR ─── */}
      <aside className="fixed left-0 top-0 bottom-0 w-[280px] z-40 flex flex-col"
        style={{ background: '#050505', borderRight: '1px solid #121212' }}>
        {/* Wordmark */}
        <div className="px-6 h-14 flex items-center" style={{ borderBottom: '1px solid #121212' }}>
          <span className="font-mono text-sm tracking-widest font-semibold cursor-pointer"
            style={{ color: '#00F0FF' }} onClick={() => navigate('/')}>
            GHOSTPIPE
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/dashboard'}
                className="flex items-center gap-3 px-6 py-3 font-mono text-xs uppercase tracking-wider transition-all"
                style={({ isActive }) => ({
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  background: isActive ? '#0A0A0C' : 'transparent',
                  borderLeft: isActive ? '2px solid #00F0FF' : '2px solid transparent',
                })}
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom: Quota + Status */}
        <div className="px-6 py-4" style={{ borderTop: '1px solid #121212' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Daily Quota
            </span>
            <span className="font-mono text-xs" style={{ color: '#00F0FF' }}>
              {pipelineStats.uploadsToday}/{pipelineStats.dailyCap}
            </span>
          </div>
          <div className="w-full h-1 mb-4" style={{ background: '#121212' }}>
            <div className="h-full transition-all duration-500" 
              style={{ width: `${quotaPercent}%`, background: '#00F0FF' }} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: '#00FF66' }} />
              <span className="font-mono text-xs uppercase" style={{ color: '#00FF66' }}>Online</span>
            </div>
            <span className="font-mono text-xs px-2 py-0.5" 
              style={{ background: '#121212', color: 'rgba(255,255,255,0.4)' }}>
              OPERATOR
            </span>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT AREA ─── */}
      <div className="flex-1 ml-[280px] min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-8"
          style={{ 
            background: 'rgba(10,10,12,0.85)', 
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid #121212' 
          }}>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold uppercase tracking-[-0.01em]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {pageTitle}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {actionMessage && (
              <span className="font-mono text-xs" style={{ color: '#00F0FF' }}>{actionMessage}</span>
            )}
            <button
              onClick={runPipelineAction}
              disabled={isActionPending}
              className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-all hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                color: pipelineStats.pipelineStatus === 'RUNNING' ? '#FF3366' : '#00FF66',
                border: '1px solid #121212',
              }}
            >
              {pipelineStats.pipelineStatus === 'RUNNING' ? <Square size={12} /> : <Play size={12} />}
              {isActionPending
                ? 'Working...'
                : pipelineStats.pipelineStatus === 'RUNNING'
                  ? 'Stop Pipeline'
                  : 'Start Pipeline'}
            </button>
            <button className="relative p-2 transition-colors hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.5)' }}>
              <Bell size={16} />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: '#00F0FF' }} />
            </button>
            <button onClick={handleLogout} 
              className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-all hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid #121212' }}>
              <LogOut size={12} />
              Logout
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/videos" element={<CreatedVideos />} />
            <Route path="/approval" element={<ApprovalQueue />} />
            <Route path="/uploads" element={<YouTubeUploads />} />
            <Route path="/logs" element={<PipelineLogs />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
