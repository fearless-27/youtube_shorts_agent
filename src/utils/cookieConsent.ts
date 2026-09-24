/**
 * NEMO AI / GHOSTPIPE Unified Cookie Consent Engine
 * Multi-Tier GDPR/ePrivacy/CCPA Compliant Consent Manager
 */

export interface CookieConsentPreferences {
  version: number;
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
  hasInteracted: boolean;
}

export const COOKIE_CONSENT_KEY = 'nemo_cookie_consent_v1';
export const COOKIE_CONSENT_EVENT = 'nemo_cookie_consent_updated';
const CURRENT_VERSION = 1;
const CONSENT_EXPIRY_DAYS = 180;

const DEFAULT_PREFERENCES: CookieConsentPreferences = {
  version: CURRENT_VERSION,
  necessary: true,
  functional: true,
  analytics: true,
  marketing: false,
  timestamp: '',
  hasInteracted: false,
};

/** Parse a specific cookie by key */
function getRawCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/** Set a cookie with expiration and SameSite policy */
function setRawCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
}

/** Retrieve active consent preferences from cookie or localStorage */
export function getCookieConsent(): CookieConsentPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    // 1. Try Cookie first
    const cookieVal = getRawCookie(COOKIE_CONSENT_KEY);
    if (cookieVal) {
      const parsed = JSON.parse(cookieVal);
      if (parsed && parsed.version === CURRENT_VERSION) {
        return { ...DEFAULT_PREFERENCES, ...parsed, necessary: true };
      }
    }

    // 2. Try localStorage as resilient fallback
    const storageVal = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (storageVal) {
      const parsed = JSON.parse(storageVal);
      if (parsed && parsed.version === CURRENT_VERSION) {
        return { ...DEFAULT_PREFERENCES, ...parsed, necessary: true };
      }
    }
  } catch (err) {
    console.warn('[CookieConsent] Failed to parse existing consent:', err);
  }

  return DEFAULT_PREFERENCES;
}

/** Check if user has made an explicit choice */
export function hasUserConsented(): boolean {
  const consent = getCookieConsent();
  return consent.hasInteracted === true;
}

/** Save updated consent preferences across both Cookie and LocalStorage */
export function saveCookieConsent(
  prefs: Partial<Omit<CookieConsentPreferences, 'version' | 'necessary'>>
): CookieConsentPreferences {
  const current = getCookieConsent();
  const updated: CookieConsentPreferences = {
    ...current,
    ...prefs,
    version: CURRENT_VERSION,
    necessary: true, // Strictly necessary is always locked
    timestamp: new Date().toISOString(),
    hasInteracted: true,
  };

  const serialized = JSON.stringify(updated);

  try {
    setRawCookie(COOKIE_CONSENT_KEY, serialized, CONSENT_EXPIRY_DAYS);
    localStorage.setItem(COOKIE_CONSENT_KEY, serialized);
  } catch (err) {
    console.warn('[CookieConsent] Failed to write consent:', err);
  }

  // Dispatch custom event for real-time script and telemetry gating
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, {
        detail: updated,
      })
    );
  }

  return updated;
}

/** Accept all categories */
export function acceptAllCookies(): CookieConsentPreferences {
  return saveCookieConsent({
    functional: true,
    analytics: true,
    marketing: true,
  });
}

/** Reject all non-essential categories */
export function rejectNonEssentialCookies(): CookieConsentPreferences {
  return saveCookieConsent({
    functional: false,
    analytics: false,
    marketing: false,
  });
}

/** Clear consent for testing or policy resets */
export function resetCookieConsent(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_CONSENT_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  try {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, {
        detail: DEFAULT_PREFERENCES,
      })
    );
  }
}
