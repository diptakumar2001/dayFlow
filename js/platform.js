/* =========================================================
   DayFlow — platform adapter
   Everything that touches the device goes through here:
   saving, reminders, files, the Android back button.
   In a browser it uses web APIs; inside the phone app
   (Capacitor) it uses the native plugins, so reminders fire
   even when the app is closed.
   ========================================================= */

const Platform = (() => {
  const Cap = window.Capacitor;
  const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const plugin = (name) => (native && Cap.Plugins ? Cap.Plugins[name] || null : null);

  // Keys we keep a native copy of (the phone may clear WebView storage):
  // every DayFlow key, including each account's offline copy and the sign-in session.
  const backedUp = (key) => key.startsWith("dayflow.");

  // ---- Storage: synchronous reads, so the rest of the app stays simple ----
  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null; // private window or blocked storage
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        /* app keeps working in memory */
      }
      const prefs = plugin("Preferences");
      if (prefs && backedUp(key)) prefs.set({ key, value }).catch(() => {});
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      const prefs = plugin("Preferences");
      if (prefs && backedUp(key)) prefs.remove({ key }).catch(() => {});
    },
  };

  // Restore from the native copy before the app reads anything.
  async function ready() {
    const prefs = plugin("Preferences");
    if (!prefs) return;
    try {
      const { keys } = await prefs.keys();
      for (const key of keys.filter(backedUp)) {
        if (storage.get(key) !== null) continue;
        const { value } = await prefs.get({ key });
        if (value !== null && value !== undefined) localStorage.setItem(key, value);
      }
    } catch (e) {}
  }

  // ---- Reminders ----
  // Native notification ids must be 32-bit integers.
  const hashId = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  };

  const ALARM_SOUND = "dayflow_alarm.wav"; // res/raw on Android

  const reminders = {
    // True when the device itself delivers reminders (app closed or not).
    native: !!plugin("LocalNotifications"),

    // Once at start-up: Android channels (a gentle one for reminders, a loud one for alarms)
    // and the Done / Snooze buttons on alarms. Not needed on the web.
    async setup() {
      const ln = plugin("LocalNotifications");
      if (!ln) return;
      try {
        await ln.createChannel({
          id: "reminders", name: "Reminders", description: "A heads-up before a task starts",
          importance: 4, visibility: 1, vibration: true,
        });
        await ln.createChannel({
          id: "alarms", name: "Alarms", description: "Rings when a task starts",
          importance: 5, visibility: 1, sound: ALARM_SOUND, vibration: true, lights: true, lightColor: "#4cc2a6",
        });
      } catch (e) {} // iOS has no channels
      try {
        await ln.registerActionTypes({
          types: [{ id: "alarm", actions: [{ id: "done", title: "Done" }, { id: "snooze", title: "Snooze 5 min" }] }],
        });
      } catch (e) {}
    },

    // list: [{ key, kind: "reminder" | "alarm", title, body, at: Date, extra }]
    // Replaces everything scheduled before. allowWhileIdle = on time even when the phone sleeps.
    async sync(list) {
      const ln = plugin("LocalNotifications");
      if (!ln) return; // web: app.js shows reminders while the page is open
      try {
        const pending = await ln.getPending();
        if (pending.notifications.length) {
          await ln.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
        }
        const now = Date.now();
        const notifications = list
          .filter((r) => r.at.getTime() > now)
          .slice(0, 60) // iOS allows 64 pending
          .map((r) => {
            const alarm = r.kind === "alarm";
            return {
              id: hashId(r.key), title: r.title, body: r.body,
              schedule: { at: r.at, allowWhileIdle: true },
              channelId: alarm ? "alarms" : "reminders",
              sound: alarm ? ALARM_SOUND : undefined,
              actionTypeId: alarm ? "alarm" : undefined,
              extra: { ...r.extra, kind: r.kind, key: r.key },
            };
          });
        if (notifications.length) await ln.schedule({ notifications });
      } catch (e) {}
    },

    // Android 12+: are exact (on-time) alarms allowed? true when it doesn't apply.
    async exactAllowed() {
      const ln = plugin("LocalNotifications");
      if (!ln || !ln.checkExactNotificationSetting) return true;
      try {
        const res = await ln.checkExactNotificationSetting();
        return res.exact_alarm === "granted";
      } catch (e) {
        return true;
      }
    },
    async openExactSetting() {
      try {
        await plugin("LocalNotifications").changeExactNotificationSetting();
      } catch (e) {}
    },

    // "granted" | "denied" | "default" | "unsupported"
    async permission() {
      const ln = plugin("LocalNotifications");
      if (ln) {
        try {
          const { display } = await ln.checkPermissions();
          return display === "granted" ? "granted" : display === "denied" ? "denied" : "default";
        } catch (e) {
          return "unsupported";
        }
      }
      try {
        return "Notification" in window ? Notification.permission : "unsupported";
      } catch (e) {
        return "unsupported";
      }
    },

    async request() {
      const ln = plugin("LocalNotifications");
      try {
        if (ln) await ln.requestPermissions();
        else if ("Notification" in window) await Notification.requestPermission();
      } catch (e) {}
    },

    // Desktop notification while the page is open (web only).
    show(title, body) {
      if (reminders.native) return;
      try {
        if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
      } catch (e) {}
    },

    // fn(action, extra): action is "tap", "done" or "snooze" (the alarm's buttons).
    onAction(fn) {
      const ln = plugin("LocalNotifications");
      if (!ln) return;
      ln.addListener("localNotificationActionPerformed", (e) => {
        const a = e.actionId === "done" || e.actionId === "snooze" ? e.actionId : "tap";
        fn(a, e.notification.extra || {});
      });
    },
  };

  // ---- Look and feel inside the phone app (no-ops on the web) ----
  const ui = {
    // Status bar icons/background follow the app's theme.
    async statusBar(dark) {
      const sb = plugin("StatusBar");
      if (!sb) return;
      try {
        await sb.setStyle({ style: dark ? "DARK" : "LIGHT" }); // DARK = light icons for a dark background
        await sb.setBackgroundColor({ color: dark ? "#070b18" : "#f3f6f5" });
      } catch (e) {}
    },
    // A small buzz, e.g. when a task is picked up by holding it.
    haptic() {
      const h = plugin("Haptics");
      if (h) h.impact({ style: "LIGHT" }).catch(() => {});
      else if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(10);
    },
    hideSplash() {
      const s = plugin("SplashScreen");
      if (s) s.hide().catch(() => {});
    },
  };

  // ---- Offline (web only) ----
  // A service worker keeps the app files, so the installed web app opens without a connection.
  // onUpdate(apply) is called when a new version is waiting; apply() switches to it and reloads.
  // Off on localhost (so development always shows fresh files) unless dayflow.devOffline is set.
  function registerOffline(onUpdate) {
    if (native || !("serviceWorker" in navigator) || location.protocol === "file:") return;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local && !storage.get("dayflow.devOffline")) return;
    // Reload only when switching to a new version, not when the first worker takes over on a first visit.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        const offer = (w) => onUpdate(() => w.postMessage("skip-waiting"));
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
          });
        });
      })
      .catch(() => {});
  }

  // Running as an installed web app (Add to Home Screen)?
  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  // ---- Files (backup) ----
  async function saveFile(name, text) {
    const fs = plugin("Filesystem");
    const share = plugin("Share");
    if (fs && share) {
      const { uri } = await fs.writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
      await share.share({ title: name, files: [uri] });
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Resolves with the chosen file's text, or null if cancelled.
  function openFile(accept = ".json,application/json") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        file.text().then(resolve, () => resolve(null));
      });
      input.click();
    });
  }

  // Resolves with the chosen image File, or null if cancelled.
  function pickImage() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", () => resolve((input.files && input.files[0]) || null));
      input.click();
    });
  }

  // ---- Images (background photos) ----
  // Too big for localStorage (5 MB, shared with tasks), so they go in IndexedDB.
  // Works in browsers and in the phone app's WebView. Photos stay on this device.
  const images = (() => {
    let dbp = null;
    const db = () =>
      (dbp =
        dbp ||
        new Promise((resolve, reject) => {
          const req = indexedDB.open("dayflow-images", 1);
          req.onupgradeneeded = () => req.result.createObjectStore("images");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }));
    const run = (mode, fn) =>
      db().then(
        (d) =>
          new Promise((resolve, reject) => {
            const tx = d.transaction("images", mode);
            const req = fn(tx.objectStore("images"));
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
          })
      );
    return {
      put: (key, blob) => run("readwrite", (s) => s.put(blob, key)),
      get: (key) => run("readonly", (s) => s.get(key)).catch(() => null),
      remove: (key) => run("readwrite", (s) => s.delete(key)).catch(() => {}),
    };
  })();

  // ---- App lifecycle ----
  // fn returns true when it closed something; otherwise the app exits as usual.
  function onBack(fn) {
    const app = plugin("App");
    if (app) app.addListener("backButton", () => fn() || app.exitApp());
  }

  function onResume(fn) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fn();
    });
  }

  return {
    native, storage, ready, reminders, ui, registerOffline, standalone,
    saveFile, openFile, pickImage, images, onBack, onResume,
  };
})();
