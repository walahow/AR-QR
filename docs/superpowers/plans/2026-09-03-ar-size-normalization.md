# AR Model Size Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every model appears at a consistent, reasonable size in AR mode (2x the marker's printed width, largest dimension), regardless of the arbitrary unit scale it was authored/exported at.

**Architecture:** `lib/buildModelParts.js` starts always returning the combined bounding-box `size` it already computes internally. `CameraARViewer.js` uses it to wrap the (already-recentered) loaded model in a new group carrying a normalization scale, layered on top of the existing marker-tracking transform without disturbing it.

**Tech Stack:** Three.js, existing `node --test` unit tests for `lib/`.

Full design: [docs/superpowers/specs/2026-09-03-ar-size-normalization-design.md](../specs/2026-09-03-ar-size-normalization-design.md)

**Constraint carried through the `CameraARViewer.js` task: every other part of the AR lifecycle (MindAR setup, camera lights, drag-to-rotate, status handling, cleanup) stays exactly as it is today — only the block that parents the loaded model changes.**

---

### Task 1: `lib/buildModelParts.js` — always return bounding-box `size`

**Files:**
- Modify: `lib/buildModelParts.js`
- Modify: `lib/buildModelParts.test.js`

- [ ] **Step 1: Update the failing/changed tests**

Replace `lib/buildModelParts.test.js`'s "returns null parts…" test and add two new tests, so the file reads:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "./buildModelParts.js";

function makeSolidAndEdges({ solidName = "Solid", edgesName = "Edges", offset = 0 } = {}) {
  const root = new THREE.Group();

  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = solidName;
  solidNode.position.set(offset, 0, 0);

  const edgesNode = new THREE.Group();
  edgesNode.name = edgesName;
  const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  edgeMesh.position.set(offset, 0, 0);
  edgesNode.add(edgeMesh);

  root.add(solidNode, edgesNode);
  return { root, solidNode, edgesNode, edgeMesh };
}

test("finds Solid by name and returns a toggleable outline group for Edges", () => {
  const { root, solidNode } = makeSolidAndEdges({
    solidName: "SOLID",
    edgesName: "edges",
  });

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, solidNode);
  assert.ok(result.edges);
  assert.equal(result.edges.parent, root);
});

test("hides every mesh under Edges and puts its outline in a separate group, not as the mesh's own child", () => {
  const { root, edgeMesh } = makeSolidAndEdges();

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(edgeMesh.visible, false);
  assert.equal(edgeMesh.children.length, 0);
  assert.equal(result.edges.children.length, 1);
  assert.equal(result.edges.children[0].isLineSegments2, true);
});

test("outline lines preserve their source mesh's world position/rotation after reparenting", () => {
  const { root, edgeMesh } = makeSolidAndEdges({ offset: 2 });
  edgeMesh.rotation.y = Math.PI / 4;

  const result = buildModelParts(root, new LineMaterial());
  root.updateMatrixWorld(true);

  const meshWorldPos = edgeMesh.getWorldPosition(new THREE.Vector3());
  const lineWorldPos = result.edges.children[0].getWorldPosition(new THREE.Vector3());

  assert.ok(lineWorldPos.distanceTo(meshWorldPos) < 1e-6);
});

