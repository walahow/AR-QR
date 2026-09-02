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
