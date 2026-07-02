let lastTutorialSection = null;
let tocClickAt = 0;

document.addEventListener("DOMContentLoaded", () => {
  // TOC click: smooth-scroll
  document.querySelectorAll(".toc a[data-jump]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      tocClickAt = Date.now();
      document.querySelectorAll(".toc a[data-jump]").forEach(x => x.classList.toggle("is-active", x === a));
      const id = a.getAttribute("data-jump");
      const el = id ? document.getElementById(id) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // TOC progress
  const fill = document.getElementById("tocProgressFill");
  function updateProgress() {
    if (!fill) return;
    const doc = document.documentElement;
    const scrollTop = doc.scrollTop || document.body.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  // TOC active section highlight
  const tocLinks = Array.from(document.querySelectorAll(".toc a[data-jump]"));
  const sectionEls = tocLinks
    .map(a => a.getAttribute("data-jump"))
    .filter(Boolean)
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (tocLinks.length && sectionEls.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      if (Date.now() - tocClickAt < 900) return;   // let a click win briefly
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      const id = visible.target.id;
      tocLinks.forEach(a => {
        a.classList.toggle("is-active", a.getAttribute("data-jump") === id);
      });
    }, {
      rootMargin: "-20% 0px -65% 0px",
      threshold: [0.1, 0.2, 0.3, 0.4, 0.5]
    });

    sectionEls.forEach(sec => sectionObserver.observe(sec));

    // Bottom-of-page fallback: the last section can be too short to reach the
    // active band, so highlight its TOC link when scrolled to the very bottom.
    const lastLink = tocLinks[tocLinks.length - 1];
    function bottomCheck(){
      if (Date.now() - tocClickAt < 900) return;   // don't override a fresh click
      const doc = document.documentElement;
      const atBottom = (window.innerHeight + window.scrollY) >= (doc.scrollHeight - 4);
      if (atBottom) tocLinks.forEach(a => a.classList.toggle("is-active", a === lastLink));
    }
    window.addEventListener("scroll", bottomCheck, { passive: true });
    window.addEventListener("resize", bottomCheck);
    bottomCheck();
  }

  // Crossfade blocks
  document.querySelectorAll("[data-crossfade]").forEach(card => {
    const id = card.getAttribute("data-crossfade");
    const holdMs = Number(card.getAttribute("data-hold") || 2000);
    const fadeMs = Number(card.getAttribute("data-fade") || 550);

    const base = card.querySelector(".is-base");
    const top = card.querySelector(".is-top");
    const framesScript = card.querySelector(`script[data-frames="${id}"]`);

    if (!base || !top || !framesScript) return;

    let frames = [];
    try {
      frames = JSON.parse(framesScript.textContent || "[]");
    } catch (e) {
      return;
    }

    if (frames.length < 2) return;

    frames.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    top.style.transition = `opacity ${fadeMs}ms ease`;
    top.style.opacity = 0;

    let index = 0;
    base.src = frames[index];

    function hideTopInstant() {
      top.style.transition = "none";
      top.style.opacity = 0;
      void top.offsetHeight;
      top.style.transition = `opacity ${fadeMs}ms ease`;
    }

    hideTopInstant();

    setInterval(() => {
      const nextIndex = (index + 1) % frames.length;
      const nextSrc = frames[nextIndex];

      hideTopInstant();
      top.src = nextSrc;

      requestAnimationFrame(() => {
        top.style.opacity = 1;
      });

      setTimeout(() => {
        base.src = nextSrc;
        index = nextIndex;
        hideTopInstant();
      }, fadeMs);
    }, holdMs);
  });

  // Lightbox
  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lightboxImg");
  const lbClose = document.getElementById("lightboxClose");
  const lbPrev = document.getElementById("lightboxPrev");
  const lbNext = document.getElementById("lightboxNext");
  const lbDots = document.getElementById("lightboxDots");
  const lbLabel = document.getElementById("lightboxLabel");

  if (lightbox && lbImg && lbClose && lbPrev && lbNext && lbDots && lbLabel) {
    let currentIndex = 0;
    let items = [];
    let lastFocused = null;

    function buildDots() {
      lbDots.innerHTML = "";
      items.forEach((_, i) => {
        const dot = document.createElement("div");
        dot.className = "lightboxDot" + (i === currentIndex ? " is-active" : "");
        dot.addEventListener("click", () => show(i));
        lbDots.appendChild(dot);
      });
    }

    function updateDots() {
      [...lbDots.children].forEach((dot, i) => {
        dot.classList.toggle("is-active", i === currentIndex);
      });
    }

    function show(i) {
      if (!items.length) return;
      currentIndex = (i + items.length) % items.length;
      const it = items[currentIndex];
      lbImg.src = it.src;
      lbImg.alt = it.alt || "";
      lbLabel.textContent = `Preview ${currentIndex + 1} / ${items.length}`;

      const showNav = items.length > 1;
      lbPrev.style.display = showNav ? "" : "none";
      lbNext.style.display = showNav ? "" : "none";

      updateDots();
    }

    function openLightbox(startIndex) {
      if (!items.length) return;
      lastFocused = document.activeElement;
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      buildDots();
      show(startIndex);
      lbClose.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
    }

    function next() {
      show(currentIndex + 1);
    }

    function prev() {
      show(currentIndex - 1);
    }

    function getGalleryItems(gid) {
      const s = document.querySelector(`script[data-galleryjson="${gid}"]`);
      if (!s) return null;

      try {
        const arr = JSON.parse(s.textContent || "[]");
        if (!Array.isArray(arr)) return null;
        return arr
          .filter(x => x && x.src)
          .map(x => ({ src: x.src, alt: x.alt || "" }));
      } catch (e) {
        return null;
      }
    }

    document.addEventListener("click", (e) => {
      const img = e.target.closest && e.target.closest('img[data-lb="1"]');
      if (!img) return;
      if (img.closest("a")) return; // image is wrapped in a link: let the link work, no lightbox
      const gid = img.getAttribute("data-gallery");
      const idx = Number(img.getAttribute("data-index") || 0);

      if (gid) {
        const galleryItems = getGalleryItems(gid);
        if (galleryItems && galleryItems.length) {
          items = galleryItems;
          openLightbox(Math.max(0, Math.min(idx, items.length - 1)));
          return;
        }
      }

      items = [{
        src: img.getAttribute("src"),
        alt: img.getAttribute("alt") || "Preview"
      }];
      openLightbox(0);
    });

    document.querySelectorAll('[data-lbthumb="1"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const gid = btn.getAttribute("data-gallery");
        const idx = Number(btn.getAttribute("data-index") || 0);
        if (!gid) return;

        const galleryItems = getGalleryItems(gid);
        if (!galleryItems || !galleryItems.length) return;

        items = galleryItems;
        openLightbox(Math.max(0, Math.min(idx, items.length - 1)));
      });
    });

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox || (e.target.closest && e.target.closest('[data-close="1"]'))) {
        closeLightbox();
      }
    });

    lbClose.addEventListener("click", closeLightbox);
    lbNext.addEventListener("click", next);
    lbPrev.addEventListener("click", prev);

    window.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Tab") {
        const focusables = Array.prototype.slice.call(
          lightbox.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')
        ).filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  // Mobile menu
  (() => {
    const btn = document.querySelector(".menuBtn");
    const panel = document.querySelector("#mobileMenu");
    if (!btn || !panel) return;

    function closeMenu() {
      panel.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }

    function toggleMenu() {
      const isOpen = panel.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(isOpen));
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    document.addEventListener("click", (e) => {
      if (!panel.classList.contains("is-open")) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    panel.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", closeMenu);
    });
  })();

  // Dropdown nav menus
  (() => {
    const drops = Array.from(document.querySelectorAll(".navDrop"));
    if (!drops.length) return;

    function closeAll(except){
      drops.forEach(d => {
        if (d === except) return;
        d.classList.remove("is-open");
        const b = d.querySelector(".navDropBtn");
        if (b) b.setAttribute("aria-expanded", "false");
      });
    }

    drops.forEach(drop => {
      const btn = drop.querySelector(".navDropBtn");
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !drop.classList.contains("is-open");
        closeAll(drop);
        drop.classList.toggle("is-open", willOpen);
        btn.setAttribute("aria-expanded", String(willOpen));
      });
      // hover: close others + reflect the expanded state for assistive tech
      drop.addEventListener("mouseenter", () => { closeAll(drop); btn.setAttribute("aria-expanded", "true"); });
      drop.addEventListener("mouseleave", () => { if (!drop.classList.contains("is-open")) btn.setAttribute("aria-expanded", "false"); });
    });

    document.addEventListener("click", (e) => {
      if (!drops.some(d => d.contains(e.target))) closeAll(null);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll(null);
    });
  })();

  // Analytics: scroll depth
  (() => {
    const scrollMarks = [25, 50, 75, 100];
    const triggered = {};

    function trackScrollDepth() {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const scrollTop = window.scrollY || window.pageYOffset;
      const percent = Math.round((scrollTop / docHeight) * 100);

      scrollMarks.forEach((mark) => {
        if (percent >= mark && !triggered[mark]) {
          triggered[mark] = true;

          if (typeof gtag === "function") {
            gtag("event", "scroll_depth", {
              scroll_percent: mark,
              page_path: window.location.pathname,
              page_title: document.title
            });
          }
        }
      });
    }

    window.addEventListener("scroll", trackScrollDepth, { passive: true });
  })();

  // Analytics: section view tracking
  (() => {
    const trackedSections = document.querySelectorAll("[data-section-track]");
    const seen = new Set();

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        const sectionId = el.id || "";
        const sectionName = el.getAttribute("data-section-track") || sectionId;

        if (seen.has(sectionId || sectionName)) return;
        seen.add(sectionId || sectionName);

        lastTutorialSection = sectionName;

        if (typeof gtag === "function") {
          gtag("event", "tutorial_section_view", {
            section_name: sectionName,
            section_id: sectionId,
            page_title: document.title,
            page_path: window.location.pathname
          });
        }

        observer.unobserve(el);
      });
    }, { threshold: 0.35 });

    trackedSections.forEach((el) => observer.observe(el));
  })();

  // Analytics: bottom scroll
  (() => {
    let fired = false;

    function checkBottomScroll() {
      if (fired) return;

      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const scrollTop = window.scrollY || window.pageYOffset;
      const percent = (scrollTop / docHeight) * 100;

      if (percent >= 90) {
        fired = true;

        let pageType = "other";
        const path = window.location.pathname;

        if (path.includes("/rpg-maker-tutorials/")) pageType = "tutorial";
        else if (path.includes("redeem")) pageType = "redeem";
        else if (path.includes("terms")) pageType = "terms";
        else if (path.includes("privacy")) pageType = "privacy";
        else if (
          path === "/" ||
          path === "/index.html" ||
          path.endsWith("/index.html")
        ) pageType = "homepage";

        if (typeof gtag === "function") {
          gtag("event", "scroll_bottom", {
            page_type: pageType,
            page_path: window.location.pathname,
            page_title: document.title
          });
        }
      }
    }

    window.addEventListener("scroll", checkBottomScroll, { passive: true });
  })();

  // Analytics: tracked buttons
  document.addEventListener("click", function (e) {
    const link = e.target.closest("a[data-track]");
    if (!link) return;

    const eventName = link.getAttribute("data-track");
    const eventLabel = link.getAttribute("data-track-label") || link.textContent.trim() || eventName;
    const href = link.getAttribute("href") || "";
    const platform = link.getAttribute("data-platform") || "";

    if (typeof gtag === "function") {
      gtag("event", eventName, {
        link_label: eventLabel,
        tutorial_section: lastTutorialSection,
        link_url: href,
        platform: platform,
        page_title: document.title,
        page_path: window.location.pathname
      });
    }
  });

  // Analytics: outbound clicks
  document.addEventListener("click", function(e) {
    const link = e.target.closest("a[href]");
    if (!link) return;

    if (link.hasAttribute("data-track")) return;

    const url = link.href;
    if (!url) return;

    if (!url.startsWith(window.location.origin)) {
      let destination = "external";

      if (url.includes("itch.io")) destination = "itch";
      else if (url.includes("youtube")) destination = "youtube";
      else if (url.includes("patreon")) destination = "patreon";
      else if (url.includes("discord")) destination = "discord";
      else if (url.includes("booth.pm")) destination = "booth";
      else if (url.includes("pixiv.net")) destination = "pixiv";
      else if (url.includes("instagram.com")) destination = "instagram";
      else if (url.includes("tiktok.com")) destination = "tiktok";
      else if (url.includes("facebook.com")) destination = "facebook";
      else if (url.includes("bsky.app")) destination = "bluesky";
      else if (url.includes("x.com")) destination = "x";

      if (typeof gtag === "function") {
        gtag("event", "outbound_click", {
          destination: destination,
          link_url: url,
          page_title: document.title,
          page_path: window.location.pathname
        });
      }
    }
  });

  // Diagrams: hold animations until scrolled into view (replays each time)
  (() => {
    const diagrams = Array.from(document.querySelectorAll(".dgram"));
    if (!diagrams.length) return;

    if (!("IntersectionObserver" in window)) {
      diagrams.forEach(d => d.classList.add("inview"));
      return;
    }

    document.body.classList.add("dgramGate");

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        entry.target.classList.toggle("inview", entry.isIntersecting);
      });
    }, { threshold: 0.12 });

    diagrams.forEach(d => io.observe(d));
  })();

  // Year in Footer
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  
  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
});

