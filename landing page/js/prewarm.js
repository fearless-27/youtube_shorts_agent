// LCP booster: Hero slide-0 video prewarm & cache accelerator

    (function () {
      var isDesktop = !!(window.matchMedia && window.matchMedia('(min-width: 768px)').matches);
      var src = 'videos/bg1.mp4';
      var v = document.createElement('video');
      v.src = src;
      v.preload = 'auto';
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.setAttribute('aria-hidden', 'true');
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      // 手機版直接給 autoplay 屬性，確保 iOS Safari / Android Chrome 無需使用者互動即可播放
      if (!isDesktop) { v.autoplay = true; v.setAttribute('autoplay', ''); }
      // 放在 viewport 內讓 browser 給高優先級（非 Idle），避免被降速
      v.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;z-index:-1';
      // <body> 還沒就先掛在 documentElement;DOMContentLoaded 後再搬到 body 確保正常清理
      (document.body || document.documentElement).appendChild(v);
      v.load(); // 顯式觸發載入,確保 Range request 進 HTTP cache
      var playPromise = v.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () { });
      // 🎯 把 prewarm element 暴露給 WebGLManager 複用：index=0 直接用這個已在 decode 的 element，
      //    省去第二個 <video> 從零 demux/decode 第一幀的延遲，消除 uTexReady=0 的黑屏空窗。
      window._prewarmVideo = { el: v, src: src };
      // prewarm 由 WebGLManager 接管後不再自動清除；若 8 秒後仍無人認領則正常清理。
      // 🛡️ 但若 (a) 它已被升格為 hero 可見背景（dataset.ndPromoted），或
      //         (b) DOMContentLoaded 還沒發生（慢速網路 defer scripts 還在載），
      //    就不能移除，否則會把使用者正在看的背景拔掉造成黑屏。
      (function scheduleCleanup() {
        window.setTimeout(function () {
          if (!(window._prewarmVideo && window._prewarmVideo.el === v)) return; // 已被認領
          if (v.dataset.ndPromoted === '1' || document.readyState === 'loading') {
            scheduleCleanup(); // 還在用 / 頁面還沒 ready → 再等 8 秒重查
            return;
          }
          window._prewarmVideo = null;
          if (v && v.parentNode) {
            v.removeAttribute('src');
            try { v.load(); } catch (_) { }
            v.parentNode.removeChild(v);
          }
        }, 8000);
      })();
    })();
