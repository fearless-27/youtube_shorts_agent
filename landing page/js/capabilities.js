/* =========================================================
   SECTION 3: CORE CAPABILITIES (3D Ring Gallery JS)
   Three.js Shaders, 3D Carousel & Interactive Controls
   ========================================================= */

    const ccapVertexShader = /* glsl */ `
    varying vec2 vUv;

    void main(){
        vUv=uv;
        gl_Position=vec4(position,1.);
    }
    `;

    const fragmentShader = /* glsl */ `
    uniform float iTime;
    uniform vec2 iResolution;
    uniform vec2 iMouse;

    uniform sampler2D tDiffuse;

    varying vec2 vUv;

    uniform vec3 uBgColor;
    uniform float uRGBShiftIntensity;
    uniform float uGrainIntensity;
    uniform float uVignetteIntensity;
    uniform float uTransitionProgress;

    highp float random(vec2 co)
    {
        highp float a=12.9898;
        highp float b=78.233;
        highp float c=43758.5453;
        highp float dt=dot(co.xy,vec2(a,b));
        highp float sn=mod(dt,3.14);
        return fract(sin(sn)*c);
    }

    vec3 grain(vec2 uv,vec3 col,float amount){
        float noise=random(uv+iTime);
        col+=(noise-.5)*amount;
        return col;
    }

    vec4 RGBShift(sampler2D tex,vec2 uv,float amount){
        vec2 rUv=uv;
        vec2 gUv=uv;
        vec2 bUv=uv;
        float noise=random(uv+iTime)*.5+.5;
        vec2 offset=amount*vec2(cos(noise),sin(noise));
        rUv+=offset;
        gUv+=offset*.5;
        bUv+=offset*.25;
        vec4 rTex=texture(tex,rUv);
        vec4 gTex=texture(tex,gUv);
        vec4 bTex=texture(tex,bUv);
        vec4 col=vec4(rTex.r,gTex.g,bTex.b,gTex.a);
        return col;
    }

    vec3 vignette(vec2 uv,vec3 col,vec3 vigColor,float amount){
        vec2 p=uv;
        p-=.5;
        float d=length(p);
        float mask=smoothstep(.5,.3,d);
        mask=pow(mask,.6);
        float mixFactor=(1.-mask)*amount;
        col=mix(col,vigColor,mixFactor);
        return col;
    }

    float sdCircle(vec2 p,float r)
    {
        return length(p)-r;
    }

    vec3 transition(vec2 uv,vec3 col,float progress){
        float ratio=iResolution.x/iResolution.y;

        vec2 p=uv;
        p-=.5;
        p.x*=ratio;
        float d=sdCircle(p,progress*sqrt(2.2));
        float c=smoothstep(-.2,0.,d);
        col=mix(uBgColor,col,1.-c);
        return col;
    }

    void main(){
        vec2 uv=vUv;
        vec4 tex=RGBShift(tDiffuse,uv,uRGBShiftIntensity);
        vec3 col=tex.xyz;
        col=grain(uv,col,uGrainIntensity);
        col=vignette(uv,col,uBgColor,uVignetteIntensity);
        col=transition(uv,col,uTransitionProgress);
        gl_FragColor=vec4(col,1.);
    }
    `;

    const CCAP_RING_GALLERY_CONFIG = (() => {
      const sumFormula = (count) => (count * (count + 1)) / 2;
      const circleCount = 3;
      const circleImgCountUnit = 12;
      const circleImgTotalCount = circleImgCountUnit * sumFormula(circleCount);

      const ringImages = [
        "images/core-capabilities/ring/01.webp",
        "images/core-capabilities/ring/02.webp",
        "images/core-capabilities/ring/03.webp",
        "images/core-capabilities/ring/04.webp",
        "images/core-capabilities/ring/05.webp",
        "images/core-capabilities/ring/06.webp",
        "images/core-capabilities/ring/10.webp",
        "images/core-capabilities/ring/11.webp",
        "images/core-capabilities/ring/12.webp"
      ];

      return {
        circleCount,
        circleImgCountUnit,
        circleImgTotalCount,
        customImageUrls: ringImages,
        autoImageFolder: "images/core-capabilities/ring",
        autoImageBaseName: "",
        autoImageStartIndex: 1,
        autoImageCount: 9,
        autoImageZeroPad: 2,
        autoImageExtension: ".webp",
        placeholderImageUrls: Array.from({ length: circleImgTotalCount }, (_, index) => {
          return ringImages[index % ringImages.length];
        })
      };
    })();

    class Sketch {
      constructor(selector) {
        this.container = document.querySelector(selector);
        this.config = {
          bgColor: "#000000"
        };
        this.params = {
          transitionProgress: 0,
          enterProgress: 0,
          rotateSpeed: 15
        };
        this.rings = [];
        this.lines = [];
        this.dragDelta = 0;
        this.isDragging = false;
        this.dragEnabled = true;
        this.isRendering = false;
        this.isPrewarmed = false;
        this.viewportObserver = null;
        this.lastPointer = { x: 0, y: 0 };
        this.mouse = new THREE.Vector2(0, 0);
        this.clock = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.bgColor);

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
        this.camera.position.set(0, 0, 16);

        this.renderer = null;
        this.renderTarget = null;
        this.isSupported = false;

        try {
          const canvas = document.createElement('canvas');
          let gl = null;
          const contextAttributes = {
            alpha: true,
            antialias: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false
          };
          const contextNames = ['webgl2', 'webgl', 'experimental-webgl'];
          for (const name of contextNames) {
            try {
              gl = canvas.getContext(name, contextAttributes);
            } catch (_) {}
            if (gl) break;
          }

          if (gl) {
            this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: false });
            canvas.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              this.isSupported = false;
              this.initFallbackGallery();
            }, false);

            this.renderer.setClearColor(new THREE.Color(this.config.bgColor), 1);
            this.renderer.domElement.style.width = "100%";
            this.renderer.domElement.style.height = "100%";
            this.renderer.domElement.style.display = "block";

            this.renderTarget = new THREE.WebGLRenderTarget(1, 1, {
              minFilter: THREE.LinearFilter,
              magFilter: THREE.LinearFilter,
              format: THREE.RGBAFormat,
              depthBuffer: true,
              stencilBuffer: false
            });
            this.isSupported = true;
          } else {
            this.isSupported = false;
          }
        } catch (e) {
          this.isSupported = false;
        }

        if (!this.isSupported || !this.renderer || !this.renderTarget) {
          this.initFallbackGallery();
          return;
        }

        this.postScene = new THREE.Scene();
        this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.postCamera.position.z = 1;
        this.postMaterial = new THREE.ShaderMaterial({
          uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2(1, 1) },
            iMouse: { value: new THREE.Vector2(0, 0) },
            tDiffuse: { value: this.renderTarget.texture },
            uBgColor: { value: new THREE.Color(this.config.bgColor) },
            uRGBShiftIntensity: { value: 0.0025 },
            uGrainIntensity: { value: 0.025 },
            uVignetteIntensity: { value: 0.8 },
            uTransitionProgress: { value: 0 }
          },
          vertexShader: ccapVertexShader,
          fragmentShader,
          depthWrite: false,
          depthTest: false
        });
        this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
        this.postScene.add(this.postQuad);

        this.handleResize = this.handleResize.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.renderFrame = this.renderFrame.bind(this);
      }

      initFallbackGallery() {
        if (!this.container) return;
        this.container.innerHTML = "";
        const imagesList = (CCAP_RING_GALLERY_CONFIG.customImageUrls && CCAP_RING_GALLERY_CONFIG.customImageUrls.length > 0)
          ? CCAP_RING_GALLERY_CONFIG.customImageUrls
          : null;
        const count = imagesList ? Math.max(imagesList.length, CCAP_RING_GALLERY_CONFIG.circleImgCountUnit || 12) : (CCAP_RING_GALLERY_CONFIG.autoImageCount || 25);
        const folder = CCAP_RING_GALLERY_CONFIG.autoImageFolder || "images/core-capabilities/ring";
        const ext = CCAP_RING_GALLERY_CONFIG.autoImageExtension || ".webp";

        const wrapper = document.createElement("div");
        wrapper.className = "ccap-fallback-wrapper";
        wrapper.style.cssText = "width:100%;height:100%;position:relative;overflow:hidden;perspective:1100px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none;cursor:grab;";

        const cylinder = document.createElement("div");
        cylinder.className = "ccap-fallback-cylinder";
        cylinder.style.cssText = "width:240px;height:360px;position:relative;transform-style:preserve-3d;";

        const radius = Math.max(500, Math.min(800, window.innerWidth * 0.45));
        const angleStep = 360 / count;

        for (let i = 0; i < count; i++) {
          const card = document.createElement("div");
          card.style.cssText = `position:absolute;inset:0;border-radius:10px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.7);transform:rotateY(${i * angleStep}deg) translateZ(${radius}px);backface-visibility:hidden;border:1px solid rgba(255,255,255,0.08);background:#111;`;

          const img = document.createElement("img");
          if (imagesList && imagesList.length > 0) {
            img.src = imagesList[i % imagesList.length];
          } else {
            const idxStr = String(i + 1).padStart(2, "0");
            img.src = `${folder}/${idxStr}${ext}`;
          }
          img.alt = `Capability ${i + 1}`;
          img.style.cssText = "width:100%;height:100%;object-fit:cover;pointer-events:none;";
          img.loading = "lazy";
          card.appendChild(img);
          cylinder.appendChild(card);
        }

        wrapper.appendChild(cylinder);
        this.container.appendChild(wrapper);

        let currentAngle = 0;
        let targetAngle = 0;
        let isDragging = false;
        let startX = 0;
        let lastX = 0;
        let velocity = 0;

        const onDown = (e) => {
          isDragging = true;
          startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
          lastX = startX;
          velocity = 0;
          wrapper.style.cursor = "grabbing";
        };

        const onMove = (e) => {
          if (!isDragging) return;
          const x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
          const delta = x - lastX;
          lastX = x;
          velocity = delta * 0.25;
          targetAngle += velocity;
        };

        const onUp = () => {
          if (!isDragging) return;
          isDragging = false;
          wrapper.style.cursor = "grab";
        };

        wrapper.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);

        wrapper.addEventListener("touchstart", onDown, { passive: true });
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onUp, { passive: true });

        // Link category buttons to rotate cylinder
        const categories = document.querySelectorAll(".ccap-category-item");
        categories.forEach((btn, cIdx) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            categories.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const targetIndex = Math.floor((cIdx / categories.length) * count);
            targetAngle = -targetIndex * angleStep;
          });
        });

        // Animation loop for smooth momentum
        const tick = () => {
          if (!isDragging) {
            velocity *= 0.92;
            targetAngle += velocity;
          }
          currentAngle += (targetAngle - currentAngle) * 0.12;
          cylinder.style.transform = `translateZ(-${radius * 0.9}px) rotateY(${currentAngle}deg)`;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }

      async create() {
        if (!this.container || !this.isSupported || !this.renderer) return;

        this.container.innerHTML = "";
        this.container.appendChild(this.renderer.domElement);
        this.updateInteractionMode();

        this.handleResize();
        this.bindEvents();

        const textures = await this.loadTextures();
        this.buildGallery(textures);
        this.setupScrollAnimations();

        // 預熱 GPU：在 IntersectionObserver 開始 loop 之前強制編譯 shader 和上傳貼圖
        // 避免第一幀因 shader compile / texture upload 造成主執行緒凍結（卡頓感）
        try {
          this.renderer.compile(this.scene, this.camera);
          this.renderer.compile(this.postScene, this.postCamera);
        } catch (_) { }

        this.schedulePrewarm();
        this.setupViewportRendering();
      }

      schedulePrewarm() {
        const runPrewarm = () => this.prewarmRenderer();
        if (window.requestIdleCallback) {
          window.requestIdleCallback(runPrewarm, { timeout: 700 });
        } else {
          window.setTimeout(runPrewarm, 160);
        }
      }

      prewarmRenderer() {
        if (this.isPrewarmed) return;
        this.isPrewarmed = true;
        try {
          this.renderFrame();
        } catch (_) { }
      }

      setupViewportRendering() {
        const start = () => {
          if (this.isRendering) return;
          this.prewarmRenderer();
          this.isRendering = true;
          this.renderer.setAnimationLoop(this.renderFrame);
        };

        const stop = () => {
          if (!this.isRendering) return;
          this.isRendering = false;
          this.renderer.setAnimationLoop(null);
        };

        if (!('IntersectionObserver' in window)) {
          start();
          return;
        }

        const leadPx = Math.round(Math.max(900, window.innerHeight * 1.25));
        this.viewportObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) start();
            else stop();
          });
        }, { rootMargin: `${leadPx}px 0px` });
        this.viewportObserver.observe(this.container);
      }

      bindEvents() {
        window.addEventListener("resize", this.handleResize);
        this.container.addEventListener("pointerdown", this.handlePointerDown);
        window.addEventListener("pointermove", this.handlePointerMove);
        window.addEventListener("pointerup", this.handlePointerUp);
        window.addEventListener("pointercancel", this.handlePointerUp);
      }

      updateInteractionMode() {
        const useTouchScrollMode = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
        this.dragEnabled = !useTouchScrollMode;
        if (this.container) {
          this.container.style.touchAction = useTouchScrollMode ? "pan-y" : "none";
        }
      }

      handleResize() {
        if (!this.container) return;

        this.updateInteractionMode();

        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        const pixelRatio = this.getRenderPixelRatio();
        const renderWidth = Math.max(1, Math.floor(width * pixelRatio));
        const renderHeight = Math.max(1, Math.floor(height * pixelRatio));

        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height, false);
        this.renderTarget.setSize(renderWidth, renderHeight);
        this.postMaterial.uniforms.iResolution.value.set(renderWidth, renderHeight);

        this.camera.aspect = width / Math.max(height, 1);
        this.camera.updateProjectionMatrix();
      }

      handlePointerDown(event) {
        if (!this.dragEnabled || event.pointerType !== "mouse") return;
        this.isDragging = true;
        this.lastPointer.x = event.clientX;
        this.lastPointer.y = event.clientY;
      }

      handlePointerMove(event) {
        const rect = this.container ? this.container.getBoundingClientRect() : null;
        if (rect) {
          this.mouse.set(event.clientX - rect.left, rect.height - (event.clientY - rect.top));
        }

        if (!this.isDragging || event.pointerType !== "mouse") return;

        const deltaX = event.clientX - this.lastPointer.x;
        const deltaY = event.clientY - this.lastPointer.y;
        this.dragDelta -= (deltaX || deltaY) * 2;
        this.lastPointer.x = event.clientX;
        this.lastPointer.y = event.clientY;
      }

      handlePointerUp() {
        this.isDragging = false;
      }

      createTextureUrlList(sourceList = []) {
        const {
          circleImgTotalCount,
          placeholderImageUrls
        } = CCAP_RING_GALLERY_CONFIG;
        const activeSourceList = sourceList.length > 0 ? sourceList : placeholderImageUrls;

        return Array.from({ length: circleImgTotalCount }, (_, index) => {
          return activeSourceList[index % activeSourceList.length];
        });
      }

      getRenderPixelRatio() {
        const baseDpr = typeof getOptimalDPR === 'function'
          ? getOptimalDPR()
          : Math.min(window.devicePixelRatio || 1, 2);

        if (window.innerWidth <= 768) return Math.min(baseDpr, 1.1);
        return Math.min(baseDpr, 1.35);
      }

      probeImageUrl(url) {
        return new Promise((resolve) => {
          const image = new Image();

          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = url;
        });
      }

      async resolveAutoTextureUrlList() {
        const {
          autoImageFolder,
          autoImageBaseName,
          autoImageStartIndex,
          autoImageCount,
          autoImageZeroPad,
          autoImageExtension,
          circleImgTotalCount
        } = CCAP_RING_GALLERY_CONFIG;
        const buildAutoUrl = (index) => {
          const fileNumber = String(autoImageStartIndex + index).padStart(autoImageZeroPad, "0");
          return `${autoImageFolder}/${autoImageBaseName}${fileNumber}${autoImageExtension}`;
        };
        const safeAutoImageCount = Number.isFinite(autoImageCount)
          ? Math.max(0, Math.min(circleImgTotalCount, Math.floor(autoImageCount)))
          : 0;

        if (safeAutoImageCount > 0) {
          return Array.from({ length: safeAutoImageCount }, (_, index) => buildAutoUrl(index));
        }

        const discoveredUrls = [];

        for (let index = 0; index < circleImgTotalCount; index += 1) {
          const candidateUrl = buildAutoUrl(index);
          const exists = await this.probeImageUrl(candidateUrl);

          if (!exists) {
            break;
          }

          discoveredUrls.push(candidateUrl);
        }

        return discoveredUrls;
      }

      async resolveTextureUrlList() {
        const { customImageUrls } = CCAP_RING_GALLERY_CONFIG;

        if (customImageUrls.length > 0) {
          return this.createTextureUrlList(customImageUrls);
        }

        const autoImageUrls = await this.resolveAutoTextureUrlList();

        if (autoImageUrls.length > 0) {
          return this.createTextureUrlList(autoImageUrls);
        }

        return this.createTextureUrlList();
      }

      createFallbackTexture(index) {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 400;

        const context = canvas.getContext("2d");
        const hue = (index * 37) % 360;
        context.fillStyle = "#050505";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = `hsl(${hue} 45% 34%)`;
        context.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
        context.fillStyle = "rgba(255,255,255,0.88)";
        context.font = "600 28px Arial";
        context.textAlign = "center";
        context.fillText(`CCAP ${index + 1}`, canvas.width / 2, canvas.height / 2);

        return new THREE.CanvasTexture(canvas);
      }

      async loadTextures() {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");

        const textureUrls = await this.resolveTextureUrlList();
        const textureCache = new Map();

        const loadTextureOnce = (url, index) => {
          if (!textureCache.has(url)) {
            textureCache.set(url, new Promise((resolve) => {
              loader.load(
                url,
                (texture) => {
                  texture.minFilter = THREE.LinearFilter;
                  texture.magFilter = THREE.LinearFilter;
                  resolve(texture);
                },
                undefined,
                () => {
                  resolve(this.createFallbackTexture(index));
                }
              );
            }));
          }
          return textureCache.get(url);
        };

        return Promise.all(textureUrls.map((url, index) => loadTextureOnce(url, index)));
      }

      buildGallery(textures) {
        const sumFormula = (count) => (count * (count + 1)) / 2;
        const isOdd = (count) => count % 2 === 1;
        const { circleCount, circleImgCountUnit } = CCAP_RING_GALLERY_CONFIG;
        const radius = 6.4;
        const radiusOffset = 2.3;
        const firstRingInset = 0.65;
        const secondRingInset = 0.8;
        const scale = 0.8;
        const baseMaterial = new THREE.MeshBasicMaterial({ transparent: true });

        this.isOddRing = isOdd;

        for (let ringIndex = 0; ringIndex < circleCount; ringIndex += 1) {
          const start = sumFormula(ringIndex) * circleImgCountUnit;
          const end = sumFormula(ringIndex + 1) * circleImgCountUnit;
          const ringTextures = textures.slice(start, end);

          const ring = new THREE.Group();
          this.scene.add(ring);
          this.rings.push(ring);

          ringTextures.forEach((texture, textureIndex) => {
            const line = new THREE.Group();
            ring.add(line);
            this.lines.push(line);

            const aspect = (texture.image && texture.image.width && texture.image.height)
              ? (texture.image.width / texture.image.height)
              : (320 / 400);
            const targetHeight = 2 * scale * (ringIndex * 0.36 + 1);
            const height = targetHeight;
            const width = targetHeight * aspect;
            const geometry = new THREE.PlaneGeometry(width, height);
            const material = baseMaterial.clone();
            material.map = texture;
            material.needsUpdate = true;

            const mesh = new THREE.Mesh(geometry, material);
            const ringRadius = radius * (ringIndex + 1) + radiusOffset - (ringIndex === 0 ? firstRingInset : 0) - (ringIndex === 1 ? secondRingInset : 0);
            const ratio = textureIndex / Math.max(ringTextures.length, 1);
            const angle = ratio * Math.PI * 2;

            mesh.position.x = ringRadius;
            mesh.rotation.z = -Math.PI / 2;
            line.rotation.z = angle;
            line.add(mesh);
          });
        }
      }

      setupScrollAnimations() {
        const ccapSection = document.getElementById("core-capabilities");
        const heroDom = ccapSection ? ccapSection.querySelector(".hero-dom") : null;
        if (!ccapSection || !heroDom || !window.gsap || !window.ScrollTrigger) return;

        window.gsap.registerPlugin(window.ScrollTrigger);
        const titleTargets = ccapSection.querySelectorAll(".giant-title .reveal-inner, .sub-title .reveal-inner");
        const staticTextTargets = ccapSection.querySelectorAll(".top-nav .reveal-inner, .service-label .reveal-inner, .service-tags .reveal-inner, .footer-desc .reveal-inner");
        const mediaTargets = ccapSection.querySelectorAll(".media-box, .center-video-box");
        const initialRect = ccapSection.getBoundingClientRect();
        const alreadyVisible = initialRect.top <= window.innerHeight * 0.95;

        const setTitleTransform = (transformValue) => {
          titleTargets.forEach((target) => {
            target.style.transform = transformValue;
          });
        };

        const resolveTitleState = (rect) => {
          if (rect.top > window.innerHeight * 0.8) {
            return "hidden";
          }
          if (rect.bottom < window.innerHeight * 0.45) {
            return "exiting";
          }
          return "visible";
        };

        const revealCoreContent = () => {
          if (ccapSection.dataset.revealReady === "true") return;

          ccapSection.dataset.revealReady = "true";
          staticTextTargets.forEach((target) => {
            target.style.transform = "translateY(0)";
          });
          mediaTargets.forEach((target) => {
            target.style.clipPath = "inset(0% 0 0 0)";
          });
        };

        let titleState = null;

        const applyTitleState = (nextTitleState) => {
          if (nextTitleState === titleState) {
            return;
          }

          titleState = nextTitleState;

          if (titleState === "hidden") {
            setTitleTransform("translateY(110%)");
          } else if (titleState === "visible") {
            setTitleTransform("translateY(0)");
          } else {
            setTitleTransform("translateY(-110%)");
          }
        };

        if (alreadyVisible) {
          revealCoreContent();
        }
        applyTitleState(resolveTitleState(initialRect));

        window.ScrollTrigger.create({
          trigger: ccapSection,
          start: "top 80%",
          end: "bottom 45%",
          onEnter: () => {
            revealCoreContent();
            applyTitleState("visible");
          },
          onEnterBack: () => {
            applyTitleState("visible");
          },
          onLeave: () => {
            applyTitleState("exiting");
          },
          onLeaveBack: () => {
            applyTitleState("hidden");
          }
        });

        const enterTl = window.gsap.timeline({
          scrollTrigger: {
            trigger: ccapSection,
            start: "top 80%",
            end: "top 30%",
            scrub: 1
          }
        });

        enterTl
          .to(this.params, { transitionProgress: 1, duration: 1, ease: "power1.inOut" })
          .fromTo(this.params, { enterProgress: 0, rotateSpeed: 10 }, { enterProgress: 1, rotateSpeed: 1, duration: 1.5, ease: "power1.inOut" }, "-=1")
          .to(heroDom, { opacity: 1, duration: 1 }, "-=1");

        const exitTl = window.gsap.timeline({
          scrollTrigger: {
            trigger: ccapSection,
            start: "bottom 90%",
            end: "bottom 20%",
            scrub: 1
          }
        });

        exitTl
          .to(heroDom, { opacity: 0, duration: 1 })
          .to(this.params, { transitionProgress: 0, duration: 1, ease: "power1.inOut" }, "-=0.5");
      }

      renderFrame() {
        let scrollDelta = 0;
        if (window._lenis) {
          scrollDelta = window._lenis.velocity * 0.02;
        }

        this.rings.forEach((ring, ringIndex) => {
          ring.rotation.z +=
            0.0025 *
            (this.isOddRing(ringIndex) ? -1 : 1) *
            (1 + Math.abs(scrollDelta * 10) + Math.abs(this.dragDelta)) *
            this.params.rotateSpeed;
        });

        this.dragDelta *= 0.9;

        this.lines.forEach((line) => {
          line.position.z =
            -THREE.MathUtils.lerp(0, 100, 1 - this.params.enterProgress) +
            THREE.MathUtils.lerp(10, 0, this.params.enterProgress);
        });

        this.postMaterial.uniforms.iTime.value = this.clock.getElapsedTime();
        this.postMaterial.uniforms.iMouse.value.copy(this.mouse);
        this.postMaterial.uniforms.uTransitionProgress.value = this.params.transitionProgress;

        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.postScene, this.postCamera);
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
      // 直接在 idle 時初始化，不等滾到附近再載，消除進場黑畫面
      let sketchInitialized = false;
      const initSketch = () => {
        if (sketchInitialized) return;
        const sketchRoot = document.querySelector("#core-capabilities #sketch");
        if (!sketchRoot) return;
        sketchInitialized = true;
        const sketch = new Sketch("#core-capabilities #sketch");
        sketch.create();
      };
      const ccapSection = document.getElementById("core-capabilities");
      if (typeof runWhenNear === "function" && ccapSection) {
        runWhenNear(ccapSection, initSketch, "2200px 0px");
      } else if (window.requestIdleCallback) {
        window.requestIdleCallback(initSketch, { timeout: 600 });
      } else {
        window.setTimeout(initSketch, 180);
      }
    });
