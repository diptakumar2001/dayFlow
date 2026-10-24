/* =========================================================
   DayFlow — accounts and cloud sync (Supabase)
   The only file that talks to Supabase. Signing in is optional:
   without CONFIG values, Sync.enabled is false and DayFlow
   keeps tasks on the device only.

   Sync is simple on purpose: the Store remembers what the server
   last confirmed (its baseline). push() sends whatever differs;
   pull() asks for rows changed since the last pull. Each person
   can only reach their own rows (row-level security in
   supabase/schema.sql).
   ========================================================= */

const Sync = (() => {
  // (A top-level const isn't a property of window, so check CONFIG with typeof.)
  const enabled = !!(typeof CONFIG !== "undefined" && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
  const PAGE = 500;
  const PUSH_DELAY = 1500;

  let client = null;
  let user = null;
  let pushing = null; // the running push, so pushes never overlap
  let pushAgain = false;
  let pushTimer = null;
  const status = { state: "idle", at: null }; // idle | syncing | synced | offline | error
  const statusFns = [];
  const authFns = [];

  if (enabled) {
    client = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        // The session goes through Platform, so the phone app keeps it in native storage too.
        storage: {
          getItem: (k) => Platform.storage.get(k),
          setItem: (k, v) => Platform.storage.set(k, v),
          removeItem: (k) => Platform.storage.remove(k),
        },
        storageKey: "dayflow.auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // links in confirmation and reset emails
      },
    });
  }

  const userKey = (u = user) => `dayflow.u.${u.id}`;
  const cursorKey = () => `${userKey()}.pulled`;

  function setStatus(state) {
    status.state = state;
    if (state === "synced") status.at = new Date();
    statusFns.forEach((fn) => fn({ ...status }));
  }
  const failed = () => setStatus(navigator.onLine === false ? "offline" : "error");

  // Where links in emails should open: this site, or the live site when sent from the phone app.
  function siteUrl() {
    if (CONFIG.siteUrl) return CONFIG.siteUrl;
    return Platform.native ? undefined : location.origin + location.pathname;
  }

  // Supabase's messages, in plainer words.
  function friendly(error) {
    const m = (error && error.message) || String(error);
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox for the link.";
    if (/already registered|already been registered/i.test(m)) return "There's already an account with this email. Try signing in.";
    if (/password should be/i.test(m)) return "Use a longer password (at least 8 characters).";
    if (/rate limit|too many/i.test(m)) return "Too many tries. Please wait a few minutes and try again.";
    if (/failed to fetch|network/i.test(m)) return "Can't reach the server. Check your internet connection.";
    return m;
  }

  // ---- Accounts ----
  async function init() {
    if (!enabled) return null;
    client.auth.onAuthStateChange((event, session) => {
      user = session ? session.user : null;
      // Let the current call stack finish before the app reacts (Supabase's advice for this callback).
      setTimeout(() => authFns.forEach((fn) => fn(event, user)), 0);
    });
    const { data } = await client.auth.getSession();
    user = data.session ? data.session.user : null;
    return user;
  }

  async function signUp(email, password) {
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } });
    if (error) throw new Error(friendly(error));
    // With "Confirm email" on, there's no session until they click the link.
    return { needsConfirm: !data.session };
  }

  async function signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
  }

  async function signOut() {
    await client.auth.signOut({ scope: "local" });
  }

  async function sendPasswordReset(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
    if (error) throw new Error(friendly(error));
  }

  async function setNewPassword(password) {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(friendly(error));
  }

  // Removes the account and its cloud data (tasks stay on this device until signing out).
  async function deleteAccount() {
    const { error } = await client.rpc("delete_my_account");
    if (error) throw new Error(friendly(error));
    await client.auth.signOut({ scope: "local" });
  }

  // ---- Tasks ----
  function schedulePush() {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY);
  }

  async function push() {
    if (!user) return;
    clearTimeout(pushTimer);
    if (pushing) {
      pushAgain = true;
      return pushing;
    }
    pushing = (async () => {
      const { upserts, deletes } = Store.changes();
      if (!upserts.length && !deletes.length) return;
      setStatus("syncing");
      // Remember exactly what was sent: the task may change again while the request is out.
      const sent = [
        ...upserts.map((t) => ({ id: t.id, json: JSON.stringify(t) })),
        ...deletes.map((id) => ({ id, json: null })),
      ];
      const rows = sent.map(({ id, json }) => ({
        user_id: user.id, id, data: json ? JSON.parse(json) : {}, deleted: json === null,
      }));
      for (let i = 0; i < rows.length; i += PAGE) {
        const { error } = await client.from("tasks").upsert(rows.slice(i, i + PAGE), { onConflict: "user_id,id" });
        if (error) throw error;
      }
      Store.markSynced(sent);
    })();
    try {
      await pushing;
      setStatus("synced");
    } catch (e) {
      failed();
    } finally {
      pushing = null;
    }
    if (pushAgain) {
      pushAgain = false;
      return push();
    }
  }

  // Returns true when tasks changed, so the app can re-render.
  async function pull() {
    if (!user) return false;
    const forUser = user.id;
    setStatus("syncing");
    try {
      let since = Platform.storage.get(cursorKey()) || "1970-01-01T00:00:00Z";
      let changed = false;
      for (;;) {
        const { data, error } = await client
          .from("tasks")
          .select("id, data, deleted, updated_at")
          .eq("user_id", forUser) // row-level security enforces this anyway; the filter uses the index
          .gte("updated_at", since) // gte: rows with the same timestamp are re-applied, which is harmless
          .order("updated_at", { ascending: true })
          .limit(PAGE);
        if (error) throw error;
        if (!user || user.id !== forUser) return false; // signed out meanwhile
        if (Store.applyRemote(data)) changed = true;
        if (data.length) {
          since = data[data.length - 1].updated_at;
          Platform.storage.set(cursorKey(), since);
        }
        if (data.length < PAGE) break;
      }
      setStatus("synced");
      return changed;
    } catch (e) {
      failed();
      return false;
    }
  }

  async function syncNow() {
    await push();
    return pull();
  }

  // ---- Settings ----
  async function pullSettings() {
    if (!user) return null;
    const { data, error } = await client.from("user_settings").select("data").maybeSingle();
    return error || !data ? null : data.data;
  }

  async function pushSettings(data) {
    if (!user) return;
    const { error } = await client.from("user_settings").upsert({ user_id: user.id, data });
    if (error) failed();
  }

  return {
    enabled, init, signUp, signIn, signOut, sendPasswordReset, setNewPassword, deleteAccount,
    user: () => user, userKey, schedulePush, push, pull, syncNow, pullSettings, pushSettings,
    status: () => ({ ...status }),
    onStatus: (fn) => statusFns.push(fn),
    onAuth: (fn) => authFns.push(fn),
  };
})();
