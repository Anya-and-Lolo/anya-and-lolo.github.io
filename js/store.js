/* =========================
   STORE / REDEEM PAGE ONLY
========================= */

document.addEventListener("DOMContentLoaded", () => {
  const API = "https://patreon-redeem-api.lady-anya.workers.dev";
  const params = new URLSearchParams(location.search);
  const DEBUG = params.get("debug"); // "anya" or null

  const FAST_POLL_MS = 5000;
  const SLOW_POLL_MS = 30000;
  const FAST_WINDOW_MS = 3 * 60 * 1000;
  const FAST_UNTIL_KEY = "fast_poll_until_v1";

  const SUPPORT_ID_KEY = "support_id_v1";
  const LAST_ACTIVITY_SEEN_KEY = "last_activity_seen_v1";

  let CURRENT_CREDITS_CENTS = 0;
  let LAST_ME = null;
  let LAST_ENTITLEMENTS = null;
  let LAST_ACTIVITY = null;
  let OWNED_ITEM_IDS = new Set();
  let ALLOW_CONFETTI = false;
  let LAST_CREDITS_CENTS = null;
  let POLL_TIMER = null;
  let ACTIVITY_TICK = 0;
  let TOAST_TIMER = null;
  let TOAST_EL = null;
  let CONFETTI_LOADING = null;

  const redeeming = new Set();

  const connectBtn = document.getElementById("connect");
  const infoBtn = document.getElementById("infoBtn");
  const infoPop = document.getElementById("infoPop");
  const infoClose = document.getElementById("infoClose");
  const toastWrap = document.getElementById("toastWrap");

  const sessionFromUrl = params.get("session");
  if (sessionFromUrl) {
    localStorage.setItem("session", sessionFromUrl);
    localStorage.setItem(FAST_UNTIL_KEY, String(Date.now() + FAST_WINDOW_MS));
  }

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      localStorage.setItem(FAST_UNTIL_KEY, String(Date.now() + FAST_WINDOW_MS));
      location.href = API + "/auth/patreon/start";
    });
  }

  function apiUrl(path, session) {
    const u = new URL(API + path);
    if (session) u.searchParams.set("session", session);
    if (DEBUG) u.searchParams.set("debug", DEBUG);
    return u.toString();
  }

  function getSession() {
    return localStorage.getItem("session");
  }

  async function safeJson(r) {
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return null;
    try {
      return await r.json();
    } catch {
      return null;
    }
  }

  function makeSupportId() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const part = (len) =>
      Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return `AL-${part(4)}-${part(4)}`;
  }

  function getSupportId() {
    let id = localStorage.getItem(SUPPORT_ID_KEY);
    if (!id) {
      id = makeSupportId();
      localStorage.setItem(SUPPORT_ID_KEY, id);
    }
    return id;
  }

  async function apiFetch(path, session, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("x-support-id", getSupportId());
    headers.set("x-page", location.pathname);
    return fetch(apiUrl(path, session), { ...opts, headers });
  }

  function fmtPrettyWhen(iso) {
    try {
      const d = new Date(String(iso));
      if (!Number.isFinite(d.getTime())) return "(unknown time)";
      const dayMonth = new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "long"
      }).format(d);
      const time = new Intl.DateTimeFormat("en-AU", {
        hour: "2-digit",
        minute: "2-digit"
      }).format(d).toLowerCase();
      return `${dayMonth} ${time}`;
    } catch {
      return "(unknown time)";
    }
  }

  function redactKey(s) {
    const t = String(s || "");
    if (!t) return "";
    return t.length <= 6 ? t : "***" + t.slice(-6);
  }

  function openInfo() {
    document.body.classList.add("modalOpen");
    infoPop?.classList.add("show");
    infoPop?.setAttribute("aria-hidden", "false");
    infoPop?.querySelector(".infoPopInner")?.focus();
  }

  function closeInfo() {
    document.body.classList.remove("modalOpen");
    infoPop?.classList.remove("show");
    infoPop?.setAttribute("aria-hidden", "true");
  }

  infoBtn?.addEventListener("click", () => {
    if (infoPop?.classList.contains("show")) closeInfo();
    else openInfo();
  });

  infoClose?.addEventListener("click", closeInfo);

  infoPop?.addEventListener("click", (e) => {
    if (e.target === infoPop) closeInfo();
  });

  function refreshConnectButtonLabel() {
    const btn = document.getElementById("connect");
    if (!btn) return;

    const mode = btn.dataset.mode || "connect";
    const mobile = window.innerWidth <= 600;

    if (mode === "reconnect") {
      btn.textContent = mobile ? "Re-connect" : "Issues? Re-connect";
    } else {
      btn.textContent = mobile ? "Connect" : "Connect Patreon";
    }
  }

  window.addEventListener("resize", refreshConnectButtonLabel);

  function setPill(status) {
    const pill = document.getElementById("patreonPill");
    if (!pill) return;

    const raw = String(status ?? "");
    const s = raw.toLowerCase();

    let cls = "pill--gray";
    let label = "not connected";

    if (!raw || s.includes("not connected")) {
      cls = "pill--gray";
      label = "not connected";
    } else if (s.includes("reconnect_required") || s.includes("reconnect")) {
      cls = "pill--amber";
      label = "Reconnect required";
    } else if (s.includes("declined")) {
      cls = "pill--red";
      label = "Payment declined";
    } else if (s.includes("active")) {
      cls = "pill--green";
      label = "Connected";
    } else if (s.includes("not a patron") || s.includes("not pledged") || s.includes("no pledge")) {
      cls = "pill--green";
      label = "Connected • No active pledges";
    } else if (s.includes("paused") || s.includes("pending")) {
      cls = "pill--amber";
      label = "Connected • Membership pending";
    } else if (s.includes("error")) {
      cls = "pill--red";
      label = "Error loading status";
    } else {
      cls = "pill--amber";
      label = "Status unknown";
    }

    pill.classList.remove("pill--green", "pill--amber", "pill--red", "pill--gray", "pill--blue");
    pill.classList.add(cls);
    pill.innerHTML = `<span class="pillDot"></span> Patreon: ${escapeHtml(label)}`;
  }

  function showConnectUI() {
    const btn = document.getElementById("connect");
    if (btn) {
      btn.classList.add("btnPrimary");
      btn.classList.remove("btnGreen");
      btn.style.display = "";
      btn.disabled = false;
      btn.dataset.mode = "connect";
    }

    const creditsSub = document.querySelector(".creditsSub");
    if (creditsSub) creditsSub.textContent = "Connect Patreon";

    refreshConnectButtonLabel();
  }

  function showConnectedUI() {
    const btn = document.getElementById("connect");
    if (btn) {
      btn.classList.add("btnGreen");
      btn.classList.remove("btnPrimary");
      btn.style.display = "";
      btn.disabled = false;
      btn.dataset.mode = "reconnect";
    }

    const creditsSub = document.querySelector(".creditsSub");
    if (creditsSub) creditsSub.textContent = "1¢ = 1 credit";

    refreshConnectButtonLabel();
  }

  function applyCreditsNow(nowCents) {
    nowCents = Math.max(0, Math.floor(Number(nowCents || 0)));
    CURRENT_CREDITS_CENTS = nowCents;

    const creditsValue = document.getElementById("creditsValue");
    if (creditsValue) creditsValue.textContent = String(nowCents);
  }

  function sortShopItemsStable(items) {
    return [...items].sort((a, b) => {
      const aName = String(a?.name || "").toLowerCase();
      const bName = String(b?.name || "").toLowerCase();
      const aId = String(a?.id || "");
      const bId = String(b?.id || "");

      if (aName < bName) return -1;
      if (aName > bName) return 1;
      if (aId < bId) return -1;
      if (aId > bId) return 1;
      return 0;
    });
  }

  function closeToast(animated = true) {
    if (!toastWrap) return;

    if (TOAST_TIMER) clearTimeout(TOAST_TIMER);
    TOAST_TIMER = null;

    const el = TOAST_EL;
    TOAST_EL = null;

    if (!el) {
      toastWrap.classList.remove("show");
      toastWrap.innerHTML = "";
      return;
    }

    if (!animated) {
      el.remove();
      toastWrap.classList.remove("show");
      toastWrap.innerHTML = "";
      return;
    }

    el.style.opacity = "0";
    el.style.transform = "scale(0.96)";

    setTimeout(() => {
      el.remove();
      toastWrap.classList.remove("show");
      toastWrap.innerHTML = "";
    }, 200);
  }

  function toast(message, variant = "blue", ms = 4200, opts = {}) {
    if (!toastWrap) return;

    closeToast(false);
    toastWrap.classList.add("show");

    const el = document.createElement("div");
    el.className = `toast ${variant || "blue"}`;
    el.innerHTML = `<strong>${escapeHtml(message)}</strong>`;
    toastWrap.appendChild(el);
    TOAST_EL = el;

    if (opts?.confetti) maybeConfetti(opts.confetti);

    TOAST_TIMER = setTimeout(() => closeToast(true), ms);
  }

  toastWrap?.addEventListener("click", () => closeToast(true));

  async function ensureConfettiLoaded() {
    if (typeof window.confetti === "function") return;
    if (CONFETTI_LOADING) return CONFETTI_LOADING;

    CONFETTI_LOADING = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    return CONFETTI_LOADING;
  }

  async function playWelcomeConfetti(times = 3) {
    await ensureConfettiLoaded();
    if (typeof window.confetti !== "function") return;

    for (let i = 0; i < times; i++) {
      window.confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.7 },
        startVelocity: 45,
        zIndex: 100000
      });
      await new Promise((r) => setTimeout(r, 450));
    }
  }

  async function maybeConfetti(kind) {
    if (!ALLOW_CONFETTI) return;
    await ensureConfettiLoaded();
    if (typeof window.confetti !== "function") return;

    const base = { particleCount: 90, spread: 70, origin: { y: 0.55 } };
    window.confetti(kind === "unlock"
      ? { ...base, particleCount: 130, spread: 90 }
      : base
    );
  }

  function isPositiveActivity(it) {
    const src = String(it?.source || "").toLowerCase();
    const delta = Number(it?.delta_cents || 0);
    if (src === "redeem") return true;
    if (src === "entitlement") return true;
    if (delta > 0) return true;
    return false;
  }

  function toastForActivity(it) {
    const src = String(it?.source || "").toLowerCase();
    const delta = Number(it?.delta_cents || 0);

    if (src === "patreon_charge" && delta > 0) {
      return { msg: "💖 Patreon support received, thank you! New credits unlocked.", variant: "blue", confetti: true };
    }
    if (src === "refund" && delta > 0) {
      return { msg: "✅ You've got a refund! Your credits returned successfully.", variant: "mint", confetti: true };
    }
    if (src === "redeem") {
      return { msg: "🎟️ Redeem successful! Please check 'Your Unlocks'.", variant: "blue", confetti: true };
    }
    if (src === "entitlement") {
      return { msg: "🎁 New item added! Please check 'Your Unlocks'.", variant: "mint", confetti: true };
    }
    if (delta > 0) {
      return { msg: "🎉 Bonus credits added! See Account Activity for more details.", variant: "mint", confetti: true };
    }

    return { msg: "ℹ️ Account updated. See Account Activity for more details.", variant: "blue", confetti: false };
  }

  function maybeToastNewActivity(items) {
    if (!Array.isArray(items) || items.length === 0) return;

    const lastSeen = localStorage.getItem(LAST_ACTIVITY_SEEN_KEY) || "";
    const newest = items[0]?.created_at || "";
    if (!newest) return;

    if (!lastSeen) {
      localStorage.setItem(LAST_ACTIVITY_SEEN_KEY, newest);
      return;
    }

    if (newest !== lastSeen) {
      const unseen = [];
      for (const it of items) {
        if (it?.created_at === lastSeen) break;
        unseen.push(it);
      }

      const pick = unseen.find(isPositiveActivity) || unseen[0];
      if (pick) {
        const t = toastForActivity(pick);
        toast(t.msg, t.variant, 4200, { confetti: t.confetti ? "credits" : null });
      }
    }

    localStorage.setItem(LAST_ACTIVITY_SEEN_KEY, newest);
  }

  async function loadMe() {
    const s = getSession();
    const creditsValue = document.getElementById("creditsValue");
    const infoPopBody = document.getElementById("infoPopBody");

    if (!s) {
      ALLOW_CONFETTI = true;

      if (!sessionStorage.getItem("welcome_confetti_v1")) {
        sessionStorage.setItem("welcome_confetti_v1", "1");
        playWelcomeConfetti(3).catch(() => {});
      }

      LAST_ME = null;
      CURRENT_CREDITS_CENTS = 0;

      if (creditsValue) creditsValue.textContent = "N/A";
      showConnectUI();
      setPill("not connected");

      if (infoPopBody) {
        infoPopBody.innerHTML =
          `Patreon status: <strong>not connected</strong><br>` +
          `Connect your Patreon to see your credits.`;
      }
      return null;
    }

    try {
      const r = await apiFetch("/me", s);
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        throw new Error(`/me non-JSON: ${r.status} ${ct}`);
      }

      const me = await safeJson(r);
      if (!me) return null;

      LAST_ME = me;

      if (!r.ok) {
        throw new Error(me?.error || `HTTP ${r.status}`);
      }

      if (!me.loggedIn) {
        ALLOW_CONFETTI = true;
        CURRENT_CREDITS_CENTS = 0;
        LAST_ME = null;

        if (creditsValue) creditsValue.textContent = "N/A";
        showConnectUI();
        setPill("not connected");

        if (infoPopBody) {
          infoPopBody.innerHTML =
            `Patreon status: <strong>not connected</strong><br>` +
            `Connect your Patreon to see your credits.`;
        }
        return null;
      }

      ALLOW_CONFETTI = true;

      if (DEBUG === "anya") {
        if (creditsValue) creditsValue.textContent = "unlimited";
        showConnectedUI();
        setPill("connected");

        if (infoPopBody) {
          infoPopBody.innerHTML =
            `Your current Patreon status: <strong>connected</strong><br>` +
            `Creator mode: unlimited.`;
        }
        return me;
      }

      const cents = Number.isFinite(Number(me.credits_raw_cents)) ? Number(me.credits_raw_cents) : 0;
      CURRENT_CREDITS_CENTS = Math.max(0, Math.floor(cents));

      if (creditsValue) creditsValue.textContent = String(CURRENT_CREDITS_CENTS);

      const prettyStatus = String(me.patreon_status ?? "connected");
      setPill(prettyStatus);

      if (prettyStatus.toLowerCase().includes("reconnect")) {
        showConnectUI();
      } else {
        showConnectedUI();
      }

      if (infoPopBody) {
        infoPopBody.innerHTML =
          `Your current Patreon status: <strong>${escapeHtml(prettyStatus)}</strong><br>` +
          `Credits are added automatically after Patreon marks your payment as Paid. If you just paid, it can take a few minutes.`;
      }

      return me;
    } catch {
      LAST_ME = null;
      CURRENT_CREDITS_CENTS = 0;

      if (creditsValue) creditsValue.textContent = "error";
      showConnectUI();
      setPill("error");

      if (infoPopBody) {
        infoPopBody.innerHTML =
          `Your current Patreon status: <strong>error</strong><br>` +
          `Couldn’t load your Patreon info. If you believe that's a mistake, please contact Anya.`;
      }
      return null;
    }
  }

  function friendlyActivityText(x) {
    const src = String(x?.source || "").toLowerCase();
    const note = String(x?.public_note || x?.note || "").trim();
    const delta = Number(x?.delta_cents || 0);

    let cleanNote = note
      .replace(/^•\s*/, "")
      .replace(/\s*\(target(?:_store)?=\s*\d+\)\s*/gi, " ")
      .replace(/^\((.*)\)$/s, "$1")
      .trim();

    if (src === "entitlement" || cleanNote.toLowerCase().startsWith("granted entitlement:")) {
      const item = cleanNote.replace(/^granted entitlement:\s*/i, "").trim();
      return {
        title: item ? `Unlocked: ${item}` : "Unlocked a reward",
        detail: cleanNote.toLowerCase().startsWith("granted entitlement:") ? "" : `Reason: ${cleanNote}`
      };
    }

    if (src.startsWith("admin")) {
      cleanNote = cleanNote
        .replace(/^admin_set\s*/i, "Admin set ")
        .replace(/^admin_adjust\s*/i, "Admin adjusted ")
        .replace(/^admin_grant\s*/i, "Admin granted ")
        .trim();
    }

    if (src === "redeem") {
      const clean = cleanNote.replace(/^redeemed\s*/i, "").trim();
      return { title: clean ? `You redeemed ${clean}` : "You redeemed a reward", detail: "" };
    }

    if (delta > 0 && src.startsWith("admin")) {
      return { title: "Yay, bonus credits added! 🎉", detail: cleanNote ? `Reason: ${cleanNote}` : "" };
    }

    if (delta < 0 && src.startsWith("admin")) {
      return { title: "Credit adjustment by Anya", detail: cleanNote ? `Reason: ${cleanNote}` : "" };
    }

    if (src === "patreon_charge") return { title: "Patreon payment processed, your credits arrived 💖", detail: "" };
    if (src === "refund") return { title: "Credits refunded", detail: "" };

    return { title: cleanNote || "Account update", detail: "" };
  }

  function renderActivity(list) {
    const box = document.getElementById("activity");
    if (!box) return;

    if (!Array.isArray(list) || list.length === 0) {
      box.classList.add("muted");
      box.textContent = "No recent activity yet.";
      return;
    }

    box.classList.remove("muted");

    box.innerHTML = `<div class="activityList">${
      list.map((x) => {
        const delta = Number(x?.delta_cents || 0);
        const source = String(x?.source || "").toLowerCase();

        let amount = "";
        let pillCls = "pill--gray";
        let icon = "💰";

        if (source === "entitlement") {
          amount = "Unlock";
          pillCls = "pill--blue";
          icon = "🔑";
        } else if (delta > 0) {
          amount = `+${Math.abs(Math.trunc(delta))}`;
          pillCls = "pill--green";
          icon = "💰";
        } else if (delta < 0) {
          amount = `−${Math.abs(Math.trunc(delta))}`;
          pillCls = "pill--red";
          icon = "💰";
        } else {
          amount = "Info";
          pillCls = "pill--gray";
          icon = "ℹ️";
        }

        const when = fmtPrettyWhen(x?.created_at);
        const { title, detail } = friendlyActivityText(x);

        return `
          <div class="activityItem">
            <div class="activityRow">
              <div class="activityPillWrap">
                <span class="pill activityPill ${pillCls}">
                  <span class="pillDot"></span>
                  ${escapeHtml(amount)}
                  <span style="opacity:.75;">${icon}</span>
                </span>
              </div>
              <span class="activityText">
                <strong>${escapeHtml(title)}</strong>
                ${detail ? `<span class="activityReason">${escapeHtml(detail)}</span>` : ""}
              </span>
              <span class="activityTime">${escapeHtml(when)}</span>
            </div>
          </div>
        `;
      }).join("")
    }</div>`;
  }

  async function loadActivity() {
    const s = getSession();
    const box = document.getElementById("activity");

    if (!s) {
      if (box) {
        box.classList.add("muted");
        box.textContent = "Connect Patreon to see recent activity on your account.";
      }
      return;
    }

    try {
      const r = await apiFetch("/activity", s);
      let data = null;
      try {
        data = await r.json();
      } catch {
        data = { error: "Invalid JSON from /activity" };
      }

      LAST_ACTIVITY = data;

      if (!r.ok) {
        if (box) {
          box.classList.add("muted");
          box.textContent = data?.error || "Could not load activity.";
        }
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      renderActivity(items);
      maybeToastNewActivity(items);
    } catch {
      if (box) {
        box.classList.add("muted");
        box.textContent = "Network error loading activity.";
      }
    }
  }

  function addUnlock(title, payload = {}) {
    const box = document.getElementById("unlocks");
    if (!box) return;
    if (box.classList.contains("muted")) box.classList.remove("muted");

    const p = payload || {};
    const safeTitle = escapeHtml(title || p.title || "");
    const instructions = String(p.instructions || "").trim();

    const linkUrl = String(p.link_url || p.url || "").trim();
    const keyCode = String(p.itch_key_code || "").trim();
    const keyUrl = String(p.itch_key_url || "").trim();

    const isBundle =
      p.fulfillment === "bundle" ||
      Array.isArray(p.bundle_items) ||
      Array.isArray(p.extras) ||
      Array.isArray(p.items);

    if (isBundle) {
      const bundleTitle = escapeHtml(safeTitle || p.bundle_title || "Bundle");
      const extras = Array.isArray(p.extras) ? p.extras : [];
      const bundleItems = Array.isArray(p.bundle_items) ? p.bundle_items : [];
      const granted = Array.isArray(p.bundle_granted) ? p.bundle_granted : [];

      const skippedCount = Number.isFinite(p.bundle_skipped_count)
        ? Number(p.bundle_skipped_count)
        : Math.max(0, bundleItems.length - granted.length);

      const extrasHtml = extras.length
        ? `
          <div style="margin-top:10px"><strong>Extras:</strong></div>
          ${extras.map((x) => {
            const label = escapeHtml(String(x?.label || "Extra"));
            const url = String(x?.url || "").trim();
            if (!url) return "";
            const safe = escapeHtml(url);
            return `
              <div style="margin-top:8px">
                <div style="font-weight:800">${label}</div>
                <div><a href="${safe}" target="_blank" rel="noopener noreferrer"><code class="key">${safe}</code></a></div>
                <div style="margin-top:6px" class="row">
                  <button class="copyExtra" data-copy="${safe}">Copy Link</button>
                </div>
              </div>
            `;
          }).join("")}
        `
        : `<div class="muted" style="margin-top:10px">No extra links in this bundle.</div>`;

      const statusLine =
        granted.length === 0
          ? `You already own everything in this bundle 💛`
          : `Granted ${granted.length} item(s). ${skippedCount ? `Skipped ${skippedCount} already owned.` : ""}`;

      const wrap = document.createElement("div");
      wrap.className = "card subcard";
      wrap.innerHTML = `
        <strong>${bundleTitle}</strong>
        <div class="keybox" style="margin-top:8px">
          <div class="muted">${escapeHtml(statusLine)}</div>
          ${extrasHtml}
          <div class="muted" style="margin-top:10px">
            ${instructions ? escapeHtml(instructions) : "Thank you for supporting 💃 Anya & Lolo 🦜"}
          </div>
        </div>
      `;

      wrap.querySelectorAll(".copyExtra").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const v = btn.getAttribute("data-copy") || "";
          if (!v) return;
          await navigator.clipboard.writeText(v);

          let msg = wrap.querySelector(".copiedMsg");
          if (!msg) {
            msg = document.createElement("div");
            msg.className = "muted copiedMsg";
            msg.style.marginTop = "8px";
            wrap.querySelector(".keybox")?.appendChild(msg);
          }
          msg.textContent = "💛 Copied!";
        });
      });

      box.prepend(wrap);
      return;
    }

    let mainLabel = "";
    let mainHtml = "";
    let copyValue = "";
    let copyLabel = "Copy";

    if (linkUrl) {
      mainLabel = "Your link:";
      mainHtml = `
        <div>
          <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer">
            <code class="key">${escapeHtml(linkUrl)}</code>
          </a>
        </div>
      `;
      copyValue = linkUrl;
      copyLabel = "Copy Link";
    } else if (keyUrl) {
      mainLabel = "Your itch.io key link:";
      mainHtml = `<div><code class="key">${escapeHtml(keyUrl)}</code></div>`;
      copyValue = keyUrl;
      copyLabel = "Copy Link";
    } else if (keyCode) {
      mainLabel = "Your itch.io key code:";
      mainHtml = `<div><code class="key">${escapeHtml(keyCode)}</code></div>`;
      copyValue = keyCode;
      copyLabel = "Copy Key";
    } else {
      mainLabel = "Unlock info:";
      mainHtml = `<div><code class="key">(missing link / key)</code></div>`;
    }

    const wrap = document.createElement("div");
    wrap.className = "card subcard";
    wrap.innerHTML = `
      <strong>${safeTitle}</strong>
      <div class="keybox" style="margin-top:8px">
        <div>${escapeHtml(mainLabel)}</div>
        ${mainHtml}
        <div style="margin-top:8px" class="row">
          <button class="copy" ${copyValue ? "" : "disabled"}>${escapeHtml(copyLabel)}</button>
        </div>
        <div class="muted" style="margin-top:8px">
          ${instructions ? escapeHtml(instructions) : "Thank you for supporting 💃 Anya & Lolo 🦜"}
        </div>
      </div>
    `;

    wrap.querySelector(".copy")?.addEventListener("click", async () => {
      if (!copyValue) return;
      await navigator.clipboard.writeText(copyValue);

      let msg = wrap.querySelector(".copiedMsg");
      if (!msg) {
        msg = document.createElement("div");
        msg.className = "muted copiedMsg";
        msg.style.marginTop = "8px";
        wrap.querySelector(".keybox")?.appendChild(msg);
      }
      msg.textContent = "💛 Copied!";
    });

    box.prepend(wrap);
  }

  async function loadUnlocks() {
    const s = getSession();
    const box = document.getElementById("unlocks");

    OWNED_ITEM_IDS = new Set();

    if (!s) {
      LAST_ENTITLEMENTS = null;
      if (box) {
        box.classList.add("muted");
        box.textContent = "Connect Patreon to see your unlocks.";
      }
      return;
    }

    const r = await apiFetch("/entitlements", s);
    const data = await safeJson(r);
    if (!data) return;

    LAST_ENTITLEMENTS = data;

    if (!r.ok) {
      if (box) {
        box.classList.add("muted");
        box.textContent = data.error || "Could not load unlocks.";
      }
      return;
    }

    if (!data.items || data.items.length === 0) {
      if (box) {
        box.classList.add("muted");
        box.textContent = "Redeem something to see it here.";
      }
      return;
    }

    data.items.forEach((ent) => {
      if (ent?.item_id) OWNED_ITEM_IDS.add(ent.item_id);
    });

    box.classList.remove("muted");
    box.innerHTML = "";

    data.items.forEach((ent) => {
      const title = ent?.payload?.title ? ent.payload.title : ent.item_id;
      addUnlock(title, ent.payload || {});
    });
  }

  function showStoreMessage(buttonEl, msg, type = "info") {
    if (!buttonEl) return;
    const card = buttonEl.closest(".card");
    if (!card) return;
    const box = card.querySelector(".storeMsg");
    if (!box) return;

    const defaultMsg = box.dataset.defaultMsg || box.textContent;
    if (!box.dataset.defaultMsg) box.dataset.defaultMsg = defaultMsg;

    clearTimeout(box._resetTimer);

    box.classList.remove("storeMsg--success", "storeMsg--error", "storeMsg--info", "show");
    box.classList.add("show");

    if (type === "success") box.classList.add("storeMsg--success");
    else if (type === "error") box.classList.add("storeMsg--error");
    else box.classList.add("storeMsg--info");

    box.textContent = msg;

    if (type === "error" || type === "success") {
      box._resetTimer = setTimeout(() => {
        box.classList.remove("storeMsg--success", "storeMsg--error");
        box.classList.add("storeMsg--info");
        box.textContent = box.dataset.defaultMsg || defaultMsg;
      }, 3000);
    }
  }

  async function redeem(itemId, buttonEl) {
    const s = getSession();
    if (!s) {
      showStoreMessage(buttonEl, "Please connect your Patreon account first.", "error");
      return;
    }

    const itemName = buttonEl?.dataset?.name || itemId;
    if (redeeming.has(itemId)) return;
    redeeming.add(itemId);

    const originalText = buttonEl?.textContent || "Redeem";

    try {
      buttonEl.disabled = true;
      buttonEl.textContent = "Redeeming…";
      showStoreMessage(buttonEl, `Redeeming ${itemName}…`, "info");

      const r = await apiFetch("/redeem", s, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId })
      });

      const out = (await safeJson(r)) || {};

      if (!r.ok) {
        if (out?.error === "Not enough credits") {
          const have = Number(out?.available_cents ?? 0);
          showStoreMessage(buttonEl, `Not enough credits for ${itemName}. You have ${have} credits.`, "error");
        } else {
          showStoreMessage(buttonEl, out?.error || "Redeem failed. Please try again.", "error");
        }
        return;
      }

      showStoreMessage(buttonEl, `🎉 Success! ${itemName} unlocked. Check “Your Unlocks”.`, "success");
      toast(`🎉 ${itemName} unlocked! Check “Your Unlocks”.`, "mint", 4200, { confetti: "unlock" });

      await loadMe();
      await loadUnlocks();
      await loadActivity();
      await loadStore();
    } catch (e) {
      console.error(e);
      showStoreMessage(buttonEl, "Network error. Please try again.", "error");
    } finally {
      redeeming.delete(itemId);
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
    }
  }

  async function loadStore() {
    const el = document.getElementById("store");
    if (!el) return;

    try {
      const r = await apiFetch(`/store?t=${Date.now()}`, null, { cache: "no-store" });
      const data = await safeJson(r);

      if (!data) {
        el.innerHTML = `<div class="muted">Store failed to load (server returned non-JSON).</div>`;
        return;
      }

      el.innerHTML = "";
      const itemsRaw = Array.isArray(data?.items) ? data.items : [];
      const items = sortShopItemsStable(itemsRaw);

      if (items.length === 0) {
        el.innerHTML = `<div class="muted">No rewards available yet.</div>`;
        return;
      }

      items.forEach((item) => {
        const baseCents = Number(item?.cost_cents ?? 0);
        const finalCents = Number(item?.final_cents ?? baseCents);
        const costCents = Math.floor(finalCents);
        const cantAfford = Number.isFinite(CURRENT_CREDITS_CENTS) && CURRENT_CREDITS_CENTS < costCents;
        const percent = Number(item?.discount?.percent ?? item?.discount_percent ?? item?.percent_off ?? 0) || 0;

        const isDiscounted =
          Number.isFinite(baseCents) &&
          Number.isFinite(finalCents) &&
          finalCents < baseCents;

        const baseLabel = String(Math.floor(baseCents));
        const finalLabel = String(Math.floor(finalCents));

        const discountLabel = String(
          item?.discount?.label ?? item?.discount_label ?? item?.label ?? ""
        ).trim();

        let topLineHtml;
        if (isDiscounted) {
          const bits = [];
          bits.push(`<span class="saleBadge">SALE</span>`);
          if (discountLabel) bits.push(`<span class="saleLabel">${escapeHtml(discountLabel)}</span>`);
          bits.push(`<span class="salePercent">${escapeHtml(percent)}% off</span>`);
          topLineHtml = bits.join(`<span class="storeDot">•</span>`);
        } else {
          topLineHtml = `<span style="opacity:.65; font-weight:800;">Unlock Forever!</span>`;
        }

        const fulfillment = String(item?.fulfillment || "itch_key");
        const isKeyed = fulfillment === "itch_key";
        const remaining = Number.isFinite(Number(item?.remaining)) ? Number(item.remaining) : null;
        const soldOut = isKeyed && remaining != null && remaining <= 0;
        const img = String(item?.image_url || "").trim();
        const isOwned = OWNED_ITEM_IDS.has(item?.id);

        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
          ${img ? `<img class="storeImg" src="${escapeHtml(img)}" alt="${escapeHtml(item?.name || "")}">` : ""}
          <div class="storeMeta">
            <div class="storeTitle">${escapeHtml(item?.name || "Untitled")}</div>
            <div class="storeInfo">
              <div class="storeInfoTop">${topLineHtml}</div>
              <div class="storeInfoBottom">
                ${
                  isDiscounted
                    ? `<span style="opacity:.55; text-decoration:line-through;">${baseLabel}</span>
                       <strong class="priceNum">${finalLabel}</strong> credits`
                    : `<strong class="priceNum">${finalLabel}</strong> credits`
                }
                <span class="storeDot">•</span>
                ${isOwned ? "System Owned ✅" : (isKeyed ? `${remaining ?? 0} keys left` : "Instant unlock")}
              </div>
            </div>
          </div>

          <button
            class="storeButton"
            ${(isOwned || soldOut || cantAfford) ? "disabled" : ""}
            data-id="${escapeHtml(item?.id || "")}"
            data-name="${escapeHtml(item?.name || "")}"
            data-cost-cents="${costCents}">
            ${isOwned ? "Redeemed" : (soldOut ? "Sold Out" : (cantAfford ? "Not enough credits" : "Redeem"))}
          </button>

          <div class="storeMsg storeMsg--info show">
            ${
              item?.payload?.instructions
                ? escapeHtml(item.payload.instructions)
                : (isKeyed ? "Redeem to receive a unique itch.io key." : "Redeem to unlock instantly.")
            }
          </div>
        `;

        const btn = div.querySelector("button");
        if (btn && !isOwned && !soldOut && !cantAfford) {
          btn.addEventListener("click", () => redeem(item.id, btn));
        }

        el.appendChild(div);
      });
    } catch (e) {
      el.innerHTML = `<div class="muted">Store failed to load. Check console for errors.</div>`;
      console.error("loadStore failed", e);
    }
  }

  async function copySupportInfo() {
    const sessionPresent = !!getSession();
    const supportId = getSupportId();

    let support = { user_id: null, patreon_user_id: null };
    try {
      const s = getSession();
      if (s) {
        const r = await apiFetch("/support", s);
        const data = await safeJson(r);
        if (data && r.ok && data?.loggedIn && data?.support) {
          support.user_id = data.support.user_id ?? null;
          support.patreon_user_id = data.support.patreon_user_id ?? null;
        }
      }
    } catch {
      // ignore
    }

    const entItems = Array.isArray(LAST_ENTITLEMENTS?.items) ? LAST_ENTITLEMENTS.items : [];
    const safeEnt = entItems.map((e) => ({
      entitlement_id: e?.id ?? null,
      item_id: e?.item_id ?? null,
      title: e?.payload?.title ?? null,
      claimed_at: e?.payload?.claimed_at ?? null,
      itch_key_code_last6: redactKey(e?.payload?.itch_key_code),
      itch_key_url_present: !!e?.payload?.itch_key_url
    }));

    const safe = {
      app: "Anya & Lolo Patreon Rewards",
      page: location.href.split("?")[0],
      time: new Date().toISOString(),
      session_present: sessionPresent,
      user_id: support.user_id,
      patreon_user_id: support.patreon_user_id,
      loggedIn: LAST_ME?.loggedIn ?? null,
      patreon_status: LAST_ME?.patreon_status ?? null,
      credits_raw_cents: LAST_ME?.credits_raw_cents ?? null,
      entitlements_count: safeEnt.length,
      entitlements: safeEnt,
      ua: navigator.userAgent
    };

    const text =
      `SUPPORT INFO (paste to Anya)\nSupport ID: ${supportId}\n` +
      JSON.stringify(safe, null, 2);

    await navigator.clipboard.writeText(text);

    const msg = document.getElementById("supportCopied");
    if (msg) msg.textContent = "Copied! Paste this to Anya 💛";
  }

  document.getElementById("copySupport")?.addEventListener("click", copySupportInfo);

  function getPollMs() {
    const until = Number(localStorage.getItem(FAST_UNTIL_KEY) || 0);
    return Date.now() < until ? FAST_POLL_MS : SLOW_POLL_MS;
  }

  async function tick() {
    try {
      if (document.hidden) return;

      const session = getSession();
      if (!session) {
        stopCreditsPolling();
        return;
      }

      const r = await apiFetch("/me", session);
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) return;

      const me = await safeJson(r);
      if (!me || !r.ok) return;
      if (!me.loggedIn) {
        stopCreditsPolling();
        return;
      }

      const now = Number(me?.credits_raw_cents ?? 0);
      if (!Number.isFinite(now)) return;

      const creditsChanged = LAST_CREDITS_CENTS !== null && now !== LAST_CREDITS_CENTS;
      let shouldRefreshActivity = false;

      ACTIVITY_TICK = (ACTIVITY_TICK + 1) % 3;
      if (ACTIVITY_TICK === 0) shouldRefreshActivity = true;

      if (creditsChanged) {
        applyCreditsNow(now);
        loadUnlocks().catch(() => {});
        loadStore().catch(() => {});
        shouldRefreshActivity = true;
      }

      if (shouldRefreshActivity) {
        loadActivity().catch(() => {});
      }

      LAST_CREDITS_CENTS = now;
    } catch {
      // silent
    }
  }

  function startCreditsPolling() {
    if (POLL_TIMER) return;
    if (!getSession()) return;

    let currentMs = getPollMs();
    POLL_TIMER = setInterval(tick, currentMs);
    tick();

    const switcher = setInterval(() => {
      if (!POLL_TIMER) {
        clearInterval(switcher);
        return;
      }
      const want = getPollMs();
      if (want !== currentMs) {
        clearInterval(POLL_TIMER);
        POLL_TIMER = setInterval(tick, want);
        currentMs = want;
      }
    }, 1000);
  }

  function stopCreditsPolling() {
    if (POLL_TIMER) clearInterval(POLL_TIMER);
    POLL_TIMER = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCreditsPolling();
    else startCreditsPolling();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeInfo();
      closeToast(true);
    }
  });

  window.addEventListener("error", (e) => {
    console.error("Global error:", e.error || e.message);
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled promise rejection:", e.reason);
  });

  (async () => {
    try { await loadMe(); } catch {}
    try { await loadUnlocks(); } catch {}
    try { await loadActivity(); } catch {}
    try { await loadStore(); } catch {}

    LAST_CREDITS_CENTS = CURRENT_CREDITS_CENTS;
    startCreditsPolling();
  })();
});