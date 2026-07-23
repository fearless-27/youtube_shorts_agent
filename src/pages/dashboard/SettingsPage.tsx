import { useEffect, useState } from 'react';
import { useDashboard, type PipelineSettings } from '../../context/DashboardContext';
import { saveSettings } from '../../data/store';
import {
  IconSettings, IconSave, IconShield, IconClock, IconSlidersH,
} from '../../components/icons/StreamlineIcons';

export default function SettingsPage() {
  const { defaultSettings, refresh } = useDashboard();
  const [form, setForm] = useState<PipelineSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    setForm(defaultSettings);
  }, [defaultSettings]);

  const handleChange = <K extends keyof PipelineSettings>(field: K, value: PipelineSettings[K]) => {
    setForm((prev: PipelineSettings) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const ok = await saveSettings(form);
      if (ok) {
        setMsg({ text: 'Settings updated successfully ✓', type: 'ok' });
        refresh();
      } else {
        setMsg({ text: 'Failed to update settings', type: 'err' });
      }
    } catch {
      setMsg({ text: 'Error communicating with backend', type: 'err' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconSettings size={20} color="#00F0FF" />
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[0.2em] font-bold text-[#00F0FF]">
              Agent Operating Parameters
            </h2>
            <div className="font-mono text-[9px] text-white/40">
              Configure GhostPipe autonomous pipeline controls & quotas
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary py-2 px-5 text-xs font-bold flex items-center gap-2"
        >
          <IconSave size={14} />
          {saving ? 'SAVING...' : 'SAVE CONFIG'}
        </button>
      </div>

      {msg && (
        <div className={`p-3 font-mono text-xs border ${msg.type === 'ok' ? 'bg-[#00FF66]/10 border-[#00FF66]/30 text-[#00FF66]' : 'bg-[#FF3366]/10 border-[#FF3366]/30 text-[#FF3366]'}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 font-mono text-xs">
        {/* Pipeline Execution Mode */}
        <div className="hud-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <IconSlidersH size={16} color="#00F0FF" />
            <h3 className="font-bold text-white uppercase tracking-wider">Execution Mode & Automation</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: 'live', name: 'LIVE MODE', desc: 'Full automated discovery, edit & upload pipeline' },
              { id: 'semi-live', name: 'SEMI-LIVE', desc: 'Generates clips; requires operator approval before upload' },
              { id: 'dry-run', name: 'DRY RUN', desc: 'Simulates actions without publishing to YouTube' },
            ].map((mode) => (
              <label
                key={mode.id}
                onClick={() => handleChange('mode', mode.id as PipelineSettings['mode'])}
                className={`p-4 border cursor-pointer transition-all ${
                  form.mode === mode.id
                    ? 'bg-[#00F0FF]/10 border-[#00F0FF] text-[#00F0FF]'
                    : 'bg-black/40 border-white/10 text-white/50 hover:border-white/20'
                }`}
              >
                <div className="font-bold uppercase mb-1">{mode.name}</div>
                <div className="text-[10px] text-white/40 leading-relaxed">{mode.desc}</div>
              </label>
            ))}
          </div>

          <div className="pt-2">
            <label className="block text-white/50 mb-1 text-[10px] uppercase">Active Pipeline</label>
            <select
              value={form.activePipeline}
              onChange={(e) => handleChange('activePipeline', e.target.value)}
              className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white focus:border-[#00F0FF] outline-none font-mono"
            >
              <option value="telegram_tamil_shorts_pipeline.py">Telegram Tamil Shorts (telegram_tamil_shorts_pipeline.py)</option>
              <option value="ghostpipe_v5_1_pipeline.py">GhostPipe v5.1 Autonomous (ghostpipe_v5_1_pipeline.py)</option>
              <option value="ghostpipe_v5_core.py">GhostPipe v5 Core (ghostpipe_v5_core.py)</option>
            </select>
          </div>
        </div>

        {/* Quotas & Scheduling */}
        <div className="hud-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <IconClock size={16} color="#00F0FF" />
            <h3 className="font-bold text-white uppercase tracking-wider">Upload Quotas & Timing</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white/50 mb-1 text-[10px] uppercase">Daily Upload Cap</label>
              <input
                type="number"
                value={form.maxDailyUploads ?? 50}
                onChange={(e) => handleChange('maxDailyUploads', parseInt(e.target.value) || 0)}
                className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white focus:border-[#00F0FF] outline-none"
              />
            </div>

            <div>
              <label className="block text-white/50 mb-1 text-[10px] uppercase">Upload Window (Minutes)</label>
              <input
                type="number"
                value={form.uploadWindowMinutes ?? 30}
                onChange={(e) => handleChange('uploadWindowMinutes', parseInt(e.target.value) || 0)}
                className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white focus:border-[#00F0FF] outline-none"
              />
            </div>

            <div>
              <label className="block text-white/50 mb-1 text-[10px] uppercase">Timezone</label>
              <input
                type="text"
                value={form.timezone || 'America/New_York'}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white focus:border-[#00F0FF] outline-none"
              />
            </div>

            <div>
              <label className="block text-white/50 mb-1 text-[10px] uppercase">Telegram Channels</label>
              <input
                type="text"
                value={form.telegramChannels || ''}
                onChange={(e) => handleChange('telegramChannels', e.target.value)}
                className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white focus:border-[#00F0FF] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Safety & Defaults */}
        <div className="hud-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <IconShield size={16} color="#00F0FF" />
            <h3 className="font-bold text-white uppercase tracking-wider">Default Content Parameters</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white/50 mb-1 text-[10px] uppercase">Default YouTube Privacy Status</label>
              <select
                value={form.privacy || 'Unlisted'}
                onChange={(e) => handleChange('privacy', e.target.value as PipelineSettings['privacy'])}
                className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white focus:border-[#00F0FF] outline-none"
              >
                <option value="Public">PUBLIC (Publish immediately)</option>
                <option value="Unlisted">UNLISTED (Review first on YouTube)</option>
                <option value="Private">PRIVATE (Drafts only)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div>
                <div className="text-white font-bold">Auto-Delete Local Files After Upload</div>
                <div className="text-[10px] text-white/40">Clean up disk space after successful delivery</div>
              </div>
              <input
                type="checkbox"
                checked={form.autoDelete ?? true}
                onChange={(e) => handleChange('autoDelete', e.target.checked)}
                className="accent-[#00F0FF] w-4 h-4 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
