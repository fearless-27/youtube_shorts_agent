import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconLock, IconEye, IconEyeOff, IconGhost,
  IconShieldCheck, IconActivity, IconCpu, IconWifi,
  IconAlertTriangle,
} from '../components/icons/StreamlineIcons';

/* ── HUD decorative tick marks ─────────────────────────── */
function HudTicks({ count = 20 }: { count?: number }) {
  return (
    <div className="absolute inset-x-0 top-0 flex justify-between px-8 pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="opacity-10"
          style={{
            width: 1,
            height: i % 5 === 0 ? 10 : 5,
            background: '#00F0FF',
          }}
        />
      ))}
    </div>
  );
}

/* ── Scanning grid line ─────────────────────────────────── */
function ScanLine() {
  return (
    <motion.div
      className="absolute inset-x-0 h-px pointer-events-none"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(0,240,255,0.4), transparent)' }}
      animate={{ top: ['10%', '90%', '10%'] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
    />
  );
}

/* ── System status indicators ───────────────────────────── */
const statuses = [
  { icon: IconWifi,    label: 'NETWORK', value: 'ONLINE' },
  { icon: IconCpu,     label: 'API',     value: 'READY' },
  { icon: IconActivity,label: 'PIPE',    value: 'IDLE' },
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [bootDone, setBootDone] = useState(false);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [time, setTime] = useState(new Date());

  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

  /* ── Boot sequence ────────────────────────── */
  const sequence = [
    '> GHOSTPIPE OS v3.0.0',
    '> Initializing neural pipeline core...',
    '> Loading content discovery modules...',
    '> YouTube API gateway: READY',
    '> Operator authentication portal: ACTIVE',
    '> ALL SYSTEMS OPERATIONAL',
  ];

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i < sequence.length) {
        setBootLines((p) => [...p, sequence[i]]);
        i++;
      } else {
        clearInterval(t);
        setTimeout(() => setBootDone(true), 500);
      }
    }, 280);
    return () => clearInterval(t);
  }, []);

  /* ── Clock ────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ── Login submit ─────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('CREDENTIALS REQUIRED'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, email: email, password }),
      });
      if (res.ok) {
        navigate('/dashboard');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'ACCESS DENIED — INVALID CREDENTIALS');
      }
    } catch {
      setError('NETWORK FAULT — BACKEND UNREACHABLE');
    } finally {
      setLoading(false);
    }
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
  const dateStr = time.toISOString().slice(0, 10);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,240,255,0.05) 0%, #020617 55%)' }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `
          linear-gradient(rgba(0,240,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,240,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.05) 0%, transparent 70%)', filter: 'blur(60px)' }} />

      <ScanLine />

      {/* ═══ MAIN LOGIN CARD ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="relative w-full max-w-[440px] mx-4"
      >
        {/* Top tick ruler */}
        <HudTicks count={24} />

        {/* Card */}
        <div className="hud-panel mt-3 p-8" style={{ background: 'rgba(2, 6, 23, 0.96)' }}>

          {/* Header row */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ boxShadow: ['0 0 10px rgba(0,240,255,0.3)', '0 0 25px rgba(0,240,255,0.6)', '0 0 10px rgba(0,240,255,0.3)'] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-9 h-9 flex items-center justify-center"
                style={{ border: '1px solid rgba(0,240,255,0.4)', background: 'rgba(0,240,255,0.06)' }}
              >
                <IconGhost size={18} color="#00F0FF" />
              </motion.div>
              <div>
                <div className="font-mono text-[11px] tracking-[0.3em] uppercase" style={{ color: '#00F0FF' }}>
                  GHOSTPIPE
                </div>
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  OPERATOR PORTAL v3.0
                </div>
              </div>
            </div>
            {/* Live clock */}
            <div className="text-right">
              <div className="font-mono text-[13px] font-bold" style={{ color: '#00F0FF' }}>{timeStr}</div>
              <div className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{dateStr}</div>
            </div>
          </div>

          {/* Boot terminal */}
          <AnimatePresence>
            {!bootDone && (
              <motion.div
                initial={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-6 p-4 overflow-hidden"
                style={{ background: 'rgba(0,240,255,0.03)', border: '1px solid rgba(0,240,255,0.08)' }}
              >
                {bootLines.map((line, i) => (
                  <div key={i} className="font-mono text-[10px] leading-5"
                    style={{ color: i === bootLines.length - 1 ? '#00F0FF' : 'rgba(255,255,255,0.45)' }}>
                    {line}
                  </div>
                ))}
                <span className="inline-block w-2 h-3 mt-0.5 animate-hud-blink"
                  style={{ background: '#00F0FF', verticalAlign: 'text-bottom' }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* System status row */}
          {bootDone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3 mb-6"
            >
              {statuses.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex-1 flex items-center gap-1.5 p-2"
                  style={{ background: 'rgba(0,255,102,0.04)', border: '1px solid rgba(0,255,102,0.1)' }}>
                  <Icon size={10} color="#00FF66" />
                  <span className="font-mono text-[8px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {label}
                  </span>
                  <span className="font-mono text-[8px] ml-auto" style={{ color: '#00FF66' }}>{value}</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* HUD divider */}
          <div className="hud-divider mb-6" />
          <div className="font-mono text-[9px] tracking-[0.25em] uppercase mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            AUTH REQUIRED — OPERATOR ACCESS
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Operator ID
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@ghostpipe.local"
                autoComplete="username"
                className="w-full px-4 py-3 font-mono text-sm outline-none transition-all"
                style={{
                  background: 'rgba(0,240,255,0.03)',
                  border: `1px solid ${email ? 'rgba(0,240,255,0.3)' : 'rgba(0,240,255,0.1)'}`,
                  color: '#fff',
                  letterSpacing: '0.05em',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,240,255,0.5)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,240,255,0.08)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = email ? 'rgba(0,240,255,0.3)' : 'rgba(0,240,255,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Access Key
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 font-mono text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(0,240,255,0.03)',
                    border: `1px solid ${password ? 'rgba(0,240,255,0.3)' : 'rgba(0,240,255,0.1)'}`,
                    color: '#fff',
                    letterSpacing: '0.1em',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,240,255,0.5)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,240,255,0.08)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = password ? 'rgba(0,240,255,0.3)' : 'rgba(0,240,255,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors hover:opacity-80 cursor-pointer"
                  style={{ color: 'rgba(0,240,255,0.5)' }}
                >
                  {showPass ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 p-3"
                  style={{ background: 'rgba(255,51,102,0.07)', border: '1px solid rgba(255,51,102,0.25)' }}
                >
                  <IconAlertTriangle size={12} color="#FF3366" />
                  <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: '#FF3366' }}>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.2em] transition-all cursor-pointer disabled:opacity-50"
              style={{
                background: loading ? 'rgba(0,240,255,0.3)' : '#00F0FF',
                color: '#020617',
                clipPath: 'polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)',
              }}
            >
              {loading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                  />
                  AUTHENTICATING...
                </>
              ) : (
                <>
                  <IconLock size={13} />
                  INITIATE ACCESS
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 hud-divider" />
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <IconShieldCheck size={11} color="rgba(0,255,102,0.6)" />
              <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                End-to-end encrypted
              </span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="font-mono text-[9px] uppercase tracking-[0.15em] transition-colors hover:opacity-80 cursor-pointer"
              style={{ color: 'rgba(0,240,255,0.4)' }}
            >
              &lt; Landing
            </button>
          </div>
        </div>

        {/* Bottom tick ruler */}
        <div className="relative mt-0">
          <HudTicks count={24} />
          <div className="h-2.5" />
        </div>
      </motion.div>

      {/* Bottom system ID */}
      <div className="fixed bottom-5 font-mono text-[9px] tracking-[0.2em] uppercase select-none"
        style={{ color: 'rgba(255,255,255,0.12)' }}>
        GHOSTPIPE-SYS / CLUSTER-01 / AUTH-NODE
      </div>
    </div>
  );
}
