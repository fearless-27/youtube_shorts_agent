// Pointer and hover capability detection & auxiliary plugin loader

    (function () {
      if (window.matchMedia && window.matchMedia('(hover:none),(pointer:coarse)').matches) return;
      ['js/Flip.min.js', 'js/ScrambleTextPlugin.min.js'].forEach(function (src) {
        var s = document.createElement('script'); s.src = src; s.defer = true;
        document.head.appendChild(s);
      });
    })();
