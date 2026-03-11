function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function safeUrl(u, fallback = "#"){
  try {
    const url = new URL(String(u || ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Pause animations when not visible
  (() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) return;

    const body = document.body;
    const targets = [
      document.querySelector(".floatHint"),
      document.querySelector(".featuredMarquee"),
      document.getElementById("patreonBtn"),
    ].filter(Boolean);

    const setAnimating = (el, on) => {
      el.classList.toggle("is-animating", !!on);
    };

    const vis = new Map();

    const updateGlobal = () => {
      body.classList.toggle("is-animating", !document.hidden);
    };

    document.addEventListener("visibilitychange", () => {
      updateGlobal();
      const tabOn = !document.hidden;
      for (const el of targets) {
        setAnimating(el, tabOn && (vis.get(el) === true));
      }
    });

    updateGlobal();

    const io = new IntersectionObserver((entries) => {
      const tabOn = !document.hidden;
      for (const e of entries) {
        vis.set(e.target, e.isIntersecting);
        setAnimating(e.target, tabOn && e.isIntersecting);
      }
    }, { threshold: 0.15 });

    targets.forEach(el => io.observe(el));
  })();

  // Pop animation on itch links
  document.querySelectorAll('a[href*="itch.io"]').forEach(el => {
    el.addEventListener("click", () => {
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    });
  });

  // Card reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("reveal");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll(".card").forEach(c => {
    c.classList.add("preReveal");
    io.observe(c);
  });

  // Hero title rotator
  (() => {
    const el = document.getElementById("heroRotateText");
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    el.classList.add("is-in");

    const phrases = [
      "Tutorials for Indie Game Developers",
      "Beginner Tutorials for Indie Devs",
      "MZ & MV Tutorials for Beginners",
      "Step-by-Step Game Dev Tutorials",
      "XP & VX Ace Tips and Guides",
      "How to Make a Game in RPG Maker"
    ];

    const USE_SHIMMER = false;
    const USE_GLOW = false;

    let index = 0;
    const OUT_MS = 380;
    const INTERVAL_MS = 2500;

    function pulseEffects(){
      if (USE_SHIMMER){
        el.classList.remove("heroShimmer");
        void el.offsetWidth;
        el.classList.add("heroShimmer");
      }
      if (USE_GLOW){
        el.classList.remove("heroGlow");
        void el.offsetWidth;
        el.classList.add("heroGlow");
      }
    }

    function rotate() {
      el.classList.remove("is-in");
      el.classList.add("is-out");

      setTimeout(() => {
        index = (index + 1) % phrases.length;
        el.textContent = phrases[index];

        el.classList.remove("is-out");
        el.classList.add("is-in");
        pulseEffects();

        setTimeout(() => el.classList.remove("is-in"), OUT_MS);
      }, OUT_MS);
    }

    setInterval(() => {
      if (document.hidden) return;
      rotate();
    }, INTERVAL_MS);
  })();

  // News iframe loader
  (() => {
    const frame = document.getElementById("newsFrame");
    const placeholder = document.getElementById("newsPlaceholder");
    const hint = placeholder?.querySelector(".newsHint");

    if (!frame || !placeholder) return;

    const MIN_VISIBLE_TIME = 2000;
    const startTime = Date.now();
    let frameLoaded = false;

    function revealFrame(){
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_VISIBLE_TIME - elapsed);

      setTimeout(() => {
        placeholder.style.opacity = "0";
        frame.style.opacity = "1";
        frame.style.pointerEvents = "auto";
        setTimeout(() => { placeholder.style.display = "none"; }, 400);
      }, remaining);
    }

    frame.addEventListener("load", () => {
      frameLoaded = true;
      revealFrame();
    });

    frame.src = "https://anya-and-lolo.github.io/NewsBlog/";

    setTimeout(() => {
      if (!frameLoaded && hint){
        hint.innerHTML =
          `Still loading… <a href="${frame.src}" target="_blank" rel="noopener" style="color:#f4184c;font-weight:900;">Open news in a new tab →</a><br>` +
          `If you’re on iPhone, content blockers/private mode can block embeds.`;
      }
    }, 8000);
  })();

  // Confetti burst
  (() => {
    const btn = document.getElementById("patreonBtn");
    if (!btn) return;

    const layer = btn.querySelector(".confettiLayer");
    if (!layer) return;

    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) return;

    const HEART_SVG = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 21s-7.3-4.6-10-9.2C.1 8.4 1.7 5.3 4.8 4.4c1.9-.6 4 .1 5.2 1.7c1.2-1.6 3.3-2.3 5.2-1.7
        c3.1.9 4.7 4 2.8 7.4C19.3 16.4 12 21 12 21z"/>
      </svg>
    `;

    const COLORS = [
      "rgba(255,255,255,0.95)",
      "rgba(255,182,193,0.95)",
      "rgba(173,216,230,0.95)",
      "rgba(221,160,221,0.95)",
      "rgba(255,225,150,0.95)"
    ];

    function rand(min, max){ return Math.random() * (max - min) + min; }

    function explode(){
      if (btn.classList.contains("is-exploding")) return;

      btn.classList.add("is-exploding");
      layer.innerHTML = "";

      const count = 14;

      for (let i = 0; i < count; i++){
        const piece = document.createElement("span");
        piece.className = "confettiPiece";
        piece.innerHTML = HEART_SVG;

        const angle = rand(-Math.PI, Math.PI);
        const dist = rand(45, 95);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const size = rand(10, 16);
        const rot = rand(0, 180);

        piece.style.setProperty("--dx", dx.toFixed(1) + "px");
        piece.style.setProperty("--dy", dy.toFixed(1) + "px");
        piece.style.setProperty("--s", size.toFixed(1) + "px");
        piece.style.setProperty("--r", rot.toFixed(1) + "deg");
        piece.style.setProperty("--c", COLORS[(Math.random() * COLORS.length) | 0]);

        piece.style.animationDelay = (i * 12) + "ms";
        layer.appendChild(piece);
      }

      setTimeout(() => {
        btn.classList.remove("is-exploding");
        layer.innerHTML = "";
      }, 900);
    }

    function scheduleNext(){
      const delay = rand(500, 1000);
      setTimeout(() => {
        const ok = !document.hidden && btn.classList.contains("is-animating");
        if (ok) explode();
        scheduleNext();
      }, delay);
    }

    scheduleNext();
  })();

  // Featured marquee
  (() => {
    const marquee = document.querySelector(".featuredMarquee");
    const track = document.querySelector(".featuredTrack");
    if (!marquee || !track) return;

    Array.from(track.children).forEach(node => track.appendChild(node.cloneNode(true)));

    let paused = false;
    let resumeTimer = null;

    const SPEED = 50;
    const MOBILE_SPEED = 140;
    const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;
    const speed = isTouch ? MOBILE_SPEED : SPEED;

    let last = performance.now();

    function tick(now){
      const dt = (now - last) / 1000;
      last = now;

      const canRun = !paused && !document.hidden && marquee.classList.contains("is-animating");

      if (canRun){
        marquee.scrollLeft += speed * dt;
        const half = track.scrollWidth / 2;
        if (marquee.scrollLeft >= half){
          marquee.scrollLeft -= half;
        }
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

    function pause(){
      paused = true;
      clearTimeout(resumeTimer);
    }

    function resumeDelayed(){
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; }, 1200);
    }

    marquee.addEventListener("mouseenter", pause);
    marquee.addEventListener("mouseleave", resumeDelayed);
    marquee.addEventListener("touchstart", pause, { passive: true });
    marquee.addEventListener("touchmove", resumeDelayed, { passive: true });
  })();

  // Latest YouTube videos
  (async () => {
    const grid = document.getElementById("ytGrid");
    if (!grid) return;

    try {
      const res = await fetch(
        "https://patreon-redeem-api.lady-anya.workers.dev/public/youtube/latest?limit=6",
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      if (!items.length) {
        grid.innerHTML = `<div class="subcard">No videos found yet.</div>`;
        return;
      }

      grid.innerHTML = items.map((v) => {
        const title = escapeHtml(v.title || "Untitled");
        const url = safeUrl(v.url, "https://www.youtube.com/@Anya_and_Lolo");
        const thumb = safeUrl(v.thumbnail, "");
        const thumbHtml = thumb
          ? `<img class="ytThumb" src="${thumb}" alt="${title}" loading="lazy">`
          : `<div class="ytThumb" aria-hidden="true"></div>`;

        const date = v.published_at
          ? new Intl.DateTimeFormat(undefined, {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(v.published_at))
          : "";

        return `
          <a class="ytTile" href="${url}" target="_blank" rel="noopener">
            <div class="ytThumbWrap">
              ${thumbHtml}
              <div class="ytPlay" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <div class="ytMeta">
              <div class="ytTitle">${title}</div>
              <div class="ytDate">${escapeHtml(date)}</div>
            </div>
          </a>
        `;
      }).join("");
    } catch (err) {
      console.warn("YouTube gallery failed:", err);
      grid.innerHTML = `
        <div class="subcard">
          Couldn’t load videos right now —
          <a class="linkBrand" href="https://www.youtube.com/@Anya_and_Lolo" target="_blank" rel="noopener">
            open the channel →
          </a>
        </div>
      `;
    }
  })();
});
