/* =========================================================
   DayFlow — timeline
   Renders the day and week planner pages, and handles direct
   manipulation: drag to move, drag the bottom edge to resize,
   keyboard moves, click an empty slot to add.
   ========================================================= */

const Timeline = (() => {
  let root;
  let cb = {};
  let state = { view: "day", date: DateUtil.todayKey(), pending: null, flash: null };
  let drag = null;
  let justDragged = false;

  const SNAP = 15; // minutes
  const HOLD_MS = 300; // touch: hold this long to pick a card up
  const hourPx = () => (state.view === "week" ? 48 : 64);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };
  // Shapes pair with colour so priority never depends on colour alone.
  const SHAPES = {
    high: '<svg class="shape" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .8 9.6 9.2H.4z"/></svg>',
    medium: '<svg class="shape" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .4 9.6 5 5 9.6.4 5z"/></svg>',
    low: '<svg class="shape" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4.2"/></svg>',
  };
  const CHECK_SVG =
    '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.4"/><path d="M6 10.4l2.7 2.7L14.2 7.4"/></svg>';

  function priorityTag(p) {
    return `<span class="prio-tag">${SHAPES[p]}<span class="prio-text">${PRIORITY_LABEL[p]}</span></span>`;
  }

  const courseTag = (c) => (c ? `<span class="course-tag">${esc(c)}</span>` : "");

  function init(el, callbacks) {
    root = el;
    cb = callbacks;
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    // Once a card is picked up by touch, stop the page from scrolling under the finger.
    root.addEventListener("touchmove", (e) => drag && drag.armed && e.preventDefault(), { passive: false });
    root.addEventListener("contextmenu", (e) => e.target.closest(".card") && e.preventDefault());
  }

  // Task occurrences for a column, with any unconfirmed move applied.
  function instancesFor(date) {
    let list = Store.tasksOn(date);
    const p = state.pending;
    if (p && (date === p.fromDate || date === p.toDate)) {
      const t = Store.get(p.id);
      // A repeating task keeps its own occurrence on the day one copy moves to.
      if (date === p.fromDate) list = list.filter((x) => x.id !== p.id);
      if (date === p.toDate && t) {
        list.push({
          ...t, key: `${t.id}~moving`, instanceDate: date, done: t.doneDates.includes(p.fromDate),
          start: p.start, duration: p.duration, pending: true,
        });
      }
    }
    return list;
  }

  function cardHtml(t, lane, list) {
    const h = hourPx();
    const top = (t.start / 60) * h;
    const height = Math.max((t.duration / 60) * h, 18) - 2;
    const compact = height < 42;
    const tiny = height < 26;
    const overlaps = list.some(
      (o) => o.id !== t.id && o.start < t.start + t.duration && t.start < o.start + o.duration
    );
    const range = DateUtil.fmtRange(t.start, t.duration);
    const repeat = t.recurrence !== "none";
    const label = [
      t.title, range, t.course, `${PRIORITY_LABEL[t.priority]} priority`,
      repeat ? "repeats" : "", overlaps ? "overlaps another task" : "", t.done ? "done" : "not done",
    ].filter(Boolean).join(", ");
    const cls = [
      "card", `p-${t.priority}`, t.done && "done", compact && "compact", tiny && "tiny", overlaps && "has-overlap",
      t.pending && "pending",
      state.flash && state.flash.id === t.id && state.flash.date === t.instanceDate && "just-done",
    ].filter(Boolean).join(" ");
    const style = `top:${top}px;height:${height}px;left:calc(${lane.lane} * 100% / ${lane.lanes} + 3px);width:calc(100% / ${lane.lanes} - 6px)`;

    return `<div class="${cls}" style="${style}" data-id="${t.id}" data-date="${t.instanceDate}" tabindex="0"
      role="group" aria-roledescription="task" aria-label="${esc(label)}" aria-describedby="cardHint">
      <button class="check" type="button" aria-pressed="${t.done}" aria-label="${t.done ? "Mark not done" : "Mark done"}: ${esc(t.title)}">${CHECK_SVG}</button>
      <div class="card-body">
        <span class="card-title">${esc(t.title)}</span>
        <span class="card-meta">
          <span class="card-time">${range}</span>${priorityTag(t.priority)}
          ${courseTag(t.course)}
          ${repeat ? '<span class="rep" title="Repeats">↻ Repeats</span>' : ""}
          ${overlaps ? '<span class="ov">⚠ Overlap</span>' : ""}
        </span>
      </div>
      <span class="resize" aria-hidden="true"></span>
    </div>`;
  }

  function columnHtml(date, today, nowMin) {
    const list = instancesFor(date);
    const lanes = Store.layoutLanes(list);
    const h = hourPx();
    const isToday = date === today;
    const past = isToday ? `<div class="tl-past" style="height:${(nowMin / 60) * h}px"></div>` : "";
    const now = isToday
      ? `<div class="tl-now" style="top:${(nowMin / 60) * h}px"><span class="tl-now-label">${DateUtil.fmtTime(nowMin)}</span></div>`
      : "";
    const cards = list.map((t) => cardHtml(t, lanes.get(t.key || t.id), list)).join("");
    const name = DateUtil.fmt(date, { weekday: "long", month: "long", day: "numeric" });
    return `<div class="tl-col${isToday ? " is-today" : ""}" data-date="${date}" aria-label="${name}">${past}${cards}${now}</div>`;
  }

  function render(newState, opts = {}) {
    state = newState;
    const days = state.view === "week" ? DateUtil.weekDays(state.date) : [state.date];
    const today = DateUtil.todayKey();
    const nowMin = DateUtil.nowMinutes();

    // Remember scroll position and focus so re-rendering is invisible.
    const oldScroller = root.querySelector(".tl-scroll");
    const prevScroll = oldScroller ? oldScroller.scrollTop : null;
    const sameRange = root.dataset.range === `${state.view}:${days[0]}`;
    const active = document.activeElement;
    const focusCard = active && root.contains(active) ? active.closest(".card") : null;
    const focusInfo = focusCard
      ? { id: focusCard.dataset.id, date: focusCard.dataset.date, onCheck: active.classList.contains("check") }
      : null;

    const hours = Array.from({ length: 23 }, (_, i) => i + 1)
      .map((hr) => `<span class="tl-hour" style="top:${hr * hourPx()}px">${DateUtil.fmtHourLabel(hr)}</span>`)
      .join("");

    const head =
      state.view === "week"
        ? `<div class="tl-head"><div class="tl-corner"></div>${days
            .map((d) => {
              const cls = ["tl-dayhead", d === today && "is-today", d === state.date && "is-sel"].filter(Boolean).join(" ");
              return `<button type="button" class="${cls}" data-goto="${d}" aria-label="Open ${DateUtil.fmt(d, { weekday: "long", month: "long", day: "numeric" })}">
                <span>${DateUtil.fmt(d, { weekday: "short" })}</span><b>${DateUtil.fromKey(d).getDate()}</b></button>`;
            })
            .join("")}</div>`
        : "";

    root.dataset.range = `${state.view}:${days[0]}`;
    root.innerHTML = `
      <div class="tl-scroll">
        <div class="tl-grid view-${state.view}" style="--hour:${hourPx()}px;--days:${days.length}">
          ${head}
          <div class="tl-body">
            <div class="tl-hours" aria-hidden="true">${hours}</div>
            ${days.map((d) => columnHtml(d, today, nowMin)).join("")}
          </div>
        </div>
      </div>
      <p class="tl-foot">Click an empty time to add a task · Drag a task to move it (on touch, hold first) · Drag its bottom edge to change its length</p>`;

    const scroller = root.querySelector(".tl-scroll");
    if (sameRange && prevScroll !== null && !opts.resetScroll) {
      scroller.scrollTop = prevScroll;
    } else {
      // Today: just before now, but never earlier than the start of the person's day.
      const dayStart = state.dayStart ?? 7 * 60;
      const anchor = days.includes(today) ? Math.max(nowMin - 90, dayStart - 30, 0) : dayStart;
      scroller.scrollTop = (anchor / 60) * hourPx();
    }

    if (focusInfo) {
      // focusId: a changed repeat day becomes its own task, so focus follows the new id.
      const id = opts.focusId || focusInfo.id;
      const card =
        root.querySelector(`.card[data-id="${id}"][data-date="${opts.focusDate || focusInfo.date}"]`) ||
        root.querySelector(`.card[data-id="${id}"]`);
      if (card) (focusInfo.onCheck ? card.querySelector(".check") : card).focus({ preventScroll: true });
    }
  }

  function focusCard(id, date) {
    const card = root.querySelector(`.card[data-id="${id}"][data-date="${date}"]`);
    if (!card) return false;
    card.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    card.focus({ preventScroll: true });
    card.classList.remove("located");
    void card.offsetWidth;
    card.classList.add("located");
    return true;
  }

  // ---------- Pointer: drag to move / resize ----------
  function onPointerDown(e) {
    if (e.button !== 0) return;
    const card = e.target.closest(".card");
    if (!card || e.target.closest(".check")) return;
    if (state.pending) return; // finish the overlap question first
    const t = Store.get(card.dataset.id);
    if (!t) return;
    const scroller = root.querySelector(".tl-scroll");
    drag = {
      id: t.id,
      fromDate: card.dataset.date,
      toDate: card.dataset.date,
      mode: e.target.closest(".resize") ? "resize" : "move",
      recurring: t.recurrence !== "none",
      startX: e.clientX,
      startY: e.clientY,
      startScroll: scroller.scrollTop,
      origStart: t.start,
      origDur: t.duration,
      start: t.start,
      duration: t.duration,
      conflicts: [],
      card,
      scroller,
      active: false,
      // Touch: a short hold picks the card up, so a normal swipe still scrolls.
      touch: e.pointerType === "touch",
      armed: e.pointerType !== "touch",
    };
    if (drag.touch) {
      drag.holdTimer = setTimeout(() => {
        if (!drag) return;
        drag.armed = true;
        card.classList.add("lifted");
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(10);
      }, HOLD_MS);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancelDrag);
    window.addEventListener("keydown", onDragKey);
  }

  function colAt(x) {
    return [...root.querySelectorAll(".tl-col")].find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x < r.right;
    });
  }

  function onMove(e) {
    const d = drag;
    if (!d) return;
    const dy = e.clientY - d.startY + (d.scroller.scrollTop - d.startScroll);
    const dx = e.clientX - d.startX;

    if (!d.active) {
      if (Math.hypot(dx, dy) < 5) return;
      if (!d.armed) {
        cancelDrag(); // moved before the hold finished: let the page scroll
        return;
      }
      d.active = true;
      const ghost = d.card.cloneNode(true);
      ghost.className += " ghost";
      ghost.removeAttribute("tabindex");
      ghost.removeAttribute("aria-label");
      ghost.setAttribute("aria-hidden", "true");
      ghost.querySelector(".check").remove();
      d.card.parentNode.insertBefore(ghost, d.card);
      d.ghost = ghost;
      d.card.classList.add("dragging");
      d.card.style.left = "3px";
      d.card.style.width = "calc(100% - 6px)";
      d.label = document.createElement("span");
      d.label.className = "drag-label";
      d.card.appendChild(d.label);
      document.body.classList.add(d.mode === "resize" ? "is-resizing" : "is-dragging");
    }

    const h = hourPx();
    const delta = Math.round(((dy / h) * 60) / SNAP) * SNAP;
    if (d.mode === "move") {
      d.start = clamp(d.origStart + delta, 0, 1440 - d.origDur);
      d.duration = d.origDur;
      if (state.view === "week") {
        const col = colAt(e.clientX);
        if (col && col.dataset.date !== d.toDate) {
          col.appendChild(d.card);
          d.toDate = col.dataset.date;
        }
      }
    } else {
      d.duration = clamp(d.origDur + delta, SNAP, 1440 - d.origStart);
      d.start = d.origStart;
    }

    d.card.style.top = `${(d.start / 60) * h}px`;
    d.card.style.height = `${Math.max((d.duration / 60) * h, 18) - 2}px`;
    const range = DateUtil.fmtRange(d.start, d.duration);
    d.card.querySelector(".card-time").textContent = range;

    d.conflicts = Store.overlapsFor(d.toDate, d.start, d.duration, d.id);
    d.card.classList.toggle("conflict-live", d.conflicts.length > 0);
    d.label.textContent = d.conflicts.length ? `${range} · overlaps “${d.conflicts[0].title}”` : range;
    d.label.classList.toggle("below", d.start < 30);

    // Auto-scroll near the edges
    const r = d.scroller.getBoundingClientRect();
    if (e.clientY < r.top + 40) d.scroller.scrollTop -= 14;
    else if (e.clientY > r.bottom - 40) d.scroller.scrollTop += 14;
  }

  function endDrag() {
    if (drag) {
      clearTimeout(drag.holdTimer);
      drag.card.classList.remove("lifted");
    }
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", cancelDrag);
    window.removeEventListener("keydown", onDragKey);
    document.body.classList.remove("is-dragging", "is-resizing");
    const d = drag;
    drag = null;
    return d;
  }

  function onUp() {
    const d = endDrag();
    if (!d) return;
    if (!d.active) {
      cb.onOpen(d.id, d.fromDate);
      return;
    }
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    const changed = d.start !== d.origStart || d.duration !== d.origDur || d.toDate !== d.fromDate;
    if (!changed) {
      cb.onRerender();
      return;
    }
    cb.onDrop({
      id: d.id, fromDate: d.fromDate, toDate: d.toDate, start: d.start,
      duration: d.duration, mode: d.mode, conflicts: d.conflicts,
    });
  }

  function cancelDrag() {
    const d = endDrag();
    if (d && d.active) cb.onRerender();
  }

  function onDragKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelDrag();
    }
  }

  function onClick(e) {
    if (justDragged) return;
    const check = e.target.closest(".check");
    if (check) {
      const card = check.closest(".card");
      cb.onToggle(card.dataset.id, card.dataset.date);
      return;
    }
    const goto = e.target.closest("[data-goto]");
    if (goto) {
      cb.onGoto(goto.dataset.goto);
      return;
    }
    if (e.target.closest(".card")) return;
    const col = e.target.closest(".tl-col");
    if (col && !state.pending) {
      const r = col.getBoundingClientRect();
      const min = Math.floor(((e.clientY - r.top) / hourPx()) * 60 / SNAP) * SNAP;
      cb.onCreateAt(col.dataset.date, clamp(min, 0, 1440 - SNAP));
    }
  }

  // ---------- Keyboard: the accessible alternative to dragging ----------
  function onKey(e) {
    const card = e.target.closest(".card");
    if (!card || e.target !== card) return;
    const id = card.dataset.id;
    const date = card.dataset.date;
    const t = Store.get(id);
    if (!t) return;
    const move = (patch) => cb.onKeyMove({ id, fromDate: date, toDate: date, start: t.start, duration: t.duration, ...patch });

    switch (e.key) {
      case "Enter":
        cb.onOpen(id, date);
        break;
      case " ":
        cb.onToggle(id, date);
        break;
      case "Delete": // not Backspace: too easy to hit by accident
        cb.onDelete(id, date);
        break;
      case "ArrowUp":
      case "ArrowDown": {
        const dir = e.key === "ArrowUp" ? -1 : 1;
        if (e.shiftKey) move({ duration: clamp(t.duration + dir * SNAP, SNAP, 1440 - t.start), mode: "resize" });
        else move({ start: clamp(t.start + dir * SNAP, 0, 1440 - t.duration), mode: "move" });
        break;
      }
      case "ArrowLeft":
      case "ArrowRight":
        if (state.view === "week") {
          move({ toDate: DateUtil.addDays(date, e.key === "ArrowLeft" ? -1 : 1), mode: "move" });
        }
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  const isDragging = () => !!drag;

  return { init, render, focusCard, isDragging, priorityTag, courseTag, CHECK_SVG, esc, PRIORITY_LABEL };
})();
