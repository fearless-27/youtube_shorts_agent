import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Brain, Clock3, Film,
  Lock, Play, Radar, ShieldCheck, Sparkles,
  TrendingUp, Upload, Users, Zap, Star,
  Check, ExternalLink, Menu, X,
} from 'lucide-react';
import { pipelineStats, pricingTiers, testimonials } from '../data/store';
import ParticleField from '../components/animations/ParticleField';
import AnimatedText from '../components/animations/AnimatedText';
import MagneticButton from '../components/animations/MagneticButton';
import GradientBlob from '../components/animations/GradientBlob';
import ScrollReveal, { ScrollRevealItem } from '../components/animations/ScrollReveal';
import AnimatedCounter from '../components/animations/AnimatedCounter';
import SpotlightCard from '../components/animations/SpotlightCard';
import GlowingBorder from '../components/animations/GlowingBorder';

/* ─────────── Data ─────────── */

const navigation = [
  { id: 'story', label: 'Story' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'studio', label: 'Studio' },
  { id: 'pricing', label: 'Pricing' },
];

const workflowSteps = [
  { num: '01', title: 'Signal Intake', copy: 'Watches source channels, trend feeds, and uploads to identify what deserves a Short.', icon: Radar, color: '#00F0FF' },
  { num: '02', title: 'Shorts Assembly', copy: 'Cuts, reframes, captions, and formats the video into a vertical asset.', icon: Film, color: '#A855F7' },
  { num: '03', title: 'Virality Scoring', copy: 'Each candidate receives a prediction score so you can prioritize winners.', icon: Brain, color: '#EC4899' },
  { num: '04', title: 'Upload & Cleanup', copy: 'Approved videos upload on schedule, get logged, and cleaned up automatically.', icon: Upload, color: '#10B981' },
];

const studioHighlights = [
  { title: 'Editorial Control Room', copy: 'Manage queue state, approvals, quotas, and pipeline logs from one dashboard.', icon: ShieldCheck },
  { title: 'Smart Scheduling', copy: 'Uploads respect peak times, daily caps, and the mode you choose.', icon: Clock3 },
  { title: 'Growth Reporting', copy: 'Track created shorts, upload success, and top performing topics.', icon: TrendingUp },
  { title: 'Operator Messaging', copy: 'Clear start, stop, and review actions without burying you in noise.', icon: Users },
];

const heroMetrics = [
  { label: 'Shorts Created', value: pipelineStats.createdShorts || 2847, suffix: '+' },
  { label: 'Success Rate', value: pipelineStats.successRate || 94.2, suffix: '%', decimals: 1 },
  { label: 'Avg Virality', value: pipelineStats.avgViralityScore || 8.7, suffix: '/10', decimals: 1 },
];

const trustedLogos = ['Meta', 'YouTube', 'TikTok', 'Spotify', 'Netflix', 'Discord', 'Twitch', 'Adobe'];

/* ─────────── Landing Page ─────────── */