test("recenters the root based on the combined bounding box of Solid and Edges", () => {
  const { root } = makeSolidAndEdges({ offset: 2 });

  buildModelParts(root, new LineMaterial());

  assert.equal(root.position.x, -2);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("skips degenerate meshes under Edges without throwing and processes valid sibling meshes", () => {
  const { root, edgesNode } = makeSolidAndEdges();

  const degenerateMesh = new THREE.Mesh(new THREE.BufferGeometry());
  edgesNode.add(degenerateMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(degenerateMesh.visible, false);
  assert.equal(degenerateMesh.children.length, 0);
  assert.equal(result.edges.children.length, 1);
  assert.equal(result.edges.children[0].isLineSegments2, true);
});

test("returns the combined bounding box size when Solid and Edges are found", () => {
  const { root } = makeSolidAndEdges();

  const result = buildModelParts(root, new LineMaterial());

  assert.ok(result.size.equals(new THREE.Vector3(1, 1, 1)));
});

test("size reflects the combined extent of differently-sized Solid and Edges objects", () => {
  const root = new THREE.Group();
  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = "Solid";
  const edgesNode = new THREE.Group();
  edgesNode.name = "Edges";
  const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1));
  edgesNode.add(edgeMesh);
  root.add(solidNode, edgesNode);

  const result = buildModelParts(root, new LineMaterial());

  assert.ok(result.size.x >= 3);
});

test("returns null parts, a computed size, and leaves the root untouched when Solid or Edges is missing", () => {
  const root = new THREE.Group();
  const onlyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4));
  onlyMesh.name = "Mesh";
  root.add(onlyMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, null);
  assert.equal(result.edges, null);
  assert.ok(result.size.equals(new THREE.Vector3(2, 3, 4)));
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `node --test lib/buildModelParts.test.js`
Expected: FAIL — the two new `size` assertions fail (`result.size` is `undefined`), the old "returns null parts…" test name/assertions are gone so nothing to fail there, everything else still passes.

- [ ] **Step 3: Update the implementation**

In `lib/buildModelParts.js`, move the `Box3`/`size` computation before the Solid/Edges presence check, and include `size` in both return statements:

```js
import * as THREE from "three";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";

// Corners/silhouette lines are kept; the diagonals introduced by
// triangulating flat faces (angle 0) are dropped.
const EDGE_THRESHOLD_DEGREES = 1;

function findNamedChild(root, name) {
  return (
    root.children.find(
      (child) => child.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}

// Locates the "Solid" and "Edges" top-level objects an admin authored into
// one GLB, recenters the whole scene on their combined bounding box (so
// Solid and Edges stay aligned to each other exactly as authored), and
// replaces every mesh under "Edges" with a thick outline line (real faces
// hidden). `size` (the combined bounding box's dimensions) is always
// returned, even when Solid/Edges aren't found, so callers can size-
// normalize a model regardless of whether it follows that convention.
// Returns { solid: null, edges: null, size } without touching the scene
// if either object is missing, so callers can fall back to solid-only
// display and disable their wireframe toggle.
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

  // Outline lines are collected under a fresh group rather than left as
  // children of their source mesh: WebGLRenderer's projectObject() returns
  // before recursing into an invisible object's children, so a line
  // parented under a mesh with visible = false would never be traversed for
  // rendering, no matter its own visibility. Hiding each source mesh (so
  // its own faces never draw) while keeping its extracted outline actually
  // visible requires the outline to live outside that mesh's subtree.
  const meshes = [];
  edgesSource.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  const outlines = new THREE.Group();
  root.add(outlines);
  meshes.forEach((mesh) => {
    mesh.visible = false;
    if (!mesh.geometry?.attributes?.position) return;
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEGREES);
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(edgesGeometry.attributes.position.array);
    edgesGeometry.dispose();
    const line = new LineSegments2(lineGeometry, lineMaterial);
    // Parent under the mesh first so attach() below can read its resolved
    // transform, then reparent to `outlines` while preserving that world
    // transform (attach() does the necessary matrix math for us).
    mesh.add(line);
    outlines.attach(line);
  });

  return { solid, edges: outlines, size };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/buildModelParts.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests, including the unrelated `disposeObject3D` ones)

- [ ] **Step 6: Commit**

```bash
git add lib/buildModelParts.js lib/buildModelParts.test.js
git commit -m "$(cat <<'EOF'
Always return bounding-box size from buildModelParts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `lib/arConfig.js` — add the normalization target constant

**Files:**
- Modify: `lib/arConfig.js`

- [ ] **Step 1: Add the constant**

Current file:

```js
// The physical width, in meters, that item QR codes should be printed
// at. Used to scale AR content to real-world size when anchored to a
// tracked QR code. Document this next to the QR code in the admin UI
// so whoever prints codes knows the assumed size.
export const PHYSICAL_QR_SIZE_METERS = 0.08;
```

Add this constant after it:

```js
// AR content is auto-scaled so each model's largest bounding-box dimension
// equals this many marker-widths, regardless of the model's own authored
// unit scale - most uploaded GLBs (especially downloaded ones) aren't
// authored in accurate real-world meters. 2x keeps the model clearly
// bigger than the printed marker without overwhelming the frame.
export const AR_MODEL_SIZE_MARKER_WIDTHS = 2;
```

The full file should read:

```js
// The physical width, in meters, that item QR codes should be printed
// at. Used to scale AR content to real-world size when anchored to a
// tracked QR code. Document this next to the QR code in the admin UI
// so whoever prints codes knows the assumed size.
export const PHYSICAL_QR_SIZE_METERS = 0.08;

// AR content is auto-scaled so each model's largest bounding-box dimension
// equals this many marker-widths, regardless of the model's own authored
// unit scale - most uploaded GLBs (especially downloaded ones) aren't
// authored in accurate real-world meters. 2x keeps the model clearly
// bigger than the printed marker without overwhelming the frame.
export const AR_MODEL_SIZE_MARKER_WIDTHS = 2;
```

- [ ] **Step 2: Run the build to confirm no syntax errors**

Run: `npm run build`
Expected: succeeds (this constant isn't consumed until Task 3, so this just checks the file itself is valid)

- [ ] **Step 3: Commit**

```bash
git add lib/arConfig.js
git commit -m "$(cat <<'EOF'
Add AR_MODEL_SIZE_MARKER_WIDTHS normalization constant

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `CameraARViewer.js` — normalize model size in AR

**Files:**
- Modify: `app/view/[id]/CameraARViewer.js`

- [ ] **Step 1: Update the import line**

Find:
```js
import { PHYSICAL_QR_SIZE_METERS } from "@/lib/arConfig";
```
Replace with:
```js
import { PHYSICAL_QR_SIZE_METERS, AR_MODEL_SIZE_MARKER_WIDTHS } from "@/lib/arConfig";
```

- [ ] **Step 2: Update the model-loading callback**

Find this block (inside the `loader.load(glbUrl, (gltf) => { ... })` callback):

```js
        root = gltf.scene;
        const { solid, edges } = buildModelParts(root, lineMaterial);
        solidRef.current = solid;
        edgesRef.current = edges;
        setHasEdges(Boolean(edges));
        if (!edges) setShowWireframe(false);

        if (solid) solid.visible = !showWireframeRef.current;
        if (edges) edges.visible = showWireframeRef.current;

        contentGroup.add(root);
```

Replace with:

```js
        root = gltf.scene;
        const { solid, edges, size } = buildModelParts(root, lineMaterial);
        solidRef.current = solid;
        edgesRef.current = edges;
        setHasEdges(Boolean(edges));
        if (!edges) setShowWireframe(false);

        if (solid) solid.visible = !showWireframeRef.current;
        if (edges) edges.visible = showWireframeRef.current;

        // Most uploaded GLBs aren't authored in accurate real-world
        // meters, so trusting the model's own scale (as contentGroup's
        // marker-width transform above does) would make different items
        // appear wildly, inconsistently sized in AR. This wraps the
        // already-recentered root in its own group so its largest
        // dimension always maps to a fixed number of marker-widths -
        // applying this as root.scale directly instead would combine
        // incorrectly with buildModelParts's recentering translation
        // (root.position is set in root's own unscaled units), leaving
        // the model off-center once scaled.
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const normalizedGroup = new THREE.Group();
        normalizedGroup.scale.setScalar(
          (AR_MODEL_SIZE_MARKER_WIDTHS * PHYSICAL_QR_SIZE_METERS) / maxDim
        );
        normalizedGroup.add(root);
        contentGroup.add(normalizedGroup);
```

Everything else in the file — MindAR setup, lighting, drag-to-rotate, `onTargetFound`/`onTargetLost`, the `start()` timeout handling, the cleanup function (including `disposeObject3D(root)`, which still finds and disposes everything correctly since it traverses `root` directly, unaffected by the new wrapping group) — is unchanged.

- [ ] **Step 3: Verify the math with a standalone check**

Before running the app, sanity-check the centering-through-scaling math holds (this is the exact concern the design doc flagged — verify it doesn't regress). Create a throwaway script (do not commit it), run it, then delete it:

```js
// scratch-check.mjs (delete after running)
import * as THREE from "three";
import { buildModelParts } from "./lib/buildModelParts.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const root = new THREE.Group();
const solid = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10)); // large, off-center
solid.name = "Solid";
solid.position.set(100, 0, 0);
const edgesNode = new THREE.Group();
edgesNode.name = "Edges";
const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
edgeMesh.position.set(100, 0, 0);
edgesNode.add(edgeMesh);
root.add(solid, edgesNode);

