# Marker-Anchored AR + Primitive Wireframe Mode — Design

Date: 2026-08-28

## Purpose

This app helps students identify the basic geometric shape underlying a
real-life object (e.g. "that soldering iron is basically a cylinder + a
cone"). Today's AR flow (native `<model-viewer>` handoff, shipped in
[docs/superpowers/specs/2026-08-27-qr-ar-hub-app-design.md](2026-08-27-qr-ar-hub-app-design.md))
and the pre-AR wireframe preview
([docs/handoff-wireframe-viewer.md](../handoff-wireframe-viewer.md), now
superseded by this spec) don't serve that goal:

1. AR placement is generic surface detection — the object can be dropped
   anywhere, disconnected from the physical QR code the student scanned.
2. The existing wireframe toggle shows a wireframe of the *actual, detailed*
   mesh, which for most real scanned objects is a dense, illegible tangle of
   triangles — not a simple shape a student can recognize.

This spec replaces both: AR mode anchors the object to the physical QR code
and tracks it live, and wireframe mode shows a simplified primitive shape
(cube, sphere, cylinder, cone, pyramid) sized to the object, in both AR and
the on-screen preview.

## Scope

- Replace `<model-viewer>` (CDN-based, native AR handoff) with a single
  Three.js-based rendering pipeline (`ModelCanvas`) shared by the on-screen
  preview and AR mode.
- Marker-anchored AR: the 3D object locks onto the physical QR code's
  position/orientation and tracks it live as the student moves their phone,
  using an in-browser image-tracking library (MindAR).
- Wireframe mode renders a simplified primitive geometry (not the real
  mesh), manually tagged per item by the admin, auto-sized to the model's
  bounding box. Available in both preview and AR mode, toggle-able live.
- Admin gains a required "shape" field per item, and a client-side step that
  compiles an AR tracking target from the item's QR code at creation time.

## Out of Scope

- Admin authentication (existing known risk, unchanged from the prior
  spec).
- Editing an existing item's shape or AR target after creation (only
  add/delete, consistent with existing scope).
- Tracking multiple QR codes / multiple anchored objects in one AR session.
- Precise real-world scale accuracy beyond the fixed QR-print-size constant
  — the goal is shape identification, not measurement.
- Native AR (Quick Look / Scene Viewer) handoff — fully replaced by
  in-browser marker AR for this app's purposes.

## Architecture

A single shared component, `ModelCanvas` (Three.js `WebGLRenderer` +
`GLTFLoader` + `OrbitControls`), replaces both the old `<model-viewer>`
preview and the old dual-canvas wireframe hack. It runs in two modes:

- **Preview mode** — a normal `<canvas>`, orbit-controlled, rendering
  either the model's real materials (shaded) or the simplified wireframe
  primitive (see below), toggled by a button. This is the default view when
  `/view/[id]` loads.
- **AR mode** — the same loader/material/toggle logic, but the camera feed
  (via `getUserMedia`) is the background, MindAR drives the object's
  transform (instead of `OrbitControls`) based on the tracked position of
  that item's QR code, and the same wireframe toggle is available live.

Using one pipeline for both modes means one loaded model, one set of
materials, and one toggle implementation — no duplicated Three.js
instances (this also resolves the "multiple instances of Three.js"
console warning from the previously-shipped dual-canvas approach).

MindAR (`mind-ar` npm package, image-tracking module) is added as a new
dependency, used only in AR mode.

## Data Model Changes

Item documents (MongoDB) gain two fields:

```
item:<id> → {
  id, name, glbUrl, usdzUrl, createdAt,   // existing
  shape: "cube" | "sphere" | "cylinder" | "cone" | "pyramid",  // new, required
  arTargetUrl: string | null,             // new — compiled MindAR .mind file
}
```

A single app-wide constant, `PHYSICAL_QR_SIZE_METERS` (default `0.08`, i.e.
8cm), is used to scale AR tracking correctly. It's documented next to the QR
code in the admin UI so teachers know what physical size to print codes at
for accurate tracking.

## Admin Flow

1. Admin fills the existing form, plus a new **required shape dropdown**
   (Cube / Sphere / Cylinder / Cone / Pyramid) → submits.
2. Server creates the item exactly as today (uploads glb/usdz to Blob,
   writes metadata to MongoDB including `shape`), returns the created item.
3. The admin's browser then fetches that item's QR PNG (existing
   `/api/items/[id]/qr` route) and runs MindAR's browser-side `Compiler` on
   it to produce a `.mind` target file. This is shown as a "Compiling AR
   target…" progress state (a few seconds).
