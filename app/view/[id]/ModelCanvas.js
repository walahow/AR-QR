"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildModelParts } from "@/lib/buildModelParts";
import { findClipForObject } from "@/lib/findClipForObject";
import { disposeObject3D } from "@/lib/disposeObject3D";

// Easing function for smooth animation (ease-out cubic)
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Plain (non-AR) preview: shaded model + orbit controls, with a live
// solid/edges toggle driven by the `mode` prop. Loads the GLB once;
// switching `mode` only flips node visibility, no reload. Exposes
// `revealDetail()` via ref so a parent button can trigger the optional
// Edges2 "detail" reveal without this component needing its own UI.
const ModelCanvas = forwardRef(function ModelCanvas({ glbUrl, mode, onModelInfo }, ref) {
  const containerRef = useRef(null);
  const modeRef = useRef(mode);
  const solidRef = useRef(null);
  const edgesRef = useRef(null);
  const edges2Ref = useRef(null);
  const mixerRef = useRef(null);
  const edges2ClipRef = useRef(null);
  const edgesAnimationRef = useRef({ isAnimating: false, startTime: 0, targetScale: 0 });

  useImperativeHandle(ref, () => ({
    revealDetail() {
      const edges2 = edges2Ref.current;
      if (!edges2) return;
      edges2.visible = true;
      const clip = edges2ClipRef.current;
      if (clip && mixerRef.current) {
        const action = mixerRef.current.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
      }
    },
  }));

  useEffect(() => {
    modeRef.current = mode;
    if (solidRef.current) solidRef.current.visible = mode !== "edges";
    if (edgesRef.current) {
      edgesRef.current.visible = mode === "edges";
      if (mode === "edges") {
        edgesAnimationRef.current = { isAnimating: true, startTime: Date.now(), targetScale: 1 };
      }
    }
    if (mode !== "edges" && edges2Ref.current) {
      // Leaving wireframe mode resets the detail reveal, so it plays in
      // full again next time wireframe mode is entered.
      edges2Ref.current.visible = false;
      mixerRef.current?.stopAllAction();
    }
  }, [mode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let frameId;
    let root = null;
    let lastTime = null;

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

    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
      if (disposed) return;

      root = gltf.scene;
      const { solid, edges, edges2 } = buildModelParts(root);
      solidRef.current = solid;
      edgesRef.current = edges;
      edges2Ref.current = edges2;
      onModelInfo?.({ hasEdges: Boolean(edges), hasEdges2: Boolean(edges2) });

      if (solid) solid.visible = modeRef.current !== "edges";
      if (edges) {
        edges.visible = modeRef.current === "edges";
        edges.scale.set(0.1, 0.1, 0.1);
        if (modeRef.current === "edges") {
          edgesAnimationRef.current = { isAnimating: true, startTime: Date.now(), targetScale: 1 };
        }
      }

      mixerRef.current = new THREE.AnimationMixer(root);
      edges2ClipRef.current = findClipForObject(gltf.animations, edges2);

      scene.add(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const radius = size.length() || 1;
      controls.target.set(0, 0, 0);
      camera.position.set(0, radius * 0.2, radius * 1.2);
    });

    function animate(time) {
      frameId = requestAnimationFrame(animate);
      controls.update();

      if (lastTime !== null) {
        mixerRef.current?.update((time - lastTime) / 1000);
      }
      lastTime = time;

      // Animate edges expansion when entering edges mode
      if (edgesAnimationRef.current.isAnimating && edgesRef.current) {
        const elapsed = Date.now() - edgesAnimationRef.current.startTime;
        const duration = 500; // 500ms animation
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        const currentScale = 0.1 + eased * (edgesAnimationRef.current.targetScale - 0.1);
        edgesRef.current.scale.set(currentScale, currentScale, currentScale);

        if (progress >= 1) {
          edgesAnimationRef.current.isAnimating = false;
        }
      }

      renderer.render(scene, camera);
    }
    frameId = requestAnimationFrame(animate);

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
      if (root) disposeObject3D(root);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [glbUrl]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

export default ModelCanvas;