const { size } = buildModelParts(root, new LineMaterial());
const maxDim = Math.max(size.x, size.y, size.z) || 1;
const AR_MODEL_SIZE_MARKER_WIDTHS = 2;
const PHYSICAL_QR_SIZE_METERS = 0.08;

const normalizedGroup = new THREE.Group();
normalizedGroup.scale.setScalar((AR_MODEL_SIZE_MARKER_WIDTHS * PHYSICAL_QR_SIZE_METERS) / maxDim);
normalizedGroup.add(root);

normalizedGroup.updateMatrixWorld(true);
const worldPos = solid.getWorldPosition(new THREE.Vector3());
console.log("solid world position after normalization (should be ~[0,0,0], not [100,0,0]):", worldPos);
console.log("normalizedGroup scale:", normalizedGroup.scale.x, "(expect 2*0.08/10 = 0.016)");
```

Run: `node scratch-check.mjs`
Expected: `solid world position` prints approximately `[0, 0, 0]` (confirms the model is still correctly centered on the anchor after normalization, not offset), and the scale prints `0.016`. If the position is instead close to `[100, 0, 0]` (or `[100 * 0.016, 0, 0]` = `[1.6, 0, 0]`), the centering-then-scaling math has regressed — stop and re-examine before proceeding, don't just delete the script and move on.

Delete the scratch script after confirming:
```bash
rm scratch-check.mjs
```

- [ ] **Step 4: Run the full build**

Run: `npm run build`
Expected: succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add app/view/\[id\]/CameraARViewer.js
git commit -m "$(cat <<'EOF'
Normalize AR model size regardless of authored unit scale

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Confirm the plain preview is unaffected**

Load `/view/[id]` for any item with a working model (use `GET /api/items` to find one — this repo's `.env.local` points at a live MongoDB, `data/items.json`'s "demo" entry won't resolve locally). Confirm it looks exactly as it did before this change — this feature doesn't touch `ModelCanvas.js` at all.

- [ ] **Step 3: Confirm AR mode loads the model with the expected normalized scale**

Load the same item's `/view/[id]` page, click "Start AR". Even if camera access isn't grantable in your test environment, the model still loads and gets added to the scene graph before the camera-permission step runs (check by inspecting `contentGroup`'s children via the browser console/dev tools, or add a temporary `console.log` if needed — remove it before considering this step done). Confirm there's exactly one `normalizedGroup`-shaped wrapper between `contentGroup` and the loaded `root`, and its scale roughly matches `(2 * 0.08) / <that item's largest bounding-box dimension>`.

- [ ] **Step 4: Real-device check (when available)**

On an actual phone with camera access, compare two items with very differently-scaled source GLBs (if available) side by side in AR — both should now appear at a similar, reasonable apparent size next to the printed marker, and both should be correctly centered on the marker (not offset to one side). This is the check that most directly validates the feature; do it when a real device is available even if it can't happen in this session.
