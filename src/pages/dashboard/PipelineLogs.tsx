import { useState, useRef, useEffect } from 'react';
import { RefreshCw, Pause, Play, Trash2, Download } from 'lucide-react';
import { useDashboardData } from '../../data/store';

export default function PipelineLogs() {
  const { pipelineLogs } = useDashboardData(5000);
  const [logs, setLogs] = useState(pipelineLogs);
  const [isPaused, setIsPaused] = useState(false);
  const autoScroll = true;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPaused) {
      setLogs(pipelineLogs);
    }
  }, [pipelineLogs, isPaused]);

  useEffect(() => {
    if (isPaused) return;
    const events = new EventSource('/api/logs/stream');
    events.addEventListener('logs', (event) => {
      try {
        const lines = JSON.parse((event as MessageEvent).data) as string[];
        setLogs(lines.map(parseLogLine));
      } catch {
        // Keep the last good log snapshot.
      }
    });
    return () => events.close();
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const refreshLogs = () => {
    setLogs([...pipelineLogs]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghostpipe-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO': return '#00F0FF';
      case 'WARN': return '#FFB800';
      case 'ERROR': return '#FF3366';
      default: return 'rgba(255,255,255,0.4)';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold uppercase tracking-[-0.01em]">Pipeline Logs</h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: '#00FF66' }} />
            <span className="font-mono text-xs" style={{ color: '#00FF66' }}>LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshLogs}
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid #121212' }}>
            <RefreshCw size={12} />
            Refresh
          </button>
          <button onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-white/5"
            style={{ color: isPaused ? '#FFB800' : 'rgba(255,255,255,0.5)', border: '1px solid #121212' }}>
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={clearLogs}
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid #121212' }}>
            <Trash2 size={12} />
            Clear
          </button>
          <button onClick={exportLogs}
            className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-white/5"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid #121212' }}>
            <Download size={12} />
            Export
          </button>
        </div>
      </div>

      {/* Terminal Log Display */}
      <div className="relative" style={{ background: '#050505', border: '1px solid #121212' }}>
        {/* Terminal header bar */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ background: '#0A0A0C', borderBottom: '1px solid #121212' }}>
          <div className="w-3 h-3 rounded-full" style={{ background: '#FF3366' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#FFB800' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#00FF66' }} />
          <span className="ml-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            ghostpipe-pipeline.log
          </span>
        </div>

        {/* Log lines */}
        <div ref={scrollRef} className="p-4 overflow-y-auto font-mono text-xs leading-relaxed max-h-[60vh]">
          {logs.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.2)' }}>
              — No logs —
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 py-0.5">
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                  [{formatLogTime(log.timestamp)}]
                </span>
                <span className="shrink-0" style={{ color: getLevelColor(log.level) }}>
                  [{log.level}]
                </span>
                <span style={{ color: log.level === 'ERROR' ? '#FF3366' : log.level === 'WARN' ? '#FFB800' : 'rgba(255,255,255,0.65)' }}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          {/* Blinking cursor */}
          <div className="flex items-center gap-2 mt-1">
            <span style={{ color: '#00F0FF' }}>$</span>
            <span className="w-2 h-4 inline-block" style={{ background: '#00F0FF', animation: 'pulse-dot 1s step-end infinite' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function parseLogLine(line: string) {
  const parts = line.split('|').map((part) => part.trim());
  const rawLevel = (parts[1] || 'INFO').toUpperCase();
  return {
    timestamp: parts[0] || new Date().toISOString(),
    level: rawLevel.includes('ERROR') ? 'ERROR' as const : rawLevel.includes('WARN') ? 'WARN' as const : 'INFO' as const,
    message: parts.slice(3).join(' | ') || parts.slice(1).join(' | ') || line,
  };
}

function formatLogTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 19);
  }
  return parsed.toISOString().replace('T', ' ').slice(0, 19);
}
