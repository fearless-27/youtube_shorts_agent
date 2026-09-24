import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutDashboard,
  Film,
  UploadCloud,
  Terminal,
  Settings,
  Sparkles,
  Play,
  Square,
  RefreshCw,
  X,
  ExternalLink,
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { pipelineAction } from '../../data/store';

interface CommandMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandMenu: React.FC<CommandMenuProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { videos, pipelineStats, refresh } = useDashboard();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRunning = pipelineStats.pipelineStatus === 'RUNNING';

  // Define command items
  const navActions = [
    {
      id: 'nav-overview',
      title: 'Go to Overview',
      subtitle: 'System metrics, pipeline stages & 7d cadence',
      category: 'Navigation',
      icon: LayoutDashboard,
      perform: () => navigate('/dashboard'),
    },
    {
      id: 'nav-editor',
      title: 'Go to AI Smart Editor',
      subtitle: 'OpenShorts AI: Upload footage / link, detect viral moments & render 9:16 Shorts',
      category: 'Navigation',
      icon: Sparkles,
      perform: () => navigate('/dashboard/editor'),
    },
    {
      id: 'nav-content',
      title: 'Go to Content Studio',
      subtitle: 'Review & approve AI generated vertical Shorts',
      category: 'Navigation',
      icon: Film,
      perform: () => navigate('/dashboard/content'),
    },
    {
      id: 'nav-uploads',
      title: 'Go to Upload Center',
      subtitle: 'YouTube quota donut & distribution schedule',
      category: 'Navigation',
      icon: UploadCloud,
      perform: () => navigate('/dashboard/uploads'),
    },
    {
      id: 'nav-command',
      title: 'Go to Command Center',
      subtitle: 'Low-level daemon, audio intelligence & SSE live terminal',
      category: 'Navigation',
      icon: Terminal,
      perform: () => navigate('/dashboard/command'),
    },
    {
      id: 'nav-settings',
      title: 'Go to Settings',
      subtitle: 'Operating mode, daily quota caps & storage cleanup',
      category: 'Navigation',
      icon: Settings,
      perform: () => navigate('/dashboard/settings'),
    },
  ];

  const pipelineActions = [
    {
      id: 'cmd-start',
      title: isRunning ? 'Restart Continuous Pipeline' : 'Start Continuous Pipeline',
      subtitle: 'Launch background Telegram crawl, speech AI & upload loop',
      category: 'Pipeline Controls',
      icon: Play,
      perform: async () => {
        await pipelineAction('start');
        refresh();
      },
    },
    {
      id: 'cmd-stop',
      title: 'Stop Pipeline Process',
      subtitle: 'Send SIGINT to terminate ongoing daemon execution',
      category: 'Pipeline Controls',
      icon: Square,
      perform: async () => {
        await pipelineAction('stop');
        refresh();
      },
    },
    {
      id: 'cmd-refresh',
      title: 'Force Telemetry Refresh',
      subtitle: 'Pull latest database stats, queue items & upload logs',
      category: 'Pipeline Controls',
      icon: RefreshCw,
      perform: () => refresh(),
    },
  ];

  // Video search results
  const videoMatches = query.trim()
    ? videos
        .filter(
          (v) =>
            v.title.toLowerCase().includes(query.toLowerCase()) ||
            v.id.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 5)
        .map((v) => ({
          id: `video-${v.id}`,
          title: v.title,
          subtitle: `Status: ${v.status} • Virality: ${v.viralityScore || 'N/A'}/10`,
          category: 'Video Clips',
          icon: Film,
          perform: () => {
            navigate('/dashboard/content');
          },
        }))
    : [];

  const allFiltered = [...navActions, ...pipelineActions, ...videoMatches].filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation inside menu
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allFiltered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allFiltered.length) % Math.max(1, allFiltered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = allFiltered[selectedIndex];
      if (selected) {
        selected.perform();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/75 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-xl rounded-2xl bg-[#121424] border border-purple-500/35 shadow-2xl overflow-hidden glow-aura"
          >
            {/* Search Bar Header */}
            <div className="relative flex items-center px-4 py-3.5 border-b border-white/10 bg-[#16182B]">
              <Search className="w-5 h-5 text-purple-400 shrink-0 mr-3" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search pages, trigger pipeline, or find videos..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-slate-400 uppercase">
                ESC
              </div>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-1">
              {allFiltered.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No matching commands or videos found.
                </div>
              ) : (
                allFiltered.map((item, index) => {
                  const Icon = item.icon;
                  const isSelected = selectedIndex === index;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        item.perform();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                          : 'hover:bg-white/[0.03] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-white/20 border-white/30 text-white'
                              : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-semibold truncate leading-tight">
                            {item.title}
                          </div>
                          <div
                            className={`text-[11px] truncate leading-tight mt-0.5 ${
                              isSelected ? 'text-purple-200' : 'text-slate-500'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            isSelected
                              ? 'bg-white/20 text-white border-white/20'
                              : 'bg-white/[0.04] text-slate-400 border-white/5 font-mono'
                          }`}
                        >
                          {item.category}
                        </span>
                        {isSelected && (
                          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Keyboard Helper Footer */}
            <div className="px-4 py-2.5 bg-[#0D0F1C] border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <div className="flex items-center gap-3">
                <span>
                  <strong className="text-white">↑↓</strong> to navigate
                </span>
                <span>
                  <strong className="text-white">↵</strong> to select
                </span>
              </div>
              <span className="text-purple-300">NEMO Operator Suite</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CommandMenu;
