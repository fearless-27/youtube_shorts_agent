/* =========================================================
   SECTION TRANSITIONS: STM -> CCAP -> S3
   ScrollTrigger rAF Eased Pinning and Fading
   ========================================================= */

    document.addEventListener('DOMContentLoaded', () => {
      if (typeof gsap === 'undefined') return;

      const stm = document.getElementById('stm-section');
      const stmContent = stm ? stm.querySelector('.stm-content') : null;
      const ccap = document.getElementById('core-capabilities');
      const ccapOverlay = document.getElementById('ccap-exit-overlay');
      const ccapMain = ccap ? ccap.querySelector('main') : null;

      if (!stmContent && !ccapOverlay) return;

      let sectionTransitionsInitialized = false;
      function initSectionTransitions() {
        if (sectionTransitionsInitialized) return;
        sectionTransitionsInitialized = true;

        function _ease(t) {
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        /* ── STM EXIT: content scales + fades out as stm scrolls off top ── */
        if (stm && stmContent && typeof ScrollTrigger !== 'undefined') {
          ScrollTrigger.create({
            trigger: stm,
            start: 'bottom bottom',
            end: 'bottom top',
            scrub: 0.35,
            onUpdate: (self) => {
              const e = _ease(self.progress);
              gsap.set(stmContent, {
                scale: 1 - e * 0.04,
                y: -e * 18,
                opacity: 1 - e * 0.78,
                force3D: true
              });
            }
          });
        }

        /* ── CCAP EXIT: overlay darkens + main content pulls back ── */
        if (ccap && ccapOverlay && ccapMain && typeof ScrollTrigger !== 'undefined') {
          const setCcapOverlayOpacity = gsap.quickSetter(ccapOverlay, 'opacity');
          const setCcapMainScale = gsap.quickSetter(ccapMain, 'scale');
          const setCcapMainY = gsap.quickSetter(ccapMain, 'y', 'px');
          ScrollTrigger.create({
            trigger: ccap,
            start: 'bottom bottom',
            end: 'bottom top',
            scrub: 0.35,
            onUpdate: (self) => {
              const e = _ease(self.progress);
              setCcapOverlayOpacity(e * 0.74);
              setCcapMainScale(1 - e * 0.046);
              setCcapMainY(-e * 24);
            }
          });
        }

      }

      const transitionTarget = stm || ccap;
      if (!transitionTarget || !('IntersectionObserver' in window)) {
        initSectionTransitions();
        return;
      }

      const leadPx = 2200;
      const transitionObserver = new IntersectionObserver((entries) => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        transitionObserver.disconnect();
        initSectionTransitions();
      }, { rootMargin: `${leadPx}px 0px` });
      transitionObserver.observe(transitionTarget);

    });
