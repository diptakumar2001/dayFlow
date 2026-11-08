/* =========================================================
   DayFlow — app controller
   Header, sidebar lists (leftovers, to-do), search and settings dialogs,
   task form, quick add, toasts (feedback + undo), overlap
   confirmation, settings, backup, reminders, shortcuts.
   ========================================================= */

(() => {
  const $ = (s) => document.querySelector(s);
  const D = DateUtil;
  const esc = Timeline.esc;

  const state = { view: "day", tab: "today", date: D.todayKey(), pending: null, flash: null, dayStart: 7 * 60 };

  // ---------------------------------------------------------
  // Settings (per device)
  // ---------------------------------------------------------
  const SETTINGS_KEY = "dayflow.settings";
  // remindBefore: minutes (null = none); alarmAtStart: ring when a task starts. Both are defaults for new tasks.
  const settings = { dayStart: 7 * 60, dayEnd: 23 * 60, warnOverlaps: true, remindBefore: 15, alarmAtStart: true };

  function loadSettings() {
    try {
      applySettings(JSON.parse(Platform.storage.get(SETTINGS_KEY) || "{}"));
    } catch (e) {}
    state.dayStart = settings.dayStart;
  }
  function saveSettings() {
    Platform.storage.set(SETTINGS_KEY, JSON.stringify(settings));
    state.dayStart = settings.dayStart;
  }

  // ---------------------------------------------------------
  // Example data shown on first visit (clearly marked)
  // ---------------------------------------------------------
  function makeExamples() {
    const k = D.todayKey();
    const mk = (o) => ({
      id: Store.newId(), date: k, recurrence: "none", reminder: null, notes: "", doneDates: [], sample: true, ...o,
    });
    return [
      mk({ title: "Morning run", start: 7 * 60, duration: 45, priority: "low", recurrence: "daily", doneDates: [k] }),
      mk({ title: "HCI lecture", start: 9 * 60 + 30, duration: 80, priority: "high", recurrence: "weekly", until: D.addDays(k, 70), reminder: 15, course: "HCI", notes: "Bring usability test draft" }),
      mk({ title: "Build drag-and-drop timeline", start: 11 * 60, duration: 90, priority: "high", course: "HCI" }),
      mk({ title: "Lunch with Preeti", start: 12 * 60 + 30, duration: 60, priority: "medium" }),
      mk({ title: "Reply to TA email", start: 13 * 60, duration: 15, priority: "low" }),
      mk({ title: "Write usability test script", start: 15 * 60, duration: 60, priority: "medium", reminder: 5, course: "HCI" }),
      mk({ title: "Groceries", start: 17 * 60 + 30, duration: 45, priority: "low" }),
      mk({ title: "Read accessibility chapter", start: 20 * 60, duration: 60, priority: "medium", course: "HCI" }),
      mk({ title: "Team check-in with Dipta", date: D.addDays(k, 1), start: 10 * 60, duration: 30, priority: "medium" }),
      mk({ title: "Submit HCI report", start: null, due: D.addDays(k, 4), priority: "high", course: "HCI" }),
      mk({ title: "Return library books", start: null, priority: "low" }),
    ];
  }

  // ---------------------------------------------------------
  // Toasts: feedback for every action, with Undo
  // ---------------------------------------------------------
  const toastBox = $("#toasts");
  function closeToast(el) {
    if (!el || !el.isConnected) return;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 160);
  }
  function closeToastKey(key) {
    toastBox.querySelectorAll(`[data-key="${key}"]`).forEach(closeToast);
  }
  function toast(msg, { actions = [], kind = "", timeout = 6000, key = "", dismissable = true } = {}) {
    if (key) toastBox.querySelectorAll(`[data-key="${key}"]`).forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.setAttribute("role", kind === "warn" ? "alert" : "status");
    if (key) el.dataset.key = key;
    const text = document.createElement("span");
    text.className = "toast-msg";
    text.textContent = msg;
    el.appendChild(text);
    const acts = document.createElement("span");
    acts.className = "toast-actions";
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "toast-btn";
      b.textContent = a.label;
      b.addEventListener("click", () => {
        closeToast(el);
        a.fn();
      });
      acts.appendChild(b);
    });
    if (dismissable) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "toast-x";
      x.setAttribute("aria-label", "Dismiss");
      x.textContent = "×";
      x.addEventListener("click", () => closeToast(el));
      acts.appendChild(x);
    }
    el.appendChild(acts);
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    if (timeout) setTimeout(() => closeToast(el), timeout);
    return el;
  }

  const undoAction = { label: "Undo", fn: doUndo };
  function doUndo() {
    const label = Store.undo();
    if (!label) {
      toast("Nothing to undo.", { timeout: 2500, key: "undo" });
      return;
    }
    state.pending = null;
    closeToastKey("pending");
    render();
    toast(`Undone: ${label}.`, { timeout: 3000, key: "undo" });
  }

  // ---------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------
  function render(opts = {}) {
    renderHeader();
    $("#exampleBanner").hidden = !Store.all().some((t) => t.sample);
    Timeline.render(state, opts);
    renderSummary();
    renderLeftovers();
    renderTodos();
    renderSearch();
    renderTabs();
  }

  // ---------------------------------------------------------
  // Phone tab bar: Today / Week / To-do / More. The CSS shows one
  // section at a time on phones; on bigger screens it's hidden.
  // ---------------------------------------------------------
  const TAB_KEY = "dayflow.tab";
  const isPhone = () => matchMedia("(max-width: 760px)").matches;

  function renderTabs() {
    $(".app").dataset.tab = state.tab;
    document.querySelectorAll(".tabbar [data-tab]").forEach((b) => {
      if (b.dataset.tab === state.tab) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    // Badge: open to-dos plus unfinished tasks from earlier days
    const n = Store.todos().length + Store.leftovers(D.todayKey()).length;
    const badge = $("#todoBadge");
    badge.hidden = !n;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.setAttribute("aria-label", `${n} open`);
  }

  function setTab(tab) {
    if (tab === "more") return openSettings();
    state.tab = tab;
    Platform.storage.set(TAB_KEY, tab);
    if (tab === "today" && state.view !== "day") return setView("day");
    if (tab === "week" && state.view !== "week") return setView("week");
    render({ resetScroll: true });
    if (tab === "todo") window.scrollTo({ top: 0 });
  }

  function renderHeader() {
    const today = D.todayKey();
    const head = $("#dateHead");
    if (state.view === "day") {
      const isToday = state.date === today;
      head.innerHTML = `
        <span class="dh-num">${D.fromKey(state.date).getDate()}</span>
        <span class="dh-text">
          <b>${D.fmt(state.date, { weekday: "long" })}${isToday ? ' <span class="today-pill">Today</span>' : ""}</b>
          <span>${D.fmt(state.date, { month: "long" })}</span>
        </span>`;
    } else {
      const days = D.weekDays(state.date);
      const a = D.fromKey(days[0]);
      const b = D.fromKey(days[6]);
      const range =
        a.getMonth() === b.getMonth()
          ? `${D.fmt(days[0], { month: "short" })} ${a.getDate()}–${b.getDate()}`
          : `${D.fmt(days[0], { month: "short", day: "numeric" })} – ${D.fmt(days[6], { month: "short", day: "numeric" })}`;
      head.innerHTML = `
        <span class="dh-num dh-range">${range}</span>
        <span class="dh-text"><b>Week ${D.isoWeek(state.date)}</b><span>${b.getFullYear()}</span></span>`;
    }
    const unit = state.view === "week" ? "week" : "day";
    $("#prevBtn").setAttribute("aria-label", `Previous ${unit}`);
    $("#nextBtn").setAttribute("aria-label", `Next ${unit}`);
    $("#dayViewBtn").setAttribute("aria-pressed", String(state.view === "day"));
    $("#weekViewBtn").setAttribute("aria-pressed", String(state.view === "week"));
    const inRange = state.view === "week" ? D.weekDays(state.date).includes(today) : state.date === today;
    $("#todayBtn").disabled = inRange;
  }

  // Days in a row (up to yesterday, or today if it's finished) where every task was done.
  function streak() {
    const today = D.todayKey();
    const all = (k) => {
      const l = Store.tasksOn(k);
      return l.length ? l.every((t) => t.done) : null; // null = nothing planned, skip it
    };
    let n = 0;
    let k = all(today) ? today : D.addDays(today, -1);
    for (let i = 0; i < 60; i++, k = D.addDays(k, -1)) {
      const r = all(k);
      if (r === false) break;
      if (r) n++;
    }
    return n;
  }

  function renderSummary() {
    const today = D.todayKey();
    const k = state.date;
    const list = Store.tasksOn(k);
    const done = list.filter((t) => t.done).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;

    $("#agendaLabel").textContent = k === today ? "Today" : D.shortDate(k);
    $("#progressNum").textContent = list.length ? `${done}/${list.length}` : "0";
    $("#progressWord").textContent = list.length ? "tasks done" : "tasks planned";
    const bar = $("#progressBar");
    bar.setAttribute("aria-valuenow", String(pct));
    bar.firstElementChild.style.width = `${pct}%`;

    // Up next
    let next = "";
    const open = list.filter((t) => !t.done);
    if (!list.length) next = "Nothing planned yet.";
    else if (!open.length) next = "Everything is done. Enjoy the rest of the day.";
    else if (k === today) {
      const now = D.nowMinutes();
      const current = open.find((t) => t.start <= now && t.start + t.duration > now);
      const upcoming = open.find((t) => t.start > now);
      if (current) next = `<b>Now:</b> ${esc(current.title)} until ${D.fmtTime(current.start + current.duration)}`;
      else if (upcoming) {
        const mins = upcoming.start - now;
        const inTxt = mins < 60 ? `in ${mins} min` : `in ${D.fmtDuration(Math.round(mins / 15) * 15)}`;
        next = `<b>Up next:</b> ${esc(upcoming.title)} at ${D.fmtTime(upcoming.start)} (${inTxt})`;
      } else next = `${open.length} unfinished from earlier today.`;
    } else next = `<b>First up:</b> ${esc(open[0].title)} at ${D.fmtTime(open[0].start)}`;
    $("#upNext").innerHTML = next;

    // Week totals, planned hours per course and the streak: week view only, to keep the day view calm
    const parts = [];
    if (state.view === "week") {
      const week = D.weekDays(k).flatMap((d) => Store.tasksOn(d));
      parts.push(`<b>This week:</b> ${week.filter((t) => t.done).length} / ${week.length} done`);
      const hours = {};
      week.forEach((t) => t.course && (hours[t.course] = (hours[t.course] || 0) + t.duration));
      const byCourse = Object.entries(hours).sort((a, b) => b[1] - a[1]);
      if (byCourse.length) parts.push(`Planned: ${byCourse.map(([c, m]) => `${esc(c)} ${D.fmtDuration(m)}`).join(" · ")}`);
      const s = streak();
      if (s >= 2) parts.push(`${s} days in a row with everything done.`);
    }
    $("#weekStats").innerHTML = parts.join("<br>");
    $("#weekStats").hidden = !parts.length;
  }

  // Unfinished one-off tasks from earlier days. Shown on today only; nothing moves by itself.
  function renderLeftovers() {
    const today = D.todayKey();
    const list = state.date === today ? Store.leftovers(today) : [];
    $("#leftoverSec").hidden = !list.length;
    $("#leftoverCount").textContent = `${list.length} unfinished from earlier`;
    $("#leftovers").innerHTML = list
      .map(
        (t) => `<li class="ag-item p-${t.priority}">
          <button type="button" class="check" data-lo-done="${t.id}" aria-label="Mark done: ${esc(t.title)}">${Timeline.CHECK_SVG}</button>
          <span class="ag-main static">
            <span class="ag-time">${D.fmt(t.date, { weekday: "short" })}</span>
            <span class="ag-title">${esc(t.title)}</span>
          </span>
          <button type="button" class="btn xs" data-lo-move="${t.id}">Reschedule</button>
          <button type="button" class="icon-btn xs" data-lo-del="${t.id}" aria-label="Delete ${esc(t.title)}">×</button>
        </li>`
      )
      .join("");
  }

  function dueLabel(due) {
    if (!due) return "";
    const n = D.diffDays(D.todayKey(), due);
    if (n < 0) return `<span class="due over">overdue ${-n} day${n === -1 ? "" : "s"}</span>`;
    if (n === 0) return `<span class="due soon">due today</span>`;
    if (n === 1) return `<span class="due soon">due tomorrow</span>`;
    return `<span class="due">due ${D.fmt(due, n < 7 ? { weekday: "short" } : { month: "short", day: "numeric" })}</span>`;
  }

  const TODO_SHOWN = 5;
  let todosExpanded = false;

  function renderTodos() {
    const all = Store.todos();
    const ol = $("#todos");
    const more = $("#todoMore");
    const hidden = todosExpanded ? 0 : Math.max(0, all.length - TODO_SHOWN);
    more.hidden = !hidden && !(todosExpanded && all.length > TODO_SHOWN);
    more.textContent = hidden ? `Show ${hidden} more` : "Show less";
    if (!all.length) {
      ol.innerHTML = `<li class="ag-empty">Nothing yet. Type “due fri” in Quick add.</li>`;
      return;
    }
    ol.innerHTML = all
      .slice(0, all.length - hidden)
      .map(
        (t) => `<li class="ag-item p-${t.priority}">
          <button type="button" class="check" data-td-done="${t.id}" aria-label="Mark done: ${esc(t.title)}">${Timeline.CHECK_SVG}</button>
          <button type="button" class="ag-main stack" data-td-open="${t.id}">
            <span class="ag-title">${esc(t.title)}</span>
            <span class="ag-sub">${Timeline.priorityTag(t.priority)}${Timeline.courseTag(t.course)}${dueLabel(t.due)}</span>
          </button>
          <button type="button" class="btn xs" data-td-schedule="${t.id}">Schedule</button>
        </li>`
      )
      .join("");
  }

  // The next day (from today on) a task happens, for jumping to it from search.
  function nextOccurrence(t) {
    let k = t.date > D.todayKey() ? t.date : D.todayKey();
    for (let i = 0; i < 400; i++, k = D.addDays(k, 1)) if (Store.occursOn(t, k)) return k;
    return t.date;
  }

  function renderSearch() {
    const q = $("#searchBox").value;
    const ol = $("#searchResults");
    ol.hidden = !q.trim();
    if (ol.hidden) return;
    const found = Store.search(q).slice(0, 20);
    if (!found.length) {
      ol.innerHTML = `<li class="ag-empty">No tasks match “${esc(q.trim())}”.</li>`;
      return;
    }
    ol.innerHTML = found
      .map((t) => {
        const when =
          t.start === null
            ? "To-do"
            : `${D.fmt(t.recurrence === "none" ? t.date : nextOccurrence(t), { month: "short", day: "numeric" })}`;
        return `<li class="ag-item p-${t.priority}">
          <button type="button" class="ag-main" data-sr-open="${t.id}">
            <span class="ag-time">${when}</span>
            <span class="ag-title">${esc(t.title)}</span>
            ${t.recurrence !== "none" ? '<span class="rep">↻</span>' : ""}
            ${Timeline.courseTag(t.course)}
          </button>
        </li>`;
      })
      .join("");
  }

  // ---------------------------------------------------------
  // Actions
  // ---------------------------------------------------------
  function weekHas(dateInWeek, k) {
    return D.weekDays(dateInWeek).includes(k);
  }

  function showDate(k) {
    if (state.view === "day" && k !== state.date) state.date = k;
    if (state.view === "week" && !weekHas(state.date, k)) state.date = k;
  }

  // Move a repeating task's change from "this day" to every repeat.
  function applyToAllRepeats(m) {
    Store.undo(); // drop the one-day copy
    const t = Store.get(m.id);
    if (!t) return render();
    const shift = D.diffDays(m.fromDate, m.toDate);
    Store.update(m.id, { start: m.start, duration: m.duration, date: D.addDays(t.date, shift) }, `Change every “${t.title}”`);
    render();
    toast(`Every “${t.title}” now runs ${D.fmtRange(m.start, m.duration)}${shift ? `, ${shift > 0 ? shift : -shift} day${Math.abs(shift) === 1 ? "" : "s"} ${shift > 0 ? "later" : "earlier"}` : ""}.`, {
      actions: [undoAction], key: "move",
    });
  }

  function commitMove(m, { fromKeyboard = false } = {}) {
    const t = Store.get(m.id);
    if (!t) return;
    const verb = m.mode === "resize" ? "Resize" : "Move";
    const dateChanged = m.toDate !== m.fromDate;
    const repeating = t.recurrence !== "none";
    let focusId = m.id;
    if (repeating) {
      // Only this day changes; the toast offers to change every repeat.
      const copy = Store.detach(m.id, m.fromDate, { date: m.toDate, start: m.start, duration: m.duration }, `${verb} “${t.title}” on ${D.shortDate(m.fromDate)}`);
      focusId = copy.id;
    } else {
      const patch = { start: m.start, duration: m.duration };
      if (dateChanged) patch.date = m.toDate;
      Store.update(m.id, patch, `${verb} “${t.title}”`);
    }
    state.pending = null;
    closeToastKey("pending");
    if (state.view === "week" && dateChanged && !weekHas(state.date, m.toDate)) state.date = m.toDate;
    render({ focusId, focusDate: m.toDate });

    let msg =
      m.mode === "resize"
        ? `“${t.title}” now runs ${D.fmtDuration(m.duration)}, until ${D.fmtTime(m.start + m.duration)}.`
        : `Moved “${t.title}” to ${dateChanged ? D.shortDate(m.toDate) + ", " : ""}${D.fmtTime(m.start)}.`;
    if (repeating) msg += " This day only.";
    if (fromKeyboard) {
      const c = Store.overlapsFor(m.toDate, m.start, m.duration, focusId);
      if (c.length) msg += ` It overlaps “${c[0].title}”.`;
    }
    const actions = [undoAction];
    if (repeating && !fromKeyboard) actions.push({ label: "Change all repeats", fn: () => applyToAllRepeats(m) });
    toast(msg, { actions, key: "move", timeout: repeating ? 9000 : 6000 });
  }

  function cancelPending() {
    if (!state.pending) return;
    state.pending = null;
    closeToastKey("pending");
    render();
    toast("Moved back to where it was.", { timeout: 2500, key: "move" });
  }

  // Constraint: a drop that creates an overlap waits for confirmation (unless turned off).
  function onDrop(m) {
    if (!m.conflicts.length || !settings.warnOverlaps) return commitMove(m);
    state.pending = { ...m };
    render();
    const t = Store.get(m.id);
    const c = m.conflicts[0];
    const more = m.conflicts.length > 1 ? ` and ${m.conflicts.length - 1} more` : "";
    toast(`“${t.title}” would overlap “${c.title}” (${D.fmtRange(c.start, c.duration)})${more}.`, {
      kind: "warn",
      timeout: 0,
      key: "pending",
      dismissable: false,
      actions: [
        { label: "Keep it here", fn: () => commitMove(state.pending) },
        { label: "Move back", fn: cancelPending },
      ],
    });
  }

  function toggleDone(id, date) {
    const t = Store.get(id);
    if (!t || state.pending) return;
    const nowDone = Store.toggleDone(id, date);
    state.flash = nowDone ? { id, date } : null;
    render();
    state.flash = null;
    if (nowDone) {
      const list = Store.tasksOn(date);
      const n = list.filter((x) => x.done).length;
      const msg =
        list.length && n === list.length
          ? `All ${n} tasks done. Nice work.`
          : list.some((x) => x.id === id)
          ? `Completed “${t.title}”. ${n} of ${list.length} done.`
          : `Completed “${t.title}”.`;
      toast(msg, { actions: [undoAction], key: "done" });
    } else {
      toast(`“${t.title}” is marked not done.`, { actions: [undoAction], key: "done" });
    }
  }

  // Deletes the whole task (all repeats).
  function deleteTask(id) {
    const t = Store.get(id);
    if (!t) return;
    Store.remove(id);
    render();
    const extra = t.recurrence !== "none" ? " and all its repeats" : "";
    toast(`Deleted “${t.title}”${extra}.`, { actions: [undoAction], key: "delete" });
  }

  // Deletes one day of a repeating task; anything else is deleted completely.
  function deleteDay(id, date) {
    const t = Store.get(id);
    if (!t) return;
    if (t.recurrence === "none" || !date) return deleteTask(id);
    Store.skipDay(id, date);
    render();
    toast(`Removed “${t.title}” on ${D.shortDate(date)} only.`, {
      actions: [undoAction, { label: "Delete all repeats", fn: () => { Store.undo(); deleteTask(id); } }],
      key: "delete",
    });
  }

  function reschedule(id) {
    const t = Store.get(id);
    if (!t) return;
    const slot = nextFreeSlot(D.todayKey(), t.duration);
    Store.update(id, { date: slot.date, start: slot.start }, `Reschedule “${t.title}”`);
    render();
    toast(`Moved “${t.title}” to ${slot.date === D.todayKey() ? "today" : D.shortDate(slot.date)}, ${D.fmtTime(slot.start)}.`, {
      actions: [undoAction, { label: "Edit", fn: () => openForm({ id, date: slot.date }) }],
      key: "move",
    });
  }

  function toggleTodo(id) {
    const t = Store.get(id);
    if (!t) return;
    Store.toggleDone(id, D.todayKey());
    render();
    toast(`Done: “${t.title}”.`, { actions: [undoAction], key: "done" });
  }

  // ---------------------------------------------------------
  // Swipe gestures (phones): right = done, left = reschedule.
  // Same actions as the check button and the task form, so
  // keyboard and screen-reader users lose nothing.
  // ---------------------------------------------------------
  const moveSheet = $("#moveSheet");
  let moving = null; // { id, date, later, tomorrow }

  function onSwipe(id, date, dir) {
    const t = Store.get(id);
    if (!t) return;
    if (dir === "left") return openMoveSheet(id, date);
    if (t.start === null) toggleTodo(id);
    else toggleDone(id, date);
  }

  const slotText = (s) => `${s.date === D.todayKey() ? "Today" : D.fmt(s.date, { weekday: "long" })}, ${D.fmtTime(s.start)}`;

  function openMoveSheet(id, date) {
    const t = Store.get(id);
    if (!t) return;
    const today = D.todayKey();
    const tomorrow = D.addDays(today, 1);
    const later = nextFreeSlot(today, t.duration);
    const next = t.start !== null ? { date: tomorrow, start: t.start } : nextFreeSlot(tomorrow, t.duration);
    moving = { id, date, later, tomorrow: next };
    $("#moveWhat").textContent = `“${t.title}”`;
    moveSheet.querySelector('[data-move="later"] b').textContent = later.date === today ? "Later today" : "Next free time";
    $("#moveLater").textContent = slotText(later);
    $("#moveTomorrow").textContent = t.start !== null ? `Same time, ${D.fmtTime(next.start)}` : slotText(next);
    moveSheet.showModal();
  }

  // One day of a repeating task moves on its own; a to-do gets a time.
  function moveTo(id, fromDate, slot) {
    const t = Store.get(id);
    if (!t) return;
    const label = `Reschedule “${t.title}”`;
    const patch = { date: slot.date, start: slot.start };
    if (t.start !== null && t.recurrence !== "none") Store.detach(id, fromDate, patch, label);
    else Store.update(id, patch, label);
    render();
    toast(`Moved “${t.title}” to ${slotText(slot)}.`, {
      actions: [undoAction, { label: "Show", fn: () => goTo(slot.date, "day") }],
      key: "move",
    });
  }

  function onMoveSheetClick(e) {
    const b = e.target.closest("[data-move]");
    if (e.target === moveSheet || (b && b.dataset.move === "cancel")) return moveSheet.close();
    if (!b || !moving) return;
    const { id, date, later, tomorrow } = moving;
    moveSheet.close();
    if (b.dataset.move === "later") moveTo(id, date, later);
    if (b.dataset.move === "tomorrow") moveTo(id, date, tomorrow);
    if (b.dataset.move === "pick") {
      const t = Store.get(id);
      openForm(t.start === null ? { id, schedule: true } : { id, date });
    }
  }

  // Lists (To-do, Left from earlier) get the same swipe as timeline cards.
  // itemFor(li) → { id, date } or null.
  function enableListSwipe(list, itemFor) {
    list.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      const li = e.target.closest(".ag-item");
      const it = li && itemFor(li);
      if (!it) return;
      const t = Store.get(it.id);
      const done = t && t.start !== null && t.doneDates.includes(it.date);
      const tracker = Swipe.begin(li, e, {
        labels: { right: done ? "Not done" : "Done", left: t && t.start === null ? "Schedule" : "Reschedule" },
        onCommit: (dir) => onSwipe(it.id, it.date, dir),
      });
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
      };
      const move = (ev) => tracker.move(ev) === "no" && stop();
      const up = () => {
        if (tracker.swiping()) {
          Swipe.swallowNextClick();
          tracker.end();
        }
        stop();
      };
      const cancel = () => {
        tracker.end(true);
        stop();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    });
  }

  // Once, on a touch phone: say how swiping works (it's invisible otherwise).
  function showSwipeTip() {
    const KEY = "dayflow.tip.swipe";
    if (!isPhone() || !matchMedia("(pointer: coarse)").matches || Platform.storage.get(KEY) || !Store.all().length) return;
    toast("Tip: swipe a task right to complete it, or left to reschedule. Hold a task to drag it.", {
      timeout: 0,
      key: "tip",
      dismissable: false,
      actions: [{ label: "Got it", fn: () => Platform.storage.set(KEY, "1") }],
    });
  }

  function goTo(date, view) {
    if (state.pending) cancelPending();
    state.date = date;
    if (view) setView(view, false);
    render({ resetScroll: true });
  }

  function setView(v, rerender = true) {
    state.view = v;
    Platform.storage.set("dayflow.view", v);
    // Keep the phone tab in step (D / W keys, opening a day from the week view, …)
    state.tab = v === "week" ? "week" : "today";
    Platform.storage.set(TAB_KEY, state.tab);
    if (rerender) render({ resetScroll: true });
  }

  function step(dir) {
    goTo(D.addDays(state.date, dir * (state.view === "week" ? 7 : 1)));
  }

  function openTask(id) {
    const t = Store.get(id);
    if (!t) return;
    if (t.start === null) return openForm({ id });
    const k = t.recurrence === "none" ? t.date : nextOccurrence(t);
    goTo(k, state.view === "week" ? "week" : "day");
    if (!Timeline.focusCard(id, k)) openForm({ id, date: k });
  }

  // ---------------------------------------------------------
  // Free time: the next slot inside the person's day
  // ---------------------------------------------------------
  function nextFreeSlot(date, duration) {
    const today = D.todayKey();
    const from = date < today ? today : date;
    for (let i = 0; i < 7; i++) {
      const k = D.addDays(from, i);
      let s = settings.dayStart;
      if (k === today) s = Math.max(s, Math.ceil((D.nowMinutes() + 1) / 15) * 15);
      const end = Math.min(1440, Math.max(settings.dayEnd, settings.dayStart + duration));
      for (let t = s; t + duration <= end; t += 15) {
        if (!Store.overlapsFor(k, t, duration).length) return { date: k, start: t };
      }
    }
    return { date: from, start: Math.min(settings.dayStart, 1440 - duration) };
  }

  // ---------------------------------------------------------
  // Task form (dialog)
  // ---------------------------------------------------------
  const dlg = $("#taskDialog");
  const f = {
    form: $("#taskForm"), title: $("#fTitle"), noTime: $("#fNoTime"), date: $("#fDate"), dateLabel: $("#fDateLabel"),
    start: $("#fStart"), duration: $("#fDuration"), repeat: $("#fRepeat"), until: $("#fUntil"), untilField: $("#fUntilField"),
    reminder: $("#fReminder"), alarm: $("#fAlarm"), course: $("#fCourse"), notes: $("#fNotes"), end: $("#fEnd"),
    warn: $("#overlapWarn"), save: $("#fSave"), del: $("#fDelete"), delDay: $("#fDeleteDay"), heading: $("#dlgTitle"),
    titleErr: $("#titleErr"), timeErr: $("#timeErr"), scope: $("#fScope"), scopeDay: $("#fScopeDay"),
    more: $("#fMore"), moreHint: $("#fMoreHint"),
  };
  let editingId = null;
  let editingDate = null; // the clicked day of a repeating task
  let overlapAcknowledged = false;

  function ensureDurationOption(min) {
    if (![...f.duration.options].some((o) => Number(o.value) === min)) {
      const o = new Option(D.fmtDuration(min), String(min));
      f.duration.add(o);
      [...f.duration.options]
        .sort((a, b) => a.value - b.value)
        .forEach((opt) => f.duration.add(opt));
    }
    f.duration.value = String(min);
  }

  const editing = () => (editingId ? Store.get(editingId) : null);
  const isRepeating = (t) => !!t && t.recurrence !== "none" && t.start !== null;
  const scopeValue = () => f.form.querySelector('input[name="scope"]:checked').value;

  // schedule: open a to-do as a timed task in the next free slot.
  function openForm({ id = null, date = state.date, start = null, todo = false, schedule = false } = {}) {
    if (state.pending) cancelPending();
    editingId = id;
    editingDate = date;
    overlapAcknowledged = false;
    const t = id ? Store.get(id) : null;
    const asTodo = t ? t.start === null && !schedule : todo;

    let s = t && t.start !== null ? t.start : start;
    let d = t ? (isRepeating(t) ? date : t.date) : date;
    if (s === null) {
      const slot = nextFreeSlot(d, t ? t.duration : 60);
      s = slot.start;
      d = slot.date;
    }

    f.heading.textContent = schedule ? "Schedule task" : t ? "Edit task" : "New task";
    f.title.value = t ? t.title : "";
    f.noTime.checked = asTodo;
    f.date.value = asTodo ? (t && t.due) || "" : d;
    f.date.dataset.timedValue = d; // restored if "No set time" is unticked
    f.date.dataset.dueValue = (t && t.due) || "";
    f.start.value = D.toInputTime(s);
    ensureDurationOption(t ? t.duration : 60);
    f.repeat.value = t ? t.recurrence : "none";
    f.until.value = (t && t.until) || "";
    // New tasks start with the defaults from Settings → Reminders.
    const reminder = t ? t.reminder : settings.remindBefore;
    f.reminder.value = reminder !== null ? String(reminder) : "";
    f.alarm.checked = t ? t.alarm : settings.alarmAtStart;
    f.course.value = t ? t.course : "";
    f.notes.value = t ? t.notes : "";
    const prio = t ? t.priority : "medium";
    f.form.querySelector(`input[name="priority"][value="${prio}"]`).checked = true;
    $("#courseList").innerHTML = Store.courses().map((c) => `<option value="${esc(c)}">`).join("");

    // Less-used fields stay folded unless this task already uses them.
    // (Reminder and alarm are usually set, so they don't open it; the folded line lists them.)
    f.more.open = !!t && (!!t.course || t.recurrence !== "none" || !!t.notes);

    const repeating = isRepeating(t);
    f.scope.hidden = !repeating;
    f.scopeDay.textContent = repeating ? `Only ${D.shortDate(date)}` : "This day only";
    f.form.querySelector('input[name="scope"][value="day"]').checked = true;
    f.del.hidden = !t;
    f.del.textContent = repeating ? "Delete all repeats" : "Delete";
    f.delDay.hidden = !repeating;
    f.titleErr.hidden = true;
    f.timeErr.hidden = true;
    updateFormFeedback();
    dlg.showModal();
    f.title.focus();
  }

  function formValues() {
    const todo = f.noTime.checked;
    return {
      title: f.title.value.trim(),
      date: todo ? editing()?.date || D.todayKey() : f.date.value,
      start: todo ? null : D.fromInputTime(f.start.value),
      duration: Number(f.duration.value),
      priority: f.form.querySelector('input[name="priority"]:checked').value,
      recurrence: todo ? "none" : f.repeat.value,
      until: todo || f.repeat.value === "none" ? null : f.until.value || null,
      reminder: todo || f.reminder.value === "" ? null : Number(f.reminder.value),
      alarm: !todo && f.alarm.checked,
      due: todo ? f.date.value || null : editing()?.due || null,
      course: f.course.value.trim(),
      notes: f.notes.value.trim(),
    };
  }

  // What's set inside "More options", shown on the folded line.
  function moreSummary(todo) {
    const bits = [];
    if (f.course.value.trim()) bits.push(f.course.value.trim());
    if (!todo && f.reminder.value !== "") bits.push(f.reminder.value === "0" ? "reminder at start" : `reminder ${f.reminder.value} min before`);
    if (!todo && f.alarm.checked) bits.push("alarm");
    if (!todo && f.repeat.value !== "none") bits.push(f.repeat.options[f.repeat.selectedIndex].text.toLowerCase());
    if (f.notes.value.trim()) bits.push("notes");
    return bits.length ? `· ${bits.join(" · ")}` : "";
  }

  function updateFormFeedback() {
    const todo = f.noTime.checked;
    f.moreHint.textContent = moreSummary(todo);
    f.form.querySelectorAll(".timed").forEach((el) => (el.hidden = todo));
    f.dateLabel.textContent = todo ? "Due date (optional)" : "Date";
    f.date.required = !todo;
    f.untilField.hidden = todo || f.repeat.value === "none";
    f.scope.hidden = todo || !isRepeating(editing());
    f.delDay.hidden = f.scope.hidden;

    const v = formValues();
    const label = editingId ? "Save changes" : todo ? "Add to-do" : "Add task";
    if (todo || v.start === null || !v.date) {
      f.end.textContent = "";
      f.warn.hidden = true;
      f.save.textContent = label;
      return;
    }
    const end = v.start + v.duration;
    f.end.textContent =
      end > 1440
        ? `Would end at ${D.fmtTime(end)} the next day. Tasks can't run past midnight yet.`
        : `Ends at ${D.fmtTime(end)} · ${D.fmtDuration(v.duration)}`;
    const conflicts = Store.overlapsFor(v.date, v.start, v.duration, editingId);
    if (conflicts.length) {
      const names = conflicts.slice(0, 2).map((c) => `“${c.title}” (${D.fmtRange(c.start, c.duration)})`).join(" and ");
      const more = conflicts.length > 2 ? ` and ${conflicts.length - 2} more` : "";
      f.warn.innerHTML = settings.warnOverlaps
        ? `<b>This overlaps ${esc(names)}${more}.</b> Change the time, or save anyway to keep both.`
        : `This overlaps ${esc(names)}${more}.`;
      f.warn.hidden = false;
    } else f.warn.hidden = true;
    f.save.textContent = conflicts.length && overlapAcknowledged ? "Save anyway" : label;
  }

  function onFormInput(e) {
    if (e.target === f.noTime) {
      // Swap what the date box means: the task's day, or the to-do's due date.
      if (f.noTime.checked) {
        f.date.dataset.timedValue = f.date.value;
        f.date.value = f.date.dataset.dueValue || "";
      } else {
        f.date.dataset.dueValue = f.date.value;
        f.date.value = f.date.dataset.timedValue || state.date;
      }
    }
    if (e.target !== f.title && e.target !== f.notes && e.target !== f.course) overlapAcknowledged = false;
    if (e.target === f.title && f.title.value.trim()) f.titleErr.hidden = true;
    f.timeErr.hidden = true;
    updateFormFeedback();
  }

  function timeError(msg) {
    f.timeErr.textContent = msg;
    f.timeErr.hidden = false;
  }

  function onFormSubmit(e) {
    e.preventDefault();
    const v = formValues();
    const t = editing();
    if (!v.title) {
      f.titleErr.hidden = false;
      f.title.focus();
      return;
    }
    if (v.start !== null) {
      if (!v.date) return timeError("Choose a date and start time.");
      if (v.start + v.duration > 1440) return timeError("This task would end after midnight. Pick an earlier start or a shorter length.");
      if (v.until && v.until < v.date) return timeError("“Until” has to be on or after the date.");
      const conflicts = Store.overlapsFor(v.date, v.start, v.duration, editingId);
      if (conflicts.length && settings.warnOverlaps && !overlapAcknowledged) {
        overlapAcknowledged = true;
        updateFormFeedback();
        f.warn.classList.remove("nudge");
        void f.warn.offsetWidth;
        f.warn.classList.add("nudge");
        f.save.focus();
        return;
      }
    }

    let msg;
    if (t && isRepeating(t) && v.start !== null && scopeValue() === "day") {
      const { recurrence, until, due, ...oneDay } = v;
      Store.detach(t.id, editingDate, oneDay, `Edit “${v.title}” on ${D.shortDate(editingDate)}`);
      msg = `Saved “${v.title}” for ${D.shortDate(v.date)} only.`;
    } else if (t && isRepeating(t) && v.start !== null) {
      // Every repeat: moving the date box shifts the whole series by the same number of days.
      const date = D.addDays(t.date, D.diffDays(editingDate, v.date));
      Store.update(t.id, { ...v, date }, `Edit every “${v.title}”`);
      msg = `Saved every “${v.title}”.`;
    } else if (t) {
      Store.update(t.id, v, `Edit “${v.title}”`);
      msg = v.start === null ? `Saved to-do “${v.title}”.` : `Saved “${v.title}” for ${D.shortDate(v.date)}, ${D.fmtTime(v.start)}.`;
    } else {
      Store.add(v);
      msg = v.start === null ? `Added “${v.title}” to your to-do list.` : `Added “${v.title}” for ${D.shortDate(v.date)}, ${D.fmtTime(v.start)}.`;
    }
    dlg.close();
    if (v.start !== null) showDate(v.date);
    render();
    toast(msg, { actions: [undoAction], key: "save" });
    if (v.reminder !== null || v.alarm) askForNotifications();
  }

  // ---------------------------------------------------------
  // Quick add — efficiency: one line of text becomes a task
  // ---------------------------------------------------------
  const DAY_NAMES = "sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat";
  const dayIndex = (word) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(word.slice(0, 3).toLowerCase());

  // "fri" = the coming Friday (today if it's Friday); "next fri" = Friday of next week.
  function dateForDay(word, next) {
    const today = D.todayKey();
    const idx = dayIndex(word);
    if (next) return D.addDays(D.startOfWeek(today), 7 + ((idx + 6) % 7));
    return D.addDays(today, (idx - D.dow(today) + 7) % 7);
  }

  // "#hci" reuses an existing course name ("HCI"); short new tags become capitals.
  function courseName(tag) {
    const known = Store.courses().find((c) => c.toLowerCase() === tag.toLowerCase());
    if (known) return known;
    return tag.length <= 4 ? tag.toUpperCase() : tag[0].toUpperCase() + tag.slice(1);
  }

  const to24 = (h, ap) => (h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0);

  function parseQuick(text) {
    let s = ` ${text} `;
    const out = {
      priority: "medium", duration: 60, start: null, date: state.date, recurrence: "none", course: "",
      todo: false, due: null, notes: [], dateSet: false, durationSet: false,
    };
    const grab = (re, fn) => {
      const m = s.match(re);
      if (m) {
        fn(m);
        s = s.replace(m[0], " ");
        return true;
      }
      return false;
    };
    const setDate = (k) => {
      out.date = k;
      out.dateSet = true;
    };

    grab(/\s!(high|hi|h|medium|med|m|low|lo|l)(?=\s)/i, (m) => {
      const c = m[1][0].toLowerCase();
      out.priority = c === "h" ? "high" : c === "l" ? "low" : "medium";
    });
    grab(/\s#([\p{L}\p{N}][\p{L}\p{N}_-]*)(?=\s)/iu, (m) => (out.course = courseName(m[1])));
    grab(/\s(every\s?day|daily)(?=\s)/i, () => (out.recurrence = "daily")) ||
      grab(/\s(weekdays|every\s?weekday)(?=\s)/i, () => (out.recurrence = "weekdays")) ||
      grab(/\s(weekly|every\s?week)(?=\s)/i, () => (out.recurrence = "weekly"));
    grab(/\s(due|by)(?=\s)/i, () => (out.todo = true));
    grab(/\s(noalarm|no\salarm)(?=\s)/i, () => (out.alarm = false)) || grab(/\s(alarm)(?=\s)/i, () => (out.alarm = true));

    // Days
    grab(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => setDate(D.addDays(D.todayKey(), 1))) ||
      grab(/\s(today|tonight)(?=\s)/i, () => setDate(D.todayKey())) ||
      grab(new RegExp(`\\snext\\s(${DAY_NAMES})(?=\\s)`, "i"), (m) => setDate(dateForDay(m[1], true))) ||
      grab(new RegExp(`\\s(?:on\\s)?(${DAY_NAMES})(?=\\s)`, "i"), (m) => setDate(dateForDay(m[1], false))) ||
      grab(/\sin\s(\d{1,3})\sdays?(?=\s)/i, (m) => setDate(D.addDays(D.todayKey(), Number(m[1])))) ||
      grab(/\s(?:in\sa\sweek|next\sweek)(?=\s)/i, () => setDate(D.addDays(D.todayKey(), 7)));

    // Time ranges: 9-11am, 9am-11am, 11-1pm, 14:00-16:00
    const range =
      grab(/\s(?:from\s)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?(am|pm)?\s?(?:-|–|to)\s?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?(am|pm)(?=\s)/i, (m) => {
        const endH = to24(Number(m[4]), m[6]);
        let startAp = m[3];
        if (!startAp) startAp = Number(m[1]) % 12 > Number(m[4]) % 12 ? "am" : m[6]; // 11-1pm starts in the morning
        const a = to24(Number(m[1]), startAp) * 60 + (m[2] ? Number(m[2]) : 0);
        const b = endH * 60 + (m[5] ? Number(m[5]) : 0);
        out.start = a;
        out.duration = b > a ? b - a : 60;
      }) ||
      grab(/\s(?:from\s)?([01]?\d|2[0-3]):([0-5]\d)\s?(?:-|–|to)\s?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => {
        const a = Number(m[1]) * 60 + Number(m[2]);
        const b = Number(m[3]) * 60 + Number(m[4]);
        out.start = a;
        out.duration = b > a ? b - a : 60;
      });

    if (!range) {
      grab(/\s(?:for\s)?(\d+(?:\.\d+)?)\s?(?:h|hr|hrs|hours?)(?:\s?(\d+)\s?(?:m|min|mins|minutes?))?(?=\s)/i, (m) => {
        out.duration = Math.round(parseFloat(m[1]) * 60 + (m[2] ? Number(m[2]) : 0));
        out.durationSet = true;
      }) || grab(/\s(?:for\s)?(\d+)\s?(?:m|min|mins|minutes?)(?=\s)/i, (m) => {
        out.duration = Number(m[1]);
        out.durationSet = true;
      });
      grab(/\s(?:at\s|@\s?)?(1[0-2]|0?[1-9])(?::([0-5]\d))?\s?(am|pm)(?=\s)/i, (m) => {
        out.start = to24(Number(m[1]), m[3]) * 60 + (m[2] ? Number(m[2]) : 0);
      }) ||
        grab(/\s(?:at\s|@\s?)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => (out.start = Number(m[1]) * 60 + Number(m[2]))) ||
        grab(/\s(?:at\s|@\s?)(1[3-9]|2[0-3]|1[0-2]|0?[1-9])(?=\s)/i, (m) => {
          // "at 3": 1–7 is probably afternoon, 8–11 morning, 12 noon. Shown as a guess.
          const h = Number(m[1]);
          const h24 = h >= 13 ? h : h === 12 ? 12 : h <= 7 ? h + 12 : h;
          out.start = h24 * 60;
          if (h <= 12) out.notes.push(`I guessed ${D.fmtTime(out.start)}. Add am or pm if that's wrong.`);
        });
    }

    out.duration = Math.min(Math.max(Math.round(out.duration / 5) * 5, 5), 1440);
    out.title = s
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(at|on|by|for|from|due)\s+/i, "")
      .replace(/\s+(at|on|by|for|from|due)$/i, "");

    // "due fri" / "by 5pm" is a deadline: a to-do, not a block of time.
    if (out.todo) {
      out.due = out.date;
      out.start = null;
      out.recurrence = "none";
      return out;
    }
    if (out.start !== null && out.start + out.duration > 1440) {
      out.notes.push(`Shortened to end at midnight (you asked for ${D.fmtDuration(out.duration)}).`);
      out.duration = 1440 - out.start;
    }
    out.autoTime = out.start === null;
    if (out.autoTime) {
      const slot = nextFreeSlot(out.date, out.duration);
      if (slot.date !== out.date) out.notes.push(`${out.dateSet ? D.shortDate(out.date) : "Today"} has no free time left in your day, so this goes on ${D.shortDate(slot.date)}.`);
      out.date = slot.date;
      out.start = slot.start;
    }
    return out;
  }

  let quickConfirmText = "";
  function updateQuickPreview() {
    const input = $("#quickAdd");
    const box = $("#quickPreview");
    const text = input.value.trim();
    box.classList.remove("warn");
    if (!text) {
      box.hidden = true; // the preview only shows while typing
      return null;
    }
    box.hidden = false;
    const q = parseQuick(text);
    if (!q.title) {
      box.textContent = "Type a name for the task.";
      return null;
    }
    const course = q.course ? ` · ${Timeline.courseTag(q.course)}` : "";
    let html;
    if (q.todo) {
      html = `<span class="qp-line">To-do${q.due ? ` · due ${D.shortDate(q.due)}` : ""} · ${Timeline.priorityTag(q.priority)}${course}</span>`;
    } else {
      const rep = { none: "", daily: " · Every day", weekdays: " · Weekdays", weekly: " · Every week" }[q.recurrence];
      html = `<span class="qp-line">${D.shortDate(q.date)} · ${D.fmtRange(q.start, q.duration)}${q.autoTime ? " (next free slot)" : ""} · ${Timeline.priorityTag(q.priority)}${course}${rep}</span>`;
    }
    q.notes.forEach((n) => (html += `<span class="qp-note">${esc(n)}</span>`));
    const conflicts = q.todo ? [] : Store.overlapsFor(q.date, q.start, q.duration);
    if (conflicts.length) {
      if (settings.warnOverlaps) {
        box.classList.add("warn");
        html += `<span class="qp-warn">⚠ Overlaps “${esc(conflicts[0].title)}”. Press Enter again to add it anyway.</span>`;
      } else html += `<span class="qp-note">Overlaps “${esc(conflicts[0].title)}”.</span>`;
    }
    box.innerHTML = html;
    return { q, conflicts: settings.warnOverlaps ? conflicts : [] };
  }

  function onQuickSubmit(e) {
    e.preventDefault();
    const input = $("#quickAdd");
    const res = updateQuickPreview();
    if (!res) {
      input.focus();
      return;
    }
    const { q, conflicts } = res;
    if (conflicts.length && quickConfirmText !== input.value) {
      quickConfirmText = input.value;
      $("#quickPreview").classList.remove("nudge");
      void $("#quickPreview").offsetWidth;
      $("#quickPreview").classList.add("nudge");
      return;
    }
    quickConfirmText = "";
    Store.add({
      title: q.title, date: q.todo ? D.todayKey() : q.date, start: q.start, duration: q.duration,
      priority: q.priority, recurrence: q.recurrence, notes: "", course: q.course, due: q.due,
      reminder: q.todo ? null : settings.remindBefore,
      alarm: !q.todo && (q.alarm === undefined ? settings.alarmAtStart : q.alarm),
    });
    input.value = "";
    if (!q.todo) showDate(q.date);
    render();
    updateQuickPreview();
    const msg = q.todo
      ? `Added “${q.title}” to your to-do list${q.due ? `, due ${D.shortDate(q.due)}` : ""}.`
      : `Added “${q.title}” for ${q.date === D.todayKey() ? "today" : D.shortDate(q.date)} at ${D.fmtTime(q.start)}.`;
    toast(msg, { actions: [undoAction], key: "save" });
  }

  // ---------------------------------------------------------
  // Reminders and alarms. Each task can have a heads-up before
  // it starts (default 15 min) and an alarm when it starts. In the
  // phone app the device delivers both even when DayFlow is
  // closed; in a browser they show while DayFlow is open.
  // ---------------------------------------------------------
  const FIRED_KEY = "dayflow.fired";
  const SNOOZE_KEY = "dayflow.snoozes";
  const SNOOZE_MIN = 5;
  const REMINDER_DAYS = 14;
  const fired = new Set();
  try {
    JSON.parse(Platform.storage.get(FIRED_KEY) || "[]").forEach((k) => fired.add(k));
  } catch (e) {}
  const reminderKey = (t, k) => `${t.id}|${k}|${t.start}|${t.reminder}`;
  const alarmKey = (t, k) => `${t.id}|${k}|${t.start}|alarm`;
  function markFired(key, k) {
    fired.add(key);
    Platform.storage.set(FIRED_KEY, JSON.stringify([...fired].filter((x) => x.includes(`|${k}|`))));
  }

  // Snoozed alarms are kept, so re-scheduling doesn't drop them. [{ id, date, title, at (ms) }]
  function snoozes() {
    try {
      return JSON.parse(Platform.storage.get(SNOOZE_KEY) || "[]").filter((s) => s.at > Date.now() - 10 * 60000);
    } catch (e) {
      return [];
    }
  }
  const saveSnoozes = (list) => Platform.storage.set(SNOOZE_KEY, JSON.stringify(list));
  const startDate = (k, start) => {
    const at = D.fromKey(k);
    at.setMinutes(start);
    return at;
  };
  const courseBit = (t) => (t.course ? ` · ${t.course}` : "");

  // Everything to ring in the next two weeks, for the device to schedule.
  function upcomingReminders() {
    const today = D.todayKey();
    const out = [];
    for (let i = 0; i < REMINDER_DAYS; i++) {
      const k = D.addDays(today, i);
      Store.tasksOn(k).forEach((t) => {
        if (t.done) return;
        const at = startDate(k, t.start);
        const range = D.fmtRange(t.start, t.duration);
        if (t.reminder !== null && (t.reminder > 0 || !t.alarm)) {
          out.push({
            kind: "reminder", key: reminderKey(t, k), title: t.title,
            body: t.reminder ? `In ${t.reminder} min · ${range}${courseBit(t)}` : `Starting now · ${range}${courseBit(t)}`,
            at: new Date(at - t.reminder * 60000), extra: { id: t.id, date: k },
          });
        }
        if (t.alarm) {
          out.push({
            kind: "alarm", key: alarmKey(t, k), title: `⏰ ${t.title}`,
            body: `Time to start · ${range}${courseBit(t)}`, at, extra: { id: t.id, date: k },
          });
        }
      });
    }
    snoozes().forEach((s) => {
      const t = Store.get(s.id);
      if (!t || t.doneDates.includes(s.date)) return;
      out.push({
        kind: "alarm", key: `${s.id}|${s.date}|snooze|${s.at}`, title: `⏰ ${t.title}`,
        body: "Snoozed alarm", at: new Date(s.at), extra: { id: s.id, date: s.date },
      });
    });
    return out.sort((a, b) => a.at - b.at);
  }

  let syncTimer = null;
  function scheduleReminderSync() {
    if (!Platform.reminders.native) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => Platform.reminders.sync(upcomingReminders()), 500);
  }

  function snoozeAlarm(id, date) {
    const t = Store.get(id);
    if (!t) return;
    const list = snoozes().filter((s) => !(s.id === id && s.date === date));
    list.push({ id, date, at: Date.now() + SNOOZE_MIN * 60000 });
    saveSnoozes(list);
    scheduleReminderSync();
    toast(`Snoozed “${t.title}” for ${SNOOZE_MIN} minutes.`, { key: "alarm" });
  }

  // The in-app alarm sound (browsers and the iPhone web app, while DayFlow is open).
  // The phone app doesn't need it: its notification rings with the same sound.
  let alarmAudio = null;
  function ringAlarm() {
    if (Platform.reminders.native) return;
    try {
      alarmAudio = alarmAudio || new Audio("sounds/dayflow-alarm.wav");
      alarmAudio.currentTime = 0;
      alarmAudio.play().catch(() => {}); // a browser may block sound until the page has been tapped
    } catch (e) {}
  }
  const stopAlarm = () => alarmAudio && alarmAudio.pause();

  function alarmToast(t, k) {
    ringAlarm();
    toast(`⏰ Time to start “${t.title}” (${D.fmtRange(t.start, t.duration)}).`, {
      kind: "reminder",
      timeout: 60000,
      key: `alarm-${t.id}`,
      actions: [
        { label: "Done", fn: () => { stopAlarm(); if (!Store.get(t.id).doneDates.includes(k)) toggleDone(t.id, k); } },
        { label: `Snooze ${SNOOZE_MIN} min`, fn: () => { stopAlarm(); snoozeAlarm(t.id, k); } },
      ],
    });
    Platform.reminders.show(`⏰ DayFlow: ${t.title}`, `Time to start · ${D.fmtTime(t.start)}`);
  }

  function checkReminders({ missed = false } = {}) {
    const k = D.todayKey();
    const now = D.nowMinutes();
    const passed = [];
    Store.tasksOn(k).forEach((t) => {
      if (t.done) return;
      // Heads-up before the start
      if (t.reminder !== null && (t.reminder > 0 || !t.alarm)) {
        const at = t.start - t.reminder;
        const key = reminderKey(t, k);
        if (!fired.has(key) && now >= at) {
          markFired(key, k);
          if (now > at + 10) {
            // Passed while DayFlow was closed: summarised once, only while the task hasn't ended.
            if (missed && now < t.start + t.duration) passed.push(t);
          } else {
            const when = t.reminder ? `starts in ${t.reminder} min, at ${D.fmtTime(t.start)}` : `starts now`;
            toast(`Reminder: “${t.title}” ${when}.`, {
              kind: "reminder",
              timeout: 30000,
              actions: [
                { label: "Mark done", fn: () => toggleDone(t.id, k) },
                { label: "Open", fn: () => openForm({ id: t.id, date: k }) },
              ],
            });
            Platform.reminders.show(`DayFlow: ${t.title}`, `${t.reminder ? "Starts" : "Starting"} at ${D.fmtTime(t.start)}`);
          }
        }
      }
      // Alarm at the start (only within its first 10 minutes; a late alarm is just noise)
      if (t.alarm) {
        const key = alarmKey(t, k);
        if (!fired.has(key) && now >= t.start) {
          markFired(key, k);
          if (now <= t.start + 10) alarmToast(t, k);
        }
      }
    });
    // Snoozed alarms that are due
    const due = snoozes().filter((s) => s.at <= Date.now());
    if (due.length) {
      saveSnoozes(snoozes().filter((s) => s.at > Date.now()));
      due.forEach((s) => {
        const t = Store.tasksOn(s.date).find((x) => x.id === s.id);
        if (t && !t.done) alarmToast(t, s.date);
      });
    }
    if (passed.length && !Platform.reminders.native) {
      const names = passed.slice(0, 2).map((t) => `“${t.title}” (${D.fmtTime(t.start)})`).join(" and ");
      toast(`While you were away: ${names}${passed.length > 2 ? ` and ${passed.length - 2} more` : ""}.`, {
        kind: "reminder",
        timeout: 20000,
        actions: [{ label: "Open", fn: () => openForm({ id: passed[0].id, date: k }) }],
      });
    }
  }

  // A notification (or one of the alarm's buttons) was tapped in the phone app.
  function onReminderAction(action, x) {
    if (!x.id || !x.date || !Store.get(x.id)) return;
    if (action === "done") {
      if (!Store.get(x.id).doneDates.includes(x.date)) toggleDone(x.id, x.date);
      return;
    }
    if (action === "snooze") return snoozeAlarm(x.id, x.date);
    goTo(x.date, "day");
    Timeline.focusCard(x.id, x.date);
  }

  async function updateNotifUI() {
    const perm = await Platform.reminders.permission();
    // Android: on-time alarms are normally allowed automatically; warn only if they're switched off.
    $("#exactWarn").hidden = !(Platform.reminders.native && perm === "granted" && !(await Platform.reminders.exactAllowed()));
    $("#notifBtn").hidden = perm !== "default";
    const native = Platform.reminders.native;
    $("#notifStatus").textContent = {
      granted: native ? "Reminders arrive even when DayFlow is closed." : "Desktop notifications are on while DayFlow is open.",
      denied: native
        ? "Notifications are turned off for DayFlow in your phone's settings. Reminders only show inside the app."
        : "Desktop notifications are blocked in this browser. Reminders still appear here in DayFlow.",
      unsupported: "This browser can’t show notifications. Reminders still appear here in DayFlow.",
      default: native
        ? "Allow notifications so reminders arrive even when DayFlow is closed."
        : "Reminders appear here in DayFlow while it's open. You can also allow desktop notifications.",
    }[perm];
  }

  // Asked the first time someone sets a reminder, not on page load.
  async function askForNotifications() {
    if ((await Platform.reminders.permission()) !== "default") return;
    await Platform.reminders.request();
    updateNotifUI();
    scheduleReminderSync();
  }

  // ---------------------------------------------------------
  // Theme: System (follows the device), Light or Dark.
  // Per device, not per account: people often want dark on the
  // phone and light on a laptop. index.html applies it before
  // the first paint; this keeps the button and Settings in step.
  // ---------------------------------------------------------
  const THEME_KEY = "dayflow.theme";
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");

  function themeChoice() {
    const t = Platform.storage.get(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  }
  const isDark = () => themeChoice() === "dark" || (themeChoice() === "system" && darkQuery.matches);

  function applyTheme() {
    const choice = themeChoice();
    const root = document.documentElement;
    if (choice === "system") delete root.dataset.theme;
    else root.dataset.theme = choice;
    const dark = isDark();
    const btn = $("#themeBtn");
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.classList.toggle("is-dark", dark);
    $("#themeSeg")
      .querySelectorAll("[data-theme-choice]")
      .forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeChoice === choice)));
    // Browser and phone status bar match the page.
    $('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue("--paper").trim();
    Platform.ui.statusBar(dark); // phone app: status bar icons and color follow
  }

  function setTheme(choice) {
    const root = document.documentElement;
    const apply = () => {
      // A short cross-fade of the colours, only for this switch (not on every hover or render).
      root.classList.add("theme-fade");
      setTimeout(() => root.classList.remove("theme-fade"), 350);
      if (choice === "system") Platform.storage.remove(THEME_KEY);
      else Platform.storage.set(THEME_KEY, choice);
      applyTheme();
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    // Day turning into night (or back): the sky fades out, the theme changes, the new sky fades in.
    root.classList.add("sky-fade");
    setTimeout(() => {
      apply();
      root.classList.remove("sky-fade");
    }, 200);
  }

  // ---------------------------------------------------------
  // Backgrounds: one choice per theme (built-in sky, none, or
  // the person's own photo). Photos are shrunk and kept on this
  // device (Platform.images); the veil is set from the photo's
  // brightness so text stays readable.
  // ---------------------------------------------------------
  const SKY = {
    day: { key: "dayflow.sky.day", img: "sky-day", cssVar: "--sky-day", veilVar: "--veil-day", attr: "skyDay", name: "Light mode", builtin: "Sky" },
    night: { key: "dayflow.sky.night", img: "sky-night", cssVar: "--sky-night", veilVar: "--veil-night", attr: "skyNight", name: "Dark mode", builtin: "Night sky" },
  };
  const skyUrls = {}; // object URLs of loaded photos

  function skyChoice(w) {
    try {
      return JSON.parse(Platform.storage.get(SKY[w].key)) || { mode: "builtin" };
    } catch (e) {
      return { mode: "builtin" };
    }
  }
  const saveSkyChoice = (w, c) => Platform.storage.set(SKY[w].key, JSON.stringify(c));

  async function applySky(w) {
    const s = SKY[w];
    const c = skyChoice(w);
    const root = document.documentElement;
    if (c.photo && !skyUrls[w]) {
      const blob = await Platform.images.get(s.img);
      if (blob) skyUrls[w] = URL.createObjectURL(blob);
      else {
        // The photo is gone (storage cleared): quietly back to the built-in sky.
        Object.assign(c, { mode: c.mode === "custom" ? "builtin" : c.mode, photo: false });
        saveSkyChoice(w, c);
      }
    }
    root.dataset[s.attr] = c.mode;
    if (c.mode === "custom" && skyUrls[w]) {
      root.style.setProperty(s.cssVar, `url("${skyUrls[w]}")`);
      root.style.setProperty(s.veilVar, String(c.veil));
    } else {
      root.style.removeProperty(s.cssVar);
      root.style.removeProperty(s.veilVar);
    }
  }

  async function applySkies() {
    await Promise.all([applySky("day"), applySky("night")]);
    document.documentElement.classList.remove("sky-loading");
    renderSkySettings();
  }

  function renderSkySettings() {
    Object.keys(SKY).forEach((w) => {
      const row = $(`.sky-row[data-sky="${w}"]`);
      const c = skyChoice(w);
      row.querySelectorAll("[data-sky-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.skyMode === c.mode)));
      const thumb = row.querySelector(".sky-thumb");
      thumb.hidden = !skyUrls[w];
      if (skyUrls[w]) thumb.src = skyUrls[w];
      row.querySelector("[data-sky-choose]").textContent = skyUrls[w] ? "Change photo…" : "Choose photo…";
      row.querySelector("[data-sky-remove]").hidden = !skyUrls[w];
    });
  }

  // Shrinks the photo (longest side 1600px, WebP or JPEG) and measures its average brightness (0–1).
  async function prepareImage(file) {
    if (file.size > 25 * 1024 * 1024) throw new Error("too big");
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    const small = document.createElement("canvas");
    small.width = small.height = 32;
    const sx = small.getContext("2d", { willReadFrequently: true });
    sx.drawImage(canvas, 0, 0, 32, 32);
    const px = sx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
    let blob = await toBlob("image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.82); // Safari can't make WebP
    return { blob, brightness: sum / (px.length / 4) };
  }

  // Brighter photos get a darker veil at night; darker photos a lighter veil by day.
  function veilFor(w, b) {
    const v = w === "night" ? 0.35 + (b - 0.25) * 0.8 : 0.2 + (0.75 - b) * 0.8;
    const [lo, hi] = w === "night" ? [0.35, 0.75] : [0.2, 0.6];
    return Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
  }

  const skyLabel = (w, mode) => (mode === "builtin" ? SKY[w].builtin : mode === "none" ? "none" : "your photo");

  async function setSkyMode(w, mode) {
    const prev = skyChoice(w);
    if (mode === prev.mode) return;
    if (mode === "custom" && !prev.photo) return chooseSkyPhoto(w);
    saveSkyChoice(w, { ...prev, mode });
    await applySky(w);
    renderSkySettings();
    toast(`${SKY[w].name} background: ${skyLabel(w, mode)}.`, {
      key: "sky",
      actions: [
        {
          label: "Undo",
          fn: async () => {
            saveSkyChoice(w, prev);
            await applySky(w);
            renderSkySettings();
          },
        },
      ],
    });
  }

  async function chooseSkyPhoto(w) {
    const file = await Platform.pickImage();
    if (!file) return;
    try {
      const { blob, brightness } = await prepareImage(file);
      await Platform.images.put(SKY[w].img, blob);
      if (skyUrls[w]) URL.revokeObjectURL(skyUrls[w]);
      skyUrls[w] = URL.createObjectURL(blob);
      saveSkyChoice(w, { mode: "custom", photo: true, veil: veilFor(w, brightness) });
      await applySky(w);
      renderSkySettings();
      toast(`${SKY[w].name} background set to your photo.`, { key: "sky" });
    } catch (e) {
      toast("That picture couldn't be used. Try a JPG or PNG under 25 MB.", { kind: "warn", key: "sky" });
    }
  }

  async function removeSkyPhoto(w) {
    await Platform.images.remove(SKY[w].img);
    if (skyUrls[w]) URL.revokeObjectURL(skyUrls[w]);
    delete skyUrls[w];
    const c = skyChoice(w);
    saveSkyChoice(w, { mode: c.mode === "custom" ? "builtin" : c.mode });
    await applySky(w);
    renderSkySettings();
    toast(`Photo removed. ${SKY[w].name} uses ${skyLabel(w, skyChoice(w).mode)}.`, { key: "sky" });
  }

  function onSkyClick(e) {
    const row = e.target.closest(".sky-row");
    if (!row) return;
    const w = row.dataset.sky;
    const modeBtn = e.target.closest("[data-sky-mode]");
    if (modeBtn) setSkyMode(w, modeBtn.dataset.skyMode);
    if (e.target.closest("[data-sky-choose]")) chooseSkyPhoto(w);
    if (e.target.closest("[data-sky-remove]")) removeSkyPhoto(w);
  }

  // ---------------------------------------------------------
  // iPhone: a one-time hint to install DayFlow from Safari
  // (Share → Add to Home Screen). Not shown in the phone app,
  // once installed, or after it's dismissed.
  // ---------------------------------------------------------
  const HINT_KEY = "dayflow.installHint";
  function showInstallHint() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios || Platform.native || Platform.standalone() || Platform.storage.get(HINT_KEY)) return;
    toast("Install DayFlow: tap Share, then “Add to Home Screen”. It then opens like an app and works offline.", {
      timeout: 0,
      key: "install",
      actions: [{ label: "Got it", fn: () => Platform.storage.set(HINT_KEY, "1") }],
      dismissable: false,
    });
  }

  // ---------------------------------------------------------
  // Settings and backup
  // ---------------------------------------------------------
  const BACKUP_KEY = "dayflow.lastBackup";

  function renderSettings() {
    $("#setDayStart").value = D.toInputTime(settings.dayStart);
    $("#setDayEnd").value = D.toInputTime(settings.dayEnd % 1440);
    $("#setWarnOverlaps").checked = settings.warnOverlaps;
    $("#setRemind").value = settings.remindBefore === null ? "" : String(settings.remindBefore);
    $("#setAlarm").checked = settings.alarmAtStart;
    const last = Platform.storage.get(BACKUP_KEY);
    const n = last ? D.diffDays(last, D.todayKey()) : null;
    const status = $("#backupStatus");
    status.textContent =
      Sync.user() && n === null
        ? "Your tasks are saved in your account. A backup file is optional."
        : n === null
        ? "No backup yet. Your tasks live only on this device."
        : n === 0 ? "Last backup: today." : `Last backup: ${n} day${n === 1 ? "" : "s"} ago.`;
    status.classList.toggle("nudge-text", !Sync.user() && (n === null || n > 14));
  }

  function onSettingsChange() {
    const a = D.fromInputTime($("#setDayStart").value);
    let b = D.fromInputTime($("#setDayEnd").value);
    if (b === 0) b = 1440; // "ends at 00:00" means midnight
    if (a !== null && b !== null && b - a >= 60) {
      settings.dayStart = a;
      settings.dayEnd = b;
    } else toast("Your day needs to be at least an hour long.", { kind: "warn", timeout: 3000, key: "settings" });
    settings.warnOverlaps = $("#setWarnOverlaps").checked;
    settings.remindBefore = $("#setRemind").value === "" ? null : Number($("#setRemind").value);
    settings.alarmAtStart = $("#setAlarm").checked;
    saveSettings();
    if (Sync.user()) Sync.pushSettings({ ...settings });
    renderSettings();
    render();
    updateQuickPreview();
  }

  async function exportBackup() {
    const today = D.todayKey();
    try {
      await Platform.saveFile(`dayflow-backup-${today}.json`, Store.exportJSON());
      Platform.storage.set(BACKUP_KEY, today);
      renderSettings();
      toast("Backup saved. Keep the file somewhere safe, like your cloud drive.", { key: "backup" });
    } catch (e) {
      toast("Couldn't save the backup.", { kind: "warn", key: "backup" });
    }
  }

  async function importBackup() {
    const text = await Platform.openFile();
    if (text === null) return;
    let list;
    try {
      list = Store.readBackup(text);
    } catch (e) {
      toast("That file isn't a DayFlow backup.", { kind: "warn", key: "backup" });
      return;
    }
    const done = (mode) => {
      Store.importTasks(list, mode);
      render();
      toast(mode === "replace" ? `Restored ${list.length} tasks.` : `Added tasks from the backup.`, { actions: [undoAction], key: "backup" });
    };
    toast(`The backup has ${list.length} tasks.`, {
      timeout: 0,
      key: "backup",
      actions: [
        { label: "Replace mine", fn: () => done("replace") },
        { label: "Add to mine", fn: () => done("merge") },
      ],
    });
  }

  // ---------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------
  // Search and Settings live in their own dialogs, to keep the main screen calm.
  const searchDlg = $("#searchDialog");
  const settingsDlg = $("#settingsDialog");
  const anyDialogOpen = () => [...document.querySelectorAll("dialog")].some((d) => d.open);

  function focusSearch() {
    if (!searchDlg.open) searchDlg.showModal();
    $("#searchBox").focus();
    $("#searchBox").select();
    renderSearch();
  }

  function openSettings() {
    renderSettings();
    updateNotifUI();
    settingsDlg.showModal();
  }

  function onGlobalKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    // Nothing behind the welcome page reacts to keys; Esc closes it only when opened from the top bar.
    if (!welcome.hidden) {
      if (e.key === "Escape" && welcomeClosable) closeWelcome();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing && !anyDialogOpen()) {
      e.preventDefault();
      doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && (!anyDialogOpen() || searchDlg.open)) {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (anyDialogOpen() || typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && state.pending) {
      cancelPending();
      return;
    }
    const k = e.key.toLowerCase();
    const map = {
      n: () => openForm(),
      "/": () => $("#quickAdd").focus(),
      f: focusSearch,
      t: () => goTo(D.todayKey()),
      d: () => setView("day"),
      w: () => setView("week"),
      arrowleft: () => step(-1),
      arrowright: () => step(1),
    };
    if (map[k] && !(k.startsWith("arrow") && e.target.closest && e.target.closest(".card"))) {
      e.preventDefault();
      map[k]();
    }
  }

  // ---------------------------------------------------------
  // Accounts (optional): sign in to save tasks online and sync
  // devices. Each account has its own store on the device.
  // ---------------------------------------------------------
  const authDlg = $("#authDialog");
  let authMode = "signin"; // signin | signup
  let signedInAs = null; // id of the account whose store is open
  let viewStale = false; // tasks changed from another device while something was open
  let signOutAnyway = false;

  const validEmail = (s) => /^\S+@\S+\.\S+$/.test(s);

  // The account dialog has two views: the signed-in panel and "choose a new password".
  // Signing in and creating an account happen on the welcome page.
  function showAuthView(view) {
    $("#acctView").hidden = view !== "account";
    $("#newPwForm").hidden = view !== "newpw";
    $("#authTitle").textContent = view === "newpw" ? "New password" : "Your account";
  }

  // ---- Welcome page (sign in / create account / continue without) ----
  const welcome = $("#welcome");
  const GUEST_KEY = "dayflow.guest"; // "continue without an account" was chosen on this device
  let welcomeClosable = false; // opened from the top bar (can be closed), or the first thing people see

  function openWelcome({ closable = false } = {}) {
    if (!Sync.enabled) return;
    welcomeClosable = closable;
    setAuthMode(authMode);
    welcome.hidden = false;
    $(".app").inert = true; // keyboard and screen readers stay on the welcome page
    document.body.classList.add("welcome-open");
    setTimeout(() => $("#authEmail").focus(), 50);
  }

  function closeWelcome() {
    welcome.hidden = true;
    $(".app").inert = false;
    document.body.classList.remove("welcome-open");
  }

  function continueWithout() {
    Platform.storage.set(GUEST_KEY, "1");
    closeWelcome();
    toast("You're using DayFlow without an account. Your tasks stay on this device; you can sign in any time.", {
      key: "auth",
    });
  }

  // field: the input at fault (marked and focused), or none.
  function authMessage(err = "", ok = "", field = null) {
    $("#authErr").textContent = err;
    $("#authErr").hidden = !err;
    $("#authOk").textContent = ok;
    $("#authOk").hidden = !ok;
    ["#authEmail", "#authPassword"].forEach((s) => $(s).removeAttribute("aria-invalid"));
    if (field) {
      $(field).setAttribute("aria-invalid", "true");
      $(field).focus();
    }
  }

  // One card, two modes: sign in, or create an account. The typed email stays when switching.
  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === "signup";
    $("#welcomeTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("#welcomeSub").textContent = signup ? "It's free. Your tasks stay in sync on all your devices." : "Sign in to see your tasks.";
    $("#authSubmit").textContent = signup ? "Create account" : "Sign in";
    $("#authSwitchText").textContent = signup ? "Already have an account?" : "New here?";
    $("#authSwitch").textContent = signup ? "Sign in" : "Create an account";
    $("#authPassword").autocomplete = signup ? "new-password" : "current-password";
    $("#pwHint").hidden = !signup;
    $("#authForgot").hidden = signup;
    authMessage();
  }

  function openAccount() {
    $("#acctErr").hidden = true;
    signOutAnyway = false;
    if (!Sync.user()) return openWelcome({ closable: true });
    $("#deleteConfirm").value = "";
    $("#deleteAcctBtn").disabled = true;
    renderAccount();
    showAuthView("account");
    authDlg.showModal();
  }

  function timeAgo(d) {
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    return `at ${D.fmtTime(d.getHours() * 60 + d.getMinutes())}`;
  }

  function syncText(st) {
    return {
      idle: "Not synced yet.",
      syncing: "Saving…",
      synced: `Saved online ${st.at ? timeAgo(st.at) : ""}.`,
      offline: "Offline. Changes are kept on this device and sent when you're back online.",
      error: "Couldn't reach the server. DayFlow will try again.",
    }[st.state];
  }

  function renderAccount() {
    const btn = $("#accountBtn");
    btn.hidden = !Sync.enabled;
    if (!Sync.enabled) return;
    const u = Sync.user();
    const st = Sync.status();
    const initial = u ? (u.email || "?")[0].toUpperCase() : "";
    $("#acctAvatar").textContent = initial;
    $("#acctAvatar").hidden = !u;
    $("#acctLabel").textContent = u ? "" : "Sign in";
    $("#acctLabel").hidden = !!u;
    $("#syncDot").hidden = !u;
    $("#syncDot").className = `sync-dot ${st.state}`;
    btn.classList.toggle("signed-in", !!u);
    btn.setAttribute("aria-label", u ? `Account: ${u.email}. ${syncText(st)}` : "Sign in");
    btn.title = u ? `${u.email} · ${syncText(st)}` : "Sign in"; // the tooltip names the icon-only phone button
    if (u) {
      $("#acctEmail").textContent = u.email;
      $("#acctAvatarBig").textContent = initial;
      $("#acctSync").textContent = syncText(st);
    }
  }

  async function onAuthSubmit(e) {
    e.preventDefault();
    const email = $("#authEmail").value.trim();
    const pw = $("#authPassword").value;
    if (!validEmail(email)) return authMessage("Enter your email address.", "", "#authEmail");
    if (pw.length < 8) return authMessage("Passwords are at least 8 characters.", "", "#authPassword");
    const btn = $("#authSubmit");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
    authMessage();
    try {
      if (authMode === "signup") {
        const { needsConfirm } = await Sync.signUp(email, pw);
        if (needsConfirm) {
          setAuthMode("signin");
          authMessage("", `Almost done: we sent a link to ${email}. Click it, then sign in here.`);
          return;
        }
      } else await Sync.signIn(email, pw);
      $("#authPassword").value = "";
      Platform.storage.remove(GUEST_KEY);
      closeWelcome();
      toast(`Signed in as ${email}. Your tasks are saved online.`, { key: "auth" });
    } catch (err) {
      authMessage(err.message, "", /password/i.test(err.message) ? "#authPassword" : null);
    } finally {
      btn.disabled = false;
      if (btn.textContent.endsWith("…")) btn.textContent = label;
    }
  }

  async function onForgot() {
    const email = $("#authEmail").value.trim();
    if (!validEmail(email)) return authMessage("Type your email above, then press “Forgot?” again.", "", "#authEmail");
    try {
      await Sync.sendPasswordReset(email);
      authMessage("", `If there's an account for ${email}, a link to set a new password is on its way.`);
    } catch (err) {
      authMessage(err.message);
    }
  }

  async function onNewPassword(e) {
    e.preventDefault();
    const pw = $("#newPw").value;
    const err = $("#newPwErr");
    if (pw.length < 8) {
      err.textContent = "Use at least 8 characters.";
      err.hidden = false;
      return;
    }
    try {
      await Sync.setNewPassword(pw);
      $("#newPw").value = "";
      authDlg.close();
      toast("New password saved.", { key: "auth" });
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  }

  function applySettings(s) {
    if (!s) return;
    if (Number.isFinite(s.dayStart) && Number.isFinite(s.dayEnd) && s.dayEnd - s.dayStart >= 60) {
      settings.dayStart = s.dayStart;
      settings.dayEnd = s.dayEnd;
    }
    if (typeof s.warnOverlaps === "boolean") settings.warnOverlaps = s.warnOverlaps;
    if (s.remindBefore === null || [0, 5, 10, 15, 30, 60].includes(s.remindBefore)) settings.remindBefore = s.remindBefore;
    if (typeof s.alarmAtStart === "boolean") settings.alarmAtStart = s.alarmAtStart;
  }

  // Re-render after another device's changes, unless the person is in the middle of something.
  function showRemoteChanges() {
    if (dlg.open || Timeline.isDragging() || state.pending) viewStale = true;
    else render();
  }

  async function refreshFromCloud() {
    const remote = await Sync.pullSettings();
    if (remote) {
      applySettings(remote);
      saveSettings();
      renderSettings();
    }
    if (await Sync.syncNow()) showRemoteChanges();
  }

  // The first time an account is used on a device that has tasks without an account.
  function offerGuestTasks(u) {
    const asked = `${Sync.userKey(u)}.offered`;
    if (Platform.storage.get(asked)) return;
    const guest = Store.peek(Store.GUEST_KEY).filter((t) => !t.sample);
    if (!guest.length) return;
    const n = guest.length;
    toast(`Add the ${n} task${n === 1 ? "" : "s"} on this device to your account?`, {
      timeout: 0,
      key: "adopt",
      actions: [
        {
          label: "Add them",
          fn: () => {
            Platform.storage.set(asked, "1");
            Store.importTasks(guest, "merge"); // saving pushes them online
            render();
            toast(`Added ${n} task${n === 1 ? "" : "s"} to your account.`, { actions: [undoAction], key: "adopt" });
          },
        },
        { label: "Not now", fn: () => Platform.storage.set(asked, "1") },
      ],
    });
  }

  // Opens this account's tasks on the device, then fetches what changed online.
  async function enterAccount(u) {
    if (signedInAs === u.id) return; // Supabase also reports token refreshes as sign-ins
    signedInAs = u.id;
    state.pending = null;
    closeToastKey("pending");
    Store.open(Sync.userKey(u));
    render({ resetScroll: true });
    renderAccount();
    await refreshFromCloud();
    offerGuestTasks(u);
  }

  // Back to the tasks without an account. The account's copy is removed from this device
  // (it's saved online), so the next person using it can't see it.
  function leaveAccount() {
    if (!signedInAs) return;
    const key = Store.key();
    signedInAs = null;
    Store.forget(key);
    Platform.storage.remove(`${key}.pulled`);
    if (!Store.open(Store.GUEST_KEY)) Store.seed([]);
    closeToastKey("adopt");
    render({ resetScroll: true });
    renderAccount();
  }

  async function doSignOut() {
    const btn = $("#signOutBtn");
    btn.disabled = true;
    await Sync.push();
    const left = Store.changes();
    if ((left.upserts.length || left.deletes.length) && !signOutAnyway) {
      signOutAnyway = true;
      $("#acctErr").textContent =
        "Some changes aren't saved online yet (you seem to be offline). Signing out now loses them. Press Sign out again to sign out anyway.";
      $("#acctErr").hidden = false;
      btn.disabled = false;
      return;
    }
    await Sync.signOut();
    leaveAccount();
    btn.disabled = false;
    authDlg.close();
    toast("Signed out. Your tasks are saved in your account.", { key: "auth" });
    Platform.storage.remove(GUEST_KEY);
    openWelcome(); // sign in again, as someone else, or continue without
  }

  async function doDeleteAccount() {
    const keep = Store.all().filter((t) => !t.sample);
    const btn = $("#deleteAcctBtn");
    btn.disabled = true;
    try {
      await Sync.deleteAccount();
    } catch (err) {
      $("#acctErr").textContent = err.message;
      $("#acctErr").hidden = false;
      btn.disabled = false;
      return;
    }
    leaveAccount();
    Store.importTasks(keep, "merge"); // a copy stays on this device, without an account
    Platform.storage.set(GUEST_KEY, "1");
    render();
    authDlg.close();
    toast("Your account and its online data were deleted. Your tasks are still on this device.", { key: "auth" });
  }

  function onAuthEvent(event, u) {
    if (event === "PASSWORD_RECOVERY") {
      if (!authDlg.open) authDlg.showModal();
      $("#newPwErr").hidden = true;
      showAuthView("newpw");
    }
    if (u) {
      closeWelcome(); // e.g. signed in by the link in a confirmation or reset email
      enterAccount(u);
    } else leaveAccount();
    renderAccount();
  }

  function wireAccounts() {
    if (!Sync.enabled) return;
    $("#accountBtn").addEventListener("click", openAccount);
    $("#authClose").addEventListener("click", () => authDlg.close());
    $("#welcomeSkip").addEventListener("click", continueWithout);
    authDlg.addEventListener("click", (e) => {
      if (e.target === authDlg) authDlg.close();
    });
    $("#authSwitch").addEventListener("click", () => {
      setAuthMode(authMode === "signup" ? "signin" : "signup");
      $("#authEmail").focus();
    });
    $("#authForm").addEventListener("submit", onAuthSubmit);
    $("#authForgot").addEventListener("click", onForgot);
    $("#authShowPw").addEventListener("click", (e) => {
      const show = $("#authPassword").type === "password";
      $("#authPassword").type = show ? "text" : "password";
      e.currentTarget.setAttribute("aria-pressed", String(show));
      e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
    $("#newPwForm").addEventListener("submit", onNewPassword);
    $("#syncNowBtn").addEventListener("click", refreshFromCloud);
    $("#signOutBtn").addEventListener("click", doSignOut);
    $("#deleteConfirm").addEventListener("input", (e) => ($("#deleteAcctBtn").disabled = e.target.value.trim() !== "DELETE"));
    $("#deleteAcctBtn").addEventListener("click", doDeleteAccount);
    Sync.onStatus(renderAccount);
    Sync.onAuth(onAuthEvent);
    window.addEventListener("online", refreshFromCloud);
  }

  // Android back button: close what's open before leaving the app.
  function onBack() {
    if (!welcome.hidden) {
      if (!welcomeClosable) return false; // first screen: Back leaves the app
      closeWelcome();
      return true;
    }
    const open = [...document.querySelectorAll("dialog")].reverse().find((d) => d.open);
    if (open) {
      open.close();
      return true;
    }
    if (state.pending) {
      cancelPending();
      return true;
    }
    // On a phone, Back from Week or To-do returns to Today before leaving the app.
    if (isPhone() && state.tab !== "today") {
      setTab("today");
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------
  async function init() {
    loadSettings();
    // Signed in on this device: open that account's tasks (works offline too).
    const u = await Sync.init();
    if (u) {
      signedInAs = u.id;
      Store.open(Sync.userKey(u));
    } else if (!Store.load()) Store.seed(makeExamples());
    if (Platform.storage.get("dayflow.view") === "week") state.view = "week";
    const savedTab = Platform.storage.get(TAB_KEY);
    state.tab = savedTab === "todo" ? "todo" : state.view === "week" ? "week" : "today";
    document.querySelector(".tabbar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (b) setTab(b.dataset.tab);
    });
    Store.onSave(() => {
      scheduleReminderSync();
      Sync.schedulePush();
    });
    wireAccounts();

    Timeline.init($("#timeline"), {
      onOpen: (id, date) => openForm({ id, date }),
      onToggle: toggleDone,
      onDelete: deleteDay,
      onGoto: (date) => goTo(date, "day"),
      onCreateAt: (date, start) => openForm({ date, start }),
      onDrop,
      onKeyMove: (m) => commitMove(m, { fromKeyboard: true }),
      onSwipe,
      onRerender: () => render(),
    });

    $("#prevBtn").addEventListener("click", () => step(-1));
    $("#nextBtn").addEventListener("click", () => step(1));
    $("#todayBtn").addEventListener("click", () => goTo(D.todayKey()));
    $("#dayViewBtn").addEventListener("click", () => setView("day"));
    $("#weekViewBtn").addEventListener("click", () => setView("week"));
    $("#newBtn").addEventListener("click", () => openForm());
    $("#clearExamples").addEventListener("click", () => {
      Store.clearExamples();
      render();
      toast("Example tasks cleared. Your planner is empty and ready.", { actions: [undoAction], key: "save" });
    });

    f.form.addEventListener("input", onFormInput);
    f.form.addEventListener("change", onFormInput);
    f.form.addEventListener("submit", onFormSubmit);
    $("#fCancel").addEventListener("click", () => dlg.close());
    $("#dlgClose").addEventListener("click", () => dlg.close());
    f.del.addEventListener("click", () => {
      const id = editingId;
      dlg.close();
      deleteTask(id);
    });
    f.delDay.addEventListener("click", () => {
      const id = editingId;
      dlg.close();
      deleteDay(id, editingDate);
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close(); // click on backdrop
    });

    $("#quickForm").addEventListener("submit", onQuickSubmit);
    $("#quickAdd").addEventListener("input", () => {
      quickConfirmText = "";
      updateQuickPreview();
    });

    moveSheet.addEventListener("click", onMoveSheetClick);
    enableListSwipe($("#todos"), (li) => {
      const b = li.querySelector("[data-td-done]");
      return b ? { id: b.dataset.tdDone, date: D.todayKey() } : null;
    });
    enableListSwipe($("#leftovers"), (li) => {
      const b = li.querySelector("[data-lo-done]");
      const t = b && Store.get(b.dataset.loDone);
      return t ? { id: t.id, date: t.date } : null;
    });
    $("#leftovers").addEventListener("click", (e) => {
      const el = e.target.closest("[data-lo-done],[data-lo-move],[data-lo-del]");
      if (!el) return;
      const { loDone, loMove, loDel } = el.dataset;
      if (loDone) toggleDone(loDone, Store.get(loDone).date);
      if (loMove) reschedule(loMove);
      if (loDel) deleteTask(loDel);
    });
    $("#todos").addEventListener("click", (e) => {
      const el = e.target.closest("[data-td-done],[data-td-open],[data-td-schedule]");
      if (!el) return;
      const { tdDone, tdOpen, tdSchedule } = el.dataset;
      if (tdDone) toggleTodo(tdDone);
      if (tdOpen) openForm({ id: tdOpen });
      if (tdSchedule) openForm({ id: tdSchedule, schedule: true });
    });
    $("#searchBox").addEventListener("input", renderSearch);
    $("#searchResults").addEventListener("click", (e) => {
      const el = e.target.closest("[data-sr-open]");
      if (!el) return;
      searchDlg.close();
      openTask(el.dataset.srOpen);
    });
    $("#searchBtn").addEventListener("click", focusSearch);
    $("#searchClose").addEventListener("click", () => searchDlg.close());
    $("#settingsBtn").addEventListener("click", openSettings);
    $("#themeBtn").addEventListener("click", () => setTheme(isDark() ? "light" : "dark"));
    $("#themeSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-choice]");
      if (b) setTheme(b.dataset.themeChoice);
    });
    darkQuery.addEventListener("change", applyTheme);
    settingsDlg.addEventListener("click", onSkyClick);
    applySkies();
    applyTheme();
    $("#settingsClose").addEventListener("click", () => settingsDlg.close());
    [searchDlg, settingsDlg].forEach((d) =>
      d.addEventListener("click", (e) => {
        if (e.target === d) d.close(); // click on backdrop
      })
    );
    $("#todoMore").addEventListener("click", () => {
      todosExpanded = !todosExpanded;
      renderTodos();
    });

    ["#setDayStart", "#setDayEnd", "#setWarnOverlaps", "#setRemind", "#setAlarm"].forEach((s) =>
      $(s).addEventListener("change", onSettingsChange)
    );
    $("#exactBtn").addEventListener("click", async () => {
      await Platform.reminders.openExactSetting();
      updateNotifUI();
    });
    $("#exportBtn").addEventListener("click", exportBackup);
    $("#importBtn").addEventListener("click", importBackup);
    $("#notifBtn").addEventListener("click", async () => {
      await Platform.reminders.request();
      updateNotifUI();
      scheduleReminderSync();
    });
    document.addEventListener("keydown", onGlobalKey);
    Platform.onBack(onBack);
    Platform.reminders.setup();
    Platform.reminders.onAction(onReminderAction);

    render({ resetScroll: true });
    renderSettings();
    renderAccount();
    updateQuickPreview();
    updateNotifUI();
    scheduleReminderSync();
    if (u) refreshFromCloud();
    Platform.ui.hideSplash();
    Platform.registerOffline((apply) =>
      toast("A new version of DayFlow is ready.", { timeout: 0, key: "update", actions: [{ label: "Reload", fn: apply }] })
    );
    showInstallHint();
    // Accounts set up, nobody signed in, and no "continue without" yet: start on the welcome page.
    if (Sync.enabled && !u && !Platform.storage.get(GUEST_KEY)) openWelcome();
    else showSwipeTip();

    // Keep the "now" line, progress and reminders current.
    let lastMinute = D.nowMinutes();
    let lastDay = D.todayKey();
    let lastPull = Date.now();
    const tick = () => {
      checkReminders();
      // Signed in: look for changes from other devices about once a minute while visible.
      if (Sync.user() && document.visibilityState === "visible" && Date.now() - lastPull > 60000) {
        lastPull = Date.now();
        Sync.pull().then((changed) => changed && showRemoteChanges());
      }
      if (Timeline.isDragging() || dlg.open) return;
      const m = D.nowMinutes();
      if (m === lastMinute && !viewStale) return;
      lastMinute = m;
      viewStale = false;
      const day = D.todayKey();
      if (day !== lastDay) {
        if (state.date === lastDay) state.date = day; // rolled past midnight
        scheduleReminderSync();
      }
      lastDay = day;
      render();
    };
    setInterval(tick, 15000);
    Platform.onResume(() => {
      checkReminders({ missed: true });
      if (Sync.user()) {
        lastPull = Date.now();
        refreshFromCloud();
      }
      tick();
    });
    checkReminders({ missed: true });
  }

  Platform.ready().then(init);
})();
