import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "./buildModelParts.js";

function makeParts({ solidName = "Solid", edgesName = "Edges", offset = 0 } = {}) {
  const root = new THREE.Group();

  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = solidName;
  solidNode.position.set(offset, 0, 0);

  const edgesNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  edgesNode.name = edgesName;
  edgesNode.position.set(offset, 0, 0);

  root.add(solidNode, edgesNode);

  return { root, solidNode, edgesNode };
}

test("finds Solid and Edges by name (case-insensitive) and returns them as-is", () => {
  const { root, solidNode, edgesNode } = makeParts({ solidName: "SOLID", edgesName: "edges" });

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, solidNode);
  assert.equal(result.edges, edgesNode);
});

test("recenters the root based on the combined bounding box", () => {
  const { root } = makeParts({ offset: 2 });

  buildModelParts(root, new LineMaterial());

  assert.equal(root.position.x, -2);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("returns the combined bounding box size when Solid and Edges are found", () => {
  const { root } = makeParts();

  const result = buildModelParts(root, new LineMaterial());

  assert.ok(result.size.equals(new THREE.Vector3(1, 1, 1)));
});

test("size reflects the combined extent of differently-sized Solid and Edges objects", () => {
  const root = new THREE.Group();
  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = "Solid";
  const edgesNode = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1));
  edgesNode.name = "Edges";
  root.add(solidNode, edgesNode);

  const result = buildModelParts(root, new LineMaterial());

  assert.ok(result.size.x >= 3);
});

test("returns detail: null and leaves nothing hidden when there are no other top-level objects", () => {
  const { root, solidNode, edgesNode } = makeParts();

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.detail, null);
  assert.equal(solidNode.visible, true);
  assert.equal(edgesNode.visible, true);
});

test("returns null solid/edges/detail, a computed size, and leaves the root untouched when Solid or Edges is missing", () => {
  const root = new THREE.Group();
  const onlyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 4));
  onlyMesh.name = "Mesh";
  root.add(onlyMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, null);
  assert.equal(result.edges, null);
  assert.equal(result.detail, null);
  assert.ok(result.size.equals(new THREE.Vector3(2, 3, 4)));
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("groups every other top-level object into a single hidden Detail group", () => {
  const { root } = makeParts();
  const plane0 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  plane0.name = "Plane";
  const plane1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  plane1.name = "Plane.001";
  root.add(plane0, plane1);

  const result = buildModelParts(root, new LineMaterial());

  assert.ok(result.detail);
  assert.equal(result.detail.visible, false);
  assert.equal(result.detail.children.length, 2);
  assert.ok(result.detail.children.includes(plane0));
  assert.ok(result.detail.children.includes(plane1));
});

test("keeps each detail child positioned exactly as authored relative to Solid after grouping", () => {
  // buildModelParts also recenters the whole root, which legitimately
  // shifts everyone's absolute world position by the same amount - the
  // invariant grouping must preserve is the *relative* offset to Solid,
  // not the absolute position.
  const { root, solidNode } = makeParts();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  plane.name = "Plane";
  plane.position.set(1, 2, 3);
  root.add(plane);
  root.updateMatrixWorld(true);
  const offsetBefore = plane
    .getWorldPosition(new THREE.Vector3())
    .sub(solidNode.getWorldPosition(new THREE.Vector3()));

  buildModelParts(root, new LineMaterial());
  root.updateMatrixWorld(true);
  const offsetAfter = plane
    .getWorldPosition(new THREE.Vector3())
    .sub(solidNode.getWorldPosition(new THREE.Vector3()));

  assert.ok(offsetAfter.distanceTo(offsetBefore) < 1e-6);
});

test("a single extra object (e.g. one authored 'Edges2') is grouped the same way", () => {
  const { root } = makeParts();
  const extra = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  extra.name = "Edges2";
  root.add(extra);

  const result = buildModelParts(root, new LineMaterial());

  assert.ok(result.detail);
  assert.equal(result.detail.children.length, 1);
  assert.equal(result.detail.children[0], extra);
});

test("forces double-sided materials on every mesh in the Detail group", () => {
  const { root } = makeParts();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ side: THREE.FrontSide })
  );
  plane.name = "Plane";
  root.add(plane);

  buildModelParts(root, new LineMaterial());

  assert.equal(plane.material.side, THREE.DoubleSide);
});

test("forces double-sided materials on every material of a multi-material Detail mesh", () => {
  const { root } = makeParts();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [
    new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
    new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
  ]);
  plane.name = "Plane";
  root.add(plane);

  buildModelParts(root, new LineMaterial());

  assert.ok(plane.material.every((material) => material.side === THREE.DoubleSide));
});

test("adds a visible outline to every mesh under Edges, without hiding the mesh itself", () => {
  const { root, edgesNode } = makeParts();

  buildModelParts(root, new LineMaterial());

  assert.equal(edgesNode.visible, true);
  assert.equal(edgesNode.children.length, 1);
  assert.equal(edgesNode.children[0].isLineSegments2, true);
});

test("adds a visible outline to every mesh under the Detail group too", () => {
  const { root } = makeParts();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  plane.name = "Plane";
  root.add(plane);

  buildModelParts(root, new LineMaterial());

  assert.equal(plane.visible, true);
  assert.equal(plane.children.length, 1);
  assert.equal(plane.children[0].isLineSegments2, true);
});

test("does not add an outline to Solid", () => {
  const { root, solidNode } = makeParts();

  buildModelParts(root, new LineMaterial());

  assert.equal(solidNode.children.length, 0);
});

test("sets polygonOffset on outlined meshes' materials to avoid z-fighting with their own outline", () => {
  const { root, edgesNode } = makeParts();

  buildModelParts(root, new LineMaterial());

  assert.equal(edgesNode.material.polygonOffset, true);
  assert.ok(edgesNode.material.polygonOffsetFactor > 0);
  assert.ok(edgesNode.material.polygonOffsetUnits > 0);
});

test("skips degenerate meshes under Edges without throwing", () => {
  const { root, edgesNode } = makeParts();
  const degenerateMesh = new THREE.Mesh(new THREE.BufferGeometry());
  edgesNode.add(degenerateMesh);

  assert.doesNotThrow(() => buildModelParts(root, new LineMaterial()));
  assert.equal(degenerateMesh.children.length, 0);
});
