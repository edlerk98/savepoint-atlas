// Shared helpers. Storage is per-device localStorage: this prototype has no accounts or sync.
// Every read and write is wrapped, so the pages still work with storage blocked.
window.SA = (() => {
  const PREFIX = 'savepoint-atlas:';

  // Fill these in before launch. Bracketed values mean "not configured".
  const CONFIG = {
    paymentLinkMonthly: '[STRIPE-PAYMENT-LINK-MONTHLY]',
    paymentLinkYearly: '[STRIPE-PAYMENT-LINK-YEARLY]',
    customerPortalLink: '[STRIPE-CUSTOMER-PORTAL-LINK]',
  };

  const isPlaceholder = (v) => typeof v !== 'string' || /^\[.*\]$/.test(v.trim());

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function exportAll() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
      }
    } catch { /* storage unavailable */ }
    return out;
  }
  function clearAll() {
    try {
      Object.keys(exportAll()).forEach((k) => localStorage.removeItem(PREFIX + k));
      return true;
    } catch { return false; }
  }

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) n.append(c);
    return n;
  }

  return { CONFIG, isPlaceholder, load, save, exportAll, clearAll, el };
})();
