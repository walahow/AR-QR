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
// hidden). Returns { solid: null, edges: null } without touching the scene
// if either object is missing, so callers can fall back to solid-only
// display and disable their wireframe toggle.
export function buildModelParts(root, lineMaterial) {
  const solid = findNamedChild(root, "solid");
  const edges = findNamedChild(root, "edges");

  if (!solid || !edges) {
    return { solid: null, edges: null };
  }

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const meshes = [];
  edges.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  meshes.forEach((mesh) => {
    mesh.visible = false;
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEGREES);
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(edgesGeometry.attributes.position.array);
    edgesGeometry.dispose();
    mesh.add(new LineSegments2(lineGeometry, lineMaterial));
  });

  return { solid, edges };
}
