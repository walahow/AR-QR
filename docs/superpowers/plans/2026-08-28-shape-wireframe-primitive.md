# Shape-Based Wireframe Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wireframe toggle's real-mesh wireframe with a simplified primitive shape (cube, sphere, cylinder, cone, or pyramid) that the admin tags per item, auto-sized to the model's bounding box — so students see "this is basically a cylinder" instead of a dense tangle of real triangles.

**Architecture:** Add a required `shape` field to items (admin-picked dropdown, validated server-side). A new pure module (`lib/wireframePrimitive.js`) computes primitive geometry parameters from a shape + bounding box — unit-tested in isolation. `WireframeViewer.js` uses it to build and render a Three.js primitive mesh instead of applying a wireframe material to the real loaded mesh (the real mesh is still loaded, but only to measure its bounding box).

**Tech Stack:** Existing stack (Next.js, Three.js, MongoDB via `lib/store.js`, Vercel Blob). No new dependencies. Node's built-in test runner (`node --test`) is used for the one pure-logic module — no test framework added, since nothing else in this codebase has automated tests and a full framework isn't warranted for one small module.

---

## Relationship to the design spec

This plan implements only the **"Wireframe Primitive Generation"** and the
related **"Data Model Changes"** / admin-form portions of
[docs/superpowers/specs/2026-08-28-marker-ar-wireframe-design.md](../specs/2026-08-28-marker-ar-wireframe-design.md).

It deliberately does **not** touch:
- Marker-anchored AR / MindAR integration
- Dropping `<model-viewer>` or consolidating preview+AR into one `ModelCanvas`
- The admin's AR-target compile step

Those are covered by a follow-up plan. Today's native AR button
(`<model-viewer ar>`) is untouched by this plan and keeps working exactly as
it does now.

## Task 1: Shape list + primitive sizing math (TDD)

**Files:**
- Create: `lib/wireframePrimitive.js`
- Test: `lib/wireframePrimitive.test.js`
- Modify: `package.json` (add `test` script)

- [ ] **Step 1: Write the failing test**

```js
// lib/wireframePrimitive.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHAPES, isValidShape, buildPrimitiveParams } from "./wireframePrimitive.js";

test("SHAPES lists the five supported shapes", () => {
  assert.deepEqual(SHAPES, ["cube", "sphere", "cylinder", "cone", "pyramid"]);
});

test("isValidShape accepts known shapes and rejects unknown ones", () => {
  assert.equal(isValidShape("cube"), true);
  assert.equal(isValidShape("donut"), false);
});

test("buildPrimitiveParams sizes a cube directly from the bounding box", () => {
  const params = buildPrimitiveParams("cube", { width: 2, height: 3, depth: 4 });
  assert.deepEqual(params, { type: "box", width: 2, height: 3, depth: 4 });
});

test("buildPrimitiveParams sizes a sphere from the largest bounding-box dimension", () => {
  const params = buildPrimitiveParams("sphere", { width: 2, height: 6, depth: 4 });
  assert.deepEqual(params, { type: "sphere", radius: 3 });
});

test("buildPrimitiveParams sizes a cylinder from width/depth radius and height", () => {
  const params = buildPrimitiveParams("cylinder", { width: 2, height: 5, depth: 4 });
  assert.deepEqual(params, { type: "cylinder", radius: 2, height: 5 });
});

test("buildPrimitiveParams sizes a cone the same way as a cylinder, with 32 sides", () => {
  const params = buildPrimitiveParams("cone", { width: 2, height: 5, depth: 4 });
  assert.deepEqual(params, { type: "cone", radius: 2, height: 5, sides: 32 });
});

test("buildPrimitiveParams sizes a pyramid as a 4-sided cone", () => {
  const params = buildPrimitiveParams("pyramid", { width: 2, height: 5, depth: 4 });
  assert.deepEqual(params, { type: "cone", radius: 2, height: 5, sides: 4 });
});

test("buildPrimitiveParams rejects an unknown shape", () => {
  assert.throws(
    () => buildPrimitiveParams("donut", { width: 1, height: 1, depth: 1 }),
    /Unknown shape/
  );
});

test("buildPrimitiveParams rejects a degenerate bounding box", () => {
  assert.throws(
    () => buildPrimitiveParams("cube", { width: 0, height: 1, depth: 1 }),
    /greater than 0/
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test lib/wireframePrimitive.test.js`
Expected: FAIL — `Cannot find module './wireframePrimitive.js'`

- [ ] **Step 3: Write the implementation**

