# QR/AR Hub App — Design

Date: 2026-08-27

## Purpose

Evolve the single-object WebAR prototype into a small hosted app: a
camera-based QR scanner "hub" page, a per-item AR viewer, and an admin page
to add new items (3D models + auto-generated QR codes) — deployed on Vercel.

## Scope

- Multiple AR items, each with its own QR code (supersedes the earlier
  single-object scope).
- In-browser camera QR scanning, in addition to the existing native-camera
  flow — both resolve to the same URL, so they stay interchangeable.
- Admin page to add items (upload `.glb` + `.usdz`, get a QR code back).
- **No authentication on `/admin` in this phase** — explicit user decision
  to move fast. This is a known, intentional risk: anyone with the `/admin`
  URL can add/delete items and upload files. Must be revisited (e.g. a
  simple password gate) before the URL is shared beyond the person
  building this.
- Deployed on Vercel, using Vercel KV (metadata) and Vercel Blob (model
  files).

## Tech Stack

- **Next.js** (App Router), deployed on **Vercel**.
- **Vercel KV** — item metadata (id, name, model URLs, timestamps).
- **Vercel Blob** — stores uploaded `.glb`/`.usdz` files, returns public URLs.
- **`<model-viewer>`** (unchanged from the prototype, CDN-pinned to 4.3.1)
  — renders the 3D object and hands off to native AR (Quick Look / Scene
  Viewer) on `/view/[id]`.
- **`jsQR`** (client-side, pure JS) — decodes QR codes from camera frames
  on the home/scanner page.
- **`qrcode`** (Node) — generates each item's QR code PNG on demand via an
  API route (not stored as a file — regenerated from the item's id whenever
  requested, since that's cheap and avoids an extra Blob write per item).
- Plain CSS, no UI framework — Bold Editorial visual style (see below).

## Pages

- **`/` (Home / Scanner)** — opens the device camera immediately, decodes
  QR codes in-browser via `jsQR`. When the decoded text matches this site's
  own `/view/<id>` URL pattern, does a client-side navigation to that path.
  If it decodes something that doesn't match, shows the raw decoded text so
  scanning an unrelated QR doesn't silently fail.
- **`/view/[id]` (Viewer)** — fetches the item's metadata, renders
  `<model-viewer src="{glbUrl}" ios-src="{usdzUrl}">` plus a short
  instruction line ("Tap the AR icon to place this in your space"). This is
  the page every item's QR code encodes directly
  (`https://<domain>/view/<id>`), so scanning it with the phone's native
  camera app works exactly as it did in the single-object prototype — no
  behavior change for that path.
- **`/admin`** — lists existing items (name + a link to view/download that
  item's QR PNG) and a form to add a new item: name + `.glb` file +
  `.usdz` file. Submitting uploads both files to Vercel Blob, writes the
  item's metadata to Vercel KV, and shows the new item (with its QR) in the
  list.

## API Routes

- `GET /api/items` — list all items (used by `/admin`).
- `POST /api/items` — create an item: accepts multipart form data (name,
  glb file, usdz file), uploads files to Blob, writes metadata to KV,
  returns the created item.
- `GET /api/items/[id]` — fetch one item's metadata (used by `/view/[id]`).
- `DELETE /api/items/[id]` — remove an item's KV entry (used by `/admin`).
- `GET /api/items/[id]/qr` — returns that item's QR code as a PNG,
  generated on request (encodes `https://<domain>/view/[id]`).

## Data Model (Vercel KV)

```
item:<id>        → { id, name, glbUrl, usdzUrl, createdAt }
items:all        → set of all item ids (for listing on /admin)
```

`id` is a short random slug generated at creation time (e.g. via `nanoid`).

## Data Flow

1. **Adding an item:** admin fills the form on `/admin` → `POST /api/items`
   → server uploads the two files to Vercel Blob → server writes the
   metadata to Vercel KV under a new id → response includes the new item,
   which the admin page renders immediately with a link to
   `/api/items/<id>/qr`.
2. **Scanning (native camera):** phone camera app decodes the QR, opens
   `https://<domain>/view/<id>` directly in the browser — identical to the
   original single-object prototype's flow.
3. **Scanning (in-app scanner):** user is on `/`, grants camera access,
   `jsQR` decodes a frame → if the decoded string matches this site's
   `/view/<id>` pattern, the app does a client-side route change to that
   path instead of a full page reload. Same destination, no full reload.
4. **Viewing:** `/view/[id]` calls `GET /api/items/[id]`, then renders
   `<model-viewer>` with that item's URLs, same low-end-device
   considerations as the prototype (poster/instant feedback, no custom
   render loop).

## Visual Style — "Bold Editorial" (user-selected)

- Palette: pure white (`#fff`) background, pure black (`#000`) text and
  borders. No accent color.
- Borders: 3–4px solid black on framed elements (the scanner viewfinder,
  cards on `/admin`).
- Typography: bold sans-serif for UI chrome and buttons; a bold serif
  (e.g. Georgia) for large headings like "SCAN", matching the approved
  mockup.
- Exception: the `<model-viewer>` canvas itself on `/view/[id]` stays dark
  (matches the prototype's `#111` background) so the 3D object has
  contrast — the surrounding page chrome (instructions, back link) still
  follows the white/black theme.

## Seed Data

On first deploy, the existing placeholder assets from the prototype
(`assets/model.glb`, the cube; `assets/model.usdz`, the Astronaut stand-in)
are uploaded to Blob and inserted into KV as item id `demo`, so there's
something to scan and view immediately after deploying.

## Low-End Device Handling (carried over from the original design)

- `<model-viewer>` usage on `/view/[id]` is unchanged from the prototype:
  no custom render loop, native AR handoff, poster-first loading.
- The scanner page's camera loop (`jsQR` running per-frame) is the one new
  performance-sensitive piece — it should run the decode on a modest
  interval (not literally every animation frame) and downscale the video
  frame before decoding, to keep CPU load reasonable on weak devices.

## Deployment (Vercel)

Covered as implementation tasks in the plan, but at a high level:
1. `vercel login` (interactive, must be run by the user — needs their
   account).
2. `vercel link` to connect this project to a Vercel project.
3. Provision Vercel KV and Vercel Blob for the project (via the Vercel
   dashboard or `vercel storage create`), which populates the required
   environment variables.
4. `vercel env pull` to get those environment variables locally for
   development.
5. `vercel --prod` to deploy.

## Out of Scope (for this spec)

- Admin authentication (explicitly deferred, flagged above as a risk).
- Editing an existing item (only add/delete for now).
- Any analytics on scans/views.
- Custom domain setup (Vercel's default `*.vercel.app` URL is fine for now).
