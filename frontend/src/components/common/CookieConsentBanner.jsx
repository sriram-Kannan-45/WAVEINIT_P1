import React, { useState, useEffect } from 'react';
import { ShieldCheck, Cookie, Settings2, Check, X } from 'lucide-react';

const CONSENT_KEY = 'cookie_consent_preferences';

/**
 * Check if the user has consented to a specific storage category
 * @param {'necessary'|'preferences'|'analytics'} category
 * @returns {boolean}
 */
export function hasConsent(category) {
  if (category === 'necessary') return true;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw);
    return Boolean(prefs[category]);
  } catch {
    return false;
  }
}

/**
 * Retrieve current consent preferences
 */
export function getConsentPreferences() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save consent preferences
 */
export function saveConsentPreferences(prefs) {
  const payload = {
    necessary: true,
    preferences: Boolean(prefs.preferences),
    analytics: Boolean(prefs.analytics),
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('cookie_consent_updated', { detail: payload }));
}

export default function CookieConsentBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefStorage, setPrefStorage] = useState(false);
  const [prefAnalytics, setPrefAnalytics] = useState(false);

  useEffect(() => {
    const existing = getConsentPreferences();
    if (!existing) {
      // Delay showing banner slightly to avoid layout shift
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    } else {
      setPrefStorage(existing.preferences);
      setPrefAnalytics(existing.analytics);
    }
  }, []);

  // Listen for external open requests (e.g. from footer or privacy policy page)
  useEffect(() => {
    const handleOpen = () => {
      const existing = getConsentPreferences() || {};
      setPrefStorage(Boolean(existing.preferences));
      setPrefAnalytics(Boolean(existing.analytics));
      setShowDetails(true);
      setIsOpen(true);
    };
    window.addEventListener('open_cookie_preferences', handleOpen);
    return () => window.removeEventListener('open_cookie_preferences', handleOpen);
  }, []);

  const handleAcceptAll = () => {
    saveConsentPreferences({ preferences: true, analytics: true });
    setIsOpen(false);
  };

  const handleEssentialOnly = () => {
    saveConsentPreferences({ preferences: false, analytics: false });
    // Clean up non-essential storage if previously set
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('rememberedEmail');
    setIsOpen(false);
  };

  const handleSaveCustom = () => {
    saveConsentPreferences({ preferences: prefStorage, analytics: prefAnalytics });
    if (!prefStorage) {
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('rememberedEmail');
    }
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie and Privacy Consent Preferences"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-xl z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
          <Cookie className="w-6 h-6" />
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base text-white flex items-center gap-2">
              Privacy & Cookie Preferences
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              GDPR Readiness
            </span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            We use strictly necessary storage for authentication and platform security. Optional features such as
            remembering your email or proctoring analytics require your consent.
          </p>

          {showDetails && (
            <div className="pt-3 space-y-3 text-xs border-t border-slate-800 my-3">
              {/* Strictly Necessary */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div>
                  <p className="font-medium text-white flex items-center gap-1.5">
                    Strictly Necessary <span className="text-teal-400 text-[10px] uppercase font-bold">(Always Active)</span>
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    Required for login sessions, JWT authorization, and CSRF protection.
                  </p>
                </div>
                <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              </div>

              {/* Functional / Preferences */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div>
                  <p className="font-medium text-white">Functional Preferences</p>
                  <p className="text-slate-400 mt-0.5">
                    Stores "Remember Me" credentials and theme settings across sessions.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefStorage}
                  onChange={(e) => setPrefStorage(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-teal-500 focus:ring-teal-400 w-4 h-4 mt-0.5 cursor-pointer"
                />
              </div>

              {/* Analytics & Device Telemetry */}
              <div className="flex items-start justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <div>
                  <p className="font-medium text-white">Assessment Telemetry & Analytics</p>
                  <p className="text-slate-400 mt-0.5">
                    Device screen resolution, browser metrics for assessment integrity analysis.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefAnalytics}
                  onChange={(e) => setPrefAnalytics(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-700 text-teal-500 focus:ring-teal-400 w-4 h-4 mt-0.5 cursor-pointer"
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center gap-2">
            {!showDetails ? (
              <>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm"
                >
                  Accept All
                </button>
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Customize
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSaveCustom}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm"
                >
                  Save Preferences
                </button>
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700"
                >
                  Reject Non-Essential
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
                >
                  Back
                </button>
              </>
            )}
            <a
              href="/privacy"
              className="text-xs text-teal-400 hover:underline ml-auto"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
