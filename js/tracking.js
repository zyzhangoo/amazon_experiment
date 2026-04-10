/* Global tracking utilities for the experiment app.
   - trackEvent(type, data): appends events to localStorage["logs"] as
     { type, data, timestamp }
   - Optional: if window.TRACKING_UPLOAD_URL is set, events are also sent to
     the backend (researchers can configure the endpoint).
*/

(function () {
  const LOGS_KEY = "logs";
  // Persist identity across page navigation (sessionStorage is per-tab).
  // Keep legacy keys for backward compatibility with older sessions.
  const LEGACY_PID_KEY = "prolific_pid";
  const LEGACY_SESSION_KEY = "experiment_session_id";
  const USER_ID_KEY = "userId";
  const SESSION_ID_KEY = "sessionId";

  function initExperimentContext() {
    const ctx = (window.EXPERIMENT_CONTEXT &&
      typeof window.EXPERIMENT_CONTEXT === "object" &&
      window.EXPERIMENT_CONTEXT) || { };

    // userId: if URL has ?pid=, store it; otherwise read from sessionStorage.
    let userId = "anonymous";
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const pidFromUrl = urlParams.get("pid");

      if (pidFromUrl && window.sessionStorage) {
        window.sessionStorage.setItem(USER_ID_KEY, String(pidFromUrl));
        // Legacy key (do not remove)
        window.sessionStorage.setItem(LEGACY_PID_KEY, String(pidFromUrl));
      }

      const fromStorage =
        (window.sessionStorage &&
          (window.sessionStorage.getItem(USER_ID_KEY) ||
            window.sessionStorage.getItem(LEGACY_PID_KEY))) ||
        null;

      userId = String(fromStorage || ctx.userId || "anonymous");
    } catch {
      userId = String(ctx.userId || "anonymous");
    }

    // sessionId: one per tab/session (sessionStorage)
    let sessionId = null;
    try {
      const existing =
        (window.sessionStorage &&
          (window.sessionStorage.getItem(SESSION_ID_KEY) ||
            window.sessionStorage.getItem(LEGACY_SESSION_KEY))) ||
        null;
      sessionId =
        existing ||
        `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      if (window.sessionStorage && !existing) {
        window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
        // Legacy key (do not remove)
        window.sessionStorage.setItem(LEGACY_SESSION_KEY, sessionId);
      }
    } catch {
      sessionId = ctx.sessionId || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    console.log("Tracking userId:", userId);

    window.EXPERIMENT_CONTEXT = {
      ...ctx,
      userId,
      sessionId,
    };
  }

  initExperimentContext();

  function safeParseJSON(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  window.trackEvent = function trackEvent(eventType, data) {
    const ctx =
      (window.EXPERIMENT_CONTEXT &&
        typeof window.EXPERIMENT_CONTEXT === "object" &&
        window.EXPERIMENT_CONTEXT) || {};

    const now = new Date();

    // Required tracking format:
    // { userId, sessionId, eventType, data, timestamp, page }
    // Keep legacy keys for backward compatibility (type + timestampMs).
    const event = {
      userId: ctx.userId || "anonymous",
      sessionId: ctx.sessionId || null,
      eventType: eventType,
      data: data || {},
      timestamp: now.toISOString(),
      page: (window.location && window.location.href) ? String(window.location.href) : "",

      // Legacy fields (do not remove)
      type: eventType,
      timestampMs: now.getTime(),
    };

    try {
      const current = safeParseJSON(localStorage.getItem(LOGS_KEY), []);
      current.push(event);
      localStorage.setItem(LOGS_KEY, JSON.stringify(current));
    } catch (e) {
      // If storage is unavailable, we still avoid breaking the experiment UI.
      // (No rethrow)
    }

    // Best-effort backend forwarding.
    // Researchers can override by setting `window.TRACKING_UPLOAD_URL`
    // (string, e.g. "http://localhost:8000/track").
    // Default: same-origin "/track".
    try {
      const url = window.TRACKING_UPLOAD_URL || "/track";
      if (url && typeof url === "string" && url.trim()) {
        const json = JSON.stringify(event);
        if (window.fetch) {
          window
            .fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: json,
              keepalive: true,
            })
            .catch(() => {});
        } else if (navigator && typeof navigator.sendBeacon === "function") {
          // Fallback for older environments without fetch.
          const blob = new Blob([json], { type: "application/json" });
          navigator.sendBeacon(url, blob);
        }
      }
    } catch {
      // ignore upload failures
    }

    return event;
  };

  function getButtonLabel(el) {
    if (!el) return "";
    const text = (el.innerText || el.value || "").trim();
    if (text) return text.slice(0, 80);
    return el.getAttribute("aria-label") || el.id || "";
  }

  function shouldSkipGenericButtonClick(btn) {
    if (!btn) return false;
    // Dedicated trackEvent types already carry full payload (query, productId, etc.).
    if (
      btn.id === "searchBtn" ||
      btn.id === "addToCartBtn" ||
      btn.id === "expandReviewsBtn" ||
      btn.classList.contains("list-add-to-cart-btn") ||
      btn.classList.contains("category-filter-btn") ||
      btn.classList.contains("pagination-btn") ||
      btn.classList.contains("product-see-more-btn") ||
      btn.classList.contains("review-keyword-tag")
    ) {
      return true;
    }
    if (
      btn.type === "submit" &&
      btn.closest &&
      btn.closest("#searchForm")
    ) {
      return true;
    }
    return false;
  }

  function attachButtonClickTracking() {
    // "any button click": we capture clicks on actual <button> and button-like inputs.
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target;
        if (!target || !target.closest) return;

        const btn = target.closest(
          'button, input[type="button"], input[type="submit"], input[type="image"]'
        );
        if (!btn) return;

        if (shouldSkipGenericButtonClick(btn)) return;

        const id = btn.id || null;
        const label = getButtonLabel(btn) || null;
        const dataAction = btn.getAttribute("data-action") || null;
        const dataProductId = btn.getAttribute("data-product-id") || null;

        window.trackEvent("button_click", {
          id,
          label,
          action: dataAction,
          productId: dataProductId,
        });
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachButtonClickTracking);
  } else {
    attachButtonClickTracking();
  }
})();
