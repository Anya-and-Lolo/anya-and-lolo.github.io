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

});