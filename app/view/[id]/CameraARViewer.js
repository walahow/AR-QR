"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildPrimitiveParams, isValidShape } from "@/lib/wireframePrimitive";
import { createGeometryFromParams } from "./geometryFromParams";
import { PHYSICAL_QR_SIZE_METERS } from "@/lib/arConfig";
import { withTimeout } from "@/lib/withTimeout";
import ModeSwitch from "./ModeSwitch";

export default function CameraARViewer({ glbUrl, shape, arTargetUrl, onExit }) {
  const containerRef = useRef(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [status, setStatus] = useState("starting"); // starting | scanning | tracking | error | target-error
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

    function disposeMaterial(material) {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value && typeof value.dispose === "function") {
          value.dispose();
        }
      });
      material.dispose();
    }

    function disposeObject3D(object) {
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(disposeMaterial);
      });
    }

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
      // the wireframe mode doesn't need this since MeshBasicMaterial is unlit.
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

        // Measure and re-center BEFORE parenting under contentGroup: once
        // added, Box3.setFromObject would include contentGroup/anchor.group's
        // matrices (anchor.group's isn't meaningful yet - it's only ever
        // written by the tracker's per-frame onUpdate, which hasn't run at
        // load time), so the box has to be taken in the model's own local
        // space first. Most GLBs aren't authored with their origin at their
        // bounding-box center, so without this the model renders offset from
        // the marker instead of centered on it.
        const box = new THREE.Box3().setFromObject(shaded);
        const center = box.getCenter(new THREE.Vector3());
        shaded.position.sub(center);

        shaded.visible = !showWireframeRef.current;
        shadedRef.current = shaded;
        contentGroup.add(shaded);

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
      if (shadedRef.current) disposeObject3D(shadedRef.current);
      if (wireframeRef.current) {
        wireframeRef.current.geometry?.dispose();
        disposeMaterial(wireframeRef.current.material);
      }
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
  }, [glbUrl, shape, arTargetUrl]);

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
      {status === "target-error" && (
        <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, textAlign: "center", color: "#fff", background: "rgba(0,0,0,0.6)", padding: 8 }}>
          Couldn&apos;t start AR tracking. This item&apos;s AR target may be missing or corrupt - try recompiling it from the admin page.
        </div>
      )}
    </div>
  );
}
