// Lazy video & image intersection observer and hydration

        (function () {
          // 🎯 走訪 ancestor 確認元素真的會被渲染。被 display:none 蓋住的影片
          //    (例如桌機看到的 .mobile-cube-section 內的 video)直接跳過,
          //    避免桌機載入手機素材、手機載入桌機素材造成的重複頻寬浪費。
          function isVideoRenderable(video) {
            if (!video || !video.isConnected) return false;
            try {
              if (typeof video.checkVisibility === 'function') {
                return video.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
              }
              var node = video;
              while (node && node !== document.body) {
                var s = window.getComputedStyle(node);
                if (s.display === 'none') return false;
                node = node.parentElement;
              }
            } catch (_) { }
            return true;
          }

          function hydrateVideo(video) {
            if (!video || video.dataset.videoHydrated === 'true') return;
            // 不會被渲染的影片(被 CSS 隱藏)直接跳過,留待之後 viewport 變化或主動觸發
            if (!isVideoRenderable(video)) return;
            video.dataset.videoHydrated = 'true';

            video.querySelectorAll('source[data-src]').forEach(function (source) {
              source.src = source.dataset.src;
            });
            if (video.dataset.src) video.src = video.dataset.src;

            video.load();
            if (video.autoplay || video.hasAttribute('autoplay')) {
              var tryPlay = function () { video.play().catch(function () { }); };
              if (video.readyState >= 2) tryPlay();
              else video.addEventListener('canplay', tryPlay, { once: true });
            }
          }

          function hydrateDeferredImage(img) {
            if (!img || img.dataset.imageHydrated === 'true') return;
            var nextSrc = img.dataset.deferSrc;
            if (!nextSrc) return;
            img.dataset.imageHydrated = 'true';
            img.src = nextSrc;
            img.removeAttribute('data-defer-src');
          }

          function isPriorityVideo(video) {
            if (!video) return false;
            if (video.dataset.lazyPriority === 'high') return true;
            return false;
          }

          document.addEventListener('DOMContentLoaded', function () {
            var videos = Array.prototype.slice.call(document.querySelectorAll('video[data-lazy-video]'));
            var scrollDeferredImages = Array.prototype.slice.call(document.querySelectorAll('img[data-defer-src]'));

            var priorityVideos = [];
            var deferredVideos = [];
            var scrollDeferredVideos = [];

            videos.forEach(function (video) {
              if (video.dataset.lazyOnScroll === 'true') {
                scrollDeferredVideos.push(video);
                return;
              }
              if (isPriorityVideo(video)) priorityVideos.push(video);
              else deferredVideos.push(video);
            });

            priorityVideos.forEach(function (video) {
              requestAnimationFrame(function () { hydrateVideo(video); });
            });

            var requestScrollMediaIdle = window.requestIdleCallback
              ? window.requestIdleCallback.bind(window)
              : function (callback) { return setTimeout(callback, 1200); };

            function hydrateScrollMedia() {
              // 🎯 分幀串流 hydrate：把影片解碼與大圖 GPU 上傳分散到數幀,避開首次滾動 long task。
              var videoQueue = scrollDeferredVideos.slice();
              var imageQueue = scrollDeferredImages.slice();
              scrollDeferredVideos.length = 0;
              scrollDeferredImages.length = 0;

              function pump() {
                if (videoQueue.length) {
                  hydrateVideo(videoQueue.shift());
                }
                for (var i = 0; i < 2 && imageQueue.length; i++) {
                  hydrateDeferredImage(imageQueue.shift());
                }
                if (videoQueue.length || imageQueue.length) {
                  requestAnimationFrame(pump);
                }
              }

              requestAnimationFrame(pump);
            }

            if (scrollDeferredVideos.length || scrollDeferredImages.length) {
              var didHydrateScrollMedia = false;
              var activateScrollMedia = function () {
                if (didHydrateScrollMedia) return;
                didHydrateScrollMedia = true;
                window.removeEventListener('scroll', activateOnScroll);
                window.removeEventListener('keydown', activateOnKey);
                requestAnimationFrame(hydrateScrollMedia);
              };
              var activateOnScroll = function () {
                var scrollY = window._lenis ? window._lenis.scroll : window.scrollY;
                if (scrollY <= 8) return;
                activateScrollMedia();
              };
              var activateOnKey = function (event) {
                if (!/^(ArrowDown|PageDown|Space|End)$/.test(event.code || '')) return;
                activateScrollMedia();
              };

              // 🎯 原本手機是 requestAnimationFrame 立刻 activate(等同沒 lazy),
              //    桌機是 load+2.5s preheat — 兩者都會在 hero 影片還在下載時搶頻寬。
              //    改成統一延後到 load + 5s,讓 hero 第一張影片優先吃滿頻寬;
              //    若使用者在那之前先滾動 / 滑鼠滾輪 / 觸控,既有監聽器會立刻啟動。
              document.addEventListener('nudot:activate-scroll-media', activateScrollMedia, { once: true });
              window.addEventListener('wheel', activateScrollMedia, { passive: true, once: true });
              window.addEventListener('touchstart', activateScrollMedia, { passive: true, once: true });
              window.addEventListener('keydown', activateOnKey);
              window.addEventListener('scroll', activateOnScroll, { passive: true });
              requestAnimationFrame(activateOnScroll);

              // 自動預熱：loader 消失後 5s（讓 hero 影片先吃頻寬），才自動 activate。
              // 使用者若在那之前滾動／觸控／滾輪，上面的監聽器會立刻啟動。
              var autoActivateDelay = 5000;
              var autoActivateTimer = setTimeout(function () {
                document.dispatchEvent(new Event('nudot:activate-scroll-media'));
              }, autoActivateDelay);
              document.addEventListener('nudot:activate-scroll-media', function () {
                clearTimeout(autoActivateTimer);
              }, { once: true });
            }

            if (deferredVideos.length && 'IntersectionObserver' in window) {
              var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                  if (!entry.isIntersecting) return;
                  hydrateVideo(entry.target);
                  observer.unobserve(entry.target);
                });
              }, { rootMargin: '280px 0px 420px 0px' });

              deferredVideos.forEach(function (video) { observer.observe(video); });
            } else if (deferredVideos.length) {
              setTimeout(function () {
                deferredVideos.forEach(hydrateVideo);
              }, 1200);
            }
          });
        })();
