# DrawNigh (web version) — first-time publish

This folder is the website version of DrawNigh v1.0.9, built for an iPhone. It has
everything the live Firefox add-on has except the "verse pops up while browsing
other websites" feature — that only works inside a browser add-on, and no plain
website on any phone can do it. Everything else (reading plan, Books, Plans, Gems,
badges, prayer timer) works the same.

## One-time setup

1. Go to github.com and sign in (or create a free account).
2. Click **+** → **New repository**. Name it `drawnigh`. Leave it **Public**
   (GitHub Pages only publishes from a public repo on the free plan — this is
   the same trade Order My Steps made).
3. Open the new repo → **Add file** → **Upload files**.
4. Drag in every file and the `icons` folder from this folder — all of them
   at once: `index.html`, `app.css`, `app.js`, `engine.js`, `bible.json`,
   `notes.json`, `manifest.webmanifest`, `sw.js`, and `icons/`.
5. Commit message: `v1.0.9 — first web build`. Leave **Commit directly to the
   main branch** selected. **Commit changes**.
6. **Settings** tab → **Pages** (left sidebar) → under **Build and deployment**,
   Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** →
   **Save**.
7. Wait a minute, then the page will show the live address — it will be
   `https://<your-github-username>.github.io/drawnigh`.

## Getting it onto her iPhone

1. Send her that link (text, WhatsApp, email — whatever is easiest).
2. She opens it in **Safari** (must be Safari, not Chrome — Add to Home
   Screen only works from Safari on iPhone).
3. Tap the **Share** button (square with an arrow) → **Add to Home Screen** →
   **Add**.
4. A DrawNigh icon appears on her Home Screen. Opening it from there hides
   Safari's address bar, so it feels like a real app.

Her reading data lives only on her phone, the same way it does on yours — it
never touches your device or your GitHub account.

## Publishing an update later

Same as Order My Steps: upload the changed files (Add file → Upload files,
same filenames so GitHub replaces them), commit, wait for the green tick under
the **Actions** tab, then bump the cache name at the top of `sw.js`
(`drawnigh-v1` → `drawnigh-v2`) in that same upload — without that bump her
phone keeps the old copy. After that she opens the app and closes it fully
(swipe out of recent apps) once or twice to pick up the new version.
