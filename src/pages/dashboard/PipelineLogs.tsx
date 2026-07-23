import { useState, useRef, useEffect } from 'react';
import { useDashboard, type LogEntry, parseLogLine } from '../../context/DashboardContext';
import {
  IconTerminal, IconPause, IconPlay, IconTrash, IconDownload,
  IconFilter, IconRefresh,
} from '../../components/icons/StreamlineIcons';

type LevelFilter = 'ALL' | 'INFO' | 'WARN' | 'ERROR';

export default function PipelineLogs() {
  const { pipelineLogs } = useDashboard();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

  // Sync from context when not paused
  useEffect(() => {
    if (!isPaused) {
      setLogs(pipelineLogs);
    }
  }, [pipelineLogs, isPaused]);

  // SSE stream for live updates
  useEffect(() => {
    if (isPaused) return;
    const events = new EventSource(`${apiBase}/api/logs/stream`);
    events.addEventListener('logs', (event) => {
      try {
        const lines = JSON.parse((event as MessageEvent).data) as string[];
        setLogs(lines.map(parseLogLine));
      } catch {
        // keep last good snapshot
      }
    });
    return () => events.close();
  }, [isPaused, apiBase]);

  // Auto-scroll
  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const filteredLogs = levelFilter === 'ALL'
    ? logs
    : logs.filter((l) => l.level === levelFilter);

  const refreshLogs = () => setLogs([...pipelineLogs]);
  const clearLogs = () => setLogs([]);

  const downloadLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghostpipe-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="hud-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconTerminal size={18} color="#00F0FF" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] font-bold text-[#00F0FF]">
            Live Pipeline Stream
          </span>
          <span className="font-mono text-[9px] px-2 py-0.5 bg-[#00F0FF]/10 text-white/50 border border-[#00F0FF]/20">
            {filteredLogs.length} entries
          </span>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Level Filter */}
          <div className="flex items-center gap-1 bg-black/40 p-1 border border-white/10">
            <IconFilter size={10} color="rgba(255,255,255,0.4)" className="ml-1" />
            {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className="font-mono text-[8px] uppercase tracking-wider px-2 py-0.5 transition-colors cursor-pointer"
                style={{
                  background: levelFilter === lvl ? '#00F0FF' : 'transparent',
                  color: levelFilter === lvl ? '#000' : 'rgba(255,255,255,0.5)',
                  fontWeight: levelFilter === lvl ? 'bold' : 'normal',
                }}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="btn-secondary py-1 px-2.5 text-[9px] flex items-center gap-1"
          >
            {isPaused ? <IconPlay size={10} color="#00FF66" /> : <IconPause size={10} color="#FFB800" />}
            {isPaused ? 'Resume Stream' : 'Pause Stream'}
          </button>

          <button onClick={refreshLogs} className="btn-secondary py-1 px-2.5 text-[9px] flex items-center gap-1">
            <IconRefresh size={10} /> Refresh
          </button>

          <button onClick={downloadLogs} className="btn-secondary py-1 px-2.5 text-[9px] flex items-center gap-1">
            <IconDownload size={10} /> Export
          </button>

          <button onClick={clearLogs} className="btn-secondary py-1 px-2.5 text-[9px] flex items-center gap-1 hover:border-red-500 hover:text-red-400">
            <IconTrash size={10} /> Clear
          </button>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="hud-panel relative overflow-hidden bg-black/90 border border-[#00F0FF]/20">
        <div className="flex items-center justify-between px-4 py-2 bg-[#00F0FF]/5 border-b border-[#00F0FF]/10 font-mono text-[9px] text-white/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00FF66] animate-pulse" />
            <span>STREAM STATUS: {isPaused ? 'PAUSED' : 'LIVE AGENT TAIL'}</span>
          </div>
          <span>AUTOSCROLL: {isPaused ? 'OFF' : 'ON'}</span>
        </div>

        <div ref={scrollRef} className="h-[520px] overflow-y-auto p-4 space-y-1 font-mono text-[11px]">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/20 uppercase tracking-widest text-xs">
              No logs matched criteria
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const levelColor = log.level === 'ERROR' ? '#FF3366' : log.level === 'WARN' ? '#FFB800' : '#00F0FF';
              return (
                <div key={index} className="flex items-start gap-3 hover:bg-white/[0.03] py-0.5 px-1 font-mono leading-relaxed">
                  <span className="text-white/30 shrink-0 text-[10px]">{log.timestamp.slice(11, 19)}</span>
                  <span className="font-bold shrink-0 w-12 text-[10px]" style={{ color: levelColor }}>
                    [{log.level}]
                  </span>
                  <span className="text-white/80 break-all">{log.message}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Terminal footer prompt line */}
        <div className="px-4 py-2 bg-black border-t border-white/5 flex items-center gap-2 font-mono text-xs">
          <span className="text-[#00F0FF]">$</span>
          <span className="text-white/40 text-[10px]">ghostpipe-agent --tail -f</span>
          <span className="w-2 h-4 bg-[#00F0FF] animate-hud-blink" />
        </div>
      </div>
    </div>
  );
}
