import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Brain,
  ChevronRight,
  Clock3,
  Film,
  Lock,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import { pipelineStats, pricingTiers, testimonials } from '../data/store';

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  copy: string;
};

const navigation = [
  { id: 'story', label: 'Story' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'studio', label: 'Studio' },
  { id: 'enterprise', label: 'Enterprise' },
];

const workflowSteps = [
  {
    num: '01',
    title: 'Signal Intake',
    copy: 'GhostPipe watches source channels, trend feeds, and approved uploads to identify what deserves a Short.',
    icon: Radar,
  },
  {
    num: '02',
    title: 'Shorts Assembly',
    copy: 'The pipeline cuts, reframes, captions, and formats the video into a vertical asset ready for review.',
    icon: Film,
  },
  {
    num: '03',
    title: 'Virality Scoring',
    copy: 'Each candidate receives a score so operators can prioritize the clips most likely to perform.',
    icon: Brain,
  },
  {
    num: '04',
    title: 'Upload & Cleanup',
    copy: 'Approved videos are uploaded on schedule, logged, and cleaned up to keep the workflow tidy.',
    icon: Upload,
  },
];

const studioHighlights = [
  {
    title: 'Editorial control room',
    copy: 'Manage queue state, approvals, quotas, and pipeline logs from one dashboard.',
    icon: ShieldCheck,
  },
  {
    title: 'Smart scheduling',
    copy: 'Uploads respect peak times, daily caps, and the mode you choose for each deployment.',
    icon: Clock3,
  },
  {
    title: 'Growth reporting',
    copy: 'Track created shorts, upload success, and the top performing topics in near real time.',
    icon: TrendingUp,
  },
  {
    title: 'Operator messaging',
    copy: 'The interface surfaces clear start, stop, and review actions without burying the operator in noise.',
    icon: Users,
  },
];

const heroMetrics = [
  { label: 'Shorts Created', value: pipelineStats.createdShorts.toString() },
  { label: 'Success Rate', value: `${pipelineStats.successRate}%` },
  { label: 'Average Virality', value: pipelineStats.avgViralityScore.toString() },
];

const imageSet = {
  heroMain: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80',
  heroSmall: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1000&q=80',
  storyLarge: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1300&q=80',
  storySmall: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=80',
  workflowImage: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1300&q=80',
  studioImage: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80',
  enterpriseImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80',
};

function SectionHeading({ eyebrow, title, copy }: SectionHeadingProps) {
  return (
    <div className="max-w-3xl mb-10">
      <div className="font-mono text-xs tracking-[0.3em] uppercase mb-4" style={{ color: '#00F0FF' }}>
        {eyebrow}
      </div>
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold tracking-[-0.03em] leading-tight mb-4">
        {title}
      </h2>
      <p className="text-sm md:text-base leading-relaxed max-w-2xl" style={{ color: 'rgba(255,255,255,0.66)' }}>
        {copy}
      </p>
    </div>
  );
}

