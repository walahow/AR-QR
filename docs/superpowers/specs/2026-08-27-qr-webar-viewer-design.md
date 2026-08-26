# QR → WebAR Viewer — Design

Date: 2026-08-27

## Purpose

Scanning a QR code with a phone's native camera opens a web page that displays
a 3D object and lets the user place it in their physical space via AR — no
app install required.

## Scope

- Single 3D object, single QR code (not a catalog/CMS system).
- Placeholder 3D model for now (no production asset yet).
- Hosting/deployment target is not yet decided — build works locally first,
  QR code and public URL come later.

## Architecture

A single static page (`index.html`) uses Google's `<model-viewer>` web
component. `<model-viewer>` auto-detects the OS and hands off AR rendering to
the platform's own AR engine:

- iOS → **AR Quick Look** (needs a `.usdz` model)
- Android → **Scene Viewer** (needs a `.glb` model)

No custom camera access, marker tracking, or WebXR session code is needed —
the OS-native AR engines handle plane detection, lighting estimation, and
object placement. This keeps the page lightweight, which matters for
low-end/older devices.

The QR code encodes the URL of this page. Scanning it with the phone's
built-in camera app opens the page in the default mobile browser.

## Files

```
index.html          — the page; <model-viewer> element + minimal styling
assets/model.glb     — placeholder model, Draco-compressed (Android/desktop)
assets/model.usdz     — same placeholder, converted to USDZ (iOS Quick Look)
assets/poster.png     — lightweight preview image shown while model.glb loads
qr.png                — QR code image pointing at the page's URL
```

`qr.png` is regenerated once a real hosting URL exists; a placeholder/local
URL is fine for now.

## Data flow

1. User scans QR code with phone camera → opens `index.html` URL in mobile
   browser.
2. Page loads `<model-viewer>` script (deferred) + `poster.png` immediately,
   so the user sees something instantly instead of a blank page.
3. `model.glb` (or `model.usdz` on iOS) downloads and replaces the poster
   once ready.
4. User taps the AR button → OS hands off to Quick Look (iOS) or Scene
   Viewer (Android) → object is placed in the camera view via native AR.

## Low-end device handling

- `.glb` is Draco/meshopt-compressed to minimize download size on slow
  connections.
- Texture resolution capped (~1024px) to reduce both file size and GPU
  memory pressure.
- `.usdz` can't use Draco compression (Apple format constraint), so the
  placeholder model itself is kept low-poly to compensate.
- No custom render loop or JS framework — `<model-viewer>` does simple,
  efficient rendering internally, which keeps CPU/GPU load low on weak
  devices.
- `poster` attribute shows an immediate static image instead of a blank
  screen during model load.

## Error / fallback handling

`<model-viewer>` has this built in: if AR isn't supported on the current
device/browser, it silently falls back to an interactive drag-to-rotate 3D
viewer instead of showing the AR button. No custom fallback code needed for
that case. WebGL-unsupported browsers are treated as out of scope (rare in
practice for any modern phone camera → browser handoff).

## Out of scope (for this spec)

- Multiple objects / QR codes / catalog system
- Backend or CMS for managing objects
- Production 3D asset (placeholder only)
- Final hosting/deployment choice
