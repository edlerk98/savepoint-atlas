// Shared helpers for every page.
// Storage: signed in -> your Supabase account; signed out (or accounts not set up) -> this browser's localStorage.
window.SA = (() => {
  const PREFIX = 'savepoint-atlas:';

  // Fill these in before launch. Bracketed values mean "not configured".
  // The Supabase publishable (anon) key is meant to be public: row-level security in supabase/schema.sql protects the data.
  // Never put the secret (sb_secret_) or service_role key here.
  const CONFIG = {
    supabaseUrl: 'https://sdltqbctuieyjlujsdhj.supabase.co',
    supabaseAnonKey: '[SUPABASE-PUBLISHABLE-KEY]',
    paymentLinkMonthly: '[STRIPE-PAYMENT-LINK-MONTHLY]',
    paymentLinkYearly: '[STRIPE-PAYMENT-LINK-YEARLY]',
    customerPortalLink: '[STRIPE-CUSTOMER-PORTAL-LINK]',
  };

  const isPlaceholder = (v) => typeof v !== 'string' || /^\[.*\]$/.test(v.trim());

  // ---------- localStorage (every access wrapped: storage can be blocked) ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function exportLocal() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
      }
    } catch { /* storage unavailable */ }
    return out;
  }
  function clearLocal() {
    try { Object.keys(exportLocal()).forEach((k) => localStorage.removeItem(PREFIX + k)); return true; } catch { return false; }
  }

  // ---------- DOM helper ----------
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

  // ---------- Accounts (Supabase magic link) ----------
  const accountsEnabled = !isPlaceholder(CONFIG.supabaseUrl) && !isPlaceholder(CONFIG.supabaseAnonKey) && !!window.supabase;
  let client = null;
  function db() {
    if (!accountsEnabled) return null;
    if (!client) {
      client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      });
    }
    return client;
  }

  // Resolves once, after any magic-link token in the URL has been read.
  let userPromise = null;
  function currentUser() {
    if (!userPromise) {
      userPromise = (async () => {
        const c = db();
        if (!c) return null;
        try {
          const { data } = await c.auth.getSession();
          return data.session ? data.session.user : null;
        } catch { return null; }
      })();
    }
    return userPromise;
  }

  // Where a magic link should land: the checklist, at whatever address this site is served from.
  const pageUrl = (file) => new URL(file, window.location.href).href;

  async function sendMagicLink(email) {
    const c = db();
    if (!c) throw new Error('Accounts are not set up yet.');
    const { error } = await c.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: pageUrl('checklist.html'), shouldCreateUser: true },
    });
    if (error) throw error;
  }

  async function signOut() {
    const c = db();
    if (c) await c.auth.signOut();
    userPromise = Promise.resolve(null);
  }

  // ---------- Data layer: same calls whether signed in or not ----------
  const PACK = 'gta6';
  const toRow = (i) => ({ pack: PACK, title: i.title, cat: i.cat, spoiler: i.spoiler || 0, done: !!i.done, note: i.note || '' });
  const fromRow = (r) => ({ id: r.id, title: r.title, cat: r.cat, spoiler: r.spoiler, done: r.done, note: r.note });

  const data = {
    // Returns { mode: 'cloud' | 'local', items }.
    async loadItems(seed) {
      const user = await currentUser();
      if (!user) return { mode: 'local', items: load('items', seed) };
      const c = db();
      const { data: rows, error } = await c.from('checklist_items').select('*').eq('pack', PACK).order('created_at', { ascending: false }).order('id');
      if (error) throw error;
      if (rows.length) return { mode: 'cloud', items: rows.map(fromRow) };
      // First sign-in: bring this browser's list into the account (or the labelled examples if there is none).
      const start = load('items', seed);
      const { data: inserted, error: insErr } = await c.from('checklist_items').insert(start.map(toRow)).select('*');
      if (insErr) throw insErr;
      return { mode: 'cloud', items: inserted.map(fromRow) };
    },
    async addItem(item, items) {
      const user = await currentUser();
      if (!user) { save('items', items); return item; }
      const { data: row, error } = await db().from('checklist_items').insert(toRow(item)).select('*').single();
      if (error) throw error;
      return fromRow(row);
    },
    async updateItem(id, patch, items) {
      const user = await currentUser();
      if (!user) { save('items', items); return; }
      const { error } = await db().from('checklist_items').update(patch).eq('id', id);
      if (error) throw error;
    },
    async deleteItem(id, items) {
      const user = await currentUser();
      if (!user) { save('items', items); return; }
      const { error } = await db().from('checklist_items').delete().eq('id', id);
      if (error) throw error;
    },
    async loadProfile() {
      const local = { handle: load('handle', ''), settings: load('settings', {}) };
      const user = await currentUser();
      if (!user) return local;
      const { data: row, error } = await db().from('profiles').select('handle, settings').eq('id', user.id).maybeSingle();
      if (error) throw error;
      if (!row) return local;
      return { handle: row.handle || '', settings: { ...local.settings, ...(row.settings || {}) } };
    },
    async saveSettings(settings) {
      save('settings', settings);
      const user = await currentUser();
      if (!user) return;
      const { error } = await db().from('profiles').update({ settings }).eq('id', user.id);
      if (error) throw error;
    },
    async saveHandle(handle) {
      save('handle', handle);
      const user = await currentUser();
      if (!user) return;
      const { error } = await db().from('profiles').update({ handle: handle || null }).eq('id', user.id);
      if (error) {
        if (error.code === '23505') throw new Error('That handle is taken.');
        if (error.code === '23514') throw new Error('Use 3 to 24 lowercase letters, numbers or underscores.');
        throw error;
      }
    },
    async exportAll() {
      const out = { local: exportLocal() };
      const user = await currentUser();
      if (user) {
        const c = db();
        const [{ data: profile }, { data: items }] = await Promise.all([
          c.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          c.from('checklist_items').select('*').order('created_at', { ascending: true }),
        ]);
        out.account = { email: user.email, profile, items };
      }
      return out;
    },
    async deleteAccount() {
      const user = await currentUser();
      if (user) {
        const { error } = await db().rpc('delete_my_account');
        if (error) throw error;
        await signOut();
      }
      clearLocal();
    },
  };

  // ---------- Header: swap "Sign in" for the account once signed in ----------
  async function paintAuthLinks() {
    const user = await currentUser();
    document.querySelectorAll('[data-auth="signed-out"]').forEach((n) => { n.hidden = !!user; });
    document.querySelectorAll('[data-auth="signed-in"]').forEach((n) => { n.hidden = !user; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintAuthLinks);
  else paintAuthLinks();

  return {
    CONFIG, isPlaceholder, load, save, el,
    accountsEnabled, currentUser, sendMagicLink, signOut, data,
  };
})();
