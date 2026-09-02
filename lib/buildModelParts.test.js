import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { buildModelParts } from "./buildModelParts.js";

function makeSolidAndEdges({ solidName = "Solid", edgesName = "Edges", offset = 0 } = {}) {
  const root = new THREE.Group();

  const solidNode = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  solidNode.name = solidName;
  solidNode.position.set(offset, 0, 0);

  const edgesNode = new THREE.Group();
  edgesNode.name = edgesName;
  const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  edgeMesh.position.set(offset, 0, 0);
  edgesNode.add(edgeMesh);

  root.add(solidNode, edgesNode);
  return { root, solidNode, edgesNode, edgeMesh };
}

test("finds Solid by name and returns a toggleable outline group for Edges", () => {
  const { root, solidNode } = makeSolidAndEdges({
    solidName: "SOLID",
    edgesName: "edges",
  });

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(result.solid, solidNode);
  assert.ok(result.edges);
  assert.equal(result.edges.parent, root);
});

test("hides every mesh under Edges and puts its outline in a separate group, not as the mesh's own child", () => {
  const { root, edgeMesh } = makeSolidAndEdges();

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(edgeMesh.visible, false);
  assert.equal(edgeMesh.children.length, 0);
  assert.equal(result.edges.children.length, 1);
  assert.equal(result.edges.children[0].isLineSegments2, true);
});

test("outline lines preserve their source mesh's world position/rotation after reparenting", () => {
  const { root, edgeMesh } = makeSolidAndEdges({ offset: 2 });
  edgeMesh.rotation.y = Math.PI / 4;

  const result = buildModelParts(root, new LineMaterial());
  root.updateMatrixWorld(true);

  const meshWorldPos = edgeMesh.getWorldPosition(new THREE.Vector3());
  const lineWorldPos = result.edges.children[0].getWorldPosition(new THREE.Vector3());

  assert.ok(lineWorldPos.distanceTo(meshWorldPos) < 1e-6);
});

test("recenters the root based on the combined bounding box of Solid and Edges", () => {
  const { root } = makeSolidAndEdges({ offset: 2 });

  buildModelParts(root, new LineMaterial());

  assert.equal(root.position.x, -2);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("returns null parts and leaves the root untouched when Solid or Edges is missing", () => {
  const root = new THREE.Group();
  const onlyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  onlyMesh.name = "Mesh";
  root.add(onlyMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.deepEqual(result, { solid: null, edges: null });
  assert.equal(root.position.x, 0);
  assert.equal(root.position.y, 0);
  assert.equal(root.position.z, 0);
});

test("skips degenerate meshes under Edges without throwing and processes valid sibling meshes", () => {
  const { root, edgesNode } = makeSolidAndEdges();

  const degenerateMesh = new THREE.Mesh(new THREE.BufferGeometry());
  edgesNode.add(degenerateMesh);

  const result = buildModelParts(root, new LineMaterial());

  assert.equal(degenerateMesh.visible, false);
  assert.equal(degenerateMesh.children.length, 0);
  assert.equal(result.edges.children.length, 1);
  assert.equal(result.edges.children[0].isLineSegments2, true);
});
