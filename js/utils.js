// Small utilities used across pages.

(function () {
  const CART_KEY = "cart";
  const LAST_USER_ID_KEY = "lastUserId";

  window.escapeHtml = function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  window.getQueryParam = function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    } catch {
      return null;
    }
  };

  window.formatCurrency = function formatCurrency(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "$0.00";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  };

  window.renderStars = function renderStars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const full = Math.min(5, Math.floor(r));
    const empty = 5 - full;
    return `<span class="stars" aria-label="${r} out of 5 stars">${"★".repeat(full)}${"☆".repeat(
      empty
    )}</span>`;
  };

  window.formatRatingCount = function formatRatingCount(n) {
    const x = Math.max(0, Math.floor(Number(n) || 0));
    return `${x.toLocaleString()} ratings`;
  };

  /** Aggregate star counts (1–5) from review objects with .rating */
  window.computeRatingBreakdown = function computeRatingBreakdown(reviews) {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const list = Array.isArray(reviews) ? reviews : [];
    let sum = 0;
    list.forEach((rev) => {
      const raw = Number(rev && rev.rating);
      const star = Math.min(5, Math.max(1, Math.round(raw)));
      counts[star] += 1;
      sum += Number.isFinite(raw) ? raw : star;
    });
    const total = list.length;
    const average = total > 0 ? sum / total : 0;
    return { counts, total, average };
  };

  window.getProductShortDescription = function getProductShortDescription(p) {
    if (!p) return "";
    const revs = p.reviews;
    if (Array.isArray(revs) && revs[0] && revs[0].comment) {
      const t = String(revs[0].comment).trim();
      return t.length > 140 ? `${t.slice(0, 137)}…` : t;
    }
    const cat = p.category ? String(p.category) : "";
    const base = cat ? `${cat} — ${p.name || ""}` : String(p.name || "");
    return base.length > 140 ? `${base.slice(0, 137)}…` : base;
  };

  window.loadCart = function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  };

  window.saveCart = function saveCart(cartObj) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartObj || {}));
    } catch {
      // ignore
    }
  };

  window.addToCart = function addToCart(productId, quantity) {
    const qty = Math.max(1, Number(quantity) || 1);
    const cart = window.loadCart();
    const currentQty = Number(cart[productId] || 0);
    cart[productId] = currentQty + qty;
    window.saveCart(cart);
    return cart;
  };

  window.setCartQuantity = function setCartQuantity(productId, quantity) {
    const qty = Number(quantity);
    const cart = window.loadCart();

    if (!Number.isFinite(qty) || qty <= 0) {
      delete cart[productId];
    } else {
      cart[productId] = Math.floor(qty);
    }

    window.saveCart(cart);
    return cart;
  };

  window.cartToTotalQuantity = function cartToTotalQuantity(cartObj) {
    return Object.values(cartObj || {}).reduce((sum, q) => sum + Number(q || 0), 0);
  };

  /** Clear cart when participant id changes (?pid= / session); must run after tracking.js sets EXPERIMENT_CONTEXT. */
  (function syncCartForParticipantUserId() {
    try {
      const ctx =
        (window.EXPERIMENT_CONTEXT &&
          typeof window.EXPERIMENT_CONTEXT === "object" &&
          window.EXPERIMENT_CONTEXT) ||
        {};
      const raw = ctx.userId != null ? String(ctx.userId).trim() : "";
      const currentId = raw !== "" ? raw : "anonymous";
      const last = localStorage.getItem(LAST_USER_ID_KEY);
      if (last !== currentId) {
        localStorage.removeItem(CART_KEY);
        localStorage.setItem(LAST_USER_ID_KEY, currentId);
      }
    } catch {
      // ignore storage errors
    }
  })();
})();
