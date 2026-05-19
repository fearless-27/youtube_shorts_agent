import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, Shield } from 'lucide-react';
import AsciiCanvas from '../components/AsciiCanvas';
import { login } from '../data/store';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('All fields required.');
      return;
    }
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Login failed.');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center" style={{ background: '#050505' }}>
      {/* ASCII Background */}
      <div className="fixed inset-0 z-0" style={{ opacity: 0.3 }}>
        <AsciiCanvas />
      </div>

      {/* Overlay for readability */}
      <div className="fixed inset-0 z-0" style={{ background: 'rgba(5,5,5,0.6)' }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Back link */}
        <button onClick={() => navigate('/')} 
          className="flex items-center gap-2 mb-8 font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          <ArrowLeft size={14} />
          Back to Home
        </button>

        {/* Login Card */}
        <div className="p-8 md:p-10" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
          {/* Security Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 flex items-center justify-center" 
              style={{ border: '1px solid #00F0FF', background: 'rgba(0,240,255,0.05)' }}>
              <Shield size={24} style={{ color: '#00F0FF' }} />
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold uppercase tracking-[-0.01em] mb-2"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Operator Login
            </h1>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Access generated videos, approvals, uploads, quotas, and pipeline logs.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-mono text-xs uppercase tracking-wider mb-2" 
                style={{ color: 'rgba(255,255,255,0.5)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@ghostpipe.io"
                className="w-full px-4 py-3 font-mono text-sm outline-none transition-all focus:border-cyan"
                style={{ 
                  background: '#050505', 
                  border: '1px solid #121212', 
                  color: '#fff',
                }}
              />
            </div>

            <div>
              <label className="block font-mono text-xs uppercase tracking-wider mb-2" 
                style={{ color: 'rgba(255,255,255,0.5)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 font-mono text-sm outline-none transition-all focus:border-cyan"
                  style={{ 
                    background: '#050505', 
                    border: '1px solid #121212', 
                    color: '#fff',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="font-mono text-xs py-2 px-3" style={{ color: '#FF3366', background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.2)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 font-mono text-sm uppercase tracking-wider font-bold flex items-center justify-center gap-2 transition-all hover:brightness-110"
              style={{ background: '#00F0FF', color: '#050505' }}
            >
              <Lock size={14} />
              Enter Dashboard
            </button>
          </form>

          {/* Status Note */}
          <div className="mt-6 flex items-center gap-2 justify-center">
            <Lock size={10} style={{ color: '#FF3366' }} />
            <span className="font-mono text-xs" style={{ color: '#FF3366' }}>
              Authorized operators only
            </span>
          </div>
        </div>

        {/* Wordmark */}
        <div className="text-center mt-8 font-mono text-xs tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.15)' }}>
          GhostPipe Systems
        </div>
      </div>
    </div>
  );
}