```js
// lib/wireframePrimitive.js
export const SHAPES = ["cube", "sphere", "cylinder", "cone", "pyramid"];

export function isValidShape(shape) {
  return SHAPES.includes(shape);
}

export function buildPrimitiveParams(shape, boundingBox) {
  const { width, height, depth } = boundingBox;
  if (!(width > 0 && height > 0 && depth > 0)) {
    throw new Error("boundingBox dimensions must all be greater than 0");
  }

  const maxDim = Math.max(width, height, depth);
  const radialDim = Math.max(width, depth) / 2;

  switch (shape) {
    case "cube":
      return { type: "box", width, height, depth };
    case "sphere":
      return { type: "sphere", radius: maxDim / 2 };
    case "cylinder":
      return { type: "cylinder", radius: radialDim, height };
    case "cone":
      return { type: "cone", radius: radialDim, height, sides: 32 };
    case "pyramid":
      return { type: "cone", radius: radialDim, height, sides: 4 };
    default:
      throw new Error(`Unknown shape: ${shape}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test lib/wireframePrimitive.test.js`
Expected: PASS — all 9 tests green

- [ ] **Step 5: Add the `test` npm script**

In `package.json`, add to `"scripts"`:

```json
"test": "node --test lib/"
```

Run: `npm test`
Expected: PASS — same 9 tests found and green via the npm script

- [ ] **Step 6: Commit**

```bash
git add lib/wireframePrimitive.js lib/wireframePrimitive.test.js package.json
git commit -m "Add shape list and primitive-sizing math for wireframe mode"
```

## Task 2: API route accepts and validates `shape`

**Files:**
- Modify: `app/api/items/route.js:1-62`

- [ ] **Step 1: Update the POST handler**

Replace the full contents of `app/api/items/route.js` with:

```js
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listItems, createItem } from "@/lib/store";
import { uploadFile } from "@/lib/blob";
import { SHAPES } from "@/lib/wireframePrimitive";

export async function GET() {
  const items = await listItems();
  return NextResponse.json(items);
}

export async function POST(request) {
  let formData;
  let name;
  let shape;
  let glbFile;
  let usdzFile;
  let glbBuffer;
  let usdzBuffer;

  try {
    formData = await request.formData();
    name = formData.get("name");
    shape = formData.get("shape");
    glbFile = formData.get("glb");
    usdzFile = formData.get("usdz");

    glbBuffer = glbFile ? Buffer.from(await glbFile.arrayBuffer()) : null;
    usdzBuffer = usdzFile ? Buffer.from(await usdzFile.arrayBuffer()) : null;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid multipart/form-data" },
      { status: 400 }
    );
  }

  if (
    !name ||
    !shape ||
    !SHAPES.includes(shape) ||
    !glbFile ||
    !usdzFile ||
    glbFile.size === 0 ||
    usdzFile.size === 0
  ) {
    return NextResponse.json(
      {
        error: `name, shape (one of ${SHAPES.join(", ")}), glb, and usdz are all required`,
      },
      { status: 400 }
    );
  }

  const id = nanoid(10);

  const glbUrl = await uploadFile(`${id}.glb`, glbBuffer, "model/gltf-binary");
  const usdzUrl = await uploadFile(`${id}.usdz`, usdzBuffer, "model/vnd.usdz+zip");

  const item = {
    id,
    name: String(name),
    shape: String(shape),
    glbUrl,
    usdzUrl,
    createdAt: new Date().toISOString(),
  };

  await createItem(item);
  return NextResponse.json(item, { status: 201 });
}
```

- [ ] **Step 2: Verify manually**

This route touches Blob + MongoDB, so it's verified with the running dev
server rather than a unit test (consistent with the rest of this codebase,
which has no route-level tests). Verification happens in Task 6 once the
admin form can send `shape`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/items/route.js"
git commit -m "Require and validate shape on item creation"
```

## Task 3: Admin page shape dropdown

**Files:**
- Modify: `app/admin/page.js`

- [ ] **Step 1: Add shape state, the dropdown, and table column**

In `app/admin/page.js`, add the import and state:

```js
import { SHAPES } from "@/lib/wireframePrimitive";
```

```js
const [shape, setShape] = useState(SHAPES[0]);
```

Update the validation and submit body in `handleSubmit`:

```js
async function handleSubmit(e) {
  e.preventDefault();
  if (!name || !glbFile || !usdzFile) {
    setError("Name, .glb file, and .usdz file are all required.");
    return;
  }
  setSubmitting(true);
  setError(null);
  try {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("shape", shape);
    formData.append("glb", glbFile);
    formData.append("usdz", usdzFile);
    const res = await fetch("/api/items", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to create item");
    }
    setName("");
    setShape(SHAPES[0]);
    setGlbFile(null);
    setUsdzFile(null);
    await loadItems();
  } catch (err) {
    setError(err.message);
  } finally {
    setSubmitting(false);
  }
}
```

Add the dropdown to the form, right after the Name field:

```jsx
<label style={{ display: "block", marginBottom: 12 }}>
  Shape (for wireframe mode)
  <select
    value={shape}
    onChange={(e) => setShape(e.target.value)}
    style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "2px solid #000" }}
  >
    {SHAPES.map((s) => (
      <option key={s} value={s}>
        {s[0].toUpperCase() + s.slice(1)}
      </option>
    ))}
  </select>
</label>
```

Add a Shape column to the table header and rows:

```jsx
<th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>Shape</th>
```

