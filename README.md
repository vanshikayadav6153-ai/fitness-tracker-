# CodeAlpha Fitness Tracker App

A simple, clean fitness tracking web app to log daily activities and see progress at a glance. Built with plain HTML, CSS and JavaScript — no build step required.

## Features

- **Track daily activity** — steps, workout duration, exercise type and calories burned
- **Manual logging** — add entries with date, activity type, steps, duration, calories and notes
- **Dashboard** — today's totals with progress bars against your daily goals
- **Weekly charts** — calories (bar), steps (line) and activity breakdown (doughnut) via Chart.js
- **History** — searchable list of all entries with delete / clear-all
- **Editable goals** — set your own daily steps, calories and workout-minutes targets
- **Motivational quotes** — a new quote (text + author) on every click
- **Local storage** — data is saved in the browser and works offline
- **Optional Firebase sync** — email/password and phone (OTP) login with Firestore cloud sync
- **Installable PWA** — add to home screen / install as an app; light and dark theme

## Getting Started

No installation needed. Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Enabling Firebase Sync (optional)

By default the app runs in local-only mode. To enable login and cloud sync:

1. Create a project at the [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication** (Email/Password and, optionally, Phone) and create a **Firestore** database.
3. Add these Firestore rules:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
4. Paste your web app config into `firebase-config.js`.

## Project Structure

| File | Purpose |
|---|---|
| `index.html` | App layout: dashboard, log form, history, goals, login |
| `style.css` | Styling, responsive layout, dark mode |
| `app.js` | App logic, charts, local storage, Firebase sync |
| `firebase-config.js` | Firebase project configuration (placeholders) |
| `manifest.json`, `sw.js` | PWA manifest and service worker |

## Tech Stack

HTML5, CSS3, vanilla JavaScript, [Chart.js](https://www.chartjs.org/), Firebase Auth & Firestore (optional).

---

Built as part of the CodeAlpha internship.
