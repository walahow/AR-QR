# Authored Solid + Edges Wireframe — Design

Date: 2026-09-02

## Purpose

This app helps students identify the basic geometric shape underlying a
real-life object (see
[docs/superpowers/specs/2026-08-28-marker-ar-wireframe-design.md](2026-08-28-marker-ar-wireframe-design.md)).
That spec's wireframe mode auto-generates a single primitive (cube, sphere,
cylinder, cone, or pyramid) from an admin-picked shape dropdown, sized to the
model's bounding box. Two limitations motivate this change:

1. It can only represent one primitive at a time — many real objects are
   *compound* shapes (e.g. a soldering iron is a cylinder plus a cone), which
   the dropdown can't express.
2. The admin has no creative control over the simplified shape itself, only
   a category pick and automatic sizing.

This spec replaces the auto-generated primitive with an **authored**
simplified shape: the admin models it by hand as a second object inside the
same GLB file, and the app extracts and displays its edges.

## Scope

- New GLB authoring convention: every uploaded model must contain two
  top-level objects named **"Solid"** (the real/detailed shape, shown
  normally) and **"Edges"** (a simplified proxy shape, shown as a clean
  thick outline in wireframe mode).
- A shared helper locates these two objects, recenters the model, and
  converts "Edges" into thick outline lines (corners/silhouette only, not
  full triangulation) — used identically by the plain preview and the
  marker-tracked AR viewer, so both stay visually and behaviorally
  consistent.
- The plain (non-AR) preview drops `<model-viewer>` in favor of a
  Three.js canvas we control directly, since `<model-viewer>` has no way to
  selectively hide the "Edges" object (it would render both objects
  overlapping).
- Admin UI drops the shape dropdown; gains client-side validation that a
  selected `.glb` actually contains "Solid" and "Edges" before upload.
