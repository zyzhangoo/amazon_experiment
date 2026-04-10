// Product detail page logic.

(function () {
  const els = {
    productImage: document.getElementById("productImage"),
    productName: document.getElementById("productName"),
    productPrice: document.getElementById("productPrice"),
    productCategory: document.getElementById("productCategory"),
    productRating: document.getElementById("productRating"),
    productBadges: document.getElementById("productBadges"),
    addToCartBtn: document.getElementById("addToCartBtn"),

    productFeaturesBlock: document.getElementById("productFeaturesBlock"),
    productFeaturesList: document.getElementById("productFeaturesList"),
    featuresToggleBtn: document.getElementById("featuresToggleBtn"),

    productDescriptionBlock: document.getElementById("productDescriptionBlock"),
    productDescriptionText: document.getElementById("productDescriptionText"),
    descriptionToggleBtn: document.getElementById("descriptionToggleBtn"),

    customersSaySection: document.getElementById("customersSaySection"),
    customersSayText: document.getElementById("customersSayText"),
    reviewKeywordsSection: document.getElementById("reviewKeywordsSection"),
    reviewKeywordsList: document.getElementById("reviewKeywordsList"),
    keywordDetailBox: document.getElementById("keywordDetailBox"),

    reviewsContainer: document.getElementById("reviewsContainer"),
    expandReviewsBtn: document.getElementById("expandReviewsBtn"),

    addToCartStatus: document.getElementById("addToCartStatus"),
  };

  const FEATURE_PREVIEW_COUNT = 5;

  let product = null;
  let reviewsExpanded = false;
  let featuresExpanded = false;
  let descriptionExpanded = false;
  /** Which keyword detail panel is open (null = closed). */
  let openKeywordDetail = null;

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function parsePriceToNumber(price) {
    if (typeof price === "number") return price;
    if (price == null) return NaN;
    const cleaned = String(price).replace(/[$,\s]/g, "");
    return Number(cleaned);
  }

  function resolveImageSrc(image) {
    if (!image) return "";
    const s = String(image);
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    const idx = s.lastIndexOf("images/");
    if (idx !== -1) return s.slice(idx);
    if (s.startsWith("/")) return s.slice(1);
    return s;
  }

  function getTopReviews(p) {
    if (!p) return [];
    if (Array.isArray(p.top_reviews)) return p.top_reviews;
    // Backward compat (older dataset)
    if (Array.isArray(p.reviews)) return p.reviews;
    return [];
  }

  function getAiGeneratedSummary(p) {
    // New dataset uses hyphenated keys.
    const v = p ? (p["ai-generated-summary"] ?? p.aiGeneratedSummary) : null;
    const s = typeof v === "string" ? v.trim() : "";
    return s;
  }

  function getReviewKeywords(p) {
    const raw = p ? (p["customer-review-keywords"] ?? p.customerReviewKeywords) : null;
    const arr = Array.isArray(raw) ? raw : [];
    const cleaned = arr
      .map((x) => (x == null ? "" : String(x)).trim())
      .filter(Boolean);
    // de-dup (case-insensitive) while preserving order
    const seen = new Set();
    const out = [];
    cleaned.forEach((k) => {
      const norm = k.toLowerCase();
      if (seen.has(norm)) return;
      seen.add(norm);
      out.push(k);
    });
    return out;
  }

  function renderCustomersSay(p) {
    if (!els.customersSaySection || !els.customersSayText) return;
    const summary = getAiGeneratedSummary(p);
    if (!summary) {
      els.customersSaySection.hidden = true;
      els.customersSayText.textContent = "";
      return;
    }
    els.customersSaySection.hidden = false;
    els.customersSayText.textContent = summary;
  }

  function getKeywordDetailsMap(p) {
    const raw = p ? (p["customer-review-keywords-details"] ?? p.customerReviewKeywordsDetails) : null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  }

  /** Returns string paragraphs for a keyword, or null if none. */
  function getDetailParagraphsForKeyword(p, keyword) {
    const map = getKeywordDetailsMap(p);
    const kw = String(keyword || "");
    if (!kw) return null;
    let arr = map[kw];
    if (arr == null) {
      const lower = kw.toLowerCase();
      const key = Object.keys(map).find((k) => String(k).toLowerCase() === lower);
      if (key != null) arr = map[key];
    }
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const paras = arr
      .map((s) => (s == null ? "" : String(s)).trim())
      .filter(Boolean);
    return paras.length ? paras : null;
  }

  function hideKeywordDetailBox() {
    if (!els.keywordDetailBox) return;
    els.keywordDetailBox.hidden = true;
    els.keywordDetailBox.innerHTML = "";
  }

  function showKeywordDetailBox(paragraphs) {
    if (!els.keywordDetailBox || !Array.isArray(paragraphs) || !paragraphs.length) return;
    els.keywordDetailBox.innerHTML = paragraphs
      .map((t) => `<p>${window.escapeHtml(t)}</p>`)
      .join("");
    els.keywordDetailBox.hidden = false;
  }

  function renderReviewKeywords(p) {
    if (!els.reviewKeywordsSection || !els.reviewKeywordsList) return;
    const keywords = getReviewKeywords(p);
    if (!keywords.length) {
      els.reviewKeywordsSection.hidden = true;
      els.reviewKeywordsList.innerHTML = "";
      hideKeywordDetailBox();
      openKeywordDetail = null;
      return;
    }
    els.reviewKeywordsSection.hidden = false;
    els.reviewKeywordsList.innerHTML = keywords
      .map((k) => {
        const isActive =
          openKeywordDetail && k.toLowerCase() === String(openKeywordDetail).toLowerCase();
        return `<button type="button" class="review-keyword-tag${isActive ? " is-active" : ""}" data-review-keyword="${window.escapeHtml(k)}" aria-pressed="${isActive ? "true" : "false"}">${window.escapeHtml(k)}</button>`;
      })
      .join("");
  }

  function getFeatureEntries(p) {
    if (!p || p.features == null || typeof p.features !== "object" || Array.isArray(p.features)) {
      return [];
    }
    return Object.entries(p.features).map(([k, v]) => [
      String(k),
      v == null ? "" : String(v),
    ]);
  }

  function renderFeatureRowHtml(key, val) {
    return `<div class="feature-row"><span class="feature-key">${window.escapeHtml(key)}</span><span class="feature-val">${window.escapeHtml(val)}</span></div>`;
  }

  function renderFeaturesBlock(p) {
    if (!els.productFeaturesBlock || !els.productFeaturesList) return;
    const entries = getFeatureEntries(p);
    if (entries.length === 0) {
      els.productFeaturesBlock.hidden = true;
      if (els.featuresToggleBtn) els.featuresToggleBtn.hidden = true;
      els.productFeaturesList.innerHTML = "";
      return;
    }

    els.productFeaturesBlock.hidden = false;
    const primary = entries.slice(0, FEATURE_PREVIEW_COUNT);
    const extra = entries.slice(FEATURE_PREVIEW_COUNT);
    const primaryHtml = primary.map(([k, v]) => renderFeatureRowHtml(k, v)).join("");

    if (extra.length === 0) {
      els.productFeaturesList.innerHTML = primaryHtml;
      if (els.featuresToggleBtn) {
        els.featuresToggleBtn.hidden = true;
      }
      return;
    }

    const extraHtml = extra.map(([k, v]) => renderFeatureRowHtml(k, v)).join("");
    const wrapClass = `product-features-extra-wrap${featuresExpanded ? " is-expanded" : ""}`;
    els.productFeaturesList.innerHTML = `${primaryHtml}<div class="${wrapClass}"><div class="product-features-extra-inner">${extraHtml}</div></div>`;

    if (els.featuresToggleBtn) {
      els.featuresToggleBtn.hidden = false;
      els.featuresToggleBtn.textContent = featuresExpanded ? "Show less" : "See more";
    }
  }

  function scheduleDescriptionToggleMeasure() {
    if (!els.productDescriptionText || !els.descriptionToggleBtn) return;
    const run = () => {
      if (descriptionExpanded) {
        els.descriptionToggleBtn.hidden = false;
        return;
      }
      const el = els.productDescriptionText;
      el.classList.add("product-description-text--clamped");
      const needsMore = el.scrollHeight > el.clientHeight + 2;
      els.descriptionToggleBtn.hidden = !needsMore;
      if (!needsMore) {
        el.classList.remove("product-description-text--clamped");
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function renderDescriptionBlock(p) {
    if (!els.productDescriptionBlock || !els.productDescriptionText) return;
    const desc =
      p && typeof p.description === "string" ? p.description.replace(/\r\n/g, "\n").trim() : "";
    if (!desc) {
      els.productDescriptionBlock.hidden = true;
      if (els.descriptionToggleBtn) els.descriptionToggleBtn.hidden = true;
      els.productDescriptionText.textContent = "";
      return;
    }

    els.productDescriptionBlock.hidden = false;
    els.productDescriptionText.textContent = desc;
    els.productDescriptionText.classList.toggle("product-description-text--clamped", !descriptionExpanded);
    if (els.descriptionToggleBtn) {
      els.descriptionToggleBtn.textContent = descriptionExpanded ? "Show less" : "See more";
      els.descriptionToggleBtn.hidden = true;
    }
    scheduleDescriptionToggleMeasure();
  }

  function renderBadges(product) {
    if (!els.productBadges) return;
    const arr = Array.isArray(product && product.badges) ? product.badges : [];
    let html = arr
      .slice(0, 6)
      .map((b) => {
        const raw = String(b || "");
        const norm = raw.toLowerCase().replace(/[^a-z]/g, "");
        const extraClass =
          norm === "bestseller"
            ? " badge-best-seller"
            : norm === "amazonschoice" || norm === "amazonchoice"
              ? " badge-amazon-choice"
              : "";
        return `<span class="badge${extraClass}">${window.escapeHtml(raw)}</span>`;
      })
      .join("");
    if (product && product.carbonFriendly) {
      html += `<span class="badge badge--carbon" title="Lower carbon footprint">🌱 Low Carbon</span>`;
    }
    els.productBadges.innerHTML = html;
  }

  function renderReviews(reviews) {
    if (!els.reviewsContainer) return;

    const list = Array.isArray(reviews) ? reviews : [];
    if (list.length === 0) {
      els.reviewsContainer.innerHTML = `<div class="empty-state">No reviews yet.</div>`;
      if (els.expandReviewsBtn) els.expandReviewsBtn.style.display = "none";
      return;
    }

    const visibleCount = reviewsExpanded ? list.length : Math.min(3, list.length);

    els.reviewsContainer.innerHTML = list
      .map((r, idx) => {
        const isVisible = idx < visibleCount;
        const className = isVisible ? "review" : "review review-hidden";
        const user =
          (r && (r.reviewer_name || r.user)) ? (r.reviewer_name || r.user) : "Customer";
        const rating = r
          ? Number(r.review_rating != null ? r.review_rating : r.rating != null ? r.rating : 0)
          : 0;

        const headline = r ? (r.review_headline || "") : "";
        const body = r ? (r.review_body || r.comment || "") : "";
        const comment = headline && body ? `${headline} ${body}` : headline || body || "";

        const dateVal = r ? (r.review_date || r.date || "") : "";
        const dateHtml = dateVal ? `<div class="review-date">${window.escapeHtml(String(dateVal))}</div>` : "";

        return `
          <div class="${className}">
            <div class="review-head">
              <div class="review-user">${window.escapeHtml(user)}</div>
              <div class="review-stars">${window.renderStars(rating)}</div>
            </div>
            <div class="review-comment">${window.escapeHtml(comment)}</div>
            ${dateHtml}
          </div>
        `;
      })
      .join("");

    if (els.expandReviewsBtn) {
      if (!reviewsExpanded && list.length > 3) {
        els.expandReviewsBtn.style.display = "";
        els.expandReviewsBtn.textContent = "Click for more";
      } else {
        els.expandReviewsBtn.style.display = "none";
      }
    }
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // Simulate rating breakdown ONLY from `rating` + `rating_count` (not from reviews array).
  // Requirements:
  // - 4 & 5 dominate (about 70–80% combined)
  // - 1 star least (~5–10%)
  // - 2 & 3 smaller (~10–20% combined)
  // - sum(counts[1..5]) === rating_count
  function simulateRatingCounts(rating, ratingCount) {
    const N = Math.max(0, Math.floor(Number(ratingCount) || 0));
    const avg = clamp(Number(rating) || 0, 0, 5);
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (N <= 0) {
      return { counts, total: 0, average: avg };
    }
    if (!(avg > 0)) {
      return { counts, total: N, average: avg };
    }

    const a = clamp(avg, 1, 5);
    const t = clamp((a - 3) / 2, 0, 1); // 3 => 0, 5 => 1

    const p1 = 0.10 - 0.05 * t; // 0.10..0.05
    const p23 = 0.20 - 0.05 * t; // 0.20..0.15
    const c1 = clamp(Math.round(p1 * N), 0, N);

    const remainingAfter1 = N - c1;
    const c23 = clamp(Math.round(p23 * N), 0, remainingAfter1);

    // Split (2,3) inside (2+3)
    const within23For3 = 0.35 + 0.25 * t; // 0.35..0.60
    const c3 = clamp(Math.round(c23 * within23For3), 0, c23);
    const c2 = c23 - c3;

    const c45 = N - c1 - c2 - c3; // remaining

    // Solve c5 so that the weighted sum is close to rating * N.
    // With c4 = c45 - c5, sumWeighted = base + c5, where:
    const base = 1 * c1 + 2 * c2 + 3 * c3 + 4 * c45;
    const targetSum = a * N;
    let c5 = Math.round(targetSum - base);
    c5 = clamp(c5, 0, c45);
    const c4 = c45 - c5;

    counts[1] = c1;
    counts[2] = c2;
    counts[3] = c3;
    counts[4] = c4;
    counts[5] = c5;

    // Final safety: enforce sum === N by adjusting 5-star only.
    const sum = counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
    if (sum !== N) counts[5] = Math.max(0, counts[5] + (N - sum));

    return { counts, total: N, average: a };
  }

  function renderRatingBlock(p) {
    const avg = Number(p.rating) || 0;
    const ratingCountRaw = Number(p.rating_count);
    const ratingCount = Number.isFinite(ratingCountRaw) ? Math.floor(ratingCountRaw) : getTopReviews(p).length;

    const bd = simulateRatingCounts(avg, ratingCount);
    const stars = window.renderStars ? window.renderStars(avg) : "";

    const countLabel =
      ratingCount > 0 && window.formatRatingCount
        ? window.formatRatingCount(ratingCount)
        : `${ratingCount} ratings`;

    if (els.productRating) {
      els.productRating.innerHTML = `${stars} <span class="rating-number">${Number(avg).toFixed(1)}</span> <span class="rating-count-label">(${countLabel})</span>`;
    }

    const breakdownEl = document.getElementById("ratingBreakdown");
    if (breakdownEl) {
      if (!bd.total) {
        breakdownEl.innerHTML = "";
        breakdownEl.hidden = true;
      } else {
        breakdownEl.hidden = false;
        const total = Math.max(1, bd.total || 0);
        breakdownEl.innerHTML = `
          <div class="rating-breakdown__bars" role="list">
            ${[5, 4, 3, 2, 1]
              .map((star) => {
                const c = bd.counts[star] || 0;
                const pct = Math.round((c / total) * 100);
                const barW = pct;
                return `
              <div class="rating-breakdown__row" role="listitem">
                <span class="rating-breakdown__star-label">${star} star</span>
                <div class="rating-breakdown__bar-wrap" aria-hidden="true">
                  <div class="rating-breakdown__bar" style="width:${barW}%"></div>
                </div>
                <span class="rating-breakdown__count">${pct}%</span>
              </div>`;
              })
              .join("")}
          </div>
        `;
      }
    }
  }

  function renderProduct(p) {
    if (!p) return;
    product = p;
    featuresExpanded = false;
    descriptionExpanded = false;
    openKeywordDetail = null;
    hideKeywordDetailBox();

    const imageUrl =
      resolveImageSrc(p.image) ||
      `https://via.placeholder.com/400x400.png?text=${encodeURIComponent(p.name)}`;
    if (els.productImage) els.productImage.src = imageUrl;
    if (els.productImage) els.productImage.alt = p.name;

    setText(els.productName, p.name || "");
    setText(els.productCategory, p.category || "");
    const priceNum = parsePriceToNumber(p.price);
    setText(
      els.productPrice,
      window.formatCurrency
        ? window.formatCurrency(priceNum)
        : Number.isFinite(priceNum)
          ? `$${priceNum.toFixed(2)}`
          : ""
    );

    renderRatingBlock(p);

    renderFeaturesBlock(p);
    renderDescriptionBlock(p);
    renderCustomersSay(p);
    renderReviewKeywords(p);

    renderBadges(p);
    renderReviews(getTopReviews(p));
  }

  async function init() {
    const productId = window.getQueryParam ? window.getQueryParam("id") : null;
    if (!productId) {
      const nameEl = els.productName;
      if (nameEl) nameEl.textContent = "Missing product id.";
      return;
    }

    const container = els.productName ? els.productName.closest(".product-page") : null;
    if (container) {
      container.style.opacity = "0.6";
    }

    let products = [];
    try {
      products = await window.loadProducts();
    } catch (e) {
      console.error("Failed to load products:", e);
      const protocol = window.location && window.location.protocol ? window.location.protocol : "";
      const hint =
        protocol === "file:"
          ? "products.json could not be loaded from file://. Start the experiment server (e.g., `python backend/server.py`) and open http://127.0.0.1:8000/product.html?id=... ."
          : "products.json could not be loaded. Check that data/products.json is reachable.";
      if (els.productName) {
        els.productName.textContent = "Product failed to load.";
      }
      if (els.productCategory) els.productCategory.textContent = hint;
      return;
    } finally {
      if (container) container.style.opacity = "";
    }
    product = products.find((x) => String(x.id) === String(productId)) || null;
    if (!product) {
      if (els.productName) els.productName.textContent = "Product not found.";
      return;
    }

    window.trackEvent("view_product", { productId: String(productId) });
    renderProduct(product);

    if (els.reviewKeywordsList) {
      els.reviewKeywordsList.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button[data-review-keyword]") : null;
        if (!btn || !product) return;
        const kw = btn.getAttribute("data-review-keyword") || "";
        if (!kw) return;

        window.trackEvent("click_review_keyword", {
          productId: String(productId),
          keyword: kw,
        });

        const isSame =
          openKeywordDetail && String(openKeywordDetail).toLowerCase() === String(kw).toLowerCase();
        if (isSame) {
          openKeywordDetail = null;
          hideKeywordDetailBox();
          renderReviewKeywords(product);
          return;
        }

        const paras = getDetailParagraphsForKeyword(product, kw);
        if (!paras) {
          return;
        }

        openKeywordDetail = kw;
        showKeywordDetailBox(paras);
        renderReviewKeywords(product);
      });
    }

    // Scroll depth tracking (10% buckets, max-only).
    (function attachScrollDepthTrackingForProduct() {
      let maxDepth = 0;
      let ticking = false;

      function computeDepth() {
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop || 0;
        const docHeight = Math.max(doc.scrollHeight || 0, doc.offsetHeight || 0);
        const winHeight = window.innerHeight || doc.clientHeight || 0;
        const denom = Math.max(1, docHeight - winHeight);
        const pct = Math.round((scrollTop / denom) * 100);
        const bucket = Math.max(0, Math.min(100, Math.floor(pct / 10) * 10));
        if (bucket > maxDepth) {
          maxDepth = bucket;
          window.trackEvent("scroll_depth", {
            depth: maxDepth,
            pageType: "product",
            productId: String(productId),
          });
        }
      }

      window.addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            computeDepth();
          });
        },
        { passive: true }
      );

      computeDepth();
    })();

    // Navbar search (redirects to index and filters there).
    const searchForm = document.getElementById("searchForm");
    const searchInput = document.getElementById("searchInput");
    if (searchForm && searchInput) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = String(searchInput.value || "").trim();
        window.trackEvent("search", { query: q });
        const url = new URL("index.html", window.location.href);
        if (q) url.searchParams.set("q", q);
        window.location.href = url.toString();
      });
    }

    if (els.expandReviewsBtn) {
      els.expandReviewsBtn.addEventListener("click", () => {
        if (reviewsExpanded) return;
        reviewsExpanded = true;
        window.trackEvent("expand_reviews", { productId: String(productId) });
        renderReviews(getTopReviews(product));
      });
    }

    if (els.featuresToggleBtn) {
      els.featuresToggleBtn.addEventListener("click", () => {
        if (!product || !product.id) return;
        const pid = String(product.id);
        if (!featuresExpanded) {
          featuresExpanded = true;
          window.trackEvent("expand_features", { productId: pid });
        } else {
          featuresExpanded = false;
          window.trackEvent("collapse_features", { productId: pid });
        }
        renderFeaturesBlock(product);
      });
    }

    if (els.descriptionToggleBtn) {
      els.descriptionToggleBtn.addEventListener("click", () => {
        if (!product || !product.id || !els.productDescriptionText) return;
        const pid = String(product.id);
        if (!descriptionExpanded) {
          descriptionExpanded = true;
          els.productDescriptionText.classList.remove("product-description-text--clamped");
          els.descriptionToggleBtn.textContent = "Show less";
          els.descriptionToggleBtn.hidden = false;
          window.trackEvent("expand_description", { productId: pid });
        } else {
          descriptionExpanded = false;
          els.productDescriptionText.classList.add("product-description-text--clamped");
          els.descriptionToggleBtn.textContent = "See more";
          window.trackEvent("collapse_description", { productId: pid });
          scheduleDescriptionToggleMeasure();
        }
      });
    }

    if (els.addToCartBtn) {
      els.addToCartBtn.addEventListener("click", () => {
        window.addToCart(productId, 1);
        window.trackEvent("add_to_cart", { productId: String(productId), quantity: 1 });

        if (els.addToCartStatus) {
          els.addToCartStatus.textContent = "Added to cart.";
          setTimeout(() => {
            els.addToCartStatus.textContent = "";
          }, 1500);
        }
      });
    }

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
