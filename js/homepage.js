document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     HERO TITLE ROTATOR
  ========================= */

  (() => {
    const el = document.getElementById("heroRotateText");
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const phrases = [
      "Tutorials for Indie Game Developers",
      "Beginner Tutorials for Indie Devs",
      "MZ & MV Tutorials for Beginners",
      "Step-by-Step Game Dev Tutorials",
      "XP & VX Ace Tips and Guides",
      "How to Make a Game in RPG Maker"
    ];

    let index = 0;
    const OUT_MS = 380;
    const INTERVAL_MS = 2500;

    function rotate(){
      el.classList.remove("is-in");
      el.classList.add("is-out");

      setTimeout(()=>{
        index = (index + 1) % phrases.length;
        el.textContent = phrases[index];

        el.classList.remove("is-out");
        el.classList.add("is-in");

        setTimeout(()=>{
          el.classList.remove("is-in");
        }, OUT_MS);

      }, OUT_MS);
    }

    setInterval(()=>{
      if(document.hidden) return;
      rotate();
    }, INTERVAL_MS);

  })();


  /* =========================
     NEWS IFRAME LOADER
  ========================= */

  (() => {
    const frame = document.getElementById("newsFrame");
    const placeholder = document.getElementById("newsPlaceholder");
    if (!frame || !placeholder) return;

    const startTime = Date.now();
    const MIN_VISIBLE_TIME = 2000;

    frame.addEventListener("load", () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_VISIBLE_TIME - elapsed);

      setTimeout(()=>{
        placeholder.style.opacity = "0";
        frame.style.opacity = "1";

        setTimeout(()=>{
          placeholder.style.display = "none";
        },400);

      }, remaining);
    });

    frame.src = "https://anya-and-lolo.github.io/NewsBlog/";

  })();


  /* =========================
     FEATURED MARQUEE
  ========================= */

  (() => {
    const marquee = document.querySelector(".featuredMarquee");
    const track = document.querySelector(".featuredTrack");

    if(!marquee || !track) return;

    Array.from(track.children).forEach(node=>{
      track.appendChild(node.cloneNode(true));
    });

    const SPEED = 50;
    let last = performance.now();

    function tick(now){
      const dt = (now - last) / 1000;
      last = now;

      marquee.scrollLeft += SPEED * dt;

      const half = track.scrollWidth / 2;
      if(marquee.scrollLeft >= half){
        marquee.scrollLeft -= half;
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

  })();


  /* =========================
     YOUTUBE LATEST VIDEOS
  ========================= */

  (async () => {

    const grid = document.getElementById("ytGrid");
    if(!grid) return;

    try{

      const res = await fetch(
        "https://patreon-redeem-api.lady-anya.workers.dev/public/youtube/latest?limit=6",
        { cache:"no-store" }
      );

      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];

      if(!items.length){
        grid.innerHTML = `<div class="subcard">No videos yet.</div>`;
        return;
      }

      grid.innerHTML = items.map(v=>{

        const title = escapeHtml(v.title || "Untitled");
        const url = safeUrl(v.url, "https://youtube.com");
        const thumb = safeUrl(v.thumbnail,"");

        return `
          <a class="ytTile" href="${url}" target="_blank" rel="noopener">

            <div class="ytThumbWrap">
              ${thumb ? `<img class="ytThumb" src="${thumb}" alt="${title}">` : ""}
              <div class="ytPlay">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>

            <div class="ytMeta">
              <div class="ytTitle">${title}</div>
            </div>

          </a>
        `;
      }).join("");

    }
    catch(e){
      console.warn("YouTube load failed",e);
    }

  })();

});