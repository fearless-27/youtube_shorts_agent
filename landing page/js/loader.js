// Nudot loader dismissal, hero timeline anchor & bfcache handler

        // Anchor hero reveal to page-load time using performance.now()
        // DOMContentLoaded fires AFTER all defer scripts → _heroTl is guaranteed to exist
        var _loaderTarget = 2700; // ms from navigation start
        var _loaderDismissTarget = 3200; // release click shield shortly after loader exit

        function dismissNudotLoader() {
          var el = document.getElementById('nudot-loader');
          if (!el || el.dataset.dismissed === 'true') return;
          el.dataset.dismissed = 'true';
          window._nudotLoaderDismissed = true;
          el.style.pointerEvents = 'none';
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
          document.dispatchEvent(new Event('nudot:loader-dismissed'));
          window.setTimeout(function () {
            if (el && el.parentNode) el.remove();
          }, 220);
        }

        document.addEventListener('DOMContentLoaded', function () {
          var remaining = Math.max(0, _loaderTarget - performance.now());
          var dismissRemaining = Math.max(0, _loaderDismissTarget - performance.now());
          setTimeout(function () {
            if (window._heroTl) window._heroTl.play();
          }, remaining);
          setTimeout(dismissNudotLoader, dismissRemaining);
        });
        // bfcache restore: pageshow with persisted=true doesn't re-run scripts
        window.addEventListener('pageshow', function (e) {
          if (e.persisted) {
            // Force full reload to avoid stale GSAP/Lenis state from bfcache
            window.location.reload();
          }
        });
        // Hard fallback: if still not dismissed after 4.5s, cleanly dismiss loader
        setTimeout(function () {
          dismissNudotLoader();
          if (window._heroTl && typeof window._heroTl.play === 'function') {
            window._heroTl.play();
          }
        }, 4500);
