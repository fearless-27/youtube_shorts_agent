import { useEffect, useState } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { defaultSettings, resetPipelineQueue, saveSettings, useDashboardData } from '../../data/store';

export default function SettingsPage() {
  const dashboard = useDashboardData();
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    setSettings(dashboard.defaultSettings);
  }, [dashboard.defaultSettings]);

  const update = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const updatePeakTime = (index: number, value: string) => {
    update('peakUploadTimes', settings.peakUploadTimes.map((time, i) => i === index ? value : time));
  };

  const handleSave = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleResetQueue = async () => {
    await resetPipelineQueue();
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold uppercase tracking-[-0.01em] mb-1">Settings</h2>
        <p className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Configure pipeline behavior and upload preferences
        </p>
      </div>

      <SettingCard title="Pipeline Mode" description="Control how the pipeline executes uploads.">
        <div className="flex gap-3">
          {(['live', 'semi-live', 'dry-run'] as const).map(mode => (
            <button key={mode} onClick={() => update('mode', mode)}
              className="flex-1 px-4 py-3 font-mono text-xs uppercase tracking-wider transition-all"
              style={{
                background: settings.mode === mode ? '#00F0FF' : '#050505',
                color: settings.mode === mode ? '#050505' : 'rgba(255,255,255,0.5)',
                border: settings.mode === mode ? 'none' : '1px solid #121212',
              }}>
              {mode}
            </button>
          ))}
        </div>
        <p className="font-mono text-xs mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {settings.mode === 'live' && 'Fully autonomous: uploads without operator approval.'}
          {settings.mode === 'semi-live' && 'Requires manual approval before each upload.'}
          {settings.mode === 'dry-run' && 'Simulates the pipeline without actual uploads.'}
        </p>
      </SettingCard>

      <SettingCard title="Daily Upload Quota" description="Maximum number of uploads per day.">
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={settings.maxDailyUploads}
            onChange={e => update('maxDailyUploads', Math.min(200, Math.max(1, parseInt(e.target.value) || 0)))}
            className="w-24 px-3 py-2 font-mono text-sm outline-none focus:border-cyan"
            style={{ background: '#050505', border: '1px solid #121212', color: '#fff' }}
          />
          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>uploads/day</span>
        </div>
      </SettingCard>

      <SettingCard title="Default Upload Privacy" description="Privacy setting for uploaded videos.">
        <select
          value={settings.privacy}
          onChange={e => update('privacy', e.target.value as typeof settings.privacy)}
          className="w-full px-3 py-2 font-mono text-sm outline-none focus:border-cyan cursor-pointer"
          style={{ background: '#050505', border: '1px solid #121212', color: '#fff' }}>
          <option value="Public">Public</option>
          <option value="Unlisted">Unlisted</option>
          <option value="Private">Private</option>
        </select>
      </SettingCard>

      <SettingCard title="Upload Timezone" description="Timezone for scheduling uploads.">
        <select
          value={settings.timezone}
          onChange={e => update('timezone', e.target.value)}
          className="w-full px-3 py-2 font-mono text-sm outline-none focus:border-cyan cursor-pointer"
          style={{ background: '#050505', border: '1px solid #121212', color: '#fff' }}>
          <option value="America/New_York">America/New_York</option>
          <option value="America/Chicago">America/Chicago</option>
          <option value="America/Denver">America/Denver</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="Asia/Kolkata">Asia/Kolkata</option>
          <option value="UTC+0">UTC+0</option>
        </select>
      </SettingCard>

      <SettingCard title="Peak Upload Windows" description="One upload can be scheduled into each configured window.">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {settings.peakUploadTimes.map((time, index) => (
            <input
              key={index}
              type="time"
              value={time}
              onChange={e => updatePeakTime(index, e.target.value)}
              className="px-3 py-2 font-mono text-sm outline-none focus:border-cyan"
              style={{ background: '#050505', border: '1px solid #121212', color: '#fff' }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <select
            value={settings.uploadWindowPosition}
            onChange={e => update('uploadWindowPosition', e.target.value as typeof settings.uploadWindowPosition)}
            className="px-3 py-2 font-mono text-sm outline-none focus:border-cyan cursor-pointer"
            style={{ background: '#050505', border: '1px solid #121212', color: '#fff' }}>
            <option value="before">Before peak time</option>
            <option value="after">After peak time</option>
          </select>
          <input
            type="number"
            min={5}
            max={180}
            value={settings.uploadWindowMinutes}
            onChange={e => update('uploadWindowMinutes', Math.min(180, Math.max(5, parseInt(e.target.value) || 30)))}
            className="w-24 px-3 py-2 font-mono text-sm outline-none focus:border-cyan"
            style={{ background: '#050505', border: '1px solid #121212', color: '#fff' }}
          />
          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            minutes in {settings.timezone}
          </span>
        </div>
        <p className="font-mono text-xs mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {settings.peakUploadTimes.length} windows, up to {settings.maxDailyUploads} uploads/day
        </p>
      </SettingCard>

      <SettingCard title="Auto-Delete Local Files" description="Delete local files after successful YouTube upload.">
        <ToggleSwitch
          enabled={settings.autoDelete}
          onChange={(value) => update('autoDelete', value)}
        />
      </SettingCard>

      <div className="flex items-center gap-4 pt-4">
        <button onClick={handleSave}
          className="flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-wider font-bold transition-all hover:brightness-110"
          style={{ background: '#00F0FF', color: '#050505' }}>
          <Save size={14} />
          Save Settings
        </button>
        {saved && (
          <span className="font-mono text-xs" style={{ color: '#00FF66' }}>
            Settings saved successfully
          </span>
        )}
      </div>

      <div className="mt-8 pt-8" style={{ borderTop: '1px solid #121212' }}>
        <h3 className="font-mono text-sm uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: '#FF3366' }}>
          <AlertTriangle size={14} />
          Danger Zone
        </h3>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Destructive actions that cannot be undone.
        </p>
        {!showResetConfirm ? (
          <button onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all hover:bg-red/20"
            style={{ color: '#FF3366', border: '1px solid #FF3366' }}>
            Reset Queue
          </button>
        ) : (
          <div className="flex items-center gap-3 p-4" style={{ background: 'rgba(255,51,102,0.05)', border: '1px solid rgba(255,51,102,0.3)' }}>
            <span className="font-mono text-xs" style={{ color: '#FF3366' }}>
              Are you sure? This will clear all approval queue data.
            </span>
            <button onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1 font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Cancel
            </button>
            <button onClick={handleResetQueue}
              className="px-3 py-1 font-mono text-xs uppercase"
              style={{ background: '#FF3366', color: '#fff' }}>
              Confirm Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="p-5" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
      <h3 className="font-mono text-sm font-semibold uppercase tracking-wider mb-1">{title}</h3>
      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>{description}</p>
      {children}
    </div>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <button onClick={() => onChange(!enabled)}
      className="relative w-10 h-5 transition-colors"
      style={{ background: enabled ? '#00F0FF' : '#121212' }}>
      <div className="absolute top-0.5 w-4 h-4 transition-all"
        style={{
          left: enabled ? '22px' : '2px',
          background: enabled ? '#fff' : 'rgba(255,255,255,0.3)'
        }} />
    </button>
  );
}
