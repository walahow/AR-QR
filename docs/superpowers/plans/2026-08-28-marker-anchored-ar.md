# Marker-Anchored AR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a camera-based AR mode to `/view/[id]` that anchors the 3D object to the physical QR code the student scanned (via MindAR image tracking), with the same Normal/Wireframe mode switcher already shipped for the on-screen preview working live inside it.

**Architecture:** MindAR (`mind-ar`, already installed — see commit `513f8fd`) tracks the item's QR code as an image target and drives a `THREE.Group`'s transform every frame. We load the real glTF model plus build the same simplified-primitive wireframe from `lib/wireframePrimitive.js` (already shipped), add both as children of that group, and toggle visibility between them — reusing the exact same `ModeSwitch` UI component in both canvas mode and AR mode. Each item's AR target (a compiled `.mind` file) is produced by MindAR's `Compiler` class running in the **admin's own browser** right after item creation, then uploaded to Blob storage.

**Tech Stack:** `mind-ar` (already added), existing `three`/`GLTFLoader` stack, existing Blob/MongoDB storage (`lib/blob.js`, `lib/store.js`). No new dependencies beyond what's already installed.

---

## Prerequisite (already done)

Commit `513f8fd` already:
- Added `mind-ar` as a dependency
- Downgraded `three` to `0.150.0` (mind-ar's bundle imports `THREE.sRGBEncoding`, removed from three.js in r152 — verified this doesn't affect our existing `GLTFLoader`/`OrbitControls`/geometry usage)
- Added a Turbopack `resolveAlias` for `fs` (mind-ar's TensorFlow.js dependency has a dead Node-only branch Turbopack otherwise fails to bundle)
- Added `.npmrc` with `ignore-scripts=true` (mind-ar's `canvas` dependency fails to build natively on Windows and is never used at runtime — its own browser `Compiler` uses `document.createElement('canvas')`, not the native package)

All verified: production build succeeds, `MindARThree`/`Compiler` both resolve at runtime, existing wireframe-preview feature unaffected.

## Scope decision (confirm before executing)

This plan **adds** a "Start AR" button/mode alongside the existing Normal/Wireframe canvas switcher. It does **not** remove `<model-viewer>`'s native AR button — that stays exactly as it is today. The two AR affordances (native tap-to-place AR inside "Normal" mode, and this new marker-anchored "Start AR" mode) will coexist. Fully replacing native AR with this one (per the original design spec's end-state) is a separate, later decision once this is validated on real devices.

## Key API facts this plan relies on (verified by source inspection, not docs)

- Import from mind-ar's **pre-built dist bundles**, not `src/` (the source uses Vite-only `?worker&inline` syntax that breaks Turbopack):
  ```js
  const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");
  const { Compiler } = await import("mind-ar/dist/mindar-image.prod.js");
  ```
- `new MindARThree({ container, imageTargetSrc })` → `mindarThree.addAnchor(0)` returns `{ group, onTargetFound, onTargetLost, ... }`. `await mindarThree.start()` opens the camera and begins tracking; `mindarThree.stop()` releases it.
- **Important correction from an earlier assumption:** `anchor.group.matrixAutoUpdate = false` and MindAR overwrites `anchor.group.matrix` directly every frame — setting `anchor.group.scale` has **no effect** and is silently ignored. To apply our own physical-size scale, we must add a **nested child group** to `anchor.group` and scale that child instead (children of `anchor.group` behave normally).
- `anchor.group`'s local space has 1 unit = the compiled target image's width, origin at the target's center, z=0 at the target's plane. So a child group scaled by `PHYSICAL_QR_SIZE_METERS` converts our glTF's native meter units into that space correctly (assuming the QR is printed at that physical width).
- `Compiler` (browser build): `new Compiler()`, `await compiler.compileImageTargets([imgElement], progressCallback)`, `await compiler.exportData()` → returns a `Uint8Array` (msgpack-encoded), suitable for `new Blob([buffer])` or as a raw request body.

## Task 1: `updateItem` in the store

**Files:**
- Modify: `lib/store.js`

- [ ] **Step 1: Add the function**

Add this function to `lib/store.js`, after `createItem` and before `deleteItem`:

```js
export async function updateItem(id, patch) {
  if (useMongoDB) {
    const database = await getDB();
    const collection = database.collection("items");
    await collection.updateOne({ id }, { $set: patch });
    const updated = await collection.findOne({ id });
    if (!updated) return null;
    const { _id, ...itemWithoutId } = updated;
    return itemWithoutId;
  }
  const store = await readLocalStore();
  if (!store[id]) return null;
  store[id] = { ...store[id], ...patch };
  await writeLocalStore(store);
  return store[id];
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: succeeds with no errors (this function isn't called anywhere yet, so this just checks for syntax errors).

- [ ] **Step 3: Commit**

```bash
git add lib/store.js
git commit -m "Add updateItem to the store for patching item fields"
```

## Task 2: Physical QR size constant

**Files:**
- Create: `lib/arConfig.js`

- [ ] **Step 1: Create the file**

```js
// The physical width, in meters, that item QR codes should be printed
// at. Used to scale AR content to real-world size when anchored to a
// tracked QR code. Document this next to the QR code in the admin UI
// so whoever prints codes knows the assumed size.
export const PHYSICAL_QR_SIZE_METERS = 0.08;
```

- [ ] **Step 2: Commit**

```bash
git add lib/arConfig.js
git commit -m "Add physical QR print-size constant for AR scaling"
```

## Task 3: AR target upload endpoint

**Files:**
- Create: `app/api/items/[id]/target/route.js`

- [ ] **Step 1: Create the route**

```js
import { NextResponse } from "next/server";
import { getItem, updateItem } from "@/lib/store";
import { uploadFile } from "@/lib/blob";

export async function POST(request, { params }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Target file is empty" }, { status: 400 });
  }

  const buffer = Buffer.from(arrayBuffer);
  const arTargetUrl = await uploadFile(`${id}.mind`, buffer, "application/octet-stream");

  const updated = await updateItem(id, { arTargetUrl });
  return NextResponse.json(updated, { status: 200 });
}
```

- [ ] **Step 2: Verify manually**

Run the dev server and, for an existing item id (get one from `GET /api/items`), POST a small dummy file:

```bash
curl -X POST http://localhost:3000/api/items/<id>/target --data-binary "test-content" -H "Content-Type: application/octet-stream"
```

Expected: `200` response with the updated item JSON including `arTargetUrl` (a URL string). Then `GET /api/items/<id>` should show the same `arTargetUrl` persisted.

Also verify the 404 and 400 paths:
```bash
curl -X POST http://localhost:3000/api/items/doesnotexist/target --data-binary "x"
curl -X POST http://localhost:3000/api/items/<id>/target --data-binary ""
```
Expected: first returns 404 `{"error":"Not found"}`, second returns 400 `{"error":"Target file is empty"}`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/items/[id]/target/route.js"
git commit -m "Add endpoint to upload a compiled AR target and save its URL"
```

