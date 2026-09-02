# AR Model Size Normalization — Design

Date: 2026-09-03

## Purpose

AR mode ([app/view/[id]/CameraARViewer.js](../../../app/view/[id]/CameraARViewer.js))
anchors a loaded model to a physical printed marker, scaling it via
`contentGroup.scale.setScalar(1 / PHYSICAL_QR_SIZE_METERS)` — this assumes
every uploaded GLB is authored in accurate real-world meters. In practice
many aren't (a Sketchfab-downloaded model observed during this feature's
testing rendered as a tiny sliver filling the whole frame), so different
items appear wildly, inconsistently sized relative to the marker and to
each other. This spec normalizes every model to a consistent apparent size
in AR, regardless of its authored unit scale.

## Scope

- Every model's combined bounding-box largest dimension is scaled to a
  fixed target: **2× the physical marker's printed width** (today,
  `2 * PHYSICAL_QR_SIZE_METERS` ≈ 16cm), expressed as a multiplier so it
  stays in sync if the marker size constant ever changes.
- AR mode only. The plain preview ([ModelCanvas.js](../../../app/view/[id]/ModelCanvas.js))
  already frames its camera per-model based on bounding box, so different
  scales already look reasonable there — it's untouched by this change.
- `lib/buildModelParts.js` starts returning the combined bounding-box
  `size` (a `THREE.Vector3`) it already computes internally for
  recentering, so callers don't need a second `Box3` pass. This is returned
  **always**, including the `{ solid: null, edges: null }` fallback case —
  size normalization is orthogonal to whether a model follows the
  Solid/Edges authoring convention.

## Out of Scope

- Per-item admin-specified real-world size (considered, explicitly
  rejected in favor of automatic normalization — no admin input required).
- Any change to the marker-tracking math itself (`contentGroup`'s scale,
  MindAR's anchor/postMatrix handling) — that's about correct real-world
  camera-motion/position tracking and stays exactly as-is. The new
  normalization is an *additional* scale layered on top of it.
- Any change to the plain preview's camera framing.

## Mechanism

`lib/buildModelParts.js`: move the existing `Box3().setFromObject(root)`
call before the Solid/Edges presence check, and return its `size` in both
return paths:

```js
export function buildModelParts(root, lineMaterial) {
  const solid = findNamedChild(root, "solid");
  const edgesSource = findNamedChild(root, "edges");

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  if (!solid || !edgesSource) {
    return { solid: null, edges: null, size };
  }

  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  // ...unchanged from here...
  return { solid, edges: outlines, size };
}
```

`lib/arConfig.js` gains one new constant:

```js
// AR content is auto-scaled so each model's largest bounding-box dimension
// equals this many marker-widths, regardless of the model's own authored
// unit scale — most uploaded GLBs (especially downloaded ones) aren't
// authored in accurate real-world meters. 2x keeps the model clearly
// bigger than the printed marker without overwhelming the frame.
export const AR_MODEL_SIZE_MARKER_WIDTHS = 2;
```

`CameraARViewer.js`: after `buildModelParts` resolves, wrap `root` in a
**new intermediate group** carrying the normalization scale, rather than
setting `root.scale` directly. This matters: `buildModelParts` already set
`root.position` to `-center` (in the model's own unscaled units) to
recenter it. If `root.scale` were set directly, that fixed `position`
offset would combine incorrectly with the new scale (Three.js applies
scale before translation within a single object's local matrix), leaving
the model off-center — noticeably so for models scaled down or up by a
large factor. A separate wrapping group avoids this: the recentering
translation happens once, in `root`'s own unscaled local space, and the
wrapping group's scale then applies uniformly to that already-correctly-
centered result.

```js
const { solid, edges, size } = buildModelParts(root, lineMaterial);
// ...existing solid/edges ref wiring, unchanged...

const maxDim = Math.max(size.x, size.y, size.z) || 1;
const normalizedGroup = new THREE.Group();
normalizedGroup.scale.setScalar(
  (AR_MODEL_SIZE_MARKER_WIDTHS * PHYSICAL_QR_SIZE_METERS) / maxDim
);
normalizedGroup.add(root);
contentGroup.add(normalizedGroup);
```

This replaces the existing `contentGroup.add(root);` line. Everything else
in `CameraARViewer.js` — MindAR setup, lighting, drag-to-rotate, timeout
handling, disposal — is unchanged. `disposeObject3D(root)` in cleanup still
finds and disposes everything correctly; the wrapping group itself holds no
disposable resources and is abandoned along with the rest of the scene
graph when the component unmounts, consistent with how `contentGroup`
itself is already handled today.

## Testing

- `lib/buildModelParts.test.js`: update the existing "returns null parts…"
  test (currently asserts `deepEqual(result, { solid: null, edges: null })`,
  which will now fail since `size` is always present) to also assert on
  `size`. Add a new test confirming `size` reflects the correct combined
  bounding-box dimensions in both the found and not-found cases.
- Manual verification: load AR mode against the "hed n solder" item (the
  one observed rendering as an oversized sliver) and confirm it now
  appears at a consistent, reasonable size next to the marker, correctly
  centered (not offset to one side).
