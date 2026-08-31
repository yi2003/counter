# 📋 Universal Check-in Counter

A universal, self-hosted check-in counter: customize the project name and total target, check in with an optional text note and photo proof, and sync everything across devices through Vercel's ecosystem. One-click deployable to Vercel.

## ✨ Features

- **Multiple counters & sub-counters** — a home screen of counter cards (tap to open, create, delete). Any counter can hold **sub-counters** (one level deep) with a quick "+1" button on each card; deleting a counter cascades to its sub-counters.
- **Project management** — custom project name (default `My Counter`), total target count (default `60`), optional cover image.
- **Counting operations** — Check-in (+1, disabled at target), Undo (−1, reverts the last check-in), Reset (count → 0, clears all history, with confirmation dialog).
- **Data display** — used / total, remaining count, progress %, and a circular SVG progress ring whose color shifts Blue → Orange → Red as usage approaches the limit (`<70%` blue, `70–90%` orange, `>90%` red).
- **Check-in history** — newest-first timeline; every record shows its timestamp, optional note, and an image thumbnail that opens a full-screen preview.
- **Image upload** — take a photo or pick from the gallery; client-side auto-compression (max width 800 px, JPEG quality 60 %) before upload. Each check-in photo is uploaded as **two files**: a tiny thumbnail (~240 px) for the history list plus the compressed 800 px view for the full-size preview, keeping the timeline light on bandwidth.
- **Cross-device sync** — counter data in **Vercel KV (Redis)**, images in **Vercel Blob**.
- **Mobile-first UX** — ≥44 pt touch targets, press-feedback animations, ring bounce on check-in, toast notifications, loading states, fully responsive.

## 🧰 Tech stack

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 15 (App Router, React 19, TypeScript), vanilla CSS |
| API | Next.js Route Handlers (serverless) |
| Data | Vercel KV (`@vercel/kv`) |
| Images | Vercel Blob (`@vercel/blob`) |
| Hosting | Vercel (Hobby plan friendly) |

## 🚀 Quick start (local)

```bash
npm install
npm run dev
# open http://localhost:3000
```

Works out of the box **without any cloud config**: when `KV_REST_API_URL` / `BLOB_READ_WRITE_TOKEN` are absent, the app falls back to a local JSON store (`.data/store.json`) and local image files (`.data/uploads`) so you can develop and demo offline. The footer badge shows which storage mode is active.

## ☁️ Deploy to Vercel

```
1. Push the code to a Git repository (GitHub / GitLab / Bitbucket).
2. In Vercel → "Add New Project" → select the repository.
3. Create the storage stores first (dashboard → Storage), then wire the env vars:
   - BLOB_READ_WRITE_TOKEN   (from the Vercel Blob store)
   - KV_REST_API_URL         (from the Vercel KV store)
   - KV_REST_API_TOKEN       (from the Vercel KV store)
4. Click "Deploy" → automatic build + CI/CD on every push.
5. Open your *.vercel.app domain and start checking in.
```

> **Notes**
> - Create the Blob and KV stores **before** deployment so the tokens/URLs exist.
> - `@vercel/kv` also works unchanged with an Upstash Redis integration (same `KV_REST_API_URL` / `KV_REST_API_TOKEN` variable names).
> - Hobby free tiers: Blob 10 GB storage + 1 GB/month bandwidth; KV 256 MB + 30,000 requests/month — plenty for personal use.
> - Deploying **without** the env vars still works, but data stays per-instance local and won't sync (the footer will tell you).

## 🔌 API

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/counters` | GET | List all counters (incl. sub-counters, with `parentId`) + used counts |
| `/api/counters` | POST | Create a counter; pass `parentId` to create a **sub-counter** (one level max) |
| `/api/counters/[id]` | GET | Full state of one counter: config, used count, history |
| `/api/counters/[id]` | PUT | Update name / total / coverImage |
| `/api/counters/[id]` | DELETE | Delete the counter **and its sub-counters** (images cleaned up, best effort) |
| `/api/counters/[id]/checkin` | POST | +1 with optional `{ note, image, thumb }`; 409 when target reached |
| `/api/counters/[id]/undo` | POST | Remove the last record, −1 (deletes its images, best effort) |
| `/api/counters/[id]/reset` | POST | Count → 0, clear history (cleans stored images, best effort) |
| `/api/upload` | POST | `multipart/form-data` (`file` + optional `thumb`) → `{ url, thumbUrl }` |
| `/api/uploads/[file]` | GET | Serves local dev uploads only (404 when Blob is enabled) |

## 🗄️ Data model (Vercel KV)

```js
// Key "counters" — index of all counters, newest last
[{ "id": "c1abc234", "name": "Inhaler", "total": 60, "coverImage": null,
   "createdAt": "2026-08-31T10:00:00.000Z", "parentId": null },
 { "id": "c2def567", "name": "Push-ups", "total": 100, "coverImage": null,
   "createdAt": "2026-08-31T10:05:00.000Z", "parentId": "c1abc234" }]

// Key "used:<counterId>"
25

// Key "history:<counterId>" (Redis list, newest first)
[{ "id": "1698765432100-ab3k9x", "timestamp": "2026-08-31T10:30:00.000Z",
   "note": "Took after breakfast", "image": "https://...(view, ≤800px)",
   "thumb": "https://...(thumbnail, ≤240px)" }]
```

> Migrating from the single-counter version? Old `project` / `used` / `history` keys are auto-migrated once into a counter with id `default` on first load.

## 📁 Structure

```
app/
  page.tsx              # home: counter cards + create
  c/[id]/page.tsx       # counter detail (works for sub-counters too)
  layout.tsx, globals.css
  api/counters/…        # list/create, get/update/delete, checkin, undo, reset
  api/upload, api/uploads/[file]
components/             # detail, cards, ring, modals, history, toasts, lightbox
lib/                    # store (KV + local fallback), blob, validation, image compression
```