4. The browser uploads the compiled `.mind` file via a new endpoint
   (`POST /api/items/[id]/target`), which stores it in Blob and updates the
   item's `arTargetUrl` in MongoDB.
5. If compilation or upload fails, the item still exists and is fully
   previewable — it's flagged in the admin list ("AR target missing —
   retry") with a button to retry step 3–4 without re-uploading the model.

This compilation step runs in the admin's browser rather than a Vercel
serverless function because MindAR's compiler depends on browser canvas/
`Image` APIs that are unreliable to polyfill in serverless Node. This is the
one part of this design most worth validating with a quick spike early in
implementation, since MindAR's browser compiler hasn't been exercised in
this codebase before.

## Viewer Page (`/view/[id]`) Flow

1. Page loads item metadata, renders `ModelCanvas` in **preview mode**:
   shaded model, orbit controls, a "Show Wireframe" toggle button.
2. A **"Start AR"** button sits alongside the toggle. If `arTargetUrl` is
   missing, it's disabled with a short explanation. Otherwise, tapping it:
   - Requests camera access (`getUserMedia`); on denial, shows an inline
     message and stays in preview mode — no dead end.
   - Initializes MindAR against that item's `arTargetUrl`.
   - Shows a live camera feed with an on-screen hint ("Point your camera at
     the QR code you scanned") until the target is detected.
   - Once detected, renders the model (same loaded geometry/materials as
     preview mode) anchored to the code's tracked position/rotation, updated
     every frame.
3. The same wireframe toggle button remains available in AR mode, swapping
   the anchored object between shaded and primitive-wireframe live, with no
   loss of tracking.
4. An **"Exit AR"** button stops the camera stream and MindAR session,
   returning to preview mode.

## Wireframe Primitive Generation

On model load (in either mode), compute the glTF scene's `Box3` bounding
box once, then construct a Three.js primitive geometry matching
`item.shape`, sized to that bounding box:

| shape    | geometry                                              |
|----------|--------------------------------------------------------|
| cube     | `BoxGeometry(width, height, depth)`                    |
| sphere   | `SphereGeometry(radius)` — radius = half the largest bounding-box dimension |
| cylinder | `CylinderGeometry(radius, radius, height)`             |
| cone     | `ConeGeometry(radius, height)`                          |
| pyramid  | `ConeGeometry(radius, height, 4)` — 4-sided cone        |

Rendered as `MeshBasicMaterial({ wireframe: true, color: <accent> })`,
positioned to match the bounding box's center. The accent color is chosen
to stay clearly visible against the dark viewer/camera background (the one
documented exception to the app's black/white "Bold Editorial" theme).

Both the shaded mesh and the wireframe primitive are built once at load
time; toggling only changes which is visible, so it's an instant swap with
no re-fetch or re-parse — this matters for keeping the toggle usable live
during AR tracking.

## Error / Fallback Handling

- No camera permission, no WebGL, or MindAR init failure → inline message,
  preview mode remains fully usable regardless.
- QR target not detected within view → on-screen hint, no timeout/failure
  state (student can keep repositioning the camera).
- Missing `arTargetUrl` (compile step never succeeded) → "Start AR" button
  disabled with an explanation; item still previewable; flagged in the
  admin list for the teacher to retry.

## Low-End Device Handling

- Single shared Three.js renderer instance across preview and AR modes
  (rather than two, as in the previously-shipped dual-canvas approach)
  keeps GPU/CPU overhead down.
- MindAR is a purpose-built, WASM-optimized tracking library designed for
  continuous per-frame use on modest hardware — this replaces the earlier
  plan of driving tracking off `jsQR` (a plain JS decoder, already
  documented as needing a "modest interval, not every frame" specifically
  for CPU reasons on weak devices — unsuitable for smooth 6DOF tracking).
- Camera capture resolution should be downscaled for the tracking pipeline
  the same way the existing scanner downscales frames before decoding.

## Testing Considerations

- Admin: create an item, confirm shape dropdown is required, confirm
  target-compile progress state and retry-on-failure path.
- Viewer: preview mode shaded/wireframe toggle on a fresh item (no
  regression from today's shipped behavior, just primitive instead of real
  mesh).
- AR mode: real-device testing (both Android Chrome and iOS Safari) is
  required — anchoring behavior, tracking stability, and camera permission
  flows can't be meaningfully verified any other way.
- Confirm "Exit AR" fully releases the camera stream (regression risk
  already flagged once before in this codebase, for the QR scanner).