- `.usdz` upload becomes optional (it was only required for
  `<model-viewer>`'s native AR handoff, which this change removes).

## Out of Scope

- Any change to the marker-tracked AR anchoring/tracking mechanics
  themselves (MindAR setup, `PHYSICAL_QR_SIZE_METERS` scaling, drag-to-rotate)
  — this spec only changes *what* is loaded and *how* solid/edges toggle,
  not how the AR camera session works. **The existing AR flow must keep
  working exactly as it does today** — camera start, marker tracking,
  target-found/lost handling, drag rotation, and cleanup/disposal on exit
  are all unchanged except for swapping in the new load/toggle logic.
- Native AR (Quick Look / Scene Viewer) handoff — already documented as
  intentionally superseded by marker-tracked AR in the prior spec; this
  change just completes that by removing `<model-viewer>` from the last
  place it was still used.
- Migrating/editing existing stored items' data. Old items without a
  `shape` field or without Solid/Edges objects in their GLB are handled by
  the fallback behavior below, not a data migration.
- Removing `.usdz` storage/upload capability entirely — it becomes
  optional, not deleted, in case it's wanted again later for a small,
  clearly-justified reason (avoiding unrelated scope creep here).

## Authoring Convention

The admin creates two top-level objects in their 3D tool before exporting
to `.glb`:

- **"Solid"** — the real, detailed model (or however detailed the admin
  wants), rendered with its authored materials.
- **"Edges"** — a simplified proxy mesh (e.g. a cylinder + a cone) built as
  a normal solid mesh. The app never shows its faces — only its edges.

Matching is case-insensitive on the object name. Both objects should be
positioned/scaled relative to each other exactly as they should appear
together (the recentering step preserves their relative alignment, it
doesn't re-align them to each other).

## Shared Rendering Logic

A new pure-ish helper, `buildModelParts(gltfScene, lineMaterial)`, used by
both the plain preview and the AR viewer:

1. Find children named "solid" / "edges" (case-insensitive, first match).
2. **Fallback for missing parts:** if either is absent, return
   `{ solid: null, edges: null }` and leave `gltfScene` untouched (rendered
   as a single always-visible solid). Callers disable the wireframe toggle
   in this case (same disabled-with-tooltip pattern as `item.arTargetUrl`
   being missing for "Start AR").
3. Recenter: compute `Box3.setFromObject(gltfScene)` (covers the whole
   scene, i.e. both objects), subtract the center from `gltfScene.position`.
   Recentering the shared parent — not each child individually — keeps
   Solid and Edges aligned to each other exactly as authored.
4. For every mesh under "edges" (`edges.traverse`): set `mesh.visible =
   false`, build `new THREE.EdgesGeometry(mesh.geometry, 1)` (1° threshold —
   keeps real corners/silhouette, drops the diagonals introduced by
   triangulating flat faces), convert to a `LineSegmentsGeometry`, and add a
   `LineSegments2` child to that mesh using the shared `LineMaterial`.
   Attaching the line as a child of the mesh means it inherits the mesh's
   full local transform for free, no manual matrix math.
5. Return `{ solid, edges }` (the two top-level nodes) so callers can toggle
   `.visible` on each to switch modes. Because Three.js skips rendering an
   invisible object's entire subtree, hiding "Edges" hides its line
   children too, and the always-`visible = false` meshes inside "Edges"
   never show their faces regardless.

**Thick lines.** `LineBasicMaterial.linewidth` is ignored on most
GPU/browser combinations (a longstanding WebGL/ANGLE limitation), so plain
`THREE.LineSegments` can't reliably render thick lines. This uses three.js's
fat-line pipeline instead (`LineSegmentsGeometry` + `LineMaterial` +
`LineSegments2`, from `three/examples/jsm/lines/` — already available in the
installed `three` dependency, no new package needed), with pixel-space
`linewidth` (not world-units) so the outline reads as thick regardless of
camera distance/zoom. `LineMaterial.resolution` must be kept in sync with
canvas size on resize, in both the plain preview and the AR viewer.

**Color:** the same green accent (`0x00ff88`) already used for the old
wireframe primitive, for visual continuity against the dark viewer/camera
background.

## Component Changes

- **New `app/view/[id]/ModelCanvas.js`** — replaces both `<model-viewer>`
  and `WireframeViewer.js`. A Three.js canvas with ambient + directional
  lighting and `OrbitControls`, loading the GLB once via `GLTFLoader` +
  `buildModelParts`, and a `mode` prop (`"solid" | "edges"`) that toggles
  `.visible` on the returned nodes. If parts are missing, always shows the
  raw scene and reports that to the parent (for disabling the toggle).
- **`app/view/[id]/CameraARViewer.js`** — keeps its existing MindAR
  setup, camera lifecycle, status states, drag-to-rotate, and disposal
  exactly as-is. Only the model-loading section changes: instead of
  building a bounding-box primitive, it calls `buildModelParts` on the
  loaded `gltf.scene` and toggles `.visible` on the returned Solid/Edges
  nodes the same way it already toggles `shadedRef`/`wireframeRef` today.
  Drops the `shape` prop. Adds a `LineMaterial.resolution` resize listener
  alongside the existing renderer setup.
- **`app/view/[id]/ViewerClient.js`** — removes the `<Script>` tag loading
  `@google/model-viewer` and the old dual-block (model-viewer /
  WireframeViewer) JSX; renders `ModelCanvas` whenever not in AR mode,
  driven by the existing `ModeSwitch`. Copy that referenced "Tap the AR
  icon" (model-viewer's own AR button) is updated to point at the "Start
  AR" button instead, since that's now the only AR entry point.

## Admin Changes (`app/admin/page.js`)

- Removes the "Shape" dropdown, its state, and the table column.
- Before calling `POST /api/items`, parses the selected `.glb` file
  client-side with `GLTFLoader` (loading from an object URL, same general
  technique already used for the AR-target compile step) and checks for
  "Solid"/"Edges" objects. Blocks submission with an inline error
  ("Model must contain two objects named 'Solid' and 'Edges'") if missing,
  so mistakes are caught before upload rather than surfacing later as a
  disabled wireframe toggle.
- `.usdz` file input becomes optional, not required, to submit the form.

## API / Data Model Changes

- `POST /api/items` (`app/api/items/route.js`): drops `shape` from
  parsing, validation, and the stored item; `usdz` is uploaded and
  `usdzUrl` set only if a file was provided, and is no longer part of the
  required-fields check.
- Item documents drop the `shape` field going forward. Existing stored
  items that still have a `shape` field are unaffected — it's just ignored.

## Fallback / Error Handling

- **GLB missing Solid/Edges (existing items, or a malformed upload that
  slipped past admin-side validation):** renders solid-only, wireframe
  toggle disabled with a tooltip explaining why — never a hard error,
  never blocks viewing or AR.
- **AR must keep working regardless of this change** — camera
  permission errors, AR-start timeouts, and target-tracking loss all keep
  their existing status states and messages, untouched by this spec.
- Admin-side upload validation catches bad files before they're stored, so
  the runtime fallback above is mainly a safety net for legacy items, not
  the primary defense.

## Demo Asset Update

`scripts/generate_cube_glb.py` currently emits a single unnamed cube node.
It's updated to emit two top-level nodes, "Solid" and "Edges" (both the
same cube geometry), so the seeded `demo` item continues to work and
demonstrates the feature end-to-end after regeneration + reseeding.

## Removed Files

- `lib/wireframePrimitive.js` and `lib/wireframePrimitive.test.js`
- `app/view/[id]/geometryFromParams.js`
- `app/view/[id]/WireframeViewer.js`

## Testing Considerations

- Unit test (replacing the deleted `wireframePrimitive.test.js`): pure
  logic of finding Solid/Edges by case-insensitive name and the
  missing-parts fallback, at whatever level is testable without a full
  WebGL context.
- Admin: uploading a `.glb` without Solid/Edges is blocked with a clear
  message; uploading a valid one succeeds without requiring `.usdz`.
- Preview (`ModelCanvas`): solid/edges toggle on the regenerated demo item;
  a legacy/malformed item renders solid-only with the toggle disabled.
- **AR mode — must be verified on real devices (Android Chrome + iOS
  Safari), same as the original AR spec required:** camera permission
  flow, marker detection/tracking, solid/edges toggle live during tracking,
  drag-to-rotate, target-lost/found transitions, and "Exit AR" fully
  releasing the camera — none of this should regress from today's behavior.
- Thick-line rendering: confirm `LineMaterial.resolution` updates correctly
  on window/container resize in both preview and AR, so line thickness
  doesn't become wrong (too thin/thick) after a resize or orientation
  change.
