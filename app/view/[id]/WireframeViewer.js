"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildPrimitiveParams, isValidShape } from "@/lib/wireframePrimitive";
import { createGeometryFromParams } from "./geometryFromParams";

export default function WireframeViewer({ glbUrl, shape }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

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
    let disposed = false;
    let primitiveMesh = null;

    loader.load(glbUrl, (gltf) => {
      if (disposed) return;

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());

      const resolvedShape = isValidShape(shape) ? shape : "cube";
      const params = buildPrimitiveParams(resolvedShape, {
        width: size.x || 0.01,
        height: size.y || 0.01,
        depth: size.z || 0.01,
      });

      const geometry = createGeometryFromParams(params);
      primitiveMesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
      );
      scene.add(primitiveMesh);

      const radius = size.length() || 1;
      controls.target.set(0, 0, 0);
      camera.position.set(0, radius * 0.2, radius * 1.2);
    });

    let frameId;
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
    }
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      if (primitiveMesh) {
        primitiveMesh.geometry.dispose();
        primitiveMesh.material.dispose();
      }
      container.removeChild(renderer.domElement);
    };
  }, [glbUrl, shape]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
