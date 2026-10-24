# DayFlow — A Smart Daily Planner

A task-first daily planner built with plain HTML, CSS and JavaScript (no frameworks, no backend).
Tasks live on a time-blocked timeline, like a page in a paper day planner.

Team: Dipta Kumar Mondal (0302436m), Preeti Preeti (0304488p)

## Run it

1. Open the `dayflow` folder in VS Code.
2. Open `index.html` in a browser (double-click it, or use the **Live Server** extension for auto-reload).

Data is saved on the device (the browser's `localStorage`; in the phone app also in native storage), so
tasks stay after a refresh. On first launch the app loads a few example tasks (marked with a banner); click
**Clear examples** to start empty. Use **Settings and backup → Save a backup** to keep a copy or move your
tasks to another device.

### Phone app (Play Store / App Store)

The same code runs as a native app through [Capacitor](https://capacitorjs.com). You need Node.js, plus
Android Studio for Android, or a Mac with Xcode for iOS.

```bash
npm install
npm run android
```

`npm run android` (or `npm run ios`) rebuilds `www/`, copies it into the native project and opens the IDE,
where you run it on a phone or emulator and build the release. In the app, reminders are delivered by the
phone even when DayFlow is closed, and backups go through the share sheet.

To publish you also need: a Google Play developer account (one-time fee) and/or an Apple developer account
(yearly fee), a short privacy policy page ("all data stays on your device; nothing is collected"), store
screenshots, and app icons (`npx @capacitor/assets generate` makes them from one image). The app asks for
exact-alarm permission on Android so reminders arrive on time; Google Play asks planner and reminder apps
to explain why they need it.

## Project structure

```
dayflow/
├── index.html          Page layout: top bar, timeline, sidebar, task dialog
├── css/styles.css      All styling, theme tokens (light + dark), responsive rules
├── js/platform.js      Device features (storage, reminders, files): web APIs or native plugins
├── js/store.js         Data: dates, saving, undo history, repeats, overlaps, to-dos, search, backup
├── js/timeline.js      Day/week timeline rendering, drag to move/resize (touch: hold), keyboard moves
├── js/app.js           Header, sidebar lists, task form, quick add, settings, backup, reminders, shortcuts
├── fonts/, icons/      Bundled fonts (works offline) and the app icon
├── build_artifact.py   Builds dist/ (one-file version) and www/ (for the phone app)
├── capacitor.config.json, package.json, android/   Phone app (Capacitor)
└── CLAUDE.md           Short project guide for Claude Code
```

Every task is one object in a single array (the single source of truth). Each change saves a snapshot
first, which is how undo works. The timeline is re-drawn from the array after every change.

```js
{ id, title, date: "2026-10-24", start: 570 /* minutes after midnight */, duration: 80,
  priority: "high" | "medium" | "low", recurrence: "none" | "daily" | "weekdays" | "weekly",
  until: null | "2026-12-18", skipDates: [], reminder: null | 0 | 5 | 15 | 30 | 60,
  due: null | "2026-10-30", course: "HCI", notes, doneDates: ["2026-10-24"] }
// start: null means a to-do with no set time. Changing one day of a repeat adds that day to
// skipDates and makes a one-off copy, so every repeat stays simple.
```

## Features

- Create, edit and delete tasks (dialog form, or **click an empty time** on the timeline)
- **Quick add** from one line of text, e.g. `Study 3pm 2h !high #hci`, `Gym tomorrow 7am 45m daily`,
  `Lecture 9-11am weekly`, `Meet supervisor next monday 10am`, `Lab report due fri`. The preview says when
  it guessed ("at 3" → 3 PM) or shortened something
- **To-do list** for things with no set time, with due dates (overdue ones in red) and a **Schedule** button
- **Left from earlier**: unfinished tasks from the last two weeks show up today, ready to reschedule
- **Course tags** on tasks, and planned hours per course in week view
- **Search** across all tasks, notes and courses
- **Settings**: when your day starts and ends (new tasks are only suggested inside it), overlap questions on/off
- **Backup**: save to a file and restore (replace or add)
- Day timeline and week view, with a live "now" line
- **Drag to reschedule** (live time preview), **drag the bottom edge** to change length
- In week view, drag a task to another day
- **Overlap warning** before an overlapping change is saved (drag, form and quick add)
- Mark complete with a checkmark animation and a progress bar
- **Undo** for every change (toast button or Ctrl/Cmd + Z)
- Recurring tasks (daily, weekdays, weekly) with an optional end date; move, edit or delete **one day only**
  or every repeat; completion is tracked per day; a streak counts days with everything done
- Reminders: in-app reminder banner, desktop notifications if the browser allows them, and a summary of
  reminders you missed while the page was closed; in the phone app they arrive even when the app is closed
- Works on phones: summary and quick add sit above the timeline; hold a task to drag it, swipe to scroll
- Full keyboard support and screen-reader labels

## How the HCI concepts from the proposal are implemented

| Proposal concept | Where it is in the app |
|---|---|
| Direct manipulation | Drag task cards to move them, drag the bottom edge to resize, click an empty slot to create. Changes appear immediately and can be undone. |
| Interface metaphor | The timeline looks like a planner page: ruled hour lines, a margin line with hour labels, a big date number and ISO week number in the header. |
| Visibility | All of the day's tasks are on the timeline and in the sidebar agenda; progress and "Up next" are always shown; hints under the timeline explain the main gestures. |
| Feedback | Checkmark animation on completion; live time label and dashed "ghost" of the old position while dragging; a toast confirms every action. |
| Constraints / error prevention | Overlaps are detected while dragging (striped card + label) and must be confirmed ("Keep it here" / "Move back"). The form shows the overlap and changes the button to "Save anyway". Tasks can't run past midnight. |
| Consistency | Day and week views use the same card layout, the same priority colors, shapes and labels. |
| Efficiency | Quick add, click-to-create at a time, keyboard shortcuts, next free slot suggested automatically. |
| Memorability | Fixed color + shape per priority (▲ High, ◆ Medium, ● Low), same icons everywhere. |
| Accessibility | Okabe–Ito color-blind-safe palette; priority never shown by color alone; Atkinson Hyperlegible font (designed for low-vision readers); keyboard alternatives to dragging; visible focus; respects reduced-motion; light and dark themes. |

## Keyboard

| Key | Action |
|---|---|
| `N` | New task |
| `/` | Focus quick add |
| `F` or `Ctrl/Cmd + K` | Search |
| `T` | Go to today |
| `D` / `W` | Day or week view |
| `←` `→` | Previous / next day (or week) |
| `Ctrl/Cmd + Z` | Undo |
| On a focused task: `Enter` | Edit |
| `Space` | Mark done / not done |
| `↑` `↓` | Move 15 minutes |
| `Shift + ↑ ↓` | Change length by 15 minutes |
| `←` `→` (week view) | Move to previous / next day |
| `Delete` | Delete (a repeating task: this day only; undo available) |

## Known limits (good to mention in the report)

- No accounts or sync: data stays on the device. Backups move it between devices by hand.
- In a browser, notifications only fire while the page is open (the phone app doesn't have this limit).
- Tasks can't run past midnight.
