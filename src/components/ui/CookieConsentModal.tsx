import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cookie,
  Shield,
  Sliders,
  Check,
  X,
  Lock,
  BarChart3,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  getCookieConsent,
  saveCookieConsent,
  acceptAllCookies,
  rejectNonEssentialCookies,
  COOKIE_CONSENT_EVENT,
  type CookieConsentPreferences,
} from '../../utils/cookieConsent';

export default function CookieConsentModal() {
  const [consent, setConsent] = useState<CookieConsentPreferences>(getCookieConsent);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showPreferences, setShowPreferences] = useState<boolean>(false);
  const [draft, setDraft] = useState({
    functional: true,
    analytics: true,
    marketing: false,
  });

  // Sync state on mount and listen to custom events
  useEffect(() => {
    const current = getCookieConsent();
    setConsent(current);
    setDraft({
      functional: current.functional,
      analytics: current.analytics,
      marketing: current.marketing,
    });

    if (!current.hasInteracted) {
      // Slight delay so the page loads cleanly before the banner slides up
      const timer = setTimeout(() => setShowBanner(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<CookieConsentPreferences>;
      if (customEvent.detail) {
        setConsent(customEvent.detail);
        setDraft({
          functional: customEvent.detail.functional,
          analytics: customEvent.detail.analytics,
          marketing: customEvent.detail.marketing,
        });
      }
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, handleUpdate);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handleUpdate);
  }, []);

  const handleAcceptAll = () => {
    const updated = acceptAllCookies();
    setConsent(updated);
    setShowBanner(false);
    setShowPreferences(false);
  };

  const handleRejectNonEssential = () => {
    const updated = rejectNonEssentialCookies();
    setConsent(updated);
    setShowBanner(false);
    setShowPreferences(false);
  };

  const handleSavePreferences = () => {
    const updated = saveCookieConsent(draft);
    setConsent(updated);
    setShowBanner(false);
    setShowPreferences(false);
  };

  const openCustomizeModal = () => {
    setDraft({
      functional: consent.functional,
      analytics: consent.analytics,
      marketing: consent.marketing,
    });
    setShowBanner(false);
    setShowPreferences(true);
  };

  return (
    <>
      {/* ── 1. Floating Re-Open Badge (Always accessible) ── */}
      <motion.button
        type="button"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowPreferences(true)}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121424]/90 hover:bg-[#1A1D30] border border-purple-500/30 hover:border-purple-500/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md text-slate-300 hover:text-white transition-all text-xs group"
        title="Manage Cookie & Privacy Settings"
        aria-label="Cookie & Privacy Settings"
      >
        <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:text-purple-300 transition-colors">
          <Cookie className="w-3 h-3" />
        </div>
        <span className="hidden sm:inline font-medium text-[11px] tracking-wide">
          Cookie Settings
        </span>
      </motion.button>

      {/* ── 2. First-time Floating HUD Banner ── */}
      <AnimatePresence>
        {showBanner && !showPreferences && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-lg z-50 p-5 rounded-2xl bg-[#0e1022]/95 border border-purple-500/30 backdrop-blur-xl shadow-[0_12px_45px_rgba(0,0,0,0.85),0_0_30px_rgba(139,92,246,0.15)] overflow-hidden"
          >
            {/* Ambient Top Glow Line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-cyan-400 opacity-80" />

            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0 text-purple-300 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                <Cookie className="w-5 h-5" />
              </div>

              <div className="flex-1 pr-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white font-display">
                    Privacy & Cookie Preferences
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                    GDPR
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  NEMO uses cookies to maintain secure sessions, store autonomous pipeline preferences, and monitor processing telemetry. You can customize your preferences or accept all below.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowBanner(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={openCustomizeModal}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-purple-300 font-medium transition-colors px-2 py-1.5 rounded-lg hover:bg-white/5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Customize</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_15px_rgba(139,92,246,0.4)] transition-all flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept All</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3. Granular Preference Center Modal ── */}
      <AnimatePresence>
        {showPreferences && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-xl max-h-[90vh] bg-[#0c0e1e] border border-purple-500/30 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(139,92,246,0.2)] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white font-display">
                      Cookie & Privacy Preference Center
                    </h2>
                    <p className="text-xs text-slate-400">
                      Tailor how NEMO handles data and personalization
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPreferences(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Scrollable Body */}
              <div className="p-6 overflow-y-auto space-y-4 divide-y divide-white/5">
                {/* 1. Strictly Necessary */}
                <div className="pt-2 first:pt-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-white">
                            Strictly Necessary Cookies
                          </h4>
                          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Always Active
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Essential for core platform operations such as user authentication (<code className="text-purple-300 font-mono">nemo_session</code>), secure API communication, CSRF tokens, and state preservation. Cannot be turned off.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Functional & AI Preferences */}
                <div className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          Functional & AI Personalization
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Remembers your customized pipeline settings, selected render templates (e.g. Anime Multi-Tier), speech synthesis voice models, and sound effects volume preferences.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.functional}
                      onClick={() => setDraft((prev) => ({ ...prev, functional: !prev.functional }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        draft.functional ? 'bg-purple-600' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          draft.functional ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 3. Analytics & Telemetry */}
                <div className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                        <BarChart3 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          Performance & Telemetry
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Gathers anonymous error traces, generation latency logs, and pipeline throughput to help us diagnose GPU bottlenecks and enhance autonomous short processing.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.analytics}
                      onClick={() => setDraft((prev) => ({ ...prev, analytics: !prev.analytics }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        draft.analytics ? 'bg-purple-600' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          draft.analytics ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 4. Marketing & Attribution */}
                <div className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                        <Target className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          Marketing & Attribution
                        </h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Allows us to attribute subscription growth campaigns and track referral links from partner YouTube creators. No sensitive video content is ever shared.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.marketing}
                      onClick={() => setDraft((prev) => ({ ...prev, marketing: !prev.marketing }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        draft.marketing ? 'bg-purple-600' : 'bg-slate-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          draft.marketing ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 bg-black/50">
                <button
                  type="button"
                  onClick={handleRejectNonEssential}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors"
                >
                  Reject Non-Essential
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSavePreferences}
                    className="px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 text-xs font-semibold transition-all"
                  >
                    Save Preferences
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-all flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept All</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
