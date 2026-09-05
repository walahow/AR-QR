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

// Adds a thick line outline (EdgesGeometry -> LineSegments2) as a child of
// every mesh under `object`, on top of its normal shaded material rather
// than instead of it, so individual faces/planes read as clearly bounded
// shapes in wireframe mode instead of a flat-shaded blob. polygonOffset on
// the mesh's own material pushes its faces back a hair in depth so the
// coplanar outline line always wins the depth test instead of z-fighting/
// flickering against it.
function addEdgeOutlines(object, lineMaterial) {
  const meshes = [];
  object.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  meshes.forEach((mesh) => {
    if (!mesh.geometry?.attributes?.position) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    });

    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEGREES);
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(edgesGeometry.attributes.position.array);
    edgesGeometry.dispose();
    mesh.add(new LineSegments2(lineGeometry, lineMaterial));
  });
}

// Locates the "Solid" and "Edges" top-level objects an admin authored into
// one GLB, recenters the whole scene on the root's combined bounding box (so
// every object stays aligned to the others exactly as authored), and groups
// every other top-level object into a single "detail" group.
//
// That detail group is deliberately a catch-all, not a single named object:
// an admin's "detail reveal" is often authored as several separate pieces
// (e.g. "Plane", "Plane.001", "Plane.002", ..., each with its own action)
// rather than one object named "Edges2" - grouping them all here means
// callers don't need to know how many pieces there are or what they're
// called. It starts hidden and is only shown on demand (see
// findClipsForObject and the viewers' revealDetail), either by playing
// whatever GLB-authored animations target something inside it, or, if none
// exist, just by making it visible as a static fallback.
//
// Every mesh under "Edges" and under the detail group gets a thick outline
// line overlaid on its faces (see addEdgeOutlines) so wireframe mode reads
// as clearly delineated facets, not just flat-shaded shapes.
//
// `size` (the combined bounding box's dimensions) is always returned, even
// when Solid/Edges aren't found, so callers can size-normalize a model
// regardless of whether it follows that convention.
// Returns { solid: null, edges: null, detail: null, size } without touching
// the scene if Solid or Edges is missing, so callers can fall back to
// solid-only display and disable their wireframe toggle.
export function buildModelParts(root, lineMaterial) {
  const solid = findNamedChild(root, "solid");
  const edges = findNamedChild(root, "edges");

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  if (!solid || !edges) {
    return { solid: null, edges: null, detail: null, size };
  }

  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const detailChildren = root.children.filter((child) => child !== solid && child !== edges);

  let detail = null;
  if (detailChildren.length > 0) {
    detail = new THREE.Group();
    detail.name = "Detail";
    root.add(detail);
    // attach() (not add()) preserves each child's world transform while
    // reparenting, so grouping them doesn't shift anything authored
    // relative to Solid/Edges. PropertyBinding's node lookup searches the
    // mixer root's full descendant tree regardless of nesting depth, so
    // GLB-authored animation tracks targeting these objects by name still
    // resolve correctly after this reparenting.
    detailChildren.forEach((child) => detail.attach(child));
    detail.visible = false;

    // Detail content is often thin plane geometry (e.g. an unfolded net's
    // individual faces), which renders from only one side by default -
    // rotating the model, or the group's own explode/unfold animation,
    // can turn a plane's back toward the camera and make it vanish. Force
    // double-sided rendering so every piece stays visible from every angle.
    detail.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material) material.side = THREE.DoubleSide;
      });
    });

    addEdgeOutlines(detail, lineMaterial);
  }

  addEdgeOutlines(edges, lineMaterial);

  return { solid, edges, detail, size };
}
