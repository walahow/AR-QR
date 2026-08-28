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
