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
      // reading its source), not something addressable from here.
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
