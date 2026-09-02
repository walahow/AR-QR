import * as THREE from "three";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";

// Corners/silhouette lines are kept; the diagonals introduced by
// triangulating flat faces (angle 0) are dropped.
const EDGE_THRESHOLD_DEGREES = 1;

function findNamedChild(root, name) {
  return (
    root.children.find(
      (child) => child.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}

// Locates the "Solid" and "Edges" top-level objects an admin authored into
// one GLB, recenters the whole scene on their combined bounding box (so
// Solid and Edges stay aligned to each other exactly as authored), and
// replaces every mesh under "Edges" with a thick outline line (real faces
// hidden). `size` (the combined bounding box's dimensions) is always
// returned, even when Solid/Edges aren't found, so callers can size-
// normalize a model regardless of whether it follows that convention.
// Returns { solid: null, edges: null, size } without touching the scene
// if either object is missing, so callers can fall back to solid-only
// display and disable their wireframe toggle.
export function buildModelParts(root, lineMaterial) {
  const solid = findNamedChild(root, "solid");
  const edgesSource = findNamedChild(root, "edges");

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  if (!solid || !edgesSource) {
    return { solid: null, edges: null, size };
  }

  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const meshes = [];
  edgesSource.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  // Outline lines are collected under a fresh group rather than left as
  // children of their source mesh: WebGLRenderer's projectObject() returns
  // before recursing into an invisible object's children, so a line
  // parented under a mesh with visible = false would never be traversed for
  // rendering, no matter its own visibility. Hiding each source mesh (so
  // its own faces never draw) while keeping its extracted outline actually
  // visible requires the outline to live outside that mesh's subtree.
  const outlines = new THREE.Group();
  root.add(outlines);
  meshes.forEach((mesh) => {
    mesh.visible = false;
    if (!mesh.geometry?.attributes?.position) return;
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEGREES);
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(edgesGeometry.attributes.position.array);
    edgesGeometry.dispose();
    const line = new LineSegments2(lineGeometry, lineMaterial);
    // Parent under the mesh first so attach() below can read its resolved
    // transform, then reparent to `outlines` while preserving that world
    // transform (attach() does the necessary matrix math for us).
    mesh.add(line);
    outlines.attach(line);
  });

  return { solid, edges: outlines, size };
}
