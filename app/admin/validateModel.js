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