function ImagePanel({
  src,
  alt,
  title,
  copy,
  tall = false,
}: {
  src: string;
  alt: string;
  title?: string;
  copy?: string;
  tall?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden border border-white/10 bg-[#0A0A0C] ${tall ? 'min-h-[440px]' : 'min-h-[260px]'}`}>
      <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/15 to-transparent" />
      {(title || copy) && (
        <div className="absolute left-5 right-5 bottom-5 space-y-1">
          {title && <div className="font-semibold text-lg">{title}</div>}
          {copy && <div className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>{copy}</div>}
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] p-4">
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {label}
      </div>
      <div className="text-2xl font-semibold" style={{ color: '#00F0FF' }}>
        {value}
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8%] top-[-10%] h-[34rem] w-[34rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(0,240,255,0.18) 0%, rgba(0,240,255,0) 72%)' }} />
        <div className="absolute right-[-12%] top-[12%] h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(0,255,102,0.12) 0%, rgba(0,255,102,0) 72%)' }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />
      </div>

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-10">
          <button onClick={() => scrollToSection('top')} className="font-mono text-sm tracking-[0.3em]" style={{ color: '#00F0FF' }}>
            GHOSTPIPE
          </button>
          <div className="hidden items-center gap-8 md:flex">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="font-mono text-[11px] uppercase tracking-[0.25em] transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => navigate('/login')}
              className="font-mono text-[11px] uppercase tracking-[0.25em] border px-4 py-2 transition-colors hover:bg-white/5"
              style={{ color: '#00F0FF', borderColor: 'rgba(0,240,255,0.35)' }}
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-16">
        <section id="top" className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-8 animate-fade-in">
              <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: '#00F0FF' }}>
                <Sparkles size={12} />
                AI Shorts Production System
              </div>
              <div className="space-y-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.35em]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Turn trend signals into publish-ready Shorts
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold leading-[1.03] tracking-[-0.05em] md:text-5xl lg:text-[4.8rem]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  GhostPipe helps teams <span style={{ color: '#00F0FF' }}>create, review, and upload</span> YouTube Shorts with a production-ready workflow.
                </h1>
              </div>
              <p className="max-w-2xl text-sm leading-7 md:text-base" style={{ color: 'rgba(255,255,255,0.68)' }}>
                Built for creators, editors, and growth teams, GhostPipe collects signals, assembles vertical videos, scores performance, and pushes approved content live on schedule.
                The result is a repeatable content engine instead of a manual editing chain.
              </p>
              <div className="flex flex-wrap gap-4">
                <button onClick={() => navigate('/login')} className="btn-primary inline-flex items-center gap-2">
                  <Zap size={16} />
                  Open Control Room
                </button>
                <button onClick={() => scrollToSection('workflow')} className="btn-secondary inline-flex items-center gap-2">
                  <Play size={14} />
                  See the Workflow
                </button>
              </div>
              <div className="grid max-w-xl grid-cols-3 gap-3 pt-2">
                {heroMetrics.map((metric) => (
                  <MetricTile key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
            </div>

            <div className="relative animate-fade-in lg:pl-8" style={{ animationDelay: '0.1s' }}>
              <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
                <ImagePanel
                  src={imageSet.heroMain}
                  alt="Video editor working on a content production dashboard"
                  tall
                  title="Production Desk"
                  copy="A control surface designed for fast review, approval, and scheduling."
                />
                <div className="grid gap-4">
                  <ImagePanel
                    src={imageSet.heroSmall}
                    alt="Analytics screen showing content performance"
                    title="Real-time metrics"
                    copy="Track uploads, pipeline status, and growth performance in one place."
                  />
                  <div className="border border-white/10 bg-white/[0.03] p-5">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        Live Status
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] uppercase" style={{ color: '#00FF66' }}>
                        <span className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: '#00FF66' }} />
                        Online
                      </div>
                    </div>
                    <div className="mt-5 space-y-3">
                      <ProgressRow label="Queue processed" value="92%" />
                      <ProgressRow label="Review approved" value="87%" />
                      <ProgressRow label="Upload success" value={`${pipelineStats.successRate}%`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="story" className="border-t border-white/10 bg-[#050505]">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:px-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-28">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="02 / PRODUCT STORY"
                title="A cleaner way to run a Shorts operation"
                copy="Instead of juggling tabs, timelines, and manual uploads, GhostPipe centralizes the content workflow into a single operator experience. The platform is designed for teams that want a reliable publishing system, not a one-off script."
              />
              <div className="space-y-4 border border-white/10 bg-white/[0.03] p-5">
                {[
                  'Trend signals are captured before the content becomes saturated.',
                  'Each clip is scored so your team can focus on the strongest candidates.',
                  'Approvals, upload caps, and cleanup live in the same control panel.',
                  'The dashboard stays readable even when the pipeline is busy.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.72)' }}>
                    <ChevronRight size={16} className="mt-0.5 shrink-0" style={{ color: '#00F0FF' }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <ImagePanel
                src={imageSet.storyLarge}
                alt="Analytics workstation showing content performance"
                tall
                title="Designed for operators"
                copy="Readable data, clear actions, and fewer moving parts during a publishing day."
              />
              <div className="grid gap-4">
                <ImagePanel
                  src={imageSet.storySmall}
                  alt="Creator studio with production screen"
                  copy="Teams can review the queue, inspect logs, and move content through the approval gate without leaving the dashboard."
                />
                <div className="grid gap-3">
                  <MiniCard icon={ShieldCheck} title="Safe by default" copy="Approval gates and quotas keep publishing controlled." />
                  <MiniCard icon={Brain} title="AI-assisted scoring" copy="Forecasts help prioritize the most promising clips." />
                  <MiniCard icon={Upload} title="Automated delivery" copy="Approved videos move to upload without extra steps." />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-t border-white/10 bg-[#050505]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:py-28">
            <SectionHeading
              eyebrow="03 / WORKFLOW"
              title="From source clip to uploaded Short in four stages"
              copy="The workflow is intentionally simple: ingest the source, assemble the edit, review the result, then ship it on the schedule you set."
            />

            <div className="grid gap-6 lg:grid-cols-[1fr_0.92fr]">
              <div className="grid gap-4 md:grid-cols-2">
                {workflowSteps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.num} className="border border-white/10 bg-white/[0.03] p-6 transition-transform hover:-translate-y-1">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: '#00F0FF' }}>
                          {step.num}
                        </div>
                        <Icon size={16} style={{ color: '#00FF66' }} />
                      </div>
                      <h3 className="mb-3 text-lg font-semibold">{step.title}</h3>
                      <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.68)' }}>
                        {step.copy}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                <ImagePanel
                  src={imageSet.workflowImage}
                  alt="Workflow and control room screens"
                  tall
                  title="Pipeline visibility"
                  copy="The operator can see what is moving, what is waiting, and what has been published."
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <MetricTile label="Uploads today" value={`${pipelineStats.uploadsToday}`} />
                  <MetricTile label="Daily cap" value={`${pipelineStats.dailyCap}`} />
                  <MetricTile label="Pending review" value={`${pipelineStats.pendingApproval}`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="studio" className="border-t border-white/10 bg-[#050505]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:py-28">
            <SectionHeading
              eyebrow="04 / STUDIO"
              title="Everything the dashboard needs to feel like a real product"
              copy="This view should look like a professional production tool: clear controls, live analytics, approval states, and enough visual detail to make the interface feel alive."
            />

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-4 md:grid-cols-2">
                {studioHighlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="border border-white/10 bg-white/[0.03] p-5">
                      <Icon size={18} className="mb-4" style={{ color: '#00F0FF' }} />
                      <h3 className="mb-2 text-base font-semibold">{item.title}</h3>
                      <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.68)' }}>
                        {item.copy}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                <ImagePanel
                  src={imageSet.studioImage}
                  alt="Developer workstation with code and content tools"
                  tall
                  title="Operator console"
                  copy="A focused surface for decisions, not clutter."
                />
                <div className="grid gap-3 border border-white/10 bg-white/[0.03] p-5">
                  {[
                    'Review queue, logs, and upload state in one place.',
                    'Fits creator teams, media ops, and small production studios.',
                    'Designed to feel strong on desktop and readable on mobile.',
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-3 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.72)' }}>
                      <ArrowRight size={16} className="mt-0.5 shrink-0" style={{ color: '#00F0FF' }} />
                      <span>{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="enterprise" className="border-t border-white/10 bg-[#050505]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 lg:py-28">
            <SectionHeading
              eyebrow="05 / ENTERPRISE"
              title="Ready for teams that want to run this like a product"
              copy="GhostPipe is meant to be used on demand, logged cleanly, and operated with the confidence of a real service. The production setup can scale from one channel to a full publishing team."
            />

            <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
              <div className="space-y-6">
                <div className="border border-white/10 bg-white/[0.03] p-6">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full animate-pulse-dot" style={{ background: '#00FF66' }} />
                    <div className="font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: '#00FF66' }}>
                      Operator feedback
                    </div>
                  </div>
                  <blockquote className="text-lg leading-8 md:text-xl" style={{ color: 'rgba(255,255,255,0.88)' }}>
                    “GhostPipe gives us a structured workflow for turning content into Shorts. We can see the queue, approve the right clips, and keep uploads moving without dropping the quality bar.”
                  </blockquote>
                  <div className="mt-6 font-mono text-xs uppercase tracking-[0.25em]" style={{ color: '#00F0FF' }}>
                    — {testimonials[activeTestimonial].author}
                  </div>
                  <div className="mt-6 flex gap-2">
                    {testimonials.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setActiveTestimonial(index)}
                        className="h-2 w-2 transition-all"
                        style={{ background: activeTestimonial === index ? '#00F0FF' : '#202020' }}
                        aria-label={`View testimonial ${index + 1}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <MiniCard icon={ShieldCheck} title="Governed" copy="Role-based access and controlled publishing." />
                  <MiniCard icon={Clock3} title="Scheduled" copy="Use the right time windows for uploads." />
                  <MiniCard icon={TrendingUp} title="Trackable" copy="Analytics and logs stay visible." />
                </div>
              </div>

              <div className="space-y-4">
                <ImagePanel
                  src={imageSet.enterpriseImage}
                  alt="Team collaborating in a modern workspace"
                  tall
                  title="Enterprise-ready operations"
                  copy="A clean command layer for teams that need repeatability and visibility."
                />

                <div className="grid gap-4 md:grid-cols-3">
                  {pricingTiers.map((tier) => (
                    <div
                      key={tier.name}
                      className="relative border p-5"
                      style={{
                        borderColor: tier.popular ? 'rgba(0,240,255,0.45)' : 'rgba(255,255,255,0.1)',
                        background: tier.popular ? 'rgba(0,240,255,0.04)' : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      {tier.popular && (
                        <div className="absolute -top-3 left-5 bg-[#00F0FF] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-[#050505]">
                          Recommended
                        </div>
                      )}
                      <div className="font-mono text-xs uppercase tracking-[0.25em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {tier.name}
                      </div>
                      <div className="mt-2 text-2xl font-semibold">${tier.price}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {tier.uploads === -1 ? 'Unlimited uploads/day' : `${tier.uploads} uploads/day`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 border border-white/10 bg-[#0A0A0C] px-6 py-8 text-center md:px-10">
              <div className="mx-auto max-w-3xl space-y-4">
                <h3 className="text-2xl font-semibold md:text-3xl">Open the control room when you need it</h3>
                <p className="text-sm leading-7" style={{ color: 'rgba(255,255,255,0.68)' }}>
                  The dashboard is built for one-click execution: log in, inspect the queue, start the pipeline, stop it when needed, and keep your content operation visible.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                  <button onClick={() => navigate('/login')} className="btn-primary inline-flex items-center gap-2">
                    <Lock size={16} />
                    Enter Dashboard
                  </button>
                  <button onClick={() => scrollToSection('top')} className="btn-secondary inline-flex items-center gap-2">
                    <ArrowRight size={14} />
                    Back to Top
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/10 bg-[#050505] py-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <div className="font-mono text-xs tracking-[0.3em] uppercase" style={{ color: '#00F0FF' }}>
                GhostPipe Systems
              </div>
              <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                A professional workflow for producing and publishing YouTube Shorts.
              </p>
            </div>
            <div className="flex flex-wrap gap-5 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <button onClick={() => scrollToSection('story')} className="transition-colors hover:text-white">Story</button>
              <button onClick={() => scrollToSection('workflow')} className="transition-colors hover:text-white">Workflow</button>
              <button onClick={() => navigate('/login')} className="transition-colors hover:text-white">Dashboard</button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function MiniCard({ icon: Icon, title, copy }: { icon: typeof ShieldCheck; title: string; copy: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] p-4">
      <Icon size={16} className="mb-3" style={{ color: '#00F0FF' }} />
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="text-xs leading-6" style={{ color: 'rgba(255,255,255,0.64)' }}>
        {copy}
      </div>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: string }) {
  const progress = Number(value.replace('%', '')) || 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
        <span>{label}</span>
        <span style={{ color: '#00F0FF' }}>{value}</span>
      </div>
      <div className="h-2 w-full bg-white/5">
        <div className="h-full" style={{ width: `${Math.min(progress, 100)}%`, background: 'linear-gradient(90deg, #00F0FF, #00FF66)' }} />
      </div>
    </div>
  );
}