/* =========================
   GLOBAL HELPERS
========================= */

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


/* =========================
   DOM READY
========================= */

document.addEventListener("DOMContentLoaded", () => {

  /* Card reveal animation */
  const revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add("reveal");
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll(".card").forEach(c=>{
    c.classList.add("preReveal");
    revealObserver.observe(c);
  });


  /* Pop animation for itch links */
  document.querySelectorAll('a[href*="itch.io"]').forEach(el=>{
    el.addEventListener("click", ()=>{
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    });
  });


  /* Dropdown nav menus */
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

  /* Footer copyright year */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});