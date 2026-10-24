/* =========================================================
   DayFlow — data layer
   Date helpers, task storage (via Platform), undo history,
   recurring-task rules, overlap detection, to-dos, backup.
   ========================================================= */

const DateUtil = (() => {
  const pad = (n) => String(n).padStart(2, "0");

  // Dates are stored as "YYYY-MM-DD" keys in local time.
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const todayKey = () => toKey(new Date());
  const addDays = (k, n) => {
    const d = fromKey(k);
    d.setDate(d.getDate() + n);
    return toKey(d);
  };
  const dow = (k) => fromKey(k).getDay(); // 0 = Sunday
  const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000); // b - a, in days
  const startOfWeek = (k) => addDays(k, -((dow(k) + 6) % 7)); // weeks start on Monday
  const weekDays = (k) => {
    const s = startOfWeek(k);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  };

  // ISO-8601 week number, the convention printed in paper planners.
  const isoWeek = (k) => {
    const d = fromKey(k);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const jan4 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  };

  const nowMinutes = () => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  };

  // Minutes since midnight -> "2:30 PM"
  const fmtTime = (min) => {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
  };

  // "9:30 – 10:50 AM" (drops the first AM/PM when both match)
  const fmtRange = (start, duration) => {
    const a = fmtTime(start);
    const b = fmtTime(start + duration);
    if (a.slice(-2) === b.slice(-2)) return `${a.slice(0, -3)} – ${b}`;
    return `${a} – ${b}`;
  };

  const fmtDuration = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m} min`;
    if (!m) return `${h} h`;
    return `${h} h ${m} min`;
  };

  const fmtHourLabel = (h) => (h === 12 ? "12 PM" : h === 0 || h === 24 ? "12 AM" : h < 12 ? `${h} AM` : `${h - 12} PM`);

  const toInputTime = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const fromInputTime = (s) => {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };

  const fmt = (k, opts) => fromKey(k).toLocaleDateString("en-US", opts);
  const shortDate = (k) => fmt(k, { weekday: "short", month: "short", day: "numeric" });

  return {
    toKey, fromKey, todayKey, addDays, dow, diffDays, startOfWeek, weekDays, isoWeek, nowMinutes,
    fmtTime, fmtRange, fmtDuration, fmtHourLabel, toInputTime, fromInputTime, fmt, shortDate,
  };
})();

const Store = (() => {
  const GUEST_KEY = "dayflow.v1"; // tasks of someone not signed in
  const VERSION = 2;
  const MAX_UNDO = 50;
  const LEFTOVER_DAYS = 14;
  let key = GUEST_KEY;
  let tasks = [];
  // id -> JSON of the task as last confirmed with the server (signed-in stores only).
  // Comparing against it finds every change, so mutations don't need to know about sync.
  let baseline = {};
  const undoStack = [];
  const listeners = [];

  const newId = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Switch to another store on this device (guest, or one per account). Returns false if it was empty.
  function open(k) {
    key = k;
    tasks = [];
    undoStack.length = 0;
    try {
      baseline = JSON.parse(Platform.storage.get(`${k}.base`) || "{}");
    } catch (e) {
      baseline = {};
    }
    try {
      const raw = Platform.storage.get(k);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.tasks)) return false;
      tasks = data.tasks.map(normalize);
      return true;
    } catch (e) {
      return false; // corrupted: start fresh
    }
  }
  const load = () => open(GUEST_KEY);

  function save() {
    Platform.storage.set(key, JSON.stringify({ version: VERSION, tasks }));
    listeners.forEach((fn) => fn());
  }
  const onSave = (fn) => listeners.push(fn);
  const saveBaseline = () => Platform.storage.set(`${key}.base`, JSON.stringify(baseline));

  // Removes a store from this device (an account's offline copy after signing out).
  function forget(k) {
    Platform.storage.remove(k);
    Platform.storage.remove(`${k}.base`);
  }

  // Guest tasks on this device, read without switching to them.
  function peek(k) {
    try {
      const data = JSON.parse(Platform.storage.get(k) || "{}");
      return Array.isArray(data.tasks) ? data.tasks.map(normalize) : [];
    } catch (e) {
      return [];
    }
  }

  // ---- Sync helpers ----
  const isLocalChange = (t) => baseline[t.id] !== JSON.stringify(t);

  // What to send to the server: new or changed tasks, and ids removed here. Examples never leave the device.
  function changes() {
    const here = new Set();
    const upserts = [];
    tasks.forEach((t) => {
      if (t.sample) return;
      here.add(t.id);
      if (isLocalChange(t)) upserts.push(t);
    });
    const deletes = Object.keys(baseline).filter((id) => !here.has(id));
    return { upserts, deletes };
  }

  // After the server accepted them: sent = [{ id, json }] (json null for a delete).
  function markSynced(sent) {
    sent.forEach(({ id, json }) => {
      if (json === null) delete baseline[id];
      else baseline[id] = json;
    });
    saveBaseline();
  }

  // Server rows from another device. A task also changed here since the last sync keeps the local
  // version; it is pushed next, so the latest change wins. Not undoable (it isn't the person's action).
  function applyRemote(rows) {
    let changed = false;
    rows.forEach((row) => {
      const local = get(row.id);
      const editedHere = local ? isLocalChange(local) : false;
      const deletedHere = !local && row.id in baseline;
      if (editedHere || deletedHere) return;
      if (row.deleted) {
        if (local) {
          tasks = tasks.filter((t) => t.id !== row.id);
          changed = true;
        }
        delete baseline[row.id];
        return;
      }
      const t = normalize({ ...row.data, id: row.id });
      const json = JSON.stringify(t);
      baseline[row.id] = json;
      if (local && JSON.stringify(local) === json) return;
      if (local) Object.assign(local, t);
      else tasks.push(t);
      changed = true;
    });
    saveBaseline();
    if (changed) save();
    return changed;
  }

  const isKey = (k) => typeof k === "string" && /^\d{4}-\d{2}-\d{2}$/.test(k);
  const strList = (a) => (Array.isArray(a) ? a.filter(isKey) : []);

  function normalize(t) {
    const start = t.start === null || t.start === undefined || t.start === "" ? null : Number(t.start) || 0;
    return {
      id: t.id || newId(),
      title: String(t.title || "Untitled task"),
      date: isKey(t.date) ? t.date : DateUtil.todayKey(),
      start, // null = a to-do with no set time
      duration: Math.max(5, Number(t.duration) || 60),
      priority: ["high", "medium", "low"].includes(t.priority) ? t.priority : "medium",
      recurrence: ["none", "daily", "weekdays", "weekly"].includes(t.recurrence) ? t.recurrence : "none",
      until: isKey(t.until) ? t.until : null, // last day a repeat happens
      skipDates: strList(t.skipDates), // repeat days removed or moved to their own task
      reminder: t.reminder === null || t.reminder === undefined || t.reminder === "" ? null : Number(t.reminder),
      due: isKey(t.due) ? t.due : null,
      course: String(t.course || "").trim(),
      notes: t.notes || "",
      doneDates: strList(t.doneDates),
      sample: !!t.sample,
    };
  }

  // ---- Undo ----
  function snapshot(label) {
    undoStack.push({ label, tasks: JSON.stringify(tasks) });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return null;
    tasks = JSON.parse(s.tasks);
    save();
    return s.label;
  }
  const canUndo = () => undoStack.length > 0;

  // ---- Recurrence ----
  function occursOn(t, k) {
    if (t.start === null || k < t.date) return false;
    if (t.until && k > t.until) return false;
    if (t.skipDates.includes(k)) return false;
    switch (t.recurrence) {
      case "daily":
        return true;
      case "weekdays": {
        const d = DateUtil.dow(k);
        return d >= 1 && d <= 5;
      }
      case "weekly":
        return DateUtil.dow(k) === DateUtil.dow(t.date);
      default:
        return k === t.date;
    }
  }

  // All task occurrences on a date, sorted by start time.
  function tasksOn(k) {
    return tasks
      .filter((t) => occursOn(t, k))
      .map((t) => ({ ...t, instanceDate: k, done: t.doneDates.includes(k) }))
      .sort((a, b) => a.start - b.start || b.duration - a.duration);
  }

  // Tasks on date k that overlap the given time range.
  function overlapsFor(k, start, duration, excludeId) {
    return tasksOn(k).filter(
      (t) => t.id !== excludeId && t.start < start + duration && start < t.start + t.duration
    );
  }

  // Side-by-side lanes for overlapping blocks (like a calendar app).
  function layoutLanes(list) {
    const items = list.slice().sort((a, b) => a.start - b.start || b.duration - a.duration);
    const result = new Map();
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const lanes = [];
      cluster.forEach((it) => {
        let lane = lanes.findIndex((end) => end <= it.start);
        if (lane === -1) {
          lane = lanes.length;
          lanes.push(0);
        }
        lanes[lane] = it.start + it.duration;
        result.set(it.key || it.id, { lane });
      });
      cluster.forEach((it) => (result.get(it.key || it.id).lanes = lanes.length));
      cluster = [];
    };
    items.forEach((it) => {
      if (cluster.length && it.start >= clusterEnd) {
        flush();
        clusterEnd = -1;
      }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.start + it.duration);
    });
    if (cluster.length) flush();
    return result;
  }

  // ---- Lists for the sidebar ----

  // One-off timed tasks from recent days that were never finished.
  function leftovers(today) {
    const from = DateUtil.addDays(today, -LEFTOVER_DAYS);
    return tasks
      .filter((t) => t.recurrence === "none" && t.start !== null && t.date < today && t.date >= from && !t.doneDates.includes(t.date))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  }

  // Open to-dos (no set time), soonest due first; no due date goes last.
  function todos() {
    return tasks
      .filter((t) => t.start === null && !t.doneDates.length)
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.title.localeCompare(b.title));
  }

  function search(q) {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return tasks
      .filter((t) => `${t.title} ${t.notes} ${t.course}`.toLowerCase().includes(s))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? -1) - (b.start ?? -1));
  }

  const courses = () => [...new Set(tasks.map((t) => t.course).filter(Boolean))].sort();

  // ---- Mutations (each one can be undone) ----
  function add(data, label) {
    snapshot(label || `Add “${data.title}”`);
    const t = normalize({ ...data, id: newId() });
    tasks.push(t);
    save();
    return t;
  }

  function update(id, patch, label) {
    const t = get(id);
    if (!t) return null;
    snapshot(label || `Edit “${t.title}”`);
    Object.assign(t, normalize({ ...t, ...patch }));
    save();
    return t;
  }

  function remove(id, label) {
    const t = get(id);
    if (!t) return null;
    snapshot(label || `Delete “${t.title}”`);
    tasks = tasks.filter((x) => x.id !== id);
    save();
    return t;
  }

  // Remove one day from a repeating task.
  function skipDay(id, k, label) {
    const t = get(id);
    if (!t) return null;
    snapshot(label || `Delete “${t.title}” on ${DateUtil.shortDate(k)}`);
    t.skipDates = [...t.skipDates, k];
    save();
    return t;
  }

  // Change one day of a repeating task: that day becomes its own one-off task.
  function detach(id, k, patch, label) {
    const t = get(id);
    if (!t) return null;
    snapshot(label || `Change “${t.title}” on ${DateUtil.shortDate(k)}`);
    t.skipDates = [...t.skipDates, k];
    const date = patch.date || k;
    const copy = normalize({
      ...t, id: newId(), date, recurrence: "none", until: null, skipDates: [],
      doneDates: t.doneDates.includes(k) ? [date] : [], ...patch,
    });
    tasks.push(copy);
    save();
    return copy;
  }

  function toggleDone(id, k) {
    const t = get(id);
    if (!t) return null;
    const done = t.doneDates.includes(k);
    snapshot(done ? `Mark “${t.title}” not done` : `Complete “${t.title}”`);
    t.doneDates = done ? t.doneDates.filter((d) => d !== k) : [...t.doneDates, k];
    save();
    return !done;
  }

  function clearExamples() {
    snapshot("Clear example tasks");
    tasks = tasks.filter((t) => !t.sample);
    save();
  }

  function seed(list) {
    tasks = list.map(normalize);
    save();
  }

  // ---- Backup ----
  const exportJSON = () => JSON.stringify({ app: "DayFlow", version: VERSION, exported: new Date().toISOString(), tasks }, null, 2);

  // Returns the number of tasks read; throws if the file isn't a DayFlow backup.
  function readBackup(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && data.tasks;
    if (!Array.isArray(list)) throw new Error("not a backup");
    return list.filter((t) => t && typeof t === "object" && t.title).map(normalize);
  }

  // mode: "replace" | "merge" (merge skips tasks that are already here)
  function importTasks(list, mode) {
    snapshot("Import backup");
    if (mode === "replace") tasks = list;
    else {
      const have = new Set(tasks.map((t) => t.id));
      tasks = tasks.concat(list.filter((t) => !have.has(t.id)));
    }
    save();
  }

  const get = (id) => tasks.find((t) => t.id === id);
  const all = () => tasks.slice();

  return {
    GUEST_KEY, load, open, forget, peek, key: () => key, seed, onSave, newId, get, all,
    changes, markSynced, applyRemote, occursOn, tasksOn, overlapsFor, layoutLanes,
    leftovers, todos, search, courses,
    add, update, remove, skipDay, detach, toggleDone, clearExamples, undo, canUndo,
    exportJSON, readBackup, importTasks,
  };
})();
