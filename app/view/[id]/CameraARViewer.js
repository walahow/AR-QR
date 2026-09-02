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
        // A user can tap "Wireframe" during the (slow, async) AR init window
        // before this load callback runs. If this model turns out to have no
        // separate Edges object, force showWireframe back off here too - not
        // just disable the button - so we never end up with the solid hidden
        // (because showWireframeRef.current is stale-true) and nothing to
        // show in its place. Same fix already applied in ViewerClient.js.
        if (!edges) setShowWireframe(false);

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
