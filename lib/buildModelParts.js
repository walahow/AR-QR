import * as THREE from "three";

function findNamedChild(root, name) {
  return (
    root.children.find(
      (child) => child.name.toLowerCase() === name.toLowerCase()
    ) ?? null
  );
}

// Locates the "Solid", "Edges", and optional "Edges2" top-level objects an
// admin authored into one GLB, recenters the whole scene on the root's
// combined bounding box (so every object stays aligned to the others exactly
// as authored), and hides any other top-level object (leftover authoring
// helpers).
// "Edges2" is an optional further "detail reveal" shown inside wireframe
// mode on demand (see findClipForObject and the viewers' revealDetail) -
// either by playing a GLB-authored animation that targets it, or, if none
// exists, just by making it visible as a static fallback. It starts hidden
// even though it's a recognized object, not a leftover.
// `size` (the combined bounding box's dimensions) is always returned, even
// when Solid/Edges aren't found, so callers can size-normalize a model
// regardless of whether it follows that convention.
// Returns { solid: null, edges: null, edges2: null, size } without touching
// the scene if Solid or Edges is missing, so callers can fall back to
// solid-only display and disable their wireframe toggle.
export function buildModelParts(root) {
  const solid = findNamedChild(root, "solid");
  const edges = findNamedChild(root, "edges");
  const edges2 = findNamedChild(root, "edges2");

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  if (!solid || !edges) {
    return { solid: null, edges: null, edges2: null, size };
  }

  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  // Any top-level object besides the ones the admin explicitly named is
  // very likely a leftover from authoring (a reference mesh, an empty, a
  // stray helper) rather than something meant to display - hide it
  // unconditionally, in both modes.
  root.children.forEach((child) => {
    if (child !== solid && child !== edges && child !== edges2) child.visible = false;
  });

  if (edges2) edges2.visible = false;

  return { solid, edges, edges2, size };
}
