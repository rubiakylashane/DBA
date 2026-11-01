/* js/auth/brand-carousel.js
   Automatic background carousel for the left panel (.brand)
   on login, register and forgot-password.
   Styles are injected by this script, so only this one file is needed. */
(() => {
  /* ===== EDIT THESE ===== */
  const IMAGES = [
    "../../assets/images/auth/slide-1.jpg",
    "../../assets/images/auth/slide-2.jpg",
    "../../assets/images/auth/slide-3.jpg",
    "../../assets/images/auth/slide-4.jpg"
  ];
  const INTERVAL_MS = 5000;                         // time per slide
  const FADE_MS = 1200;                             // crossfade duration
  const OVERLAY = "rgba(15, 107, 92, 0.9)";         // match the clinic teal palette
  /* ====================== */

  const brand = document.querySelector(".brand");
  if (!brand || IMAGES.length === 0) return;

  const style = document.createElement("style");
  style.textContent = `
    .brand { position: relative; isolation: isolate; overflow: hidden; }
    .brand-slides { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
    .brand-slide {
      position: absolute; inset: 0;
      background-size: cover; background-position: center;
      opacity: 0; transform: scale(1.06);
      transition: opacity ${FADE_MS}ms ease, transform ${INTERVAL_MS + FADE_MS}ms linear;
    }
    .brand-slide.is-active { opacity: 1; transform: scale(1); }
    .brand-slides::after { content: ""; position: absolute; inset: 0; background: ${OVERLAY}; }
    @media (prefers-reduced-motion: reduce) {
      .brand-slide { transition: opacity ${FADE_MS}ms ease; transform: none; }
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "brand-slides";
  wrap.setAttribute("aria-hidden", "true");
  brand.insertBefore(wrap, brand.firstChild);

  // Only keep images that actually load, so a wrong path never leaves a blank panel
  const loadImage = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  Promise.all(IMAGES.map(loadImage)).then((results) => {
    const ok = results.filter(Boolean);
    if (ok.length === 0) { wrap.remove(); return; } // fall back to the CSS background

    const slides = ok.map((src) => {
      const el = document.createElement("div");
      el.className = "brand-slide";
      el.style.backgroundImage = `url("${src}")`;
      wrap.appendChild(el);
      return el;
    });

    let current = 0;
    slides[0].classList.add("is-active");
    if (slides.length === 1) return;

    let timer = null;
    const next = () => {
      slides[current].classList.remove("is-active");
      current = (current + 1) % slides.length;
      slides[current].classList.add("is-active");
    };
    const start = () => { if (!timer) timer = setInterval(next, INTERVAL_MS); };
    const stop = () => { clearInterval(timer); timer = null; };

    start();
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  });
})();