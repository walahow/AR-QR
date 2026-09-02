# Hide Unrecognized Top-Level Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a GLB's "Solid" and "Edges" objects are both found, any OTHER top-level object in the file (leftover helpers, empties, stray reference meshes) is hidden unconditionally — currently `buildModelParts` only ever touches the two objects it recognizes by name, leaving anything else visible all the time in both Normal and Wireframe mode.

**Architecture:** One additive loop in `lib/buildModelParts.js`, inside the already-existing "found" branch, before the outline-extraction logic runs (so the group it creates for outlines isn't accidentally caught by the same loop).

**Tech Stack:** Three.js, existing `node --test` unit tests.

---

### Task 1: `lib/buildModelParts.js` — hide unrecognized top-level objects

**Files:**
- Modify: `lib/buildModelParts.js`
- Modify: `lib/buildModelParts.test.js`

- [ ] **Step 1: Write the failing test**

Add this test to `lib/buildModelParts.test.js` (place it near the other tests that use `makeSolidAndEdges`):

```js
test("hides top-level objects that aren't named Solid or Edges", () => {
  const { root, solidNode, edgesNode } = makeSolidAndEdges();
  const extra = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  extra.name = "SomeLeftoverHelper";
  root.add(extra);

  buildModelParts(root, new LineMaterial());

  assert.equal(extra.visible, false);
  assert.equal(solidNode.visible, true);
  assert.equal(edgesNode.visible, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/buildModelParts.test.js`
Expected: FAIL — `extra.visible` is still `true` (nothing hides it yet)

- [ ] **Step 3: Add the hiding logic**

In `lib/buildModelParts.js`, insert this loop right after `root.position.sub(center);` and before the existing `const meshes = [];` line:

```js
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  // Any top-level object besides the two the admin explicitly named is
  // very likely a leftover from authoring (a reference mesh, an empty, a
  // stray helper) rather than something meant to display - hide it
  // unconditionally, in both modes. This runs before `outlines` (below)
  // is added to root, so the newly-created outline group itself is never
  // caught by this check.
  root.children.forEach((child) => {
    if (child !== solid && child !== edgesSource) child.visible = false;
  });

  const meshes = [];
```

The full function should now read:

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
// Solid and Edges stay aligned to each other exactly as authored), hides
// any other top-level object (leftover authoring helpers), and replaces
// every mesh under "Edges" with a thick outline line (real faces hidden).
// `size` (the combined bounding box's dimensions) is always returned, even
// when Solid/Edges aren't found, so callers can size-normalize a model
// regardless of whether it follows that convention.
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

  // Any top-level object besides the two the admin explicitly named is
  // very likely a leftover from authoring (a reference mesh, an empty, a
  // stray helper) rather than something meant to display - hide it
  // unconditionally, in both modes. This runs before `outlines` (below)
  // is added to root, so the newly-created outline group itself is never
  // caught by this check.
  root.children.forEach((child) => {
    if (child !== solid && child !== edgesSource) child.visible = false;
  });

  const meshes = [];
  edgesSource.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  // Outline lines are collected under a fresh group rather than left as
  // children of their source mesh: WebGLRenderer's projectObject() returns
  // before recursing into an invisible object's children, so a line
  // parented under a mesh with visible = false would never be traversed for
  // rendering, no matter its own visibility. Hiding each source mesh (so
  // its own faces never draw) while keeping its extracted outline actually
  // visible requires the outline to live outside that mesh's subtree.
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/buildModelParts.test.js`
Expected: PASS (9 tests — the 8 existing ones plus this new one)

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test`
Expected: PASS (all tests)

Run: `npm run build`
Expected: succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add lib/buildModelParts.js lib/buildModelParts.test.js
git commit -m "$(cat <<'EOF'
Hide top-level objects not named Solid or Edges

Previously any extra object in a GLB alongside "Solid"/"Edges" stayed
visible unconditionally in both display modes, since buildModelParts
only ever touched the two objects it recognized by name.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Confirm the "demo" item still displays correctly**

Load `/view/demo` (or the correct id via `GET /api/items`). Confirm the cube still toggles between Normal and Wireframe exactly as before — this item has no extra objects, so this task shouldn't change its behavior at all. This is a regression check, not a test of the new behavior (the demo GLB doesn't have any extra objects to hide).

- [ ] **Step 3: (Optional, if time allows) Construct a quick real test case**

If convenient, author (or find) a `.glb` with three top-level objects — "Solid", "Edges", and something else (e.g. "Empty" or a leftover reference mesh) — upload it via `/admin`, and confirm in the viewer that only Solid/Edges ever show, in either mode. If no such test file is readily available, the unit test from Task 1 is the primary verification for this behavior — this step is a nice-to-have, not a blocker.