```jsx
<td style={{ padding: 8 }}>{item.shape ?? "—"}</td>
```

(placed as a new `<td>` inside the existing `.map((item) => ...)` row, alongside the existing Name/QR/Delete cells)

- [ ] **Step 2: Commit**

```bash
git add app/admin/page.js
git commit -m "Add shape dropdown to admin item form"
```

## Task 4: WireframeViewer renders the primitive shape

**Files:**
- Modify: `app/view/[id]/WireframeViewer.js` (full rewrite)

- [ ] **Step 1: Replace the file contents**

```js
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildPrimitiveParams, isValidShape } from "@/lib/wireframePrimitive";

function createGeometryFromParams(params) {
  switch (params.type) {
    case "box":
      return new THREE.BoxGeometry(params.width, params.height, params.depth);
    case "sphere":
      return new THREE.SphereGeometry(params.radius, 24, 16);
    case "cylinder":
      return new THREE.CylinderGeometry(params.radius, params.radius, params.height, 32);
    case "cone":
      return new THREE.ConeGeometry(params.radius, params.height, params.sides);
    default:
      throw new Error(`Unknown geometry type: ${params.type}`);
  }
}

export default function WireframeViewer({ glbUrl, shape }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.01,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const loader = new GLTFLoader();
    let disposed = false;
    let primitiveMesh = null;

    loader.load(glbUrl, (gltf) => {
      if (disposed) return;

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());

      const resolvedShape = isValidShape(shape) ? shape : "cube";
      const params = buildPrimitiveParams(resolvedShape, {
        width: size.x || 0.01,
        height: size.y || 0.01,
        depth: size.z || 0.01,
      });

      const geometry = createGeometryFromParams(params);
      primitiveMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
      );
      scene.add(primitiveMesh);

      const radius = size.length() || 1;
      controls.target.set(0, 0, 0);
      camera.position.set(0, radius * 0.2, radius * 1.2);
    });

    let frameId;
    function animate() {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    function handleResize() {
      const { clientWidth, clientHeight } = container;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      if (primitiveMesh) {
        primitiveMesh.geometry.dispose();
        primitiveMesh.material.dispose();
      }
      container.removeChild(renderer.domElement);
    };
  }, [glbUrl, shape]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
```

Key changes from the previous version: the real loaded mesh (`gltf.scene`)
is only used to measure its bounding box via `Box3` — it's never added to
the scene. A primitive mesh built from `buildPrimitiveParams` is added
instead, and disposed on unmount alongside the renderer/controls.

- [ ] **Step 2: Commit**

```bash
git add "app/view/[id]/WireframeViewer.js"
git commit -m "Render a simplified primitive shape instead of the real mesh wireframe"
```

## Task 5: Pass `shape` from ViewerClient

**Files:**
- Modify: `app/view/[id]/ViewerClient.js:33-35`

- [ ] **Step 1: Pass the prop**

Find this line in `app/view/[id]/ViewerClient.js`:

```jsx
            <WireframeViewer glbUrl={item.glbUrl} />
```

Replace it with:

```jsx
            <WireframeViewer glbUrl={item.glbUrl} shape={item.shape} />
```

- [ ] **Step 2: Commit**

```bash
git add "app/view/[id]/ViewerClient.js"
git commit -m "Pass item shape to WireframeViewer"
```

## Task 6: Manual verification

No further code changes — this task exercises the full flow end to end,
since the admin form → API → viewer path isn't covered by the unit tests in
Task 1.

- [ ] **Step 1: Start the dev server and open `/admin`**

Create three items with different shapes (e.g. one `cube`, one `sphere`,
one `cylinder`), each with any small `.glb`/`.usdz` pair.

- [ ] **Step 2: Confirm the admin list shows the shape**

Each new row's Shape column should show the value you picked.

- [ ] **Step 3: Confirm validation**

Using the browser devtools network tab or `curl`, POST to `/api/items`
with a missing or invalid `shape` value and confirm it's rejected with a
400 and the `SHAPES`-listing error message.

- [ ] **Step 4: Open each new item's `/view/[id]` page**

For each of the three items: confirm the page loads showing the shaded
model, click "Show Wireframe", and confirm the rendered wireframe matches
the picked shape (a box, a sphere, a cylinder) — not the real object's
mesh. Click "Show AR View" to toggle back, confirm the shaded model
reappears and the existing AR button (native handoff) is still present and
unaffected.

- [ ] **Step 5: Confirm old items still work**

Open `/view/<id>` for an item created before this change (no `shape`
field in its database record, e.g. `demo`, `cubesss`, or `hed n solder` —
check via `GET /api/items`). Confirm the wireframe toggle still works and
falls back to a cube instead of crashing.

- [ ] **Step 6: Check the browser console**

Confirm no new errors appear beyond the pre-existing, expected `THREE.WARNING:
Multiple instances of Three.js being imported` warning (unchanged from
before this plan — model-viewer bundles its own Three.js internally).
