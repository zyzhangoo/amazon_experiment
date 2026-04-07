// Cart page logic.

(function () {
  const els = {
    cartItems: document.getElementById("cartItems"),
    cartTotal: document.getElementById("cartTotal"),
    cartSummary: document.getElementById("cartSummary"),
    checkoutBtn: document.getElementById("checkoutBtn"),
  };

  let products = [];

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
    const idx = s.lastIndexOf("images/");
    if (idx !== -1) return s.slice(idx);
    if (s.startsWith("/")) return s.slice(1);
    return s;
  }

  function getCartItems(cartObj) {
    const entries = Object.entries(cartObj || {});
    const items = [];
    for (const [productId, qty] of entries) {
      const product = products.find((p) => String(p.id) === String(productId));
      if (!product) continue;
      const quantity = Math.max(0, Number(qty || 0));
      if (quantity <= 0) continue;
      items.push({ product, quantity });
    }
    return items;
  }

  function computeTotals(cartItems) {
    let totalPrice = 0;
    let totalQty = 0;
    for (const item of cartItems) {
      totalQty += item.quantity;
      const unit = parsePriceToNumber(item.product.price);
      totalPrice += (Number.isFinite(unit) ? unit : 0) * item.quantity;
    }
    return { totalPrice, totalQty };
  }

  function renderCart() {
    if (!els.cartItems) return;

    const cartObj = window.loadCart();
    const cartItems = getCartItems(cartObj);
    const { totalPrice, totalQty } = computeTotals(cartItems);

    els.cartItems.innerHTML = cartItems.length
      ? cartItems
          .map((item) => {
            const img =
              resolveImageSrc(item.product.image) ||
              `https://via.placeholder.com/120x120.png?text=${encodeURIComponent(item.product.name)}`;
            const unit = parsePriceToNumber(item.product.price);
            const unitSafe = Number.isFinite(unit) ? unit : 0;
            const subtotal = unitSafe * item.quantity;

            return `
              <div class="cart-item" data-product-id="${window.escapeHtml(item.product.id)}">
                <div class="cart-item-media">
                  <img class="cart-item-image" src="${img}" alt="${window.escapeHtml(item.product.name)}" loading="lazy" />
                </div>
                <div class="cart-item-info">
                  <div class="cart-item-name">${window.escapeHtml(item.product.name)}</div>
                  <div class="cart-item-unit">Unit: ${window.formatCurrency(unitSafe)}</div>
                </div>
                <div class="cart-item-qty">
                  <button class="qty-btn" type="button" data-action="decrease" data-product-id="${window.escapeHtml(item.product.id)}" aria-label="Decrease quantity">-</button>
                  <input class="qty-input" type="number" min="0" step="1" value="${item.quantity}" data-quantity-input data-product-id="${window.escapeHtml(item.product.id)}" aria-label="Quantity" />
                  <button class="qty-btn" type="button" data-action="increase" data-product-id="${window.escapeHtml(item.product.id)}" aria-label="Increase quantity">+</button>
                </div>
                <div class="cart-item-subtotal">${window.formatCurrency(subtotal)}</div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty-state">Your cart is empty.</div>`;

    if (els.cartTotal) els.cartTotal.textContent = window.formatCurrency(totalPrice);
    if (els.cartSummary) els.cartSummary.textContent = `${cartItems.length} items • ${totalQty} total units`;

    // Track cart view/update.
    window.trackEvent("view_cart", {
      itemsCount: cartItems.length,
      totalQty,
      totalPrice,
    });
  }

  function updateCartQuantity(productId, nextQty) {
    const qty = Math.max(0, Math.floor(Number(nextQty)));
    window.setCartQuantity(productId, qty);
    renderCart();
  }

  function attachHandlers() {
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

    if (els.cartItems) {
      // +/- buttons (buttons => also tracked by generic "button_click")
      els.cartItems.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button[data-action]") : null;
        if (!btn) return;
        const productId = btn.getAttribute("data-product-id");
        const action = btn.getAttribute("data-action");
        if (!productId || !action) return;

        const cart = window.loadCart();
        const current = Number(cart[productId] || 0);
        const delta = action === "increase" ? 1 : -1;
        updateCartQuantity(productId, current + delta);
      });

      // direct quantity edit (change => tracked via view_cart on render)
      els.cartItems.addEventListener("change", (e) => {
        const input = e.target && e.target.matches ? e.target.matches("input[data-quantity-input]") : false;
        if (!input) return;

        const target = e.target;
        const productId = target.getAttribute("data-product-id");
        const nextQty = target.value;
        if (!productId) return;

        // Update on input for simplicity, clamping to >=0.
        updateCartQuantity(productId, nextQty);
      });
    }

    if (els.checkoutBtn) {
      els.checkoutBtn.addEventListener("click", () => {
        // Intentionally do nothing (experiment UI only).
      });
    }

  }

  async function init() {
    try {
      products = await window.loadProducts();
    } catch (e) {
      console.error("Failed to load products:", e);
      const protocol = window.location && window.location.protocol ? window.location.protocol : "";
      const hint =
        protocol === "file:"
          ? "products.json could not be loaded from file://. Start the experiment server (e.g., `python backend/server.py`) and open http://127.0.0.1:8000/cart.html."
          : "products.json could not be loaded. Check that data/products.json is reachable.";
      if (els.cartItems) els.cartItems.innerHTML = `<div class="empty-state">${window.escapeHtml(hint)}</div>`;
      return;
    }
    attachHandlers();
    renderCart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