## Task 4: Extract shared primitive-geometry builder

**Files:**
- Create: `app/view/[id]/geometryFromParams.js`
- Modify: `app/view/[id]/WireframeViewer.js`

This pulls the `createGeometryFromParams` function (currently defined inline in `WireframeViewer.js`) into its own file so the new AR component (Task 8) can reuse it without duplicating it.

- [ ] **Step 1: Create the shared file**

```js
import * as THREE from "three";

export function createGeometryFromParams(params) {
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
```

- [ ] **Step 2: Update `WireframeViewer.js` to import it instead of defining it locally**

In `app/view/[id]/WireframeViewer.js`, remove the local `createGeometryFromParams` function definition (the whole `function createGeometryFromParams(params) { ... }` block near the top), and add this import alongside the existing ones:

```js
import { createGeometryFromParams } from "./geometryFromParams";
```

Nothing else in the file changes — it already calls `createGeometryFromParams(params)` the same way.

- [ ] **Step 3: Verify no regression**

Run: `npm run build` — expect success.

Start the dev server, open `/view/[id]` for an existing item, toggle to Wireframe mode, and confirm the primitive shape still renders exactly as before (same shape, same green wireframe color).

- [ ] **Step 4: Commit**

```bash
git add "app/view/[id]/geometryFromParams.js" "app/view/[id]/WireframeViewer.js"
git commit -m "Extract primitive geometry builder for reuse in AR mode"
```

## Task 5: Shared Normal/Wireframe mode switch component

**Files:**
- Create: `app/view/[id]/ModeSwitch.js`
- Modify: `app/view/[id]/ViewerClient.js`

- [ ] **Step 1: Create the shared component**

