"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "@/lib/buildModelParts";
import { findClipsForObject } from "@/lib/findClipsForObject";
import { disposeObject3D } from "@/lib/disposeObject3D";

// Easing function for smooth animation (ease-out cubic)
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Plain (non-AR) preview: shaded model + orbit controls, with a live
// solid/edges toggle driven by the `mode` prop. Loads the GLB once;
// switching `mode` only flips node visibility, no reload. Exposes
// `revealDetail()` via ref so a parent button can trigger the optional
// "detail" group reveal without this component needing its own UI.
const ModelCanvas = forwardRef(function ModelCanvas({ glbUrl, mode, onModelInfo }, ref) {
  const containerRef = useRef(null);
  const modeRef = useRef(mode);
  const solidRef = useRef(null);
  const edgesRef = useRef(null);
  const detailRef = useRef(null);
  const mixerRef = useRef(null);
  const detailClipsRef = useRef([]);
  const detailActionsRef = useRef([]);
  // Whichever object is shown first on entering wireframe mode - "Edges",
  // or, when the detail group has authored animation(s), the detail group
  // itself (frozen on its first frame). Drives the opening scale-in
  // animation below.
  const wireframeVisualRef = useRef(null);
  const edgesAnimationRef = useRef({ isAnimating: false, startTime: 0, targetScale: 0 });

  function enterWireframeMode() {
    const edges = edgesRef.current;
    const detail = detailRef.current;
    const clips = detailClipsRef.current;

    if (clips.length > 0 && detail && mixerRef.current) {
      // The detail group has at least one authored animation (often
      // several separately-animated pieces): it replaces Edges entirely,
      // shown paused on its first frame until "Reveal Detail" plays it
      // forward - Edges itself never shows for this model.
      if (edges) edges.visible = false;
      detail.visible = true;
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
      wireframeVisualRef.current = detail;
    } else {
      if (detail) detail.visible = false;
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

  useImperativeHandle(ref, () => ({
    revealDetail() {
      // Already frozen on their first frame (see enterWireframeMode) - this
      // is the only thing that lets them actually play forward.
      const actions = detailActionsRef.current;
      if (actions.length > 0) {
        actions.forEach((action) => {
          action.paused = false;
        });
        return;
      }
      // No authored animation - the detail group (if present) is a static
      // fallback, shown on demand alongside Edges.
      if (detailRef.current) detailRef.current.visible = true;
    },
  }));

  useEffect(() => {
    modeRef.current = mode;
    if (solidRef.current) solidRef.current.visible = mode !== "edges";
    if (mode === "edges") {
      enterWireframeMode();
    } else {
      exitWireframeMode();
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
    // A single directional light left every face angled away from it
    // looking flat/dark - especially the double-sided detail planes, which
    // can face any direction once unfolded. A soft sky/ground hemisphere
    // light plus a key + fill directional pair keeps every surface readably
    // lit from whatever angle it ends up facing.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(1, 1.5, 1);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-1, 0.5, -1);
    scene.add(fillLight);

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

    // Bright, thick outline overlaid on every wireframe-mode face (see
    // buildModelParts) so individual planes/facets stay clearly delineated
    // from each other, not just flat-shaded shapes.
    const lineMaterial = new LineMaterial({ color: 0x00ff88, linewidth: 3 });
    lineMaterial.resolution.set(container.clientWidth, container.clientHeight);

    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
      if (disposed) return;

      root = gltf.scene;
      const { solid, edges, detail } = buildModelParts(root, lineMaterial, gltf.animations);
      solidRef.current = solid;
      edgesRef.current = edges;
      detailRef.current = detail;
      onModelInfo?.({ hasEdges: Boolean(edges), hasDetail: Boolean(detail) });

      if (solid) solid.visible = modeRef.current !== "edges";

      mixerRef.current = new THREE.AnimationMixer(root);
      detailClipsRef.current = findClipsForObject(gltf.animations, detail);

      if (modeRef.current === "edges") {
        enterWireframeMode();
      } else {
        exitWireframeMode();
      }

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

      // Animate the opening scale-in of whichever object was shown first
      // when entering wireframe mode (Edges, or the detail group frozen on
      // frame 0).
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
    }
    frameId = requestAnimationFrame(animate);

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
});

export default ModelCanvas;
