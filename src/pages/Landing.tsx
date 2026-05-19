import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Radar, Film, Brain, Upload, ShieldCheck, Trash2, 
  ChevronRight, Zap, Lock, Play
} from 'lucide-react';
import AsciiCanvas from '../components/AsciiCanvas';
import { pricingTiers, testimonials, pipelineStats } from '../data/store';

/* ─── Icons for feature cards ─── */
const featureIcons = [Radar, Film, Brain, Upload, ShieldCheck, Trash2];

const features = [
  { title: 'TREND SCANNER', desc: 'Monitors trending videos across platforms in real-time. Identifies high-velocity content before it peaks.', },
  { title: 'SHORTS GENERATOR', desc: 'AI-driven editing engine. Cuts, captions, and reformats raw video into vertical Shorts automatically.', },
  { title: 'VIRALITY AI', desc: 'Predicts performance scores before upload. Ranks content by estimated CTR, retention, and share probability.', },
  { title: 'AUTO-UPLOADER', desc: 'Queue-based upload manager. Respects daily quotas, peak hours, and handles YouTube API throttling.', },
  { title: 'QUOTA GUARD', desc: 'Intelligent rate-limiting. Prevents API bans by tracking YouTube upload caps and cooldowns.', },
  { title: 'CLEANUP BOT', desc: 'Post-upload lifecycle management. Archives or securely deletes local files to save disk space.', },
];

const steps = [
  { num: '01', label: 'INGEST', desc: 'Trend signals captured' },
  { num: '02', label: 'RENDER', desc: 'Shorts generated & scored' },
  { num: '03', label: 'REVIEW', desc: 'Operator approval' },
  { num: '04', label: 'DEPLOY', desc: 'Auto-uploaded to YouTube' },
];