export default function Landing() {
  const navigate = useNavigate();
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-rotate testimonials
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030303] text-white">
      {/* ═══════ NAVBAR ═══════ */}
      <motion.nav
        className="fixed left-0 right-0 top-0 z-50 transition-all duration-500"
        style={{
          background: scrollY > 50 ? 'rgba(3,3,3,0.85)' : 'transparent',
          backdropFilter: scrollY > 50 ? 'blur(20px)' : 'none',
          borderBottom: scrollY > 50 ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-10">
          <button onClick={() => scrollToSection('top')} className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[0.2em] text-gradient-cyan">GHOSTPIPE</span>
          </button>

          <div className="hidden items-center gap-8 md:flex">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 transition-all hover:text-white hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]"
              >
                {item.label}
              </button>
            ))}
            <MagneticButton
              onClick={() => navigate('/dashboard')}
              className="btn-primary font-mono text-[11px] uppercase tracking-[0.2em] px-5 py-2.5"
            >
              <span className="flex items-center gap-2">
                <Zap size={12} /> Dashboard
              </span>
            </MagneticButton>
          </div>

          {/* Mobile menu toggle */}
          <button className="md:hidden text-white/70" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-strong md:hidden overflow-hidden"
            >
              <div className="flex flex-col gap-2 p-6">
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    className="font-mono text-xs uppercase tracking-widest text-white/60 py-3 text-left hover:text-cyan transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
                <button onClick={() => navigate('/dashboard')} className="btn-primary mt-2 text-center font-mono text-xs uppercase tracking-wider">
                  Dashboard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ═══════ HERO SECTION ═══════ */}
      <section id="top" className="relative min-h-screen flex items-center">
        {/* Animated background layers */}
        <div className="absolute inset-0">
          <ParticleField particleCount={100} speed={0.2} />
          <GradientBlob />
          {/* Radial hero glow */}
          <div
            className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px]"
            style={{
              background: 'radial-gradient(ellipse, rgba(0,240,255,0.06) 0%, transparent 60%)',
              filter: 'blur(40px)',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6 pt-28 pb-16 md:px-10 md:pt-32 lg:pt-36">
          <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Left: Text content */}
            <div className="space-y-8">
              {/* Badge */}
              <ScrollReveal delay={0.1}>
                <motion.div
                  className="glass-card-premium inline-flex items-center gap-2.5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em]"
                  animate={{ boxShadow: ['0 0 20px rgba(0,240,255,0.05)', '0 0 40px rgba(0,240,255,0.12)', '0 0 20px rgba(0,240,255,0.05)'] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Sparkles size={12} className="text-cyan" />
                  <span className="text-cyan">AI Shorts Production System</span>
                </motion.div>
              </ScrollReveal>

              {/* Headline */}
              <div className="space-y-5">
                <ScrollReveal delay={0.2}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-white/40">
                    Turn trend signals into publish-ready Shorts
                  </p>
                </ScrollReveal>

                <h1 className="max-w-4xl text-4xl font-bold leading-[1.05] tracking-[-0.04em] md:text-5xl lg:text-6xl xl:text-[4.2rem] font-display">
                  <AnimatedText
                    text="GhostPipe helps teams"
                    variant="words"
                    delay={0.3}
                    stagger={0.06}
                  />{' '}
                  <AnimatedText
                    text="create, review, and upload"
                    variant="gradient"
                    delay={0.8}
                  />{' '}
                  <AnimatedText
                    text="YouTube Shorts automatically."
                    variant="words"
                    delay={1.2}
                    stagger={0.06}
                  />
                </h1>
              </div>

              {/* Description */}
              <ScrollReveal delay={0.5}>
                <p className="max-w-xl text-sm leading-7 md:text-[15px] text-white/55">
                  Built for creators, editors, and growth teams. Collect signals, assemble vertical videos,
                  score performance, and push approved content live — on your schedule.
                </p>
              </ScrollReveal>

              {/* CTAs */}
              <ScrollReveal delay={0.6} className="flex flex-wrap gap-4">
                <MagneticButton
                  onClick={() => navigate('/dashboard')}
                  className="btn-glow inline-flex items-center gap-2.5 rounded-sm"
                >
                  <Zap size={16} />
                  Open Control Room
                </MagneticButton>
                <MagneticButton
                  onClick={() => scrollToSection('workflow')}
                  className="btn-secondary inline-flex items-center gap-2.5 rounded-sm"
                >
                  <Play size={14} />
                  See the Workflow
                </MagneticButton>
              </ScrollReveal>

              {/* Metrics */}
              <ScrollReveal delay={0.7} staggerChildren={0.1} className="grid max-w-lg grid-cols-3 gap-3 pt-2">
                {heroMetrics.map((m) => (
                  <ScrollRevealItem key={m.label}>
                    <GlowingBorder rounded="rounded-none" animated={false} borderWidth={1}>
                      <div className="p-4">
                        <div className="font-mono text-[9px] tracking-[0.25em] uppercase mb-2 text-white/35">
                          {m.label}
                        </div>
                        <div className="text-2xl font-bold text-gradient-cyan">
                          <AnimatedCounter end={m.value} suffix={m.suffix} decimals={m.decimals || 0} duration={2.5} />
                        </div>
                      </div>
                    </GlowingBorder>
                  </ScrollRevealItem>
                ))}
              </ScrollReveal>
            </div>

            {/* Right: Floating UI cards */}
            <div className="relative hidden lg:block">
              <ScrollReveal delay={0.4} direction="right">
                {/* Main floating card */}
                <motion.div
                  className="glass-card-premium p-6 relative overflow-hidden"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-[10px] tracking-widest uppercase text-white/40">Pipeline Status</span>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                      <span className="font-mono text-[11px] uppercase text-emerald-400">Online</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {[
                      { label: 'Queue processed', value: 92 },
                      { label: 'Review approved', value: 87 },
                      { label: 'Upload success', value: 95 },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="text-white/45">{row.label}</span>
                          <span className="text-cyan font-mono"><AnimatedCounter end={row.value} suffix="%" duration={2} /></span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #00F0FF, #A855F7)' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${row.value}%` }}
                            transition={{ duration: 2, delay: 1, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Shimmer overlay */}
                  <div className="absolute inset-0 shimmer pointer-events-none" />
                </motion.div>

                {/* Floating mini card 1 */}
                <motion.div
                  className="absolute -top-6 -right-4 glass-card p-4 w-[200px]"
                  animate={{ y: [0, -12, 0], rotate: [0, 1, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={14} className="text-emerald-400" />
                    <span className="font-mono text-[10px] uppercase text-white/50">Growth</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-400">+247%</div>
                  <div className="text-[10px] text-white/30 mt-1">vs last month</div>
                </motion.div>

                {/* Floating mini card 2 */}
                <motion.div
                  className="absolute -bottom-4 -left-8 glass-card p-4 w-[180px]"
                  animate={{ y: [0, 10, 0], rotate: [0, -1, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Film size={14} className="text-purple-400" />
                    <span className="font-mono text-[10px] uppercase text-white/50">Today</span>
                  </div>
                  <div className="text-xl font-bold text-purple-400">12 Shorts</div>
                  <div className="text-[10px] text-white/30 mt-1">created & uploaded</div>
                </motion.div>
              </ScrollReveal>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ opacity: [0.3, 0.7, 0.3], y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-6 h-10 border border-white/20 rounded-full flex justify-center pt-2">
            <motion.div
              className="w-1 h-2 bg-cyan rounded-full"
              animate={{ y: [0, 12, 0], opacity: [1, 0, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </section>

      {/* ═══════ TRUSTED BY ═══════ */}
      <section className="relative border-t border-white/5 py-12 overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <ScrollReveal>
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.4em] text-white/25 mb-8">
              Trusted by creators worldwide
            </p>
          </ScrollReveal>
          <div className="relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#030303] to-transparent z-10" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#030303] to-transparent z-10" />
            <motion.div
              className="flex gap-16 items-center"
              animate={{ x: [0, -800] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            >
              {[...trustedLogos, ...trustedLogos].map((name, i) => (
                <span key={`${name}-${i}`} className="font-mono text-sm tracking-[0.15em] uppercase text-white/15 whitespace-nowrap font-bold">
                  {name}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══════ STORY SECTION ═══════ */}
      <section id="story" className="relative border-t border-white/5">
        <GradientBlob />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 md:px-10 lg:py-32">
          <div className="grid gap-16 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-8">
              <ScrollReveal>
                <div className="font-mono text-xs tracking-[0.3em] uppercase mb-4 text-cyan">02 / Product Story</div>
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] leading-tight mb-5 font-display">
                  A cleaner way to run a <span className="text-gradient">Shorts operation</span>
                </h2>
                <p className="text-sm md:text-[15px] leading-relaxed text-white/50 max-w-lg">
                  Instead of juggling tabs, timelines, and manual uploads, GhostPipe centralizes the content workflow into a single operator experience.
                </p>
              </ScrollReveal>

              <ScrollReveal delay={0.2} staggerChildren={0.1}>
                <div className="glass-card p-6 space-y-4">
                  {[
                    'Trend signals captured before content becomes saturated.',
                    'Each clip scored so your team focuses on the strongest candidates.',
                    'Approvals, upload caps, and cleanup in the same control panel.',
                    'Dashboard stays readable even when the pipeline is busy.',
                  ].map((item) => (
                    <ScrollRevealItem key={item} direction="left">
                      <div className="flex items-start gap-3 text-sm leading-6 text-white/65 group">
                        <div className="mt-1 shrink-0 h-5 w-5 rounded-full bg-cyan/10 flex items-center justify-center group-hover:bg-cyan/20 transition-colors">
                          <Check size={10} className="text-cyan" />
                        </div>
                        <span className="group-hover:text-white/80 transition-colors">{item}</span>
                      </div>
                    </ScrollRevealItem>
                  ))}
                </div>
              </ScrollReveal>
            </div>

            {/* Right: Feature cards grid */}
            <ScrollReveal delay={0.3} staggerChildren={0.12} className="grid gap-4 md:grid-cols-2 content-start">
              {[
                { icon: ShieldCheck, title: 'Safe by default', copy: 'Approval gates and quotas keep publishing controlled.', color: '#00F0FF' },
                { icon: Brain, title: 'AI-assisted scoring', copy: 'Forecasts help prioritize the most promising clips.', color: '#A855F7' },
                { icon: Upload, title: 'Automated delivery', copy: 'Approved videos move to upload without extra steps.', color: '#EC4899' },
                { icon: Radar, title: 'Signal detection', copy: 'Trend signals ingested from multiple source channels.', color: '#10B981' },
              ].map((card) => (
                <ScrollRevealItem key={card.title} direction="scale">
                  <SpotlightCard
                    className="glass-card p-6 h-full"
                    spotlightColor={`${card.color}12`}
                  >
                    <card.icon size={20} className="mb-4" style={{ color: card.color }} />
                    <h3 className="text-base font-semibold mb-2">{card.title}</h3>
                    <p className="text-xs leading-6 text-white/50">{card.copy}</p>
                  </SpotlightCard>
                </ScrollRevealItem>
              ))}
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ═══════ WORKFLOW SECTION ═══════ */}
      <section id="workflow" className="relative border-t border-white/5">
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 md:px-10 lg:py-32">
          <ScrollReveal className="text-center max-w-3xl mx-auto mb-16">
            <div className="font-mono text-xs tracking-[0.3em] uppercase mb-4 text-cyan">03 / Workflow</div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] leading-tight mb-5 font-display">
              From source clip to uploaded Short in{' '}
              <span className="text-gradient">four stages</span>
            </h2>
            <p className="text-sm md:text-[15px] leading-relaxed text-white/50">
              Ingest the source, assemble the edit, review the result, then ship it on your schedule.
            </p>
          </ScrollReveal>

          {/* Workflow steps with animated connector */}
          <div className="relative">
            {/* Animated connecting line */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent hidden lg:block" />

            <ScrollReveal staggerChildren={0.15} className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <ScrollRevealItem key={step.num} direction="up">
                    <SpotlightCard
                      className="glass-card-premium p-6 h-full relative group"
                      spotlightColor={`${step.color}10`}
                    >
                      {/* Step number with glow */}
                      <div className="flex items-center justify-between mb-6">
                        <motion.div
                          className="font-mono text-[10px] tracking-[0.25em] uppercase font-bold"
                          style={{ color: step.color }}
                          whileHover={{ scale: 1.1 }}
                        >
                          {step.num}
                        </motion.div>
                        <motion.div
                          className="h-10 w-10 rounded-lg flex items-center justify-center"
                          style={{ background: `${step.color}15`, border: `1px solid ${step.color}25` }}
                          whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                          <Icon size={18} style={{ color: step.color }} />
                        </motion.div>
                      </div>

                      <h3 className="mb-3 text-lg font-bold group-hover:text-white transition-colors">{step.title}</h3>
                      <p className="text-sm leading-6 text-white/50 group-hover:text-white/65 transition-colors">
                        {step.copy}
                      </p>

                      {/* Bottom accent line */}
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b"
                        style={{ background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }}
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                      />
                    </SpotlightCard>
                  </ScrollRevealItem>
                );
              })}
            </ScrollReveal>
          </div>

          {/* Workflow metrics */}
          <ScrollReveal delay={0.4} className="grid gap-4 sm:grid-cols-3 mt-10 max-w-2xl mx-auto">
            {[
              { label: 'Uploads today', value: pipelineStats.uploadsToday || 12 },
              { label: 'Daily cap', value: pipelineStats.dailyCap || 50 },
              { label: 'Pending review', value: pipelineStats.pendingApproval || 7 },
            ].map((m) => (
              <div key={m.label} className="glass-card p-4 text-center">
                <div className="font-mono text-[9px] tracking-[0.25em] uppercase mb-2 text-white/35">{m.label}</div>
                <div className="text-2xl font-bold text-gradient-cyan">
                  <AnimatedCounter end={m.value} duration={2} />
                </div>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════ STUDIO SECTION ═══════ */}
      <section id="studio" className="relative border-t border-white/5">
        <GradientBlob />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 md:px-10 lg:py-32">
          <ScrollReveal className="max-w-3xl mb-14">
            <div className="font-mono text-xs tracking-[0.3em] uppercase mb-4 text-cyan">04 / Studio</div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] leading-tight mb-5 font-display">
              Everything the dashboard needs to feel{' '}
              <span className="text-gradient">alive</span>
            </h2>
            <p className="text-sm md:text-[15px] leading-relaxed text-white/50 max-w-2xl">
              Professional production tool with clear controls, live analytics, and approval states.
            </p>
          </ScrollReveal>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Feature cards */}
            <ScrollReveal staggerChildren={0.1} className="grid gap-4 md:grid-cols-2">
              {studioHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <ScrollRevealItem key={item.title} direction="scale">
                    <SpotlightCard className="glass-card p-5 h-full group">
                      <motion.div
                        className="h-10 w-10 rounded-lg flex items-center justify-center mb-4"
                        style={{ background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.15)' }}
                        whileHover={{ scale: 1.1, rotate: -5 }}
                      >
                        <Icon size={18} className="text-cyan" />
                      </motion.div>
                      <h3 className="mb-2 text-base font-bold group-hover:text-white transition-colors">{item.title}</h3>
                      <p className="text-xs leading-6 text-white/50 group-hover:text-white/65 transition-colors">{item.copy}</p>
                    </SpotlightCard>
                  </ScrollRevealItem>
                );
              })}
            </ScrollReveal>

            {/* Dashboard preview card */}
            <ScrollReveal delay={0.3}>
              <div className="glass-card-premium p-6 h-full relative overflow-hidden">
                {/* Mini dashboard mockup */}
                <div className="flex items-center gap-2 mb-6">
                  <div className="h-3 w-3 rounded-full bg-red-500/60" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                  <div className="h-3 w-3 rounded-full bg-green-500/60" />
                  <span className="ml-4 font-mono text-[10px] text-white/30">GhostPipe Dashboard</span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Created', val: '2,847', color: '#00F0FF' },
                    { label: 'Uploaded', val: '2,691', color: '#A855F7' },
                    { label: 'Success', val: '94.5%', color: '#10B981' },
                  ].map((s) => (
                    <div key={s.label} className="glass p-3 rounded-sm">
                      <div className="font-mono text-[8px] uppercase text-white/30 mb-1">{s.label}</div>
                      <div className="text-lg font-bold" style={{ color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Simulated chart */}
                <div className="relative h-24 flex items-end gap-1 px-2">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const height = 20 + Math.random() * 80;
                    return (
                      <motion.div
                        key={i}
                        className="flex-1 rounded-t-sm"
                        style={{
                          background: `linear-gradient(to top, rgba(0,240,255,0.3), rgba(168,85,247,0.5))`,
                        }}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${height}%` }}
                        transition={{ duration: 0.8, delay: 0.8 + i * 0.05 }}
                        viewport={{ once: true }}
                      />
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-[9px] text-white/25 uppercase tracking-widest">Last 30 days</span>
                  <ArrowRight size={14} className="text-cyan" />
                </div>

                {/* Shimmer */}
                <div className="absolute inset-0 shimmer pointer-events-none" />
              </div>
            </ScrollReveal>
          </div>

          {/* Feature list */}
          <ScrollReveal delay={0.4} className="mt-8">
            <div className="glass-card p-6 grid gap-3">
              {[
                'Review queue, logs, and upload state in one place.',
                'Fits creator teams, media ops, and small production studios.',
                'Designed to feel strong on desktop and readable on mobile.',
              ].map((line) => (
                <div key={line} className="flex items-start gap-3 text-sm leading-6 text-white/60 group">
                  <ArrowRight size={16} className="mt-0.5 shrink-0 text-cyan group-hover:translate-x-1 transition-transform" />
                  <span className="group-hover:text-white/80 transition-colors">{line}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════ TESTIMONIALS ═══════ */}
      <section className="relative border-t border-white/5 py-24">
        <div className="mx-auto max-w-4xl px-6 md:px-10">
          <ScrollReveal className="text-center mb-12">
            <div className="font-mono text-xs tracking-[0.3em] uppercase mb-4 text-cyan">05 / Feedback</div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.03em] font-display">
              What operators are <span className="text-gradient">saying</span>
            </h2>
          </ScrollReveal>

          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTestimonial}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                transition={{ duration: 0.5 }}
              >
                <GlowingBorder rounded="rounded-none" borderWidth={1}>
                  <div className="p-8 md:p-12 text-center">
                    <div className="flex justify-center gap-1 mb-6">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={16} className="text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                    <blockquote className="text-lg md:text-xl leading-8 text-white/85 mb-6 max-w-2xl mx-auto">
                      "{testimonials[activeTestimonial].quote}"
                    </blockquote>
                    <div className="font-mono text-xs uppercase tracking-[0.25em] text-cyan">
                      — {testimonials[activeTestimonial].author}
                    </div>
                  </div>
                </GlowingBorder>
              </motion.div>
            </AnimatePresence>

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTestimonial(i)}
                  className="transition-all duration-300"
                  aria-label={`View testimonial ${i + 1}`}
                >
                  <motion.div
                    className="rounded-full"
                    animate={{
                      width: activeTestimonial === i ? 24 : 8,
                      height: 8,
                      background: activeTestimonial === i ? '#00F0FF' : 'rgba(255,255,255,0.15)',
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ PRICING SECTION ═══════ */}
      <section id="pricing" className="relative border-t border-white/5">
        <GradientBlob />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-24 md:px-10 lg:py-32">
          <ScrollReveal className="text-center max-w-3xl mx-auto mb-16">
            <div className="font-mono text-xs tracking-[0.3em] uppercase mb-4 text-cyan">06 / Pricing</div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-[-0.03em] leading-tight mb-5 font-display">
              Ready for teams that want to run this{' '}
              <span className="text-gradient">like a product</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal staggerChildren={0.15} className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
            {pricingTiers.map((tier) => (
              <ScrollRevealItem key={tier.name} direction="up">
                <div className="relative h-full">
                  {tier.popular && (
                    <motion.div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-400 to-purple-500 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-white z-10 whitespace-nowrap"
                      animate={{ boxShadow: ['0 0 15px rgba(0,240,255,0.2)', '0 0 30px rgba(0,240,255,0.4)', '0 0 15px rgba(0,240,255,0.2)'] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      Recommended
                    </motion.div>
                  )}
                  <SpotlightCard
                    className={`h-full p-6 md:p-8 ${tier.popular ? 'glass-card-premium' : 'glass-card'}`}
                    spotlightColor={tier.popular ? 'rgba(0,240,255,0.08)' : 'rgba(255,255,255,0.04)'}
                  >
                    <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/40 mb-3">{tier.name}</div>
                    <div className="text-4xl font-bold mb-1">
                      <span className="text-gradient-cyan">${tier.price}</span>
                    </div>
                    <div className="text-xs uppercase tracking-[0.15em] text-white/35 mb-6">
                      {tier.uploads === -1 ? 'Unlimited uploads/day' : `${tier.uploads} uploads/day`}
                    </div>

                    <div className="space-y-3 mb-8">
                      {tier.features.map((f) => (
                        <div key={f} className="flex items-center gap-2 text-sm text-white/60">
                          <Check size={14} className="text-cyan shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>

                    <MagneticButton
                      onClick={() => navigate('/dashboard')}
                      className={`w-full py-3 text-center font-mono text-xs uppercase tracking-wider font-bold ${
                        tier.popular ? 'btn-glow' : 'btn-secondary'
                      }`}
                    >
                      Get Started
                    </MagneticButton>
                  </SpotlightCard>
                </div>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section className="relative border-t border-white/5">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,240,255,0.06) 0%, transparent 60%)',
        }} />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-24 md:px-10 text-center">
          <ScrollReveal>
            <motion.div
              className="glass-card-premium p-10 md:p-16 relative overflow-hidden"
              whileInView={{ boxShadow: ['0 0 40px rgba(0,240,255,0.05)', '0 0 80px rgba(0,240,255,0.1)', '0 0 40px rgba(0,240,255,0.05)'] }}
              transition={{ duration: 3, repeat: Infinity }}
              viewport={{ once: true }}
            >
              <h3 className="text-2xl md:text-4xl font-bold tracking-[-0.02em] mb-4 font-display">
                Open the control room <span className="text-gradient">when you need it</span>
              </h3>
              <p className="text-sm leading-7 text-white/50 max-w-xl mx-auto mb-8">
                Log in, inspect the queue, start the pipeline, stop it when needed — keep your content operation visible.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <MagneticButton onClick={() => navigate('/dashboard')} className="btn-glow inline-flex items-center gap-2">
                  <Lock size={16} /> Enter Dashboard
                </MagneticButton>
                <MagneticButton onClick={() => scrollToSection('top')} className="btn-secondary inline-flex items-center gap-2">
                  <ArrowRight size={14} /> Back to Top
                </MagneticButton>
              </div>

              {/* Shimmer */}
              <div className="absolute inset-0 shimmer pointer-events-none" />
            </motion.div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="relative border-t border-white/5 py-12">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-5 rounded bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
                  <Zap size={10} className="text-white" />
                </div>
                <span className="font-mono text-xs tracking-[0.25em] uppercase text-gradient-cyan font-bold">GhostPipe</span>
              </div>
              <p className="text-xs text-white/30 max-w-xs">
                A professional workflow for producing and publishing YouTube Shorts at scale.
              </p>
            </div>

            <div className="flex flex-wrap gap-6 font-mono text-[11px] uppercase tracking-[0.2em]">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className="text-white/30 hover:text-white transition-colors hover:drop-shadow-[0_0_6px_rgba(0,240,255,0.3)]"
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => navigate('/dashboard')}
                className="text-cyan hover:text-white transition-colors flex items-center gap-1"
              >
                Dashboard <ExternalLink size={10} />
              </button>
            </div>
          </div>

          {/* Gradient line */}
          <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="mt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">
              © {new Date().getFullYear()} GhostPipe Systems
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}