```js
"use client";

export default function ModeSwitch({ value, onChange, options }) {
  return (
    <div className="frame" style={{ display: "inline-flex" }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          style={{
            border: "none",
            borderRight: i < options.length - 1 ? "4px solid #000" : "none",
            background: value === opt.value ? "#000" : "#fff",
            color: value === opt.value ? "#fff" : "#000",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Use it in `ViewerClient.js`**

In `app/view/[id]/ViewerClient.js`, add the import:

```js
import ModeSwitch from "./ModeSwitch";
```

Replace the existing inline segmented-control `<div className="frame" ...>...</div>` block (the one containing the "Normal" and "Wireframe" `<button>` elements) with:

```jsx
<ModeSwitch
  value={showWireframe ? "wireframe" : "normal"}
  onChange={(v) => setShowWireframe(v === "wireframe")}
  options={[
    { value: "normal", label: "Normal" },
    { value: "wireframe", label: "Wireframe" },
  ]}
/>
```

- [ ] **Step 3: Verify no regression**

Run: `npm run build` — expect success.

Start the dev server, open `/view/[id]`, confirm the mode switcher looks and behaves identically to before (same styling, same toggle behavior).

- [ ] **Step 4: Commit**

```bash
git add "app/view/[id]/ModeSwitch.js" "app/view/[id]/ViewerClient.js"
git commit -m "Extract Normal/Wireframe switcher into a shared component"
```

## Task 6: Admin-side target compile-and-upload helper

**Files:**
- Create: `app/admin/compileTarget.js`

- [ ] **Step 1: Create the helper**

```js
"use client";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load QR image for compiling"));
    img.src = url;
  });
}

export async function compileAndUploadTarget(itemId, onProgress) {
  const { Compiler } = await import("mind-ar/dist/mindar-image.prod.js");

  const img = await loadImage(`/api/items/${itemId}/qr`);

  const compiler = new Compiler();
  await compiler.compileImageTargets([img], (percent) => {
    onProgress?.(percent);
  });
  const buffer = await compiler.exportData();

  const res = await fetch(`/api/items/${itemId}/target`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob([buffer]),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to upload AR target");
  }

  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/compileTarget.js
git commit -m "Add client-side AR target compile-and-upload helper"
```

## Task 7: Wire target compilation into the admin page

**Files:**
- Modify: `app/admin/page.js`

- [ ] **Step 1: Add the import and per-item compile status state**

In `app/admin/page.js`, add:

```js
import { compileAndUploadTarget } from "./compileTarget";
```

```js
const [targetStatus, setTargetStatus] = useState({}); // itemId -> "compiling" | "ready" | "failed"
```

- [ ] **Step 2: Add a function to run compilation for one item**

```js
async function runCompile(itemId) {
  setTargetStatus((s) => ({ ...s, [itemId]: "compiling" }));
  try {
    await compileAndUploadTarget(itemId);
    setTargetStatus((s) => ({ ...s, [itemId]: "ready" }));
    await loadItems();
  } catch (err) {
    console.error("AR target compile failed:", err);
    setTargetStatus((s) => ({ ...s, [itemId]: "failed" }));
  }
}
```

- [ ] **Step 3: Trigger it automatically right after a successful item creation**

In `handleSubmit`, after the existing `await loadItems();` line (inside the `try` block, right before `catch`), add:

```js
const created = await res.json();
runCompile(created.id);
```

Note: `res.json()` can only be read once. Since the existing code currently does `if (!res.ok) { const body = await res.json(); throw ... }` on the failure path only, the success path hasn't read the body yet — reading it here is safe. Don't call `res.json()` a second time.

- [ ] **Step 4: Show status + retry button per item in the table**

In the `<thead><tr>` block, insert a new `<th>` for "AR Target" between the existing QR header and the trailing blank `<th></th>` (the one above the Delete column):

```jsx
<th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>AR Target</th>
```

So the header row reads: Name, Shape, QR, **AR Target**, (blank).

In the `items.map((item) => ...)` row body, insert the matching `<td>` in the same position — between the existing QR `<td>` (the one with the "View QR" link) and the Delete `<td>`:

```jsx
<td style={{ padding: 8 }}>
  {targetStatus[item.id] === "compiling" ? (
    "Compiling…"
  ) : item.arTargetUrl || targetStatus[item.id] === "ready" ? (
    "Ready"
  ) : (
    <>
      Missing{" "}
      <button type="button" onClick={() => runCompile(item.id)}>
        Retry
      </button>
    </>
  )}
</td>
```

- [ ] **Step 5: Add the print-size note**

Add this line somewhere visible in the form area (e.g. right after the form's closing `</form>` tag, or inside the form near the shape dropdown):

```jsx
<p style={{ fontSize: 14 }}>
  Print each item&apos;s QR code at 8cm wide for accurate AR tracking.
</p>
```

- [ ] **Step 6: Verify manually**

Start the dev server, open `/admin`, create a new item. Confirm:
- The AR Target column shows "Compiling…" then "Ready" without a page reload.
- Check `GET /api/items` afterward — the new item has a non-null `arTargetUrl`.
- For an item that predates this change (no `arTargetUrl`), confirm it shows "Missing" with a working "Retry" button that flips to "Ready" after clicking.

- [ ] **Step 7: Commit**

```bash
git add app/admin/page.js
git commit -m "Compile and upload AR targets from the admin page"
```

## Task 8: Camera AR viewer component

**Files:**
- Create: `app/view/[id]/CameraARViewer.js`

- [ ] **Step 1: Create the component**

```js
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildPrimitiveParams, isValidShape } from "@/lib/wireframePrimitive";
import { createGeometryFromParams } from "./geometryFromParams";
import { PHYSICAL_QR_SIZE_METERS } from "@/lib/arConfig";
import ModeSwitch from "./ModeSwitch";

