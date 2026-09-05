"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "@/lib/buildModelParts";
import { findClipsForObject } from "@/lib/findClipsForObject";
import { disposeObject3D } from "@/lib/disposeObject3D";
import { PHYSICAL_QR_SIZE_METERS, AR_MODEL_SIZE_MARKER_WIDTHS } from "@/lib/arConfig";
import { withTimeout } from "@/lib/withTimeout";
import ModeSwitch from "./ModeSwitch";

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function CameraARViewer({ glbUrl, arTargetUrl, onExit }) {
  const containerRef = useRef(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [hasEdges, setHasEdges] = useState(true);
  const [hasDetailAnimation, setHasDetailAnimation] = useState(false);
  const [status, setStatus] = useState("starting"); // starting | scanning | tracking | error | target-error
  const showWireframeRef = useRef(showWireframe);
  const solidRef = useRef(null);
  const edgesRef = useRef(null);
  const detailRef = useRef(null);
  const mixerRef = useRef(null);
  const detailClipsRef = useRef([]);
  const detailActionsRef = useRef([]);
  // Whichever object is shown first on entering wireframe mode - the
  // detail group, if the model has one (frozen on its first frame if it
  // has an authored animation), otherwise "Edges". Drives the opening
  // scale-in animation below.
  const wireframeVisualRef = useRef(null);
  const edgesAnimationRef = useRef({ isAnimating: false, startTime: 0, targetScale: 0 });

  function enterWireframeMode() {
    const edges = edgesRef.current;
    const detail = detailRef.current;
    const clips = detailClipsRef.current;

    if (detail) {
      // Any detail content - animated or static - replaces Edges entirely;
      // Edges itself never shows for a model that has one. An authored
      // animation is shown paused on its first frame until "Reveal Detail"
      // plays it forward; with no animation at all, the static content is
      // simply visible immediately (nothing left to reveal on demand).
      if (edges) edges.visible = false;
      detail.visible = true;
      if (clips.length > 0 && mixerRef.current) {
        const actions = clips.map((clip) => {
          const action = mixerRef.current.clipAction(clip);
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
          action.paused = true;
          return action;
        });
        mixerRef.current.update(0);
        detailActionsRef.current = actions;
      } else {
        detailActionsRef.current = [];
      }
      wireframeVisualRef.current = detail;
    } else {
      if (edges) edges.visible = true;
      detailActionsRef.current = [];
      wireframeVisualRef.current = edges;
    }

    const target = wireframeVisualRef.current;
    if (target) {
      target.scale.set(0.1, 0.1, 0.1);
      edgesAnimationRef.current = { isAnimating: true, startTime: Date.now(), targetScale: 1 };
    }
  }

  function exitWireframeMode() {
    if (edgesRef.current) edgesRef.current.visible = false;
    if (detailRef.current) detailRef.current.visible = false;
    mixerRef.current?.stopAllAction();
    detailActionsRef.current = [];
    wireframeVisualRef.current = null;
  }

  useEffect(() => {
    showWireframeRef.current = showWireframe;
    if (solidRef.current) solidRef.current.visible = !showWireframe;
    if (showWireframe) {
      enterWireframeMode();
    } else {
      exitWireframeMode();
    }
  }, [showWireframe]);

  function revealDetail() {
    // The detail group is already visible by the time this can be called
    // (see enterWireframeMode) - unpausing its actions is the only thing
    // that lets an authored animation actually play forward. A
    // static-only detail group has nothing to reveal; this button isn't
    // even shown in that case (see hasDetailAnimation below).
    detailActionsRef.current.forEach((action) => {
      action.paused = false;
    });
  }

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
      // (typically MeshStandardMaterial) render solid black without any. A
      // single directional light also left faces angled away from it
      // looking flat/dark - especially the double-sided detail planes,
      // which can face any direction once unfolded - so this uses a soft
      // sky/ground hemisphere light plus a key + fill directional pair
      // instead, matching the plain preview's lighting.
      scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.1));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(1, 1.5, 1);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
      fillLight.position.set(-1, 0.5, -1);
      scene.add(fillLight);

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

      // Bright, thick outline overlaid on every wireframe-mode face (see
      // buildModelParts) so individual planes/facets stay clearly
      // delineated from each other, not just flat-shaded shapes.
      // LineMaterial renders thick lines in screen-space pixels, so its
      // `resolution` uniform has to track the canvas size - both now and
      // on every resize below.
      lineMaterial = new LineMaterial({ color: 0x00ff88, linewidth: 3 });
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
        const { solid, edges, detail, size } = buildModelParts(root, lineMaterial, gltf.animations);
        solidRef.current = solid;
        edgesRef.current = edges;
        detailRef.current = detail;
        setHasEdges(Boolean(edges));
        // A user can tap "Wireframe" during the (slow, async) AR init window
        // before this load callback runs. If this model turns out to have no
        // separate Edges object, force showWireframe back off here too - not
        // just disable the button - so we never end up with the solid hidden
        // (because showWireframeRef.current is stale-true) and nothing to
        // show in its place. Same fix already applied in ViewerClient.js.
        if (!edges) setShowWireframe(false);

        if (solid) solid.visible = !showWireframeRef.current;

        mixerRef.current = new THREE.AnimationMixer(root);
        detailClipsRef.current = findClipsForObject(gltf.animations, detail);
        setHasDetailAnimation(detailClipsRef.current.length > 0);

        if (showWireframeRef.current) {
          enterWireframeMode();
        } else {
          exitWireframeMode();
        }

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
      let lastTime = null;
      renderer.setAnimationLoop((time) => {
        if (lastTime !== null) {
          mixerRef.current?.update((time - lastTime) / 1000);
        }
        lastTime = time;

        // Animate the opening scale-in of whichever object was shown first
        // when entering wireframe mode (Edges, or the detail group frozen
        // on frame 0).
        if (edgesAnimationRef.current.isAnimating && wireframeVisualRef.current) {
          const elapsed = Date.now() - edgesAnimationRef.current.startTime;
          const duration = 500; // 500ms animation
          const progress = Math.min(elapsed / duration, 1);
          const eased = easeOutCubic(progress);
          const currentScale = 0.1 + eased * (edgesAnimationRef.current.targetScale - 0.1);
          wireframeVisualRef.current.scale.set(currentScale, currentScale, currentScale);

          if (progress >= 1) {
            edgesAnimationRef.current.isAnimating = false;
          }
        }

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

      {/*
        Lives at the bottom, not alongside ModeSwitch/Exit AR up top - the
        top bar is narrow on a phone screen, and a third control there
        pushed Exit AR partway off-screen. Only shown once a target is
        actually being tracked (not scanning/error), so it never competes
        for the same bottom-16 space as the status messages below, which
        only render for those other states.
      */}
      {showWireframe && status === "tracking" && hasDetailAnimation && (
        <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, display: "flex", justifyContent: "center" }}>
          <button type="button" onClick={revealDetail}>
            Reveal Detail
          </button>
        </div>
      )}

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
