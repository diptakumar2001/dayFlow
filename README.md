# DayFlow — A Smart Daily Planner

A task-first daily planner built with plain HTML, CSS and JavaScript (no frameworks, no bundler). Tasks live on
a time-blocked timeline, like a page in a paper day planner. It runs as a website, an installable web app and
an Android app.

Team: Dipta Kumar Mondal (0302436m), Preeti Preeti (0304488p)

- **Website:** <https://dayflowdipto.netlify.app/>
- **Android:** the APK on the [Releases](https://github.com/diptakumar2001/dayFlow/releases) page
- **iPhone:** add the website to the home screen from Safari
- **Privacy:** [privacy.html](privacy.html)

## Contents

- [Install](#install)
- [Run it locally](#run-it-locally)
- [Features](#features)
- [Reminders and alarms](#reminders-and-alarms)
- [Accounts and cloud sync](#accounts-and-cloud-sync)
- [Building the Android app](#building-the-android-app)
- [Project structure](#project-structure)
- [How the HCI concepts are implemented](#how-the-hci-concepts-are-implemented)
- [Changes after user testing](#changes-after-user-testing)
- [Keyboard](#keyboard)
- [Known limits](#known-limits)

## Install

**Android (free APK)**

1. On your phone, open the repository's **Releases** page and tap the latest `DayFlow-x.y.z.apk`.
2. When Android asks, allow your browser to **install unknown apps**, then tap **Install**.
3. Open DayFlow and allow notifications.

To update, install the newer APK the same way; your tasks stay.

**iPhone (free, Add to Home Screen)**

1. Open the website in **Safari**.
2. Tap **Share → Add to Home Screen → Add**. DayFlow gets its own icon, opens full screen and works offline.

Sign in, or save a backup now and then, so your tasks are safe if Safari clears website data. A native iPhone
app would need a Mac and the paid Apple Developer Program; the Capacitor project is ready for that.

Settings shows the build number at the bottom, so a bug report can say which version it's about.

## Run it locally

Open `index.html` in a browser, or serve the folder (needed for the offline cache and notifications):

```bash
python -m http.server 5173
```

Tasks are saved on the device (`localStorage`, plus native storage in the phone app), so they stay after a
refresh. On first launch the app loads a few example tasks, marked with a banner; **Clear examples** starts
empty. **Settings → Save a backup** keeps a copy or moves your tasks to another device.

## Features

The main screen is kept calm on purpose: the timeline, today's progress with "Up next", Quick add and the
To-do list. Search, the light/dark switch and Settings open from the top bar, and the task form folds the
less-used fields (course, reminder, repeat, notes) under **More options**.

**Planning**

- Day timeline and week view, with a live "now" line.
- Create tasks with the form, by **clicking an empty time** on the timeline, or with **Quick add**.
- **Drag to reschedule** (with a live time preview), **drag the bottom edge** to change the length, and in week
  view drag a task to another day.
- **Overlap warning** before an overlapping change is saved (drag, form and Quick add).
- Repeating tasks (daily, weekdays, weekly) with an optional end date; move, edit or delete **one day only** or
  every repeat. Completion is tracked per day, and a streak counts days with everything done.
- **Undo** for every change (the toast's button, or Ctrl/Cmd + Z).
- **Course tags**: cards are coloured by course (no course = the accent colour), and week view shows planned
  hours per course.
- **Left from earlier**: unfinished tasks from the last two weeks show up today, ready to reschedule.
- **Search** across all tasks, notes and courses. **Backup** to a file and restore (replace or add).
- **Settings**: when your day starts and ends (new tasks are suggested inside it), overlap questions on/off,
  reminder defaults, theme and background.

**Quick add** turns one line of text into a task:

| You type | You get |
|---|---|
| `Study 3pm 2h #hci` | Today 3–5 PM, course HCI |
| `Gym tomorrow 7am 45m daily` | Every day from tomorrow, 7–7:45 AM |
| `Lecture 9-11am weekly` | Every week, 9–11 AM |
| `Read at 3:30 a.m. for 30 minutes` | 3:30–4 AM (dotted a.m./p.m. work, as phone keyboards write them) |
| `Call home 6 o'clock in the evening` | 6 PM (also "in the morning", "tonight") |
| `Buy milk` | A to-do (no time = To-do list) |
| `Lab report fri` or `Lab report due fri` | A to-do due Friday |

A hint under the box shows how to add a time, and the preview says where the task will go and when it guessed
something ("at 3" → 3 PM). A task that would already be over today (`study 3am` typed at 9 PM) goes to
tomorrow; type `today` to keep it today. If the new task overlaps another, the button changes to **Add anyway**.

**To-do list**: things with no set time, with due dates (overdue ones in red) and a **Schedule** button that
puts one on the timeline.

**On phones**

- A tab bar at the bottom (**Today · Week · To-do · More**) shows one section at a time. It slides away while
  you scroll down and comes back when you scroll up.
- The **To-do tab** is a plain to-do list: an "Add a to-do…" box at the top (add several in a row; `fri` sets
  a due date, `#hci` a course), the whole list, a "2 done today · 5 left" bar that starts fresh each day, and a
  folded **Done today** list where a tap puts an item back.
- **Swipe a task right** to complete it and **left** to reschedule it (Later today / Tomorrow / Pick a time);
  hold a task to drag it. A one-time tip explains the gestures.
- Scrolling the timeline carries on to the page, so the whole day up to midnight is always reachable.

**Look**

- **Light and dark themes**: light by default; a switch in the top bar, plus System / Light / Dark in Settings.
  Dark mode is a deep navy.
- **Planner-paper backgrounds**: warm off-white paper by day and deep navy paper by night, each with a fine
  grain and a faint dot grid (pure CSS). Other choices: **Sky** in light mode; **Space** (a dark solar system,
  hand-drawn SVGs from `python tools/make-space.py`) or **Clouds** in dark mode; none; or **your own photo**.
  Photos are shrunk and kept on the device (not in backups or your account), and a veil based on the photo's
  brightness keeps text readable.
- Buttons, toasts and dialogs use a light "Liquid Glass" style (translucent, blurred); in dark mode buttons are
  green-tinted glass with a mint main button. Task cards and the timeline stay solid for easy reading. Glass
  turns solid when the device asks for reduced transparency or more contrast.
- Buttons lift and glow on hover (on devices with a mouse); nothing moves when the device asks for reduced motion.
- Full keyboard support and screen-reader labels.

## Reminders and alarms

Every new timed task gets a **reminder 15 minutes before** and an **alarm when it starts**. Change the defaults
in Settings → Reminders, or per task under **More options**; in Quick add, type `noalarm` or `alarm`.

- **Android app:** Android rings them at the exact minute, even when DayFlow is closed, the phone is locked or
  it has restarted. The alarm uses its own loud channel and a chime, shows on the lock screen, and has **Done**
  and **Snooze 5 min** buttons. DayFlow asks for notification permission the first time you add a timed task.
  Some phone makers' battery savers (Samsung, Xiaomi, OnePlus…) can still delay alarms: set DayFlow's battery use
  to **Unrestricted** in the phone's app settings.
- **Website and iPhone home-screen app:** reminders and the alarm appear while DayFlow is open (also in a
  background tab), as a message in the page and a notification if you allow them. Reminders missed while the
  page was closed are summarised when you come back.
- A heads-up for a task just after midnight rings the evening before.

## Accounts and cloud sync

Signing in is optional. Without an account, tasks stay on the device. With one, tasks and settings are saved
online and synced between the website and the phone app. It works offline and sends changes when you're back
online. Each person can only read their own data: the database enforces this with row-level security, not just
the app. Includes forgot password, sign out and delete account. When accounts are set up, DayFlow opens on a
sign-in / create-account page with **Continue without an account**.

One-time setup:

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key into
   [`js/config.js`](js/config.js), and set `siteUrl` to the live address. The anon key is safe to publish;
   **never** put the `service_role` key in the app.
4. **Authentication → URL Configuration**: set **Site URL** to the same live address, and add
   `http://localhost:5173` under **Redirect URLs** for testing.
5. Keep **Confirm email** on (Authentication → Providers → Email). Supabase's built-in email only sends a few
   messages per hour; for real use, add an SMTP sender (Authentication → Emails → SMTP), e.g. Resend or Brevo.
6. Rebuild and deploy: `python build_artifact.py`, push, and `npx cap sync` for the phone app.

Good to know:

- Free Supabase projects pause after a week without use; opening the dashboard wakes one up.
- Signed-in users' tasks are stored on Supabase's servers (email address and task text), as the privacy page says.
- Deleting an account in the app (Account → Delete account) removes its online data. Apple requires this.

## Building the Android app

The APK is built for free on GitHub Actions (`.github/workflows/android.yml`); no Android Studio needed.

- **New version:** `git tag v1.0.1` then `git push --tags`. GitHub builds the APK and attaches it to a new
  Release (about 5–8 minutes). You can also run **Actions → Android APK → Run workflow**; the APK is then under
  that run's **Artifacts**.
- **Signing key (once):** Android only installs an update over an older version if both are signed with the same
  key. Create it on your own computer with your own password, and keep the file **outside** the project folder
  and backed up (if it's lost, people have to uninstall to get updates):

  ```bash
  keytool -genkeypair -v -keystore "$env:USERPROFILE\dayflow-release.jks" -alias dayflow -keyalg RSA -keysize 2048 -validity 10000
  ```

  Copy it as text (PowerShell):

  ```bash
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\dayflow-release.jks")) | Set-Clipboard
  ```

  Then on GitHub, **Settings → Secrets and variables → Actions → New repository secret**, four times:
  `DAYFLOW_KEYSTORE_BASE64` (paste), `DAYFLOW_KEYSTORE_PASSWORD`, `DAYFLOW_KEY_ALIAS` (`dayflow`) and
  `DAYFLOW_KEY_PASSWORD` (the same password unless you chose a different key password). Until these exist, the
  build makes a *debug* APK, which installs but can't be updated in place.
- **Locally:** `npm run android` rebuilds `www/`, copies it into `android/` and opens Android Studio (if
  installed). `node tools/make-icons.js` + `npx @capacitor/assets generate --android` remake the icons and
  splash screen; `python tools/make-alarm.py` remakes the alarm sound. App ID: `io.github.diptakumar2001.dayflow`.
- Publishing on Google Play (one-time fee) or the App Store (yearly fee, needs a Mac) would also need store
  screenshots; the privacy page is ready.

## Project structure

```
dayflow/
├── index.html          Page layout: top bar, timeline, sidebar, tab bar, dialogs (task, search, settings, account)
├── privacy.html        Privacy page
├── css/styles.css      All styling: theme tokens (light + dark), components, phone layout
├── js/config.js        Supabase project URL and public key (empty = no accounts)
├── js/vendor/          supabase-js, bundled so the app works offline
├── js/platform.js      Device features (storage, reminders, files, haptics): web APIs or native plugins
├── js/store.js         Data: dates, saving, undo, repeats, overlaps, to-dos, search, backup
├── js/sync.js          Accounts and cloud sync (the only file that talks to Supabase)
├── js/swipe.js         Touch swipes on tasks and list rows
├── js/timeline.js      Day/week timeline: drawing, drag to move/resize (touch: hold first), keyboard moves
├── js/app.js           Everything else: header, lists, task form, Quick add, settings, reminders, accounts
├── sw.js               Service worker: offline cache for the web app
├── supabase/schema.sql Database tables and row-level security, run once in Supabase
├── fonts/, icons/, images/, sounds/   Bundled fonts, app icons, Space backgrounds, alarm sound
├── tools/              Scripts that generate the icons, the Space backgrounds and the alarm sound
├── build_artifact.py   Builds dist/ (a one-file version) and www/ (for the phone app)
├── capacitor.config.json, package.json, android/   Phone app (Capacitor)
└── CLAUDE.md           Project notes for Claude Code
```

Every task is one object in a single array, the single source of truth. Each change saves a snapshot first,
which is how undo works, and the timeline is redrawn from the array after every change.

```js
{ id, title, date: "2026-10-24", start: 570 /* minutes after midnight; null = a to-do */, duration: 80,
  recurrence: "none" | "daily" | "weekdays" | "weekly", until: null | "2026-12-18", skipDates: [],
  reminder: null | 0 | 5 | 10 | 15 | 30 | 60 /* minutes before */, alarm: true | false,
  due: null | "2026-10-30", course: "HCI", notes: "", doneDates: ["2026-10-24"] }
// Changing one day of a repeat adds that day to skipDates and makes a one-off copy,
// so every repeat stays simple.
```

## How the HCI concepts are implemented

| Concept | Where it is in the app |
|---|---|
| Direct manipulation | Drag task cards to move them, drag the bottom edge to resize, click an empty slot to create. Changes appear immediately and can be undone. |
| Interface metaphor | The timeline looks like a planner page: paper texture with a dot grid, ruled hour lines, a margin line with hour labels, and a big date number and week number in the header. |
| Visibility | The main screen shows only what's needed every day: the timeline, progress and "Up next", Quick add and the To-do list. Search, settings, backup and help are one click away in the top bar. |
| Feedback | Checkmark animation on completion; live time label and a dashed "ghost" of the old position while dragging; buttons lift on hover; a toast confirms every action. |
| Constraints / error prevention | Overlaps are detected while dragging (striped card + label) and must be confirmed ("Keep it here" / "Move back"). The form and Quick add show the overlap and change the button to "Save anyway" / "Add anyway". Tasks can't run past midnight. |
| Consistency | Day and week views use the same card layout; a course always has the same colour on cards and lists. |
| Efficiency | Quick add, click-to-create at a time, keyboard shortcuts, swipe gestures, the next free slot suggested automatically. |
| Memorability | One fixed colour per course, the same icons everywhere. |
| Accessibility | Okabe–Ito colour-blind-safe palette; colour is never the only cue (the course name is printed on each card); text keeps at least 4.5:1 contrast; Atkinson Hyperlegible font (designed for low-vision readers); keyboard alternatives to dragging and swiping; visible focus; respects reduced motion, reduced transparency and more contrast; light and dark themes. |

## Changes after user testing

| What testers said | What changed |
|---|---|
| The priority labels (High / Medium / Low) were unhelpful. | Priority was removed; cards are coloured by course instead. |
| They didn't notice Quick add could take a time. | A hint sits under the box, and the preview shows where the task will go. |
| They wanted a plain to-do list. | Quick add with no time adds a to-do; the phone To-do tab became a list page with its own add box and a "done today" bar. |
| The sync dot looked "always on", as if always syncing. | It only shows while syncing, offline or on an error. |
| The dark background looked "AI-made" (glowing orbs, glowing gradient titles). | Both themes use a planner-paper texture with a dot grid, and titles are plain ink. |
| The tab bar took space while scrolling. | It hides while scrolling down and comes back when scrolling up. |
| "3:30 a.m." in Quick add didn't land on today. | Dotted a.m./p.m. are understood, and only tasks that are already over move to tomorrow. |

## Keyboard

| Key | Action |
|---|---|
| `N` | New task |
| `/` | Focus Quick add |
| `F` or `Ctrl/Cmd + K` | Search |
| `T` | Go to today |
| `D` / `W` | Day or week view |
| `←` `→` | Previous / next day (or week) |
| `Ctrl/Cmd + Z` | Undo |
| On a focused task: `Enter` | Edit |
| `Space` | Mark done / not done |
| `↑` `↓` | Move 15 minutes |
| `Shift + ↑ ↓` | Change the length by 15 minutes |
| `←` `→` (week view) | Move to the previous / next day |
| `Delete` | Delete (a repeating task: this day only; undo available) |

## Known limits

- Sync checks for changes from other devices when you switch back to DayFlow and about once a minute, not
  instantly. If the same task is changed on two devices before they sync, the last change saved wins.
- The website (including the iPhone home-screen app) can only remind you while DayFlow is open; ringing when
  it's closed would need a push server. The Android app doesn't have this limit.
- Android alarms ring once (about 12 seconds) rather than until stopped; an alarm-clock screen would need custom
  native code.
- Tasks can't run past midnight.
