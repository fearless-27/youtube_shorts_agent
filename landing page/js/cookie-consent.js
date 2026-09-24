/**
 * NEMO SYSTEMS — Compact Horizontal Cookie Consent Bar
 * Faithful to user's reference layout with NEMO obsidian landing page aesthetics
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'nemo_cookie_consent_v1';
  var EVENT_NAME = 'nemo_cookie_consent_updated';
  var VERSION = 1;

  var DEFAULT_CONFIG = {
    version: VERSION,
    necessary: true,
    functional: true,
    analytics: true,
    marketing: false,
    timestamp: '',
    hasInteracted: false
  };

  function getRawCookie(name) {
    var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  }

  function setRawCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax' + secure;
  }

  function loadConfig() {
    try {
      var cookieVal = getRawCookie(STORAGE_KEY);
      if (cookieVal) {
        var parsed = JSON.parse(cookieVal);
        if (parsed && parsed.version === VERSION) {
          return Object.assign({}, DEFAULT_CONFIG, parsed, { necessary: true });
        }
      }
      var storageVal = localStorage.getItem(STORAGE_KEY);
      if (storageVal) {
        var parsedLocal = JSON.parse(storageVal);
        if (parsedLocal && parsedLocal.version === VERSION) {
          return Object.assign({}, DEFAULT_CONFIG, parsedLocal, { necessary: true });
        }
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  }

  function persistConfig(config) {
    var updated = Object.assign({}, DEFAULT_CONFIG, config, {
      version: VERSION,
      necessary: true,
      timestamp: new Date().toISOString(),
      hasInteracted: true
    });
    var serialized = JSON.stringify(updated);
    try {
      setRawCookie(STORAGE_KEY, serialized, 180);
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {}

    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
    return updated;
  }

  function injectStyles() {
    if (document.getElementById('nemo-compact-cookie-styles')) return;
    var style = document.createElement('style');
    style.id = 'nemo-compact-cookie-styles';
    style.textContent = `
      /* ── Slim Horizontal Bar (Reference Match) ── */
      .nemo-cookie-bar {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        max-width: 1200px;
        margin: 0 auto;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 14px 22px;
        background: rgba(10, 10, 10, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 6px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 16px 50px rgba(0, 0, 0, 0.9), 0 0 1px rgba(255, 255, 255, 0.1);
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #ffffff;
        opacity: 0;
        transform: translateY(24px);
        pointer-events: none;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .nemo-cookie-bar.visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      .nemo-cookie-bar-content {
        flex: 1;
        min-width: 0;
        padding-right: 12px;
      }
      .nemo-cookie-bar-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #ffffff;
        margin: 0 0 3px 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .nemo-cookie-bar-title::before {
        content: "";
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 6px #22c55e;
      }
      .nemo-cookie-bar-desc {
        font-size: 11.5px;
        line-height: 1.5;
        color: #999999;
        margin: 0;
      }
      .nemo-cookie-bar-desc a {
        color: #e5e5e5;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
        transition: color 0.2s;
      }
      .nemo-cookie-bar-desc a:hover {
        color: #ffffff;
      }
      .nemo-cookie-bar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .nemo-cookie-bar-btn {
        padding: 8px 18px;
        border-radius: 4px;
        font-family: 'DM Sans', -apple-system, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.18s ease;
        white-space: nowrap;
        outline: none;
      }
      /* Manage Cookies Button (High-contrast tech secondary) */
      .nemo-cookie-btn-manage {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #ffffff;
      }
      .nemo-cookie-btn-manage:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.35);
        color: #ffffff;
      }
      /* Accept All Button (Solid white) */
      .nemo-cookie-btn-accept {
        background: #ffffff;
        border: 1px solid #ffffff;
        color: #000000;
      }
      .nemo-cookie-btn-accept:hover {
        background: #e5e5e5;
        border-color: #e5e5e5;
        transform: translateY(-1px);
        box-shadow: 0 4px 15px rgba(255, 255, 255, 0.15);
      }
      .nemo-cookie-bar-close {
        background: transparent;
        border: none;
        color: #737373;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        padding: 6px;
        margin-left: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.18s;
      }
      .nemo-cookie-bar-close:hover {
        color: #ffffff;
      }

      /* Responsive wrap for mobile */
      @media (max-width: 768px) {
        .nemo-cookie-bar {
          flex-direction: column;
          align-items: flex-start;
          gap: 14px;
          padding: 16px 18px;
        }
        .nemo-cookie-bar-actions {
          width: 100%;
          justify-content: flex-end;
        }
        .nemo-cookie-bar-close {
          position: absolute;
          top: 12px;
          right: 12px;
        }
      }

      /* ── Preference Modal (Opened via 'Manage cookies') ── */
      .nemo-cookie-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 100000;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.22s ease;
      }
      .nemo-cookie-modal-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .nemo-cookie-modal {
        background: #090909;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        max-width: 580px;
        width: 100%;
        max-height: 86vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.95);
        transform: scale(0.97) translateY(8px);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .nemo-cookie-modal-overlay.open .nemo-cookie-modal {
        transform: scale(1) translateY(0);
      }
      .nemo-cookie-modal-head {
        padding: 18px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.015);
      }
      .nemo-cookie-modal-body {
        padding: 20px 24px;
        overflow-y: auto;
      }
      .nemo-cookie-modal-foot {
        padding: 16px 24px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.015);
      }
      .nemo-cookie-item {
        padding: 15px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .nemo-cookie-item:first-child { padding-top: 0; }
      .nemo-cookie-item:last-child { border-bottom: none; padding-bottom: 0; }

      .nemo-switch {
        position: relative;
        display: inline-block;
        width: 38px;
        height: 20px;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .nemo-switch input { opacity: 0; width: 0; height: 0; }
      .nemo-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #141414;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        transition: .22s ease;
      }
      .nemo-slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 2px;
        bottom: 2px;
        background-color: #737373;
        border-radius: 50%;
        transition: .22s ease;
      }
      input:checked + .nemo-slider {
        background-color: #ffffff;
        border-color: #ffffff;
      }
      input:checked + .nemo-slider:before {
        transform: translateX(18px);
        background-color: #000000;
      }
      input:disabled + .nemo-slider { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  function initUI() {
    injectStyles();

    var currentConfig = loadConfig();

    // 1. Slim Horizontal Bottom Bar (Matches reference layout)
    var bar = document.createElement('div');
    bar.className = 'nemo-cookie-bar';
    bar.innerHTML = `
      <div class="nemo-cookie-bar-content">
        <h4 class="nemo-cookie-bar-title">Cookie Consent</h4>
        <p class="nemo-cookie-bar-desc">
          By clicking 'Accept all', you agree to the storing of cookies on your device to enhance site navigation, preserve pipeline presets, and assist our platform telemetry. <a id="nemo-cookie-link-policy" data-cursor="CLICK">Privacy policy</a>
        </p>
      </div>
      <div class="nemo-cookie-bar-actions">
        <button type="button" class="nemo-cookie-bar-btn nemo-cookie-btn-manage" id="nemo-bar-btn-manage" data-cursor="PREF">
          Manage cookies
        </button>
        <button type="button" class="nemo-cookie-bar-btn nemo-cookie-btn-manage" id="nemo-bar-btn-reject" data-cursor="CLICK">
          Reject all
        </button>
        <button type="button" class="nemo-cookie-bar-btn nemo-cookie-btn-accept" id="nemo-bar-btn-accept" data-cursor="CLICK">
          Accept all
        </button>
        <button type="button" class="nemo-cookie-bar-close" id="nemo-bar-btn-close" aria-label="Close" data-cursor="CLOSE">
          &times;
        </button>
      </div>
    `;
    document.body.appendChild(bar);

    // 2. Granular Preference Modal (opened via 'Manage cookies')
    var modalOverlay = document.createElement('div');
    modalOverlay.className = 'nemo-cookie-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="nemo-cookie-modal" onclick="event.stopPropagation()">
        <div class="nemo-cookie-modal-head">
          <div>
            <div style="font-family: monospace; font-size: 10px; color: #737373; letter-spacing: 0.12em; text-transform: uppercase;">
              NEMO SYSTEM // STORAGE
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: 0.05em; text-transform: uppercase; margin-top: 2px;">
              Cookie Preferences
            </div>
          </div>
          <button type="button" id="nemo-modal-close-x" style="background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #a3a3a3; cursor: pointer; padding: 4px 8px; font-size: 11px; font-family: monospace;" data-cursor="CLOSE">
            [ESC]
          </button>
        </div>

        <div class="nemo-cookie-modal-body">
          <!-- 1. Strictly Necessary -->
          <div class="nemo-cookie-item">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase;">Strictly Necessary</span>
                <span style="font-family: monospace; font-size: 9px; padding: 2px 6px; border-radius: 3px; background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #4ade80;">ACTIVE</span>
              </div>
              <p style="font-size: 11px; line-height: 1.5; color: #888; margin: 4px 0 0 0;">
                Required for core authentication (<code>nemo_session</code>), CSRF token verification, and platform security.
              </p>
            </div>
            <label class="nemo-switch">
              <input type="checkbox" checked disabled />
              <span class="nemo-slider"></span>
            </label>
          </div>

          <!-- 2. Functional -->
          <div class="nemo-cookie-item">
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase;">Functional & AI Presets</div>
              <p style="font-size: 11px; line-height: 1.5; color: #888; margin: 4px 0 0 0;">
                Stores selected template models, audio track language preferences, and customized studio layout presets.
              </p>
            </div>
            <label class="nemo-switch">
              <input type="checkbox" id="nemo-toggle-fn" />
              <span class="nemo-slider"></span>
            </label>
          </div>

          <!-- 3. Performance & Telemetry -->
          <div class="nemo-cookie-item">
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase;">Performance & Telemetry</div>
              <p style="font-size: 11px; line-height: 1.5; color: #888; margin: 4px 0 0 0;">
                Monitors anonymous execution latencies and pipeline benchmarks to optimize autonomous upload performance.
              </p>
            </div>
            <label class="nemo-switch">
              <input type="checkbox" id="nemo-toggle-an" />
              <span class="nemo-slider"></span>
            </label>
          </div>

          <!-- 4. Marketing -->
          <div class="nemo-cookie-item">
            <div>
              <div style="font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase;">Marketing & Attribution</div>
              <p style="font-size: 11px; line-height: 1.5; color: #888; margin: 4px 0 0 0;">
                Measures subscriber campaign performance and creator affiliate links. No video content is ever tracked.
              </p>
            </div>
            <label class="nemo-switch">
              <input type="checkbox" id="nemo-toggle-mk" />
              <span class="nemo-slider"></span>
            </label>
          </div>
        </div>

        <div class="nemo-cookie-modal-foot">
          <button type="button" class="nemo-cookie-bar-btn nemo-cookie-btn-manage" id="nemo-modal-btn-essential" data-cursor="CLICK">
            Essential only
          </button>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="nemo-cookie-bar-btn nemo-cookie-btn-manage" id="nemo-modal-btn-save" data-cursor="CLICK">
              Save choices
            </button>
            <button type="button" class="nemo-cookie-bar-btn nemo-cookie-btn-accept" id="nemo-modal-btn-accept" data-cursor="CLICK">
              Accept all
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalOverlay);

    // Helpers
    function openModal() {
      var cfg = loadConfig();
      document.getElementById('nemo-toggle-fn').checked = cfg.functional;
      document.getElementById('nemo-toggle-an').checked = cfg.analytics;
      document.getElementById('nemo-toggle-mk').checked = cfg.marketing;
      modalOverlay.classList.add('open');
      bar.classList.remove('visible');
    }

    function closeModal() {
      modalOverlay.classList.remove('open');
    }

    function hideBar() {
      bar.classList.remove('visible');
    }

    // Accept All Action
    function onAcceptAll() {
      persistConfig({ functional: true, analytics: true, marketing: true });
      hideBar();
      closeModal();
    }

    // Reject All Action
    function onRejectAll() {
      persistConfig({ functional: false, analytics: false, marketing: false });
      hideBar();
      closeModal();
    }

    // Listeners
    document.getElementById('nemo-bar-btn-accept').addEventListener('click', onAcceptAll);
    document.getElementById('nemo-modal-btn-accept').addEventListener('click', onAcceptAll);
    var barRejectBtn = document.getElementById('nemo-bar-btn-reject');
    if (barRejectBtn) barRejectBtn.addEventListener('click', onRejectAll);

    document.getElementById('nemo-bar-btn-manage').addEventListener('click', openModal);
    document.getElementById('nemo-cookie-link-policy').addEventListener('click', openModal);

    document.getElementById('nemo-bar-btn-close').addEventListener('click', hideBar);
    document.getElementById('nemo-modal-close-x').addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });

    // Save customized
    document.getElementById('nemo-modal-btn-save').addEventListener('click', function() {
      var f = document.getElementById('nemo-toggle-fn').checked;
      var a = document.getElementById('nemo-toggle-an').checked;
      var m = document.getElementById('nemo-toggle-mk').checked;
      persistConfig({ functional: f, analytics: a, marketing: m });
      closeModal();
      hideBar();
    });

    // Essential only
    document.getElementById('nemo-modal-btn-essential').addEventListener('click', onRejectAll);

    // Bind footer link if present
    document.querySelectorAll('[data-cookie-settings], #footer-cookie-settings').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.preventDefault();
        openModal();
      });
    });

    // Show slim bar if user hasn't interacted yet
    if (!currentConfig.hasInteracted) {
      setTimeout(function() {
        bar.classList.add('visible');
      }, 600);
    }

    // Expose reset helper globally for testing or manual prompt: window.resetNemoCookieBanner()
    window.resetNemoCookieBanner = function() {
      document.cookie = STORAGE_KEY + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      bar.classList.add('visible');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