export default function CameraARViewer({ glbUrl, shape, arTargetUrl, onExit }) {
  const containerRef = useRef(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [status, setStatus] = useState("starting"); // starting | scanning | tracking | error
  const showWireframeRef = useRef(showWireframe);
  const shadedRef = useRef(null);
  const wireframeRef = useRef(null);

  useEffect(() => {
    showWireframeRef.current = showWireframe;
    if (shadedRef.current) shadedRef.current.visible = !showWireframe;
    if (wireframeRef.current) wireframeRef.current.visible = showWireframe;
  }, [showWireframe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mindarThree = null;

    (async () => {
      const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");
      if (disposed) return;

      mindarThree = new MindARThree({ container, imageTargetSrc: arTargetUrl });
      const { renderer, scene, camera } = mindarThree;
      const anchor = mindarThree.addAnchor(0);

      const contentGroup = new THREE.Group();
      contentGroup.scale.setScalar(PHYSICAL_QR_SIZE_METERS);
      anchor.group.add(contentGroup);

      anchor.onTargetFound = () => {
        if (!disposed) setStatus("tracking");
      };
      anchor.onTargetLost = () => {
        if (!disposed) setStatus("scanning");
      };

      const loader = new GLTFLoader();
      loader.load(glbUrl, (gltf) => {
        if (disposed) return;

        const shaded = gltf.scene;
        shaded.visible = !showWireframeRef.current;
        shadedRef.current = shaded;
        contentGroup.add(shaded);

        const box = new THREE.Box3().setFromObject(shaded);
        const size = box.getSize(new THREE.Vector3());
        const resolvedShape = isValidShape(shape) ? shape : "cube";
        const params = buildPrimitiveParams(resolvedShape, {
          width: size.x || 0.01,
          height: size.y || 0.01,
          depth: size.z || 0.01,
        });
        const wireframe = new THREE.Mesh(
          createGeometryFromParams(params),
          new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
        );
        wireframe.visible = showWireframeRef.current;
        wireframeRef.current = wireframe;
        contentGroup.add(wireframe);
      });

      try {
        await mindarThree.start();
      } catch {
        if (!disposed) setStatus("error");
        return;
      }
      if (disposed) return;
      setStatus("scanning");
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    })();

    return () => {
      disposed = true;
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        try {
          mindarThree.stop();
        } catch {
          // camera may never have started (e.g. permission denied); nothing to stop
        }
      }
    };
  }, [glbUrl, shape, arTargetUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <ModeSwitch
          value={showWireframe ? "wireframe" : "normal"}
          onChange={(v) => setShowWireframe(v === "wireframe")}
          options={[
            { value: "normal", label: "Normal" },
            { value: "wireframe", label: "Wireframe" },
          ]}
        />
        <button type="button" onClick={onExit}>
          Exit AR
        </button>
      </div>

      {status === "scanning" && (
        <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, textAlign: "center", color: "#fff", background: "rgba(0,0,0,0.6)", padding: 8 }}>
          Point your camera at the QR code you scanned.
        </div>
      )}
      {status === "error" && (
        <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, textAlign: "center", color: "#fff", background: "rgba(0,0,0,0.6)", padding: 8 }}>
          Couldn&apos;t access the camera. Check your browser&apos;s camera permission and try again.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build` — expect success (this component isn't wired into the page yet, so this only checks for syntax/import errors).

- [ ] **Step 3: Commit**

```bash
git add "app/view/[id]/CameraARViewer.js"
git commit -m "Add camera AR viewer component using MindAR image tracking"
```

## Task 9: Wire "Start AR" into ViewerClient

**Files:**
- Modify: `app/view/[id]/ViewerClient.js`

- [ ] **Step 1: Add state and import**

Add the import:

```js
import CameraARViewer from "./CameraARViewer";
```

Add state, alongside the existing `showWireframe` state:

```js
const [cameraARActive, setCameraARActive] = useState(false);
```

- [ ] **Step 2: Render `CameraARViewer` in place of the existing viewer area when active**

The current render has a fixed-height `<div style={{ width: "100%", height: "80vh", background: "#111" }}>` wrapping both the model-viewer div and the wireframe div. Wrap that whole block in a conditional: when `cameraARActive` is true, render `CameraARViewer` instead of that block's current contents.

```jsx
<div style={{ width: "100%", height: "80vh", background: "#111" }}>
  {cameraARActive ? (
    <CameraARViewer
      glbUrl={item.glbUrl}
      shape={item.shape}
      arTargetUrl={item.arTargetUrl}
      onExit={() => setCameraARActive(false)}
    />
  ) : (
    <>
      <div style={{ display: showWireframe ? "none" : "block", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <model-viewer
          src={item.glbUrl}
          ios-src={item.usdzUrl}
          alt={item.name}
          ar
          ar-modes="webxr scene-viewer quick-look"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          style={{ width: "100%", height: "100%" }}
        ></model-viewer>
      </div>
      {showWireframe && (
        <div style={{ width: "100%", height: "100%" }}>
          <WireframeViewer glbUrl={item.glbUrl} shape={item.shape} />
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 3: Add the "Start AR" button below the existing controls**

In the controls area below the viewer (where `ModeSwitch` and the instruction text live), add — only shown when not already in camera AR mode:

```jsx
{!cameraARActive && (
  <button
    type="button"
    onClick={() => setCameraARActive(true)}
    disabled={!item.arTargetUrl}
    title={item.arTargetUrl ? undefined : "AR target not ready for this item yet"}
  >
    {item.arTargetUrl ? "Start AR" : "AR Not Ready"}
  </button>
)}
```

- [ ] **Step 4: Verify manually**

Start the dev server. For an item **with** `arTargetUrl` set (created after Task 7 landed), open `/view/[id]`:
- Confirm "Start AR" is enabled and clicking it swaps the viewer area to `CameraARViewer` (camera permission will be requested — in a headless/no-camera test environment this will fail gracefully into the "error" status message, which is expected and correct; on a real device with a camera it should show the live feed and the "Point your camera..." hint).
- Confirm "Exit AR" returns to the Normal/Wireframe canvas view.

For an item **without** `arTargetUrl` (an older item, or one whose compile failed), confirm the button shows "AR Not Ready" and is disabled.

- [ ] **Step 5: Commit**

```bash
git add "app/view/[id]/ViewerClient.js"
git commit -m "Add Start AR button wiring camera AR mode into the viewer"
```

## Task 10: Manual verification

No further code changes.

- [ ] **Step 1: Full admin → viewer flow**

Create a new test item via `/admin` (any small `.glb`/`.usdz`, any shape). Confirm the AR Target column reaches "Ready". Open its `/view/[id]` page and confirm "Start AR" is enabled.

- [ ] **Step 2: Desktop browser AR session (best-effort — real device testing still required separately)**

Click "Start AR". In an automated/headless browser without a real camera, expect the "Couldn't access the camera" error state to appear correctly rather than crashing — verify this happens cleanly (no uncaught errors in the console) rather than expecting real tracking to work. If a real webcam is available, confirm the live feed appears and the "Point your camera at the QR code" hint shows.

- [ ] **Step 3: Confirm no regression in existing modes**

Normal and Wireframe canvas modes, and the native `<model-viewer>` AR button, still work exactly as before this plan (unchanged code paths).

- [ ] **Step 4: Check the console**

No new errors beyond the pre-existing `THREE.WARNING: Multiple instances of Three.js being imported` warning.

- [ ] **Step 5: Note what still needs real-device testing**

This plan's automated/desktop verification cannot confirm actual marker-tracking accuracy, camera-permission UX on iOS Safari vs Android Chrome, or real-world scale correctness at the assumed 8cm print size. Flag this clearly when reporting completion — it needs to be tried on a real phone with a printed QR code before considering marker AR production-ready.
