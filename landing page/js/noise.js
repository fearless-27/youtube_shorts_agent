/**
 * Nudot Film Grain Canvas
 * Lightweight procedural noise generator
 */
(function () {
  var canvas = document.getElementById('film-grain-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var width = 0, height = 0;
  var noiseData = null;

  function resize() {
    width = canvas.width = Math.min(window.innerWidth, 1920) / 2;
    height = canvas.height = Math.min(window.innerHeight, 1080) / 2;
    try {
      noiseData = ctx.createImageData(width, height);
    } catch (_) {}
  }

  function generateNoise() {
    if (!noiseData) return;
    var data = noiseData.data;
    var len = data.length;
    for (var i = 0; i < len; i += 4) {
      var val = (Math.random() * 255) | 0;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 18; // subtle opacity
    }
    ctx.putImageData(noiseData, 0, 0);
  }

  var animId = null;
  var fps = 24;
  var now, then = Date.now(), interval = 1000 / fps, delta;

  function loop() {
    animId = requestAnimationFrame(loop);
    now = Date.now();
    delta = now - then;
    if (delta > interval) {
      then = now - (delta % interval);
      generateNoise();
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  loop();
})();
