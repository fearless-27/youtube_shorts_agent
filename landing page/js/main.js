/* =========================================================
   MAIN INTERACTIVE APP
   Slideshow Logic, WebGL Manager, Lenis Smooth Scroll & Audio
   ========================================================= */

    // =========================================================
    // SLIDESHOW LOGIC (Variables)
    // =========================================================
    const NEXT = 1;
    const PREV = -1;

    let currentHoveredThumb = null;
    let mouseOverThumbnails = false;
    let lastHoveredThumbIndex = null;
    let heroSlides = [];
    let heroSlideCount = 0;
    let dragLinesCache = null;
    let webglManager = null;

    let isAnimating = false;
    let pendingNavigation = null;
    let sliderLocked = false;

    function ensureTopAndLock() {
      if (window.scrollY > 0) {
        // 🎯 優先走 Lenis,跟全站滾動引擎一致;沒 Lenis 才 fallback 原生
        if (window._lenis) window._lenis.scrollTo(0, { duration: 1.2 });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function updateNavigationUI(disabled) {
      document.querySelectorAll(".counter-nav, .slide-thumb").forEach(el => {
        el.style.opacity = disabled && el.classList.contains('counter-nav') ? "0.3" : "";
        el.style.pointerEvents = disabled ? "none" : "auto";
      });
    }

    function updateSlideCounter(index) {
      const el = document.querySelector(".current-slide");
      if (el) el.textContent = String(index + 1).padStart(2, "0");
    }

    const HERO_MOBILE_MEDIA_QUERY = "(max-width: 767px)";

    function shouldUseMobileHeroMedia() {
      if (window.matchMedia) return window.matchMedia(HERO_MOBILE_MEDIA_QUERY).matches;
      return window.innerWidth <= 767;
    }

    function readHeroMediaAttr(el, key) {
      return (el.dataset[key] || "").trim();
    }

    function collectHeroSlides() {
      const useMobileMedia = shouldUseMobileHeroMedia();

      return Array.from(document.querySelectorAll(".slide__img"))
        .map((el, index) => {
          const desktopImage = readHeroMediaAttr(el, "image");
          const desktopVideo = readHeroMediaAttr(el, "video");
          const desktopThumb = readHeroMediaAttr(el, "thumb");
          const mobileImage = readHeroMediaAttr(el, "mobileImage");
          const mobileVideo = readHeroMediaAttr(el, "mobileVideo");
          const mobileThumb = readHeroMediaAttr(el, "mobileThumb");
          const hasMobileAsset = Boolean(mobileImage || mobileVideo);
          const assetUrl = useMobileMedia && hasMobileAsset
            ? (mobileVideo || mobileImage)
            : (desktopVideo || desktopImage);

          if (!assetUrl) return null;

          const isVideo = /\.(mp4|webm|ogg|m3u8)$/i.test(assetUrl);
          const thumbUrl = useMobileMedia
            ? (mobileThumb || mobileImage || desktopThumb || desktopImage || (!isVideo ? assetUrl : ""))
            : (desktopThumb || mobileThumb || mobileImage || desktopImage || (!isVideo ? assetUrl : ""));

          return {
            assetUrl,
            thumbUrl,
            title: (el.dataset.title || `Slide ${String(index + 1).padStart(2, "0")}`).trim()
          };
        })
        .filter(Boolean);
    }

    function updateSlideTitle(index) {
      const container = document.querySelector(".slide-title-container");
      const current = document.querySelector(".slide-title");
      if (!container || !current) return;

      const newTitle = document.createElement("div");
      newTitle.className = "slide-title enter-up";
      newTitle.textContent = heroSlides[index]?.title || "";

      container.appendChild(newTitle);
      current.classList.add("exit-up");

      requestAnimationFrame(() => newTitle.classList.remove("enter-up"));
      setTimeout(() => current.remove(), 500);
    }

    // 🎯 效能快取:line-base-height CSS var 只需讀取一次,避免重複 getComputedStyle
    let _lineBaseHeight = 15;
    try {
      const _rootStyle = getComputedStyle(document.documentElement);
      _lineBaseHeight = parseInt(_rootStyle.getPropertyValue("--line-base-height")) || 15;
    } catch (e) { }

    function updateDragLines(activeIndex, forceUpdate = false) {
      const lines = dragLinesCache || Array.from(document.querySelectorAll(".drag-line"));
      if (!lines.length) return;

      lines.forEach(line => {
        line.style.height = "var(--line-base-height)";
        line.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
      });

      if (activeIndex === null) return;

      const thumbWidth = 720 / Math.max(heroSlideCount || heroSlides.length || 1, 1);
      const centerPosition = (activeIndex + 0.5) * thumbWidth;
      const lineWidth = 720 / lines.length;

      // 🎯 效能優化:因 CSS 上已有 transition-delay 效果,這裡直接同步寫入,
      //    移除 60 個 setTimeout 造成的 timer overhead 與閉包記憶體壓力
      lines.forEach((line, i) => {
        const linePosition = (i + 0.5) * lineWidth;
        const distFromCenter = Math.abs(linePosition - centerPosition);
        const maxDistance = thumbWidth * 0.7;

        if (distFromCenter <= maxDistance) {
          const normalizedDist = distFromCenter / maxDistance;
          const waveHeight = Math.cos((normalizedDist * Math.PI) / 2);
          const height = _lineBaseHeight + waveHeight * 35;
          const opacity = 0.3 + waveHeight * 0.4;

          // CSS 的 cubic-bezier transition 本身就會產生波浪進場效果,不需 setTimeout
          line.style.transitionDelay = `${normalizedDist * 0.08}s`;
          line.style.height = `${height}px`;
          line.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
        } else {
          line.style.transitionDelay = '0s';
        }
      });
    }

    function getOptimalDPR() {
      const dpr = window.devicePixelRatio || 1;
      const mem = navigator.deviceMemory || 8;
      if (mem <= 4) return 1;
      if (window.innerWidth <= 768) return Math.min(dpr, 1.5);
      return Math.min(dpr, 2);
    }

    // =========================================================
    // HLS Helper — 讓 HLS (.m3u8) 影片無縫融入 WebGLManager
    // =========================================================
    /**
     * 將 HLS 串流附加到 <video> 元素。
     * 執行順序優先級：
     *   1. Safari / iOS — 原生支援 HLS，直接設定 vid.src
     *   2. Chrome / Firefox / Edge — 透過 hls.js 軟解
     *   3. 萬用 fallback — 嘗試同名 .mp4（server 端需準備好 fallback）
     */
    function attachHLSToVideo(vid, hlsUrl) {
      // ① Safari / iOS 原生 HLS
      if (vid.canPlayType('application/vnd.apple.mpegurl')) {
        vid.src = hlsUrl;
        return;
      }
      // ② hls.js（Chrome / Firefox / Edge）
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,       // 預緩衝 30 秒
          maxMaxBufferLength: 60,
          startLevel: -1,            // ABR：自動選畫質（-1 = auto）
          autoStartLoad: true,
          enableWorker: true,
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(vid);
        vid._hls = hls;             // 保存參照供 cleanup 使用
        return;
      }
      // ③ 最終 fallback：把 .m3u8 換成 .mp4（需 server 同時提供）
      const mp4 = hlsUrl.replace(/\.m3u8(\?.*)?$/i, '.mp4');
      if (mp4 !== hlsUrl) vid.src = mp4;
    }

    // =========================================================
    // WebGL Ultra-Premium Manager
    // =========================================================
    class WebGLManager {
      constructor(containerId, imageUrls) {
        this.container = document.getElementById(containerId);
        this.imageUrls = imageUrls;
        this.textures = [];
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.renderer = null;
        this.isSupported = false;

        // Pre-probe WebGL context availability before Three.js
        try {
          const canvas = document.createElement('canvas');
          let gl = null;
          for (const ctxType of ['webgl2', 'webgl', 'experimental-webgl']) {
            try {
              gl = canvas.getContext(ctxType, {
                alpha: true,
                antialias: false,
                powerPreference: 'default',
                failIfMajorPerformanceCaveat: false
              });
            } catch (_) {}
            if (gl) break;
          }

          if (gl) {
            // Pass the pre-created canvas + context so Three.js won't try to create its own
            this.renderer = new THREE.WebGLRenderer({
              canvas: canvas,
              context: gl,
              antialias: false,
              alpha: true
            });
            canvas.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              console.warn("WebGL context lost for hero slideshow, switching to fallback.");
              this.isSupported = false;
              this.initFallbackHero();
            }, false);
            this.isSupported = true;
          }
        } catch (err) {
          console.warn("WebGL context could not be created for hero slideshow, using video/image fallback:", err);
        }

        if (!this.isSupported || !this.renderer) {
          // Build a pure CSS/video fallback hero slideshow
          this.initFallbackHero();
          return;
        }

        this.renderPaused = false;
        this.activeTextureIndex = 0;
        this.textureLoader = new THREE.TextureLoader();
        this.texturePromises = {};
        this.videoEls = {};
        this.textureResolutions = {};
        this.isAudioEnabled = false;

        const initialRenderSize = this.getRenderSize();

        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(initialRenderSize.width, initialRenderSize.height);
        if (this.container) this.container.appendChild(this.renderer.domElement);

        this.mouse = new THREE.Vector2(0, 0);
        this.targetMouse = new THREE.Vector2(0, 0);

        this.initShader();
        this.loadTextures();
        this.initAudioControls();

        this._resizeRaf = 0;
        this._boundResize = () => {
          if (this._resizeRaf) return;
          this._resizeRaf = requestAnimationFrame(() => {
            this._resizeRaf = 0;
            this.onResize();
          });
        };

        window.addEventListener('resize', this._boundResize, { passive: true });
        window.addEventListener('mousemove', this.onMouseMove.bind(this), { passive: true });
      }

      /**
       * Pure CSS/HTML fallback for hero when WebGL is unavailable.
       * Renders video/image slides with opacity crossfade transitions.
       */
      initFallbackHero() {
        if (!this.container) return;
        this.container.innerHTML = "";
        this._fallbackActive = true;
        this._fallbackIndex = 0;

        // Create a stack of absolutely positioned slide layers
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:hidden;";

        this._fallbackSlides = [];
        this.imageUrls.forEach((url, i) => {
          const layer = document.createElement("div");
          layer.style.cssText = `position:absolute;inset:0;width:100%;height:100%;opacity:${i === 0 ? 1 : 0};transition:opacity 1.2s cubic-bezier(0.77,0,0.175,1);z-index:${i === 0 ? 2 : 1};`;

          if (/\.(mp4|webm|ogg)$/i.test(url)) {
            const video = document.createElement("video");
            video.src = url;
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.style.cssText = "width:100%;height:100%;object-fit:cover;";
            video.play().catch(() => {});
            layer.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = url;
            img.alt = `Slide ${i + 1}`;
            img.style.cssText = "width:100%;height:100%;object-fit:cover;";
            img.loading = i === 0 ? "eager" : "lazy";
            layer.appendChild(img);
          }

          wrapper.appendChild(layer);
          this._fallbackSlides.push(layer);
        });

        this.container.appendChild(wrapper);
        this.initAudioControls();

        // Stub methods that external code (Slideshow, heroTl, etc.) calls on us
        this.preloadTexture = () => Promise.resolve(null);
        this.setRenderPaused = () => {};
        this.render = () => {};
      }

      /**
       * Fallback transition: simple opacity crossfade
       */
      transition(currentIndex, nextIndex, direction, onCompleteCallback) {
        if (this._fallbackActive) {
          // CSS crossfade fallback
          this._fallbackSlides.forEach((layer, i) => {
            layer.style.opacity = i === nextIndex ? "1" : "0";
            layer.style.zIndex = i === nextIndex ? "2" : "1";
          });
          this._fallbackIndex = nextIndex;
          this.updateAudioState();
          setTimeout(() => { if (onCompleteCallback) onCompleteCallback(); }, 1300);
          return;
        }
        this._transitionWebGL(currentIndex, nextIndex, direction, onCompleteCallback);
      }

      getRenderSize() {
        if (!this.container) {
          return {
            width: window.innerWidth,
            height: window.innerHeight
          };
        }

        const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth));
        const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight));

        return { width, height };
      }

      onMouseMove(e) {
        this.targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }

      initShader() {
        const initialRenderSize = this.getRenderSize();
        const vertexShader = `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `;

        const fragmentShader = `
          uniform sampler2D uTex1;
          uniform sampler2D uTex2;
          uniform float uProgress;
          uniform float uDirection;
          uniform float uTexReady;
          uniform vec2 uResolution;
          uniform vec2 uImageResolution;   // tex1's intrinsic resolution
          uniform vec2 uImageResolution2;  // tex2's intrinsic resolution
          uniform vec2 uMouse;
          varying vec2 vUv;

          vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
          float snoise(vec2 v){
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod(i, 289.0);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m ; m = m*m ;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }

          // 🎯 修正手機輪播圖片變形 0.5s bug:
          //    原本兩張圖共用同一組 ratio,導致桌機/手機素材切換時(長寬比不同),
          //    新圖會被舊圖的比例壓扁,等 transition 結束才彈回。
          //    現在每張圖都依自己的 uImageResolution 計算 cover ratio。
          //    使用 coord 避免在 WebGL 2 (GLSL 3.00 es) 中遮蔽 global varying vUv 導致 35715 LINK_STATUS 失敗
          vec2 fitCover(vec2 coord, vec2 imgRes) {
            vec2 safeRes = max(imgRes, vec2(1.0, 1.0));
            vec2 safeURes = max(uResolution, vec2(1.0, 1.0));
            vec2 ratio = vec2(
                min((safeURes.x / safeURes.y) / (safeRes.x / safeRes.y), 1.0),
                min((safeURes.y / safeURes.x) / (safeRes.y / safeRes.x), 1.0)
            );
            return vec2(
                coord.x * ratio.x + (1.0 - ratio.x) * 0.5,
                coord.y * ratio.y + (1.0 - ratio.y) * 0.5
            );
          }

          void main() {
            vec2 uvA = fitCover(vUv, uImageResolution);
            vec2 uvB = fitCover(vUv, uImageResolution2);

            uvA = (uvA - 0.5) * 0.95 + 0.5;
            uvA -= uMouse * 0.015;
            uvB = (uvB - 0.5) * 0.95 + 0.5;
            uvB -= uMouse * 0.015;

            float p = uProgress;

            vec2 uvNoise = mix(uvA, uvB, 0.5);
            float noiseVal = (p > 0.001 && p < 0.999) ? snoise(uvNoise * 3.0 + p * 2.0) : 0.0;
            float warp = noiseVal * p * (1.0 - p) * 0.3;

            vec2 center = vec2(0.5, 0.5);
            vec2 uv1 = mix(uvA, center, p * 0.15) + vec2(0.0, uDirection * p * 0.3) + warp;
            vec2 uv2 = mix(uvB, center, (1.0 - p) * 0.15) - vec2(0.0, uDirection * (1.0 - p) * 0.3) + warp;

            float shift = 0.04 * p * (1.0 - p) * (noiseVal + 1.0);

            vec4 t1 = vec4(
                texture2D(uTex1, uv1 + vec2(shift, 0.0)).r,
                texture2D(uTex1, uv1).g,
                texture2D(uTex1, uv1 - vec2(shift, 0.0)).b,
                1.0
            );

            vec4 t2 = vec4(
                texture2D(uTex2, uv2 + vec2(shift, 0.0)).r,
                texture2D(uTex2, uv2).g,
                texture2D(uTex2, uv2 - vec2(shift, 0.0)).b,
                1.0
            );

            // 影片紋理未就緒時輸出透明，讓底層 poster 顯示
            if (uTexReady < 0.5) { gl_FragColor = vec4(0.0); return; }
            gl_FragColor = mix(t1, t2, smoothstep(0.0, 1.0, p));
          }
        `;

        this.material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            uTex1: { value: null },
            uTex2: { value: null },
            uProgress: { value: 0 },
            uDirection: { value: 1 },
            uTexReady: { value: 0 },
            uResolution: { value: new THREE.Vector2(initialRenderSize.width, initialRenderSize.height) },
            uImageResolution: { value: new THREE.Vector2(1920, 1080) },   // for uTex1
            uImageResolution2: { value: new THREE.Vector2(1920, 1080) },  // for uTex2
            uMouse: { value: new THREE.Vector2(0, 0) }
          }
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(this.mesh);
      }

      loadTextures() {
        this.loadTextureAt(0);
        if (this.imageUrls.length > 1) {
          requestAnimationFrame(() => this.loadTextureAt(1));
        }
      }

      rememberTextureResolution(index, width, height) {
        if (!width || !height) return;
        this.textureResolutions[index] = { width, height };
        // 同步把這張紋理的解析度寫進對應 slot,避免動畫進行中突然切換 ratio。
        if (index === this.activeTextureIndex) {
          this.applyTextureResolution(index, null, 1);
          // 若 uTex2 也指向同一張(初始狀態),把 slot2 一併補上,避免第一次切換還沒拿到 nextRes 時被擠壓
          this.applyTextureResolution(index, null, 2);
        }
      }

      applyTextureResolution(index, texture, slot) {
        // slot: 1 → uImageResolution (對應 uTex1);2 → uImageResolution2 (對應 uTex2)
        const targetSlot = slot === 2 ? 2 : 1;
        const uniformName = targetSlot === 2 ? 'uImageResolution2' : 'uImageResolution';
        const resolution = this.textureResolutions[index];
        if (resolution) {
          this.material.uniforms[uniformName].value.set(resolution.width, resolution.height);
          return;
        }
        if (texture && texture.image && texture.image.width && texture.image.height) {
          this.material.uniforms[uniformName].value.set(texture.image.width, texture.image.height);
        }
      }

      loadTextureAt(index) {
        if (this.texturePromises[index]) return this.texturePromises[index];
        if (this.textures[index]) return Promise.resolve(this.textures[index]);

        const url = this.imageUrls[index];
        if (!url) return Promise.resolve(null);

        if (/\.(mp4|webm|ogg|m3u8)$/i.test(url)) {
          this.texturePromises[index] = new Promise((resolve) => {
            // 🎯 index=0 嘗試複用 prewarm video element（已在 decode，readyState 通常 >= 2）
            //    複用成功 → 跳過二次 decode，uTexReady 可立刻設 1，徹底消除黑屏空窗。
            let vid;
            const prewarm = window._prewarmVideo;
            const canReuse = index === 0 && prewarm && prewarm.el && prewarm.src === url && !/\.m3u8/i.test(url);
            if (canReuse) {
              vid = prewarm.el;
              window._prewarmVideo = null; // 認領，阻止 8s timer 清除
              vid.loop = true;
              // ⚠️ 修正：不在這裡立刻縮成 1×1！
              //    原本的寫法會在 texture 還沒 ready（readyState < 2，影片還在下載）時
              //    就把 promotePrwarmToHeroBg 升格的可見背景縮掉 → hero 變回 #000 黑屏，
              //    整個「治本」流程被自己下一行同步打掉。
              //    改成：維持 hero 背景可見，等 resolveTexture（uTexReady=1）後
              //    再等 2 個 RAF（確保 WebGL canvas 已實際畫出第一幀）才縮小收進 container。
            } else {
              vid = document.createElement('video');
              // 先設定所有播放屬性，再掛入 src / HLS，確保 iOS Safari autoplay policy 能命中
              vid.loop = true;
              vid.muted = true;
              vid.playsInline = true;
              vid.preload = 'auto';
              vid.setAttribute('muted', '');
              vid.setAttribute('playsinline', '');
              vid.setAttribute('webkit-playsinline', '');
              // 手機版直接設 autoplay，確保 iOS / Android 能在無使用者互動下播放
              if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
                vid.autoplay = true;
                vid.setAttribute('autoplay', '');
              }
              // 掛入 src：HLS (.m3u8) 走 attachHLSToVideo()，其餘直接設 src
              if (/\.m3u8(\?.*)?$/i.test(url)) {
                attachHLSToVideo(vid, url);
              } else {
                vid.src = url;
              }
              this.container.appendChild(vid);
              vid.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
            } // end else (new video element)
            this.videoEls[index] = vid;
            const texture = new THREE.VideoTexture(vid);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            this.textures[index] = texture;
            const rememberVideoResolution = () => {
              this.rememberTextureResolution(index, vid.videoWidth || 1920, vid.videoHeight || 1080);
            };
            vid.addEventListener('loadedmetadata', rememberVideoResolution, { once: true });
            let didResolveTexture = false;
            let textureFallbackTimer = null;
            const clearTextureFallback = () => {
              if (!textureFallbackTimer) return;
              clearTimeout(textureFallbackTimer);
              textureFallbackTimer = null;
            };
            const resolveTexture = () => {
              if (didResolveTexture) return;
              didResolveTexture = true;
              clearTextureFallback();
              rememberVideoResolution();
              if (index === 0) {
                this.material.uniforms.uTex1.value = texture;
                this.material.uniforms.uTexReady.value = 1;
                this.applyTextureResolution(index, texture, 1);
                // 初始時 uTex2 還沒綁紋理,把 slot2 也補上同一比例,避免第一次切換瞬間的壓扁
                this.applyTextureResolution(index, texture, 2);
              }
              // 🎯 reuse 路徑：紋理 ready 後再等 2 個 RAF（GSAP ticker 已用新 uTexReady 畫出至少一幀），
              //    才把 hero 背景影片縮成 1×1 收進 webgl container → 全程無黑屏空窗。
              if (canReuse && index === 0) {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  vid.dataset.ndPromoted = '';
                  vid.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
                  try { this.container.appendChild(vid); } catch (_) { }
                }));
              }
              resolve(texture);
            };
            const resolveEmptyTexture = () => {
              if (didResolveTexture) return;
              didResolveTexture = true;
              clearTextureFallback();
              resolve(null);
            };
            // ⚠️ 修正：原本 2.5 秒後無條件 resolveTexture() 會在影片連第一幀都還沒有
            //    （readyState < 2）時就把 uTexReady 設 1 → shader 取樣空白 VideoTexture → 黑屏。
            //    改成輪詢：時間到了但幀還沒好就每 400ms 再檢查，等到 readyState >= 2 才 resolve。
            const fallbackTick = () => {
              textureFallbackTimer = null;
              if (didResolveTexture) return;
              if (vid.readyState >= 2) { resolveTexture(); return; }
              textureFallbackTimer = setTimeout(fallbackTick, 400);
            };
            textureFallbackTimer = setTimeout(fallbackTick, 2500);
            if (vid.readyState >= 2) resolveTexture();
            else vid.addEventListener('loadeddata', resolveTexture, { once: true });
            vid.addEventListener('error', resolveEmptyTexture, { once: true });
            // hls.js 自己管理載入流程，不需要也不該呼叫 vid.load()（會重置串流）
            if (vid.readyState === 0 && !vid._hls) vid.load();
            if (index === 0) this._safePlay(vid);
          });
          return this.texturePromises[index];
        }

        this.texturePromises[index] = new Promise((resolve) => {
          this.textureLoader.load(
            url,
            (texture) => {
              texture.generateMipmaps = true;
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              this.textures[index] = texture;
              if (texture.image) {
                this.rememberTextureResolution(index, texture.image.width, texture.image.height);
              }
              if (index === 0) {
                this.material.uniforms.uTex1.value = texture;
                this.applyTextureResolution(index, texture, 1);
                // 同步補上 slot2,讓第一次切換前的渲染就以正確比例顯示
                this.applyTextureResolution(index, texture, 2);
              }
              resolve(texture);
            },
            undefined,
            () => resolve(null)
          );
        });
        return this.texturePromises[index];
      }

      preloadTexture(index) {
        return this.loadTextureAt(index);
      }

      _safePlay(vid) {
        if (!vid) return;
        const playPromise = vid.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function (e) {
            if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
              vid.addEventListener('canplay', function onCanPlay() {
                vid.removeEventListener('canplay', onCanPlay);
                vid.play().catch(function () { });
              }, { once: true });
            }
          });
        }
      }

      initAudioControls() {
        const btn = document.getElementById('hero-audio-toggle');
        if (!btn || btn.dataset.audioBound === 'true') return;
        btn.dataset.audioBound = 'true';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.isAudioEnabled = !this.isAudioEnabled;
          this.updateAudioState();
        });
        this.updateAudioState();
      }

      updateAudioState() {
        const currentIdx = Number(this.activeTextureIndex);
        const shouldPlayAudio = Boolean(this.isAudioEnabled && !this.renderPaused);

        // Update all background video elements in WebGLManager
        Object.keys(this.videoEls || {}).forEach((key) => {
          const vid = this.videoEls[key];
          if (!vid) return;
          if (shouldPlayAudio && Number(key) === currentIdx) {
            vid.muted = false;
            vid.volume = 1.0;
            if (vid.paused) this._safePlay(vid);
          } else {
            vid.muted = true;
          }
        });

        // Update fallback slides if fallback mode is active
        if (this._fallbackActive && Array.isArray(this._fallbackSlides)) {
          this._fallbackSlides.forEach((layer, i) => {
            const fVid = layer.querySelector('video');
            if (!fVid) return;
            if (shouldPlayAudio && i === this._fallbackIndex) {
              fVid.muted = false;
              fVid.volume = 1.0;
              if (fVid.paused) fVid.play().catch(() => {});
            } else {
              fVid.muted = true;
            }
          });
        }

        // Update UI Button and text label
        const btn = document.getElementById('hero-audio-toggle');
        const label = document.getElementById('hero-audio-label');
        if (btn) {
          btn.setAttribute('data-state', shouldPlayAudio ? 'playing' : 'muted');
          btn.classList.toggle('is-playing', shouldPlayAudio);
          btn.setAttribute('aria-label', shouldPlayAudio ? 'Mute background video sound' : 'Unmute background video sound');
        }
        if (label) {
          label.textContent = shouldPlayAudio ? 'SOUND // ON' : 'SOUND // OFF';
        }
      }

      syncVideoPlayback() {
        const active = this.renderPaused
          ? new Set()
          : new Set(Array.prototype.slice.call(arguments).map(Number));
        Object.keys(this.videoEls || {}).forEach((key) => {
          const vid = this.videoEls[key];
          if (!vid) return;
          if (active.has(Number(key))) {
            this._safePlay(vid);
          } else if (!vid.paused) {
            vid.pause();
          }
        });
        this.updateAudioState();
      }

      setRenderPaused(paused) {
        if (this.renderPaused === paused) return;
        this.renderPaused = paused;
        if (this.container) this.container.style.visibility = paused ? 'hidden' : '';
        const audioBtn = document.getElementById('hero-audio-toggle');
        if (audioBtn) {
          audioBtn.style.opacity = paused ? '0' : '1';
          audioBtn.style.pointerEvents = paused ? 'none' : 'auto';
        }
        if (paused) this.syncVideoPlayback();
        else this.syncVideoPlayback(this.activeTextureIndex);
      }

      onResize() {
        if (!this.renderer) return;
        const nextRenderSize = this.getRenderSize();
        const nextDpr = window.devicePixelRatio || 1;
        if (this.renderer.getPixelRatio && this.renderer.getPixelRatio() !== nextDpr) {
          this.renderer.setPixelRatio(nextDpr);
        }
        this.renderer.setSize(nextRenderSize.width, nextRenderSize.height);
        if (this.material && this.material.uniforms && this.material.uniforms.uResolution) {
          this.material.uniforms.uResolution.value.set(nextRenderSize.width, nextRenderSize.height);
        }
      }

      render() {
        if (!this.renderer) return;
        // 🎯 dark-wrapper 蓋住首屏後,hero WebGL 不再可見;直接停 render 與影片 texture
        const scrollY = window._lenis && typeof window._lenis.scroll === 'number'
          ? window._lenis.scroll
          : window.scrollY;
        if (scrollY > window.innerHeight * 1.1) {
          this.setRenderPaused(true);
          return;
        }
        this.setRenderPaused(false);

        this.mouse.lerp(this.targetMouse, 0.05);
        if (this.material && this.material.uniforms) {
          this.material.uniforms.uMouse.value.copy(this.mouse);

          const t1 = this.material.uniforms.uTex1.value;
          const t2 = this.material.uniforms.uTex2.value;

          for (const idx in this.videoEls) {
            const vid = this.videoEls[idx];
            const tex = this.textures[idx];
            if (tex && (tex === t1 || tex === t2) && vid.readyState >= 2) {
              tex.needsUpdate = true;
            }
          }
        }
        this.renderer.render(this.scene, this.camera);
      }

      _transitionWebGL(currentIndex, nextIndex, direction, onCompleteCallback) {
        const transitionToken = {};
        this._transitionToken = transitionToken;

        Promise.all([
          this.loadTextureAt(currentIndex),
          this.loadTextureAt(nextIndex)
        ]).then(([currentTexture, nextTexture]) => {
          if (this._transitionToken !== transitionToken) return;
          if (!currentTexture || !nextTexture) {
            if (onCompleteCallback) onCompleteCallback();
            return;
          }

          this.material.uniforms.uTex1.value = currentTexture;
          this.material.uniforms.uTex2.value = nextTexture;
          // 🎯 同步把兩張紋理各自的解析度寫進對應 slot,避免動畫途中圖片被舊比例壓扁
          this.applyTextureResolution(currentIndex, currentTexture, 1);
          this.applyTextureResolution(nextIndex, nextTexture, 2);
          this.material.uniforms.uDirection.value = direction;
          this.material.uniforms.uProgress.value = 0;
          this.activeTextureIndex = currentIndex;
          this.syncVideoPlayback(currentIndex, nextIndex);

          gsap.to(this.material.uniforms.uProgress, {
            value: 1,
            duration: 1.4,
            ease: "expo.inOut",
            onComplete: () => {
              this.material.uniforms.uTex1.value = nextTexture;
              this.material.uniforms.uProgress.value = 0;
              this.activeTextureIndex = nextIndex;
              // uTex1 現在指向 nextTexture,同步把 slot1 的解析度更新成 next
              this.applyTextureResolution(nextIndex, nextTexture, 1);
              this.applyTextureResolution(nextIndex, nextTexture, 2);
              this.syncVideoPlayback(nextIndex);
              if (onCompleteCallback) onCompleteCallback();
            }
          });
        });
      }
    }

    class Slideshow {
      constructor(webglManager, totalSlides) {
        this.webgl = webglManager;
        this.current = 0;
        this.slidesTotal = totalSlides;
      }

      next() { this.navigate(NEXT); }
      prev() { this.navigate(PREV); }

      goTo(index) {
        if (isAnimating) {
          pendingNavigation = { type: "goto", index };
          return false;
        }
        if (index === this.current) return false;

        isAnimating = true;
        updateNavigationUI(true);

        const previous = this.current;
        this.current = index;
        const direction = index > previous ? 1 : -1;

        document.querySelectorAll(".slide-thumb").forEach((thumb, i) => thumb.classList.toggle("active", i === index));
        updateSlideCounter(index);
        updateSlideTitle(index);
        updateDragLines(index, true);

        this.webgl.transition(previous, this.current, direction, () => {
          isAnimating = false;
          updateNavigationUI(false);
          if (pendingNavigation) {
            const { type, index, direction } = pendingNavigation;
            pendingNavigation = null;
            setTimeout(() => type === "goto" ? this.goTo(index) : this.navigate(direction), 50);
          }
          const hoverIdx = (mouseOverThumbnails && lastHoveredThumbIndex !== null) ? lastHoveredThumbIndex : this.current;
          updateDragLines(hoverIdx, true);
        });
      }

      navigate(direction) {
        if (isAnimating) {
          pendingNavigation = { type: "navigate", direction };
          return false;
        }

        isAnimating = true;
        updateNavigationUI(true);

        const previous = this.current;
        this.current = direction === 1
          ? this.current < this.slidesTotal - 1 ? ++this.current : 0
          : this.current > 0 ? --this.current : this.slidesTotal - 1;

        document.querySelectorAll(".slide-thumb").forEach((thumb, index) => {
          thumb.classList.toggle("active", index === this.current);
        });
        updateSlideCounter(this.current);
        updateSlideTitle(this.current);
        updateDragLines(this.current, true);

        this.webgl.transition(previous, this.current, direction, () => {
          isAnimating = false;
          updateNavigationUI(false);
          if (pendingNavigation) {
            const { type, index, direction } = pendingNavigation;
            pendingNavigation = null;
            setTimeout(() => type === "goto" ? this.goTo(index) : this.navigate(direction), 50);
          }
          const hoverIdx2 = (mouseOverThumbnails && lastHoveredThumbIndex !== null) ? lastHoveredThumbIndex : this.current;
          updateDragLines(hoverIdx2, true);
        });
      }
    }

    // =========================================================
    // INITIALIZATION & SCROLL ANIMATION TIE-IN
    // =========================================================
    document.addEventListener("DOMContentLoaded", () => {

      let winW = window.innerWidth;
      let winH = window.innerHeight;
      const isMobileInit = winW <= 768;
      window.addEventListener('resize', () => {
        winW = window.innerWidth;
        winH = window.innerHeight;
      }, { passive: true });

      const HERO_RENDER_SLEEP_VH = 1.1;
      function getPerformanceScrollY() {
        return window._lenis && typeof window._lenis.scroll === 'number'
          ? window._lenis.scroll
          : window.scrollY;
      }
      function isHeroRenderSleeping() {
        return getPerformanceScrollY() > winH * HERO_RENDER_SLEEP_VH;
      }

      let heroSlideshowInitialized = false;
      function initHeroSlideshow() {
        if (heroSlideshowInitialized) return;

        heroSlides = collectHeroSlides();
        const imageUrls = heroSlides.map(slide => slide.assetUrl);
        const slideCount = imageUrls.length;

        if (!slideCount) return;
        heroSlideshowInitialized = true;
        heroSlideCount = slideCount;

        const initialTitle = document.querySelector(".slide-title");
        if (initialTitle) initialTitle.textContent = heroSlides[0].title;

        webglManager = new WebGLManager("webgl-container", imageUrls);
        const slideshow = new Slideshow(webglManager, slideCount);

        const thumbsContainer = document.querySelector(".slide-thumbs");
        if (thumbsContainer) {
          thumbsContainer.innerHTML = "";
          heroSlides.forEach((slide, index) => {
            const thumb = document.createElement("div");
            thumb.className = "slide-thumb";
            if (slide.thumbUrl) {
              thumb.style.backgroundImage = `url("${slide.thumbUrl}")`;
            } else if (/\.(mp4|webm|ogg)$/i.test(slide.assetUrl)) {
              thumb.style.background = '#111';
              thumb.innerHTML = '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;opacity:0.6;">&#9654;</span>';
            } else {
              thumb.style.backgroundImage = `url("${slide.assetUrl}")`;
            }
            if (index === 0) thumb.classList.add("active");

            thumb.addEventListener("click", () => {
              lastHoveredThumbIndex = index;
              webglManager?.preloadTexture(index);
              ensureTopAndLock();
              slideshow.goTo(index);
            });

            thumb.addEventListener("mouseenter", () => {
              currentHoveredThumb = index;
              lastHoveredThumbIndex = index;
              mouseOverThumbnails = true;
              webglManager?.preloadTexture(index);
              if (!isAnimating) updateDragLines(index, true);
            });

            thumb.addEventListener("mouseleave", () => {
              if (currentHoveredThumb === index) currentHoveredThumb = null;
            });

            thumbsContainer.appendChild(thumb);
          });
        }

        const dragIndicator = document.querySelector(".drag-indicator");
        if (dragIndicator) {
          dragIndicator.innerHTML = "";
          const linesContainer = document.createElement("div");
          linesContainer.className = "lines-container";
          dragIndicator.appendChild(linesContainer);
          dragLinesCache = [];
          for (let i = 0; i < 60; i++) {
            const line = document.createElement("div");
            line.className = "drag-line";
            linesContainer.appendChild(line);
            dragLinesCache.push(line);
          }
        }

        const totalSlidesEl = document.querySelector(".total-slides");
        if (totalSlidesEl) totalSlidesEl.textContent = String(slideCount).padStart(2, "0");
        document.documentElement.style.setProperty("--thumb-width", `${720 / slideCount}px`);

        document.querySelector(".prev-slide")?.addEventListener("click", () => { ensureTopAndLock(); slideshow.prev(); });
        document.querySelector(".next-slide")?.addEventListener("click", () => { ensureTopAndLock(); slideshow.next(); });

        updateSlideCounter(0);
        updateDragLines(0, true);

        // 🎯 滑鼠懸停／拖曳：只在桌機綁定（touch 設備不觸發 mouse events）
        if (!isMobileInit) {
          const thumbsArea = document.querySelector(".thumbs-container");
          if (thumbsArea) {
            thumbsArea.addEventListener("mouseenter", () => { mouseOverThumbnails = true; stopAutoLoop(); });
            thumbsArea.addEventListener("mouseleave", () => { mouseOverThumbnails = false; currentHoveredThumb = null; updateDragLines(slideshow.current, true); startAutoLoop(); });
          }

          let dragStartX = 0;
          let isDragging = false;
          const heroEl = document.querySelector('.hero-section');
          if (heroEl) {
            heroEl.style.cursor = 'grab';
            heroEl.addEventListener('mousedown', (e) => {
              isDragging = true;
              dragStartX = e.clientX;
              heroEl.style.cursor = 'grabbing';
              stopAutoLoop();
            }, { passive: true });
            document.addEventListener('mouseup', (e) => {
              if (!isDragging) return;
              isDragging = false;
              heroEl.style.cursor = 'grab';
              const diff = dragStartX - e.clientX;
              if (Math.abs(diff) > 50 && !isAnimating) {
                if (diff > 0) slideshow.next();
                else slideshow.prev();
              }
              startAutoLoop();
            }, { passive: true });
            heroEl.addEventListener('mouseleave', () => { isDragging = false; heroEl.style.cursor = 'grab'; }, { passive: true });
          }
        }

        let autoLoopTimer = null;
        let autoLoopStartToken = 0;
        function startAutoLoop() {
          stopAutoLoop();
          const token = ++autoLoopStartToken;
          const armAutoLoop = () => {
            if (token !== autoLoopStartToken) return;
            autoLoopTimer = setInterval(() => {
              if (!isAnimating && !isHeroRenderSleeping()) slideshow.next();
            }, 5000);
          };
          const loaderReady = (window._nudotLoaderDismissed === true || !document.getElementById('nudot-loader'))
            ? Promise.resolve()
            : new Promise((resolve) => {
              document.addEventListener('nudot:loader-dismissed', resolve, { once: true });
            });
          const activeTextureReady = webglManager?.preloadTexture(slideshow.current);
          const textureReady = activeTextureReady && typeof activeTextureReady.then === 'function'
            ? Promise.race([
              activeTextureReady.catch(() => null),
              new Promise((resolve) => setTimeout(resolve, 1800))
            ])
            : Promise.resolve();
          Promise.allSettled([loaderReady, textureReady]).then(armAutoLoop);
        }
        function stopAutoLoop() {
          autoLoopStartToken++;
          if (autoLoopTimer) { clearInterval(autoLoopTimer); autoLoopTimer = null; }
        }
        startAutoLoop();

        // 🎯 loader 消失後 600ms 靜默預載 slide 1（slider02）
        //    讓第一次自動切換或手動切換時 Promise.all 立刻 resolve，消除轉場延遲。
        //    600ms 是讓 hero canvas 先穩定播放、不搶 slider01 的頻寬。
        (function () {
          function _preloadSlide1() {
            if (webglManager && heroSlideCount > 1) webglManager.preloadTexture(1);
          }
          if (window._nudotLoaderDismissed) {
            setTimeout(_preloadSlide1, 600);
          } else {
            document.addEventListener('nudot:loader-dismissed', function () {
              setTimeout(_preloadSlide1, 600);
            }, { once: true });
          }
        }());

        let touchStartY = 0;
        document.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; window._touchStartX = e.touches[0].clientX; }, { passive: true });

        // 🎯 移除空的 touchmove 處理器(原本什麼也沒做卻佔事件排程)

        document.addEventListener("touchend", (e) => {
          const touchEndX = e.changedTouches[0].clientX;
          const touchDiffX = (window._touchStartX || touchEndX) - touchEndX;
          if (Math.abs(touchDiffX) > 50 && window.scrollY < window.innerHeight && !isAnimating) {
            if (touchDiffX > 0) slideshow.next();
            else slideshow.prev();
          }
        }, { passive: true });

        document.addEventListener("keydown", (e) => {
          if (window.scrollY <= window.innerHeight * 0.5 && !isAnimating) {
            if (e.key === "ArrowRight") slideshow.next();
            else if (e.key === "ArrowLeft") slideshow.prev();
          }
        });
      }

      function revealSetup(el) {
        if (!el) return null;
        el.style.overflow = 'hidden';
        const inner = document.createElement('div');
        inner.style.willChange = 'transform';
        while (el.firstChild) inner.appendChild(el.firstChild);
        el.appendChild(inner);
        gsap.set(inner, { yPercent: 110 });
        return inner;
      }

      // 🎯 手機版：top-header 和 grid-section 在 mobile CSS 中 display:none，跳過 DOM wrapping
      const rvHuge = (isMobileInit ? [] : [...document.querySelectorAll('.overlay-top .huge-text')].map(revealSetup)).filter(Boolean);
      const rvTag = isMobileInit ? null : revealSetup(document.querySelector('.overlay-top .small-tag'));
      const rvSvcLi = (isMobileInit ? [] : [...document.querySelectorAll('.overlay-top .services-list li')].map(revealSetup)).filter(Boolean);
      const rvGrid = (isMobileInit ? [] : [...document.querySelectorAll('.overlay-bottom .hero-quick-links-row > div, .overlay-bottom .border-top-line > div')].map(revealSetup)).filter(Boolean);
      const rvFooter = [...document.querySelectorAll('.overlay-bottom .footer-col')].map(revealSetup).filter(Boolean);
      if (document.querySelector('.bottom-ui-container')) {
        gsap.set('.bottom-ui-container', { autoAlpha: 0, y: 22 });
      }

      const heroTl = gsap.timeline({ paused: true });
      window._heroTl = heroTl;

      if (rvHuge.length > 0) {
        heroTl.to(rvHuge, {
          yPercent: 0, duration: 0.85, stagger: 0.14, ease: 'power4.out'
        }, 0.4);
      }
      if (rvTag) {
        heroTl.to(rvTag, {
          yPercent: 0, duration: 0.75, ease: 'power3.out'
        }, 0.4);
      }
      if (rvSvcLi.length > 0) {
        heroTl.to(rvSvcLi, {
          yPercent: 0, duration: 0.5, stagger: 0.04, ease: 'power3.out'
        }, 0.45);
      }
      if (rvGrid.length > 0) {
        heroTl.to(rvGrid, {
          yPercent: 0, duration: 0.42, stagger: 0.05, ease: 'power3.out'
        }, 0.35);
      }
      if (rvFooter.length > 0) {
        heroTl.to(rvFooter, {
          yPercent: 0, duration: 0.25, stagger: 0.03, ease: 'power3.out'
        }, 0.3);
      }
      if (document.querySelector('.bottom-ui-container')) {
        heroTl.to('.bottom-ui-container', {
          autoAlpha: 1, y: 0, duration: 0.55, ease: 'power3.out'
        }, 0.7);
      }

      if (window._nudotLoaderDismissed) {
        heroTl.play();
      } else {
        document.addEventListener('nudot:loader-dismissed', () => {
          heroTl.play();
        }, { once: true });
      }

      // 🎯 治本：把 prewarm video 升格為 hero 可見背景層
      //    prewarm 從 <head> 就在 decode，此時 readyState 通常 >= 2（影片本身很小）。
      //    把它移進 hero-section 並設 opacity:1 → 立刻有畫面，完全無黑屏空窗。
      //    之後 WebGLManager.loadTextureAt(0) 會認領它做 VideoTexture，
      //    並把 uTexReady 設為 1，WebGL canvas（z-index:1, alpha:true）從此覆蓋它。
      (function promotePrwarmToHeroBg() {
        const pw = window._prewarmVideo;
        if (!pw || !pw.el) return;
        const heroSec = document.querySelector('.hero-section');
        if (!heroSec) return;
        const pv = pw.el;
        pv.dataset.ndPromoted = '1'; // 🛡️ 告知 head 的 8s 清除 timer：此影片正在當可見背景，不可移除
        pv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none;opacity:1;';
        heroSec.insertBefore(pv, heroSec.firstChild);
      })();

      // 🎯 刻意在 DOMContentLoaded 立即啟動：
      //    loader 動畫期間（約 3.2 秒）讓 WebGL 紋理與影片在背景靜靜預載，
      //    loader 淡出時畫面已 ready，使用者不會看到空白或等待。
      initHeroSlideshow();

      const cube = document.getElementById('cube');
      const sceneWrapper = document.getElementById('sceneWrapper');
      const section2 = document.getElementById('section-2-content');
      const imgOverlay = document.getElementById('img-overlay');
      const darkWrapper = document.getElementById('dark-wrapper');
      const darkWrapperMask = document.getElementById('dark-wrapper-mask');
      const dwBlackOverlay = document.getElementById('dw-black-overlay');
      const stmLogoEl = document.getElementById('stmLogo');
      const titleLine1 = document.getElementById('title-line1');
      const titleLine2 = document.getElementById('title-line2');
      const titleMarquee = document.getElementById('title-marquee');
      const titleSubtitle = document.getElementById('title-subtitle');
      const titleDesc = document.getElementById('title-desc');
      const newSubtitle = document.getElementById('new-subtitle');
      const newLine1 = document.getElementById('new-line1');
      const newLine2 = document.getElementById('new-line2');
      const newDesc = document.getElementById('new-desc');
      const newTextGroup = document.getElementById('new-text-group');
      const uiNav = document.getElementById('ui-nav');
      const uiScroll = document.getElementById('ui-scroll');
      const uiGlow1 = document.getElementById('ui-glow1');
      const uiGlow2 = document.getElementById('ui-glow2');
      const fixedLogoEl = document.getElementById('fixed-logo');

      // 🎯 dark-wrapper-mask 在手機版 display:none，跳過相關初始化
      if (!isMobileInit) {
        if (uiNav) { gsap.set(uiNav, { opacity: 0, y: -25 }); }
        if (uiScroll) { gsap.set(uiScroll, { opacity: 0 }); }
        if (uiGlow1) { gsap.set(uiGlow1, { opacity: 0, scale: 0.4 }); }
        if (uiGlow2) { gsap.set(uiGlow2, { opacity: 0, scale: 0.4 }); }
        if (darkWrapper) gsap.set(darkWrapper, { force3D: true });
      }

      // 🎯 #nav display:none 在手機版，跳過 logo 動畫
      if (!isMobileInit && fixedLogoEl) {
        gsap.set(fixedLogoEl, { y: -16 });
        gsap.to(fixedLogoEl, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 2.8 });
      }

      function resetReveal() {
        gsap.set(titleSubtitle, { yPercent: 130 });
        gsap.set(titleLine1, { yPercent: 130 });
        gsap.set(titleLine2, { yPercent: 130 });
        gsap.set(titleMarquee, { yPercent: 130 });
        gsap.set(titleDesc, { yPercent: 130 });
        gsap.set(newSubtitle, { yPercent: 130 });
        gsap.set(newLine1, { yPercent: 130 });
        gsap.set(newLine2, { yPercent: 130 });
        gsap.set(newDesc, { yPercent: 130 });
      }
      // 🎯 dark-wrapper 元素手機版隱藏，無需初始化位置
      if (!isMobileInit) resetReveal();

      const faceFront = document.querySelector('.face.front');
      const scene = document.querySelector('.scene');
      const introPanel = document.getElementById('intro-panel');
      const introTopHeader = document.querySelector('.ip-top-header');
      const introBottomLetter = document.querySelector('.ip-bottom-letter');
      const introTopTitle = introTopHeader?.querySelector('.ip-top-title');
      const introBottomTitle = introBottomLetter?.querySelector('.ip-top-title');

      // 🎯 _ipWave 在 intro-panel（dark-wrapper 內），手機版 display:none，完全跳過
      const _ipWave = !isMobileInit ? (function () {
        const wrapper = document.getElementById('ip-wave-wrapper');
        const leftCol = wrapper.querySelector('.wave-column-left');
        const rightCol = wrapper.querySelector('.wave-column-right');
        const thumb = document.getElementById('ip-wave-thumb');
        const leftTexts = gsap.utils.toArray(leftCol.querySelectorAll('.animated-text'));
        const rightTexts = gsap.utils.toArray(rightCol.querySelectorAll('.animated-text'));
        const WAVE_NUM = 12;
        const WAVE_SPD = 1;
        let currentSrc = '';
        let _ranges = null;
        let _lastFocused = -1; // 加入快取，避免重複操作 DOM
        let _wrapperH = 0; // 🎯 效能優化:快取 offsetHeight,避免每幀 layout 讀取
        let _initialized = false;

        const lqx = leftTexts.map(t => gsap.quickTo(t, 'x', { duration: 0.6, ease: 'power4.out' }));
        const rqx = rightTexts.map(t => gsap.quickTo(t, 'x', { duration: 0.6, ease: 'power4.out' }));

        function calcRanges() {
          const maxLW = Math.max(...leftTexts.map(t => t.offsetWidth));
          const maxRW = Math.max(...rightTexts.map(t => t.offsetWidth));
          return {
            l: { min: 0, max: Math.max(0, leftCol.offsetWidth - maxLW) },
            r: { min: 0, max: Math.max(0, rightCol.offsetWidth - maxRW) },
          };
        }

        function waveX(index, progress, range) {
          const phase = WAVE_NUM * index + WAVE_SPD * progress * Math.PI * 2 - Math.PI / 2;
          return range.min + ((Math.sin(phase) + 1) / 2) * (range.max - range.min);
        }

        function closestToCenter(progress) {
          const total = leftTexts.length;
          if (total === 0) return 0;
          let index = Math.round(progress * (total - 1));
          return Math.max(0, Math.min(total - 1, index));
        }

        function ensureInit() {
          if (_initialized) return;
          _ranges = calcRanges();
          _wrapperH = wrapper.offsetHeight; // 🎯 初始化時讀取一次
          leftTexts.forEach((t, i) => gsap.set(t, { x: waveX(i, 0, _ranges.l) }));
          rightTexts.forEach((t, i) => gsap.set(t, { x: -waveX(i, 0, _ranges.r) }));
          _initialized = true;
        }
        window.addEventListener('resize', () => {
          if (!_initialized) return;
          _ranges = calcRanges();
          _wrapperH = wrapper.offsetHeight; // 🎯 resize 時更新快取
        }, { passive: true });

        return {
          update(progress) {
            ensureInit();
            if (!_ranges) _ranges = calcRanges();
            if (!_wrapperH) _wrapperH = wrapper.offsetHeight;

            // 🎯 使用快取值,消除每幀的 layout thrashing
            const centerBias = winW <= 768 ? 0.36 : 0.5;
            gsap.set(wrapper, { y: _wrapperH * (centerBias - progress) });

            const focused = closestToCenter(progress);
            const focusChanged = focused !== _lastFocused;

            leftTexts.forEach((t, i) => {
              lqx[i](waveX(i, progress, _ranges.l));
              if (focusChanged) t.classList.toggle('focused', i === focused);
            });
            rightTexts.forEach((t, i) => {
              rqx[i](-waveX(i, progress, _ranges.r));
              if (focusChanged) t.classList.toggle('focused', i === focused);
            });

            if (focusChanged) {
              const src = leftTexts[focused] && leftTexts[focused].dataset.image;
              if (src && src !== currentSrc) { currentSrc = src; thumb.src = src; }
              _lastFocused = focused;
            }
          }
        };
      })() : { update() { } };
      // 🎯 ip-wave-wrapper 翻轉效果 DOM 操作，手機版完全跳過
      if (!isMobileInit) (function () {
        const zhMap = {
          'Core-Site': '（核心網站）', 'Gen-AI Visual': '（生成式 AI 視覺）',
          'Motion Flow': '（動態流動）', 'WebGL Realm': '（WebGL 領域）',
          '3D Matrix': '（3D 矩陣）', 'Interaction': '（交互設計）',
          'Pixel Perfect': '（完美像素）', 'Logic Build': '（邏輯建構）',
          'Fluid UI': '（流動介面）', 'Aero Design': '（輕量化設計）',
          'Pure Code': '（純粹代碼）', 'Digital Art': '（數位藝術）',
          'Strategy': '（策略）', 'Design': '（設計）', 'Tech': '（技術）',
          'Creative': '（創意）', 'Motion': '（動態）', 'Brand': '（品牌）',
          'Future': '（未來）', 'Vision': '（願景）', 'System': '（系統）',
          'Labs': '（實驗室）', 'Core': '（核心）', 'Craft': '（工藝）',
        };
        document.querySelectorAll('#ip-wave-wrapper .animated-text').forEach(el => {
          const en = el.textContent.trim();
          const zh = zhMap[en];
          if (!zh) return;
          el.innerHTML = '';
          const wrap = document.createElement('span');
          wrap.className = 'flip-wrap';
          const enS = document.createElement('span');
          enS.className = 'at-en'; enS.textContent = en;
          const zhS = document.createElement('span');
          zhS.className = 'at-zh'; zhS.textContent = zh;
          wrap.appendChild(enS);
          wrap.appendChild(zhS);
          el.appendChild(wrap);
        });
      })();

      let baseRotY = -45;
      let targetScrollProgress = 0;
      let currentScrollProgress = 0;
      let scrollMediaActivated = false;
      const scrollTrack = document.querySelector('.scroll-track');
      let maxScroll = 0;

      function activateScrollMediaOnce() {
        if (scrollMediaActivated) return;
        scrollMediaActivated = true;
        document.dispatchEvent(new Event('nudot:activate-scroll-media'));
      }

      function updateMaxScroll() {
        maxScroll = scrollTrack ? Math.max(0, scrollTrack.offsetHeight - winH) : 0;
      }

      function syncScrollState(jumpToCurrent = false) {
        const currentScrollY = window._lenis ? window._lenis.scroll : window.scrollY;
        const nextProgress = maxScroll > 0
          ? Math.max(0, Math.min(currentScrollY / maxScroll, 1))
          : 0;
        targetScrollProgress = nextProgress;
        if (jumpToCurrent) currentScrollProgress = nextProgress;
      }

      // 🎯 效能優化:加上節流旗標,避免 window 'scroll' 與 lenis 'scroll' 重複觸發
      let _scrollSyncScheduled = false;
      function scheduleSyncScrollState() {
        if (_scrollSyncScheduled) return;
        _scrollSyncScheduled = true;
        requestAnimationFrame(() => {
          _scrollSyncScheduled = false;
          syncScrollState();
        });
      }

      window.addEventListener('scroll', scheduleSyncScrollState, { passive: true });

      window.addEventListener('pageshow', () => {
        updateMaxScroll();
        syncScrollState(true);
      });

      window.addEventListener('resize', () => {
        updateMaxScroll();
        syncScrollState(true);
      }, { passive: true });

      if (window._lenis) {
        window._lenis.on('scroll', scheduleSyncScrollState);
      }

      if (scrollTrack && 'ResizeObserver' in window) {
        const scrollTrackResizeObserver = new ResizeObserver(() => {
          updateMaxScroll();
          scheduleSyncScrollState();
        });
        scrollTrackResizeObserver.observe(scrollTrack);
      }

      updateMaxScroll();

      requestAnimationFrame(() => {
        updateMaxScroll();
        syncScrollState(true);
      });

      function easeInOutCubic(x) {
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      }

      function setDarkWrapperReveal(hiddenPercent) {
        if (winW <= 768) {
          if (darkWrapperMask) darkWrapperMask.style.height = '';
          if (darkWrapperMask) {
            darkWrapperMask.style.clipPath = '';
            darkWrapperMask.style.webkitClipPath = '';
          }
          if (darkWrapper) darkWrapper.style.clipPath = 'none';
          return;
        }
        if (darkWrapperMask) {
          const safeHiddenPercent = Math.max(0, Math.min(hiddenPercent, 100));
          const nextClip = `inset(${safeHiddenPercent}% 0 0 0)`;
          if (darkWrapperMask.style.clipPath !== nextClip) {
            darkWrapperMask.style.clipPath = nextClip;
            darkWrapperMask.style.webkitClipPath = nextClip;
          }
          return;
        }
        if (darkWrapper) {
          gsap.set(darkWrapper, { clipPath: `inset(${hiddenPercent}% 0 0 0)` });
        }
      }

      class RevealGL {
        constructor(canvas) {
          this.canvas = canvas;
          this.gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
          if (!this.gl) return;
          this._build();
          this._resize();
          this._resizeRaf = 0;
          window.addEventListener('resize', () => {
            if (this._resizeRaf) return;
            this._resizeRaf = requestAnimationFrame(() => {
              this._resizeRaf = 0;
              this._resize();
            });
          }, { passive: true });
        }
        _build() {
          const gl = this.gl;
          const vert = `attribute vec2 a_pos; varying vec2 vUv;
            void main(){ vUv=a_pos*0.5+0.5; gl_Position=vec4(a_pos,0.,1.); }`;
          const frag = `
            precision highp float;
            varying vec2 vUv;
            uniform float uReveal;
            uniform float uTime;
            vec3 permute(vec3 x){return mod(((x*34.)+1.)*x,289.);}
            float snoise(vec2 v){
              const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
              vec2 i=floor(v+dot(v,C.yy)), x0=v-i+dot(i,C.xx);
              vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
              vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
              i=mod(i,289.);
              vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
              vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
              m=m*m; m=m*m;
              vec3 xv=2.*fract(p*C.www)-1., h=abs(xv)-.5, ox=floor(xv+.5), a0=xv-ox;
              m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
              vec3 g; g.x=a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }
            void main(){
              float yBias = vUv.y * 0.50;
              float n = snoise(vUv*3.6 + vec2(uTime*0.08, uTime*0.05)) * 0.68
                      + snoise(vUv*7.8 + vec2(-uTime*0.06, uTime*0.12)) * 0.32;
              float thr  = uReveal * 2.8 - 1.4 + yBias;
              float edge = 0.13 + (1.0 - uReveal) * 0.05;
              float mask = smoothstep(thr - edge, thr + edge, n);
              gl_FragColor = vec4(0., 0., 0., mask);
            }`;
          const mk = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s); return s;
          };
          this.prog = gl.createProgram();
          gl.attachShader(this.prog, mk(gl.VERTEX_SHADER, vert));
          gl.attachShader(this.prog, mk(gl.FRAGMENT_SHADER, frag));
          gl.linkProgram(this.prog);
          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(this.prog, 'a_pos');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          this.uReveal = gl.getUniformLocation(this.prog, 'uReveal');
          this.uTime = gl.getUniformLocation(this.prog, 'uTime');

          gl.useProgram(this.prog);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        _resize() {
          const dpr = typeof getOptimalDPR === 'function' ? getOptimalDPR() : Math.min(devicePixelRatio || 1, 2);
          const nextWidth = Math.max(1, Math.floor(this.canvas.offsetWidth * dpr));
          const nextHeight = Math.max(1, Math.floor(this.canvas.offsetHeight * dpr));
          if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return;
          this.canvas.width = nextWidth;
          this.canvas.height = nextHeight;
          if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        render(reveal) {
          const gl = this.gl; if (!gl) return;
          gl.disable(gl.BLEND);
          gl.clearColor(0, 0, 0, reveal <= 0 ? 1 : 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          if (reveal <= 0 || reveal >= 1) return;
          gl.useProgram(this.prog);
          gl.uniform1f(this.uReveal, reveal);
          gl.uniform1f(this.uTime, performance.now() * 0.001);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }

      const revealCanvas = document.getElementById('ip-reveal-canvas');
      // WebGL reveal is currently opt-in. The default path uses the CSS clip-path mask above
      // because the canvas stays display:none and should not allocate a WebGL context.
      const enableIpRevealGL = revealCanvas?.dataset.revealMode === 'webgl';
      const revealGL = enableIpRevealGL
        ? new RevealGL(revealCanvas)
        : null;

      // 🎯 效能優化:快取上一幀的 progress,當變化極小時跳過整個動畫管線,
      //    大幅降低 gsap.set 的呼叫頻率,修復 scroll 卡頓
      let _lastAppliedProgress = -2;

      const heroBlendHintEls = Array.from(document.querySelectorAll('.overlay-ui, .huge-text, .small-tag'));
      let heroBlendHintsEnabled = true;
      const heroSectionEl = document.querySelector('.hero-section');
      let heroSectionHidden = false;

      function setHeroBlendHints(enabled) {
        if (heroBlendHintsEnabled === enabled) return;
        heroBlendHintsEnabled = enabled;
        heroBlendHintEls.forEach(el => { el.style.willChange = enabled ? 'transform' : 'auto'; });
      }

      function setHeroSectionHidden(hidden) {
        if (!heroSectionEl) return;
        if (window.innerWidth <= 767) {
          heroSectionHidden = false;
          heroSectionEl.style.visibility = '';
          return;
        }
        if (heroSectionHidden === hidden) return;
        heroSectionHidden = hidden;
        heroSectionEl.style.visibility = hidden ? 'hidden' : '';
      }

      let mobileHeroStaticReady = false;
      let _mobileWebglFrameToggle = 0;

      function updateMobileSceneSize() {
        if (!scene) return;
        const mobileSceneSize = Math.min(window.innerWidth * 0.56, 220);
        scene.style.setProperty('--scene-size', `${mobileSceneSize}px`);
        scene.style.setProperty('--scene-depth', `${mobileSceneSize / 2}px`);
      }

      function applyMobileHeroStaticState() {
        if (mobileHeroStaticReady) return;
        mobileHeroStaticReady = true;
        if (darkWrapperMask) darkWrapperMask.style.height = '';
        if (darkWrapper) darkWrapper.style.clipPath = 'none';
        if (dwBlackOverlay) gsap.set(dwBlackOverlay, { opacity: 0 });
        if (stmLogoEl) stmLogoEl.classList.remove('is-visible');
        if (section2) gsap.set(section2, { opacity: 0, pointerEvents: 'none', zIndex: 18 });
        if (newTextGroup) gsap.set(newTextGroup, { opacity: 0 });
        if (sceneWrapper) {
          gsap.set(sceneWrapper, { xPercent: -50, yPercent: -50, scale: 1, top: '50%', opacity: 1 });
        }
        updateMobileSceneSize();
      }

      window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) updateMobileSceneSize();
      }, { passive: true });

      if (winW <= 768) applyMobileHeroStaticState();

      // =========================================================
      // Gallery Header WebGL Wave Effect
      // =========================================================
      gsap.ticker.add(() => {
        const heroRenderSleeping = isHeroRenderSleeping();
        setHeroSectionHidden(heroRenderSleeping);
        setHeroBlendHints(!heroRenderSleeping);
        if (webglManager) {
          if (heroRenderSleeping) webglManager.setRenderPaused(true);
          else {
            const isMobileNow = winW <= 768;
            if (!isMobileNow || (++_mobileWebglFrameToggle & 1)) {
              webglManager.render();
            }
          }
        }

        // 🎯 Lenis 已平滑一層,此處再 lerp 0.1 (原 0.06) 避免雙重平滑的「拖延感」
        //    lerp 0.1 = 約 10 幀完成過渡,動畫貼指又不抖
        currentScrollProgress += (targetScrollProgress - currentScrollProgress) * 0.1;
        if (currentScrollProgress < 0.0001) currentScrollProgress = 0;

        const isMobile = winW <= 768;

        // 🎯 當 progress 跟上一幀幾乎相同且已經趨近目標時,完全跳過動畫管線
        //    這是最關鍵的效能修復:避免穩定狀態下仍持續刷新 20+ 個 gsap.set
        //    mobile scene 目前要靠同一條 ticker 維持 cube 可見，所以這裡保留 mobile 更新
        const progressDelta = Math.abs(currentScrollProgress - _lastAppliedProgress);
        const targetDelta = Math.abs(targetScrollProgress - currentScrollProgress);
        if (!isMobile && progressDelta < 0.0001 && targetDelta < 0.0001) {
          return;
        }
        _lastAppliedProgress = currentScrollProgress;

        let progress = currentScrollProgress;
        if (progress > 0.035 || targetScrollProgress > 0.035) activateScrollMediaOnce();

        const p_Reveal = 0.12;
        const p_TextIn = 0.24;
        const p_TextOut = 0.44;
        const p_Tumble = 0.60;
        const p_Spin = 0.78;
        const p_PreExit = p_Spin - 0.06;
        const p_Zoom = 1.00;
        document.documentElement.classList.remove('is-dark-wrapper-mobile-intro');

        if (isMobile) {
          applyMobileHeroStaticState();
          baseRotY += 0.25;
          if (cube) {
            cube.style.transform = `rotateX(-12deg) rotateY(${baseRotY}deg)`;
          }
          window._marqueeRAFActive = false;
          return;
        }

        // 🎯 marquee rAF 只在 title 出現期間（p_TextOut → p_Spin + buffer）執行
        //    zoom 階段完全暫停，消除 GPU 競爭造成的卡頓
        window._marqueeRAFActive = (progress > p_TextOut && progress < p_Zoom);
        if (window._marqueeRAFActive && typeof window._requestMarqueeRAF === 'function') {
          window._requestMarqueeRAF();
        }

        let pr_Reveal = Math.max(0, Math.min(progress / p_Reveal, 1));
        let easeReveal = easeInOutCubic(pr_Reveal);

        if (progress <= p_Reveal) {
          baseRotY += 0.4;
        }
        let targetY_Phase1 = Math.ceil(baseRotY / 360) * 360 + 360;

        let currentTop = isMobile ? 40 : 50;
        let baseSceneSize = isMobile ? 173 : 230;
        const cubeZoomScale = 0.9; //修改cubeZoomScale 可以微調整 zoom 後的場景大小，建議保持在 0.85 ~ 0.95 之間
        const zoomedSceneSize = Math.min(
          winW * (isMobile ? 0.78 : 0.44) * cubeZoomScale,
          winH * (isMobile ? 0.58 : 0.72) * cubeZoomScale
        );
        let currentSceneSize = baseSceneSize;

        setDarkWrapperReveal((1 - easeReveal) * 100);

        const uiEntrance = Math.max(0, Math.min((pr_Reveal - 0.60) / 0.40, 1));
        const uiEase = easeInOutCubic(uiEntrance);

        if (uiNav) gsap.set(uiNav, { opacity: uiEase, y: (1 - uiEase) * -25 });
        if (uiScroll) gsap.set(uiScroll, { opacity: uiEase * 0.7 });

        // 🎯 封印光暈：當透明度為 0 時直接拔除可視性，釋放 GPU
        if (uiGlow1) gsap.set(uiGlow1, { opacity: uiEase, scale: 0.4 + uiEase * 0.6, visibility: uiEase > 0 ? 'visible' : 'hidden' });
        if (uiGlow2) gsap.set(uiGlow2, { opacity: uiEase * 0.8, scale: 0.4 + uiEase * 0.6, visibility: uiEase > 0 ? 'visible' : 'hidden' });

        {
          const waveRp = progress <= p_Reveal
            ? Math.max(0, (pr_Reveal - 0.45) / 0.55)
            : 1.0;

          if (progress <= p_TextOut) {
            // 🎯 封印面板：不顯示時徹底隱藏
            gsap.set(introPanel, { opacity: waveRp > 0 ? 1 : 0, visibility: waveRp > 0 ? 'visible' : 'hidden' });

            if (waveRp > 0) {
              if (revealGL) revealGL.render(waveRp);
              const panelT = progress <= p_Reveal
                ? 0
                : (progress - p_Reveal) / (p_TextOut - p_Reveal);
              const ndIn = easeInOutCubic(Math.max(0, Math.min((waveRp - 0.30) / 0.65, 1)));
              const ndOut = easeInOutCubic(Math.max(0, (panelT - 0.84) / 0.16));
              const ndOpacity = Math.max(0, ndIn * (1 - ndOut));

              if (introTopHeader) gsap.set(introTopHeader, { opacity: ndOpacity });
              if (introTopTitle) gsap.set(introTopTitle, { yPercent: (1 - ndIn) * 110 });
              if (introBottomLetter) gsap.set(introBottomLetter, { opacity: ndOpacity });
              if (introBottomTitle) gsap.set(introBottomTitle, { yPercent: (1 - ndIn) * -110 });

              const outT = easeInOutCubic(Math.max(0, (panelT - 0.83) / 0.17));
              if (outT > 0) gsap.set(introPanel, { opacity: Math.max(0, 1 - outT) });

              _ipWave.update(panelT);
            }
          } else {
            // 完全重置並隱藏
            gsap.set(introPanel, { opacity: 0, visibility: 'hidden' });
            if (introTopHeader) gsap.set(introTopHeader, { opacity: 0 });
            if (introTopTitle) gsap.set(introTopTitle, { yPercent: 110 });
            if (introBottomLetter) gsap.set(introBottomLetter, { opacity: 0 });
            if (introBottomTitle) gsap.set(introBottomTitle, { yPercent: -110 });
          }
        }

        let currentScale = 0.0001;
        let currentX = -15;
        let currentY = baseRotY;

        if (progress > p_TextOut) {

          const revealTotal = p_PreExit - p_TextOut;
          const revealPr = Math.max(0, Math.min((progress - p_TextOut) / revealTotal, 1));

          // 🎯 取代字串串接，啟動 GSAP 高速變形
          gsap.set(titleSubtitle, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min(revealPr / 0.40, 1)))) * 130 });
          gsap.set(titleLine1, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((revealPr - 0.08) / 0.42, 1)))) * 130 });
          gsap.set(titleLine2, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((revealPr - 0.18) / 0.42, 1)))) * 130 });
          gsap.set(titleMarquee, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((revealPr - 0.08) / 0.42, 1)))) * 130 });
          gsap.set(titleDesc, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((revealPr - 0.32) / 0.42, 1)))) * 130 });

          gsap.set(newTextGroup, { opacity: 0 });
          gsap.set(newSubtitle, { yPercent: 130 });
          gsap.set(newLine1, { yPercent: 130 });
          gsap.set(newLine2, { yPercent: 130 });
          gsap.set(newDesc, { yPercent: 130 });

          if (progress <= p_Tumble) {
            let pr = (progress - p_TextOut) / (p_Tumble - p_TextOut);
            let ease = easeInOutCubic(pr);

            currentScale = 1.5 * ease;
            currentX = -15 * (1 - ease) + 360 * ease;
            currentY = baseRotY * (1 - ease) + targetY_Phase1 * ease;

            gsap.set(section2, { opacity: 1, pointerEvents: 'none', zIndex: 18 });
            gsap.set(imgOverlay, { opacity: 0 });
            gsap.set(faceFront, { boxShadow: 'inset 0 0 40px rgba(0,0,0,1)', border: '1px solid rgba(255,255,255,0.05)' });

          } else if (progress <= p_Spin) {
            let pr = (progress - p_Tumble) / (p_Spin - p_Tumble);
            let ease = easeInOutCubic(pr);

            currentScale = 1.5;
            currentX = 360;
            currentY = targetY_Phase1 + 360 * ease;

            gsap.set(section2, { opacity: 1, pointerEvents: 'none', zIndex: 18 });
            gsap.set(imgOverlay, { opacity: 0 });
            gsap.set(faceFront, { boxShadow: 'inset 0 0 40px rgba(0,0,0,1)', border: '1px solid rgba(255,255,255,0.05)' });

          } else {
            let pr = (progress - p_Spin) / (p_Zoom - p_Spin);
            let ease = easeInOutCubic(pr);

            const spinDisplaySize = baseSceneSize * 1.5;
            const targetSceneSize = zoomedSceneSize;
            currentSceneSize = spinDisplaySize + (targetSceneSize - spinDisplaySize) * ease;
            currentScale = 1;
            currentX = 360;
            currentY = targetY_Phase1 + 360;

            const titleExitPr = Math.max(0, Math.min(ease, 1));
            const titleExitEase = easeInOutCubic(titleExitPr);

            gsap.set(section2, { opacity: Math.max(0, 1 - titleExitEase), pointerEvents: 'none', zIndex: 18 });
            gsap.set(imgOverlay, { opacity: ease * 0 });
            gsap.set(faceFront, {
              boxShadow: `inset 0 0 ${40 * (1 - ease)}px rgba(0,0,0,1)`,
              border: `1px solid rgba(255,255,255,${0.05 * (1 - ease)})`
            });

            if (dwBlackOverlay) gsap.set(dwBlackOverlay, { opacity: ease });
            if (stmLogoEl) stmLogoEl.classList.remove('is-visible');

            gsap.set(titleDesc, { yPercent: -easeInOutCubic(Math.min(titleExitPr, 1)) * 130 });
            gsap.set(titleLine2, { yPercent: -easeInOutCubic(Math.max(0, Math.min((titleExitPr - 0.10) / 0.90, 1))) * 130 });
            gsap.set(titleLine1, { yPercent: -easeInOutCubic(Math.max(0, Math.min((titleExitPr - 0.20) / 0.80, 1))) * 130 });
            gsap.set(titleMarquee, { yPercent: -easeInOutCubic(Math.max(0, Math.min((titleExitPr - 0.10) / 0.90, 1))) * 130 });
            gsap.set(titleSubtitle, { yPercent: -easeInOutCubic(Math.max(0, Math.min((titleExitPr - 0.30) / 0.70, 1))) * 130 });

            gsap.set(newTextGroup, { opacity: titleExitPr > 0 ? 1 : 0 });
            const enterPr = Math.max(0, Math.min(titleExitPr / 0.70, 1));
            gsap.set(newSubtitle, { yPercent: (1 - easeInOutCubic(Math.min(enterPr / 0.60, 1))) * 130 });
            gsap.set(newLine1, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((enterPr - 0.10) / 0.60, 1)))) * 130 });
            gsap.set(newLine2, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((enterPr - 0.20) / 0.60, 1)))) * 130 });
            gsap.set(newDesc, { yPercent: (1 - easeInOutCubic(Math.max(0, Math.min((enterPr - 0.35) / 0.55, 1)))) * 130 });
          }

        } else if (progress > p_Zoom) {
          const targetSceneSize = zoomedSceneSize;
          currentSceneSize = targetSceneSize;
          currentScale = 1;
          currentX = 360;
          currentY = targetY_Phase1 + 360;

          gsap.set(section2, { opacity: 0, pointerEvents: 'none', zIndex: 18 });
          gsap.set(imgOverlay, { opacity: 0 });

          if (dwBlackOverlay) gsap.set(dwBlackOverlay, { opacity: 1 });
          if (stmLogoEl) stmLogoEl.classList.remove('is-visible');

          gsap.set(newTextGroup, { opacity: 1 });
          gsap.set([titleDesc, titleLine2, titleLine1, titleMarquee, titleSubtitle], { yPercent: -130 });
        } else {
          currentScale = 0.0001;

          gsap.set(section2, { opacity: 0, pointerEvents: 'none', zIndex: 22 });
          gsap.set(imgOverlay, { opacity: 0 });

          if (dwBlackOverlay) gsap.set(dwBlackOverlay, { opacity: 0 });
          if (stmLogoEl) stmLogoEl.classList.remove('is-visible');
          gsap.set(newTextGroup, { opacity: 0 });

          resetReveal();
        }

        gsap.set(scene, {
          '--scene-size': `${currentSceneSize}px`,
          '--scene-depth': `${currentSceneSize / 2}px`
        });

        gsap.set(cube, {
          rotationX: currentX,
          rotationY: currentY,
          rotationZ: 0
        });

        gsap.set(sceneWrapper, {
          xPercent: -50,
          yPercent: -50,
          scale: currentScale,
          top: `${currentTop}%`
        });

        if (stmLogoEl && progress <= p_TextOut) {
          stmLogoEl.classList.remove('is-visible');
        }
      });

      gsap.registerPlugin(ScrollTrigger);
      // Flip / ScrambleTextPlugin：桌機非同步載入，存在才註冊（手機不載入這兩個 library）
      if (typeof Flip !== 'undefined') gsap.registerPlugin(Flip);
      if (typeof ScrambleTextPlugin !== 'undefined') gsap.registerPlugin(ScrambleTextPlugin);

      // 🎯 ScrollTrigger 全域效能設定:
      //   - limitCallbacks: 限制 callback 頻率,避免快速滑動時 CPU 爆炸
      //   - ignoreMobileResize: 行動裝置 URL bar 收合不觸發重算
      ScrollTrigger.config({
        limitCallbacks: true,
        ignoreMobileResize: true,
      });

      // 🎯 延遲非關鍵動畫初始化，讓主執行緒優先完成 paint
      var _ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : function (cb) { setTimeout(cb, 200); };

      function runWhenNear(target, callback, rootMargin = '1600px 0px') {
        let didRun = false;
        const run = () => {
          if (didRun) return;
          didRun = true;
          callback();
        };

        if (!target || !('IntersectionObserver' in window)) {
          _ric(run);
          return;
        }

        const observer = new IntersectionObserver((entries) => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          observer.disconnect();
          _ric(run);
        }, { rootMargin });
        observer.observe(target);
      }

      runWhenNear(document.getElementById('stm-section'), function () {
        if (isMobileInit) return; // 手機版 stm-section display:none，跳過全部初始化
        _ric(function () {
          (function initSTM() {
            const stmSection = document.getElementById('stm-section');
            if (!stmSection) return;
            // 非同步載入的 plugin 此時應已到位；若還沒則補充註冊
            if (typeof Flip !== 'undefined') gsap.registerPlugin(Flip);
            if (typeof ScrambleTextPlugin !== 'undefined') gsap.registerPlugin(ScrambleTextPlugin);
            const stmLogo = document.getElementById('stmLogo');
            const stmEls = stmSection.querySelectorAll('.stm-el');

            stmEls.forEach(el => { el.dataset.text = el.textContent; });

            const scrambleChars = 'upperAndLowerCase';
            function stmScramble(el) {
              const text = el.dataset.text ?? el.textContent;
              const dur = el.dataset.stmScramble !== undefined ? parseFloat(el.dataset.stmScramble) : 1;
              gsap.killTweensOf(el);
              if (typeof ScrambleTextPlugin !== 'undefined') {
                gsap.fromTo(el,
                  { scrambleText: { text: '', chars: '' } },
                  { scrambleText: { text, chars: scrambleChars, revealDelay: 0 }, duration: dur }
                );
              } else {
                gsap.fromTo(el, { opacity: 0.3 }, { opacity: 1, duration: dur });
              }
            }

            stmEls.forEach(el => {
              ScrollTrigger.create({
                id: 'stm-scramble',
                trigger: el,
                start: 'top bottom',
                end: 'bottom top',
                onEnter: () => stmScramble(el),
                onEnterBack: () => stmScramble(el),
              });
            });

            if (typeof Flip !== 'undefined' && typeof Flip.getState === 'function') {
              stmEls.forEach(el => {
                try {
                  const originalClass = [...el.classList].find(c => c.startsWith('stm-pos-'));
                  const targetClass = el.dataset.stmAlt;
                  if (!originalClass || !targetClass) return;
                  const flipEase = el.dataset.stmFlipEase || 'expo.inOut';

                  el.classList.add(targetClass);
                  el.classList.remove(originalClass);
                  const flipState = Flip.getState(el, { props: 'opacity, filter, width' });
                  el.classList.add(originalClass);
                  el.classList.remove(targetClass);

                  if (flipState && flipState.elementStates && flipState.elementStates.length && flipState.elementStates[0].element) {
                    Flip.to(flipState, {
                      ease: flipEase,
                      scrollTrigger: { trigger: el, start: 'clamp(bottom bottom-=10%)', end: 'clamp(center center)', scrub: true }
                    });
                  }
                } catch (e) {
                  // Fallback: continue safely without Flip
                }
              });
            }
          })();
        });
      }, '2200px 0px'); // end lazy initSTM

      runWhenNear(document.querySelector('.gallery-header'), function () {
        _ric(function () {
          (function initMaskedReveal() {
            document.querySelectorAll('[data-reveal]').forEach(function (el) {
              var type = el.dataset.reveal || 'line';
              var delay = parseFloat(el.dataset.revealDelay || 0);
              var stagger = parseFloat(el.dataset.revealStagger || 0.08);
              var alreadyPastStart = el.getBoundingClientRect().top <= window.innerHeight * 0.85;
              var targets = [];

              if (type === 'word' || type === 'line') {
                var text = el.innerText.trim();
                var words = text.split(/\s+/);
                el.innerHTML = '';
                words.forEach(function (w, i) {
                  var wrap = document.createElement('span');
                  wrap.style.cssText = 'display:inline-block;overflow:clip;vertical-align:bottom;';
                  var inner = document.createElement('span');
                  inner.style.cssText = 'display:inline-block;';
                  inner.textContent = w + (i < words.length - 1 ? '\u00A0' : '');
                  wrap.appendChild(inner);
                  el.appendChild(wrap);
                  targets.push(inner);
                });
              } else {
                if (alreadyPastStart) {
                  gsap.set(el, { autoAlpha: 1, y: 0 });
                  return;
                }

                gsap.set(el, { autoAlpha: 0, y: 28 });
                gsap.to(el, {
                  autoAlpha: 1, y: 0, duration: 1.1, ease: 'power3.out',
                  delay: delay,
                  scrollTrigger: { trigger: el, start: 'top 85%', once: true }
                });
                return;
              }

              if (alreadyPastStart) {
                gsap.set(targets, { yPercent: 0 });
                return;
              }

              gsap.set(targets, { yPercent: 130 });
              gsap.to(targets, {
                yPercent: 0,
                duration: 1.2,
                ease: 'power4.out',
                stagger: stagger,
                delay: delay,
                scrollTrigger: { trigger: el, start: 'top 85%', once: true }
              });
            });
          })();
        });
      }, '1800px 0px'); // end lazy initMaskedReveal

      runWhenNear(document.querySelector('.gallery-header'), function () {
        _ric(function () {
          (function initGalleryHeader() {
            const header = document.querySelector('.gallery-header');
            if (!header) return;
            const lastItem = document.querySelector('.pg-item-6') || document.querySelector('.pg-item-5');
            if (!lastItem) return;

            // ── 退場文字動畫 ──
            const textLastItem = document.querySelector('.pg-item-5') || lastItem;
            let wordSpans = header.querySelectorAll('.gh-line span span');
            if (!wordSpans.length) wordSpans = header.querySelectorAll('.gh-line');
            const label = header.querySelector('.gallery-header-label');
            const sub = header.querySelector('.gallery-header-sub');
            const sideRails = header.querySelectorAll('.gh-side-rail');
            const sideLines = header.querySelectorAll('.gh-side-line');
            const sideLetters = header.querySelectorAll('.gh-side-letter');

            const exitTl = gsap.timeline({
              scrollTrigger: {
                trigger: textLastItem,
                start: 'bottom 65%',
                end: 'bottom 5%',
                scrub: 1.2,
              }
            });

            if (wordSpans.length) {
              exitTl.to(wordSpans, { yPercent: -130, ease: 'power2.in', stagger: { each: 0.04, from: 'start' } }, 0);
            }
            if (label) exitTl.to(label, { autoAlpha: 0, y: -15, ease: 'power2.in' }, 0);
            if (sub) exitTl.to(sub, { autoAlpha: 0, y: -15, ease: 'power2.in' }, 0.05);
            if (sideLines.length) exitTl.to(sideLines, { scaleX: 0.35, opacity: 0, ease: 'power2.in' }, 0);
            if (sideLetters.length) exitTl.to(sideLetters, { autoAlpha: 0, ease: 'power2.in' }, 0);
            if (sideRails.length) {
              exitTl.to(sideRails[0], { x: 44, ease: 'power2.in' }, 0);
              exitTl.to(sideRails[1], { x: -44, ease: 'power2.in' }, 0);
            }
          })();
        });
      }, '1800px 0px'); // end lazy initGalleryHeader

      // ★ 延遲到 macro-task，確保 DXM pin spacer 已插入 + ScrollTrigger.refresh() 已執行
      //   才建立 pg-item ScrollTriggers，否則 pin 造成的位移會讓 trigger 位置算錯
      runWhenNear(document.querySelector('.pg-gallery') || document.querySelector('.gallery-header'), function () {
        setTimeout(function initPgItems() {
          // ★ 確認 GSAP 已就緒，才啟用「裁切→進場」機制（對應 CSS 的 html.pg-anim-ready）。
          //   若 gsap 不存在（LINE 等內建瀏覽器 CDN 失敗），直接放棄遮罩動畫，圖片維持可見。
          if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
          document.documentElement.classList.add('pg-anim-ready');

          // ── core-capabilities 垂直線條進場（必須在 refresh 後才能取得正確 trigger 位置）──
          const ccapSection = document.getElementById('core-capabilities');
          /* .gh-vline 元素已隨 DXM 區塊移除 */
          const headerEl = document.querySelector('.gallery-header');
          const sideRails = headerEl ? headerEl.querySelectorAll('.gh-side-rail') : [];
          const sideLines = headerEl ? headerEl.querySelectorAll('.gh-side-line') : [];
          const sideLetters = headerEl ? headerEl.querySelectorAll('.gh-side-letter') : [];



          if (sideRails.length) {
            gsap.set(sideRails[0], { x: 44, autoAlpha: 0 });
            gsap.set(sideRails[1], { x: -44, autoAlpha: 0 });
          }
          if (sideLines.length) gsap.set(sideLines, { scaleX: 0, opacity: 0.24 });
          if (sideLetters.length) gsap.set(sideLetters, { autoAlpha: 0 });

          if (sideRails.length || sideLines.length || sideLetters.length) {
            const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
            if (headerRect && headerRect.bottom < window.innerHeight * 0.5) {
              if (sideRails.length) gsap.set(sideRails, { x: 0, autoAlpha: 1 });
              if (sideLines.length) gsap.set(sideLines, { scaleX: 1, opacity: 1 });
              if (sideLetters.length) gsap.set(sideLetters, { autoAlpha: 1 });
            } else if (headerEl) {
              ScrollTrigger.create({
                trigger: headerEl,
                start: 'top center',
                once: true,
                onEnter: () => {
                  const headerIntroTl = gsap.timeline();
                  if (sideRails.length) {
                    headerIntroTl.to(sideRails[0], {
                      x: 0,
                      autoAlpha: 1,
                      duration: 1.05,
                      ease: 'power3.out'
                    }, 0.18);
                    headerIntroTl.to(sideRails[1], {
                      x: 0,
                      autoAlpha: 1,
                      duration: 1.05,
                      ease: 'power3.out'
                    }, 0.18);
                  }
                  if (sideLines.length) {
                    headerIntroTl.to(sideLines, {
                      scaleX: 1,
                      opacity: 1,
                      duration: 0.95,
                      ease: 'power3.out',
                      stagger: 0.06
                    }, 0.28);
                  }
                  if (sideLetters.length) {
                    headerIntroTl.to(sideLetters, {
                      autoAlpha: 1,
                      duration: 0.72,
                      ease: 'power2.out',
                      stagger: 0.05
                    }, 0.22);
                  }
                }
              });
            }
          }

          document.querySelectorAll('.pg-item').forEach((item, i) => {
            const wrap = item.querySelector('.pg-img-wrap');
            const media = item.querySelector('.pg-img-wrap img') || item.querySelector('.pg-img-wrap video');
            const isVideo = media && media.tagName === 'VIDEO';

            // 若元素已在 viewport 內（頁面首屏的 pg-item-1），直接給終態，不做遮罩動畫
            const rect = item.getBoundingClientRect();
            const alreadyVisible = rect.top < window.innerHeight * 0.9;

            if (wrap) gsap.set(wrap, { clipPath: alreadyVisible ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)' });
            if (media && !isVideo) gsap.set(media, { scale: alreadyVisible ? 0.9 : 1.3 });

            const enterTl = gsap.timeline({
              scrollTrigger: {
                trigger: item,
                start: 'top 90%',
                toggleActions: 'play none none reverse'
              }
            });

            if (wrap) {
              enterTl.to(wrap, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'expo.out' }, 0);
            }
            if (media && !isVideo) {
              enterTl.to(media, { scale: 1.0, duration: 1.0, ease: 'power3.out' }, 0);
            }

            if (media && !isVideo) {
              const speed = [12, 18, 10, 20, 15, 22][i % 6];
              gsap.fromTo(media,
                { yPercent: -speed },
                {
                  yPercent: speed,
                  ease: 'none',
                  scrollTrigger: {
                    trigger: item,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 1.2
                  }
                }
              );
              if (!isMobileInit) {
                item.addEventListener('mouseenter', () =>
                  gsap.to(media, { scale: 1.0, duration: 0.8, ease: 'power2.out', overwrite: 'auto' })
                );
                item.addEventListener('mouseleave', () =>
                  gsap.to(media, { scale: 1.0, duration: 1.2, ease: 'expo.out', overwrite: 'auto' })
                );
              }
            }
          });
          // 建完所有 pg-item triggers 後再做一次 refresh，確保位置精準
          if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

          // ── 註：pg-item 高度以 vw 固定、圖片為 position:absolute 填滿，圖片載入不會
          //   改變版面，故不需在每張圖 load 後再 refresh（那會讓 scrub 視差瞬間 snap、跳一下）。

          // ★ LINE 等內建瀏覽器保險：逾時看門狗。若 ScrollTrigger 始終未把目前在
          //   視窗內的項目 reveal（仍維持 inset(100%) 完全裁切），就強制打開，避免空白。
          const pgRevealStuck = () => {
            document.querySelectorAll('.pg-gallery .pg-item').forEach((item) => {
              const wrap = item.querySelector('.pg-img-wrap');
              if (!wrap) return;
              const rect = item.getBoundingClientRect();
              const inView = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
              const clipped = (getComputedStyle(wrap).clipPath || '').indexOf('100%') !== -1;
              if (inView && clipped) gsap.set(wrap, { clipPath: 'inset(0% 0% 0% 0%)' });
            });
          };
          setTimeout(pgRevealStuck, 1500);
          setTimeout(pgRevealStuck, 4000);
          window.addEventListener('load', () => setTimeout(pgRevealStuck, 600), { once: true });
        }, 0);
      }, '2200px 0px');

      // =========================================================
      // pg-item Hover Copy Effect (AWW-style float reveal)
      // =========================================================
      (function initPgHoverStories() {
        document.querySelectorAll('.pg-gallery .pg-item').forEach((item) => {
          item.classList.remove('pg-item--hover-story', 'is-hovered');
        });
        document.querySelectorAll('.pg-gallery .pg-hover-copy').forEach((overlay) => overlay.remove());
      })();

      const _prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const _useNativeTouchScroll = window.matchMedia('(hover: none), (pointer: coarse)').matches;

      // 🎯 無論是否使用 Lenis，都要在資源就緒後重新校準 ScrollTrigger
      window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => { });
      }

      if (typeof Lenis !== 'undefined' && !_useNativeTouchScroll) {

        // 🎯 滾動絲滑核心配置：
        //   - 改用 lerp 模式（取代 duration 模式），消除起步遲鈍的「漂浮感」
        //   - lerp 0.09：每一幀靠近目標 9%，~12 幀完成輸入，貼指又不抖
        //   - wheelMultiplier 1.0：尊重使用者滾輪原始力道，不放大也不削弱
        //   - touchMultiplier 1.5：觸控比滾輪略保守，行動裝置避免衝過頭
        const lenis = new Lenis({
          lerp: _prefersReducedMotion ? 1 : 0.09,
          smoothWheel: !_prefersReducedMotion,
          wheelMultiplier: 1.0,
          touchMultiplier: 1.5,
          syncTouch: false,
          infinite: false,
          // 兼容舊版 Lenis 1.0.42 的二級 fallback（lerp 設了會優先生效）
          duration: 1.0,
          easing: t => 1 - Math.pow(1 - t, 3),
        });
        lenis.on('scroll', ScrollTrigger.update);
        lenis.on('scroll', scheduleSyncScrollState);

        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
        window._lenis = lenis;

        // 🎯 分頁切回前景時,Lenis 可能因背景時 rAF 暫停而留下殘餘速度,重置一次避免「進場閃移」
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && window._lenis) {
            // 立即同步到當前位置,清除 velocity
            window._lenis.scrollTo(window._lenis.scroll, { immediate: true, force: true });
          }
        });

        // 🎯 全站錨點連結 (href="#xxx") 統一走 Lenis,避免原生跳轉跟 Lenis 衝突造成卡頓
        document.addEventListener('click', (e) => {
          const a = e.target.closest('a[href^="#"]');
          if (!a) return;
          const href = a.getAttribute('href');
          if (!href || href === '#' || href.length < 2) return;
          const target = document.querySelector(href);
          if (!target) return;
          e.preventDefault();
          window._lenis.scrollTo(target, { duration: 1.4, offset: 0 });
        }, { passive: false });
      } else {
        window._lenis = null;
      }

      let currentVelocity = 0;
      const isMobileHomeNav = () => window.innerWidth <= 767;
      const isSimpleTouchNavMode = () => window.innerWidth <= 1024;

      // scroll > 300px → 隱藏 #nav，顯示 #nav_scroll
      let _showingScrollNav = false;
      const navScrollContainer = document.getElementById('nav_scroll_container');
      const navScrollEl = document.getElementById('nav_scroll');
      const navScrollMenuBtn = document.getElementById('nav-scroll-menu-btn');
      const navScrollDropdown = document.getElementById('nav-scroll-dropdown');
      const navScrollDropdownContent = document.getElementById('nav-scroll-dropdown-content');
      const navScrollDropdownItems = navScrollDropdown
        ? navScrollDropdown.querySelectorAll('.ns-dropdown__item, .ns-social-link')
        : [];
      const navScrollLinks = navScrollDropdown
        ? navScrollDropdown.querySelectorAll('a')
        : [];
      const navShowcaseRows = navScrollDropdown
        ? navScrollDropdown.querySelectorAll('.ns-showcase-row')
        : [];
      const navShowcaseThumbs = navScrollDropdown
        ? navScrollDropdown.querySelectorAll('.ns-showcase-row__thumb')
        : [];
      const navShowcaseThumbImages = navScrollDropdown
        ? navScrollDropdown.querySelectorAll('.ns-showcase-row__thumb img')
        : [];
      let isNavScrollMenuOpen = false;
      let navScrollMenuAnimating = false;
      let navScrollMenuTl = null;
      let navScrollMenuCloseTl = null;
      let navScrollHoverCloseTimer = null;
      let navScrollBlendFadeTimer = null;
      let activeNavShowcaseRow = null;
      const navRowHoverTimelines = new Map();
      const NAV_SCROLL_CLOSED_HEIGHT = 64;
      const NAV_SCROLL_COLLAPSED_HEIGHT = 4;
      const NAV_SCROLL_CLOSED_RADIUS = 6;
      const NAV_SCROLL_LINE_RADIUS = 999;
      const NAV_SCROLL_CLOSED_BG = '#141414';
      const NAV_SCROLL_OPEN_BG = '#efe6d8';
      const NAV_SCROLL_THUMB_IDLE_SCALE = 1.3;
      const NAV_SCROLL_TITLE_SHIFT = 104;
      const NAV_SCROLL_HOVER_TRACK_SHIFT = 26;
      const NAV_SCROLL_HOVER_INDEX_SHIFT = 9;

      function clearNavScrollBlend() {
        if (!navScrollContainer) return;
        if (navScrollBlendFadeTimer) {
          clearTimeout(navScrollBlendFadeTimer);
          navScrollBlendFadeTimer = null;
        }
        navScrollContainer.classList.remove('is-blend-fadeout');
      }

      function activateNavScrollBlend() {
        if (!navScrollContainer) return;
        clearNavScrollBlend();
      }

      function releaseNavScrollBlend() {
        if (!navScrollContainer) return;
        clearNavScrollBlend();
        navScrollContainer.classList.add('is-blend-fadeout');
        navScrollBlendFadeTimer = setTimeout(() => {
          navScrollContainer.classList.remove('is-blend-fadeout');
          navScrollBlendFadeTimer = null;
        }, 260);
      }

      function stopNavScrollCloseTimeline() {
        if (!navScrollMenuCloseTl) return;
        navScrollMenuCloseTl.kill();
        navScrollMenuCloseTl = null;
      }

      function syncNavScrollMenuCursorLabel() {
        if (!navScrollMenuBtn) return;
        const isMenuOpen = navScrollMenuBtn.getAttribute('aria-expanded') === 'true';
        const cursorLabel = isMenuOpen ? 'CLOSE' : 'OPEN';
        const cursorSide = isMenuOpen ? 'left' : 'right';
        navScrollMenuBtn.dataset.cursor = cursorLabel;
        navScrollMenuBtn.dataset.cursorSide = cursorSide;

        const cursorRing = document.getElementById('cursor-ring');
        if (cursorRing && navScrollMenuBtn.matches(':hover')) {
          cursorRing.setAttribute('data-cursor-label', cursorLabel);
          cursorRing.setAttribute('data-cursor-side', cursorSide);
        }
      }

      function finalizeNavScrollClosedState() {
        navScrollMenuAnimating = false;
        stopNavScrollCloseTimeline();
        navScrollContainer?.classList.remove('is-menu-open', 'is-menu-animating');
        navScrollDropdown.style.pointerEvents = 'none';
        navScrollMenuBtn?.setAttribute('aria-expanded', 'false');
        syncNavScrollMenuCursorLabel();
        navScrollDropdown.setAttribute('aria-hidden', 'true');
        setNavScrollShellState('closed');
        releaseNavScrollBlend();
        setNavScrollPointerState();
      }

      function getNavScrollClosedWidth() {
        const inset = window.innerWidth <= 767 ? 24 : 80;
        return Math.min(500, Math.max(280, window.innerWidth - inset));
      }

      function getNavScrollClosedTop() {
        return window.innerWidth <= 767 ? 16 : 30;
      }

      function getNavScrollCollapsedTop() {
        return getNavScrollClosedTop() + ((NAV_SCROLL_CLOSED_HEIGHT - NAV_SCROLL_COLLAPSED_HEIGHT) / 2);
      }

      function getNavScrollOpenWidth() {
        return window.innerWidth;
      }

      function getNavScrollOpenRadius() {
        return 0;
      }

      function getNavScrollOpenHeight() {
        return window.innerHeight;
      }

      function setActiveNavShowcaseRow(row = null) {
        if (isSimpleTouchNavMode()) {
          activeNavShowcaseRow = null;
          navShowcaseRows.forEach((item) => {
            item.classList.remove('is-previewed');
          });
          return;
        }
        activeNavShowcaseRow = row;
        navShowcaseRows.forEach((item) => {
          item.classList.toggle('is-previewed', item === row);
        });
      }

      function getNavShowcaseThumbHiddenClip(target) {
        return target.classList.contains('is-right')
          ? 'inset(0% 100% 0% 0%)'
          : 'inset(0% 0% 0% 100%)';
      }

      function getNavShowcaseThumbTargets(row = null) {
        const thumbs = row
          ? Array.from(row.querySelectorAll('.ns-showcase-row__thumb'))
          : Array.from(navShowcaseThumbs);
        const images = row
          ? thumbs.map((thumb) => thumb.querySelector('img')).filter(Boolean)
          : Array.from(navShowcaseThumbImages);
        return { thumbs, images };
      }

      function getNavShowcaseTitleTargets(row = null) {
        const track = row ? row.querySelector('.ns-showcase-row__title-track') : null;
        const primary = row ? row.querySelector('.ns-showcase-row__title-layer.is-primary') : null;
        const accent = row ? row.querySelector('.ns-showcase-row__title-layer.is-accent') : null;
        const indexEl = row ? row.querySelector('.ns-showcase-row__index') : null;
        return { track, primary, accent, indexEl };
      }

      function hydrateNavShowcaseImages(scope = navScrollDropdown) {
        if (!scope) return;
        scope.querySelectorAll('img[data-nav-src]').forEach((img) => {
          img.src = img.dataset.navSrc;
          img.removeAttribute('data-nav-src');
        });
      }

      function setNavShowcaseThumbsHidden(row = null) {
        if (typeof gsap === 'undefined') return;
        const { thumbs, images } = getNavShowcaseThumbTargets(row);
        if (!thumbs.length) return;
        gsap.set(thumbs, {
          autoAlpha: 0,
          clipPath: (_, target) => getNavShowcaseThumbHiddenClip(target)
        });
        if (images.length) gsap.set(images, { scale: NAV_SCROLL_THUMB_IDLE_SCALE });
      }

      function resetNavShowcaseHoverState(row = null) {
        if (!row) {
          navShowcaseRows.forEach((item) => resetNavShowcaseHoverState(item));
          setActiveNavShowcaseRow(null);
          return;
        }

        const timeline = navRowHoverTimelines.get(row);
        if (timeline) {
          timeline.pause(0);
        } else {
          setNavShowcaseThumbsHidden(row);
        }

        const { track, primary, accent, indexEl } = getNavShowcaseTitleTargets(row);
        if (typeof gsap !== 'undefined') {
          if (track) gsap.set(track, { x: 0 });
          if (primary) gsap.set(primary, { yPercent: 0 });
          if (accent) gsap.set(accent, { yPercent: NAV_SCROLL_TITLE_SHIFT });
          if (indexEl) gsap.set(indexEl, { x: 0, color: '' });
          gsap.set(row, { clearProps: 'backgroundColor' });
        }
      }

      function initNavShowcaseHoverTimelines() {
        if (typeof gsap === 'undefined') return;

        navShowcaseRows.forEach((row) => {
          if (navRowHoverTimelines.has(row)) return;

          const { thumbs, images } = getNavShowcaseThumbTargets(row);
          const { track, primary, accent, indexEl } = getNavShowcaseTitleTargets(row);

          if (!thumbs.length || !track || !primary || !accent) return;

          gsap.set(thumbs, {
            autoAlpha: 0,
            clipPath: (_, target) => getNavShowcaseThumbHiddenClip(target)
          });
          if (images.length) gsap.set(images, { scale: NAV_SCROLL_THUMB_IDLE_SCALE });
          gsap.set(track, { x: 0 });
          gsap.set(primary, { yPercent: 0 });
          gsap.set(accent, { yPercent: NAV_SCROLL_TITLE_SHIFT });
          if (indexEl) gsap.set(indexEl, { x: 0 });

          const tl = gsap.timeline({
            paused: true,
            defaults: { overwrite: 'auto' },
            onStart: () => {
              setActiveNavShowcaseRow(row);
            },
            onReverseComplete: () => {
              if (activeNavShowcaseRow === row) {
                setActiveNavShowcaseRow(null);
              }
            }
          });

          tl.to(thumbs, {
            autoAlpha: 1,
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: 0.42,
            ease: 'expo.out',
            stagger: 0.025
          }, 0);
          if (images.length) {
            tl.to(images, {
              scale: 1,
              duration: 0.46,
              ease: 'expo.out',
              stagger: 0.025
            }, 0.02);
          }
          tl.to(primary, {
            yPercent: -NAV_SCROLL_TITLE_SHIFT,
            duration: 0.46,
            ease: 'expo.out'
          }, 0.02)
            .to(accent, {
              yPercent: 0,
              duration: 0.46,
              ease: 'expo.out'
            }, 0.02);

          if (indexEl) {
            tl.to(indexEl, {
              color: 'rgba(23, 20, 17, 0.55)',
              duration: 0.38,
              ease: 'expo.out'
            }, 0.04);
          }

          navRowHoverTimelines.set(row, tl);
        });
      }

      function hideNavScrollPreview(row = activeNavShowcaseRow, immediate = false) {
        if (typeof gsap === 'undefined') return;
        if (navScrollHoverCloseTimer) {
          clearTimeout(navScrollHoverCloseTimer);
          navScrollHoverCloseTimer = null;
        }

        if (isSimpleTouchNavMode()) {
          resetNavShowcaseHoverState(row || null);
          return;
        }

        if (!row) {
          resetNavShowcaseHoverState();
          return;
        }

        const timeline = navRowHoverTimelines.get(row);
        if (!timeline) {
          resetNavShowcaseHoverState(row);
          return;
        }

        if (immediate || isSimpleTouchNavMode()) {
          resetNavShowcaseHoverState(row);
        } else {
          timeline.timeScale(1.8).reverse();
        }
      }

      function showNavScrollPreview(row) {
        if (!row || typeof gsap === 'undefined') return;
        if (isSimpleTouchNavMode() || !isNavScrollMenuOpen) return;
        hydrateNavShowcaseImages(row);

        if (navScrollHoverCloseTimer) {
          clearTimeout(navScrollHoverCloseTimer);
          navScrollHoverCloseTimer = null;
        }

        if (activeNavShowcaseRow && activeNavShowcaseRow !== row) {
          const previousTimeline = navRowHoverTimelines.get(activeNavShowcaseRow);
          previousTimeline?.timeScale(1.6).reverse();
        }

        setActiveNavShowcaseRow(row);
        const timeline = navRowHoverTimelines.get(row);
        if (!timeline) return;
        timeline.timeScale(1).play();
      }

      function scheduleHideNavScrollPreview(row = activeNavShowcaseRow) {
        if (navScrollHoverCloseTimer) clearTimeout(navScrollHoverCloseTimer);
        navScrollHoverCloseTimer = setTimeout(() => {
          hideNavScrollPreview(row);
          navScrollHoverCloseTimer = null;
        }, 110);
      }

      function setNavScrollShellState(state = 'closed') {
        if (!navScrollContainer || !navScrollDropdown || typeof gsap === 'undefined') return;

        if (state === 'open') {
          gsap.set(navScrollContainer, {
            top: 0,
            width: getNavScrollOpenWidth(),
            height: getNavScrollOpenHeight(),
            borderRadius: getNavScrollOpenRadius(),
            backgroundColor: NAV_SCROLL_OPEN_BG
          });
          gsap.set(navScrollDropdown, { opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0%)', filter: 'blur(0px)' });
          if (navScrollDropdownItems.length) gsap.set(navScrollDropdownItems, { y: 0, opacity: 1, filter: 'blur(0px)' });
          return;
        }

        gsap.set(navScrollContainer, {
          top: getNavScrollClosedTop(),
          width: getNavScrollClosedWidth(),
          height: NAV_SCROLL_CLOSED_HEIGHT,
          borderRadius: NAV_SCROLL_CLOSED_RADIUS,
          backgroundColor: NAV_SCROLL_CLOSED_BG
        });
        gsap.set(navScrollDropdown, { opacity: 0, y: 24, clipPath: 'inset(6% 0% 0% 0%)', filter: 'blur(12px)' });
        if (navScrollDropdownItems.length) gsap.set(navScrollDropdownItems, { y: 34, opacity: 0, filter: 'blur(14px)' });
        resetNavShowcaseHoverState();
      }

      function setNavScrollPointerState() {
        if (!navScrollContainer) return;
        const isInteractive = isMobileHomeNav() || _showingScrollNav || isNavScrollMenuOpen;
        navScrollContainer.style.pointerEvents = isInteractive ? 'auto' : 'none';
        if (isInteractive) {
          navScrollContainer.removeAttribute('inert');
        } else {
          if (navScrollContainer.contains(document.activeElement)) {
            document.activeElement?.blur?.();
          }
          navScrollContainer.setAttribute('inert', '');
        }
      }

      function initNavScrollMenu() {
        if (!navScrollContainer || !navScrollDropdown || !navScrollDropdownContent || typeof gsap === 'undefined') return;

        setNavScrollShellState('closed');
        syncNavScrollMenuCursorLabel();
        initNavShowcaseHoverTimelines();
        resetNavShowcaseHoverState();
        stopNavScrollCloseTimeline();

        if (isMobileHomeNav()) {
          _showingScrollNav = true;
          document.documentElement.classList.add('show-nav-scroll');
          navScrollContainer.classList.remove('ns-enter', 'ns-exit');
          setNavScrollPointerState();
        }

        navScrollMenuTl = gsap.timeline({
          paused: true,
          defaults: { ease: 'expo.inOut' },
          onStart: () => {
            stopNavScrollCloseTimeline();
            navScrollMenuAnimating = true;
            navScrollDropdown.style.pointerEvents = 'auto';
            navScrollContainer?.classList.add('is-menu-open', 'is-menu-animating');
            activateNavScrollBlend();
            navScrollMenuBtn?.setAttribute('aria-expanded', 'true');
            syncNavScrollMenuCursorLabel();
            navScrollDropdown.setAttribute('aria-hidden', 'false');
            setNavScrollPointerState();
          },
          onComplete: () => {
            navScrollMenuAnimating = false;
            navScrollContainer?.classList.remove('is-menu-animating');
          },
          onReverseComplete: () => {
            finalizeNavScrollClosedState();
          }
        });

        navScrollMenuTl
          .to(navScrollContainer, {
            top: () => getNavScrollCollapsedTop(),
            height: NAV_SCROLL_COLLAPSED_HEIGHT,
            borderRadius: NAV_SCROLL_LINE_RADIUS,
            duration: 0.2,
            ease: 'power3.inOut'
          }, 0)
          .to(navScrollContainer, {
            width: () => getNavScrollOpenWidth(),
            duration: 0.25,
            ease: 'power3.inOut'
          }, 0.1)
          .to(navScrollContainer, {
            top: 0,
            height: () => getNavScrollOpenHeight(),
            borderRadius: () => getNavScrollOpenRadius(),
            backgroundColor: NAV_SCROLL_OPEN_BG,
            duration: 0.35,
            ease: 'power3.inOut'
          }, 0.3)
          .to(navScrollDropdown, {
            opacity: 1,
            y: 0,
            clipPath: 'inset(0% 0% 0% 0%)',
            filter: 'blur(0px)',
            duration: 0.3,
            ease: 'power2.out'
          }, 0.35)
          .to(navScrollDropdownItems, {
            y: 0,
            opacity: 1,
            filter: 'blur(0px)',
            duration: 0.35,
            stagger: 0.02,
            ease: 'power2.out'
          }, 0.4);
      }

      function openNavScrollMenu() {
        if (!navScrollMenuTl || isNavScrollMenuOpen || navScrollMenuAnimating) return;
        stopNavScrollCloseTimeline();
        hydrateNavShowcaseImages();
        isNavScrollMenuOpen = true;
        navScrollMenuAnimating = true;
        navScrollMenuTl.timeScale(1);
        navScrollMenuTl.play(0);
      }

      function closeNavScrollMenu(options = {}) {
        const menuClassOpen = navScrollContainer?.classList.contains('is-menu-open');
        if (!navScrollMenuTl || (!isNavScrollMenuOpen && !navScrollMenuAnimating && !menuClassOpen)) return;
        const immediate = options.immediate === true;
        const onAfterClose = typeof options.onAfterClose === 'function' ? options.onAfterClose : null;
        isNavScrollMenuOpen = false;
        navScrollMenuAnimating = true;
        hideNavScrollPreview(activeNavShowcaseRow, true);
        if (immediate) {
          stopNavScrollCloseTimeline();
          navScrollMenuTl.pause(0);
          finalizeNavScrollClosedState();
          if (onAfterClose) onAfterClose();
          return;
        }
        hideNavScrollPreview(activeNavShowcaseRow, true);
        // 立刻移除 is-menu-open，讓漢堡 CSS 快速還原
        stopNavScrollCloseTimeline();
        navScrollMenuTl.pause();
        navScrollDropdown.style.pointerEvents = 'none';
        navScrollContainer?.classList.add('is-menu-animating');

        navScrollMenuCloseTl = gsap.timeline({
          defaults: { overwrite: 'auto' },
          onComplete: () => {
            finalizeNavScrollClosedState();
            if (onAfterClose) onAfterClose();
          }
        });

        navScrollMenuCloseTl
          .to(navScrollDropdown, {
            opacity: 0,
            y: 10,
            clipPath: 'inset(2% 0% 0% 0%)',
            filter: 'blur(4px)',
            duration: 0.18,
            ease: 'power2.in'
          }, 0)
          .to(navScrollContainer, {
            top: () => getNavScrollCollapsedTop(),
            height: NAV_SCROLL_COLLAPSED_HEIGHT,
            borderRadius: NAV_SCROLL_LINE_RADIUS,
            duration: 0.2,
            ease: 'power3.inOut'
          }, 0.05)
          .to(navScrollContainer, {
            width: () => getNavScrollClosedWidth(),
            duration: 0.25,
            ease: 'power3.inOut'
          }, 0.2)
          .add(() => {
            navScrollContainer?.classList.remove('is-menu-open');
          }, 0.45)
          .to(navScrollContainer, {
            top: () => getNavScrollClosedTop(),
            height: NAV_SCROLL_CLOSED_HEIGHT,
            borderRadius: NAV_SCROLL_CLOSED_RADIUS,
            backgroundColor: NAV_SCROLL_CLOSED_BG,
            duration: 0.25,
            ease: 'power3.out'
          }, 0.45);
      }

      function syncNavScrollMenuLayout() {
        if (!navScrollContainer || typeof gsap === 'undefined') return;
        if (isNavScrollMenuOpen) {
          setNavScrollShellState('open');
          return;
        }
        if (!navScrollMenuAnimating) {
          setNavScrollShellState('closed');
        }
      }

      initNavScrollMenu();

      // hover auto-open removed — menu opens only on hamburger click

      navScrollMenuBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!_showingScrollNav || navScrollMenuAnimating) return;
        if (isNavScrollMenuOpen) closeNavScrollMenu();
        else openNavScrollMenu();
      });

      navScrollLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
          const menuClassOpen = navScrollContainer?.classList.contains('is-menu-open');
          if (!isNavScrollMenuOpen && !navScrollMenuAnimating && !menuClassOpen) return;
          e.preventDefault();
          e.stopPropagation();
          const href = link.getAttribute('href');
          const label = link.dataset.transitionLabel || '';
          document.documentElement.classList.add('is-menu-link-transition');
          closeNavScrollMenu({
            onAfterClose: () => {
              document.documentElement.classList.remove('is-menu-link-transition');
              if (!href) return;
              const dest = new URL(href, window.location.href);
              const isSamePage = isSameOriginSamePath(dest);
              if (isSamePage && dest.hash) {
                const target = document.querySelector(dest.hash);
                if (target) {
                  if (window._lenis && typeof window._lenis.scrollTo === 'function') {
                    window._lenis.scrollTo(target, { duration: 1.15, offset: -24 });
                  } else {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }
              } else if (window._nudotNavigate) {
                window._nudotNavigate(dest.href, label);
              } else {
                window.location.href = dest.href;
              }
            }
          });
        });
      });

      function isSameOriginSamePath(url) {
        if (url.origin !== window.location.origin) return false;
        const normalize = (p) => p.replace(/\/index\.html$/i, '/').replace(/\/$/, '') || '/';
        return normalize(url.pathname) === normalize(window.location.pathname);
      }

      navShowcaseRows.forEach((row) => {
        row.addEventListener('pointerenter', () => {
          showNavScrollPreview(row);
        });
        row.addEventListener('focus', () => {
          showNavScrollPreview(row);
        });
        row.addEventListener('pointerleave', () => {
          scheduleHideNavScrollPreview(row);
        });
        row.addEventListener('blur', () => {
          scheduleHideNavScrollPreview(row);
        });
      });

      navScrollDropdown?.addEventListener('pointerenter', () => {
        if (navScrollHoverCloseTimer) {
          clearTimeout(navScrollHoverCloseTimer);
          navScrollHoverCloseTimer = null;
        }
      });

      navScrollDropdown?.addEventListener('pointerleave', () => {
        hideNavScrollPreview();
      });

      document.addEventListener('click', (event) => {
        if (!isNavScrollMenuOpen || !navScrollContainer) return;
        if (!navScrollContainer.contains(event.target)) {
          closeNavScrollMenu();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeNavScrollMenu();
      });

      window.addEventListener('resize', () => {
        syncNavScrollMenuLayout();
        if (isSimpleTouchNavMode()) {
          hideNavScrollPreview(null, true);
        } else if (activeNavShowcaseRow && isNavScrollMenuOpen) {
          showNavScrollPreview(activeNavShowcaseRow);
        }
      }, { passive: true });

      let navScrollAnimRaf = 0;
      function scheduleNavScrollState(nextClass) {
        if (!navScrollContainer) return;
        if (isMobileHomeNav()) {
          if (navScrollAnimRaf) cancelAnimationFrame(navScrollAnimRaf);
          navScrollAnimRaf = 0;
          navScrollContainer.classList.remove('ns-enter', 'ns-exit');
          return;
        }
        if (navScrollAnimRaf) cancelAnimationFrame(navScrollAnimRaf);
        navScrollContainer.classList.remove('ns-enter', 'ns-exit');
        navScrollAnimRaf = requestAnimationFrame(() => {
          navScrollAnimRaf = 0;
          navScrollContainer.classList.add(nextClass);
        });
      }

      function triggerNavScrollEnter() {
        if (!navScrollContainer) return;
        if (isMobileHomeNav()) {
          navScrollContainer.classList.remove('ns-enter', 'ns-exit');
          setNavScrollShellState('closed');
          setNavScrollPointerState();
          return;
        }
        clearNavScrollBlend();
        setNavScrollShellState('closed');
        scheduleNavScrollState('ns-enter');
        setNavScrollPointerState();
      }
      function triggerNavScrollExit() {
        if (!navScrollContainer) return;
        if (isMobileHomeNav()) {
          navScrollContainer.classList.remove('ns-enter', 'ns-exit');
          setNavScrollShellState('closed');
          setNavScrollPointerState();
          return;
        }
        closeNavScrollMenu({ immediate: true });
        scheduleNavScrollState('ns-exit');
        setNavScrollPointerState();
      }

      const syncNavScrollFromPosition = (scroll, velocity = 0) => {
        currentVelocity = velocity;
        if (isMobileHomeNav()) {
          if (!_showingScrollNav) {
            _showingScrollNav = true;
            document.documentElement.classList.add('show-nav-scroll');
            navScrollContainer?.classList.remove('ns-enter', 'ns-exit');
            setNavScrollShellState('closed');
          }
          setNavScrollPointerState();
          return;
        }
        const shouldSwitch = scroll > 300;
        if (shouldSwitch !== _showingScrollNav) {
          _showingScrollNav = shouldSwitch;
          document.documentElement.classList.toggle('show-nav-scroll', _showingScrollNav);
          if (_showingScrollNav) triggerNavScrollEnter();
          else triggerNavScrollExit();
        }
      };

      if (window._lenis && typeof window._lenis.on === 'function') {
        window._lenis.on('scroll', ({ velocity, scroll }) => {
          syncNavScrollFromPosition(scroll, velocity);
        });
      } else {
        window.addEventListener('scroll', () => {
          syncNavScrollFromPosition(window.scrollY || window.pageYOffset || 0, 0);
        }, { passive: true });
        syncNavScrollFromPosition(window.scrollY || window.pageYOffset || 0, 0);
      }

      const progressBar = document.getElementById('scroll-progress');
      if (progressBar) {
        let currentWidth = 0;
        let targetWidth = 0;
        let progressRaf = 0;
        let _lastWrittenWidth = -1; // 🎯 避免每幀都寫入 style
        let _progressMax = 1;
        let _progressMaxRaf = 0;

        function updateProgressMax() {
          _progressMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          updateProgressTarget();
        }

        function requestProgressTick() {
          if (!progressRaf) progressRaf = requestAnimationFrame(progressTick);
        }

        function updateProgressTarget() {
          const scrollY = window._lenis ? window._lenis.scroll : window.scrollY;
          targetWidth = _progressMax > 0 ? (scrollY / _progressMax) * 100 : 0;
          requestProgressTick();
        }

        function progressTick() {
          progressRaf = 0;
          currentWidth += (targetWidth - currentWidth) * 0.12;
          if (Math.abs(currentWidth - _lastWrittenWidth) > 0.05) {
            progressBar.style.transform = 'scaleX(' + (currentWidth / 100) + ')';
            _lastWrittenWidth = currentWidth;
          }
          if (Math.abs(targetWidth - currentWidth) > 0.05) requestProgressTick();
        }

        function scheduleProgressMaxUpdate() {
          if (_progressMaxRaf) return;
          _progressMaxRaf = requestAnimationFrame(() => {
            _progressMaxRaf = 0;
            updateProgressMax();
          });
        }

        updateProgressMax();
        window.addEventListener('load', scheduleProgressMaxUpdate, { once: true });
        window.addEventListener('resize', scheduleProgressMaxUpdate, { passive: true });
        window.addEventListener('scroll', updateProgressTarget, { passive: true });
        if (window._lenis) window._lenis.on('scroll', updateProgressTarget);
        if ('ResizeObserver' in window && document.body) {
          new ResizeObserver(scheduleProgressMaxUpdate).observe(document.body);
        }
      }

      /* footer-time 元素已從版面移除，原 initFooterClock 時鐘 JS 一併清除 */

      runWhenNear(document.getElementById('site-footer'), function () {
        _ric(function () {
          (function initFooterReveal() {
            const footer = document.getElementById('site-footer');
            if (!footer) return;

            const infoBar = footer.querySelector('.footer-info-bar');
            const description = footer.querySelector('.footer-description');
            const contactInfo = footer.querySelector('.footer-contact-info');
            const webAdd = footer.querySelector('.web_add');
            const navLinks = footer.querySelector('.footer-nav-links');
            const thumb = footer.querySelector('.footer-video-thumb');
            const cBridge = document.getElementById('footer-c-bridge');
            const parallaxBg = document.getElementById('footer-parallax-bg');

            if (parallaxBg && parallaxBg.dataset.bg) {
              parallaxBg.style.setProperty('--footer-bg-image', `url("${parallaxBg.dataset.bg}")`);
            }

            // ── 1. Animated border line (replaces CSS border-top on infoBar)
            let infoLine = null;
            if (infoBar) {
              infoLine = document.createElement('div');
              infoLine.className = 'footer-info-line';
              infoBar.parentNode.insertBefore(infoLine, infoBar);
              infoBar.style.borderTop = 'none';
              gsap.set(infoLine, { scaleX: 0 });
            }

            // ── 2. Wrap info-bar spans for y-clip reveal
            const rawSpans = infoBar ? [...infoBar.querySelectorAll('span')] : [];
            const spanInners = rawSpans.map(span => {
              const wrap = document.createElement('span');
              wrap.className = 'frev-wrap';
              const inner = document.createElement('span');
              inner.style.display = 'inline-block';
              inner.textContent = span.textContent;
              span.textContent = '';
              wrap.appendChild(inner);
              span.appendChild(wrap);
              return inner;
            });
            if (spanInners.length) gsap.set(spanInners, { y: '110%' });

            // ── 3. Wrap nav links for y-clip reveal
            const navAnchors = navLinks ? [...navLinks.querySelectorAll('a')] : [];
            navAnchors.forEach(a => {
              const wrap = document.createElement('span');
              wrap.className = 'frev-wrap';
              a.parentNode.insertBefore(wrap, a);
              wrap.appendChild(a);
            });
            if (navAnchors.length) gsap.set(navAnchors, { y: '120%' });

            // ── 4. Wrap email / phone individually for y reveal
            const contactEmail = contactInfo ? contactInfo.querySelector('a') : null;
            const contactPhone = contactInfo ? contactInfo.querySelector('span') : null;
            if (contactEmail) {
              const ew = document.createElement('div');
              ew.style.overflow = 'hidden';
              contactEmail.parentNode.insertBefore(ew, contactEmail);
              ew.appendChild(contactEmail);
              gsap.set(contactEmail, { y: '105%' });
            }
            if (contactPhone) {
              const pw = document.createElement('div');
              pw.style.cssText = 'overflow:hidden;display:block;';
              contactPhone.parentNode.insertBefore(pw, contactPhone);
              pw.appendChild(contactPhone);
              gsap.set(contactPhone, { display: 'inline-block', y: '105%' });
            }

            // ── 5. Video cover overlay (wipe reveal)
            let videoCover = null;
            if (thumb) {
              videoCover = document.createElement('div');
              videoCover.className = 'footer-video-cover';
              thumb.appendChild(videoCover);
            }

            // ── Entry timeline
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: footer,
                start: 'top 82%',
              }
            });

            // Border line: scaleX wipe left→right
            if (infoLine) {
              tl.to(infoLine, {
                scaleX: 1, duration: 1.1, ease: 'power3.inOut'
              }, 0);
            }

            // Info-bar spans: stagger slide up from clip
            if (spanInners.length) {
              tl.to(spanInners, {
                y: '0%', duration: 1.0, stagger: 0.1, ease: 'power4.out'
              }, 0.2);
            }

            // Description: clipPath reveal upward
            if (description) {
              tl.fromTo(description,
                { clipPath: 'inset(0 0 100% 0)', y: 20 },
                { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1.1, ease: 'power4.out' },
                0.5
              );
            }

            // Email: slide up from overflow wrap
            if (contactEmail) {
              tl.to(contactEmail, {
                y: '0%', duration: 1.2, ease: 'power4.out'
              }, 0.68);
            }

            // Phone: clip reveal
            if (contactPhone) {
              tl.to(contactPhone, {
                y: '0%', duration: 0.9, ease: 'power3.out'
              }, 0.85);
            }

            // Address
            if (webAdd) {
              tl.from(webAdd, {
                y: 14, opacity: 0, duration: 0.8, ease: 'power3.out'
              }, 0.95);
            }

            // Nav links: stagger slide up
            if (navAnchors.length) {
              tl.to(navAnchors, {
                y: '0%', duration: 0.85, stagger: 0.07, ease: 'power4.out'
              }, 1.05);
            }

            // Video cover: wipe right→left (sweep away) — faster entrance
            if (videoCover) {
              tl.fromTo(videoCover,
                { scaleX: 1 },
                { scaleX: 0, duration: 0.85, ease: 'power4.inOut', transformOrigin: 'right center' },
                0.15
              );
            }

            // © bridge: scale + rotation
            if (cBridge) {
              tl.from(cBridge, {
                scale: 0, rotation: -20, duration: 1.1, ease: 'back.out(1.3)'
              }, 0.8);
            }

            // ── Parallax scroll
            if (cBridge) {
              gsap.to(cBridge, {
                y: '30%',
                ease: 'none',
                scrollTrigger: {
                  trigger: '#footer-parallax-section',
                  start: 'top bottom',
                  end: 'bottom top',
                  scrub: true
                }
              });
            }
          })();
        });
      }, '2200px 0px'); // end lazy initFooterReveal

      runWhenNear(document.querySelector('.pg-gallery'), function () {
        _ric(function () {
          (function initGalleryExit() {
            const pgGallery = document.querySelector('.pg-gallery');
            if (!pgGallery) return;
            gsap.to(pgGallery, {
              opacity: 0,
              y: -30,
              ease: 'power2.in',
              scrollTrigger: {
                trigger: pgGallery,
                start: 'bottom 55%',
                end: 'bottom top',
                scrub: 1.5,
              }
            });
          })();
        });
      }, '1800px 0px'); // end lazy initGalleryExit

      // 🎯 自訂鼠標:只在 PC(寬 >1024、可 hover、精細指標)啟用,iPad/手機停用
      const disableCustomCursor = window.matchMedia('(max-width: 1024px), (hover: none), (pointer: coarse)').matches;

      if (!disableCustomCursor) {
        // ── Grid Mouse Tracker ──
        (function () {
          const settings = {
            GRID_SIZE: 5,
            MAX_BLOCKS: 50,
            FADE_OUT_DURATION: 1.0,
            COLOR: '#ffffff'
          };

          const pool = [];
          let poolIndex = 0;
          const activeBlockKeys = new Set();
          let prevX = null;
          let prevY = null;
          let gridCols = 0;
          let gridRows = 0;

          const updateDynamicStyles = () => {
            const styleId = 'dynamic-block-style';
            let styleElement = document.getElementById(styleId);
            if (!styleElement) {
              styleElement = document.createElement('style');
              styleElement.id = styleId;
              document.head.appendChild(styleElement);
            }
            styleElement.innerHTML = `
                .mouseTracker--01 {
                    width: ${settings.GRID_SIZE}px;
                    height: ${settings.GRID_SIZE}px;
                    background-color: ${settings.COLOR};
                    animation: none !important;
                    opacity: 0;
                    top: 0; left: 0;
                    will-change: transform, opacity;
                }
            `;
          };

          const initializeGrid = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            gridCols = Math.ceil(width / settings.GRID_SIZE);
            gridRows = Math.ceil(height / settings.GRID_SIZE);

            activeBlockKeys.clear();

            if (pool.length === 0) {
              const fragment = document.createDocumentFragment();
              for (let i = 0; i < settings.MAX_BLOCKS; i++) {
                const el = document.createElement('div');
                el.className = 'mouseTracker--01';
                fragment.appendChild(el);
                pool.push(el);
              }
              document.body.appendChild(fragment);
            }
          };

          const getInterpolatedPoints = (x1, y1, x2, y2) => {
            const points = [];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.max(Math.abs(dx), Math.abs(dy));
            const steps = dist / settings.GRID_SIZE;

            for (let i = 0; i <= steps; i++) {
              const t = steps > 0 ? i / steps : 0;
              const x = Math.round(x1 + dx * t);
              const y = Math.round(y1 + dy * t);
              points[i] = { x, y };
            }
            return points;
          };

          const handleMouseMove = (e) => {
            const currX = e.clientX;
            const currY = e.clientY;

            if (prevX !== null && prevY !== null) {
              const points = getInterpolatedPoints(prevX, prevY, currX, currY);
              points.forEach(({ x, y }) => {
                const cellX = Math.floor(x / settings.GRID_SIZE);
                const cellY = Math.floor(y / settings.GRID_SIZE);
                if (cellX >= 0 && cellX < gridCols && cellY >= 0 && cellY < gridRows) {
                  drawBlock(cellX * settings.GRID_SIZE, cellY * settings.GRID_SIZE);
                }
              });
            }
            prevX = currX;
            prevY = currY;
          };

          const drawBlock = (x, y) => {
            const key = `${x},${y}`;
            if (activeBlockKeys.has(key)) return;

            const el = pool[poolIndex];
            poolIndex = (poolIndex + 1) % settings.MAX_BLOCKS;

            if (el.dataset.pos) {
              activeBlockKeys.delete(el.dataset.pos);
            }

            el.dataset.pos = key;
            activeBlockKeys.add(key);

            el.style.transform = `translate3d(${x}px, ${y}px, 0)`;

            if (el._anim) {
              el._anim.cancel();
            }

            el._anim = el.animate([
              { opacity: 1 },
              { opacity: 0 }
            ], {
              duration: settings.FADE_OUT_DURATION * 1000,
              fill: 'forwards'
            });

            el._anim.onfinish = () => {
              activeBlockKeys.delete(key);
              el.dataset.pos = "";
            };
          };

          updateDynamicStyles();
          initializeGrid();
          window.addEventListener('mousemove', handleMouseMove, { passive: true });
          window.addEventListener('resize', initializeGrid, { passive: true });
        })();

        const dot = document.getElementById('cursor-dot');
        const ring = document.getElementById('cursor-ring');
        if (dot && ring) {
          let mx = 0, my = 0, rx = 0, ry = 0;
          let magnetTarget = null;
          let magRect = null;
          let magnetStrength = 0.22;
          let cursorLeaveTimer = null;
          let cursorEnterRaf = 0;
          const cursorExitDuration = 140;

          // 🎯 效能優化:追蹤上次寫入值,靜止時跳過 style.transform 寫入
          let _lastDotX = -1, _lastDotY = -1, _lastRingX = -1, _lastRingY = -1;
          let _cursorRaf = 0;
          let _lastCursorWake = 0;

          const wakeCursorLoop = () => {
            _lastCursorWake = performance.now();
            if (!_cursorRaf) _cursorRaf = requestAnimationFrame(cursorLoop);
          };

          const showCursorLabel = (label, side) => {
            if (cursorLeaveTimer) {
              clearTimeout(cursorLeaveTimer);
              cursorLeaveTimer = null;
            }

            dot.classList.add('is-link');
            ring.classList.remove('is-leaving');
            ring.classList.remove('is-link');
            ring.setAttribute('data-cursor-label', label);
            ring.setAttribute('data-cursor-side', side);

            if (cursorEnterRaf) cancelAnimationFrame(cursorEnterRaf);
            cursorEnterRaf = requestAnimationFrame(() => {
              cursorEnterRaf = 0;
              ring.classList.add('is-link');
              wakeCursorLoop();
            });
          };

          const hideCursorLabel = () => {
            if (cursorEnterRaf) {
              cancelAnimationFrame(cursorEnterRaf);
              cursorEnterRaf = 0;
            }
            ring.classList.remove('is-link');
            ring.classList.add('is-leaving');
            wakeCursorLoop();

            if (cursorLeaveTimer) {
              clearTimeout(cursorLeaveTimer);
            }

            cursorLeaveTimer = window.setTimeout(() => {
              ring.classList.remove('is-leaving');
              dot.classList.remove('is-link');
              ring.setAttribute('data-cursor-label', 'EXPLORE');
              ring.setAttribute('data-cursor-side', 'right');
              cursorLeaveTimer = null;
              wakeCursorLoop();
            }, cursorExitDuration);
          };

          document.addEventListener('mousemove', e => {
            mx = e.clientX;
            my = e.clientY;
            wakeCursorLoop();
          }, { passive: true });

          function cursorLoop() {
            _cursorRaf = 0;

            const targetX = (magnetTarget && magRect)
              ? mx + ((magRect.left + magRect.width / 2) - mx) * magnetStrength
              : mx;
            const targetY = (magnetTarget && magRect)
              ? my + ((magRect.top + magRect.height / 2) - my) * magnetStrength
              : my;

            rx += (targetX - rx) * 0.18;
            ry += (targetY - ry) * 0.18;

            // 🎯 只在有變化時才寫 style,避免冗餘 DOM 寫入
            if (targetX !== _lastDotX || targetY !== _lastDotY) {
              dot.style.transform = `translate(${targetX}px,${targetY}px)`;
              _lastDotX = targetX;
              _lastDotY = targetY;
            }
            if (Math.abs(rx - _lastRingX) > 0.05 || Math.abs(ry - _lastRingY) > 0.05) {
              ring.style.transform = `translate(${rx}px,${ry}px)`;
              _lastRingX = rx;
              _lastRingY = ry;
            }

            const ringSettled = Math.abs(rx - targetX) < 0.08 && Math.abs(ry - targetY) < 0.08;
            const recentlyAwake = performance.now() - _lastCursorWake < 260;
            if (!ringSettled || recentlyAwake) {
              _cursorRaf = requestAnimationFrame(cursorLoop);
            }
          }

          const linkSelectors = 'a, button, .slide-thumb, .pg-item, [data-cursor]';
          const getCursorTarget = (node) => node && typeof node.closest === 'function'
            ? node.closest(linkSelectors)
            : null;

          document.addEventListener('pointerover', (e) => {
            const el = getCursorTarget(e.target);
            if (!el) return;

            const previous = getCursorTarget(e.relatedTarget);
            if (previous === el) return;

            const shouldMagnetize = el.offsetWidth < 300;
            const nextMagRect = shouldMagnetize ? el.getBoundingClientRect() : null;

            showCursorLabel(el.dataset.cursor || 'EXPLORE', el.dataset.cursorSide || 'right');
            if (shouldMagnetize) {
              magnetTarget = el;
              magRect = nextMagRect;
            } else {
              magnetTarget = null;
              magRect = null;
            }
            wakeCursorLoop();
          });

          document.addEventListener('pointerout', (e) => {
            const el = getCursorTarget(e.target);
            if (!el) return;

            const next = getCursorTarget(e.relatedTarget);
            if (next) return;

            hideCursorLabel();
            magnetTarget = null;
            magRect = null;
            wakeCursorLoop();
          });

          document.addEventListener('mouseleave', () => { dot.style.opacity = '0'; ring.style.opacity = '0'; wakeCursorLoop(); });
          document.addEventListener('mouseenter', () => { dot.style.opacity = ''; ring.style.opacity = ''; wakeCursorLoop(); });
        }
      }

      // ── 手機版 mobile-cube-section：scroll-driven 平轉 ──
      (function () {
        var cube = document.querySelector('.mobile-cube');
        var scene = document.querySelector('.mobile-cube-scene');
        if (!cube) return;

        var angle = 0;
        var extra = 0;
        var touchRotateX = 0;
        var touchRotateY = 0;
        var isTouching = false;
        var snapBackBoost = 0;
        var BASE = 0.21;   // deg/frame baseline (~13°/s @ 60fps)
        var FRIC = 0.87;   // 慣性衰減
        var K = 0.07;   // scroll velocity → extra 係數
        var MAX_EXTRA = 1.12;
        var TOUCH_DRAG_X = 0.55;
        var TOUCH_DRAG_Y = 0.48;
        var TOUCH_MOMENTUM = 0.16;
        var RETURN_EASE = 0.1;
        var RETURN_EASE_SCROLL = 0.22;
        var rafId = 0;
        var isVisible = false;

        function addVelocity(v) {
          extra += v * K;
          if (extra > MAX_EXTRA) extra = MAX_EXTRA;
          if (extra < -MAX_EXTRA) extra = -MAX_EXTRA;
        }

        // Lenis scroll velocity
        function hookLenis() {
          if (window._lenis) {
            window._lenis.on('scroll', function (e) { addVelocity(e.velocity * 3.2); });
          } else {
            setTimeout(hookLenis, 300);
          }
        }
        hookLenis();

        if (scene) {
          var lastTouchX = 0;
          var lastTouchY = 0;

          scene.addEventListener('touchstart', function (e) {
            if (!e.touches || !e.touches.length) return;
            isTouching = true;
            snapBackBoost = 0;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
          }, { passive: true });

          scene.addEventListener('touchmove', function (e) {
            if (!e.touches || !e.touches.length) return;
            var touchX = e.touches[0].clientX;
            var touchY = e.touches[0].clientY;
            var deltaX = touchX - lastTouchX;
            var deltaY = touchY - lastTouchY;
            lastTouchX = touchX;
            lastTouchY = touchY;
            touchRotateY += deltaX * TOUCH_DRAG_X;
            touchRotateX -= deltaY * TOUCH_DRAG_Y;
            addVelocity(deltaX * TOUCH_MOMENTUM);
          }, { passive: true });

          scene.addEventListener('touchend', function () {
            isTouching = false;
            snapBackBoost = RETURN_EASE_SCROLL;
            lastTouchX = 0;
            lastTouchY = 0;
          }, { passive: true });

          scene.addEventListener('touchcancel', function () {
            isTouching = false;
            snapBackBoost = RETURN_EASE_SCROLL;
            lastTouchX = 0;
            lastTouchY = 0;
          }, { passive: true });
        }

        // native scroll fallback
        var lastY = window.scrollY;
        window.addEventListener('scroll', function () {
          var deltaY = window.scrollY - lastY;
          addVelocity(deltaY);
          if (deltaY > 0) snapBackBoost = RETURN_EASE_SCROLL;
          lastY = window.scrollY;
        }, { passive: true });

        function tick() {
          rafId = 0;
          extra *= FRIC;
          angle += BASE + extra;

          if (!isTouching) {
            var returnEase = Math.max(RETURN_EASE, snapBackBoost);
            touchRotateX += (0 - touchRotateX) * returnEase;
            touchRotateY += (0 - touchRotateY) * returnEase;
            snapBackBoost *= 0.92;
          }

          cube.style.transform = 'rotateX(' + touchRotateX + 'deg) rotateY(' + (angle + touchRotateY) + 'deg)';
          rafId = isVisible ? requestAnimationFrame(tick) : 0;
        }

        if ('IntersectionObserver' in window && scene) {
          const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && !isVisible) {
                isVisible = true;
                if (!rafId) tick();
              } else if (!entry.isIntersecting && isVisible) {
                isVisible = false;
                if (rafId) {
                  cancelAnimationFrame(rafId);
                  rafId = 0;
                }
              }
            });
          }, { rootMargin: '200px 0px' });
          io.observe(scene);
        } else {
          isVisible = true;
          tick();
        }
      })();

      // ── Scroll-driven marquee (支援多個 .js-scroll-marquee 同時運作) ──
      (function () {
        const inners = Array.from(document.querySelectorAll('.js-scroll-marquee'));
        // 相容舊有單一 ID 寫法
        const legacy = document.getElementById('marquee-inner');
        if (legacy && !inners.includes(legacy)) inners.unshift(legacy);
        if (!inners.length) return;

        const baseSpeed = 1;   // px per tick baseline
        let lenisVel = 0;
        let marqueeRaf = 0;

        const tracks = inners.map(function (inner) {
          const dirAttr = parseFloat(inner.getAttribute('data-marquee-dir'));
          const firstSet = inner.querySelector('.marquee-set');
          const templateSet = firstSet ? firstSet.cloneNode(true) : null;
          return {
            inner: inner,
            templateSet: templateSet,
            xPos: 0,
            setWidth: 0,
            dir: isFinite(dirAttr) && dirAttr !== 0 ? Math.sign(dirAttr) : -1
          };
        }).filter(function (track) {
          return !!track.templateSet;
        });

        function rebuildTrack(track) {
          if (!track.templateSet) return;
          const outer = track.inner.parentElement;
          track.inner.innerHTML = '';
          const firstClone = track.templateSet.cloneNode(true);
          track.inner.appendChild(firstClone);

          const setWidth = firstClone.scrollWidth || Math.ceil(firstClone.getBoundingClientRect().width) || 0;
          const outerWidth = outer ? outer.clientWidth : window.innerWidth;
          track.setWidth = setWidth;

          if (!setWidth) return;

          const minTrackWidth = outerWidth + setWidth * 2;
          const cloneCount = Math.max(2, Math.ceil(minTrackWidth / setWidth));
          for (let i = 1; i < cloneCount; i++) {
            track.inner.appendChild(track.templateSet.cloneNode(true));
          }
          track.xPos = ((track.xPos % setWidth) + setWidth) % setWidth;
          if (track.dir < 0 && track.xPos > 0) track.xPos -= setWidth;
          track.inner.style.transform = 'translate3d(' + track.xPos + 'px, 0, 0)';
        }

        function rebuildMarquees() {
          tracks.forEach(rebuildTrack);
        }

        window.addEventListener('load', rebuildMarquees, { once: true });
        window.addEventListener('resize', rebuildMarquees, { passive: true });
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(rebuildMarquees).catch(function () { });
        }
        rebuildMarquees();

        // Hook into Lenis velocity
        setTimeout(function () {
          if (window._lenis) {
            window._lenis.on('scroll', function (e) {
              lenisVel = (e.velocity || 0) * 0.25;
              if (shouldRunMarquee()) requestMarqueeTick();
            });
          }
        }, 200);

        function requestMarqueeTick() {
          if (!marqueeRaf) marqueeRaf = requestAnimationFrame(tick);
        }
        window._requestMarqueeRAF = requestMarqueeTick;

        // 🎯 手機版有獨立的 marquee section,不受桌機 cube ScrollTrigger 控制
        const isMobileBreakpoint = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
        let mobileMarqueeVisible = !isMobileBreakpoint;

        function shouldRunMarquee() {
          return isMobileBreakpoint ? mobileMarqueeVisible : window._marqueeRAFActive;
        }

        if (isMobileBreakpoint && 'IntersectionObserver' in window && inners.length) {
          const observedSections = new Set();
          const io = new IntersectionObserver((entries) => {
            mobileMarqueeVisible = entries.some((entry) => entry.isIntersecting);
            if (mobileMarqueeVisible) requestMarqueeTick();
          }, { rootMargin: '300px 0px' });

          inners.forEach(function (inner) {
            const section = inner.closest('.mobile-marquee-section, .section-2-content, section') || inner.parentElement;
            if (section && !observedSections.has(section)) {
              observedSections.add(section);
              io.observe(section);
            }
          });
        } else if (isMobileBreakpoint) {
          mobileMarqueeVisible = true;
        }

        function tick() {
          marqueeRaf = 0;
          lenisVel *= 0.93;
          if (!shouldRunMarquee()) return;

          tracks.forEach(function (t) {
            // dir = -1 → 往左走(預設),+1 → 往右走;與 Lenis 滾動速度疊加
            t.xPos += (baseSpeed + lenisVel) * t.dir;
            if (t.setWidth > 0) {
              while (t.xPos <= -t.setWidth) t.xPos += t.setWidth;
              while (t.xPos >= t.setWidth) t.xPos -= t.setWidth;
            }
            t.inner.style.transform = 'translate3d(' + t.xPos + 'px, 0, 0)';
          });
          requestMarqueeTick();
        }
        if (shouldRunMarquee()) requestMarqueeTick();
      })();

    });
