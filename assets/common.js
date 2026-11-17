// Shared helpers for every page.
// Storage: signed in -> your Supabase account; signed out (or accounts not set up) -> this browser's localStorage.
window.SA = (() => {
  const PREFIX = 'savepoint-atlas:';

  // Fill these in before launch. Bracketed values mean "not configured".
  // The Supabase publishable (anon) key is meant to be public: row-level security in supabase/schema.sql protects the data.
  // Never put the secret (sb_secret_) or service_role key here.
  const CONFIG = {
    supabaseUrl: 'https://sdltqbctuieyjlujsdhj.supabase.co',
    supabaseAnonKey: 'sb_publishable_SLyXLfw7hZQTL_xEpofo8g_XgKZZStM',
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
  const CATS = ['Main Story', 'Side Quests', 'Collectibles', 'Exploration', 'Challenges'];
  const toRow = (i) => {
    const r = { pack: PACK, title: i.title, cat: i.cat, spoiler: i.spoiler || 0, done: !!i.done, note: i.note || '' };
    if (i.entry_id) r.entry_id = i.entry_id; // only sent when set, so this works before 002 is installed
    return r;
  };
  const fromRow = (r) => ({ id: r.id, title: r.title, cat: r.cat, spoiler: r.spoiler, done: r.done, note: r.note, entry_id: r.entry_id || null });
  const fromEntry = (e) => ({ title: e.title, cat: e.cat, spoiler: e.spoiler, done: false, note: e.note, entry_id: e.id });
  const fail = (error) => { throw new Error((error && error.message) || 'connection problem'); };

  // Approved pack entries are public. Resolves to [] if accounts are off or the 002 tables aren't installed yet.
  let entriesPromise = null;
  function packEntries() {
    if (!entriesPromise) {
      entriesPromise = (async () => {
        const c = db();
        if (!c) return [];
        try {
          const { data: rows, error } = await c.from('pack_entries')
            .select('id, title, cat, spoiler, note, source, created_at')
            .eq('pack', PACK).eq('status', 'approved').order('created_at', { ascending: true });
          return error ? [] : rows;
        } catch { return []; }
      })();
    }
    return entriesPromise;
  }

  const data = {
    packEntries,
    async coverage() {
      const entries = await packEntries();
      const byCat = Object.fromEntries(CATS.map((c) => [c, 0]));
      entries.forEach((e) => { byCat[e.cat] = (byCat[e.cat] || 0) + 1; });
      return { total: entries.length, byCat };
    },

    // Returns { mode: 'cloud' | 'local', items, entries }. Approved entries missing from the list are added to it.
    async loadItems(seed) {
      const entries = await packEntries();
      const start = entries.length ? [] : seed; // examples only while the pack is empty
      const user = await currentUser();
      if (!user) {
        let items = load('items', start);
        const have = new Set(items.map((i) => i.entry_id).filter(Boolean));
        const missing = entries.filter((e) => !have.has(e.id));
        if (missing.length) {
          items = items.concat(missing.map((e) => ({ ...fromEntry(e), id: 'e-' + e.id })));
          save('items', items);
        }
        return { mode: 'local', items, entries };
      }
      const c = db();
      const { data: rows, error } = await c.from('checklist_items').select('*').eq('pack', PACK).order('created_at', { ascending: false }).order('id');
      if (error) fail(error);
      let items = rows.map(fromRow);
      const toInsert = [];
      if (!rows.length) toInsert.push(...load('items', start).map(toRow)); // first sign-in: bring this browser's list
      const have = new Set(items.map((i) => i.entry_id).concat(toInsert.map((r) => r.entry_id)).filter(Boolean));
      entries.filter((e) => !have.has(e.id)).forEach((e) => toInsert.push(toRow(fromEntry(e))));
      if (toInsert.length) {
        const { data: inserted, error: insErr } = await c.from('checklist_items').insert(toInsert).select('*');
        if (insErr) fail(insErr);
        items = items.concat(inserted.map(fromRow));
      }
      return { mode: 'cloud', items, entries };
    },
    async addItem(item, items) {
      const user = await currentUser();
      if (!user) { save('items', items); return item; }
      const { data: row, error } = await db().from('checklist_items').insert(toRow(item)).select('*').single();
      if (error) fail(error);
      return fromRow(row);
    },
    async updateItem(id, patch, items) {
      const user = await currentUser();
      if (!user) { save('items', items); return; }
      const { error } = await db().from('checklist_items').update(patch).eq('id', id);
      if (error) fail(error);
    },
    async deleteItem(id, items) {
      const user = await currentUser();
      if (!user) { save('items', items); return; }
      const { error } = await db().from('checklist_items').delete().eq('id', id);
      if (error) fail(error);
    },

    // ----- profile -----
    async loadProfile() {
      const local = { handle: load('handle', ''), settings: load('settings', {}) };
      const user = await currentUser();
      if (!user) return local;
      const { data: row, error } = await db().from('profiles').select('handle, settings').eq('id', user.id).maybeSingle();
      if (error) fail(error);
      if (!row) return local;
      return { handle: row.handle || '', settings: { ...local.settings, ...(row.settings || {}) } };
    },
    async saveSettings(settings) {
      save('settings', settings);
      const user = await currentUser();
      if (!user) return;
      const { error } = await db().from('profiles').update({ settings }).eq('id', user.id);
      if (error) fail(error);
    },
    async saveHandle(handle) {
      save('handle', handle);
      const user = await currentUser();
      if (!user) return;
      const { error } = await db().from('profiles').update({ handle: handle || null }).eq('id', user.id);
      if (error) {
        if (error.code === '23505') throw new Error('That handle is taken.');
        if (error.code === '23514') throw new Error('Use 3 to 24 lowercase letters, numbers or underscores.');
        fail(error);
      }
    },

    // ----- contributions -----
    async submitEntry(e) {
      const user = await currentUser();
      if (!user) throw new Error('Sign in to submit entries.');
      const { error } = await db().from('pack_entries').insert({
        pack: PACK, title: e.title, cat: e.cat, spoiler: e.spoiler, note: e.note, source: e.source, submitted_by: user.id,
      });
      if (error) fail(error);
    },
    async mySubmissions() {
      const user = await currentUser();
      if (!user) return [];
      const { data: rows, error } = await db().from('pack_entries')
        .select('id, title, cat, spoiler, status, review_note, created_at')
        .eq('submitted_by', user.id).order('created_at', { ascending: false });
      if (error) fail(error);
      return rows;
    },
    async withdrawEntry(id) {
      const { error } = await db().from('pack_entries').delete().eq('id', id);
      if (error) fail(error);
    },
    async isAdmin() {
      const user = await currentUser();
      if (!user) return false;
      const { data: yes, error } = await db().rpc('is_admin');
      return !error && !!yes;
    },
    async reviewQueue(status = 'pending') {
      const { data: rows, error } = await db().from('pack_entries')
        .select('*').eq('pack', PACK).eq('status', status).order('created_at', { ascending: true });
      if (error) fail(error);
      return rows;
    },
    async reviewEntry(id, patch) {
      const { error } = await db().from('pack_entries')
        .update({ ...patch, reviewed_at: new Date().toISOString() }).eq('id', id);
      if (error) fail(error);
    },
    async deleteEntry(id) {
      const { error } = await db().from('pack_entries').delete().eq('id', id);
      if (error) fail(error);
    },

    // ----- friends -----
    async myFriends() {
      const { data: rows, error } = await db().rpc('my_friends');
      if (error) fail(error);
      return rows;
    },
    async sendFriendRequest(handle) {
      const { data: result, error } = await db().rpc('send_friend_request', { target_handle: handle });
      if (error) fail(error);
      return result;
    },
    async respondFriendRequest(id, accept) {
      const { error } = await db().rpc('respond_friend_request', { request_id: id, accept });
      if (error) fail(error);
    },
    async removeFriend(id) {
      const { error } = await db().from('friendships').delete().eq('id', id);
      if (error) fail(error);
    },
    async friendProgress() {
      const { data: rows, error } = await db().rpc('friend_progress', { p_pack: PACK });
      if (error) fail(error);
      return rows;
    },

    // ----- your data -----
    async exportAll() {
      const out = { local: exportLocal() };
      const user = await currentUser();
      if (user) {
        const c = db();
        const [{ data: profile }, { data: items }, { data: submissions }] = await Promise.all([
          c.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          c.from('checklist_items').select('*').order('created_at', { ascending: true }),
          c.from('pack_entries').select('*').eq('submitted_by', user.id),
        ]);
        out.account = { email: user.email, profile, items, submissions: submissions || [] };
      }
      return out;
    },
    async deleteAccount() {
      const user = await currentUser();
      if (user) {
        const { error } = await db().rpc('delete_my_account');
        if (error) fail(error);
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
    accountsEnabled, currentUser, sendMagicLink, signOut, data, CATS,
  };
})();
