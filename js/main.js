// Home page logic: search + sort + category + advanced filters + product list.

(function () {
  const CAT_SLUG_TO_VALUE = {
    usb: "USB flash drive",
    hdd: "hard drive",
    power: "power bank",
  };

  const CAT_VALUE_TO_SLUG = {
    "usb flash drive": "usb",
    "hard drive": "hdd",
    "power bank": "power",
  };

  const PRICE_RANGE_TRACK = {
    under25: "Under $25",
    "25_50": "$25 - $50",
    "50_100": "$50 - $100",
    over100: "Over $100",
  };

  function trackingCategoryName(slug) {
    if (slug === "usb") return "USB";
    if (slug === "hdd") return "Hard Drive";
    if (slug === "power") return "Power Bank";
    return "All";
  }

  const els = {
    searchForm: document.getElementById("searchForm"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    productGrid: document.getElementById("productGrid"),
    resultsCount: document.getElementById("resultsCount"),
    categoryFilterList: document.getElementById("categoryFilterList"),
    filterFreeShipping: document.getElementById("filterFreeShipping"),
    filterFastDelivery: document.getElementById("filterFastDelivery"),
    navGoToCartBtn: document.getElementById("navGoToCartBtn"),
    brandFilterList: document.getElementById("brandFilterList"),
    sidebarBannerAd: document.getElementById("sidebarBannerAd"),
    paginationNav: document.getElementById("paginationNav"),
  };

  let products = [];
  let currentQuery = "";
  let currentCategoryValue = null;

  let filterFreeShipping = false;
  let filterFastDelivery = false;
  /** `null` = any; otherwise 3, 4, or 4.5 */
  let filterMinRating = null;
  /** `null` = any */
  let filterPriceRange = null;
  const selectedBrands = new Set();

  const itemsPerPage = 20;
  let currentPage = 1;

  // Brand filter: only allow these brands; everything else -> "Other".
  const ALLOWED_BRANDS = [
    "Anker",
    "Avolusion",
    "INIU",
    "LaCie",
    "Lexar",
    "Samsung",
    "SanDisk",
    "Seagate",
    "UGREEN",
  ];

  function normalizeBrandToken(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  const ALLOWED_BRAND_CANON_BY_NORM = ALLOWED_BRANDS.reduce((acc, b) => {
    acc[normalizeBrandToken(b)] = b;
    return acc;
  }, {});

  function getSortOption() {
    return els.sortSelect ? els.sortSelect.value : "popularity_desc";
  }

  function normalize(str) {
    return String(str || "").toLowerCase();
  }

  function parsePriceToNumber(price) {
    // New `products.json` format uses `price: "$16.99"`
    if (typeof price === "number") return price;
    if (price == null) return NaN;
    const cleaned = String(price).replace(/[$,\s]/g, "");
    return Number(cleaned);
  }

  function resolveImageSrc(image) {
    if (!image) return "";
    const s = String(image);
    if (s.startsWith("http://") || s.startsWith("https://")) return s;

    // Many datasets use "../images/xxx.jpg". Convert to "images/xxx.jpg"
    const idx = s.lastIndexOf("images/");
    if (idx !== -1) return s.slice(idx);

    if (s.startsWith("/")) return s.slice(1);
    return s;
  }

  function getProductShortDescriptionFromDescription(product) {
    const desc = product && typeof product.description === "string" ? product.description : "";
    const oneLine = desc.replace(/\s+/g, " ").trim();
    if (!oneLine) return "";
    const maxLen = 140;
    return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen - 1)}…` : oneLine;
  }

  function inferBrandFromName(name) {
    const raw = String(name || "").trim();
    if (!raw) return "Other";

    // Whole-string includes check (handles e.g. "SanDisk", "LaCie", "UGREEN")
    const normWhole = normalizeBrandToken(raw);
    for (const normBrand of Object.keys(ALLOWED_BRAND_CANON_BY_NORM)) {
      if (normWhole.includes(normBrand)) return ALLOWED_BRAND_CANON_BY_NORM[normBrand];
    }

    // Token fallback (handles punctuation and edge cases)
    const tokens = raw.split(/\s+/);
    for (const t of tokens.slice(0, 12)) {
      const normTok = normalizeBrandToken(t);
      if (ALLOWED_BRAND_CANON_BY_NORM[normTok]) return ALLOWED_BRAND_CANON_BY_NORM[normTok];
    }

    return "Other";
  }

  function renderBrandFilters(brandNames) {
    if (!els.brandFilterList) return;
    const list = Array.isArray(brandNames) ? brandNames : [];
    els.brandFilterList.innerHTML = list
      .map((brand) => {
        const safe = window.escapeHtml(brand);
        const checked = selectedBrands.has(brand) ? "checked" : "";
        return `
          <label class="filter-option filter-option--check">
            <input type="checkbox" class="brand-filter-checkbox" value="${safe}" ${checked} />
            <span>${safe}</span>
          </label>
        `;
      })
      .join("");
  }

  function renderSidebarBannerAd(product) {
    if (!els.sidebarBannerAd) return;
    if (!product) {
      els.sidebarBannerAd.innerHTML = "";
      return;
    }
    const img =
      resolveImageSrc(product.image) ||
      `https://via.placeholder.com/120x120.png?text=${encodeURIComponent(product.name)}`;
    const priceNum = parsePriceToNumber(product.price);
    const priceText = window.formatCurrency ? window.formatCurrency(priceNum) : String(product.price || "");
    const rating = Number(product.rating) || 0;
    const ratingStars = window.renderStars ? window.renderStars(rating) : "";
    const ratingCountRaw = Number(product.rating_count);
    const ratingCount = Number.isFinite(ratingCountRaw) ? Math.floor(ratingCountRaw) : 0;
    const ratingCountText = ratingCount > 0 ? (window.formatRatingCount ? window.formatRatingCount(ratingCount) : `${ratingCount} ratings`) : "";

    els.sidebarBannerAd.innerHTML = `
      <div class="sidebar-banner-ad__label">Ad</div>
      <a class="sidebar-banner-ad__card" href="product.html?id=${encodeURIComponent(product.id)}">
        <img class="sidebar-banner-ad__img" src="${img}" alt="${window.escapeHtml(product.name)}" loading="lazy" />
        <div class="sidebar-banner-ad__meta">
          <p class="sidebar-banner-ad__name">${window.escapeHtml(product.name)}</p>
          <p class="sidebar-banner-ad__price">${window.escapeHtml(priceText)}</p>
          <div class="sidebar-banner-ad__rating">
            ${ratingStars}
            <span>${Number(rating).toFixed(1)}</span>
            <span>${window.escapeHtml(ratingCountText)}</span>
          </div>
        </div>
      </a>
    `;
  }

  function matchesQuery(product, query) {
    if (!query) return true;
    const q = normalize(query);
    const badges = Array.isArray(product.badges) ? product.badges.join(" ") : "";
    const haystack = [product.name, product.category, badges].join(" ");
    return normalize(haystack).includes(q);
  }

  function matchesCategory(product) {
    if (currentCategoryValue == null) return true;
    return normalize(product.category) === normalize(currentCategoryValue);
  }

  function matchesFreeShipping(p) {
    if (!filterFreeShipping) return true;
    return p.freeShipping === true;
  }

  function matchesFastDelivery(p) {
    if (!filterFastDelivery) return true;
    return p.fastDelivery === true;
  }

  function matchesMinRating(p) {
    if (filterMinRating == null) return true;
    return Number(p.rating) >= filterMinRating;
  }

  function matchesPriceRange(p) {
    if (filterPriceRange == null) return true;
    const price = parsePriceToNumber(p.price);
    if (!Number.isFinite(price)) return false;
    switch (filterPriceRange) {
      case "under25":
        return price < 25;
      case "25_50":
        return price >= 25 && price < 50;
      case "50_100":
        return price >= 50 && price <= 100;
      case "over100":
        return price > 100;
      default:
        return true;
    }
  }

  function matchesBrand(p) {
    if (!selectedBrands.size) return true;
    const b = inferBrandFromName(p && p.name);
    return selectedBrands.has(b);
  }

  function matchesAllFilters(p) {
    return (
      matchesQuery(p, currentQuery) &&
      matchesCategory(p) &&
      matchesFreeShipping(p) &&
      matchesFastDelivery(p) &&
      matchesMinRating(p) &&
      matchesPriceRange(p) &&
      matchesBrand(p)
    );
  }

  function applySort(list, sortOption) {
    const arr = [...list];
    switch (sortOption) {
      case "price_asc":
        arr.sort((a, b) => {
          const an = parsePriceToNumber(a.price);
          const bn = parsePriceToNumber(b.price);
          return (Number.isFinite(an) ? an : 0) - (Number.isFinite(bn) ? bn : 0);
        });
        break;
      case "rating_desc":
        arr.sort((a, b) => Number(b.rating) - Number(a.rating));
        break;
      case "popularity_desc":
      default:
        arr.sort((a, b) => Number(b.popularity) - Number(a.popularity));
        break;
    }
    return arr;
  }

  function syncCategoryButtons() {
    if (!els.categoryFilterList) return;
    const slug =
      currentCategoryValue == null ? "" : CAT_VALUE_TO_SLUG[normalize(currentCategoryValue)] || "";
    els.categoryFilterList.querySelectorAll(".category-filter-btn").forEach((btn) => {
      const bSlug = btn.getAttribute("data-category-slug") || "";
      btn.classList.toggle("is-active", bSlug === slug);
    });
  }

  function syncFilterControlsFromState() {
    if (els.filterFreeShipping) els.filterFreeShipping.checked = filterFreeShipping;
    if (els.filterFastDelivery) els.filterFastDelivery.checked = filterFastDelivery;

    const ratingVal =
      filterMinRating == null ? "" : filterMinRating === 4.5 ? "4.5" : String(filterMinRating);
    const rInput = document.querySelector(`input[name="filterRating"][value="${ratingVal}"]`);
    if (rInput) {
      rInput.checked = true;
    } else {
      const anyR = document.querySelector('input[name="filterRating"][value=""]');
      if (anyR) anyR.checked = true;
    }

    const pVal = filterPriceRange || "";
    const pInput = document.querySelector(`input[name="filterPrice"][value="${pVal}"]`);
    if (pInput) {
      pInput.checked = true;
    } else {
      const anyP = document.querySelector('input[name="filterPrice"][value=""]');
      if (anyP) anyP.checked = true;
    }
  }

  function replaceUrlState() {
    try {
      const url = new URL(window.location.href);
      if (currentQuery) url.searchParams.set("q", currentQuery);
      else url.searchParams.delete("q");
      url.searchParams.set("sort", getSortOption());
      const slug =
        currentCategoryValue == null ? "" : CAT_VALUE_TO_SLUG[normalize(currentCategoryValue)] || "";
      if (slug) url.searchParams.set("cat", slug);
      else url.searchParams.delete("cat");

      if (filterFreeShipping) url.searchParams.set("fs", "1");
      else url.searchParams.delete("fs");
      if (filterFastDelivery) url.searchParams.set("fd", "1");
      else url.searchParams.delete("fd");

      if (filterMinRating != null) url.searchParams.set("minr", String(filterMinRating));
      else url.searchParams.delete("minr");

      if (filterPriceRange) url.searchParams.set("pr", filterPriceRange);
      else url.searchParams.delete("pr");

      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }

  function readFiltersFromUrl(params) {
    filterFreeShipping = params.get("fs") === "1";
    filterFastDelivery = params.get("fd") === "1";
    const minr = params.get("minr");
    if (minr === "3" || minr === "4") filterMinRating = Number(minr);
    else if (minr === "4.5") filterMinRating = 4.5;
    else filterMinRating = null;
    const pr = params.get("pr");
    if (pr && ["under25", "25_50", "50_100", "over100"].includes(pr)) filterPriceRange = pr;
    else filterPriceRange = null;
  }

  function renderProducts(list) {
    if (!els.productGrid) return;
    const cards = list
      .map((p) => {
        const priceNum = parsePriceToNumber(p.price);
        const priceText =
          window.formatCurrency
            ? window.formatCurrency(priceNum)
            : Number.isFinite(priceNum)
              ? `$${priceNum.toFixed(2)}`
              : "";
        const badges = Array.isArray(p.badges) ? p.badges : [];
        const badgeHtml =
          badges.length > 0
            ? badges.slice(0, 4).map((b) => `<span class="badge">${window.escapeHtml(b)}</span>`).join("")
            : "";
        const carbonBadge = p.carbonFriendly
          ? '<span class="badge badge--carbon" title="Lower carbon footprint">🌱 Low Carbon</span>'
          : "";

        const imageUrl =
          resolveImageSrc(p.image) ||
          `https://via.placeholder.com/300x300.png?text=${encodeURIComponent(p.name)}`;
        const shortDesc = getProductShortDescriptionFromDescription(p);

        const avgDisplay = Number(p.rating) || 0;
        const ratingCountRaw = Number(p.rating_count);
        const reviewTotal = Number.isFinite(ratingCountRaw) ? Math.floor(ratingCountRaw) : 0;
        const ratingStars = window.renderStars ? window.renderStars(avgDisplay) : "";
        const ratingNum = Number(avgDisplay).toFixed(1);
        const ratingsPhrase =
          reviewTotal > 0
            ? window.formatRatingCount
              ? ` (${window.formatRatingCount(reviewTotal)})`
              : ` (${reviewTotal} ratings)`
            : "";

        return `
          <article class="product-row" data-product-id="${window.escapeHtml(p.id)}" data-carbon-friendly="${p.carbonFriendly ? "1" : "0"}">
            <a class="product-row__media" href="product.html?id=${encodeURIComponent(p.id)}" aria-label="View details for ${window.escapeHtml(p.name)}">
              <img class="product-row__image" src="${imageUrl}" alt="${window.escapeHtml(p.name)}" loading="lazy" />
            </a>
            <div class="product-row__body">
              <a class="product-row__title" href="product.html?id=${encodeURIComponent(p.id)}">${window.escapeHtml(p.name)}</a>
              <div class="product-row__rating-line">
                ${ratingStars}
                <span class="product-row__rating-num">${ratingNum}</span>
                <span class="product-row__rating-count">${ratingsPhrase}</span>
              </div>
              <div class="product-row__badges">${badgeHtml}${carbonBadge}</div>
              <div class="product-row__price">${priceText}</div>
              <p class="product-row__desc">${window.escapeHtml(shortDesc)}</p>
              <div class="product-row__add">
                <button type="button" class="primary-btn list-add-to-cart-btn" data-product-id="${window.escapeHtml(p.id)}">
                  Add to Cart
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    els.productGrid.innerHTML = cards;

    els.productGrid.querySelectorAll(".product-row__media, .product-row__title").forEach((a) => {
      a.addEventListener("click", () => {
        const href = a.getAttribute("href") || "";
        const id = new URLSearchParams(href.split("?")[1] || "").get("id");
        if (id) window.trackEvent("click_product", { productId: id });
      });
    });

    els.productGrid.querySelectorAll(".list-add-to-cart-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute("data-product-id");
        if (!id) return;
        window.addToCart(id, 1);
        window.trackEvent("add_to_cart", { productId: String(id) });
      });
    });
  }

  function buildPaginationPageNumbers(totalPages, page) {
    if (totalPages <= 12) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const set = new Set([1, totalPages]);
    for (let d = -2; d <= 2; d++) {
      const n = page + d;
      if (n >= 1 && n <= totalPages) set.add(n);
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  function renderPaginationControls(totalPages) {
    if (!els.paginationNav) return;
    if (totalPages <= 0) {
      els.paginationNav.hidden = true;
      els.paginationNav.innerHTML = "";
      return;
    }
    els.paginationNav.hidden = false;
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;
    const nums = buildPaginationPageNumbers(totalPages, currentPage);
    const parts = [];
    let prevNum = 0;
    nums.forEach((n) => {
      if (prevNum && n - prevNum > 1) {
        parts.push('<span class="pagination-ellipsis" aria-hidden="true">…</span>');
      }
      const isCurrent = n === currentPage;
      parts.push(
        `<button type="button" class="pagination-btn pagination-page${isCurrent ? " is-current" : ""}" data-pagination-page="${n}" aria-label="Page ${n}"${isCurrent ? ' aria-current="page"' : ""}>${n}</button>`
      );
      prevNum = n;
    });
    els.paginationNav.innerHTML = `
      <button type="button" class="pagination-btn" data-pagination-action="prev" aria-label="Previous page"${prevDisabled ? " disabled" : ""}>Previous</button>
      <div class="pagination-pages">${parts.join("")}</div>
      <button type="button" class="pagination-btn" data-pagination-action="next" aria-label="Next page"${nextDisabled ? " disabled" : ""}>Next</button>
    `;
  }

  function attachPaginationHandlersOnce() {
    if (!els.paginationNav || els.paginationNav.dataset.handlersBound === "1") return;
    els.paginationNav.dataset.handlersBound = "1";
    els.paginationNav.addEventListener("click", (e) => {
      const filtered = products.filter((p) => matchesAllFilters(p));
      const sorted = applySort(filtered, getSortOption());
      const totalPages =
        sorted.length === 0 ? 0 : Math.ceil(sorted.length / itemsPerPage);
      if (totalPages <= 0) return;

      const prevBtn = e.target.closest('button[data-pagination-action="prev"]');
      const nextBtn = e.target.closest('button[data-pagination-action="next"]');
      const pageBtn = e.target.closest("button[data-pagination-page]");

      if (prevBtn && !prevBtn.disabled && currentPage > 1) {
        currentPage -= 1;
        window.trackEvent("page_change", { page: currentPage });
        render();
        return;
      }
      if (nextBtn && !nextBtn.disabled && currentPage < totalPages) {
        currentPage += 1;
        window.trackEvent("page_change", { page: currentPage });
        render();
        return;
      }
      if (pageBtn && !pageBtn.disabled) {
        const p = Number(pageBtn.getAttribute("data-pagination-page"), 10);
        if (!Number.isFinite(p) || p < 1 || p > totalPages || p === currentPage) return;
        currentPage = p;
        window.trackEvent("page_change", { page: currentPage });
        render();
      }
    });
  }

  function render() {
    const filtered = products.filter((p) => matchesAllFilters(p));
    const sorted = applySort(filtered, getSortOption());
    if (els.resultsCount) els.resultsCount.textContent = `${sorted.length} results`;
    syncCategoryButtons();
    syncFilterControlsFromState();

    const totalPages =
      sorted.length === 0 ? 0 : Math.ceil(sorted.length / itemsPerPage);
    if (totalPages > 0 && currentPage > totalPages) {
      currentPage = totalPages;
    }
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const pageSlice = sorted.slice(start, start + itemsPerPage);
    renderProducts(pageSlice);
    renderPaginationControls(totalPages);
  }

  async function init() {
    if (!els.searchForm || !els.productGrid) return;

    attachPaginationHandlersOnce();

    els.productGrid.textContent = "Loading products...";

    try {
      products = await window.loadProducts();
    } catch (e) {
      console.error("Failed to load products:", e);
      const protocol = window.location && window.location.protocol ? window.location.protocol : "";
      const hint =
        protocol === "file:"
          ? "Products failed to load. If you opened index.html directly (file://), browsers block loading local JSON. Start the experiment server (e.g., `python backend/server.py`) and open http://127.0.0.1:8000/index.html."
          : "Products failed to load. Check that data/products.json is reachable from this page.";
      els.productGrid.innerHTML = `<div class="empty-state">${window.escapeHtml(hint)}</div>`;
      return;
    }

    // Brand filter options (unique brands from all loaded products).
    const brandSet = new Set();
    products.forEach((p) => brandSet.add(inferBrandFromName(p && p.name)));
    const hasOther = brandSet.has("Other");
    const brands = ALLOWED_BRANDS.filter((b) => brandSet.has(b));
    if (hasOther) brands.push("Other");

    // Drop selections that are no longer valid under the refined brand list.
    Array.from(selectedBrands).forEach((b) => {
      if (!brands.includes(b)) selectedBrands.delete(b);
    });

    renderBrandFilters(brands);

    // Sidebar sponsored banner ad: pick one random product for this page load.
    if (products.length) {
      const idx = Math.floor(Math.random() * products.length);
      renderSidebarBannerAd(products[idx]);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      const sort = params.get("sort");
      const cat = params.get("cat");
      currentQuery = q ? String(q) : "";
      if (els.sortSelect && sort) {
        els.sortSelect.value = sort;
      }
      if (els.searchInput) {
        els.searchInput.value = currentQuery;
      }
      if (cat && CAT_SLUG_TO_VALUE[cat]) {
        currentCategoryValue = CAT_SLUG_TO_VALUE[cat];
      } else {
        currentCategoryValue = null;
      }
      readFiltersFromUrl(params);
    } catch {
      // ignore
    }

    if (els.brandFilterList) {
      els.brandFilterList.addEventListener("change", (e) => {
        const input = e.target && e.target.matches ? (e.target.matches(".brand-filter-checkbox") ? e.target : null) : null;
        if (!input) return;
        const brand = input.value;
        if (input.checked) selectedBrands.add(brand);
        else selectedBrands.delete(brand);
        window.trackEvent("filter_brand", { brands: Array.from(selectedBrands) });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    }

    if (els.navGoToCartBtn) {
      els.navGoToCartBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.trackEvent("go_to_cart", {});
        window.location.href = els.navGoToCartBtn.getAttribute("href") || "cart.html";
      });
    }

    if (els.sortSelect) {
      els.sortSelect.addEventListener("change", () => {
        const sortOption = getSortOption();
        window.trackEvent("sort", { sortOption });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    }

    if (els.categoryFilterList) {
      els.categoryFilterList.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".category-filter-btn") : null;
        if (!btn) return;
        const slug = btn.getAttribute("data-category-slug") || "";
        const nextVal = slug && CAT_SLUG_TO_VALUE[slug] ? CAT_SLUG_TO_VALUE[slug] : null;
        if (
          (currentCategoryValue == null && nextVal == null) ||
          (currentCategoryValue != null && normalize(currentCategoryValue) === normalize(nextVal || ""))
        ) {
          return;
        }
        currentCategoryValue = nextVal;
        if (slug) {
          window.trackEvent("category_filter", { category: trackingCategoryName(slug) });
        }
        currentPage = 1;
        replaceUrlState();
        render();
      });
    }

    if (els.filterFreeShipping) {
      els.filterFreeShipping.addEventListener("change", () => {
        filterFreeShipping = els.filterFreeShipping.checked;
        window.trackEvent("filter_free_shipping", { enabled: filterFreeShipping });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    }

    if (els.filterFastDelivery) {
      els.filterFastDelivery.addEventListener("change", () => {
        filterFastDelivery = els.filterFastDelivery.checked;
        window.trackEvent("filter_delivery", { enabled: filterFastDelivery });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    }

    document.querySelectorAll('input[name="filterRating"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        const v = input.value;
        if (!v) filterMinRating = null;
        else if (v === "4.5") filterMinRating = 4.5;
        else filterMinRating = Number(v);
        window.trackEvent("filter_rating", { threshold: filterMinRating == null ? "any" : filterMinRating });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    });

    document.querySelectorAll('input[name="filterPrice"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked) return;
        const v = input.value;
        filterPriceRange = v || null;
        const rangeLabel = filterPriceRange ? PRICE_RANGE_TRACK[filterPriceRange] || filterPriceRange : "any";
        window.trackEvent("filter_price", { range: rangeLabel });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    });

    if (els.searchForm) {
      els.searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        currentQuery = els.searchInput ? String(els.searchInput.value || "") : "";
        window.trackEvent("search", { query: currentQuery });
        currentPage = 1;
        replaceUrlState();
        render();
      });
    }

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
