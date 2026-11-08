# DayFlow — A Smart Daily Planner

A task-first daily planner built with plain HTML, CSS and JavaScript (no frameworks, no backend).
Tasks live on a time-blocked timeline, like a page in a paper day planner.

Team: Dipta Kumar Mondal (0302436m), Preeti Preeti (0304488p)

## Run it

1. Open the `dayflow` folder in VS Code.
2. Open `index.html` in a browser (double-click it, or use the **Live Server** extension for auto-reload).

Data is saved on the device (the browser's `localStorage`; in the phone app also in native storage), so
tasks stay after a refresh. On first launch the app loads a few example tasks (marked with a banner); click
**Clear examples** to start empty. Use **Settings (gear icon) → Save a backup** to keep a copy or move your
tasks to another device.

### Accounts and cloud sync (Supabase)

Signing in is optional. Without an account, tasks stay on the device as before. With one, they're saved online
and synced between the website and the phone app. Each person can only read their own data: the database
enforces this with row-level security, not just the app.

One-time setup:

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key into
   [`js/config.js`](js/config.js). Set `siteUrl` to your live address, e.g. `https://dayflow.netlify.app/`.
   The anon key is safe to publish. **Never** put the `service_role` key in the app.
4. **Authentication → URL Configuration**: set **Site URL** to the same live address. Add
   `http://localhost:5173` under **Redirect URLs** for testing.
5. Keep **Confirm email** on (Authentication → Providers → Email). Supabase's built-in email only sends a few
   messages per hour, so for real users add your own SMTP sender (Authentication → Emails → SMTP), e.g. Resend
   or Brevo, which have free tiers.
6. Rebuild and deploy (`python build_artifact.py`, then push; for the phone app, `npx cap sync`).

Good to know:
- Free Supabase projects pause after a week without any use; open the dashboard to wake one up, or upgrade
  once you have regular users.
- Tasks of signed-in users are stored on Supabase's servers. Update your privacy policy and the app store
  privacy forms (data collected: email address, and the tasks people write).
- People can delete their account in the app (Account → Delete account), which removes their online data.
  Apple requires this.

### Install on Android (free APK)

DayFlow's Android app is built for free on GitHub's computers (GitHub Actions); no Android Studio needed.

1. On GitHub, open the repository's **Releases** page on your phone and tap the latest `DayFlow-x.y.z.apk`.
2. When Android asks, allow your browser to **install unknown apps**, then tap **Install**.
3. Open DayFlow and allow notifications. Reminders (default: 15 min before) and alarms (when a task
   starts) then arrive on time, even when the app is closed and the phone is locked.

To update, install the newer APK the same way; your tasks stay.

**Make a new version:** `git tag v1.0.1` then `git push --tags`. GitHub builds the APK and puts it on a
new Release page (about 5–8 minutes). You can also run it by hand: **Actions → Android APK → Run workflow**;
the APK is then under that run's **Artifacts**.

**Signing key (once).** Android only installs an update over an older version if both are signed with the
same key. Create yours on your own computer, choose your own password, and keep the file **outside** the
project folder and backed up (if it's lost, people have to uninstall to get updates):

```bash
keytool -genkeypair -v -keystore "$env:USERPROFILE\dayflow-release.jks" -alias dayflow -keyalg RSA -keysize 2048 -validity 10000
```

Copy it as text (PowerShell):

```bash
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\dayflow-release.jks")) | Set-Clipboard
```

Then on GitHub: **Settings → Secrets and variables → Actions → New repository secret**, four times:
`DAYFLOW_KEYSTORE_BASE64` (paste), `DAYFLOW_KEYSTORE_PASSWORD`, `DAYFLOW_KEY_ALIAS` (`dayflow`) and
`DAYFLOW_KEY_PASSWORD` (the same password, unless you chose a different key password). Until these exist,
the build makes a *debug* APK, which installs but can't be updated in place.

### Install on iPhone (free, Add to Home Screen)

1. Open the live DayFlow website in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**. DayFlow gets its own icon, opens full screen and works
   without a connection.

Limits on iPhone (Apple's rules for web apps): reminders and the alarm only appear **while DayFlow is open**.
Sign in, or save a backup now and then, so your tasks are safe if Safari clears website data. A native iPhone
app needs a Mac or the paid Apple Developer Program; the Capacitor project is ready for that later.

### Reminders and alarms

Every new task gets a **reminder 15 minutes before** and an **alarm when it starts** (change the defaults in
Settings → Reminders, or per task under **More options**; in Quick add, type `noalarm` or `alarm`). On
Android the alarm uses its own loud channel and a chime, shows on the lock screen, and has **Done** and
**Snooze 5 min** buttons. Notification-style alarms ring once (about 12 seconds); an alarm-clock screen that
rings until stopped would need custom native code.

### Developing the phone app

`npm run android` rebuilds `www/`, copies it into `android/` and opens Android Studio (if installed).
`node tools/make-icons.js` + `npx @capacitor/assets generate --android` remake the icons and splash screen;
`python tools/make-alarm.py` remakes the alarm sound. The app ID is `io.github.diptakumar2001.dayflow`.
Publishing on Google Play (one-time fee) or the App Store (yearly fee, needs a Mac or a cloud Mac) would
also need a privacy policy page and store screenshots.

## Project structure

```
dayflow/
├── index.html          Page layout: top bar, timeline, sidebar, dialogs (task, search, settings, account)
├── css/styles.css      All styling, theme tokens (light + dark), responsive rules
├── js/config.js        Supabase project URL and public key (empty = no accounts)
├── js/vendor/          supabase-js, bundled so the app works offline
├── js/platform.js      Device features (storage, reminders, files): web APIs or native plugins
├── js/store.js         Data: dates, saving, undo history, repeats, overlaps, to-dos, search, backup
├── js/timeline.js      Day/week timeline rendering, drag to move/resize (touch: hold), keyboard moves
├── js/sync.js          Accounts and cloud sync (the only file that talks to Supabase)
├── js/app.js           Header, sidebar lists, task form, quick add, settings, backup, reminders, accounts
├── supabase/schema.sql Database tables and privacy rules, run once in Supabase
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

The screen is kept calm on purpose: the timeline, today's progress with "Up next", Quick add and the To-do
list. Search (🔍, `F`), the light/dark switch (☾/☀) and Settings (your theme, day, backup, reminders, help)
open from the top bar, and the task
form folds the less-used fields (course, reminder, repeat, notes) under **More options**.

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
- **On phones**: a tab bar at the bottom (**Today · Week · To-do · More**) shows one section at a time, with a
  count of open to-dos on the To-do tab. **Swipe a task right** to complete it and **left** to reschedule it
  (Later today / Tomorrow / Pick a time); hold a task to drag it. A one-time tip explains the gestures
- **Welcome page**: when accounts are set up, DayFlow opens on a sign-in / create-account page, with
  **Continue without an account** for people who just want to use it on one device
- **Accounts (optional)**: sign up with email and password, and tasks and settings sync between devices. It
  works offline and sends changes when you're back online. Includes forgot password, sign out and delete account
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
- **Light and dark themes**: a switch in the top bar, plus System / Light / Dark in Settings. Dark mode is a
  deep navy. Buttons, toasts and dialogs use a light "Liquid Glass" style (translucent, blurred); task cards and
  the timeline stay solid for easy reading. Glass turns solid when the device asks for reduced transparency or
  more contrast
- **Sky backgrounds**: a soft day sky in light mode (drawn in CSS) and, in dark mode, **glossy violet orbs** that
  drift with the mouse on computers and float gently on phones (pure CSS). Dark mode can also use **Space**, a dark solar system: a sun
  glow off the top-left corner, faint orbits, and Earth, Mars, Jupiter and Saturn lit on their sun-facing side
  (hand-drawn SVGs, `python tools/make-space.py`). or **Clouds** (the day sky at night). Big titles have a cyan-to-violet shine (moonlight-blue accent, warm "now" line). Panels are slightly see-through so the sky
  shows. In Settings → Appearance each theme can use its sky, no picture, or **your own photo**. Photos are
  shrunk on the device, kept on the device (not in backups or your account), and DayFlow adjusts a veil from the
  photo's brightness so text stays readable

## How the HCI concepts from the proposal are implemented

| Proposal concept | Where it is in the app |
|---|---|
| Direct manipulation | Drag task cards to move them, drag the bottom edge to resize, click an empty slot to create. Changes appear immediately and can be undone. |
| Interface metaphor | The timeline looks like a planner page: ruled hour lines, a margin line with hour labels, a big date number and ISO week number in the header. |
| Visibility | The main screen shows only what's needed every day: the timeline, progress and "Up next", Quick add and the To-do list. Search, settings, backup and help (gestures, shortcuts, priority key) are one click away in the top bar. |
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

- Sync checks for changes from other devices when you switch back to DayFlow and about once a minute,
  not instantly. If the same task is changed on two devices before they sync, the last change saved wins.
- In a browser, notifications only fire while the page is open (the phone app doesn't have this limit).
- On iPhone (web app), reminders and alarms only show while DayFlow is open; Android alarms ring once (~12 s)
  rather than until stopped.
- Tasks can't run past midnight.