/* ─── Mini sparkline canvas component ─── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, color]);
  return <canvas ref={canvasRef} width={120} height={30} className="opacity-70" />;
}

/* ─── Main Landing Page ─── */
export default function Landing() {
  const navigate = useNavigate();
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative min-h-screen" style={{ background: '#050505' }}>
      {/* Global ASCII Background */}
      <div className="fixed inset-0 z-0" style={{ opacity: 0.35 }}>
        <AsciiCanvas />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-14"
        style={{ background: 'rgba(5,5,5,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #121212' }}>
        <div className="font-mono text-sm tracking-wider" style={{ color: '#00F0FF' }}>
          GHOSTPIPE
        </div>
        <div className="hidden md:flex items-center gap-8">
          <button onClick={() => scrollToSection('features')} className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.6)' }}>Features</button>
          <button onClick={() => scrollToSection('workflow')} className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.6)' }}>Workflow</button>
          <button onClick={() => scrollToSection('analytics')} className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.6)' }}>Analytics</button>
          <button onClick={() => scrollToSection('pricing')} className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.6)' }}>Pricing</button>
          <button onClick={() => navigate('/login')} className="font-mono text-xs uppercase tracking-wider px-4 py-1.5 border transition-all hover:border-cyan"
            style={{ color: '#00F0FF', borderColor: 'rgba(0,240,255,0.3)' }}>
            Login
          </button>
        </div>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section ref={heroRef} className="relative z-10 min-h-screen flex items-center pt-14">
        <div className="w-full px-6 md:px-12 lg:px-20 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
            {/* Left: Text */}
            <div className="space-y-8 animate-fade-in">
              <div className="font-mono text-xs tracking-widest uppercase" style={{ color: '#00F0FF' }}>
                // AUTOMATED SHORTS PIPELINE v2.0
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-semibold leading-[1.1] tracking-[-0.02em]"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                TURN TRENDS INTO<br />
                <span style={{ color: '#00F0FF' }}>UPLOAD-READY</span> SHORTS.
              </h1>
              <p className="text-sm md:text-base leading-relaxed max-w-lg" style={{ color: 'rgba(255,255,255,0.6)' }}>
                GhostPipe scans viral content, generates AI-powered Shorts, predicts virality, 
                and uploads to YouTube — fully autonomous. From trend signal to live upload, zero manual work.
              </p>
              <div className="flex flex-wrap gap-4">
                <button onClick={() => navigate('/login')} className="btn-primary flex items-center gap-2">
                  <Zap size={16} />
                  INITIALIZE PIPELINE
                </button>
                <button onClick={() => scrollToSection('workflow')} className="btn-secondary flex items-center gap-2">
                  <Play size={14} />
                  VIEW WORKFLOW
                </button>
              </div>
              <div className="flex gap-8 pt-4">
                <div>
                  <div className="text-2xl font-semibold" style={{ color: '#00F0FF' }}>{pipelineStats.createdShorts}</div>
                  <div className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>Shorts Created</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold" style={{ color: '#00FF66' }}>{pipelineStats.successRate}%</div>
                  <div className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>Success Rate</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{pipelineStats.avgViralityScore}</div>
                  <div className="font-mono text-xs uppercase" style={{ color: 'rgba(255,255,255,0.4)' }}>Avg Virality</div>
                </div>
              </div>
            </div>
            {/* Right: Dashboard Preview */}
            <div className="relative hidden lg:block animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="relative rounded overflow-hidden" style={{ border: '1px solid #121212' }}>
                <img src="/images/dashboard-preview.jpg" alt="GhostPipe Dashboard" className="w-full h-auto opacity-90" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 60%, #050505)' }} />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: '#00FF66' }} />
                    <span className="font-mono text-xs uppercase" style={{ color: '#00FF66' }}>Pipeline Active</span>
                  </div>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>12/50 uploads today</span>
                </div>
              </div>
              {/* Decorative glow */}
              <div className="absolute -inset-4 -z-10 opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, #00F0FF 0%, transparent 70%)' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES GRID (Pipeline Modules) ─── */}
      <section id="features" className="relative z-10 py-20 md:py-28" style={{ background: 'rgba(5,5,5,0.92)' }}>
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="mb-12">
            <div className="font-mono text-xs tracking-widest uppercase mb-4" style={{ color: '#00F0FF' }}>
              // PIPELINE MODULES
            </div>
            <h2 className="text-xl md:text-2xl font-semibold uppercase tracking-[-0.01em]">
              Six Engines. One Autonomous Pipeline.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => {
              const Icon = featureIcons[i];
              return (
                <div key={f.title} className="group p-6 transition-all duration-300 hover:-translate-y-1"
                  style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
                  <Icon size={22} className="mb-4" style={{ color: '#00F0FF' }} />
                  <h3 className="font-mono text-sm font-semibold uppercase tracking-wider mb-3">{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS (Terminal Steps) ─── */}
      <section id="workflow" className="relative z-10 py-20 md:py-28" style={{ background: '#050505' }}>
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="mb-16">
            <div className="font-mono text-xs tracking-widest uppercase mb-4" style={{ color: '#00F0FF' }}>
              // PIPELINE FLOW
            </div>
            <h2 className="text-xl md:text-2xl font-semibold uppercase tracking-[-0.01em]">
              From Signal to Upload in Four Steps
            </h2>
          </div>
          <div className="relative">
            {/* Connecting dashed line */}
            <div className="hidden md:block absolute top-8 left-[12%] right-[12%] h-px" 
              style={{ borderTop: '1px dashed #121212' }}>
              <div className="absolute top-0 left-0 h-full w-4 animate-pulse" style={{ background: '#00F0FF', boxShadow: '0 0 10px #00F0FF' }} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {steps.map((step) => (
                <div key={step.num} className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 mb-6 font-mono text-lg font-bold"
                    style={{ background: '#0A0A0C', border: '1px solid #00F0FF', color: '#00F0FF' }}>
                    {step.num}
                  </div>
                  <h3 className="font-mono text-sm font-semibold uppercase tracking-wider mb-2">{step.label}</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── ANALYTICS SECTION ─── */}
      <section id="analytics" className="relative z-10 py-20 md:py-28" style={{ background: 'rgba(5,5,5,0.92)' }}>
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: '#00FF66' }} />
            <div className="font-mono text-xs tracking-widest uppercase" style={{ color: '#00FF66' }}>
              LIVE
            </div>
            <h2 className="text-xl md:text-2xl font-semibold uppercase tracking-[-0.01em] ml-4">
              Predicted Performance
            </h2>
          </div>
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'AVG SCORE', value: '87.4', color: '#00FF66', sparkline: [70, 75, 72, 80, 85, 82, 87] },
              { label: 'UPLOADS TODAY', value: '12', color: '#00F0FF', sparkline: [5, 8, 6, 10, 9, 11, 12] },
              { label: 'SUCCESS RATE', value: '99.2%', color: '#00FF66', sparkline: [95, 96, 98, 97, 99, 98.5, 99.2] },
              { label: 'PENDING', value: '3', color: '#FFB800', sparkline: [8, 6, 5, 4, 5, 3, 3] },
            ].map((stat) => (
              <div key={stat.label} className="p-5" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
                <div className="font-mono text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {stat.label}
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-semibold" style={{ color: stat.color }}>{stat.value}</div>
                  <Sparkline data={stat.sparkline} color={stat.color} />
                </div>
              </div>
            ))}
          </div>
          {/* Chart area */}
          <div className="p-6" style={{ background: '#0A0A0C', border: '1px solid #121212' }}>
            <div className="flex items-center justify-between mb-6">
              <span className="font-mono text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                7-Day Projected Views
              </span>
              <span className="font-mono text-xs" style={{ color: '#00F0FF' }}>+24% vs last week</span>
            </div>
            <ProjectedViewsChart />
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS + PRICING + CTA ─── */}
      <section id="pricing" className="relative z-10 py-20 md:py-28" style={{ background: '#050505' }}>
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          {/* Testimonials */}
          <div className="mb-20">
            <div className="font-mono text-xs tracking-widest uppercase mb-8" style={{ color: '#00F0FF' }}>
              // OPERATOR FEEDBACK
            </div>
            <div className="max-w-3xl mx-auto text-center">
              <blockquote className="text-lg md:text-xl leading-relaxed mb-6" style={{ color: 'rgba(255,255,255,0.85)' }}>
                "{testimonials[activeTestimonial].quote}"
              </blockquote>
              <cite className="font-mono text-sm not-italic" style={{ color: '#00F0FF' }}>
                — {testimonials[activeTestimonial].author}
              </cite>
              <div className="flex justify-center gap-2 mt-6">
                {testimonials.map((_, i) => (
                  <button key={i} onClick={() => setActiveTestimonial(i)}
                    className="w-2 h-2 transition-all" 
                    style={{ background: i === activeTestimonial ? '#00F0FF' : '#121212' }} />
                ))}
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-20">
            <div className="text-center mb-12">
              <div className="font-mono text-xs tracking-widest uppercase mb-4" style={{ color: '#00F0FF' }}>
                // ACCESS TIERS
              </div>
              <h2 className="text-xl md:text-2xl font-semibold uppercase tracking-[-0.01em]">
                Choose Your Pipeline Capacity
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {pricingTiers.map((tier) => (
                <div key={tier.name} className="relative p-6 transition-all hover:-translate-y-1"
                  style={{ 
                    background: '#0A0A0C', 
                    border: tier.popular ? '1px solid #00F0FF' : '1px solid #121212',
                    boxShadow: tier.popular ? '0 0 30px rgba(0,240,255,0.1)' : 'none'
                  }}>
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 font-mono text-xs uppercase px-3 py-1"
                      style={{ background: '#00F0FF', color: '#050505' }}>
                      Recommended
                    </div>
                  )}
                  <div className="font-mono text-sm font-semibold uppercase tracking-wider mb-2">{tier.name}</div>
                  <div className="text-3xl font-semibold mb-1">${tier.price}<span className="text-sm font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>/mo</span></div>
                  <div className="font-mono text-xs uppercase mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {tier.uploads === -1 ? 'Unlimited' : `${tier.uploads}`} uploads/day · {tier.channels === -1 ? 'Unlimited' : tier.channels} channel{tier.channels !== 1 ? 's' : ''}
                  </div>
                  <ul className="space-y-3 mb-6">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <ChevronRight size={14} style={{ color: '#00F0FF' }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button className="w-full py-3 font-mono text-xs uppercase tracking-wider font-semibold transition-all"
                    style={{ 
                      background: tier.popular ? '#00F0FF' : 'transparent',
                      color: tier.popular ? '#050505' : '#fff',
                      border: tier.popular ? 'none' : '1px solid rgba(255,255,255,0.2)'
                    }}>
                    Select Plan
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center py-16" style={{ border: '1px solid #121212', background: '#0A0A0C' }}>
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              Ready to Automate Your Shorts?
            </h2>
            <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Join operators who upload hundreds of Shorts per week without touching an editing timeline.
            </p>
            <button onClick={() => navigate('/login')} className="btn-primary inline-flex items-center gap-2">
              <Lock size={16} />
              OPEN CONTROL ROOM
            </button>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="relative z-10 py-12" style={{ background: '#050505', borderTop: '1px solid #121212' }}>
        <div className="px-6 md:px-12 lg:px-20 max-w-7xl mx-auto">
          <div className="font-mono text-6xl md:text-8xl font-bold mb-8" style={{ color: '#121212' }}>
            GHOSTPIPE
          </div>
          <div className="flex flex-col md:flex-row justify-between items-start gap-6">
            <div className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              © 2026 GhostPipe Systems. All rights reserved.
            </div>
            <div className="flex gap-6">
              <button className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Privacy</button>
              <button className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Terms</button>
              <button onClick={() => navigate('/login')} className="font-mono text-xs uppercase tracking-wider transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.4)' }}>Dashboard</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Projected Views Chart (Canvas) ─── */
function ProjectedViewsChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const values = [12.4, 18.2, 15.8, 24.1, 32.5, 28.7, 41.3];
    const max = Math.max(...values) * 1.2;

    // Draw grid lines
    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h - 30) * (i / 4) + 10;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
      // Y labels
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px "Source Code Pro", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${(max * (1 - i / 4)).toFixed(0)}K`, 35, y + 3);
    }

    // Draw line
    const xStep = (w - 60) / (values.length - 1);
    const yScale = (h - 40) / max;

    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = 50 + i * xStep;
      const y = h - 20 - v * yScale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(0,240,255,0.15)');
    gradient.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(50, h - 20);
    values.forEach((v, i) => {
      ctx.lineTo(50 + i * xStep, h - 20 - v * yScale);
    });
    ctx.lineTo(50 + (values.length - 1) * xStep, h - 20);
    ctx.closePath();
    ctx.fill();

    // X labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'center';
    days.forEach((d, i) => {
      ctx.fillText(d, 50 + i * xStep, h - 5);
    });
  }, []);

  return <canvas ref={canvasRef} className="w-full h-48" />;
}
