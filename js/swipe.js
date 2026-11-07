/* =========================================================
   DayFlow — swipe gestures (touch only)
   Swipe a task right to complete it, left to reschedule.
   Used by timeline cards (timeline.js) and list rows (app.js).
   The item follows the finger over a coloured layer; past the
   threshold there's a small buzz, and letting go acts.
   Vertical movement is left to the page (scrolling).
   ========================================================= */

const Swipe = (() => {
  const START = 12; // px of sideways movement before it counts as a swipe
  const RATIO = 1.5; // …and it must be clearly more sideways than up/down

  // Starts watching a touch on `el`. Returns a tracker:
  //   move(e) → "wait" (undecided) | "swipe" (the item is following the finger) | "no" (it's a scroll)
  //   end(cancel) → finishes; calls onCommit("right" | "left") if it went past the threshold.
  function begin(el, e, { onCommit, labels = {} }) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    const width = el.getBoundingClientRect().width;
    const threshold = Math.min(90, width * 0.35);
    let mode = "wait";
    let dx = 0;
    let armed = false;
    let layer = null;

    function start() {
      mode = "swipe";
      // The coloured layer sits exactly behind the item, in the same positioned parent.
      layer = document.createElement("div");
      layer.className = "swipe-layer";
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = `<span class="sw-right">✓ ${labels.right || "Done"}</span><span class="sw-left">${labels.left || "Reschedule"} ↻</span>`;
      Object.assign(layer.style, {
        top: `${el.offsetTop}px`, left: `${el.offsetLeft}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`,
      });
      el.parentNode.insertBefore(layer, el);
      el.classList.add("swiping");
    }

    function move(ev) {
      dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (mode === "wait") {
        if (Math.abs(dx) > START && Math.abs(dx) > RATIO * Math.abs(dy)) start();
        else if (Math.abs(dy) > START) mode = "no";
      }
      if (mode === "swipe") {
        el.style.transform = `translateX(${dx}px)`;
        layer.dataset.dir = dx > 0 ? "right" : "left";
        const over = Math.abs(dx) >= threshold;
        if (over !== armed) {
          armed = over;
          layer.classList.toggle("armed", armed);
          if (armed) Platform.ui.haptic();
        }
      }
      return mode;
    }

    function cleanup() {
      el.classList.remove("swiping");
      el.style.transform = "";
      el.style.transition = "";
      if (layer) layer.remove();
    }

    function end(cancel = false) {
      if (mode !== "swipe") return;
      if (armed && !cancel) {
        const dir = dx > 0 ? "right" : "left";
        el.style.transition = "transform 0.18s ease-in";
        el.style.transform = `translateX(${dx > 0 ? width : -width}px)`;
        setTimeout(() => {
          cleanup();
          onCommit(dir);
        }, 180);
      } else {
        el.style.transition = "transform 0.2s cubic-bezier(0.3, 1.4, 0.5, 1)";
        el.style.transform = "translateX(0)";
        setTimeout(cleanup, 200);
      }
    }

    return { move, end, swiping: () => mode === "swipe" };
  }

  // A click fired by the end of a swipe shouldn't also open the item. Phones usually don't send one
  // after the finger has moved, so the guard is dropped as soon as a new touch starts (or after 350 ms):
  // it must never eat the person's next real tap.
  function swallowNextClick() {
    const stop = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      done();
    };
    const done = () => {
      window.removeEventListener("click", stop, { capture: true });
      window.removeEventListener("pointerdown", done, { capture: true });
    };
    window.addEventListener("click", stop, { capture: true });
    window.addEventListener("pointerdown", done, { capture: true });
    setTimeout(done, 350);
  }

  return { begin, swallowNextClick };
})();
