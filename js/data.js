// Loads products from /data/products.json

(function () {
  const PRODUCTS_URL = "data/products.json";
  let productsCache = null;

  function loadProductsViaXHR() {
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", PRODUCTS_URL, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const parsed = JSON.parse(xhr.responseText);
              resolve(parsed);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`Failed to load products.json (status ${xhr.status})`));
          }
        };
        xhr.send();
      } catch (e) {
        reject(e);
      }
    });
  }

  window.loadProducts = async function loadProducts() {
    if (productsCache) return productsCache;

    // Try fetch first (works when served over HTTP/localhost).
    try {
      const res = await fetch(PRODUCTS_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      productsCache = Array.isArray(json) ? json : json.products;
      if (!Array.isArray(productsCache)) {
        throw new Error("products.json did not contain an array");
      }
      return productsCache;
    } catch {
      // Fallback for stricter environments.
      const json = await loadProductsViaXHR();
      productsCache = Array.isArray(json) ? json : json.products;
      if (!Array.isArray(productsCache)) {
        throw new Error("products.json did not contain an array");
      }
      return productsCache;
    }
  };
})();
