# Authored Solid + Edges Wireframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-generated primitive-shape wireframe with an admin-authored one: every GLB now contains two top-level objects, "Solid" and "Edges", and the app shows either the real shaded model or a clean thick outline of the "Edges" object's geometry.

**Architecture:** A new pure helper (`lib/buildModelParts.js`) locates the "Solid"/"Edges" objects in a loaded glTF scene, recenters the scene, and converts "Edges" into thick outline lines (three.js's `LineSegments2`/`LineMaterial` fat-line pipeline). Both the plain preview (`ModelCanvas.js`, new — replaces `<model-viewer>` and `WireframeViewer.js`) and the marker-tracked AR viewer (`CameraARViewer.js`, modified) call this helper and toggle `.visible` on the returned nodes. The primitive-shape system (shape dropdown, bounding-box primitive generator) is removed entirely.

**Tech Stack:** Next.js, React, Three.js (`GLTFLoader`, `OrbitControls`, `EdgesGeometry`, and the `three/examples/jsm/lines/` fat-line pipeline — all already available in the installed `three` package, no new dependencies), MindAR (unchanged), Node's built-in test runner (`node --test`).

Full design spec: [docs/superpowers/specs/2026-09-02-solid-edges-wireframe-design.md](../specs/2026-09-02-solid-edges-wireframe-design.md)

**Critical constraint carried through every task touching `CameraARViewer.js`: the existing AR flow (camera permission handling, MindAR start/timeout, target-found/lost status, drag-to-rotate, cleanup/disposal on unmount) must keep working exactly as it does today. Only the model-loading/toggle logic changes.**

---

### Task 1: `lib/buildModelParts.js` — locate Solid/Edges and build outline lines

**Files:**
- Create: `lib/buildModelParts.js`
- Test: `lib/buildModelParts.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// lib/buildModelParts.test.js
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

test("finds Solid and Edges children by case-insensitive name", () => {
  const { root, solidNode, edgesNode } = makeSolidAndEdges({
    solidName: "SOLID",
    edgesName: "edges",
  });

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, solidNode);
  assert.equal(result.edges, edgesNode);
});

test("hides every mesh under Edges and attaches a LineSegments2 outline child", () => {
  const { root, edgeMesh } = makeSolidAndEdges();

  buildModelParts(root, new LineMaterial());

  assert.equal(edgeMesh.visible, false);
  assert.equal(edgeMesh.children.length, 1);
  assert.equal(edgeMesh.children[0].isLineSegments2, true);
});

test("recenters the root based on the combined bounding box of Solid and Edges", () => {
  const { root } = makeSolidAndEdges({ offset: 2 });

  buildModelParts(root, new LineMaterial());

  assert.equal(root.position.x, -2);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("returns null parts and leaves the root untouched when Solid or Edges is missing", () => {
  const root = new THREE.Group();
  const onlyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  onlyMesh.name = "Mesh";
  root.add(onlyMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.deepEqual(result, { solid: null, edges: null });
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/buildModelParts.test.js`
Expected: FAIL with something like "Cannot find module './buildModelParts.js'"

- [ ] **Step 3: Write the implementation**

```js
// lib/buildModelParts.js
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
// hidden). Returns { solid: null, edges: null } without touching the scene
// if either object is missing, so callers can fall back to solid-only
// display and disable their wireframe toggle.
export function buildModelParts(root, lineMaterial) {
  const solid = findNamedChild(root, "solid");
  const edges = findNamedChild(root, "edges");

  if (!solid || !edges) {
    return { solid: null, edges: null };
  }

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  edges.traverse((child) => {
    if (!child.isMesh) return;
    child.visible = false;
    const edgesGeometry = new THREE.EdgesGeometry(child.geometry, EDGE_THRESHOLD_DEGREES);
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(edgesGeometry.attributes.position.array);
    edgesGeometry.dispose();
    child.add(new LineSegments2(lineGeometry, lineMaterial));
  });

  return { solid, edges };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/buildModelParts.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/buildModelParts.js lib/buildModelParts.test.js
git commit -m "$(cat <<'EOF'
Add buildModelParts helper for authored Solid+Edges GLBs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `lib/disposeObject3D.js` — shared disposal helper

CameraARViewer.js already has this exact geometry/material disposal logic
inline. ModelCanvas.js (Task 4) needs the identical logic. Extracting it now
avoids duplicating it.

**Files:**
- Create: `lib/disposeObject3D.js`
- Test: `lib/disposeObject3D.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// lib/disposeObject3D.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { disposeObject3D } from "./disposeObject3D.js";

test("disposes geometry and material of every mesh in the hierarchy", () => {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  let geometryDisposed = false;
  let materialDisposed = false;
  geometry.dispose = () => {
    geometryDisposed = true;
  };
  material.dispose = () => {
    materialDisposed = true;
  };

  disposeObject3D(group);

  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
});

test("ignores non-mesh children without throwing", () => {
  const group = new THREE.Group();
  group.add(new THREE.Group());
  assert.doesNotThrow(() => disposeObject3D(group));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test lib/disposeObject3D.test.js`
Expected: FAIL with "Cannot find module './disposeObject3D.js'"

- [ ] **Step 3: Write the implementation**

```js
// lib/disposeObject3D.js

// Disposes geometry and material(s) of every mesh (including LineSegments2
// outline lines, which are Mesh subclasses) under `object`. Object3D.visible
// = false already stops rendering, but GPU buffers/textures still need an
// explicit dispose() to be freed.
export function disposeObject3D(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value && typeof value.dispose === "function") {
          value.dispose();
        }
      });
      material.dispose();
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test lib/disposeObject3D.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/disposeObject3D.js lib/disposeObject3D.test.js
git commit -m "$(cat <<'EOF'
Extract shared disposeObject3D helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ModeSwitch.js` — support a disabled option with a tooltip reason

Both the plain preview and the AR viewer need to disable the "Wireframe"
button (with an explanatory tooltip) when a model has no Edges object.

**Files:**
- Modify: `app/view/[id]/ModeSwitch.js` (replace entire file contents)

- [ ] **Step 1: Replace the file**

```js
// app/view/[id]/ModeSwitch.js
"use client";

export default function ModeSwitch({ value, onChange, options }) {
  return (
    <div className="frame" style={{ display: "inline-flex" }}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          disabled={opt.disabled}
          title={opt.disabled ? opt.disabledReason : undefined}
          aria-pressed={value === opt.value}
          style={{
            border: "none",
            borderRight: i < options.length - 1 ? "4px solid #000" : "none",
            background: value === opt.value ? "#000" : "#fff",
            color: value === opt.value ? "#fff" : "#000",
            opacity: opt.disabled ? 0.4 : 1,
            cursor: opt.disabled ? "not-allowed" : "pointer",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/view/\[id\]/ModeSwitch.js
git commit -m "$(cat <<'EOF'
Let ModeSwitch options be individually disabled with a reason

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `ModelCanvas.js` — new preview canvas (replaces `<model-viewer>` + `WireframeViewer.js`)

**Files:**
- Create: `app/view/[id]/ModelCanvas.js`

- [ ] **Step 1: Create the component**

```js
// app/view/[id]/ModelCanvas.js
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "@/lib/buildModelParts";
import { disposeObject3D } from "@/lib/disposeObject3D";

// Plain (non-AR) preview: shaded model + orbit controls, with a live
// solid/edges toggle driven by the `mode` prop. Loads the GLB once;
// switching `mode` only flips node visibility, no reload.
export default function ModelCanvas({ glbUrl, mode, onModelInfo }) {
  const containerRef = useRef(null);
  const modeRef = useRef(mode);
  const solidRef = useRef(null);
  const edgesRef = useRef(null);

  useEffect(() => {
    modeRef.current = mode;
    if (solidRef.current) solidRef.current.visible = mode !== "edges";
    if (edgesRef.current) edgesRef.current.visible = mode === "edges";
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let frameId;
    let root = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(0.5, 1, 0.5);
    scene.add(directionalLight);

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

    const lineMaterial = new LineMaterial({ color: 0x00ff88, linewidth: 2 });
    lineMaterial.resolution.set(container.clientWidth, container.clientHeight);

    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
      if (disposed) return;

      root = gltf.scene;
      const { solid, edges } = buildModelParts(root, lineMaterial);
      solidRef.current = solid;
      edgesRef.current = edges;
      onModelInfo?.({ hasEdges: Boolean(edges) });

      if (solid) solid.visible = modeRef.current !== "edges";
      if (edges) edges.visible = modeRef.current === "edges";

      scene.add(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const radius = size.length() || 1;
      controls.target.set(0, 0, 0);
      camera.position.set(0, radius * 0.2, radius * 1.2);
    });

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
      lineMaterial.resolution.set(clientWidth, clientHeight);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      lineMaterial.dispose();
      if (root) disposeObject3D(root);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [glbUrl]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/view/\[id\]/ModelCanvas.js
git commit -m "$(cat <<'EOF'
Add ModelCanvas: Three.js preview with Solid/Edges toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `ViewerClient.js` — use `ModelCanvas` instead of `<model-viewer>`

**Files:**
- Modify: `app/view/[id]/ViewerClient.js` (replace entire file contents)

- [ ] **Step 1: Replace the file**

```js
// app/view/[id]/ViewerClient.js
"use client";

import { useState } from "react";
import ModelCanvas from "./ModelCanvas";
import ModeSwitch from "./ModeSwitch";
import CameraARViewer from "./CameraARViewer";

export default function ViewerClient({ item }) {
  const [showWireframe, setShowWireframe] = useState(false);
  const [cameraARActive, setCameraARActive] = useState(false);
  const [hasEdges, setHasEdges] = useState(true);

  return (
    <div className="page" style={{ padding: 0, gap: 0 }}>
      <div style={{ width: "100%", height: "80vh", background: "#111" }}>
        {cameraARActive ? (
          <CameraARViewer
            glbUrl={item.glbUrl}
            arTargetUrl={item.arTargetUrl}
            onExit={() => setCameraARActive(false)}
          />
        ) : (
          <ModelCanvas
            glbUrl={item.glbUrl}
            mode={showWireframe ? "edges" : "solid"}
            onModelInfo={({ hasEdges }) => setHasEdges(hasEdges)}
          />
        )}
      </div>
      <div style={{ padding: 16, borderTop: "4px solid #000", width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        {!cameraARActive && (
          <>
            <h2 style={{ margin: 0 }}>{item.name}</h2>
            <ModeSwitch
              value={showWireframe ? "wireframe" : "normal"}
              onChange={(v) => setShowWireframe(v === "wireframe")}
              options={[
                { value: "normal", label: "Normal" },
                {
                  value: "wireframe",
                  label: "Wireframe",
                  disabled: !hasEdges,
                  disabledReason: "This item's model doesn't have separate Solid/Edges objects",
                },
              ]}
            />
            <p style={{ margin: 0 }}>
              {showWireframe
                ? "Drag to rotate the shape."
                : "Drag to rotate. Tap Start AR to view it in your space."}
            </p>
            <button
              type="button"
              onClick={() => setCameraARActive(true)}
              disabled={!item.arTargetUrl}
              title={item.arTargetUrl ? undefined : "AR target not ready for this item yet"}
            >
              {item.arTargetUrl ? "Start AR" : "AR Not Ready"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/view/\[id\]/ViewerClient.js
git commit -m "$(cat <<'EOF'
Replace model-viewer preview with ModelCanvas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `CameraARViewer.js` — use `buildModelParts`, keep AR flow unchanged

Every part of the existing AR lifecycle (MindAR setup, camera lights,
drag-to-rotate, `onTargetFound`/`onTargetLost`, the `start()` timeout
handling, cleanup ordering) is preserved verbatim. Only the model-loading
block, refs, and disposal call change.

**Files:**
- Modify: `app/view/[id]/CameraARViewer.js` (replace entire file contents)

- [ ] **Step 1: Replace the file**

```js
// app/view/[id]/CameraARViewer.js
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "@/lib/buildModelParts";
import { disposeObject3D } from "@/lib/disposeObject3D";
import { PHYSICAL_QR_SIZE_METERS } from "@/lib/arConfig";
import { withTimeout } from "@/lib/withTimeout";
import ModeSwitch from "./ModeSwitch";

export default function CameraARViewer({ glbUrl, arTargetUrl, onExit }) {
  const containerRef = useRef(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [hasEdges, setHasEdges] = useState(true);
  const [status, setStatus] = useState("starting"); // starting | scanning | tracking | error | target-error
  const showWireframeRef = useRef(showWireframe);
  const solidRef = useRef(null);
  const edgesRef = useRef(null);

  useEffect(() => {
    showWireframeRef.current = showWireframe;
    if (solidRef.current) solidRef.current.visible = !showWireframe;
    if (edgesRef.current) edgesRef.current.visible = showWireframe;
  }, [showWireframe]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let mindarThree = null;
    let removeDragHandlers = null;
    let removeResizeHandler = null;
    let lineMaterial = null;
    let root = null;

    (async () => {
      const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");
      if (disposed) return;

      mindarThree = new MindARThree({
        container,
        imageTargetSrc: arTargetUrl,
        // We already render our own status-driven overlays (scanning prompt,
        // camera-error message) in the JSX below. MindAR's built-in UI system
        // (uiLoading/uiScanning/uiError default to "yes") injects its own
        // separate DOM elements directly into document.body, outside React's
        // control, so React never cleans them up on unmount/exit. Disabling
        // all three prevents that DOM injection entirely.
        // Note: this only suppresses the modal/overlay elements - MindAR's
        // internal UI class still unconditionally injects a <style> tag into
        // document.head on every construction, regardless of these options.
        // That's never removed either, so it's a second, separate (much
        // smaller) leak in the same library.
        uiLoading: "no",
        uiScanning: "no",
        uiError: "no",
      });
      const { renderer, scene, camera } = mindarThree;

      // Unlike <model-viewer> (which lights the scene internally), MindAR's
      // scene starts with zero lights. The loaded glTF's real materials
      // (typically MeshStandardMaterial) render solid black without any -
      // the wireframe mode doesn't need this since the edge lines are unlit.
      scene.add(new THREE.AmbientLight(0xffffff, 1));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
      directionalLight.position.set(0.5, 1, 0.5);
      scene.add(directionalLight);

      const anchor = mindarThree.addAnchor(0);

      const contentGroup = new THREE.Group();
      // MindAR has no real-world scale awareness: content placed under
      // anchor.group uses "1 content unit = 1 full marker width" (its
      // postMatrix scales anchor-local coordinates by the compiled target
      // image's pixel width, treating that as the world unit). glTF/GLB
      // files always use meters, so converting a model authored in true
      // meters into that "1 unit = 1 marker-width" space means dividing by
      // the marker's real printed width, not multiplying by it.
      contentGroup.scale.setScalar(1 / PHYSICAL_QR_SIZE_METERS);
      anchor.group.add(contentGroup);

      // Shared by every outline line the loaded model's "Edges" object
      // produces (see buildModelParts). LineMaterial renders thick lines in
      // screen-space pixels, so its `resolution` uniform has to track the
      // canvas size - both now and on every resize below.
      lineMaterial = new LineMaterial({ color: 0x00ff88, linewidth: 2 });
      lineMaterial.resolution.set(container.clientWidth, container.clientHeight);

      // Let the user spin the placed object with a drag, since - unlike the
      // plain model-viewer mode - the camera here is the real phone camera
      // driven by MindAR's tracking, so there's no camera to orbit around it
      // instead. The GLB itself follows glTF's Y-up convention, so dragging
      // horizontally spins it like a turntable around its own up axis
      // (rotate around Y) and dragging vertically tilts it forward/back
      // (rotate around X) - confirmed against the actual on-device behavior,
      // not just the marker's own axis convention.
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      const onPointerDown = (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onPointerMove = (e) => {
        if (!dragging) return;
        contentGroup.rotation.y += (e.clientX - lastX) * 0.01;
        contentGroup.rotation.x += (e.clientY - lastY) * 0.01;
        lastX = e.clientX;
        lastY = e.clientY;
      };
      const onPointerUp = () => {
        dragging = false;
      };
      container.style.touchAction = "none";
      container.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      removeDragHandlers = () => {
        container.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      const onResize = () => {
        lineMaterial.resolution.set(container.clientWidth, container.clientHeight);
      };
      window.addEventListener("resize", onResize);
      removeResizeHandler = () => window.removeEventListener("resize", onResize);

      anchor.onTargetFound = () => {
        if (!disposed) setStatus("tracking");
      };
      anchor.onTargetLost = () => {
        if (!disposed) setStatus("scanning");
      };

      const loader = new GLTFLoader();
      loader.load(glbUrl, (gltf) => {
        if (disposed) return;

        root = gltf.scene;
        const { solid, edges } = buildModelParts(root, lineMaterial);
        solidRef.current = solid;
        edgesRef.current = edges;
        setHasEdges(Boolean(edges));

        if (solid) solid.visible = !showWireframeRef.current;
        if (edges) edges.visible = showWireframeRef.current;

        contentGroup.add(root);
      });

      try {
        // MindAR's start() chain (_startAR -> controller.addImageTargets) wraps
        // its work in `new Promise(async (resolve, reject) => {...})`. If
        // anything in there throws - e.g. decoding a corrupt/invalid
        // arTargetUrl - that async executor's throw never calls reject(), so
        // the returned promise hangs forever instead of rejecting: the camera
        // preview (already attached earlier in _startVideo) keeps showing,
        // but scanning/rendering never starts and no error ever surfaces.
        // This timeout is the only way to detect that and show the error
        // state instead of hanging silently - same pattern already used for
        // compileImageTargets in compileTarget.js.
        await withTimeout(
          mindarThree.start(),
          20000,
          "AR_START_TIMEOUT"
        );
      } catch (err) {
        // _startVideo() rejects fast and explicitly on a real camera-access
        // failure (its Promise executor isn't async, so throws/rejects
        // propagate normally). Only our own timeout error means _startVideo
        // succeeded (camera is live) and the hang happened afterwards, in
        // target loading/tracking - a different problem with a different fix
        // (recompile the AR target), so it gets its own status/message.
        if (!disposed) setStatus(err?.message === "AR_START_TIMEOUT" ? "target-error" : "error");
        return;
      }
      if (disposed) {
        // Unmounted while the camera-permission prompt was still showing.
        // start() has now actually resolved (the camera is live and
        // tracking began inside it), so this is the first point at which
        // stop() can succeed - the immediate stop() attempt in the
        // cleanup function below throws harmlessly before this, since
        // MindAR's internal controller/video aren't set up until start()
        // resolves.
        try {
          mindarThree.stop();
        } catch {
          // ignore - best effort
        }
        return;
      }
      setStatus("scanning");
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    })();

    return () => {
      disposed = true;
      removeDragHandlers?.();
      removeResizeHandler?.();
      if (root) disposeObject3D(root);
      lineMaterial?.dispose();
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        mindarThree.renderer?.dispose();
        try {
          mindarThree.stop();
        } catch {
          // start() may not have resolved yet (e.g. camera permission
          // prompt still showing) - in that case MindAR's internal
          // controller/video aren't set and stop() throws. If start()
          // does resolve after this, the `if (disposed)` branch above
          // calls stop() again for real.
        }
      }
      // Note: MindARThree's constructor registers a window 'resize'
      // listener with no public way to remove it - this is a real,
      // unfixable leak inside the mind-ar library itself (confirmed by
      // reading its source), not something addressable from here. Worse,
      // that listener's resize() handler calls this.controller.getProjection
      // Matrix() with no null-guard, and this.controller is only assigned
      // once the camera successfully starts (inside _startAR()) - so a
      // resize event firing while the camera hasn't started yet (permission
      // denied, dialog still up, or any other pre-start failure) throws an
      // uncaught TypeError. No clean workaround from here either.
    };
  }, [glbUrl, arTargetUrl]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
      {/*
        MindAR sets its <video> element's z-index to -2, intending it to sit
        behind our (transparent-background) WebGL canvas. Without this div
        establishing its OWN stacking context, that negative z-index isn't
        locally scoped - it's evaluated against the page's root stacking
        context, putting the video behind this AR viewer's own opaque black
        background instead of just behind the canvas. `position: relative`
        alone does NOT create a stacking context; it needs a non-auto
        z-index too.
      */}
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", zIndex: 0, overflow: "hidden" }} />

      <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <ModeSwitch
          value={showWireframe ? "wireframe" : "normal"}
          onChange={(v) => setShowWireframe(v === "wireframe")}
          options={[
            { value: "normal", label: "Normal" },
            {
              value: "wireframe",
              label: "Wireframe",
              disabled: !hasEdges,
              disabledReason: "This item's model doesn't have separate Solid/Edges objects",
            },
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
      {status === "target-error" && (
        <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, textAlign: "center", color: "#fff", background: "rgba(0,0,0,0.6)", padding: 8 }}>
          Couldn&apos;t start AR tracking. This item&apos;s AR target may be missing or corrupt - try recompiling it from the admin page.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Start the dev server and manually smoke-test the AR viewer**

Run: `npm run dev`, open `http://localhost:3000/view/demo` on a phone (or a
desktop browser that grants camera access), tap "Start AR" (disabled until
Task 9's reseed — if so, come back to this check after Task 9).
Expected: camera preview appears, no console errors about `LineMaterial`,
`buildModelParts`, or `disposeObject3D`.

- [ ] **Step 3: Commit**

```bash
git add app/view/\[id\]/CameraARViewer.js
git commit -m "$(cat <<'EOF'
Use buildModelParts for Solid/Edges toggle in AR mode

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Admin — client-side Solid/Edges validation, drop shape, usdz optional

**Files:**
- Create: `app/admin/validateModel.js`
- Modify: `app/admin/page.js` (replace entire file contents)

- [ ] **Step 1: Create the client-side validation helper**

```js
// app/admin/validateModel.js
"use client";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Parses a File the admin picked (before upload) and reports whether it
// has the two top-level objects the viewer requires. Mirrors the
// object-URL + GLTFLoader technique already used by compileTarget.js's
// image loading, just for a .glb File instead of a fetched image.
export async function validateModelHasSolidAndEdges(file) {
  const url = URL.createObjectURL(file);
  try {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().load(url, resolve, undefined, reject);
    });
    const names = gltf.scene.children.map((child) => child.name.toLowerCase());
    return {
      hasSolid: names.includes("solid"),
      hasEdges: names.includes("edges"),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 2: Replace `app/admin/page.js`**

```js
// app/admin/page.js
"use client";

import { useEffect, useState } from "react";
import { compileAndUploadTarget } from "./compileTarget";
import { validateModelHasSolidAndEdges } from "./validateModel";

export default function AdminPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [glbFile, setGlbFile] = useState(null);
  const [usdzFile, setUsdzFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [targetStatus, setTargetStatus] = useState({}); // itemId -> "compiling" | "ready" | "failed"

  async function loadItems() {
    const res = await fetch("/api/items");
    const data = await res.json();
    setItems(data);
  }

  useEffect(() => {
    loadItems();
  }, []);

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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name || !glbFile) {
      setError("Name and a .glb file are both required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { hasSolid, hasEdges } = await validateModelHasSolidAndEdges(glbFile);
      if (!hasSolid || !hasEdges) {
        setError('The .glb file must contain two top-level objects named "Solid" and "Edges".');
        return;
      }

      const formData = new FormData();
      formData.append("name", name);
      formData.append("glb", glbFile);
      if (usdzFile) formData.append("usdz", usdzFile);
      const res = await fetch("/api/items", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create item");
      }
      const created = await res.json();
      runCompile(created.id);
      setName("");
      setGlbFile(null);
      setUsdzFile(null);
      await loadItems();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        let message = "Failed to delete item";
        try {
          const body = await res.json();
          if (body.error) message = body.error;
        } catch {
          // response body wasn't JSON; keep the fallback message
        }
        throw new Error(message);
      }
      setError(null);
      await loadItems();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page" style={{ justifyContent: "flex-start" }}>
      <h1>Admin</h1>

      <form
        onSubmit={handleSubmit}
        className="frame"
        style={{ padding: 24, width: "100%", maxWidth: 480, textAlign: "left" }}
      >
        <label style={{ display: "block", marginBottom: 12 }}>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8, border: "2px solid #000" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          .glb file (must contain "Solid" and "Edges" objects)
          <input
            type="file"
            accept=".glb"
            onChange={(e) => setGlbFile(e.target.files[0])}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          .usdz file (optional)
          <input
            type="file"
            accept=".usdz"
            onChange={(e) => setUsdzFile(e.target.files[0])}
            style={{ display: "block", marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Uploading..." : "Add Item"}
        </button>
      </form>
      <p style={{ fontSize: 14 }}>
        Print each item&apos;s QR code at 8cm wide for accurate AR tracking.
      </p>

      <table style={{ width: "100%", maxWidth: 480, marginTop: 32, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>Name</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>QR</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}>AR Target</th>
            <th style={{ borderBottom: "2px solid #000", textAlign: "left", padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: 8 }}>{item.name}</td>
              <td style={{ padding: 8 }}>
                <a href={`/api/items/${item.id}/qr`} target="_blank" rel="noreferrer">
                  View QR
                </a>
              </td>
              <td style={{ padding: 8 }}>
                {targetStatus[item.id] === "compiling" ? (
                  "Compiling…"
                ) : item.arTargetUrl || targetStatus[item.id] === "ready" ? (
                  <>
                    Ready{" "}
                    <button type="button" onClick={() => runCompile(item.id)}>
                      Recompile
                    </button>
                  </>
                ) : (
                  <>
                    Missing{" "}
                    <button type="button" onClick={() => runCompile(item.id)}>
                      Retry
                    </button>
                  </>
                )}
              </td>
              <td style={{ padding: 8 }}>
                <button type="button" onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/validateModel.js app/admin/page.js
git commit -m "$(cat <<'EOF'
Validate Solid/Edges on upload, drop shape dropdown, make usdz optional

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `app/api/items/route.js` — drop `shape`, make `usdz` optional

**Files:**
- Modify: `app/api/items/route.js` (replace entire file contents)

- [ ] **Step 1: Replace the file**

```js
// app/api/items/route.js
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listItems, createItem } from "@/lib/store";
import { uploadFile } from "@/lib/blob";

export async function GET() {
  const items = await listItems();
  return NextResponse.json(items);
}

export async function POST(request) {
  let formData;
  let name;
  let glbFile;
  let usdzFile;
  let glbBuffer;
  let usdzBuffer;

  try {
    formData = await request.formData();
    name = formData.get("name");
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

  if (!name || !glbFile || glbFile.size === 0) {
    return NextResponse.json(
      { error: "name and glb are required" },
      { status: 400 }
    );
  }

  const id = nanoid(10);

  const glbUrl = await uploadFile(`${id}.glb`, glbBuffer, "model/gltf-binary");
  const usdzUrl =
    usdzFile && usdzFile.size > 0
      ? await uploadFile(`${id}.usdz`, usdzBuffer, "model/vnd.usdz+zip")
      : null;

  const item = {
    id,
    name: String(name),
    glbUrl,
    usdzUrl,
    createdAt: new Date().toISOString(),
  };

  await createItem(item);
  return NextResponse.json(item, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/items/route.js
git commit -m "$(cat <<'EOF'
Drop shape field and make usdz optional in the create-item API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Demo asset — regenerate with named Solid/Edges nodes

The demo item's GLB currently has one unnamed node, which will now fall
back to solid-only display with the wireframe toggle disabled. This task
gives it a proper two-node structure so the demo showcases the new feature.

**Files:**
- Modify: `scripts/generate_cube_glb.py:50-54`

- [ ] **Step 1: Name the existing node "Solid" and add a second "Edges" node**

In `scripts/generate_cube_glb.py`, the `gltf` dict currently has:

```python
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
```

Change it to:

```python
        "scene": 0,
        "scenes": [{"nodes": [0, 1]}],
        "nodes": [{"name": "Solid", "mesh": 0}, {"name": "Edges", "mesh": 0}],
```

Both nodes reference the same mesh (index 0) — `buildModelParts` hides the
"Edges" node's mesh faces and draws only its extracted edges, so it's fine
for "Solid" and "Edges" to start out geometrically identical here; a real
admin-authored model would give "Edges" its own simplified proxy mesh.

- [ ] **Step 2: Regenerate `assets/model.glb`**

Run: `python scripts/generate_cube_glb.py`
Expected output: `Wrote assets/model.glb (<N> bytes)`

- [ ] **Step 3: Verify the regenerated file has both named nodes**

Run:
```bash
python -c "import json,struct; d=open('assets/model.glb','rb').read(); n=struct.unpack('<I',d[12:16])[0]; print(json.loads(d[20:20+n])['nodes'])"
```
Expected: `[{'name': 'Solid', 'mesh': 0}, {'name': 'Edges', 'mesh': 0}]`

- [ ] **Step 4: Commit the script change and the regenerated asset**

```bash
git add scripts/generate_cube_glb.py assets/model.glb
git commit -m "$(cat <<'EOF'
Regenerate demo cube GLB with named Solid/Edges nodes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Re-seed the "demo" item so the live app picks up the new GLB**

`scripts/seed.js` skips creating "demo" if it already exists, and this repo's
`.env.local` points at a real MongoDB + Vercel Blob (not the local
JSON/file fallback) — so this step changes live stored data, not just local
files. **Do this yourself rather than having it scripted:** open the admin
page (`npm run dev`, then `http://localhost:3000/admin`), delete the
existing "Demo Placeholder" item with its Delete button, then run:

```bash
npm run seed
```

Expected output: `Seeded item 'demo': { id: 'demo', ... }`

- [ ] **Step 6: Recompile the demo item's AR target**

`seed.js` creates the item directly in the database — unlike the admin
upload form, it never runs the AR-target compile step, so the freshly
reseeded "demo" item's `arTargetUrl` is unset and "Start AR" will show as
disabled ("AR Not Ready"). On the admin page's item table, find the "demo"
row's AR Target column (it will say "Missing") and click **Retry**. Wait
for it to say "Ready" before moving on to Task 11.

---

### Task 10: Remove the old primitive-shape system

**Files:**
- Delete: `lib/wireframePrimitive.js`
- Delete: `lib/wireframePrimitive.test.js`
- Delete: `app/view/[id]/geometryFromParams.js`
- Delete: `app/view/[id]/WireframeViewer.js`

- [ ] **Step 1: Confirm nothing still imports them**

Run: `grep -rn "wireframePrimitive\|geometryFromParams\|WireframeViewer" --include=*.js app lib`
Expected: no output (Tasks 5–8 already removed every import)

- [ ] **Step 2: Delete the files**

```bash
git rm lib/wireframePrimitive.js lib/wireframePrimitive.test.js app/view/\[id\]/geometryFromParams.js app/view/\[id\]/WireframeViewer.js
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — only `lib/buildModelParts.test.js` and
`lib/disposeObject3D.test.js` remain and both pass; no leftover references
to the deleted modules.

- [ ] **Step 4: Run the Next.js production build to catch any remaining broken import**

Run: `npm run build`
Expected: build succeeds with no module-not-found errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Remove the primitive-shape wireframe system

Superseded by admin-authored Solid/Edges objects (buildModelParts).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Manual end-to-end verification

This is the checklist from the design spec's "Testing Considerations"
section. Automated tests cover `buildModelParts` and `disposeObject3D` in
isolation; everything below needs a real browser (and, for AR, a real
device) since it's the actual point of the feature.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Plain preview — solid/edges toggle**

Open `http://localhost:3000/view/demo`. Confirm:
- "Normal" mode shows the shaded orange cube.
- "Wireframe" mode shows a green thick-outline cube (not the whole
  triangulated mesh — a cube's `EdgesGeometry` should show exactly its 12
  edges).
- The "Wireframe" button is enabled (not grayed out) for this item now
  that the demo GLB has both nodes.
- Dragging orbits the camera in both modes.

- [ ] **Step 3: Admin — upload validation**

Open `http://localhost:3000/admin`. Confirm:
- Submitting with a `.glb` that lacks "Solid"/"Edges" objects (e.g. the
  old single-node cube, if you kept a copy before Task 9) is blocked with
  the inline error and no network request is made.
- Submitting a valid two-node `.glb` with no `.usdz` file succeeds.
- The "Shape" column/dropdown no longer appears anywhere in the admin UI.

- [ ] **Step 4: AR mode — real device required (Android Chrome and iOS Safari)**

On an actual phone, scan the "demo" item's QR code (or navigate directly
to `/view/demo` and tap "Start AR"). Confirm, matching today's behavior
exactly:
- Camera permission prompt appears; denying it shows the existing
  "Couldn't access the camera" message and preview mode remains usable.
- Granting permission shows "Point your camera at the QR code you
  scanned" until the marker is detected.
- Once detected, the model appears anchored to the marker, correctly
  centered and sized.
- The Normal/Wireframe toggle switches live between the shaded model and
  the thick green outline while tracking continues, with no visible
  flicker or loss of tracking.
- Dragging rotates the anchored object (horizontal = spin, vertical =
  tilt), same as before this change.
- Moving the marker out of frame and back shows the target-lost →
  scanning → tracking transitions correctly.
- "Exit AR" fully stops the camera (check the browser's camera indicator
  turns off) and returns to the plain preview.
- Rotate the device (or resize the browser window) while in AR mode and
  confirm the green outline stays a consistent, thick width — this is
  specifically checking that `LineMaterial.resolution` is being kept in
  sync with the canvas size.

- [ ] **Step 5: Report results**

If every check in Steps 2–4 passes, the feature is complete. If AR device
testing surfaces a regression, stop and fix it before considering this
plan done — the design spec treats AR functionality as non-negotiable.
